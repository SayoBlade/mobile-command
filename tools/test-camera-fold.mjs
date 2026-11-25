// The camera folds away while the deck drives (MC redesign, DM 2026-11-26: 3A, "fold Frame, Manual, Fit and Zoom while
// the deck is reachable; keep who the TV follows on the panel"). By source: scripts/dm-panel.js.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-camera-fold.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import fs from "node:fs";
const P = fs.readFileSync(new URL("../scripts/dm-panel.js", import.meta.url), "utf8");
let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const floor = P.slice(P.indexOf("function cameraFloorHTML() {"), P.indexOf("\n}\n", P.indexOf("function cameraFloorHTML() {")));
const cam = P.slice(P.indexOf("function displayTabHTML() {"), P.indexOf("\n}\n", P.indexOf("function displayTabHTML() {")));
check("folded = compact (the deck drives) and not shown on request", /const camFolded = \(\) => panelCompact\(\) && !camShow;/.test(P));
check("folded: the floor draws no Frame / Manual", /if \(camFolded\(\)\) return "";/.test(floor) && /data-cam="focus"/.test(floor) && /data-cam="manual"/.test(floor));
check("folded: Stage › Camera keeps who the TV follows and puts one line in place of Fit and Zoom: 'On the deck: Frame, Manual, Fit, Zoom' with Show",
  /dtDrawer\("dispFollow", "Who the TV follows", "", followListBody\(\)\)/.test(cam)
  && /camFolded\(\)\s*\? `<div class="mc-dmp-stub">[\s\S]*?On the deck: Frame, Manual, Fit, Zoom<\/span><button data-cam-show>Show<\/button>/.test(cam) && /: camControls;/.test(cam));
check("Show brings them back for the session; the pill starts fresh", /\[data-cam-show\]"\)\) \{ camShow = true;/.test(P) && /tapPill\(runFrom\(\)\); camShow = false;/.test(P));
console.log(`\nAll ${n} passed.`);
