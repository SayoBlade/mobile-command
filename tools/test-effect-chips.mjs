// S3 (deck-command MC-PATCHES-2026-11-09), seat R3 rerun 10: the phone showed a "New Effect" chip on the Test
// Barbarian after a level-up. An effect with no name of its own makes no chip, unless it carries a status.
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-effect-chips.mjs   (or plain node)
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import fs from "node:fs";

const REPO = new URL("..", import.meta.url);
const LANG = { "DND5E.EFFECT.New": "New Effect", "DOCUMENT.ActiveEffect": "Active Effect", "EFFECT.StatusProne": "Prone" };
globalThis.game = { i18n: { localize: (k) => LANG[k] ?? k } };
globalThis.CONFIG = { statusEffects: [{ id: "prone", name: "EFFECT.StatusProne" }] };
const { chipEffects, isPlaceholderName, placeholderNames } = await import(new URL("scripts/effect-chips.js", REPO));

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const fx = (name, statuses = []) => ({ id: name || "blank", name, statuses: new Set(statuses), img: "icons/svg/aura.svg" });
const names = (list) => chipEffects(list).map((c) => c.name);

check("the placeholders are dnd5e's 'New Effect' and core's 'Active Effect'", [...placeholderNames()].sort().join("|") === "Active Effect|New Effect");
check("a 'New Effect' makes no chip", names([fx("New Effect")]).length === 0);
check("an effect with an empty (or blank) name makes no chip", names([fx(""), fx("   "), fx(undefined)]).length === 0);
check("core's 'Active Effect' and 'Active Effect (2)' make no chip", names([fx("Active Effect"), fx("Active Effect (2)")]).length === 0);
check("a named one ('Rage') still does", names([fx("Rage")]).join() === "Rage");
check("a placeholder-named effect carrying a status keeps its chip, named by the status ('Prone')", names([fx("New Effect", ["prone"])]).join() === "Prone");
check("names that only contain the words stay ('New Effect of Bless', 'Rage (2)')", !isPlaceholderName("New Effect of Bless") && names([fx("Rage (2)")]).join() === "Rage (2)");
check("order is kept: Rage, Prone (the hidden one dropped from between)", names([fx("Rage"), fx("New Effect"), fx("", ["prone"])]).join() === "Rage,Prone");

const shell = fs.readFileSync(new URL("scripts/shell.js", REPO), "utf8");
check("the phone's condition strip builds its chips from chipEffects and prints the chip name",
  shell.includes("const chipList = chipEffects(actor.appliedEffects ?? []);") && shell.includes("foundry.utils.escapeHTML(chipName.get(e))")
  && !shell.includes("(actor.appliedEffects ?? []).filter(e => e.name)"));

console.log(`\nall ${n} passed`);
