// Rehearsal R2 step 39 (2026-11-09): a player walked the Test Barbarian onto 10.6 Baggage Car's front door with
// the phone's arrows and nothing happened — no pause, no ask, no word on the phone. Cause: WALKING never crosses
// a car door (DM 2026-08-07, DESIGN §37 — "crossing is a deliberate USE on the travel square"); the ask comes from
// the hand in the move pad. The fix makes the step SAY so ("Travel to next car: tap the hand."), and nothing more.
// The geometry below is crooked-moon-6x's own, read from its scenes on disk 2026-11-09.
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-train-door-walk.mjs   (or plain node)
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import fs from "node:fs";
import { installFakeFoundry } from "./fake-foundry.mjs";

const handlers = {};
let fakeSocketlib;
Object.defineProperty(globalThis, "socketlib", { configurable: true,
  get: () => fakeSocketlib,
  set: (lib) => { fakeSocketlib = { registerModule: (id) => {
    const real = lib.registerModule(id);
    return { ...real, register(name, fn) { handlers[name] = fn; }, executeAsUser: async () => {} };
  } }; } });
const { brekka, store, users } = await installFakeFoundry();
const REPO = new URL("..", import.meta.url);
const rpc = await import(new URL("scripts/rpc.js", REPO));

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const asUser = (userId, name, payload) => handlers[name].call({ socketdata: { userId } }, payload);
for (const u of users) { u.active = true; u.getFlag = () => undefined; }
let idN = 0; foundry.utils.randomID = () => `id${++idN}`;
globalThis.Hooks.callAll = () => {};
globalThis.CONST = { WALL_DOOR_TYPES: { DOOR: 1 }, WALL_DOOR_STATES: { CLOSED: 0, OPEN: 1, LOCKED: 2 } };
globalThis.CONFIG.Canvas = { polygonBackends: { move: { testCollision: () => false } } }; // an open aisle

// ── every car's doors and landings in 6x (x, y, w, h; grid 140) ─────────────────────────────────────────────
// [car, door-back, land-back, door-front, land-front]; null = no door that end. 10.1 back is the arcane-locked
// exterior door: a bare region with NO teleport behaviour, so it must offer nothing.
const CARS = [
  ["10.1", [829, 420, 140, 140], [844, 424, 132, 132], [2536, 420, 140, 140], [2524, 424, 132, 132]],
  ["10.2", [963, 420, 140, 140], [984, 564, 132, 132], [2396, 420, 140, 140], [2384, 564, 132, 132]],
  ["10.3", [968, 420, 140, 140], [984, 424, 132, 132], [2393, 420, 140, 140], [2384, 424, 132, 132]],
  ["10.4", [964, 420, 140, 140], [984, 424, 132, 132], [2398, 420, 140, 140], [2384, 564, 132, 132]],
  ["10.5", [963, 420, 140, 140], [984, 424, 132, 132], [2115, 420, 140, 140], [2104, 424, 132, 132]],
  ["10.6", [961, 420, 140, 140], [984, 424, 132, 132], [2112, 420, 140, 140], [2104, 424, 132, 132]],
  ["10.7", [958, 420, 140, 140], [984, 424, 132, 132], [2117, 420, 140, 140], [2104, 424, 132, 132]],
  ["10.8", [549, 420, 140, 140], [564, 424, 132, 132], null, null],
];
const far = { id: "next", name: "Next car", documentName: "Scene", width: 3360, height: 980, grid: { size: 140 }, tokens: [], walls: [] };
const farLand = { id: "farLand", documentName: "Region", parent: far, shapes: [{ x: 984, y: 424, width: 132, height: 132 }] };
globalThis.fromUuidSync = (u) => (u === "Scene.next.Region.farLand" ? farLand : game.actors.find(a => a.uuid === u) ?? null);
const region = (id, name, rect, flags, behaviors = []) => ({
  id, name, flags: { "mobile-command": flags }, behaviors,
  shapes: [{ x: rect[0], y: rect[1], width: rect[2], height: rect[3] }],
  getFlag: (m, k) => flags[k],
});
const tele = [{ type: "teleportToken", disabled: true, system: { destinations: new Set(["Scene.next.Region.farLand"]) } }];
function carRegions([car, db, lb, df, lf]) {
  const out = [];
  if (db) out.push(region(`${car}db`, "Train door — back", db, { trainDoor: "back" }, car === "10.1" ? [] : tele),
    region(`${car}lb`, "Train landing — back", lb, { trainLand: "back" }));
  if (df) out.push(region(`${car}df`, "Train door — front", df, { trainDoor: "front" }, tele),
    region(`${car}lf`, "Train landing — front", lf, { trainLand: "front" }));
  return Object.assign(out, { get: (id) => out.find(r => r.id === id) });
}
const centre = (r) => ({ x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 });

// ── 1–8: the travel square under a point, car by car ────────────────────────────────────────────────────────
for (const c of CARS) {
  const scene = { regions: carRegions(c) };
  const [car, db, lb, df, lf] = c;
  const ends = [["back", db, lb], ["front", df, lf]].filter(([, d]) => d);
  const ok = ends.every(([end, d, l]) => {
    const want = car === "10.1" && end === "back" ? null : "Travel to next car";
    const onDoor = rpc.travelSquareAt(scene, centre(d))?.label ?? null;
    const onLand = rpc.travelSquareAt(scene, centre(l))?.label ?? null;
    return onDoor === want && onLand === want;
  }) && rpc.travelSquareAt(scene, { x: 1680, y: 490 }) === null; // mid-car: nothing
  check(`${car}: standing on a door square or its landing names the way through; mid-car names nothing${car === "10.1" ? "; the locked rear door names nothing" : ""}`, ok);
}

// ── 9–15: R2 step 39 replayed on 10.6, through the phone's own move route ───────────────────────────────────
const scene = game.scenes.active;
scene.grid = { size: 140, distance: 5 };
scene.walls = Object.assign([], { contents: [] });
scene.tiles = [];
scene.regions = carRegions(CARS[5]);
const tok = scene.tokens.find(t => t.actor === brekka);
Object.assign(tok, { x: 1540, y: 560 });
tok.update = async (d) => Object.assign(tok, d);
scene.tokens = Object.assign(scene.tokens, { get: (id) => scene.tokens.find(t => t.id === id) });
globalThis.canvas = { scene: { id: "elsewhere" } }; // the DM's camera is not on the car: the pure-data wall test
store.set("playerTier", "basic");
game.paused = false;

const steps = [[1, -1], [1, 0], [1, 0], [1, 0]]; // up-right, right ×3 (the seat lane's exact presses)
const said = [];
for (const [dx, dy] of steps) said.push(await asUser("u1", "moveRequest", { tokenId: tok.id, dxGrid: dx, dyGrid: dy }));
check("the four steps all land", said.every(r => r?.ok), JSON.stringify(said));
check("the token ends where the seat lane saw it: 2100,420 (on the front door)", tok.x === 2100 && tok.y === 420, `${tok.x},${tok.y}`);
check("the steps before the door say nothing about travel", said.slice(0, 3).every(r => r.travelHere == null), JSON.stringify(said.slice(0, 3)));
check("the step onto the door tells the phone it stands on the way through", said[3].travelHere === "Travel to next car", JSON.stringify(said[3]));
check("walking on did not cross, ask or pause (the DM's 2026-08-07 rule stands)", !game.paused && !(store.get("dmAsks") ?? []).length && scene.tokens.includes(tok));
const use = await asUser("u1", "listInteractables", { forActorUuid: brekka.uuid });
check("the hand (Use) on that square offers the crossing", use?.ok && use.travel?.length === 1 && use.travel[0].id === "10.6lf", JSON.stringify(use));
const ask = await asUser("u1", "travelRequest", { regionId: use.travel[0].id, forActorUuid: brekka.uuid });
check("tapping it raises the DM's ask and pauses the game (step 39's expected result, reached by Use)",
  ask?.ok && ask.pending && game.paused && (store.get("dmAsks") ?? []).length === 1, JSON.stringify(ask));

// ── 16: the phone shows the hint ─────────────────────────────────────────────────────────────────────────────
const shell = fs.readFileSync(new URL("scripts/shell.js", REPO), "utf8");
check("the phone puts the hint over the arrows: '<label>: tap the hand.'", /res\.travelHere\b/.test(shell) && /\$\{res\.travelHere\}: tap the hand\./.test(shell));

console.log(`\nall ${n} passed`);
