// Travel buttons on the panel while no deck drives (MC redesign, DM 2026-11-26: 6A, "back, but only while no deck is
// reachable"). Time › Travel draws the deck's own four travel actions as buttons when the panel is full, and the
// "driven from the deck" line when compact. By source: scripts/dm-panel.js, actions-travel.js.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-nodeck-travel.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import fs from "node:fs";
const REPO = new URL("..", import.meta.url);
const src = (f) => fs.readFileSync(new URL(`scripts/${f}`, REPO), "utf8");
const P = src("dm-panel.js"), T = src("actions-travel.js");
let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const travel = P.slice(P.indexOf("function travelHTML() {"), P.indexOf("function flyoutHTML() {"));
const IDS = ["travel.begin", "travel.route", "travel.go", "travel.stop"];
check("the four travel actions exist as the deck presses them (Travel, Draw road, Go, Stop)", IDS.every((id) => T.includes(`id: "${id}"`)));
check("Time › Travel draws exactly those four, in that order, and only while no deck drives",
  /\$\{noDeck \? actionButtonsHTML\(\["travel\.begin", "travel\.route", "travel\.go", "travel\.stop"\], "travel"\) : ""\}/.test(travel) && /const noDeck = !panelCompact\(\);/.test(travel));
check("compact (the deck drives): the line 'Driven from the deck: Travel, Draw road, Go, Stop.' instead",
  /const onDeck = noDeck \? "" : `<p class="mc-dmp-travel-hint">Driven from the deck: Travel, Draw road, Go, Stop\.<\/p>`/.test(travel));
check("the switch hint follows the mode ('Press Travel on the deck to go.' / 'Press Travel to go.')",
  travel.includes(`(panelCompact() ? "Press Travel on the deck to go." : "Press Travel to go.")`));
const helper = P.slice(P.indexOf("function actionButtonsHTML(ids, area) {"), P.indexOf("function travelHTML() {"));
check("each button is the action's own row: dim with its reason when it cannot run, hidden when the deck hides it",
  /actionSnapshot\(\{ area \}\)/.test(helper) && /\$\{r\.enabled \? "" : "disabled"\} title="\$\{esc\(r\.sub \?\? r\.label\)\}"/.test(helper) && /\.filter\(Boolean\)/.test(helper));
check("a press runs it exactly as a deck press does (runAction), and a refusal is said, never silent",
  /const res = await runAction\(actBtn\.dataset\.runAction\);\s*if \(res\?\.ok === false\) notifier\.warn\(res\.reason\);/.test(P));
console.log(`\nAll ${n} passed.`);
