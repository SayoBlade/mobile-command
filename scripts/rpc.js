import { MODULE_ID } from "./preset.js";
import { resolveExecutorId, isExecutor } from "./settings.js";
import * as DT from "./downtime.js"; // §17.7 downtime data model + Rule engine (pure, unit-tested)

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
  savePrompt: null,
  rollRequest: null,
  reactionPrompt: null
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

// Away-timer presence (DESIGN §7.8): each phone reports foreground/background via
// reportPresence(); every client stores the latest per user, but only the DM panel reads it.
// `since` is stamped with the RECEIVER's clock when the hidden state flips, so elapsed "away"
// time is skew-free (we don't trust the sender's timestamp).
export const presenceState = new Map(); // userId -> { hidden: boolean, since: epoch-ms }
function handlePresence({ userId, hidden } = {}) {
  if (!userId) return;
  const prev = presenceState.get(userId);
  const since = (prev && prev.hidden === !!hidden) ? prev.since : Date.now();
  presenceState.set(userId, { hidden: !!hidden, since });
  Hooks.callAll("mobile-command.presence", { userId });
}
// Phone → others: report whether the app is backgrounded. GM (not tracked) and missing socket
// are no-ops. Broadcast to others so whichever client runs the DM panel gets it.
export function reportPresence(hidden) {
  try {
    if (game.user?.isGM || !socket) return;
    socket.executeForOthers("presence", { userId: game.user.id, hidden: !!hidden });
  } catch (e) { /* best effort */ }
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
  socket.register("setMovementAction", handleSetMovementAction);
  socket.register("attackPreview", handleAttackPreview);
  socket.register("measure", handleMeasure);
  socket.register("targetsList", handleTargetsList);
  socket.register("previewTargets", handlePreviewTargets);
  socket.register("endTurn", handleEndTurn);
  socket.register("assignTargets", handleAssignTargets);
  socket.register("announceCast", handleAnnounceCast);
  socket.register("savePrompt", handleSavePrompt);
  socket.register("watchdogPing", handleWatchdogPing);
  socket.register("listLoot", handleListLoot);
  socket.register("openLoot", handleOpenLoot);
  socket.register("listInteractables", handleListInteractables);
  socket.register("operateInteractable", handleOperateInteractable);
  socket.register("partyJournalAdd", handlePartyJournalAdd);
  socket.register("portraitUpload", handlePortraitUpload);
  socket.register("wildShapeList", handleWildShapeList);
  socket.register("wildShapeInto", handleWildShapeInto);
  socket.register("wildShapeRevert", handleWildShapeRevert);
  socket.register("partyPack", handlePartyPack);
  socket.register("partySetCell", handlePartySetCell);
  socket.register("nightToggle", handleNightToggle);
  socket.register("scribeRequest", handleScribeRequest);
  socket.register("scribeResult", handleScribeResult);
  socket.register("placementStart", handlePlacementStart);
  socket.register("placementNudge", handlePlacementNudge);
  socket.register("placementRotate", handlePlacementRotate);
  socket.register("placementConfirm", handlePlacementConfirm);
  socket.register("placementCancel", handlePlacementCancel);
  socket.register("partySetForward", handlePartySetForward);
  socket.register("partyStage", handlePartyStage);
  socket.register("partyDeploy", handlePartyDeploy);
  socket.register("partyRelease", handlePartyRelease);
  socket.register("partyCombine", handlePartyCombine);
  socket.register("fixPcTokens", handleFixPcTokens);
  socket.register("requestRolls", handleRequestRolls);
  socket.register("rollRequest", handleRollRequest);
  socket.register("requestColorPick", handleRequestColorPick);
  socket.register("colorPick", handleColorPick);
  socket.register("aooPrompt", handleAoOPromptClient);
  socket.register("reactionPrompt", handleReactionPrompt); // reaction relay → owner's phone
  socket.register("damageTaken", handleDamageTaken); // incoming-damage relay → owner's phone
  socket.register("presence", handlePresence); // away-timer: phones report fg/bg
  socket.register("downtimePick", handleDowntimePick); // §17: player relays their downtime picks (legacy Phase-1a)
  socket.register("downtimeOp", handleDowntimeOp);      // §17.7: downtime v2 op dispatcher
  // A player who disconnects clears their away state (read as gray/offline via u.active, not
  // stale-red). Runs on every client; harmless where there's no DM panel.
  Hooks.on("userConnected", (user, connected) => { if (!connected) presenceState.delete(user.id); });
  socket.register("heartbeat", handleHeartbeat);
  registerPartyAutoFacing(); // executor-gated inside the hook
  registerPlayerColorSync(); // executor repaints a player's token rings on colour change
  registerAutoLoot(); // executor turns dead NPCs into loot piles (opt-in, needs Item Piles)
  registerReactionRelay(); // executor relays midi reaction prompts to the owner's phone
  registerDamageRelay(); // executor relays incoming PC damage to the owner's phone (combat chips)
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

// Phone-side: the executor's dialog watchdog pinged us — one of our actions opened a
// blocking dialog on the DM screen that we can't reach. Replace the silent hang with
// an honest "waiting on the DM" cue so the player knows it's not frozen.
function handleWatchdogPing({ name, title } = {}) {
  console.warn(`${MODULE_ID} | watchdog ping`, { name, title });
  ui.notifications?.warn(`"${name ?? "Your action"}" is waiting on the DM to clear a "${title ?? "popup"}" on their screen.`);
  return true;
}

// Executor-side relay: midi fires preTargetSave on the workflow client (the
// executor) right before it queues each target's save. We forward a structured
// prompt to that target's active owners. Registered once on ready.
// DM awareness of reaction windows (DM 2026-07-07: "reaction notifications for
// the DM too… without getting too distracting"). midi fires ReactionFilter on the
// workflow client (the executor) right before prompting the owner — surface a
// plain auto-dismissing toast naming who's deciding and with what. Non-modal, no
// sound, never blocks; debounced per actor so the double-filter call doesn't spam.
const reactionToastAt = new Map(); // actorId -> ts
export function registerReactionNotifier() {
  Hooks.on("midi-qol.ReactionFilter", (reactions, _options, _triggerType, list) => {
    try {
      if (!isExecutor()) return;
      const acts = (list?.length ? list : reactions) ?? [];
      const actor = acts[0]?.item?.actor;
      if (!actor) return;
      const last = reactionToastAt.get(actor.id) ?? 0;
      if (Date.now() - last < 3000) return;
      reactionToastAt.set(actor.id, Date.now());
      const names = [...new Set(acts.map(a => a?.item?.name).filter(Boolean))].slice(0, 3).join(", ");
      const user = game.users.find(u => u.active && !u.isGM && u.character?.id === actor.id)
        ?? game.users.find(u => u.active && !u.isGM && actor.testUserPermission?.(u, "OWNER"));
      // Passive chip in the DM panel's reaction widget (DM 2026-07-07) — non-modal
      // awareness of the player's reaction window; expires with midi's timeout.
      const timeout = game.settings.get("midi-qol", "ConfigSettings")?.reactionTimeout ?? 30;
      Hooks.callAll("mobile-command.dmReaction", {
        id: foundry.utils.randomID(),
        kind: "window",
        label: `${actor.name}${user ? ` · ${user.name}` : ""}`,
        weapon: names,
        expiresAt: Date.now() + Math.max(5, timeout) * 1000
      });
    } catch (e) { /* awareness only — never disturb the workflow */ }
  });
}

// Reaction relay (DESIGN §9, DM 2026-07-11): midi's native reaction dialog is dispatched to
// the OWNER's client (`executeAsUser("chooseReactions", …)`) and rendered there — dead on a
// canvasless phone (Hellish Rebuke tapped, nothing happened). Mirror the save relay: on the
// executor, catch midi's `midi-qol.ReactionFilter` (fires in `doReactions` BEFORE the socket
// hop), relay the available reactions to the owner's phone as a tappable chooser, and RETURN
// FALSE to suppress midi's native path. The phone's tap runs the reaction through the proven
// `useActivity`/`handleItemUse` executor path with the attacker pre-targeted (so the reaction's
// own save — e.g. Hellish Rebuke's Dex save — fans to the attacker) and `isReaction:true` (so
// the reaction economy + slot are consumed). Post-hoc reactions (damage/hit responses) are the
// target; pre-attack reactions (Shield) have timing caveats — see DESIGN.
export function registerReactionRelay() {
  // SYNC + fire-and-forget (DM 2026-07-11): do NOT await the phone inside midi's reaction hook.
  // v0.1.118 awaited the socket ACK here to gate suppression — but awaiting inside
  // `asyncHooksCall2("midi-qol.ReactionFilter")` STALLS midi's whole reaction flow and NO
  // popup appears. Back to the v0.1.117 behaviour that actually showed the chooser: relay to
  // the phone and return false synchronously. Gated to player-owned reactors so NPC reactions
  // fall through to midi untouched. A visible DM toast surfaces the decision without the console.
  Hooks.on("midi-qol.ReactionFilter", (reactions, options, triggerType, _reactionActivityList) => {
    try {
      if (!isExecutor() || !socket) return;
      const list = Array.isArray(reactions) ? reactions : [];
      const reactor = list[0]?.item?.actor ?? list[0]?.actor;
      if (!reactor || !reactor.hasPlayerOwner || !list.length) return; // players only; NPCs → midi native
      const owner = (typeof MidiQOL?.playerForActor === "function" ? MidiQOL.playerForActor(reactor) : null)
        ?? game.users.find(u => u.active && !u.isGM && reactor.testUserPermission?.(u, "OWNER"));
      if (!owner || owner.isGM || !owner.active) {
        console.debug(`${MODULE_ID} | reaction relay: no active phone owner for ${reactor.name}`, { owner: owner?.name, isGM: owner?.isGM, active: owner?.active });
        ui.notifications?.warn(`Reaction for ${reactor.name}: no active phone owner — handled by midi.`);
        return; // let midi's native path handle it
      }
      const wf = options?.workflow;
      const attackerTokenUuid = wf?.tokenUuid ?? wf?.token?.document?.uuid ?? wf?.token?.uuid ?? null;
      const attackerName = wf?.token?.name ?? wf?.actor?.name ?? "";
      const reactionsOut = list.map(a => ({
        uuid: a.uuid,
        name: a.name ?? a.actionName ?? "Reaction",
        itemName: a.item?.name ?? "",
        img: a.item?.img ?? a.img ?? "icons/svg/upgrade.svg",
        selfTarget: (a.target?.affects?.type ?? a.item?.system?.target?.affects?.type) === "self"
      }));
      const timeout = MidiQOL?.configSettings?.().reactionTimeout ?? 30;
      socket.executeAsUser("reactionPrompt", owner.id, {
        reactorUuid: reactor.uuid,
        attackerTokenUuid, attackerName,
        triggerType: triggerType ?? "",
        spellName: wf?.item?.name ?? "",
        reactions: reactionsOut,
        ttlMs: Math.max(5, timeout) * 1000,
        ts: Date.now()
      }); // fire-and-forget — DO NOT await (awaiting stalls midi's reaction flow)
      console.debug(`${MODULE_ID} | reaction relay → ${owner.name}`, { reactor: reactor.name, count: reactionsOut.length, triggerType, attacker: attackerName });
      ui.notifications?.info(`Reaction sent to ${owner.name}'s phone: ${reactionsOut.map(r => r.itemName || r.name).join(", ")}`);
      return false; // suppress midi's native (dead-on-phone) dialog; the phone chooser drives it
    } catch (e) {
      console.warn(`${MODULE_ID} | reaction relay failed`, e);
      // On error, DON'T return false — let midi fall back to its native path.
    }
  });
}
function handleReactionPrompt(payload) {
  remoteState.reactionPrompt = payload;
  Hooks.callAll("mobile-command.reactionPrompt", payload);
  return true;
}

// Incoming-damage relay (DM 2026-07-11): the combat-event chip/popup needs to know when the
// controlled PC takes damage — but `preUpdateActor` only fires on the client that APPLIES the
// damage (the executor/GM via midi), NOT on the phone. So compute the HP delta HERE (old from
// the actor, new from the change) and relay it to the owner's phone. Combat only.
export function registerDamageRelay() {
  Hooks.on("preUpdateActor", (actor, changes) => {
    try {
      if (!isExecutor() || !socket) return;
      if (!actor?.hasPlayerOwner) return;
      if (!foundry.utils.hasProperty(changes, "system.attributes.hp")) return;
      if (!game.combat?.started || !game.combat.combatants.some(c => c.actor?.id === actor.id)) return;
      const oldH = actor.system?.attributes?.hp ?? {};
      const newVal = foundry.utils.getProperty(changes, "system.attributes.hp.value");
      const newTemp = foundry.utils.getProperty(changes, "system.attributes.hp.temp");
      const dmg = ((oldH.value ?? 0) - (newVal ?? oldH.value ?? 0)) + ((oldH.temp ?? 0) - (newTemp ?? oldH.temp ?? 0));
      if (dmg <= 0) return; // healing / temp gain
      const c = game.combat?.combatant;
      const src = (c && c.actor && c.actor.id !== actor.id && c.actor.type !== "character") ? c.name : "";
      const owners = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
      for (const u of owners) socket.executeAsUser("damageTaken", u.id, { actorId: actor.id, amount: dmg, source: src, ts: Date.now() });
      console.debug(`${MODULE_ID} | damage relay`, { actor: actor.name, dmg, src, owners: owners.map(u => u.name) });
    } catch (e) { console.warn(`${MODULE_ID} | damage relay failed`, e); }
  });
}
function handleDamageTaken(payload) {
  Hooks.callAll("mobile-command.damageTaken", payload);
  return true;
}

// Downtime (§17): a player can't write the world `downtime` setting, so their activity picks
// come here (executor, a GM) which merges them in. The setting update re-renders every client.
async function handleDowntimePick(payload) {
  if (!isExecutor()) return { ok: false, stage: "route", reason: "not the DM client" };
  const { actorId, entry, requesterId } = payload;
  if (!actorId) return { ok: false, stage: "validate", reason: "no actor" };
  const actor = game.actors.get(actorId);
  if (actor && !requesterCanAct(requesterId, actor)) return { ok: false, stage: "permission", reason: "not your character" };
  const dt = foundry.utils.deepClone(game.settings.get(MODULE_ID, "downtime") ?? {});
  if (!dt.open) return { ok: false, stage: "state", reason: "no downtime window is open" };
  dt.picks = dt.picks ?? {};
  dt.picks[actorId] = entry ?? { locked: false, items: [] };
  await game.settings.set(MODULE_ID, "downtime", dt);
  return { ok: true };
}

// Downtime v2 (§17.7): one executor handler dispatching on `op`, driving the pure transforms in
// downtime.js and writing the shared `downtimeState` setting (the single source of truth; its
// update re-renders every client). Players may only touch THEIR OWN character's Activities
// (create/edit/remove/roll); the DM (GM) authors Rules, adjusts progress, toggles visibility,
// opens/closes the window, and sets the per-character gear settings.
const DT_PLAYER_OPS = new Set(["upsertActivity", "removeActivity", "applyAttempt", "pickTemplate"]);
async function handleDowntimeOp(payload = {}) {
  if (!isExecutor()) return { ok: false, stage: "route", reason: "not the DM client" };
  const { op, actorId, requesterId } = payload;
  const isGM = !!game.users.get(requesterId)?.isGM;
  if (!isGM) {
    if (!DT_PLAYER_OPS.has(op)) return { ok: false, stage: "permission", reason: "DM only" };
    const actor = game.actors.get(actorId);
    if (!actor || !requesterCanAct(requesterId, actor)) return { ok: false, stage: "permission", reason: "not your character" };
  }
  let state = DT.normalizeState(game.settings.get(MODULE_ID, "downtimeState"));
  switch (op) {
    case "upsertActivity": state = DT.upsertActivity(state, actorId, payload.activity); break;
    case "removeActivity": state = DT.removeActivity(state, actorId, payload.id); break;
    case "setRule": state = DT.setRule(state, actorId, payload.id, payload.rule); break;
    case "pushRoll": state = DT.setPending(state, actorId, payload.id, payload.on); break;
    case "applyAttempt": {
      // Surface the roll's result to the DM as a toast (the pure transform discards the note).
      const act = DT.listActivities(state, actorId).find(a => a.id === payload.id);
      if (act?.rule && act?.progress) {
        const res = DT.applyAttempt(act.rule, act.progress, payload.outcome ?? null);
        ui.notifications?.info(`${game.actors.get(actorId)?.name ?? "PC"} — ${act.name}: ${res.note}`);
      }
      state = DT.applyAttemptTo(state, actorId, payload.id, payload.outcome ?? null);
      break;
    }
    case "adjustProgress": state = DT.adjustActivity(state, actorId, payload.id, payload.delta); break;
    case "setVisible": state = DT.setVisible(state, actorId, payload.id, payload.visible); break;
    case "openWindow": state = DT.openWindow(state, payload.size, foundry.utils.randomID()); break;
    case "closeWindow": state = DT.closeWindow(state); break;
    case "setActorSetting": state = DT.setActorSetting(state, actorId, payload.key, payload.value); break;
    case "upsertTemplate": state = DT.upsertTemplate(state, payload.template); break;
    case "removeTemplate": state = DT.removeTemplate(state, payload.id); break;
    case "setTemplateRule": state = DT.setTemplateRule(state, payload.id, payload.rule); break;
    case "setTemplateNote": state = DT.setTemplateNote(state, payload.id, payload.note); break;
    case "pickTemplate": state = DT.pickTemplate(state, actorId, payload.templateId, requesterId); break;
    case "seedTemplates": state = DT.seedTemplates(state, requesterId); break;
    default: return { ok: false, stage: "validate", reason: `unknown downtime op: ${op}` };
  }
  await game.settings.set(MODULE_ID, "downtimeState", state);
  return { ok: true };
}

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
  if (!isExecutor()) return { ok: false, stage: "route", reason: "not the DM client" };
  const { activityUuid, casterName, spellName, casterTokenUuid, kind, requesterId, slotLevel, profileId } = payload;
  const activity = await fromUuid(activityUuid);
  if (!activity) return { ok: false, stage: "resolve", reason: `activity not found: ${activityUuid}` };
  if (!requesterCanAct(requesterId, activity.item?.actor)) {
    return { ok: false, stage: "permission", reason: "requester does not own the acting actor" };
  }
  const id = foundry.utils.randomID();
  pendingCasts.set(id, {
    id, activityUuid, casterTokenUuid, requesterId, ts: Date.now(),
    kind: kind === "summon" ? "summon" : "aoe", // summon → DM places the summoned token(s)
    slotLevel: slotLevel ?? null, profileId: profileId ?? null, // the player's pre-picked choices
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
  if (!onActiveScene()) return { ok: false, reason: "the DM isn't on the active scene" };
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
  // Apply the player's pre-picked choices so the DM only does the placement click,
  // not the slot/creature decisions. spell.slot upcasts; create.summons + summons.
  // profile pre-fill the summon dialog. configure:false skips that dialog (the choices
  // are already made); placement (crosshairs) still runs on the DM's cursor.
  const usage = {
    midiOptions: {
      autoRollAttack: true, fastForwardAttack: true,
      autoRollDamage: "always", fastForwardDamage: true
    }
  };
  const dialog = {};
  if (pc.slotLevel) { usage.spell = { slot: pc.slotLevel }; dialog.configure = false; }
  if (pc.kind === "summon") {
    usage.create = { summons: true };
    if (pc.profileId) usage.summons = { profile: pc.profileId };
    dialog.configure = false;
  }
  await activity.use(usage, dialog, {});
  // Don't leave the caster token selected on the executor — the DM rolls the
  // monsters' saves next, and a lingering PC selection slows that (DM 2026-06-17).
  try { canvas.tokens?.releaseAll(); } catch (e) { /* best effort */ }
  return { ok: true };
}

// ===== Player-placed spell templates & teleports (§Round 33, built 2026-07-10) =====
// A no-canvas phone can't drop a template, but the EXECUTOR has the canvas and the
// TV shows it — so a "placement session" runs a real MeasuredTemplate (AoE) or a
// ghost circle (teleport destination) on the executor, the phone D-pad nudges/
// rotates it, the TV is the live aim preview, and Confirm resolves natively:
//   - ranged AoE (fireball/stinking cloud): circle nudges within range → save/damage
//     on tokens under it (dnd5e's own placement suppressed via create.measuredTemplate:false)
//   - self AoE (cone/line — breath weapon, cone of cold, lightning bolt): origin sits
//     on the caster, only the DIRECTION rotates
//   - teleport (misty step, dimension door): a marker nudges within range → the caster
//     token moves there (teleport:true, wall-bypassing); range is a HARD gate on confirm
// One session at a time (executor-global). Everything is cleaned on confirm/cancel.
let placement = null; // { activityUuid, casterTokenId, mode, aim, templateId, rangeFt, slotLevel, requesterId }

function tplTypeFor(dtype) {
  if (["cone"].includes(dtype)) return "cone";
  if (["line", "ray", "wall"].includes(dtype)) return "ray";
  if (["cube", "square", "rect"].includes(dtype)) return "rect";
  return "circle"; // sphere / radius / circle
}
function casterPlayerColor(actor) {
  const u = game.users.find(x => !x.isGM && x.character?.id === actor?.id)
    ?? game.users.find(x => !x.isGM && actor?.testUserPermission?.(x, "OWNER"));
  return u?.color?.css ?? u?.color ?? "#c8a44d";
}
function placementRangeFt(activity) {
  const r = activity.range ?? activity.item?.system?.range ?? {};
  const v = Math.max(Number(r.value) || 0, Number(r.reach) || 0);
  return (r.units === "self" || !v) ? 0 : v; // 0 = self-origin (cones/lines) or unbounded
}
function distFt(a, b) {
  try { return canvas.grid.measurePath([a, b]).distance; } catch (e) { return 0; }
}

// This world's stack rescales a created MeasuredTemplate's `distance` by
// gridSize/100 (260px grid → 2.6×), so a 20 ft fireball would draw as 52 ft and
// midi would target that bigger area. Probe the factor ONCE per scene and divide
// our intended distance by it so the rendered template is the right size. On a
// normal 100px scene the factor is 1 (no-op). Cached per scene id.
const _tplFactor = new Map();
async function templateDistanceFactor() {
  const sid = canvas.scene?.id; if (!sid) return 1;
  if (_tplFactor.has(sid)) return _tplFactor.get(sid);
  let factor = 1;
  try {
    const [probe] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{ t: "circle", x: 0, y: 0, distance: 20, hidden: true, flags: { [MODULE_ID]: { probe: true } } }]);
    const stored = canvas.scene.templates.get(probe.id)?.distance ?? 20;
    factor = stored > 0 ? stored / 20 : 1;
    await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [probe.id]);
  } catch (e) { factor = 1; }
  if (!Number.isFinite(factor) || factor <= 0) factor = 1;
  _tplFactor.set(sid, factor);
  return factor;
}

async function clearPlacement() {
  const p = placement; placement = null;
  if (p?.templateId) { try { await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [p.templateId]); } catch (e) { /* gone */ } }
}

async function handlePlacementStart({ activityUuid, casterTokenUuid, mode, slotLevel, requesterId }) {
  const refused = requireExecutor("placement"); if (refused) return refused;
  if (!onActiveScene()) return { ok: false, reason: "the DM isn't on the active scene" };
  const activity = await fromUuid(activityUuid);
  if (!activity) return { ok: false, reason: "spell not found" };
  if (!requesterCanAct(requesterId, activity.item?.actor)) return { ok: false, reason: "not your spell" };
  const casterTok = casterTokenUuid ? fromUuidSync(casterTokenUuid)?.object : null;
  if (!casterTok) return { ok: false, reason: "no caster token on this scene" };
  await clearPlacement();
  const origin = casterTok.center;
  const rangeFt = placementRangeFt(activity);
  const color = casterPlayerColor(activity.item?.actor);
  const gridDist = canvas.scene.grid.distance; // ft per square
  const gridSize = canvas.scene.grid.size;     // px per square
  const factor = await templateDistanceFactor(); // compensate this stack's distance rescale
  let templateData, kind;
  if (mode === "teleport") {
    kind = "teleport";
    templateData = { t: "circle", x: origin.x, y: origin.y, distance: Math.max(gridDist / 2, 2.5) / factor,
      direction: 0, fillColor: color, borderColor: color, texture: "", flags: { [MODULE_ID]: { placement: true } } };
  } else {
    const tpl = activity.target?.template ?? {};
    const t = tplTypeFor(tpl.type);
    const selfOrigin = rangeFt === 0; // cones/lines start at the caster
    kind = selfOrigin ? "self-aoe" : "ranged-aoe";
    templateData = {
      t, x: origin.x, y: origin.y, direction: 0,
      distance: (Number(tpl.size) || gridDist) / factor,
      fillColor: color, borderColor: color,
      flags: { [MODULE_ID]: { placement: true } }
    };
    if (t === "cone") templateData.angle = CONFIG.MeasuredTemplate?.defaults?.angle ?? 53.13;
    if (t === "ray") templateData.width = (Number(tpl.width) || 5) / factor;
  }
  let created;
  try { [created] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]); }
  catch (e) { return { ok: false, reason: `couldn't draw the preview: ${e.message}` }; }
  // tplData is the recreate template (this stack blocks x/y/direction UPDATES to a
  // MeasuredTemplate — Automated Animations/Sequencer wrap them — but CREATE at any
  // position works, so nudge/rotate delete+recreate off this base, 2026-07-10).
  placement = { activityUuid, casterTokenId: casterTok.id, mode, kind, templateId: created.id,
    tplData: templateData, rangeFt, slotLevel: slotLevel ?? null, requesterId, origin, gridDist, gridSize };
  try { await canvas.animatePan({ x: origin.x, y: origin.y, duration: 250 }); } catch (e) { /* best effort */ }
  return { ok: true, kind, rangeFt, spellName: activity.item?.name ?? "spell" };
}

function placementReadout() {
  const p = placement; if (!p) return { ok: false, reason: "no active placement" };
  const caster = canvas.tokens.get(p.casterTokenId);
  const from = caster?.center ?? p.origin;
  const d = Math.round(distFt(from, { x: p.tplData.x, y: p.tplData.y }));
  const inRange = p.rangeFt === 0 || d <= p.rangeFt + 0.5;
  return { ok: true, kind: p.kind, distFt: d, rangeFt: p.rangeFt, inRange, direction: Math.round(p.tplData.direction) };
}

// Delete + recreate the preview at the session's current tplData (updates are
// blocked on this stack; create is not). Keeps exactly one preview visible.
async function replacePreview() {
  const p = placement; if (!p) return;
  const oldId = p.templateId;
  try {
    const [created] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [p.tplData]);
    p.templateId = created.id;
  } catch (e) { console.warn(`${MODULE_ID} | preview recreate`, e); return; }
  if (oldId) { try { await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [oldId]); } catch (e) { /* gone */ } }
}

async function handlePlacementNudge({ dx, dy }) {
  const refused = requireExecutor("placement"); if (refused) return refused;
  const p = placement; if (!p) return { ok: false, reason: "no active placement" };
  if (p.kind === "self-aoe") return { ok: false, reason: "this spell rotates, it doesn't move" };
  p.tplData = { ...p.tplData, x: p.tplData.x + (Number(dx) || 0) * p.gridSize, y: p.tplData.y + (Number(dy) || 0) * p.gridSize };
  await replacePreview();
  return placementReadout();
}

async function handlePlacementRotate({ deg }) {
  const refused = requireExecutor("placement"); if (refused) return refused;
  const p = placement; if (!p) return { ok: false, reason: "no active placement" };
  p.tplData = { ...p.tplData, direction: ((Number(p.tplData.direction) || 0) + (Number(deg) || 0) + 360) % 360 };
  await replacePreview();
  return placementReadout();
}

async function handlePlacementCancel() {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  await clearPlacement();
  return { ok: true };
}

// Tokens under the placed template. midi's own computeTargetsFromTemplates is the
// authoritative detector (matches its autoTarget) and works on this stack where the
// raw PIXI shape reads null; falls back to a circle-radius geometry check.
function tokensUnderTemplate(tplDoc) {
  try {
    if (globalThis.MidiQOL?.computeTargetsFromTemplates) {
      const r = MidiQOL.computeTargetsFromTemplates([tplDoc]);
      const set = r instanceof Set ? [...r] : (Array.isArray(r) ? r : []);
      const toks = set.map(x => x?.object ?? x).filter(t => t?.actor);
      if (toks.length) return toks;
    }
  } catch (e) { console.warn(`${MODULE_ID} | midi template targets failed`, e); }
  // Fallback: circle radius (px = distance_ft / gridDistance * gridSize).
  const radiusPx = (Number(tplDoc.distance) || 0) / (canvas.scene.grid.distance || 5) * (canvas.scene.grid.size || 100);
  const out = [];
  for (const t of canvas.tokens.placeables) {
    if (!t.actor) continue;
    const dx = t.center.x - tplDoc.x, dy = t.center.y - tplDoc.y;
    if (Math.hypot(dx, dy) <= radiusPx + (canvas.scene.grid.size || 100) / 2) out.push(t);
  }
  return out;
}

async function handlePlacementConfirm() {
  const refused = requireExecutor("placement"); if (refused) return refused;
  const p = placement; if (!p) return { ok: false, reason: "no active placement" };
  const activity = await fromUuid(p.activityUuid);
  const tpl = canvas.scene.templates.get(p.templateId);
  if (!activity || !tpl) { await clearPlacement(); return { ok: false, reason: "the spell or preview is gone" }; }
  const caster = canvas.tokens.get(p.casterTokenId);
  const rd = placementReadout();

  if (p.mode === "teleport") {
    if (rd.ok && !rd.inRange) return { ok: false, reason: `too far — ${rd.distFt} ft of ${rd.rangeFt} ft` };
    // Consume the slot / post the card, then move the caster to the marker.
    // Auto-roll keys live in workflowOptions (midi ignores them at the top level —
    // same trap the fireAoO fix hit, Round 32).
    const usage = { midiOptions: { workflowOptions: { autoRollAttack: true, fastForwardAttack: true, autoRollDamage: "always", fastForwardDamage: true, autoConsumeResource: "both" } } };
    if (p.slotLevel) usage.spell = { slot: p.slotLevel };
    try { await activity.use(usage, { configure: false }, {}); } catch (e) { console.warn(`${MODULE_ID} | teleport cast`, e); }
    const grid = canvas.scene.grid;
    // The marker's x,y is the aim ORIGIN; a token's x,y is its top-left — offset by
    // half the token so it lands centred on the marker.
    const tw = (caster?.document.width ?? 1) * grid.size, th = (caster?.document.height ?? 1) * grid.size;
    try { await caster?.document.update({ x: p.tplData.x - tw / 2, y: p.tplData.y - th / 2 }, { teleport: true }); }
    catch (e) { await clearPlacement(); return { ok: false, reason: `couldn't move: ${e.message}` }; }
    await clearPlacement();
    return { ok: true, mode: "teleport" };
  }

  // AoE: keep the template on the scene (it IS the area / lingering cloud), target
  // the tokens under it, and run the activity with dnd5e's OWN template placement
  // suppressed. Use activity.use (NOT completeActivityUse): activity.use honours
  // create.measuredTemplate:false in _finalizeUsage, so midi doesn't park at
  // AwaitTemplate; completeActivityUse ignored it (2026-07-10). Targets are set on
  // the executor's own user (midi reads game.user.targets when we don't fight it).
  placement = null; // keep the committed template on the map — it's the player's aim
  // AoE resolution: the player has AIMED the template on the TV (the hard part —
  // done). midi hard-awaits its OWN template for an area spell and its parked
  // workflow isn't reliably reachable to feed programmatically on this build, so
  // rather than hang, we keep the aimed template, PRE-TARGET the tokens under it on
  // the executor, and hand off to the DM to resolve the save/damage (one tap on the
  // spell card, targets already set). Full auto-resolve = a later midi-integration
  // pass. Fire-and-forget the cast so its card appears; never await/park.
  const targets = tokensUnderTemplate(tpl);
  try { game.user.updateTokenTargets(targets.map(t => t.id)); } catch (e) { /* best effort */ }
  const usage = { midiOptions: { workflowOptions: { autoRollAttack: true, fastForwardAttack: true, autoRollDamage: "always", fastForwardDamage: true, autoConsumeResource: "both" } } };
  if (p.slotLevel) usage.spell = { slot: p.slotLevel };
  activity.use(usage, { configure: false }, {}).catch(e => console.warn(`${MODULE_ID} | AoE cast`, e));
  return { ok: true, mode: "aoe", targets: targets.length, dmResolves: true };
}

// --- executor-side helpers -------------------------------------------------

function requireExecutor(stage) {
  if (!isExecutor()) return { ok: false, stage, reason: "not the DM client" };
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

// --- dialog watchdog ---------------------------------------------------------
// Route B runs the workflow on the EXECUTOR with configure:false + fast-forward, so
// NO dialog should ever appear. If midi can't auto-resolve something (a forced
// consumption / ammunition / roll-config prompt), it opens a BLOCKING dialog on the
// DM screen that the phone can't see or reach → the player hangs with zero feedback
// (DM/Sqyre: the empty-revolver "Consume Item Use?" pop-up). We mark the executor
// "mid phone action" for a short window; a render hook below catches any prompt that
// pops inside it, alerts the DM (so they can clear it), and pings the player's phone.
let activePhoneAction = null; // { name, requesterId, ts } | null
const PHONE_ACTION_WINDOW_MS = 8000;
function markPhoneAction(name, requesterId) {
  activePhoneAction = { name: name || "A phone action", requesterId, ts: Date.now() };
}

export function registerDialogWatchdog() {
  const onRender = (app) => {
    try {
      if (!isExecutor() || !activePhoneAction) return;
      if (Date.now() - activePhoneAction.ts > PHONE_ACTION_WINDOW_MS) { activePhoneAction = null; return; }
      // Only blocking PROMPTS (DialogV2 / legacy Dialog / dnd5e config/usage/consume/
      // ammo dialogs) — never sheets, AutoAnimations, DSN, or our own UI.
      const cname = app?.constructor?.name || "";
      const DialogV2 = foundry.applications?.api?.DialogV2;
      const isPrompt = (DialogV2 && app instanceof DialogV2)
        || (globalThis.Dialog && app instanceof globalThis.Dialog)
        || /Dialog|Configuration|Usage|Consum|Ammunition|Prompt/i.test(cname);
      if (!isPrompt) return;
      const title = app?.title || app?.options?.window?.title || cname || "a popup";
      const { name, requesterId } = activePhoneAction;
      activePhoneAction = null; // alert once per action
      console.warn(`${MODULE_ID} | dialog watchdog: stranded prompt "${title}" during phone action "${name}"`);
      ui.notifications?.warn(`⚠ Mobile Command: "${name}" opened "${title}" here — the phone can't reach it. Resolve it so the player isn't stuck.`, { permanent: true });
      if (socket && requesterId) {
        try { socket.executeAsUser("watchdogPing", requesterId, { name, title }); } catch (e) { /* best effort */ }
      }
    } catch (e) { console.warn(`${MODULE_ID} | dialog watchdog error`, e); }
  };
  Hooks.on("renderApplicationV2", onRender);
  Hooks.on("renderApplication", onRender); // legacy V1 prompts too
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
    return { ok: false, stage: "scene", reason: "the DM isn't on the active scene" };
  }
  markPhoneAction(activity.item?.name, requesterId); // dialog watchdog: arm for this action

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

async function findParkedWorkflow(activityUuid, itemUuid, preIds = new Set(), timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // midi 14 keeps workflows in a Map keyed by id, stored optionally as WeakRefs
    // (useWeakReferences; midi-qol.js 24336/24347). `Object.values()` on a Map is
    // ALWAYS [], which previously made this scan see nothing and the two-tap fail
    // silently for weapon AND spell (root-caused + fixed live 2026-06-18). Iterate
    // the Map's values and deref. Match by activity uuid, or by item (a scaling
    // spell can cast through a cloned activity whose uuid differs from what we sent).
    const coll = globalThis.MidiQOL?.Workflow?.workflows;
    const entries = coll instanceof Map ? [...coll.entries()] : Object.entries(coll ?? {});
    // Only the workflow created by THIS fire: a FRESH id (not in the pre-fire snapshot).
    // A prior attack whose damage was never rolled stays parked in the Map; without the
    // snapshot the finder returned that OLD one and the phone showed its total/hit for the
    // new attack (DM-reported: every attack "only shows 9s").
    const fresh = entries
      .map(([id, w]) => [id, (w instanceof WeakRef ? w.deref() : w)])
      .filter(([id, w]) => w && !preIds.has(id)
        && (w.activity?.uuid === activityUuid || (itemUuid && (w.itemUuid === itemUuid || w.activity?.item?.uuid === itemUuid))))
      .map(([, w]) => w);
    const wf = fresh[fresh.length - 1]; // most-recent fresh match = the one we just fired
    if (wf) {
      // Parked awaiting a manual damage roll. midi's loop (midi-qol.js:25981) sets
      // wf.suspended=true and breaks, LEAVING currentAction at WaitForDamageRoll — so
      // `suspended` is the reliable signal (a no-attack spell like Magic Missile reaches
      // it the same way an attack does). Gate on damage still pending.
      const awaitingDamage = (wf.suspended || wf.currentAction === wf.WorkflowState_WaitForDamageRoll) && wf.needsDamage !== false;
      if (awaitingDamage) return wf;
      if (wf.currentAction === wf.WorkflowState_Completed || wf.currentAction === wf.WorkflowState_Abort) return null;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

// The attack total can lag the park by a tick: on a cold first attack (midi/AC5E
// warming up) wf.attackTotal is briefly midi's -100 placeholder (midi-qol.js:24342)
// before it's set to the real d20 total. Poll for a real value so the phone shows
// the number that matches chat instead of "—". wf.attackTotal is the field midi
// populates in this Route-B flow (= the kept roll total); wf.attackRoll.total is
// preferred when present. Returns null only if neither resolves in time.
async function resolveAttackTotal(wf, timeoutMs = 5000) {
  const read = () => {
    const r = wf.attackRoll?.total;
    if (typeof r === "number") return r;
    const a = wf.attackTotal;
    return (typeof a === "number" && a !== -100) ? a : null; // -100 = pre-roll placeholder
  };
  const start = Date.now();
  let v = read();
  while (v == null && Date.now() - start < timeoutMs) {
    await new Promise(res => setTimeout(res, 100));
    v = read();
  }
  return v;
}

async function handleItemUseStart(payload) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  const { activityUuid, targetUuids = [], midiOptions = {}, spellSlot = null, skipConsume = false, requesterId } = payload;
  const activity = await fromUuid(activityUuid);
  if (!activity) return { ok: false, stage: "resolve", reason: `activity not found: ${activityUuid}` };
  if (!requesterCanAct(requesterId, activity.item?.actor)) {
    return { ok: false, stage: "permission", reason: "requester does not own the acting actor" };
  }
  if (activity.target?.template?.type) return { ok: false, stage: "validate", reason: "area-target activity — use the DM template flow" };
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "the DM isn't on the active scene" };
  markPhoneAction(activity.item?.name, requesterId); // dialog watchdog: arm for this action

  const hasAttack = activity.type === "attack";
  // Multi-instance targets (Magic Missile darts, DM 2026-07-05): the phone sends
  // DUPLICATE uuids ([A, A, B] = two darts on A). midi's target set dedupes, so the
  // workflow runs on the UNIQUE targets; the duplicate counts are remembered and
  // applied as extra damage instances after the damage roll (handleItemUseDamage).
  const instanceCount = {};
  for (const u of targetUuids) instanceCount[u] = (instanceCount[u] ?? 0) + 1;
  const uniqueTargets = Object.keys(instanceCount);
  const extraInstances = Object.fromEntries(Object.entries(instanceCount).filter(([, n]) => n > 1).map(([u, n]) => [u, n - 1]));
  // Upcast: cast at the slot level the phone chose (dnd5e usage config field
  // `spell.slot`, e.g. "spell3"). Omitted → activity casts at its base level.
  const spellCfg = spellSlot ? { spell: { slot: spellSlot } } : {};
  if (spellSlot) console.debug(`${MODULE_ID} | upcast`, { name: activity.item?.name, slot: spellSlot });
  // skipConsume (phone fired a depleted item "anyway"): don't consume, so midi never opens
  // the executor-side "Consume?" dialog the phone can't reach (it would hang). Disable both
  // dnd5e usage consumption and midi's auto-consume. (DM 2026-06-25 out-of-resources flow.)
  if (skipConsume) spellCfg.consume = { resources: false, spellSlot: false, action: false };
  const consumeMode = skipConsume ? "none" : "both";
  if (skipConsume) console.debug(`${MODULE_ID} | skipConsume`, { name: activity.item?.name });

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
        ...spellCfg,
        midiOptions: { targetUuids: uniqueTargets, ignoreUserTargets: true, autoRollDamage: "always", fastForwardDamage: true, workflowOptions: { autoConsumeResource: consumeMode }, ...midiOptions }
      }, { configure: false }, {})
    );
    if (!workflow || workflow.aborted) {
      return { ok: false, stage: "use", reason: captured.join("; ") || "heal refused (consumption/requirements) or timed out" };
    }
    return { ok: true, needsDamage: false, hasAttack: false, itemName: activity.item?.name ?? null, reason: captured.join("; ") || null };
  }

  // Snapshot existing midi workflow ids so findParkedWorkflow picks the one THIS fire
  // creates — not a stuck older one left by an attack whose damage was never rolled,
  // which the finder would otherwise keep returning (the "only shows 9s" stale total).
  const wfColl = globalThis.MidiQOL?.Workflow?.workflows;
  const preWfIds = new Set(wfColl instanceof Map ? [...wfColl.keys()] : Object.keys(wfColl ?? {}));
  // Fire attack-only; do NOT await (the workflow parks at WaitForDamageRoll).
  const { captured } = await captureNotifications(async () => {
    MidiQOL.completeActivityUse(activity.uuid, {
      ...spellCfg,
      midiOptions: {
        targetUuids: uniqueTargets, ignoreUserTargets: true,
        autoRollAttack: true, fastForwardAttack: true,
        autoRollDamage: "none", fastForwardDamage: false,
        workflowOptions: { autoConsumeResource: consumeMode },
        ...midiOptions
      }
    }, { configure: false }, {});
    return true;
  });

  const wf = await findParkedWorkflow(activity.uuid, activity.item?.uuid, preWfIds);
  // Whether the workflow parked for the two-tap. If false for a damage spell that
  // should let the player roll (e.g. Magic Missile), it resolved without a roll
  // step — that's the bug to chase (DM-reported MM didn't roll damage 2026-06-17).
  console.debug(`${MODULE_ID} | use start`, { name: activity.item?.name, type: activity.type, hasAttack, parked: !!wf });
  if (!wf) {
    // No parked workflow: resolved already (e.g. a miss with no damage) or refused.
    return { ok: true, needsDamage: false, hasAttack, hit: false,
      itemName: activity.item?.name ?? null, reason: captured.join("; ") || null };
  }
  const requestId = foundry.utils.randomID();
  if (Object.keys(extraInstances).length) wf.mcExtraInstances = extraInstances; // darts beyond the first per target
  parkedWorkflows.set(requestId, wf);
  // The attack total can lag the park by a tick (see resolveAttackTotal) — wait for
  // the real d20 result so the phone shows the number that matches chat, never
  // midi's -100 placeholder (which the phone renders as "—"). null only if it never
  // resolves (then the phone shows "—" + the Hit/Attack label, still not -100).
  const attackTotal = hasAttack ? await resolveAttackTotal(wf) : null;
  if (hasAttack) console.debug(`${MODULE_ID} | attack total`, {
    resolved: attackTotal, rollTotal: wf.attackRoll?.total, rawAttackTotal: wf.attackTotal, formula: wf.attackRoll?.formula
  });
  return {
    ok: true, needsDamage: true, requestId, hasAttack,
    itemName: activity.item?.name ?? null,
    hit: hasAttack ? (wf.hitTargets?.size ?? 0) > 0 : null,
    attackTotal
  };
}

async function handleItemUseDamage({ requestId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  const wf = parkedWorkflows.get(requestId);
  if (!wf) return { ok: false, stage: "expired", reason: "the attack expired — fire again" };
  parkedWorkflows.delete(requestId);
  try {
    const { captured } = await captureNotifications(async () => {
      await wf.activity.rollDamage({ workflow: wf, midiOptions: { fastForwardDamage: true } });
      return true;
    });
    if (wf.damageTotal == null) {
      console.warn(`${MODULE_ID} | rollDamage produced no total`, { item: wf.item?.name, actor: wf.actor?.name, captured });
    }
    // Multi-instance targets (Magic Missile darts, DM 2026-07-05): midi applied the
    // damage once per UNIQUE target; each duplicate the phone sent gets a fresh roll
    // of the same formula applied directly (applyDamage → calculateDamage, so
    // resistances still count). A GM-whispered line keeps the math auditable.
    let extraTotal = 0;
    try {
      const extras = wf.mcExtraInstances ?? {};
      const lines = [];
      const type = wf.damageDetail?.[0]?.type ?? wf.defaultDamageType ?? "";
      const formula = wf.damageRolls?.[0]?.formula ?? null;
      for (const [uuid, n] of Object.entries(extras)) {
        const td = await fromUuid(uuid);
        const target = td?.actor;
        if (!target) continue;
        for (let i = 0; i < n; i++) {
          let total = wf.damageTotal ?? 0;
          if (formula) { const r = await (new Roll(formula, wf.actor?.getRollData() ?? {})).evaluate(); total = r.total; }
          await target.applyDamage([{ value: total, type }]);
          extraTotal += total;
          lines.push(`${td.name} ${total}`);
        }
      }
      if (lines.length) {
        ChatMessage.create({
          content: `<b>${wf.item?.name ?? "Attack"}</b> — extra instance${lines.length > 1 ? "s" : ""}: ${lines.join(", ")}`,
          whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)
        }).catch(() => {});
      }
    } catch (e) { console.warn(`${MODULE_ID} | extra-instance damage failed`, e); }
    return { ok: true, damageTotal: (wf.damageTotal ?? null) == null ? null : wf.damageTotal + extraTotal, reason: captured.join("; ") || null };
  } catch (e) {
    // Names the actor/item + logs the error — a corrupted PC (e.g. invalid item
    // types from a disabled content module → DAE prep failures) throws here, which
    // otherwise looked like the button "doing nothing" (DM 2026-06-20).
    console.error(`${MODULE_ID} | rollDamage failed`, { item: wf.item?.name, actor: wf.actor?.name, error: e });
    return { ok: false, stage: "damage", reason: `damage errored on ${wf.actor?.name ?? "this PC"}: ${e.message}` };
  }
}

function handleItemUseCancel({ requestId }) {
  const wf = parkedWorkflows.get(requestId);
  parkedWorkflows.delete(requestId);
  try { wf?.aborted !== undefined && (wf.aborted = true); wf?.performState?.(wf.WorkflowState_Abort); } catch (e) { /* best effort */ }
  return { ok: true };
}

// Movement budget: ft each token has used on its CURRENT turn, so the phone can
// colour the D-pad readout green/yellow/red like the canvas drag ruler. Executor
// only (moves + grid measurement happen here). A token's budget resets when its
// turn begins; the whole map clears on combat start/end.
const turnMove = new Map(); // tokenId -> ft used this turn
Hooks.on("updateCombat", (combat, changed) => {
  if (!isExecutor()) return;
  // Clear all on any turn/round change — only the active combatant moves at a time, so a
  // fresh turn = a fresh budget. (Deleting by combatant.tokenId missed tokenless combatants.)
  if (("turn" in changed) || ("round" in changed)) turnMove.clear();
});
Hooks.on("combatStart", () => { if (isExecutor()) turnMove.clear(); });
Hooks.on("deleteCombat", () => { if (isExecutor()) turnMove.clear(); });

async function handleMoveRequest({ tokenId, dxGrid, dyGrid, requesterId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "the DM isn't on the active scene" };

  const tokenDoc = game.scenes.active.tokens.get(tokenId);
  if (!tokenDoc) return { ok: false, stage: "resolve", reason: `token not found: ${tokenId}` };
  if (!requesterCanAct(requesterId, tokenDoc)) {
    // Party Mode (§15): players don't own the GROUP actor, but any member-owner
    // may drive the packed party token — out-of-combat travel is a party action
    // (the original "move the group token out of combat" MVP goal).
    const ga = tokenDoc.actor;
    const user = game.users.get(requesterId);
    const memberOwner = ga?.type === "group" && ga.getFlag(MODULE_ID, "packed")
      && (ga.system?.members ?? []).some(m => m.actor?.testUserPermission(user, "OWNER"));
    if (!memberOwner) return { ok: false, stage: "permission", reason: "requester does not own the token" };
  }

  const grid = canvas.scene.grid.size;
  const from = tokenDoc.object?.center ?? { x: tokenDoc.x, y: tokenDoc.y };
  const to = { x: from.x + dxGrid * grid, y: from.y + dyGrid * grid };

  const blocked = CONFIG.Canvas.polygonBackends.move.testCollision(from, to, { type: "move", mode: "any" });
  if (blocked) return { ok: false, stage: "collision", reason: "Blocked" };

  await tokenDoc.update(
    { x: tokenDoc.x + dxGrid * grid, y: tokenDoc.y + dyGrid * grid },
    { animate: false }
  );

  // Follow (DM 2026-07-08): the player's OTHER owned tokens on the scene repeat
  // the move (familiar trails the PC). v1 is all-or-none per player (user flag
  // followAll, toggled on the phone beside the token switcher). Each follower is
  // wall-checked from its OWN position and skips silently when blocked
  // (warnings-not-walls); followers never touch the mover's movement budget and
  // still provoke AoOs like any move. Group tokens neither follow nor lead
  // (packed members already ride inside).
  try {
    const user = game.users.get(requesterId);
    if (user?.getFlag(MODULE_ID, "followAll") && tokenDoc.actor?.type !== "group") {
      for (const t of game.scenes.active.tokens) {
        if (t.id === tokenDoc.id || !t.actor) continue;
        if (t.actor.type === "group" || t.actor.flags?.["item-piles"]) continue;
        if (!t.actor.testUserPermission(user, "OWNER")) continue;
        const fFrom = t.object?.center ?? { x: t.x, y: t.y };
        const fTo = { x: fFrom.x + dxGrid * grid, y: fFrom.y + dyGrid * grid };
        if (CONFIG.Canvas.polygonBackends.move.testCollision(fFrom, fTo, { type: "move", mode: "any" })) continue;
        await t.update({ x: t.x + dxGrid * grid, y: t.y + dyGrid * grid }, { animate: false });
      }
    }
  } catch (e) { console.warn(`${MODULE_ID} | follow failed`, e); }

  // Movement budget — only while it's this token's turn in active combat (the
  // green/yellow/red cue is a combat concept; out of combat we just move).
  // It's this token's turn if it's the active combatant. Match by tokenId, but fall back
  // to the ACTOR — a combatant added by actor (not by dropping its token) has a null
  // combatant.tokenId, and the budget would otherwise never count its movement.
  const cb = game.combat?.combatant;
  const onMyTurn = !!(game.combat?.started && cb && (cb.tokenId === tokenId || (cb.actor?.id && cb.actor.id === tokenDoc.actor?.id)));
  if (!onMyTurn) return { ok: true, x: tokenDoc.x, y: tokenDoc.y };
  let step = canvas.scene.grid.distance; // fallback: one square
  try { step = canvas.grid.measurePath([from, to]).distance ?? step; } catch (e) { /* keep fallback */ }
  const used = (turnMove.get(tokenId) ?? 0) + step;
  turnMove.set(tokenId, used);
  const mv = tokenDoc.actor?.system?.attributes?.movement ?? {};
  const action = tokenDoc.movementAction ?? "walk";
  const speed = Number(mv[action] ?? mv.walk ?? 0) || 0;
  const color = !speed ? "none" : used <= speed ? "green" : used <= speed * 2 ? "yellow" : "red";
  return { ok: true, x: tokenDoc.x, y: tokenDoc.y, used: Math.round(used), speed, color };
}

// Set the token's active movement action (walk/fly/swim/climb/burrow) so the
// phone's travel-type pick is reflected in Foundry's own movement (the DM/TV
// ruler, terrain cost). The phone has no canvas, so this must run on the executor.
async function handleSetMovementAction({ tokenId, action, requesterId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "the DM isn't on the active scene" };

  const tokenDoc = game.scenes.active.tokens.get(tokenId);
  if (!tokenDoc) return { ok: false, stage: "resolve", reason: `token not found: ${tokenId}` };
  if (!requesterCanAct(requesterId, tokenDoc)) {
    return { ok: false, stage: "permission", reason: "requester does not own the token" };
  }
  if (!(action in (CONFIG.Token?.movement?.actions ?? {}))) {
    return { ok: false, stage: "validate", reason: `unknown movement action: ${action}` };
  }
  try {
    await tokenDoc.update({ movementAction: action });
  } catch (e) {
    return { ok: false, stage: "update", reason: e.message };
  }
  return { ok: true, action };
}

// §14: surface AC5E's adv/dis recommendation for an attack on the phone. The
// phone can't evaluate it (no canvas/targets — AC5E bails), so the executor asks
// AC5E directly: set the target(s), fire dnd5e's attack-roll config build (which
// triggers AC5E's preRollAttackV2 hook → it annotates config.options[ac5e]), read
// the result, and ABORT the roll (return false) — no dice, no chat. We then
// normalise to {mode, reasons} for the phone. `raw` is returned for diagnostics
// while this is verified live on the DM client (hook order / clean abort).
async function handleAttackPreview({ attackerTokenId, activityUuid, targetTokenUuids = [], requesterId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "the DM isn't on the active scene" };

  const tokenDoc = game.scenes.active.tokens.get(attackerTokenId);
  if (!tokenDoc) return { ok: false, stage: "resolve", reason: `attacker token not found: ${attackerTokenId}` };
  if (!requesterCanAct(requesterId, tokenDoc)) {
    return { ok: false, stage: "permission", reason: "requester does not own the token" };
  }
  let activity;
  try { activity = await fromUuid(activityUuid); } catch (e) { return { ok: false, stage: "resolve", reason: e.message }; }
  if (!activity?.rollAttack) return { ok: false, stage: "resolve", reason: "activity has no attack roll" };

  const MID = "automated-conditions-5e";
  if (!game.modules.get(MID)?.active) return { ok: true, mode: "normal", reasons: [], unevaluated: "ac5e-not-active" };

  // Target the chosen tokens so AC5E evaluates the real situation (it reads
  // game.user.targets). v14: token.setTarget — updateTokenTargets was removed.
  const setTargets = (toks, on) => { for (const t of toks) { try { t.setTarget(on, { user: game.user, releaseOthers: false }); } catch (e) {} } };
  const prevTargets = Array.from(game.user.targets);
  setTargets(prevTargets, false);
  const wanted = [];
  for (const u of targetTokenUuids) {
    let td; try { td = await fromUuid(u); } catch (e) { continue; }
    const place = td?.object ?? canvas.tokens?.get(td?.id);
    if (place) wanted.push(place);
  }
  setTargets(wanted, true);

  // Capture AC5E's annotation (mode + named reasons). We do NOT abort the roll —
  // a midi-wrapped attack ignores the abort and rolls a REAL extra die anyway. Instead
  // let it roll and HIDE it: cancel Dice So Nice, roll BLIND (GM-only), and delete the
  // throwaway card. Players' phones hide chat + have no canvas (no DSN/AutoAnimations),
  // so it's invisible to them; the TV is the only place a residual could flash.
  // (DM-accepted experimental, 2026-06-23; the real check is Sqyre on midi 14.0.9.)
  let ac5 = null, raw = null;
  const hookId = Hooks.on("dnd5e.preRollAttackV2", (config) => {
    try {
      const a = foundry.utils.getProperty(config, `options.${MID}`) ?? config?.[MID] ?? config?.rolls?.[0]?.options?.[MID] ?? null;
      if (a) { ac5 = a; raw = { advantageMode: a.advantageMode, defaultButton: a.defaultButton, subAdv: a.subject?.advantage, subDis: a.subject?.disadvantage, oppAdv: a.opponent?.advantage, oppDis: a.opponent?.disadvantage }; }
    } catch (e) { raw = { err: e.message }; }
  });
  const dsnHook = Hooks.on("diceSoNiceRollStart", () => false); // suppress the 3D dice for the throwaway
  // Block the throwaway's chat card outright (create:false isn't honored on every midi
  // path) — no card means Automated Animations / DSN never fire on it, AND the executor
  // isn't stalled animating it right before the real attack (which can push the real
  // attack's total past resolveAttackTotal's window → the phone's "—"). Scoped to this roll.
  const cardHook = Hooks.on("preCreateChatMessage", () => false);
  // Automated Animations plays a "test swing" (JB2A) on the throwaway roll because it hooks
  // dnd5e.rollAttackV2 directly (not just the card) — DM 2026-07-12. Stub its single play entry
  // (AutomatedAnimations.PlayAnimation) for the duration of this roll only; restored in finally.
  const AA = globalThis.AutomatedAnimations;
  const savedAAPlay = (AA && typeof AA.PlayAnimation === "function") ? AA.PlayAnimation : null;
  if (savedAAPlay) AA.PlayAnimation = async () => {};
  const msgIdsBefore = new Set(game.messages.keys());
  try {
    await activity.rollAttack({}, { configure: false }, { create: false, rollMode: CONST.DICE_ROLL_MODES.BLIND });
  } catch (e) { /* non-fatal */ }
  finally {
    Hooks.off("dnd5e.preRollAttackV2", hookId);
    Hooks.off("diceSoNiceRollStart", dsnHook);
    Hooks.off("preCreateChatMessage", cardHook);
    if (savedAAPlay) AA.PlayAnimation = savedAAPlay; // restore Automated Animations
    // create:false isn't honored on every midi path — delete any throwaway card it made.
    for (const m of game.messages.filter((mm) => !msgIdsBefore.has(mm.id))) { try { await m.delete(); } catch (e) {} }
    setTargets(wanted, false);
    setTargets(prevTargets, true);
  }

  if (!ac5) {
    console.debug(`${MODULE_ID} | attackPreview: AC5E active but did not annotate the roll (midi may route attacks past dnd5e.preRollAttackV2)`, raw);
    return { ok: true, mode: "normal", reasons: [], unevaluated: "ac5e-did-not-annotate", raw };
  }

  const labelOf = (x) => (typeof x === "string" ? x : (x?.label ?? x?.name ?? x?.id ?? String(x)));
  const sub = ac5.subject ?? {}, opp = ac5.opponent ?? {};
  const advN = (sub.advantage?.length || 0) + (opp.advantage?.length || 0);
  const disN = (sub.disadvantage?.length || 0) + (opp.disadvantage?.length || 0);
  let mode = "normal";
  const dbn = String(ac5.defaultButton ?? "").toLowerCase();
  if (["advantage", "normal", "disadvantage"].includes(dbn)) mode = dbn;
  else if (ac5.advantageMode === 1) mode = "advantage";
  else if (ac5.advantageMode === -1) mode = "disadvantage";
  else if (disN && !advN) mode = "disadvantage";
  else if (advN && !disN) mode = "advantage";
  const reasons = [
    ...((sub.advantage ?? []).concat(opp.advantage ?? [])).map((r) => ({ kind: "adv", label: labelOf(r) })),
    ...((sub.disadvantage ?? []).concat(opp.disadvantage ?? [])).map((r) => ({ kind: "dis", label: labelOf(r) })),
    ...((sub.fail ?? [])).map((r) => ({ kind: "fail", label: labelOf(r) })),
  ];
  console.debug(`${MODULE_ID} | attackPreview`, { mode, advN, disN, defaultButton: ac5.defaultButton, advantageMode: ac5.advantageMode, reasons });
  return { ok: true, mode, reasons, raw };
}

async function handleMeasure({ fromTokenId, toTokenId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "the DM isn't on the active scene" };

  const a = canvas.tokens.get(fromTokenId);
  const b = canvas.tokens.get(toTokenId);
  if (!a || !b) return { ok: false, stage: "resolve", reason: "token not found on active scene" };
  return { ok: true, distanceFt: MidiQOL.computeDistance(a, b, { wallsBlock: false }) };
}

// A dead corpse / loot pile isn't a valid attack target (DM 2026-07-12: a lootable "Goblin 2"
// kept showing up in the attack picker). True for an Item Piles pile, a Defeated combatant, the
// dead status, or an NPC at 0 HP.
function isDeadCorpse(token) {
  try {
    const a = token?.actor;
    if (!a) return false;
    if (game.itempiles?.API?.isValidItemPile?.(token.document ?? token)) return true;
    const deadId = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
    if (a.statuses?.has?.(deadId)) return true;
    if (game.combat?.combatants?.find(c => c.tokenId === token.id)?.defeated) return true;
    if (a.type === "npc" && (a.system?.attributes?.hp?.value ?? 1) <= 0) return true;
    return false;
  } catch (e) { return false; }
}
async function handleTargetsList({ forTokenId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "the DM isn't on the active scene" };

  const origin = canvas.tokens.get(forTokenId);
  if (!origin) return { ok: false, stage: "resolve", reason: `token not found: ${forTokenId}` };

  const candidates = [];
  const excluded = []; // diagnostic: why each placeable was dropped from the picker
  for (const token of canvas.tokens.placeables) {
    if (token === origin) continue;
    if (!token.actor) { excluded.push({ name: token.document.name, why: "no-actor" }); continue; }
    if (token.document.hidden) { excluded.push({ name: token.document.name, why: "hidden" }); continue; }
    if (isDeadCorpse(token)) { excluded.push({ name: token.document.name, why: "dead/pile" }); continue; }
    if (!MidiQOL.canSense(origin, token)) {
      excluded.push({
        name: token.document.name, why: "canSense=false",
        distanceFt: Math.round(MidiQOL.computeDistance(origin, token, { wallsBlock: false }))
      });
      continue;
    }
    candidates.push({
      tokenId: token.id,
      uuid: token.document.uuid,
      // TODO(§5): respect the token's display-name mode before phones ship —
      // this must not leak "Doppelganger" when the token shows "Villager".
      name: token.document.name,
      disposition: token.document.disposition,
      pcOwned: !!token.actor?.hasPlayerOwner, // player-controlled (PC or summon) → ally regardless of disposition
      distanceFt: MidiQOL.computeDistance(origin, token, { wallsBlock: false })
    });
  }
  candidates.sort((a, b) => a.distanceFt - b.distanceFt);
  // Diagnostic (DM console): which tokens the picker dropped and why. canSense=false
  // means origin genuinely can't see it (walls/darkness/no vision) — the usual reason
  // a visible-to-the-DM enemy never reaches a player's picker.
  console.debug(`mobile-command | targets for ${origin.document.name}: ${candidates.length} shown` +
    (excluded.length ? ` | dropped: ${excluded.map(e => `${e.name}(${e.why}${e.distanceFt != null ? ` @${e.distanceFt}ft` : ""})`).join(", ")}` : ""));
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
  if (!isExecutor()) return { ok: false, reason: "not the DM" };
  if (!onActiveScene()) return { ok: false, reason: "the DM isn't on the active scene" };
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

// --- Item Piles loot (§7.x) --------------------------------------------------
// A phone has no canvas, so it can't double-click a pile to loot it. The executor
// (which has the canvas + Item Piles) lists nearby lootable piles, and on tap renders
// Item Piles' OWN loot interface targeted at the player's client via `userIds` — the
// shell's dialog-lift then surfaces that window on the phone. We reuse Item Piles'
// real loot/currency/transfer machinery rather than reimplementing it.
async function handleListLoot({ forActorUuid } = {}) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" }; // looting is fine while paused
  const API = game.itempiles?.API;
  if (!API) return { ok: false, reason: "Item Piles isn't installed on the DM client" };
  if (!onActiveScene()) return { ok: false, reason: "the DM isn't on the active scene" };
  const myTok = forActorUuid ? fromUuidSync(forActorUuid)?.getActiveTokens?.()[0] ?? null : null;
  const piles = [];
  for (const t of (canvas.tokens?.placeables ?? [])) {
    try {
      if (!API.isValidItemPile(t)) continue;
      const merchant = API.isItemPileMerchant?.(t) ?? false;
      const lootable = API.isItemPileLootable?.(t) ?? false;
      if (!merchant && !lootable) continue;              // only loot piles or merchant shops
      if (merchant && API.isItemPileClosed?.(t)) continue; // a closed shop can't be browsed
      // "Empty" must count CURRENCY too — a money-only pile (no items) is still worth
      // opening; `isItemPileEmpty` only looks at items, which hid it before (DM 2026-06-23).
      const items = API.getActorItems(t) ?? [];
      const money = (API.getActorCurrencies?.(t) ?? []).filter(c => (c.quantity ?? 0) > 0);
      if (!merchant && !items.length && !money.length) continue; // truly empty → skip
      let distance = null;
      try { distance = myTok ? Math.round(canvas.grid.measurePath([myTok.center, t.center]).distance) : null; } catch (e) { /* optional */ }
      // Only reachable loot/shops — adjacent (≤ 5 ft, i.e. standing right next to it).
      // If we can't place the player's token, fall through (can't gate on distance).
      if (distance != null && distance > 5) continue;
      let moneyLabel = null;
      // Item Piles' currency `abbreviation` is a template like "{#}PP" where {#} is the
      // amount — substitute it (else the raw "{#}" leaks into the phone's money line).
      if (money.length) { try { moneyLabel = money.map(c => { const abbr = String(c.abbreviation ?? c.name ?? ""); return (abbr.includes("{#}") ? abbr.replace("{#}", c.quantity) : `${c.quantity} ${abbr}`).trim(); }).join(", "); } catch (e) { moneyLabel = "money"; } }
      piles.push({
        uuid: t.document.uuid,
        name: t.name,
        img: t.document.texture?.src || t.actor?.img || null,
        kind: merchant ? "merchant" : "loot",
        itemCount: items.length,
        money: moneyLabel,
        distance
      });
    } catch (e) { /* skip a bad pile, keep scanning */ }
  }
  piles.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  return { ok: true, piles };
}

async function handleOpenLoot({ pileUuid, forActorUuid, requesterId } = {}) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" }; // looting is fine while paused
  const API = game.itempiles?.API;
  if (!API) return { ok: false, reason: "Item Piles isn't installed on the DM client" };
  const pile = pileUuid ? fromUuidSync(pileUuid) : null;
  if (!pile) return { ok: false, reason: "that loot is no longer here" };
  const actor = forActorUuid ? fromUuidSync(forActorUuid) : null;
  try {
    await API.renderItemPileInterface(pile, { userIds: [requesterId], inspectingTarget: actor ?? undefined });
    return { ok: true };
  } catch (e) {
    console.warn(`${MODULE_ID} | openLoot failed`, e);
    return { ok: false, reason: e?.message ?? "could not open that loot" };
  }
}

// --- nearby interactables: doors + active tiles ------------------------------
// A phone has no canvas, so the executor scans for things the player is standing next
// to and operates them on their behalf (players can't update walls / fire active tiles
// themselves). Adjacency = the nearest point is within ~one grid square.
function nearestPointDistPx(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function rectDistPx(px, py, x, y, w, h) {
  const cx = Math.max(x, Math.min(px, x + w)), cy = Math.max(y, Math.min(py, y + h));
  return Math.hypot(px - cx, py - cy);
}

async function handleListInteractables({ forActorUuid } = {}) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  if (!onActiveScene()) return { ok: false, reason: "the DM isn't on the active scene" };
  const myTok = forActorUuid ? fromUuidSync(forActorUuid)?.getActiveTokens?.()[0] ?? null : null;
  if (!myTok) return { ok: true, doors: [], tiles: [] };
  const grid = canvas.scene.grid, c = myTok.center;
  const reach = grid.size * 1.1; // ~one square away = "right next to it"
  const ft = (px) => Math.round((px / grid.size) * grid.distance);
  const doors = [];
  for (const w of (canvas.walls?.placeables ?? [])) {
    const d = w.document;
    if (d.door !== CONST.WALL_DOOR_TYPES.DOOR) continue; // regular doors only — never reveal SECRET doors
    const [x0, y0, x1, y1] = d.c;
    const dist = nearestPointDistPx(c.x, c.y, x0, y0, x1, y1);
    if (dist > reach) continue;
    doors.push({ id: d.id, ds: d.ds, distance: ft(dist) });
  }
  const tiles = [];
  if (game.modules.get("monks-active-tiles")?.active) {
    for (const t of (canvas.tiles?.placeables ?? [])) {
      const f = t.document.flags?.["monks-active-tiles"];
      if (!f?.active || !(f.actions?.length)) continue;
      const trig = Array.isArray(f.trigger) ? f.trigger : [f.trigger];
      if (!trig.some(m => ["click", "dblclick", "manual"].includes(m))) continue; // only player-operable
      const d = t.document;
      const dist = rectDistPx(c.x, c.y, d.x, d.y, d.width, d.height);
      if (dist > reach) continue;
      tiles.push({ id: t.id, label: f.name || "Interactable", distance: ft(dist) });
    }
  }
  return { ok: true, doors, tiles };
}

async function handleOperateInteractable({ kind, id, forActorUuid } = {}) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  if (kind === "door") {
    const w = canvas.scene?.walls?.get(id);
    if (!w) return { ok: false, reason: "that door isn't here anymore" };
    if (w.ds === CONST.WALL_DOOR_STATES.LOCKED) return { ok: false, reason: "that door is locked" };
    const next = w.ds === CONST.WALL_DOOR_STATES.OPEN ? CONST.WALL_DOOR_STATES.CLOSED : CONST.WALL_DOOR_STATES.OPEN;
    await w.update({ ds: next });
    return { ok: true, ds: next };
  }
  if (kind === "tile") {
    const tile = canvas.scene?.tiles?.get(id);
    if (!tile?.trigger) return { ok: false, reason: "interactables need Monk's Active Tiles enabled" };
    const tok = forActorUuid ? fromUuidSync(forActorUuid)?.getActiveTokens?.()[0]?.document ?? null : null;
    try {
      await tile.trigger({ tokens: tok ? [tok] : [], method: "click", pt: { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 } });
      return { ok: true };
    } catch (e) { return { ok: false, reason: e?.message ?? "couldn't operate it" }; }
  }
  return { ok: false, reason: "unknown interactable" };
}

// --- shared party journal ----------------------------------------------------
// The phone observes the entry and reads it directly, but players can't author on an
// entry they only observe — so the executor creates each note's page here, and the
// entry itself (default OBSERVER so every player can read it) on first use. Flagged
// so the phone can find it. (Stated MVP goal — write to a shared party journal.)
async function handlePartyJournalAdd({ text, authorName } = {}) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  const clean = String(text ?? "").trim();
  if (!clean) return { ok: false, reason: "empty note" };
  try {
    let entry = game.journal.find(j => j.getFlag(MODULE_ID, "partyJournal"));
    if (!entry) {
      // Default OWNER (not OBSERVER) so every player can append pages to it DIRECTLY
      // from their phone afterward — only this initial entry creation needs the GM
      // (top-level JournalEntry creation is role-gated to Trusted+). Drop it into an
      // existing "Party" folder if the DM made one, for tidiness.
      const folder = game.folders?.find(f => f.type === "JournalEntry" && f.name === "Party") ?? null;
      entry = await JournalEntry.create({
        name: "Party Journal",
        folder: folder?.id ?? null,
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
        flags: { [MODULE_ID]: { partyJournal: true } }
      });
    }
    if (!entry) return { ok: false, reason: "could not open the party journal" };
    const ts = Date.now();
    const author = String(authorName ?? "Someone").slice(0, 60);
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: `${author} · ${new Date(ts).toLocaleString()}`,
      type: "text",
      title: { show: true, level: 3 },
      text: { content: `<p>${foundry.utils.escapeHTML(clean)}</p>`, format: 1 },
      flags: { [MODULE_ID]: { ts, author } }
    }]);
    return { ok: true };
  } catch (e) {
    console.warn(`${MODULE_ID} | partyJournalAdd failed`, e);
    return { ok: false, reason: e?.message ?? "could not post the note" };
  }
}

// --- AI portrait upload (idea #2) --------------------------------------------
// Players can't write files (FILES_UPLOAD is GM-only), so the phone sends the image data
// here and the executor saves it to a NON-module dir at the data root (mc-portraits/,
// Sqyre-safe). Two images now: `tokenUrl` (disc-cropped) drives the token texture + ring,
// `portraitUrl` (full, uncropped) becomes the actor portrait. An older client sends a single
// `dataUrl` used for both. DM request 2026-06-26.
async function handlePortraitUpload({ requesterId, actorId, dataUrl, tokenUrl, portraitUrl } = {}) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  const actor = game.actors.get(actorId);
  const requester = game.users.get(requesterId);
  if (!actor) return { ok: false, reason: "character not found" };
  if (!requester || !actor.testUserPermission(requester, "OWNER")) return { ok: false, reason: "not your character" };
  const tokenData = tokenUrl || dataUrl;       // disc-cropped → token texture
  const portraitData = portraitUrl || dataUrl; // full image → actor portrait (falls back to token)
  if (!/^data:image\//.test(tokenData || "")) return { ok: false, reason: "no image data" };
  const FP = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
  const dir = "mc-portraits";
  try { await FP.createDirectory("data", dir); } catch (e) { /* already exists */ }
  const save = async (data, tag) => {
    const blob = await (await fetch(data)).blob();
    const ext = (blob.type || "image/webp").split("/")[1].replace("jpeg", "jpg");
    const file = new File([blob], `${actor.id}-${tag}-${Date.now()}.${ext}`, { type: blob.type || "image/webp" });
    const up = await FP.upload("data", dir, file, {}, { notify: false });
    return up?.path || null;
  };
  try {
    const tokenPath = await save(tokenData, "token");
    if (!tokenPath) return { ok: false, reason: "upload returned no path" };
    // Save the full portrait separately only when the client sent a distinct one.
    let portraitPath = tokenPath;
    if (portraitData && portraitData !== tokenData && /^data:image\//.test(portraitData)) {
      portraitPath = (await save(portraitData, "portrait")) || tokenPath;
    }
    await actor.update({ img: portraitPath, "prototypeToken.texture.src": tokenPath, "prototypeToken.ring.enabled": true });
    for (const scene of game.scenes) {
      for (const tok of scene.tokens) {
        if (tok.actorId === actor.id) await tok.update({ "texture.src": tokenPath, "ring.enabled": true });
      }
    }
    return { ok: true, path: tokenPath, portraitPath };
  } catch (e) {
    console.warn(`${MODULE_ID} | portraitUpload failed`, e);
    return { ok: false, reason: e?.message ?? "upload failed" };
  }
}

// --- Wild Shape (Druid) ------------------------------------------------------
// Players can't transform (allowPolymorphing is off + actor creation is GM-only), so
// the executor drives dnd5e's real transform: it lists beasts from the SRD monsters
// pack, runs Actor#transformInto with the built-in "wildshape" preset (keeps mental/
// class/feats, merges saves/skills, Moon AC/HP formulas), spends a Wild Shape use, and
// reverts via Actor#revertOriginalForm. Detection is the `isPolymorphed` getter.
async function handleWildShapeList({ maxCR } = {}) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  const pack = game.packs.get("dnd5e.monsters");
  if (!pack) return { ok: false, reason: "the dnd5e monsters compendium isn't installed on the DM client" };
  const idx = await pack.getIndex({ fields: ["system.details.type.value", "system.details.cr", "img"] });
  const cap = Number.isFinite(maxCR) ? maxCR : Infinity;
  const beasts = idx
    .filter(e => e.system?.details?.type?.value === "beast" && (e.system?.details?.cr ?? 0) <= cap)
    .map(e => ({ uuid: e.uuid, name: e.name, img: e.img, cr: e.system?.details?.cr ?? 0 }))
    .sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name));
  return { ok: true, beasts };
}

async function handleWildShapeInto({ beastUuid, forActorUuid, featUuid } = {}) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  const actor = forActorUuid ? fromUuidSync(forActorUuid) : null;
  const beast = beastUuid ? await fromUuid(beastUuid) : null;
  if (!actor || !beast) return { ok: false, reason: "shape or character not found" };
  if (actor.isPolymorphed) return { ok: false, reason: `${actor.name} is already shape-changed — revert first` };
  try {
    const TS = dnd5e.dataModels.settings.TransformationSetting;
    const settings = new TS(CONFIG.DND5E.transformation.presets.wildshape.settings);
    await actor.transformInto(beast, settings, { renderSheet: false });
    // transformInto doesn't spend the feature's use — do it so the pool tracks.
    const feat = featUuid ? fromUuidSync(featUuid) : null;
    const uses = feat?.system?.uses;
    if (feat && uses && (uses.max ?? 0) > 0) {
      await feat.update({ "system.uses.spent": Math.min((uses.spent ?? 0) + 1, uses.max) });
    }
    return { ok: true, name: beast.name };
  } catch (e) {
    console.warn(`${MODULE_ID} | wildShapeInto failed`, e);
    return { ok: false, reason: e?.message ?? "could not change shape" };
  }
}

async function handleWildShapeRevert({ forActorUuid, forTokenId } = {}) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  // The token now carries the transformed actor; resolve whichever ref the phone sent.
  let target = forActorUuid ? fromUuidSync(forActorUuid) : null;
  if (!target?.isPolymorphed && forTokenId) {
    target = game.scenes.active?.tokens?.get(forTokenId)?.actor ?? target;
  }
  if (!target?.isPolymorphed) return { ok: false, reason: "not currently shape-changed" };
  try {
    await target.revertOriginalForm({ renderSheet: false });
    return { ok: true };
  } catch (e) {
    console.warn(`${MODULE_ID} | wildShapeRevert failed`, e);
    return { ok: false, reason: e?.message ?? "could not revert" };
  }
}

// --- Party Mode: pack/disperse the native dnd5e group (DESIGN §15) -----------
// The phone has no canvas, so all token geometry (cluster check, wall/occupancy
// validation, delete/recreate) runs here on the executor. Shared state lives in a
// flag on the group actor (flags.mobile-command.{packed, formation}); Foundry's own
// document sync fans it to every phone/TV via updateActor — no custom relay.

const PARTY_GRID = 3; // 3x3 marching order

function partyMembers(group) {
  return (group?.system?.members ?? [])
    .map(m => m.actor).filter(Boolean)
    .map(actor => ({ actor, token: canvas.scene.tokens.find(t => t.actorId === actor.id) ?? null }));
}

const DARKVISION_SAT = -0.8; // DM 2026-07-03: -0.6 was too colorful; halfway to full gray.
const RING_COLOR_OVER_SUBJECT = 33; // ENABLED(1) | COLOR_OVER_SUBJECT(32)

// The player color assigned to a PC actor (assigned character first, then owner).
function playerColorFor(actor) {
  const u = game.users.find(u => !u.isGM && u.character?.id === actor?.id)
    ?? game.users.find(u => !u.isGM && actor?.testUserPermission?.(u, "OWNER"));
  return u?.color?.css ?? null;
}

// Senses → token sight/detection, shared by deploy, scout release and the
// combat-start sync (2026-07-04: a dispersed PC kept the PROTOTYPE's sight —
// usually range 0 — so Ember walked blind into the dark on the TV; only the
// combat-start sync ever applied real senses). Mirrors syncPartyTokenSight:
// numeric senses.ranges with a "Special Senses" free-text fallback; detection
// modes are a keyed OBJECT in this build (an array write is silently dropped).
export function actorTokenSight(actor) {
  const r = actor?.system?.attributes?.senses?.ranges ?? {};
  const special = String(actor?.system?.attributes?.senses?.special ?? "");
  const fromSpecial = (name) => { const m = special.match(new RegExp(`${name}\\w*\\s*(\\d+)`, "i")); return m ? Number(m[1]) : 0; };
  const dark = (Number(r.darkvision) || 0) || fromSpecial("darkvision");
  const tremor = (Number(r.tremorsense) || 0) || fromSpecial("tremor");
  const blind = (Number(r.blindsight) || 0) || fromSpecial("blindsight");
  const truesight = (Number(r.truesight) || 0) || fromSpecial("truesight");
  const haveVision = (id) => id in (CONFIG.Canvas?.visionModes ?? {});
  const visionMode = (dark > 0 && haveVision("darkvision")) ? "darkvision" : "basic";
  const sight = { enabled: true, range: dark, visionMode, saturation: dark > 0 ? DARKVISION_SAT : 0 };
  const pick = (...ids) => ids.find((id) => id in (CONFIG.Canvas?.detectionModes ?? {}));
  const detectionModes = {};
  const add = (id, range) => { if (id && !(id in detectionModes)) detectionModes[id] = { enabled: true, range }; };
  add(pick("lightPerception", "basicSight"), null);                 // see lit areas
  if (dark > 0) add(pick("basicSight", "lightPerception"), dark);   // darkvision range
  if (tremor > 0) add(pick("feelTremor", "tremorsense", "feeltremor", "senseAll"), tremor);
  if (blind > 0) add(pick("blindsight", "seeAll", "senseAll"), blind);
  if (truesight > 0) add(pick("seeAll", "senseAll", "truesight"), truesight);
  return { sight, detectionModes };
}

// PC token visuals on (re)creation: native dynamic ring in the ASSIGNED player's
// color + COLOR_OVER_SUBJECT (tints the portrait too, DM 2026-07-03) + a 0.1ft
// self-glow so the token keeps color under darkvision ("0.1 is better than
// nothing"). Native ring = exact sync/scale; stock Ring-tab options still apply.
function applyPcVisuals(td, actor) {
  try {
    if (actor?.type !== "character" || !actor.hasPlayerOwner) return;
    const glow = Number(game.settings.get(MODULE_ID, "tokenGlow")) || 0;
    if (glow > 0) td.light = { ...td.light, bright: glow, dim: 0 };
    if (!game.settings.get(MODULE_ID, "ringPlayerColors")) return;
    const color = playerColorFor(actor);
    if (!color) return;
    td.ring = foundry.utils.mergeObject(td.ring ?? {}, {
      enabled: true,
      effects: RING_COLOR_OVER_SUBJECT,
      colors: { ...(td.ring?.colors ?? {}), ring: color }
    });
  } catch (e) { /* cosmetic */ }
}

// Roll request (DM 2026-07-03): the DM's Rolls tool asks a set of actors for an
// ability check or saving throw; each owner's phone gets a tappable card that
// rolls it natively (chat + on-screen dice), and the DM reads the results and does
// the math. Owners offline → the executor rolls for them. Same fan-out as saves.
async function handleRequestRolls({ rollType, ability, actorIds, requesterId }) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  if (!game.users.get(requesterId)?.isGM) return { ok: false, reason: "only the DM requests rolls" };
  const kind = rollType === "check" ? "check" : "save";
  const label = CONFIG.DND5E?.abilities?.[ability]?.label ?? ability;
  let sent = 0, auto = 0;
  for (const id of actorIds ?? []) {
    const actor = game.actors.get(id);
    if (!actor) continue;
    const owners = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
    if (owners.length) {
      const payload = { actorUuid: actor.uuid, rollType: kind, ability, label, ts: Date.now() };
      for (const u of owners) socket.executeAsUser("rollRequest", u.id, payload);
      sent++;
    } else {
      try { kind === "check" ? await actor.rollAbilityCheck({ ability }) : await actor.rollSavingThrow({ ability }); auto++; } catch (e) { /* skip */ }
    }
  }
  return { ok: true, sent, auto };
}

function handleRollRequest(payload) {
  remoteState.rollRequest = payload ?? null;
  Hooks.callAll("mobile-command.rollRequest", payload ?? null);
  return true;
}

// Colour pick (task #18): the DM taps the palette by a player in the Players tab →
// that player's phone shows a full-screen colour picker (replaces its UI). Only
// DM-initiated, so there's no standing "change your colour" for players to abuse.
async function handleRequestColorPick({ userId, requesterId }) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  if (!game.users.get(requesterId)?.isGM) return { ok: false, reason: "only the DM starts a colour pick" };
  const target = game.users.get(userId);
  if (!target) return { ok: false, reason: "unknown player" };
  if (!target.active) return { ok: false, reason: `${target.name} isn't connected` };
  socket.executeAsUser("colorPick", userId, { ts: Date.now() });
  return { ok: true };
}
function handleColorPick() {
  Hooks.callAll("mobile-command.colorPick");
  return true;
}

// Opportunity-attack prompt (aoo.js → the attacker's phone): same relay shape as
// save/roll requests — the shell renders a tappable card.
function handleAoOPromptClient(payload) {
  Hooks.callAll("mobile-command.aooPrompt", payload ?? null);
  return true;
}
export function aooPromptUser(userId, payload) {
  try { return socket?.executeAsUser("aooPrompt", userId, payload); }
  catch (e) { console.warn(`${MODULE_ID} | aooPromptUser failed`, e); return null; }
}

// One-shot: apply current PC visuals (player-color ring + color-over-subject +
// glow + darkvision saturation) to every PC token already on the active scene so
// existing tokens catch up without a repack (DM 2026-07-03). GM: MobileCommand.fixPcTokens().
async function handleFixPcTokens() {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  if (!onActiveScene()) return { ok: false, reason: "the DM isn't on the active scene" };
  const updates = [];
  for (const t of canvas.scene.tokens) {
    const a = t.actor;
    if (a?.type !== "character" || !a.hasPlayerOwner) continue;
    const td = { _id: t.id };
    applyPcVisuals(td, a);
    if ((a.system?.attributes?.senses?.darkvision ?? 0) > 0) td.sight = { ...(td.sight ?? {}), saturation: DARKVISION_SAT };
    if (td.light || td.ring || td.sight) updates.push(td);
  }
  if (updates.length) await canvas.scene.updateEmbeddedDocuments("Token", updates);
  return { ok: true, count: updates.length };
}

async function handlePartyPack({ groupId, requesterId }) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  if (!game.users.get(requesterId)?.isGM) return { ok: false, reason: "only the DM can form up the party" };
  if (!onActiveScene()) return { ok: false, reason: "the DM isn't on the active scene" };
  const group = game.actors.get(groupId);
  if (group?.type !== "group") return { ok: false, reason: "group not found" };

  const mem = partyMembers(group);
  if (!mem.length) return { ok: false, reason: "the group has no members" };
  const missing = mem.filter(m => !m.token).map(m => m.actor.name);
  if (missing.length) return { ok: false, reason: `not on this scene: ${missing.join(", ")}` };

  const g = canvas.scene.grid.size;
  const cellOf = m => ({ col: Math.round(m.token.x / g), row: Math.round(m.token.y / g) });
  const cols = mem.map(m => cellOf(m).col), rows = mem.map(m => cellOf(m).row);
  const minCol = Math.min(...cols), maxCol = Math.max(...cols);
  const minRow = Math.min(...rows), maxRow = Math.max(...rows);
  if (maxCol - minCol > PARTY_GRID - 1 || maxRow - minRow > PARTY_GRID - 1)
    return { ok: false, reason: "party isn't clustered — bring them within a 3×3 first" };

  // Group token = centroid cell = center (1,1) of the 3×3. Pre-fill the formation
  // from the current layout so the editor opens on where they already stand.
  const centerCol = Math.round((minCol + maxCol) / 2), centerRow = Math.round((minRow + maxRow) / 2);
  const cells = {};
  for (const m of mem) {
    const { col, row } = cellOf(m);
    cells[m.actor.id] = {
      r: Math.min(2, Math.max(0, row - (centerRow - 1))),
      c: Math.min(2, Math.max(0, col - (centerCol - 1)))
    };
  }
  const snapshot = Object.fromEntries(mem.map(m => [m.actor.id, { x: m.token.x, y: m.token.y }]));

  // Packed vision: the native group token has none (sight disabled), so the TV
  // would go blind while packed. Give it the party's best sight (§15.1 finding 4).
  const range = Math.max(0,
    ...mem.map(m => m.token.sight?.range ?? 0),
    ...mem.map(m => m.actor.system?.attributes?.senses?.darkvision ?? 0));
  // Honest senses (#10, DM caught full-COLOR vision while packed): if the shared
  // range comes from darkvision, use the darkvision VISION MODE (grayscale) with
  // its core defaults — the packed party sees what its members would, no upgrade.
  const hasDarkvision = mem.some(m => (m.actor.system?.attributes?.senses?.darkvision ?? 0) > 0);
  const dvDefaults = hasDarkvision ? (CONFIG.Canvas?.visionModes?.darkvision?.vision?.defaults ?? {}) : {};
  const glow = Number(game.settings.get(MODULE_ID, "tokenGlow")) || 0;
  const patch = {
    x: centerCol * g, y: centerRow * g, hidden: false,
    // saturation muted (not core's full -1): reads as night vision but keeps color.
    sight: { enabled: true, range, visionMode: hasDarkvision ? "darkvision" : "basic", ...dvDefaults, ...(hasDarkvision ? { saturation: DARKVISION_SAT } : {}) },
    ...(glow > 0 ? { light: { bright: glow, dim: 0 } } : {}),
    disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY
  };
  let gt = canvas.scene.tokens.find(t => t.actorId === group.id);
  if (gt) await gt.update(patch, { animate: false });
  else {
    const [created] = await canvas.scene.createEmbeddedDocuments("Token", [(await group.getTokenDocument(patch)).toObject()]);
    gt = created;
  }

  // Members are linked → delete-and-recreate is lossless (state on the actor).
  await canvas.scene.deleteEmbeddedDocuments("Token", mem.map(m => m.token.id));
  await group.update({
    [`flags.${MODULE_ID}.packed`]: true,
    [`flags.${MODULE_ID}.formation`]: { cells, forward: 0, locked: [], released: [], snapshot, stage: "arrange" }
  });
  return { ok: true };
}

// §17.1 scribe-from-scroll: the phone ASKS; the DM panel chip decides. The
// executor validates and raises a long-lived reaction-widget chip (10 min, not
// a 30s combat window) carrying everything the approve needs. Suggested cost =
// 2 hours + 50 gp per spell level (2024 PHB) — SUGGESTED only, never deducted
// (DM 2026-07-08).
async function handleScribeRequest({ actorId, itemId, requesterId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  const actor = game.actors.get(actorId);
  const user = game.users.get(requesterId);
  if (!actor || !user) return { ok: false, reason: "actor or user not found" };
  if (!user.isGM && !actor.testUserPermission(user, "OWNER")) return { ok: false, reason: "you don't own that character" };
  const item = actor.items.get(itemId);
  if (!item || item.type !== "consumable" || item.system?.type?.value !== "scroll")
    return { ok: false, reason: "that isn't a spell scroll" };
  if (!actor.items.some(i => i.type === "class" && (i.system?.identifier === "wizard" || /^wizard$/i.test(i.name))))
    return { ok: false, reason: "only a wizard can copy scrolls into a spellbook" };
  const castAct = [...(item.system.activities ?? [])].find(a => a.type === "cast" && a.spell?.uuid);
  const spell = castAct ? await fromUuid(castAct.spell.uuid).catch(() => null) : null;
  if (spell?.type !== "spell" || (spell.system?.level ?? 0) < 1) return { ok: false, reason: "the scroll's spell can't be resolved" };
  if (actor.items.some(i => i.type === "spell" && i.name === spell.name)) return { ok: false, reason: `${actor.name} already knows ${spell.name}` };
  const lvl = spell.system.level;
  Hooks.callAll("mobile-command.dmReaction", {
    id: foundry.utils.randomID(),
    kind: "scribe",
    label: `${actor.name.split(" ")[0]} wants to scribe ${spell.name} (L${lvl})`,
    cost: `${2 * lvl}h & ${50 * lvl} gp`,
    actorId, itemId, spellUuid: spell.uuid, userId: requesterId,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
  return { ok: true };
}

// Approve/decline lands back on the player's phone as a toast.
export function scribeResultToUser(userId, payload) {
  const u = game.users.get(userId);
  if (!u?.active || !socket) return;
  socket.executeAsUser("scribeResult", userId, payload).catch(() => {});
}
function handleScribeResult({ ok, spellName, reason }) {
  if (ok) ui.notifications.info(`The DM approved — ${spellName} is in your spellbook (unprepared). The scroll is spent.`);
  else ui.notifications.warn(reason || `The DM declined scribing ${spellName}.`);
}

// Summon control (DM 2026-07-09: "summoned an unseen servant... now I can't
// control the servant"). Summons run on the EXECUTOR as GM, so dnd5e's spawned
// actor never gets player ownership. Executor watcher: a created token whose
// actor carries flags.dnd5e.summon resolves its origin item → summoner actor →
// that PC's player; if the player can't already control the summon, raise a
// DM-GATED chip (the DM's explicit ask: "put a DM gate in the flow") — ✓ grants
// OWNER on the summon's world actor (covers all its tokens; the phone's token
// switcher picks it up on the ownership change), ✕ leaves it DM-driven.
export function registerSummonOwnership() {
  Hooks.on("createToken", (tokenDoc) => {
    try {
      if (!isExecutor()) return;
      const summonFlag = tokenDoc.actor?.flags?.dnd5e?.summon;
      if (!summonFlag?.origin) return;
      const originItem = fromUuidSync(summonFlag.origin);
      const summoner = originItem?.actor ?? originItem?.parent;
      if (!summoner || summoner.type !== "character") return;
      const displayUser = game.settings.get(MODULE_ID, "displayOwnerUser") || null;
      const player = game.users.find(u => !u.isGM && u.id !== displayUser && u.character?.id === summoner.id)
        ?? game.users.find(u => u.active && !u.isGM && u.id !== displayUser && summoner.testUserPermission(u, "OWNER"));
      if (!player) return; // NPC summoner / no player at the table — stays DM-driven
      const baseActor = game.actors.get(tokenDoc.actorId);
      if (!baseActor || baseActor.testUserPermission(player, "OWNER")) return; // already theirs
      Hooks.callAll("mobile-command.dmReaction", {
        id: foundry.utils.randomID(),
        kind: "summon",
        label: `${summoner.name.split(" ")[0]} summoned ${tokenDoc.name} — give ${player.name} control?`,
        actorId: baseActor.id,
        userId: player.id,
        expiresAt: Date.now() + 10 * 60 * 1000
      });
    } catch (e) { console.warn(`${MODULE_ID} | summon-ownership watcher failed`, e); }
  });
}

// §17.4 guard duty: a player toggles their own PC in/out of a watch row.
// State lives on the GROUP actor's `night` flag (updateActor propagates to every
// client, same channel as the marching-order formation). Multi-duty is allowed
// (DM sign-off) — a PC may stand any subset of the three watches.
async function handleNightToggle({ groupId, actorId, watch, requesterId }) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  const group = game.actors.get(groupId);
  if (group?.type !== "group") return { ok: false, reason: "group not found" };
  const night = foundry.utils.deepClone(group.getFlag(MODULE_ID, "night") ?? null);
  if (!night || night.stage !== "assign") return { ok: false, reason: "the watch board isn't open" };
  const actor = game.actors.get(actorId);
  const user = game.users.get(requesterId);
  if (!user?.isGM && !actor?.testUserPermission(user, "OWNER"))
    return { ok: false, reason: "you can only place your own character" };
  if (![1, 2, 3].includes(watch)) return { ok: false, reason: "bad watch" };
  const row = new Set(night.watches?.[watch] ?? []);
  if (row.has(actorId)) row.delete(actorId); else row.add(actorId);
  night.watches = { ...(night.watches ?? {}), [watch]: [...row] };
  await group.setFlag(MODULE_ID, "night", night);
  return { ok: true };
}

async function handlePartySetCell({ groupId, actorId, r, c, lock, requesterId }) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  const group = game.actors.get(groupId);
  if (group?.type !== "group") return { ok: false, reason: "group not found" };
  const actor = game.actors.get(actorId);
  const user = game.users.get(requesterId);
  // A player may place only their own PC; the DM may place anyone.
  if (!user?.isGM && !actor?.testUserPermission(user, "OWNER"))
    return { ok: false, reason: "you can only place your own character" };
  if (!(r >= 0 && r < 3 && c >= 0 && c < 3)) return { ok: false, reason: "bad cell" };
  const formation = foundry.utils.deepClone(group.getFlag(MODULE_ID, "formation") ?? { cells: {}, forward: 0, locked: [] });
  formation.cells[actorId] = { r, c };
  const locked = new Set(formation.locked ?? []);
  if (lock === true) locked.add(actorId); else if (lock === false) locked.delete(actorId);
  formation.locked = [...locked];
  await group.setFlag(MODULE_ID, "formation", formation);
  return { ok: true };
}

// Rotate the party IN the grid (WYSIWYG — the 3×3 mirrors the map, north-up;
// deploy places cells verbatim). §15 Round 8/#9: rotation is now the OUTER-RING
// shift — the 8 cells around the center form a ring and one step = 45°, so
// diagonal facings are first-class. `forward` is 0..7 (N,NE,E,SE,S,SW,W,NW),
// display-only. Ring-baking keeps the red-cell preview aligned 1:1.
const PARTY_RING = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0]]; // CW from NW
function ringRotateCells(cells, steps) {
  const k = ((steps % 8) + 8) % 8;
  if (!k) return cells;
  const idx = new Map(PARTY_RING.map(([r, c], i) => [`${r},${c}`, i]));
  const out = {};
  for (const [id, cell] of Object.entries(cells ?? {})) {
    const i = idx.get(`${cell.r},${cell.c}`);
    if (i === undefined) { out[id] = cell; continue; } // center rides along
    const [r, c] = PARTY_RING[(i + k) % 8];
    out[id] = { r, c };
  }
  return out;
}

async function handlePartySetForward({ groupId, forward, requesterId }) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  if (!game.users.get(requesterId)?.isGM) return { ok: false, reason: "only the DM sets the facing" };
  const group = game.actors.get(groupId);
  if (group?.type !== "group") return { ok: false, reason: "group not found" };
  const formation = foundry.utils.deepClone(group.getFlag(MODULE_ID, "formation") ?? { cells: {}, forward: 0, locked: [] });
  const target = ((Number(forward) % 8) + 8) % 8;
  formation.cells = ringRotateCells(formation.cells, target - (formation.forward ?? 0));
  formation.forward = target;
  await group.setFlag(MODULE_ID, "formation", formation);
  return { ok: true };
}

// Auto-facing (#9): while TRAVELING, every group-token step re-faces the party
// to its movement direction (all 8 directions) and ring-rotates the formation to
// match — Disperse then deploys "right" with zero fiddling (fighter in front,
// facing the way they walked). Executor-only; registered once via initSocket.
const lastGroupPos = new Map();
function registerPartyAutoFacing() {
  Hooks.on("updateToken", (tok, changes) => {
    try {
      if (!isExecutor()) return;
      const a = tok.actor;
      if (a?.type !== "group" || !a.getFlag(MODULE_ID, "packed")) return;
      if (!("x" in changes) && !("y" in changes)) return;
      const prev = lastGroupPos.get(tok.id);
      lastGroupPos.set(tok.id, { x: tok.x, y: tok.y });
      if (!prev) return;
      const f = a.getFlag(MODULE_ID, "formation");
      if ((f?.stage ?? "arrange") !== "travel") return;
      const dx = Math.sign(tok.x - prev.x), dy = Math.sign(tok.y - prev.y);
      const OCT = { "0,-1": 0, "1,-1": 1, "1,0": 2, "1,1": 3, "0,1": 4, "-1,1": 5, "-1,0": 6, "-1,-1": 7 };
      const target = OCT[`${dx},${dy}`];
      if (target === undefined || target === (f.forward ?? 0)) return;
      const nf = foundry.utils.deepClone(f);
      nf.cells = ringRotateCells(nf.cells, target - (nf.forward ?? 0));
      nf.forward = target;
      a.setFlag(MODULE_ID, "formation", nf);
    } catch (e) { /* facing is best-effort */ }
  });
}

// A player changed their colour (via the DM-initiated picker → game.user.update).
// The phone used to repaint its own token ring on the next render, but that write
// storm crashed No-Canvas phones (2026-07-04) — so the executor, which HAS the
// canvas, now owns it: recolour that player's PC token rings when their colour
// changes. Self-gates on executor + active scene.
function registerPlayerColorSync() {
  Hooks.on("updateUser", async (user, changes) => {
    try {
      if (!isExecutor() || !("color" in changes)) return;
      if (!onActiveScene() || !canvas?.ready) return;
      const mine = (a) => user.character?.id === a.id || a.testUserPermission?.(user, "OWNER");
      const updates = [];
      for (const t of canvas.scene.tokens) {
        const a = t.actor;
        if (a?.type !== "character" || !a.hasPlayerOwner || !mine(a)) continue;
        const td = { _id: t.id };
        applyPcVisuals(td, a);
        if (td.light || td.ring) updates.push(td);
      }
      if (updates.length) await canvas.scene.updateEmbeddedDocuments("Token", updates);
    } catch (e) { /* cosmetic */ }
  });
}

// --- Auto-loot: dead NPC → Item Piles loot pile (DESIGN §7.6) --------------------
// Executor-gated. When an NPC token hits 0 HP (or is marked Defeated) and the DM has
// opted in, convert it into a lootable pile so players can loot it from the phone with the
// flow we already built. Idempotent (IP's isValidItemPile guard + an in-flight set); PCs,
// linked tokens (converting one would nuke every token of that actor), tokens already piles,
// and DM-flagged no-loot tokens are all skipped. No-op unless Item Piles is installed.
const autoLootInFlight = new Set();
function itemPilesReady() {
  return !!(game.modules.get("item-piles")?.active && game.itempiles?.API);
}

// The visible "this NPC is dead" marker, applied to a placed token document. Shared by the
// standalone dead-marking path AND the auto-loot tail so they never diverge:
//   1. a skull OVERLAY (the big centred marker, not a corner icon) — it's a token/actor status,
//      so it renders on EVERY client, including the shared-display TV (a per-client blood splatter
//      does not; DM 2026-07-12: "blood shows on DM but not TV");
//   2. force the token VISIBLE — a hidden corpse shows on no player screen, so the skull would be
//      invisible on the TV; we counteract any "dead → hide" automation here;
//   3. drop it from the combat tracker (a corpse doesn't take turns; DM 2026-07-12).
// Idempotent: the skull is only toggled on if not already present.
async function applyDeadMarker(tokenDoc) {
  if (!tokenDoc) return;
  const deadId = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  if (tokenDoc.actor?.toggleStatusEffect && !tokenDoc.actor.statuses?.has?.(deadId)) {
    await tokenDoc.actor.toggleStatusEffect(deadId, { active: true, overlay: true });
  }
  const cbt = game.combat?.combatants?.find(c => c.tokenId === tokenDoc.id);
  if (cbt) await cbt.delete();
  // Force the corpse VISIBLE so the skull shows on player/TV screens. Do it NOW and again after a
  // beat: some death automations set hidden:true AFTER us, so a single check (only if currently
  // hidden) would no-op on a not-yet-hidden token and the corpse would end up invisible
  // (DM 2026-07-13: "players see nothing"). Re-fetch by uuid so the delayed pass sees fresh state.
  const uuid = tokenDoc.uuid;
  const forceVisible = async (phase, notify) => {
    const td = (typeof fromUuidSync === "function" ? fromUuidSync(uuid) : null) ?? tokenDoc;
    if (!td) { const m = `dead marker (${phase}): token GONE (deleted) uuid ${uuid}`; console.log(`${MODULE_ID} | ${m}`); if (notify) ui.notifications?.warn(m); return; }
    // Dump every mechanism that could make a corpse invisible so a "still invisible" report is
    // self-diagnosing: hidden flag, alpha, whether Item Piles converted it, and conditions.
    const isPile = (() => { try { return game.itempiles?.API?.isValidItemPile?.(td) ?? "n/a"; } catch (e) { return "err"; } })();
    const msg = `dead marker (${phase}): "${td.name}" hidden=${td.hidden} alpha=${td.alpha} isPile=${isPile} statuses=[${[...(td.actor?.statuses ?? [])].join(",")}]`;
    console.log(`${MODULE_ID} | ${msg}`);
    if (notify) ui.notifications?.warn(msg); // surface it to the DM without needing the console
    const fix = {};
    if (td.hidden) fix.hidden = false;
    if (Number(td.alpha) < 1) fix.alpha = 1; // a gore/death module may have faded it out
    if (Object.keys(fix).length) await td.update(fix);
  };
  await forceVisible("apply", false);
  setTimeout(() => forceVisible("recheck-400", false).catch(() => {}), 400);
  setTimeout(() => forceVisible("recheck-1500", true).catch(() => {}), 1500); // toast the final state
}

// Standalone dead-marking (no Item Piles / loot required). Resolves the placed token for a dead
// NPC actor and applies the visible marker. Executor-gated; a no-op for non-NPCs.
async function markNpcDead(actor) {
  try {
    if (!isExecutor() || actor?.type !== "npc") return;
    const tokenDoc = actor.token ?? actor.getActiveTokens?.(false, true)?.[0] ?? null;
    await applyDeadMarker(tokenDoc);
  } catch (e) { console.warn(`${MODULE_ID} | mark-dead failed`, e); }
}

// Router for NPC death (0 HP or Defeated). Auto-loot (opt-in, needs Item Piles) both converts the
// corpse to a pile AND marks it dead at its tail; if auto-loot is off, we still drop the visible
// skull when markDeadNpcs is on (default). Either way a dead NPC is unmistakable on every screen.
async function handleNpcDeath(actor) {
  if (!isExecutor() || actor?.type !== "npc") return;
  const al = game.settings.get(MODULE_ID, "autoLootNpcs"), md = game.settings.get(MODULE_ID, "markDeadNpcs");
  const m = `NPC death: ${actor?.name} · autoLoot=${al} · markDead=${md}`;
  console.log(`${MODULE_ID} | ${m}`);
  ui.notifications?.info(m); // if you DON'T see this toast on a kill, the death handler isn't firing
  let handled = false;
  if (game.settings.get(MODULE_ID, "autoLootNpcs") && itemPilesReady()) {
    handled = await maybeAutoLoot(actor);   // converts + marks; false if it wasn't pileable
  }
  if (!handled && game.settings.get(MODULE_ID, "markDeadNpcs")) {
    await markNpcDead(actor);               // plain visible skull (no loot / linked boss / IP absent)
  }
}
async function maybeAutoLoot(actor) {
  // Returns true when this corpse has been handled (converted+marked, already a pile, or in-flight)
  // so the caller can skip the standalone marker; false when it wasn't pileable (linked / no-loot /
  // no token) and should still get a plain dead skull via markNpcDead.
  let uuid = null;
  try {
    if (!isExecutor()) return false;
    if (!game.settings.get(MODULE_ID, "autoLootNpcs")) return false;
    if (!itemPilesReady()) return false;
    if (actor?.type !== "npc") return false;                 // never a PC / group / vehicle
    // Resolve the placed token: unlinked NPCs carry their own token; linked ones may have
    // several on the active scene — only auto-loot UNLINKED corpses (see header).
    const tokenDoc = actor.token ?? actor.getActiveTokens?.(false, true)?.[0] ?? null;
    if (!tokenDoc) return false;
    if (tokenDoc.isLinked) return false;                     // linked boss → mark dead, don't pile
    uuid = tokenDoc.uuid;
    if (autoLootInFlight.has(uuid)) return true;             // another pass is already handling it
    if (tokenDoc.getFlag(MODULE_ID, "noLoot")) return false; // DM opted out of looting → still mark
    const API = game.itempiles.API;
    if (API.isValidItemPile(tokenDoc)) return true;          // already a pile — already handled
    autoLootInFlight.add(uuid);
    const corpseName = tokenDoc.name;
    // Keep the corpse's own art (not IP's treasure-bag icon), label it "(dead)", and force it
    // VISIBLE — the pile was rendering hidden (DM 2026-07-12: "the body is hidden").
    await API.turnTokensIntoItemPiles(tokenDoc, {
      pileSettings: { type: "pile", deleteWhenEmpty: false },
      tokenSettings: {
        name: `${corpseName} (dead)`,
        hidden: false,
        texture: { src: tokenDoc.texture?.src, scaleX: tokenDoc.texture?.scaleX, scaleY: tokenDoc.texture?.scaleY }
      }
    });
    // Visible dead marker + remove from combat (shared with the standalone path). Attacking a
    // corpse is nonsensical, so it's also dropped from the attack picker (see isDeadCorpse).
    try { await applyDeadMarker(tokenDoc); }
    catch (e) { console.warn(`${MODULE_ID} | mark-dead-remove failed`, e); }
    ui.notifications?.info(`${corpseName} is now lootable.`);
    return true;
  } catch (e) {
    console.warn(`${MODULE_ID} | auto-loot failed`, e);
    return false;                                            // fall back to the plain dead marker
  } finally {
    if (uuid) autoLootInFlight.delete(uuid);
  }
}
function registerAutoLoot() {
  // Death by HP: NPC actor updates carry the hp change (on an unlinked token's synthetic actor,
  // or the base actor). Route through handleNpcDeath so the visible skull lands even with auto-loot
  // off / Item Piles absent — the marker is no longer bundled inside the loot feature.
  Hooks.on("updateActor", (actor, changes) => {
    const hp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
    if (hp === undefined || hp === null || hp > 0) return;
    handleNpcDeath(actor);
  });
  // Death by "Defeated" flag (DM marks the combatant dead without zeroing HP).
  Hooks.on("updateCombatant", (combatant, changes) => {
    if (changes?.defeated !== true) return;
    if (combatant?.actor) handleNpcDeath(combatant.actor);
  });
}

// Where each member would land for the current formation + facing, and whether
// that spot is problematic. Executor-local (needs the canvas + walls); the DM
// panel renders it as red cells. why:null = clear. Warnings-not-walls (§11): only
// off-the-map is a hard stop — walls/occupied/stacked are warn-and-deployable.
export function partyDeployPreview(groupId) {
  const group = game.actors.get(groupId);
  if (group?.type !== "group" || !canvas?.ready) return null;
  const formation = group.getFlag(MODULE_ID, "formation") ?? { cells: {}, forward: 0 };
  const gt = canvas.scene.tokens.find(t => t.actorId === group.id);
  if (!gt) return null;
  const g = canvas.scene.grid.size;
  const rect = canvas.dimensions.sceneRect;
  const backend = CONFIG.Canvas.polygonBackends.move;
  const center = { x: gt.x + g / 2, y: gt.y + g / 2 };
  const seen = new Map(); // "gx,gy" -> first occupant's name
  const out = [];
  const releasedIds = new Set(formation.released ?? []);
  for (const actor of (group.system.members ?? []).map(m => m.actor).filter(Boolean)) {
    if (releasedIds.has(actor.id)) continue; // scouts already have a token on the map
    const cell = formation.cells?.[actor.id] ?? { r: 1, c: 1 };
    // Cells are map-space (north-up, rotation baked in by partySetForward), so a
    // grid cell IS the landing offset — red cells align 1:1 with real spots.
    const x = gt.x + (cell.c - 1) * g, y = gt.y + (cell.r - 1) * g;
    const cx = x + g / 2, cy = y + g / 2;
    const key = `${Math.round(x / g)},${Math.round(y / g)}`;
    let why = null, offMap = false;
    if (!rect.contains(cx, cy)) { why = "off the map"; offMap = true; }
    else if (seen.has(key)) why = `stacked on ${seen.get(key)}`;
    else if (backend.testCollision(center, { x: cx, y: cy }, { type: "move", mode: "any" })) why = "behind a wall";
    else if (canvas.scene.tokens.some(t => t.id !== gt.id && t.actorId !== group.id &&
      Math.round(t.x / g) === Math.round(x / g) && Math.round(t.y / g) === Math.round(y / g))) why = "occupied by another token";
    if (!seen.has(key)) seen.set(key, actor.name);
    out.push({ actorId: actor.id, name: actor.name, r: cell.r, c: cell.c, x, y, why, offMap });
  }
  return out;
}

// Packed mode has two stages (DM decision 2026-07-02): "arrange" (players edit the
// grid, Done-locks; no travel) and "travel" (grid is read-only, the move pad drives
// the group token). The DM's "Lock in" flips arrange→travel (their ultimate
// authority over "really done", §15.2#5); "Rearrange" flips back.
async function handlePartyStage({ groupId, stage, requesterId }) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  if (!game.users.get(requesterId)?.isGM) return { ok: false, reason: "only the DM changes the party stage" };
  const group = game.actors.get(groupId);
  if (group?.type !== "group") return { ok: false, reason: "group not found" };
  if (!["arrange", "travel"].includes(stage)) return { ok: false, reason: `unknown stage: ${stage}` };
  const formation = foundry.utils.deepClone(group.getFlag(MODULE_ID, "formation") ?? { cells: {}, forward: 0, locked: [] });
  formation.stage = stage;
  await group.setFlag(MODULE_ID, "formation", formation);
  return { ok: true };
}

// Scout release/combine (#11, DM 2026-07-03): after Lock in the DM can release a
// member to their own token ("the thief scouts ahead") without dispersing; when
// the scout's token is back within 1 square of the party token, Combine reabsorbs
// them. DM-controlled, single group. Released members are skipped by deploy
// (their token is already on the map) and their phones revert to the normal PC UI.
async function handlePartyRelease({ groupId, actorId, requesterId }) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  if (!game.users.get(requesterId)?.isGM) return { ok: false, reason: "only the DM releases a scout" };
  if (!onActiveScene()) return { ok: false, reason: "the DM isn't on the active scene" };
  const group = game.actors.get(groupId);
  if (group?.type !== "group" || !group.getFlag(MODULE_ID, "packed")) return { ok: false, reason: "the party isn't packed" };
  const actor = game.actors.get(actorId);
  if (!actor || !(group.system.members ?? []).some(m => m.actor?.id === actorId)) return { ok: false, reason: "not a member of this party" };
  const formation = foundry.utils.deepClone(group.getFlag(MODULE_ID, "formation") ?? { cells: {}, forward: 0, locked: [] });
  const released = new Set(formation.released ?? []);
  if (released.has(actorId)) return { ok: false, reason: `${actor.name} is already out scouting` };
  const gt = canvas.scene.tokens.find(t => t.actorId === group.id);
  if (!gt) return { ok: false, reason: "the party token is missing" };
  // First free, in-bounds, wall-reachable square around the party; orthogonals first.
  const g = canvas.scene.grid.size;
  const rect = canvas.dimensions.sceneRect;
  const backend = CONFIG.Canvas.polygonBackends.move;
  const center = { x: gt.x + g / 2, y: gt.y + g / 2 };
  let spot = null;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]) {
    const x = gt.x + dx * g, y = gt.y + dy * g, cx = x + g / 2, cy = y + g / 2;
    if (!rect.contains(cx, cy)) continue;
    if (backend.testCollision(center, { x: cx, y: cy }, { type: "move", mode: "any" })) continue;
    if (canvas.scene.tokens.some(t => Math.round(t.x / g) === Math.round(x / g) && Math.round(t.y / g) === Math.round(y / g))) continue;
    spot = { x, y }; break;
  }
  if (!spot) spot = { x: gt.x, y: gt.y }; // boxed in: drop on the party square (warnings-not-walls)
  const std = (await actor.getTokenDocument(spot)).toObject();
  // Real senses, not the prototype's (2026-07-04: scouts were walking blind —
  // prototype sight is usually range 0, so darkvision never reached the token).
  Object.assign(std, actorTokenSight(actor));
  applyPcVisuals(std, actor);
  await canvas.scene.createEmbeddedDocuments("Token", [std]);
  formation.released = [...released, actorId];
  await group.setFlag(MODULE_ID, "formation", formation);
  return { ok: true };
}

async function handlePartyCombine({ groupId, actorId, requesterId }) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  if (!game.users.get(requesterId)?.isGM) return { ok: false, reason: "only the DM combines the party" };
  if (!onActiveScene()) return { ok: false, reason: "the DM isn't on the active scene" };
  const group = game.actors.get(groupId);
  if (group?.type !== "group" || !group.getFlag(MODULE_ID, "packed")) return { ok: false, reason: "the party isn't packed" };
  const formation = foundry.utils.deepClone(group.getFlag(MODULE_ID, "formation") ?? { cells: {}, forward: 0, locked: [] });
  const released = new Set(formation.released ?? []);
  if (!released.has(actorId)) return { ok: false, reason: "they're not out scouting" };
  const gt = canvas.scene.tokens.find(t => t.actorId === group.id);
  const tok = canvas.scene.tokens.find(t => t.actorId === actorId);
  if (gt && tok) {
    const g = canvas.scene.grid.size;
    const dist = Math.max(Math.abs(Math.round((tok.x - gt.x) / g)), Math.abs(Math.round((tok.y - gt.y) / g)));
    if (dist > 1) return { ok: false, reason: `${game.actors.get(actorId)?.name ?? "The scout"} is ${dist} squares away — within 1 to combine` };
    await canvas.scene.deleteEmbeddedDocuments("Token", [tok.id]);
  } // token already gone → just reabsorb
  released.delete(actorId);
  formation.released = [...released];
  await group.setFlag(MODULE_ID, "formation", formation);
  return { ok: true };
}

async function handlePartyDeploy({ groupId, force, requesterId }) {
  if (!isExecutor()) return { ok: false, reason: "not the DM client" };
  if (!game.users.get(requesterId)?.isGM) return { ok: false, reason: "only the DM can disperse the party" };
  if (!onActiveScene()) return { ok: false, reason: "the DM isn't on the active scene" };
  const group = game.actors.get(groupId);
  if (group?.type !== "group") return { ok: false, reason: "group not found" };
  if (!group.getFlag(MODULE_ID, "packed")) return { ok: false, reason: "the party isn't packed" };
  const gt = canvas.scene.tokens.find(t => t.actorId === group.id);
  if (!gt) return { ok: false, reason: "the party token is missing" };

  const preview = partyDeployPreview(groupId);
  if (!preview?.length) return { ok: false, reason: "the group has no members" };
  // Off-map is the one hard stop (a token outside the scene is unreachable).
  const offMap = preview.find(p => p.offMap);
  if (offMap) return { ok: false, reason: "nofit", blocked: preview.filter(p => p.why), detail: `${offMap.name} would land off the map` };
  // Everything else warns; the DM confirms with force (the panel's "Disperse anyway").
  const blocked = preview.filter(p => p.why);
  if (blocked.length && !force) {
    return { ok: false, reason: "nofit", blocked, detail: `Can't deploy while ${blocked[0].name} is ${blocked[0].why} — move them, or Disperse anyway` };
  }

  const tds = [];
  for (const p of preview) {
    const a = game.actors.get(p.actorId);
    const td = (await a.getTokenDocument({ x: p.x, y: p.y })).toObject();
    // Real senses, not the prototype's (2026-07-04: deployed PCs kept prototype
    // sight — usually range 0 — so darkvision members walked blind in the dark
    // until a combat started and syncPartyTokenSight ran). Includes the softened
    // night-vision saturation for darkvision members.
    Object.assign(td, actorTokenSight(a));
    // Native dynamic-ring player colors (Round 10d): NATIVE ring = perfect
    // sync/scale + stock pulse/width options; -0.6 saturation keeps it legible
    // in the dark. (Custom overlays + glow lights were retired.)
    applyPcVisuals(td, a);
    tds.push(td);
  }
  await canvas.scene.createEmbeddedDocuments("Token", tds);
  await canvas.scene.deleteEmbeddedDocuments("Token", [gt.id]);
  await group.update({
    [`flags.${MODULE_ID}.packed`]: false,
    [`flags.${MODULE_ID}.formation.released`]: [] // scouts are simply "out" once dispersed
  });
  return { ok: true, warned: blocked.map(b => ({ name: b.name, why: b.why })) };
}

// --- phone/DM-facing API (any client) ---------------------------------------

function toExecutor(handler, payload) {
  const executorId = resolveExecutorId();
  if (!executorId) return Promise.resolve({ ok: false, stage: "route", reason: "no active DM (GM) client" });
  payload.requesterId = game.user.id;
  if (game.user.id === executorId) {
    const handlers = {
      itemUse: handleItemUse, itemUseStart: handleItemUseStart,
      itemUseDamage: handleItemUseDamage, itemUseCancel: handleItemUseCancel,
      moveRequest: handleMoveRequest, setMovementAction: handleSetMovementAction,
      attackPreview: handleAttackPreview,
      measure: handleMeasure, targetsList: handleTargetsList,
      previewTargets: handlePreviewTargets, endTurn: handleEndTurn, announceCast: handleAnnounceCast,
      listLoot: handleListLoot, openLoot: handleOpenLoot,
      listInteractables: handleListInteractables, operateInteractable: handleOperateInteractable,
      partyJournalAdd: handlePartyJournalAdd, portraitUpload: handlePortraitUpload,
      wildShapeList: handleWildShapeList, wildShapeInto: handleWildShapeInto, wildShapeRevert: handleWildShapeRevert,
      partyPack: handlePartyPack, partySetCell: handlePartySetCell,
      nightToggle: handleNightToggle, scribeRequest: handleScribeRequest,
      placementStart: handlePlacementStart, placementNudge: handlePlacementNudge,
      placementRotate: handlePlacementRotate, placementConfirm: handlePlacementConfirm,
      placementCancel: handlePlacementCancel,
      partySetForward: handlePartySetForward, partyStage: handlePartyStage,
      partyDeploy: handlePartyDeploy, partyRelease: handlePartyRelease,
      partyCombine: handlePartyCombine, fixPcTokens: handleFixPcTokens,
      requestRolls: handleRequestRolls, requestColorPick: handleRequestColorPick,
      downtimePick: handleDowntimePick, downtimeOp: handleDowntimeOp
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
  setMovementAction: (payload) => toExecutor("setMovementAction", payload),
  attackPreview: (payload) => toExecutor("attackPreview", payload),
  measure: (payload) => toExecutor("measure", payload),
  listTargets: (payload) => toExecutor("targetsList", payload),
  previewTargets: (payload) => toExecutor("previewTargets", payload),
  endTurn: (payload) => toExecutor("endTurn", payload),
  announceCast: (payload) => toExecutor("announceCast", payload),
  listLoot: (payload = {}) => toExecutor("listLoot", payload),
  openLoot: (payload = {}) => toExecutor("openLoot", payload),
  listInteractables: (payload = {}) => toExecutor("listInteractables", payload),
  operateInteractable: (payload = {}) => toExecutor("operateInteractable", payload),
  partyJournalAdd: (payload = {}) => toExecutor("partyJournalAdd", payload),
  portraitUpload: (payload = {}) => toExecutor("portraitUpload", payload),
  wildShapeList: (payload = {}) => toExecutor("wildShapeList", payload),
  wildShapeInto: (payload = {}) => toExecutor("wildShapeInto", payload),
  wildShapeRevert: (payload = {}) => toExecutor("wildShapeRevert", payload),
  partyPack: (payload = {}) => toExecutor("partyPack", payload),
  partySetCell: (payload = {}) => toExecutor("partySetCell", payload),
  nightToggle: (payload = {}) => toExecutor("nightToggle", payload),
  scribeRequest: (payload = {}) => toExecutor("scribeRequest", payload),
  placementStart: (payload = {}) => toExecutor("placementStart", payload),
  placementNudge: (payload = {}) => toExecutor("placementNudge", payload),
  placementRotate: (payload = {}) => toExecutor("placementRotate", payload),
  placementConfirm: (payload = {}) => toExecutor("placementConfirm", payload),
  placementCancel: (payload = {}) => toExecutor("placementCancel", payload),
  partySetForward: (payload = {}) => toExecutor("partySetForward", payload),
  partyStage: (payload = {}) => toExecutor("partyStage", payload),
  partyDeploy: (payload = {}) => toExecutor("partyDeploy", payload),
  partyRelease: (payload = {}) => toExecutor("partyRelease", payload),
  partyCombine: (payload = {}) => toExecutor("partyCombine", payload),
  fixPcTokens: (payload = {}) => toExecutor("fixPcTokens", payload),
  requestRolls: (payload = {}) => toExecutor("requestRolls", payload),
  requestColorPick: (payload = {}) => toExecutor("requestColorPick", payload),
  downtimePick: (payload = {}) => toExecutor("downtimePick", payload),
  // §17.7 downtime v2: one entry, dispatched by payload.op (see handleDowntimeOp). The DM panel
  // (a GM = the executor) can call these directly, but routing through the executor keeps writes
  // to `downtimeState` serialized on one client.
  downtime: (payload = {}) => toExecutor("downtimeOp", payload),
  assignTargets: (userId, tokenUuids) =>
    socket
      ? socket.executeAsUser("assignTargets", userId, { tokenUuids, fromName: game.user.name })
      : Promise.resolve({ ok: false, stage: "route", reason: "socketlib unavailable on this client" }),
  state: remoteState
};
