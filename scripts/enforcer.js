import { MODULE_ID, midiPresetEntries, standaloneSettingsPreset } from "./preset.js";

// Settings Enforcer (§7.9): validates the canonical preset on ready, shows a
// loud diff with one-click apply. It never writes without an explicit click —
// the DM may have intentionally deviated mid-session.

// Settings safety (DM 2026-06-19): Foundry does NOT restore a module's world-setting
// changes when the module is disabled/removed. So we snapshot the pre-module values
// of every preset key the FIRST time the preset is applied, and expose a Revert that
// restores them. Run Revert before disabling mobile-command to get your settings back.
const BACKUP_KEY = "presetBackup";            // ORIGINAL, pre-mobile-command settings (first apply)
const REACTIVATE_KEY = "reactivateSnapshot";  // mobile-command-ACTIVE settings (taken when reverting)

// A COMPREHENSIVE snapshot of everything the module can change: the WHOLE midi-qol
// ConfigSettings object (not just the preset keys) plus the standalone midi/dnd5e
// settings. So a restore is complete, not key-by-key. (Those are the only mods the
// module modifies — it reads AC5E etc. but never writes their settings.)
function snapshotCurrentSettings() {
  let midiConfig = null;
  try { midiConfig = foundry.utils.deepClone(game.settings.get("midi-qol", "ConfigSettings") ?? {}); } catch (e) { /* midi not present */ }
  const standalone = {};
  for (const { namespace, key } of standaloneSettingsPreset()) {
    try { standalone[`${namespace}.${key}`] = game.settings.get(namespace, key); } catch (e) { /* not registered */ }
  }
  return { at: Date.now(), midiConfig, standalone };
}

async function restoreSnapshot(snap) {
  if (!snap?.at && !snap?.captured) return false; // (captured = legacy snapshots)
  if (snap.midiConfig) {
    try { await game.settings.set("midi-qol", "ConfigSettings", foundry.utils.deepClone(snap.midiConfig)); }
    catch (e) { console.warn("mobile-command | could not restore midi ConfigSettings", e); }
  } else if (snap.midi) { // legacy: per-path patch into the live ConfigSettings
    try {
      const cfg = game.settings.get("midi-qol", "ConfigSettings");
      for (const [path, value] of Object.entries(snap.midi)) foundry.utils.setProperty(cfg, path, value);
      await game.settings.set("midi-qol", "ConfigSettings", cfg);
    } catch (e) { console.warn("mobile-command | could not restore legacy midi paths", e); }
  }
  for (const [nk, value] of Object.entries(snap.standalone ?? snap.settings ?? {})) {
    if (value === undefined) continue;
    const dot = nk.indexOf(".");
    try { await game.settings.set(nk.slice(0, dot), nk.slice(dot + 1), value); }
    catch (e) { console.warn(`mobile-command | could not restore ${nk}`, e); }
  }
  return true;
}

// Snapshot the ORIGINAL (pre-module) settings the first time the preset is applied.
export function captureBackup() {
  if (!game.user?.isGM) return null;
  const existing = game.settings.get(MODULE_ID, BACKUP_KEY);
  if (existing?.at || existing?.captured) return existing; // keep the true original (incl. legacy); never overwrite
  const snap = snapshotCurrentSettings();
  game.settings.set(MODULE_ID, BACKUP_KEY, snap);
  return snap;
}

export function hasBackup() { const b = game.settings.get(MODULE_ID, BACKUP_KEY); return !!(b?.at || b?.captured); }
export function hasReactivateSnapshot() { return !!game.settings.get(MODULE_ID, REACTIVATE_KEY)?.at; }

// "Remove Mobile Command & revert": snapshot the CURRENT (module-active) settings so
// they can be reactivated later, THEN restore the original pre-module snapshot. Does
// everything except uninstall — disable/remove the module from Manage Modules after.
export async function deactivate() {
  if (!game.user?.isGM) throw new Error("mobile-command | deactivate requires a GM user");
  const original = game.settings.get(MODULE_ID, BACKUP_KEY);
  if (!original?.at) {
    ui.notifications.warn("mobile-command | no original backup found — apply the preset at least once first; there's nothing to revert to.");
    return false;
  }
  await game.settings.set(MODULE_ID, REACTIVATE_KEY, snapshotCurrentSettings()); // so Reactivate can bring the config back
  await restoreSnapshot(original);
  ui.notifications.info("mobile-command | reverted to your pre-module settings. You can disable/remove the module now — use 'Reactivate Mobile Command' to restore its config.");
  return true;
}

// "Reactivate Mobile Command": restore the module-active snapshot taken at the last
// revert (else just re-apply the preset).
export async function reactivate() {
  if (!game.user?.isGM) throw new Error("mobile-command | reactivate requires a GM user");
  const snap = game.settings.get(MODULE_ID, REACTIVATE_KEY);
  if (snap?.at) {
    await restoreSnapshot(snap);
    ui.notifications.info("mobile-command | reactivated — restored the mobile-command settings.");
    return true;
  }
  await applyPreset();
  ui.notifications.info("mobile-command | applied the mobile-command preset.");
  return true;
}

export const revertPreset = deactivate; // back-compat alias

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

// Generic settings-menu wrapper: clicking the menu button shows a confirm (built by
// buildConfig()) and runs its action — no form of its own. FormApplication is
// deprecated in v14 but supported through v16; registration is guarded in settings.js.
export function makeConfirmMenuClass(buildConfig) {
  const Base = globalThis.FormApplication ?? foundry.appv1?.api?.FormApplication;
  if (!Base) return null;
  return class extends Base {
    render() {
      const cfg = buildConfig();
      foundry.applications.api.DialogV2.confirm({
        window: { title: cfg.title },
        content: cfg.content,
        yes: { label: cfg.yesLabel ?? "Confirm", icon: cfg.icon },
        no: { label: "Cancel" },
        modal: true,
        rejectClose: false
      }).then((ok) => { if (ok) return cfg.action(); }).catch(() => {});
      return this;
    }
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
