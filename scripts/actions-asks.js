import { MODULE_ID } from "./preset.js";
import { defineActions } from "./actions.js";
import { api as rpc, pendingAsks, aheadLive, answerScribe, answerSummon, answerTrade } from "./rpc.js";
import { crossingName, otherHeroNames } from "./crossing-name.js";

/**
 * ── PLAYERS WAITING ON THE DM — ONE ROW, "table.ask" (§55.6, 2026-10-09) ─────────────────────────────
 *
 * The DM, after a live miss (a phone used a travel square, the game paused, and the deck showed nothing
 * else): *"A call to move to another scene is the classic 'notifications' scenario; pause the game so
 * nothing else happens and then light up the notifications and give the three options in the middle of
 * the deck."*
 *
 * The asks themselves live in the `dmAsks` world setting (rpc.js pendingAsks). This row is how any
 * surface — the deck first — sees and answers them, through the registry seam it already uses:
 *
 *   enabled   false while nothing is pending (the row is ALWAYS published, so a fixed key can bind to it)
 *   alert     true while something is pending
 *   sub       who is asking and for what — "Gilly · cross to Sleeper Car"
 *   choices   the answers for THAT ask, in panel order: Cancel · Move <Name> · Move Group
 *   ref       the ask's id; pass it back as params.ref and a press can't land on a different ask
 *   waiting   how many asks are queued (the Requests area's count)
 *   run       run("table.ask", { choice, ref? })
 *
 * ⚠️ TWO ASKS AT ONCE — DEFINED: the queue is FIFO across players (one entry per traveller; a second
 * press by the same player replaces their own). The row always shows the OLDEST ask; `waiting` is the
 * total and the sub says "+N waiting". Answer it and the next one takes the row — the DM works the queue
 * front to back, and nobody's ask is ever silently dropped.
 *
 * NEW KINDS JOIN HERE (scribe, summon, an offline trade — today they are chips that live only in the
 * panel's memory, dm-panel.js `dmReactions`): (1) the executor writes the ask into `dmAsks` with its own
 * `kind` instead of only firing the panel hook; (2) its answer logic moves out of the panel's click handler
 * into an executor function both doors call (the travel pattern: handleTravelDecide); (3) add one entry to
 * KINDS below — who/what for `sub`, its `choices`, and `answer` calling that function. The row, the deck's
 * key and the queue rule don't change. Opportunity attacks stay off this row: their window is seconds.
 */

// who is crossing, unambiguously (section W, 2026-11-12): crossing-name.js
const idOf = (uuid) => String(uuid ?? "").split(".").pop();
const who = (e) => crossingName(e.actorName, otherHeroNames(idOf(e.forActorUuid)));
const tokenArt = (uuid) => {
  try { const a = fromUuidSync(uuid); return a?.prototypeToken?.texture?.src || a?.img || undefined; } catch (e) { return undefined; }
};

const KINDS = {
  travel: {
    sub: (e) => `${who(e)} · cross to ${e.dest || e.label || "the next place"}`,
    choices: (e) => [
      { id: "cancel", label: "Cancel" },
      { id: "alone", label: `Move ${who(e)}`, img: tokenArt(e.forActorUuid), token: true },
      { id: "group", label: "Move Group" },
    ],
    answer: (e, choice) => rpc.travelDecide({ id: e.id, choice }),
  },
  // ONE HERO WENT AHEAD (DM 2026-11-12): the table waits by default; Follow takes it to him (rpc.js noteAhead).
  // "cancel" is Stay so the deck draws it as the way out (grey). Gone by itself once the table is with him.
  ahead: {
    rank: 1,
    live: (e) => aheadLive(e),
    sub: (e) => `${who(e)} · went ahead to ${e.dest || "the next car"}`,
    choices: (e) => [
      { id: "cancel", label: "Stay" },
      { id: "follow", label: `Follow ${who(e)}`, img: tokenArt(e.forActorUuid), token: true },
    ],
    answer: (e, choice) => rpc.travelFollow({ id: e.id, choice }),
  },
  // THE PANEL'S CHIPS, NOW ON THE ROW (DM 2026-11-13, MC-ON-DECK-IDEAS #2): the answer is the one the panel's chip calls
  // (rpc.js answerScribe / answerSummon / answerTrade), so answering at either door clears both. Ten minutes, as the chips.
  scribe: {
    live: (e) => !e.expiresAt || e.expiresAt > Date.now(),
    sub: (e) => `${e.actorName ?? "A wizard"} · scribe ${e.spellName ?? "a spell"}${e.cost ? ` (${e.cost})` : ""}`,
    choices: () => [{ id: "cancel", label: "Decline" }, { id: "ok", label: "Approve" }],
    answer: (e, choice) => answerScribe(e, choice === "ok"),
  },
  summon: {
    live: (e) => !e.expiresAt || e.expiresAt > Date.now(),
    sub: (e) => `${e.summonerName ?? "A player"} summoned ${e.summonName ?? "a creature"} · give ${e.playerName ?? "them"} control?`,
    choices: (e) => [{ id: "cancel", label: "Keep it" }, { id: "ok", label: "Give control", ...(e.img ? { img: e.img, token: true } : {}) }],
    answer: (e, choice) => answerSummon(e, choice === "ok"),
  },
  trade: {
    live: (e) => !e.expiresAt || e.expiresAt > Date.now(),
    sub: (e) => `${e.fromName ?? "Someone"} → ${e.toName ?? "an absent player"} · ${e.what ?? "a trade"}`,
    choices: () => [{ id: "cancel", label: "Decline" }, { id: "ok", label: "Accept" }],
    answer: (e, choice) => answerTrade(e, choice === "ok"),
  },
};

// a player waiting on a crossing comes before a notice that someone went ahead; then oldest first
const queue = () => pendingAsks().filter((e) => KINDS[e.kind] && (KINDS[e.kind].live?.(e) ?? true))
  .sort((a, b) => ((KINDS[a.kind].rank ?? 0) - (KINDS[b.kind].rank ?? 0)) || ((a.ts ?? 0) - (b.ts ?? 0)));
const front = () => queue()[0] ?? null;

defineActions([
  {
    id: "table.ask", area: "requests", group: "Players asking", kind: "pick", icon: "warn", label: "Player Asks",
    when: () => !!front(),
    waiting: () => queue().length,
    alert: () => !!front(),
    sub: () => {
      const q = queue();
      if (!q.length) return undefined;
      return KINDS[q[0].kind].sub(q[0]) + (q.length > 1 ? ` · +${q.length - 1} waiting` : "");
    },
    choices: () => { const e = front(); return e ? KINDS[e.kind].choices(e) : []; },
    ref: () => front()?.id,
    run: async ({ choice, ref } = {}) => {
      const e = front();
      if (!e) return { ok: false, reason: "nobody is waiting" };
      if (ref && ref !== e.id) return { ok: false, reason: "that ask was already answered — look again" };
      const kind = KINDS[e.kind];
      if (!kind.choices(e).some((c) => c.id === String(choice))) return { ok: false, reason: "pick one of the answers" };
      const r = await kind.answer(e, String(choice));
      return r?.ok === false ? { ok: false, reason: r.reason ?? "couldn't answer" } : undefined;
    },
  },
]);

export const _askKindsForTests = Object.keys(KINDS); // which kinds the row answers — the test pins it
void MODULE_ID;
