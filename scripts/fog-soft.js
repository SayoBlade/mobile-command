// Fog-of-war edge softening — now THREE styles (DM 2026-07-25: "try gpu fog, just make sure it's an
// option in settings"). The `fogStyle` world setting picks one, on the shared display only:
//
//   • "off"  — Foundry's stock fog (a hard-ish polygon edge with its default 5–9-tap blur).
//   • "soft" — Tier 0. CRANK Foundry's own visibility/vision blur filters so the seen↔unseen edge
//              feathers. Cheap (no extra passes beyond the wider kernel), but only EXISTS on High
//              performance mode (`canvas.blur.enabled = performance.mode > MED`), and Foundry's small
//              kernel caps how soft it gets. The panel reports if High mode is off.
//   • "gpu"  — Tier 1. Our OWN PIXI filter on the visibility layer: a 24-tap golden-spiral disc
//              gather that feathers the fog alpha far wider and smoother than Foundry's kernel, and
//              runs regardless of performance mode (it's our pass, not Foundry's). This is the real
//              real-fow look. Heavier on the display's GPU — hence opt-in, default off.
//
// Both "soft" and "gpu" also apply two style-independent DENSITY knobs (below): unexplored opacity
// (let a trace of the map bleed through the black) and explored lightness (how much of the remembered
// map shows). Only the EDGE treatment differs between them.
//
// SCOPE: display client only. Only the non-GM TV renders fog at all (a GM sees through everything),
// so any of this can only matter there. Legacy `softFog` boolean migrates to fogStyle="soft".

import { MODULE_ID } from "./preset.js";
import { isDisplayClient } from "./shell.js";

// --- Style resolution --------------------------------------------------------
// The chosen style, honouring the legacy `softFog` boolean (a world that had soft fog ON before the
// three-way setting existed keeps it). New default is "off".
function fogStyle() {
  try {
    const s = game.settings.get(MODULE_ID, "fogStyle");
    if (s === "soft" || s === "gpu" || s === "off") {
      if (s === "off") { // could be the untouched default masking a legacy soft-fog opt-in
        try { if (game.settings.get(MODULE_ID, "softFog")) return "soft"; } catch (e) { /* not registered */ }
      }
      return s;
    }
  } catch (e) { /* not registered yet */ }
  try { return game.settings.get(MODULE_ID, "softFog") ? "soft" : "off"; } catch (e) { return "off"; }
}

// --- Tier 0 (soft): crank Foundry's own blur ---------------------------------
// The effective feather is ≈ strength × zoom in SCREEN pixels; ×12 reads as clearly soft on a 1080p
// TV (DM 2026-07-25 wanted it softer, so it's up from the earlier ×8 — but Foundry's 5–9-tap kernel
// caps how far this goes, which is exactly why the "gpu" style exists).
const SOFT_FOG_MULT = 12;

// TWO borders, TWO blurs (the crux of "the dark-to-seen border is still very sharp"):
//   • canvas.visibility.filter        softens the EXPLORED / remembered fog (the shader's `r` channel).
//   • canvas.masks.vision.blurFilter  softens the CURRENT-vision edge (the `v` channel) — the black↔lit
//     border, which the visibility filter's blur never reaches, so it stayed a hard line.
function softFogFilters() {
  return [canvas?.visibility?.filter, canvas?.masks?.vision?.blurFilter].filter(f => f && f.blur !== undefined);
}

// --- Density knobs (shared by soft + gpu) ------------------------------------
// UNEXPLORED opacity — the black is the shader's `vec4(unexploredColor, 1.0)`. Dropping the whole
// visibility group's alpha lets a faint trace of the map bleed through ("nearly indistinguishable
// from black"). 0.95 → ~5% of the map shows. Independent of any blur; Foundry never sets this alpha.
const FOG_UNEXPLORED_ALPHA = 0.95;
// EXPLORED lightness — the remembered-but-unseen area draws as black at a hardcoded 0.5 alpha. The
// purpose-built lever is `canvas.colors.fogExplored`: a deep grey lifts the explored overlay a touch
// off pure black without washing it out. Effects re-applies it from this Color each refresh.
const FOG_EXPLORED_COLOR = 0x1a1a1a;
let priorFogExplored; // the display's stock fogExplored Color, restored on clear

function applyDensity() {
  try { if (canvas.visibility) canvas.visibility.alpha = FOG_UNEXPLORED_ALPHA; } catch (e) { /* best-effort */ }
  try {
    const Col = foundry.utils?.Color ?? globalThis.Color;
    const vis = canvas.visibility?.filter;
    if (Col && canvas.colors && vis) {
      if (priorFogExplored === undefined) priorFogExplored = canvas.colors.fogExplored;
      canvas.colors.fogExplored = Col.from(FOG_EXPLORED_COLOR);
      canvas.colors.fogExplored.applyRGB(vis.uniforms.exploredColor);
    }
  } catch (e) { /* best-effort */ }
}
function clearDensity() {
  try { if (canvas.visibility) canvas.visibility.alpha = 1; } catch (e) { /* best-effort */ }
  try {
    if (priorFogExplored !== undefined && canvas.colors) {
      canvas.colors.fogExplored = priorFogExplored;
      priorFogExplored.applyRGB?.(canvas.visibility?.filter?.uniforms?.exploredColor);
      priorFogExplored = undefined;
    }
  } catch (e) { /* best-effort */ }
}

// --- Tier 0 (soft) edge ------------------------------------------------------
let softBlurActive = false;
let lastSoftUnsupported = false; // most recent apply found Foundry's blur disabled (for the status report)

function applySoftBlur() {
  const filters = softFogFilters();
  lastSoftUnsupported = !canvas.blur?.enabled;
  if (lastSoftUnsupported) {
    console.warn(`${MODULE_ID} | soft fog edge needs Soft Shadows — set the display to High performance mode`);
    return;
  }
  try {
    const strength = (canvas.blur.strength ?? 10) * SOFT_FOG_MULT; // × scale is applied by updateBlur
    for (const f of filters) f._configuredStrength = strength;
    canvas.updateBlur();
    softBlurActive = true;
  } catch (e) { console.warn(`${MODULE_ID} | could not apply soft fog edge`, e); }
}
function clearSoftBlur() {
  if (!softBlurActive && !lastSoftUnsupported) return;
  try {
    for (const f of softFogFilters()) delete f._configuredStrength; // fall back to stock blur
    canvas.updateBlur?.();
  } catch (e) { console.warn(`${MODULE_ID} | could not clear soft fog`, e); }
  softBlurActive = false;
  lastSoftUnsupported = false;
}

// --- Tier 1 (gpu): our own wide feather filter -------------------------------
// A 24-sample golden-spiral disc gather over the visibility layer's output. `inputSize.zw` is
// (1/width, 1/height), so `uRadiusPx` is a true screen-pixel radius. Averaging 25 samples in a disc
// gives a smooth, wide feather — far past Foundry's 5–9 taps — and runs on any performance mode
// because it is OUR filter pass, not Foundry's optional blur.
const GPU_FOG_RADIUS_PX = 22; // feather radius on the display, in screen pixels (tune on the TV)
const GPU_FOG_FRAG = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputSize;
uniform float uRadiusPx;
void main() {
  vec2 px = inputSize.zw;
  vec4 sum = texture2D(uSampler, vTextureCoord);
  float total = 1.0;
  const int N = 24;
  float golden = 2.399963229728653;
  for (int i = 1; i <= N; i++) {
    float t = float(i);
    float r = sqrt(t / float(N)) * uRadiusPx;
    float a = t * golden;
    vec2 off = vec2(cos(a), sin(a)) * r * px;
    sum += texture2D(uSampler, vTextureCoord + off);
    total += 1.0;
  }
  gl_FragColor = sum / total;
}`;

let gpuFilter = null;      // our PIXI.Filter instance (built once, reused)
let gpuFilterOn = false;   // currently attached to canvas.visibility.filters

function buildGpuFilter() {
  if (gpuFilter) return gpuFilter;
  try {
    const Filter = PIXI?.Filter ?? globalThis.PIXI?.Filter;
    if (!Filter) return null;
    gpuFilter = new Filter(undefined, GPU_FOG_FRAG, { uRadiusPx: GPU_FOG_RADIUS_PX });
    gpuFilter.padding = GPU_FOG_RADIUS_PX + 4; // don't clip the feather at the layer's edge
  } catch (e) { console.warn(`${MODULE_ID} | could not build gpu fog filter`, e); gpuFilter = null; }
  return gpuFilter;
}

function applyGpuFilter() {
  const vis = canvas?.visibility;
  if (!vis) return;
  const f = buildGpuFilter();
  if (!f) return;
  try {
    const base = vis.filter ? [vis.filter] : (Array.isArray(vis.filters) ? vis.filters.filter(x => x !== gpuFilter) : []);
    if (!base.includes(f)) vis.filters = [...base, f];
    gpuFilterOn = true;
  } catch (e) { console.warn(`${MODULE_ID} | could not attach gpu fog filter`, e); }
}
function clearGpuFilter() {
  if (!gpuFilterOn) return;
  try {
    const vis = canvas?.visibility;
    if (vis && Array.isArray(vis.filters)) vis.filters = vis.filters.filter(x => x !== gpuFilter);
  } catch (e) { console.warn(`${MODULE_ID} | could not detach gpu fog filter`, e); }
  gpuFilterOn = false;
}

// --- Dispatch ----------------------------------------------------------------
function applyStyle(style) {
  if (style === "off") { clearGpuFilter(); clearSoftBlur(); clearDensity(); return; }
  applyDensity();
  if (style === "gpu") { clearSoftBlur(); applyGpuFilter(); }
  else { clearGpuFilter(); applySoftBlur(); } // "soft"
}

// Re-evaluate on the display: apply the chosen style, clearing the others. From the setting's
// onChange and on each canvas draw (the visibility filter is rebuilt per scene).
export function refreshFog() {
  if (!isDisplayClient() || !canvas?.ready) return;
  applyStyle(fogStyle());
  broadcastFogState();
}

// Let the DM panel know what the display is actually doing (same one-way display→everyone channel the
// audio status uses). `supported` is only meaningful for "soft" (needs High mode); "gpu" and "off"
// are always supported. Without this the DM can't tell "on and working" from "on but the TV can't".
function broadcastFogState() {
  try {
    if (!isDisplayClient()) return;
    const style = fogStyle();
    const supported = style === "soft" ? !lastSoftUnsupported : true;
    game.socket?.emit(`module.${MODULE_ID}`, {
      cmd: "softFogState", on: style !== "off", style, supported, at: Date.now()
    });
  } catch (e) { /* socket not ready */ }
}

export function registerFog() {
  Hooks.on("canvasReady", () => { if (isDisplayClient()) refreshFog(); });
  if (canvas?.ready && isDisplayClient()) refreshFog();
}
