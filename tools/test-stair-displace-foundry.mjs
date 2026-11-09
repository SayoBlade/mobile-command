// Rehearsal R5 rerun 4 step 103 (2026-11-09): the phone asked "Go up to the second floor?", but the token still stopped
// half a square in and core's "Teleport Token" dialog held the move on the GM screen. MC had put `action: "displace"`
// in the update DATA; Foundry 14 builds the movement waypoint from x/y only, so the step went as a walk.
//
// This runs MC's step (rpc.phoneStepUpdate) through FOUNDRY 14'S OWN CODE, read from the installed client files, not a
// stub of it: TokenDocument#preUpdateMovement's waypoint step, #inferMovementWaypoints, #cleanAndValiateMovementWaypoints,
// then TeleportTokenRegionBehaviorType#onTokenMoveIn with those waypoints as `movement.passed`. The functions are cut
// out of the files by name and run with a minimal `this`; private calls (#x) are wired to the other extracted pieces.
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-stair-displace-foundry.mjs   (or plain node)
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import fs from "node:fs";
import path from "node:path";

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}

const APP = process.env.FOUNDRY_APP ?? "C:/Program Files/Foundry Virtual Tabletop 14/resources/app";
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const tokenSrc = read("client/documents/token.mjs");
const teleSrc = read("client/data/region-behaviors/teleport-token.mjs");
const pkg = JSON.parse(read("package.json"));

/** The body of the method whose head is `head` (exact text), by brace matching. */
function body(src, head) {
  const i = src.indexOf(head);
  if (i < 0) throw new Error(`not in the installed Foundry: ${head}`);
  let j = src.indexOf("{", i + head.length - 1), depth = 0, k = j;
  for (; k < src.length; k++) { const c = src[k]; if (c === "{") depth++; else if (c === "}" && --depth === 0) break; }
  return src.slice(j + 1, k);
}
check(`the installed Foundry is generation 14 (${pkg.release?.generation}.${pkg.release?.build})`, pkg.release?.generation === 14);

// ── core's pieces ───────────────────────────────────────────────────────────────────────────────────────────
const isEmpty = (o) => !o || !Object.keys(o).length, deepClone = (o) => JSON.parse(JSON.stringify(o ?? null)), isValidId = () => true;
const logCompatibilityWarning = () => {};
Object.assign(globalThis, { isEmpty, deepClone, isValidId }); // core imports these into token.mjs
globalThis.foundry = { utils: { logCompatibilityWarning } };
globalThis.CONFIG = { Token: { movement: { actions: { walk: {}, fly: {}, swim: {}, burrow: {}, climb: {}, crawl: {}, jump: {}, blink: {}, displace: {} } } } };
const infer = new Function("document", "changes", "operation", body(tokenSrc, "static #inferMovementWaypoints(document, changes, operation) {"));
const VALID = new Set(["x", "y", "elevation", "width", "height", "depth", "shape", "level", "action", "snapped", "explicit", "checkpoint"]);
const cleanSrc = body(tokenSrc, "#cleanAndValiateMovementWaypoints(waypoints, options) {")
  .replaceAll("TokenDocument.#VALID_SHAPES", "VALID_SHAPES").replaceAll("TokenDocument.#VALID_MOVEMENT_WAYPOINT_PROPERTIES", "VALID");
const clean = new Function("VALID_SHAPES", "VALID", "waypoints", "options", cleanSrc);
// #preUpdateMovement up to (not including) the movement id: how core picks this update's waypoints
let pre = body(tokenSrc, "async #preUpdateMovement(changed, options) {");
pre = pre.slice(0, pre.indexOf("// Generate movement ID")) + "\nreturn waypoints;";
pre = pre.replaceAll("TokenDocument.#inferMovementWaypoints", "infer").replaceAll("TokenDocument._isMovementUpdate", "isMove").replaceAll("TokenDocument.MOVEMENT_FIELDS", "FIELDS");
const preUpdate = new Function("infer", "isMove", "FIELDS", "changed", "options", pre);
const FIELDS = ["x", "y", "elevation", "width", "height", "depth", "shape", "level"];
const isMove = (ch) => FIELDS.some((k) => k in ch);

// TeleportTokenRegionBehaviorType's tokenMoveIn handler, private calls wired to recorders
let tele = body(teleSrc, "static async #onTokenMoveIn(event) {")
  .replaceAll("this.#shouldTeleport", "this._shouldTeleport").replaceAll("this.#confirmDialog", "this._confirmDialog").replaceAll("this.#getUsersToPull", "this._pull");
const onTokenMoveIn = new (Object.getPrototypeOf(async function () {}).constructor)("event", "fromUuidSync", "RegionDocument", "game", tele);

// ── 6x's 12.1 stair and the seat lane's token ───────────────────────────────────────────────────────────────
const REPO = new URL("..", import.meta.url);
globalThis.game = { modules: { get: () => null }, settings: { get: () => null }, user: { isGM: true } };
globalThis.Hooks = { on() {}, once() {}, callAll() {} };
globalThis.socketlib = undefined;
const { phoneStepUpdate } = await import(new URL("scripts/rpc.js", REPO));
const doc = { id: "doQUah7uxZQgY2cF", movementAction: "walk", _source: { x: 1120, y: 1820, elevation: 0, width: 1, height: 1, depth: 1, shape: 0, level: "L1" },
  parent: { levels: { has: () => true } } };

class RegionDocument {}
const dest = new RegionDocument(); dest.uuid = "Scene.LTGEO7JXWxFvbcIJ.Region.down"; dest.parent = { id: "S2" };
function run(changes, options, user = { isSelf: true }) {
  const waypoints = clean.call(doc, [0], VALID, preUpdate.call(doc, infer, isMove, FIELDS, { ...changes }, options), options);
  const said = [];
  const token = { pauseMovement: () => said.push("pause"), stopMovement: () => said.push("stop"), resumeMovement: () => said.push("resume"),
    rendered: false, regions: new Set(), _source: { level: "L1" }, parent: { id: "S1" } };
  const behavior = { destinations: new Set([dest.uuid]), choice: true, parent: { uuid: "Region.up.RegionBehavior.b" }, region: {},
    _shouldTeleport: () => true, _confirmDialog: async () => { said.push("dialog"); return false; }, _pull: () => [] };
  const event = { data: { movement: { passed: { waypoints }, id: "m1" }, token }, user };
  return onTokenMoveIn.call(behavior, event, () => dest, RegionDocument, { user: { isGM: true } }).then(() => ({ waypoints, said }));
}
const to = { x: 1260, y: 1820 };

// 2–3. the bug, through core's code: the first fix's update (action in the DATA)
let r = await run({ ...to, action: "displace" }, { animate: false });
check("(rerun 4) action in the update data: core infers a WALK waypoint", r.waypoints.at(-1).action === "walk", JSON.stringify(r.waypoints));
check("(rerun 4) …so core's teleporter pauses the move and opens its dialog on this (the GM's) client", r.said.join(",") === "pause,dialog,resume", r.said.join(","));

// 4–6. the fix: MC's phoneStepUpdate onto a stair
const [ch, op] = phoneStepUpdate(doc, to, true);
r = await run(ch, op);
check("the phone's step onto the stair carries a DISPLACE waypoint to 1260,1820 (the whole square)", r.waypoints.length === 1 && r.waypoints[0].action === "displace" && r.waypoints[0].x === 1260 && r.waypoints[0].y === 1820, JSON.stringify(r.waypoints));
check("core's teleporter does nothing with it: no pause, no 'Teleport Token' dialog, no teleport", r.said.length === 0, r.said.join(","));
check("the update's own x/y still go to 1260,1820, animate off", ch.x === 1260 && ch.y === 1820 && op.animate === false);

// 7. an ordinary phone step stays an ordinary walk
const [ch2, op2] = phoneStepUpdate(doc, { x: 1120, y: 1960 }, false);
r = await run(ch2, op2);
check("an ordinary phone step stays a walk (no movement options, regions behave as always)", !op2.movement && r.waypoints.at(-1).action === "walk");

// 8. a player on a computer dragging onto the stair keeps core's dialog
r = await run({ ...to }, { animate: true, method: "dragging" });
check("a player dragging on the map (a walk) still gets core's own dialog", r.said.includes("dialog"), r.said.join(","));

// 9. the rpc uses it
const rpcSrc = fs.readFileSync(new URL("scripts/rpc.js", REPO), "utf8");
check("handleMoveRequest moves with phoneStepUpdate(…, landed.ask)", rpcSrc.includes("await tokenDoc.update(...phoneStepUpdate(tokenDoc, toRect, !!landed?.ask));"));

console.log(`\nall ${n} passed`);
