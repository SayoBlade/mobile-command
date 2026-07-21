import { MODULE_ID } from "./preset.js";

// Pause cue (DM 2026-07-19, reworked 2026-07-21). Foundry's centred "GAME PAUSED" overlay covers
// the canvas and hid a travel journey outright, so CSS hides it. Its first replacement — four gold
// spinners in the corners — was camouflaged rather than quiet: gold at 45% on a tan cave floor is
// the same hue as the map. The cue is now two hue-independent layers, both in CSS and both keyed
// off the `mc-game-paused` body class this module maintains:
//
//   1. the canvas desaturates lightly while paused (the world loses colour when time stops)
//   2. a white edge gradient breathes on a 4s loop, 30% at the edge fading to nothing inward
//
// This module's whole job is the body class plus the one element the gradient paints on. Non-phone
// clients only — phones have their own full-screen paused card and never render #pause.
export function initPauseOverlay() {
  try {
    if (document.getElementById("mc-pause-edge")) return;
    const edge = document.createElement("div");
    edge.id = "mc-pause-edge";
    edge.setAttribute("aria-hidden", "true"); // purely decorative — nothing to read out
    document.body.appendChild(edge);
    const sync = () => document.body.classList.toggle("mc-game-paused", !!game.paused);
    Hooks.on("pauseGame", sync);
    sync(); // reflect the current state at load (a world can start paused)
  } catch (e) { console.warn(`${MODULE_ID} | pause overlay init failed`, e); }
}
