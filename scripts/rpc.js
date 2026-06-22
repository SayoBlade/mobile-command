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
  const { activityUuid, casterName, spellName, casterTokenUuid, kind, requesterId } = payload;
  const activity = await fromUuid(activityUuid);
  if (!activity) return { ok: false, stage: "resolve", reason: `activity not found: ${activityUuid}` };
  if (!requesterCanAct(requesterId, activity.item?.actor)) {
    return { ok: false, stage: "permission", reason: "requester does not own the acting actor" };
  }
  const id = foundry.utils.randomID();
  pendingCasts.set(id, {
    id, activityUuid, casterTokenUuid, requesterId, ts: Date.now(),
    kind: kind === "summon" ? "summon" : "aoe", // summon → DM places the summoned token(s)
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
  await activity.use({
    midiOptions: {
      autoRollAttack: true, fastForwardAttack: true,
      autoRollDamage: "always", fastForwardDamage: true
    }
  }, {}, {});
  // Don't leave the caster token selected on the executor — the DM rolls the
  // monsters' saves next, and a lingering PC selection slows that (DM 2026-06-17).
  try { canvas.tokens?.releaseAll(); } catch (e) { /* best effort */ }
  return { ok: true };
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

async function findParkedWorkflow(activityUuid, itemUuid, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // midi 14 keeps workflows in a Map keyed by id, stored optionally as WeakRefs
    // (useWeakReferences; midi-qol.js 24336/24347). `Object.values()` on a Map is
    // ALWAYS [], which previously made this scan see nothing and the two-tap fail
    // silently for weapon AND spell (root-caused + fixed live 2026-06-18). Iterate
    // the Map's values and deref. Match by activity uuid, or by item (a scaling
    // spell can cast through a cloned activity whose uuid differs from what we sent).
    const coll = globalThis.MidiQOL?.Workflow?.workflows;
    const all = (coll instanceof Map ? Array.from(coll.values()) : Object.values(coll ?? {}))
      .map(w => (w instanceof WeakRef ? w.deref() : w)).filter(Boolean);
    const wf = all.find(w => w.activity?.uuid === activityUuid
      || (itemUuid && (w.itemUuid === itemUuid || w.activity?.item?.uuid === itemUuid)));
    if (wf) {
      // Parked awaiting a manual damage roll. midi's loop (midi-qol.js:25981) sets
      // wf.suspended=true and breaks, LEAVING currentAction at WaitForDamageRoll —
      // so `suspended` is the reliable signal (a no-attack spell like Magic Missile
      // reaches it the same way an attack does). Gate on damage still pending.
      const awaitingDamage = (wf.suspended || wf.currentAction === wf.WorkflowState_WaitForDamageRoll)
        && wf.needsDamage !== false;
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
async function resolveAttackTotal(wf, timeoutMs = 3000) {
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
  const { activityUuid, targetUuids = [], midiOptions = {}, spellSlot = null, requesterId } = payload;
  const activity = await fromUuid(activityUuid);
  if (!activity) return { ok: false, stage: "resolve", reason: `activity not found: ${activityUuid}` };
  if (!requesterCanAct(requesterId, activity.item?.actor)) {
    return { ok: false, stage: "permission", reason: "requester does not own the acting actor" };
  }
  if (activity.target?.template?.type) return { ok: false, stage: "validate", reason: "area-target activity — use the DM template flow" };
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "the DM isn't on the active scene" };
  markPhoneAction(activity.item?.name, requesterId); // dialog watchdog: arm for this action

  const hasAttack = activity.type === "attack";
  // Upcast: cast at the slot level the phone chose (dnd5e usage config field
  // `spell.slot`, e.g. "spell3"). Omitted → activity casts at its base level.
  const spellCfg = spellSlot ? { spell: { slot: spellSlot } } : {};
  if (spellSlot) console.debug(`${MODULE_ID} | upcast`, { name: activity.item?.name, slot: spellSlot });

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
      ...spellCfg,
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

  const wf = await findParkedWorkflow(activity.uuid, activity.item?.uuid);
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
    return { ok: true, damageTotal: wf.damageTotal ?? null, reason: captured.join("; ") || null };
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
  if (("turn" in changed) || ("round" in changed)) turnMove.delete(combat.combatant?.tokenId);
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

  // Movement budget — only while it's this token's turn in active combat (the
  // green/yellow/red cue is a combat concept; out of combat we just move).
  const onMyTurn = game.combat?.started && game.combat.combatant?.tokenId === tokenId;
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
  const msgIdsBefore = new Set(game.messages.keys());
  try {
    await activity.rollAttack({}, { configure: false }, { create: false, rollMode: CONST.DICE_ROLL_MODES.BLIND });
  } catch (e) { /* non-fatal */ }
  finally {
    Hooks.off("dnd5e.preRollAttackV2", hookId);
    Hooks.off("diceSoNiceRollStart", dsnHook);
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

async function handleTargetsList({ forTokenId }) {
  const refused = requireExecutor("preflight");
  if (refused) return refused;
  if (!onActiveScene()) return { ok: false, stage: "scene", reason: "the DM isn't on the active scene" };

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
  setMovementAction: (payload) => toExecutor("setMovementAction", payload),
  attackPreview: (payload) => toExecutor("attackPreview", payload),
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
