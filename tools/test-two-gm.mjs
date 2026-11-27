// Two GM users at once (DM 2026-11-27: he added "Claude" as a GM). Every world write that runs by itself must run on ONE
// client: Foundry's active GM or MC's executor (settings.js isExecutor), never a bare isGM. Wiring by source.
// Run: node tools/test-two-gm.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let n = 0;
function check(label, ok) { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }

check("the first-run preset (snapshot + midi/dnd5e settings) is applied by the active GM only, not by both GMs",
  /export async function checkAndPrompt\(\) \{\s*if \(!game\.user\?\.isGM\) return;[\s\S]{0,300}if \(game\.users\?\.activeGM && game\.users\.activeGM\.id !== game\.user\.id\) return;/.test(read("scripts/enforcer.js")));
const once = [["scripts/cm-house.js", "restoreCrookedHouse"], ["scripts/cm-house.js", "makeAtticLadder"], ["scripts/cm-attic.js", "makeAtticRooms"]];
for (const [f, fn] of once) check(`${fn} runs on the active GM only`, new RegExp(`export async function ${fn}[\\s\\S]{0,200}game\\.users\\.activeGM\\?\\.id !== game\\.user\\.id\\) return null;`).test(read(f)));
const ex = read("scripts/settings.js");
check("isExecutor() names one client: his chosen executor if it is an active GM, else Foundry's active GM",
  /export function resolveExecutorId\(\) \{[\s\S]{0,300}if \(user\?\.active && user\.isGM\) return user\.id;\s*\}\s*return game\.users\.activeGM\?\.id \?\? null;/.test(ex)
  && /export function isExecutor\(\) \{\s*return game\.user\.id === resolveExecutorId\(\);/.test(ex));
console.log(`\nAll ${n} passed.`);
