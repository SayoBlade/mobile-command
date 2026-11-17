/**
 * ── THE MUSIC LAYER (deck-command MUSIC-LAYER.md, built 2026-10-31) ──────────────────────────────
 *
 * A thin layer over Foundry's own Playlists. It decides WHICH playlist should be heard and
 * crossfades to it; Foundry syncs playback to every client (players, the TV), so one driver reaches
 * every speaker. Only the primary GM drives, exactly as combat-music.js always has.
 *
 * Priority (music-core.js `resolveMusic`): cue > manual pick made in this combat > combat >
 * manual pick made outside combat > room > scene default > keep playing.
 *
 * ⚠️ LICENSED AUDIO NEVER SHIPS. This file stores playlist and sound UUIDS, never a path to a file
 * of ours and never audio. Every sound is the DM's own PlaylistSound, pointing into his Data folder.
 *
 * Where each layer comes from:
 *  - CUE: `music.cue(ref)` (a deck cue step `music:`). Plays one sound once, then the layer below
 *    takes over again. A cue with `returns: false` becomes the manual pick instead and holds.
 *  - MANUAL: `music.pick("auto" | "silence" | "battle" | <playlist uuid>)` — the deck's drawer.
 *    Combat start clears every earlier pick; combat end clears any pick made during that fight.
 *  - COMBAT: the active PC's own anthem (combat-music's `combatTheme` flag) on their turn; otherwise
 *    the encounter's battle playlist — a foe's `flags.mobile-command.music.battle`, the boss (a foe
 *    that also names `phase2`) first. When the boss gains dnd5e's own `bloodied` status, the fight
 *    latches into its Phase 2 playlist. No flag anywhere → the world's battle track / playlist.
 *  - ROOM: a "Music" region behaviour. The WHOLE party stands in one scored region for the dwell
 *    time (5 s, a world setting) → that room's playlist. Split party or an unscored room → keep.
 *  - SCENE: the scene's own Playlist field (core already plays it on activation).
 *
 * crossfade() below moves BETWEEN playlists. The overlap section after it moves between two tracks
 * INSIDE one playlist, which core does not do.
 *
 * State shared between GM clients lives in the `musicState` world setting ({manual, cue}), so a
 * press on any GM client is acted on by the driver. The settled room is the driver's memory only.
 */
import { MODULE_ID } from "./preset.js";
import { combatMusicMode, configureForCombat, restoreTouched } from "./combat-music.js";
import { resolveMusic, targetKey, battleFor, manualStillHolds, partyRoom, Dwell, OVERLAP_SETTING, OVERLAP_DEFAULT, overlapApplies, handOffIn, handOffUpdate, isBed, bedStays, bedKind, sceneBattleOf, sceneMusicOf, sceneMusicFlagOf, SCENE_MUSIC_APPROVED, SCENE_MUSIC_WORLD, musicHoldOf, MUSIC_HOLD_FLAG, MUSIC_HOLD_MAX_MS } from "./music-core.js";

export const MUSIC_BEHAVIOR_TYPE = `${MODULE_ID}.music`;
const HOOK = `${MODULE_ID}.music`;
const TICK_MS = 1000;

let _current = null;       // { key, target } — what the layer last made audible
let _layer = "keep";
let _dwell = new Dwell(5000);
let _sceneId = null;
let _lock = Promise.resolve();
let _cueTimer = null;
let _stopping = new Set(); // sound ids WE are stopping, so their playing:false is not read as a cue ending
let _tick = null;
const _ownPlayed = new Set(); // §59: every scene default soundtrack this driver has chosen, so a later scene stops it

const isDriver = () => game.user === game.users.activeGM;
const serialize = (fn) => { const p = _lock.then(fn, fn); _lock = p.catch(() => {}); return p; };
const setting = (k, d = null) => { try { return game.settings.get(MODULE_ID, k) ?? d; } catch { return d; } };
const sync = (uuid) => { try { return uuid ? (foundry.utils.fromUuidSync ?? globalThis.fromUuidSync)(uuid) : null; } catch { return null; } };
const emit = () => { try { Hooks.callAll(HOOK, state()); } catch { /* listeners are someone else's */ } };

export function musicEnabled() { return setting("musicLayer", true) !== false; }

/** Combat music belongs to this layer unless another engine (Ember, vgmusic) drives it. */
export function musicOwnsCombat() {
  if (!musicEnabled()) return false;
  const mode = combatMusicMode();
  return mode !== "ember" && mode !== "vgmusic";
}

function readState() {
  const s = setting("musicState", {}) ?? {};
  return { manual: s.manual ?? null, cue: s.cue ?? null };
}
async function writeState(patch) {
  const next = { ...readState(), ...patch };
  await game.settings.set(MODULE_ID, "musicState", next);
  return next;
}

// ── reading the world into music-core's shapes ────────────────────────────────────────────────────

// The fight on the TABLE's scene, read from the combats themselves (seat R6, 2026-11-12: the Attic fight ran on while the
// DM looked at other cars; back on 12.4 the Music key read the Attic's Dark Ritual, not the fight). `game.combat` is the
// GM's combat tracker's view (Foundry 14 game.mjs: `ui.combat.viewed`), which still shows the car he left when the
// activation's updateScene arrives, and nothing re-applied once it caught up. A started fight on the active scene, else
// a started fight tied to no scene, else the tracker's (a fake world without `game.combats`).
function runningCombat() {
  const all = game.combats ? [...game.combats].filter((c) => c?.started) : null;
  if (!all) return game.combat?.started ? game.combat : null;
  const active = game.scenes?.active?.id ?? null;
  const sceneOf = (c) => c.scene?.id ?? c.scene ?? c._source?.scene ?? null;
  return all.find((c) => active && sceneOf(c) === active) ?? all.find((c) => !sceneOf(c)) ?? null;
}

function defaultBattle() {
  const track = setting("combatBattleTrack", "");
  if (track && sync(track)) return { kind: "sound", uuid: track };
  const pl = setting("combatMusicPlaylist", "");
  if (pl && sync(pl)) return { kind: "playlist", uuid: pl };
  return null;
}

function combatantShapes(combat) {
  return [...(combat?.combatants ?? [])].map((c) => {
    const a = c.actor;
    const m = a?.getFlag?.(MODULE_ID, "music") ?? {};
    return { id: a?.id ?? c.actorId, isPC: a?.type === "character" || Boolean(a?.hasPlayerOwner), battle: m.battle || null, phase2: m.phase2 || null };
  });
}

/** What combat should play right now: the active PC's anthem, else the encounter's battle music. */
function combatTarget(combat) {
  if (!combat || !musicOwnsCombat()) return null;
  const actor = combat.combatant?.actor;
  if (actor?.type === "character") {
    const theme = actor.getFlag(MODULE_ID, "combatTheme");
    if (theme && sync(theme)) return { kind: "sound", uuid: theme, anthem: true };
  }
  const phased = combat.getFlag?.(MODULE_ID, "musicPhased") ?? [];
  // a foe's own battle first, then the scene's (the Crooked House, the Cauldron Room), then the world default
  const own = sceneBattleOf((combat.scene ?? game.scenes?.active)?.flags);
  const b = battleFor(combatantShapes(combat), own && sync(own) ? own : null, phased);
  if (b.uuid && sync(b.uuid)) return { kind: "playlist", uuid: b.uuid };
  return defaultBattle();
}

/** The party as points: player characters on the scene (downed and hidden too), a grouped token once per member. */
export function partyPoints(scene) {
  if (!scene) return [];
  const grid = scene.grid?.size ?? 100;
  const display = setting("displayOwnerUser", "");
  const players = game.users.filter((u) => !u.isGM && u.id !== display);
  const out = [];
  for (const t of scene.tokens ?? []) {
    const a = t.actor;
    if (!a) continue;
    if (t.getFlag?.("item-piles", "data")?.enabled || a.getFlag?.("item-piles", "data")?.enabled) continue;
    const at = { x: t.x + ((t.width ?? 1) * grid) / 2, y: t.y + ((t.height ?? 1) * grid) / 2 };
    if (a.type === "group") {
      const members = a.system?.members ?? [];
      const released = new Set(a.getFlag?.(MODULE_ID, "formation")?.released ?? []);
      const n = members.filter((m) => !released.has(m.actor?.id ?? m.actorId)).length;
      for (let i = 0; i < Math.max(1, n); i++) out.push(at);
      continue;
    }
    if (a.type !== "character") continue;
    if (!players.some((u) => a.testUserPermission?.(u, "OWNER"))) continue;
    out.push(at);
  }
  return out;
}

/** The scene's scored rooms: every enabled Music behaviour that names a playlist. */
export function scoredRooms(scene) {
  const rooms = [];
  for (const region of scene?.regions ?? []) {
    for (const b of region.behaviors ?? []) {
      if (b.type !== MUSIC_BEHAVIOR_TYPE || b.disabled || !b.system?.playlist) continue;
      rooms.push({ id: b.uuid, shapes: region.shapes ?? [], playlist: b.system.playlist, fade: b.system.fade, label: b.system.label || region.name });
    }
  }
  return rooms;
}

function roomTarget(scene) {
  const id = _dwell.settled;
  if (!id) return null;
  const r = scoredRooms(scene).find((x) => x.id === id);
  return r && sync(r.playlist) ? { kind: "playlist", uuid: r.playlist, fade: r.fade } : null;
}

/** The scene's own default soundtrack (§59: his flag, on a map with no rooms), when that playlist exists and has tracks. */
function sceneMusic(scene) {
  if (!scene) return null;
  const uuid = sceneMusicOf({ flags: scene.flags, hasRooms: scoredRooms(scene).length > 0 });
  const pl = uuid ? sync(uuid) : null;
  return pl?.documentName === "Playlist" && !hasNoTracks(pl) ? pl : null;
}

function sceneDefault(scene) {
  // §59: a default he named (a map with no rooms) wins; an environment bed in the Playlist field plays on under it
  const own = sceneMusic(scene);
  if (own) { _ownPlayed.add(own.uuid); return { kind: "playlist", uuid: own.uuid }; }
  if (!scene?.playlist) return null;
  if (scene.playlistSound) return { kind: "sound", uuid: scene.playlistSound.uuid ?? `${scene.playlist.uuid}.PlaylistSound.${scene.playlistSound.id ?? scene.playlistSound}` };
  return { kind: "playlist", uuid: scene.playlist.uuid };
}

function resolveNow() {
  const scene = game.scenes?.active ?? null;
  const combat = runningCombat();
  const { manual, cue } = readState();
  // §59.9: a ride holds the car's music until 2 s after its lamps (the train first, then the light, then the music)
  const held = Boolean(scene && musicHoldOf(scene.flags));
  return resolveMusic({
    cue, manual: manualStillHolds(manual, combat?.id ?? null) ? manual : null,
    combatId: combat?.id ?? null, combatTarget: combatTarget(combat),
    room: held ? null : roomTarget(scene), sceneDefault: held ? null : sceneDefault(scene),
  });
}

// ── playing ───────────────────────────────────────────────────────────────────────────────────────

function alive(t) {
  if (!t) return false;
  if (t.kind === "silence") return true;
  const d = sync(t.uuid);
  return Boolean(d?.playing);
}

/** Every playlist this layer may stop: music it started, flagged music, the scene default, the battle library. */
function musicPlaylists() {
  const set = new Set();
  for (const p of game.playlists ?? []) if (p.getFlag?.(MODULE_ID, "music")) set.add(p);
  const sc = game.scenes?.active?.playlist; if (sc) set.add(sc);
  const own = sceneMusic(game.scenes?.active); if (own) set.add(own);
  for (const u of _ownPlayed) { const p = sync(u); if (p) set.add(p); }
  const lib = sync(setting("combatMusicPlaylist", "")); if (lib) set.add(lib);
  const cur = _current?.target ? sync(_current.target.uuid) : null;
  if (cur) set.add(cur.documentName === "PlaylistSound" ? cur.parent : cur);
  return [...set].filter(Boolean);
}

/** The active scene's own bed (its Playlist field's sound, flagged a bed): { id, kind }, or null. */
function activeBed() {
  const sc = game.scenes?.active;
  const ps = sc?.playlistSound;
  const s = ps && typeof ps === "object" ? ps : sc?.playlist?.sounds?.get?.(ps);
  return s && isBed(s.flags) ? { id: s.id, kind: bedKind(s.flags) } : null;
}

async function stopSoundOf(pl, s) {
  _stopping.add(s.id);
  setTimeout(() => _stopping.delete(s.id), 5000);
  await pl.stopSound(s);
}

/** Crossfade: start the incoming first (fading in over its own fade), THEN stop the rest (fading out over theirs). */
async function crossfade(target) {
  let keep = null;     // the playlist (or sound) that must keep playing
  if (target.kind === "playlist") {
    const pl = sync(target.uuid);
    if (!pl) return false;
    if (Number(target.fade) > 0 && pl.fade !== Number(target.fade)) { try { await pl.update({ fade: Number(target.fade) }); } catch { /* best effort */ } }
    if (!pl.playing) await pl.playAll();
    keep = pl;
  } else if (target.kind === "sound") {
    const s = sync(target.uuid);
    if (!s?.parent) return false;
    if (target.anthem) await configureForCombat(s, { loop: true });
    if (!s.playing) await s.parent.playSound(s);
    keep = s;
  }
  // the floor's ENVIRONMENT bed (the rain) plays on under whatever comes in; only Silence stops it. A MUSIC bed
  // stops under other music, either or (DM 2026-11-09, music-core bedKind), and the scene layer brings it back.
  // ⚠️ ONLY THIS FLOOR'S BED: the four floors share one beds playlist, and the one he left must still stop.
  const here = activeBed();
  const bed = here && bedStays(target, here.kind) ? here.id : null;
  for (const pl of musicPlaylists()) {
    if (!pl.playing) continue;
    if (keep && (keep === pl)) continue;
    for (const s of pl.sounds) {
      if (!s.playing || s === keep) continue;
      if (bed && s.id === bed) continue;
      try { await stopSoundOf(pl, s); } catch (e) { console.warn(`${MODULE_ID} | music: stop failed`, e?.message); }
    }
  }
  return true;
}

// ── the overlap inside a playlist ─────────────────────────────────────────────────────────────────
//
// Ported from deck-command's overlap.js on 2026-11-06 (built and measured there 2026-11-05; DESIGN
// §25.5). DM: "the second track should start several seconds before the first ends leading to less
// silence between tracks". Core 14.370 fades a track out over its last `fade`, and only its end
// starts the next, which fades IN: fade-out, then fade-in, no overlap.
//
// `musicOverlapSeconds` (default 5, 0 = off) before a track ends, the active GM writes the same
// update core's `playNext` writes, with both sounds' `fade` set to the overlap for that one hand-off.
// Foundry syncs it, so every client crossfades. The two fades go back afterwards, so his playlists
// are net unchanged. Only playlists flagged room, battle or mood: cues keep their own hand-off, and
// anything unflagged (ambience beds, his other playlists) is left to core.
//
// ⚠️ ONE-SHOT TIMERS, NOT A POLL. A hidden GM tab throttles timers; Chrome's intensive throttling
// (once a minute) hits CHAINED timers only, so one setTimeout per track keeps ~1 s accuracy in a
// background tab where an interval would drift by a minute.

const _overlapTimers = new Map();    // sound id -> timeout
const _overlapStarted = new Map();   // sound id -> ms timestamp the track began (offset already subtracted)
const _overlapDurations = new Map(); // path -> seconds

const overlapSeconds = () => Number(setting(OVERLAP_SETTING, OVERLAP_DEFAULT)) || 0;

/** The track's length: the loaded AudioSound if this client has one, else the file's metadata. */
async function durationOf(ps) {
  const local = ps.sound?.duration;
  if (Number.isFinite(local) && local > 0) return local;
  if (_overlapDurations.has(ps.path)) return _overlapDurations.get(ps.path);
  const d = await new Promise((resolve) => {
    const a = new Audio(); a.preload = "metadata";
    const done = (v) => { a.src = ""; resolve(v); };
    a.addEventListener("loadedmetadata", () => done(a.duration), { once: true });
    a.addEventListener("error", () => done(NaN), { once: true });
    setTimeout(() => done(NaN), 15000);
    a.src = ps.path;
  });
  if (Number.isFinite(d)) _overlapDurations.set(ps.path, d);
  return d;
}

function clearOverlap(id) { const t = _overlapTimers.get(id); if (t) clearTimeout(t); _overlapTimers.delete(id); }

async function armOverlap(ps) {
  clearOverlap(ps.id);
  if (!isDriver() || !ps.playing || ps.repeat) return;
  const pl = ps.parent;
  if (!overlapApplies(pl, CONST.PLAYLIST_MODES)) return;
  const overlap = overlapSeconds(); if (!(overlap > 0)) return;
  const duration = await durationOf(ps);
  // elapsed: the local sound's clock when it is running here, else the time since we saw it start
  const local = ps.sound?.playing ? ps.sound.currentTime : null;
  const t0 = _overlapStarted.get(ps.id);
  const elapsed = Number.isFinite(local) ? local : (t0 != null ? (Date.now() - t0) / 1000 : null);
  const ms = handOffIn({ duration, elapsed, overlap, repeat: ps.repeat });
  if (ms == null) return;
  _overlapTimers.set(ps.id, setTimeout(() => handOff(ps.parent?.id, ps.id).catch((e) => console.warn(`${MODULE_ID} | overlap:`, e?.message)), ms));
}

async function handOff(playlistId, soundId) {
  _overlapTimers.delete(soundId);
  const pl = game.playlists.get(playlistId); const cur = pl?.sounds.get(soundId);
  if (!isDriver() || !pl?.playing || !cur?.playing) return;
  const following = pl._getNextSound?.(soundId); if (!following) return;
  const ms = Math.round(overlapSeconds() * 1000);
  const plan = handOffUpdate([...pl.sounds].map((s) => ({ id: s.id, fade: s._source?.fade ?? null })), soundId, following.id, ms);
  if (!plan) return;
  await pl.update({ sounds: plan.sounds });
  // his fades back once both ramps are done; a stopped sound and a sound at volume ignore it
  setTimeout(() => { const p = game.playlists.get(playlistId); if (p) p.update({ sounds: plan.restore }).catch(() => {}); }, ms + 1500);
}

function startOverlap() {
  Hooks.on("updatePlaylist", (pl, chg) => {
    for (const s of chg?.sounds ?? []) {
      const ps = pl.sounds.get(s._id); if (!ps) continue;
      if (s.playing === true) { _overlapStarted.set(ps.id, Date.now() - (Number(ps.pausedTime) || 0) * 1000); armOverlap(ps); }
      else if (s.playing === false) { clearOverlap(ps.id); _overlapStarted.delete(ps.id); }
    }
    if (chg?.playing === false) for (const ps of pl.sounds) { clearOverlap(ps.id); _overlapStarted.delete(ps.id); }
  });
  // already playing when this client loaded: only a local clock can say how far in it is
  const sweep = () => { for (const pl of game.playlists.playing) for (const ps of pl.sounds) if (ps.playing && !_overlapTimers.has(ps.id)) armOverlap(ps); };
  setTimeout(sweep, 5000);
  Hooks.on("userConnected", () => setTimeout(sweep, 2000)); // the driving GM may have changed
}

/** For a test from the console: what the overlap thinks of every playing track. */
export function overlapState() {
  return [...game.playlists.playing].flatMap((pl) => [...pl.sounds].filter((s) => s.playing).map((s) => ({
    playlist: pl.name, sound: s.name, applies: overlapApplies(pl, CONST.PLAYLIST_MODES), armed: _overlapTimers.has(s.id),
    elapsed: s.sound?.playing ? s.sound.currentTime : (_overlapStarted.has(s.id) ? (Date.now() - _overlapStarted.get(s.id)) / 1000 : null),
  })));
}

async function applyNow({ silenceIfKeep = false, adoptOnly = false } = {}) {
  if (!isDriver() || !musicEnabled()) return;
  let { layer, target } = resolveNow();
  if (!target && silenceIfKeep) target = { kind: "silence" };
  _layer = layer;
  if (!target) { emit(); return; }
  const key = targetKey(target);
  if (_current?.key === key && alive(target)) { emit(); return; }
  // On load the layer ADOPTS what is already playing and starts nothing: a GM reload must not
  // restart music he stopped by hand. The next real event (a fight, a room, a pick) decides.
  if (adoptOnly) { if (alive(target)) _current = { key, target }; emit(); return; }
  // A cue we already played that has gone quiet has ENDED — never replay it (its end event may be in flight).
  if (layer === "cue" && _current?.key === key) { await endCue(readState().cue?.id); return; }
  const ok = await crossfade(target);
  if (ok) _current = { key, target };
  if (layer === "cue") armCueEnd();
  emit();
}
const apply = (o) => serialize(() => applyNow(o));

// ── cues ──────────────────────────────────────────────────────────────────────────────────────────

/** If Foundry never reports the end (a GM tab whose audio never unlocked), end it by the clock. */
function armCueEnd() {
  clearTimeout(_cueTimer);
  const { cue } = readState();
  const s = cue?.target ? sync(cue.target.uuid) : null;
  if (!s || s.repeat) return;
  const id = cue.id;
  const done = (ms) => { _cueTimer = setTimeout(() => { if (readState().cue?.id === id) endCue(id); }, ms); };
  try {
    const a = new Audio();
    a.preload = "metadata";
    // ⚠️ END IT 2 s EARLY (measured 2026-10-31): waiting for the track's own end left ~5 s of
    // silence before the battle music (the end is noticed late, then the next file loads). Ending
    // the cue just before its last note lets what returns crossfade over the cue's tail instead.
    a.onloadedmetadata = () => done(Math.max(1000, Math.ceil(a.duration * 1000) - 2000));
    a.onerror = () => done(180000);
    a.src = s.path;
  } catch { done(180000); }
}

async function endCue(id) {
  const { cue } = readState();
  if (!cue || (id && cue.id !== id)) return;
  clearTimeout(_cueTimer);
  if (cue.returns === false && cue.then) {
    const combat = runningCombat();
    await writeState({ cue: null, manual: { target: cue.then, combatId: combat?.id ?? null } });
  } else await writeState({ cue: null });
}

/**
 * Play a cue: a PlaylistSound once, or one sound of a Playlist. `returns` (default true): when it
 * ends, the layer below takes over. `returns: false`: switch to the cue's playlist and hold it as
 * the manual pick. GM only. Returns {ok, name} or {ok:false, reason}.
 */
export async function cue(ref, { returns = true } = {}) {
  if (!game.user?.isGM) return { ok: false, reason: "GM only" };
  const doc = sync(typeof ref === "string" ? ref : ref?.uuid);
  if (!doc) return { ok: false, reason: "no such playlist" };
  let sound = doc, pl = null;
  if (doc.documentName === "Playlist") {
    pl = doc;
    const list = doc.sounds.contents;
    if (!list.length) return { ok: false, reason: "empty playlist" };
    sound = list[Math.floor(Math.random() * list.length)];
  }
  if (sound.documentName !== "PlaylistSound") return { ok: false, reason: "not a sound" };
  const id = foundry.utils.randomID();
  await writeState({ cue: { id, target: { kind: "sound", uuid: sound.uuid }, returns: returns !== false, then: pl ? { kind: "playlist", uuid: pl.uuid } : { kind: "sound", uuid: sound.uuid } } });
  return { ok: true, name: sound.name };
}

// ── the deck's verbs ──────────────────────────────────────────────────────────────────────────────

/**
 * §59: write his yes. For each approved scene (all of SCENE_MUSIC_APPROVED, or the ids given) that has no rooms, no
 * music in its Playlist field and no default of his, set `flags.mobile-command.music.default` to the proposal. GM
 * only; The Crooked Moon only. Never over a choice of his. → { ok, set: [names], kept: [names + why] }
 */
export async function adoptSceneMusic(ids = null) {
  if (!game.user?.isGM) return { ok: false, reason: "GM only" };
  if (game.world?.id !== SCENE_MUSIC_WORLD) return { ok: false, reason: "these picks are The Crooked Moon's" };
  const out = { ok: true, set: [], kept: [] };
  for (const [id, plId] of Object.entries(SCENE_MUSIC_APPROVED)) {
    if (ids && !ids.includes(id)) continue;
    const sc = game.scenes.get(id), pl = game.playlists.get(plId);
    if (!sc || !pl) { out.kept.push(`${sc?.name ?? id}: ${sc ? "its playlist is gone" : "no such scene"}`); continue; }
    if (sceneMusicFlagOf(sc.flags)) { out.kept.push(`${sc.name}: has his own`); continue; }
    if (scoredRooms(sc).length) { out.kept.push(`${sc.name}: has rooms`); continue; }
    if (sc.playlist) { out.kept.push(`${sc.name}: has its own playlist`); continue; }
    await sc.setFlag(MODULE_ID, "music", { ...(sc.getFlag(MODULE_ID, "music") ?? {}), default: pl.uuid });
    out.set.push(`${sc.name} → ${pl.name}`);
  }
  if (game.scenes.active && out.set.length) apply();
  return out;
}

/**
 * ⚠️ ONE-SHOT (DM 2026-11-17, his yes to Druskenvald and Wickermoor Hollow): on the primary GM's load, write the approved
 * defaults once (marker `sceneMusicAdopted`), never over a choice of his (adoptSceneMusic's own guards).
 */
export async function adoptApprovedOnce() {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) return null;
  if (game.world?.id !== SCENE_MUSIC_WORLD) return null;
  try {
    if (game.settings.get(MODULE_ID, "sceneMusicAdopted")) return null;
    const out = await adoptSceneMusic();
    if (out?.ok) {
      await game.settings.set(MODULE_ID, "sceneMusicAdopted", true);
      console.log(`${MODULE_ID} | default music: ${out.set.join("; ") || "nothing set"}${out.kept.length ? ` (left as he has them: ${out.kept.join("; ")})` : ""}`);
    }
    return out;
  } catch (e) { console.warn(`${MODULE_ID} | default music`, e); return null; }
}

// ── the ride's hold (§59.9, DM 2026-11-17): *"Music should start 2 seconds after lights go on, so the train sounds
// first, visual than music."* deck-command's Start ride holds the car's music before it activates the dark car and lets
// go 2 s after the lamps. Two things would start it early and both wait: Mobile Command's own layer (resolveNow, held →
// keep) and CORE, which plays the scene's Playlist field on activation on the activating client
// (PlaylistCollection#_onChangeScene). The latter is wrapped: on a held scene it stops the old scene's music as usual and
// starts nothing; the release then runs core's own start on this client, before the hold is lifted (so the layer finds it
// already playing and starts nothing twice).
const _deferredScene = new Set();
const _holdTimers = new Map();
let _coreChangeScene = null;
export function wrapSceneChange() {
  const c = game.playlists;
  if (!c || _coreChangeScene || typeof c._onChangeScene !== "function") return;
  _coreChangeScene = c._onChangeScene;
  c._onChangeScene = function (scene) {
    if (scene && musicHoldOf(scene.flags)) { _deferredScene.add(scene.id); return _coreChangeScene.call(this, null); }
    _deferredScene.clear();
    return _coreChangeScene.call(this, scene);
  };
}
const sceneOf = (ref) => (typeof ref === "string" ? game.scenes?.get(ref) : ref) ?? null;

/** Hold this scene's music (GM; before activating it). Lets go by itself after `ms` (at most 20 s). → { ok, until } */
export async function holdMusic(ref, ms = MUSIC_HOLD_MAX_MS) {
  if (!game.user?.isGM) return { ok: false, reason: "GM only" };
  const sc = sceneOf(ref); if (!sc) return { ok: false, reason: "no such scene" };
  const span = Math.min(Math.max(Number(ms) || 0, 0), MUSIC_HOLD_MAX_MS);
  const until = Date.now() + span;
  await sc.update({ [`flags.${MODULE_ID}.${MUSIC_HOLD_FLAG}`]: { until } });
  clearTimeout(_holdTimers.get(sc.id));
  _holdTimers.set(sc.id, setTimeout(() => releaseMusic(sc.id).catch(() => {}), span + 250));
  return { ok: true, until };
}

/** Let the scene's music start: core's deferred start (on this client), then the hold lifted. → { ok, started } */
export async function releaseMusic(ref) {
  if (!game.user?.isGM) return { ok: false, reason: "GM only" };
  const sc = sceneOf(ref); if (!sc) return { ok: false, reason: "no such scene" };
  clearTimeout(_holdTimers.get(sc.id)); _holdTimers.delete(sc.id);
  let started = false;
  if (_deferredScene.delete(sc.id) && sc.active && _coreChangeScene) {
    try { await _coreChangeScene.call(game.playlists, sc); started = true; } catch (e) { console.warn(`${MODULE_ID} | music hold: core start`, e?.message); }
  }
  if (sc.flags?.[MODULE_ID]?.[MUSIC_HOLD_FLAG]?.until) await sc.update({ [`flags.${MODULE_ID}.${MUSIC_HOLD_FLAG}`]: { until: 0 } });
  return { ok: true, started };
}

/** The four moods: the first four playlists, by sort order, in any playlist folder named "Moods". */
export function moods() {
  const folders = game.folders?.filter?.((f) => f.type === "Playlist" && f.name === "Moods") ?? [];
  const list = game.playlists.filter((p) => folders.some((f) => p.folder?.id === f.id));
  return list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name)).slice(0, 4);
}

/**
 * A playlist with no tracks (SEAT 5, 2026-11-17: deck-command m171 moved "Calm"'s two tracks to Tension and left it
 * empty). Picking it would stop the room's music and start nothing — the music "goes" on a press. true only when the
 * playlist's sounds are known and there are none.
 */
function hasNoTracks(p) {
  const n = p?.sounds?.size ?? p?.sounds?.length;
  return n === 0;
}

/**
 * The DM's pick from the drawer: "auto" clears it; "silence"; "battle" (the fight's music, or the
 * world's battle music outside a fight); or a playlist uuid (a mood). GM only.
 */
export async function pick(what) {
  if (!game.user?.isGM) return { ok: false, reason: "GM only" };
  const combat = runningCombat();
  if (what === "auto" || !what) { await writeState({ manual: null }); return { ok: true }; }
  let target = null;
  if (what === "silence") target = { kind: "silence" };
  else if (what === "battle") target = combatTarget(combat) ?? defaultBattle();
  else {
    // ⚠️ ONLY A MOOD OR A ROOM OF THIS SCENE (DM 2026-10-31: "rooms only"). The drawer never offers
    // another scene's music, so a pick naming one is refused rather than played.
    const p = sync(what);
    const isMood = moods().some((m) => m.uuid === p?.uuid);
    const isRoom = scoredRooms(game.scenes?.active).some((r) => r.playlist === p?.uuid);
    if (p?.documentName === "Playlist" && (isMood || isRoom)) {
      if (hasNoTracks(p)) return { ok: false, reason: `${String(p.name ?? "").replace(/^(Room|Mood)\s·\s/, "")} has no tracks` };
      target = { kind: "playlist", uuid: p.uuid }; what = isRoom && !isMood ? "room" : "mood";
    }
  }
  if (!target) return { ok: false, reason: what === "battle" ? "No battle music set" : "Not a mood or a room here" };
  if (target.anthem) { const b = battleFor(combatantShapes(combat), null, combat?.getFlag?.(MODULE_ID, "musicPhased") ?? []); target = b.uuid ? { kind: "playlist", uuid: b.uuid } : defaultBattle(); }
  await writeState({ manual: { target, combatId: combat?.id ?? null, what } });
  return { ok: true };
}

/** Tap: the next track of whatever playlist is playing (core playNext). */
export async function next() {
  if (!game.user?.isGM) return { ok: false, reason: "GM only" };
  const cur = _current?.target?.kind === "playlist" ? sync(_current.target.uuid) : null;
  const MODES = [CONST.PLAYLIST_MODES.SEQUENTIAL, CONST.PLAYLIST_MODES.SHUFFLE];
  const pl = (cur?.playing && MODES.includes(cur.mode)) ? cur
    : musicPlaylists().find((p) => p.playing && MODES.includes(p.mode))
    ?? game.playlists.find((p) => p.playing && MODES.includes(p.mode));
  if (!pl) return { ok: false, reason: "Nothing to skip" };
  await pl.playNext();
  return { ok: true, name: pl.sounds.find((s) => s.playing)?.name ?? pl.name };
}

/** What is audible, by name: the layer's own target, else any flagged music playing. */
function nowPlaying() {
  const t = _current?.target;
  if (t?.kind === "silence" && _layer !== "keep") return { name: "Silence", uuid: null };
  const d = t ? sync(t.uuid) : null;
  // a bed says which kind it is, so a surface can tell the Attic's Dark Ritual (music: it IS the music while it plays,
  // DM 2026-11-09 either-or) from the first floor's rain (environment, never "now playing", DM 2026-11-06) — seat R6
  if (d?.playing) return { name: d.name, uuid: d.uuid, bed: d.documentName === "PlaylistSound" && isBed(d.flags) ? bedKind(d.flags) : null };
  const p = musicPlaylists().find((x) => x.playing) ?? game.playlists?.find?.((x) => x.playing && x.channel === "music");
  return p ? { name: p.name, uuid: p.uuid } : { name: "", uuid: null };
}

/** Everything a surface needs to draw the Music key and its drawer. */
export function state() {
  const { manual, cue: c } = readState();
  const combat = runningCombat();
  const holds = manualStillHolds(manual, combat?.id ?? null) ? manual : null;
  const now = nowPlaying();
  const roomsHere = scoredRooms(game.scenes?.active ?? null);
  const strip = (n) => String(n ?? "").replace(/^(Room|Fight|Cue|Mood)\s·\s/, "");
  return {
    enabled: musicEnabled(),
    layer: _layer,
    now: strip(now.name), nowUuid: now.uuid, nowBed: now.bed ?? null,
    auto: !holds,
    manual: holds ? (["silence", "battle", "room"].includes(holds.what) ? holds.what : "mood") : null,
    manualUuid: holds?.target?.uuid ?? null,
    cue: Boolean(c),
    inCombat: Boolean(combat),
    moods: moods().map((p) => ({ uuid: p.uuid, name: strip(p.name), current: holds?.target?.uuid === p.uuid, empty: hasNoTracks(p) })),
    battle: Boolean(combatTarget(combat) ?? defaultBattle()),
    // THIS SCENE'S scored rooms only — never another scene's (DM 2026-10-31). Empty on a scene with
    // no Music regions (every train car), so a surface offers no room choices there at all.
    rooms: roomsHere.map((r) => ({ uuid: r.id, name: r.label, playlist: r.playlist, box: shapesBox(r.shapes),
      current: holds ? holds.target?.uuid === r.playlist : _dwell.settled === r.id })),
    nowRoom: roomsHere.find((r) => r.id === _dwell.settled && r.playlist === now.uuid)?.id
      ?? roomsHere.find((r) => r.playlist === now.uuid)?.id ?? null,
  };
}

/** A region's bounding box from its shapes (plain data: a surface can crop the map to the room). */
function shapesBox(shapes = []) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const sh of shapes) {
    if (sh.hole) continue;
    if (sh.type === "rectangle") { grow(sh.x, sh.y); grow(sh.x + sh.width, sh.y + sh.height); }
    else if (sh.type === "circle") { grow(sh.x - sh.radius, sh.y - sh.radius); grow(sh.x + sh.radius, sh.y + sh.radius); }
    else if (sh.type === "ellipse") { grow(sh.x - sh.radiusX, sh.y - sh.radiusY); grow(sh.x + sh.radiusX, sh.y + sh.radiusY); }
    else if (sh.type === "polygon") for (let i = 0; i + 1 < (sh.points?.length ?? 0); i += 2) grow(sh.points[i], sh.points[i + 1]);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** Which scored room of the active scene holds this point (a surface matching its own pins). */
export function roomOf(x, y) {
  const rooms = scoredRooms(game.scenes?.active ?? null);
  return rooms.find((r) => partyRoom([{ x, y }], [r]))?.id ?? null;
}

// ── rooms: the 5-second rule ──────────────────────────────────────────────────────────────────────

/** One look at where the party stands. Exported (as roomTick) so the test can drive the clock. */
export function roomTick(now = Date.now()) {
  if (!isDriver() || !musicEnabled()) return null;
  const scene = game.scenes?.active ?? null;
  if (scene?.id !== _sceneId) { _sceneId = scene?.id ?? null; _dwell.reset(); }
  const rooms = scoredRooms(scene);
  if (!rooms.length) return null;
  _dwell.ms = Math.max(0, Number(setting("musicDwellSeconds", 5)) || 0) * 1000;
  const before = _dwell.settled;
  _dwell.tick(partyRoom(partyPoints(scene), rooms), now);
  if (_dwell.settled !== before) apply();
  return _dwell.settled;
}
const tick = () => roomTick();

/** Combat end: the party's room as it is NOW, without waiting out the dwell. */
function settleRoomNow() {
  const scene = game.scenes?.active ?? null;
  const here = partyRoom(partyPoints(scene), scoredRooms(scene));
  if (here) { _dwell.settled = here; _dwell.pending = here; }
}

// ── phase 2 ───────────────────────────────────────────────────────────────────────────────────────

async function checkPhase() {
  const combat = runningCombat();
  if (!combat || !isDriver() || !musicOwnsCombat()) return;
  const phased = combat.getFlag(MODULE_ID, "musicPhased") ?? [];
  const add = [];
  for (const c of combat.combatants) {
    const a = c.actor;
    const m = a?.getFlag?.(MODULE_ID, "music");
    if (!m?.phase2 || phased.includes(a.id) || add.includes(a.id)) continue;
    if (a.statuses?.has?.("bloodied")) add.push(a.id);
  }
  if (!add.length) return;
  await combat.setFlag(MODULE_ID, "musicPhased", [...phased, ...add]);
  await applyNow();
}

// ── registration ──────────────────────────────────────────────────────────────────────────────────

function buildBehaviorType() {
  const F = foundry.data.fields;
  return class MusicRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
    static LOCALIZATION_PREFIXES = ["MOBILECOMMAND.BEHAVIORS.MUSIC"];
    static defineSchema() {
      return {
        playlist: new F.DocumentUUIDField({ type: "Playlist", required: false, nullable: true, initial: null }),
        fade: new F.NumberField({ required: false, nullable: true, initial: null, min: 0, step: 100, integer: true }),
        label: new F.StringField({ required: false, blank: true, initial: "" }),
      };
    }
    // No events: the driver polls where the party stands (the 5-second whole-party rule needs the
    // whole party, which no single token's event can answer).
    async _handleRegionEvent() {}
  };
}

/** init: the "Music" behaviour in Foundry's region menu and the layer's settings, on every client. */
export function registerMusicBehavior() {
  try {
    game.settings.register(MODULE_ID, "musicLayer", {
      name: "Music follows the table",
      hint: "Rooms with a Music region, the fight's battle music, Phase 2 and cues crossfade on their own. Off: only the older combat music runs.",
      scope: "world", config: true, type: Boolean, default: true, onChange: () => apply(),
    });
    game.settings.register(MODULE_ID, "musicDwellSeconds", {
      name: "Room music: seconds the whole party must stay",
      hint: "How long every player character has to stand in a room with music before it switches.",
      scope: "world", config: true, type: Number, default: 5, range: { min: 0, max: 30, step: 1 },
    });
    game.settings.register(MODULE_ID, OVERLAP_SETTING, {
      name: "Music: overlap between tracks (seconds)",
      hint: "In room, fight and mood playlists the next track starts this many seconds before the current one ends, the two crossfading. 0 = off (Foundry's own fade-out, then fade-in).",
      scope: "world", config: true, type: Number, default: OVERLAP_DEFAULT, range: { min: 0, max: 15, step: 1 },
    });
    // {manual, cue} — shared so a press on any GM client is acted on by the driver.
    game.settings.register(MODULE_ID, "musicState", { scope: "world", config: false, type: Object, default: {}, onChange: () => apply() });
  } catch (e) { console.error(`${MODULE_ID} | music settings`, e); }
  try {
    CONFIG.RegionBehavior.dataModels[MUSIC_BEHAVIOR_TYPE] = buildBehaviorType();
    CONFIG.RegionBehavior.typeIcons[MUSIC_BEHAVIOR_TYPE] = "fa-solid fa-music";
  } catch (e) { console.error(`${MODULE_ID} | could not register the Music region behaviour`, e); }
}

/** ready: hooks and the room clock. The driver acts; every other client only answers state(). */
export function registerMusic() {
  Hooks.on("combatStart", (combat) => serialize(async () => {
    if (!isDriver() || !musicEnabled()) return;
    const { manual } = readState();
    if (manual) await writeState({ manual: null }); // combat clears every earlier pick
    await applyNow();
  }));
  Hooks.on("updateCombat", (_c, ch) => { if ("turn" in ch || "round" in ch || "active" in ch) apply(); });
  Hooks.on("deleteCombat", (combat) => serialize(async () => {
    if (!isDriver() || !musicEnabled()) return;
    const { manual } = readState();
    if (manual?.combatId) await writeState({ manual: null }); // a pick made in that fight ends with it
    settleRoomNow();
    await applyNow({ silenceIfKeep: musicOwnsCombat() && _layer !== "keep" });
    await restoreTouched();
  }));
  for (const h of ["updateActor", "createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) Hooks.on(h, () => serialize(checkPhase));
  // A cue ends when its sound stops and we did not stop it.
  const cueEnded = (soundId) => {
    const { cue: c } = readState();
    if (!c || _stopping.has(soundId)) return;
    const s = sync(c.target?.uuid);
    if (s?.id === soundId && isDriver()) serialize(() => endCue(c.id));
  };
  Hooks.on("updatePlaylist", (_p, ch) => { if (Array.isArray(ch.sounds)) for (const s of ch.sounds) if (s.playing === false) cueEnded(s._id); });
  Hooks.on("updatePlaylistSound", (doc, ch) => { if (ch.playing === false) cueEnded(doc.id); });
  Hooks.on("updateScene", (scene, ch) => { if (ch.active && isDriver()) { _dwell.reset(); _sceneId = scene.id; _current = null; apply(); } });
  // §59.9: a hold set or let go on the table's scene; and the safety, if it only runs out
  Hooks.on("updateScene", (scene, ch) => {
    if (!isDriver() || !scene.active || !(ch?.flags?.[MODULE_ID] && MUSIC_HOLD_FLAG in ch.flags[MODULE_ID])) return;
    apply();
    const until = musicHoldOf(scene.flags);
    if (until) setTimeout(() => apply(), until - Date.now() + 100);
  });
  wrapSceneChange();
  clearInterval(_tick);
  _tick = setInterval(tick, TICK_MS);
  apply({ adoptOnly: true });
  try { startOverlap(); } catch (e) { console.warn(`${MODULE_ID} | overlap:`, e?.message); } // every client listens; only the active GM writes
}
