// Tour Rehearsal R2 step 37 (2026-11-09): the deck's "Ask a roll → Perception" reached the phone, and the
// phone rolled a WISDOM ABILITY CHECK. The deck sends { rollType: "check", ability: "wis", skill: "prc",
// label: "Perception" } (deck-command world.js pushRoll); MC's requestRolls dropped `skill`. Now a check that
// names a skill rolls that skill, on the phone and on the no-owner fallback.
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-roll-request-skill.mjs   (or plain node)
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
    return { ...real, register(name, fn) { handlers[name] = fn; },
      executeAsUser: async (name, userId, payload) => { toUser.push({ name, userId, payload }); } };
  } }; } });
const { brekka, outsider, users } = await installFakeFoundry();
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
globalThis.CONFIG.DND5E = {
  abilities: { wis: { label: "Wisdom" }, dex: { label: "Dexterity" } },
  skills: { prc: { label: "Perception", ability: "wis" }, ste: { label: "Stealth", ability: "dex" } },
};
// what each actor was asked to roll, when the DM's client rolls for it
const rolled = [];
for (const a of [brekka, outsider]) {
  a.rollSkill = async (c) => { rolled.push({ who: a.name, skill: c }); };
  a.rollAbilityCheck = async (c) => { rolled.push({ who: a.name, check: c }); };
  a.rollSavingThrow = async (c) => { rolled.push({ who: a.name, save: c }); };
}

// ── the deck's exact Perception payload ────────────────────────────────────────────────────────────────────
const deck = { rollType: "check", ability: "wis", skill: "prc", label: "Perception", dc: null };
let res = await asUser("gm", "requestRolls", { ...deck, actorIds: [brekka.id] });
let p = toUser.at(-1)?.payload;
check("the request reaches Brekka's player", res?.ok && res.sent === 1 && toUser.at(-1)?.userId === "u1", JSON.stringify(res));
check("…carrying the skill, not only its ability", p?.rollType === "check" && p.skill === "prc", JSON.stringify(p));
check("…and the card says Perception", p?.label === "Perception");

// ── the fallback the DM's client rolls for an actor with no player online ───────────────────────────────────
await asUser("gm", "requestRolls", { ...deck, actorIds: [outsider.id] });
check("no player online: the DM's client rolls the SKILL", rolled.at(-1)?.who === "Vex" && rolled.at(-1)?.skill?.skill === "prc" && !("ability" in rolled.at(-1).skill), JSON.stringify(rolled.at(-1)));
await asUser("gm", "requestRolls", { rollType: "check", skill: "ste", actorIds: [outsider.id] });
p = rolled.at(-1);
check("with no label sent, a Stealth request still rolls Stealth", p?.skill?.skill === "ste");

// ── what stays as it was ────────────────────────────────────────────────────────────────────────────────────
await asUser("gm", "requestRolls", { rollType: "check", ability: "wis", actorIds: [outsider.id] });
check("a plain Wisdom check is still a Wisdom ability check", rolled.at(-1)?.check?.ability === "wis");
await asUser("gm", "requestRolls", { rollType: "save", ability: "dex", skill: "ste", actorIds: [outsider.id] });
check("a save never becomes a skill roll, whatever rides along", rolled.at(-1)?.save?.ability === "dex");
await asUser("gm", "requestRolls", { rollType: "check", ability: "wis", skill: "xyz", actorIds: [brekka.id] });
check("a skill dnd5e doesn't know is dropped: the card asks the ability check", toUser.at(-1)?.payload?.skill === null && toUser.at(-1)?.payload?.ability === "wis");
check("rollSkillKey: check+known → the key; save, blank, unknown → null",
  rpc.rollSkillKey("check", "prc") === "prc" && rpc.rollSkillKey("save", "prc") === null && rpc.rollSkillKey("check", "") === null && rpc.rollSkillKey("check", "zz") === null);

// ── the phone's tap rolls the skill ─────────────────────────────────────────────────────────────────────────
const shell = fs.readFileSync(new URL("scripts/shell.js", REPO), "utf8");
check("the phone's Roll button rolls the skill when the request names one",
  /if \(p\.rollType === "check" && p\.skill\) return void a\.rollSkill\(\{ skill: p\.skill \}\);/.test(shell));

console.log(`\nall ${n} passed`);
