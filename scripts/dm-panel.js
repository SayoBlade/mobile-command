import { api, listPendingCasts, placeCast, dismissCast, partyDeployPreview } from "./rpc.js";
import { MODULE_ID } from "./preset.js";

// DM-role panel (§11) — a small docked panel on the DM/executor client (GM,
// canvas present). It wakes for two jobs:
//   1. DM-assign: when the DM holds ≥1 target, hand them to a player's phone via
//      api.assignTargets (current combatant highlighted; DM targets clear after).
//   2. AoE push: when a phone announces an area spell, show a "Player — Spell"
//      row with a Place button that drops the template (placeCast) on this client.

let panelEl = null;

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
  panelEl.addEventListener("pointerdown", onPointerDown); // drag from the grip handle
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
  const r = el.getBoundingClientRect();
  if (!r.height) return; // hidden
  const overBottom = r.bottom - (window.innerHeight - 8);
  if (overBottom > 0) {
    el.style.top = `${Math.max(8, r.top - overBottom)}px`;
    el.style.bottom = "auto";
  }
  const overRight = r.right - (window.innerWidth - 8);
  if (overRight > 0) el.style.left = `${Math.max(8, r.left - overRight)}px`;
}

function onPointerDown(ev) {
  if (!ev.target.closest(".mc-dmp-drag")) return;
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
function statusHTML() {
  const esc = foundry.utils.escapeHTML;
  const paused = game.paused;
  const pauseBtn = `<button class="mc-dmp-pause ${paused ? "mc-active" : ""}" data-action="pause" title="${paused ? "Resume — players' actions allowed" : "Pause — freeze players' actions"}"><i class="fas fa-${paused ? "play" : "pause"}"></i></button>`;
  const showBtn = `<button class="mc-dmp-pause" data-action="show-players" title="Show the selected token's image on players' phones"><i class="fas fa-image"></i></button>`;
  const activeScene = game.scenes?.active?.id;
  const players = game.users.filter(u => !u.isGM);
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
  return (canvas.tokens?.controlled ?? []).filter((t) => t.actor);
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

function partyHTML() {
  const group = packedGroup();
  if (!group) {
    partySel = null; partyForce = false;
    const cand = candidateGroup();
    if (!cand) return "";
    return `<div class="mc-dmp-party-btns">
      <button class="mc-dmp-party-deploy" data-party="pack" data-group="${cand.id}" title="Collapse the clustered party into the ${foundry.utils.escapeHTML(cand.name)} token">
        <i class="fas fa-people-group"></i> Form up</button>
    </div>`;
  }
  const esc = foundry.utils.escapeHTML;
  const formation = group.getFlag(MODULE_ID, "formation") ?? { cells: {}, forward: 0, locked: [] };
  const preview = partyDeployPreview(group.id) ?? [];
  const badByCell = new Map(preview.filter(p => p.why).map(p => [`${p.r},${p.c}`, p.why]));
  const members = (group.system?.members ?? []).map(m => m.actor).filter(Boolean);
  const locked = new Set(formation.locked ?? []);
  const arrows = ["↑", "→", "↓", "←"];
  const keyOf = a => { const cl = formation.cells?.[a.id]; return cl ? `${cl.r},${cl.c}` : null; };
  const rows = [0, 1, 2].map(r => `<div class="mc-dmp-party-row">${[0, 1, 2].map(c => {
    const occ = members.filter(a => keyOf(a) === `${r},${c}`);
    const p = occ[0];
    const bad = badByCell.get(`${r},${c}`);
    const img = p ? (p.prototypeToken?.texture?.src || p.img || "icons/svg/mystery-man.svg") : "";
    const cls = ["mc-dmp-party-cell", p && "mc-full", bad && "mc-bad", partySel && p?.id === partySel && "mc-sel", occ.length > 1 && "mc-stack"].filter(Boolean).join(" ");
    return `<button class="${cls}" data-party-cell="${r},${c}" title="${esc(bad ? `${p?.name ?? "This spot"}: ${bad}` : (p?.name ?? ""))}">
      ${p ? `<img src="${esc(img)}" alt="">` : ""}
      ${occ.length > 1 ? `<span class="mc-dmp-party-badge">${occ.length}</span>` : p && locked.has(p.id) ? `<span class="mc-dmp-party-lock"><i class="fas fa-lock"></i></span>` : ""}
    </button>`;
  }).join("")}</div>`).join("");
  return `
    <div class="mc-dmp-head"><span><i class="fas fa-people-group"></i> Marching order · fwd ${arrows[formation.forward ?? 0]}</span></div>
    <div class="mc-dmp-party">${rows}</div>
    ${partySel ? `<div class="mc-dmp-party-hint">Moving ${esc(members.find(a => a.id === partySel)?.name ?? "…")} — tap a square</div>` : ""}
    <div class="mc-dmp-party-btns">
      <button data-party="rotl" title="Rotate facing left"><i class="fas fa-rotate-left"></i></button>
      <button data-party="rotr" title="Rotate facing right"><i class="fas fa-rotate-right"></i></button>
      <button class="mc-dmp-party-deploy ${partyForce ? "mc-warn" : ""} ${game.combat?.combatants.some(cb => cb.actorId === group.id) ? "mc-nudge" : ""}" data-party="deploy">
        <i class="fas ${partyForce ? "fa-triangle-exclamation" : "fa-people-arrows"}"></i> ${partyForce ? "Disperse anyway" : "Disperse"}</button>
    </div>`;
}

async function onPartyClick(ev) {
  const actBtn = ev.target.closest("[data-party]");
  if (actBtn?.dataset.party === "pack") {
    const res = await api.partyPack({ groupId: actBtn.dataset.group });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? "Couldn't form up.");
    return true; // pack's token churn re-renders the panel
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
  el.innerHTML = grip + statusHTML() + cameraBarHTML() + combatHTML() + quickHpHTML()
    + partyHTML()
    + (pending.length ? pendingHTML(pending) : "") + (targets.length ? assignHTML(targets) : "");
  el.classList.add("mc-show");
  clampPos(el);
}

async function onClick(ev) {
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
  Hooks.on("targetToken", () => render());
  Hooks.on("controlToken", () => render());                        // quick-HP: selection changed
  Hooks.on("updateCombat", () => render());
  Hooks.on("deleteCombat", () => render());                        // combat ended → drop the strip
  Hooks.on("combatStart", () => render());
  Hooks.on("pauseGame", () => render());                           // pause toggle ↔ panel button
  Hooks.on("userConnected", () => render());                       // presence: connect/disconnect
  Hooks.on("updateUser", () => render());                          // presence: a player changed scene (viewedScene)
  Hooks.on("mobile-command.pendingCast", () => render());          // a phone announced an AoE cast
  Hooks.on("mobile-command.pendingCastResolved", () => render());  // placed or dismissed
  Hooks.on("mobile-command.tvManualChanged", () => render());      // keep the manual button in sync (keybinding toggles too)
  // Party Mode: repaint when the marching order changes (group flags), on
  // pack/unpack (token churn), and when the group token itself moves (the
  // blocked-cell preview depends on its position).
  Hooks.on("updateActor", (a) => { if (a?.type === "group") render(); });
  Hooks.on("createToken", (t) => { if (t?.actor?.type === "group" || packedGroup()) render(); });
  Hooks.on("deleteToken", (t) => { if (t?.actor?.type === "group" || packedGroup()) render(); });
  Hooks.on("updateToken", (t, ch) => { if (t?.actor?.type === "group" && ("x" in ch || "y" in ch)) render(); });
  // Combat nudge: adding/removing the packed group in the tracker toggles the
  // Disperse pulse (decision §15.2#6 — nudge, never force).
  Hooks.on("createCombatant", (cb) => { if (cb?.actor?.type === "group") render(); });
  Hooks.on("deleteCombatant", (cb) => { if (cb?.actor?.type === "group") render(); });
  window.addEventListener("resize", () => { if (panelEl) clampPos(panelEl); });
  render();
}
