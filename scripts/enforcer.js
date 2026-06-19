import { MODULE_ID, midiPresetEntries, standaloneSettingsPreset } from "./preset.js";

// Settings Enforcer (§7.9): validates the canonical preset on ready, shows a
// loud diff with one-click apply. It never writes without an explicit click —
// the DM may have intentionally deviated mid-session.

// Settings safety (DM 2026-06-19): Foundry does NOT restore a module's world-setting
// changes when the module is disabled/removed. So we snapshot the pre-module values
// of every preset key the FIRST time the preset is applied, and expose a Revert that
// restores them. Run Revert before disabling mobile-command to get your settings back.
const BACKUP_KEY = "presetBackup";

export function captureBackup() {
  if (!game.user?.isGM) return null;
  const existing = game.settings.get(MODULE_ID, BACKUP_KEY);
  if (existing?.captured) return existing; // keep the ORIGINAL (don't overwrite on re-apply)
  const midiCfg = game.settings.get("midi-qol", "ConfigSettings") ?? {};
  const midi = {};
  for (const path of Object.keys(midiPresetEntries())) midi[path] = foundry.utils.getProperty(midiCfg, path) ?? null;
  const settings = {};
  for (const { namespace, key } of standaloneSettingsPreset()) {
    try { settings[`${namespace}.${key}`] = game.settings.get(namespace, key); } catch (e) { /* setting not registered */ }
  }
  const backup = { captured: Date.now(), midi, settings };
  game.settings.set(MODULE_ID, BACKUP_KEY, backup);
  return backup;
}

export function hasBackup() {
  return !!game.settings.get(MODULE_ID, BACKUP_KEY)?.captured;
}

export async function revertPreset() {
  if (!game.user?.isGM) throw new Error("mobile-command | revertPreset requires a GM user");
  const backup = game.settings.get(MODULE_ID, BACKUP_KEY);
  if (!backup?.captured) {
    ui.notifications.warn("mobile-command | no settings backup found — nothing to revert (the preset was never applied through this module).");
    return false;
  }
  const cfg = game.settings.get("midi-qol", "ConfigSettings");
  for (const [path, value] of Object.entries(backup.midi ?? {})) foundry.utils.setProperty(cfg, path, value);
  await game.settings.set("midi-qol", "ConfigSettings", cfg);
  for (const [nk, value] of Object.entries(backup.settings ?? {})) {
    const dot = nk.indexOf(".");
    const namespace = nk.slice(0, dot), key = nk.slice(dot + 1);
    try { await game.settings.set(namespace, key, value); } catch (e) { console.warn(`mobile-command | could not revert ${nk}`, e); }
  }
  await game.settings.set(MODULE_ID, BACKUP_KEY, {}); // clear so a later apply re-snapshots a fresh original
  ui.notifications.info("mobile-command | reverted midi-qol / dnd5e settings to the pre-module backup. Safe to disable the module now.");
  return true;
}

export function diffPreset() {
  const drift = [];

  const midiCfg = game.settings.get("midi-qol", "ConfigSettings");
  for (const [path, expected] of Object.entries(midiPresetEntries())) {
    const current = foundry.utils.getProperty(midiCfg, path);
    if (current !== expected) {
      drift.push({ kind: "midi", path, current, expected });
    }
  }

  for (const { namespace, key, value } of standaloneSettingsPreset()) {
    const current = game.settings.get(namespace, key);
    if (current !== value) {
      drift.push({ kind: "setting", namespace, key, path: `${namespace}.${key}`, current, expected: value });
    }
  }

  return drift;
}

export async function applyPreset(drift = null) {
  drift ??= diffPreset();
  if (!drift.length) return drift;
  if (!game.user.isGM) throw new Error("mobile-command | applyPreset requires a GM user");

  captureBackup(); // snapshot the pre-module values once, so Revert can restore them

  const midiDrift = drift.filter(d => d.kind === "midi");
  if (midiDrift.length) {
    const cfg = game.settings.get("midi-qol", "ConfigSettings");
    for (const d of midiDrift) foundry.utils.setProperty(cfg, d.path, d.expected);
    await game.settings.set("midi-qol", "ConfigSettings", cfg);
  }
  for (const d of drift.filter(d => d.kind === "setting")) {
    await game.settings.set(d.namespace, d.key, d.expected);
  }

  ui.notifications.info(`mobile-command | applied settings preset (${drift.length} value${drift.length === 1 ? "" : "s"})`);
  return diffPreset();
}

// A settings-menu button (registered in settings.js) that confirms + reverts. Run
// it BEFORE disabling the module — Foundry won't restore world settings on disable.
export function revertPresetWithConfirm() {
  return foundry.applications.api.DialogV2.confirm({
    window: { title: "Mobile Command — revert settings" },
    content: `<p>Restore the midi-qol / dnd5e settings mobile-command changed back to the values saved before it was first applied?</p>
      <p>${hasBackup() ? "A backup was found." : "<strong>No backup found</strong> — the preset hasn't been applied through this module, so there's nothing to revert."}</p>`,
    yes: { label: "Revert", icon: "fas fa-rotate-left" },
    no: { label: "Cancel" },
    modal: true,
    rejectClose: false
  }).then((ok) => (ok ? revertPreset() : false));
}

// Minimal settings-menu wrapper: clicking the menu button runs the confirm above
// instead of opening a form of its own. FormApplication is deprecated in v14 but
// still supported through v16; registration is guarded in settings.js.
export function makeRevertMenuClass() {
  const Base = globalThis.FormApplication ?? foundry.appv1?.api?.FormApplication;
  if (!Base) return null;
  return class RevertPresetMenu extends Base {
    render() { revertPresetWithConfirm(); return this; }
    async _updateObject() {}
  };
}

function formatValue(v) {
  return typeof v === "string" ? `"${v}"` : String(v);
}

export async function checkAndPrompt() {
  const drift = diffPreset();
  if (!drift.length) {
    console.log("mobile-command | settings preset verified, no drift");
    return;
  }

  const rows = drift.map(d =>
    `<tr><td><code>${d.path}</code></td><td>${formatValue(d.current)}</td><td>${formatValue(d.expected)}</td></tr>`
  ).join("");
  const content = `
    <p><strong>${drift.length}</strong> setting(s) differ from the mobile-command preset (DESIGN.md §D4).
    The phone UX depends on these — config is product.</p>
    <table>
      <thead><tr><th>Setting</th><th>Current</th><th>Preset</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  const apply = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Mobile Command — settings drift" },
    content,
    yes: { label: "Apply preset" },
    no: { label: "Ignore for now" },
    modal: false,
    rejectClose: false
  });
  if (apply) await applyPreset(drift);
}
