// "Message for dev" — one button that produces everything needed to debug a report, so nobody has
// to be asked "what version are you on / what else is installed / what did the console say".
//
// This is also the pressure valve for a rule (UI-BIBLE §7.2): the visible UI says the plain thing
// in plain words and nothing else. Version pins, internal section numbers, hook names, module ids —
// all of it belongs HERE, in a block someone copies and pastes, never on a card the DM reads at the
// table. If a warning feels like it needs the technical half, the technical half goes in the report.

import { MODULE_ID } from "./preset.js";
import { lastResults as preflightResults, lastRunAt as preflightRunAt } from "./preflight.js";
import { resolveExecutorId, isExecutor, isOnlineTable } from "./settings.js";

// ── Error capture ───────────────────────────────────────────────────────────
// A bounded ring of whatever went wrong recently. Installed once at init on EVERY client, because
// the errors that matter most are the ones nobody was watching the console for. Bounded hard: this
// runs for a whole session and must never become the reason the tab slows down.
const ERROR_MAX = 30;
const errors = [];
let installed = false;

function note(kind, parts) {
  try {
    const text = parts
      .map(p => {
        if (p instanceof Error) return `${p.name}: ${p.message}\n${(p.stack ?? "").split("\n").slice(1, 4).join("\n")}`;
        if (typeof p === "string") return p;
        try { return JSON.stringify(p); } catch (e) { return String(p); }
      })
      .join(" ")
      .slice(0, 600); // one runaway object must not eat the whole report
    errors.push({ at: new Date().toISOString(), kind, text });
    if (errors.length > ERROR_MAX) errors.shift();
  } catch (e) { /* the error recorder must never be the error */ }
}

/** Start recording errors. Call once, at init, on every client. Idempotent. */
export function installErrorCapture() {
  if (installed) return;
  installed = true;
  const realError = console.error?.bind(console);
  if (realError) {
    console.error = (...args) => { note("console", args); realError(...args); };
  }
  globalThis.addEventListener?.("error", (ev) => note("uncaught", [ev?.message ?? "", ev?.error ?? ""]));
  globalThis.addEventListener?.("unhandledrejection", (ev) => note("promise", [ev?.reason ?? ""]));
}

// ── The report ──────────────────────────────────────────────────────────────

function safe(fn, fallback = "?") {
  try { const v = fn(); return v === undefined || v === null ? fallback : v; } catch (e) { return `<${e.message}>`; }
}

function moduleLines() {
  const out = [];
  for (const m of game.modules ?? []) {
    if (!m.active) continue;
    out.push(`  ${m.id} ${m.version ?? "?"}${m.id === MODULE_ID ? "   <- this module" : ""}`);
  }
  return out.sort().join("\n") || "  (none)";
}

function settingLines() {
  const out = [];
  for (const [key, setting] of game.settings?.settings ?? []) {
    if (!key.startsWith(`${MODULE_ID}.`)) continue;
    const name = key.slice(MODULE_ID.length + 1);
    let value;
    try { value = game.settings.get(MODULE_ID, name); } catch (e) { value = `<${e.message}>`; }
    // Long structured settings (rosters, seat maps, question banks) would drown the report; their
    // SHAPE is what matters when something is wrong with them, not their contents.
    if (value && typeof value === "object") {
      const n = Array.isArray(value) ? value.length : Object.keys(value).length;
      value = `${Array.isArray(value) ? "array" : "object"}(${n})`;
    } else if (typeof value === "string" && value.length > 80) {
      value = `${value.slice(0, 80)}… (${value.length} chars)`;
    }
    out.push(`  ${name} = ${JSON.stringify(value)}${setting?.scope ? `   [${setting.scope}]` : ""}`);
  }
  return out.join("\n") || "  (none)";
}

function preflightLines() {
  if (!preflightResults) return "  not run this session";
  return preflightResults.map(c => `  [${c.status.toUpperCase()}] ${c.label}: ${c.detail ?? ""}`).join("\n");
}

function sceneLine() {
  const s = game.scenes?.active;
  if (!s) return "  none active";
  const tokens = s.tokens?.size ?? 0;
  const pcs = [...(s.tokens ?? [])].filter(t => t.actor?.hasPlayerOwner && t.actor?.type === "character").length;
  return [
    `  name        ${s.name}`,
    `  id          ${s.id}`,
    `  viewed      ${canvas?.scene?.id === s.id ? "yes" : `no (viewing ${canvas?.scene?.name ?? "nothing"})`}`,
    `  grid        ${s.grid?.type} @ ${s.grid?.size}px, ${s.grid?.distance} ${s.grid?.units}`,
    `  tokens      ${tokens} (${pcs} player-owned characters)`,
    // The PREPARED darkness is the animation's current frame, not the truth — read the source
    // value, the trap §41 documents.
    `  darkness    ${s._source?.environment?.darknessLevel ?? "?"} (source), lock ${s._source?.environment?.globalLight?.enabled ?? "?"}`,
    `  tokenVision ${s.tokenVision}`
  ].join("\n");
}

function userLines() {
  const execId = safe(() => resolveExecutorId(), null);
  return [...(game.users ?? [])]
    .map(u => {
      const bits = [u.active ? "online" : "offline", u.isGM ? "GM" : "player"];
      if (u.id === execId) bits.push("EXECUTOR");
      if (u.id === game.user?.id) bits.push("THIS CLIENT");
      if (u.character) bits.push(`char: ${u.character.name}`);
      return `  ${u.name} — ${bits.join(", ")}`;
    })
    .join("\n");
}

function combatLines() {
  const c = game.combat;
  if (!c) return "  no combat";
  const cur = c.combatant;
  return `  round ${c.round}, turn ${c.turn}, started ${c.started} — current: ${cur?.name ?? "none"}`;
}

function errorLines() {
  if (!errors.length) return "  none recorded since this client loaded";
  return errors.map(e => `  [${e.at}] (${e.kind}) ${e.text.replace(/\n/g, "\n      ")}`).join("\n");
}

/**
 * The whole report as plain text. Deliberately long and deliberately technical — it is never shown
 * as UI, only pasted into a message. Nothing here should need a lookup on the reader's side.
 */
export function buildDevReport(note = "") {
  const L = [];
  L.push("=== mobile-command — message for dev ===");
  L.push(`generated   ${new Date().toISOString()} (local ${new Date().toLocaleString()})`);
  if (note.trim()) {
    L.push("");
    L.push("--- what went wrong (from the person reporting) ---");
    L.push(note.trim());
  }
  L.push("");
  L.push("--- versions ---");
  L.push(`  foundry     ${safe(() => `${game.version} (build ${game.release?.build})`)}`);
  L.push(`  system      ${safe(() => `${game.system.id} ${game.system.version}`)}`);
  L.push(`  module      ${safe(() => game.modules.get(MODULE_ID)?.version)}`);
  L.push(`  language    ${safe(() => game.i18n?.lang)}`);
  L.push(`  userAgent   ${safe(() => navigator.userAgent)}`);
  L.push(`  screen      ${safe(() => `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`)}`);
  L.push("");
  L.push("--- this client ---");
  L.push(`  user        ${safe(() => game.user?.name)} (${safe(() => game.user?.id)})`);
  L.push(`  role        ${safe(() => (game.user?.isGM ? "GM" : "player"))}`);
  L.push(`  isExecutor  ${safe(() => isExecutor())}`);
  L.push(`  canvas      ${safe(() => (canvas?.ready ? "ready" : "not ready / no-canvas mode"))}`);
  L.push(`  paused      ${safe(() => game.paused)}`);
  L.push(`  tableMode   ${safe(() => (isOnlineTable() ? "online" : "in person"))}`);
  L.push("");
  L.push("--- users ---");
  L.push(userLines());
  L.push("");
  L.push("--- active scene ---");
  L.push(sceneLine());
  L.push("");
  L.push("--- combat ---");
  L.push(combatLines());
  L.push("");
  L.push(`--- system health checks${preflightRunAt ? ` (last run ${preflightRunAt.toLocaleTimeString()})` : ""} ---`);
  L.push(preflightLines());
  L.push("");
  L.push("--- this module's settings ---");
  L.push(settingLines());
  L.push("");
  L.push("--- recent errors on this client ---");
  L.push(errorLines());
  L.push("");
  L.push("--- active modules ---");
  L.push(moduleLines());
  L.push("");
  L.push("=== end ===");
  return L.join("\n");
}
