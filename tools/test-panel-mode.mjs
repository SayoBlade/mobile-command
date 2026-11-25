// The panel's mode and the deck pill (MC redesign phase 4.1, DM 2026-11-26: 2A, "a manual pill now; Auto later").
// scripts/panel-mode.js (pure) + the panel, settings and main.js seam (by source).
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-panel-mode.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import fs from "node:fs";
const REPO = new URL("..", import.meta.url);
const M = await import(new URL("scripts/panel-mode.js", REPO));
let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const pill = (rf = "auto") => M.pillOf(rf).label;

/* ── 1–4. the setting's base ───────────────────────────────────────────────────────────────────────── */
M.resetPanelMode();
check("Auto with no word from the deck: full, pill 'No deck'", !M.isCompact("auto") && pill() === "No deck");
check("Run from Deck: compact, pill 'Deck'", M.isCompact("deck") && pill("deck") === "Deck");
check("Run from Panel: full", !M.isCompact("panel") && pill("panel") === "No deck");
M.reportDeck(true, "auto");
check("the deck's first report at load (reachable): Auto goes compact, no offer", M.isCompact("auto") && pill() === "Deck");

/* ── 5–7. the pill is a manual switch ──────────────────────────────────────────────────────────────── */
M.tapPill("auto");
check("tap the green pill: the full panel, pill 'Full panel' (your hold)", !M.isCompact("auto") && pill() === "Full panel");
M.tapPill("auto");
check("tap again: compact, back to 'Deck'", M.isCompact("auto") && pill() === "Deck" && M.panelModeState.override === null);
M.resetPanelMode();
M.tapPill("auto");
check("no deck reported, the DM taps 'No deck' (running from the deck by hand): compact", M.isCompact("auto") && pill() === "Deck");

/* ── 8–11. growing is automatic, shrinking is offered ─────────────────────────────────────────────── */
M.resetPanelMode();
M.reportDeck(true, "auto");
let what = M.reportDeck(false, "auto");
check("the deck drops: the full panel is back at once, one notice ('lost'), pill 'Deck lost'", what === "lost" && !M.isCompact("auto") && pill() === "Deck lost");
what = M.reportDeck(true, "auto");
check("the deck returns: nothing moves (still full), the pill offers 'Shrink?'", what === "back" && !M.isCompact("auto") && pill() === "Shrink?");
M.tapPill("auto");
check("tap 'Shrink?': compact", M.isCompact("auto") && pill() === "Deck");
M.tapPill("auto"); M.reportDeck(false, "auto");
check("a drop while you held the full panel: no notice (nothing changed under you)", M.reportDeck(false, "auto") === null && !M.isCompact("auto"));

/* ── 12–15. by source ──────────────────────────────────────────────────────────────────────────────── */
const src = (f) => fs.readFileSync(new URL(`scripts/${f}`, REPO), "utf8");
check("'Run from' is a per-screen setting: Auto · Deck · Panel, default Auto",
  /register\(MODULE_ID, "runFrom", \{[\s\S]*?scope: "client"[\s\S]*?choices: \{ auto: "Auto", deck: "Deck", panel: "Panel" \}[\s\S]*?default: "auto"/.test(src("settings.js")));
const panel = src("dm-panel.js");
check("the pill sits at the end of the presence row and a tap flips it", /\$\{chips\}<\/div>\$\{deckPill\}<\/div>/.test(panel) && /\[data-deck-pill\]"\)\) \{ tapPill\(runFrom\(\)\)/.test(panel));
check("the panel carries mc-deck-mode while compact, on every repaint (the skip path too)", /el\.classList\.toggle\("mc-deck-mode", panelCompact\(\)\);[^\n]*\n\s*if \(sameHTML\(el, html\)\)/.test(panel));
check("Deck Command's seam: MobileCommand.deck.report(reachable), one notice when the deck is lost",
  /deck: \{\s*report: \(reachable\) =>/.test(src("main.js")) && /if \(what === "lost"\) notifier\.info\("Deck lost: the full panel is back\."\)/.test(src("main.js")));
console.log(`\nAll ${n} passed.`);
