// The séance on the DM panel (DM 2026-11-25: "when trying the seance table I noticed the mc tab doesn't open and the input
// doesn't work"). scripts/panel-safe.js + scripts/dm-panel.js + scripts/actions.js.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-seance-panel.mjs
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
const actions = fs.readFileSync(path.join(ROOT, "scripts", "actions.js"), "utf8");

// ── 1–3. one broken drawer never stops the tab ─────────────────────────────────────────────────────────
const logs = [];
check("a drawer body that draws is returned as is", P.safeBody("Séance", () => "<b>board</b>") === "<b>board</b>");
const broken = P.safeBody("Fated tarot", () => { throw new TypeError("Cannot read properties of undefined (reading 'pages')"); }, { log: (...a) => logs.push(a) });
check("a drawer body that throws becomes one plain line in that drawer, and is logged", /Fated tarot could not be drawn/.test(broken) && logs.length === 1, broken);
P.safeBody("Fated tarot", () => { throw new Error("again"); }, { log: (...a) => logs.push(a) });
check("…logged once, not on every repaint", logs.length === 1);
// ── 4. every Crooked Moon drawer goes through it ──────────────────────────────────────────────────────
{
  const tab = panel.slice(panel.indexOf("function crookedTabHTML()"), panel.indexOf("function entrancesBody()"));
  const drawers = tab.match(/dtDrawer\("/g)?.length ?? 0, safe = tab.match(/safeBody\("/g)?.length ?? 0;
  // eight since the regroup (MC redesign phase 3): Intros moved to the Story view, still built on its own there
  check("the Crooked Moon view builds each of its drawers on its own (all eight; Intros is in Story)", drawers === 8 && safe === 8 && /dtDrawer\("cmIntros", "Intros", "", safeBody\("Intros", entrancesBody\)/.test(panel), `${drawers} drawers, ${safe} safe`);
}
// ── 5–7. the phrase box takes typing with the board off; Send waits for the board ─────────────────────
{
  const body = panel.slice(panel.indexOf("function seanceBody()"), panel.indexOf("function seanceSend()"));
  const input = body.match(/<input type="text" class="mc-fx-voice" data-seance-text[^>]*>/)?.[0] ?? "";
  check("the séance phrase box is never disabled (it used to be, whenever the board was off)", input && !/disabled/.test(input), input);
  check("…its hint says to turn the board on to send", /turn the Spirit Board on to send it/.test(input));
  const send = panel.slice(panel.indexOf("function seanceSend()"), panel.indexOf("function seanceSend()") + 400);
  check("Send / Enter with the board off keeps the phrase and says why", /if \(!fxIsOn\("seance"\)\) \{ notifier\.info\("Turn the Spirit Board on first — your phrase is kept\."\); return; \}/.test(send));
}
// ── 8–11. a deck press opens the tab AND the drawer it was about ──────────────────────────────────────
check("a Séance action run a moment ago opens the Séance drawer", P.drawerForPress({ group: "Séance", at: 1000 }, 3000) === "fxSeance");
check("…not one run long ago, nor an action with no drawer", P.drawerForPress({ group: "Séance", at: 0 }, 6001) === null && P.drawerForPress({ group: "Combat", at: 1000 }, 1100) === null && P.drawerForPress(null, 1) === null);
check("every Crooked Moon action group maps to a drawer that exists in the tab", Object.values(P.DRAWER_FOR_GROUP).every((k) => panel.includes(`dtDrawer("${k}"`)));
check("runAction records the group; openDock opens that drawer and scrolls it into view",
  /lastRun\.group = d\.group \?\? null; lastRun\.id = id; lastRun\.at = Date\.now\(\);/.test(actions)
  && /export function openDock\(tab, drawer = undefined\)[\s\S]{0,400}drawerForPress\(lastRun, Date\.now\(\)\)[\s\S]{0,200}dtDrawers\[k\] = true;/.test(panel)
  && /scrollIntoView\(\{ block: "nearest" \}\)/.test(panel));
console.log(`All ${n} passed.`);
process.exit(0);
