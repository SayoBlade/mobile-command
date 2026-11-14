// THE VE MOBILE LOOK, A TRIAL (lead 2026-11-14, VE-MOBILE-STYLE-2026-11-13): off by default; on, the Act tab's skin and
// the roll request's sheet with its Disadvantage · Normal · Advantage segment. Pure checks; stops at the first failure.
//   node tools/test-ve-trial.mjs
import fs from "node:fs";
import { veOn, veRollConfig, veRollWords, veRollSheetHTML, VE_MODES, veEnsureStyles, VE_CSS } from "../scripts/ve-trial.js";
const REPO = new URL("..", import.meta.url);
let n = 0;
function check(what, cond, got = "") { n += 1; if (cond) { console.log(`PASS ${n}. ${what}`); return; } console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`); console.log("Stopped at the first failure."); process.exit(1); }

const settings = fs.readFileSync(new URL("scripts/settings.js", REPO), "utf8");
const reg = /register\(MODULE_ID, "veTrial", \{[\s\S]*?\}\);/.exec(settings)?.[0] ?? "";
check("the switch is a world setting, shown in the settings, OFF by default", /scope: "world"/.test(reg) && /config: true/.test(reg) && /default: false/.test(reg), reg.slice(0, 200));
check("no setting read (a test rig, a client before ready) means off", veOn({}) === false && veOn({ game: { settings: { get: () => { throw new Error("not registered"); } } } }) === false);
check("on only when the setting is true", veOn({ game: { settings: { get: (m, k) => m === "mobile-command" && k === "veTrial" } } }) === true);

// the stylesheet loads itself (seat LIVE A11: a file added by an update is not linked until the world relaunches)
const fakeDoc = () => { const head = { kids: [], appendChild(el) { this.kids.push(el); } }; return { head, getElementById: (id) => head.kids.find((k) => k.id === id) ?? null, querySelectorAll: () => head.kids.filter((k) => k.rel === "stylesheet").map((k) => ({ getAttribute: () => k.href })), createElement: () => ({}) }; };
const d1 = fakeDoc();
check("on: the trial links its own stylesheet once", veOn({ document: d1, game: { settings: { get: () => true } } }) === true && d1.head.kids.length === 1 && d1.head.kids[0].href === VE_CSS && d1.head.kids[0].rel === "stylesheet");
veOn({ document: d1, game: { settings: { get: () => true } } });
check("and never twice", d1.head.kids.length === 1);
const d2 = fakeDoc(); veOn({ document: d2, game: { settings: { get: () => false } } });
check("off: nothing is linked", d2.head.kids.length === 0);
const d3 = fakeDoc(); d3.head.kids.push({ rel: "stylesheet", href: "modules/mobile-command/styles/ve-trial.css?v=1" });
check("a page that already links it (after a relaunch) is left alone", veEnsureStyles(d3) === false && d3.head.kids.length === 1);

check("the segment reads Disadvantage · Normal · Advantage, left to right", VE_MODES.map((m) => m[1]).join(" · ") === "Disadvantage · Normal · Advantage");
check("Advantage and Disadvantage go into the roll's own config; Normal adds nothing",
  JSON.stringify(veRollConfig("adv")) === '{"advantage":true}' && JSON.stringify(veRollConfig("dis")) === '{"disadvantage":true}' && JSON.stringify(veRollConfig("normal")) === "{}" && JSON.stringify(veRollConfig("junk")) === "{}");

const save = { rollType: "save", ability: "wis", label: "Wisdom", dc: 13 };
const w = veRollWords(save);
check("a save reads 'Wisdom save', the button 'Roll Wisdom Save', with its DC", w.name === "Wisdom save" && w.cta === "Roll Wisdom Save" && w.dc === 13, JSON.stringify(w));
check("a skill check reads 'Perception check'", veRollWords({ rollType: "check", skill: "prc", label: "Perception", dc: null }).name === "Perception check");
check("no DC sent, no DC shown (a blind check is his move): null stays null, never DC 0", veRollWords({ rollType: "save", label: "Wisdom", dc: null }).dc === null && veRollWords({ rollType: "save", label: "Wisdom", dc: "" }).dc === null);

const html = veRollSheetHTML(save);
check("the sheet has the kicker, the name, the DC pill and one committing button", /The DM asks for a roll/.test(html) && /Wisdom save/.test(html) && /mc-ve-pill">DC 13</.test(html) && (html.match(/data-action="roll-request"/g) ?? []).length === 1);
check("three modes, Normal picked unless the player picks", (html.match(/data-action="roll-request-mode"/g) ?? []).length === 3 && /mc-on" data-action="roll-request-mode" data-mode="normal"/.test(html));
check("the player's pick shows", /mc-on" data-action="roll-request-mode" data-mode="adv"/.test(veRollSheetHTML(save, { mode: "adv" })));
check("the dismiss stays, and the veil is a look, not a wall", /data-action="roll-request-x"/.test(html) && /mc-ve-veil" aria-hidden="true"/.test(html));
const init = veRollSheetHTML({ rollType: "initiative", label: "Initiative" });
check("initiative: no segment (it rolls the combatant), 'Roll Initiative'", !/roll-request-mode/.test(init) && /Roll Initiative/.test(init) && /Roll for initiative/.test(init));
check("names are escaped", !/<script>/.test(veRollSheetHTML({ rollType: "save", label: "<script>x</script>" })));

const css = fs.readFileSync(new URL("styles/ve-trial.css", REPO), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokenBlock = /^body \{[\s\S]*?^\}/m.exec(css)?.[0] ?? "";
const rules = css.replace(tokenBlock, "");
check("hexes live in the token block on body only; no rule pastes one (the 2026-07-17 lesson)", tokenBlock.length > 0 && !/#[0-9a-f]{3,8}\b/i.test(rules), (rules.match(/#[0-9a-f]{3,8}\b/gi) ?? []).join(","));
check("every rule is scoped to a trial surface (nothing else on the phone changes)",
  rules.split("}").map((r) => r.split("{")[0].trim()).filter(Boolean).every((sel) => /mc-ve-/.test(sel)));
check("one blur only (the veil)", (css.match(/(^|[^-])backdrop-filter:/g) ?? []).length === 1);
const mod = JSON.parse(fs.readFileSync(new URL("module.json", REPO), "utf8"));
check("the stylesheet ships with the module", mod.styles.includes("styles/ve-trial.css"));
console.log(`All ${n} passed.`);
