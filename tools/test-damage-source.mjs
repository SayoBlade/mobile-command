// S2 (deck-command MC-PATCHES-2026-11-09), tour R3 rerun 8 step 59: the Locomotive's legendary Haunting Whistle hit
// the Barbarian for 5 while the echo ("Haint echo · Soul Can 1") was the current combatant, and the phone read
// "5 damage from Haint echo · Soul Can 1". The damage relay named whoever's turn it was. Now it names the creature
// that dealt it (midi's workflow, else the damage card), or nobody. Drives the real relay (rpc registerDamageRelay).
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-damage-source.mjs   (or plain node)
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import { installFakeFoundry } from "./fake-foundry.mjs";

const toUser = [];
let fakeSocketlib;
Object.defineProperty(globalThis, "socketlib", { configurable: true,
  get: () => fakeSocketlib,
  set: (lib) => { fakeSocketlib = { registerModule: (id) => {
    const real = lib.registerModule(id);
    return { ...real, register() {}, executeAsUser: async (name, userId, payload) => { toUser.push({ name, userId, payload }); } };
  } }; } });
const { brekka, users } = await installFakeFoundry();
const rpc = await import(new URL("../scripts/rpc.js", import.meta.url));

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
for (const u of users) u.active = true;
const get = (o, k) => k.split(".").reduce((x, p) => x?.[p], o);
foundry.utils.getProperty = get; foundry.utils.hasProperty = (o, k) => get(o, k) !== undefined;

// ── 10.9 in round 1: the Barbarian (u1's), the Locomotive, the echo (current combatant) ─────────────────────
const npc = (id, name) => ({ id, name, type: "npc", uuid: `Actor.${id}` });
const loco = npc("loco", "The Ghostlight Locomotive"), echoA = npc("echoA", "Haint echo");
game.actors.push(loco, echoA);
const tok = (id, name, actor, hidden = false) => ({ id, name, actor, actorId: actor.id, hidden, uuid: `Scene.s10.Token.${id}`, document: null });
const barbTok = tok("barb", "Test Barbarian", brekka), locoTok = tok("locoT", "The Ghostlight Locomotive", loco), echoTok = tok("echoT", "Haint echo · Soul Can 1", echoA);
for (const t of [barbTok, locoTok, echoTok]) t.document = t;
globalThis.fromUuidSync = (u) => [barbTok, locoTok, echoTok].find((t) => t.uuid === u) ?? game.actors.find((a) => a.uuid === u) ?? null;
const echoC = { name: "Haint echo · Soul Can 1", actor: echoA, token: echoTok, hidden: false };
game.combat = { started: true, combatant: echoC, combatants: [{ actor: brekka }, { actor: loco }, echoC] };
game.messages = { contents: [] };

const hooks = {};
const realOn = globalThis.Hooks.on;
globalThis.Hooks.on = (h, fn) => { (hooks[h] ??= []).push(fn); };
rpc.registerDamageRelay();
globalThis.Hooks.on = realOn;
const hit = (amount) => {
  brekka.system.attributes.hp = { value: 32, temp: 0 };
  toUser.length = 0;
  hooks.preUpdateActor[0](brekka, { system: { attributes: { hp: { value: 32 - amount } } } });
  return toUser.find((m) => m.name === "damageTaken")?.payload;
};
const workflows = new Map();
globalThis.MidiQOL = { Workflow: { workflows } };

// 1. step 59: midi's Haunting Whistle workflow (the Locomotive's) is applying 5, the echo is current
workflows.set("old", { actor: echoA, token: echoTok, hitTargets: new Set([barbTok]), currentAction: { name: "WorkflowState_Completed" } }); // the echo's finished swing
workflows.set("whistle", new WeakRef({ actor: loco, token: locoTok, failedSaves: new Set([barbTok]), hitTargets: new Set([barbTok]), damageList: [{ actorId: brekka.id, tokenUuid: barbTok.uuid }], currentAction: { name: "WorkflowState_ApplyDynamicEffects" } }));
const keep = workflows.get("whistle").deref(); // hold the WeakRef target for the test
let p = hit(5);
check("step 59: the Locomotive's Haunting Whistle while the echo is current → '5 damage from The Ghostlight Locomotive'", p?.amount === 5 && p.source === "The Ghostlight Locomotive", JSON.stringify(p));

// 2. no midi workflow: the damage card in chat, spoken by the Locomotive
workflows.clear();
game.messages.contents = [{ type: "damage", timestamp: Date.now() - 2000, speaker: { alias: "The Ghostlight Locomotive", actor: loco.id, scene: "s10", token: "locoT" }, system: { targets: [{ uuid: brekka.uuid, name: "Test Barbarian" }] } }];
p = hit(5);
check("no workflow: the newest damage card targeting the Barbarian names its speaker, the Locomotive", p?.source === "The Ghostlight Locomotive", JSON.stringify(p));

// 3. nothing identifies it → no name, never the current combatant
game.messages.contents = [{ type: "damage", timestamp: Date.now() - 60000, speaker: { alias: "Old card" }, system: { targets: [{ uuid: brekka.uuid }] } }];
p = hit(4);
check("nothing names a source (an old card only) → '4 damage', not the echo", p?.amount === 4 && p.source === "", JSON.stringify(p));

// 4. an ordinary hit on the attacker's own turn still names the attacker
game.messages.contents = [];
game.combat.combatant = echoC;
workflows.set("echoHit", { actor: echoA, token: echoTok, hitTargets: new Set([barbTok]), currentAction: { name: "WorkflowState_DamageRollComplete" } });
p = hit(3);
check("the echo hitting on its own turn → '3 damage from Haint echo · Soul Can 1'", p?.source === "Haint echo · Soul Can 1", JSON.stringify(p));

// 5–6. the guards that stay
workflows.clear();
workflows.set("self", { actor: brekka, token: barbTok, hitTargets: new Set([barbTok]), currentAction: { name: "x" } });
check("damage the PC dealt itself names nobody", hit(2)?.source === "");
workflows.clear();
locoTok.hidden = true;
workflows.set("hiddenLoco", { actor: loco, token: locoTok, hitTargets: new Set([barbTok]), currentAction: { name: "x" } });
check("a hidden creature's damage names nobody (a phone never learns of it)", hit(2)?.source === "");
void keep;

console.log(`\nall ${n} passed`);
