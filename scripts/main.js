import { MODULE_ID } from "./preset.js";
import { registerSettings, resolveExecutorId, isExecutor } from "./settings.js";
import { diffPreset, applyPreset, checkAndPrompt, revertPreset, hasBackup } from "./enforcer.js";
import { initSocket, startHeartbeat, registerSaveRelay, api } from "./rpc.js";
import { initPauseGuard } from "./pause-guard.js";
import { openShell, closeShell, maybeAutoOpenShell, registerShellHooks, isPhoneClient, isDisplayClient } from "./shell.js";
import { registerDMPanel } from "./dm-panel.js";

Hooks.once("init", () => {
  registerSettings();
  // TV clean-canvas toggle (DM 2026-06-19): hide ALL Foundry UI so the shared
  // display shows only the canvas. Auto-on for the "display" role; this keybinding
  // toggles it back so the DM can reach settings on the display client (escape hatch).
  try {
    game.keybindings.register(MODULE_ID, "toggleCleanDisplay", {
      name: "Mobile Command: Toggle clean display (TV)",
      hint: "Hide/show all Foundry UI so a shared display shows only the canvas. Use it to reach settings on a display-role client.",
      editable: [{ key: "Backquote" }],
      onDown: () => {
        const on = document.body.classList.toggle("mc-clean");
        if (on) showCleanHint(); else hideCleanHint();
        return true;
      },
      restricted: false
    });
  } catch (e) {
    console.warn(`${MODULE_ID} | could not register the clean-display keybinding`, e);
  }
  // "Frame the party" (DM 2026-06-19): pan + zoom the local canvas to fit all PC
  // tokens. Out of combat nothing auto-frames the TV, so press this on the display
  // client to recenter on the party (their combined vision is already shown OOC).
  try {
    game.keybindings.register(MODULE_ID, "frameParty", {
      name: "Mobile Command: Focus the party",
      hint: "Frame all player-character tokens here AND on the table display, and return the display to its default camera (Stream Deck-friendly).",
      editable: [{ key: "KeyP" }],
      onDown: () => { focusPartyAll(); return true; },
      restricted: false
    });
    game.keybindings.register(MODULE_ID, "toggleTvManual", {
      name: "Mobile Command: Toggle manual TV control",
      hint: "While on, your pan/zoom drives the table display (a spotlight tool). Focus-party turns it back off (Stream Deck-friendly).",
      editable: [{ key: "KeyM" }],
      onDown: () => { toggleTvManual(); return true; },
      restricted: false
    });
  } catch (e) {
    console.warn(`${MODULE_ID} | could not register the camera keybindings`, e);
  }
});

// Pan + zoom the local canvas to fit every (visible) player-character token. Used by
// the "Frame the party" keybinding and exposed as MobileCommand.frameParty().
function framePartyTokens() {
  try {
    if (!canvas?.ready) return false;
    const toks = (canvas.tokens?.placeables ?? []).filter(
      (t) => t.actor?.hasPlayerOwner && t.actor?.type === "character" && !t.document?.hidden);
    if (!toks.length) { ui.notifications?.info?.(`${MODULE_ID} | no party tokens on this scene to frame`); return false; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of toks) {
      const w = t.w ?? t.width ?? 0, h = t.h ?? t.height ?? 0;
      minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + w); maxY = Math.max(maxY, t.y + h);
    }
    const pad = (canvas.grid?.size ?? 100) * 2;
    const worldW = (maxX - minX) + pad * 2, worldH = (maxY - minY) + pad * 2;
    const [screenW, screenH] = canvas.screenDimensions ?? [window.innerWidth, window.innerHeight];
    const fit = Math.min(screenW / worldW, screenH / worldH);
    const scale = Math.max(0.1, Math.min(fit, CONFIG.Canvas?.maxZoom ?? 3, 1.2)); // never over-zoom a tight group
    canvas.animatePan({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, scale, duration: 400 });
    return true;
  } catch (e) {
    console.warn(`${MODULE_ID} | framePartyTokens failed`, e);
    return false;
  }
}

// --- TV camera remote control (DM 2026-06-19) -------------------------------
// The DM drives the shared display's camera: "focus party" reframes it, and a
// "manual" toggle mirrors the DM's own pan/zoom to the display (a spotlight tool
// for OOC scene-setting). Relayed over Foundry's socket; only display clients act.
let tvManual = false;   // (display side) currently under manual DM control
let dmRelaying = false; // (DM side) mirroring our pan/zoom to the display
let _panTimer = null, _lastPan = 0;

function tvBroadcast(payload) { try { game.socket?.emit(`module.${MODULE_ID}`, payload); } catch (e) { /* socket not ready */ } }

function onTvControl(payload) {
  if (!payload || typeof payload !== "object" || !isDisplayClient()) return; // only the shared display reacts
  if (payload.cmd === "frameParty") { tvManual = false; framePartyTokens(); }
  else if (payload.cmd === "manual") { tvManual = !!payload.on; }
  else if (payload.cmd === "pan" && tvManual && canvas?.ready) {
    try { canvas.pan({ x: payload.x, y: payload.y, scale: payload.scale }); } catch (e) { /* pan best-effort */ }
  }
}

// Focus the party here AND on the display(s), and end manual mode so the display
// returns to default (follow the turn in combat / shared party vision out of it).
function focusPartyAll() {
  // On the display client this IS the TV → frame here. On the DM client, only drive
  // the display (the DM keeps their own view — they were zoomed out to click this).
  if (isDisplayClient()) framePartyTokens();
  tvBroadcast({ cmd: "frameParty" });
  if (dmRelaying) setDmRelaying(false);
}

function setDmRelaying(on) {
  dmRelaying = !!on;
  tvBroadcast({ cmd: "manual", on: dmRelaying });
  Hooks.callAll("mobile-command.tvManualChanged", dmRelaying);
  ui.notifications?.info?.(`${MODULE_ID} | manual TV control ${dmRelaying ? "ON — your pan/zoom drives the display" : "OFF"}`);
}
function toggleTvManual() { setDmRelaying(!dmRelaying); return dmRelaying; }
function isTvManualActive() { return dmRelaying; }

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

  // TV (display role): canvas-only clean view. mc-display marks the role; mc-clean
  // hides the chrome (toggle with the keybinding to reach settings). Runtime-only —
  // disabling the module just stops adding these classes, so it auto-reverts.
  if (isDisplayClient()) { document.body.classList.add("mc-display", "mc-clean"); showCleanHint(); }

  // TV camera remote control: receive DM commands (display clients act), and on the
  // DM side mirror pan/zoom to the display while manual mode is on (throttled — the
  // canvasPan hook fires rapidly during a drag).
  game.socket.on(`module.${MODULE_ID}`, onTvControl);
  Hooks.on("canvasPan", (_c, view) => {
    if (!dmRelaying || !view) return;
    const now = Date.now();
    const send = () => { _lastPan = Date.now(); tvBroadcast({ cmd: "pan", x: view.x, y: view.y, scale: view.scale }); };
    clearTimeout(_panTimer);
    if (now - _lastPan > 80) send(); else _panTimer = setTimeout(send, 80 - (now - _lastPan));
  });

  injectShellStyles(); // load CSS via JS so a plain F5 works without re-reading the manifest
  initSocket(); // idempotent fallback in case socketlib.ready raced or didn't fire
  initPauseGuard();
  startHeartbeat();
  registerShellHooks();
  registerDMPanel(); // DM-assign panel (GM clients only; self-gates)
  registerSaveRelay(); // executor relays midi save requests to phones (self-gates on isExecutor)

  globalThis.MobileCommand = {
    ...api,
    enforcer: { diff: diffPreset, apply: applyPreset, prompt: checkAndPrompt, revert: revertPreset, hasBackup },
    openShell,
    closeShell,
    frameParty: framePartyTokens,        // local canvas only
    focusParty: focusPartyAll,           // here + the display(s) + exit manual
    toggleTvManual,                      // DM drives the display by panning own view
    tvManualActive: isTvManualActive,
    resolveExecutorId,
    isExecutor
  };

  maybeAutoOpenShell();

  if (game.user.isGM && game.settings.get(MODULE_ID, "enforcerAutoPrompt")) {
    checkAndPrompt();
  }

  console.log(`${MODULE_ID} | ready — executor: ${resolveExecutorId() ?? "none"} (this client: ${isExecutor()})`);
});

// Clean-display escape-hatch hint: a dismissable pill telling the user how to get
// the Foundry UI back, so a display-role client (or anyone who toggled clean mode)
// isn't stranded. Auto-fades after ~60s; click or the keybinding dismisses it.
function showCleanHint() {
  let hint = document.getElementById("mc-clean-hint");
  if (!hint) {
    hint = document.createElement("div");
    hint.id = "mc-clean-hint";
    hint.innerHTML = `Table display — press <kbd>\`</kbd> for the Foundry UI`;
    hint.addEventListener("click", () => hint.remove());
    document.body.appendChild(hint);
  }
  hint.classList.remove("mc-fade");
  clearTimeout(showCleanHint._timer);
  showCleanHint._timer = setTimeout(() => {
    hint.classList.add("mc-fade");
    setTimeout(() => hint.remove(), 900);
  }, 60000);
}
function hideCleanHint() {
  clearTimeout(showCleanHint._timer);
  document.getElementById("mc-clean-hint")?.remove();
}

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
