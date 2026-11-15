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
  const lv = (v) => (Number(v) > 0 ? fb.volume : 0);
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

export function registerSyrinscapeBridge() {
  patchPlaylistSound();
  startOfflineWatcher();
}
