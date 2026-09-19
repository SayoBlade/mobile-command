import { MODULE_ID } from "./preset.js";
import { fxIsOn, fxIsOnFor, fxActiveMap, dmToggleFx, dmToggleFxFor, dmFireFx } from "./effects.js";
import { rollCurse, pickCurse, applyCurse } from "./cm-curses.js";
import { applyFateReward } from "./fateweaving.js";
import { dealOne, setActorCard } from "./tarot.js";
import { advanceToNextHour, isDruskScene, markDruskScene } from "./druskenvald.js";
import { trainChains, wireTrainDoors, setTrainMist } from "./cm-train.js";
import { scenePcs, pcUser, pcSeatRot } from "./roster.js";

/**
 * ── THE CROOKED MOON TAB'S STATE AND VERBS, IN ONE PLACE (deck-command ledger 151, area H) ───────
 *
 * The panel's Crooked Moon buttons and the deck's Crooked Moon keys both call the functions below,
 * so there is one implementation of every beat and the two surfaces cannot drift.
 *
 * THE STATE THAT USED TO LIVE IN THE PANEL'S MEMORY lives in one world setting now, `cmLiveState`:
 * who sits at the séance board and how far the bite has escalated, the curse's target, minutes and
 * the staged card awaiting Accept, the tarot cheat, and whether the fiddle and the engine beds are
 * running. Before, a press on the deck could not have known any of it, and a reload of the DM's
 * browser forgot it — the fiddle kept playing on the TV while its button said "Start fiddle".
 *
 * What stays in the panel: text being typed (the séance phrase, an arrival script) and which
 * drawer or pane is open. Those belong to the screen they are typed on.
 *
 * Visibility: a world setting reaches every client, so a curious player with the console open could
 * read a staged curse or the tarot cheat before it lands. Nothing on a phone ever shows it; this is
 * noted, not guarded (MC DESIGN §52).
 */

const KEY = "cmLiveState";

/** The whole state, filled out — a fresh world, or one saved before a field existed, reads the same. */
export function cmLive() {
  let s = {};
  try { s = game.settings.get(MODULE_ID, KEY) ?? {}; } catch (e) { /* pre-ready */ }
  const se = s.seance ?? {};
  const cu = s.curse ?? {};
  return {
    fiddle: !!s.fiddle,
    engine: !!s.engine,
    seance: {
      party: Array.isArray(se.party) ? [...se.party] : [],
      step: Number(se.step) || 0,
      armed: !!se.armed,
      lastD10: se.lastD10 ?? null,
    },
    curse: { target: cu.target ?? null, mins: Number(cu.mins) || 20, pick: cu.pick ?? null },
    tarot: { ...(s.tarot ?? {}) },
  };
}

// Read-modify-write of the whole object, one at a time: two quick presses on this client must not
// both read the same state and have the second write undo the first.
let queue = Promise.resolve();
function changeLive(mutate) {
  const run = queue.then(async () => {
    const next = cmLive();
    mutate(next);
    await game.settings.set(MODULE_ID, KEY, next);
  });
  queue = run.catch((e) => console.error(`${MODULE_ID} | cmLiveState write failed`, e));
  return run;
}

/* -------------------------------------------- */
/*  §30 The séance                              */
/* -------------------------------------------- */

export const SEANCE_DICE = [4, 6, 8, 10, 12];
/** The four words printed on the board — the planchette lands on them whole (seance.js WORDS). */
export const SEANCE_WORDS = ["YES", "NO", "HELLO", "GOODBYE"];

export function seanceDie(step = cmLive().seance.step) { return SEANCE_DICE[Math.min(step, SEANCE_DICE.length - 1)]; }
export function seanceGlitchLevel(step = cmLive().seance.step) { return [0.22, 0.45, 0.65, 0.85, 1][Math.min(step, 4)]; }

/** Who is at the board: PCs only (pets don't hold the planchette), and only those still in the scene. */
export function seanceSitters() {
  const party = new Set(cmLive().seance.party);
  return scenePcs().filter(a => party.has(a.id));
}

export async function toggleSeanceSitter(actorId) {
  if (!actorId) return;
  await changeLive((s) => {
    const p = new Set(s.seance.party);
    if (p.has(actorId)) p.delete(actorId); else p.add(actorId);
    s.seance.party = [...p];
  });
}

/** The board on or off. A fresh séance resets the escalation — the die starts back at 1d4 (§30.1). */
export async function toggleSeanceBoard() {
  if (!fxIsOn("seance")) await changeLive((s) => { s.seance.step = 0; s.seance.armed = false; s.seance.lastD10 = null; });
  await dmToggleFx("seance");
}

/** The question d10, GM-only: on a 1 the board bites and the damage roll goes live. */
export async function seanceQuestion() {
  const r = await (new Roll("1d10")).evaluate();
  await changeLive((s) => { s.seance.lastD10 = r.total; if (r.total === 1) s.seance.armed = true; });
  // rollMode option, not a whisper array — Roll#toMessage applies the client's default roll mode
  // AFTER messageData and clobbers an explicit whisper (bench 2026-07-27: public mode made these public).
  await r.toMessage({ flavor: "Séance — the question d10" }, { rollMode: "gmroll" });
  return r.total;
}

/**
 * The bite: escalating psychic damage to every sitter, and the static glitch on the TV and their
 * phones growing with the die — very weak the first time, ugly by 1d12. Always available: the DM
 * can cheat (DM 2026-07-27, UI-BIBLE §8.1).
 */
export async function seanceBite() {
  const step = cmLive().seance.step;
  const die = seanceDie(step);
  const r = await (new Roll(`1d${die}`)).evaluate();
  const sitters = seanceSitters();
  for (const a of sitters) await a.applyDamage([{ value: r.total, type: "psychic" }]);
  const owners = new Set();
  for (const a of sitters) for (const u of game.users) {
    if (!u.isGM && a.testUserPermission(u, "OWNER")) owners.add(u.id);
  }
  let tvId = ""; try { tvId = game.settings.get(MODULE_ID, "displayOwnerUser") || ""; } catch (e) { /* */ }
  if (tvId) owners.add(tvId);
  dmFireFx("static", { users: [...owners], level: seanceGlitchLevel(step) });
  await r.toMessage({
    flavor: `Séance — the board bites: 1d${die} psychic to ${sitters.map(a => a.name).join(", ") || "nobody"}`
  }, { rollMode: "gmroll" });
  await changeLive((s) => { s.seance.step = step + 1; s.seance.armed = false; });
}

/** The planchette spells it on the TV. Returns false when nothing sayable is left after cleaning. */
export function seanceSay(text) {
  const words = String(text ?? "").replace(/[^A-Za-z0-9 ]/g, "").trim();
  if (!words) return false;
  dmFireFx("seancePhrase", { text: words });
  return true;
}

/* -------------------------------------------- */
/*  §33 Chaotic curses + bargains               */
/* -------------------------------------------- */

export const CURSE_MINUTES = [10, 20, 30];

/** Every PC with an open reroll bargain — wherever they stand, so a request never vanishes. */
export function bargainRequests() {
  return game.actors.filter(a => a.type === "character" && a.getFlag(MODULE_ID, "bargainPending"));
}

/** Who a curse can land on: this scene's PCs, plus anyone with an open bargain. */
export function curseCandidates() {
  const pcs = scenePcs();
  for (const b of bargainRequests()) if (!pcs.some(a => a.id === b.id)) pcs.push(b);
  return pcs;
}

/** The target, minutes and staged card. A target who left falls back to the first candidate. */
export function curseState() {
  const { curse } = cmLive();
  const pcs = curseCandidates();
  const target = pcs.some(a => a.id === curse.target) ? curse.target : (pcs[0]?.id ?? null);
  return { ...curse, target };
}

export async function setCurseTarget(actorId) { await changeLive((s) => { s.curse.target = actorId || null; }); }
export async function setCurseMinutes(m) { await changeLive((s) => { s.curse.mins = Number(m) || 20; }); }

/** Roll the curse (the custom table when set, else the d100) and stage it for Accept. */
export async function rollStagedCurse() {
  const pick = await rollCurse();
  await changeLive((s) => { s.curse.pick = pick; });
  return pick;
}
/** Stage a hand-picked curse from the built-in hundred. */
export async function pickStagedCurse(n) {
  const pick = pickCurse(Number(n));
  await changeLive((s) => { s.curse.pick = pick; });
  return pick;
}
export async function cancelStagedCurse() { await changeLive((s) => { s.curse.pick = null; }); }

/**
 * Land the staged curse on the target for its minutes. Under bargain mode the Accept IS the reroll
 * permission: the open request resolves in the same write, and the phone's ask card tells the
 * player to roll. Returns { actor, pick } when something landed.
 */
export async function acceptStagedCurse() {
  const { target, pick, mins } = curseState();
  const a = game.actors.get(target);
  if (a && pick) {
    await applyCurse(a, pick, mins);
    if (a.getFlag(MODULE_ID, "bargainPending")) {
      await a.update({ [`flags.${MODULE_ID}.-=bargainPending`]: null, [`flags.${MODULE_ID}.bargainResult`]: "struck" });
    }
  }
  await changeLive((s) => { s.curse.pick = null; });
  return a && pick ? { actor: a, pick } : null;
}

/** Strike a bargain: the requester becomes the target and their curse is rolled, awaiting Accept. */
export async function strikeBargain(actorId) {
  const pick = await rollCurse();
  await changeLive((s) => { s.curse.target = actorId; s.curse.pick = pick; });
  return pick;
}
/** Decline: the roll stands. */
export async function declineBargain(actorId) {
  const a = game.actors.get(actorId);
  if (a) await a.update({ [`flags.${MODULE_ID}.-=bargainPending`]: null, [`flags.${MODULE_ID}.bargainResult`]: "declined" });
}

export function bargainModeOn() {
  try { return !!game.settings.get(MODULE_ID, "bargainMode"); } catch (e) { return false; }
}
export async function toggleBargainMode() { await game.settings.set(MODULE_ID, "bargainMode", !bargainModeOn()); }

/** End a curse before its time — the DM can always lift misfortune early (§8.1). */
export async function liftCurse(actorId, effectId) {
  await game.actors.get(actorId)?.deleteEmbeddedDocuments("ActiveEffect", [effectId]).catch(() => {});
}

/* -------------------------------------------- */
/*  §34 Fateweaving                             */
/* -------------------------------------------- */

/** Assign or clear a PC's Thread of Fate. A new thread starts at its beginning. */
export async function setFateThread(actorId, key) {
  const a = game.actors.get(actorId);
  if (!a) return;
  if (key) await a.setFlag(MODULE_ID, "fateThread", { key, reached: 0 });
  else await a.unsetFlag(MODULE_ID, "fateThread");
}

/**
 * Touch dot n. Past the reached one advances — each crossed step's book reward applies. At or below
 * it retracts to n − 1: bookkeeping only, rewards are never clawed back automatically.
 * Returns false when the PC has no thread.
 */
export async function fateTouch(actorId, n) {
  const a = game.actors.get(actorId);
  const ft = a?.getFlag(MODULE_ID, "fateThread");
  if (!a || !ft?.key) return false;
  const reached = Math.min(Number(ft.reached ?? 0), 6);
  if (n <= reached) await a.setFlag(MODULE_ID, "fateThread", { ...ft, reached: n - 1 });
  else {
    for (let s = reached + 1; s <= n; s++) await applyFateReward(a, s);
    await a.setFlag(MODULE_ID, "fateThread", { ...ft, reached: n });
  }
  return true;
}

/* -------------------------------------------- */
/*  §31 Twists of fate                          */
/* -------------------------------------------- */

export async function adjustTwists(actorId, delta) {
  const a = game.actors.get(actorId);
  if (a) await a.setFlag(MODULE_ID, "twists", Math.max(0, Number(a.getFlag(MODULE_ID, "twists") ?? 0) + Number(delta)));
}

/** Every PC whose phone is asking to twist fate right now. */
export function twistRequests() {
  return game.actors.filter(a => a.type === "character" && a.getFlag(MODULE_ID, "twistPending"));
}

/** Spend it: the token goes, the PUBLIC fate card posts, and the DM sets that die by hand. */
export async function spendTwist(a) {
  const p = a?.getFlag(MODULE_ID, "twistPending");
  if (!a || !p) return false;
  const esc = foundry.utils.escapeHTML;
  await a.setFlag(MODULE_ID, "twists", Math.max(0, Number(a.getFlag(MODULE_ID, "twists") ?? 0) - 1));
  await a.unsetFlag(MODULE_ID, "twistPending");
  await ChatMessage.create({
    speaker: { alias: "Fate" },
    content: `<p><b>${esc(a.name)}</b> twists fate — the die comes up a <b>natural ${p.die === 1 ? "1" : "20"}</b>${p.note ? ` <em>(${esc(p.note)})</em>` : ""}.</p>`
  });
  return true;
}
/** Keep it: the request goes, the twist stays in hand. */
export async function refundTwist(a) {
  await a?.unsetFlag(MODULE_ID, "twistPending");
}

/**
 * Every creature carrying a leftover armed twist (v2): active-scene tokens (synthetic actors
 * included) plus PCs wherever they stand. Deduped by actor id — a linked token IS its actor.
 */
export function armedTwists() {
  const out = []; const seen = new Set();
  for (const t of game.scenes.active?.tokens ?? []) {
    const arm = t.actor?.getFlag(MODULE_ID, "twistArmed");
    if (arm && !seen.has(t.actor.id)) { seen.add(t.actor.id); out.push({ name: t.name, uuid: t.actor.uuid, arm }); }
  }
  for (const a of game.actors) {
    if (a.type !== "character") continue;
    const arm = a.getFlag(MODULE_ID, "twistArmed");
    if (arm && !seen.has(a.id)) { seen.add(a.id); out.push({ name: a.name, uuid: a.uuid, arm }); }
  }
  return out;
}
export async function disarmTwist(uuid) {
  const doc = await fromUuid(uuid);
  await (doc?.actor ?? doc)?.unsetFlag(MODULE_ID, "twistArmed");
}

/* -------------------------------------------- */
/*  §43 The Druskenvald clock                   */
/* -------------------------------------------- */

export async function druskNextHour() {
  const landed = await advanceToNextHour();
  if (landed) ui.notifications.info(`Druskenvald: it is now ${landed.name}.`);
  return landed;
}

/** Put the viewed map under the eternal night, or release it — and re-light it now, not at the next tick. */
export async function toggleDruskMap(scene = canvas?.scene) {
  if (!scene) return false;
  await markDruskScene(scene.id, !isDruskScene(scene));
  try { await globalThis.MobileCommand?.applyDaylightNow?.(); } catch (e) { /* best-effort */ }
  return true;
}

/* -------------------------------------------- */
/*  §42 The Fated Tarot                         */
/* -------------------------------------------- */

/** The arcana the DM has decided this character draws next (the cheat), or null: the cards decide. */
export function tarotForced(actorId) { return cmLive().tarot[actorId] ?? null; }
export async function setTarotForced(actorId, key) {
  await changeLive((s) => { if (key) s.tarot[actorId] = key; else delete s.tarot[actorId]; });
}
/** Every arcana someone holds — struck from the cheat, the book's no-duplicates rule. */
export function tarotTaken() {
  return new Set([...(game.actors ?? [])].map(a => a.getFlag(MODULE_ID, "tarot")?.key).filter(Boolean));
}

/** One card, face down, into that character's hand. The cheat was for THAT draw, so it clears. */
export async function dealTarotTo(actorId) {
  const a = game.actors.get(actorId);
  if (!a) return null;
  const card = await dealOne(a, tarotForced(a.id));
  if (!card) ui.notifications.warn(`${MODULE_ID} | the deck is out of arcana.`);
  else ui.notifications.info(`${a.name} draws ${card.name} — it's face down on their phone.`);
  await changeLive((s) => { delete s.tarot[a.id]; });
  return card;
}
/** Take the card back — it returns to the deck. */
export async function takeTarotBack(actorId) { await setActorCard(game.actors.get(actorId), null); }

/* -------------------------------------------- */
/*  §36 All aboard · §37 the Ghostlight ride    */
/* -------------------------------------------- */

export function trainState() { return fxActiveMap().cmTrain ?? null; }
export function introActorId() { return fxActiveMap().cmIntro?.actorId ?? null; }

/** The fog on the shared screen. Closing it takes the intro card down too — no ghost card on re-open. */
export async function toggleStationMist() {
  const closing = fxIsOn("cmStation");
  await dmToggleFx("cmStation");
  if (closing && fxActiveMap().cmIntro) {
    const cur = { ...fxActiveMap() };
    delete cur.cmIntro;
    await game.settings.set(MODULE_ID, "fxActive", cur);
  }
}

/** The lone fiddle — a bed left playing under the narration. The brakes never duck it (§36.1.8). */
export async function toggleFiddle() {
  const on = !cmLive().fiddle;
  dmFireFx("cmFiddle", { on });
  await changeLive((s) => { s.fiddle = on; });
}
/** The distant engine, fading in. */
export async function toggleEngine() {
  const on = !cmLive().engine;
  dmFireFx("cmTrainApproach", { on });
  await changeLive((s) => { s.engine = on; });
}
export function trainWhistle() { dmFireFx("cmWhistle"); }
/** Brakes: squeal, sigh, halt. Ducks the engine only — the fiddle plays on. */
export async function trainBrakes() {
  dmFireFx("cmTrainStop");
  await changeLive((s) => { s.engine = false; });
}

/** Bring the train in (aimed wherever the last "arrive for them" pointed it), or send it back. */
export async function setTrainIn(on) {
  const cur = { ...fxActiveMap() };
  if (on) { cur.cmTrain = { in: true, rot: cur.cmTrain?.rot ?? 0 }; cur.cmStation = true; }
  else delete cur.cmTrain;
  await game.settings.set(MODULE_ID, "fxActive", cur);
}

/** Arrive for one character: station up, the train in, facing their seat — one press for the beat. */
export async function trainArriveFor(actorId) {
  const a = game.actors.get(actorId);
  const cur = { ...fxActiveMap() };
  cur.cmStation = true;
  cur.cmTrain = { in: true, rot: pcSeatRot(a), actorId: a?.id ?? null };
  await game.settings.set(MODULE_ID, "fxActive", cur);
}

/** One character's card on the display (one at a time; raises the station). Again takes it down. */
export async function toggleIntro(actorId) {
  const cur = { ...fxActiveMap() };
  if (cur.cmIntro?.actorId === actorId) delete cur.cmIntro;
  else { cur.cmIntro = { actorId }; cur.cmStation = true; }
  await game.settings.set(MODULE_ID, "fxActive", cur);
}

/** One ticket: hand it over, or punch it as they board. */
export async function toggleTicket(userId) { if (userId) await dmToggleFxFor("cmTicket", userId); }

/** The players of this scene's PCs — the people who get tickets. */
export function boardingUsers() {
  return [...new Set(scenePcs().map(a => pcUser(a)).filter(Boolean).map(u => u.id))];
}
export function allTicketsOut() {
  const users = boardingUsers();
  return users.length > 0 && users.every(id => fxIsOnFor("cmTicket", id));
}
/** Every ticket at once — hand them out at the top of the scene, or punch them all. */
export async function setAllTickets(on) {
  const users = boardingUsers();
  const cur = { ...fxActiveMap() };
  if (on && users.length) cur.cmTicket = { users };
  else delete cur.cmTicket;
  await game.settings.set(MODULE_ID, "fxActive", cur);
}

/**
 * §36.2 The first boarding (DM 2026-08-28: "start with fog, dm view opens on entry cart and a
 * small area is marked (for dm only) with 'place all PCs here', then the dm can narrate each pc
 * going onboard, then switch to the map view"). One tap does the setup half:
 *   fog up on the shared screen · the ENTRY CAR (rear of the wired chain, Colored preferred)
 *   activated BEHIND the fog — deliberately: an empty active car makes the drawer's roster fall
 *   back to every hero, tokenless ones included · a party mark on the boarding squares that only
 *   the DM can see. The narration half is the drawer as it already plays (introduce · ticket ·
 *   drag each hero onto the mark) and "Stop mist" is the switch-to-map-view beat.
 * The mark is a HIDDEN Drawing: hidden placeables render for GMs only — core's own semantics,
 * no new visibility machinery, and harmless to leave in place between sessions. Idempotent via
 * the boardingZone flag.
 */
export async function stageFirstBoarding() {
  const chains = trainChains();
  const chain = chains.colored.length ? chains.colored : chains.plain;
  const entry = (chain.find((e) => e.n === 1) ?? chain[0])?.scene;
  if (!entry) return ui.notifications.warn("No Ghostlight car scenes (10.1–10.8) in this world.");
  if (!fxIsOn("cmStation")) await dmToggleFx("cmStation"); // fog first, so the switch happens behind it
  if (!entry.drawings.some((d) => d.flags[MODULE_ID]?.boardingZone)) {
    const g = entry.grid?.size ?? 140;
    // Anchor on the rear boarding landing when the doors are wired; a sane mid-car
    // spot otherwise. 3×3 cells — room for a whole party without stacking.
    const land = entry.regions.find((r) => r.flags[MODULE_ID]?.trainLand === "back")?.shapes?.[0];
    const x = Math.max(0, Math.round(land ? land.x - g : g * 6));
    const y = Math.max(0, Math.round(land ? land.y - g : g * 3));
    await entry.createEmbeddedDocuments("Drawing", [{
      x, y, shape: { type: "r", width: g * 3, height: g * 3 },
      strokeColor: "#2fbd9c", strokeAlpha: 0.9, strokeWidth: 4,
      fillType: 0, hidden: true,
      text: "Place the party here", fontSize: 34, textColor: "#2fbd9c",
      flags: { [MODULE_ID]: { boardingZone: true } },
    }]);
  }
  if (!entry.active) await entry.activate();
  if (game.scenes.viewed?.id !== entry.id) await entry.view();
  ui.notifications.info(`The stage is set — fog is up, ${entry.name} is the scene, and the party mark is yours alone to see.`);
}

/** §37 wire every car door (idempotent — it re-checks, never duplicates). */
export async function wireDoors() {
  const report = await wireTrainDoors();
  ui.notifications.info(`Ghostlight Express — ${report.join(" · ") || "no car scenes found"}`);
}

/** §37 the Shroud rushing past every window, or still. */
export async function setRide(on) {
  const n = await setTrainMist(on);
  ui.notifications.info(on
    ? `The Ghostlight Express runs — the Shroud rushes past ${n} cars.`
    : `The train rests — ${n} cars gone still.`);
}
