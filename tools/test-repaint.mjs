// Headless check of repaint.js (§46) — no world, no server, no browser.
// The DOM here is a hand-rolled stand-in: just enough of Element for the key/ordinal logic, which
// is the part that can silently stop matching and quietly go back to snapping people to the top.
// Run: ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules \
//   "/c/Program Files/Foundry Virtual Tabletop 14/Foundry Virtual Tabletop.exe" tools/test-repaint.mjs
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");

class Element {
  constructor(className = "", children = []) {
    this.className = className;
    this.children = children;
    this.scrollTop = 0;
    this._listeners = [];
  }
  get descendants() {
    const out = [];
    for (const c of this.children) { out.push(c, ...c.descendants); }
    return out;
  }
  contains(el) { return el === this || this.descendants.includes(el); }
  querySelectorAll(sel) {
    const want = sel.split(".").filter(Boolean);
    return this.descendants.filter(el => {
      const have = String(el.className).split(/\s+/).filter(Boolean);
      return want.every(w => have.includes(w));
    });
  }
  addEventListener(type, fn) { this._listeners.push([type, fn]); }
  // Fire a capture-phase scroll as the browser would: the listener sits on the root, the event
  // target is the descendant that actually scrolled.
  scroll(target, top) {
    target.scrollTop = top;
    for (const [type, fn] of this._listeners) if (type === "scroll") fn({ target });
  }
}
globalThis.Element = Element;
globalThis.CSS = { escape: s => s };

const R = await import("file:///" + path.join(REPO, "scripts/repaint.js").replace(/\\/g, "/"));

let fails = 0;
const ok = (n, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}${extra ? " — " + extra : ""}`); if (!cond) fails++; };

// 1. sameHTML — the no-op gate. First sight is always a change; a repeat is not.
const rootA = new Element("root");
ok("first paint is a change", R.sameHTML(rootA, "<div>a</div>") === false);
ok("identical repaint is a no-op", R.sameHTML(rootA, "<div>a</div>") === true);
ok("changed markup repaints", R.sameHTML(rootA, "<div>b</div>") === false);
ok("…and settles again", R.sameHTML(rootA, "<div>b</div>") === true);
// Two surfaces (shell + panel) must not share a slot — they repaint independently.
const rootB = new Element("root");
R.sameHTML(rootB, "<div>b</div>");
ok("roots are tracked separately", R.sameHTML(rootA, "<div>b</div>") === true);

// 2. capture/restore — the real bug. The scroller is NOT the root and NOT the outer wrapper:
//    .mc-dmp-fly-body wraps .mc-dmp-tabfill > .mc-dmp-tabmid, and the innermost is what scrolls.
const build = () => {
  const mid = new Element("mc-dmp-tabmid");
  const fill = new Element("mc-dmp-tabfill", [mid]);
  const body = new Element("mc-dmp-fly-body", [fill]);
  const main = new Element("mc-dmp-scroll");
  const root = new Element("mc-dmp", [main, body]);
  return { root, main, body, fill, mid };
};

let d = build();
R.watchScroll(d.root);
ok("nothing scrolled → nothing to keep", R.captureScrolls(d.root) === null);

d.root.scroll(d.mid, 240);
const saved = R.captureScrolls(d.root);
ok("the inner scroller is captured", saved?.length === 1, JSON.stringify(saved));
ok("…at the right offset", saved?.[0]?.[1] === 240);
ok("the outer wrapper is NOT captured (its scrollTop is 0)", !saved?.some(([k]) => k.includes("fly-body")));

// The swap: same structure, brand-new nodes — exactly what innerHTML does.
const after = build();
after.root._listeners = d.root._listeners;
R.restoreScrolls(after.root, saved);
ok("the new inner scroller is put back", after.mid.scrollTop === 240);
ok("nothing else was touched", after.main.scrollTop === 0 && after.body.scrollTop === 0);

// 3. repeated structures — the ordinal has to pick the right one of several same-class boxes
const rows = [new Element("mc-row"), new Element("mc-row"), new Element("mc-row")];
const listRoot = new Element("mc-list", rows);
R.watchScroll(listRoot);
listRoot.scroll(rows[2], 88);
const rowSaved = R.captureScrolls(listRoot);
const listAfter = new Element("mc-list", [new Element("mc-row"), new Element("mc-row"), new Element("mc-row")]);
R.restoreScrolls(listAfter, rowSaved);
ok("the third row is the one restored", listAfter.children[2].scrollTop === 88);
ok("its siblings stay at the top", listAfter.children[0].scrollTop === 0 && listAfter.children[1].scrollTop === 0);

// 4. a scroller that no longer exists must be skipped, not thrown over
const gone = new Element("mc-vanished");
const goneRoot = new Element("mc-x", [gone]);
R.watchScroll(goneRoot);
goneRoot.scroll(gone, 50);
const goneSaved = R.captureScrolls(goneRoot);
let threw = false;
try { R.restoreScrolls(new Element("mc-x", []), goneSaved); } catch (e) { threw = true; }
ok("a vanished scroller is skipped silently", !threw);
ok("a null snapshot restores nothing", (R.restoreScrolls(new Element("mc-x"), null), true));

// 5. detached elements drop out of the capture (a previous repaint already replaced them)
const detachedRoot = new Element("mc-y", [new Element("mc-keep")]);
R.watchScroll(detachedRoot);
const orphan = new Element("mc-orphan");
detachedRoot.scroll(orphan, 30);      // scrolled, then removed from the tree
ok("a detached scroller is not captured", R.captureScrolls(detachedRoot) === null);

// 6. back at the top → nothing to restore (so a genuine scroll-to-top is never undone)
const topRoot = build();
R.watchScroll(topRoot.root);
topRoot.root.scroll(topRoot.mid, 120);
topRoot.root.scroll(topRoot.mid, 0);
ok("scrolled back to the top captures nothing", R.captureScrolls(topRoot.root) === null);

console.log(fails ? `\n${fails} FAILED` : "\nall green");
process.exit(fails ? 1 : 0);
