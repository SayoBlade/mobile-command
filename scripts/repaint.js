// Repaint hygiene — shared by the phone shell and the DM panel (UI-BIBLE §6.3, "don't jump").
//
// Both surfaces repaint by rewriting innerHTML, and both are driven by background hooks that fire
// on a timer: the world clock (`updateWorldTime`, which Simple Calendar and the §41 daylight loop
// both tick), presence, combat, targeting. Rewriting innerHTML resets scrollTop on every scroll
// container inside it — so a DM reading a tab, or a player reading a journal page, gets yanked back
// to the top every few seconds. DM 2026-08-19: *"when i scroll down and try to read something it
// snaps back up to the top"*.
//
// Two fixes, both general — no per-view patching (the hand-listed "preserve .mc-content and
// .mc-dmp-fly-body" approach is exactly what let every OTHER scroller regress):
//
//   1. `sameHTML` — if a repaint would produce byte-identical HTML, don't touch the DOM at all.
//      Most timer-driven repaints change nothing visible, so this removes the problem at source
//      and is strictly cheaper than the rebuild it replaces.
//   2. `watchScroll` / `captureScrolls` / `restoreScrolls` — when the HTML genuinely DID change,
//      put every scroller back where it was, found by observation rather than by a list someone
//      has to remember to extend.

// Which elements have actually been scrolled, per repaint root. Recorded from a capture-phase
// listener (scroll doesn't bubble) rather than by walking the DOM: the walk would have to read
// scrollTop off every node, forcing a layout on each repaint, and this costs nothing on the hot
// path. Bounded at MAX_TRACKED, most-recent-first, so dead nodes can't accumulate.
const MAX_TRACKED = 6;
const tracked = new WeakMap();

/** Start recording scroll positions inside `root`. Idempotent — safe to call on every repaint. */
export function watchScroll(root) {
  if (!root || tracked.has(root)) return;
  const seen = [];
  tracked.set(root, seen);
  root.addEventListener("scroll", (ev) => {
    const el = ev.target;
    if (!(el instanceof Element) || el === root) return;
    const at = seen.indexOf(el);
    if (at === 0) return;
    if (at > 0) seen.splice(at, 1);
    seen.unshift(el);
    if (seen.length > MAX_TRACKED) seen.length = MAX_TRACKED;
  }, true);
}

// An element's identity across an innerHTML swap: its class selector plus its index among
// same-class elements in the root. Classes are how this codebase names structure (UI-BIBLE §9),
// so they survive a repaint even though the nodes themselves don't. Index is the tiebreaker for
// repeated structures (drawer bodies, PM threads).
function scrollKey(el, root) {
  const cls = (typeof el.className === "string" ? el.className : "").trim();
  if (!cls) return null;
  const esc = globalThis.CSS?.escape ?? (s => s);
  const sel = "." + cls.split(/\s+/).map(esc).join(".");
  let peers;
  try { peers = root.querySelectorAll(sel); } catch (e) { return null; } // a class we can't select on
  const idx = Array.prototype.indexOf.call(peers, el);
  return idx < 0 ? null : `${sel}|${idx}`;
}

/** Snapshot every live scroller inside `root`. Returns null when there's nothing to keep. */
export function captureScrolls(root) {
  const seen = tracked.get(root);
  if (!seen?.length) return null;
  const out = [];
  for (const el of seen) {
    if (!root.contains(el)) continue;   // already gone — a previous repaint replaced it
    const top = el.scrollTop;
    if (!top) continue;                 // at the top anyway: nothing to restore
    const key = scrollKey(el, root);
    if (key) out.push([key, top]);
  }
  return out.length ? out : null;
}

/** Put the snapshot back after the swap. Anything that no longer exists is silently skipped. */
export function restoreScrolls(root, saved) {
  if (!saved) return;
  for (const [key, top] of saved) {
    const cut = key.lastIndexOf("|");
    const sel = key.slice(0, cut);
    const idx = Number(key.slice(cut + 1));
    let el;
    try { el = root.querySelectorAll(sel)[idx]; } catch (e) { continue; }
    if (el) el.scrollTop = top;
  }
}

// Last HTML produced per root, for the no-op check. WeakMap so a closed app's markup isn't held.
const lastHTML = new WeakMap();

/**
 * True when `html` is exactly what this root was last painted with — i.e. the repaint would be a
 * no-op and can be skipped whole. Records `html` either way, so the next call compares against
 * what was actually intended rather than against whatever the DOM has drifted to.
 *
 * Deliberately compares the GENERATED string, not the live DOM: transient state applied outside a
 * repaint (a search filter hiding rows, a drag-over class, a focused input's value) is state we
 * want to survive, and comparing against the DOM would throw it away on every tick.
 */
export function sameHTML(root, html) {
  const same = lastHTML.get(root) === html;
  lastHTML.set(root, html);
  return same;
}
