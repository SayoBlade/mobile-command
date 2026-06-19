import { MODULE_ID, SAVE_TIMEOUT_SETTING } from "./preset.js";
import { makeRevertMenuClass } from "./enforcer.js";

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

  // Snapshot of the midi-qol/dnd5e values from before the preset was first applied,
  // so the module's changes can be reverted (Foundry won't do it on disable).
  game.settings.register(MODULE_ID, "presetBackup", {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // A "Revert mobile-command settings" button in the module config — run it before
  // disabling the module to restore your original midi-qol/dnd5e settings. Guarded:
  // a base-class hiccup here must never break module load.
  try {
    const RevertMenu = makeRevertMenuClass();
    if (RevertMenu) {
      game.settings.registerMenu(MODULE_ID, "revertPreset", {
        name: "Revert mobile-command settings",
        label: "Revert to backup",
        hint: "Restore the midi-qol / dnd5e settings mobile-command changed to the values from before it was applied. Run this BEFORE disabling the module — Foundry does not revert them automatically.",
        icon: "fas fa-rotate-left",
        type: RevertMenu,
        restricted: true
      });
    }
  } catch (e) {
    console.warn(`${MODULE_ID} | could not register the revert-settings menu (use MobileCommand.enforcer.revert() instead)`, e);
  }
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
