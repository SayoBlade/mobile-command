import { redirectOffer, startRedirectPick, dropRedirectOffer } from "./moons-due.js";
import { MODULE_ID } from "./preset.js";
import { notifier } from "./notifier.js";
import { defineActions, cmToolsOn } from "./actions.js";
import { api as rpc, pendingAsks, aheadLive, answerScribe, answerSummon, answerTrade, settleOutsideAsk, listPendingCasts, placeCast, dismissCast } from "./rpc.js";
import { twistRequests, spendTwist, refundTwist, bargainRequests, strikeBargain, declineBargain, curseState, acceptStagedCurse, cancelStagedCurse } from "./cm-live.js";
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
    answer: async (e, choice) => {
      const r = await rpc.travelDecide({ id: e.id, choice });
      // the panel's old chip said this; the queue says it at every door now
      if (r?.ok !== false && choice === "group" && r?.moved) notifier.info(`${r.moved} crossed together: arrange them, then unpause.`);
      return r;
    },
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

/**
 * ANOTHER MODULE'S KINDS (deck-command D-0197, the Maim offer). `registerAskKind(kind, { sub, choices, answer, live?, rank? })`
 * — the same shape as a kind above; its asks are raised with rpc.js `raiseOutsideAsk`. Answered here, the ask is settled
 * here too (the module's answer does its own work and need not touch the queue). A built-in kind can't be replaced.
 */
const OUTSIDE = new Map();
export function registerAskKind(kind, def) {
  const k = String(kind ?? "");
  if (!k || KINDS[k] || typeof def?.sub !== "function" || typeof def?.choices !== "function" || typeof def?.answer !== "function") return false;
  OUTSIDE.set(k, { ...def, outside: true });
  return true;
}
const kindOf = (k) => KINDS[k] ?? OUTSIDE.get(k) ?? null;

/**
 * -- THE ONE QUEUE (MC redesign phase 1, DM 2026-11-26: 5A, "don't forget pc dropping to 0hp") --------------------
 * Everything that waits on the DM, in one order, read by BOTH doors: the panel floor's Waiting block and the deck's
 * Notifications key (this row). Besides the stored asks above (a crossing, one who went ahead, scribe, summon, an
 * offline trade, and other modules' asks such as the Maim offer when a hero drops to 0 HP), three kinds are read live
 * from where they already live, never copied: a twist a player wants to spend, a bargain (and the curse it struck,
 * waiting on Accept), and a spell a phone asked the DM to place. Each answer is the function the old popup, drawer or
 * Combat-tab row calls, so answering at any door clears the others. Twists and bargains only while the Crooked Moon
 * tools are on. Opportunity attacks stay off (their window is seconds; the panel shows them first, above this queue).
 */
const firstSeen = new Map(); // a live entry's id -> when this client first saw it (its place in line)
const seen = (id) => { if (!firstSeen.has(id)) firstSeen.set(id, Date.now()); return firstSeen.get(id); };
const LIVE = {
  twist: () => (cmToolsOn() ? twistRequests() : []).map((a) => {
    const p = a.getFlag?.(MODULE_ID, "twistPending") ?? {};
    return { id: `twist.${a.id}`, kind: "twist", ts: p.ts ?? seen(`twist.${a.id}`), actorId: a.id, name: a.name, die: p.die === 1 ? 1 : 20 };
  }),
  bargain: () => {
    if (!cmToolsOn()) return [];
    const s = curseState();
    const staged = s.pick && game.actors.get(s.target)?.getFlag?.(MODULE_ID, "bargainPending") ? s.target : null;
    return bargainRequests().map((a) => a.id === staged
      ? { id: `curse.${a.id}`, kind: "curse", ts: seen(`bargain.${a.id}`), actorId: a.id, name: a.name, curse: s.pick?.name ?? "a curse" }
      : { id: `bargain.${a.id}`, kind: "bargain", ts: seen(`bargain.${a.id}`), actorId: a.id, name: a.name });
  },
  // THE MOON'S DUE (DM 2026-11-26): a player's natural 1 on a weapon attack, while the DM holds a token
  redirect: () => { const o = redirectOffer(); return o ? [{ id: `redirect.${o.id}`, kind: "redirect", ts: o.at, name: o.name, item: o.itemName }] : []; },
  cast: () => listPendingCasts().map((c) => ({ id: `cast.${c.id}`, kind: "cast", ts: c.ts ?? seen(`cast.${c.id}`), castId: c.id,
    name: c.casterName, spell: c.spellName, summon: c.kind === "summon" })),
};
const first = (n) => String(n ?? "").trim().split(/\s+/)[0] || "Someone";
const LIVE_KINDS = {
  twist: {
    icon: "shuffle",
    sub: (e) => `${first(e.name)} · twist: natural ${e.die}`,
    choices: () => [{ id: "cancel", label: "Keep" }, { id: "spend", label: "Spend" }],
    answer: async (e, choice) => {
      const a = game.actors.get(e.actorId);
      const r = choice === "spend" ? await spendTwist(a) : await refundTwist(a);
      return r === false ? { ok: false, reason: "that twist is gone" } : undefined;
    },
  },
  bargain: {
    icon: "scale-unbalanced",
    sub: (e) => `${first(e.name)} · bargain for a reroll`,
    choices: () => [{ id: "cancel", label: "Decline" }, { id: "strike", label: "Strike" }],
    answer: async (e, choice) => { if (choice === "strike") await strikeBargain(e.actorId); else await declineBargain(e.actorId); },
  },
  curse: {
    icon: "eye",
    sub: (e) => `${first(e.name)} · curse: ${e.curse}`,
    choices: () => [{ id: "cancel", label: "Never mind" }, { id: "reroll", label: "Roll again" }, { id: "accept", label: "Accept" }],
    answer: async (e, choice) => {
      if (choice === "accept") await acceptStagedCurse();
      else if (choice === "reroll") await strikeBargain(e.actorId);
      else await cancelStagedCurse();
    },
  },
  redirect: {
    icon: "moon",
    sub: (e) => `${first(e.name)} rolled a 1 · Moon's Due`,
    choices: () => [{ id: "cancel", label: "Let it be" }, { id: "redirect", label: "Redirect" }],
    answer: async (e, choice) => (choice === "redirect" ? startRedirectPick() : dropRedirectOffer()),
  },
  cast: {
    icon: "wand-magic-sparkles",
    sub: (e) => `${first(e.name)} · ${e.summon ? "summon" : "place"} ${e.spell ?? "a spell"}`,
    choices: (e) => [{ id: "cancel", label: "Dismiss" }, { id: "place", label: e.summon ? "Summon" : "Place" }],
    answer: async (e, choice) => {
      if (choice !== "place") { dismissCast(e.castId); return undefined; }
      const r = await placeCast(e.castId);
      return r?.ok === false ? { ok: false, reason: r.reason } : undefined;
    },
  },
};
const KIND_ICONS = { travel: "route", ahead: "person-hiking", scribe: "feather-pointed", summon: "ghost", trade: "hand-holding-heart" };

// a player waiting on a crossing comes before a notice that someone went ahead; then oldest first
const stored = () => pendingAsks().filter((e) => kindOf(e.kind) && (kindOf(e.kind).live?.(e) ?? true));
const liveEntries = () => { const out = []; for (const f of Object.values(LIVE)) { try { out.push(...f()); } catch (e) { /* a source not ready */ } } return out; };
const defOf = (e) => LIVE_KINDS[e.kind] ?? kindOf(e.kind);
const queue = () => [...stored(), ...liveEntries()]
  .sort((a, b) => ((defOf(a).rank ?? 0) - (defOf(b).rank ?? 0)) || ((a.ts ?? 0) - (b.ts ?? 0)));
const front = () => queue()[0] ?? null;

/** The one queue, drawn: [{ id, kind, icon, sub, choices }] in order (the panel's Waiting block reads this). */
/**
 * Is this flag value a live twist ask? (SEAT 37) A phone's ask is a plain object with its own fields. Foundry 14 sends
 * an unset as {"__$OPERATOR$__":"ForcedDeletion"} — also an object — so a hook reading the CHANGE took the clear for a
 * new ask and re-opened the popup. Read the actor's flag as it now stands and test it with this.
 */
export function pendingAsk(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && !keys.some(k => k.startsWith("__$"));
}

export function waitingQueue() {
  return queue().map((e) => {
    const d = defOf(e);
    let sub = "", choices = [];
    try { sub = d.sub(e); choices = d.choices(e); } catch (err) { /* a stale entry */ }
    return { id: e.id, kind: e.kind, icon: d.icon ?? KIND_ICONS[e.kind] ?? "bell", sub, choices };
  });
}
/**
 * The panel floor's Waiting order (pure): an opportunity attack first (the panel's own chips, seconds to answer), then
 * this queue, then a party split across scenes, then the quiet "a player is choosing a reaction" lines. Expired
 * reaction chips are left out.
 */
export function waitingItems({ reactions = [], queue = [], split = [] } = {}, now = Date.now()) {
  const live = reactions.filter((r) => (r.expiresAt ?? Infinity) > now);
  return [
    ...live.filter((r) => r.kind === "aoo").map((r) => ({ type: "aoo", r })),
    ...queue.map((q) => ({ type: "ask", q })),
    ...split.map((x) => ({ type: "split", x })),
    ...live.filter((r) => r.kind === "window").map((r) => ({ type: "window", r })),
  ];
}
/** Answer any entry in the queue by id (not only the front): the same answer every door calls. */
export async function answerWaiting(id, choice) {
  const e = queue().find((x) => x.id === id);
  if (!e) return { ok: false, reason: "that ask was already answered — look again" };
  const d = defOf(e);
  if (!d.choices(e).some((c) => c.id === String(choice))) return { ok: false, reason: "pick one of the answers" };
  const r = await d.answer(e, String(choice));
  if (r?.ok === false) return { ok: false, reason: r.reason ?? "couldn't answer" };
  if (d.outside) await settleOutsideAsk(e.id);
  try { Hooks.callAll(`${MODULE_ID}.actionsChanged`); } catch (err) { /* headless */ }
  return undefined;
}

defineActions([
  {
    id: "table.ask", area: "requests", group: "Players asking", kind: "pick", icon: "warn", label: "Player Asks",
    when: () => !!front(),
    waiting: () => queue().length,
    alert: () => !!front(),
    sub: () => {
      const q = queue();
      if (!q.length) return undefined;
      return defOf(q[0]).sub(q[0]) + (q.length > 1 ? ` · +${q.length - 1} waiting` : "");
    },
    choices: () => { const e = front(); return e ? defOf(e).choices(e) : []; },
    ref: () => front()?.id,
    run: async ({ choice, ref } = {}) => {
      const e = front();
      if (!e) return { ok: false, reason: "nobody is waiting" };
      if (ref && ref !== e.id) return { ok: false, reason: "that ask was already answered — look again" };
      return answerWaiting(e.id, choice);
    },
  },
]);

export const _askKindsForTests = Object.keys(KINDS); // the built-in kinds (outside ones: registerAskKind) // which kinds the row answers — the test pins it
void MODULE_ID;
