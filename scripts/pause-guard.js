import { MODULE_ID } from "./preset.js";
import { isExecutor } from "./settings.js";

// §2.1 (DECIDED 2026-06-12): pause-based freeze. When the executor client
// stops viewing the active scene, midi workflows and spatial answers would
// silently degrade (placeables exist only for the viewed scene) — so instead
// the game pauses outright. Rules:
// - only auto-resume pauses *we* initiated (a manual DM pause is sacred)
// - pause gates initiation; in-flight prompts are untouched (they live on
//   other clients' workflows)

let pausedByGuard = false;

function evaluate() {
  if (!isExecutor()) return;
  if (!game.settings.get(MODULE_ID, "pauseGuard")) return;
  const active = game.scenes.active;
  if (!active) return;
  const offScene = !canvas?.ready || canvas.scene?.id !== active.id;

  if (offScene && !game.paused) {
    pausedByGuard = true;
    game.togglePause(true, { broadcast: true });
    ui.notifications.info("Mobile Command: paused — executor left the active scene");
  } else if (!offScene && game.paused && pausedByGuard) {
    pausedByGuard = false;
    game.togglePause(false, { broadcast: true });
    ui.notifications.info("Mobile Command: resumed — executor back on the active scene");
  }
}

export function initPauseGuard() {
  Hooks.on("canvasReady", evaluate);
  // Scene activation can change out from under the viewed scene.
  Hooks.on("updateScene", (scene, changes) => {
    if ("active" in changes) evaluate();
  });
  // A manual unpause while off-scene clears our claim on the pause.
  Hooks.on("pauseGame", (paused) => {
    if (!paused && pausedByGuard && !canvasOnActiveScene()) pausedByGuard = false;
  });
}

function canvasOnActiveScene() {
  return canvas?.ready && canvas.scene?.id === game.scenes.active?.id;
}
