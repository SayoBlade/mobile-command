import { api, listPendingCasts, placeCast, dismissCast } from "./rpc.js";

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

/** Best label for a player: assigned character, else an owned character, else the user name. */
function playerLabel(u) {
  if (u.character) return u.character.name;
  const owned = game.actors.find(a => a.type === "character" && a.testUserPermission(u, "OWNER"));
  return owned?.name ?? u.name;
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
 *  per-player presence light — green = on the active scene, amber = connected but
 *  viewing a different scene (won't see the camera/combat), gray = offline. */
function statusHTML() {
  const esc = foundry.utils.escapeHTML;
  const paused = game.paused;
  const pauseBtn = `<button class="mc-dmp-pause ${paused ? "mc-active" : ""}" data-action="pause" title="${paused ? "Resume — players' actions allowed" : "Pause — freeze players' actions"}"><i class="fas fa-${paused ? "play" : "pause"}"></i></button>`;
  const showBtn = `<button class="mc-dmp-pause" data-action="show-players" title="Show the selected token's image on players' phones"><i class="fas fa-image"></i></button>`;
  const activeScene = game.scenes?.active?.id;
  const players = game.users.filter(u => !u.isGM);
  const chips = players.map(u => {
    const cls = !u.active ? "mc-off" : (u.viewedScene === activeScene ? "mc-on" : "mc-amber");
    const state = !u.active ? "Offline" : (u.viewedScene === activeScene ? "on the active scene" : "connected — on a different scene");
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
    + (pending.length ? pendingHTML(pending) : "") + (targets.length ? assignHTML(targets) : "");
  el.classList.add("mc-show");
}

async function onClick(ev) {
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
    // `shareImage` socket listener (mirrors it into the full-screen overlay).
    game.socket.emit("shareImage", { image: img, title: tok.document?.name || tok.actor?.name || "", showTitle: true });
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
  render();
}
