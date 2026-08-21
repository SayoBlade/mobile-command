// Combat music (DESIGN §25.2, DM 2026-07-25). Per-PC combat THEMES + a BATTLE track for foe turns.
//
// The model: on combat start we remember whatever is playing, pause it, and take over. Each turn we
// play the active combatant's track — a character's own theme (a PlaylistSound) if they have one,
// otherwise the battle track (a Playlist) for foes and theme-less PCs. A PC's anthem is forced to
// LOOP for the length of their turn (so it never auto-advances to the next playlist sound), and
// switches CROSSFADE (start the incoming track, then fade out the old) rather than hard-cutting. On
// combat end we stop the combat music and resume what was playing before — or, if nothing was, end
// on silence. Each track restarts from 0 (no resume-from-position); that's an accepted MVP limit.
//
// Driven on the PRIMARY GM only — playlist writes are GM-only, and Foundry syncs playlist state to
// every client (including the TV) on its own, so one driver reaches all speakers. A player client or
// a non-primary GM silently no-ops.
//
// Storage: a PC's theme is `actor.flags.mobile-command.combatTheme` = a PlaylistSound uuid (set by
// drag-drop in Settings → Sound). The battle track is the `combatBattleTrack` world setting = a
// PlaylistSound uuid — ONE file, looped (DM 2026-07-25) — chosen in the Combat tab's pre-start
// staging from the `combatMusicPlaylist` (set in mod settings / the onboarding wizard).

import { MODULE_ID } from "./preset.js";
import { isEmberWorld } from "./campaigns.js";

let _combatPlaying = null; // the Playlist or PlaylistSound combat music is currently playing (to stop on switch)
let _resumeAfter = [];     // PlaylistSound uuids that were playing BEFORE combat, to resume when it ends
let _active = false;       // combat music is running (set by start, cleared by end)
let _lock = Promise.resolve(); // serialize ops — startCombat fires combatStart AND updateCombat, which
                               // otherwise interleave and leak the battle track onto a themed PC's turn.
let _touched = new Map();   // uuid -> {repeat, fade} of docs we reconfigured, restored on combat end.

// Crossfade duration for combat switches. Setting a fade on the tracks (and overlapping the new
// track's fade-in with the old's fade-out, below) turns the abrupt cut — an audible pop/beep the DM
// heard — into a smooth crossfade, and hides the audio-load delay behind the fade (DM 2026-07-25).
const CROSSFADE_MS = 500;

function isMusicDriver() { return game.user === game.users.activeGM; }

// Run `fn` after any in-flight music op finishes, so the hooks never race each other.
function serialize(fn) { const p = _lock.then(fn, fn); _lock = p.catch(() => {}); return p; }

function battleTrackUuid() {
  try { return game.settings.get(MODULE_ID, "combatBattleTrack") || ""; } catch (e) { return ""; }
}

/** Who drives combat music in this world (§50.3). "ember": the Ember campaign module runs its
 *  own themed combat soundscapes AND treats its channels' `playing` flags as GM master switches
 *  it never re-asserts — our takeover would leave the whole combat DEAD SILENT, so we stand
 *  down entirely ("let ember control music", DM 2026-08-21). "unconfigured": no battle track
 *  and no PC has an anthem — there is nothing to play, so taking over would only pause the
 *  room's ambience for silence (this bit EVERY unconfigured world, not just Ember's).
 *  "ours": the takeover model as designed. Exported for the panel's staging row and tests. */
export function combatMusicMode() {
  if (isEmberWorld()) return "ember";
  const anyTheme = (() => {
    try { return game.actors.some((a) => a.type === "character" && a.getFlag(MODULE_ID, "combatTheme")); }
    catch (e) { return false; }
  })();
  if (!battleTrackUuid() && !anyTheme) return "unconfigured";
  return "ours";
}

// Reconfigure a combat track before playing it: a PC anthem must LOOP (DM 2026-07-25: "player's
// anthems should loop, not switch to the next track") — otherwise a non-repeating sound in a
// sequential playlist ends mid-turn and Foundry auto-advances to the next sound, which then plays
// over the battle track on the following NPC turn (the "battle music doesn't return" bug). We also
// give every combat track a fade so switches crossfade. Prior values are remembered per uuid and
// restored when combat ends, so we never permanently rewrite the DM's playlist config.
// The touched map is MIRRORED into a world setting: it used to be memory-only, so a mid-combat
// reload of the DM client forgot what was changed and restoreTouched silently restored nothing —
// tracks stayed repeat=true forever (found on the bench 2026-07-26). Best-effort writes; the
// world setting is registered in settings.js (combatMusicTouched).
function persistTouched() {
  try { game.settings.set(MODULE_ID, "combatMusicTouched", Object.fromEntries(_touched)); } catch (e) { /* pre-ready */ }
}

async function configureForCombat(doc, { loop }) {
  if (!doc) return;
  const upd = {};
  if (loop && "repeat" in doc && !doc.repeat) upd.repeat = true;
  if ("fade" in doc && (doc.fade ?? 0) < CROSSFADE_MS) upd.fade = CROSSFADE_MS;
  if (!Object.keys(upd).length) return;
  if (!_touched.has(doc.uuid)) { _touched.set(doc.uuid, { repeat: doc.repeat, fade: doc.fade }); persistTouched(); }
  try { await doc.update(upd); } catch (e) { /* best-effort */ }
}

// Put back the repeat/fade we changed on every track we touched this combat — including
// what a PREVIOUS (pre-reload) session recorded in the world setting.
async function restoreTouched() {
  const touched = _touched; _touched = new Map();
  try {
    const persisted = game.settings.get(MODULE_ID, "combatMusicTouched") ?? {};
    for (const [uuid, prior] of Object.entries(persisted)) if (!touched.has(uuid)) touched.set(uuid, prior);
  } catch (e) { /* setting unregistered */ }
  for (const [uuid, prior] of touched) {
    try {
      const doc = await fromUuid(uuid);
      if (doc) await doc.update({ repeat: prior.repeat, fade: prior.fade });
    } catch (e) { /* best-effort */ }
  }
  persistTouched(); // now empty
}

// The track for the active combatant: a character's own theme, else the battle track (a looped file).
function trackForActive() {
  const actor = game.combat?.combatant?.actor;
  if (actor?.type === "character") {
    const t = actor.getFlag(MODULE_ID, "combatTheme");
    if (t) return t;
  }
  return battleTrackUuid();
}

async function stopDoc(doc) {
  if (!doc) return;
  try {
    if (doc.documentName === "Playlist") await doc.stopAll();
    else if (doc.documentName === "PlaylistSound") await doc.parent?.stopSound(doc);
  } catch (e) { console.warn(`${MODULE_ID} | combat music stop failed`, e); }
}

async function stopCurrent() {
  const cur = _combatPlaying;
  _combatPlaying = null;
  await stopDoc(cur);
}

// Switch to `uuid` (a Playlist plays all its sounds; a PlaylistSound plays that one track). Same uuid
// as the current track → nothing to do (don't restart). To crossfade instead of hard-cutting, we
// START the new track first (fading in over its fade), THEN fade out the old — the two overlap, so
// the switch is smooth and the new track's load latency hides behind the fade.
async function play(uuid) {
  if (!uuid) { await stopCurrent(); return; }
  // Same track → leave it running — but only if it IS running. If the audio layer dropped it
  // (a non-looping file ran out, a load error, anything), the old early-return pinned the dead
  // track and every later turn on the same uuid stayed SILENT (DM 2026-07-26: "anthem stops
  // and then ends completely into silence"). A dead current track replays instead.
  if (_combatPlaying && _combatPlaying.uuid === uuid) {
    const alive = _combatPlaying.documentName === "Playlist" ? _combatPlaying.playing : !!_combatPlaying.playing;
    if (alive) return;
    _combatPlaying = null; // fall through and start it fresh
  }
  let doc = null;
  try { doc = await fromUuid(uuid); } catch (e) { /* stale uuid */ }
  if (!doc) { await stopCurrent(); return; }
  const prev = _combatPlaying;
  _combatPlaying = doc;
  try {
    if (doc.documentName === "Playlist") {
      await configureForCombat(doc, { loop: false }); // a Playlist loops via its own mode; just fade it
      await doc.playAll();
    } else if (doc.documentName === "PlaylistSound") {
      await configureForCombat(doc, { loop: true }); // a PC anthem must loop for the whole turn
      await doc.parent?.playSound(doc);
    }
  } catch (e) { console.warn(`${MODULE_ID} | combat music play failed`, e); }
  await stopDoc(prev); // fade out the outgoing track after the incoming one is under way
}

async function startCombatMusic() {
  if (!isMusicDriver() || !game.combat || _active) return;
  if (combatMusicMode() !== "ours") return; // §50.3: Ember's world, or nothing configured — don't touch the room's audio
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
  // Resume whatever was playing before combat; if nothing was, this loop is empty and we simply end
  // on silence — "return the music played before combat, or end the battle music if none" (DM
  // 2026-07-25). endCombatMusic already stopped the battle track above, so that half is automatic.
  const resume = _resumeAfter; _resumeAfter = [];
  for (const uuid of resume) {
    try { const s = await fromUuid(uuid); await s?.parent?.playSound(s); } catch (e) { /* best-effort */ }
  }
  await restoreTouched(); // put back the repeat/fade we changed on combat tracks
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
  // Self-heal: if the track WE are supposed to be playing stops and we didn't stop it
  // (stopCurrent nulls _combatPlaying first, so "still ours + playing:false" = not us —
  // the file ended un-looped, failed to load, someone clicked the playlist…), put the
  // right track back on. This is the safety net under the play() liveness check above.
  // Playback state rides the PARENT playlist update as an embedded `sounds` delta when it
  // comes through Foundry's own UI (verified live, 14.363) — but a DIRECT API write to the
  // embedded PlaylistSound (another module, a macro) fires updatePlaylistSound INSTEAD, so
  // both doors are watched (§28.5.6 watch-note, hardened 2026-08-21). Both funnel into the
  // same serialized heal; a second event for the same stop finds _combatPlaying already
  // null (or re-pointed) and drops out.
  const oursNow = (id) => {
    const cur = _combatPlaying;
    return !!cur && (cur.documentName === "PlaylistSound" ? id === cur.id : !!cur.sounds?.has?.(id));
  };
  const heal = () => serialize(() => { _combatPlaying = null; return play(trackForActive()); });
  Hooks.on("updatePlaylist", (doc, ch) => {
    if (!isMusicDriver() || !_active || !Array.isArray(ch.sounds)) return;
    if (ch.sounds.some(s => s.playing === false && oursNow(s._id))) heal(); // one heal per event, as before
  });
  Hooks.on("updatePlaylistSound", (doc, ch) => {
    if (!isMusicDriver() || !_active || ch.playing !== false) return;
    if (oursNow(doc.id)) heal();
  });
  // Reload resilience: this module state is per-client memory — a mid-combat reload of the
  // DM client forgot _active, so turn changes stopped driving music entirely (and combat
  // end couldn't clean up). registerCombatMusic runs INSIDE the ready hook (main.js), so
  // re-arm directly — a Hooks.once("ready") here would register after ready and never fire.
  // (_resumeAfter is gone for good on a reload — the pre-combat ambience won't auto-resume
  // after combat; an accepted cost of reloading.)
  if (isMusicDriver() && game.combat?.started && combatMusicMode() === "ours") {
    serialize(async () => {
      if (_active) return;
      _active = true;
      await play(trackForActive());
    });
  }
}
