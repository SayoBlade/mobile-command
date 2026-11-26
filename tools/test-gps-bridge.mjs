// Gambit's Premades on an MC table (DM 2026-11-25: "give it a chance"). scripts/gps-bridge.js + its wiring.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-gps-bridge.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}${detail ? ` — got ${detail}` : ""}`); console.log("Stopped at the first failure."); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const G = await import(pathToFileURL(path.join(ROOT, "scripts", "gps-bridge.js")).href);
const src = (f) => fs.readFileSync(path.join(ROOT, "scripts", f), "utf8");

// ── 1–4. one owner per reaction ─────────────────────────────────────────────────────────────────────
check("GPS off: ours, whatever the choice", ["auto", "ours", "gambit"].every((c) => G.reactionOwner({ active: false, switchOn: true, choice: c }) === "ours"));
check("Automatic: GPS's when its own switch is on, ours when it is off", G.reactionOwner({ active: true, switchOn: true }) === "gambit" && G.reactionOwner({ active: true, switchOn: false }) === "ours");
check("Mobile Command / Gambit's Premades force it either way", G.reactionOwner({ active: true, switchOn: true, choice: "ours" }) === "ours" && G.reactionOwner({ active: true, switchOn: false, choice: "gambit" }) === "gambit");
{
  const store = { "gambits-premades.Enable Opportunity Attack": true, "gambits-premades.Enable Sentinel": false, "mobile-command.gpsReactions": "auto" };
  const g = { modules: { get: (id) => (id === "gambits-premades" ? { active: true } : undefined) }, settings: { get: (ns, k) => { const v = store[`${ns}.${k}`]; if (v === undefined) throw new Error("not registered"); return v; } } };
  const a = G.oursHandles("oa", { g }), b = G.oursHandles("sentinel", { g });
  store["mobile-command.gpsReactions"] = "ours"; const c = G.oursHandles("oa", { g });
  const off = { modules: { get: () => undefined }, settings: { get: () => { throw new Error("no GPS"); } } };
  check("read live: GPS's OA on → ours stands down; its Sentinel off → ours runs; 'ours' wins; no GPS → ours", a === false && b === true && c === true && G.oursHandles("oa", { g: off }) === true, `${a} ${b} ${c}`);
}
// ── 5–9. a phone's reaction item-use goes to the executor ───────────────────────────────────────────
{
  const ran = [];
  const queries = {};
  for (const q of G.GPS_WORKFLOW_QUERIES) queries[`gambits-premades.${q}`] = async (data) => { ran.push(["local", q, data]); return { completed: true, where: "local" }; };
  queries["gambits-premades.rollAsUser"] = async () => "roll";
  const sent = [];
  const executor = { active: true, isSelf: false, query: async (key, data) => { sent.push([key, data]); return { completed: true, where: "executor" }; } };
  let phone = true;
  const took = G.forwardGpsWorkflows({ queries, isPhone: () => phone, executor: () => executor });
  check("the three workflow queries are wrapped (item use, activity use, region escape); a plain roll is not", took === 3 && !queries["gambits-premades.rollAsUser"].__mcForward);
  const data = { itemUuid: "Actor.a.Item.w", actorUuid: "Actor.a", options: { midiOptions: { targetUuids: ["Scene.s.Token.t"] } }, isWeapon: true };
  const r = await queries["gambits-premades.remoteCompleteItemUse"](data, { user: { id: "gm" } });
  check("on a phone: sent to the executor (the same item, actor and targets, fast-forwarded — SEAT 24), and its answer returned to GPS", sent.length === 1 && sent[0][0] === "gambits-premades.remoteCompleteItemUse" && sent[0][1].itemUuid === data.itemUuid && sent[0][1].actorUuid === data.actorUuid && sent[0][1].options.midiOptions === data.options.midiOptions && sent[0][1].options.fastForwardAttack === true && r.where === "executor" && ran.length === 0, JSON.stringify(sent));
  phone = false;
  const r2 = await queries["gambits-premades.gpsActivityUse"]({ x: 1 }, {});
  check("not a phone: GPS's own handler runs here", r2.where === "local" && ran.length === 1 && sent.length === 1);
  phone = true; executor.active = false;
  const r3 = await queries["gambits-premades.useRegionEscape"]({ y: 1 }, {});
  check("no executor connected: it runs where it was asked (GPS's own behaviour)", r3.where === "local" && sent.length === 1);
  check("wrapped once only", G.forwardGpsWorkflows({ queries, isPhone: () => true, executor: () => executor }) === 0 && G.gpsBridgeState.forwarded === 1);
}
// ── 10–12. wiring ────────────────────────────────────────────────────────────────────────────────────
const aoo = src("aoo.js"), main = src("main.js"), settings = src("settings.js");
check("our movement watcher and Sentinel each ask who handles them", /if \(!oursHandles\("oa"\)\) return;/.test(aoo) && /if \(!oursHandles\("sentinel"\)\) return;/.test(aoo));
check("main.js forwards on phones only, inside ready (GPS registers its queries at init)", /if \(isPhoneClient\(\)\) forwardGpsWorkflows\(/.test(main) && main.indexOf("forwardGpsWorkflows({") > main.indexOf('Hooks.once("ready"'));
check("the world setting exists, default Automatic", /register\(MODULE_ID, "gpsReactions"[\s\S]{0,700}default: "auto"/.test(settings));
// ── 13–17. SEAT 22: a GPS question asked mid-roll is waited out, not aborted ─────────────────────────────────────────
check("the wait's deadline: while a question is open it is now + the WHOLE window (SEAT 23: the answer is followed by the roll, the dice and the park); untouched when none is, or past the cap",
  G.extendDeadline(15000, 20000, 0, true, undefined, 15000) === 35000 && G.extendDeadline(15000, 14000, 0, false, undefined, 15000) === 15000
  && G.extendDeadline(15000, G.PROMPT_MAX_MS + 1, 0, true, undefined, 15000) === 15000 && G.extendDeadline(30000, 1000, 0, true, undefined, 15000) === 30000);
{
  // SEAT 23 replayed: the question is answered at 20 s; midi parks at WaitForDamageRoll 6 s later (roll + Dicer's dice)
  let deadline = 15000, parkedSeen = false;
  for (let t = 0; t < 60000; t += 150) {
    deadline = G.extendDeadline(deadline, t, 0, t < 20000, undefined, 15000);
    if (t >= deadline) break;
    if (t >= 26000) { parkedSeen = true; break; }
  }
  check("…so a park 6 s after the answer is still seen (it was missed with 2 s of slack)", parkedSeen === true);
}
{
  let t = 0, open = true;
  const slow = new Promise((r) => setTimeout(() => r("attack rolled"), 120));
  const res = await G.raceWithPrompts(slow, 50, { open: () => open, now: () => (t += 10), tick: 5 }).catch((e) => e.message);
  const fast = await G.raceWithPrompts(new Promise((r) => setTimeout(() => r("late"), 200)), 30, { open: () => false, tick: 5 }).catch((e) => e.message);
  check("the phone keeps waiting while Reckless Attack's question is open, and still gives up when none is", res === "attack rolled" && fast === "request timed out", `${res} / ${fast}`);
}
{
  class User { async query(name) { await new Promise((r) => setTimeout(r, 30)); return { userDecision: true, name }; } }
  check("GPS's reaction-dialog queries are counted while in flight; others are not; wrapped once", G.trackGpsPrompts(User.prototype) === true && G.trackGpsPrompts(User.prototype) === false);
  const u = new User();
  const p = u.query("gambits-premades.process3rdPartyReactionDialog", {});
  const during = G.gpsPromptOpen({ querySelector: () => null });
  const other = u.query("gambits-premades.closeDialogById", {});
  const r = await p; await other;
  const after = G.gpsPromptOpen({ querySelector: () => null });
  const shown = G.gpsPromptOpen({ querySelector: (q) => (q === ".gps-automation-dialog" ? {} : null) });
  check("…open while the question is out or a GPS dialog is on this screen; closed once answered", during === true && after === false && shown === true && r.userDecision === true);
}
{
  const rpc = src("rpc.js"), shell = src("shell.js");
  check("the executor's park wait and the phone's attack wait both use it",
    /while \(\(deadline = extendDeadline\(deadline, Date\.now\(\), start, gpsPromptOpen\(\), undefined, timeoutMs\)\) > Date\.now\(\)\)/.test(rpc)
    && /res = await raceWithPrompts\(rpc\.useActivityStart\(/.test(shell));
}
// ── 18–22. SEAT 22: GPS's opportunity attacks touch only a fight that starts while it is on ───────────────────────────
{
  const hooks = { fns: {}, on(h, f) { (this.fns[h] ??= []).push(f); } };
  const calls = [];
  const gps = { enableOpportunityAttack: async (t, e) => { calls.push(e); return "set up"; } };
  const started = new Set();
  const flagged = [];
  check("the guard wraps GPS once", G.guardGpsOa({ gps, hooks, isGM: () => true, started }) === true && G.guardGpsOa({ gps, hooks, started }) === false);
  const old = { id: "his106", flags: {} };
  const fresh = { id: "test", flags: {}, setFlag: async (m, k, v) => { flagged.push([m, k, v]); fresh.flags[m] = { [k]: v }; } };
  const a = await gps.enableOpportunityAttack(old, "startCombat");
  const b = await gps.enableOpportunityAttack({ parent: old }, "enterCombat");
  check("his fight that was already running: GPS is refused (start and a new combatant)", a === undefined && b === undefined && calls.length === 0);
  hooks.fns.combatStart[0](fresh);
  const c = await gps.enableOpportunityAttack(fresh, "startCombat");
  const d = await gps.enableOpportunityAttack({ parent: fresh }, "enterCombat");
  check("a fight that starts now: GPS sets it up, and the fight is marked for after a reload", c === "set up" && d === "set up" && JSON.stringify(flagged[0]) === '["mobile-command","gpsOa",true]');
  check("after a reload the mark alone lets it through", G.gpsMayTouch({ id: "x", flags: { "mobile-command": { gpsOa: true } } }, { started: new Set() }) === true && G.gpsMayTouch(old, { started: new Set() }) === false);
  const R = (id) => ({ id, uuid: `Scene.s.Region.${id}`, flags: { "gambits-premades": { opportunityAttackRegionMaxRange: 5 } } });
  const scenes = [{ id: "s", regions: [R("keep"), R("his"), R("orphan"), { id: "other", uuid: "Scene.s.Region.other", flags: {} }] }];
  const combats = [
    { id: "test", started: true, ok: true, combatants: [{ id: "c1", regionUuid: "Scene.s.Region.keep" }] },
    { id: "his106", started: true, ok: false, combatants: [{ id: "w", regionUuid: "Scene.s.Region.his" }] },
    { id: "done", started: false, ok: true, combatants: [{ id: "z", regionUuid: "Scene.s.Region.gone" }] }];
  const L = G.oaLeftovers(scenes, combats);
  check("leftovers: GPS regions no allowed running fight points at, and the flags pointing at them; never other regions",
    JSON.stringify(L.regions.map((r) => r.id)) === '["his","orphan"]' && JSON.stringify(L.flags.map((f) => f.combatantId)) === '["w","z"]', JSON.stringify(L));
  const off = G.oaLeftovers(scenes, combats.map((c) => ({ ...c, ok: false, marks: c.id === "his106" ? ["startProcessed-his106"] : [] })));
  check("SEAT 23 (b): with GPS off (ok false everywhere) every GPS region and flag goes, and GPS's mark on his fight too",
    off.regions.length === 3 && off.flags.length === 3 && JSON.stringify(off.marks) === '[{"combatId":"his106","key":"startProcessed-his106"}]', JSON.stringify(off));
  class Combat { constructor(id, flags) { this.id = id; this.flags = flags; } getFlag(scope, key) { return this.flags?.[scope]?.[key]; } }
  const gps2 = { enableOpportunityAttack: async () => "set up" };
  G.guardGpsOa({ gps: gps2, hooks: { on() {} }, started: new Set(["mine"]), combatProto: () => Combat.prototype });
  const his = new Combat("his106", {}), mine = new Combat("mine", {});
  check("SEAT 23 (a): GPS reads its 'already handled' mark as set on his fight (so it never writes it), and as it really is on the fight that started",
    his.getFlag("gambits-premades", "startProcessed-his106") === true && mine.getFlag("gambits-premades", "startProcessed-mine") === undefined
    && his.getFlag("gambits-premades", "opportunityAttackRegion") === undefined && his.getFlag("dnd5e", "x") === undefined);
}
{
  const main = src("main.js");
  check("SEAT 23 (b): the GM's sweep is wired outside the 'GPS is on' block", (() => { const i = main.indexOf("if (gpsActive()) {"); const j = main.indexOf("setTimeout(sweep, 5000)"); const close = main.indexOf("\n  }\n", i); return i > 0 && j > close; })());
check("main.js: prompts tracked, the guard on, and the GM's sweep at load, at a fight's end and on its delete",
    /trackGpsPrompts\(\)/.test(main) && /guardGpsOa\(\)/.test(main) && /setTimeout\(sweep, 5000\)/.test(main) && /Hooks\.on\("deleteCombat", \(\) => setTimeout\(sweep/.test(main));
}
// ── 28–32. SEAT 24: GPS's opportunity attack, forwarded, rolls by itself and never holds the move for ever ───────────
{
  // GPS 3.0.8 opportunityAttack.js: the options it sends to remoteCompleteItemUse
  const gpsOptions = { showFullCard: false, createWorkflow: true, versatile: false, configureDialog: false, targetUuids: ["Scene.s.Token.goblin"],
    workflowOptions: { autoRollDamage: "always", autoRollAttack: true, autoFastDamage: true, disadvantage: true } };
  const data = { itemUuid: "Actor.b.Item.axe", actorUuid: "Actor.b", options: gpsOptions, isWeapon: true };
  const ff = G.fastForwarded("remoteCompleteItemUse", data);
  check("the forwarded opportunity attack is fast-forwarded (attack and damage) and aimed at GPS's targets only; GPS's own choices kept",
    ff.options.workflowOptions.fastForwardAttack === true && ff.options.workflowOptions.fastForwardDamage === true && ff.options.fastForwardAttack === true
    && ff.options.ignoreUserTargets === true && ff.options.workflowOptions.disadvantage === true && ff.options.workflowOptions.autoRollDamage === "always"
    && JSON.stringify(ff.options.targetUuids) === '["Scene.s.Token.goblin"]' && gpsOptions.workflowOptions.fastForwardAttack === undefined);
  check("other queries pass through as sent", G.fastForwarded("gpsActivityUse", { x: 1 }).x === 1 && G.fastForwarded("useRegionEscape", data) === data);
  const queries = { "gambits-premades.remoteCompleteItemUse": async () => "local", "gambits-premades.gpsActivityUse": async () => "local" };
  const sent = [];
  const never = { active: true, isSelf: false, query: (k, d) => { sent.push([k, d]); return new Promise(() => {}); } };
  G.forwardGpsWorkflows({ queries, isPhone: () => true, executor: () => never, timeoutMs: 40 });
  const t0 = Date.now();
  const r = await queries["gambits-premades.remoteCompleteItemUse"](data, {});
  check("a forward that never finishes answers GPS 'not completed' after the timeout, so its region releases the move",
    r.completed === false && r.timedOut === true && Date.now() - t0 < 1000 && sent[0][1].options.workflowOptions.fastForwardAttack === true, JSON.stringify(r));
  const r2 = await queries["gambits-premades.gpsActivityUse"]({ y: 1 }, {});
  check("…and any other forwarded use answers nothing (GPS's own 'no result')", r2 === null);
  const ok = { active: true, isSelf: false, query: async () => ({ completed: true, checkHits: true }) };
  const q2 = { "gambits-premades.remoteCompleteItemUse": async () => "local" };
  G.forwardGpsWorkflows({ queries: q2, isPhone: () => true, executor: () => ok, timeoutMs: 40 });
  check("a forward that finishes returns its real answer", (await q2["gambits-premades.remoteCompleteItemUse"](data, {})).checkHits === true);
}
// ── 33–34. SEAT 24: the save's "DC n Ability save" note leaves the strip once that save is rolled ─────────────────────
{
  const events = [{ kind: "save", text: "DC 20 Wisdom save", actorId: "barb" }, { kind: "save", text: "DC 13 Dex save", actorId: "pet" }, { kind: "damage", text: "17 damage" }, { kind: "save", text: "DC 12 Con save", actorId: null }];
  const kept = G.dropAnsweredSaves(events, "barb");
  check("the barbarian's rolled save drops its own note (and an unresolved one); the pet's still-owed save and the damage stay",
    JSON.stringify(kept.map((e) => e.text)) === '["DC 13 Dex save","17 damage"]');
  const shell = src("shell.js");
  check("shell.js: the note carries its creature, and a save result drops it",
    /kind: "save", text: .*, actorId: askedFor \}\);/.test(shell) && /dropAnsweredSaves\(this\.#combatEvents, rolledActorId\)/.test(shell));
}
// SEAT 32: a Gambit's attack that HITS offers the player "Roll damage" (players roll their own)
{
  const gpsData = { itemUuid: "Actor.b.Item.axe", actorUuid: "Actor.b", isWeapon: true,
    options: { targetUuids: ["Scene.s.Token.goblin"], workflowOptions: { autoRollDamage: "always", autoRollAttack: true, autoFastDamage: true, disadvantage: true } } };
  const wo = G.playerRollWorkflowOptions(gpsData);
  check("the phone's fire keeps GPS's opportunity-attack mark and disadvantage, and drops its auto-rolled damage",
    wo.gps?.opportunityAttack === true && wo.disadvantage === true && !("autoRollDamage" in wo) && !("autoFastDamage" in wo)
    && gpsData.options.workflowOptions.autoRollDamage === "always");
  const atk = { type: "attack", uuid: "A.atk" }, ss = { type: "attack", identifier: "shieldStrike", uuid: "A.ss" };
  const item = { system: { activities: new Map([["u", { type: "utility" }], ["a", atk], ["s", ss]]) }, flags: {}, actor: { getFlag: () => false } };
  check("the attack GPS would run: the item's attack, or the shield strike when GPS marks one",
    G.gpsAttackActivity(item, gpsData) === atk
    && G.gpsAttackActivity({ ...item, flags: { "gambits-premades": { shieldStrike: true } }, actor: { getFlag: () => true } }, gpsData) === ss
    && G.gpsAttackActivity({ system: { activities: new Map() } }) === null);
  check("GPS's answer from the card: a hit is a hit, a miss a miss, a failed fire 'not completed' (its region lets the move go)",
    JSON.stringify(G.playerRollAnswer({ ok: true, hit: true }, { hit: true, reactionUsed: true })) === '{"completed":true,"checkHits":true,"reactionUsed":true}'
    && G.playerRollAnswer({ ok: true, hit: false }, { hit: false }).checkHits === false
    && G.playerRollAnswer({ ok: false }).completed === false);
  const sent = [];
  const ex = { active: true, isSelf: false, query: async (k, d) => { sent.push(k); return { completed: true, checkHits: false }; } };
  const q = { "gambits-premades.remoteCompleteItemUse": async () => "local", "gambits-premades.gpsActivityUse": async () => "local" };
  G.forwardGpsWorkflows({ queries: q, isPhone: () => true, executor: () => ex, timeoutMs: 40, playerRoll: () => async () => ({ completed: true, checkHits: true, reactionUsed: true }) });
  const a1 = await q["gambits-premades.remoteCompleteItemUse"](gpsData, {});
  check("on a phone, GPS's attack goes to the phone's own card, not the DM's screen", a1.checkHits === true && sent.length === 0);
  const q2 = { "gambits-premades.remoteCompleteItemUse": async () => "local" };
  G.forwardGpsWorkflows({ queries: q2, isPhone: () => true, executor: () => ex, timeoutMs: 40, playerRoll: () => async () => null });
  await q2["gambits-premades.remoteCompleteItemUse"](gpsData, {});
  check("…and when the card can't take it (no attack, the player mid-action) it is sent to the DM's screen as before", sent.length === 1);
  const shell = src("shell.js");
  const body = shell.slice(shell.indexOf("async gpsPlayerRoll(data) {"), shell.indexOf("noteAoOPrompt(payload) {"));
  check("the card fires at once at GPS's targets as a reaction; a hit waits for the player's Roll damage, then rolls it for them after 30 s",
    /this\.#assignedTargets = \[\.\.\.\(data\.options\?\.targetUuids \?\? \[\]\)\];/.test(body) && /this\.#reactionFiring = true;/.test(body)
    && /await this\.#fireAction\(\);/.test(body) && /Date\.now\(\) \+ OA_DAMAGE_WAIT_MS/.test(body) && /await this\.#rollDamage\(\);/.test(body)
    && G.OA_DAMAGE_WAIT_MS === 30000 && /globalThis\.mcGpsPlayerRoll = \(data\) => shellInstance\?\.gpsPlayerRoll\(data\) \?\? null;/.test(shell)
    && /if \(s\.gpsWorkflowOptions\) midiOptions\.workflowOptions = s\.gpsWorkflowOptions;/.test(shell));
  check("the DM's screen merges those options, keeping its consume mode and no-target-dialog setting",
    /workflowOptions: \{ autoConsumeResource: consumeMode, targetConfirmation: "none", \.\.\.\(midiOptions\.workflowOptions \?\? \{\}\) \}/.test(src("rpc.js")));
}
// SEAT 34: a finished miss card left on the phone no longer sends the next Gambit's attack to the DM's screen
{
  const shell = src("shell.js");
  const at = shell.indexOf("export function actionCardResolved(s) {");
  const fnSrc = shell.slice(at, shell.indexOf("\n}\n", at) + 2).replace("export function", "function");
  const actionCardResolved = new Function(`${fnSrc}; return actionCardResolved;`)();
  check("a resolved card (a miss or a hit with nothing left to roll; a heal's total) gives way; one choosing, rolling or awaiting damage does not",
    actionCardResolved({ phase: "attacked", requestId: null, busy: false }) === true
    && actionCardResolved({ phase: "healed", busy: false }) === true
    && actionCardResolved({ phase: "attacked", requestId: "r1", busy: false }) === false
    && actionCardResolved({ phase: "rolling", busy: true }) === false
    && actionCardResolved({ phase: undefined, busy: false }) === false
    && actionCardResolved(null) === false);
  check("gpsPlayerRoll takes over only a resolved card, clearing it first",
    /if \(this\.#actionState && !actionCardResolved\(this\.#actionState\)\) return null;\s*if \(this\.#actionState\) \{ this\.#actionState = null; this\.render\(\); \}/.test(shell));
}
// SEAT 35: an opportunity attack that misses resolves at once: miss, then hit, in sequence
{
  const miss = { ok: true, hasAttack: true, hit: false, needsDamage: true, requestId: "r-miss", attackTotal: 7 };
  const hit = { ok: true, hasAttack: true, hit: true, needsDamage: true, requestId: "r-hit", attackTotal: 18 };
  check("a missed opportunity attack (Gambit's or ours) resolves now; a hit, an unknown result, a plain attack and a failed fire do not",
    G.oaMissResolvesNow("Opportunity", miss) === true && G.oaMissResolvesNow("Opportunity", hit) === false
    && G.oaMissResolvesNow("Opportunity", { ...hit, hit: null }) === false && G.oaMissResolvesNow(null, miss) === false
    && G.oaMissResolvesNow("Opportunity", { ok: false }) === false);
  check("…Gambit's hears 'completed, no hit' for the miss (its move finishes), and the following hit's answer is a hit",
    JSON.stringify(G.playerRollAnswer(miss, { hit: false, reactionUsed: true })) === '{"completed":true,"checkHits":false,"reactionUsed":true}'
    && G.playerRollAnswer(hit, { hit: true, reactionUsed: true }).checkHits === true);
  const shell = src("shell.js");
  const fire = shell.slice(shell.indexOf("async #fireAction() {"), shell.indexOf("async #fireAction() {") + 9000);
  check("the card cancels the miss's parked damage, closes, and returns before the damage step; so gpsPlayerRoll skips the 30 s wait",
    /if \(oaMissResolvesNow\(s\.assignedByDM, res\)\) \{\s*if \(res\.requestId\) \{ try \{ await rpc\.useActivityCancel\(\{ requestId: res\.requestId \}\); \}/.test(fire)
    && /s\.requestId = null; s\.busy = false; s\.hit = false;\s*if \(this\.#actionState === s\) \{ this\.#actionState = null; this\.render\(\); \}/.test(fire)
    && fire.indexOf("oaMissResolvesNow(") < fire.indexOf('s.busy = false; s.phase = "attacked";')
    && /if \(res\?\.ok && s\.requestId\) \{/.test(shell));
  check("both paths are marked Opportunity: Gambit's (gpsPlayerRoll) and ours (the Attack card)",
    (shell.match(/this\.#assignedBy = "Opportunity";/g) ?? []).length === 1 && /this\.#assignedBy = p\.moon \? "The Moon" : "Opportunity";/.test(shell)); // the Attack card also carries the Moon's Due redirect
}
console.log(`All ${n} passed.`);
process.exit(0);
