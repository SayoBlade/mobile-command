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
    if (!el) continue;
    el.scrollTop = top;
    // Track the NEW node now: its scroll event only arrives a frame later, and a second repaint
    // before then (a click's render plus a focusout's) would find nothing tracked and drop to the top.
    const seen = tracked.get(root);
    if (seen && !seen.includes(el)) { seen.unshift(el); if (seen.length > MAX_TRACKED) seen.length = MAX_TRACKED; }
  }
}

// ── Focus across a repaint (SEAT 27, 2026-11-25) ────────────────────────────
// A press on a button beside a text field (the Spirit Board toggle beside the séance phrase) takes
// focus off the field, and the repaint then replaces the field — so the DM's Enter goes nowhere.
// `captureField` snapshots a field's identity (data-* names, else class + index) and caret;
// `restoreField` focuses the rebuilt field and puts the caret back. The VALUE is never restored:
// the field's own draft drives that, and a Send that cleared it must stay cleared.
function fieldKey(el, root) {
  const attrs = Array.from(el.attributes ?? []).map((a) => a.name).filter((n) => n.startsWith("data-")).sort();
  const sel = el.tagName.toLowerCase() + attrs.map((n) => `[${n}]`).join("");
  if (attrs.length) {
    let peers;
    try { peers = root.querySelectorAll(sel); } catch (e) { return null; }
    const idx = Array.prototype.indexOf.call(peers, el);
    return idx < 0 ? null : `${sel}|${idx}`;
  }
  return scrollKey(el, root);
}

export function captureField(el, root) {
  if (!el || !root?.contains?.(el)) return null;
  const key = fieldKey(el, root);
  if (!key) return null;
  let start = null, end = null;
  try { start = el.selectionStart; end = el.selectionEnd; } catch (e) { /* number inputs have no caret */ }
  return { key, start, end };
}

export function restoreField(root, saved) {
  if (!saved?.key || !root) return null;
  const cut = saved.key.lastIndexOf("|");
  let el;
  try { el = root.querySelectorAll(saved.key.slice(0, cut))[Number(saved.key.slice(cut + 1))]; } catch (e) { return null; }
  if (!el || el.disabled) return null;
  // `value` only when the caller kept the LIVE text of a field rebuilt while focused (what the DM sees).
  if (saved.value !== undefined && el.value !== saved.value) el.value = saved.value;
  try { el.focus({ preventScroll: true }); } catch (e) { return null; }
  const len = String(el.value ?? "").length;
  if (saved.start != null) { try { el.setSelectionRange(Math.min(saved.start, len), Math.min(saved.end ?? saved.start, len)); } catch (e) { /* no caret */ } }
  return el;
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

// ── Fade, never cut (UI-BIBLE §6.8) ─────────────────────────────────────────
// DM 2026-08-19: "when ever switching screens for features like this use a fade of some sort,
// don't cut." Full-screen table overlays — the station, the séance board, the card table — were
// each created and removed outright, so the shared screen snapped between worlds. These two do the
// whole job: mount transparent and let a frame pass before lighting up (with no frame in between
// the browser has nothing to transition FROM, and the fade-in silently becomes the cut), and on
// the way out drop the class, then remove only once the fade has actually run.
const FADE_MS = 1400;

/** Append `el` to the body and fade it in. */
export function mountFaded(el, parent = document.body) {
  el.classList.add("mc-fade-mount");
  parent.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("mc-on")));
  return el;
}

/** Fade `el` out and remove it. Returns immediately — the caller drops its reference now. */
export function unmountFaded(el, ms = FADE_MS) {
  if (!el) return;
  el.classList.remove("mc-on");
  setTimeout(() => { try { el.remove(); } catch (e) { /* already gone */ } }, ms + 100);
}
