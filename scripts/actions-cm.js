import { MODULE_ID } from "./preset.js";
import { defineActions } from "./actions.js";
import { fxIsOn, fxIsOnFor, dmFireFx } from "./effects.js";
import { CURSES, actorCurses, curseTableUuid } from "./cm-curses.js";
import { FATE_THREADS } from "./fateweaving.js";
import { ARCANA, actorCard, cardByKey } from "./tarot.js";
import { currentHour, isDruskScene } from "./druskenvald.js";
import { trainScenes, trainMistOn } from "./cm-train.js";
import { scenePcs, pcUser } from "./roster.js";
import {
  cmLive, SEANCE_WORDS, seanceDie, seanceSitters, toggleSeanceSitter, toggleSeanceBoard, seanceQuestion, seanceBite,
  seanceSay, CURSE_MINUTES, curseState, curseCandidates, bargainRequests, bargainModeOn, setCurseTarget, setCurseMinutes,
  rollStagedCurse, pickStagedCurse, cancelStagedCurse, acceptStagedCurse, strikeBargain, declineBargain, toggleBargainMode,
  liftCurse, setFateThread, fateTouch, adjustTwists, twistRequests, spendTwist, refundTwist, armedTwists, disarmTwist,
  druskNextHour, toggleDruskMap, tarotForced, setTarotForced, tarotTaken, dealTarotTo, takeTarotBack, trainState,
  introActorId, toggleStationMist, toggleFiddle, toggleEngine, trainWhistle, trainBrakes, setTrainIn, trainArriveFor,
  toggleIntro, toggleTicket, boardingUsers, allTicketsOut, setAllTickets, stageFirstBoarding, setRide,
} from "./cm-live.js";
import { entranceList, dmPlayEntrance, dmStopEntrance } from "./entrances.js";

/**
 * ── THE CROOKED MOON TAB, AS ACTIONS (deck-command ledger 151, area H) ───────────────────────────
 *
 * Every run() below calls the function the panel's own button calls (cm-live.js), in the panel's
 * drawer order — Curses, Fate, Twists, the clock, Tarot, All aboard, Boarding, the ride, Séance —
 * so a DM who knows one surface finds the other in the same order.
 *
 * TEXT BECOMES CHOICES. The deck cannot type, so the séance's phrase box is the four words printed
 * on the board, and the cheats (a curse by number, a forced arcana, a thread) are lists or − / +.
 * Writing an arrival script and opening a sheet stay on the panel — they are the panel's jobs.
 *
 * WHAT A KEY CHANGES IS SAID, so the deck can show it (DM 2026-09-18): the fiddle, the engine, the
 * whistle and the brakes are SOUND ONLY (does: "sound"); anything that changes what the table sees —
 * the mist, the train, a hero's card, the eternal night, the board on the TV — is does: "scene", with
 * Foundry's own painted icon. Curses, twists, fate and the tarot are controls and carry neither.
 *
 * Requests that wait on the DM (a twist to spend, a bargain to strike) are in the Requests area,
 * which is what lights the deck's Table key; the rest is the Crooked Moon area. Everything here is
 * `cm: true` — offered only while the Crooked Moon tools are on.
 */

const cm = (def) => ({ area: "cm", cm: true, ...def });

/** The wall patches on this map — Sound cues (§53) playing the in-the-walls set, switched off as triggers so the
 *  DM's key is their only voice. */
const wallCues = () => {
  try { return (globalThis.MobileCommand?.cues?.list?.() ?? []).filter((c) => c.set === "wall"); }
  catch (e) { return []; }
};
/** The nursery's four moving parts, found by the keys the wiring gave them — so his moving them about is harmless. */
function nursery() {
  const scene = canvas?.scene;
  const byKey = (k) => scene?.sounds?.find?.((x) => x.getFlag?.(MODULE_ID, "cm") === k) ?? null;
  const cry = byKey("12.3:sound:0");
  const rock = byKey("12.3:sound:1");
  const hum = byKey("12.3:sound:hum");
  // Arthur's wail and the rocking cradle became occasional CUES rather than looping points (2026-09-20, the
  // soundscape was a metronome), so putting the nursery to rest switches those off as well as the old points.
  const cues = (scene?.regions ?? []).filter((r) => ["room:arthur", "room:cradle"].includes(r.getFlag?.(MODULE_ID, "cm")));
  // The module's own eerie blue glow over the cradle — matched by its colour and animation, not by an id, so a
  // re-imported scene or a light he re-made by hand is still found.
  const glow = scene?.lights?.find?.((l) => /^#1a5799$/i.test(String(l.config?.color ?? "")) ) ?? null;
  return { cry, rock, hum, glow, cues, atPeace: Boolean(hum && !hum.hidden) };
}

/** Put the nursery to rest, or wake it again. */
async function setNurseryPeace(on) {
  const { cry, rock, hum, glow, cues } = nursery();
  if (!hum) return { ok: false, reason: "the nursery is not wired on this map" };
  const scene = canvas.scene;
  const sounds = [cry, rock].filter(Boolean).map((d) => ({ _id: d.id, hidden: on }));
  sounds.push({ _id: hum.id, hidden: !on });
  await scene.updateEmbeddedDocuments("AmbientSound", sounds);
  if (glow) await scene.updateEmbeddedDocuments("AmbientLight", [{ _id: glow.id, hidden: on }]);
  for (const region of cues ?? []) {
    for (const b of region.behaviors) {
      if (b.type === "mobile-command.sound" && b.disabled !== on) await b.update({ disabled: on });
    }
  }
  // The laugh is a MOMENT, never a bed: one recording from the cradle, gone in a few seconds, so it can never end
  // up looping in the room's ambience.
  if (on) {
    dmFireFx("fxSound", {
      src: LAUGH, volume: 0.32, at: { x: hum.x, y: hum.y }, radius: 30, fadeAfter: 3500, fadeMs: 3000,
    });
  }
  return undefined;
}
// GAP: the library has no child laughing — this is distant children playing, quiet and fading, until he finds one.
const LAUGH = "modules/ember/assets/audio/environment/voices/one-shots/children-playing-4.ogg";

let lastWall = null;
/** Play the wall nearest the party — and, while they stand still, never the same one twice running. */
async function fireNearestWall() {
  const rows = wallCues();
  if (!rows.length) return { ok: false, reason: "no wall patches on this map" };
  const pcs = (canvas?.tokens?.placeables ?? []).filter((t) => !t.document?.hidden && t.actor?.type === "character" && t.actor?.hasPlayerOwner);
  const near = (r) => {
    if (!r.at || !pcs.length) return 0;
    return Math.min(...pcs.map((t) => Math.hypot(t.center.x - r.at.x, t.center.y - r.at.y)));
  };
  const sorted = rows.map((r) => ({ r, d: near(r) })).sort((a, b) => a.d - b.d);
  const pick = (sorted.length > 1 && sorted[0].r.uuid === lastWall ? sorted[1] : sorted[0]).r;
  lastWall = pick.uuid;
  const played = await globalThis.MobileCommand?.cues?.fire?.(pick.uuid);
  return played ? undefined : { ok: false, reason: "that wall has no sound yet" };
}
const req = (def) => ({ area: "requests", cm: true, hideWhenOff: true, ...def });

/** A character's picture for a key: their token art, as the deck's own party pages use. */
const pcImg = (a) => a?.prototypeToken?.texture?.src || a?.img || undefined;
const pcChoice = (a, over = {}) => ({ id: a.id, label: a.name, img: pcImg(a), ...over });
/** A caption names a character by FIRST name — "Gorbon", not "Gorbon Gra…" clipped at the key's edge. */
const nameOf = (id) => String(game.actors.get(id)?.name ?? "").trim().split(/\s+/)[0] ?? "";

/** Cycle `cur` through `list` by the sign of `delta`, wrapping at both ends. */
function cycle(list, cur, delta) {
  const i = Math.max(0, list.indexOf(cur));
  const n = list.length;
  return list[(((i + Math.sign(delta)) % n) + n) % n];
}

const boardOn = () => fxIsOn("seance");

/** Foundry's painted icons (core, on every install) for the keys that change what the table sees. */
const ART = {
  druskNext: "icons/magic/time/hourglass-tilted-gray.webp",
  druskMap: "icons/creatures/abilities/wolf-howl-moon-purple.webp",
  stage: "icons/sundries/lights/lantern-iron-lit-yellow.webp",
  mist: "icons/magic/air/fog-gas-smoke-dense-white.webp",
  train: "icons/environment/vehicles/locomotive-train-engine.webp",
  intro: "icons/commodities/treasure/mask-jeweled-gold.webp",
  arrive: "icons/magic/light/beam-rays-yellow-blue.webp",
  ticket: "icons/commodities/currency/ticket.webp",
  ride: "icons/magic/air/wind-stream-blue-gray.webp",
  seance: "icons/magic/perception/orb-crystal-ball-scrying.webp",
  seanceSay: "icons/magic/perception/hand-eye-black.webp",
  entrance: "icons/sundries/flags/banner-standard-moon.webp",
  teddy: "icons/commodities/treasure/figurine-bear.webp",
};
const scene = (key) => ({ does: "scene", art: ART[key] });
const sound = { does: "sound" };

defineActions([
  /* ── Intros (§40.6) — the panel's first drawer: one key opens every NPC's entrance, a portrait each ───── */
  cm({
    id: "cm.entrance", group: "Intros", kind: "pick", label: "Intro", ...scene("entrance"),
    when: () => entranceList().length > 0,
    choices: () => entranceList().map((e) => ({ id: e.key, label: e.short ?? e.name, img: e.portrait })),
    run: async ({ choice }) => {
      if (!choice) return { ok: false, reason: "pick an intro" };
      return (await dmPlayEntrance(choice)) ? undefined : { ok: false, reason: "that intro is missing" };
    },
  }),
  cm({ id: "cm.entranceStop", group: "Intros", icon: "stop", label: "Stop intro", run: async () => { await dmStopEntrance(); } }),

  /* ── The house (§53) — the beats the DM fires himself ─────────────────────────────────────────────────── */
  // ⚠️ THE WEASELS ARE HIS, NOT A TIMER (DM 2026-09-20: *"I don't like the automated 'weasels in the wall' region,
  // i want action key control over that"* — the third time he has asked for the trigger to be his hand; the same
  // ruling as 2026-09-18's *"I want control on when the weasels move in the walls"*). The five patches beside the
  // wall cavities stay on the map as PLACES, switched off as triggers; this key plays one of them, the one nearest
  // the party, so the scurry always comes from a wall they are standing next to. Press it again and it moves —
  // never the same wall twice running while they stay put.
  // ⚠️ THE NURSERY IS PUT TO REST (DM 2026-09-20: *"add a 'teddy returned' action button that stops the crying and
  // light in crib and gives the laughing child sound fading out, a very quiet 'divine hum' and the laughter loop
  // stops appearing in the ambience"*). Four things at one press, which is exactly why it is a key and not four:
  // Arthur's wail and the rocking cradle stop, the module's own blue glow in the crib goes out, a child laughs once
  // and fades, and a very quiet hum is all that is left in the room. A TOGGLE, not a shot — a misfire is one press
  // back (§8.1: he can always undo as well as cheat), and pressing it again does not stack another laugh.
  cm({
    id: "cm.teddy", group: "The house", label: "Teddy returned", ...scene("teddy"),
    kind: "toggle",
    when: () => Boolean(nursery().hum),
    value: () => nursery().atPeace,
    sub: () => (nursery().atPeace ? "at peace" : undefined),
    run: () => setNurseryPeace(!nursery().atPeace),
  }),
  cm({
    id: "cm.weasels", group: "The house", icon: "paw", label: "Weasels in the walls", ...sound,
    when: () => wallCues().length > 0,
    sub: () => (wallCues().length > 1 ? `${wallCues().length} walls` : undefined),
    run: () => fireNearestWall(),
  }),

  /* ── Curses (§33) ─────────────────────────────────────────────────────────────────────────── */
  cm({
    id: "cm.curseTarget", group: "Curses", kind: "pick", icon: "target", label: "Curse who",
    when: () => curseCandidates().length > 0,
    sub: () => nameOf(curseState().target) || undefined,
    choices: () => { const t = curseState().target; return curseCandidates().map((a) => pcChoice(a, { on: a.id === t })); },
    run: ({ choice }) => (choice ? setCurseTarget(choice) : { ok: false, reason: "pick a character" }),
  }),
  cm({
    id: "cm.curseMinutes", group: "Curses", kind: "pick", icon: "clock", label: "How long",
    sub: () => `${curseState().mins} min`,
    choices: () => { const m = curseState().mins; return CURSE_MINUTES.map((x) => ({ id: String(x), label: `${x} minutes`, on: x === m })); },
    run: ({ choice }) => setCurseMinutes(choice),
  }),
  cm({
    id: "cm.curseRoll", group: "Curses", icon: "dice", label: "Roll curse",
    when: () => !!curseState().target,
    sub: () => { const n = nameOf(curseState().target); return n ? `on ${n}` : undefined; },
    run: () => rollStagedCurse(),
  }),
  cm({
    // The panel's "Pick instead…" — only for the built-in hundred; a configured table is rolled.
    id: "cm.curseHand", group: "Curses", kind: "pick", label: "Pick a curse",
    hidden: () => !!curseTableUuid(), when: () => !!curseState().target,
    choices: () => CURSES.map((c, i) => ({ id: String(i + 1), label: c.name, sub: String(i + 1) })),
    run: ({ choice }) => pickStagedCurse(choice),
  }),
  cm({
    id: "cm.curseAccept", group: "Curses", icon: "ok", label: "Accept",
    when: () => { const s = curseState(); return !!(s.pick && s.target); },
    alert: () => !!curseState().pick,
    sub: () => curseState().pick?.name,
    run: () => acceptStagedCurse(),
  }),
  cm({
    id: "cm.curseCancel", group: "Curses", icon: "cross", label: "Never mind",
    when: () => !!curseState().pick,
    run: () => cancelStagedCurse(),
  }),
  cm({
    // Every curse still running on this scene's characters (and any bargainer's), with its clock.
    id: "cm.curseLift", group: "Curses", kind: "pick", icon: "undo", label: "Lift a curse",
    when: () => curseCandidates().some((a) => actorCurses(a).length),
    choices: () => curseCandidates().flatMap((a) => actorCurses(a).map((e) => {
      const left = Math.max(0, Math.ceil(((e.flags[MODULE_ID]?.expiresAt ?? 0) - Date.now()) / 60000));
      return { id: `${a.id}:${e.id}`, label: a.name, img: pcImg(a), sub: `${e.name} · ${left}m` };
    })),
    run: ({ choice }) => { const [aid, eid] = String(choice ?? "").split(":"); return liftCurse(aid, eid); },
  }),
  cm({
    id: "cm.bargains", group: "Curses", kind: "toggle", label: "Bargains",
    on: () => bargainModeOn(),
    run: () => toggleBargainMode(),
  }),

  /* ── Fateweaving (§34) ─────────────────────────────────────────────────────────────────────── */
  cm({
    // − / + walks a character through the threads. Only while they have made no progress: changing
    // thread restarts the count, and a key is too easy to brush to let it wipe three steps.
    id: "cm.fateThread", group: "Fate", kind: "pick", steps: true, label: "Threads",
    when: () => scenePcs().length > 0,
    choices: () => scenePcs().map((a) => {
      const ft = a.getFlag(MODULE_ID, "fateThread");
      return pcChoice(a, { sub: ft?.key ? FATE_THREADS[ft.key]?.name : "no thread" });
    }),
    value: (id) => { const ft = game.actors.get(id)?.getFlag(MODULE_ID, "fateThread"); return ft?.key ? FATE_THREADS[ft.key]?.name ?? "—" : "no thread"; },
    run: async ({ choice, delta }) => {
      const a = game.actors.get(choice);
      if (!a || !delta) return { ok: false, reason: "pick a character" };
      const ft = a.getFlag(MODULE_ID, "fateThread");
      const reached = Number(ft?.reached ?? 0);
      if (ft?.key && reached > 0) return { ok: false, reason: `${a.name} is ${reached} steps into ${FATE_THREADS[ft.key]?.name ?? "a thread"} — change it on the panel` };
      await setFateThread(a.id, cycle(["", ...Object.keys(FATE_THREADS)], ft?.key ?? "", delta));
    },
  }),
  cm({
    // + reaches the next touchpoint (its book reward applies); − steps back (bookkeeping only).
    id: "cm.fateStep", group: "Fate", kind: "pick", steps: true, label: "Touchpoints",
    when: () => scenePcs().some((a) => a.getFlag(MODULE_ID, "fateThread")?.key),
    choices: () => scenePcs().filter((a) => a.getFlag(MODULE_ID, "fateThread")?.key).map((a) => {
      const reached = Math.min(Number(a.getFlag(MODULE_ID, "fateThread")?.reached ?? 0), 6);
      return pcChoice(a, { sub: `${reached} of 6` });
    }),
    value: (id) => `${Math.min(Number(game.actors.get(id)?.getFlag(MODULE_ID, "fateThread")?.reached ?? 0), 6)} of 6`,
    run: async ({ choice, delta }) => {
      const ft = game.actors.get(choice)?.getFlag(MODULE_ID, "fateThread");
      if (!ft?.key) return { ok: false, reason: "they have no thread" };
      const reached = Math.min(Number(ft.reached ?? 0), 6);
      if (delta > 0 && reached < 6) await fateTouch(choice, reached + 1);
      else if (delta < 0 && reached > 0) await fateTouch(choice, reached);
    },
  }),

  /* ── Twists of fate (§31) ──────────────────────────────────────────────────────────────────── */
  cm({
    id: "cm.twists", group: "Twists", kind: "pick", steps: true, icon: "random", label: "Twists",
    when: () => scenePcs().length > 0,
    choices: () => scenePcs().map((a) => pcChoice(a, { sub: String(Number(a.getFlag(MODULE_ID, "twists") ?? 0)) })),
    value: (id) => String(Number(game.actors.get(id)?.getFlag(MODULE_ID, "twists") ?? 0)),
    run: ({ choice, delta }) => (choice && delta ? adjustTwists(choice, Math.sign(delta)) : { ok: false, reason: "pick a character" }),
  }),
  cm({
    // A leftover armed twist (v2) — rare; dim when there is none rather than moving keys about.
    id: "cm.twistDisarm", group: "Twists", kind: "pick", icon: "cross", label: "Disarm twist",
    when: () => armedTwists().length > 0,
    choices: () => armedTwists().map((x) => ({ id: x.uuid, label: x.name, sub: `natural ${x.arm?.die === 1 ? "1" : "20"}` })),
    run: ({ choice }) => disarmTwist(choice),
  }),

  /* ── The Druskenvald clock (§43) ───────────────────────────────────────────────────────────── */
  cm({
    id: "cm.druskNext", group: "Druskenvald", icon: "clock", label: "Next hour", ...scene("druskNext"),
    sub: () => currentHour()?.name,
    run: () => druskNextHour(),
  }),
  cm({
    // "Is THIS map Druskenvald?" — the ring says yes. (One line: a picture key's label band holds one.)
    id: "cm.druskMap", group: "Druskenvald", kind: "toggle", icon: "moon", label: "Druskenvald", ...scene("druskMap"),
    when: () => !!canvas?.scene,
    on: () => isDruskScene(canvas?.scene),
    run: () => toggleDruskMap(),
  }),

  /* ── The Fated Tarot (§42) ─────────────────────────────────────────────────────────────────── */
  cm({
    id: "cm.tarotDeal", group: "Tarot", kind: "pick", label: "Deal a card",
    when: () => scenePcs().length > 0,
    choices: () => scenePcs().map((a) => pcChoice(a, { sub: actorCard(a) ? "holding" : undefined })),
    run: ({ choice }) => (choice ? dealTarotTo(choice) : { ok: false, reason: "pick a character" }),
  }),
  cm({
    // The cheat: − / + through the arcana nobody else holds; "the cards decide" is one step past the ends.
    id: "cm.tarotCheat", group: "Tarot", kind: "pick", steps: true, label: "Their next card",
    when: () => scenePcs().length > 0,
    choices: () => scenePcs().map((a) => pcChoice(a, { sub: cardByKey(tarotForced(a.id))?.name ?? "cards decide" })),
    value: (id) => cardByKey(tarotForced(id))?.name ?? "the cards decide",
    run: async ({ choice, delta }) => {
      const a = game.actors.get(choice);
      if (!a || !delta) return { ok: false, reason: "pick a character" };
      const taken = tarotTaken();
      const own = actorCard(a)?.key;
      const open = ARCANA.filter((c) => !taken.has(c.key) || c.key === own).map((c) => c.key);
      await setTarotForced(a.id, cycle(["", ...open], tarotForced(a.id) ?? "", delta) || null);
    },
  }),
  cm({
    id: "cm.tarotBack", group: "Tarot", kind: "pick", icon: "undo", label: "Take card back",
    when: () => scenePcs().some((a) => actorCard(a)),
    choices: () => scenePcs().filter((a) => actorCard(a)).map((a) => pcChoice(a)),
    run: ({ choice }) => takeTarotBack(choice),
  }),

  /* ── All aboard (§36) — in the order the scene plays ───────────────────────────────────────── */
  cm({ id: "cm.stage", group: "All aboard", label: "Set stage", ...scene("stage"), run: () => stageFirstBoarding() }),
  cm({ id: "cm.mist", group: "All aboard", kind: "toggle", icon: "fog", label: "Mist", ...scene("mist"), on: () => fxIsOn("cmStation"), run: () => toggleStationMist() }),
  cm({ id: "cm.fiddle", group: "All aboard", kind: "toggle", icon: "music", label: "Fiddle", ...sound, on: () => cmLive().fiddle, run: () => toggleFiddle() }),
  cm({ id: "cm.engine", group: "All aboard", kind: "toggle", label: "Engine", ...sound, on: () => cmLive().engine, run: () => toggleEngine() }),
  cm({ id: "cm.whistle", group: "All aboard", label: "Whistle", ...sound, run: () => trainWhistle() }),
  cm({ id: "cm.train", group: "All aboard", kind: "toggle", icon: "train", label: "Train", ...scene("train"), on: () => !!trainState()?.in, run: () => setTrainIn(!trainState()?.in) }),
  cm({ id: "cm.brakes", group: "All aboard", icon: "stop", label: "Brakes", ...sound, run: () => trainBrakes() }),

  /* ── Boarding: one character at a time (§36) ───────────────────────────────────────────────── */
  cm({
    id: "cm.intro", group: "Boarding", kind: "pick", icon: "panel", label: "Introduce", ...scene("intro"),
    when: () => scenePcs().length > 0,
    sub: () => nameOf(introActorId()) || undefined,
    choices: () => { const on = introActorId(); return scenePcs().map((a) => pcChoice(a, { on: a.id === on })); },
    run: ({ choice }) => (choice ? toggleIntro(choice) : { ok: false, reason: "pick a character" }),
  }),
  cm({
    id: "cm.arrive", group: "Boarding", kind: "pick", icon: "train", label: "Arrive for", ...scene("arrive"),
    when: () => scenePcs().length > 0,
    choices: () => { const on = trainState()?.actorId; return scenePcs().map((a) => pcChoice(a, { on: a.id === on })); },
    run: ({ choice }) => (choice ? trainArriveFor(choice) : { ok: false, reason: "pick a character" }),
  }),
  cm({
    // Hand a ticket over, or punch it as they board — the list stays open, one press per person.
    id: "cm.ticket", group: "Boarding", kind: "pick", multi: true, label: "Tickets", ...scene("ticket"),
    when: () => boardingUsers().length > 0,
    sub: () => { const n = boardingUsers().filter((id) => fxIsOnFor("cmTicket", id)).length; return n ? `${n} out` : undefined; },
    choices: () => scenePcs().map((a) => ({ a, u: pcUser(a) })).filter((x) => x.u)
      .map(({ a, u }) => ({ id: u.id, label: a.name, img: pcImg(a), on: fxIsOnFor("cmTicket", u.id) })),
    run: ({ choice }) => toggleTicket(choice),
  }),
  cm({
    id: "cm.ticketsAll", group: "Boarding", kind: "toggle", label: "All tickets", ...scene("ticket"),
    when: () => boardingUsers().length > 0,
    on: () => allTicketsOut(),
    run: () => setAllTickets(!allTicketsOut()),
  }),

  /* ── The Ghostlight ride (§37) ─────────────────────────────────────────────────────────────── */
  cm({
    id: "cm.ride", group: "Ghostlight", kind: "toggle", icon: "train", label: "The ride", ...scene("ride"),
    when: () => trainScenes().length > 0,
    on: () => trainMistOn(),
    run: () => setRide(!trainMistOn()),
  }),

  /* ── Séance (§30) ──────────────────────────────────────────────────────────────────────────── */
  cm({ id: "cm.seance", group: "Séance", kind: "toggle", label: "Spirit board", ...scene("seance"), on: () => boardOn(), run: () => toggleSeanceBoard() }),
  cm({
    id: "cm.sitters", group: "Séance", kind: "pick", multi: true, label: "At the board",
    when: () => scenePcs().length > 0,
    sub: () => { const n = seanceSitters().length; return n ? `${n} seated` : undefined; },
    choices: () => { const at = new Set(seanceSitters().map((a) => a.id)); return scenePcs().map((a) => pcChoice(a, { on: at.has(a.id) })); },
    run: ({ choice }) => toggleSeanceSitter(choice),
  }),
  cm({
    id: "cm.seanceD10", group: "Séance", icon: "dice", label: "Ask d10",
    when: () => boardOn() && seanceSitters().length > 0 && !cmLive().seance.armed,
    sub: () => { const d = cmLive().seance.lastD10; return d == null ? undefined : `last: ${d}`; },
    run: () => seanceQuestion(),
  }),
  cm({
    // Always live once someone sits — the DM can cheat (UI-BIBLE §8.1). A rolled 1 lights it.
    id: "cm.seanceBite", group: "Séance", icon: "skull", label: "The bite", danger: true,
    when: () => boardOn() && seanceSitters().length > 0,
    alert: () => cmLive().seance.armed,
    sub: () => `1d${seanceDie()} psychic`,
    run: () => seanceBite(),
  }),
  cm({
    id: "cm.seanceSay", group: "Séance", kind: "pick", label: "Answer", ...scene("seanceSay"),
    when: () => boardOn(),
    choices: () => SEANCE_WORDS.map((w) => ({ id: w, label: w })),
    run: ({ choice }) => (seanceSay(choice) ? undefined : { ok: false, reason: "nothing to say" }),
  }),

  /* ── Requests: players waiting on the DM ───────────────────────────────────────────────────── */
  req({
    id: "cm.twistSpend", group: "Twists of fate", kind: "pick", icon: "ok", label: "Spend twist",
    when: () => twistRequests().length > 0, waiting: () => twistRequests().length,
    choices: () => twistRequests().map((a) => {
      const p = a.getFlag(MODULE_ID, "twistPending");
      return pcChoice(a, { sub: `natural ${p?.die === 1 ? "1" : "20"}` });
    }),
    run: ({ choice }) => spendTwist(game.actors.get(choice)),
  }),
  req({
    id: "cm.twistKeep", group: "Twists of fate", kind: "pick", icon: "cross", label: "Keep twist",
    when: () => twistRequests().length > 0, waiting: () => 0,
    choices: () => twistRequests().map((a) => pcChoice(a)),
    run: ({ choice }) => refundTwist(game.actors.get(choice)),
  }),
  req({
    id: "cm.bargainStrike", group: "Bargains", kind: "pick", icon: "dice", label: "Strike bargain",
    when: () => bargainRequests().length > 0, waiting: () => bargainRequests().length,
    choices: () => bargainRequests().map((a) => pcChoice(a)),
    run: ({ choice }) => (choice ? strikeBargain(choice) : { ok: false, reason: "pick a character" }),
  }),
  req({
    // After a strike the curse waits here too, so the whole bargain is answered on one page.
    id: "cm.bargainAccept", group: "Bargains", icon: "ok", label: "Accept curse",
    when: () => { const s = curseState(); return !!(s.pick && game.actors.get(s.target)?.getFlag(MODULE_ID, "bargainPending")); },
    waiting: () => 0, alert: () => true,
    sub: () => curseState().pick?.name,
    run: () => acceptStagedCurse(),
  }),
  req({
    id: "cm.bargainDecline", group: "Bargains", kind: "pick", icon: "cross", label: "Decline bargain",
    when: () => bargainRequests().length > 0, waiting: () => 0,
    choices: () => bargainRequests().map((a) => pcChoice(a)),
    run: ({ choice }) => declineBargain(choice),
  }),
]);
