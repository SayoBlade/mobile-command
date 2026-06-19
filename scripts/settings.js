import { MODULE_ID, SAVE_TIMEOUT_SETTING } from "./preset.js";
import { makeConfirmMenuClass, deactivate, reactivate, hasBackup, hasReactivateSnapshot } from "./enforcer.js";

export function registerSettings() {
  // D7 role, per-client. Phase 1 uses it only to decide which client runs
  // executor duties ("dm" + GM role); the phone/display shells come later.
  game.settings.register(MODULE_ID, "role", {
    name: "MOBILECOMMAND.Role.Name",
    hint: "MOBILECOMMAND.Role.Hint",
    scope: "client",
    config: true,
    type: String,
    default: "auto",
    choices: {
      auto: "MOBILECOMMAND.Role.Auto",
      phone: "MOBILECOMMAND.Role.Phone",
      display: "MOBILECOMMAND.Role.Display",
      dm: "MOBILECOMMAND.Role.Dm"
    }
  });

  // §2.1: "service" is a capability flag on a GM client, not a dedicated user.
  // Empty = auto: the active GM (game.users.activeGM) is the executor.
  game.settings.register(MODULE_ID, "executorUser", {
    name: "MOBILECOMMAND.ExecutorUser.Name",
    hint: "MOBILECOMMAND.ExecutorUser.Hint",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  // §2.1 pause-based freeze: executor auto-pauses when it leaves the active
  // scene, auto-resumes on return (only for pauses it initiated itself).
  game.settings.register(MODULE_ID, "pauseGuard", {
    name: "MOBILECOMMAND.PauseGuard.Name",
    hint: "MOBILECOMMAND.PauseGuard.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "heartbeatSeconds", {
    name: "MOBILECOMMAND.Heartbeat.Name",
    hint: "MOBILECOMMAND.Heartbeat.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 5
  });

  // Q4: expected midi playerSaveTimeout, policed by the enforcer.
  game.settings.register(MODULE_ID, SAVE_TIMEOUT_SETTING, {
    name: "MOBILECOMMAND.SaveTimeout.Name",
    hint: "MOBILECOMMAND.SaveTimeout.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 60
  });

  game.settings.register(MODULE_ID, "enforcerAutoPrompt", {
    name: "MOBILECOMMAND.EnforcerAutoPrompt.Name",
    hint: "MOBILECOMMAND.EnforcerAutoPrompt.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Comprehensive snapshots so the module's changes can be reverted/reactivated
  // (Foundry won't revert them on disable). presetBackup = original pre-module state;
  // reactivateSnapshot = the module-active state captured when you revert.
  game.settings.register(MODULE_ID, "presetBackup", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, "reactivateSnapshot", { scope: "world", config: false, type: Object, default: {} });

  // Two buttons in the module config: "Remove Mobile Command & revert" (snapshots the
  // current state for reactivation, then restores your original settings) and
  // "Reactivate". Guarded — a base-class hiccup must never break module load.
  try {
    const DeactivateMenu = makeConfirmMenuClass(() => ({
      title: "Remove Mobile Command & revert settings",
      content: `<p><strong>This reverts the midi-qol / dnd5e settings to the snapshot from before Mobile Command was first applied.</strong></p>
        <p>First it snapshots your <em>current</em> settings so you can <b>Reactivate Mobile Command</b> later. It does <em>not</em> uninstall the module — disable or remove it from <b>Manage Modules</b> afterward.</p>
        <p>${hasBackup() ? "✓ An original backup exists." : "<strong>⚠ No original backup found</strong> — apply the preset at least once first, or there's nothing to revert to."}</p>`,
      yesLabel: "Revert now",
      icon: "fas fa-rotate-left",
      action: deactivate
    }));
    const ReactivateMenu = makeConfirmMenuClass(() => ({
      title: "Reactivate Mobile Command",
      content: `<p>Restore the Mobile Command settings ${hasReactivateSnapshot() ? "from the snapshot taken when you last reverted." : "by re-applying the preset (no prior active snapshot found)."}</p>`,
      yesLabel: "Reactivate",
      icon: "fas fa-rotate-right",
      action: reactivate
    }));
    if (DeactivateMenu) {
      game.settings.registerMenu(MODULE_ID, "deactivate", {
        name: "⚠ Remove Mobile Command & revert",
        label: "⚠ Remove & revert settings",
        hint: "IMPORTANT — run this BEFORE you disable or remove Mobile Command. Foundry does NOT restore the midi-qol / dnd5e settings it changed; this button restores the snapshot from before it was applied (and snapshots the current state first so you can Reactivate).",
        icon: "fas fa-triangle-exclamation",
        type: DeactivateMenu,
        restricted: true
      });
    }
    if (ReactivateMenu) {
      game.settings.registerMenu(MODULE_ID, "reactivate", {
        name: "Reactivate Mobile Command",
        label: "Reactivate Mobile Command",
        hint: "Re-apply the Mobile Command settings (restores the snapshot taken at the last revert, else re-applies the preset).",
        icon: "fas fa-rotate-right",
        type: ReactivateMenu,
        restricted: true
      });
    }
  } catch (e) {
    console.warn(`${MODULE_ID} | could not register the deactivate/reactivate menus (use MobileCommand.enforcer.deactivate()/reactivate())`, e);
  }

  // A dominant red warning at the top of Mobile Command's settings so the
  // revert-before-disable step is impossible to miss (GM only).
  Hooks.on("renderSettingsConfig", (app, html) => {
    try {
      if (!game.user?.isGM) return;
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root || root.querySelector("#mc-revert-warning")) return;
      const warning = document.createElement("div");
      warning.id = "mc-revert-warning";
      warning.innerHTML = `<i class="fas fa-triangle-exclamation"></i> <strong>Before you disable or remove Mobile Command</strong>, click <b>“⚠ Remove &amp; revert settings”</b> below — Foundry will <u>not</u> restore the midi-qol / dnd5e settings it changed on its own.`;
      warning.style.cssText = "display:flex;gap:10px;align-items:center;margin:8px 0;padding:11px 14px;border:1px solid #c0504a;border-left:4px solid #c0504a;border-radius:8px;background:rgba(192,80,74,0.14);color:#f1b5b0;font-weight:600;line-height:1.4;";
      // Anchor next to our "Remove & revert" menu button; fall back to the form top.
      const btn = [...root.querySelectorAll("button")].find((b) => /remove & revert/i.test(b.textContent || ""));
      const anchor = btn?.closest(".form-group, .settings-list-entry, .form-fields, label") ?? btn;
      if (anchor?.parentElement) anchor.parentElement.insertBefore(warning, anchor);
      else (root.querySelector(".scrollable, section, form") ?? root).prepend(warning);
    } catch (e) {
      console.warn(`${MODULE_ID} | could not inject the revert warning`, e);
    }
  });
}

export function resolveExecutorId() {
  const configured = game.settings.get(MODULE_ID, "executorUser");
  if (configured) {
    const user = game.users.get(configured) ?? game.users.getName(configured);
    if (user?.active && user.isGM) return user.id;
  }
  return game.users.activeGM?.id ?? null;
}

export function isExecutor() {
  return game.user.id === resolveExecutorId();
}
