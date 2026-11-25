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
  check("on a phone: sent to the executor with the same data, and its answer returned to GPS", sent.length === 1 && sent[0][0] === "gambits-premades.remoteCompleteItemUse" && sent[0][1] === data && r.where === "executor" && ran.length === 0, JSON.stringify(sent));
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
check("the wait's deadline: pushed out while a question is open, never past the cap; untouched when none is",
  G.extendDeadline(15000, 14000, 0, true) === 16000 && G.extendDeadline(15000, 14000, 0, false) === 15000
  && G.extendDeadline(15000, 119000, 0, true) === G.PROMPT_MAX_MS && G.extendDeadline(30000, 1000, 0, true) === 30000);
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
    /while \(\(deadline = extendDeadline\(deadline, Date\.now\(\), start, gpsPromptOpen\(\)\)\) > Date\.now\(\)\)/.test(rpc)
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
}
{
  const main = src("main.js");
  check("main.js: prompts tracked, the guard on, and the GM's sweep at load, at a fight's end and on its delete",
    /trackGpsPrompts\(\)/.test(main) && /guardGpsOa\(\)/.test(main) && /setTimeout\(sweep, 5000\)/.test(main) && /Hooks\.on\("deleteCombat", \(\) => setTimeout\(sweep/.test(main));
}
console.log(`All ${n} passed.`);
process.exit(0);
