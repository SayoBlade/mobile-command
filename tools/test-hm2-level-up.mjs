// Hero Mancer 2's level-up on the phone (DM 2026-11-09: "Wouldn't the hm2 popup work in the phone?"). The phone offers
// HM2's own level-up window for the player's own character ONLY while the GM's "Send Level Up" is waiting (HM2's
// levelUpReady flag); character creation stays off the phone. Pure helpers (scripts/hm2.js), the shell's wiring, and
// the installed HM2's own facts the decision rests on.
// Run: node tools/test-hm2-level-up.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
let hm2 = { active: true, api: { openLevelUp: () => {} } };
globalThis.game = { modules: { get: (id) => (id === "hero-mancer" ? hm2 : null) } };
const { hm2Api, hm2LevelUpSent } = await import(pathToFileURL(path.join(ROOT, "scripts", "hm2.js")).href);
const pc = (flag) => ({ type: "character", getFlag: (m, k) => (m === "hero-mancer" && k === "levelUpReady" ? flag : undefined) });

check("HM2 active: its api is found", hm2Api() === hm2.api);
check("the GM sent a level-up (levelUpReady true): offered", hm2LevelUpSent(pc(true)));
check("none sent (flag absent or false): not offered", !hm2LevelUpSent(pc(undefined)) && !hm2LevelUpSent(pc(false)));
check("never for a non-character (a familiar, an NPC)", !hm2LevelUpSent({ ...pc(true), type: "npc" }));
hm2 = { active: false, api: { openLevelUp: () => {} } };
check("HM2 off: no api, nothing offered (the phone keeps dnd5e's own Level Up)", hm2Api() === null && !hm2LevelUpSent(pc(true)));

// LEVEL-UPS ARE PC-ONLY (DM 2026-11-11, deck-command D-0105): the phone offers no Level up unless `phoneLevelUp` is on
const { levelUpOffer, phoneLevelUps } = await import(pathToFileURL(path.join(ROOT, "scripts", "hm2.js")).href);
check("PC-only (the default): a sent level-up reads 'ask the DM at the PC'; nothing sent, nothing at all",
  levelUpOffer({ phone: false, hm2: true, sent: true, owner: true }) === "ask"
  && levelUpOffer({ phone: false, hm2: true, sent: false, owner: true }) === null
  && levelUpOffer({ phone: false, hm2: false, classes: 2 }) === null);
check("the setting off by default: phoneLevelUps() is false with no setting, and true only when set",
  phoneLevelUps() === false && (globalThis.game.settings = { get: (m, k) => m === "mobile-command" && k === "phoneLevelUp" }, phoneLevelUps() === true));
delete globalThis.game.settings;
check("phone level-ups switched back on: HM2's window when sent to the owner, dnd5e's flow without HM2",
  levelUpOffer({ phone: true, hm2: true, sent: true, owner: true }) === "hm2"
  && levelUpOffer({ phone: true, hm2: true, sent: false, owner: true }) === null
  && levelUpOffer({ phone: true, hm2: false, classes: 1 }) === "dnd5e");

const shell = fs.readFileSync(path.join(ROOT, "scripts", "shell.js"), "utf8");
check("the Lvl panel draws what levelUpOffer says: HM2's button, dnd5e's button, or the 'ask them at the PC' note",
  shell.includes("levelUpOffer({ phone: phoneLevelUps()") && shell.includes('data-action="hm2-level-up"') && shell.includes("ask them at the PC"));
check("the tap re-checks the setting, own character + still sent, then calls HM2's api.openLevelUp(actor)",
  /case "hm2-level-up": \{[\s\S]{0,260}!phoneLevelUps\(\) \|\| !actor\?\.isOwner \|\| actor\.type !== "character" \|\| !hm2LevelUpSent\(actor\)[\s\S]{0,200}hm2Api\(\)\.openLevelUp\(actor\)/.test(shell));
check("dnd5e's own level-up refuses too while the rule is on",
  shell.includes('case "level-up-open": return phoneLevelUps() ? this.#openLevelUp() : this.render();'));
check("the Lvl button carries the attention dot while a level-up waits, and the notice tells them to ask at the PC",
  shell.includes('hm2LevelUpSent(actor) ? "mc-lvl-ready" : ""') && shell.includes("the DM has a level-up for you — ask them at the PC."));
check("no character creation on the phone: nothing calls HM2's wizard or openWizardForPlayer", !/HEROMANCER|openWizard|hero-mancer"\)\.api\.open(?!LevelUp)/.test(shell));

// what the decision rests on, read from the installed HM2 (skipped when it is not installed here)
const hmFile = path.join(process.env.LOCALAPPDATA ?? "", "FoundryVTT", "Data", "modules", "hero-mancer", "hero-mancer.mjs");
if (fs.existsSync(hmFile)) {
  const src = fs.readFileSync(hmFile, "utf8");
  check("installed HM2 exposes api.openLevelUp, and its flag is levelUpReady", /openLevelUp:\s*\(?(\w+)\)?\s*=>\s*\w+\(\1\)/.test(src) /* the minified callee's name changes per build (3.4.3: vo) */ && src.includes('LEVEL_UP_READY:"levelUpReady"'));
  check("installed HM2 never touches the game canvas (only a DOM <canvas> for image colours)",
    !/\bcanvas\.(ready|scene|tokens|stage|app|grid|dimensions)\b/.test(src) && !/game\.canvas/.test(src));
} else console.log("(HM2 not installed here: its two source checks skipped)");

console.log(`\nall ${n} passed`);
