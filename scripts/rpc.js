import { MODULE_ID } from "./preset.js";
import { resolveExecutorId, isExecutor } from "./settings.js";

// §5 Service RPC contract, Phase 1 subset, running on the executor client
// (§2.1: the DM Screen GM client). All Spike 3 findings are baked in:
// - explicit targets ride in usage.midiOptions.targetUuids (2nd arg)
// - midi ignores explicit targets for area activities -> refuse them here
// - completeActivityUse resolves falsy/aborted on refusal with only a local
//   toast -> capture notifications and surface {ok:false, stage, reason}

export let socket = null;

// Phone-side state written by executor/DM pushes.
export const remoteState = {
  lastHeartbeat: null,
  assignedTargetUuids: [],
  savePrompt: null
};

// Executor-side state: area spells the phone has asked the DM to place (AoE push,
// §11). Lives only on the executor client; the DM panel renders these and the DM
// taps Place to drop the template. Keyed by a random id; cleared on place/dismiss.
const pendingCasts = new Map();
export function listPendingCasts() { return [...pendingCasts.values()]; }
export function dismissCast(id) {
  if (!pendingCasts.delete(id)) return false;
  Hooks.callAll("mobile-command.pendingCastResolved", { id });
  return true;
}

let heartbeatTimer = null;

export function initSocket() {
  if (socket) return socket; // idempotent: socketlib.ready and the ready-hook fallback both call this
  if (!globalThis.socketlib) {
    console.error(`${MODULE_ID} | socketlib global not available — is the socketlib module active? RPC disabled.`);
    return null;
  }
  const registered = socketlib.registerModule(MODULE_ID);
  if (!registered) {
    console.error(`${MODULE_ID} | socketlib.registerModule returned nothing — ensure "socket": true is in module.json and RELAUNCH THE WORLD (a browser reload is not enough). RPC disabled.`);
    return null;
  }
  socket = registered;
  socket.register("itemUse", handleItemUse);
  socket.register("itemUseStart", handleItemUseStart);
  socket.register("itemUseDamage", handleItemUseDamage);
  socket.register("itemUseCancel", handleItemUseCancel);
  socket.register("moveRequest", handleMoveRequest);
  socket.register("measure", handleMeasure);
  socket.register("targetsList", handleTargetsList);
  socket.register("previewTargets", handlePreviewTargets);
  socket.register("endTurn", handleEndTurn);
  socket.register("assignTargets", handleAssignTargets);
  socket.register("announceCast", handleAnnounceCast);
  socket.register("savePrompt", handleSavePrompt);
  socket.register("heartbeat", handleHeartbeat);
  console.log(`${MODULE_ID} | socket registered`);
  return socket;
}

export function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (!socket) {
    console.warn(`${MODULE_ID} | heartbeat not started — socket unavailable`);
    return;
  }
  const seconds = game.settings.get(MODULE_ID, "heartbeatSeconds");
  if (!seconds || seconds <= 0) return;
  heartbeatTimer = setInterval(() => {
    if (!isExecutor() || !socket) return;
    socket.executeForOthers("heartbeat", {
      ts: Date.now(),
      sceneId: game.scenes.active?.id ?? null,
      paused: game.paused
    });
  }, seconds * 1000);
}

function handleHeartbeat(data) {
  remoteState.lastHeartbeat = data;
  Hooks.callAll("mobile-command.heartbeat", data);
}

// Save/reaction prompt surface (§7.4/§7.6). midi (playerRollSaves:"chat")
// delivers a save request as a whispered chat card, which the full-screen shell
// hides — so a phone player never sees it and playerSaveTimeout silently
// auto-rolls. The executor relays the request to the target's phone (below); the
// phone stores it and shows a tappable prompt. The player still rolls the save
// normally (midi intercepts the matching roll, Spike 3) — this is only the
// visible, actionable cue.
function handleSavePrompt(payload) {
  console.debug(`${MODULE_ID} | savePrompt received`, payload);
  remoteState.savePrompt = payload ?? null;
  Hooks.callAll("mobile-command.savePrompt", payload ?? null);
  return true;
}

// Executor-side relay: midi fires preTargetSave on the workflow client (the
// executor) right before it queues each target's save. We forward a structured
// prompt to that target's active owners. Registered once on ready.
export function registerSaveRelay() {
  Hooks.on("midi-qol.preTargetSave", (target, workflow, saveDetails) => {
    try {
      if (!isExecutor() || !socket) return;
      const actor = target?.actor ?? target?.document?.actor
        ?? (saveDetails?.actorUuid ? fromUuidSync(saveDetails.actorUuid) : null);
      const abilities = saveDetails?.rollAbilities ?? [];
      const rollType = saveDetails?.rollType ?? "save";
      // Only ability saves for now; skills/tools/custom rolls aren't wired to a
      // one-tap on the phone yet (the player can still roll them manually).
      if (!actor || rollType !== "save" || !abilities.length) {
        console.debug(`${MODULE_ID} | save relay skip`, { actor: actor?.name, rollType, abilities });
        return;
      }
      // NB: an owner whose client is not `active` is excluded — midi routes that
      // target's save to the GM in the same case, so there's no phone to prompt.
      const owners = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
      console.debug(`${MODULE_ID} | save relay`, { actor: actor.name, abilities, dc: saveDetails.rollDC, owners: owners.map(u => u.name) });
      if (!owners.length) return;
      const timeout = MidiQOL?.configSettings?.().playerSaveTimeout ?? 0;
      const payload = {
        actorUuid: actor.uuid,
        abilities,
        dc: saveDetails.rollDC ?? null,
        advantage: !!saveDetails.advantage,
        disadvantage: !!saveDetails.disadvantage,
        isConcentration: !!saveDetails.isConcentrationCheck,
        spellName: workflow?.item?.name ?? "",
        ttlMs: timeout > 0 ? timeout * 1000 : null,
        ts: Date.now()
      };
      for (const u of owners) socket.executeAsUser("savePrompt", u.id, payload);
    } catch (e) {
      console.warn(`${MODULE_ID} | save relay failed`, e);
    }
  });
}

function handleAssignTargets({ tokenUuids, fromName }) {
  // Phones have no canvas, so user.updateTokenTargets is unusable here —
  // assignments live in module state until the controller UI consumes them.
  remoteState.assignedTargetUuids = tokenUuids ?? [];
  Hooks.callAll("mobile-command.assignTargets", remoteState.assignedTargetUuids, fromName);
  console.log(`mobile-command | targets assigned by ${fromName}:`, tokenUuids);
  return true;
}

// AoE push (§11): a phone can't place a template (no canvas), so an area spell
// tap records a pending cast on the executor and wakes the DM panel; the DM taps
// Place (placeCast) to drop the template. The caster's activity runs on the
// executor so the caster's slot deducts and saves fan to targets' phones.
async function handleAnnounceCast(payload) {
  if (!isExecutor()) return { ok: false, stage: "route", reason: "not the executor client" };
  const { activityUuid, casterName, spellName, casterTokenUuid, requesterId } = payload;
  const activity = await fromUuid(activityUuid);
  if (!activity) return { ok: false, stage: "resolve", reason: `activity not found: ${activityUuid}` };
  if (!requesterCanAct(requesterId, activity.item?.actor)) {
    return { ok: false, stage: "permission", reason: "requester does not own the acting actor" };
  }
  const id = foundry.utils.randomID();
  pendingCasts.set(id, {
    id, activityUuid, casterTokenUuid, requesterId, ts: Date.now(),
    casterName: casterName ?? activity.item?.actor?.name ?? "Player",
    spellName: spellName ?? activity.item?.name ?? "spell"
  });
  Hooks.callAll("mobile-command.pendingCast", pendingCasts.get(id));
  console.log(`${MODULE_ID} | pending cast from ${casterName}: ${spellName}`);
  return { ok: true, id };
}

// Executor-side: drop the template for a pending cast. Called directly by the DM
// panel (which only renders on the executor, where pendingCasts lives). Controls
// + pans to the caster token, then runs the player's spell activity natively so
// dnd5e/midi attach the template to the DM's cursor; placement IS the commit
// (§11). Base level — slot-level upcast on the phone is a later add (§7.5).
export async function placeCast(id) {
  const pc = pendingCasts.get(id);
  if (!pc) return { ok: false, reason: "cast expired" };
  if (game.paused) return { ok: false, reason: "game is paused" };
  if (!onActiveScene()) return { ok: false, reason: "executor is not viewing the active scene" };
  const activity = await fromUuid(pc.activityUuid);
  if (!activity) { dismissCast(id); return { ok: false, reason: "spell no longer exists" }; }

  const token = pc.casterTokenUuid ? fromUuidSync(pc.casterTokenUuid)?.object : null;
  if (token) {
    token.control({ releaseOthers: true });
    try { await canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 250 }); } catch (e) { /* pan is best-effort */ }
  }
  // Remove the entry before use(): placement attaches to the cursor and blocks,
  // and a double-tap must not enqueue a second template.
  dismissCast(id);
  // Fast-forward the roll per-cast: the preset keeps autoRollDamage "none" for
  // the two-tap phone flow, but a DM-placed AoE has no phone follow-up, so it
  // would otherwise stall at WaitForDamageRoll. midi reads usage.midiOptions
  // (midi-qol.js:7597). Saves still fan to target owners (playerRollSaves:"chat",
  // unchanged). Auto-targeting under the template comes from the global preset
  // (autoTarget), which only fires for DM-placed templates.
  await activity.use({
    midiOptions: {
      autoRollAttack: true, fastForwardAttack: true,
      autoRollDamage: "always", fastForwardDamage: true
    }
  }, {}, {});
  return { ok: true };
}

// --- executor-side helpers -------------------------------------------------

function requireExecutor(stage) {
  if (!isExecutor()) return { ok: false, stage, reason: "not the executor client" };
  if (game.paused) return { ok: false, stage, reason: "game is paused" };
  return null;
}

function onActiveScene() {
  return canvas?.ready && canvas.scene?.id === game.scenes.active?.id;
}

function requesterCanAct(requesterId, actorOrToken) {
  const user = game.users.get(requesterId);
  if (!user) return false;
  const actor = actorOrToken?.actor ?? actorOrToken;
  return actor?.testUserPermission(user, "OWNER") ?? false;
}

// Capture toast notifications fired during a callback so refusal reasons can
// be surfaced back to the phone instead of dying on the executor's screen.
async function captureNotifications(fn) {
  const captured = [];
  const original = ui.notifications.notify.bind(ui.notifications);
  ui.notifications.notify = function (message, type, options) {
    if (["warning", "error"].includes(type)) captured.push(String(message));
    return original(message, type, options);
  };
  try {
    return { result: await fn(), captured };
  } finally {
    ui.notifications.notify = original;
  }
}

// --- endpoints ---------------------------------------------------------------

async function handleItemUse(payload) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;

  const { activityUuid, targetUuids = [], midiOptions = {}, consume = true, requesterId } = payload;
  const activity = await fromUuid(activityUuid);
  if (!activity) return { ok: false, stage: "resolve", reason: `activity not found: ${activityUuid}` };
  if (!requesterCanAct(requesterId, activity.item?.actor)) {
    return { ok: false, stage: "permission", reason: "requester does not own the acting actor" };
  }
  // Spike 3: midi's setupTargets refuses explicit targets for area activities.
  if (activity.target?.template?.type) {
    return { ok: false, stage: "validate", reason: "area-target activity — use the DM template flow" };
  }
  if (!onActiveScene()) {
    return { ok: false, stage: "scene", reason: "executor is not viewing the active scene" };
  }

  // dnd5e usage contract (_prepareUsageConfig): consume===false skips
  // consumption; undefined => normal consumption. A boolean `true` is INVALID
  // (dnd5e does `config.consume ??= {}` then sets `.action` on it → throws on a
  // primitive). So only ever set the falsy form; omit the key otherwise.
  const usage = {
    midiOptions: { targetUuids, ignoreUserTargets: true, workflowOptions: { autoConsumeResource: "both" }, ...midiOptions }
  };
  if (consume === false) usage.consume = false;

  const { result: workflow, captured } = await captureNotifications(() =>
    MidiQOL.completeActivityUse(activity.uuid, usage, { configure: false }, {})
  );

  if (!workflow || workflow.aborted) {
    return {
      ok: false,
      stage: "use",
      reason: captured.join("; ") || "activity refused (consumption/requirements) or workflow timed out"
    };
  }
  return {
    ok: true,
    itemName: activity.item?.name ?? null,
    targets: Array.from(workflow.targets ?? []).map(t => t?.name),
    hitTargets: Array.from(workflow.hitTargets ?? []).map(t => t?.name),
    failedSaves: Array.from(workflow.failedSaves ?? []).map(t => t?.name)
  };
}

// --- Q5 two-tap cadence: hold the workflow at WaitForDamageRoll between the
// attack tap and the damage tap. Verified live 2026-06-13 (spike). The workflow
// is fired without awaiting completion (it parks at WaitForDamageRoll when
// autoRollDamage:"none"); we hold the reference keyed by a requestId and
// trigger its damage roll on the second tap.
const parkedWorkflows = new Map();

async function findParkedWorkflow(activityUuid, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const wf = Object.values(globalThis.MidiQOL?.Workflow?.workflows ?? {})
      .find(w => w.activity?.uuid === activityUuid);
    if (wf) {
      if (wf.currentAction === wf.WorkflowState_WaitForDamageRoll) return wf;
      if (wf.currentAction === wf.WorkflowState_Completed || wf.currentAction === wf.WorkflowState_Abort) return null;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

async function handleItemUseStart(payload) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  const { activityUuid, targetUuids = [], midiOptions = {}, requesterId } = payload;
  const activity = await fromUuid(activityUuid);
  if (!activity) return { ok: false, stage: "resolve", reason: `activity not found: ${activityUuid}` };
  if (!requesterCanAct(requesterId, activity.item?.actor)) {
    return { ok: false, stage: "permission", reason: "requester does not own the acting actor" };
  }
  if (activity.target?.template?.type) return { ok: false, stage: "validate", reason: "area-target activity — use the DM template flow" };
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "executor is not viewing the active scene" };

  const hasAttack = activity.type === "attack";

  // "Flat" = a heal whose amount has NO dice (Aid's +5) — only then is there
  // nothing for the player to roll, so it can't park on a damage roll and midi
  // leaks the heal-roll dialog to the executor (DM-reported via Aid). Dice can
  // live in number/denomination OR in the bonus/custom formula string
  // (system/importer-dependent), so test the assembled formula — NOT just the
  // structured fields (Mass Healing Word keeps 1d4 in `bonus` and was wrongly
  // fast-forwarded by the field-only check). Dice heals keep the two-tap below.
  const h = activity.healing ?? {};
  const healFormula = [
    (h.number && h.denomination) ? `${h.number}d${h.denomination}` : "",
    h.custom?.enabled ? (h.custom?.formula ?? "") : "",
    h.bonus ?? ""
  ].join(" ");
  const flatHeal = activity.type === "heal" && !/\d*d\d+/i.test(healFormula);
  if (activity.type === "heal") console.debug(`${MODULE_ID} | heal`, { name: activity.item?.name, formula: healFormula, flat: flatHeal });
  if (flatHeal) {
    const { result: workflow, captured } = await captureNotifications(() =>
      MidiQOL.completeActivityUse(activity.uuid, {
        midiOptions: { targetUuids, ignoreUserTargets: true, autoRollDamage: "always", fastForwardDamage: true, workflowOptions: { autoConsumeResource: "both" }, ...midiOptions }
      }, { configure: false }, {})
    );
    if (!workflow || workflow.aborted) {
      return { ok: false, stage: "use", reason: captured.join("; ") || "heal refused (consumption/requirements) or timed out" };
    }
    return { ok: true, needsDamage: false, hasAttack: false, itemName: activity.item?.name ?? null, reason: captured.join("; ") || null };
  }

  // Fire attack-only; do NOT await (the workflow parks at WaitForDamageRoll).
  const { captured } = await captureNotifications(async () => {
    MidiQOL.completeActivityUse(activity.uuid, {
      midiOptions: {
        targetUuids, ignoreUserTargets: true,
        autoRollAttack: true, fastForwardAttack: true,
        autoRollDamage: "none", fastForwardDamage: false,
        workflowOptions: { autoConsumeResource: "both" },
        ...midiOptions
      }
    }, { configure: false }, {});
    return true;
  });

  const wf = await findParkedWorkflow(activity.uuid);
  if (activity.type === "heal") console.debug(`${MODULE_ID} | dice heal parked for two-tap?`, !!wf);
  if (!wf) {
    // No parked workflow: resolved already (e.g. a miss with no damage) or refused.
    return { ok: true, needsDamage: false, hasAttack, hit: false,
      itemName: activity.item?.name ?? null, reason: captured.join("; ") || null };
  }
  const requestId = foundry.utils.randomID();
  parkedWorkflows.set(requestId, wf);
  return {
    ok: true, needsDamage: true, requestId, hasAttack,
    itemName: activity.item?.name ?? null,
    hit: hasAttack ? (wf.hitTargets?.size ?? 0) > 0 : null,
    attackTotal: hasAttack ? (wf.attackTotal ?? wf.attackRoll?.total ?? null) : null
  };
}

async function handleItemUseDamage({ requestId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  const wf = parkedWorkflows.get(requestId);
  if (!wf) return { ok: false, stage: "expired", reason: "the attack expired — fire again" };
  parkedWorkflows.delete(requestId);
  const { captured } = await captureNotifications(async () => {
    await wf.activity.rollDamage({ workflow: wf, midiOptions: { fastForwardDamage: true } });
    return true;
  });
  return { ok: true, damageTotal: wf.damageTotal ?? null, reason: captured.join("; ") || null };
}

function handleItemUseCancel({ requestId }) {
  const wf = parkedWorkflows.get(requestId);
  parkedWorkflows.delete(requestId);
  try { wf?.aborted !== undefined && (wf.aborted = true); wf?.performState?.(wf.WorkflowState_Abort); } catch (e) { /* best effort */ }
  return { ok: true };
}

async function handleMoveRequest({ tokenId, dxGrid, dyGrid, requesterId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "executor is not viewing the active scene" };

  const tokenDoc = game.scenes.active.tokens.get(tokenId);
  if (!tokenDoc) return { ok: false, stage: "resolve", reason: `token not found: ${tokenId}` };
  if (!requesterCanAct(requesterId, tokenDoc)) {
    return { ok: false, stage: "permission", reason: "requester does not own the token" };
  }

  const grid = canvas.scene.grid.size;
  const from = tokenDoc.object?.center ?? { x: tokenDoc.x, y: tokenDoc.y };
  const to = { x: from.x + dxGrid * grid, y: from.y + dyGrid * grid };

  const blocked = CONFIG.Canvas.polygonBackends.move.testCollision(from, to, { type: "move", mode: "any" });
  if (blocked) return { ok: false, stage: "collision", reason: "a wall blocks that move" };

  await tokenDoc.update(
    { x: tokenDoc.x + dxGrid * grid, y: tokenDoc.y + dyGrid * grid },
    { animate: false }
  );
  return { ok: true, x: tokenDoc.x, y: tokenDoc.y };
}

async function handleMeasure({ fromTokenId, toTokenId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "executor is not viewing the active scene" };

  const a = canvas.tokens.get(fromTokenId);
  const b = canvas.tokens.get(toTokenId);
  if (!a || !b) return { ok: false, stage: "resolve", reason: "token not found on active scene" };
  return { ok: true, distanceFt: MidiQOL.computeDistance(a, b, { wallsBlock: false }) };
}

async function handleTargetsList({ forTokenId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "executor is not viewing the active scene" };

  const origin = canvas.tokens.get(forTokenId);
  if (!origin) return { ok: false, stage: "resolve", reason: `token not found: ${forTokenId}` };

  const candidates = [];
  for (const token of canvas.tokens.placeables) {
    if (token === origin || !token.actor) continue;
    if (token.document.hidden) continue;
    if (!MidiQOL.canSense(origin, token)) continue;
    candidates.push({
      tokenId: token.id,
      uuid: token.document.uuid,
      // TODO(§5): respect the token's display-name mode before phones ship —
      // this must not leak "Doppelganger" when the token shows "Villager".
      name: token.document.name,
      disposition: token.document.disposition,
      distanceFt: MidiQOL.computeDistance(origin, token, { wallsBlock: false })
    });
  }
  candidates.sort((a, b) => a.distanceFt - b.distanceFt);
  return { ok: true, forTokenId, candidates };
}

// Live target preview (B9): reflect the phone's current selection on the
// executor's canvas as the player taps, so the target commits immediately
// rather than at attack time. Interim DM-side version — sets the executor's
// own targets (visible on the DM canvas + TV); the player-colored TV reticle
// (§5 broadcast trick) supersedes this once the TV client is in play. Empty
// list clears. completeActivityUse passes ignoreUserTargets, so these preview
// targets never interfere with the explicit targetUuids at fire time.
function handlePreviewTargets({ tokenUuids = [] }) {
  if (!isExecutor()) return { ok: false, reason: "not the executor" };
  if (!onActiveScene()) return { ok: false, reason: "executor not on active scene" };
  const ids = tokenUuids.map(u => fromUuidSync(u)?.object?.id).filter(Boolean);
  // v14: TokenLayer#setTargets(ids, {mode}) — "replace" sets exactly these and
  // releases the rest; [] clears. (User#updateTokenTargets no longer exists.)
  canvas.tokens.setTargets(ids, { mode: "replace" });
  return { ok: true };
}

// Turn HUD: advancing the turn is GM-side (Combat#nextTurn), so the phone's
// End-turn routes here. Only the owner of the current combatant may advance.
async function handleEndTurn({ requesterId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  const combat = game.combat;
  if (!combat?.started) return { ok: false, stage: "combat", reason: "no active combat" };
  if (!requesterCanAct(requesterId, combat.combatant?.actor)) {
    return { ok: false, stage: "permission", reason: "not your turn" };
  }
  await combat.nextTurn();
  return { ok: true };
}

// --- phone/DM-facing API (any client) ---------------------------------------

function toExecutor(handler, payload) {
  const executorId = resolveExecutorId();
  if (!executorId) return Promise.resolve({ ok: false, stage: "route", reason: "no active GM/executor client" });
  payload.requesterId = game.user.id;
  if (game.user.id === executorId) {
    const handlers = {
      itemUse: handleItemUse, itemUseStart: handleItemUseStart,
      itemUseDamage: handleItemUseDamage, itemUseCancel: handleItemUseCancel,
      moveRequest: handleMoveRequest, measure: handleMeasure, targetsList: handleTargetsList,
      previewTargets: handlePreviewTargets, endTurn: handleEndTurn, announceCast: handleAnnounceCast
    };
    return handlers[handler](payload);
  }
  if (!socket) return Promise.resolve({ ok: false, stage: "route", reason: "socketlib unavailable on this client" });
  return socket.executeAsUser(handler, executorId, payload);
}

export const api = {
  useActivity: (payload) => toExecutor("itemUse", payload),
  useActivityStart: (payload) => toExecutor("itemUseStart", payload),
  useActivityDamage: (payload) => toExecutor("itemUseDamage", payload),
  useActivityCancel: (payload) => toExecutor("itemUseCancel", payload),
  moveToken: (payload) => toExecutor("moveRequest", payload),
  measure: (payload) => toExecutor("measure", payload),
  listTargets: (payload) => toExecutor("targetsList", payload),
  previewTargets: (payload) => toExecutor("previewTargets", payload),
  endTurn: (payload) => toExecutor("endTurn", payload),
  announceCast: (payload) => toExecutor("announceCast", payload),
  assignTargets: (userId, tokenUuids) =>
    socket
      ? socket.executeAsUser("assignTargets", userId, { tokenUuids, fromName: game.user.name })
      : Promise.resolve({ ok: false, stage: "route", reason: "socketlib unavailable on this client" }),
  state: remoteState
};
