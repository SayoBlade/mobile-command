// The fight carousel on the TV (DM 2026-11-24: "I'm also missing the combat carousel on tv"; SEAT 16 found
// #combat-dock 0×0 inside #ui-top, which the clean TV view hid). scripts/tv-carousel.js + styles/shell.css.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-tv-carousel.mjs
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
const T = await import(pathToFileURL(path.join(ROOT, "scripts", "tv-carousel.js")).href);
const css = fs.readFileSync(path.join(ROOT, "styles", "shell.css"), "utf8");
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");     // rules only, comments out
const rules = strip(css);
const block = (sel) => { const i = rules.indexOf(sel); return i < 0 ? "" : rules.slice(i, rules.indexOf("}", i) + 1); };

// ── 1–3. when the carousel shows ─────────────────────────────────────────────────────────────────
check("a started fight shows the carousel", T.tvFightOn({ started: true }) === true);
check("a fight still being set up, or none, does not", T.tvFightOn({ started: false }) === false && T.tvFightOn(null) === false && T.tvFightOn(undefined) === false);
{
  const cls = new Set();
  const body = { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } };
  T.syncTvFight(body, { started: true }); const a = cls.has(T.TV_FIGHT_CLASS);
  T.syncTvFight(body, null); const b = cls.has(T.TV_FIGHT_CLASS);
  check("the body class follows the fight: on when it starts, off when it ends", a === true && b === false);
}
// ── 4. it listens to every change of fight ─────────────────────────────────────────────────────────
{
  const seen = [];
  globalThis.document = { body: { classList: { toggle() {} } } }; globalThis.game = { combat: null };
  T.registerTvCarousel({ on: (h) => seen.push(h) }, { later: () => {} });
  check("start, update, delete, create and a scene change all re-check it", ["combatStart", "updateCombat", "deleteCombat", "createCombat", "canvasReady"].every((h) => seen.includes(h)), seen.join(","));
}
// ── 5–9. the TV's clean view ────────────────────────────────────────────────────────────────────────
check("#ui-top is no longer hidden whole (the dock sizes itself from its width)", !/body\.mc-clean #ui-top\s*[,{]/.test(rules));
check("…everything in #ui-top except the carousel is still hidden", /body\.mc-clean #ui-top > :not\(#combat-dock\)\s*\{\s*display:\s*none !important;/.test(rules));
check("the window-hiding rule spares the carousel (it is a Foundry window)", /body\.mc-clean \.application:not\(#mobile-command-shell\):not\(#combat-dock\)/.test(rules));
const off = block("body.mc-clean #combat-dock {"), on = block("body.mc-clean.mc-tv-fight #combat-dock {");
check("out of a fight the carousel is invisible, never display:none", /opacity:\s*0/.test(off) && /visibility:\s*hidden/.test(off) && !/display/.test(off), off);
check("in a fight it fades in, and fades out again (fade, never cut)", /opacity:\s*1/.test(on) && /visibility:\s*visible/.test(on) && /transition:\s*opacity \.6s/.test(off) && /transition:\s*opacity \.6s/.test(on), on);
// ── 10–11. the rest of the clean view is unchanged ──────────────────────────────────────────────────
check("the rest of Foundry's chrome is still hidden on the TV", ["#ui-left", "#ui-right", "#ui-bottom", "#sidebar", "#hotbar", "#players", "#scene-navigation"].every((id) => rules.includes(`body.mc-clean ${id}`)));
check("main.js starts it on the TV only, inside the display block", /if \(isDisplayClient\(\)\) \{[\s\S]{0,1500}registerTvCarousel\(\);/.test(main) && /import \{ registerTvCarousel \} from "\.\/tv-carousel\.js";/.test(main));
// ── 12–14. SEAT 17: which fight is the TV's (core's game.combat follows a sidebar the TV never shows) ──
{
  const fs1 = { id: "a", started: true, active: true, scene: { id: "FS" } };
  const other = { id: "b", started: true, active: true, scene: { id: "10.6" } };
  const setup = { id: "c", started: false, active: true, scene: { id: "FS" } };
  check("the started fight on the TV's map, even when core's current fight is a stale one elsewhere", T.tvFight([other, fs1], "FS", other) === fs1);
  check("a fight on another map, or one still being set up, is not the TV's", T.tvFight([other, setup], "FS", null) === null);
  check("a scene-less started fight counts; core's own pick is the fallback when it has started", T.tvFight([{ id: "d", started: true, scene: null }], "FS")?.id === "d" && T.tvFight([], "FS", fs1) === fs1);
}
// ── 15–19. the carousel's own open path, driven on the TV ─────────────────────────────────────────────
{
  const made = [];
  class CombatDock { constructor(c) { this.combat = c; this.rendered = false; made.push(this); fakeUi.combatDock = this; } render() { this.rendered = true; this.element = el(["hidden"]); } }
  const el = (cls) => { const set = new Set(cls); return { classList: { contains: (c) => set.has(c), remove: (c) => set.delete(c), add: (c) => set.add(c) } }; };
  const fakeUi = { combatDock: null };
  const ctd = { CombatDock };
  const fight = { id: "f1", started: true };
  check("no carousel on the TV: a fresh one is opened for the fight (its own constructor, so its own intro)", T.ensureDock(fight, { ctd, uiRef: fakeUi, now: 10000 }) === "opened" && made.length === 1 && made[0].combat === fight);
  check("…already showing that fight: left alone", T.ensureDock(fight, { ctd, uiRef: fakeUi, now: 10100 }) === "open" && made.length === 1);
  fakeUi.combatDock = { combat: fight, rendered: false, _closed: false };     // the seat's dock: made, never drawn
  check("a dock that never drew is replaced, but not twice within the gap (a render in flight)", T.ensureDock(fight, { ctd, uiRef: fakeUi, now: 10200 }) === "wait" && T.ensureDock(fight, { ctd, uiRef: fakeUi, now: 10000 + T.REOPEN_GAP_MS + 1 }) === "opened" && made.length === 2);
  const bodyCls = new Set(); const body = { classList: { add: (c) => bodyCls.add(c) } };
  check("still `hidden` after its intro should have run: unhidden the way its intro ends", T.unhideDock(fight, { uiRef: fakeUi, body }) === true && !fakeUi.combatDock.element.classList.contains("hidden") && bodyCls.has("ctd-dock-visible"));
  check("not hidden, a closed dock, another fight, no fight, no carousel: nothing touched", T.unhideDock(fight, { uiRef: fakeUi, body }) === false && T.unhideDock({ id: "x", started: true }, { uiRef: fakeUi, body }) === false && T.ensureDock(null, { ctd, uiRef: fakeUi }) === "no fight" && T.ensureDock(fight, { ctd: null, uiRef: fakeUi }) === "no carousel");
}
// ── 20. the seat can read what it did ─────────────────────────────────────────────────────────────────
check("globalThis.mcTvCarousel reports opens and unhides", globalThis.mcTvCarousel === T.tvCarouselState && T.tvCarouselState.opened >= 2 && T.tvCarouselState.unhid >= 1);
console.log(`All ${n} passed.`);
process.exit(0);
