/**
 * SOUND SCENES: SYRINSCAPE, OR TODAY'S LOCAL FILES (deck-command SOUND-PLAN-2026-11-16 §2.5/§2.7, D-0116; DM 2026-11-16
 * "I approve the plan, let's go").
 *
 * A Syrinscape entry is an ordinary PlaylistSound carrying `flags.syrinscape-control.{soundType,soundId}`; the module's
 * PlaylistSound class makes its Sound a `SyrinscapeSound` that tells Syrinscape to play the mood. Both rules here sit at
 * that one seam, `PlaylistSound#_createSound`, so they hold for every way a sound is played: a deck key, the music
 * layer, a room, the sidebar.
 *
 * 1. LOCAL: while sound scenes are Local (his switch), or Syrinscape is OFFLINE (the primary GM's watcher, below), or
 *    the module is not active, a Syrinscape entry plays its LOCAL FALLBACK instead: `flags.mobile-command.localFallback`,
 *    the uuid of the PlaylistSound it stands in for (today's file), at THAT sound's own volume. An entry with no fallback
 *    is silent, as it would be offline anyway.
 *    ⚠️ DECIDED FOR THE WHOLE TABLE, NEVER PER SCREEN: Syrinscape plays in ONE shared room (the module puts every client
 *    in his account's session), so any client that sends "play" plays it on every screen. A per-client choice would
 *    leave a Local screen hearing the Syrinscape mood anyway. Hence a world setting, written by the primary GM.
 * 2. STOP AT THE FADE'S START: Syrinscape ignores Foundry's gain ramp, so a fade-out was N seconds of the mood at full
 *    level and then a cut. A Syrinscape Sound now stops at once; the sound coming in carries the overlap.
 *
 * Offline = the module's web-player socket is not "Active" (its states: Connecting · Active · Idle · Error, read from
 * the installed lib/player.js 2026-11-16) for 30 s after this GM client's audio unlocked. A missing token never gets
 * there either. Back online flips it back. Each flip is said once, as a toast on his screen.
 */
import { MODULE_ID } from "./preset.js";
import { notifier } from "./notifier.js";
import { mixNow, masterNow, slidersNow, syrinscapeNodes, syrLocalOf } from "./sound-mix.js";

export const SYR = "syrinscape-control";
export const OFFLINE_AFTER_MS = 30000;
export const POLL_MS = 5000;

/** Is this PlaylistSound (document or plain data) a Syrinscape entry? */
export function isSyrinscapeEntry(doc) {
  const f = doc?.flags?.[SYR] ?? doc?._source?.flags?.[SYR];
  return Boolean(f?.soundType && f?.soundId);
}

/** Do Syrinscape entries play their local fallback right now? Pure. */
export function scenesLocal({ mode, offline, moduleActive }) {
  return mode === "local" || offline === true || moduleActive === false;
}

/** The fallback a Syrinscape entry stands in for: { path, volume } of that sound, or null. `lookup(uuid)` → a sound. */
export function fallbackOf(doc, lookup) {
  const ref = doc?.flags?.[MODULE_ID]?.localFallback;
  if (!ref) return null;
  const s = typeof ref === "string" ? lookup?.(ref) : ref;
  const path = s?.path ?? s?._source?.path ?? null;
  if (!path) return null;
  const v = Number(s?.volume ?? s?._source?.volume);
  return { path, volume: Number.isFinite(v) ? v : 0.5, name: s?.name ?? null };
}

/**
 * The offline watcher's next state. Pure: `{ state, since, offline }` + now → { offline, since, flip }.
 * `state` is the socket state ("Active" = online), `since` when it was last seen Active (or audio unlocked).
 */
export function nextOffline({ state, since, offline, now }) {
  if (state === "Active") return { offline: false, since: now, flip: offline === true ? "online" : null };
  if (offline === true) return { offline: true, since, flip: null };
  if (now - since >= OFFLINE_AFTER_MS) return { offline: true, since, flip: "offline" };
  return { offline: Boolean(offline), since, flip: null };
}

const moduleActive = () => Boolean(game.modules?.get?.(SYR)?.active);
const setting = (k, d) => { try { return game.settings.get(MODULE_ID, k); } catch (e) { return d; } };
export function localNow() {
  return scenesLocal({ mode: setting("soundScenes", "syrinscape"), offline: setting("syrinscapeOffline", false), moduleActive: moduleActive() });
}

/** The state the deck draws: { mode, offline, local, module } */
export function soundScenesState() {
  return { mode: setting("soundScenes", "syrinscape"), offline: Boolean(setting("syrinscapeOffline", false)), local: localNow(), module: moduleActive() };
}

/** His switch (GM only): "syrinscape" | "local", or toggle with no argument. */
export async function setSoundScenes(mode) {
  if (!game.user?.isGM) return { ok: false, reason: "GM only" };
  const now = setting("soundScenes", "syrinscape");
  const next = mode ?? (now === "local" ? "syrinscape" : "local");
  if (next !== "syrinscape" && next !== "local") return { ok: false, reason: `no mode ${next}` };
  if (next !== now) await game.settings.set(MODULE_ID, "soundScenes", next);
  return { ok: true, mode: next };
}

/** A fallback Sound that plays at the fallback's own level, whatever volume Foundry asks the entry for. */
function makeFallbackSound(doc, fb) {
  const sound = game.audio.create({ src: fb.path, context: doc.context, singleton: false });
  sound.addEventListener("play", doc._onStart.bind(doc));
  sound.addEventListener("end", doc._onEnd.bind(doc));
  sound.addEventListener("stop", doc._onStop.bind(doc));
  // the level it plays at: the mix's set level for it (sound-mix.js routeSound sets mcSetLevel), else the twin's own
  const lv = (v) => (Number(v) > 0 ? (sound.mcSetLevel ?? fb.volume) : 0);
  const load = sound.load.bind(sound);
  sound.load = (o = {}) => load(o?.autoplayOptions ? { ...o, autoplayOptions: { ...o.autoplayOptions, volume: lv(o.autoplayOptions.volume ?? 1) } } : o);
  const fade = sound.fade.bind(sound);
  sound.fade = (v, o) => fade(lv(v), o);
  sound.mcLocalFallback = fb.path;
  return sound;
}

/** Every client: patch the one seam. Idempotent. */
export function patchPlaylistSound() {
  const C = CONFIG.PlaylistSound?.documentClass;
  const proto = C?.prototype;
  if (!proto || proto.__mcSyrinscapePatched) return false;
  const orig = proto._createSound;
  proto._createSound = function () {
    if (!isSyrinscapeEntry(this)) return orig.call(this);
    if (localNow()) {
      const fb = fallbackOf(this, (u) => { try { return fromUuidSync(u); } catch (e) { return null; } });
      if (!fb) return null; // no local twin: silent, as it would be offline anyway
      return makeFallbackSound(this, fb);
    }
    const sound = orig.call(this);
    // ⚠️ stop at the START of a fade: Syrinscape cannot be faded by Foundry's gain, so a faded stop was a late cut
    if (sound && typeof sound.stop === "function" && !sound.__mcNoFade) {
      const stop = sound.stop.bind(sound);
      sound.stop = (o = {}) => stop({ ...(o ?? {}), fade: 0 });
      sound.__mcNoFade = true;
    }
    return sound;
  };
  proto.__mcSyrinscapePatched = true;
  return true;
}

/** Every client: the source changed, so every Syrinscape entry rebuilds its Sound and carries on (or stays stopped). */
export function resyncSyrinscapeEntries() {
  for (const pl of game.playlists ?? []) {
    for (const s of pl.sounds ?? []) {
      if (!isSyrinscapeEntry(s) || !s.sound) continue;
      try { s.sound.stop?.({ fade: 0 }); } catch (e) { /* already stopped */ }
      s.sound = null;
      if (s.playing && !game.audio?.locked) { try { s.sync(); } catch (e) { console.warn(`${MODULE_ID} | resync ${s.name}`, e?.message); } }
    }
  }
}

let watch = null;
/** The primary GM watches the module's socket and says each flip once. */
export function startOfflineWatcher() {
  if (watch || !game.user?.isGM) return;
  const primary = () => game.users?.activeGM?.id === game.user.id;
  game.audio?.unlock?.then?.(() => {
    let st = { since: Date.now(), offline: Boolean(setting("syrinscapeOffline", false)) };
    watch = setInterval(async () => {
      if (!primary()) return;
      if (!moduleActive()) return; // no module: every entry is local already, nothing to announce
      const state = globalThis.syrinscape?.player?.socketSystem?.state ?? null;
      const n = nextOffline({ state, since: st.since, offline: st.offline, now: Date.now() });
      st = { since: n.since, offline: n.offline };
      if (!n.flip) return;
      try { await game.settings.set(MODULE_ID, "syrinscapeOffline", n.offline); } catch (e) { return; }
      if (n.flip === "offline") notifier.warn("Syrinscape is offline: playing local sounds.");
      else notifier.info("Syrinscape is back: playing Syrinscape scenes.");
    }, POLL_MS);
  });
}

/* ------------------------------------------------------------------------------------------------------------------
 * ONE MOOD AT A TIME, AND THE BED UNDERNEATH (seat SOUND PHASE 2 B4/E4, 2026-11-16).
 *
 * Syrinscape plays ONE mood at a time: starting a mood replaces whatever mood was playing (it crossfades by itself).
 * Foundry did not know, so a replaced mood's entry, and its deck key, still read "playing" (B4), and a car's mood
 * wiped the ride bed: stopping it left silence while the deck and Foundry showed the ride playing (E4).
 *
 * The rule, on the primary GM, while Syrinscape is live (never in Local / offline: local files layer freely):
 * - A BED is an entry flagged `mobile-command.syrBed` or `rideBed`: what a scene sits on (the ride, a backdrop, a
 *   scene board's own ambience). Anything else is a MOMENT (a car, a room, "Run!").
 * - A MOMENT mood starting: every other playing moment stops (Syrinscape already dropped it). A playing bed keeps
 *   reading "playing": it is the scene's bed, waiting underneath.
 * - A BED mood starting: every other playing mood stops, beds and moments alike (a new scene's bed).
 * - A MOMENT mood ending, when no other moment is playing: every bed still marked playing is sent "play" again, so
 *   the ride comes back after the car. A bed stopped by hand is simply not playing, so nothing comes back.
 * - An element loop Syrinscape stops by itself (a mood swap can take it): its entry stops too; a bed waits.
 * ------------------------------------------------------------------------------------------------------------------ */

export const isBed = (doc) => {
  const f = doc?.flags?.[MODULE_ID] ?? doc?._source?.flags?.[MODULE_ID] ?? {};
  return Boolean(f.syrBed || f.rideBed);
};
export const syrOf = (doc) => {
  const f = doc?.flags?.[SYR] ?? doc?._source?.flags?.[SYR] ?? {};
  return f.soundType && f.soundId ? { type: f.soundType, id: String(f.soundId) } : null;
};

/** A mood entry started. `playing` = the other playing Syrinscape entries `{ id, mood, bed }`. Pure → ids to stop. */
export function planMoodStart({ started, playing = [] }) {
  if (!started?.mood) return [];
  return playing.filter((o) => o.id !== started.id && o.mood && (started.bed || !o.bed)).map((o) => o.id);
}

/** A mood entry ended (not by us). Pure → ids of the beds to play again. */
export function planMoodEnd({ ended, playing = [] }) {
  if (!ended?.mood || ended.bed) return [];
  if (playing.some((o) => o.id !== ended.id && o.mood && !o.bed)) return [];
  return playing.filter((o) => o.bed).map((o) => o.id);
}

const allEntries = () => {
  const out = [];
  for (const pl of game.playlists ?? []) for (const s of pl.sounds ?? []) if (isSyrinscapeEntry(s)) out.push(s);
  return out;
};
const keyOf = (s) => s.uuid ?? s.id;
const view = (s) => ({ id: keyOf(s), mood: syrOf(s)?.type === "mood", bed: isBed(s) });
const ours = new Set(); // entries this bridge stopped, so their end is not read as his
const isPrimary = () => Boolean(game.user?.isGM && game.users?.activeGM?.id === game.user.id);

async function stopEntries(docs) {
  for (const d of docs) {
    ours.add(keyOf(d));
    try { await d.update({ playing: false }); } catch (e) { ours.delete(keyOf(d)); console.warn(`${MODULE_ID} | could not mark ${d.name} stopped`, e?.message); }
  }
}

function replay(doc) {
  const s = syrOf(doc), u = globalThis.syrinscapeControl?.utils;
  if (!s || !u) return;
  try { if (s.type === "mood") u.playMood(s.id); else u.playElement(s.id); } catch (e) { console.warn(`${MODULE_ID} | could not bring back ${doc.name}`, e?.message); }
}

/** A Syrinscape entry's playing changed (primary GM). Exported for the test. */
export async function onSyrinscapePlaying(doc, nowPlaying) {
  if (!isPrimary() || localNow() || !isSyrinscapeEntry(doc)) return;
  const key = keyOf(doc);
  const others = allEntries().filter((s) => s.playing && keyOf(s) !== key);
  if (nowPlaying) {
    const stop = new Set(planMoodStart({ started: view(doc), playing: others.map(view) }));
    await stopEntries(others.filter((s) => stop.has(keyOf(s))));
    return;
  }
  if (ours.delete(key)) return;
  const back = new Set(planMoodEnd({ ended: view(doc), playing: others.map(view) }));
  for (const s of others) if (back.has(keyOf(s))) replay(s);
}

/** Syrinscape stopped an element by itself (primary GM). Exported for the test. */
export function onSyrinscapeElementStopped(elementId) {
  if (!isPrimary() || localNow()) return [];
  const id = String(elementId ?? "");
  const hit = allEntries().filter((s) => s.playing && s.repeat && !isBed(s) && syrOf(s)?.type === "element" && syrOf(s).id === id);
  if (hit.length) stopEntries(hit);
  return hit;
}

let moodHooks = false;
export function startMoodWatch() {
  if (moodHooks) return;
  moodHooks = true;
  const fire = (doc, playing) => { onSyrinscapePlaying(doc, playing).catch((e) => console.warn(`${MODULE_ID} | mood watch`, e?.message)); };
  // ⚠️ Foundry's play/stop/end update the PARENT playlist with an embedded sounds delta (updatePlaylist); a direct
  // sound.update fires updatePlaylistSound. Both are read.
  Hooks.on("updatePlaylistSound", (doc, chg) => { if (chg && "playing" in chg) fire(doc, Boolean(chg.playing)); });
  Hooks.on("updatePlaylist", (pl, chg) => {
    for (const d of chg?.sounds ?? []) if (d && "playing" in d) { const doc = pl.sounds?.get?.(d._id); if (doc) fire(doc, Boolean(d.playing)); }
  });
  globalThis.syrinscape?.events?.stopElement?.addListener?.((event) => { onSyrinscapeElementStopped(event?.detail?.elementId); });
}

/* ------------------------------------------------------------------------------------------------------------------
 * HIS SYRINSCAPE FOLLOWS HIS ENVIRONMENT LEVEL (seat SOUND PHASE 2 D2, 2026-11-16).
 *
 * The module sets its player's level from Foundry's Environment volume only when the SLIDER moves (the
 * `globalAmbientVolumeChanged` hook). A settings write (Mobile Command's TV rule) never reaches it, so with the TV on
 * his PC still played every mood. ⚠️ THE −∞ TRAP: the module's level change is a FADE that starts from the current
 * level in dB, so once 0 lands (the module itself sets it at load when Environment is 0) every later fade starts at
 * −∞ and never comes back without a reload (Player1, seat D).
 * So the level is written straight to the player's gain through its `value` setter (no fade: safe from 0, exact
 * silence at 0), and re-checked every few seconds, which also rescues a trapped level.
 * ⚠️ 2026-11-16 (DESIGN §58): THE MODULE READS FOUNDRY'S VOLUME AS ITS OWN DECIBEL SCALE. Foundry stores a GAIN (0.5 =
 * −6 dB); Syrinscape's value v is 37.5 × (v − 1) dB, so handing it 0.5 cut Syrinscape by 18.75 dB, 12.7 dB more than
 * the same slider cuts our own sounds. That, under the music, is why his moods were "REALLY quiet". The level is now
 * converted (sound-mix.js syrValueOfGain): 0.5 → 0.84 (−6 dB), so his Environment slider moves Syrinscape exactly as
 * it moves our files. The module's own slider-move fade still writes the raw value; the keeper corrects it 50 ms later.
 * ------------------------------------------------------------------------------------------------------------------ */
export const VOLUME_CHECK_MS = 5000;

/** The level this client's Syrinscape should have: its own Environment volume × the table's master, on Syrinscape's
 *  scale (§58.8: the master's top end is this local volume's room above the Environment slider). Pure. */
export function wantedSyrinscapeLevel(env, master = 1) {
  return syrLocalOf(env, master);
}

/** Write it if it differs (or is trapped at −∞). Returns what it did. */
export function syncSyrinscapeVolume() {
  const node = globalThis.syrinscape?.player?.audioSystem?.effectSystem?.localVolume;
  if (!node) return "no player";
  let env; try { env = game.settings.get("core", "globalAmbientVolume"); } catch (e) { return "no setting"; }
  const want = wantedSyrinscapeLevel(env, masterNow());
  if (want === null) return "no level";
  const cur = Number(node.value);
  if (Number.isFinite(cur) && Math.abs(cur - want) < 0.001) return "same";
  try { node.value = want; } catch (e) { return "refused"; }
  return `set ${Math.round(want * 1000) / 1000}`;
}

let volWatch = null;
export function startVolumeKeeper() {
  if (volWatch) return;
  volWatch = true;
  Hooks.on("globalAmbientVolumeChanged", () => setTimeout(() => { syncSyrinscapeVolume(); syncSyrinscapeLevels(); }, 50)); // after the module's own fade
  Hooks.on("globalPlaylistVolumeChanged", () => syncSyrinscapeLevels()); // a mood's score follows his Music slider (§58.7)
  const keep = () => { syncSyrinscapeVolume(); syncSyrinscapeLevels(); };
  game.audio?.unlock?.then?.(() => { keep(); volWatch = setInterval(keep, VOLUME_CHECK_MS); });
}

/* ------------------------------------------------------------------------------------------------------------------
 * ~~TWO GROUP LEVELS, SET ONCE AND KEPT (DM 2026-11-16, world setting `syrinscapeLevels` = { moods, oneshots } in
 * Syrinscape's own values; seat 3 set moods 1.5 / one-shots 1.4).~~ SUPERSEDED 2026-11-16 (DESIGN §58) by THE TABLE'S
 * MIX (sound-mix.js, world setting `soundMix`): the old pair was tuned against the scale bug above (moods at the 1.5
 * ceiling only made up for the Environment cut) and divided dB values as if they were gains. `syrinscapeLevels` is
 * kept registered and is no longer read.
 *
 * Syrinscape's player has three groups: its GLOBAL volume (every element; mood loops go straight into it), a MUSIC
 * group (a mood's score) and a ONE-SHOT group, both of which feed the global one. The mix's three layers land on them:
 * environment → global, music → music group, cues → one-shot group (sound-mix.js syrinscapeNodes, dB-correct). No entry
 * or element volume is touched. Local volume stays his Environment slider (above).
 * Every client that plays Syrinscape keeps them (the keeper's 5 s check), because Syrinscape's server pushes its own
 * global/music/one-shot volume on connect and from its control panel. Floors keep clear of the −∞ fade trap at 0.
 * ------------------------------------------------------------------------------------------------------------------ */
export const LEVEL_MAX = 1.5, LEVEL_FLOOR = 0.001;

let lastGroups = null;
/** Write the three group levels if they differ (the music and one-shot groups have no getter: re-asserted each check,
 *  which is a no-op fade at the same value; reported only when new to us). Returns what it did. */
export function syncSyrinscapeLevels() {
  const p = globalThis.syrinscape?.player;
  const node = p?.audioSystem?.effectSystem?.globalVolume;
  if (!node) return "no player";
  const want = syrinscapeNodes(mixNow(), slidersNow()); // its music group follows this screen's Music ÷ Environment
  const did = [];
  const cur = Number(node.value);
  if (!Number.isFinite(cur) || Math.abs(cur - want.global) >= 0.001) { try { node.value = want.global; did.push(`ambience ${r3(want.global)}`); } catch (e) { did.push("ambience refused"); } }
  const es = p?.elementSystem;
  const key = `${want.music}|${want.oneshot}`;
  if (es?.setMusicVolume) { try { es.setMusicVolume(want.music); if (lastGroups !== key) did.push(`music ${r3(want.music)}`); } catch (e) { did.push("music refused"); } }
  if (es?.setOneshotVolume) { try { es.setOneshotVolume(want.oneshot); if (lastGroups !== key) did.push(`one-shots ${r3(want.oneshot)}`); } catch (e) { did.push("one-shots refused"); } }
  lastGroups = key;
  return did.length ? `set ${did.join(", ")}` : "same";
}
const r3 = (v) => Math.round(v * 1000) / 1000;

/** ~~GM: set either level. MobileCommand.soundScenes.levels({ moods, oneshots }).~~ Replaced by soundScenes.mix. */
export async function setSyrinscapeLevels() {
  return { ok: false, reason: "replaced by MobileCommand.soundScenes.mix({ music, environment, cues }) (2026-11-16)" };
}

export function registerSyrinscapeBridge() {
  patchPlaylistSound();
  startOfflineWatcher();
  if (moduleActive()) { startMoodWatch(); startVolumeKeeper(); }
}
