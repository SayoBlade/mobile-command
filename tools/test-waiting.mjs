// The one Waiting queue (MC redesign phase 1, DM 2026-11-26: 5A, "don't forget pc dropping to 0hp"):
// everything that waits on the DM, read by the panel floor and the deck's Notifications key ("table.ask") alike.
// actions-asks.js waitingQueue / answerWaiting / waitingItems; the panel's floor and Combat tab (dm-panel.js, by source).
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-waiting.mjs
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
const { A, brekka, gorbon, store, users } = await installFakeFoundry();
const REPO = new URL("..", import.meta.url);
const rpc = await import(new URL("scripts/rpc.js", REPO));
const asks = await import(new URL("scripts/actions-asks.js", REPO));

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
globalThis.Hooks.callAll = () => {};
let idN = 0; foundry.utils.randomID = () => `id${++idN}`;
for (const u of users) u.active = true;
for (const a of game.actors) a.documentName ??= "Actor";
globalThis.fromUuidSync = (u) => game.actors.find((a) => a.uuid === u) ?? null;
const row = () => A.actionSnapshot({ area: "requests" }).find((r) => r.id === "table.ask");
const areaCount = () => A.actionAreas().find((a) => a.id === "requests")?.waiting;
const kinds = () => asks.waitingQueue().map((e) => e.kind).join();
const tick = () => new Promise((r) => setTimeout(r, 5));
game.paused = false;

/* ── 1–2. empty, and the campaign switch ───────────────────────────────────────────────────────────────── */
check("nothing waiting: the queue is empty and the deck's row is off", asks.waitingQueue().length === 0 && row().enabled === false);
store.set("crookedMoonTools", false);
await brekka.setFlag("mobile-command", "twistPending", { die: 20 });
check("a twist with the Crooked Moon tools off does not wait (gated by the same switch)", asks.waitingQueue().length === 0, kinds());

/* ── 3–5. a twist joins the queue and the deck's key ──────────────────────────────────────────────────── */
store.set("crookedMoonTools", true);
let q = asks.waitingQueue();
check("with the tools on, the twist waits: 'Brekka · twist: natural 20', Keep (the way out) then Spend",
  q.length === 1 && q[0].kind === "twist" && q[0].sub.startsWith("Brekka") && q[0].sub.endsWith("twist: natural 20")
  && q[0].choices.map((c) => `${c.id}:${c.label}`).join() === "cancel:Keep,spend:Spend", JSON.stringify(q));
check("…and the deck's Notifications row lights with the same ask", row().enabled === true && row().alert === true && row().sub === q[0].sub && row().ref === q[0].id, JSON.stringify(row()));
await tick();
await gorbon.setFlag("mobile-command", "bargainPending", true);
q = asks.waitingQueue();
check("a bargain joins behind it (first seen, first in line): twist, bargain; the row says '+1 waiting'",
  kinds() === "twist,bargain" && q[1].choices.map((c) => c.id).join() === "cancel,strike" && / · \+1 waiting$/.test(row().sub) && areaCount() === 2, `${kinds()} | ${row().sub} | ${areaCount()}`);

/* ── 6–7. a spell to place ────────────────────────────────────────────────────────────────────────────── */
globalThis.fromUuid = async (u) => (u === "Item.fb.Activity.a1" ? { item: { name: "Fireball", actor: brekka } } : null);
const cast = await handlers.announceCast({ activityUuid: "Item.fb.Activity.a1", casterName: "Brekka Stonefist", spellName: "Fireball", requesterId: "u1" });
q = asks.waitingQueue();
check("a phone's area spell waits too: 'Brekka · place Fireball', Dismiss then Place",
  cast?.ok && q.length === 3 && q[2].kind === "cast" && q[2].sub === "Brekka · place Fireball" && q[2].choices.map((c) => c.label).join() === "Dismiss,Place", JSON.stringify(q[2]));
check("the Requests count follows, each ask counted once: 3 waiting", areaCount() === 3, areaCount());

/* ── 8–10. answer any entry, not only the front ──────────────────────────────────────────────────────── */
let r = await asks.answerWaiting(q[1].id, "cancel");
check("declining the bargain (the second entry) from the panel works without touching the twist in front",
  r === undefined && !gorbon.getFlag("mobile-command", "bargainPending") && gorbon.getFlag("mobile-command", "bargainResult") === "declined" && kinds() === "twist,cast", `${JSON.stringify(r)} ${kinds()}`);
r = await asks.answerWaiting("nope", "cancel");
check("an id that is gone says so (never a silent no-op)", r?.ok === false && /already answered/.test(r.reason));
r = await asks.answerWaiting(asks.waitingQueue()[0].id, "maybe");
check("a choice that is not one of the answers is refused", r?.ok === false && /pick one/.test(r.reason));

/* ── 11. the deck answers the front: Spend ───────────────────────────────────────────────────────────── */
await brekka.setFlag("mobile-command", "twists", 2);
const res = await A.runAction("table.ask", { choice: "spend", ref: row().ref });
check("Spend on the deck's key spends the twist (one token gone, the request cleared); the cast is next",
  res?.ok !== false && brekka.getFlag("mobile-command", "twists") === 1 && !brekka.getFlag("mobile-command", "twistPending") && kinds() === "cast", `${JSON.stringify(res)} ${kinds()}`);

/* ── 12. Dismiss the cast ────────────────────────────────────────────────────────────────────────────── */
await asks.answerWaiting(asks.waitingQueue()[0].id, "cancel");
check("Dismiss drops the cast (the same list the old Combat-tab row read)", rpc.listPendingCasts().length === 0 && asks.waitingQueue().length === 0);

/* ── 13. a struck bargain's curse waits on Accept ────────────────────────────────────────────────────── */
await gorbon.setFlag("mobile-command", "bargainPending", true);
await game.settings.set("mobile-command", "cmLiveState", { curse: { target: gorbon.id, pick: { n: 7, name: "Itchy Ears", text: "…" }, mins: 20 } });
q = asks.waitingQueue();
check("after a strike the curse waits: 'Gorbon · curse: Itchy Ears' with Never mind, Roll again, Accept",
  q.length === 1 && q[0].kind === "curse" && /curse: Itchy Ears$/.test(q[0].sub) && q[0].choices.map((c) => c.label).join() === "Never mind,Roll again,Accept", JSON.stringify(q));
await asks.answerWaiting(q[0].id, "cancel");
await gorbon.unsetFlag("mobile-command", "bargainPending");
await tick();

/* ── 14. another module's ask (the Maim offer when a hero drops to 0 HP) ─────────────────────────────── */
asks.registerAskKind("maim", { sub: (e) => `${e.actorName} · Maim?`, choices: () => [{ id: "cancel", label: "Not now" }, { id: "ok", label: "Maim" }], answer: async () => undefined });
await rpc.raiseOutsideAsk({ id: "maim1", kind: "maim", actorName: "Gorbon" });
q = asks.waitingQueue();
check("the Maim offer waits in the same queue (panel and deck): 'Gorbon · Maim?'", q.length === 1 && q[0].kind === "maim" && q[0].sub === "Gorbon · Maim?" && row().sub === "Gorbon · Maim?", JSON.stringify(q));
await asks.answerWaiting("maim1", "cancel");
check("answered on the panel, it is settled for the deck too", asks.waitingQueue().length === 0 && rpc.pendingAsks().length === 0);

/* ── 16–17. the floor's order (pure) ─────────────────────────────────────────────────────────────────── */
const now = Date.now();
const items = asks.waitingItems({
  reactions: [{ id: "w", kind: "window", expiresAt: now + 5000 }, { id: "o", kind: "aoo", expiresAt: now + 5000 }, { id: "old", kind: "aoo", expiresAt: now - 1 }, { id: "t", kind: "travel", expiresAt: now + 5000 }],
  queue: [{ id: "q1" }], split: [{ scene: { id: "s2" } }] }, now);
check("the floor's order: an opportunity attack, the queue, a split party, then the quiet reaction line",
  items.map((i) => i.type).join() === "aoo,ask,split,window", items.map((i) => i.type).join());
check("an expired chip and the panel's old travel/scribe chips are not drawn twice (the queue owns them)", !items.some((i) => i.r?.id === "old" || i.r?.id === "t"));

/* ── 18–20. the panel, by source ─────────────────────────────────────────────────────────────────────── */
const panel = fs.readFileSync(new URL("scripts/dm-panel.js", REPO), "utf8");
check("the floor draws Waiting right under who is here, above the camera buttons",
  /statusHTML\(\) \+ waitingHTML\(\) \+ onNowHTML\(\) \+ cameraFloorHTML\(\)/.test(panel));
const combat = panel.slice(panel.indexOf("function combatTabHTML()"), panel.indexOf("// --- §40 Boss intro"));
check("the Combat tab no longer holds the split-party chip or the spell-placing list", !/splitParty|pendingHTML|listPendingCasts/.test(combat), combat.slice(0, 300));
check("the floor repaints when the queue changes in any tab (asks, staged curse, twist or bargain flags)",
  /\$\{MODULE_ID\}\.dmAsks`, `\$\{MODULE_ID\}\.cmLiveState`\]\.includes/.test(panel) && /"twistPending", "-=twistPending", "bargainPending", "-=bargainPending"/.test(panel));
console.log(`\nAll ${n} passed.`);
