import { api, listPendingCasts, placeCast, dismissCast, partyDeployPreview, scribeResultToUser, presenceState } from "./rpc.js";
import { fireAoO } from "./aoo.js";
import { MODULE_ID, DOWNTIME_LABEL } from "./preset.js";
import { runPreflight, runPreflightFix, lastResults as preflightResults, lastRunAt as preflightRunAt, preflightFailCount } from "./preflight.js";
import { runDmWizard } from "./dm-wizard.js";

// DM-role panel (§11) — a small docked panel on the DM/executor client (GM,
// canvas present). It wakes for two jobs:
//   1. DM-assign: when the DM holds ≥1 target, hand them to a player's phone via
//      api.assignTargets (current combatant highlighted; DM targets clear after).
//   2. AoE push: when a phone announces an area spell, show a "Player — Spell"
//      row with a Place button that drops the template (placeCast) on this client.

let panelEl = null;

// Right-side tab dock (DM 2026-07-03, future-proofed for more tools). Icon-only
// tabs stick out the panel's right edge; a tab opens a same-height flyout box to
// its right (X or re-click closes). First tool = Rolls.
let dockTab = null;          // null | "rolls" | "party" | "tokens"
let dockWasPacked = false;   // auto-open the party tab on pack, close on disperse
let tokensPlayer = "";       // owned-tokens: which player's tokens are shown
let dmReactions = [];        // reaction widget: live chips {id, kind:"aoo"|"window", label, weapon, activityUuid?, targetUuid?, expiresAt}
const rollTool = { type: "save", ability: "dex", selected: null, targetsOpen: false };

// Candidate roll targets: packed-group members (grouped) ∪ player-owned character
// tokens on canvas (loose). Preselect the grouped ones if any, else all.
function rollTargets() {
  const out = new Map();
  for (const g of game.actors.filter(a => a.type === "group" && a.getFlag(MODULE_ID, "packed")))
    for (const m of (g.system?.members ?? [])) if (m.actor) out.set(m.actor.id, { actor: m.actor, grouped: true });
  for (const t of canvas.tokens?.placeables ?? []) {
    const a = t.actor;
    if (a?.type === "character" && a.hasPlayerOwner && !out.has(a.id)) out.set(a.id, { actor: a, grouped: false });
  }
  const arr = [...out.values()];
  const anyGrouped = arr.some(c => c.grouped);
  for (const c of arr) c.preselect = anyGrouped ? c.grouped : true;
  return arr;
}

// The token we measure distances FROM (DM 2026-07-11): the DM's selected token, else the
// active combatant's — so during an NPC's turn the player list shows range from the attacker.
function dmAnchorToken() {
  return canvas.tokens?.controlled?.[0] ?? game.combat?.combatant?.token?.object ?? null;
}
function tokenForActor(actor) {
  return canvas.tokens?.placeables.find(t => t.actor?.id === actor?.id) ?? null;
}
function gridDist(from, to) {
  try {
    if (!from || !to || from === to) return null;
    return canvas.grid.measurePath([from.center, to.center])?.distance ?? null;
  } catch (e) { return null; }
}
// The anchor token's longest attack range — max over its equipped weapons of (melee reach,
// ranged long/normal). A simple in-range hint for the DM's attack targeting (no LoS/cover).
// Null = the anchor has no weapons (→ show distance only). DM 2026-07-12.
function anchorRange(anchor) {
  const actor = anchor?.actor;
  if (!actor) return null;
  let max = 0;
  for (const it of actor.items ?? []) {
    if (it.type !== "weapon" || it.system?.equipped === false) continue; // NPCs often omit `equipped`
    const r = it.system?.range ?? {};
    const melee = Number(r.reach) || 5;
    const ranged = Number(r.long) || Number(r.value) || 0;
    max = Math.max(max, melee, ranged);
  }
  return max || null;
}

function tabRailHTML() {
  const tab = (id, icon, title, show = true, badge = 0) => show ? `<button class="mc-dmp-tab ${dockTab === id ? "mc-on" : ""}" data-dock="${id}" title="${title}" aria-label="${title}"><i class="fas ${icon}"></i>${badge ? `<span class="mc-dmp-tab-badge">${badge}</span>` : ""}</button>` : "";
  // When a flyout is open the rail rides its right edge (mc-open); else the panel's.
  return `<div class="mc-dmp-tabrail ${dockTab ? "mc-open" : ""}">
    ${tab("party", "fa-border-all", "Party order", !!packedGroup())}
    ${tab("rolls", "fa-dice-d20", "Request rolls")}
    ${tab("tokens", "fa-users", "Players")}
    ${tab("downtime", "fa-hourglass-half", "Downtime", true, downtimeOpen() ? "•" : 0)}
    ${tab("preflight", "fa-clipboard-check", "Session preflight", true, preflightFailCount())}
  </div>`;
}

function downtimeState() { try { return game.settings.get(MODULE_ID, "downtime") ?? {}; } catch (e) { return {}; } }
function downtimeOpen() { return !!downtimeState().open; }

// Downtime tab (§17): the DM opens a window with a day budget; each PC allocates day-points on
// activities (+ free-text intent) and locks in. This slice shows the window controls + a
// read-only view of everyone's picks (grayed until locked). Roll-requests + the goal/Project
// engine + DM-only DC/cost suggestions come in the next slice.
function downtimeHTML() {
  const esc = foundry.utils.escapeHTML;
  const dt = downtimeState();
  if (!dt.open) {
    return `<div class="mc-dt-panel mc-dt-setup">
      <p class="mc-dt-hint">Open a downtime window. Each player spends day-points on activities you approve — you drive the rolls and rewards.</p>
      <div class="mc-dt-setuprow">
        <label class="mc-dt-daysrow">Days for the group <input type="number" class="mc-dt-days-in" min="1" max="365" value="3" data-dt-days></label>
      </div>
      <button class="mc-dmp-rt-send" data-dt-open><i class="fas fa-hourglass-start"></i> Open downtime</button>
    </div>`;
  }
  const players = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner)
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = players.map(a => {
    const pick = dt.picks?.[a.id] ?? { locked: false, items: [] };
    const items = pick.items ?? [];
    const spent = items.reduce((n, i) => n + (Number(i.days) || 0), 0);
    const itemsHTML = items.length
      ? items.map(i => `<div class="mc-dt-item">
          <span class="mc-dt-item-label">${esc(i.kind === "custom" ? (i.label || "Custom") : (DOWNTIME_LABEL[i.kind] ?? i.kind))}</span>
          <span class="mc-dt-item-days">${Number(i.days) || 0}d</span>
          ${i.intent ? `<div class="mc-dt-item-intent">“${esc(i.intent)}”</div>` : ""}
        </div>`).join("")
      : `<div class="mc-dt-empty">— no picks yet —</div>`;
    return `<div class="mc-dt-player ${pick.locked ? "mc-locked" : "mc-pending"}">
      <div class="mc-dt-player-head"><span class="mc-dt-name">${esc(a.name)}</span>
        <span class="mc-dt-spent">${spent}/${dt.days}d</span>
        ${pick.locked ? '<i class="fas fa-lock mc-dt-lock" title="Locked in"></i>' : '<span class="mc-dt-considering">considering…</span>'}</div>
      ${itemsHTML}
    </div>`;
  }).join("") || `<div class="mc-dmp-empty">No player characters.</div>`;
  return `<div class="mc-dt-panel">
    <div class="mc-dt-openhead"><span><b>Downtime</b> — ${dt.days} day${dt.days === 1 ? "" : "s"}</span>
      <button class="mc-dt-close-btn" data-dt-close title="Close the window"><i class="fas fa-hourglass-end"></i></button></div>
    <div class="mc-dt-players">${rows}</div>`;
}

// Preflight tab (§16): one row per check — status dot, label, detail, and the
// check's own one-tap fix where a safe remedy exists. Never auto-fixes.
function preflightHTML() {
  const results = preflightResults;
  if (!results) return `<div class="mc-dmp-empty">Not run yet.</div>
    <button class="mc-dmp-preflight-run" data-preflight-run><i class="fas fa-rotate"></i> Run checks</button>`;
  const esc = foundry.utils.escapeHTML;
  const icon = { ok: "fa-circle-check", warn: "fa-triangle-exclamation", fail: "fa-circle-xmark" };
  const rows = results.map(c => `<div class="mc-dmp-pf mc-dmp-pf-${c.status}">
      <i class="fas ${icon[c.status] ?? "fa-circle-question"} mc-dmp-pf-ico"></i>
      <div class="mc-dmp-pf-text"><b>${esc(c.label)}</b><span>${esc(c.detail ?? "")}</span></div>
      ${c.fix ? `<button class="mc-dmp-pf-fix" data-preflight-fix="${c.id}">${esc(c.fix.label)}</button>` : ""}
    </div>`).join("");
  const stamp = preflightRunAt ? preflightRunAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return `${rows}
    <button class="mc-dmp-preflight-run" data-preflight-run><i class="fas fa-rotate"></i> Run again${stamp ? ` <span class="mc-dmp-pf-stamp">(last ${stamp})</span>` : ""}</button>
    <button class="mc-dmp-preflight-run" data-dm-wizard><i class="fas fa-hat-wizard"></i> Setup wizard</button>`;
}

function rollsToolHTML() {
  const esc = foundry.utils.escapeHTML;
  const cands = rollTargets();
  if (rollTool.selected == null) rollTool.selected = new Set(cands.filter(c => c.preselect).map(c => c.actor.id));
  const colorFor = (a) => { const u = game.users.find(u => !u.isGM && u.character?.id === a?.id) ?? game.users.find(u => !u.isGM && a?.testUserPermission?.(u, "OWNER")); return u?.color?.css ?? "#c8a44d"; };
  const abilOpts = Object.entries(CONFIG.DND5E?.abilities ?? {}).map(([k, v]) =>
    `<option value="${k}" ${rollTool.ability === k ? "selected" : ""}>${esc((v.abbreviation ?? k).toUpperCase())}</option>`).join("");
  // Player-token button list (DM 2026-07-11): each row is a player-controlled token with a
  // user icon in the player's colour + the distance from the DM's selected/attacking token,
  // sorted closest-first. Tapping TARGETS that token on the canvas (so the DM can attack it
  // without hover+T) AND toggles it into the roll — one control for "who rolls" + targeting.
  const anchor = dmAnchorToken();
  const units = canvas.scene?.grid?.units || "ft";
  const reach = anchorRange(anchor); // the anchor's longest weapon range, for the in-range hint
  const enriched = cands.map(c => {
    const tok = tokenForActor(c.actor);
    const dist = (anchor && tok) ? gridDist(anchor, tok) : null;
    return { ...c, tok, dist };
  }).sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity) || a.actor.name.localeCompare(b.actor.name));
  const selCount = enriched.filter(c => rollTool.selected.has(c.actor.id)).length;
  const rows = enriched.map(c => {
    const on = rollTool.selected.has(c.actor.id);
    const targeted = !!c.tok?.targeted?.has?.(game.user);
    // In range = within the anchor's longest weapon range (null when unknown → neutral).
    const inRange = (c.dist != null && reach != null) ? c.dist <= reach : null;
    const distCls = inRange === true ? " mc-in" : inRange === false ? " mc-out" : "";
    const dist = c.dist == null ? "" : `<span class="mc-rt-dist${distCls}">${Math.round(c.dist)} ${esc(units)}</span>`;
    // A <button> row: colour-coded user icon, name, distance (green in range / red out), tick.
    return `<button class="mc-dmp-rt-row${on ? " mc-on" : ""}${targeted ? " mc-targeted" : ""}" data-rt-target="${c.actor.id}" title="Tap: target ${esc(c.actor.name)} + toggle for the roll${reach != null && c.dist != null ? ` (${inRange ? "in" : "out of"} range)` : ""}">
      <i class="fas fa-circle-user mc-rt-usericon" style="color:${colorFor(c.actor)}"></i>
      <span class="mc-rt-name">${esc(c.actor.name)}</span>
      ${dist}
      <i class="fas fa-crosshairs mc-rt-tick"></i>
    </button>`;
  }).join("");
  return `
    <div class="mc-dmp-rt-top">
      <select class="mc-rt-type" data-rt="type"><option value="save" ${rollTool.type === "save" ? "selected" : ""}>Save</option><option value="check" ${rollTool.type === "check" ? "selected" : ""}>Check</option></select>
      <select class="mc-rt-abil" data-rt="ability">${abilOpts}</select>
    </div>
    <div class="mc-dmp-rt-scroll">${rows || `<div class="mc-dmp-empty">No player tokens.</div>`}</div>
    <button class="mc-dmp-rt-send" data-rt-send${selCount ? "" : " disabled"}><i class="fas fa-paper-plane"></i> Request ${rollTool.type} from ${selCount}</button>`;
}

// Owned tokens (task #18): each non-GM, non-TV player's owned actors as draggable
// thumbnails. Drag → the canvas spawns a token natively (we set Actor drag data);
// double-click → open the sheet. For familiars, summons, wildshape forms, pets,
// extra PCs — quick out-of-combat placement.
// Compact for the common case (4–6 players × 1–2 tokens): pick a player from a
// dropdown, see their tokens in a 2-row grid that scrolls HORIZONTALLY, sorted
// highest-level first. No tall stacked sections; horizontal scroll handles a
// heavy player. (DM 2026-07-03.)
function tokLevel(a) { return a.system?.details?.level ?? a.system?.details?.cr ?? 0; }
function ownedTokensHTML() {
  const esc = foundry.utils.escapeHTML;
  let tvId = ""; try { tvId = game.settings.get(MODULE_ID, "displayOwnerUser") || ""; } catch (e) { /* */ }
  const players = game.users.filter(u => !u.isGM && u.id !== tvId);
  if (!players.length) return `<div class="mc-dmp-empty">No players.</div>`;
  if (!tokensPlayer || !players.some(u => u.id === tokensPlayer)) tokensPlayer = players[0].id;
  const u = game.users.get(tokensPlayer);
  const opts = players.map(p => `<option value="${p.id}" ${p.id === tokensPlayer ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  const owned = game.actors.filter(a => a.type !== "group" && a.testUserPermission(u, "OWNER"))
    .sort((a, b) => tokLevel(b) - tokLevel(a) || a.name.localeCompare(b.name)); // highest level first
  const items = owned.map(a => `<div class="mc-dmp-tok" draggable="true" data-drag-actor="${a.uuid}" data-sheet-actor="${a.id}" title="${esc(a.name)}${tokLevel(a) ? ` · lvl ${tokLevel(a)}` : ""} — drag to the map · double-click for sheet">
    <img src="${esc(a.prototypeToken?.texture?.src || a.img || "icons/svg/mystery-man.svg")}" alt="">
    <span>${esc(a.name)}</span>
  </div>`).join("");
  return `
    <div class="mc-dmp-tok-top">
      <select class="mc-dmp-tok-player" data-tok-player style="border-color:${u.color?.css ?? "#4a4334"}">${opts}</select>
      <button class="mc-dmp-tok-palette" data-color-pick="${u.id}" title="Let ${esc(u.name)} pick their colour on their phone"><i class="fas fa-palette" style="color:${u.color?.css ?? "#c8a44d"}"></i></button>
    </div>
    <div class="mc-dmp-tok-grid">${items || `<div class="mc-dmp-empty">No tokens for this player.</div>`}</div>`;
}

function flyoutHTML() {
  let title = "", body = "";
  if (dockTab === "rolls") { title = "Request rolls"; body = rollsToolHTML(); }
  else if (dockTab === "tokens") { title = "Players"; body = ownedTokensHTML(); }
  else if (dockTab === "downtime") { title = "Downtime"; body = downtimeHTML(); }
  else if (dockTab === "preflight") { title = "Session preflight"; body = preflightHTML(); }
  else if (dockTab === "party") {
    const g = packedGroup();
    const f = g?.getFlag(MODULE_ID, "formation") ?? {};
    const arr = ["↑", "→", "↓", "←", "↖", "↗", "↘", "↙"]; // display only
    title = `${(f.stage ?? "arrange") === "arrange" ? "Marching order" : "Traveling"} <i class="fas fa-arrow-up" style="display:inline-block;transform:rotate(${(f.forward ?? 0) * 45}deg)"></i>`;
    body = partyTabHTML();
  }
  return `<div class="mc-dmp-flyout mc-fly-${dockTab}">
    <div class="mc-dmp-fly-head" title="Drag to move"><span>${title}</span><button class="mc-dmp-fly-x" data-dock-close aria-label="Close">✕</button></div>
    <div class="mc-dmp-fly-body">${body}</div>
  </div>`;
}

async function sendRolls() {
  const ids = [...(rollTool.selected ?? [])];
  if (!ids.length) { ui.notifications.warn("Pick at least one target."); return; }
  const res = await api.requestRolls({ rollType: rollTool.type, ability: rollTool.ability, actorIds: ids });
  if (res?.ok === false) { ui.notifications.warn(res.reason ?? "Couldn't request rolls."); return; }
  const ab = CONFIG.DND5E?.abilities?.[rollTool.ability]?.label ?? rollTool.ability;
  ui.notifications.info(`Requested ${ab} ${rollTool.type} from ${res.sent} player${res.sent === 1 ? "" : "s"}${res.auto ? ` (auto-rolled ${res.auto})` : ""}.`);
}

/** Active player users (non-GM). Don't require a formally assigned character —
 * the phone resolves an owned character if none is assigned, and requiring it
 * made the panel show "no players" for unassigned (but connected) users. */
function activePlayers() {
  return game.users.filter(u => u.active && !u.isGM);
}

/** Best label for a player: their assigned character, else their SOLE owned
 *  character, else the user's name. The old "first owned" fallback picked an
 *  ARBITRARY character for a user who owns several (a test/DM account owning the whole
 *  party), so the presence row showed a character that isn't even in the scene —
 *  "Aslan"/"Multi" for users Player 1/Player 2 (DM 2026-06-22). Only collapse to a
 *  character name when it's unambiguous (exactly one owned). */
function playerLabel(u) {
  // Name the CHARACTER this user is playing, not the user: the active combatant if it's
  // their turn (so the target-assign list names the PC that will actually act), then their
  // assigned character, then their single owned PC, else the user name as a last resort.
  const cbActor = game.combat?.combatant?.actor;
  if (cbActor && currentTurnUserId() === u.id) return cbActor.name;
  if (u.character) return u.character.name;
  const owned = game.actors.filter(a => a.type === "character" && a.testUserPermission(u, "OWNER"));
  return owned.length === 1 ? owned[0].name : u.name;
}

/** The user tied to the current combatant — assigned character, else an owner. */
function currentTurnUserId() {
  const actor = game.combat?.combatant?.actor;
  if (!actor) return null;
  return game.users.find(u => !u.isGM && u.character?.id === actor.id)?.id
    ?? game.users.find(u => !u.isGM && actor.testUserPermission(u, "OWNER"))?.id
    ?? null;
}

function ensureEl() {
  if (panelEl) return panelEl;
  panelEl = document.createElement("div");
  panelEl.id = "mc-dm-panel";
  panelEl.addEventListener("click", onClick);
  panelEl.addEventListener("change", onChange); // Rolls-tool dropdowns + token player
  panelEl.addEventListener("dragstart", onTokenDragStart); // Owned-tokens → canvas
  panelEl.addEventListener("dblclick", onTokenDblClick);   // Owned-tokens → sheet
  panelEl.addEventListener("pointerdown", onPointerDown); // drag from the grip handle
  // Outside-click closes any open transient dropdown (DM 2026-07-09: "clicking
  // outside the dropdown should close it"). The selection is already live in
  // rollTool.selected as each row is tapped, so closing just tidies the overlay
  // — nothing to save on the way out. Capture phase + a "is it inside the
  // dropdown?" guard so a click ON the toggle/rows still works normally.
  document.addEventListener("pointerdown", onOutsidePointerDown, true);
  document.body.appendChild(panelEl);
  applySavedPos(panelEl);
  return panelEl;
}

// Draggable so it doesn't cover other widgets (DM 2026-06-19). Position is saved
// per-browser in localStorage and re-applied on load.
const POS_KEY = "mc-dm-panel-pos";
function applySavedPos(el) {
  try {
    const pos = JSON.parse(window.localStorage.getItem(POS_KEY) || "null");
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
      el.style.bottom = "auto";
    }
  } catch (e) { /* ignore bad stored value */ }
}
// Keep the whole panel on-screen. Sections come and go (party grid, casts,
// targets), so a position saved when the panel was short can push the tail —
// and its buttons — below the viewport (DM 2026-07-02: "Form up" at y=1214 on a
// smaller screen). Clamp after every render and on window resize.
function clampPos(el) {
  // Clamp the COMBINED box — the tab rail and flyout are absolutely-positioned
  // children that stick out to the right/below and don't count in the panel's own
  // rect, so an open flyout could run off-screen unreachably. Measure all three and
  // shift the panel so the whole thing stays on screen (DM 2026-07-03).
  const elR = el.getBoundingClientRect();
  if (!elR.height) return; // hidden
  const rects = [elR, el.querySelector(".mc-dmp-tabrail"), el.querySelector(".mc-dmp-flyout")]
    .filter(Boolean).map(p => p.getBoundingClientRect ? p.getBoundingClientRect() : p).filter(r => r.height);
  const bottom = Math.max(...rects.map(r => r.bottom));
  const right = Math.max(...rects.map(r => r.right));
  const overBottom = bottom - (window.innerHeight - 8);
  if (overBottom > 0) { el.style.top = `${Math.max(8, elR.top - overBottom)}px`; el.style.bottom = "auto"; }
  const overRight = right - (window.innerWidth - 8);
  if (overRight > 0) el.style.left = `${Math.max(8, elR.left - overRight)}px`;
}

// Outside-click closes open transient dropdowns. Each entry: the state flag that
// makes a dropdown visible + the selector for the region a click may land in
// without closing it (the toggle button and the list itself). Extend as more
// dropdowns appear ("and all others" — DM 2026-07-09).
const OUTSIDE_DISMISS = [
  { open: () => rollTool.targetsOpen, within: ".mc-rt-multi", close: () => { rollTool.targetsOpen = false; } }
];
function onOutsidePointerDown(ev) {
  let changed = false;
  for (const d of OUTSIDE_DISMISS) {
    if (d.open() && !ev.target.closest(d.within)) { d.close(); changed = true; }
  }
  if (changed) render();
}

function onPointerDown(ev) {
  if (ev.target.closest("button, select, input")) return; // controls act, don't drag
  if (!ev.target.closest(".mc-dmp-drag, .mc-dmp-fly-head, .mc-dmp-head")) return; // grip or any header
  ev.preventDefault();
  const rect = panelEl.getBoundingClientRect();
  const offX = ev.clientX - rect.left, offY = ev.clientY - rect.top;
  const move = (e) => {
    const left = Math.max(0, Math.min(window.innerWidth - 44, e.clientX - offX));
    const top = Math.max(0, Math.min(window.innerHeight - 24, e.clientY - offY));
    panelEl.style.left = `${left}px`;
    panelEl.style.top = `${top}px`;
    panelEl.style.bottom = "auto";
  };
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    try { window.localStorage.setItem(POS_KEY, JSON.stringify({ left: parseInt(panelEl.style.left, 10), top: parseInt(panelEl.style.top, 10) })); } catch (e) {}
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

/** Always-on camera bar: focus the table display on the party + a manual-drive
 * toggle (the DM's pan/zoom mirrors to the display). Both also have keybindings
 * (P / M) for a Stream Deck. The manual button lights up while active. */
function cameraBarHTML() {
  const manualOn = globalThis.MobileCommand?.tvManualActive?.() ? "mc-active" : "";
  return `<div class="mc-dmp-cam">
    <button class="mc-dmp-cam-btn" data-cam="focus" title="Focus the display on the party (P)" aria-label="Focus on party"><i class="fas fa-bullseye"></i></button>
    <button class="mc-dmp-cam-btn ${manualOn}" data-cam="manual" title="Manual TV control: your pan/zoom drives the display (M)" aria-label="Manual TV control"><i class="fas fa-arrows-up-down-left-right"></i></button>
    <button class="mc-dmp-cam-btn" data-cam="zoom-out" title="Zoom the display out" aria-label="Zoom display out"><i class="fas fa-magnifying-glass-minus"></i></button>
    <button class="mc-dmp-cam-btn" data-cam="zoom-in" title="Zoom the display in" aria-label="Zoom display in"><i class="fas fa-magnifying-glass-plus"></i></button>
  </div>`;
}

/** Top status row: a pause toggle (the pause-guard freezes player actions) + a
 *  per-player presence light — green = present (on the active scene OR a canvasless
 *  phone), amber = a desktop client viewing a DIFFERENT scene, gray = offline. */
// Compact "away for" readout: 45s, 2m, 1h12m.
function fmtAway(secs) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

function statusHTML() {
  const esc = foundry.utils.escapeHTML;
  const paused = game.paused;
  const pauseBtn = `<button class="mc-dmp-pause ${paused ? "mc-active" : ""}" data-action="pause" title="${paused ? "Resume — players' actions allowed" : "Pause — freeze players' actions"}"><i class="fas fa-${paused ? "play" : "pause"}"></i></button>`;
  const showBtn = `<button class="mc-dmp-pause" data-action="show-players" title="Show the selected token's image on players' phones"><i class="fas fa-image"></i></button>`;
  const activeScene = game.scenes?.active?.id;
  const players = game.users.filter(u => !u.isGM);
  // Away-timer threshold (§7.8): seconds a phone may stay backgrounded before its dot goes red.
  let awayThreshold = 90;
  try { awayThreshold = Number(game.settings.get(MODULE_ID, "awayThresholdSeconds")); } catch (e) { /* default */ }
  if (!Number.isFinite(awayThreshold) || awayThreshold < 0) awayThreshold = 90;
  const chips = players.map(u => {
    // A phone client is canvasless (D2) so its viewedScene is null — that's "present
    // at the table via the shell", NOT "off on another scene". Only an active client
    // viewing a *real, different* scene is amber. Without this, every phone player
    // (the module's whole point) showed amber/"not in the scene" (DM 2026-06-22).
    let cls, state;
    if (!u.active) { cls = "mc-off"; state = "Offline"; }
    else if (u.viewedScene === activeScene) { cls = "mc-on"; state = "on the active scene"; }
    else if (u.viewedScene == null) { cls = "mc-on"; state = "connected (phone)"; }
    else { cls = "mc-amber"; state = "connected — on a different scene"; }
    // Red escalation: a CONNECTED player whose app has been backgrounded ≥ the threshold.
    const pres = presenceState.get(u.id);
    if (u.active && pres?.hidden) {
      const secs = Math.max(0, Math.floor((Date.now() - pres.since) / 1000));
      if (secs >= awayThreshold) { cls = "mc-red"; state = `away ${fmtAway(secs)}`; }
    }
    return `<span class="mc-dmp-pres ${cls}" title="${esc(playerLabel(u))} — ${state}"><i class="fas fa-circle"></i> ${esc(playerLabel(u))}</span>`;
  }).join("") || `<span class="mc-dmp-pres mc-off">No players</span>`;
  return `<div class="mc-dmp-status">${pauseBtn}${showBtn}<div class="mc-dmp-pres-row">${chips}</div></div>`;
}

/** Combat control strip — run the encounter from the panel. Pre-start: Roll all +
 *  Start. Started: previous / roll remaining NPCs / end / next, with a round +
 *  current-turn readout. All are stable core Combat methods. */
function combatHTML() {
  const c = game.combat;
  if (!c) return "";
  const esc = foundry.utils.escapeHTML;
  let btns;
  if (!c.started) {
    btns = `<button data-combat="rollAll" title="Roll initiative for everyone"><i class="fas fa-dice-d20"></i> Roll all</button>
      <button data-combat="start" title="Begin combat"><i class="fas fa-play"></i> Start</button>`;
  } else {
    btns = `<button data-combat="prev" title="Previous turn"><i class="fas fa-backward-step"></i></button>
      <button data-combat="rollNPC" title="Roll remaining NPC initiative"><i class="fas fa-dice-d20"></i></button>
      <button data-combat="end" title="End combat"><i class="fas fa-flag-checkered"></i></button>
      <button data-combat="next" title="Next turn"><i class="fas fa-forward-step"></i></button>`;
  }
  const label = c.started ? `R${c.round} · ${esc(c.combatant?.name ?? "—")}` : "Not started";
  return `<div class="mc-dmp-combat">
      <div class="mc-dmp-turn"><i class="fas fa-khanda"></i> ${label}</div>
      <div class="mc-dmp-combatbtns">${btns}</div>
    </div>`;
}

/** Controlled (selected) tokens that have an actor — the quick-HP targets. */
function controlledWithActors() {
  // Group actors have no meaningful HP — selecting the party token must not
  // offer Damage/Heal (DM 2026-07-03: "group damage/heal doesn't make sense").
  return (canvas.tokens?.controlled ?? []).filter((t) => t.actor && t.actor.type !== "group");
}

/** Apply an HP delta to an actor (negative = damage, positive = heal). Damage eats
 *  temp HP first; both clamp to [0, max]. Direct update — robust across dnd5e versions. */
async function applyHpDelta(actor, delta) {
  const hp = actor.system?.attributes?.hp;
  if (!hp) return;
  if (delta < 0) {
    let dmg = -delta;
    const temp = hp.temp || 0;
    const fromTemp = Math.min(temp, dmg);
    dmg -= fromTemp;
    await actor.update({ "system.attributes.hp.temp": temp - fromTemp, "system.attributes.hp.value": Math.max(0, (hp.value ?? 0) - dmg) });
  } else {
    await actor.update({ "system.attributes.hp.value": Math.min(hp.max ?? 0, (hp.value ?? 0) + delta) });
  }
}

/** Quick HP: Damage / Heal the selected token(s) without opening a sheet. */
function quickHpHTML() {
  const toks = controlledWithActors();
  if (!toks.length) return "";
  const esc = foundry.utils.escapeHTML;
  const label = toks.length === 1 ? esc(toks[0].name) : `${toks.length} tokens`;
  return `<div class="mc-dmp-hp">
      <div class="mc-dmp-hp-head"><i class="fas fa-heart-pulse"></i> ${label}</div>
      <div class="mc-dmp-hp-row">
        <button class="mc-dmp-hp-btn mc-dmp-dmg" data-hp="damage" title="Damage the selected token(s)">− Damage</button>
        <input class="mc-dmp-hp-input" type="number" min="0" step="1" inputmode="numeric" aria-label="HP amount">
        <button class="mc-dmp-hp-btn mc-dmp-heal" data-hp="heal" title="Heal the selected token(s)">Heal +</button>
      </div>
    </div>`;
}

/** AoE-push / summon section: a Place (or Summon) button per pending cast. */
function pendingHTML(pending) {
  const esc = foundry.utils.escapeHTML;
  const rows = pending.map(pc => `
    <div class="mc-dmp-cast" data-cast="${pc.id}">
      <span class="mc-dmp-cast-info"><b>${esc(pc.casterName)}</b> — ${esc(pc.spellName)}</span>
      <button class="mc-dmp-place" data-place="${pc.id}">${pc.kind === "summon" ? "Summon" : "Place"}</button>
      <button class="mc-dmp-cast-x" data-dismiss="${pc.id}" aria-label="Dismiss">✕</button>
    </div>`).join("");
  const head = pending.every(p => p.kind === "summon") ? "Place summon" : "Place spell";
  return `
    <div class="mc-dmp-head"><span>${head}${pending.length === 1 ? "" : "s"}</span></div>
    <div class="mc-dmp-casts">${rows}</div>`;
}

// --- Party Mode (DESIGN §15): the DM's live view of the marching-order grid ----
// Mirrors the phones' 3×3 while a group is packed. Red cell = that spot is
// problematic at the CURRENT group-token position + facing (wall/occupied/stacked,
// computed locally — this client has the canvas). The DM can move anyone:
// click a member to pick them up, click a cell to set them down. Disperse warns
// on problems and arms into "Disperse anyway" (warnings-not-walls, §11).
let partySel = null;    // actorId the DM picked up
let partyForce = false; // "Disperse anyway" armed after a nofit

function packedGroup() {
  return game.actors.find(a => a.type === "group" && a.getFlag(MODULE_ID, "packed")) ?? null;
}

/** An unpacked group with members — the "Form up" candidate. Clustering isn't
 *  pre-checked here; partyPack validates and returns a clear reason on click. */
function candidateGroup() {
  return game.actors.find(a => a.type === "group" && !a.getFlag(MODULE_ID, "packed")
    && (a.system?.members ?? []).some(m => m.actor)) ?? null;
}

/** Unique player-owned actors with a friendly token on the active scene — the
 *  natural party members for the one-tap populate/rebuild. Includes summons and
 *  pets (any player-owned FRIENDLY token, not just type "character") so a druid's
 *  24-hour beast can travel with the pack (DM 2026-07-07); Item Piles stores and
 *  group actors are excluded. */
function scenePartyActors() {
  const seen = new Set(), out = [];
  for (const t of game.scenes?.active?.tokens ?? []) {
    const a = t.actor;
    if (!a || a.type === "group" || seen.has(a.id)) continue;
    if (!a.hasPlayerOwner) continue;
    if (t.disposition !== CONST.TOKEN_DISPOSITIONS.FRIENDLY) continue;
    if (a.flags?.["item-piles"]) continue;
    seen.add(a.id); out.push(a);
  }
  return out;
}

// MAIN area (DM 2026-07-03): only Form up / Disperse live here — stable width.
// The marching-order grid + rotate + lock-in + release/combine moved to the
// "Party order" dock tab (auto-opens on pack, closes on disperse).
// Reaction widget (DM 2026-07-07): non-modal chips instead of dialogs/toasts.
// "aoo" chips are ACTIONABLE (an NPC could take an opportunity attack — ⚔ fires
// it, ✕ declines); "window" chips are passive awareness that a PLAYER is deciding
// a reaction on their phone. Every chip expires with its reaction window.
function reactionsHTML() {
  const now = Date.now();
  dmReactions = dmReactions.filter(r => r.expiresAt > now);
  if (!dmReactions.length) return "";
  const chips = dmReactions.map(r => r.kind === "aoo"
    ? `<div class="mc-dmp-react mc-dmp-react-aoo">
        <span class="mc-dmp-react-txt"><i class="fas fa-bolt"></i> ${foundry.utils.escapeHTML(r.label)}</span>
        <button data-dmreact-fire="${r.id}" title="Take the opportunity attack (${foundry.utils.escapeHTML(r.weapon)})"><i class="fas fa-hand-fist"></i></button>
        <button data-dmreact-x="${r.id}" title="Let them go"><i class="fas fa-xmark"></i></button>
      </div>`
    : r.kind === "scribe"
    ? `<div class="mc-dmp-react mc-dmp-react-scribe">
        <span class="mc-dmp-react-txt"><i class="fas fa-feather-pointed"></i> ${foundry.utils.escapeHTML(r.label)}<br><em>suggested: ${foundry.utils.escapeHTML(r.cost)}</em></span>
        <button data-dmscribe-ok="${r.id}" title="Approve — the spell lands unprepared, the scroll is spent (cost is yours to collect)"><i class="fas fa-check"></i></button>
        <button data-dmscribe-x="${r.id}" title="Decline — nothing changes"><i class="fas fa-xmark"></i></button>
      </div>`
    : r.kind === "summon"
    ? `<div class="mc-dmp-react mc-dmp-react-summon">
        <span class="mc-dmp-react-txt"><i class="fas fa-ghost"></i> ${foundry.utils.escapeHTML(r.label)}</span>
        <button data-dmsummon-ok="${r.id}" title="Grant control — the summon appears in their phone's token switcher"><i class="fas fa-check"></i></button>
        <button data-dmsummon-x="${r.id}" title="Keep it DM-driven"><i class="fas fa-xmark"></i></button>
      </div>`
    : `<div class="mc-dmp-react mc-dmp-react-win">
        <span class="mc-dmp-react-txt"><i class="fas fa-hourglass-half"></i> ${foundry.utils.escapeHTML(r.label)}${r.weapon ? ` — ${foundry.utils.escapeHTML(r.weapon)}` : ""}</span>
      </div>`);
  return `<div class="mc-dmp-reactions">${chips.join("")}</div>`;
}

// §17.3 split-party awareness: PCs whose only token sits on a NON-active scene
// (ran ahead through a teleporter / left behind). Their phones show the paused
// overlay; the DM gets one chip per scene with a one-tap Activate — the ONLY
// automatic thing here is the awareness (DM 2026-07-08: the DM alone moves the
// active scene).
function splitPartyHTML() {
  const active = game.scenes.active;
  if (!active) return "";
  // Scope to the CURRENT party — group members + users' assigned characters —
  // not every player-owned PC in the world (first live run surfaced years of
  // demo PCs stranded on retired scenes as permanent chips).
  const party = new Set();
  for (const g of game.actors.filter(a => a.type === "group"))
    for (const m of (g.system?.members ?? [])) if (m.actor) party.add(m.actor.id);
  for (const u of game.users) if (!u.isGM && u.character) party.add(u.character.id);
  const onActive = new Set([...active.tokens].map(t => t.actorId).filter(Boolean));
  const byScene = new Map();
  for (const scene of game.scenes) {
    if (scene === active) continue;
    for (const t of scene.tokens) {
      const a = t.actor;
      if (!a || a.type !== "character" || !party.has(a.id) || onActive.has(a.id)) continue;
      if (!byScene.has(scene.id)) byScene.set(scene.id, { scene, names: new Set() });
      byScene.get(scene.id).names.add(a.name);
    }
  }
  if (!byScene.size) return "";
  const esc = foundry.utils.escapeHTML;
  const chips = [...byScene.values()].map(({ scene, names }) => `<div class="mc-dmp-react mc-dmp-split">
      <span class="mc-dmp-react-txt"><i class="fas fa-person-hiking"></i> ${names.size} PC${names.size > 1 ? "s" : ""} on ${esc(scene.name)} (${esc([...names].map(n => n.split(" ")[0]).join(", "))})</span>
      <button data-activate-scene="${scene.id}" title="Activate ${esc(scene.name)} — the split PCs play, everyone else's phone pauses"><i class="fas fa-tv"></i></button>
    </div>`);
  return `<div class="mc-dmp-reactions">${chips.join("")}</div>`;
}

function partyMainHTML() {
  const group = packedGroup();
  if (!group) {
    partySel = null; partyForce = false;
    const cand = candidateGroup();
    if (cand) {
      // Stale-membership guard (playtest 2026-07-05: the group still held the OLD
      // test party — "איפה הגרוק שלי"): if the scene's PCs aren't all members,
      // offer a rebuild next to Form up instead of letting pack fail cryptically.
      const scenePCs = scenePartyActors();
      const memberIds = new Set((cand.system?.members ?? []).map(m => m.actor?.id).filter(Boolean));
      // Stale in EITHER direction: a party-worthy token isn't a member (new PC,
      // fresh summon), or a member has no token here (unsummoned beast, old party).
      const sceneActorIds = new Set((game.scenes.active?.tokens ?? []).map(t => t.actor?.id).filter(Boolean));
      const memberGone = (cand.system?.members ?? []).some(m => m.actor && !sceneActorIds.has(m.actor.id));
      const stale = (scenePCs.length > 0 && scenePCs.some(a => !memberIds.has(a.id))) || memberGone;
      const rebuild = stale ? `<button class="mc-dmp-party-rebuild" data-party="rebuild" data-group="${cand.id}"
        title="${foundry.utils.escapeHTML(cand.name)}'s members don't match this scene — rebuild from the ${scenePCs.length} party tokens here">
        <i class="fas fa-arrows-rotate"></i></button>` : "";
      const roster = `<button class="mc-dmp-party-rebuild" data-party="roster" data-group="${cand.id}"
        title="Choose who's in ${foundry.utils.escapeHTML(cand.name)} — pick members from a checklist">
        <i class="fas fa-list-check"></i></button>`;
      return `<div class="mc-dmp-party-btns">
      <button class="mc-dmp-party-deploy" data-party="pack" data-group="${cand.id}" title="Collapse the clustered party into the ${foundry.utils.escapeHTML(cand.name)} token">
        <i class="fas fa-people-group"></i> Form up</button>${rebuild}${roster}</div>`;
    }
    // No usable group → say WHY instead of rendering nothing (playtest 2026-07-05:
    // an empty group meant no Form up, no hint, and a very confused DM). One tap
    // adds the scene's player-owned PCs as members (or creates the group first).
    const scenePCs = scenePartyActors();
    if (!scenePCs.length) return ""; // nothing sensible to offer yet
    const emptyGroup = game.actors.find(a => a.type === "group" && !(a.system?.members ?? []).some(m => m.actor));
    return `<div class="mc-dmp-party-btns">
      <button class="mc-dmp-party-deploy mc-dmp-party-setup" data-party="populate" ${emptyGroup ? `data-group="${emptyGroup.id}"` : ""}
        title="${emptyGroup ? `Add them to ${foundry.utils.escapeHTML(emptyGroup.name)} (it has no members yet)` : "Create a group actor with these PCs as members"}">
        <i class="fas fa-user-plus"></i> ${emptyGroup ? `Add ${scenePCs.length} PCs to ${foundry.utils.escapeHTML(emptyGroup.name)}` : `Create party (${scenePCs.length} PCs)`}</button>
      <button class="mc-dmp-party-rebuild" data-party="roster" ${emptyGroup ? `data-group="${emptyGroup.id}"` : ""}
        title="Choose members from a checklist instead of taking everyone">
        <i class="fas fa-list-check"></i></button></div>`;
  }
  const arranging = ((group.getFlag(MODULE_ID, "formation") ?? {}).stage ?? "arrange") === "arrange";
  if (arranging) return `<button class="mc-dmp-party-mini" data-dock="party"><i class="fas fa-border-all"></i> Arrange &amp; lock in</button>`;
  return `<div class="mc-dmp-party-btns">
    <button class="mc-dmp-party-deploy ${partyForce ? "mc-warn" : ""} ${game.combat?.combatants.some(cb => cb.actorId === group.id) ? "mc-nudge" : ""}" data-party="deploy">
      <i class="fas ${partyForce ? "fa-triangle-exclamation" : "fa-people-arrows"}"></i> ${partyForce ? "Disperse anyway" : "Disperse"}</button></div>`;
}

// §17.4 guard duty (DM-initiated, signed off 2026-07-08). Night state lives on
// the group actor's `night` flag: { stage: "assign"|"watch", watch: 1..3,
// watches: {1:[actorIds],2:[],3:[]} }. Zzz = the core "sleep" status as a pure
// visual marker (no mechanics until an encounter); conditions only on the
// encounter-start OFFER. No race logic — the DM taps individuals awake.
function nightGroup() {
  return game.actors.find(a => a.type === "group" && a.getFlag(MODULE_ID, "night"))
    ?? game.actors.find(a => a.type === "group" && (a.system?.members ?? []).some(m => m.actor));
}

function nightMembers(group) {
  return (group?.system?.members ?? []).map(m => m.actor).filter(a => a && a.type === "character");
}

function nightHTML() {
  const group = nightGroup();
  if (!group) return "";
  const esc = foundry.utils.escapeHTML;
  const night = group.getFlag(MODULE_ID, "night");
  if (!night) {
    if (!nightMembers(group).length) return "";
    return `<div class="mc-dmp-party-btns"><button class="mc-dmp-party-deploy mc-dmp-night" data-night="start" data-group="${group.id}"
      title="Make camp: send the watch board to the phones, or skip straight to the morning">
      <i class="fas fa-moon"></i> Start the night</button></div>`;
  }
  const first = id => game.actors.get(id)?.name?.split(" ")[0] ?? "?";
  // The DM can set anyone's watches (they initiate + own guard duty). A member row
  // per PC with three watch chips; tap toggles that PC on/off that watch. Works in
  // BOTH stages — during the night, editing re-applies who's asleep.
  const editor = `<div class="mc-dmp-night-edit">${nightMembers(group).map(a => {
    const chips = [1, 2, 3].map(w => `<button class="mc-dmp-nw ${(night.watches?.[w] ?? []).includes(a.id) ? "mc-on" : ""}"
        data-night="dm-toggle" data-group="${group.id}" data-actor="${a.id}" data-watch="${w}" title="${["1st", "2nd", "3rd"][w - 1]} watch">${w}</button>`).join("");
    return `<div class="mc-dmp-nw-row"><span title="${esc(a.name)}">${esc(a.name.split(" ")[0])}</span><span class="mc-dmp-nw-chips">${chips}</span></div>`;
  }).join("")}</div>`;
  if (night.stage === "assign") {
    const anyone = [1, 2, 3].some(w => (night.watches?.[w] ?? []).length);
    return `<div class="mc-dmp-night-box"><div class="mc-dmp-head"><i class="fas fa-moon"></i> Watches — players placing (you can edit)</div>
      ${editor}
      <div class="mc-dmp-party-btns">
        <button class="mc-dmp-party-deploy" data-night="lock" data-group="${group.id}" ${anyone ? "" : "disabled"}
          title="Lock the watch order — the night begins at 1st watch"><i class="fas fa-lock"></i> Lock in</button>
        <button class="mc-dmp-party-rebuild" data-night="cancel" data-group="${group.id}" title="Call off the night"><i class="fas fa-xmark"></i></button>
      </div></div>`;
  }
  // stage "watch"
  const steps = [1, 2, 3].map(w => `<button class="mc-dmp-night-step ${night.watch === w ? "mc-on" : ""}" data-night="watch" data-watch="${w}" data-group="${group.id}"
      title="${(night.watches?.[w] ?? []).map(first).join(", ") || "nobody"} on duty">${w}</button>`).join("");
  const duty = (night.watches?.[night.watch] ?? []).map(first).join(", ") || "nobody";
  return `<div class="mc-dmp-night-box"><div class="mc-dmp-head"><i class="fas fa-moon"></i> Night — watch ${night.watch} (${esc(duty)})</div>
    ${editor}
    <div class="mc-dmp-party-btns">${steps}
      <button class="mc-dmp-party-deploy" data-night="end" data-group="${group.id}" title="Morning comes — offer the long rest"><i class="fas fa-sun"></i> End night</button>
    </div></div>`;
}

// dnd5e's Sleeping condition drags Unconscious + its Incapacitated/Prone riders,
// and the night ambush adds Surprised. dnd5e SHOULD cascade-remove the riders
// when Sleeping is toggled off, but it doesn't reliably (DM 2026-07-09: "after
// the long rest the PCs are still Prone"), so waking explicitly strips the whole
// cluster.
const SLEEP_CLUSTER = ["sleeping", "unconscious", "incapacitated", "prone", "surprised"];
async function wakeActor(a) {
  for (const s of SLEEP_CLUSTER) if (a.statuses.has(s)) await a.toggleStatusEffect(s, { active: false });
}

// On-duty PCs wake, everyone else sleeps (marker only — the DM taps any chip off
// to wake someone, and non-sleeper races are exactly that manual toggle).
async function applyWatchSleep(group) {
  const night = group.getFlag(MODULE_ID, "night");
  const onDuty = new Set(night?.watches?.[night.watch] ?? []);
  for (const a of nightMembers(group)) {
    const shouldSleep = !onDuty.has(a.id);
    if (shouldSleep && !a.statuses.has("sleeping")) await a.toggleStatusEffect("sleeping", { active: true });
    else if (!shouldSleep && a.statuses.has("sleeping")) await wakeActor(a); // clear the rider cluster too
  }
}

async function clearNightSleep(group) {
  for (const a of nightMembers(group)) await wakeActor(a);
}

async function nightLongRestPrompt(group) {
  const yes = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Morning" },
    content: `<p>Night passes — grant the party a <b>long rest</b>?</p>`
  }).catch(() => false);
  if (!yes) return;
  for (const a of nightMembers(group)) {
    try { await a.longRest({ dialog: false, chat: false }); } catch (e) { console.warn(`${MODULE_ID} | rest failed for ${a.name}`, e); }
  }
  ui.notifications.info(`${group.name}: long rest granted.`);
}

async function onNightClick(ev) {
  const btn = ev.target.closest("[data-night]");
  if (!btn) return false;
  const group = game.actors.get(btn.dataset.group);
  if (!group) return true;
  const D = foundry.applications.api.DialogV2;
  try {
    switch (btn.dataset.night) {
      case "start": {
        const res = await D.wait({
          window: { title: "Start the night" },
          content: `<p>Send the <b>watch board</b> to the phones (three watches, players place themselves) — or skip guard duty and go straight to the morning?</p>`,
          buttons: [
            { action: "board", label: "Watch board", icon: "fas fa-moon", default: true },
            { action: "skip", label: "Skip guard duty", icon: "fas fa-forward" },
            { action: "cancel", label: "Cancel" }
          ]
        }).catch(() => null);
        // A fresh session id per night re-arms every phone's "browse my sheet"
        // dismissal (2026-07-09: a dismissed board stayed hidden across a restart).
        if (res === "board") await group.setFlag(MODULE_ID, "night", { id: foundry.utils.randomID(), stage: "assign", watch: 0, watches: { 1: [], 2: [], 3: [] } });
        else if (res === "skip") await nightLongRestPrompt(group);
        break;
      }
      case "dm-toggle": {
        const night = foundry.utils.deepClone(group.getFlag(MODULE_ID, "night"));
        if (!night) break;
        const w = Number(btn.dataset.watch);
        const row = new Set(night.watches?.[w] ?? []);
        if (row.has(btn.dataset.actor)) row.delete(btn.dataset.actor); else row.add(btn.dataset.actor);
        night.watches = { ...(night.watches ?? {}), [w]: [...row] };
        await group.setFlag(MODULE_ID, "night", night);
        if (night.stage === "watch") await applyWatchSleep(group); // mid-night edit → re-sleep
        break;
      }
      case "lock": {
        const night = foundry.utils.deepClone(group.getFlag(MODULE_ID, "night"));
        night.stage = "watch"; night.watch = 1;
        await group.setFlag(MODULE_ID, "night", night);
        await applyWatchSleep(group);
        break;
      }
      case "watch": {
        const night = foundry.utils.deepClone(group.getFlag(MODULE_ID, "night"));
        night.watch = Number(btn.dataset.watch);
        await group.setFlag(MODULE_ID, "night", night);
        await applyWatchSleep(group);
        break;
      }
      case "cancel":
        await group.unsetFlag(MODULE_ID, "night");
        await clearNightSleep(group);
        break;
      case "end":
        await clearNightSleep(group);
        await group.unsetFlag(MODULE_ID, "night");
        await nightLongRestPrompt(group);
        break;
    }
  } catch (e) {
    console.error(`${MODULE_ID} | night action failed`, e);
    ui.notifications.warn(`Night action failed: ${e.message}`);
  }
  render();
  return true;
}

// §17.1 the approve itself (GM client): copy the spell in unprepared, consume
// the scroll (the DM-approved game mechanic), post the suggested cost — never
// deduct (DM 2026-07-08) — and tell the player.
async function approveScribe(entry) {
  const actor = game.actors.get(entry.actorId);
  const spell = await fromUuid(entry.spellUuid);
  if (!actor || !spell) throw new Error("the actor or spell is gone");
  const scroll = actor.items.get(entry.itemId);
  const data = spell.toObject();
  foundry.utils.setProperty(data, "system.preparation.mode", "prepared");
  foundry.utils.setProperty(data, "system.preparation.prepared", false);
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  if (created?.system?.preparation?.prepared) await created.update({ "system.preparation.prepared": false });
  if (scroll) {
    const q = scroll.system?.quantity ?? 1;
    if (q > 1) await scroll.update({ "system.quantity": q - 1 });
    else await scroll.delete();
  }
  await ChatMessage.create({
    speaker: { alias: "Scribing" },
    content: `<p><b>${foundry.utils.escapeHTML(actor.name)}</b> copies <b>${foundry.utils.escapeHTML(spell.name)}</b> into their spellbook. The scroll crumbles.</p>
      <p><em>Suggested cost: ${foundry.utils.escapeHTML(entry.cost)} — DM adjudicates.</em></p>`
  });
  scribeResultToUser(entry.userId, { ok: true, spellName: spell.name });
}

// Encounter during the night: OFFER the ambush mechanics (never auto). dnd5e's
// Sleeping condition ALREADY carries the full 2024 sleep rules (unconscious +
// prone/incapacitated riders — found live 2026-07-08), so the sleepers are
// mechanically down from the moment the watch marks them; the only additive
// piece at combat start is SURPRISED = initiative at disadvantage (2024).
// Waking someone = the DM (or damage/an ally's action) removes Sleeping — the
// riders leave with it.
function registerNightEncounterOffer() {
  Hooks.on("combatStart", async () => {
    if (!game.user.isGM) return;
    const group = game.actors.find(a => a.type === "group" && a.getFlag(MODULE_ID, "night")?.stage === "watch");
    if (!group) return;
    const sleepers = nightMembers(group).filter(a => a.statuses.has("sleeping"));
    if (!sleepers.length) return;
    if (!CONFIG.statusEffects.some(s => s.id === "surprised")) return;
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Night ambush" },
      content: `<p>${sleepers.length} PC${sleepers.length > 1 ? "s are" : " is"} asleep (${foundry.utils.escapeHTML(sleepers.map(a => a.name.split(" ")[0]).join(", "))}) — already Unconscious from the Sleeping condition.</p>
        <p>Also mark them <b>Surprised</b> (initiative at disadvantage)?</p>`
    }).catch(() => false);
    if (!yes) return;
    for (const a of sleepers) {
      if (!a.statuses.has("surprised")) await a.toggleStatusEffect("surprised", { active: true });
    }
  });
}

// The "Party order" dock tab body — the grid + rotate + lock-in/rearrange +
// release/combine (no Form up / Disperse — those stay in the main area).
function partyTabHTML() {
  const group = packedGroup();
  if (!group) return `<div class="mc-dmp-empty">Party dispersed.</div>`;
  const esc = foundry.utils.escapeHTML;
  const formation = group.getFlag(MODULE_ID, "formation") ?? { cells: {}, forward: 0, locked: [] };
  const preview = partyDeployPreview(group.id) ?? [];
  const badByCell = new Map(preview.filter(p => p.why).map(p => [`${p.r},${p.c}`, p.why]));
  const members = (group.system?.members ?? []).map(m => m.actor).filter(Boolean);
  const locked = new Set(formation.locked ?? []);
  const arrows = ["↑", "→", "↓", "←"];
  const keyOf = a => { const cl = formation.cells?.[a.id]; return cl ? `${cl.r},${cl.c}` : null; };
  const released = new Set(formation.released ?? []);
  const colorFor = (a) => { const u = game.users.find(u => !u.isGM && u.character?.id === a?.id) ?? game.users.find(u => !u.isGM && a?.testUserPermission?.(u, "OWNER")); return u?.color?.css ?? null; };
  const rows = [0, 1, 2].map(r => `<div class="mc-dmp-party-row">${[0, 1, 2].map(c => {
    const occ = members.filter(a => keyOf(a) === `${r},${c}`);
    const p = occ[0];
    const bad = badByCell.get(`${r},${c}`);
    const col = p ? colorFor(p) : null; // outline the token in its player's color
    const img = p ? (p.prototypeToken?.texture?.src || p.img || "icons/svg/mystery-man.svg") : "";
    const cls = ["mc-dmp-party-cell", p && "mc-full", bad && "mc-bad", partySel && p?.id === partySel && "mc-sel", occ.length > 1 && "mc-stack", p && released.has(p.id) && "mc-away"].filter(Boolean).join(" ");
    // Empty squares aren't selectable — inert unless a token is picked up (then a drop target).
    const inert = !p && !partySel;
    return `<button class="${cls}" data-party-cell="${r},${c}"${inert ? " disabled" : ""}${col ? ` style="border-color:${col}"` : ""} title="${esc(bad ? `${p?.name ?? "This spot"}: ${bad}` : (p?.name ?? ""))}">
      ${p ? `<img src="${esc(img)}" alt="">` : ""}
      ${occ.length > 1 ? `<span class="mc-dmp-party-badge">${occ.length}</span>` : p && released.has(p.id) ? `<span class="mc-dmp-party-lock"><i class="fas fa-binoculars"></i></span>` : p && locked.has(p.id) ? `<span class="mc-dmp-party-lock"><i class="fas fa-lock"></i></span>` : ""}
    </button>`;
  }).join("")}</div>`).join("");
  const arranging = (formation.stage ?? "arrange") === "arrange";
  return `
    <div class="mc-dmp-party">${rows}</div>
    <div class="mc-dmp-party-hint">${partySel ? `Moving ${esc(members.find(a => a.id === partySel)?.name ?? "…")} — tap a square` : "&nbsp;"}</div>
    ${partySel && !arranging ? `<div class="mc-dmp-party-btns">
      ${released.has(partySel)
        ? `<button data-party="combine" title="Reabsorb the scout (must be within 1 square of the party)"><i class="fas fa-people-arrows"></i> Combine ${esc(members.find(a => a.id === partySel)?.name?.split(" ")[0] ?? "")}</button>`
        : `<button data-party="release" title="Send them scouting — their token appears next to the party"><i class="fas fa-binoculars"></i> Release ${esc(members.find(a => a.id === partySel)?.name?.split(" ")[0] ?? "")}</button>`}
    </div>` : ""}
    <div class="mc-dmp-party-btns">
      <button data-party="rotl" title="Rotate facing left"><i class="fas fa-rotate-left"></i></button>
      <button class="${arranging ? "mc-dmp-party-deploy" : ""}" data-party="stage" data-stage="${arranging ? "travel" : "arrange"}" title="${arranging ? "Lock the order — players get the travel pad" : "Reopen the grid for arranging"}">
        <i class="fas ${arranging ? "fa-lock" : "fa-pen-to-square"}"></i> ${arranging ? "Lock in" : "Rearrange"}</button>
      <button data-party="rotr" title="Rotate facing right"><i class="fas fa-rotate-right"></i></button>
    </div>`;
}

async function onPartyClick(ev) {
  const actBtn = ev.target.closest("[data-party]");
  if (actBtn?.dataset.party === "pack") {
    const res = await api.partyPack({ groupId: actBtn.dataset.group });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? "Couldn't form up.");
    return true; // pack's token churn re-renders the panel
  }
  // Rebuild a STALE group's membership from the scene's PCs (confirm-gated — it
  // replaces the member list, e.g. the old test party the DM forgot about).
  if (actBtn?.dataset.party === "rebuild") {
    try {
      const g = game.actors.get(actBtn.dataset.group);
      const pcs = scenePartyActors();
      if (!g || !pcs.length) return true;
      const yes = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Rebuild party" },
        content: `<p>Replace <b>${foundry.utils.escapeHTML(g.name)}</b>'s members with this scene's ${pcs.length} player characters?<br><em>${pcs.map(a => foundry.utils.escapeHTML(a.name.split(" ")[0])).join(", ")}</em></p>`
      }).catch(() => false);
      if (!yes) return true;
      await g.update({ "system.members": pcs.map(a => ({ actor: a.id })) });
      ui.notifications.info(`${g.name}: members rebuilt — Form up is ready.`);
    } catch (e) {
      console.error(`${MODULE_ID} | party rebuild failed`, e);
      ui.notifications.warn(`Couldn't rebuild the party: ${e.message}`);
    }
    render();
    return true;
  }
  // Checklist party setup (DM 2026-07-08: "a quick flow and a slow one with a
  // checklist of who to add") — same writes as populate/rebuild, but the DM picks
  // members one by one. Scene PCs come pre-checked; existing members with no token
  // on this scene are listed UNchecked, so dropping them is a visible choice
  // (the quick rebuild would drop them silently).
  if (actBtn?.dataset.party === "roster") {
    try {
      const g = actBtn.dataset.group ? game.actors.get(actBtn.dataset.group) : null;
      const pcs = scenePartyActors();
      const memberIds = new Set((g?.system?.members ?? []).map(m => m.actor?.id).filter(Boolean));
      const offScene = (g?.system?.members ?? []).map(m => m.actor)
        .filter(a => a && !pcs.some(p => p.id === a.id));
      // Near-miss reason rows tried and DROPPED (DM 2026-07-08: "could get long in
      // scenes with many friendly NPCs") — the two rules a missing token fails are
      // documented instead: explicit player OWNER permission + token disposition
      // Friendly.
      if (!pcs.length && !offScene.length) return true;
      const esc = foundry.utils.escapeHTML;
      const row = (a, checked, note) => `<label class="mc-dmp-roster-row">
        <input type="checkbox" name="member" value="${a.id}" ${checked ? "checked" : ""}>
        <img src="${esc(a.img)}" alt=""><span>${esc(a.name)}</span>${note ? `<em>${note}</em>` : ""}</label>`;
      const picked = await foundry.applications.api.DialogV2.wait({
        window: { title: g ? `${g.name} — choose members` : "Create party — choose members" },
        content: `<div class="mc-dmp-roster">
          ${pcs.map(a => row(a, memberIds.size ? memberIds.has(a.id) : true)).join("")}
          ${offScene.map(a => row(a, false, "not on this scene")).join("")}</div>`,
        buttons: [
          { action: "ok", label: "Set members", icon: "fas fa-users", default: true,
            callback: (_ev, button) => [...button.form.querySelectorAll('input[name="member"]:checked')].map(i => i.value) },
          { action: "cancel", label: "Cancel" }
        ]
      }).catch(() => null);
      if (!Array.isArray(picked)) return true; // cancelled / closed
      let group = g;
      group ??= await Actor.implementation.create({ name: "The Party", type: "group" });
      await group.update({ "system.members": picked.map(id => ({ actor: id })) });
      const names = picked.map(id => game.actors.get(id)?.name?.split(" ")[0]).filter(Boolean);
      ui.notifications.info(`${group.name}: ${names.length ? names.join(", ") : "no members"} — ${names.length ? "Form up is ready." : "the group is empty."}`);
    } catch (e) {
      console.error(`${MODULE_ID} | party roster failed`, e);
      ui.notifications.warn(`Couldn't set the party members: ${e.message}`);
    }
    render();
    return true;
  }
  // One-tap party setup (playtest 2026-07-05): fill an empty group with the scene's
  // PCs — or create the group first. GM client → direct document writes.
  if (actBtn?.dataset.party === "populate") {
    try {
      const pcs = scenePartyActors();
      if (!pcs.length) return true;
      let g = actBtn.dataset.group ? game.actors.get(actBtn.dataset.group) : null;
      g ??= await Actor.implementation.create({ name: "The Party", type: "group" });
      for (const a of pcs) await g.system.addMember(a); // idempotent per dnd5e (skips existing)
      ui.notifications.info(`${g.name}: ${pcs.map(a => a.name.split(" ")[0]).join(", ")} added — Form up is ready.`);
    } catch (e) {
      console.error(`${MODULE_ID} | party populate failed`, e);
      ui.notifications.warn(`Couldn't set up the party: ${e.message}`);
    }
    render();
    return true;
  }
  const group = packedGroup();
  if (!group) return false;
  const cellBtn = ev.target.closest("[data-party-cell]");
  if (cellBtn) {
    const [r, c] = cellBtn.dataset.partyCell.split(",").map(Number);
    const formation = group.getFlag(MODULE_ID, "formation") ?? { cells: {} };
    const members = (group.system?.members ?? []).map(m => m.actor).filter(Boolean);
    const occ = members.find(a => { const cl = formation.cells?.[a.id]; return cl && cl.r === r && cl.c === c; });
    if (!partySel) {
      if (occ) { partySel = occ.id; render(); }
      return true;
    }
    if (occ?.id === partySel) { partySel = null; render(); return true; } // tap self = put down
    if (occ && occ.id !== partySel) {
      // Target holds another token → SWAP their cells (not stack; DM 2026-07-03).
      const selCell = formation.cells?.[partySel];
      if (selCell) await api.partySetCell({ groupId: group.id, actorId: occ.id, r: selCell.r, c: selCell.c });
    }
    const res = await api.partySetCell({ groupId: group.id, actorId: partySel, r, c });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? "Couldn't move them.");
    partySel = null; partyForce = false; // layout changed → re-judge before forcing
    return true; // updateActor re-renders
  }
  const act = ev.target.closest("[data-party]")?.dataset.party;
  if (!act) return false;
  if (act === "rotl" || act === "rotr") {
    const cur = group.getFlag(MODULE_ID, "formation")?.forward ?? 0;
    partyForce = false; // facing changed → re-judge
    await api.partySetForward({ groupId: group.id, forward: cur + (act === "rotr" ? 1 : -1) });
    return true;
  }
  if (act === "release" || act === "combine") {
    if (!partySel) return true;
    const res = act === "release"
      ? await api.partyRelease({ groupId: group.id, actorId: partySel })
      : await api.partyCombine({ groupId: group.id, actorId: partySel });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? `Couldn't ${act}.`);
    else partySel = null;
    return true; // flag change re-renders
  }
  if (act === "stage") {
    const stage = ev.target.closest("[data-party]")?.dataset.stage;
    const res = await api.partyStage({ groupId: group.id, stage });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? "Couldn't switch stage.");
    return true; // updateActor re-renders
  }
  if (act === "deploy") {
    const res = await api.partyDeploy({ groupId: group.id, force: partyForce });
    if (res?.ok === false && res.reason === "nofit") {
      partyForce = !res.blocked?.some(b => b.offMap); // arm unless it's the off-map hard stop
      ui.notifications.warn(res.detail ?? "The formation doesn't fit here.");
      render();
    } else if (res?.ok === false) {
      ui.notifications.warn(res.reason ?? "Couldn't disperse.");
    } else {
      partySel = null; partyForce = false;
      if (res?.warned?.length) ui.notifications.info(`Dispersed with warnings: ${res.warned.map(w => `${w.name} (${w.why})`).join(", ")} — nudge them as needed.`);
    }
    return true;
  }
  return false;
}

/** DM-assign section: target chips + a send button per active player. */
function assignHTML(targets) {
  const chips = targets.map(t =>
    `<span class="mc-dmp-chip">${foundry.utils.escapeHTML(t.document?.name ?? "?")}</span>`).join("");
  const cur = currentTurnUserId();
  const players = activePlayers();
  const buttons = players.length
    ? players.map(u => `<button class="mc-dmp-send ${u.id === cur ? "mc-current" : ""}" data-user="${u.id}">
        ${foundry.utils.escapeHTML(playerLabel(u))}${u.id === cur ? " · turn" : ""}</button>`).join("")
    : `<div class="mc-dmp-empty">No players connected</div>`;
  return `
    <div class="mc-dmp-head">
      <span>Assign ${targets.length} target${targets.length === 1 ? "" : "s"}</span>
      <button class="mc-dmp-clear" data-action="clear" aria-label="Clear targets">✕</button>
    </div>
    <div class="mc-dmp-chips">${chips}</div>
    <div class="mc-dmp-players">${buttons}</div>`;
}

function render() {
  const el = ensureEl();
  const targets = Array.from(game.user.targets ?? []);
  const pending = listPendingCasts();
  // The camera bar is always present (the DM needs TV control out of combat, with
  // no targets); targeting/cast sections grow the panel when relevant. A grip at the
  // top lets the DM drag the panel off other widgets.
  const grip = `<div class="mc-dmp-drag" title="Drag to move"><i class="fas fa-grip-lines"></i></div>`;
  // Party order lives in its own dock tab (auto-open on pack, close on disperse) —
  // the main area keeps only Form up / Disperse so its width never jumps.
  const packedNow = !!packedGroup();
  if (packedNow && !dockWasPacked) dockTab = "party";
  else if (!packedNow && dockWasPacked && dockTab === "party") dockTab = null;
  dockWasPacked = packedNow;
  const main = grip + statusHTML() + cameraBarHTML() + reactionsHTML() + splitPartyHTML() + combatHTML() + quickHpHTML()
    + partyMainHTML() + nightHTML()
    + (pending.length ? pendingHTML(pending) : "") + (targets.length ? assignHTML(targets) : "");
  // Main content scrolls inside; the tab rail + flyout stick out the right edge.
  el.innerHTML = `<div class="mc-dmp-scroll">${main}</div>${tabRailHTML()}${dockTab ? flyoutHTML() : ""}`;
  el.classList.add("mc-show");
  clampPos(el);
}

// Owned-tokens grid: set Foundry Actor drag data so a drop on the canvas spawns a
// token natively (no custom drop handler needed — the DM client has the canvas).
function onTokenDragStart(ev) {
  const item = ev.target.closest("[data-drag-actor]");
  if (!item) return;
  const a = fromUuidSync(item.dataset.dragActor);
  if (!a) return;
  try { ev.dataTransfer.setData("text/plain", JSON.stringify(a.toDragData())); ev.dataTransfer.effectAllowed = "copy"; } catch (e) { /* */ }
}
function onTokenDblClick(ev) {
  const item = ev.target.closest("[data-sheet-actor]");
  if (!item) return;
  game.actors.get(item.dataset.sheetActor)?.sheet?.render(true);
}

function onChange(ev) {
  const player = ev.target.closest("[data-tok-player]");
  if (player) { tokensPlayer = player.value; return render(); } // owned-tokens player switch
  const sel = ev.target.closest("[data-rt]");
  if (!sel) return;
  if (sel.dataset.rt === "type") rollTool.type = sel.value;
  else if (sel.dataset.rt === "ability") rollTool.ability = sel.value;
  // value persists in the DOM + state; no re-render (keeps the target list scroll)
}

async function onClick(ev) {
  // Reaction widget: fire the NPC opportunity attack, or let them go.
  const rFire = ev.target.closest("[data-dmreact-fire]");
  if (rFire) {
    const entry = dmReactions.find(r => r.id === rFire.dataset.dmreactFire);
    dmReactions = dmReactions.filter(r => r.id !== rFire.dataset.dmreactFire);
    render();
    if (entry) {
      try { await fireAoO(entry.activityUuid, entry.targetUuid); }
      catch (e) { console.error(`${MODULE_ID} | reaction-widget AoO failed`, e); ui.notifications.warn("Couldn't fire the opportunity attack — see console."); }
    }
    return;
  }
  const rX = ev.target.closest("[data-dmreact-x]");
  if (rX) { dmReactions = dmReactions.filter(r => r.id !== rX.dataset.dmreactX); return render(); }
  // §17.1 scribe request: ✓ = spell into the book (unprepared) + scroll consumed
  // + suggested-cost chat card; ✕ = nothing changes. Either way the player hears.
  const sOk = ev.target.closest("[data-dmscribe-ok]");
  if (sOk) {
    const entry = dmReactions.find(r => r.id === sOk.dataset.dmscribeOk);
    dmReactions = dmReactions.filter(r => r.id !== sOk.dataset.dmscribeOk);
    render();
    if (entry) {
      try { await approveScribe(entry); }
      catch (e) { console.error(`${MODULE_ID} | scribe approve failed`, e); ui.notifications.warn(`Scribe failed: ${e.message}`); }
    }
    return;
  }
  const sNo = ev.target.closest("[data-dmscribe-x]");
  if (sNo) {
    const entry = dmReactions.find(r => r.id === sNo.dataset.dmscribeX);
    dmReactions = dmReactions.filter(r => r.id !== sNo.dataset.dmscribeX);
    render();
    if (entry) scribeResultToUser(entry.userId, { ok: false, spellName: entry.label });
    return;
  }
  // Summon control (2026-07-09): ✓ grants the summoner's player OWNER on the
  // summoned world actor — their phone's switcher picks it up on the ownership
  // change; ✕ keeps the summon DM-driven.
  const smOk = ev.target.closest("[data-dmsummon-ok]");
  if (smOk) {
    const entry = dmReactions.find(r => r.id === smOk.dataset.dmsummonOk);
    dmReactions = dmReactions.filter(r => r.id !== smOk.dataset.dmsummonOk);
    render();
    if (entry) {
      try {
        await game.actors.get(entry.actorId)?.update({ [`ownership.${entry.userId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
        ui.notifications.info(`${game.users.get(entry.userId)?.name ?? "The player"} now controls ${game.actors.get(entry.actorId)?.name ?? "the summon"}.`);
      } catch (e) { console.error(`${MODULE_ID} | summon grant failed`, e); ui.notifications.warn(`Couldn't grant control: ${e.message}`); }
    }
    return;
  }
  const smNo = ev.target.closest("[data-dmsummon-x]");
  if (smNo) { dmReactions = dmReactions.filter(r => r.id !== smNo.dataset.dmsummonX); return render(); }
  // Right-side dock: tab toggle, close, target checkbox, send.
  const dockBtn = ev.target.closest("[data-dock]");
  if (dockBtn) { dockTab = dockTab === dockBtn.dataset.dock ? null : dockBtn.dataset.dock; return render(); }
  if (ev.target.closest("[data-dock-close]")) { dockTab = null; return render(); }
  if (ev.target.closest("[data-rt-forbtn]")) { rollTool.targetsOpen = !rollTool.targetsOpen; return render(); }
  const cp = ev.target.closest("[data-color-pick]");
  if (cp) { // DM initiates: push the colour picker to that player's phone
    const uid = cp.dataset.colorPick;
    const res = await api.requestColorPick({ userId: uid });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? "Couldn't reach that player.");
    else ui.notifications.info(`Asked ${game.users.get(uid)?.name ?? "the player"} to pick a colour.`);
    return;
  }
  const rtT = ev.target.closest("[data-rt-target]");
  if (rtT) {
    const id = rtT.dataset.rtTarget;
    const nowOn = !rollTool.selected?.has(id);
    if (nowOn) rollTool.selected?.add(id); else rollTool.selected?.delete(id);
    // Also target the token on the canvas — visual confirmation + the DM's attack target.
    const tok = canvas.tokens?.placeables.find(t => t.actor?.id === id);
    if (tok) tok.setTarget(nowOn, { releaseOthers: false }); // → targetToken hook re-renders the list
    else render(); // off-canvas actor (packed group member) → reflect the selection
    return;
  }
  if (ev.target.closest("[data-rt-send]")) return sendRolls();
  if (ev.target.closest("[data-dt-open]")) { // §17: open a downtime window (DM sets the group's day budget)
    const root = ev.target.closest(".mc-dt-panel");
    const days = Math.max(1, Math.min(365, parseInt(root?.querySelector("[data-dt-days]")?.value) || 3));
    await game.settings.set(MODULE_ID, "downtime", { open: true, days, windowId: foundry.utils.randomID(), picks: {} });
    return render();
  }
  if (ev.target.closest("[data-dt-close]")) {
    const dt = foundry.utils.deepClone(game.settings.get(MODULE_ID, "downtime") ?? {});
    dt.open = false;
    await game.settings.set(MODULE_ID, "downtime", dt);
    return render();
  }
  if (ev.target.closest("[data-preflight-run]")) {
    await runPreflight();
    return render();
  }
  if (ev.target.closest("[data-dm-wizard]")) {
    runDmWizard().then(() => render()).catch(e => console.error(`${MODULE_ID} | wizard failed`, e));
    return;
  }
  const actScene = ev.target.closest("[data-activate-scene]");
  if (actScene) {
    const scene = game.scenes.get(actScene.dataset.activateScene);
    if (scene) await scene.activate();
    return render();
  }
  const pfFix = ev.target.closest("[data-preflight-fix]");
  if (pfFix) {
    pfFix.disabled = true;
    try { await runPreflightFix(pfFix.dataset.preflightFix); }
    catch (e) { console.error(`${MODULE_ID} | preflight fix failed`, e); ui.notifications.warn(`Fix failed: ${e.message}`); }
    return render();
  }
  if (await onNightClick(ev)) return;
  if (await onPartyClick(ev)) return;
  const cam = ev.target.closest("[data-cam]");
  if (cam) {
    if (cam.dataset.cam === "focus") globalThis.MobileCommand?.focusParty?.();
    else if (cam.dataset.cam === "manual") globalThis.MobileCommand?.toggleTvManual?.();
    else if (cam.dataset.cam === "zoom-in") globalThis.MobileCommand?.tvZoom?.(1.25);
    else if (cam.dataset.cam === "zoom-out") globalThis.MobileCommand?.tvZoom?.(1 / 1.25);
    return render();
  }
  if (ev.target.closest('[data-action="pause"]')) {
    game.togglePause(!game.paused, { broadcast: true });
    return render();
  }
  if (ev.target.closest('[data-action="show-players"]')) {
    const tok = canvas.tokens?.controlled?.[0];
    const img = tok?.document?.texture?.src || tok?.actor?.img;
    if (!img) { ui.notifications.warn("Select a token — its image will show on players' phones."); return; }
    // The shell hides native windows, so phones pick this up via shell.js's own
    // `shareImage` socket listener (mirrors it into the full-screen overlay). No name/title:
    // a token's name can spoil what the image is (a potion labelled "Poison …"). DM 2026-06-26.
    game.socket.emit("shareImage", { image: img, title: "", showTitle: false });
    ui.notifications.info("Shown on players' phones.");
    return;
  }
  const hpBtn = ev.target.closest("[data-hp]");
  if (hpBtn) {
    const input = panelEl.querySelector(".mc-dmp-hp-input");
    const amt = Math.max(0, Math.floor(Number(input?.value) || 0));
    const toks = controlledWithActors();
    if (!amt) { ui.notifications.warn("Enter an HP amount first."); return; }
    if (!toks.length) { ui.notifications.warn("Select a token first."); return; }
    const dmg = hpBtn.dataset.hp === "damage";
    for (const t of toks) await applyHpDelta(t.actor, dmg ? -amt : amt);
    ui.notifications.info(`${dmg ? "Damaged" : "Healed"} ${amt} → ${toks.length} token${toks.length === 1 ? "" : "s"}.`);
    if (input) input.value = "";
    return render();
  }
  const combat = ev.target.closest("[data-combat]");
  if (combat) {
    const c = game.combat;
    if (c) {
      const act = combat.dataset.combat;
      try {
        if (act === "next") await c.nextTurn();
        else if (act === "prev") await c.previousTurn();
        else if (act === "rollNPC") await c.rollNPC();
        else if (act === "rollAll") await c.rollAll();
        else if (act === "start") await c.startCombat();
        else if (act === "end") await c.endCombat(); // core shows its own confirm
      } catch (e) { ui.notifications.warn(`Combat: ${e.message}`); }
    }
    return render();
  }
  const place = ev.target.closest("[data-place]");
  if (place) {
    const res = await placeCast(place.dataset.place);
    if (res && !res.ok) ui.notifications.warn(`Place: ${res.reason}`);
    return render();
  }
  if (ev.target.closest("[data-dismiss]")) {
    dismissCast(ev.target.closest("[data-dismiss]").dataset.dismiss);
    return render();
  }
  if (ev.target.closest('[data-action="clear"]')) {
    return canvas.tokens?.setTargets([], { mode: "replace" });
  }
  const btn = ev.target.closest("[data-user]");
  if (!btn) return;
  const uuids = Array.from(game.user.targets).map(t => t.document?.uuid).filter(Boolean);
  if (!uuids.length) return;
  await api.assignTargets(btn.dataset.user, uuids);
  const u = game.users.get(btn.dataset.user);
  ui.notifications.info(`Assigned ${uuids.length} target(s) to ${u ? playerLabel(u) : "player"}`);
  // Clear the DM's own targets after the handoff so the player's reticle owns the
  // table-visible confirmation (§11). v14: setTargets replaces (User#updateTokenTargets is gone).
  canvas.tokens?.setTargets([], { mode: "replace" });
}

/** DM/executor client only — the TV is player-role, phones have no canvas targets. */
export function registerDMPanel() {
  if (!game.user.isGM) return;
  // Preflight auto-run (§16): one pass shortly after the canvas settles so the
  // tab badge shows real fails without the DM opening it. Never auto-fixes.
  setTimeout(() => { runPreflight().then(() => render()).catch(e => console.warn(`${MODULE_ID} | preflight auto-run failed`, e)); }, 4000);
  registerNightEncounterOffer(); // §17.4: ambush during a watch → offer Unconscious+Surprised
  Hooks.on("targetToken", () => render());
  Hooks.on("controlToken", () => render());                        // quick-HP: selection changed
  // Keep the rolls-tab distances fresh as tokens move (only while that flyout is open).
  Hooks.on("updateToken", (_t, ch) => { if (dockTab === "rolls" && ("x" in ch || "y" in ch)) render(); });
  Hooks.on("updateCombat", () => render());
  Hooks.on("deleteCombat", () => render());                        // combat ended → drop the strip
  Hooks.on("combatStart", () => render());
  Hooks.on("pauseGame", () => render());                           // pause toggle ↔ panel button
  Hooks.on("updateScene", (_s, ch) => { if ("active" in ch) render(); }); // split-party chips follow activation
  Hooks.on("userConnected", () => render());                       // presence: connect/disconnect
  Hooks.on("updateUser", () => render());                          // presence: a player changed scene (viewedScene)
  Hooks.on("mobile-command.presence", () => render());             // away-timer: a phone reported fg/bg
  Hooks.on("updateSetting", (s) => { if (s?.key === `${MODULE_ID}.downtime`) render(); }); // §17: a player picked
  // Away-timer tick: the red escalation crosses the threshold with no event to fire it, so
  // while any player is backgrounded, re-render every 5s to update "away Ns" and flip to red.
  // Idle (nobody backgrounded) → no timer runs.
  let awayTimer = null;
  const awayTick = () => {
    const anyHidden = [...presenceState.values()].some(p => p?.hidden);
    if (anyHidden && !awayTimer) awayTimer = setInterval(() => { render(); awayTick(); }, 5000);
    else if (!anyHidden && awayTimer) { clearInterval(awayTimer); awayTimer = null; }
  };
  Hooks.on("mobile-command.presence", awayTick);
  Hooks.on("mobile-command.dmReaction", (entry) => {               // reaction widget chips (aoo.js + rpc.js)
    // A multi-token summon (pack of wolves) creates one token per creature —
    // one chip per (summoned actor, player) is enough; the grant covers them all.
    if (entry.kind === "summon" && dmReactions.some(r => r.kind === "summon" && r.actorId === entry.actorId && r.userId === entry.userId)) return;
    dmReactions.push(entry);
    render();
    setTimeout(() => { // expire with the reaction window; filter also runs at render
      dmReactions = dmReactions.filter(r => r.id !== entry.id);
      render();
    }, Math.max(1000, entry.expiresAt - Date.now()));
  });
  Hooks.on("mobile-command.pendingCast", () => render());          // a phone announced an AoE cast
  Hooks.on("mobile-command.pendingCastResolved", () => render());  // placed or dismissed
  Hooks.on("mobile-command.tvManualChanged", () => render());      // keep the manual button in sync (keybinding toggles too)
  // Party Mode: repaint when the marching order changes (group flags), on
  // pack/unpack (token churn), and when the group token itself moves (the
  // blocked-cell preview depends on its position).
  Hooks.on("updateActor", (a) => { if (a?.type === "group") render(); });
  // Player-owned tokens count too: the Create party / rebuild buttons key off the
  // scene's PC tokens, so placing or removing one must refresh the party section
  // (2026-07-08: placed two fresh PCs and the button never appeared).
  Hooks.on("createToken", (t) => { if (t?.actor?.type === "group" || t?.actor?.hasPlayerOwner || packedGroup()) render(); });
  Hooks.on("deleteToken", (t) => { if (t?.actor?.type === "group" || t?.actor?.hasPlayerOwner || packedGroup()) render(); });
  Hooks.on("updateToken", (t, ch) => { if (t?.actor?.type === "group" && ("x" in ch || "y" in ch)) render(); });
  // Combat nudge: adding/removing the packed group in the tracker toggles the
  // Disperse pulse (decision §15.2#6 — nudge, never force).
  Hooks.on("createCombatant", (cb) => { if (cb?.actor?.type === "group") render(); });
  Hooks.on("deleteCombatant", (cb) => { if (cb?.actor?.type === "group") render(); });
  window.addEventListener("resize", () => { if (panelEl) clampPos(panelEl); });
  render();
}
