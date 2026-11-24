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
  T.registerTvCarousel({ on: (h) => seen.push(h) });
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
console.log(`All ${n} passed.`);
process.exit(0);
