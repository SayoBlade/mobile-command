import { api } from "./rpc.js";

// DM-assign panel (§11) — the first DM-role surface. A small docked panel on the
// DM/executor client (GM, canvas present) that wakes when the DM holds ≥1 target
// and lets them hand those targets to a player's phone via the existing
// api.assignTargets RPC, with the current combatant highlighted. The DM's own
// targets clear after the handoff (no lingering reticle). The phone consumes the
// assignment in its target picker — that half is the next increment.

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
  document.body.appendChild(panelEl);
  return panelEl;
}

function render() {
  const el = ensureEl();
  const targets = Array.from(game.user.targets ?? []);
  if (!targets.length) { el.classList.remove("mc-show"); return; } // sleeps when no targets held

  const chips = targets.map(t =>
    `<span class="mc-dmp-chip">${foundry.utils.escapeHTML(t.document?.name ?? "?")}</span>`).join("");
  const cur = currentTurnUserId();
  const players = activePlayers();
  const buttons = players.length
    ? players.map(u => `<button class="mc-dmp-send ${u.id === cur ? "mc-current" : ""}" data-user="${u.id}">
        ${foundry.utils.escapeHTML(playerLabel(u))}${u.id === cur ? " · turn" : ""}</button>`).join("")
    : `<div class="mc-dmp-empty">No players connected</div>`;

  el.innerHTML = `
    <div class="mc-dmp-head">
      <span>Assign ${targets.length} target${targets.length === 1 ? "" : "s"}</span>
      <button class="mc-dmp-clear" data-action="clear" aria-label="Clear targets">✕</button>
    </div>
    <div class="mc-dmp-chips">${chips}</div>
    <div class="mc-dmp-players">${buttons}</div>`;
  el.classList.add("mc-show");
}

async function onClick(ev) {
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
  Hooks.on("updateCombat", () => render());
  render();
}
