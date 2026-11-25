// The DM panel keeps its place across a repaint (SEAT 27 2026-11-25: turning the Spirit Board on or opening a drawer threw
// the Crooked Moon tab back to the top, the phrase box fell below the fold and lost focus, so Enter did nothing; a stray
// click after a jump hit the Druskenvald clock's Next Hour). scripts/repaint.js + scripts/dm-panel.js.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-panel-keep.mjs
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
globalThis.Element = class Element {};
const R = await import(pathToFileURL(path.join(ROOT, "scripts", "repaint.js")).href);
const panel = fs.readFileSync(path.join(ROOT, "scripts", "dm-panel.js"), "utf8");
const bible = fs.readFileSync(path.join(ROOT, "UI-BIBLE.md"), "utf8");

// A tiny stand-in for the panel's DOM: elements answer querySelectorAll by the selector they were made for.
function fakeRoot() {
  const root = { kids: [], listeners: {}, addEventListener(t, f) { this.listeners[t] = f; },
    contains(el) { return this.kids.includes(el); },
    querySelectorAll(sel) { return this.kids.filter((k) => k.sels.includes(sel)); } };
  return root;
}
function scroller(root) { const el = Object.assign(new Element(), { className: "mc-dmp-tabmid", sels: [".mc-dmp-tabmid"], scrollTop: 0 }); root.kids.push(el); return el; }
function field(root, value = "") {
  const el = Object.assign(new Element(), { tagName: "INPUT", attributes: [{ name: "class" }, { name: "data-seance-text" }], sels: ["input[data-seance-text]"],
    value, selectionStart: null, selectionEnd: null, disabled: false, focused: false,
    focus() { this.focused = true; },
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; } });
  root.kids.push(el);
  return el;
}

// ── 1–3. scroll ───────────────────────────────────────────────────────────────────────────────────────
{
  const root = fakeRoot();
  R.watchScroll(root);
  const a = scroller(root); a.scrollTop = 480;
  root.listeners.scroll({ target: a });               // the DM scrolled down to the Séance drawer
  const snap = R.captureScrolls(root);
  root.kids = []; const b = scroller(root);           // repaint 1: a fresh tab body
  R.restoreScrolls(root, snap);
  check("the rebuilt tab goes back to where the DM had scrolled", b.scrollTop === 480);
  const snap2 = R.captureScrolls(root);               // repaint 2 lands before the browser's scroll event for b
  root.kids = []; const c = scroller(root);
  R.restoreScrolls(root, snap2);
  check("…and a second repaint straight after (click + focus change) keeps it too, not the top", c.scrollTop === 480, String(c.scrollTop));
}
{
  const body = panel.slice(panel.indexOf("function renderNow()"), panel.indexOf("let returnField = null;"));
  const iHTML = body.indexOf("el.innerHTML = html;"), iBounds = body.indexOf("applyWorkspaceBounds();", iHTML),
    iClamp = body.indexOf("clampPos(el);", iHTML), iRestore = body.indexOf("restoreScrolls(el, prevScrolls);");
  check("scroll goes back only after the tab has its height cap (before it, the tab was too tall to scroll and snapped to the top)",
    iHTML > 0 && iBounds > iHTML && iClamp > iBounds && iRestore > iClamp, `${iHTML} ${iBounds} ${iClamp} ${iRestore}`);
}
// ── 4–7. focus and caret ──────────────────────────────────────────────────────────────────────────────
{
  const root = fakeRoot();
  const f = field(root, "HELL"); f.selectionStart = 4; f.selectionEnd = 4;
  const saved = R.captureField(f, root);
  check("the phrase box is known by what it is (its data name), not by where it sits", saved?.key === "input[data-seance-text]|0", JSON.stringify(saved));
  root.kids = []; const g = field(root, "HELL");
  const back = R.restoreField(root, saved);
  check("after the repaint the rebuilt box has focus again, caret where it was", back === g && g.focused && g.selectionStart === 4 && g.selectionEnd === 4);
  root.kids = []; const h = field(root, "");          // Send cleared the phrase
  R.restoreField(root, saved);
  check("the value is never put back (a sent phrase stays cleared); the caret fits the shorter text", h.value === "" && h.selectionStart === 0);
  root.kids = []; const d = field(root, "x"); d.disabled = true;
  check("a disabled or missing field is left alone", R.restoreField(root, saved) === null && R.restoreField(fakeRoot(), saved) === null);
}
check("dm-panel: a press on a button in the same drawer as the focused field hands focus back after the repaint, both repaint paths",
  /try \{ noteFieldPress\(ev\); \}/.test(panel)
  && /const box = ae\.closest\("\.mc-dt-drawer"\) \?\? ae\.parentElement;\s*if \(!btn \|\| !box\?\.contains\(btn\)\) return;/.test(panel)
  && /clampPos\(el\); returnFocusIfDue\(\); return; \}/.test(panel) && /restoreScrolls\(el, prevScrolls\);\s*if \(keepField\)[^\n]*\n\s*returnFocusIfDue\(\);/.test(panel));
check("…only for a moment (3 s), and never over a field the DM has since moved to", /Date\.now\(\) - r\.at > 3000/.test(panel) && /if \(isPanelTextField\(document\.activeElement\)\) \{ returnField = null; return; \}/.test(panel));
check("Enter sends and empties the box in place (the panel holds repaints while the box has focus)",
  /seanceDraft = "";[\s\S]{0,300}querySelector\("\[data-seance-text\]"\); if \(box\) box\.value = "";/.test(panel));
// ── 11–12. Next Hour needs two taps ───────────────────────────────────────────────────────────────────
{
  const h = panel.slice(panel.indexOf('if (ev.target.closest("[data-drusk-next]")) {'), panel.indexOf('if (ev.target.closest("[data-drusk-next]")) {') + 260);
  check("the panel's Next Hour: the first tap only arms it; the second, within 4 s, moves the clock",
    /if \(!druskArmed\(\)\) \{ druskArmAt = Date\.now\(\);[^\n]*return render\(\); \}\s*druskArmAt = 0; await druskNextHour\(\);/.test(h) && /const DRUSK_ARM_MS = 4000;/.test(panel));
  check("…and while armed it says so", /druskArmed\(\) \? "Tap Again: Next Hour" : "Next Hour"/.test(panel));
}
// ── 13–16. SEAT 27 re-run: a toggle pressed beside the focused box still repaints (the board read "on" after Off) ──
{
  const root = fakeRoot();
  const f = field(root, "GOODB"); f.selectionStart = 5; f.selectionEnd = 5;
  const keep = { ...R.captureField(f, root), value: f.value };
  root.kids = []; const g = field(root, "GOOD");      // rebuilt from a draft one keystroke behind
  R.restoreField(root, keep);
  check("a field rebuilt while focused keeps the DM's live text, focus and caret", g.value === "GOODB" && g.focused && g.selectionStart === 5);
}
{
  const body = panel.slice(panel.indexOf("function renderNow()"), panel.indexOf("let returnField = null;"));
  check("right after a press in the panel, or a deck press, a focused field no longer holds the repaint back",
    /if \(Date\.now\(\) > pressRenderUntil && !\(Date\.now\(\) - \(lastRun\.at \?\? 0\) < 3000\)\) \{ pendingRender = true; return; \}/.test(body)
    && /keepField = captureField\(ae, el\);\s*if \(keepField\) keepField\.value = ae\.value;/.test(body)
    && /if \(keepField\) \{ restoreField\(el, keepField\); pendingRender = false; \}/.test(body));
  check("…background ticks still wait while the DM types (the guard stays for them)", /pendingRender = true; return; \}/.test(body));
  check("any press in the panel outside a text field opens that moment (3 s)", /if \(!isPanelTextField\(ev\.target\)\) pressRenderUntil = Date\.now\(\) \+ 3000;/.test(panel));
}
check("UI-BIBLE §6.3 carries the rule", /A repaint keeps the DM's place/.test(bible));
console.log(`All ${n} passed.`);
process.exit(0);
