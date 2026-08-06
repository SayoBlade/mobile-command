// §38.4a CARD NOISES — synthesised, not sampled.
//
// DM 2026-08-05: "I want card noises, can you get/make them or should I?" These are MADE, in
// WebAudio, at play time: a card's sound is a short burst of filtered noise with a fast attack,
// which is exactly what a synth is good at. That buys three things a sample pack doesn't —
// nothing to download or license, no files for a modest machine to hold, and every card is
// slightly different (the pitch and length jitter per play), so a six-card deal doesn't sound
// like the same click stamped six times.
//
// If the DM would rather have real recordings, `SAMPLES` below is the whole hook: point each
// kind at a file under the module and it wins over the synth.
import { MODULE_ID } from "./preset.js";

const SAMPLES = { deal: null, flip: null, place: null }; // e.g. "modules/mobile-command/sounds/deal.ogg"

let ctx = null;
let noise = null;      // one second of white noise, reused by every voice
let unlocked = false;

function context() {
  if (ctx) return ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  try { ctx = new C(); } catch (e) { return null; }
  return ctx;
}
function noiseBuffer(c) {
  if (noise) return noise;
  const n = c.sampleRate;
  noise = c.createBuffer(1, n, n);
  const d = noise.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}
// Browsers refuse to start audio before a gesture. The display client may sit untouched for
// hours, so we resume on the first interaction of any kind and then stop listening.
function armUnlock() {
  if (unlocked) return;
  const go = () => {
    unlocked = true;
    context()?.resume?.().catch(() => {});
    for (const e of ["pointerdown", "keydown", "touchstart"]) window.removeEventListener(e, go);
  };
  for (const e of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(e, go, { once: false });
}
function volume() {
  let v = 0.6;
  try { v = Number(game.settings.get(MODULE_ID, "cardVolume")); } catch (e) { /* default */ }
  if (!Number.isFinite(v)) v = 0.6;
  // Ride Foundry's own interface slider so the DM's master control still means something.
  let iface = 1;
  try { iface = Number(game.settings.get("core", "globalInterfaceVolume")); } catch (e) { /* 1 */ }
  return Math.max(0, Math.min(1, v)) * (Number.isFinite(iface) ? iface : 1);
}

// Brightness multiplier for the deck in play. Ash reads as heavier stock, Hoarfrost as thinner.
const TONE = { moonlit: 1, ash: 0.82, hoarfrost: 1.22 };
function tone() {
  try { return TONE[game.settings.get(MODULE_ID, "cardTheme")] ?? 1; } catch (e) { return 1; }
}

// A burst of noise shaped by a bandpass that falls as it decays — the sound of card stock
// sliding against card stock. `jitter` keeps repeats from sounding stamped.
function swish(c, out, { at = 0, dur = 0.14, from = 1900, to = 520, gain = 0.5, q = 0.8 } = {}) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.playbackRate.value = 0.85 + Math.random() * 0.3;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass"; bp.Q.value = q;
  const t = c.currentTime + at;
  bp.frequency.setValueAtTime(from * (0.9 + Math.random() * 0.2), t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(80, to), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(t); src.stop(t + dur + 0.02);
}
// The low knock of a card meeting the table.
function knock(c, out, { at = 0, freq = 104, gain = 0.32, dur = 0.11 } = {}) {
  const o = c.createOscillator();
  o.type = "sine";
  const t = c.currentTime + at;
  o.frequency.setValueAtTime(freq * (0.92 + Math.random() * 0.16), t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

/**
 * Play a card sound. `kind` is "deal" (one card sliding out), "flip" (turning face up) or
 * "place" (settling). Never throws and never blocks — audio is decoration.
 */
export function cardSound(kind = "deal", { at = 0 } = {}) {
  try {
    const vol = volume();
    if (vol <= 0) return;
    if (SAMPLES[kind]) { // a real recording, if the DM ever supplies one
      const a = new Audio(foundry.utils.getRoute(SAMPLES[kind]));
      a.volume = vol; a.play().catch(() => {});
      return;
    }
    const c = context();
    if (!c) return;
    armUnlock();
    if (c.state === "suspended") { c.resume?.().catch(() => {}); }
    const out = c.createGain();
    out.gain.value = vol;
    out.connect(c.destination);
    // Each deck sounds like what it's made of (§38.4a): Ash is thick, soft-cornered stock that
    // lands dull and low; Hoarfrost is thin and glassy and rings higher. `b` shifts every
    // filter and oscillator together, so one number carries the whole character.
    const b = tone();
    if (kind === "flip") {
      // Two transients: the corner lifting, then the face slapping down.
      swish(c, out, { at, dur: 0.07, from: 2600 * b, to: 900 * b, gain: 0.42, q: 1.1 });
      swish(c, out, { at: at + 0.055, dur: 0.1, from: 1500 * b, to: 420 * b, gain: 0.5 });
      knock(c, out, { at: at + 0.06, freq: 124 * b, gain: 0.2, dur: 0.08 });
    } else if (kind === "clank") {
      // A metal token hitting wood: a hard tick, then two detuned partials ringing briefly on
      // top of each other. Inharmonic on purpose — a harmonic pair reads as a bell, not metal.
      swish(c, out, { at, dur: 0.045, from: 5200 * b, to: 1800 * b, gain: 0.34, q: 1.6 });
      knock(c, out, { at, freq: 210 * b, gain: 0.26, dur: 0.07 });
      for (const [f, g, d] of [[1180, 0.16, 0.34], [1637, 0.11, 0.26], [2570, 0.06, 0.19]]) {
        const o = c.createOscillator(); o.type = "triangle";
        const t = c.currentTime + at + 0.004;
        o.frequency.setValueAtTime(f * b * (0.99 + Math.random() * 0.02), t);
        const gg = c.createGain();
        gg.gain.setValueAtTime(0.0001, t);
        gg.gain.exponentialRampToValueAtTime(g, t + 0.005);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(gg).connect(out); o.start(t); o.stop(t + d + 0.02);
      }
    } else if (kind === "place") {
      knock(c, out, { at, freq: 96 * b, gain: 0.34 });
      swish(c, out, { at, dur: 0.09, from: 1200 * b, to: 380 * b, gain: 0.28 });
    } else {
      swish(c, out, { at, from: 1900 * b, to: 520 * b });
      knock(c, out, { at: at + 0.05, freq: 104 * b, gain: 0.18, dur: 0.08 });
    }
  } catch (e) { /* decoration — never let it reach the table */ }
}

/** A whole hand going out: n cards, staggered, each a touch different. */
export function dealSound(n = 6) {
  for (let i = 0; i < n; i++) cardSound("deal", { at: i * 0.11 + Math.random() * 0.02 });
}
