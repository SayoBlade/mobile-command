// The panel's chips on the Requests row (DM 2026-11-13, MC-ON-DECK-IDEAS #2): scribe, summon control and a trade to an
// offline player are raised into `dmAsks` AND the panel, under one id; the deck's row and the panel's chip call the
// same answer, so answering at either clears both. Run against tools/fake-foundry.mjs; stops at the first failure.
import { installFakeFoundry } from "./fake-foundry.mjs";
let fakeSocketlib;
Object.defineProperty(globalThis, "socketlib", { configurable: true, get: () => fakeSocketlib,
  set: (lib) => { fakeSocketlib = { registerModule: (id) => { const real = lib.registerModule(id); return { ...real, register() {}, executeAsUser: async (...a) => { told.push(a); } }; } }; } });
const told = [];
const { A, brekka, store, users } = await installFakeFoundry();
const REPO = new URL("..", import.meta.url);
const rpc = await import(new URL("scripts/rpc.js", REPO));
await import(new URL("scripts/actions-asks.js", REPO));
let n = 0;
function check(what, cond, got = "") { n += 1; if (cond) { console.log(`PASS ${n}. ${what}`); return; } console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`); console.log("Stopped at the first failure."); process.exit(1); }
globalThis.CONST ??= { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 } };
const hooks = []; globalThis.Hooks.callAll = (name, payload) => { hooks.push({ name, payload }); };
for (const u of users) u.active = true;
const row = () => A.actionSnapshot({ area: "requests" }).find((r) => r.id === "table.ask");
const player = users.find((u) => !u.isGM);
const updates = []; brekka.update = async (d) => { updates.push(d); };

await rpc.raiseAsk({ id: "s1", kind: "summon", actorId: brekka.id, userId: player.id, summonerName: "Gilly", summonName: "Wolf", playerName: player.name, label: "x", expiresAt: Date.now() + 600000 });
check("a summon is written into the shared list", rpc.pendingAsks().some((e) => e.id === "s1" && e.kind === "summon"));
check("…and handed to the panel as its chip, same id", hooks.some((h) => h.name === "mobile-command.dmReaction" && h.payload.id === "s1"));
let r = row();
check("the deck's row shows it: who summoned what, two answers", r?.alert && /Gilly summoned Wolf/.test(r.sub) && r.choices.map((c) => c.id).join() === "cancel,ok", JSON.stringify(r));
await rpc.raiseAsk({ id: "s2", kind: "summon", actorId: brekka.id, userId: player.id, expiresAt: Date.now() + 600000 });
check("a second token of the same summon for the same player is the same question (a pack of wolves)", rpc.pendingAsks().filter((e) => e.kind === "summon").length === 1);
await A.runAction("table.ask", { choice: "ok", ref: "s1" });
check("Give control from the deck: the player owns the summon", updates.some((d) => d[`ownership.${player.id}`] === 3), JSON.stringify(updates));
check("…and it is gone from the list and from the panel", !rpc.pendingAsks().some((e) => e.id === "s1") && hooks.some((h) => h.name === "mobile-command.dmReactionGone" && h.payload.id === "s1"));

await rpc.raiseAsk({ id: "w1", kind: "scribe", actorId: brekka.id, userId: player.id, actorName: "Brekka", spellName: "Shield", cost: "2h & 50 gp", expiresAt: Date.now() + 600000 });
check("a scribe request reads on the row", /Brekka · scribe Shield \(2h & 50 gp\)/.test(row()?.sub ?? ""), row()?.sub);
const res = await rpc.answerChip("w1", false);
check("Decline from the panel's chip: answered through the same function, the player hears, it is gone",
  res?.ok && res.declined && !rpc.pendingAsks().some((e) => e.id === "w1") && told.some((a) => a[0] === "scribeResult"), JSON.stringify(res));

await rpc.raiseAsk({ id: "t1", kind: "trade", offerId: "gone", fromName: "Gilly", toName: "Brekka", what: "2 torches", expiresAt: Date.now() + 600000 });
check("a trade to an offline player reads on the row", /Gilly → Brekka · 2 torches/.test(row()?.sub ?? ""), row()?.sub);
const tr = await A.runAction("table.ask", { choice: "ok", ref: "t1" });
check("an expired offer says so on the key, and the ask is gone", tr?.ok === false && /expired/.test(tr.reason) && !rpc.pendingAsks().some((e) => e.id === "t1"), JSON.stringify(tr));

await rpc.raiseAsk({ id: "old", kind: "scribe", actorId: brekka.id, userId: player.id, expiresAt: Date.now() - 1 });
check("an ask past its ten minutes is not shown", !row()?.alert, JSON.stringify(row()));
console.log("all passed");
