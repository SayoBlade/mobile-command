import { MODULE_ID, midiPresetEntries, standaloneSettingsPreset } from "./preset.js";

// Settings Enforcer (§7.9): validates the canonical preset on ready, shows a
// loud diff with one-click apply. It never writes without an explicit click —
// the DM may have intentionally deviated mid-session.

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
