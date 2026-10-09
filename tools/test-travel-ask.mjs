// Headless check of the Basic travel-square ask (DM 2026-10-09: "even in basic, players using a teleporter
// should give the DM the 3 options 'Cancel' 'Move as group' or 'move X only'") — run against
// tools/fake-foundry.mjs, no world, no server:
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-travel-ask.mjs   (or plain node)
//
// The player's ask is delivered the way socketlib delivers it (the real sender stamped on by rpc.js's
// `reg`), the DM's answer as the GM. Numbered expected results, in order; the run STOPS at the first
// failure (CLAUDE.md test protocol).
import { installFakeFoundry } from "./fake-foundry.mjs";

// rpc.js registers its handlers once, at import (initSocket is idempotent), with whatever socketlib the
// fake installs — so wrap that socketlib as it is installed, to keep the handlers and catch pushes.
const handlers = {}, toUser = [];
let fakeSocketlib;
Object.defineProperty(globalThis, "socketlib", { configurable: true,
  get: () => fakeSocketlib,
  set: (lib) => { fakeSocketlib = { registerModule: (id) => {
    const real = lib.registerModule(id);
    return { ...real,
      register(name, fn) { handlers[name] = fn; },
      executeAsUser: async (name, userId, payload) => { toUser.push({ name, userId, payload }); } };
  } }; } });
const { brekka, gorbon, store, users } = await installFakeFoundry();
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

/* ── capture what rpc.js registers, and what it tells the panel / the phone ──────────────────── */
const hooks = [];
let idN = 0; foundry.utils.randomID = () => `id${++idN}`; // the fake has no randomID
globalThis.Hooks.callAll = (name, payload) => { hooks.push({ name, payload }); };
const asUser = (userId, name, payload) => handlers[name].call({ socketdata: { userId } }, payload);
for (const u of users) u.active = true;

/* ── the world: two PCs in car 1, a travel square to car 2 ───────────────────────────────────── */
// A GM has OWNER on everything in real Foundry; the fake's actors only know their player.
for (const a of [brekka, gorbon]) { const own = a.testUserPermission; a.testUserPermission = (u) => u.isGM || own(u); }
const scene = game.scenes.active;
const far = { id: "s2", name: "Car 2", documentName: "Scene", width: 2000, height: 1000, grid: { size: 100 }, tokens: [],
  walls: { contents: [] },
  createEmbeddedDocuments: async (t, docs) => { for (const d of docs) far.tokens.push({ ...d, actor: game.actors.get(d.actorId) }); } };
game.scenes.push(far);
scene.walls = { contents: [] };
const square = { id: "r1", name: "Front", getFlag: (m, k) => (k === "travelPoint" ? { label: "Travel to next car", dest: "Scene.s2" } : undefined) };
scene.regions = Object.assign([square], { get: (id) => (id === "r1" ? square : undefined) });
globalThis.fromUuidSync = (u) => (u === "Scene.s2" ? far : game.actors.find(a => a.uuid === u) ?? null);
for (const t of scene.tokens) {
  t.actorId = t.actor.id;
  t.toObject = () => ({ name: t.actor.name, actorId: t.actor.id, x: t.x, y: t.y });
  t.delete = async () => { scene.tokens = scene.tokens.filter(x => x !== t); };
  t.update = async (d) => Object.assign(t, d);
}
const where = () => scene.tokens.map(t => `${t.actor.name}@${t.x},${t.y}`).join(" ") + " | car2: " + far.tokens.map(t => t.actor.name).join(",");
const before = where();

/* ── BASIC ──────────────────────────────────────────────────────────────────────────────────── */
store.set("playerTier", "basic");
game.paused = false;
let res = await asUser("u1", "travelTo", { regionId: "r1", group: false, forActorUuid: brekka.uuid });
check("Basic: a player's own crossing is refused by the executor (the DM decides)", res?.ok === false && /DM decides/.test(res.reason), JSON.stringify(res));
check("…and nothing moved", where() === before, where());

res = await asUser("u1", "travelRequest", { regionId: "r1", forActorUuid: brekka.uuid });
check("Basic: the ask is accepted as pending", res?.ok === true && res.pending === true, JSON.stringify(res));
check("the ask pauses the game", game.paused === true);
check("the ask moves nobody", where() === before, where());
let chip = hooks.find(h => h.name === "mobile-command.dmReaction")?.payload;
check("the DM panel gets a travel chip naming WHO asked and WHERE", chip?.kind === "travel" && chip.actorName === "Brekka" && chip.travelLabel === "Travel to next car" && chip.userId === "u1", JSON.stringify(chip));
check("a player cannot answer their own ask", (await asUser("u1", "travelDecide", { id: chip.id, choice: "alone" }))?.ok === false && where() === before);

res = await asUser("gm", "travelDecide", { id: chip.id, choice: "cancel" });
check("Cancel: accepted", res?.ok === true && res.cancelled === true, JSON.stringify(res));
check("Cancel: everything exactly as it was — same tokens, same squares", where() === before, where());
check("Cancel: the game unpauses (the pause was the ask's own)", game.paused === false);
check("Cancel: the asking phone hears it was kept", toUser.some(m => m.name === "travelResult" && m.userId === "u1" && m.payload.moved === false));
check("Cancel: the same ask can't be answered twice", (await asUser("gm", "travelDecide", { id: chip.id, choice: "alone" }))?.ok === false);

// A table the DM had ALREADY paused stays paused after a Cancel — the ask didn't put that pause on.
game.paused = true; hooks.length = 0;
await asUser("u1", "travelRequest", { regionId: "r1", forActorUuid: brekka.uuid });
chip = hooks.find(h => h.name === "mobile-command.dmReaction").payload;
await asUser("gm", "travelDecide", { id: chip.id, choice: "cancel" });
check("Cancel on a table he had already paused leaves it paused", game.paused === true);
game.paused = false;

// Pressing again replaces the earlier ask instead of stacking chips.
hooks.length = 0;
await asUser("u1", "travelRequest", { regionId: "r1", forActorUuid: brekka.uuid });
await asUser("u1", "travelRequest", { regionId: "r1", forActorUuid: brekka.uuid });
const chips = hooks.filter(h => h.name === "mobile-command.dmReaction").map(h => h.payload.id);
check("a second press replaces the first ask (the first chip is withdrawn)", chips.length === 2 && hooks.some(h => h.name === "mobile-command.dmReactionGone" && h.payload.id === chips[0]));
check("…and the withdrawn ask can no longer be answered", (await asUser("gm", "travelDecide", { id: chips[0], choice: "alone" }))?.ok === false && where() === before);

res = await asUser("gm", "travelDecide", { id: chips[1], choice: "alone" });
check("Move Brekka: only Brekka crosses", res?.ok === true && res.moved === 1 && far.tokens.map(t => t.actor.name).join() === "Brekka" && scene.tokens.map(t => t.actor.name).join() === "Gorbon", where());
check("Move Brekka: the pause holds — he is about to narrate", game.paused === true);
check("Move Brekka: the asking phone hears it moved", toUser.at(-1)?.name === "travelResult" && toUser.at(-1).payload.moved === true);

game.paused = false; hooks.length = 0;
await asUser("u2", "travelRequest", { regionId: "r1", forActorUuid: gorbon.uuid });
chip = hooks.find(h => h.name === "mobile-command.dmReaction").payload;
check("Gorbon's ask names Gorbon (so 'Move Gorbon' means something)", chip.actorName === "Gorbon" && chip.userId === "u2");
res = await asUser("gm", "travelDecide", { id: chip.id, choice: "group" });
check("Move Group: everyone left in the car crosses", res?.ok === true && scene.tokens.length === 0 && far.tokens.some(t => t.actor.name === "Gorbon"), where());
check("Move Group: the pause holds while he arranges the marching order", game.paused === true);

/* ── COMPLEX ────────────────────────────────────────────────────────────────────────────────── */
// Back to car 1 for Gorbon; Complex keeps the player's own question and never asks the DM.
far.tokens = far.tokens.filter(t => t.actor.name !== "Gorbon");
const g = { id: "tk9", actor: gorbon, actorId: gorbon.id, x: 600, y: 500, width: 1, height: 1, hidden: false, parent: scene,
  toObject: () => ({ name: "Gorbon", actorId: gorbon.id }), delete: async () => { scene.tokens = scene.tokens.filter(x => x !== g); }, update: async () => {} };
scene.tokens.push(g);
store.set("playerTier", "complex");
game.paused = false; hooks.length = 0;
res = await asUser("u2", "travelTo", { regionId: "r1", group: false, forActorUuid: gorbon.uuid });
check("Complex: the player's own crossing goes straight through", res?.ok === true && far.tokens.some(t => t.actor.name === "Gorbon"), JSON.stringify(res));
check("Complex: no DM chip and no pause", !hooks.some(h => h.name === "mobile-command.dmReaction") && game.paused === false);
console.log(`All ${n} passed.`);
