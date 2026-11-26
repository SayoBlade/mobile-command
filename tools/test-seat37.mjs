// SEAT 37 fixes (2026-11-26), by source: Form Up says why it will refuse, the panel no longer rebuilds itself every
// second, and the phone's PAUSED chip leaves the hero's name its row on a narrow phone. (The twist popup and On now
// are covered in test-waiting and test-on-now.)
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-seat37.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import fs from "node:fs";
const REPO = new URL("..", import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, REPO), "utf8");
const P = read("scripts/dm-panel.js"), R = read("scripts/rpc.js"), S = read("scripts/shell.js"), C = read("styles/shell.css");
let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}

/* ── 1–3. Form Up ─────────────────────────────────────────────────────────────────────────────────────── */
const party = P.slice(P.indexOf("function partyMainHTML() {"), P.indexOf("No usable group → say WHY"));
check("Form Up: members missing from the map are named under the button, one line, before any press",
  /const gone = \(cand\.system\?\.members \?\? \[\]\)\.filter\(m => m\.actor && !sceneActorIds\.has\(m\.actor\.id\)\)\.map\(m => m\.actor\.name\);/.test(party)
  && /mc-dmp-party-why"><i class="fas fa-circle-info"><\/i> Not on this map: \$\{foundry\.utils\.escapeHTML\(gone\.join\(", "\)\)\}/.test(party));
check("…and the refusal itself reads as a sentence (the toast); the deck's two words are unchanged",
  /refuse\("not on scene", `Can't form up: \$\{missing\.join\(", "\)\} \$\{missing\.length > 1 \? "aren't" : "isn't"\} on this map\.`\)/.test(R));
check("…the panel button still toasts the refusal's sentence", /const res = await api\.partyPack\(\{ groupId: actBtn\.dataset\.group \}\);\s*if \(res\?\.ok === false\) notifier\.warn\(res\.detail/.test(P));

/* ── 4. clicks no longer lost ─────────────────────────────────────────────────────────────────────────── */
const re = /clock: safe\(\(\) => String\(clockLabel\(game\.time\?\.worldTime \?\? 0\)\)\.replace\((\/.*\/), "\$1"\), ""\)/.exec(P);
const strip = re && new Function(`return ${re[1]}`)();
check("On now's hour drops its seconds, so a clock tick no longer rebuilds the panel under a click",
  !!strip && "7 October 2026 · 00:02:13".replace(strip, "$1") === "7 October 2026 · 00:02" && "21:40".replace(strip, "$1") === "21:40", re?.[1]);

/* ── 5–7. the phone's header at 364 px ────────────────────────────────────────────────────────────────── */
check("the PAUSED chip is drawn beside the name and on the portrait",
  /\$\{this\.#pausedChipHTML\("portrait"\)\}\s*<div class="mc-id">/.test(S) && /<\/span>\s*\$\{this\.#pausedChipHTML\(\)\}/.test(S)
  && /class="mc-paused-chip mc-paused-on\$\{where\}"/.test(S));
check("…wide screens show it beside the name only", /\.mc-paused-chip\.mc-paused-onportrait \{ display: none; \}/.test(C));
const mq = C.slice(C.indexOf("@media (max-width: 420px) {\n  .mc-paused-chip.mc-paused-onname"));
check("…≤420 px: beside-the-name hidden, the portrait band shown with the word, across the 62 px portrait",
  /\.mc-paused-chip\.mc-paused-onname \{ display: none; \}/.test(mq) && /mc-paused-onportrait \{\s*display: inline-flex; position: absolute; left: 14px; top: 54px; width: 62px;/.test(mq)
  && /#mobile-command-shell \.mc-portrait \{ width: 62px; height: 62px; \}/.test(C) && /#mobile-command-shell \.mc-header \{ position: relative; \}/.test(C));
console.log(`\nAll ${n} passed.`);
