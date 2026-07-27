import { MODULE_ID } from "./preset.js";
import { socket } from "./rpc.js";
import { isPhoneClient } from "./shell.js";
import { isExecutor } from "./settings.js";
import { seanceSync, seancePhrase } from "./seance.js"; // §30 séance board (TV overlay)

// §26 Effects tab (spike) — DM-triggered table ambience, three kinds under one catalog:
//   scene   — shortcuts to Foundry's own scene data (weather particles, darkness). Foundry
//             syncs scene data everywhere on its own; we never mirror it.
//   client  — screen filters (canvas.environment) + procedural sound loops. Driven by ONE
//             world setting (fxActive) so the TV re-applies after a reload and a late-joining
//             client catches up — no fire-and-forget socket state to drift.
//   oneShot — fire-and-forget moments (lightning): socket broadcast, each client performs it.
//
// All SOUND here is synthesized in WebAudio (filtered noise — rain hiss, wind gusts, thunder
// rumble). Nothing is a recording, so there is nothing to license, nothing to download, and
// nothing to ship. Output feeds game.audio.environment's gain node, so Foundry's own Ambient
// volume slider (and the TV volume mirroring built on it) governs the level.
//
// Filters and sounds run on CANVAS clients only (DM + display). Phones skip both — no canvas
// to filter, and a table of phones playing the same loop at different latencies is an echo,
// not ambience. The lightning FLASH is the one thing phones do get: every screen at the table
// lighting up white together is the effect.

/* -------------------------------------------- */
/*  Catalog                                     */
/* -------------------------------------------- */

// Drawer order for the panel. One-shots render as plain buttons, the rest as toggles.
// `player` effects target ONE user's phone — the panel pairs them with a player picker.
export const FX_TABS = {
  weather: ["rain", "rainStorm", "snow", "blizzard", "fog", "leaves", "night", "heat", "dust", "storm", "lightning"],
  moments: ["bell"],
  magical: ["rainbow", "invert", "dreamy", "drained"],
  player: ["heartbeat", "woozy", "static"]
};

// weather: a CONFIG.weatherEffects id (Foundry 14 ships leaves/rain/rainStorm/fog/snow/blizzard;
// scene.weather is single-slot, so turning one on replaces another — dmToggleFx mirrors that in
// fxActive). darkness: the night fade. filter/sound: client-side keys into the makers below.
export const FX_DEFS = {
  rain: { label: "Rain", icon: "fa-cloud-rain", weather: "rain", sound: "rain", hint: "Rain on the map + a soft rain loop" },
  rainStorm: { label: "Downpour", icon: "fa-cloud-showers-heavy", weather: "rainStorm", sound: "rainHeavy", hint: "Driving rain + a heavier loop" },
  snow: { label: "Snow", icon: "fa-snowflake", weather: "snow", hint: "Quiet snowfall" },
  blizzard: { label: "Blizzard", icon: "fa-icicles", weather: "blizzard", sound: "blizzard", hint: "Whiteout + gusting wind" },
  fog: { label: "Fog", icon: "fa-smog", weather: "fog", hint: "Rolling ground fog" },
  leaves: { label: "Leaves", icon: "fa-leaf", weather: "leaves", hint: "Autumn leaves on the wind" },
  night: { label: "Night", icon: "fa-moon", darkness: true, hint: "Fade the scene to night — again for day" },
  heat: { label: "Heat Haze", icon: "fa-temperature-high", filter: "heat", hint: "Rising shimmer + a warm tint" },
  dust: { label: "Dust Storm", icon: "fa-wind", weather: "fog", filter: "dust", sound: "dustWind", hint: "Ochre haze, low wind, fog particles as dust" },
  lightning: { label: "Lightning", icon: "fa-bolt", oneShot: true, hint: "White flash on every screen, thunder a beat later" },
  storm: { label: "Storm", icon: "fa-cloud-bolt", state: true, hint: "Distant flashes + thunder roll in on their own every minute or two" },
  bell: { label: "Doom Bell", icon: "fa-bell", oneShot: true, hint: "One toll per press — phones dim with each toll" },
  heartbeat: { label: "Heartbeat", icon: "fa-heart-pulse", player: "state", hint: "Their phone pulses red with a heartbeat only they get" },
  woozy: { label: "Woozy", icon: "fa-flask", player: "state", hint: "Drunk, poisoned, concussed — their phone wobbles and blurs" },
  static: { label: "Static", icon: "fa-wave-square", player: "shot", oneShot: true, hint: "A half-second cursed glitch on their phone" },
  // §30 séance board: the toggle is a normal fxActive state (survives TV reloads); the phrase
  // is a one-shot with { text }. Neither renders as a grid chip — the panel's Séance drawer
  // owns their UI (a toggle plus a phrase input need more than a chip).
  seance: { label: "Séance", icon: "fa-circle-dot", state: true, hint: "The spirit board on the table display" },
  seancePhrase: { label: "Spell it out", icon: "fa-hand-point-up", oneShot: true, hint: "The planchette spells the phrase" },
  rainbow: { label: "Rainbow", icon: "fa-rainbow", filter: "rainbow", hint: "The whole scene cycles through hues" },
  invert: { label: "Invert", icon: "fa-circle-half-stroke", filter: "invert", hint: "Negative — an unsettling other-side look" },
  dreamy: { label: "Dreamy", icon: "fa-cloud-moon", filter: "dreamy", hint: "Soft blur — dream sequences, visions" },
  drained: { label: "Drained", icon: "fa-droplet-slash", filter: "drained", hint: "All colour drained out" }
};

export function fxActiveMap() {
  try { return game.settings.get(MODULE_ID, "fxActive") ?? {}; } catch (e) { return {}; }
}

// One state source per kind: client effects read fxActive; pure weather reads the scene
// (authoritative — another module or the scene config can change it under us); night reads
// the darkness level, so the toggle agrees with a sunset the DM set by hand.
export function fxIsOn(id) {
  const def = FX_DEFS[id];
  if (!def) return false;
  if (def.filter || def.sound || def.state) return !!fxActiveMap()[id];
  if (def.weather !== undefined) return canvas?.scene?.weather === def.weather;
  // _source, not prepared: during the 5s animateDarkness fade the PREPARED level is the
  // animation's current frame (environment.mjs writes the canvas value back onto the scene),
  // so the toggle would read stale-day for 5s after tapping Night. Source is the intent.
  if (def.darkness) return (canvas?.scene?._source?.environment?.darknessLevel ?? 0) >= 0.55;
  return false;
}

// --- per-player targeting. A player-state effect stores { users: [ids] } in fxActive, so one
// world entry drives every targeted phone and survives their reloads like any other state.
export function fxTargets(id) {
  const v = fxActiveMap()[id];
  return Array.isArray(v?.users) ? v.users : [];
}
export function fxIsOnFor(id, userId) { return fxTargets(id).includes(userId); }

export async function dmToggleFxFor(id, userId) {
  const def = FX_DEFS[id];
  if (def?.player !== "state" || !game.user.isGM || !userId) return;
  const cur = { ...fxActiveMap() };
  const users = new Set(fxTargets(id));
  if (users.has(userId)) users.delete(userId); else users.add(userId);
  if (users.size) cur[id] = { users: [...users] }; else delete cur[id];
  await game.settings.set(MODULE_ID, "fxActive", cur);
}

/* -------------------------------------------- */
/*  DM side — toggle / fire                     */
/* -------------------------------------------- */

export async function dmToggleFx(id) {
  const def = FX_DEFS[id];
  if (!def || def.oneShot || !game.user.isGM) return;
  const sc = canvas?.scene;
  const wantOn = !fxIsOn(id);
  if (def.darkness) {
    // A slow astronomical fade, not a light switch. 0.05 not 0 so "day" still reads as lit.
    await sc?.update({ "environment.darknessLevel": wantOn ? 0.85 : 0.05 }, { animateDarkness: 5000 });
    return;
  }
  if (def.weather !== undefined && sc) await sc.update({ weather: wantOn ? def.weather : "" });
  const cur = { ...fxActiveMap() };
  let dirty = false;
  if (wantOn && def.weather !== undefined) {
    // scene.weather is single-slot: the weather we just replaced must drop its sound/filter too,
    // or Blizzard-after-Rain plays both loops over snow.
    for (const k of Object.keys(cur)) {
      if (k !== id && FX_DEFS[k]?.weather !== undefined) { delete cur[k]; dirty = true; }
    }
  }
  if (def.filter || def.sound || def.state) {
    if (wantOn) cur[id] = true; else delete cur[id];
    dirty = true;
  }
  if (dirty) await game.settings.set(MODULE_ID, "fxActive", cur);
}

// extra: optional payload — { users: [ids] } narrows a one-shot to those clients (static),
// { soft } is the storm's distant strike.
export function dmFireFx(id, extra = {}) {
  if (!FX_DEFS[id]?.oneShot || !game.user.isGM) return;
  const payload = { id, ...extra };
  if (socket) socket.executeForEveryone("fxOneShot", payload);
  else handleFxOneShot(payload); // socketlib missing — at least the DM's own screen fires
}

/* -------------------------------------------- */
/*  One-shots                                   */
/* -------------------------------------------- */

export function handleFxOneShot({ id, users, soft, text, level } = {}) {
  // A targeted one-shot names its audience; everyone else drops it silently.
  if (Array.isArray(users) && users.length && !users.includes(game.user.id)) return;
  if (id === "lightning") lightningLocal(!!soft);
  else if (id === "bell") bellLocal();
  else if (id === "static") staticLocal(level);
  else if (id === "seancePhrase") seancePhrase(text); // no-op on clients without the board
}

function overlayShot(className, ttlMs) {
  const d = document.createElement("div");
  d.className = className;
  document.body.appendChild(d);
  d.addEventListener("animationend", () => d.remove());
  setTimeout(() => { try { d.remove(); } catch (e) { /* already gone */ } }, ttlMs);
  return d;
}

function lightningLocal(soft = false) {
  // The flash is a DOM overlay, so it works on every client — phones included.
  // `soft` is the rolling storm's distant strike: dimmer flash, later + quieter thunder.
  overlayShot(soft ? "mc-fx-flash mc-fx-flash-soft" : "mc-fx-flash", 1500);
  // Close strike = thunder right on the flash's heels (DM 2026-07-26: "get thunder closer to
  // lightning" — distance is the STORM's job); soft distant strikes keep a real gap.
  if (!isPhoneClient()) playThunder(soft ? 1200 + Math.random() * 1500 : 150 + Math.random() * 350, soft ? 0.4 : 1);
}

// Doom bell: the toll on canvas clients, a slow dim pulse on EVERY screen — the phones dip
// dark together with each strike. One press = one toll; the DM taps the rhythm.
function bellLocal() {
  overlayShot("mc-fx-dim", 3200);
  if (!isPhoneClient()) playBell();
}

// Cursed static: a glitch overlay + a crackle burst + a vibration stutter. Targeted at one
// player's phone; plays wherever that user is logged in. `level` (0..1) scales EVERYTHING —
// the séance's escalating damage (§30.1) starts it "very weak" and grows it with the die;
// the standalone Player-drawer shot fires at a solid mid-strength.
function staticLocal(level = 0.65) {
  const k = Math.max(0.1, Math.min(1, Number(level) || 0.65));
  const d = overlayShot("mc-fx-static", 400 + 900 * k);
  // the keyframes multiply their opacities by --fxk (an inline `opacity` would be
  // overridden by the running animation)
  d.style.setProperty("--fxk", String(0.3 + 0.7 * k));
  d.style.animationDuration = `${0.35 + 0.65 * k}s`;
  try { navigator.vibrate?.(k < 0.35 ? [30] : k < 0.7 ? [40, 30, 80] : [40, 30, 80, 30, 40]); } catch (e) { /* not supported */ }
  const out = audioOut();
  if (!out) return;
  const { ctx, dest } = out;
  const src = noiseSource(ctx, false);
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1200;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(hp).connect(g).connect(dest);
  const t0 = ctx.currentTime;
  // ragged spikes, not a smooth burst — broken-signal, not wind; count grows with level
  const spikes = [[0, 0.30], [0.16, 0.18], [0.34, 0.26]].slice(0, k < 0.35 ? 1 : k < 0.7 ? 2 : 3);
  for (const [at, lvl] of spikes) {
    g.gain.setValueAtTime(lvl * k, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.004, t0 + at + 0.11);
  }
  src.start(t0); src.stop(t0 + 0.6);
}

// (Ghost Voice lived here 2026-07-26, for a day — speechSynthesis pitched down speaking DM-typed
// words. Cut by the DM the same day: "it IS very silly." DESIGN §26.6 keeps the record.)

/* -------------------------------------------- */
/*  Procedural audio (WebAudio, no assets)      */
/* -------------------------------------------- */

const noiseBuffers = new WeakMap(); // AudioContext -> 2s white-noise buffer, built once
const brownBuffers = new WeakMap(); // AudioContext -> 2s brown-noise buffer, built once

// Foundry's ambient channel: an AudioContext whose gainNode tracks the Ambient volume
// slider. Null until the first user gesture unlocks audio (core AudioHelper).
function audioOut() {
  const a = game.audio;
  if (!a || a.locked || !a.environment?.gainNode) return null;
  return { ctx: a.environment, dest: a.environment.gainNode };
}

let audioRetryQueued = false;
function queueAudioRetry() {
  // Audio still locked (no user gesture yet): core runs `pending` callbacks on the first
  // gesture — re-sync then so a loop toggled on before the DM ever clicked still starts.
  if (audioRetryQueued || !game.audio) return;
  audioRetryQueued = true;
  game.audio.pending.push(() => { audioRetryQueued = false; syncFx(); });
}

function noiseBuffer(ctx) {
  let buf = noiseBuffers.get(ctx);
  if (buf) return buf;
  const len = 2 * ctx.sampleRate;
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffers.set(ctx, buf);
  return buf;
}

function noiseSource(ctx, loop = true) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = loop;
  return src;
}

// Brown noise = integrated white, normalized: energy piles up at the BOTTOM of the spectrum.
// The first thunder shipped as white noise through a 420→55Hz lowpass — white spreads its energy
// evenly across 24kHz, so that filter kept ~2% of it and the "rumble" was inaudible next to the
// crack (DM 2026-07-26: "a small pop"). Brown noise IS rumble; the filter only shapes it.
function brownBuffer(ctx) {
  let buf = brownBuffers.get(ctx);
  if (buf) return buf;
  const len = 2 * ctx.sampleRate;
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // leaky integrator — no DC drift
    data[i] = last;
    peak = Math.max(peak, Math.abs(last));
  }
  for (let i = 0; i < len; i++) data[i] /= peak; // normalize to full scale
  brownBuffers.set(ctx, buf);
  return buf;
}

function brownSource(ctx, loop = true) {
  const src = ctx.createBufferSource();
  src.buffer = brownBuffer(ctx);
  src.loop = loop;
  return src;
}

// Steady rain: band-limited noise. The high band is the hiss; the width sets how hard it reads.
function rainLoop(ctx, dest, { gain, lp }) {
  const src = noiseSource(ctx);
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 500;
  const lpF = ctx.createBiquadFilter(); lpF.type = "lowpass"; lpF.frequency.value = lp;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(hp).connect(lpF).connect(g).connect(dest);
  g.gain.setTargetAtTime(gain, ctx.currentTime, 1.5); // ease in, not a hard start
  src.start();
  return { stop() { g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { try { src.stop(); g.disconnect(); } catch (e) { /* ctx closed */ } }, 2500); } };
}

// Wind: narrow noise band whose centre and level wander — the wandering IS the gust.
function windLoop(ctx, dest, { center, q, base, gustLo, gustHi, period }) {
  const src = noiseSource(ctx);
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = center; bp.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(bp).connect(g).connect(dest);
  g.gain.setTargetAtTime(base, ctx.currentTime, 1.2);
  src.start();
  const gust = setInterval(() => {
    const now = ctx.currentTime;
    g.gain.setTargetAtTime(gustLo + Math.random() * (gustHi - gustLo), now, period / 2500);
    bp.frequency.setTargetAtTime(center * (0.75 + Math.random() * 0.6), now, period / 2000);
  }, period);
  return { stop() { clearInterval(gust); g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { try { src.stop(); g.disconnect(); } catch (e) { /* ctx closed */ } }, 2500); } };
}

// Gain note: the wind band-passes keep only ~10–20% of white noise's amplitude (narrow band of
// a flat spectrum — same physics that made thunder v1 a pop), so their gains run WAY above the
// rain's. These are pre-filter values, not output loudness.
const SOUND_MAKERS = {
  rain: (ctx, dest) => rainLoop(ctx, dest, { gain: 0.10, lp: 6500 }),
  rainHeavy: (ctx, dest) => rainLoop(ctx, dest, { gain: 0.17, lp: 9500 }),
  blizzard: (ctx, dest) => windLoop(ctx, dest, { center: 750, q: 0.6, base: 0.15, gustLo: 0.25, gustHi: 0.72, period: 2400 }),
  dustWind: (ctx, dest) => windLoop(ctx, dest, { center: 220, q: 0.7, base: 0.16, gustLo: 0.25, gustHi: 0.60, period: 3200 })
};

// Thunder v2 (DM 2026-07-26: v1 was "a small pop" — see brownBuffer for the physics). Three
// layers: the crack (kept from v1 — it was the one audible part), a BROWN-noise body whose
// amplitude WOBBLES as it decays (real thunder rolls, it doesn't fade smoothly), and a sub-sine
// sweep for chest weight on speakers that can reach it. delayMs ≈ distance; scale (0..1) is how
// far away it FEELS — the storm's ambient strikes come in at 0.4.
function playThunder(delayMs, scale = 1) {
  const out = audioOut();
  if (!out) return; // pre-gesture — a silent strike beats a console error
  const { ctx, dest } = out;
  const t0 = ctx.currentTime + delayMs / 1000;

  // The crack v3 (DM: v2's crack "sounds very small and weak"): a close strike doesn't pop, it
  // TEARS. v2 band-passed at 2.5kHz — thin by construction (narrow band of a flat spectrum,
  // the same energy mistake as the v1 rumble). Now it's BROADBAND — everything above 200Hz at
  // near-full level — with a second ragged hit 70ms behind, like the air ripping twice.
  const mkCrack = (at, level, decayS) => {
    const src = noiseSource(ctx, false);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 200;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(hp).connect(g).connect(dest);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, at + decayS);
    src.start(at); src.stop(at + decayS + 0.1);
  };
  mkCrack(t0, 0.9 * scale, 0.45);
  mkCrack(t0 + 0.07, 0.45 * scale, 0.3);

  // Rolling body: brown noise (loops — the 2s buffer would otherwise die mid-roll, another
  // v1 bug) → lowpass sweeping down → a wobble gain staggering between random levels → the
  // decay envelope. The wobble is what turns "a long noise" into "thunder rolling away".
  const mkRoll = (at, level, holdS, tau) => {
    const src = brownSource(ctx, true);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(500, at);
    lp.frequency.exponentialRampToValueAtTime(80, at + 5);
    const wob = ctx.createGain(); wob.gain.value = 1;
    let wt = at + 0.35;
    while (wt < at + holdS + 3) {
      wob.gain.setTargetAtTime(0.4 + Math.random() * 0.6, wt, 0.22);
      wt += 0.3 + Math.random() * 0.55;
    }
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp).connect(wob).connect(g).connect(dest);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.12);
    g.gain.setTargetAtTime(0, at + holdS, tau);
    src.start(at); src.stop(at + holdS + 6);
  };
  // The body waits 0.25s so the crack OWNS the onset (also what keeps the summed peak under
  // full scale — the v3 mix measured 0.87 peak-sample offline; crack at 0.9 over an instant
  // body clipped). Levels are measurement-tuned: don't nudge without re-rendering.
  mkRoll(t0 + 0.25, 0.7 * scale, 1.2, 1.3);   // the main body
  mkRoll(t0 + 1.7, 0.35 * scale, 0.8, 1.6);   // a quieter roll behind it

  // Sub weight: an 85→45Hz sine dive. Small speakers skip it; good ones shake the table.
  const sub = ctx.createOscillator(); sub.type = "sine";
  sub.frequency.setValueAtTime(85, t0);
  sub.frequency.exponentialRampToValueAtTime(45, t0 + 3);
  const sg = ctx.createGain(); sg.gain.value = 0;
  sub.connect(sg).connect(dest);
  sg.gain.setValueAtTime(0, t0 + 0.2);
  sg.gain.linearRampToValueAtTime(0.4 * scale, t0 + 0.35);
  sg.gain.setTargetAtTime(0, t0 + 0.9, 1.0);
  sub.start(t0); sub.stop(t0 + 6);
}

// Doom bell: a struck bell is a stack of INHARMONIC partials — hum, prime, tierce, quint,
// nominal — each dying at its own rate, plus a noise thud at the strike. Low fundamental,
// long decay: a bell you hear with your chest.
function playBell() {
  const out = audioOut();
  if (!out) return;
  const { ctx, dest } = out;
  const t0 = ctx.currentTime + 0.02;
  const f0 = 82; // deep — a tower bell, not a dinner bell
  for (const [ratio, level, decay] of [[0.5, 0.28, 6.5], [1, 0.34, 5.5], [1.19, 0.20, 4.0], [1.56, 0.14, 3.2], [2.0, 0.16, 2.4], [2.66, 0.07, 1.4]]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f0 * ratio * (1 + (Math.random() - 0.5) * 0.004); // hair of detune = "metal"
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g).connect(dest);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + 0.015);
    g.gain.setTargetAtTime(0, t0 + 0.03, decay / 4);
    o.start(t0); o.stop(t0 + decay + 1);
  }
  const thud = noiseSource(ctx, false);
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
  const tg = ctx.createGain(); tg.gain.value = 0;
  thud.connect(lp).connect(tg).connect(dest);
  tg.gain.setValueAtTime(0.35, t0);
  tg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
  thud.start(t0); thud.stop(t0 + 0.25);
}

/* -------------------------------------------- */
/*  Screen filters (PIXI 7, canvas.environment)  */
/* -------------------------------------------- */

// canvas.environment = primary + effects (map, tokens, lighting) but NOT the interface
// group, so rulers, the HUD and cursors stay crisp through any of these.

// Smooth blob-noise texture for the heat displacement — generated, like the audio.
function makeNoiseTexture() {
  const size = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  g.fillStyle = "rgb(128,128,255)"; // neutral displacement
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 8 + Math.random() * 26;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    const dr = Math.floor(Math.random() * 90 - 45), dg = Math.floor(Math.random() * 90 - 45);
    rad.addColorStop(0, `rgba(${128 + dr},${128 + dg},255,0.35)`);
    rad.addColorStop(1, "rgba(128,128,255,0)");
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const tex = PIXI.Texture.from(cv);
  tex.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
  return tex;
}

// Each maker returns { filters: [...], tick?, sprite? }. tick runs on the app ticker
// (delta = frames at 60fps) only while at least one animated filter is mounted.
const FILTER_MAKERS = {
  rainbow: () => {
    const f = new PIXI.ColorMatrixFilter();
    let deg = 0;
    return { filters: [f], tick: (d) => { deg = (deg + d * 1.2) % 360; f.hue(deg, false); } };
  },
  invert: () => {
    const f = new PIXI.ColorMatrixFilter();
    f.negative(false);
    return { filters: [f] };
  },
  drained: () => {
    const f = new PIXI.ColorMatrixFilter();
    f.desaturate();
    return { filters: [f] };
  },
  dreamy: () => {
    const b = new PIXI.BlurFilter(2.5, 2);
    const c = new PIXI.ColorMatrixFilter();
    c.saturate(0.15, false);
    return { filters: [b, c] };
  },
  dust: () => {
    // Ochre haze: warm the channels, crush blue, lift the floor a touch so it reads as
    // airborne dust rather than a colour-graded photo.
    const f = new PIXI.ColorMatrixFilter();
    const m = f.matrix;
    m[0] = 1.10; m[4] = 0.05;   // r scale + lift
    m[6] = 0.92; m[9] = 0.03;   // g
    m[12] = 0.62;               // b crushed
    return { filters: [f] };
  },
  heat: () => {
    const sprite = new PIXI.Sprite(makeNoiseTexture());
    sprite.renderable = false; // transform + texture feed the filter; nothing to draw
    canvas.stage.addChild(sprite);
    const disp = new PIXI.DisplacementFilter(sprite);
    disp.scale.set(7, 9);
    const warm = new PIXI.ColorMatrixFilter();
    const m = warm.matrix;
    m[0] = 1.06; m[12] = 0.94;
    return {
      filters: [disp, warm], sprite,
      tick: (d) => { sprite.y -= 0.7 * d; sprite.x = Math.sin(sprite.y / 45) * 14; } // shimmer rises
    };
  }
};

const mountedFilters = new Map(); // fx id -> maker result
const activeLoops = new Map();    // fx id -> { stop }
let tickerOn = false;

function fxTick(delta) {
  for (const m of mountedFilters.values()) m.tick?.(delta);
}
function ensureTicker() {
  if (!tickerOn && canvas?.app) { canvas.app.ticker.add(fxTick); tickerOn = true; }
}
function maybeStopTicker() {
  if (tickerOn && ![...mountedFilters.values()].some(m => m.tick)) {
    canvas?.app?.ticker?.remove(fxTick);
    tickerOn = false;
  }
}

function mountFilter(id, def) {
  if (mountedFilters.has(id) || !canvas?.ready) return;
  let m;
  try { m = FILTER_MAKERS[def.filter]?.(); } catch (e) { console.error(`${MODULE_ID} | fx filter ${id} failed to build`, e); }
  if (!m) return;
  mountedFilters.set(id, m);
  const env = canvas.environment;
  env.filters = [...(env.filters ?? []), ...m.filters];
  // Confine the filter pass to the visible screen — the environment group's bounds are the
  // whole scene rect, and full-scene FBOs are exactly the cost a modest GPU can't pay.
  // renderer.screen is updated in place on resize, so the reference stays correct.
  env.filterArea = canvas.app.renderer.screen;
  if (m.tick) ensureTicker();
}

function unmountFilter(id) {
  const m = mountedFilters.get(id);
  if (!m) return;
  mountedFilters.delete(id);
  const env = canvas?.environment;
  if (env?.filters) {
    env.filters = env.filters.filter((f) => !m.filters.includes(f));
    if (!env.filters.length) { env.filters = null; env.filterArea = null; }
  }
  try { m.sprite?.destroy({ children: true, texture: true, baseTexture: true }); } catch (e) { /* torn down with the canvas */ }
  maybeStopTicker();
}

function startLoop(id, def) {
  if (activeLoops.has(id)) return;
  const out = audioOut();
  if (!out) { queueAudioRetry(); return; }
  try { activeLoops.set(id, SOUND_MAKERS[def.sound](out.ctx, out.dest)); }
  catch (e) { console.error(`${MODULE_ID} | fx sound ${id} failed to start`, e); }
}

function stopLoop(id) {
  const h = activeLoops.get(id);
  if (!h) return;
  activeLoops.delete(id);
  try { h.stop(); } catch (e) { /* context died */ }
}

/* -------------------------------------------- */
/*  Per-player phone states (heartbeat, woozy)   */
/* -------------------------------------------- */

// These run on the TARGETED user's client (any device they're logged in on) — DOM overlays,
// a private audio pulse, vibration. Private theatre: the rest of the table sees nothing.
const PHONE_FX = {
  heartbeat: {
    start() {
      const d = document.createElement("div");
      d.className = "mc-fxp-heart";
      document.body.appendChild(d);
      const beat = setInterval(() => {
        try { navigator.vibrate?.([70, 110, 50]); } catch (e) { /* not supported */ }
        const out = audioOut();
        if (!out) return;
        const { ctx, dest } = out;
        const t0 = ctx.currentTime;
        for (const [at, lvl] of [[0, 0.5], [0.22, 0.32]]) { // lub … dub
          // Two layers per beat: the 55Hz body (chest weight on speakers that reach it) and a
          // 165Hz triangle "knock" — PHONE speakers roll off below ~200Hz and would render the
          // sine alone as silence (the thunder-pop lesson, applied where it bites hardest).
          const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = 55;
          const g = ctx.createGain(); g.gain.value = 0;
          o.connect(g).connect(dest);
          g.gain.setValueAtTime(0, t0 + at);
          g.gain.linearRampToValueAtTime(lvl, t0 + at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.16);
          o.start(t0 + at); o.stop(t0 + at + 0.25);
          const k = ctx.createOscillator(); k.type = "triangle"; k.frequency.value = 165;
          const kg = ctx.createGain(); kg.gain.value = 0;
          k.connect(kg).connect(dest);
          kg.gain.setValueAtTime(0, t0 + at);
          kg.gain.linearRampToValueAtTime(lvl * 0.45, t0 + at + 0.015);
          kg.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.11);
          k.start(t0 + at); k.stop(t0 + at + 0.18);
        }
      }, 1000);
      return { el: d, beat };
    },
    stop(h) { clearInterval(h.beat); try { h.el.remove(); } catch (e) { /* gone */ } }
  },
  woozy: {
    start() {
      document.body.classList.add("mc-fxp-woozy");
      return {};
    },
    stop() { document.body.classList.remove("mc-fxp-woozy"); }
  }
};

const activePhoneFx = new Map(); // fx id -> start() handle

/* -------------------------------------------- */
/*  Rolling storm — the executor is the sky      */
/* -------------------------------------------- */

// ONE client schedules (the executor), everyone receives the broadcast strike — independent
// per-client timers would flash the TV and the phones at different moments. First strike lands
// 3–18s after the toggle so the DM gets feedback; then one every ~40s–2.5min, mostly distant.
let stormTimer = null;
function scheduleStormStrike(first = false) {
  clearTimeout(stormTimer);
  stormTimer = setTimeout(() => {
    if (!fxActiveMap().storm || !isExecutor()) { stormTimer = null; return; }
    dmFireFx("lightning", { soft: Math.random() < 0.75 });
    scheduleStormStrike();
  }, first ? 3000 + Math.random() * 15000 : 40000 + Math.random() * 110000);
}

/* -------------------------------------------- */
/*  Client engine — keep local state == fxActive */
/* -------------------------------------------- */

export function syncFx() {
  const phone = isPhoneClient();
  const active = fxActiveMap();
  for (const [id, def] of Object.entries(FX_DEFS)) {
    if (def.filter) {
      if (active[id] && !phone && canvas?.ready) mountFilter(id, def);
      else unmountFilter(id);
    }
    if (def.sound) {
      if (active[id] && !phone) startLoop(id, def);
      else stopLoop(id);
    }
    if (def.player === "state") {
      const on = fxTargets(id).includes(game.user.id);
      const h = activePhoneFx.get(id);
      if (on && !h) activePhoneFx.set(id, PHONE_FX[id].start());
      else if (!on && h) { activePhoneFx.delete(id); PHONE_FX[id].stop(h); }
    }
  }
  // Rolling storm: only the executor keeps the sky going.
  if (active.storm && isExecutor()) { if (!stormTimer) scheduleStormStrike(true); }
  else { clearTimeout(stormTimer); stormTimer = null; }
  // §30 séance board: mounts on the display + the DM's client (seance.js gates itself).
  seanceSync(!!active.seance);
}

export function registerFxEngine() {
  try { socket?.register("fxOneShot", handleFxOneShot); }
  catch (e) { console.warn(`${MODULE_ID} | could not register fxOneShot`, e); }
  Hooks.on("updateSetting", (s) => { if (s?.key === `${MODULE_ID}.fxActive`) syncFx(); });
  Hooks.on("canvasReady", () => syncFx()); // remount whatever fxActive still wants
  Hooks.on("canvasTearDown", () => {
    // REALLY unmount — don't just forget. canvas.environment and canvas.stage are persistent
    // groups that survive a re-draw, and a WEATHER change is itself a full canvas.draw()
    // (scene.mjs puts "weather" in the redraw list), so merely clearing the map here orphaned
    // every mounted filter the first time a weather toggle redrew the canvas.
    for (const id of [...mountedFilters.keys()]) unmountFilter(id);
  });
  syncFx();
}
