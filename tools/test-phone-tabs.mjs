// The phone's named tabs (MC redesign, DM 2026-11-26 on sheet 11: "Ok, names work, I'm convinced"): a named five-tab
// bar (Act · Sheet · Play · Bag · Story), Spells folded into Act behind an Actions / Spells switch. By source:
// scripts/shell.js and styles/shell.css.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-phone-tabs.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import fs from "node:fs";
const REPO = new URL("..", import.meta.url);
const S = fs.readFileSync(new URL("scripts/shell.js", REPO), "utf8");
const C = fs.readFileSync(new URL("styles/shell.css", REPO), "utf8");
let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const bar = S.slice(S.indexOf("  #tabBarHTML() {"), S.indexOf("  // §35.1: same gate as the DM tab"));
const main = bar.slice(bar.indexOf("const actOn"));
const core = [...main.matchAll(/this\.#tabButton\("(\w+)", "[\w-]+", "(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`);

check("the bar's five core tabs, in order: Act · Sheet · Play · Bag · Story", core.join(",") === "actions:Act,details:Sheet,sheet:Play,equipment:Bag,journal:Story", core.join());
check("Spells is no longer a tab on the bar", !/#tabButton\("spells"/.test(bar));
check("every tab carries its name under the glyph (core, campaign, Party, the packed bar)",
  /<i class="fas \$\{icon\}"><\/i><small class="mc-tab-name">\$\{label\}<\/small>/.test(S) && /mc-icon-cmoon"><\/i><small class="mc-tab-name">Moon<\/small>/.test(bar)
  && /fa-people-group"><\/i><small class="mc-tab-name">Party<\/small>/.test(bar) && /<small class="mc-tab-name">\$\{name\}<\/small><\/button>/.test(bar) && /<small class="mc-tab-name">Mine<\/small>/.test(bar));
check("Play keeps the centre: the Party switch joins at the left edge, the campaign tab at the right",
  /return `\$\{partyBtn\}\s*\$\{this\.#tabButton\("actions"/.test(bar) && /\$\{this\.#tabButton\("journal", "fa-feather", "Story"\)\}\s*\$\{cmTab\}`;/.test(bar));
check("Act is lit on either of its views and reopens on the one last used",
  /const actOn = this\.#tab === "actions" \|\| this\.#tab === "spells";/.test(bar) && /this\.#actLast === "spells" \? "spells" : "actions"/.test(bar)
  && /if \(this\.#tab === "actions" \|\| this\.#tab === "spells"\) this\.#actLast = this\.#tab;/.test(S));

const sw = S.slice(S.indexOf("  #actSwitchHTML(actor) {"), S.indexOf("  // Bottom bar."));
check("the switch: Actions then Spells, glyph and word, each a tab press", /b\("actions", "fa-hand-fist", "Actions"\)\}\$\{b\("spells", "fa-wand-sparkles", "Spells"\)/.test(sw) && /data-action="tab" data-tab="\$\{id\}"/.test(sw));
check("a hero who casts nothing sees no switch and never lands on Spells",
  /if \(!this\.#casts\(actor\)\) return "";/.test(sw) && /if \(this\.#tab === "spells" && !this\.#casts\(actor\)\) this\.#tab = "actions";/.test(S));
check("both views draw the switch on top", /return this\.#actSwitchHTML\(actor\) \+ this\.#actionsHTML\(actor\);/.test(S) && /return this\.#actSwitchHTML\(actor\) \+ this\.#spellsHTML\(actor\);/.test(S));
check("'casts' is the Spells view's own test (own spells, not item-granted, or spell slots)",
  /i\.type === "spell" && !i\.getFlag\?\.\("dnd5e", "cachedFor"\)/.test(S.slice(S.indexOf("  #casts(actor) {"), S.indexOf("  #actSwitchHTML"))) && /\(sl\?\.max \?\? 0\) > 0/.test(S));
check("touch sizes: tabs at least 52px tall with the name, the switch 44px", /\.mc-tab \{ flex-direction: column; gap: 3px; padding: 9px 0 7px; min-height: 52px; \}/.test(C) && /\.mc-actsw-btn \{ flex: 1 1 0; min-height: 44px;/.test(C));
console.log(`\nAll ${n} passed.`);
