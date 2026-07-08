// §16.3 DM first-run wizard: a guided walk through the shared-table setup —
// TV account, midi preset, table toggles, vision sync, party — ending on a
// live preflight run. DialogV2 steps (the GM client is a desktop, not a phone;
// no custom overlay layer needed). Never forced: the first-load prompt offers
// Run / Later / Don't ask again, and the wizard is reopenable from the DM
// panel's Preflight tab. Closing any step mid-way = "Later" (nothing written
// past the steps already confirmed).
import { MODULE_ID } from "./preset.js";
import { diffPreset, applyPreset } from "./enforcer.js";
import { runPreflight } from "./preflight.js";

const D = () => foundry.applications.api.DialogV2;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

// Shared table toggles the wizard surfaces (step 3) — key, label, one-liner.
const TOGGLES = [
  ["combatPovVision", "Combat POV vision", "In combat the TV shows only the active PC's own senses — no darkvision means a dark screen on their turn."],
  ["ringPlayerColors", "Player-colored token rings", "Each PC's token ring takes its player's color on deploy."],
  ["aooEnabled", "Opportunity-attack watcher", "Leaving (or Polearm-Master-entering) melee reach in combat prompts the reaction; Sentinel punishes attacks on allies."],
  ["partyTeleportActivates", "Party travel activates the scene", "When the PACKED party token crosses to another scene, that scene becomes active for the table (lone scouts never move the screen)."]
];

async function stepWelcomeTv() {
  const current = game.settings.get(MODULE_ID, "displayOwnerUser") || "";
  const opts = [`<option value="" ${current ? "" : "selected"}>— none / skip —</option>`]
    .concat(game.users.filter(u => !u.isGM).map(u =>
      `<option value="${u.id}" ${u.id === current ? "selected" : ""}>${esc(u.name)}${u.character ? ` (has a character: ${esc(u.character.name)})` : ""}</option>`));
  const picked = await D().wait({
    window: { title: "Mobile Command setup — 1/5 · The shared screen" },
    content: `<p><b>Which account runs your TV / shared display?</b></p>
      <p>That account is auto-granted Owner on every PC so the TV can show party vision.
      It should be a dedicated account — <em>not</em> one of the phone players — and should
      have <b>no assigned character</b> (an assigned character makes it swallow that PC's prompts).</p>
      <select name="tv" style="width:100%">${opts.join("")}</select>`,
    buttons: [
      { action: "next", label: "Next", default: true, callback: (_e, b) => b.form.elements.tv.value },
      { action: "cancel", label: "Finish later" }
    ]
  }).catch(() => null);
  if (typeof picked !== "string") return false;
  await game.settings.set(MODULE_ID, "displayOwnerUser", picked);
  return true;
}

async function stepPreset() {
  let drift = [];
  try { drift = diffPreset(); } catch (e) { /* midi missing — the row explains */ }
  const body = drift.length
    ? `<p><b>${drift.length} setting${drift.length === 1 ? "" : "s"} differ</b> from the module's midi/dnd5e preset:</p>
       <ul style="max-height:180px;overflow-y:auto">${drift.slice(0, 12).map(d => `<li><code>${esc(d.path)}</code>: ${esc(JSON.stringify(d.current))} → ${esc(JSON.stringify(d.expected))}</li>`).join("")}${drift.length > 12 ? "<li>…</li>" : ""}</ul>
       <p>The preset is what the phone flows are tested against. Deliberate deviations are fine.</p>`
    : `<p><b>All midi/dnd5e settings already match the preset.</b> Nothing to do here.</p>`;
  const res = await D().wait({
    window: { title: "Mobile Command setup — 2/5 · midi settings" },
    content: body,
    buttons: [
      ...(drift.length ? [{ action: "apply", label: "Apply preset & continue", default: true }] : []),
      { action: "next", label: drift.length ? "Keep mine & continue" : "Next", default: !drift.length },
      { action: "cancel", label: "Finish later" }
    ]
  }).catch(() => null);
  if (res === "apply") { await applyPreset(); return true; }
  return res === "next";
}

async function stepToggles() {
  const modes = game.settings.settings.get(`${MODULE_ID}.aooNpcMode`)?.choices ?? {};
  const rows = TOGGLES.map(([key, label, hint]) => `<label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
      <input type="checkbox" name="${key}" ${game.settings.get(MODULE_ID, key) ? "checked" : ""} style="margin-top:3px">
      <span><b>${esc(label)}</b><br><span style="opacity:.8">${esc(hint)}</span></span>
    </label>`).join("");
  const npc = `<label style="display:block;margin-top:6px"><b>NPC opportunity attacks</b>
      <select name="aooNpcMode" style="width:100%">${Object.entries(modes).map(([k, v]) =>
        `<option value="${k}" ${game.settings.get(MODULE_ID, "aooNpcMode") === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
  const res = await D().wait({
    window: { title: "Mobile Command setup — 3/5 · Table toggles" },
    content: rows + npc,
    buttons: [
      { action: "next", label: "Save & continue", default: true,
        callback: (_e, b) => ({ npcMode: b.form.elements.aooNpcMode.value,
          on: Object.fromEntries(TOGGLES.map(([k]) => [k, b.form.elements[k].checked])) }) },
      { action: "cancel", label: "Finish later" }
    ]
  }).catch(() => null);
  if (!res || typeof res !== "object") return false;
  for (const [k, v] of Object.entries(res.on)) if (game.settings.get(MODULE_ID, k) !== v) await game.settings.set(MODULE_ID, k, v);
  if (game.settings.get(MODULE_ID, "aooNpcMode") !== res.npcMode) await game.settings.set(MODULE_ID, "aooNpcMode", res.npcMode);
  return true;
}

async function stepVision() {
  const res = await D().wait({
    window: { title: "Mobile Command setup — 4/5 · Token vision" },
    content: `<p><b>Sync every PC token's sight from its sheet.</b></p>
      <p>Darkvision, tremorsense and friends live on the ACTOR — freshly placed tokens often
      carry none of it, which reads as "my player is blind on the TV". This pushes the real
      senses onto every placed PC token (safe to re-run any time; the Preflight tab checks it too).</p>`,
    buttons: [
      { action: "sync", label: "Sync now & continue", default: true },
      { action: "next", label: "Skip" },
      { action: "cancel", label: "Finish later" }
    ]
  }).catch(() => null);
  if (res === "sync") {
    try {
      const n = await globalThis.MobileCommand?.syncPartyTokenSight?.();
      ui.notifications.info(`Token senses synced${typeof n === "number" ? ` (${n} tokens)` : ""}.`);
    } catch (e) { ui.notifications.warn(`Sync failed: ${e.message}`); }
    return true;
  }
  return res === "next";
}

async function stepParty() {
  const groups = game.actors.filter(a => a.type === "group");
  const g = groups.find(x => (x.system?.members ?? []).some(m => m.actor)) ?? groups[0];
  const members = g ? (g.system?.members ?? []).map(m => m.actor?.name).filter(Boolean) : [];
  const body = g
    ? `<p><b>Party group:</b> ${esc(g.name)} — ${members.length ? esc(members.join(", ")) : "no members yet"}.</p>
       <p>Membership is managed from the DM panel: the one-tap <b>Create party / Form up</b> buttons,
       the ⟳ rebuild when it goes stale, and the checklist for picking members by hand.</p>`
    : `<p><b>No party group exists yet.</b> Once your PCs stand on the active scene, the DM panel
       offers a one-tap <b>Create party</b> (or the checklist to pick members). Nothing to do here now.</p>`;
  const res = await D().wait({
    window: { title: "Mobile Command setup — 5/5 · The party" },
    content: body,
    buttons: [
      { action: "next", label: "Run the preflight", default: true },
      { action: "cancel", label: "Finish later" }
    ]
  }).catch(() => null);
  return res === "next";
}

async function stepPreflight() {
  const results = await runPreflight();
  const mark = { ok: "✅", warn: "⚠️", fail: "❌" };
  const rows = results.map(c => `<li>${mark[c.status] ?? "•"} <b>${esc(c.label)}</b> — ${esc(c.detail)}</li>`).join("");
  await D().wait({
    window: { title: "Mobile Command setup — Preflight" },
    content: `<p>Final check of the live table:</p><ul style="max-height:240px;overflow-y:auto">${rows}</ul>
      <p>Anything ⚠️/❌ stays visible on the DM panel's <b>Preflight tab</b> (clipboard icon), each with a one-tap fix where one is safe.</p>`,
    buttons: [{ action: "done", label: "Done", default: true }]
  }).catch(() => null);
  return true;
}

export async function runDmWizard() {
  if (!game.user.isGM) return;
  const steps = [stepWelcomeTv, stepPreset, stepToggles, stepVision, stepParty, stepPreflight];
  for (const step of steps) {
    const cont = await step();
    if (!cont) return; // "Finish later" / closed — leave dmOnboarded as-is so the prompt returns
  }
  await game.settings.set(MODULE_ID, "dmOnboarded", true);
}

// First-load prompt (GM only, once per world until answered). "Later" asks again
// next load; "Don't ask again" flips the flag without running (reopen lives on
// the Preflight tab).
export function maybePromptDmWizard() {
  if (!game.user.isGM) return;
  if (game.settings.get(MODULE_ID, "dmOnboarded")) return;
  setTimeout(async () => {
    const res = await D().wait({
      window: { title: "Mobile Command — first-time setup" },
      content: `<p>Walk through the shared-table setup? Five short steps: the TV account,
        midi settings, table toggles, token vision, the party — then a live preflight.</p>`,
      buttons: [
        { action: "run", label: "Run setup", default: true },
        { action: "later", label: "Later" },
        { action: "never", label: "Don't ask again" }
      ]
    }).catch(() => "later");
    if (res === "run") await runDmWizard();
    else if (res === "never") await game.settings.set(MODULE_ID, "dmOnboarded", true);
  }, 6000); // after the preflight auto-run so its results are fresh for the last step
}
