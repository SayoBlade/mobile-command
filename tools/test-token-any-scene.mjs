// A screen's token requests find the token on WHICHEVER scene it is on (SEAT 4 2026-11-16: "token not found:
// dcStageBarb00001" — during the intros the landing room is active and the hero's token sits on 10.1). Drives the real
// executor handlers moveRequest, setMovementAction and targetsList.
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-token-any-scene.mjs   (or plain node)
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import { installFakeFoundry } from "./fake-foundry.mjs";

const handlers = {};
let fakeSocketlib;
Object.defineProperty(globalThis, "socketlib", { configurable: true,
  get: () => fakeSocketlib,
  set: (lib) => { fakeSocketlib = { registerModule: (id) => {
    const real = lib.registerModule(id);
    return { ...real, register(name, fn) { handlers[name] = fn; }, executeAsUser: async () => {} };
  } }; } });
const { brekka, users } = await installFakeFoundry();
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
for (const u of users) u.active = true;

// ── two scenes: the landing room (ACTIVE, no hero) and 10.1 with the stage Barbarian (Maya's, u1) ──────────────
const mkScene = (id, name) => {
  const sc = { id, name, grid: { size: 100, distance: 5 }, walls: { contents: [] }, regions: [], tokens: null };
  const list = [];
  sc.tokens = Object.assign(list, { get: (tid) => list.find((t) => t.id === tid) });
  return sc;
};
const landing = mkScene("sLand", "Landing room"), train = mkScene("s101", "10.1 Passenger Car");
const barb = {
  id: "dcStageBarb00001", name: "Barbarian", actor: brekka, parent: train, x: 1540, y: 280, width: 1, height: 1, hidden: false,
  movementAction: "walk", documentName: "Token", uuid: "Scene.s101.Token.dcStageBarb00001",
  async update(changes) { Object.assign(this, changes); return this; },
};
train.tokens.push(barb);
const scenes = Object.assign([landing, train], { get: (id) => [landing, train].find((s) => s.id === id) });
scenes.active = landing; scenes.viewed = landing;
game.scenes = scenes;
game.paused = false;
globalThis.canvas = { ready: true, scene: landing, tokens: { placeables: [], get: () => undefined, setTargets: () => {} }, grid: { measurePath: () => ({ distance: 5 }) } };
globalThis.CONFIG = { ...(globalThis.CONFIG ?? {}), Token: { movement: { actions: { walk: {}, fly: {}, swim: {} } } }, Canvas: { polygonBackends: { move: { testCollision: () => { throw new Error("canvas collision used for a scene that is not on the canvas"); } } } } };
globalThis.MidiQOL = { canSense: () => true, computeDistance: () => 10 };
globalThis.CONST = { ...(globalThis.CONST ?? {}), TOKEN_DISPLAY_MODES: { NONE: 0, CONTROL: 10, OWNER_HOVER: 20, HOVER: 30, OWNER: 40, ALWAYS: 50 } };
ui.notifications.notify = () => {};

// 1–2: the lookup
users.get("u1").viewedScene = "s101";
check("the lookup finds the hero's token on the asking player's viewed scene (10.1), not only the active one",
  rpc.findTokenDoc("dcStageBarb00001", "u1") === barb && barb.parent === train);
users.get("u1").viewedScene = null;
check("…and on any scene when the viewer's scene is not known", rpc.findTokenDoc("dcStageBarb00001", "u1") === barb);

// 3: a step, while the landing room is active
let r = await asUser("u1", "moveRequest", { tokenId: "dcStageBarb00001", dxGrid: 1, dyGrid: 0, requesterId: "u1" });
check("move: Maya's step moves the 10.1 token one square (its own scene's walls, no canvas needed)", r?.ok === true && barb.x === 1640 && barb.y === 280, JSON.stringify(r));

// 4: a change of how it moves
r = await asUser("u1", "setMovementAction", { tokenId: "dcStageBarb00001", action: "fly", requesterId: "u1" });
check("movement: Maya's pick (fly) lands on the 10.1 token while another scene is active", r?.ok === true && barb.movementAction === "fly", JSON.stringify(r));

// 5–6: targets need the DM's canvas on the hero's scene
r = await asUser("u1", "targetsList", { forTokenId: "dcStageBarb00001", requesterId: "u1" });
check("targets: with the DM's screen on the landing room, the answer says where the hero is (not 'token not found')",
  r?.ok === false && r.stage === "scene" && /10\.1 Passenger Car/.test(r.reason) && !/not found/.test(r.reason), JSON.stringify(r));
const barbObj = { id: barb.id, document: barb, actor: brekka, center: { x: 0, y: 0 } };
barb.object = barbObj;
canvas.scene = train; canvas.tokens.placeables = [barbObj]; canvas.tokens.get = (id) => (id === barb.id ? barbObj : undefined);
r = await asUser("u1", "targetsList", { forTokenId: "dcStageBarb00001", requesterId: "u1" });
check("targets: with the DM's screen on 10.1 (the landing room still active), the list comes back", r?.ok === true && Array.isArray(r.candidates), JSON.stringify(r));

// 7: a token that is nowhere
r = await asUser("u1", "moveRequest", { tokenId: "nobodyHere00000", dxGrid: 1, dyGrid: 0, requesterId: "u1" });
check("a token on no scene at all still answers 'token not found'", r?.ok === false && /token not found: nobodyHere00000/.test(r.reason), JSON.stringify(r));

console.log(`\nall ${n} passed`);
