import { MODULE_ID } from "./preset.js";
import { registerSettings, resolveExecutorId, isExecutor } from "./settings.js";
import { diffPreset, applyPreset, checkAndPrompt } from "./enforcer.js";
import { initSocket, startHeartbeat, api } from "./rpc.js";
import { initPauseGuard } from "./pause-guard.js";
import { openShell, closeShell, maybeAutoOpenShell, registerShellHooks, isPhoneClient } from "./shell.js";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("setup", () => {
  // D2: phones run canvasless. The canvas draws on world entry — AFTER setup,
  // BEFORE ready — and loading it crashes iOS Safari (confirmed on real
  // hardware 2026-06-13). So disable it here, before the draw, by writing the
  // exact localStorage key core reads at canvas-init time (foundry.mjs
  // #setClient: storage key is `${namespace}.${key}`, value JSON-encoded).
  // Phones: no canvas (D2). Everyone else (DM, TV): canvas ON. Set BOTH
  // directions so a browser that switches roles (e.g. a player account then
  // the DM in the same browser) self-corrects — core.noCanvas is per-browser
  // localStorage, so a leftover "true" from a phone session would otherwise
  // strand a GM without a canvas.
  try {
    const want = isPhoneClient();
    const current = game.settings.get("core", "noCanvas") === true;
    if (want !== current) {
      window.localStorage.setItem("core.noCanvas", want ? "true" : "false");
      console.log(`${MODULE_ID} | ${want ? "phone" : "non-phone"} client — canvas ${want ? "disabled" : "enabled"} (D2)`);
    }
  } catch (e) {
    console.warn(`${MODULE_ID} | could not set canvas mode`, e);
  }
});

Hooks.once("socketlib.ready", () => {
  initSocket();
});

Hooks.once("ready", () => {
  // Phones get nagged that the window is too small (core #validateResolution).
  // Nothing actually breaks for a DOM-only client; keep the suppression narrow.
  if (isPhoneClient()) {
    suppressResolutionWarning();
    document.body.classList.add("mc-phone"); // scopes phone-only CSS (e.g. roll-dialog spacing)
    enableSafeAreaInsets(); // so env(safe-area-inset-*) is non-zero on iOS (B1 tab clearance)
  }

  injectShellStyles(); // load CSS via JS so a plain F5 works without re-reading the manifest
  initSocket(); // idempotent fallback in case socketlib.ready raced or didn't fire
  initPauseGuard();
  startHeartbeat();
  registerShellHooks();

  globalThis.MobileCommand = {
    ...api,
    enforcer: { diff: diffPreset, apply: applyPreset, prompt: checkAndPrompt },
    openShell,
    closeShell,
    resolveExecutorId,
    isExecutor
  };

  maybeAutoOpenShell();

  if (game.user.isGM && game.settings.get(MODULE_ID, "enforcerAutoPrompt")) {
    checkAndPrompt();
  }

  console.log(`${MODULE_ID} | ready — executor: ${resolveExecutorId() ?? "none"} (this client: ${isExecutor()})`);
});

function enableSafeAreaInsets() {
  // env(safe-area-inset-*) only resolves to non-zero when the viewport opts in
  // with viewport-fit=cover. Append it to Foundry's existing viewport meta.
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/viewport-fit/.test(vp.content)) vp.content += ", viewport-fit=cover";
}

function injectShellStyles() {
  const id = `${MODULE_ID}-shell-styles`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `modules/${MODULE_ID}/styles/shell.css`;
  document.head.appendChild(link);
}

function suppressResolutionWarning() {
  const original = ui.notifications.notify.bind(ui.notifications);
  ui.notifications.notify = function (message, type, options) {
    if (typeof message === "string" && message.includes("usable window dimensions")) return null;
    return original(message, type, options);
  };
}
