// Dicer's dice on midi's rolls (scripts/dicer-midi.js; deck-command SEAT 9, 2026-11-20).
// Run: node tools/test-dicer-midi.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const B = await import(pathToFileURL(path.join(ROOT, "scripts", "dicer-midi.js")).href);

// 1-4 when it is wanted
const on = (ids) => (id) => ids.includes(id);
check("wanted: Dicer + midi on, Dice So Nice off", B.bridgeWanted(on(["dicer", "midi-qol"])) === true);
check("not wanted when Dice So Nice is on (two engines would double the dice)", B.bridgeWanted(on(["dicer", "midi-qol", "dice-so-nice"])) === false);
check("not wanted without Dicer", B.bridgeWanted(on(["midi-qol"])) === false);
check("not wanted without midi", B.bridgeWanted(on(["dicer"])) === false);

// 5-6 finding midi's setup step
check("midi's setup callback is recognised by its setupModules() call",
  B.isMidiSetup(function () { setupModules(); setupFeatureOverlaps(); }) === true);
check("…and nothing else is", B.isMidiSetup(() => { doOtherThings(); }) === false && B.isMidiSetup(null) === false);

// A stand-in for game.modules (a Map subclass with get on the prototype, like Foundry's Collection) and for midi's
// setupModules(), copied in shape from midi-qol 14.6.13.
class Collection extends Map {}
const modules = new Collection([
  ["dice-so-nice", { id: "dice-so-nice", active: false, version: "6.4.5" }],
  ["socketlib", { id: "socketlib", active: true, version: "1.1.3" }],
  ["dicer", { id: "dicer", active: true, version: "1.3.14" }]
]);
const installed = new Map();
const names = ["socketlib", "dice-so-nice", "levels"];
function midiSetup() {
  for (const name of names) {
    const ver = modules.get(name)?.version || "0.0.0";
    if (!installed.get(name)) installed.set(name, modules.get(name)?.active && ver !== "0.0.0");
  }
  installed.set("laterDsnRead", modules.get("dice-so-nice")?.active); // midi code after setupModules sees the truth
}
const entry = { hook: "setup", id: 1, fn: midiSetup, once: true };
check("the setup entry is wrapped", B.wrapSetupEntry(entry, modules) === true);
check("…only once", B.wrapSetupEntry(entry, modules) === false);
entry.fn();
check("midi's map now says Dice So Nice: yes", installed.get("dice-so-nice") === true);
check("other modules read as they are", installed.get("socketlib") === true && !installed.get("levels"));
check("the pretence is spent after one read: later midi code sees Dice So Nice off", installed.get("laterDsnRead") === false);
check("game.modules.get is the real one again (no own property left)", !Object.prototype.hasOwnProperty.call(modules, "get") && modules.get("dice-so-nice").active === false);

// a throwing setup still restores
const boom = { fn: function () { setupModules(); throw new Error("x"); } };
globalThis.setupModules = () => modules.get("dice-so-nice");
B.wrapSetupEntry(boom, modules);
let threw = false; try { boom.fn(); } catch { threw = true; }
check("a setup that throws still puts game.modules.get back", threw && !Object.prototype.hasOwnProperty.call(modules, "get"));

// Foundry's Module.active is read-only and non-configurable: a Proxy over it would THROW inside midi's setup
// (seen on the seat 2026-11-20, it skipped the rest of midi's setup). The stand-in must not touch it.
const frozen = Object.defineProperty({ id: "dice-so-nice", version: "6.4.5", title: "Dice So Nice!" }, "active", { value: false, writable: false, configurable: false, enumerable: true });
const realish = new Collection([["dice-so-nice", frozen]]);
const inst2 = new Map();
const e2 = { fn: function () { setupModules(); inst2.set("dsn", realish.get("dice-so-nice")?.active && realish.get("dice-so-nice")?.version === "6.4.5"); } };
globalThis.setupModules = () => {};
B.wrapSetupEntry(e2, realish);
let threw2 = null; try { e2.fn(); } catch (err) { threw2 = err; }
check("a real, read-only Module.active does not throw, and midi still reads active once", threw2 === null && inst2.get("dsn") === true, String(threw2));

// with Dice So Nice not installed at all
const bare = new Collection();
const p = B.oneShotActive(bare.get("dice-so-nice"), null);
check("Dice So Nice not installed: the stand-in still has a version midi accepts, and says active once", p.version === "6.0.0" && p.active === true && p.active === false);

// settings midi reads directly
check("hideNpcRolls answers false (DSN's default: NPC dice shown)", B.dsnAnswer("hideNpcRolls", () => true) === false);
check("showGhostDice is always false (blind dice GM-only, SEAT 16), whatever Dicer's own setting says", B.dsnAnswer("showGhostDice", () => true) === false && B.dsnAnswer("showGhostDice", () => false) === false);
check("a Dicer read that throws answers false", B.dsnAnswer("showGhostDice", () => { throw new Error("no"); }) === false);
check("only those two keys are answered", B.DSN_KEYS.size === 2 && B.dsnAnswer("other", () => 1) === undefined);

// the cap
let timedOut = 0;
const never = B.capped(() => new Promise(() => {}), 30, () => { timedOut += 1; });
const r1 = await never();
check("dice that never finish let the caller go with false after the cap", r1 === false && timedOut === 1);
const quick = B.capped(async (x) => x * 2, 1000);
check("dice that finish return their own answer", (await quick(21)) === 42);
check("capping twice does nothing", B.capped(quick) === quick);

// the glue
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
check("main.js imports the bridge", /import \{ registerDicerMidiBridge, applyPhoneDice(, hideGhostDice)? \} from "\.\/dicer-midi\.js";/.test(main));
check("…and registers it in init, before anything that could throw", /Hooks\.once\("init", \(\) => \{\s*\/\/[^\n]*\n[^\n]*\n\s*installErrorCapture\(\);\s*registerDicerMidiBridge\(\);/.test(main));
check("…and decides the phone's dice at ready, with MC's own phone test", /Hooks\.once\("ready", \(\) => \{[\s\S]{0,600}applyPhoneDice\(isPhoneClient\(\)\)/.test(main));

// his numbers and rules (relayed 2026-11-20)
check("the fallback is about 5 s", B.CAP_MS === 5000);
check("Dicer handling midi itself (a truthy Dicer setting naming midi) stands the bridge down",
  B.dicerHandlesMidi({ settingKeys: ["enabled", "midiDice"], settingValue: (k) => k === "midiDice" }) === true);
check("…or an API member naming midi", B.dicerHandlesMidi({ apiKeys: ["showForRoll", "hookMidiQol"] }) === true);
check("…but a midi setting that is off, or none at all (Dicer 1.3.14), does not",
  B.dicerHandlesMidi({ settingKeys: ["midiDice", "enabled"], settingValue: () => false, apiKeys: ["showForRoll"] }) === false && B.dicerHandlesMidi() === false);
const e3 = { fn: function () { setupModules(); } };
let seen3; globalThis.setupModules = () => { seen3 = modules.get("dice-so-nice")?.active; };
B.wrapSetupEntry(e3, modules, null, () => false);
e3.fn();
check("when Dicer handles midi, midi's setup sees the truth (no pretence served)", seen3 === false && !Object.prototype.hasOwnProperty.call(modules, "get"));

// Dicer off on phones
check("a phone with Dicer's dice on: turned off, and marked as ours", JSON.stringify(B.phoneDicePlan({ isPhone: true, enabled: true, markedByUs: false })) === JSON.stringify({ set: false, mark: true }));
check("a phone already off: left alone", JSON.stringify(B.phoneDicePlan({ isPhone: true, enabled: false, markedByUs: true })) === JSON.stringify({ set: null, mark: null }));
check("no longer a phone, and WE turned it off: back on, mark cleared", JSON.stringify(B.phoneDicePlan({ isPhone: false, enabled: false, markedByUs: true })) === JSON.stringify({ set: true, mark: false }));
check("never a phone, or turned off by its owner: left alone", JSON.stringify(B.phoneDicePlan({ isPhone: false, enabled: false, markedByUs: false })) === JSON.stringify({ set: null, mark: null }));
console.log(`\nall ${n} passed`);
