// One hero went ahead: the DM may follow from the deck (DM 2026-11-12: "DM will choose who to follow. The current
// behavior allows players to follow, or the DM to choose to follow the lone player."). rpc.js noteAhead /
// handleTravelFollow / aheadLive, actions-asks.js KINDS.ahead.
// Run: node tools/test-travel-follow.mjs   (stops at the first failure)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
const rpc = fs.readFileSync(path.join(ROOT, "scripts", "rpc.js"), "utf8");
const asks = fs.readFileSync(path.join(ROOT, "scripts", "actions-asks.js"), "utf8");
// aheadLive, lifted out and run against a fake world
const src = rpc.slice(rpc.indexOf("export function aheadLive"), rpc.indexOf("async function handleTravelFollow")).replace("export function", "function");
const aheadLive = new Function(`${src}; return aheadLive;`)();
const scene = (id, actorIds) => ({ id, tokens: actorIds.map((a) => ({ actorId: a })) });
const world = (activeId, scenes) => ({ scenes: { active: scenes.find((s) => s.id === activeId), get: (id) => scenes.find((s) => s.id === id) } });
const e = { sceneId: "car2", forActorUuid: "Actor.barb" };
check("split: the table on car 1, the hero on car 2 → the notice is live", aheadLive(e, world("car1", [scene("car1", ["gun"]), scene("car2", ["barb"])])) === true);
check("the table followed (car 2 active) → gone by itself", aheadLive(e, world("car2", [scene("car1", ["gun"]), scene("car2", ["barb"])])) === false);
check("the hero left car 2 → gone", aheadLive(e, world("car1", [scene("car1", ["gun", "barb"]), scene("car2", [])])) === false);
check("only a lone move raises it, after the move, with where he went",
  /if \(res\?\.ok && choice === "alone"\) await noteAhead\(entry, res\);/.test(rpc) && rpc.includes("toId: landing.scene.id"));
check("nobody left behind → no notice (the table already follows the last crossing)", /if \(!partyTokensOn\(active\)\.length\) return;/.test(rpc));
check("Follow activates HIS scene, Stay moves nothing; GM only",
  /only the DM moves the table/.test(rpc) && /if \(choice === "cancel"\) return \{ ok: true, stayed: true \};/.test(rpc) && /if \(!scene\.active\) await scene\.activate\(\);/.test(rpc));
check("the notice adds no pause of its own", !rpc.slice(rpc.indexOf("async function noteAhead"), rpc.indexOf("export function aheadLive")).includes("askTogglePause"));
check("reachable: registered on the executor and on the api", rpc.includes('reg("travelFollow", handleTravelFollow);') && rpc.includes('travelFollow: (payload = {}) => toExecutor("travelFollow", payload)'));
check("the deck's notice: Stay (drawn as the way out) · Follow <Name> with his token art",
  asks.includes('{ id: "cancel", label: "Stay" }') && asks.includes('{ id: "follow", label: `Follow ${who(e)}`, img: tokenArt(e.forActorUuid), token: true }') && asks.includes("went ahead to"));
check("a crossing question comes before an 'ahead' notice; stale notices are filtered out",
  /kindOf\(e\.kind\)\.live\?\.\(e\) \?\? true/.test(asks) && /rank: 1/.test(asks));
console.log(`\nall ${n} passed`);
