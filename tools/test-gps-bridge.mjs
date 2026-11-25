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
console.log(`All ${n} passed.`);
process.exit(0);
