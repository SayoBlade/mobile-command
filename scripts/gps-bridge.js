// Gambit's Premades on a Mobile Command table (DM 2026-11-25: "give it a chance" — GPS 3.0.8 goes ON in crooked-moon-6x).
//
// Read from GPS 3.0.8 on disk (scripts/utils/helpers.js, queryUtils.js, automations/genericFeatures/opportunityAttack.js):
//   - A reaction prompt is `process3rdPartyReactionDialog`, sent with core's `User#query` to `getBrowserUser` =
//     `MidiQOL.playerForActor(actor)` (the player whose ASSIGNED character it is — MC's preflight already checks that), or
//     the primary GM when that player is not connected. It is a framed ApplicationV2 (`AutomationDialog`,
//     `gps-automation-*`), so on a phone shell.js liftDialogAboveShell already lifts it above the shell as a bottom sheet.
//     Nothing to build for the prompt itself.
//   - After "Yes", GPS asks the SAME player's client to run the item: `remoteCompleteItemUse` (opportunity attacks,
//     Sentinel, Counterspell, Mage Slayer…), `gpsActivityUse` and `useRegionEscape`, each a midi `completeItemUse` /
//     `completeActivityUse`. A phone has no canvas (core.noCanvas, main.js D2) and midi resolves tokens through the
//     canvas — the reason every phone action already runs on the executor (Route B). So on a phone those three are
//     handed to the executor (a GM client with the map), which runs GPS's own handler with the same data. GPS's own
//     NPC path (source "gm") does exactly that already. Dice and any dialog then show on the DM's watched screen.
//   - GPS's spell visuals check `canvas.ready` themselves, and a plain `rollAsUser` needs no canvas: left alone.
//
// Where GPS and MC do the same job (opportunity attacks, Sentinel), ONE of them acts: `reactionOwner`. The world
// setting `gpsReactions`: "auto" (default) — GPS's when GPS is on AND its own switch for that reaction is on, else ours;
// "ours" — always ours; "gambit" — never ours while GPS is on. So the DM chooses with GPS's own toggles, no code change.
// Legendary Resistance is deck-command's (its key rim) and is switched there the same way (legres.js gpsOwnsLegres).

export const GPS_ID = "gambits-premades";
/** GPS's own world switch for each reaction MC also handles. */
export const GPS_SWITCH = Object.freeze({ oa: "Enable Opportunity Attack", sentinel: "Enable Sentinel" });
/** GPS user queries that run a midi workflow on the receiving client. */
export const GPS_WORKFLOW_QUERIES = Object.freeze(["remoteCompleteItemUse", "gpsActivityUse", "useRegionEscape"]);
export const REACTION_CHOICES = Object.freeze({ auto: "Automatic", ours: "Mobile Command", gambit: "Gambit's Premades" });

export const gpsBridgeState = { wrapped: [], forwarded: 0, last: "", owner: {} };
try { globalThis.mcGps = gpsBridgeState; } catch (e) { /* no global */ }

/** Who handles this reaction: "gambit" | "ours". Pure. */
export function reactionOwner({ active, switchOn, choice = "auto" } = {}) {
  if (!active) return "ours";
  if (choice === "ours") return "ours";
  if (choice === "gambit") return "gambit";
  return switchOn ? "gambit" : "ours";
}

export function gpsActive(g = globalThis.game) {
  try { return g?.modules?.get?.(GPS_ID)?.active === true; } catch (e) { return false; }
}

function read(g, ns, key, fallback) {
  try { const v = g?.settings?.get?.(ns, key); return v === undefined ? fallback : v; } catch (e) { return fallback; }
}

/** Does Mobile Command handle this reaction kind ("oa" | "sentinel") right now? */
export function oursHandles(kind, { g = globalThis.game, moduleId = "mobile-command" } = {}) {
  const owner = reactionOwner({
    active: gpsActive(g),
    switchOn: read(g, GPS_ID, GPS_SWITCH[kind], false) === true,
    choice: read(g, moduleId, "gpsReactions", "auto"),
  });
  gpsBridgeState.owner[kind] = owner;
  return owner === "ours";
}

/**
 * On a phone, hand GPS's workflow queries to the executor. `queries` = CONFIG.queries; `isPhone()` and `executor()`
 * (a User) are read at call time. Returns how many were wrapped; a second call wraps nothing.
 */
export function forwardGpsWorkflows({ queries = globalThis.CONFIG?.queries, isPhone = () => false, executor = () => null } = {}) {
  if (!queries) return 0;
  let n = 0;
  for (const name of GPS_WORKFLOW_QUERIES) {
    const key = `${GPS_ID}.${name}`;
    const orig = queries[key];
    if (typeof orig !== "function" || orig.__mcForward) continue;
    const wrapped = async function (data, ctx) {
      let ex = null;
      try { ex = isPhone() ? executor() : null; } catch (e) { ex = null; }
      if (ex && ex.active && !ex.isSelf && typeof ex.query === "function") {
        gpsBridgeState.forwarded += 1; gpsBridgeState.last = name;
        return ex.query(key, data);                    // GPS's own handler, on the client with the map
      }
      return orig.call(this, data, ctx);
    };
    wrapped.__mcForward = true;
    queries[key] = wrapped;
    gpsBridgeState.wrapped.push(name);
    n += 1;
  }
  return n;
}

// ── SEAT 22 (2026-11-25): Reckless Attack's "Yes" and then no attack ──────────────────────────────────────────────────
// GPS 3.0.8 recklessAttack2024 asks its question at midi's preAttackRollConfig, i.e. INSIDE the attack roll, and waits up
// to 30 s (+ its Pause button). Our two-tap flow on the executor gave the workflow 15 s to park (rpc.js
// findParkedWorkflow); a workflow still at WaitForAttackRoll after that is read as "the roll died" and ABORTED, so the
// answer came back to a dead workflow: no card, no roll. The phone itself gave up at 30 s. Now both wait while a GPS
// question is open (a `process3rdPartyReactionDialog` query in flight from this client, or a GPS dialog on this screen),
// up to PROMPT_MAX_MS, and their usual windows run on from the answer.
export const PROMPT_MAX_MS = 120000;
export const PROMPT_SLACK_MS = 2000;
const pendingPrompts = new Set();
export const _pendingPrompts = pendingPrompts; // tests

/** Is a GPS question open right now (asked from here, or shown here)? */
export function gpsPromptOpen(doc = globalThis.document) {
  if (pendingPrompts.size) return true;
  try { return !!doc?.querySelector?.(".gps-automation-dialog"); } catch (e) { return false; }
}

/** Count GPS's reaction-dialog queries in flight (core `User#query`). Once only. */
export function trackGpsPrompts(proto = globalThis.CONFIG?.User?.documentClass?.prototype) {
  if (!proto || typeof proto.query !== "function" || proto.query.__mcGpsTrack) return false;
  const orig = proto.query;
  const query = async function (name, ...rest) {
    if (!String(name).startsWith(`${GPS_ID}.process3rdPartyReactionDialog`)) return orig.call(this, name, ...rest);
    const token = {};
    pendingPrompts.add(token);
    try { return await orig.call(this, name, ...rest); } finally { pendingPrompts.delete(token); }
  };
  query.__mcGpsTrack = true;
  proto.query = query;
  return true;
}

/** The wait's new deadline: pushed out while a question is open, never past start + maxMs. Pure. */
export function extendDeadline(deadline, now, start, open, maxMs = PROMPT_MAX_MS) {
  return open ? Math.min(start + maxMs, Math.max(deadline, now + PROMPT_SLACK_MS)) : deadline;
}

/** promise, or "request timed out" after ms — longer while a GPS question is open. */
export function raceWithPrompts(promise, ms, { open = () => gpsPromptOpen(), maxMs = PROMPT_MAX_MS, now = () => Date.now(), tick = 250 } = {}) {
  const start = now();
  let deadline = start + ms;
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setInterval(() => {
      if (done) return;
      deadline = extendDeadline(deadline, now(), start, open(), maxMs);
      if (now() >= deadline) { done = true; clearInterval(timer); reject(new Error("request timed out")); }
    }, tick);
    Promise.resolve(promise).then(
      (v) => { done = true; clearInterval(timer); resolve(v); },
      (e) => { done = true; clearInterval(timer); reject(e); });
  });
}

// ── SEAT 22: GPS's opportunity attacks reached into the DM's other fights ──────────────────────────────────────────────
// GPS processes the first update it sees of ANY started combat (utils/hooks.js updateCombat → enableOpportunityAttack),
// so switching fights put "<name> OA Region" regions and combatant flags on his live 10.6 fight. Now GPS may only set up a
// fight that STARTED while GPS was on (core's combatStart fires before the update GPS reacts to; the mark
// `flags.mobile-command.gpsOa` keeps it across a reload). Leftovers — a GPS OA region no allowed, started fight points at,
// and combatant flags pointing at one — are cleared by the active GM at load, when a fight ends and when one is deleted
// (`clearGpsOa`, also `mcGps.clearOa()`). GPS still writes its own one-time `startProcessed-<id>` mark on an old fight it
// sees; nothing else of it lands there.
export const OA_FLAG = "gpsOa";
const startedHere = new Set();
gpsBridgeState.refused = 0;
gpsBridgeState.cleared = 0;

export function gpsMayTouch(combat, { started = startedHere, moduleId = "mobile-command" } = {}) {
  if (!combat) return false;
  if (started.has(combat.id)) return true;
  try { return combat.flags?.[moduleId]?.[OA_FLAG] === true; } catch (e) { return false; }
}

/** Wrap game.gps.enableOpportunityAttack and mark fights that start. Once only. */
export function guardGpsOa({ gps = globalThis.game?.gps, hooks = globalThis.Hooks, isGM = () => globalThis.game?.user?.isGM === true,
  moduleId = "mobile-command", started = startedHere } = {}) {
  if (!gps || typeof gps.enableOpportunityAttack !== "function" || gps.enableOpportunityAttack.__mcGuard) return false;
  const orig = gps.enableOpportunityAttack;
  const guarded = async function (target, event, ...rest) {
    const combat = event === "enterCombat" ? target?.parent : target;
    if (!gpsMayTouch(combat, { started, moduleId })) { gpsBridgeState.refused += 1; return undefined; }
    return orig.call(this, target, event, ...rest);
  };
  guarded.__mcGuard = true;
  gps.enableOpportunityAttack = guarded;
  hooks?.on?.("combatStart", (combat) => {
    try {
      started.add(combat?.id);
      if (isGM()) combat?.setFlag?.(moduleId, OA_FLAG, true)?.catch?.(() => {});
    } catch (e) { /* a mark only */ }
  });
  return true;
}

const isGpsOaRegion = (r) => r?.flags?.[GPS_ID]?.opportunityAttackRegionMaxRange !== undefined;

/**
 * What to clear. Pure over plain data: scenes [{ id, regions: [{ id, uuid, flags }] }],
 * combats [{ id, started, ok, combatants: [{ id, regionUuid }] }].
 */
export function oaLeftovers(scenes, combats) {
  const keep = new Set();
  for (const c of combats ?? []) if (c.started && c.ok) for (const cb of c.combatants ?? []) if (cb.regionUuid) keep.add(cb.regionUuid);
  const regions = [];
  for (const s of scenes ?? []) for (const r of s.regions ?? []) {
    if (isGpsOaRegion(r) && !keep.has(r.uuid)) regions.push({ sceneId: s.id, id: r.id, uuid: r.uuid });
  }
  const flags = [];
  for (const c of combats ?? []) for (const cb of c.combatants ?? []) {
    if (cb.regionUuid && !keep.has(cb.regionUuid)) flags.push({ combatId: c.id, combatantId: cb.id });
  }
  return { regions, flags };
}

/** The active GM clears GPS OA leftovers. Returns how many documents it touched. */
export async function clearGpsOa(g = globalThis.game, { moduleId = "mobile-command" } = {}) {
  if (!g?.user?.isGM) return 0;
  if (g.users?.activeGM && g.users.activeGM.id !== g.user.id) return 0;
  const scenes = [...(g.scenes ?? [])].map((s) => ({ id: s.id, regions: [...(s.regions ?? [])].map((r) => ({ id: r.id, uuid: r.uuid, flags: r.flags })) }));
  const combats = [...(g.combats ?? [])].map((c) => ({
    id: c.id, started: c.started === true, ok: gpsMayTouch(c, { moduleId }),
    combatants: [...(c.combatants ?? [])].map((cb) => ({ id: cb.id, regionUuid: cb.flags?.[GPS_ID]?.opportunityAttackRegion ?? null })),
  }));
  const { regions, flags } = oaLeftovers(scenes, combats);
  let n = 0;
  const byScene = new Map();
  for (const r of regions) { if (!byScene.has(r.sceneId)) byScene.set(r.sceneId, []); byScene.get(r.sceneId).push(r.id); }
  for (const [sid, ids] of byScene) {
    try { await g.scenes.get(sid)?.deleteEmbeddedDocuments("Region", ids); n += ids.length; } catch (e) { console.warn("mobile-command | GPS OA regions", e); }
  }
  for (const f of flags) {
    try { await g.combats.get(f.combatId)?.combatants?.get(f.combatantId)?.unsetFlag(GPS_ID, "opportunityAttackRegion"); n += 1; } catch (e) { /* gone */ }
  }
  gpsBridgeState.cleared += n;
  if (n) console.log(`mobile-command | cleared ${regions.length} Gambit's opportunity-attack region(s) and ${flags.length} flag(s) from fights it should not touch`);
  return n;
}
gpsBridgeState.clearOa = () => clearGpsOa();
