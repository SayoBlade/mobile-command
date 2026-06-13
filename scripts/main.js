import { MODULE_ID } from "./preset.js";
import { registerSettings, resolveExecutorId, isExecutor } from "./settings.js";
import { diffPreset, applyPreset, checkAndPrompt } from "./enforcer.js";
import { initSocket, startHeartbeat, api } from "./rpc.js";
import { initPauseGuard } from "./pause-guard.js";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("socketlib.ready", () => {
  initSocket();
});

Hooks.once("ready", () => {
  // Phones get nagged that the window is too small (core #validateResolution).
  // Nothing actually breaks for a DOM-only client; keep the suppression narrow.
  const role = game.settings.get(MODULE_ID, "role");
  if (role === "phone") suppressResolutionWarning();

  initSocket(); // idempotent fallback in case socketlib.ready raced or didn't fire
  initPauseGuard();
  startHeartbeat();

  globalThis.MobileCommand = {
    ...api,
    enforcer: { diff: diffPreset, apply: applyPreset, prompt: checkAndPrompt },
    resolveExecutorId,
    isExecutor
  };

  if (game.user.isGM && game.settings.get(MODULE_ID, "enforcerAutoPrompt")) {
    checkAndPrompt();
  }

  console.log(`${MODULE_ID} | ready — executor: ${resolveExecutorId() ?? "none"} (this client: ${isExecutor()})`);
});

function suppressResolutionWarning() {
  const original = ui.notifications.notify.bind(ui.notifications);
  ui.notifications.notify = function (message, type, options) {
    if (typeof message === "string" && message.includes("usable window dimensions")) return null;
    return original(message, type, options);
  };
}
