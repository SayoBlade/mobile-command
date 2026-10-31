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
 * State shared between GM clients lives in the `musicState` world setting ({manual, cue}), so a
 * press on any GM client is acted on by the driver. The settled room is the driver's memory only.
 */
import { MODULE_ID } from "./preset.js";
import { combatMusicMode, configureForCombat, restoreTouched } from "./combat-music.js";
import { resolveMusic, targetKey, battleFor, manualStillHolds, partyRoom, Dwell } from "./music-core.js";

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

const runningCombat = () => (game.combat?.started ? game.combat : null);

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
  const b = battleFor(combatantShapes(combat), null, phased);
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

function sceneDefault(scene) {
  if (!scene?.playlist) return null;
  if (scene.playlistSound) return { kind: "sound", uuid: scene.playlistSound.uuid ?? `${scene.playlist.uuid}.PlaylistSound.${scene.playlistSound.id ?? scene.playlistSound}` };
  return { kind: "playlist", uuid: scene.playlist.uuid };
}

function resolveNow() {
  const scene = game.scenes?.active ?? null;
  const combat = runningCombat();
  const { manual, cue } = readState();
  return resolveMusic({
    cue, manual: manualStillHolds(manual, combat?.id ?? null) ? manual : null,
    combatId: combat?.id ?? null, combatTarget: combatTarget(combat),
    room: roomTarget(scene), sceneDefault: sceneDefault(scene),
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
  const lib = sync(setting("combatMusicPlaylist", "")); if (lib) set.add(lib);
  const cur = _current?.target ? sync(_current.target.uuid) : null;
  if (cur) set.add(cur.documentName === "PlaylistSound" ? cur.parent : cur);
  return [...set].filter(Boolean);
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
  for (const pl of musicPlaylists()) {
    if (!pl.playing) continue;
    if (keep && (keep === pl)) continue;
    for (const s of pl.sounds) {
      if (!s.playing || s === keep) continue;
      try { await stopSoundOf(pl, s); } catch (e) { console.warn(`${MODULE_ID} | music: stop failed`, e?.message); }
    }
  }
  return true;
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

/** The four moods: the first four playlists, by sort order, in any playlist folder named "Moods". */
export function moods() {
  const folders = game.folders?.filter?.((f) => f.type === "Playlist" && f.name === "Moods") ?? [];
  const list = game.playlists.filter((p) => folders.some((f) => p.folder?.id === f.id));
  return list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name)).slice(0, 4);
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
  else { const p = sync(what); if (p?.documentName === "Playlist") target = { kind: "playlist", uuid: p.uuid }; }
  if (!target) return { ok: false, reason: what === "battle" ? "No battle music set" : "No such playlist" };
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
  if (d?.playing) return { name: d.documentName === "PlaylistSound" ? d.name : d.name, uuid: d.uuid };
  const p = musicPlaylists().find((x) => x.playing) ?? game.playlists?.find?.((x) => x.playing && x.channel === "music");
  return p ? { name: p.name, uuid: p.uuid } : { name: "", uuid: null };
}

/** Everything a surface needs to draw the Music key and its drawer. */
export function state() {
  const { manual, cue: c } = readState();
  const combat = runningCombat();
  const holds = manualStillHolds(manual, combat?.id ?? null) ? manual : null;
  const now = nowPlaying();
  const strip = (n) => String(n ?? "").replace(/^(Room|Fight|Cue|Mood)\s·\s/, "");
  return {
    enabled: musicEnabled(),
    layer: _layer,
    now: strip(now.name), nowUuid: now.uuid,
    auto: !holds,
    manual: holds ? (["silence", "battle"].includes(holds.what) ? holds.what : "mood") : null,
    manualUuid: holds?.target?.uuid ?? null,
    cue: Boolean(c),
    inCombat: Boolean(combat),
    moods: moods().map((p) => ({ uuid: p.uuid, name: strip(p.name), current: holds?.target?.uuid === p.uuid })),
    battle: Boolean(combatTarget(combat) ?? defaultBattle()),
  };
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
  clearInterval(_tick);
  _tick = setInterval(tick, TICK_MS);
  apply({ adoptOnly: true });
}
