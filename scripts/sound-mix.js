/**
 * ONE MIX FOR THE TABLE (DM 2026-11-16, DESIGN §58). His words, in order:
 *   "The syrinscape environmental loops are REALLLLLLLLY quite, music completely hides them, music should be fairly quite
 *    with environmentals clearly heard over them, and they all need to be at around 25-50% volume so the DM's voice is
 *    clearly heard and not drowned out"
 *   "We need a set volume for everything that's defaulted on launch fir foundry and fir every sound when playing it"
 *   "Is there a way to let me set the overall volume music+sfx+env x% higher or lower?"
 *
 * Four parts, all here:
 * 1. LAUNCH SLIDERS (§58.7). Every launch or reload sets this screen's Music / Environment / Interface sliders to
 *    SLIDER_DEFAULT (the TV's through `tvVolume`, written by the primary GM's launch). He can move them in a session.
 * 2. LAYERS. Three gains for the whole table, world setting `soundMix` = { music, environment, cues }, applied on every
 *    screen after its sliders: each channel context gets a TRIM after his slider node, and a GROUP node per layer before
 *    it; a playlist sound is routed into its layer's group (`Sound#destination`), so it plays at
 *    its level × his slider × its layer, whatever channel its playlist is on.
 * 3. A SET LEVEL AT PLAY (§58.7). A playlist sound starts at a level decided here, never at whatever volume was left on
 *    it: a sound the deck LEVELLED (deck-command's loudness patches, uuid → volume, read from its migrations pack) plays
 *    at that measured level; every other sound plays at its layer's SET_LEVEL. Nothing is written to the sound. A drag of
 *    that sound's own slider while it plays still works (only the start is set).
 * 4. MASTER (§58.8). One world gain `soundMaster` over every layer, Syrinscape included, ratios kept; 10% steps.
 * 5. PER-SOUND TRIMS (§58.10, DM 2026-11-16: "go over all sounds and normalize them 'by ear'"). World setting
 *    `soundTrims` = { key: dB }, on OUR side: no playlist volume and no Syrinscape entry is edited. Key = a PlaylistSound
 *    uuid (a local sound), or `syr:mood:<id>` / `syr:element:<id>` (a Syrinscape sound, whichever entry plays it).
 * Syrinscape plays through its own player, so the layers are written to its three groups (ambience = its global volume,
 * its music group, its one-shot group), each with a fixed LIFT that makes Syrinscape at layer 1 as loud as ours at layer 1
 * (measured on the TV, seat 3 2026-11-16), and the master to its local volume (syrinscape-bridge.js).
 * Nothing in here writes a document; the only settings written are the core sliders at launch and the GM's own settings.
 */
import { MODULE_ID } from "./preset.js";
import { isBed, bedKind } from "./music-core.js";

export const LAYERS = Object.freeze(["music", "environment", "cues"]);
export const CHANNEL_LAYER = Object.freeze({ music: "music", environment: "environment", interface: "cues" });
const CORE_KEY = Object.freeze({ music: "globalPlaylistVolume", environment: "globalAmbientVolume", interface: "globalInterfaceVolume" });

/**
 * THE DESIGNED MIX (2026-11-16, from the seat 3 measurements; owed a seat measurement before it is trusted).
 * Sliders, as Foundry shows them (it shows the stored gain × 100): Music 25%, Environment 50%, Interface 50%.
 * Layers: music 0.3, environment 1, cues 1. Music in total = 25% × 0.3 = what 50% × 0.15 was: his room music, −29 dBFS on
 * the TV at 50% and the loudest thing at the table, lands at ≈ −45, 8 dB under the environment.
 * Environment and cues: the deck's loops and cues were levelled (−27 / −25 LUFS, 11-14) and sit ≈ −39 / −37 on the TV;
 * they stay, and the Syrinscape scale fix (syrinscape-bridge.js) brings Syrinscape up to them.
 * Syrinscape lifts, in dB (what a Syrinscape group needs, before the Environment slider, to match ours at layer 1 with
 * both sliders equal; its music group also follows the screen's Music ÷ Environment sliders, as our music does):
 * - ambience 18.75: the most Syrinscape allows (+18.75 dB = its 1.5). Ambient moods measured a median ≈ −50 at the old net
 *   0 dB; +12.7 dB from the scale fix puts them at ≈ −37, level with our loops.
 * - music 11.5: its music moods measured ≈ −34.5 at net 0; this puts them where his music sits at the same layer.
 * - oneshots 3.2: its one-shots measured ≈ −37 at net −2.5 dB; this keeps them on our Whistle (−37.3).
 * SET LEVELS (a sound's level when the deck did not level it): music 0.8 (his room/fight/mood playlists' own level),
 * environment 0.5 (his beds), cues 0.6 (our cue default).
 */
export const SLIDER_DEFAULT = Object.freeze({ music: 0.25, environment: 0.5, interface: 0.5 });
// music 0.3 → 0.6 (+6 dB, DM 2026-11-17 after SEAT 5 measured room music ≈ −48 dBFS, 11–17 dB under the Syrinscape beds,
// inaudible at the table; ≈ 5–11 dB under now, aiming at 6–8). DESIGN §59.
export const MIX_DEFAULT = Object.freeze({ music: 0.6, environment: 1, cues: 1 });
/** Fight music sits this many dB over the scene's default music (DM 2026-11-17, §59): a battle playlist's sounds. */
export const COMBAT_LIFT_DB = 3;
export const SET_LEVEL = Object.freeze({ music: 0.8, environment: 0.5, cues: 0.6 });
export const SYR_LIFT_DB = Object.freeze({ ambience: 18.75, music: 11.5, oneshots: 3.2 });
export const LAYER_MIN = 0.001, LAYER_MAX = 4; // −60 dB … +12 dB: a layer never reaches 0 (the groups divide by it)
/**
 * MASTER: 0 … 200% in 10% steps. The top is where Syrinscape runs out: its ambience is already at its own ceiling, so
 * above 100% the master lifts it through its LOCAL volume, which sits at the Environment slider (50% = −6 dB) and tops
 * out at 0 dB: 6 dB of room = ×2. Our own layers could go further, but would then pass the moods, so 200% is the cap.
 */
export const MASTER_DEFAULT = 1, MASTER_STEP = 0.1, MASTER_MAX = 1 / SLIDER_DEFAULT.environment;

const num = (v) => (v == null || v === "" ? NaN : Number(v));
const r2 = (v) => Math.round(v * 100) / 100;
/** Pure: whatever is stored → { music, environment, cues }, each clamped, absent = the default. */
export function mixOf(raw) {
  const out = {};
  for (const l of LAYERS) {
    const v = num(raw?.[l]);
    out[l] = Number.isFinite(v) ? Math.min(Math.max(v, LAYER_MIN), LAYER_MAX) : MIX_DEFAULT[l];
  }
  return out;
}
/** Pure: a stored master → a gain on the 10% grid, 0 … MASTER_MAX. */
export function masterOf(raw) {
  const v = num(raw);
  if (!Number.isFinite(v)) return MASTER_DEFAULT;
  return r2(Math.min(Math.max(Math.round(v / MASTER_STEP) * MASTER_STEP, 0), MASTER_MAX));
}

const ROLE_MUSIC = new Set(["room", "battle", "mood", "cue"]);
/**
 * Pure: the layer a PlaylistSound plays in. First match wins:
 * 1. a `mixLayer` flag on the sound, then on its playlist (his escape hatch, one flag; nothing sets it);
 * 2. a bed: its kind (§25.8; a music bed is music); a Syrinscape bed (`syrBed` / `rideBed`) is environment;
 * 3. a playlist with a music role (room, battle, mood, cue) or the battle library → music;
 * 4. a loop → environment (the Ghelfi ambiences sit on the Music channel; they are ambience);
 * 5. the Music channel → music (Foundry's own label for the rest);
 * 6. anything else → cues.
 */
export function layerOf(sound, { battleLibId = null } = {}) {
  const f = sound?.flags ?? sound?._source?.flags ?? {};
  const m = f[MODULE_ID] ?? {};
  const pl = sound?.parent ?? sound?.playlist ?? null;
  const pm = pl?.flags?.[MODULE_ID] ?? {};
  if (LAYERS.includes(m.mixLayer)) return m.mixLayer;
  if (LAYERS.includes(pm.mixLayer)) return pm.mixLayer;
  if (isBed(f)) return bedKind(f) === "music" ? "music" : "environment";
  if (m.syrBed || m.rideBed) return m.bedKind === "music" ? "music" : "environment";
  if (ROLE_MUSIC.has(pm.music?.role)) return "music";
  if (battleLibId && pl && (pl.uuid === battleLibId || pl.id === battleLibId)) return "music";
  if (sound?.repeat) return "environment";
  if (pl?.channel === "music") return "music";
  return "cues";
}

/**
 * Pure: the level a sound starts at. A sound the deck levelled plays its measured level, as long as it still plays the
 * file that level was measured on; anything else plays its layer's set level. `levelled` = Map(uuid → { volume, path }).
 */
export function setLevelOf(sound, layer, levelled = null, trims = null, { battleLibId = null } = {}) {
  const base = baseLevelOf(sound, layer, levelled);
  const d = (trims ? trimDbOf(trimKeyOf(sound), trims) : 0) + combatLiftDbOf(sound, { battleLibId });
  return d ? base * dbToGain(d) : base;
}

/** Pure (§59): the lift a sound gets as fight music: COMBAT_LIFT_DB for a sound of a battle playlist (role battle, or
 *  the world's battle library), else 0. A `mixLayer` flag putting it outside music turns it off. */
export function combatLiftDbOf(sound, { battleLibId = null } = {}) {
  const pl = sound?.parent ?? sound?.playlist ?? null;
  const role = pl?.flags?.[MODULE_ID]?.music?.role;
  const isLib = battleLibId && pl && (pl.uuid === battleLibId || pl.id === battleLibId);
  if (role !== "battle" && !isLib) return 0;
  return layerOf(sound, { battleLibId }) === "music" ? COMBAT_LIFT_DB : 0;
}

/**
 * Pure: a sound's base level, before its trim. 1. The deck's measured level (its loudness patches), while the sound still
 * plays that file. 2. FIX 2026-11-16 night (§58.11): a sound MC already levelled by its measured loudness (§53, the
 * 361-sound board; it carries `flags.mobile-command.volumeWas`) keeps its stored volume: that IS a measured level. The
 * first build gave those the layer's set level, which threw the §53 levelling away (the Whistle 0.28 → 0.6, +6.6 dB).
 * 3. Anything else: its layer's set level.
 */
export function baseLevelOf(sound, layer, levelled = null) {
  const t = levelled?.get?.(sound?.uuid);
  if (t && Number.isFinite(t.volume) && (!t.path || t.path === sound?.path)) return t.volume;
  const v = Number(sound?.volume);
  if (mcLevelled(sound) && Number.isFinite(v) && v > 0) return v;
  return SET_LEVEL[layer] ?? SET_LEVEL.cues;
}
const mcLevelled = (sound) => (sound?.flags?.["mobile-command"]?.volumeWas ?? sound?._source?.flags?.["mobile-command"]?.volumeWas) != null;
/** Pure: the base the first build used (table, else the layer's set level), kept only to convert trims measured on it. */
export function firstBuildBaseOf(sound, layer, levelled = null) {
  const t = levelled?.get?.(sound?.uuid);
  if (t && Number.isFinite(t.volume) && (!t.path || t.path === sound?.path)) return t.volume;
  return SET_LEVEL[layer] ?? SET_LEVEL.cues;
}
/**
 * Pure: convert trims written on the first build's bases so every sound plays exactly as loud as when it was trimmed:
 * t' = t + 20·log10(old base ÷ new base). `sounds` = [{ key, old, now, measured }]; `measured` = heard at the old base
 * and left untrimmed (within 1 dB), so it gets a trim too. → { trims, moved: [{key, from, to}], clamped }.
 */
export function planTrimRebase(trims = {}, sounds = []) {
  const out = { ...trims }, moved = [], clamped = [];
  for (const { key, old, now, measured } of sounds) {
    if (!(key in out) && !measured) continue;
    if (!(old > 0) || !(now > 0) || Math.abs(old - now) < 1e-9) continue;
    const from = key in out ? Number(out[key]) : 0; // `measured`: judged right at the old base, so no trim was written
    if (!Number.isFinite(from)) continue;
    const want = from + 20 * Math.log10(old / now);
    const to = Math.round(Math.min(Math.max(want, TRIM_MIN_DB), TRIM_MAX_DB) * 10) / 10;
    if (Math.abs(to - want) > 0.05) clamped.push(key);
    out[key] = to; moved.push({ key, from, to });
  }
  return { trims: out, moved, clamped };
}

// ── per-sound trims (§58.10) ──
export const TRIM_MIN_DB = -40, TRIM_MAX_DB = 24;
const SYR_FLAG = "syrinscape-control";
/** Pure: the trim key of a PlaylistSound: `syr:<type>:<id>` for a Syrinscape entry (shared by every entry of that
 *  Syrinscape sound), else its uuid. A string that is already a key passes through. */
export function trimKeyOf(soundOrId) {
  if (typeof soundOrId === "string") return soundOrId;
  const f = soundOrId?.flags?.[SYR_FLAG] ?? soundOrId?._source?.flags?.[SYR_FLAG];
  if (f?.soundType && f?.soundId != null) return `syr:${f.soundType}:${f.soundId}`;
  return soundOrId?.uuid ?? null;
}
/** Pure: a stored trim → dB, clamped; anything else 0. */
export function trimDbOf(key, trims) {
  const v = num(trims?.[key]);
  return Number.isFinite(v) ? Math.min(Math.max(v, TRIM_MIN_DB), TRIM_MAX_DB) : 0;
}
export const dbToGain = (d) => Math.pow(10, d / 20);
/** Pure: the Syrinscape mood playing now, from the playing Syrinscape entries: a moment wins over a waiting bed. */
export function activeMood(entries = []) {
  const moods = entries.filter((e) => e?.playing && e?.type === "mood");
  return (moods.find((e) => !e.bed) ?? moods[0] ?? null);
}
/** Pure: Syrinscape's local value with a mood trim on top: { local, appliedDb }. The local tops out at 0 dB (value 1),
 *  so a positive trim may be cut short; `appliedDb` is what landed (the one-shot group is compensated by it). */
/**
 * Pure (§58.12): where a mood's trim lands. The mood's whole output (its loops, its score AND its one-shots) moves by it,
 * so nothing is compensated inside Syrinscape. A CUT goes on Syrinscape's GLOBAL volume (every element; ≈ 56 dB of room
 * above its floor at the default mix), the rest, if any, on the local; a LIFT goes on the local (the global is at its
 * 1.5 ceiling), up to its 0 dB top. `globalValue` = the mix's global value before the trim.
 * → { localDb, globalDb, appliedDb } (appliedDb = what landed; standalone elements are compensated by it, §58.12).
 */
export function moodTrimSplit(env, master, globalValue, trimDb = 0) {
  const t = Number(trimDb);
  if (!t || !Number.isFinite(t)) return { localDb: 0, globalDb: 0, appliedDb: 0 };
  if (t > 0) {
    const l = syrLocalWithTrim(env, master, t);
    const d = Number.isFinite(l.appliedDb) ? l.appliedDb : 0;
    return { localDb: d, globalDb: 0, appliedDb: d };
  }
  const g = Number(globalValue);
  const gDb = Number.isFinite(g) ? (g - 1) * SYR_DB_RANGE : 0;
  const room = (SYR_FLOOR - 1) * SYR_DB_RANGE - gDb; // ≤ 0: how far the global can still go down
  const globalDb = Math.max(t, Math.min(room, 0));
  let localDb = 0;
  const rest = t - globalDb;
  if (rest < 0) { const l = syrLocalWithTrim(env, master, rest); localDb = Number.isFinite(l.appliedDb) ? l.appliedDb : rest; }
  return { localDb, globalDb, appliedDb: globalDb + localDb };
}

/** Pure (§58.11): an element's value with its trim, RELATIVE to the element's own Syrinscape volume (`base`, what its
 *  mood or the server set), on Syrinscape's dB scale. Base 0 (silenced in Syrinscape) stays 0. */
export function syrElementValue(base, trimDb = 0) {
  const b = Number(base);
  if (!Number.isFinite(b)) return null;
  if (b <= 0) return 0;
  if (!trimDb) return b;
  return syrValueDb((b - 1) * SYR_DB_RANGE + trimDb);
}
export function syrLocalWithTrim(env, master = MASTER_DEFAULT, trimDb = 0) {
  const base = syrLocalOf(env, master);
  if (base === null || base <= 0 || !trimDb) return { local: base, appliedDb: 0 };
  const baseDb = (base - 1) * SYR_DB_RANGE;
  const wantDb = Math.min(baseDb + trimDb, 0);
  const local = Math.max(1 + wantDb / SYR_DB_RANGE, 0);
  return { local, appliedDb: local <= 0 ? -Infinity : wantDb - baseDb };
}

/** Pure: the deck's loudness patches (its migrations pack) → Map(uuid → { volume, path }) for this world. */
export function levelledFromPatches(patches, worldId) {
  const out = new Map();
  for (const p of Array.isArray(patches) ? patches : []) {
    const s = p?.sound;
    if (!s?.uuid || !s.volume || typeof s.volume !== "object" || !Number.isFinite(Number(s.volume.to))) continue;
    if (Array.isArray(p.worlds) && worldId && !p.worlds.includes(worldId)) continue;
    out.set(s.uuid, { volume: Number(s.volume.to), path: s.path?.to ?? null });
  }
  return out;
}

/** Pure: the gains of one channel's rig. trim = the channel's layer × master; each group = its layer ÷ the channel's. */
export function rigGains(mix, channel, master = MASTER_DEFAULT) {
  const m = mixOf(mix);
  const ch = m[CHANNEL_LAYER[channel] ?? "cues"];
  const groups = {};
  for (const l of LAYERS) groups[l] = m[l] / ch;
  return { trim: ch * masterOf(master), groups };
}

// ── Syrinscape ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ SYRINSCAPE'S VOLUMES ARE DECIBELS, NOT GAINS (read in its lib/player.js 2026-11-16, the "volume" effect): a value
// v plays at 37.5 × (v − 1) dB, so 1 = 0 dB, 0.5 = −18.75 dB, 1.5 = +18.75 dB (its ceiling), 0 = silence.
export const SYR_DB_RANGE = 37.5, SYR_MAX = 1.5, SYR_FLOOR = 0.001;
const dB = (g) => 20 * Math.log10(g);
/** Pure: a Syrinscape value for a gain in dB, clamped to its range and kept off 0 (the −∞ fade trap). */
export function syrValueDb(db) {
  if (!Number.isFinite(db)) return SYR_FLOOR;
  return Math.min(Math.max(1 + db / SYR_DB_RANGE, SYR_FLOOR), SYR_MAX);
}
/**
 * Pure: a Foundry volume (a GAIN, 0–1: what his Environment slider stores) as Syrinscape's value, so the slider moves
 * Syrinscape exactly as it moves our own sounds. 0 → 0 (true silence; written through the node's setter, so no fade
 * trap), 0.5 → 0.84 (−6 dB, not Syrinscape's −18.75), 1 → 1 (its local volume's top: a gain over 1 is clamped).
 */
export function syrValueOfGain(g) {
  const v = Number(g);
  if (!Number.isFinite(v)) return null;
  if (v <= 0) return 0;
  return Math.min(Math.max(1 + dB(Math.min(v, 1)) / SYR_DB_RANGE, 0), 1);
}

/**
 * Pure: the three Syrinscape group values for a mix. Its music and one-shot groups feed its global volume, so they
 * carry their level MINUS the global one (dB subtract; the 2026-11-16 seat found the old ÷ was wrong on this scale).
 * `sliders` = this screen's { music, environment } gains: Syrinscape plays after the Environment slider, so its music
 * group also carries Music ÷ Environment, as our own music does (absent or a zero slider: no adjustment, it is silent).
 * → { global, music, oneshot } Syrinscape values, plus `capped` when the ambience wanted more than Syrinscape has.
 */
export function syrinscapeNodes(mix, sliders = null, lift = SYR_LIFT_DB) {
  const m = mixOf(mix);
  const ms = Number(sliders?.music), es = Number(sliders?.environment);
  const ratio = ms > 0 && es > 0 ? dB(ms / es) : 0;
  const want = { ambience: dB(m.environment) + lift.ambience, music: dB(m.music) + lift.music + ratio, oneshots: dB(m.cues) + lift.oneshots };
  const maxDb = (SYR_MAX - 1) * SYR_DB_RANGE;
  const g = Math.min(want.ambience, maxDb);
  return {
    global: syrValueDb(g),
    music: syrValueDb(want.music - g),
    oneshot: syrValueDb(want.oneshots - g),
    capped: want.ambience > maxDb + 1e-9,
  };
}

/** Pure: Syrinscape's LOCAL value on a screen: its Environment slider × the master, on Syrinscape's scale (tops at 1). */
export function syrLocalOf(env, master = MASTER_DEFAULT) {
  const e = Number(env);
  if (!Number.isFinite(e)) return null;
  return syrValueOfGain(e * masterOf(master));
}

/** Pure: the launch writes for one screen: current = { music, environment, interface } → [{ key, value }] to set. */
export function planLaunchSliders(current = {}) {
  const out = [];
  for (const ch of Object.keys(SLIDER_DEFAULT)) {
    if (Number(current?.[ch]) !== SLIDER_DEFAULT[ch]) out.push({ key: CORE_KEY[ch], value: SLIDER_DEFAULT[ch] });
  }
  return out;
}
/** The TV's three sliders, in `tvVolume`'s own keys. */
export const TV_DEFAULT = Object.freeze({ music: SLIDER_DEFAULT.music, ambient: SLIDER_DEFAULT.environment, interface: SLIDER_DEFAULT.interface });

// ── runtime ────────────────────────────────────────────────────────────────────────────────────────────────
const setting = (k, d) => { try { return game.settings.get(MODULE_ID, k); } catch (e) { return d; } };
export function mixNow() { return mixOf(setting("soundMix", {})); }
export function masterNow() { return masterOf(setting("soundMaster", MASTER_DEFAULT)); }
export function trimsNow() { const t = setting("soundTrims", {}); return t && typeof t === "object" ? t : {}; }
/** This screen's two sliders that Syrinscape's music group follows. */
export function slidersNow() {
  const g = (k) => { try { return Number(game.settings.get("core", k)); } catch (e) { return NaN; } };
  return { music: g(CORE_KEY.music), environment: g(CORE_KEY.environment) };
}

function channelOf(ctx) {
  const a = game.audio;
  if (!a) return null;
  for (const ch of Object.keys(CHANNEL_LAYER)) if (a[ch] === ctx) return ch;
  return null;
}

function setGain(param, v, ctx, smooth) {
  try {
    if (smooth) { param.cancelScheduledValues(ctx.currentTime); param.setTargetAtTime(v, ctx.currentTime, 0.08); }
    else param.value = v;
  } catch (e) { /* closed context */ }
}

/** The rig of one channel context, built once: slider → trim → speakers, and a group per layer → slider. */
export function rigOf(ctx) {
  if (!ctx?.gainNode || typeof ctx.createGain !== "function") return null;
  if (ctx.mcMix) return ctx.mcMix;
  const channel = channelOf(ctx);
  if (!channel) return null;
  const trim = ctx.createGain();
  try { ctx.gainNode.disconnect(ctx.destination); } catch (e) { /* not connected there: still rig it */ }
  ctx.gainNode.connect(trim);
  trim.connect(ctx.destination);
  const groups = {};
  for (const l of LAYERS) { const g = ctx.createGain(); g.connect(ctx.gainNode); groups[l] = g; }
  ctx.mcMix = { channel, trim, groups };
  applyRig(ctx, false);
  return ctx.mcMix;
}

function applyRig(ctx, smooth = true) {
  const r = ctx?.mcMix;
  if (!r) return;
  const g = rigGains(mixNow(), r.channel, masterNow());
  setGain(r.trim.gain, g.trim, ctx, smooth);
  for (const l of LAYERS) setGain(r.groups[l].gain, g.groups[l], ctx, smooth);
}

/** Every channel on this screen takes the current mix and master (at unlock and on a setting change). Syrinscape's
 *  groups and local volume are the bridge's (syncSyrinscapeLevels / syncSyrinscapeVolume), called beside this. */
export function applyMix() {
  const a = game.audio;
  if (a && !a.locked) for (const ch of Object.keys(CHANNEL_LAYER)) { if (a[ch]) { rigOf(a[ch]); applyRig(a[ch]); } }
}

// The deck's levelled sounds. Read once, at ready, from its own migrations pack (1.8 MB, one fetch per screen, after
// the world is up; nothing waits on it). Without deck-command, or before it arrives, every sound plays its set level.
let levelled = null;
export function levelledNow() { return levelled; }
export async function loadLevelled() {
  const deck = game.modules?.get?.("deck-command");
  if (!deck?.active) return null;
  try {
    const res = await fetch(`modules/deck-command/packs/migrations.json`, { cache: "force-cache" });
    if (!res.ok) return null;
    const j = await res.json();
    levelled = levelledFromPatches(Array.isArray(j) ? j : (j?.patches ?? Object.values(j ?? {})), game.world?.id);
  } catch (e) { console.warn(`${MODULE_ID} | mix: could not read the deck's levels`, e?.message); }
  return levelled;
}

const battleLibId = () => setting("combatMusicPlaylist", "") || null;
const twinOf = (doc) => {
  const ref = doc?.flags?.[MODULE_ID]?.localFallback;
  if (!ref || typeof ref !== "string") return null;
  try { return fromUuidSync(ref); } catch (e) { return null; }
};

/**
 * A freshly made Sound of `doc`: into its layer's group, and set to start at its set level. Foundry starts a playlist
 * sound through `load({ autoplayOptions: { volume } })` (PlaylistSound#sync), so that one volume is replaced; a fade-in
 * goes to the set level; a stop or a later fade (a drag, a duck) is left as it is.
 */
export function routeSound(doc, sound) {
  if (!sound || sound.destination || typeof sound.addEventListener !== "function") return sound;
  const syr = doc?.flags?.["syrinscape-control"];
  if (syr?.soundType && !sound.mcLocalFallback) return sound; // Syrinscape plays through its own player
  const ctx = doc?.context ?? null;
  const rig = rigOf(ctx);
  if (!rig) return sound;
  const from = sound.mcLocalFallback ? (twinOf(doc) ?? doc) : doc;
  const layer = layerOf(from, { battleLibId: battleLibId() });
  sound.destination = rig.groups[layer];
  sound.mcMixLayer = layer;
  const level = () => setLevelOf(from, layer, levelled, trimsNow(), { battleLibId: battleLibId() });
  sound.mcLevelOf = level;
  sound.mcSetLevel = level();
  if (typeof sound.load === "function" && !sound.__mcSetLevel) {
    const load = sound.load.bind(sound);
    sound.load = (o = {}) => {
      const ap = o?.autoplayOptions;
      if (!ap || !(Number(ap.volume) > 0)) return load(o);
      sound.mcSetLevel = level();
      return load({ ...o, autoplayOptions: { ...ap, volume: sound.mcSetLevel } });
    };
    sound.__mcSetLevel = true;
  }
  return sound;
}

/** Every client: wrap the one seam (after the Syrinscape bridge's own wrap, so a local twin is routed too). */
export function patchMix() {
  const proto = CONFIG.PlaylistSound?.documentClass?.prototype;
  if (!proto || proto.__mcMixPatched) return false;
  const orig = proto._createSound;
  proto._createSound = function () {
    const sound = orig.call(this);
    try { routeSound(this, sound); } catch (e) { console.warn(`${MODULE_ID} | mix: could not route ${this?.name}`, e?.message); }
    return sound;
  };
  proto.__mcMixPatched = true;
  return true;
}

/**
 * LAUNCH: this screen's sliders to the defaults, before the phone and DM-machine rules run (they silence after it).
 * The TV's sliders are `tvVolume` (the TV cannot write a world setting): the primary GM's launch puts them back, and
 * the TV mirrors them as it always has. World setting `launchVolumes` (on by default) turns all of it off.
 */
export function applyLaunchVolumes({ isDisplay = false } = {}) {
  if (setting("launchVolumes", true) === false) return [];
  const did = [];
  if (!isDisplay) {
    const cur = {};
    for (const ch of Object.keys(CORE_KEY)) { try { cur[ch] = Number(game.settings.get("core", CORE_KEY[ch])); } catch (e) { /* unset */ } }
    for (const w of planLaunchSliders(cur)) { try { game.settings.set("core", w.key, w.value); did.push(w.key); } catch (e) { /* not ours */ } }
  }
  if (game.user?.isGM && game.users?.activeGM?.id === game.user.id) {
    const tv = setting("tvVolume", {}) ?? {};
    if (Object.keys(TV_DEFAULT).some((k) => Number(tv[k]) !== TV_DEFAULT[k])) {
      try { game.settings.set(MODULE_ID, "tvVolume", { ...TV_DEFAULT }); did.push("tvVolume"); } catch (e) { /* later */ }
    }
  }
  if (did.length) console.log(`${MODULE_ID} | launch volumes: ${did.join(", ")}`);
  return did;
}

/** GM: set any layer (a gain; null hands it back to the default). MobileCommand.soundScenes.mix({ music: 0.2 }). */
export async function setSoundMix(next = {}) {
  if (!game.user?.isGM) return { ok: false, reason: "GM only" };
  const was = { ...(setting("soundMix", {}) ?? {}) };
  const out = { ...was };
  for (const l of LAYERS) if (l in next) { const v = num(next[l]); if (Number.isFinite(v)) out[l] = Math.min(Math.max(v, LAYER_MIN), LAYER_MAX); else delete out[l]; }
  await game.settings.set(MODULE_ID, "soundMix", out);
  return { ok: true, mix: mixOf(out), was: mixOf(was) };
}

/** The master as the deck draws it: { master (gain), pct, atMin, atMax, step }. */
export function getSoundMaster() {
  const m = masterNow();
  return { master: m, pct: Math.round(m * 100), atMin: m <= 0, atMax: m >= MASTER_MAX - 1e-9, step: MASTER_STEP, max: MASTER_MAX };
}
/** GM: the master to a gain (1 = the mix as designed), snapped to 10%, clamped 0 … 200%. */
export async function setSoundMaster(v) {
  if (!game.user?.isGM) return { ok: false, reason: "GM only" };
  const next = masterOf(v);
  if (next !== masterNow()) await game.settings.set(MODULE_ID, "soundMaster", next);
  return { ok: true, ...getSoundMaster(), master: next, pct: Math.round(next * 100), atMin: next <= 0, atMax: next >= MASTER_MAX - 1e-9 };
}
/** GM: one 10% step up (+1) or down (−1). At an end it stays there and says so. */
export async function stepSoundMaster(dir = 1) {
  return setSoundMaster(masterNow() + (Number(dir) < 0 ? -MASTER_STEP : MASTER_STEP));
}

/** Every client: a trim changed, so every playing local sound moves to its new level now (a 250 ms fade), so the seat
 *  hears and measures it at once. Syrinscape follows through the bridge's sync, called beside this. */
export function refreshTrims() {
  for (const pl of game.playlists ?? []) for (const ps of pl.sounds ?? []) {
    const snd = ps.sound;
    if (!ps.playing || !snd?.playing || typeof snd.mcLevelOf !== "function") continue;
    const next = snd.mcLevelOf();
    if (Math.abs(next - (snd.mcSetLevel ?? next)) < 1e-6) continue;
    snd.mcSetLevel = next;
    try { snd.fade(next, { duration: 250 }); } catch (e) { /* stopping */ }
  }
}

/** The key for whatever the caller names: a PlaylistSound uuid (a Syrinscape entry's uuid becomes its `syr:` key), or a
 *  key as is. */
function resolveTrimKey(id) {
  if (typeof id !== "string" || !id) return null;
  if (id.startsWith("syr:")) return /^syr:(mood|element):\S+$/.test(id) ? id : null;
  let doc = null;
  try { doc = fromUuidSync(id); } catch (e) { /* not a uuid */ }
  return doc?.documentName === "PlaylistSound" ? trimKeyOf(doc) : null;
}

/**
 * GM: write per-sound trims, in dB (null removes one). One id and a dB, or a map { id: dB } in ONE world write:
 *   MobileCommand.soundScenes.trim("Playlist.x.PlaylistSound.y", -4)
 *   MobileCommand.soundScenes.trim({ "syr:mood:861010": 3, "syr:element:4668915": -2 })
 * → { ok, trims: { key: dB }, refused: [ids] } (an id that is not a playlist sound or a syr: key is refused, never guessed).
 */
export async function setSoundTrim(idOrMap, db) {
  if (!game.user?.isGM) return { ok: false, reason: "GM only" };
  const pairs = idOrMap && typeof idOrMap === "object" ? Object.entries(idOrMap) : [[idOrMap, db]];
  const out = { ...trimsNow() }, done = {}, refused = [];
  for (const [id, d] of pairs) {
    const key = resolveTrimKey(id);
    if (!key) { refused.push(id); continue; }
    const v = num(d);
    if (Number.isFinite(v)) { out[key] = Math.round(Math.min(Math.max(v, TRIM_MIN_DB), TRIM_MAX_DB) * 10) / 10; done[key] = out[key]; }
    else { delete out[key]; done[key] = null; }
  }
  if (Object.keys(done).length) await game.settings.set(MODULE_ID, "soundTrims", out);
  return { ok: refused.length === 0, trims: done, refused };
}
/** Every trim (a copy), or one: MobileCommand.soundScenes.trims() / trims(id) → dB (0 = none). */
export function getSoundTrims(id) {
  if (id === undefined) return { ...trimsNow() };
  const key = resolveTrimKey(id);
  return key ? trimDbOf(key, trimsNow()) : null;
}

/** What plays where, for a console or the deck: the mix, the master and this screen's Syrinscape values. */
export function soundMixState() {
  const s = slidersNow();
  return { mix: mixNow(), master: masterNow(), sliders: s, syrinscape: { ...syrinscapeNodes(mixNow(), s), local: syrLocalOf(s.environment, masterNow()) }, levelled: levelled?.size ?? 0, trims: Object.keys(trimsNow()).length };
}

/** The trimmed sounds (keys of `ref`) and every other sound of their playlists (SEAT 4 heard all 459 and left those
 *  within 1 dB untrimmed), as { key, layer-resolved old base, new base, measured } for planTrimRebase. */
function seatSounds(ref) {
  const docs = new Map();
  for (const key of Object.keys(ref)) {
    if (key.startsWith("syr:")) continue;
    let doc = null; try { doc = fromUuidSync(key); } catch (e) { /* gone */ }
    if (doc?.documentName !== "PlaylistSound") continue;
    docs.set(key, doc);
    for (const sib of doc.parent?.sounds ?? []) if (sib?.uuid && !docs.has(sib.uuid) && !sib.flags?.["syrinscape-control"]?.soundType) docs.set(sib.uuid, sib);
  }
  return [...docs].map(([key, doc]) => {
    const layer = layerOf(doc, { battleLibId: battleLibId() });
    return { key, measured: !(key in ref), old: firstBuildBaseOf(doc, layer, levelled), now: baseLevelOf(doc, layer, levelled) };
  });
}

/**
 * Primary GM, once per world: trims written on the first build's bases are converted so nothing anyone hears changes.
 * `soundTrimsBase` says how far this world has come:
 *   1 → the full conversion (§58.11 + §58.12): the trims moved and the heard-but-untrimmed sounds given theirs; the map as
 *       it was kept in `soundTrimsV1`; → 3.
 *   2 → acccf7e's conversion already ran (his GM load 2026-11-16 22:29: 317 moved, correct, V1 = the 472 kept) but it did
 *       not cover the heard-but-untrimmed sounds. FILL-IN only (§58.13): those sounds (21 there), measured against V1,
 *       never a key that already has a trim, never a second conversion of a trim; → 3.
 *   3 → done.
 */
export async function rebaseTrimsOnce() {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return null;
  const stage = Number(setting("soundTrimsBase", 1)) || 1;
  if (stage >= 3) return null;
  // without the deck's table every base would read wrong (a levelled sound's old base IS its table value): wait
  if (!levelled && game.modules?.get?.("deck-command")?.active) return null;
  const trims = trimsNow();
  let plan;
  if (stage < 2) {
    plan = planTrimRebase(trims, seatSounds(trims));
  } else {
    const v1 = setting("soundTrimsV1", {});
    const ref = v1 && typeof v1 === "object" && Object.keys(v1).length ? v1 : trims;
    const fill = seatSounds(ref).filter((x) => x.measured && !(x.key in trims));
    plan = planTrimRebase(trims, fill);
  }
  try {
    if (plan.moved.length) {
      if (stage < 2) await game.settings.set(MODULE_ID, "soundTrimsV1", trims);
      await game.settings.set(MODULE_ID, "soundTrims", plan.trims);
    }
    await game.settings.set(MODULE_ID, "soundTrimsBase", 3);
    console.log(`${MODULE_ID} | trims ${stage < 2 ? "converted to the levelled bases" : "filled in for the sounds heard untrimmed"}: ${plan.moved.length} ${stage < 2 ? "moved" : "added"}, ${plan.clamped.length} clamped`, plan.clamped);
  } catch (e) { console.warn(`${MODULE_ID} | trims: could not convert`, e?.message); }
  return plan;
}

export function registerSoundMix() {
  patchMix();
  loadLevelled().then(() => rebaseTrimsOnce());
  game.audio?.unlock?.then?.(() => applyMix());
}
