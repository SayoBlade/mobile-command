import { MODULE_ID } from "./preset.js";
import { socket } from "./rpc.js";
import { isPhoneClient } from "./shell.js";

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
export const FX_TABS = {
  weather: ["rain", "rainStorm", "snow", "blizzard", "fog", "leaves", "night", "heat", "dust", "lightning"],
  magical: ["rainbow", "invert", "dreamy", "drained"]
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
  if (def.filter || def.sound) return !!fxActiveMap()[id];
  if (def.weather !== undefined) return canvas?.scene?.weather === def.weather;
  // _source, not prepared: during the 5s animateDarkness fade the PREPARED level is the
  // animation's current frame (environment.mjs writes the canvas value back onto the scene),
  // so the toggle would read stale-day for 5s after tapping Night. Source is the intent.
  if (def.darkness) return (canvas?.scene?._source?.environment?.darknessLevel ?? 0) >= 0.55;
  return false;
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
  if (def.filter || def.sound) {
    if (wantOn) cur[id] = true; else delete cur[id];
    dirty = true;
  }
  if (dirty) await game.settings.set(MODULE_ID, "fxActive", cur);
}

export function dmFireFx(id) {
  if (!FX_DEFS[id]?.oneShot || !game.user.isGM) return;
  if (socket) socket.executeForEveryone("fxOneShot", { id });
  else handleFxOneShot({ id }); // socketlib missing — at least the DM's own screen fires
}

/* -------------------------------------------- */
/*  One-shots                                   */
/* -------------------------------------------- */

export function handleFxOneShot({ id } = {}) {
  if (id === "lightning") lightningLocal();
}

function lightningLocal() {
  // The flash is a DOM overlay, so it works on every client — phones included.
  const d = document.createElement("div");
  d.className = "mc-fx-flash";
  document.body.appendChild(d);
  d.addEventListener("animationend", () => d.remove());
  setTimeout(() => { try { d.remove(); } catch (e) { /* already gone */ } }, 1500);
  // Thunder trails the flash like real distance would; canvas clients only (see header).
  if (!isPhoneClient()) playThunder(600 + Math.random() * 1800);
}

/* -------------------------------------------- */
/*  Procedural audio (WebAudio, no assets)      */
/* -------------------------------------------- */

const noiseBuffers = new WeakMap(); // AudioContext -> 2s white-noise buffer, built once

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

const SOUND_MAKERS = {
  rain: (ctx, dest) => rainLoop(ctx, dest, { gain: 0.10, lp: 6500 }),
  rainHeavy: (ctx, dest) => rainLoop(ctx, dest, { gain: 0.17, lp: 9500 }),
  blizzard: (ctx, dest) => windLoop(ctx, dest, { center: 750, q: 0.6, base: 0.06, gustLo: 0.10, gustHi: 0.30, period: 2400 }),
  dustWind: (ctx, dest) => windLoop(ctx, dest, { center: 220, q: 0.7, base: 0.06, gustLo: 0.10, gustHi: 0.24, period: 3200 })
};

// Thunder: an initial high crack, then a low rumble whose filter sweeps down as it decays —
// the same shape a real strike leaves after the air stops ringing. delayMs ≈ distance.
function playThunder(delayMs) {
  const out = audioOut();
  if (!out) return; // pre-gesture — a silent strike beats a console error
  const { ctx, dest } = out;
  const t0 = ctx.currentTime + delayMs / 1000;

  const crack = noiseSource(ctx, false);
  const cbp = ctx.createBiquadFilter(); cbp.type = "bandpass"; cbp.frequency.value = 2500; cbp.Q.value = 0.7;
  const cg = ctx.createGain(); cg.gain.value = 0;
  crack.connect(cbp).connect(cg).connect(dest);
  cg.gain.setValueAtTime(0, t0);
  cg.gain.linearRampToValueAtTime(0.5, t0 + 0.012);
  cg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
  crack.start(t0); crack.stop(t0 + 0.35);

  const mkRumble = (at, level, tau) => {
    const src = noiseSource(ctx, false);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(420, at);
    lp.frequency.exponentialRampToValueAtTime(55, at + 4.5);
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp).connect(g).connect(dest);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.08);
    g.gain.setTargetAtTime(0, at + 0.25, tau);
    src.start(at); src.stop(at + 6);
  };
  mkRumble(t0 + 0.05, 0.5, 1.1);   // the main body
  mkRumble(t0 + 1.3, 0.18, 1.5);   // a quieter roll behind it
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
  }
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
