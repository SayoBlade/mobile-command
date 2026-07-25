// Combat music (DESIGN §25.2, DM 2026-07-25). Per-PC combat THEMES + a BATTLE track for foe turns.
//
// The model: on combat start we remember whatever is playing, pause it, and take over. Each turn we
// play the active combatant's track — a character's own theme (a PlaylistSound) if they have one,
// otherwise the battle track (a Playlist) for foes and theme-less PCs. On combat end we stop the
// combat music and resume what was playing before. MVP is stop-and-play (each track restarts from 0);
// true pause/resume-from-position is a later nicety (DM accepted this).
//
// Driven on the PRIMARY GM only — playlist writes are GM-only, and Foundry syncs playlist state to
// every client (including the TV) on its own, so one driver reaches all speakers. A player client or
// a non-primary GM silently no-ops.
//
// Storage: a PC's theme is `actor.flags.mobile-command.combatTheme` = a PlaylistSound uuid (set by
// drag-drop in Settings → Sound). The battle track is the `combatBattleTrack` world setting = a
// Playlist uuid (picked in the Combat tab's pre-start staging).

import { MODULE_ID } from "./preset.js";

let _combatPlaying = null; // the Playlist or PlaylistSound combat music is currently playing (to stop on switch)
let _resumeAfter = [];     // PlaylistSound uuids that were playing BEFORE combat, to resume when it ends
let _active = false;       // combat music is running (set by start, cleared by end)
let _lock = Promise.resolve(); // serialize ops — startCombat fires combatStart AND updateCombat, which
                               // otherwise interleave and leak the battle track onto a themed PC's turn.

function isMusicDriver() { return game.user === game.users.activeGM; }

// Run `fn` after any in-flight music op finishes, so the hooks never race each other.
function serialize(fn) { const p = _lock.then(fn, fn); _lock = p.catch(() => {}); return p; }

function battleTrackUuid() {
  try { return game.settings.get(MODULE_ID, "combatBattleTrack") || ""; } catch (e) { return ""; }
}

// The track for the active combatant: a character's own theme, else the battle track.
function trackForActive() {
  const actor = game.combat?.combatant?.actor;
  if (actor?.type === "character") {
    const t = actor.getFlag(MODULE_ID, "combatTheme");
    if (t) return t;
  }
  return battleTrackUuid();
}

async function stopCurrent() {
  const cur = _combatPlaying;
  _combatPlaying = null;
  if (!cur) return;
  try {
    if (cur.documentName === "Playlist") await cur.stopAll();
    else if (cur.documentName === "PlaylistSound") await cur.parent?.stopSound(cur);
  } catch (e) { console.warn(`${MODULE_ID} | combat music stop failed`, e); }
}

// Stop whatever combat music is playing and play `uuid` (a Playlist plays all its sounds; a
// PlaylistSound plays that one track). Same uuid as the current track → nothing to do (don't restart).
async function play(uuid) {
  if (!uuid) { await stopCurrent(); return; }
  if (_combatPlaying && _combatPlaying.uuid === uuid) return; // already playing this — leave it running
  await stopCurrent();
  let doc = null;
  try { doc = await fromUuid(uuid); } catch (e) { /* stale uuid */ }
  if (!doc) return;
  try {
    if (doc.documentName === "Playlist") { await doc.playAll(); _combatPlaying = doc; }
    else if (doc.documentName === "PlaylistSound") { await doc.parent?.playSound(doc); _combatPlaying = doc; }
  } catch (e) { console.warn(`${MODULE_ID} | combat music play failed`, e); }
}

async function startCombatMusic() {
  if (!isMusicDriver() || !game.combat || _active) return;
  _active = true; // set FIRST so a racing updateCombat waits for us (it guards on _active)
  // Take over: remember + pause everything currently playing, to resume on combat end.
  _resumeAfter = [];
  for (const pl of game.playlists) for (const s of pl.sounds) if (s.playing) _resumeAfter.push(s.uuid);
  for (const uuid of _resumeAfter) {
    try { const s = await fromUuid(uuid); await s?.parent?.stopSound(s); } catch (e) { /* best-effort */ }
  }
  await play(trackForActive());
}

async function updateCombatMusic() {
  // Only once combat music is running (combatStart set _active) — otherwise the turn-0 update that
  // fires alongside combatStart would play before we've captured what to resume, and race the start.
  if (!isMusicDriver() || !_active || !game.combat?.started) return;
  await play(trackForActive());
}

async function endCombatMusic() {
  if (!isMusicDriver() || !_active) return;
  _active = false;
  await stopCurrent();
  const resume = _resumeAfter; _resumeAfter = [];
  for (const uuid of resume) {
    try { const s = await fromUuid(uuid); await s?.parent?.playSound(s); } catch (e) { /* best-effort */ }
  }
}

// "Start Combat" from the Combat tab's staging: set the battle track (if the DM picked one), then
// begin the encounter — combatStart fires the music. GM-only (combat.startCombat is GM).
export async function startCombatWithMusic(battleUuid) {
  if (!game.combat) return;
  try { if (battleUuid !== undefined) await game.settings.set(MODULE_ID, "combatBattleTrack", battleUuid || ""); } catch (e) {}
  try { await game.combat.startCombat(); } catch (e) { console.warn(`${MODULE_ID} | startCombat failed`, e); }
}

export function registerCombatMusic() {
  Hooks.on("combatStart", () => serialize(startCombatMusic));
  Hooks.on("updateCombat", (_c, ch) => { if ("turn" in ch || "round" in ch) serialize(updateCombatMusic); });
  Hooks.on("deleteCombat", () => serialize(endCombatMusic));
}
