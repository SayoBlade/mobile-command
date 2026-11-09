// Rehearsal R5 (rerun 2) step 103 (2026-11-09): Player1's phone arrows moved the Test Barbarian onto the 12.1 stair.
// The token stopped HALF a square in (1191,1820) and no ask appeared anywhere; the hand said "Nothing to use."
// Causes: (1) the phone's step is run on the DM's client, so core's teleporter (choice: true) paused the token where its
// centre crossed in and put its question to THAT client, not to the player; (2) MC's hand only knew its own travel
// squares (the train), and the house stairs are plain core teleporters. Now a phone step onto an asking teleporter goes
// the whole square as a displacement (core ignores it), the phone asks, and the hand offers it too.
// The stair below is crooked-moon-6x's own: cm-house.js HOUSE_STAIRS + stairBehavior (what the restore wrote there),
// region 1260–1400 / 1820–1960 on a 140 px grid, as the seat lane read it 2026-11-09.
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-house-stair-walk.mjs   (or plain node)
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import fs from "node:fs";
import { installFakeFoundry } from "./fake-foundry.mjs";

const handlers = {}, toUser = [];
let fakeSocketlib;
Object.defineProperty(globalThis, "socketlib", { configurable: true,
  get: () => fakeSocketlib,
  set: (lib) => { fakeSocketlib = { registerModule: (id) => {
    const real = lib.registerModule(id);
    return { ...real, register(name, fn) { handlers[name] = fn; }, executeAsUser: async (name, userId, payload) => { toUser.push({ name, userId, payload }); } };
  } }; } });
const { brekka, store, users } = await installFakeFoundry();
const REPO = new URL("..", import.meta.url);
const rpc = await import(new URL("scripts/rpc.js", REPO));
const house = await import(new URL("scripts/cm-house.js", REPO));

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
globalThis.CONFIG.Canvas = { polygonBackends: { move: { testCollision: () => false } } };

// ── 6x's two stairs between the first and second floors ─────────────────────────────────────────────────────
const G = 140;
const up = house.HOUSE_STAIRS["stair:12.1:up"], down = house.HOUSE_STAIRS["stair:12.2:down"];
const second = { id: "LTGEO7JXWxFvbcIJ", name: "12.2 Second Floor", documentName: "Scene", grid: { size: G }, tokens: [], walls: [] };
second.createEmbeddedDocuments = async (type, list) => { second.tokens.push(...list); return list; };
const stairRegion = (id, st, destUuid, parent) => {
  const b = house.stairBehavior(st.ask, destUuid);
  b.system.destinations = new Set(b.system.destinations); // core 14 stores a SetField
  return { id, name: st.name, parent, documentName: "Region", flags: { "mobile-command": { cm: `x` } }, behaviors: [b],
    shapes: [{ x: st.col * G, y: st.row * G, width: G, height: G }], getFlag: () => undefined };
};
const downReg = stairRegion("down12", down, "Scene.skzmyUz6MM2U4862.Region.up12", second);
const UUID_DOWN = "Scene.LTGEO7JXWxFvbcIJ.Region.down12";
globalThis.fromUuidSync = (u) => (u === UUID_DOWN ? Object.assign(downReg, { uuid: UUID_DOWN }) : game.actors.find(a => a.uuid === u) ?? null);

const scene = game.scenes.active;
Object.assign(scene, { id: "skzmyUz6MM2U4862", name: "12.1 First Floor", grid: { size: G, distance: 5 }, tiles: [] });
scene.walls = Object.assign([], { contents: [] });
const upReg = stairRegion("up12", up, UUID_DOWN, scene);
scene.regions = Object.assign([upReg], { get: (id) => (id === "up12" ? upReg : undefined) });
const tok = scene.tokens.find(t => t.actor === brekka);
const updates = [];
tok.update = async (d, o) => { updates.push({ d, o }); Object.assign(tok, { x: d.x ?? tok.x, y: d.y ?? tok.y }); };
tok.toObject = () => ({ _id: tok.id, name: "Test Barbarian", actorId: brekka.id, x: tok.x, y: tok.y });
tok.delete = async () => { scene.tokens.splice(scene.tokens.indexOf(tok), 1); };
scene.tokens = Object.assign(scene.tokens, { get: (id) => scene.tokens.find(t => t.id === id) });
globalThis.canvas = { scene: { id: "elsewhere" } }; // the DM's camera elsewhere: the pure-data wall test
store.set("playerTier", "basic");
game.paused = false;

check("6x's 12.1 stair is where the seat read it: 1260–1400 / 1820–1960", upReg.shapes[0].x === 1260 && upReg.shapes[0].y === 1820 && upReg.shapes[0].width === 140);
const tq = rpc.teleporterOf(upReg);
check("the stair reads as a travel square: core's own question, its twin as the way", tq?.label === "Go up to the second floor" && tq.dest === UUID_DOWN && tq.choice === true, JSON.stringify(tq));

// ── the seat lane's exact move: placed one square west (1120,1820), then the phone's → ──────────────────────
Object.assign(tok, { x: 1120, y: 1820 });
let res = await asUser("u1", "moveRequest", { tokenId: tok.id, dxGrid: 1, dyGrid: 0 });
check("the step lands the WHOLE square on the stair (1260,1820), not half", res?.ok && tok.x === 1260 && tok.y === 1820, `${JSON.stringify(res)} at ${tok.x},${tok.y}`);
check("…as a displacement, so core's teleporter neither pauses it nor asks the DM's client", updates.at(-1)?.d?.action === "displace");
check("…and the phone is told to ask: 'Go up to the second floor'", res.stepAsk?.regionId === "up12" && res.stepAsk.label === "Go up to the second floor", JSON.stringify(res));
check("nothing crossed, nothing paused, no DM ask yet", scene.tokens.includes(tok) && !second.tokens.length && !game.paused && !(store.get("dmAsks") ?? []).length);

// ── a step inside the stair does not ask again; a step that only touches its edge never asks ────────────────
res = await asUser("u1", "moveRequest", { tokenId: tok.id, dxGrid: 0, dyGrid: 0 });
check("standing on it (a step that stays on it) does not ask twice; the hint still names it", res?.ok && !res.stepAsk && res.travelHere === "Go up to the second floor", JSON.stringify(res));
Object.assign(tok, { x: 1120, y: 1680 });
res = await asUser("u1", "moveRequest", { tokenId: tok.id, dxGrid: 0, dyGrid: 0 });
check("a square that only shares a corner with the stair (1120,1680) is not on it", res?.ok && !res.stepAsk && res.travelHere == null, JSON.stringify(res));
const last = updates.at(-1)?.d;
check("…and an ordinary step stays an ordinary move (no displacement)", last && !("action" in last));

// ── half a square in: the token where R5 left it (1191,1820) ─────────────────────────────────────────────────
check("any overlap counts: a token half a square onto the stair stands on it",
  rpc.travelSquareAt(scene, { x: 1261, y: 1890 }, { x: 1191, y: 1820, width: G, height: G })?.id === "up12"
  && rpc.travelSquareAt(scene, { x: 1250, y: 1890 }, { x: 1180, y: 1820, width: G, height: G })?.id === "up12");
Object.assign(tok, { x: 1191, y: 1820 });
const use = await asUser("u1", "listInteractables", { forActorUuid: brekka.uuid });
check("the hand there offers the stair (was 'Nothing to use.')", use?.ok && use.travel?.length === 1 && use.travel[0].id === "up12" && use.travel[0].label === "Go up to the second floor", JSON.stringify(use));

// ── Basic: Go asks the DM; only his answer moves them ────────────────────────────────────────────────────────
const ask = await asUser("u1", "travelRequest", { regionId: "up12", forActorUuid: brekka.uuid });
const entry = (store.get("dmAsks") ?? [])[0];
check("Go raises the DM's ask (Cancel / Move / Move group) and pauses the game", ask?.ok && ask.pending && game.paused && entry?.label === "Go up to the second floor", JSON.stringify(ask));
check("…and still nothing has moved", scene.tokens.includes(tok) && !second.tokens.length);
{ const own = brekka.testUserPermission; brekka.testUserPermission = (u, l) => !!u?.isGM || own(u, l); } // core: a GM owns everything
const moved = await asUser("gm", "travelDecide", { id: entry.id, choice: "alone" });
check("his 'Move' takes the Barbarian up: on the second floor's stair (1260,1820), gone from the first", moved?.ok && second.tokens.length === 1 && second.tokens[0].x === 1260 && second.tokens[0].y === 1820 && !scene.tokens.includes(tok), JSON.stringify(moved));
check("the phone that asked hears it moved", toUser.some(m => m.userId === "u1" && m.payload?.moved === true));

// ── a train door stays a door: its landing is the travel square, as before ───────────────────────────────────
const trainDoor = { id: "td", name: "Train door — front", behaviors: [{ type: "teleportToken", system: { destinations: new Set([UUID_DOWN]), choice: false } }],
  shapes: [{ x: 0, y: 0, width: G, height: G }], getFlag: (m, k) => (k === "trainDoor" ? "front" : undefined) };
check("a train door is not offered on its own (no double 'Travel to next car')", rpc.travelSquareAt({ regions: [trainDoor] }, { x: 70, y: 70 }) === null);
const off = { ...trainDoor, id: "off", behaviors: [{ type: "teleportToken", disabled: true, system: { destinations: new Set([UUID_DOWN]) } }], getFlag: () => undefined };
check("a switched-off teleporter offers nothing", rpc.teleporterOf(off) === null);

// ── the phone ────────────────────────────────────────────────────────────────────────────────────────────────
const shell = fs.readFileSync(new URL("scripts/shell.js", REPO), "utf8");
check("the phone opens the ask on stepAsk: Complex its own alone/group question, Basic Stay / Go",
  /res\?\.ok && res\.stepAsk\?\.regionId/.test(shell) && /this\.#travelAsk = \{ regionId: res\.stepAsk\.regionId/.test(shell)
  && /data-action="step-stay">Stay</.test(shell) && /data-action="step-go">Go</.test(shell));
check("Go goes the hand's way (#chooseTravel: in Basic, to the DM)", /case "step-go": \{[\s\S]{0,200}this\.#chooseTravel\(ask\.regionId, ask\.label\)/.test(shell));

console.log(`\nall ${n} passed`);
