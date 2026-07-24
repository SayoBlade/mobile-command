// Fog-of-war MIST — Tier 0 (DESIGN §22.3 #2, DM 2026-07-24 "try 0 now and we'll see if it's enough").
//
// The DM likes real-fow's drifting volumetric fog; it can't run on v14, which rewrote fog into a
// `VisibilityFilter` shader. Tier 0 is the cheap ~70%: point Foundry's OWN fog-overlay slot at a
// cloudy texture so unexplored fog reads as mist instead of flat grey. No per-frame work — the
// texture is generated ONCE and the shader already samples an overlay when one is present. Tier 1
// (a live-drifting noise shader, a permanent per-frame GPU cost on the TV) stays unbuilt behind
// this, and only gets quoted if this isn't enough.
//
// HOW IT PLUGS IN (verified against installed Foundry 14.365 source, not memory):
//   • CanvasVisibility#_draw → #drawVisibilityOverlay reads `canvas.sceneTextures.fogOverlay
//     ?? canvas.level?.fog?.src`. Set that slot and redraw the visibility group and the overlay
//     appears — no core edit, no filter subclass.
//   • The fragment shader (rendering/filters/visibility.mjs) mixes it into UNEXPLORED fog as
//     `mix(unexploredColor, overlay.rgb * backgroundColor, overlay.a)`. So the texture's ALPHA is
//     the wisp (patchy density) and its RGB is the mist colour. Straight-alpha authored here; PIXI
//     premultiplies on upload and the shader's unPremultiply undoes it, so RGB lands intact.
//   • We assign at `canvasReady` and call `canvas.visibility.draw()`, which re-reads the slot at
//     draw time and does NOT run board#loadTextures (whose texture-cache pass could otherwise drop
//     a directly-assigned PIXI.Texture). draw() tears down via canvas.fog.clear(), which SAVES
//     exploration first — so explored fog is never lost.
//
// SCOPE: display client only. Only the non-GM TV renders fog at all (a GM sees through everything),
// so mist can only appear there — and generating the texture off the DM's box keeps this genuinely
// free for them. Gated on the `fogMist` world setting (default off), and it never overrides a scene
// that already carries its own fog overlay image (the DM's explicit choice wins).

import { MODULE_ID } from "./preset.js";
import { isDisplayClient } from "./shell.js";

const TEX_SIZE = 512; // one tileable cloud cell; the overlay sprite stretches it across the scene

let mistTexture = null;   // generated once, reused across scenes
let appliedScene = null;  // scene id we set the slot on, so we only clear our OWN assignment
let priorOverlay;         // whatever occupied the slot before us (usually undefined) — restored on off

// --- the texture -----------------------------------------------------------------------------
// Tileable value-noise fBm. Each octave's integer lattice wraps at its own period, so the whole
// texture repeats seamlessly — a hard requirement, since the sprite tiles/stretches across a scene
// that is never a neat multiple of the texture. Cheap: a few hundred k pixels, once, at load.
function hash2(x, y, period) {
  // Wrap the lattice to `period` cells so the noise is seamless, then a murmur-style finalizer for a
  // well-distributed [0,1). The earlier integer hash (single mul + shift) degenerated for the tiny
  // lattices of the coarse octaves (period 3 → only 9 values) and clustered dark — verified
  // off-table (scratch mist-check): mean collapsed to ~0.08 and the mist was invisible. Math.imul
  // does a true 32-bit multiply; two mix rounds give mean ~0.5 across even a 3×3 lattice.
  const xi = ((x % period) + period) % period;
  const yi = ((y % period) + period) % period;
  let h = (xi & 0xffff) | ((yi & 0xffff) << 16);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
// Smoother-step so cells blend without the diamond artefacts of linear interpolation.
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function valueNoise(x, y, period) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const v00 = hash2(x0, y0, period), v10 = hash2(x0 + 1, y0, period);
  const v01 = hash2(x0, y0 + 1, period), v11 = hash2(x0 + 1, y0 + 1, period);
  return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
}

function buildMistTexture() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = TEX_SIZE;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(TEX_SIZE, TEX_SIZE);
  const data = img.data;

  // Four octaves. `cells` = how many noise cells span the tile at each octave; each divides TEX_SIZE
  // so the noise stays seamless. Low octaves = big soft banks, high = wisps riding on them.
  const octaves = [{ cells: 3, amp: 0.5 }, { cells: 6, amp: 0.25 }, { cells: 12, amp: 0.15 }, { cells: 24, amp: 0.1 }];
  const ampSum = octaves.reduce((s, o) => s + o.amp, 0);

  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      let n = 0;
      for (const { cells, amp } of octaves) {
        const s = cells / TEX_SIZE;
        n += valueNoise(x * s, y * s, cells) * amp;
      }
      n /= ampSum; // → ~[0,0.75], mean ~0.45
      // Contrast curve, tuned off-table (scratch mist3) against this scene's shader path: alpha in
      // [0.10, 0.90], mean ~0.47, ~60% of the area above 0.4. That reads as clearly-present mist
      // with genuine clear gaps — heavier and it becomes a wall that hides the map edge, lighter and
      // it looks like nothing happened (the DM's whole test is "is it enough").
      const c = Math.min(1, Math.max(0, (n - 0.26) / 0.42));
      const a = 0.1 + fade(c) * 0.8;
      const i = (y * TEX_SIZE + x) * 4;
      // A cool grey-blue mist. Slight per-pixel lift with density so banks read a touch brighter.
      data[i] = (198 + a * 34) | 0;
      data[i + 1] = (206 + a * 30) | 0;
      data[i + 2] = (216 + a * 24) | 0;
      data[i + 3] = (a * 255) | 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = PIXI.Texture.from(cv);
  tex.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT; // tile, don't clamp, when stretched over a scene
  return tex;
}

function ensureMistTexture() {
  if (!mistTexture || !mistTexture.baseTexture?.valid) mistTexture = buildMistTexture();
  return mistTexture;
}

// --- apply / clear ---------------------------------------------------------------------------
// A scene that carries its own fog overlay image keeps it (the DM chose it deliberately).
function sceneHasOwnOverlay() {
  try { return !!(canvas.scene?.fog?.overlay || canvas.level?.fog?.src); } catch (e) { return false; }
}

async function applyMist() {
  if (!isDisplayClient() || !canvas?.ready) return;
  if (sceneHasOwnOverlay()) return; // don't clobber the DM's own overlay
  try {
    priorOverlay = canvas.sceneTextures.fogOverlay;
    canvas.sceneTextures.fogOverlay = ensureMistTexture();
    appliedScene = canvas.scene?.id ?? null;
    await canvas.visibility.draw(); // re-reads the slot; saves+restores explored fog across the redraw
  } catch (e) {
    console.warn(`${MODULE_ID} | could not apply fog mist`, e);
  }
}

async function clearMist({ redraw = true } = {}) {
  if (!canvas?.ready) return;
  try {
    // Only undo an assignment WE made, and only on the scene we made it on.
    if (appliedScene && canvas.scene?.id === appliedScene && canvas.sceneTextures.fogOverlay === mistTexture) {
      if (priorOverlay === undefined) delete canvas.sceneTextures.fogOverlay;
      else canvas.sceneTextures.fogOverlay = priorOverlay;
      if (redraw) await canvas.visibility.draw();
    }
    appliedScene = null;
    priorOverlay = undefined;
  } catch (e) {
    console.warn(`${MODULE_ID} | could not clear fog mist`, e);
  }
}

function fogMistOn() {
  try { return !!game.settings.get(MODULE_ID, "fogMist"); } catch (e) { return false; }
}

// Re-evaluate on the display client: apply when the setting is on, clear when off. Called from the
// setting's onChange and on each canvas draw (a new scene needs the slot set afresh — sceneTextures
// is rebuilt per scene).
export function refreshFogMist() {
  if (!isDisplayClient()) return;
  if (fogMistOn()) applyMist();
  else clearMist();
}

export function registerFogMist() {
  // Apply on every scene draw (display only). canvasReady fires after the scene's own textures are
  // loaded, so setting the slot here and redrawing is clean and can't be undone by board#loadTextures.
  Hooks.on("canvasReady", () => { if (isDisplayClient() && fogMistOn()) applyMist(); });
  // First load: the initial canvasReady has usually already fired by the time `ready` registers us,
  // so apply once now if the canvas is already up.
  if (canvas?.ready && isDisplayClient() && fogMistOn()) applyMist();
}
