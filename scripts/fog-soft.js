// Fog-of-war edge softening — now THREE styles (DM 2026-07-25: "try gpu fog, just make sure it's an
// option in settings"). The `fogStyle` world setting picks one, on the shared display only:
//
//   • "off"  — Foundry's stock fog (a hard-ish polygon edge with its default 5–9-tap blur).
//   • "soft" — Tier 0. CRANK Foundry's own visibility/vision blur filters so the seen↔unseen edge
//              feathers. Cheap (no extra passes beyond the wider kernel), but only EXISTS on High
//              performance mode (`canvas.blur.enabled = performance.mode > MED`), and Foundry's small
//              kernel caps how soft it gets. The panel reports if High mode is off.
//   • "gpu"  — Tier 1. REPLACE Foundry's fog shader (a VisibilityFilter subclass swapped in via
//              CONFIG.Canvas.visibilityFilter): the explored AND live-vision channels are density
//              gathers (24-tap golden spiral) shaped by smoothstep + an FBM wisp, so the shadow
//              polygon itself becomes a wide cloud-like gradient — the real real-fow look. Runs on
//              ANY performance mode. Heavier on the display's GPU — hence opt-in, default off.
//              (v1 appended a blur filter AFTER the stock one — live-tested as a no-op: the polygon
//              edge is the `v` single tap inside the stock shader; see the deep dive at Tier 1 below.)
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
// purpose-built lever is `canvas.colors.fogExplored`: a grey lifts the explored overlay off pure
// black. This ping-ponged as a constant (0x666666 "too visible" → 0x1a1a1a "near-black, clashes
// hard with the darkvision grey next to it", DM 2026-07-26 screenshot) — the two "shadows" the DM
// circled are DIFFERENT SYSTEMS: seen-but-unlit (the lighting/vision-mode grey) beside
// remembered-only (this explored tint). Their brightness can only be matched by eye, on the real
// TV, against the party's actual vision modes — so it's the DM's dial now (`fogExploredLevel`,
// 0–60 grey %, slider in the panel's Fog drawer).
function fogExploredColor() {
  let lvl = 22;
  try { lvl = Number(game.settings.get(MODULE_ID, "fogExploredLevel")); } catch (e) { /* not registered */ }
  const g = Math.round(255 * Math.max(0, Math.min(60, lvl)) / 100);
  return (g << 16) | (g << 8) | g;
}
let priorFogExplored; // the display's stock fogExplored Color, restored on clear

function applyDensity() {
  try { if (canvas.visibility) canvas.visibility.alpha = FOG_UNEXPLORED_ALPHA; } catch (e) { /* best-effort */ }
  try {
    const Col = foundry.utils?.Color ?? globalThis.Color;
    const vis = canvas.visibility?.filter;
    if (Col && canvas.colors && vis) {
      if (priorFogExplored === undefined) priorFogExplored = canvas.colors.fogExplored;
      canvas.colors.fogExplored = Col.from(fogExploredColor());
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

// --- Gentle lighting-line soften for gpu mode --------------------------------
// DM 2026-07-26 ("95% happy… I'd still like the lines a bit softer, like an edge-blur"): the crisp
// straight line left in the screenshot is the LIGHTING mask edge — darkvision/light polygons masked
// by canvas.masks.vision — which the fog shader cannot reach. The earlier ×12 crank melted it but
// washed darkness over lit detail (symmetric blur); ×4 is the middle ground: enough to soften the
// line, ~1/3 the wash. Only the MASK filter is pinned — the visibility filter's inner blur stays
// stock so the fog shader's own input is untouched. Below High the mask has no blur filter at all
// (Foundry provides no lever there).
const GPU_MASK_BLUR_MULT = 4;
let maskBlurPinned = false;
function applyMaskBlur() {
  const f = canvas?.masks?.vision?.blurFilter;
  if (!f || !canvas.blur?.enabled) return;
  try {
    f._configuredStrength = (canvas.blur.strength ?? 10) * GPU_MASK_BLUR_MULT; // × scale via updateBlur
    canvas.updateBlur();
    maskBlurPinned = true;
  } catch (e) { /* best-effort */ }
}
function clearMaskBlur() {
  if (!maskBlurPinned) return;
  try {
    const f = canvas?.masks?.vision?.blurFilter;
    if (f) { delete f._configuredStrength; canvas.updateBlur?.(); }
  } catch (e) { /* best-effort */ }
  maskBlurPinned = false;
}

// --- Tier 1 (gpu): REPLACE the visibility shader (deep dive 2026-07-25) ------
// The first gpu build appended a blur filter after the visibility filter — and the DM's live test
// showed ZERO change in the shadow polygons. The installed 14.365 source explains why the whole
// edge-blur family of approaches was doomed:
//
//   • The live-vision cutout (the "shadow polygon" you actually watch during play) is the `v`
//     channel: `mix(fow, vec4(0.0), v)` in VisibilityFilter's fragment — sampled with ONE raw tap
//     from `canvas.masks.vision.renderTexture`, a RED/NEAREST/no-MSAA texture. The filter's internal
//     blur passes blur only `uSampler` (the EXPLORED `r` channel) — they never touch `v`.
//   • The vision mask's own blurFilter (what "soft" cranks) is only CREATED on High performance mode
//     (CanvasVisionMask#createBlurFilter: `if (!b.enabled) return;`). Below High, nothing in the
//     whole pipeline blurs anything — there is literally no filter to crank.
//
// So "gpu" now does what real-fow does: REPLACE the fog shader itself. Foundry's sanctioned hook is
// `CONFIG.Canvas.visibilityFilter` (visibility.mjs builds `CONFIG.Canvas.visibilityFilter.create(...)`
// on every canvas draw, and AbstractBaseFilter.create calls `this._createFragmentShader(options)` —
// so a subclass swaps in cleanly, options and overlay plumbing included). Our fragment mirrors the
// stock 14.365 shader exactly, except `r` and `v` are DENSITY GATHERS — a 24-tap golden-spiral disc
// average in true screen pixels — shaped by smoothstep and a subtle FBM wisp, so the seen↔unseen
// border becomes a wide, irregular, cloud-like gradient instead of a polygon edge. Runs on ANY
// performance mode (it's our shader, not Foundry's optional blur).
// Tuned on the live TV client via A/B luminance profiles (2026-07-25): at radius 26 with a
// smoothstep(0.30,0.70) band the edge measured ~the same as stock — the S-curve keeps only the middle
// 40% of the gather's ramp as visible gradient, cancelling the widening. Radius up + band opened so
// the on-screen feather is ~0.6–0.7 × radius, clearly past Foundry's ~10–18px High-mode blur.
const GPU_FOG_RADIUS_PX = 100;  // feather radius in screen px (live-tunable: canvas.visibility.filter.uniforms.uSoftRadiusPx).
                                // 56 → 100 (DM 2026-07-26: "a gradient from the full black to the actual edge") — the tap
                                // count is FIXED, so a wider radius costs nothing; it just spreads the same 25 samples,
                                // and the FBM wisp hides the sparser spacing. Penumbra reach ≈ 1.6 × radius.
const GPU_FOG_NOISE_PX = 96;    // FBM wisp wavelength in screen px (bigger = broader billows)
const GPU_FOG_NOISE_AMP = 0.22; // wisp warp of the edge threshold; max ±0.096 after centring — must stay < the smoothstep margin (0.18)

let StockVisibilityFilter = null; // the class CONFIG.Canvas.visibilityFilter held before we touched it
let GpuVisibilityFilter = null;   // our subclass (built lazily — needs Foundry loaded)

function gpuFilterClass() {
  if (GpuVisibilityFilter) return GpuVisibilityFilter;
  const Stock = StockVisibilityFilter ?? CONFIG?.Canvas?.visibilityFilter;
  if (!Stock) return null;
  StockVisibilityFilter = Stock;
  GpuVisibilityFilter = class MCSoftFogVisibilityFilter extends Stock {
    /** Extra uniforms: the gather radius, and the scene rectangle to crop the bleed to.
     *  uSceneUV defaults to the whole screen, so if apply() ever fails to compute it the filter
     *  behaves exactly as it did before the crop existed — a no-op, never a black canvas. */
    static get defaultUniforms() {
      return { ...super.defaultUniforms, uSoftRadiusPx: GPU_FOG_RADIUS_PX, uSceneUV: [0, 0, 1, 1] };
    }

    // THE CROP (DM 2026-08-11: "its actually the GPU mode that's causing it… crop the map").
    //
    // The halo is the bleed doing exactly what it was asked to do. A fragment sitting OUTSIDE the
    // map still runs the 24-tap gather, and its disc reaches back over the map edge and picks up
    // "explored" from inside — so the padding around the scene lights up in the shape of the map.
    // The reach is ~1.6 × the 100px radius, which is precisely the width of the glow.
    //
    // The bleed is wanted INSIDE the map and meaningless outside it, so the scene rectangle is the
    // natural boundary. Recomputed per frame because it moves with every pan and zoom.
    apply(filterManager, input, output, clear, currentState) {
      try {
        const r = canvas?.dimensions?.sceneRect;
        const t = canvas?.stage?.worldTransform;
        const [sw, sh] = canvas?.screenDimensions ?? [window.innerWidth, window.innerHeight];
        if (r && t && sw && sh) {
          // Corners through the stage transform — both, because a rotated or flipped stage would
          // make "top-left" and "bottom-right" swap places.
          const px = (x, y) => [x * t.a + y * t.c + t.tx, x * t.b + y * t.d + t.ty];
          const [ax, ay] = px(r.x, r.y);
          const [bx, by] = px(r.x + r.width, r.y + r.height);
          this.uniforms.uSceneUV = [
            Math.min(ax, bx) / sw, Math.min(ay, by) / sh,
            Math.max(ax, bx) / sw, Math.max(ay, by) / sh
          ];
        }
      } catch (e) { /* leave the default full-screen rect: the crop simply doesn't apply */ }
      return super.apply(filterManager, input, output, clear, currentState);
    }

    // The stock 14.365 fragment (rendering/filters/visibility.mjs) with the single-tap `r`/`v` reads
    // replaced by mcGather* density gathers + mcEdge shaping. Everything else — explored colour math,
    // overlay texture, persistentVision variant, premultiply — is verbatim stock so nothing regresses.
    static _createFragmentShader(options) {
      return `
      varying vec2 vTextureCoord;
      varying vec2 vMaskTextureCoord;
      varying vec2 vOverlayCoord;
      varying vec2 vOverlayTilingCoord;
      uniform sampler2D uSampler;
      uniform sampler2D primaryTexture;
      uniform sampler2D overlayTexture;
      uniform vec3 unexploredColor;
      uniform vec3 backgroundColor;
      uniform bool hasOverlayTexture;
      uniform vec4 inputSize;          /* PIXI: (w, h, 1/w, 1/h) of the filter input */
      uniform vec2 screenDimensions;   /* refreshed each apply() by AbstractBaseMaskFilter */
      uniform float uSoftRadiusPx;
      uniform vec4 uSceneUV;           /* the map's rectangle, screen-normalised (see apply()) */
      ${options.persistentVision ? `` : `uniform sampler2D visionTexture;
       uniform vec3 exploredColor;`}
      ${this.CONSTANTS}
      ${this.PERCEIVED_BRIGHTNESS}

      // To check if we are out of the bound
      float getClip(in vec2 uv) {
        return step(3.5,
           step(0.0, uv.x) +
           step(0.0, uv.y) +
           step(uv.x, 1.0) +
           step(uv.y, 1.0));
      }

      // Unpremultiply fog texture
      vec4 unPremultiply(in vec4 pix) {
        if ( !hasOverlayTexture || (pix.a == 0.0) ) return pix;
        return vec4(pix.rgb / pix.a, pix.a);
      }

      // --- mobile-command soft fog (real-fow style) ---------------------------
      // Value-noise FBM for the wispy edge. Static (screen-space) — no per-frame churn.
      float mcHash(in vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float mcNoise(in vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(mcHash(i), mcHash(i + vec2(1.0, 0.0)), u.x),
                   mix(mcHash(i + vec2(0.0, 1.0)), mcHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float mcFbm(in vec2 p) {
        float s = 0.0; float a = 0.5;
        for (int i = 0; i < 3; i++) { s += a * mcNoise(p); p *= 2.03; a *= 0.5; }
        return s; // ~[0, 0.875]
      }
      // 24-tap golden-spiral disc average of the EXPLORED channel (the filter's own input texture).
      float mcGatherR(in vec2 uv) {
        float sum = texture2D(uSampler, uv).r;
        for (int i = 1; i <= 24; i++) {
          float t = float(i);
          float rad = sqrt(t / 24.0) * uSoftRadiusPx;
          float ang = t * 2.399963229728653;
          sum += texture2D(uSampler, uv + vec2(cos(ang), sin(ang)) * rad * inputSize.zw).r;
        }
        return sum / 25.0;
      }
      // Same gather over the LIVE-VISION mask — the single tap the stock shader uses is exactly why
      // the shadow polygon never softened. vMaskTextureCoord is screen-normalised, so one screen
      // pixel is 1.0/screenDimensions.
      ${options.persistentVision ? `` : `
      float mcGatherV(in vec2 uv) {
        float sum = texture2D(visionTexture, uv).r;
        for (int i = 1; i <= 24; i++) {
          float t = float(i);
          float rad = sqrt(t / 24.0) * uSoftRadiusPx;
          float ang = t * 2.399963229728653;
          sum += texture2D(visionTexture, uv + vec2(cos(ang), sin(ang)) * rad / screenDimensions).r;
        }
        return sum / 25.0;
      }`}
      // Shape a gathered density into the final edge: an S-curve for depth, warped by the wisp so
      // the border billows instead of tracing the polygon. Saturates to exactly 0/1 away from edges.
      // INWARD fade (DM 2026-07-26: "blur in, not out — shadows are spilling into the visible
      // areas"). The gather density at the geometric edge is 0.5: a band symmetric around 0.5 puts
      // half the gradient on the VISIBLE side, dimming real map detail. The top sits a whisker OVER
      // 0.5 (0.55 — DM follow-up: "edges a BIT less sharp") so a soft wisp-modulated lip (~10%)
      // laps just past the line and dies within a few px; everything further into the visible area
      // renders fully clear. The LOW end sets how deep the penumbra reaches into the dark — 0.04 is
      // generous on purpose: the DM is fine with near-edge room detail ghosting through in near
      // darkness ("if they make out a few details at the very edge… it's not THAT bad"), and drawn
      // map walls absorb the mild past-the-polygon reveal.
      float mcEdge(in float d, in float wisp) {
        return smoothstep(0.04, 0.55, d + (wisp - 0.4375) * ${GPU_FOG_NOISE_AMP.toFixed(3)});
      }

      // 1.0 inside the map, 0.0 outside it. vMaskTextureCoord is screen-normalised, which is the
      // same space apply() puts uSceneUV in, so this is a plain rectangle test.
      float mcInScene(in vec2 uv) {
        return step(uSceneUV.x, uv.x) * step(uv.x, uSceneUV.z)
             * step(uSceneUV.y, uv.y) * step(uv.y, uSceneUV.w);
      }

      void main() {
        float wisp = mcFbm(vMaskTextureCoord * screenDimensions / ${GPU_FOG_NOISE_PX.toFixed(1)});
        // Crop the bleed to the map. Zeroing the DENSITIES (rather than the final colour) means
        // the fragment falls through the normal path and comes out as ordinary unexplored fog —
        // the same black the rest of the off-map area already is, with no seam where they meet.
        float inScene = mcInScene(vMaskTextureCoord);
        float r = mcEdge(mcGatherR(vTextureCoord), wisp) * inScene;       // Revealed, feathered
        ${options.persistentVision ? `` : `float v = mcEdge(mcGatherV(vMaskTextureCoord), wisp) * inScene;`} // Live vision, feathered
        vec4 baseColor = texture2D(primaryTexture, vMaskTextureCoord);
        vec4 fogColor = hasOverlayTexture
                        ? texture2D(overlayTexture, vOverlayTilingCoord) * getClip(vOverlayCoord)
                        : baseColor;
        fogColor = unPremultiply(fogColor);

        // Compute fog exploration colors
        ${!options.persistentVision
          ? `float reflec = perceivedBrightness(baseColor.rgb);
        vec4 explored = vec4(min((exploredColor * reflec) + (baseColor.rgb * exploredColor), vec3(1.0)), 0.5);`
          : ``}
        vec4 unexplored = hasOverlayTexture
                          ? mix(vec4(unexploredColor, 1.0), vec4(fogColor.rgb * backgroundColor, 1.0), fogColor.a)
                          : vec4(unexploredColor, 1.0);

        // Mixing components to produce fog of war
        ${options.persistentVision
          ? `gl_FragColor = mix(unexplored, vec4(0.0), r);`
          : `vec4 fow = mix(unexplored, explored, max(r, v));
        gl_FragColor = mix(fow, vec4(0.0), v);`}

        // Output the result
        gl_FragColor.rgb *= gl_FragColor.a;
      }`;
    }
  };
  return GpuVisibilityFilter;
}

// Point CONFIG at the wanted filter class; if the LIVE filter instance was built from the other
// class, redraw the canvas so Foundry rebuilds it through its own construction path (that's the only
// place the filter is created — visibility.mjs #drawVisibility). Constructor identity, not
// instanceof: our subclass IS an instance of stock, so instanceof can't detect gpu→stock.
let _fogRedrawing = false;
function setGpuShader(on) {
  const cls = gpuFilterClass();
  if (!cls) return;
  const want = on ? cls : StockVisibilityFilter;
  try { if (CONFIG.Canvas.visibilityFilter !== want) CONFIG.Canvas.visibilityFilter = want; } catch (e) { return; }
  const cur = canvas?.visibility?.filter;
  if (cur && cur.constructor !== want && !_fogRedrawing) {
    _fogRedrawing = true; // canvas.draw() refires canvasReady → refreshFog; by then the instance matches
    Promise.resolve(canvas.draw())
      .catch(e => console.warn(`${MODULE_ID} | fog shader swap redraw failed`, e))
      .finally(() => { _fogRedrawing = false; });
  }
}

// --- Dispatch ----------------------------------------------------------------
function applyStyle(style) {
  if (style === "off") { setGpuShader(false); clearSoftBlur(); clearMaskBlur(); clearDensity(); return; }
  applyDensity();
  // "gpu" does NOT crank the ×12 Tier-0 blur (symmetric — it washed darkness over lit detail, the
  // "shadows spilling in" screenshot). The shader's inward fade is the fog softening; the LIGHTING
  // mask alone gets a gentle ×4 pin (applyMaskBlur) so the light/darkvision polygon line melts too
  // without eating the map (DM 2026-07-26 "lines a bit softer, like an edge-blur").
  if (style === "gpu") { clearSoftBlur(); applyMaskBlur(); setGpuShader(true); }
  else { setGpuShader(false); clearMaskBlur(); applySoftBlur(); } // "soft" (×12 pins both filters itself)
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
