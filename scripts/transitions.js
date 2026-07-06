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

        /* Dive INTO the old map: it magnifies around the anchor while the new
           scene resolves underneath in the back half of the animation. */
        vec4 zoomIn() {
          float e = smoothstep(0.0, 1.0, progress);
          float z = 1.0 + (e * e) * 11.0;
          vec2 uv = anchor + (vFilterCoord - anchor) / z;
          vec4 from = colorFromSource(mapFuv2Suv(uv));
          vec4 to = colorFromTarget(vFilterCoord);
          return mix(from, to, smoothstep(0.45, 1.0, e));
        }

        /* Pull BACK: the old scene shrinks into the anchor point, revealing the
           big map around it, then dissolves. */
        vec4 zoomOut() {
          float e = smoothstep(0.0, 1.0, progress);
          float z = 1.0 + (e * e) * 11.0;
          vec2 uv = anchor + (vFilterCoord - anchor) * z;
          float clip = getClip(uv);
          vec4 from = colorFromSource(mapFuv2Suv(uv)) * clip;
          vec4 to = colorFromTarget(vFilterCoord);
          return mix(to, from, clip * (1.0 - smoothstep(0.75, 1.0, e)));
        }

        void main() {
          vec4 result = (type == 1) ? zoomOut() : zoomIn();
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
