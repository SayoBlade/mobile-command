// Headless check of the two seams deck-command's Maim offer uses (deck-command D-0197, 2026-11-25):
//   (a) another module's ask on the "table.ask" row (actions-asks.js registerAskKind, rpc.js raiseOutsideAsk/settleOutsideAsk)
//   (b) a choice on one player's phone (rpc.js offerChoice → "choiceOffer" → answerChoice → hook "mobile-command.choiceAnswer")
// Run against tools/fake-foundry.mjs (no world, no server):  node tools/test-outside-ask.mjs
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import { installFakeFoundry } from "./fake-foundry.mjs";

const handlers = {}; const sent = [];
let fakeSocketlib;
Object.defineProperty(globalThis, "socketlib", { configurable: true,
  get: () => fakeSocketlib,
  set: (lib) => { fakeSocketlib = { registerModule: (id) => {
    const real = lib.registerModule(id);
    return { ...real, register(name, fn) { handlers[name] = fn; }, executeAsUser: async (name, userId, payload) => { sent.push({ name, userId, payload }); } };
  } }; } });
const { A, brekka, users } = await installFakeFoundry();
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
const hooks = [];
globalThis.Hooks.callAll = (name, payload) => { hooks.push({ name, payload }); };
const asUser = (userId, name, payload) => handlers[name].call({ socketdata: { userId } }, payload);
for (const u of users) u.active = true;
for (const a of game.actors) a.documentName ??= "Actor"; // as a real Actor is (the fake leaves it out)
globalThis.fromUuidSync = (u) => game.actors.find((a) => a.uuid === u) ?? null;
const row = () => A.actionSnapshot({ area: "requests" }).find((r) => r.id === "table.ask");
game.paused = false;

/* ── (a) another module's ask ─────────────────────────────────────────────────────────────────────── */
const answered = [];
const def = { sub: (e) => `${e.actorName} · Maim?`, choices: (e) => [{ id: "cancel", label: "Not now" }, { id: "ok", label: `Maim ${e.actorName}`, img: "tokens/a1.webp", token: true }],
  answer: async (e, choice) => { answered.push([e.id, choice]); return { ok: true }; } };
check("a module registers its own kind", asks.registerAskKind("dc-maim", def) === true);
check("a built-in kind can't be replaced", asks.registerAskKind("travel", def) === false);
check("a kind without its three functions is refused", asks.registerAskKind("half", { sub: () => "" }) === false);
let r = await rpc.raiseOutsideAsk({ id: "maim-a1", kind: "dc-maim", actorName: "Brekka", actorUuid: brekka.uuid });
check("the executor raises it", r.ok === true && rpc.pendingAsks().some((e) => e.id === "maim-a1"), JSON.stringify(r));
check("no panel chip for it (the panel draws only its own kinds)", !hooks.some((h) => h.name === "mobile-command.dmReaction"));
r = row();
check("the row shows it: sub, the two answers with token art, its ref", r.enabled === true && r.alert === true && r.sub === "Brekka · Maim?"
  && r.choices.map((c) => c.id).join() === "cancel,ok" && r.choices[1].img === "tokens/a1.webp" && r.ref === "maim-a1", JSON.stringify(r));
check("raising the same id again replaces it, never two", (await rpc.raiseOutsideAsk({ id: "maim-a1", kind: "dc-maim", actorName: "Brekka" })).ok && rpc.pendingAsks().filter((e) => e.id === "maim-a1").length === 1);
const res = await A.runAction("table.ask", { choice: "ok", ref: "maim-a1" });
check("answered from the deck: the module's answer runs with that choice", res.ok === true && answered.length === 1 && answered[0].join() === "maim-a1,ok", JSON.stringify(res));
check("…and the ask is settled", !rpc.pendingAsks().some((e) => e.id === "maim-a1") && row().enabled === false);
check("the game's pause is not MC's to change for it", game.paused === false);
await rpc.raiseOutsideAsk({ id: "maim-a2", kind: "dc-maim", actorName: "Brekka" });
check("the module can settle its own ask (the PC healed)", (await rpc.settleOutsideAsk("maim-a2")).ok && !rpc.pendingAsks().some((e) => e.id === "maim-a2"));

/* ── (b) a choice on the player's phone ───────────────────────────────────────────────────────────── */
const owner = users.find((u) => !u.isGM && brekka.testUserPermission(u, "OWNER"));
check("(fixture) Brekka has a player owner", Boolean(owner));
sent.length = 0;
const choices = [{ id: "maim", label: "Roll Maim", roll: "1d100", flavor: "Maim" }, { id: "saves", label: "Take death saves" }];
check("only the DM offers a choice", (await asUser(owner.id, "offerChoice", { actorUuid: brekka.uuid, ref: "m1", choices })).ok === false);
r = await asUser("gm", "offerChoice", { actorUuid: brekka.uuid, ref: "m1", title: "Maim?", sub: "Instead of this turn's death save.", choices });
const toPhone = sent.filter((x) => x.name === "choiceOffer");
check("offered: it goes to the owner's phone only, with its roll", r?.ok === true && r.sent === toPhone.length && toPhone.length >= 1 && toPhone.every((x) => brekka.testUserPermission(users.get(x.userId), "OWNER") && !users.get(x.userId).isGM)
  && toPhone[0].payload.choices[0].roll === "1d100" && toPhone[0].payload.ref === "m1", JSON.stringify({ r, sent }));
handlers.choiceOffer(toPhone[0].payload);
check("the phone keeps it and tells its shell", rpc.api.state.choiceOffer?.ref === "m1" && hooks.at(-1).name === "mobile-command.choiceOffer");
check("a choice list keeps three at most, each with an id and a label", rpc.choiceList([{ id: 1, label: "a" }, { id: 2 }, { label: "x" }, { id: 3, label: "b" }, { id: 4, label: "c" }, { id: 5, label: "d" }]).map((c) => c.id).join() === "1,3,4");
const outsider = users.find((u) => !u.isGM && !brekka.testUserPermission(u, "OWNER"));
if (outsider) check("someone else can't answer for Brekka", (await asUser(outsider.id, "answerChoice", { ref: "m1", choice: "maim", actorUuid: brekka.uuid, total: 47 })).ok === false);
hooks.length = 0;
r = await asUser(owner.id, "answerChoice", { ref: "m1", choice: "maim", actorUuid: brekka.uuid, total: 47, messageId: "msg1" });
const h = hooks.find((x) => x.name === "mobile-command.choiceAnswer");
check("the owner's pick reaches the DM's side as a hook, with the phone's total and message", r.ok === true && h && h.payload.ref === "m1" && h.payload.choice === "maim" && h.payload.total === 47 && h.payload.messageId === "msg1" && h.payload.userId === owner.id, JSON.stringify(h));
handlers.choiceOffer({ withdraw: "m1" });
check("a withdraw clears the card", rpc.api.state.choiceOffer === null);
console.log(`\nAll ${n} passed.`);
