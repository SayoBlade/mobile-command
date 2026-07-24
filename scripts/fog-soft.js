// Fog-of-war SOFT EDGES — Tier 0, take 2 (DM 2026-07-24: "the texture is really not the point… I'm
// interested in the soft edges of the shadows").
//
// The first take filled the black with a mist TEXTURE, which the DM rightly rejected: unexplored fog
// should stay black ("everything should be either black or nearly indistinguishable from black"), and
// what real-fow's look is actually about is the FEATHERED EDGE where vision/shadow meets the dark.
// (real-fow's own headline is a dual-COLOUR fog — a lighter explored tint — which v14 already does
// natively via scene fog colours; the DM doesn't want that, they want the soft edge.)
//
// That edge in Foundry is already a real thing: CanvasVisibility runs its mask through a gaussian
// blur (rendering/filters/visibility.mjs), so the seen↔unseen boundary is soft, not a hard polygon.
// Its strength is `canvas.blur.strength` (default gridSize/25 ≈ 10px on a 260px grid). This feature
// just CRANKS that blur on the display so the edge reads as soft atmospheric shadow. No texture, no
// per-frame work beyond the wider blur kernel the filter already runs; the fog stays black
// (unexploredColor is left at [0,0,0]).
//
// HARD REQUIREMENT (verified in installed 14.365 source, not memory): the blur only EXISTS on HIGH
// performance mode — `canvas.blur.enabled = performance.mode > MED`, and the visibility filter only
// builds its blur passes when blur is enabled at construction. On Medium or lower there is nothing to
// crank. We DETECT that and report it rather than force it: flipping performance mode is a heavy,
// global change to make silently on a modest TV.
//
// THE LEVER: `canvas.visibility.filter` is registered in `canvas.blurFilters` (via addBlurFilter)
// WITHOUT a `_configuredStrength`, so `canvas.updateBlur()` — which runs on every pan/zoom — sets its
// blur to `canvas.blur.strength × stage.scale`. Pinning `filter._configuredStrength` overrides just
// THIS filter (lighting filters keep their own pinned strength) and survives zoom, because
// updateBlur reads it back each time. Clearing it (delete) restores the default fog blur.
//
// SCOPE: display client only. Only the non-GM TV renders fog at all (a GM sees through everything),
// so the soft edge can only matter there. Gated on the `softFog` world setting (default off).

import { MODULE_ID } from "./preset.js";
import { isDisplayClient } from "./shell.js";

// How much softer than Foundry's default fog blur. The effective feather is ≈ strength × zoom in
// SCREEN pixels, so the first build's fixed ×4 was only ~16px on a 1080p TV — invisible. A tuning
// slider then found ×8 reads right (DM 2026-07-24: "it looks best at 8, you can get rid of the
// slider"), so it's a constant again.
const SOFT_FOG_MULT = 8;

// TWO borders, TWO blurs — this is the crux of the DM's "the dark-to-seen border is still very sharp":
//   • canvas.visibility.filter        softens the EXPLORED / remembered fog (the shader's `r` channel).
//   • canvas.masks.vision.blurFilter  softens the CURRENT-vision edge (the `v` channel) — the black↔lit
//     border, which the visibility filter's blur never reaches, so it stayed a hard line.
// Both are AlphaBlur filters registered in canvas.blurFilters WITHOUT a `_configuredStrength`, so
// updateBlur() drives both off `canvas.blur.strength × scale`; pinning `_configuredStrength` on each
// overrides just these two. Blurring the vision mask feathers the live sight edge slightly PAST walls
// — an aesthetic trade the shared display makes gladly (it never affects a player's own client).
function softFogFilters() {
  return [canvas?.visibility?.filter, canvas?.masks?.vision?.blurFilter].filter(f => f && f.blur !== undefined);
}

// Two independent knobs on the fog's DENSITY, both display-only, both trivially reversible.
//
// UNEXPLORED opacity — the black is the shader's `vec4(unexploredColor, 1.0)`. Dropping the whole
// visibility group's alpha lets a faint trace of the map bleed through ("nearly indistinguishable
// from black"). 0.95 → ~5% of the map shows. Independent of the blur, so it works on any perf mode;
// Foundry never sets this alpha itself (checked), so 1.0 is the safe restore.
const SOFT_FOG_UNEXPLORED_ALPHA = 0.95;

// EXPLORED lightness — the remembered-but-unseen area was "much darker, want it more visible" (DM
// 2026-07-24). That darkness is NOT a colour: both fog colours default to black (0x000000), and the
// shader draws explored as black at a HARDCODED 0.5 alpha — a flat 50% dim of the remembered map.
// The whole-layer alpha can't fix it independently (it keeps explored pinned at half the unexplored
// value). The purpose-built lever is `canvas.colors.fogExplored`: a lighter grey there lifts the
// explored overlay toward the actual map. Effects re-applies it from `canvas.colors.fogExplored` each
// refresh (effects.mjs), so that Color is what we set — not the uniform, which would be overwritten.
// 0x000000 = stock (darkest); higher = more of the remembered map shows. A blind first cut at ~0.4.
const SOFT_FOG_EXPLORED_COLOR = 0x666666;
let priorFogExplored; // the display's stock fogExplored Color, restored on clear

let lastUnsupported = false; // whether the most recent apply found blur disabled (for the status report)

function softFogOn() {
  try { return !!game.settings.get(MODULE_ID, "softFog"); } catch (e) { return false; }
}

function applySoftFog() {
  if (!isDisplayClient() || !canvas?.ready) return;
  // Unexplored opacity — independent of the blur, so it applies on any performance mode.
  try { if (canvas.visibility) canvas.visibility.alpha = SOFT_FOG_UNEXPLORED_ALPHA; } catch (e) { /* best-effort */ }
  // Explored lightness — set the fogExplored Color (effects re-applies it into the uniform), and also
  // push it into the uniform now so the change lands this frame rather than on the next refresh.
  try {
    const Col = foundry.utils?.Color ?? globalThis.Color;
    const vis = canvas.visibility?.filter;
    if (Col && canvas.colors && vis) {
      if (priorFogExplored === undefined) priorFogExplored = canvas.colors.fogExplored;
      canvas.colors.fogExplored = Col.from(SOFT_FOG_EXPLORED_COLOR);
      canvas.colors.fogExplored.applyRGB(vis.uniforms.exploredColor);
    }
  } catch (e) { /* best-effort */ }
  // Edge blur is a HIGH-performance-mode feature; on Medium or lower the filters have no blur passes
  // and setting a strength does nothing. Record it so the DM can be told why the EDGE didn't soften.
  const filters = softFogFilters();
  lastUnsupported = !canvas.blur?.enabled;
  if (lastUnsupported) {
    console.warn(`${MODULE_ID} | soft fog edge needs Soft Shadows — set the display to High performance mode`);
  } else if (filters.length) {
    try {
      const strength = (canvas.blur.strength ?? 10) * SOFT_FOG_MULT; // × scale is applied by updateBlur
      for (const f of filters) f._configuredStrength = strength;
      canvas.updateBlur();
    } catch (e) { console.warn(`${MODULE_ID} | could not apply soft fog edge`, e); }
  }
  broadcastSoftFogState();
}

function clearSoftFog() {
  if (!canvas?.ready) return;
  try { if (canvas.visibility) canvas.visibility.alpha = 1; } catch (e) { /* best-effort */ }
  try {
    if (priorFogExplored !== undefined && canvas.colors) {
      canvas.colors.fogExplored = priorFogExplored;
      priorFogExplored.applyRGB?.(canvas.visibility?.filter?.uniforms?.exploredColor);
      priorFogExplored = undefined;
    }
  } catch (e) { /* best-effort */ }
  try {
    for (const f of softFogFilters()) delete f._configuredStrength; // fall back to stock blur
    canvas.updateBlur?.();
  } catch (e) { console.warn(`${MODULE_ID} | could not clear soft fog`, e); }
  lastUnsupported = false;
  broadcastSoftFogState();
}

// Let the DM panel know whether the display could actually apply it (same one-way display→everyone
// channel the audio status uses). Without this the DM can't tell "on and working" from "on but the
// TV isn't on High" — the exact invisible-failure trap the mist texture nearly repeated.
function broadcastSoftFogState() {
  try {
    if (!isDisplayClient()) return;
    game.socket?.emit(`module.${MODULE_ID}`, {
      cmd: "softFogState", on: softFogOn(), supported: !lastUnsupported, at: Date.now()
    });
  } catch (e) { /* socket not ready */ }
}

// Re-evaluate on the display: apply when on, restore when off. From the setting's onChange and on
// each canvas draw (the visibility filter is rebuilt per scene).
export function refreshSoftFog() {
  if (!isDisplayClient()) return;
  if (softFogOn()) applySoftFog();
  else clearSoftFog();
}

export function registerSoftFog() {
  Hooks.on("canvasReady", () => { if (isDisplayClient()) refreshSoftFog(); });
  if (canvas?.ready && isDisplayClient()) refreshSoftFog();
}
