/**
 * ONE MIX FOR THE TABLE (DM 2026-11-16: "The syrinscape environmental loops are REALLLLLLLLY quite, music completely
 * hides them, music should be fairly quite with environmentals clearly heard over them, and they all need to be at
 * around 25-50% volume so the DM's voice is clearly heard"). DESIGN §58.
 *
 * Three LAYERS, each one gain for the whole table, applied on every screen that plays sound (TV, his PC, players):
 *   music        his room / fight / mood music and the music stings (playlists flagged a music role), music beds
 *   environment  every loop: beds, ambiences, the deck's loops, ambient sounds on the map
 *   cues         one-shots: the deck's cues, the rooms' cues, dice and the interface
 * Syrinscape plays through its own player, so the same three layers are written to its three groups (ambience =
 * its global volume, its music group, its one-shot group), each with a fixed LIFT that makes a Syrinscape sound at
 * layer 1 as loud as ours at layer 1 (measured on the TV, seat 3 2026-11-16).
 *
 * HOW, WITHOUT TOUCHING A SOUND OR HIS SLIDERS. Each Foundry channel (Music, Environment, Interface) is a context whose
 * gain node IS his slider. We add, after it, one TRIM per channel (its own layer) and, before it, one GROUP node per
 * layer; a playlist sound is routed into the group of its layer (its `destination`, set before it first plays), so it
 * ends up at  its own volume × his slider × its layer  whatever channel the playlist is on. Anything else on a channel
 * (ambient sounds, our synthesised loops, dice) takes that channel's layer through the trim. Nothing is written to a
 * document or a client setting; a reload rebuilds it. The duck (§25.6) and the TV mute still work on the slider node.
 *
 * World setting `soundMix` = { music, environment, cues } gains (1 = as it plays), absent = the defaults below.
 */
import { MODULE_ID } from "./preset.js";
import { isBed, bedKind } from "./music-core.js";

export const LAYERS = Object.freeze(["music", "environment", "cues"]);
export const CHANNEL_LAYER = Object.freeze({ music: "music", environment: "environment", interface: "cues" });

/**
 * THE DESIGNED MIX (2026-11-16, from the seat 3 measurements; owed a seat measurement before it is trusted).
 * - music 0.15 (−16.5 dB): his room music measured −29 dBFS on the TV, the loudest thing at the table; now ≈ −45,
 *   8 dB under the environment.
 * - environment 1, cues 1: the deck's loops and cues were already levelled (−27 / −25 LUFS, 11-14) and sit ≈ −39 /
 *   −37 on the TV. They stay; the Syrinscape scale fix (syrinscape-bridge.js) brings Syrinscape up to them.
 * Syrinscape lifts, in dB (what a Syrinscape group needs, before his Environment slider, to match ours at layer 1):
 * - ambience 18.75: the most Syrinscape allows (+18.75 dB = its 1.5). Ambient moods measured a median ≈ −50 at the old
 *   net 0 dB; +12.7 dB from the scale fix puts them at ≈ −37, level with our loops. Nothing higher is available.
 * - music 11.5: Syrinscape's music moods measured ≈ −34.5 at net 0; this puts them where his own music sits at the
 *   same layer (layer 1 → −29, the default 0.15 → ≈ −45).
 * - oneshots 3.2: Syrinscape one-shots measured ≈ −37 at net −2.5 dB; this keeps them on our Whistle (−37.3).
 */
export const MIX_DEFAULT = Object.freeze({ music: 0.15, environment: 1, cues: 1 });
export const SYR_LIFT_DB = Object.freeze({ ambience: 18.75, music: 11.5, oneshots: 3.2 });
export const LAYER_MIN = 0.001, LAYER_MAX = 4; // −60 dB … +12 dB: a layer never reaches 0 (the trim divides by it)

const num = (v) => (v == null || v === "" ? NaN : Number(v));
/** Pure: whatever is stored → { music, environment, cues }, each clamped, absent = the default. */
export function mixOf(raw) {
  const out = {};
  for (const l of LAYERS) {
    const v = num(raw?.[l]);
    out[l] = Number.isFinite(v) ? Math.min(Math.max(v, LAYER_MIN), LAYER_MAX) : MIX_DEFAULT[l];
  }
  return out;
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

/** Pure: the gains of one channel's rig. trim = the channel's layer; each group = its layer ÷ the trim. */
export function rigGains(mix, channel) {
  const m = mixOf(mix);
  const trim = m[CHANNEL_LAYER[channel] ?? "cues"];
  const groups = {};
  for (const l of LAYERS) groups[l] = m[l] / trim;
  return { trim, groups };
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
 * trap), 0.5 → 0.84 (−6 dB, not Syrinscape's −18.75), 1 → 1.
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
 * → { global, music, oneshot } Syrinscape values, plus `capped` when the ambience wanted more than Syrinscape has.
 */
export function syrinscapeNodes(mix, lift = SYR_LIFT_DB) {
  const m = mixOf(mix);
  const want = { ambience: dB(m.environment) + lift.ambience, music: dB(m.music) + lift.music, oneshots: dB(m.cues) + lift.oneshots };
  const maxDb = (SYR_MAX - 1) * SYR_DB_RANGE;
  const g = Math.min(want.ambience, maxDb);
  return {
    global: syrValueDb(g),
    music: syrValueDb(want.music - g),
    oneshot: syrValueDb(want.oneshots - g),
    capped: want.ambience > maxDb + 1e-9,
  };
}

// ── runtime ────────────────────────────────────────────────────────────────────────────────────────────────
const setting = (k, d) => { try { return game.settings.get(MODULE_ID, k); } catch (e) { return d; } };
export function mixNow() { return mixOf(setting("soundMix", {})); }

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
  const g = rigGains(mixNow(), r.channel);
  setGain(r.trim.gain, g.trim, ctx, smooth);
  for (const l of LAYERS) setGain(r.groups[l].gain, g.groups[l], ctx, smooth);
}

/** Every channel on this screen takes the current mix (at unlock and on a setting change). Syrinscape's groups are
 *  the bridge's (syncSyrinscapeLevels), called beside this from the setting's onChange. */
export function applyMix() {
  const a = game.audio;
  if (a && !a.locked) for (const ch of Object.keys(CHANNEL_LAYER)) { if (a[ch]) { rigOf(a[ch]); applyRig(a[ch]); } }
}

const battleLibId = () => setting("combatMusicPlaylist", "") || null;
const twinOf = (doc) => {
  const ref = doc?.flags?.[MODULE_ID]?.localFallback;
  if (!ref || typeof ref !== "string") return null;
  try { return fromUuidSync(ref); } catch (e) { return null; }
};

/** Route a freshly made Sound of `doc` into its layer's group, before its first play. */
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

/** GM: set any layer (a gain; null hands it back to the default). MobileCommand.soundScenes.mix({ music: 0.2 }). */
export async function setSoundMix(next = {}) {
  if (!game.user?.isGM) return { ok: false, reason: "GM only" };
  const was = { ...(setting("soundMix", {}) ?? {}) };
  const out = { ...was };
  for (const l of LAYERS) if (l in next) { const v = num(next[l]); if (Number.isFinite(v)) out[l] = Math.min(Math.max(v, LAYER_MIN), LAYER_MAX); else delete out[l]; }
  await game.settings.set(MODULE_ID, "soundMix", out);
  return { ok: true, mix: mixOf(out), was: mixOf(was) };
}

/** What plays where, for a console or the deck: the mix and this screen's Syrinscape values. */
export function soundMixState() {
  return { mix: mixNow(), syrinscape: syrinscapeNodes(mixNow()) };
}

export function registerSoundMix() {
  patchMix();
  game.audio?.unlock?.then?.(() => applyMix());
}
