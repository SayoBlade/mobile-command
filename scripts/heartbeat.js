// Critical-HP heartbeat (DM 2026-07-20): a stressful "lub-dub … lub-dub" double-tap pulse on the ring
// of a PC token at ≤20% HP. Foundry's built-in RING_PULSE is a plain sine (no double-tap, fixed speed),
// so this drives it ourselves: a red overlay ring whose alpha follows a real heartbeat envelope, redrawn
// each frame on the canvas (client-side — no document writes, no DB spam). Gated on the health-ring
// setting; non-phone clients only (phones have no canvas). Tunables up top so it's easy to dial in.
import { MODULE_ID } from "./preset.js";

const PERIOD_MS = 560;   // one full heartbeat (lub-dub + pause). ~107 bpm — fast/stressed.
const ALPHA_MIN = 0.12;  // ring never fully vanishes (reads as a steady red border between beats)
const ALPHA_MAX = 0.95;  // peak of a tap. Below full-flash to stay easy on the eyes.
const COLOR = 0xd84a3f;  // matches the ≤20% health band

let layer = null, rings = new Map(), tickerFn = null, t0 = 0;

// phase 0..1 → 0..1: two quick Gaussian taps (lub, then a slightly softer dub), then a flat pause.
function envelope(phase) {
  const bump = (p, c, w) => Math.exp(-((p - c) ** 2) / (2 * w * w));
  return Math.min(1, bump(phase, 0.00, 0.045) + 0.8 * bump(phase, 0.17, 0.05));
}

function isCritical(token) {
  try {
    if (!game.settings.get(MODULE_ID, "ringHealthColors")) return false;
    const a = token?.actor;
    if (a?.type !== "character" || !a.hasPlayerOwner) return false;
    const hp = a.system?.attributes?.hp;
    return !!hp?.max && (Number(hp.value) || 0) > 0 && (hp.value / hp.max) <= 0.2;
  } catch (e) { return false; }
}

function ensureLayer() {
  if (layer && !layer.destroyed) return;
  layer = new PIXI.Container();
  layer.eventMode = "none";
  (canvas.interface ?? canvas.stage)?.addChild(layer);
}

function rebuild() {
  try {
    if (!canvas?.ready) return;
    ensureLayer();
    const want = new Set((canvas.tokens?.placeables ?? []).filter(isCritical).map(t => t.id));
    for (const [id, g] of rings) if (!want.has(id)) { g.destroy(); rings.delete(id); }
    for (const t of canvas.tokens?.placeables ?? []) {
      if (want.has(t.id) && !rings.has(t.id)) { const g = new PIXI.Graphics(); layer.addChild(g); rings.set(t.id, g); }
    }
    if (rings.size && !tickerFn) start();
    else if (!rings.size && tickerFn) stop();
  } catch (e) { console.warn(`${MODULE_ID} | heartbeat rebuild failed`, e); }
}

function frame() {
  try {
    const phase = ((performance.now() - t0) % PERIOD_MS) / PERIOD_MS;
    const alpha = ALPHA_MIN + (ALPHA_MAX - ALPHA_MIN) * envelope(phase);
    for (const [id, g] of rings) {
      const t = canvas.tokens?.get(id);
      if (!t) { g.destroy(); rings.delete(id); continue; }
      const w = (t.document.width ?? 1) * canvas.grid.size, h = (t.document.height ?? 1) * canvas.grid.size;
      const r = Math.max(w, h) / 2;
      g.clear();
      g.lineStyle(Math.max(3, r * 0.09), COLOR, alpha);
      g.drawCircle(t.center.x, t.center.y, r * 0.97);
    }
    if (!rings.size) stop();
  } catch (e) { /* per-frame — never spam */ }
}

function start() { t0 = performance.now(); tickerFn = frame; canvas.app?.ticker?.add(tickerFn); }
function stop() { if (tickerFn) canvas.app?.ticker?.remove(tickerFn); tickerFn = null; for (const g of rings.values()) { try { g.clear(); } catch (e) {} } }

export function initHeartbeat() {
  Hooks.on("canvasReady", () => { for (const g of rings.values()) { try { g.destroy(); } catch (e) {} } rings.clear(); layer = null; tickerFn = null; rebuild(); });
  Hooks.on("updateActor", (_a, ch) => { if (foundry.utils.hasProperty(ch, "system.attributes.hp")) rebuild(); });
  Hooks.on("createToken", () => rebuild());
  Hooks.on("deleteToken", () => rebuild());
  Hooks.on("updateSetting", (s) => { if (s?.key === `${MODULE_ID}.ringHealthColors`) rebuild(); });
  if (canvas?.ready) rebuild();
}
