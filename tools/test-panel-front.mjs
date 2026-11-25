// The DM panel comes to the front the way a Foundry window does (UI-BIBLE §6.5; SEAT 26 2026-11-25: the Crooked Moon tab
// opened BEHIND Simple Calendar, which opens top-left on every GM load). scripts/panel-safe.js + scripts/dm-panel.js.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-panel-front.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}${detail ? ` — got ${detail}` : ""}`); console.log("Stopped at the first failure."); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const P = await import(pathToFileURL(path.join(ROOT, "scripts", "panel-safe.js")).href);
const panel = fs.readFileSync(path.join(ROOT, "scripts", "dm-panel.js"), "utf8");
const bible = fs.readFileSync(path.join(ROOT, "UI-BIBLE.md"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "styles", "shell.css"), "utf8");

check("the panel's own CSS level (70) is below every Foundry window (they start at ~100): the SEAT 26 bug", /#mc-dm-panel \{\s*position: fixed; left: 12px; bottom: 110px; z-index: 70;/.test(css));
check("next level: one above the highest window counter", P.frontZ(70, [104]) === 105 && P.frontZ(0, [100, 230]) === 231 && P.frontZ(70, []) === 71);
check("already in front: left where it is (no climb on every click)", P.frontZ(300, [104]) === 300);
{
  // Simple Calendar (a v1 Application) took 101 at load; the panel is at its CSS 70
  class V2 { static _maxZ = 101; }
  const el = { style: { zIndex: "" } };
  const z = P.bringToFront(el, { V2, V1: undefined });
  check("used → the panel goes above Simple Calendar, and Foundry's counter moves up with it", z === 102 && el.style.zIndex === "102" && V2._maxZ === 102);
  V2._maxZ += 1;   // a roll dialog opens afterwards: Foundry gives it 103
  check("…so a window or dialog opened after that still lands on top of the panel (103 > 102)", V2._maxZ > Number(el.style.zIndex));
  check("…and the next use of the panel brings it forward again", P.bringToFront(el, { V2 }) === 104 && el.style.zIndex === "104");
  check("no element: nothing happens", P.bringToFront(null, { V2 }) === null);
}
{
  // SEAT 28: Foundry's own raise logic, as in v14 (application.mjs bringToFront; application-v1.mjs bringToTop)
  const ui = { activeWindow: null };
  class V2 { static _maxZ = 100; static front = null;
    constructor() { this.z = 0; }
    bringToFront() { if (!(V2.front === this && ui.activeWindow === this)) this.z = ++V2._maxZ; V2.front = this; ui.activeWindow = this; } }
  class V1 { constructor() { this.z = 0; }
    bringToTop() { if (ui.activeWindow === this) return; if (this.z < V2._maxZ) { this.z = ++V2._maxZ; ui.activeWindow = this; } } }
  const panelEl = { style: { zIndex: "" } };
  const cal = new V1(); cal.bringToTop(); cal.z = cal.z || ++V2._maxZ; ui.activeWindow = cal;   // Simple Calendar opens at load
  P.bringToFront(panelEl, { V2, ui });
  check("the panel clicked → above Simple Calendar, and Foundry no longer counts the calendar as the front window",
    Number(panelEl.style.zIndex) > cal.z && ui.activeWindow === null);
  cal.bringToTop();                                                                               // the DM clicks the calendar
  check("the calendar (a v1 window) clicked next → back above the panel", cal.z > Number(panelEl.style.zIndex), `${cal.z} vs ${panelEl.style.zIndex}`);
  P.bringToFront(panelEl, { V2, ui });
  check("…the panel clicked again → in front again", Number(panelEl.style.zIndex) > cal.z);
  const sheet = new V2(); sheet.bringToFront(); P.bringToFront(panelEl, { V2, ui }); sheet.bringToFront();
  check("the same both ways for a v2 window (a sheet touched last before the panel comes back over it)", sheet.z > Number(panelEl.style.zIndex));
  const dlg = new V2(); dlg.bringToFront();
  check("a roll dialog opened after using the panel still opens on top", dlg.z > Number(panelEl.style.zIndex));
}
check("any press on the panel brings it forward (capture, so every tab and drawer is covered)",
  /panelEl\.addEventListener\("pointerdown", \(\) => \{ try \{ bringToFront\(panelEl\); \}/.test(panel) && /"pointerdown", [^\n]*, true\);/.test(panel));
check("a deck press opening a tab brings it forward too", /if \(dockTab\) bringToFront\(panelEl\);/.test(panel));
check("UI-BIBLE §6.5 carries the rule", /The panel comes to the front the way a Foundry window does/.test(bible));
console.log(`All ${n} passed.`);
process.exit(0);
