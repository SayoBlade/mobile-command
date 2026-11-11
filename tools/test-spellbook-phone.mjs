// Spell Book on the phone — the seat-test path (DM 2026-11-11: "can't we use Spell Book for this as a popup in the
// phone?"). Behind the world setting `phoneSpellBook` (off by default): a "Spell Book" button on the Spells tab and after
// a long rest opens the Spell Book module's own window for the player's own spellcaster, and the shell lifts that one
// frameless window full-screen. Pure helpers (scripts/spellbook-phone.js), the shell's wiring, and the installed Spell
// Book's own facts the path rests on.
// Run: node tools/test-spellbook-phone.mjs   (stops at the first failure)
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
const SB = await import(pathToFileURL(path.join(ROOT, "scripts", "spellbook-phone.js")).href);

const opened = [];
const api = { openSpellBookForActor: async (a) => { opened.push(a?.name); return {}; } };
const g = (active, { setting = false, onGlobal = true } = {}) => ({
  game: { modules: { get: (id) => (id === "spell-book" ? { active, api: onGlobal ? undefined : api } : null) },
    settings: { get: (m, k) => m === "mobile-command" && k === "phoneSpellBook" && setting } },
  SPELLBOOK: onGlobal ? { api } : undefined,
});
check("Spell Book active: its api is found on SPELLBOOK.api (or the module's api)", SB.spellBookApi(g(true)) === api && SB.spellBookApi(g(true, { onGlobal: false })) === api);
check("Spell Book off or absent: no api", SB.spellBookApi(g(false)) === null && SB.spellBookApi({ game: { modules: { get: () => null } } }) === null);
check("the test switch is off by default and on only when set", SB.phoneSpellBookOn(g(true)) === false && SB.phoneSpellBookOn(g(true, { setting: true })) === true);

const cls = (progression) => ({ type: "class", system: { spellcasting: { progression } } });
check("a spellcaster is a character with a casting class; a fighter or an NPC is not",
  SB.isSpellcaster({ type: "character", items: [cls("full")] }) && !SB.isSpellcaster({ type: "character", items: [cls("none")] })
  && !SB.isSpellcaster({ type: "npc", items: [cls("full")] }));
check("the button is offered only with the switch on, Spell Book there, the player's own spellcaster",
  SB.spellBookOffer({ on: true, api, owner: true, caster: true })
  && !SB.spellBookOffer({ on: false, api, owner: true, caster: true }) && !SB.spellBookOffer({ on: true, api: null, owner: true, caster: true })
  && !SB.spellBookOffer({ on: true, api, owner: false, caster: true }) && !SB.spellBookOffer({ on: true, api, owner: true, caster: false }));
check("Spell Book's player window is recognised by its id, its option id or its class; another app is not",
  SB.isSpellBookApp({ id: "player-spell-book" }) && SB.isSpellBookApp({ options: { classes: ["spell-book", "player-spell-book"] } })
  && !SB.isSpellBookApp({ id: "hero-mancer-app" }) && !SB.isSpellBookApp(null));
globalThis.game = g(true).game; globalThis.SPELLBOOK = { api };
check("the tap opens Spell Book through its own api for that character",
  (await SB.openSpellBookFor({ name: "Test Cleric" })) === true && opened.at(-1) === "Test Cleric");
delete globalThis.SPELLBOOK;

const shell = fs.readFileSync(path.join(ROOT, "scripts", "shell.js"), "utf8");
check("the Spells tab and the long-rest result draw the button (the rest's says 'Change prepared spells')",
  shell.includes("const sbBtn = this.#spellBookButtonHTML(actor);") && shell.includes('this.#spellBookButtonHTML(actor, "Change prepared spells")'));
check("the tap re-checks the offer, then calls openSpellBookFor(actor)",
  /case "spellbook-open": \{[\s\S]{0,300}spellBookOffer\(\{ on: phoneSpellBookOn\(\)[\s\S]{0,300}openSpellBookFor\(actor\)/.test(shell));
check("the lift takes Spell Book's frameless window BEFORE the frameless skip, full-screen, with the backdrop",
  /if \(isSpellBookApp\(app\)\) \{[\s\S]{0,900}mc-phone-spellbook[\s\S]{0,900}liftedApps\.set[\s\S]{0,200}\r?\n  \}\r?\n  if \(app\.options\?\.window\?\.frame === false\) return;/.test(shell));
const settings = fs.readFileSync(path.join(ROOT, "scripts", "settings.js"), "utf8");
check("the switch is a world setting, off by default", /register\(MODULE_ID, "phoneSpellBook", \{[\s\S]{0,500}scope: "world", config: true, type: Boolean, default: false/.test(settings));

// what the path rests on, read from the installed Spell Book (skipped when it is not installed here)
const sbFile = path.join(process.env.LOCALAPPDATA ?? "", "FoundryVTT", "Data", "modules", "spell-book", "spell-book.mjs");
if (fs.existsSync(sbFile)) {
  const src = fs.readFileSync(sbFile, "utf8");
  check("installed Spell Book: its player window has id player-spell-book and is frameless (so the usual lift would skip it)",
    /id:"player-spell-book"[\s\S]{0,300}window:\{frame:!1/.test(src));
  check("installed Spell Book: openSpellBookForActor is on its api, on globalThis.SPELLBOOK",
    src.includes("openSpellBookForActor:") && src.includes("globalThis.SPELLBOOK"));
  check("installed Spell Book: the only game-canvas reads are its token quick-access helpers (never called here)",
    (src.match(/canvas\.[a-zA-Z]+/g) ?? []).every((c) => c === "canvas.tokens"));
} else console.log("(Spell Book not installed here: its own facts skipped)");
console.log(`\nall ${n} passed`);
