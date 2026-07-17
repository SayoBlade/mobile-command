// Scene-change zoom transitions (DM 2026-07-06): "dive into the map" / "pull back
// to the overworld". Foundry 14's transition system is an open registry —
// CONFIG.Canvas.sceneTransitions entries carry their own filterClass, the Scene
// config's Ambience→Transition dropdown is built from the registry, and core's
// Teleport Token region behavior exposes the same list per-teleport. So these two
// register as native-looking options; no custom triggering code is needed:
//  - SMALL maps (town/boat/dungeon): scene transition = "Zoom In (Mobile Command)"
//  - BIG maps (overworld):           scene transition = "Zoom Out (Mobile Command)"
// The engine snapshots the outgoing scene + the incoming scene's first frame and
// runs the filter's shader as `progress` animates 0→1 (TransitionContainer).
import { MODULE_ID } from "./preset.js";

export function registerSceneTransitions() {
  try {
    const Base = foundry.canvas?.rendering?.filters?.TextureTransitionFilter;
    const registry = CONFIG.Canvas?.sceneTransitions;
    if (!Base || !registry) {
      console.warn(`${MODULE_ID} | scene-transition registry unavailable on this build — zoom transitions skipped`);
      return;
    }

    // Subclasses TextureTransitionFilter to inherit the targetTexture plumbing +
    // vertex shader + apply() matrix work; only the fragment shader and the type
    // mapping are ours (core's type setter throws on unknown ids).
    class MCZoomTransitionFilter extends Base {
      static #TYPE_TO_INT = { mcZoomIn: 0, mcZoomOut: 1 };

      get type() { return this.uniforms.type === 1 ? "mcZoomOut" : "mcZoomIn"; }

      set type(t) { this.uniforms.type = MCZoomTransitionFilter.#TYPE_TO_INT[t] ?? 0; }

      static _createFragmentShader() {
        return `
        precision ${PIXI.Program.defaultFragmentPrecision} float;
        uniform float progress;
        uniform vec2 anchor;
        uniform int type;
        uniform sampler2D uSampler;
        uniform sampler2D targetTexture;
        uniform vec4 tintAlpha;
        uniform mat3 filterMatrixInverse;
        uniform mat3 targetUVMatrix;
        uniform float opaque;
        uniform vec4 backgroundColor;

        varying vec2 vTextureCoord;
        varying vec2 vFilterCoord;

        vec2 mapFuv2Suv(in vec2 uv) { return (filterMatrixInverse * vec3(uv, 1.0)).xy; }
        vec2 mapFuv2Tuv(in vec2 uv) { return (targetUVMatrix * vec3(uv, 1.0)).xy; }

        float getClip(in vec2 uv) {
          return step(3.5,
             step(0.0, uv.x) + step(0.0, uv.y) + step(uv.x, 1.0) + step(uv.y, 1.0));
        }

        vec4 colorFromSource(in vec2 uv) { return texture2D(uSampler, uv); }
        vec4 colorFromTarget(in vec2 uv) { return texture2D(targetTexture, mapFuv2Tuv(uv)) * getClip(uv); }

        /* v2 (DM 2026-07-17: "more streaks and fade"): radial streak sampling +
           full-length exponential cross-fade, technique adapted from GL
           Transitions' CrossZoom (rectalogic, MIT) — dithered taps marched
           toward the anchor with parabolic weights, streak strength swelling
           sin-wise to a mid-flight peak so both endpoints are crisp. */
        const float PI = 3.141592653589793;
        const float SAMPLES = 24.0;   /* CrossZoom uses 40; TV canvas is huge — feel constant */
        const float STREAK = 0.35;    /* max radial smear, in filter-coord units toward anchor */

        float rand(in vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

        /* CrossZoom's dissolve: exponential ease-in-out — a long fade that
           builds through the middle instead of snapping near the end. */
        float expEase(in float t) {
          if (t <= 0.0) return 0.0;
          if (t >= 1.0) return 1.0;
          float u = t * 2.0;
          if (u < 1.0) return 0.5 * pow(2.0, 10.0 * (u - 1.0));
          return 0.5 * (2.0 - pow(2.0, -10.0 * (u - 1.0)));
        }

        /* One tap of the zoom-in composite at filter-coord fuv: the old map
           magnifies around the anchor while the new scene fades in beneath. */
        vec4 tapZoomIn(in vec2 fuv, in float z, in float dissolve) {
          vec2 suv = anchor + (fuv - anchor) / z;
          vec4 from = colorFromSource(mapFuv2Suv(suv));
          vec4 to = colorFromTarget(fuv);
          return mix(from, to, dissolve);
        }

        /* One tap of the pull-back composite: the old scene shrinks into the
           anchor over the big map, fading as it goes. */
        vec4 tapZoomOut(in vec2 fuv, in float z, in float dissolve) {
          vec2 suv = anchor + (fuv - anchor) * z;
          float clip = getClip(suv);
          vec4 from = colorFromSource(mapFuv2Suv(suv)) * clip;
          vec4 to = colorFromTarget(fuv);
          return mix(to, from, clip * (1.0 - dissolve));
        }

        void main() {
          float e = smoothstep(0.0, 1.0, progress);
          float z = 1.0 + (e * e) * 11.0;
          float dissolve = expEase(progress);
          float strength = sin(PI * e) * STREAK; /* streaks peak mid-flight, zero at rest */
          vec2 toAnchor = anchor - vFilterCoord;
          float jitter = rand(vFilterCoord);     /* hides the finite tap count */
          vec4 acc = vec4(0.0);
          float total = 0.0;
          for (float t = 0.0; t < SAMPLES; t++) {
            float percent = (t + jitter) / SAMPLES;
            float weight = 4.0 * (percent - percent * percent);
            vec2 fuv = vFilterCoord + toAnchor * (percent * strength);
            vec4 c = (type == 1) ? tapZoomOut(fuv, z, dissolve) : tapZoomIn(fuv, z, dissolve);
            acc += c * weight;
            total += weight;
          }
          vec4 result = acc / total;
          result *= tintAlpha;
          if ( opaque > 0.5 ) {
            vec4 bg = backgroundColor;
            result.rgb = result.rgb + (bg.rgb * bg.a) * (1.0 - result.a);
            result.a = 1.0;
          }
          gl_FragColor = result;
        }
        `;
      }
    }

    registry.mcZoomIn = {
      id: "mcZoomIn",
      label: "MOBILECOMMAND.Transition.ZoomIn",
      filterClass: MCZoomTransitionFilter,
      filterType: "mcZoomIn",
      defaultDuration: 1600
    };
    registry.mcZoomOut = {
      id: "mcZoomOut",
      label: "MOBILECOMMAND.Transition.ZoomOut",
      filterClass: MCZoomTransitionFilter,
      filterType: "mcZoomOut",
      defaultDuration: 1600
    };
    console.log(`${MODULE_ID} | zoom scene transitions registered`);
  } catch (e) {
    console.error(`${MODULE_ID} | failed to register zoom transitions`, e);
  }
}

// When the PACKED PARTY token arrives on a new scene (core Teleport Token region
// behavior, or a DM drag), ACTIVATE that scene so the whole table — TV included —
// follows through the transition. Teleport alone only "pulls" some users; the
// shared display tracks the ACTIVE scene. Primary-GM client only; opt-out setting.
export function registerPartyTeleportActivation() {
  Hooks.on("createToken", (tok) => {
    try {
      if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
      if (!game.settings.get(MODULE_ID, "partyTeleportActivates")) return;
      const a = tok.actor;
      if (a?.type !== "group" || !a.getFlag(MODULE_ID, "packed")) return;
      const scene = tok.parent;
      if (!scene || scene.active) return;
      console.log(`${MODULE_ID} | party token arrived on "${scene.name}" — activating (scene transition plays)`);
      scene.activate();
    } catch (e) { /* best-effort glue */ }
  });
}
