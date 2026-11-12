// A burst of room-cue plays from one move (DM 2026-11-12, the Cauldron Room: "a strange moan repeated several times,
// then nothing"). The cooldown has to be claimed before the handler's first await, or every event from one move
// passes the check together. And the teeth set crunches (catalogue 24, "human teeth that crunch beneath your feet").
// Run: node tools/test-cue-burst.mjs   (stops at the first failure)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
const src = fs.readFileSync(path.join(ROOT, "scripts", "region-sound.js"), "utf8");
const body = src.slice(src.indexOf("async _handleRegionEvent(event) {"), src.indexOf("await playCue(this", src.indexOf("async _handleRegionEvent(event) {")));
const claim = body.indexOf("lastPlayed.set(uuid, { at: now");
const firstAwait = body.indexOf("await ");
check("the cooldown is claimed in the handler", claim > 0);
check("…before its first await (the count save), so a second event of the same move sees it", claim < firstAwait, `claim ${claim}, first await ${firstAwait}`);
check("…only when the cue fires, and never for an armed cue", /if \(d\.fire && this\.rule !== "arm"\) lastPlayed\.set/.test(body));
// the race itself, modelled: three events of one move, each checking then awaiting
const { withinCooldown } = await import(pathToFileURL(path.join(ROOT, "scripts", "cue-rules.js")).href);
const last = new Map(); let plays = 0;
const handle = async () => { const now = 1000; if (withinCooldown(last.get("u")?.at, now, 25)) return; last.set("u", { at: now }); await new Promise((r) => setTimeout(r, 5)); plays++; };
await Promise.all([handle(), handle(), handle()]);
check("three events from one move, claimed first: one play", plays === 1, String(plays));
const { CUE_SETS } = await import(pathToFileURL(path.join(ROOT, "scripts", "cue-sets.js")).href);
const teeth = CUE_SETS.teeth.takes;
check("the teeth set is crunching steps, several takes, and nothing that jingles (the glass read as keys, DM 2026-11-12)", teeth.filter((t) => /crunch/.test(t)).length >= 5 && teeth.every((t) => /crunch/.test(t)));
const DATA = path.join(process.env.LOCALAPPDATA ?? "", "FoundryVTT", "Data");
if (fs.existsSync(DATA)) check("every teeth take is on disk", teeth.every((t) => fs.existsSync(path.join(DATA, t))), teeth.filter((t) => !fs.existsSync(path.join(DATA, t))).join(", "));
console.log(`\nall ${n} passed`);
