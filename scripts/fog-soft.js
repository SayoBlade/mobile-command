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

// How much softer than Foundry's default fog blur. 1 = stock; ~4 reads as clearly-feathered
// atmospheric shadow without vision bleeding far past walls. Tunable — the achievable softness is
// ultimately capped by the filter's kernel/pass count (fixed at construction from canvas.blur), so
// past a point a bigger number stops helping and we'd need more passes (more GPU). Start moderate.
const SOFT_FOG_MULT = 4;

let lastUnsupported = false; // whether the most recent apply found blur disabled (for the status report)

function softFogOn() {
  try { return !!game.settings.get(MODULE_ID, "softFog"); } catch (e) { return false; }
}

function visibilityFilter() {
  const f = canvas?.visibility?.filter;
  return f && f.blur !== undefined ? f : null;
}

function applySoftFog() {
  if (!isDisplayClient() || !canvas?.ready) return;
  const filter = visibilityFilter();
  if (!filter) return;
  // Blur is a HIGH-performance-mode feature; on Medium or lower the filter has no blur passes and
  // setting a strength does nothing. Record it so the DM can be told why nothing changed.
  lastUnsupported = !canvas.blur?.enabled;
  if (lastUnsupported) {
    console.warn(`${MODULE_ID} | soft fog needs Soft Shadows — set the display to High performance mode`);
    broadcastSoftFogState();
    return;
  }
  try {
    filter._configuredStrength = (canvas.blur.strength ?? 10) * SOFT_FOG_MULT; // × scale is applied by updateBlur
    canvas.updateBlur();
  } catch (e) { console.warn(`${MODULE_ID} | could not apply soft fog`, e); }
  broadcastSoftFogState();
}

function clearSoftFog() {
  const filter = visibilityFilter();
  if (!filter) return;
  try {
    delete filter._configuredStrength; // fall back to canvas.blur.strength — the stock fog blur
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
