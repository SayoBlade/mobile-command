// Headless check of "table.ask" — the action-list row the deck answers player asks through (§55.6, after the
// 2026-10-09 live miss: a Basic travel ask paused the game and the DM, on the Stream Deck, saw nothing else).
// Run against tools/fake-foundry.mjs — no world, no server:
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-ask-row.mjs   (or plain node)
//
// Asks arrive the way socketlib delivers them; the deck's side goes through MobileCommand.actions exactly as
// deck-command's world.js mcState()/mcRun() call it. Numbered expected results, in order; the run STOPS at
// the first failure (CLAUDE.md test protocol).
import { installFakeFoundry } from "./fake-foundry.mjs";

const handlers = {};
let fakeSocketlib;
Object.defineProperty(globalThis, "socketlib", { configurable: true,
  get: () => fakeSocketlib,
  set: (lib) => { fakeSocketlib = { registerModule: (id) => {
    const real = lib.registerModule(id);
    return { ...real, register(name, fn) { handlers[name] = fn; }, executeAsUser: async () => {} };
  } }; } });
const { A, brekka, gorbon, store, users } = await installFakeFoundry();
const REPO = new URL("..", import.meta.url);
const rpc = await import(new URL("scripts/rpc.js", REPO));
await import(new URL("scripts/actions-asks.js", REPO));

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}

/* ── the world (as test-travel-ask.mjs): two PCs in a car, a travel square to the Sleeper Car ────────── */
const hooks = [];
let idN = 0; foundry.utils.randomID = () => `id${++idN}`;
globalThis.Hooks.callAll = (name, payload) => { hooks.push({ name, payload }); };
const asUser = (userId, name, payload) => handlers[name].call({ socketdata: { userId } }, payload);
for (const u of users) u.active = true;
for (const a of [brekka, gorbon]) { const own = a.testUserPermission; a.testUserPermission = (u) => u.isGM || own(u); }
const scene = game.scenes.active;
const far = { id: "s2", name: "10.2 Sleeper Car (Colored)", documentName: "Scene", width: 2000, height: 1000, grid: { size: 100 }, tokens: [],
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
const row = () => A.actionSnapshot({ area: "requests" }).find(r => r.id === "table.ask");
const waiting = () => A.actionAreas().find(a => a.id === "requests")?.waiting;
store.set("playerTier", "basic");
game.paused = false;

/* ── nothing pending ───────────────────────────────────────────────────────────────────────────────── */
let r = row();
check("idle: the row is published but disabled — no alert, no sub, no ref, no choices",
  r && r.enabled === false && !r.alert && r.sub === undefined && r.ref === undefined && r.choices.length === 0, JSON.stringify(r));
check("idle: it is a pick in the Requests area, labelled 'Player Asks'", r.kind === "pick" && r.area === "requests" && r.label === "Player Asks" && r.group === "Players asking");
check("idle: running it refuses", (await A.runAction("table.ask", { choice: "cancel" })).ok === false);

/* ── one ask ───────────────────────────────────────────────────────────────────────────────────────── */
await asUser("u1", "travelRequest", { regionId: "r1", forActorUuid: brekka.uuid });
r = row();
check("an ask enables the row and lights it", r.enabled === true && r.alert === true, JSON.stringify(r));
check("the sub names WHO and WHERE: 'Brekka · cross to Sleeper Car'", r.sub === "Brekka · cross to Sleeper Car", r.sub);
check("choices, in order: cancel · alone ('Move Brekka', with token art) · group",
  r.choices.map(c => c.id).join() === "cancel,alone,group" && r.choices[1].label === "Move Brekka"
  && r.choices[1].img === "tokens/a1.webp" && r.choices[0].label === "Cancel" && r.choices[2].label === "Move Group", JSON.stringify(r.choices));
const ref1 = r.ref;
check("ref is the ask's id", ref1 === rpc.pendingAsks()[0]?.id, ref1);
check("the game is paused, and the Requests area counts 1 waiting", game.paused === true && waiting() === 1);

/* ── a second player asks: the queue ───────────────────────────────────────────────────────────────── */
await asUser("u2", "travelRequest", { regionId: "r1", forActorUuid: gorbon.uuid });
r = row();
check("two asks: the row still shows the OLDEST (Brekka) and says +1 waiting", r.ref === ref1 && r.sub === "Brekka · cross to Sleeper Car · +1 waiting", r.sub);
check("two asks: the Requests area counts 2", waiting() === 2, String(waiting()));
const ref2 = rpc.pendingAsks().find(e => e.actorName === "Gorbon").id;
check("a press aimed at another ask (stale ref) is refused and moves nobody",
  (await A.runAction("table.ask", { choice: "alone", ref: ref2 })).ok === false && where() === before, where());
check("a choice that isn't on offer is refused", (await A.runAction("table.ask", { choice: "teleport", ref: ref1 })).ok === false && where() === before);

hooks.length = 0;
let res = await A.runAction("table.ask", { choice: "cancel", ref: ref1 });
check("Cancel Brekka's ask from the deck: accepted, nobody moved", res.ok === true && where() === before, `${JSON.stringify(res)} ${where()}`);
check("…the panel's chip for it is withdrawn", hooks.some(h => h.name === "mobile-command.dmReactionGone" && h.payload.id === ref1));
check("…the game STAYS paused: Gorbon is still waiting on it", game.paused === true);
r = row();
check("…and Gorbon's ask takes the row", r.ref === ref2 && r.sub === "Gorbon · cross to Sleeper Car" && r.choices[1].label === "Move Gorbon", r.sub);
res = await A.runAction("table.ask", { choice: "cancel" });
check("Cancel the last ask (no ref passed — still allowed): the ask's own pause lifts", res.ok === true && game.paused === false && row().enabled === false);

/* ── he paused for his own reason ──────────────────────────────────────────────────────────────────── */
await asUser("u1", "travelRequest", { regionId: "r1", forActorUuid: brekka.uuid });
check("a new ask pauses again", game.paused === true);
// He resumes, then pauses again himself — two pause changes the ask didn't make.
game.togglePause(false); rpc.onPauseGameForAsks(false, { userId: "gm" });
game.togglePause(true); rpc.onPauseGameForAsks(true, { userId: "gm" });
res = await A.runAction("table.ask", { choice: "cancel" });
check("Cancel after HE re-paused leaves his pause alone", res.ok === true && game.paused === true);
game.paused = false;

/* ── a move from the deck ──────────────────────────────────────────────────────────────────────────── */
await asUser("u1", "travelRequest", { regionId: "r1", forActorUuid: brekka.uuid });
res = await A.runAction("table.ask", { choice: "alone", ref: row().ref });
check("Move Brekka from the deck: only Brekka crosses", res.ok === true && far.tokens.map(t => t.actor.name).join() === "Brekka" && scene.tokens.map(t => t.actor.name).join() === "Gorbon", where());
check("…the pause holds (he narrates — the DM's own rule: only Cancel unpauses)", game.paused === true);
// ⚠️ SINCE 2026-11-12 (DM: "or the DM to choose to follow the lone player"): Gorbon is still on the car, so the
// row now offers to follow Brekka (Stay · Follow Brekka) — Stay leaves everyone where they are and the row goes quiet
check("…and the row offers Stay · Follow Brekka (the table waits unless he follows)", row().enabled !== false && /went ahead/.test(row().sub ?? "") && row().choices.map(c => c.label).join() === "Stay,Follow Brekka", JSON.stringify(row()));
res = await A.runAction("table.ask", { choice: "cancel", ref: row().ref });
check("…Stay: nobody moves, and the row goes quiet", res.ok === true && scene.tokens.map(t => t.actor.name).join() === "Gorbon" && row().enabled === false && waiting() === 0, where());

/* ── the exact shape the deck's brief pins ─────────────────────────────────────────────────────────── */
game.paused = false;
await asUser("u2", "travelRequest", { regionId: "r1", forActorUuid: gorbon.uuid });
r = row();
check("row keys are exactly: id area group label icon kind enabled danger alert waiting (the queue's length, SEAT 38) sub ref multi steps choices",
  Object.keys(r).join() === "id,area,group,label,icon,kind,enabled,danger,alert,waiting,sub,ref,multi,steps,choices", Object.keys(r).join()); check("…waiting is the one queue's length: one traveller, 1", r.waiting === 1, String(r.waiting));
check("choice keys: id label (+ img on the alone choice); no on/sub/value",
  r.choices.every(c => Object.entries(c).filter(([, v]) => v !== undefined).map(([k]) => k).join() === (c.id === "alone" ? "id,label,img" : "id,label")));
console.log(`All ${n} passed.`);
