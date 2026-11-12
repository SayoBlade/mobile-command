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

// ── the late crunch (DM 2026-11-12: "about a second after the token stops moving") ──
{
  const src2 = fs.readFileSync(path.join(ROOT, "scripts", "region-sound.js"), "utf8");
  const h = src2.slice(src2.indexOf("async _handleRegionEvent(event) {"), src2.indexOf("/**", src2.indexOf("async _handleRegionEvent(event) {") + 40) > 0 ? src2.indexOf("export function cadenceBeats") : undefined);
  const play = h.indexOf("const played = playCue("), save = h.indexOf("this.behavior.update(changes)");
  check("the count save no longer waits in front of the play: it starts, the play starts, both are awaited after",
    save > 0 && play > save && !/await this\.behavior\.update\(changes\)/.test(h) && /await played; await save;/.test(h));
  check("the take plays from where the move STARTS (Foundry raises move-within as the slide begins)", /movement\?\.origin \?\? movement\?\.destination/.test(h));
  check("a new move drops the previous move's queued beats (no stacking)", /for \(const t of pendingBeats\.get\(uuid\) \?\? \[\]\) clearTimeout\(t\);/.test(h));
  check("every map's cue takes are preloaded on canvasReady, so no screen fetches a file at the first step",
    /Hooks\.on\("canvasReady", \(\) => \{ preloadSceneCues\(\); \}\);/.test(src2) && /AudioHelper\.preloadSound/.test(src2));
  globalThis.foundry ??= undefined;
  const { cadenceBeats } = await import(pathToFileURL(path.join(ROOT, "scripts", "region-sound.js")).href);
  const sc = { grid: { distance: 5 } };
  const mv = (sq) => ({ passed: { distance: sq * 5 }, origin: { x: 0, y: 0 }, destination: { x: sq * 140, y: 0 } });
  const cad = CUE_SETS.teeth.cadence;
  check("cadence: one square or two → just the one crunch", cadenceBeats(cad, mv(1), sc).length === 0 && cadenceBeats(cad, mv(2), sc).length === 0);
  const six = cadenceBeats(cad, mv(6), sc);
  check("cadence: a six-square move → three crunches in all, 250 ms apart, spread along the path", six.length === 2 && six[0].wait === 250 && six[1].wait === 500 && six[0].at.x > 0 && six[1].at.x > six[0].at.x && six[1].at.x < 840, JSON.stringify(six));
  check("cadence: never more than three, however long the move", cadenceBeats(cad, mv(30), sc).length === 2);
  check("no cadence on a set that does not ask (a creak stays one per move)", cadenceBeats(CUE_SETS.creak.cadence, mv(6), sc).length === 0);
  console.log(`\nall ${n} passed`);
}
