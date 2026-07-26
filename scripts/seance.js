import { MODULE_ID } from "./preset.js";
import { isPhoneClient, isDisplayClient } from "./shell.js";

// §30 Séance board (DM-idea 2026-07-26, for a Crooked Moon game — "might be useful for others";
// flagged for a standalone-module spin-off later). A spirit-board overlay on the TV: the DM
// types a phrase on the panel; the planchette wakes slowly, circles once (the little dance),
// then drifts mark to mark — slow, a bit jerky — resting 2s on each, and returns to a DEAD
// STILL center when done (the heart never moves at rest, DM 2026-07-27).
//
// The board (per the module's layout): A–Z on the outer ring, digits 1–0 on an inner bottom
// arc, and four printed words — HELLO top-center, YES/NO flanking high, GOODBYE low-center.
// A phrase word that IS one of the printed words lands on it as a single stop instead of
// being spelled ("the spirits point").
//
// Layering (the decision that makes it work): the table art carries no glyphs at all — the
// widget draws every mark as SVG, so every target's polar position is exact, and the
// planchette's lens (chroma-keyed to tinted glass; tools/process-planchette.ps1) lands with
// the mark visible THROUGH it. State rides fxActive.seance (effects.js syncFx → seanceSync);
// phrases are fxOneShot broadcasts (id "seancePhrase").

const LETTER_R = 0.60;        // outer ring radius as a fraction of half the board
const DIGIT_R = 0.42;         // digits arc radius
const PLANCHETTE_FRAC = 0.30; // planchette width as a fraction of the board
// Lens center within the processed sprite (626x653, lens at 315,338) — the landing point.
const LENS_X = 315 / 626, LENS_Y = 338 / 653;
const HOLD_MS = 2000;

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "1234567890";
const D2R = Math.PI / 180;
// Printed words — polar positions in board units (angle: 0=right, 90°=down, -90°=up).
const WORDS = {
  HELLO: { a: -90 * D2R, r: 0.36 },
  YES: { a: -145 * D2R, r: 0.36 },
  NO: { a: -35 * D2R, r: 0.36 },
  GOODBYE: { a: 90 * D2R, r: 0.30 }
};

let root = null, planch = null, raf = 0;
let queue = [];       // token objects: {ch} | {word} | {space} | {dance:1|2}
let phase = "rest";   // rest | travel | hold | pause
let phaseT = 0, lastT = 0;
// Position in board polar coords: angle (rad) + radius in LETTER-ring units (1 = the A–Z ring).
let cur = { a: -Math.PI / 2, r: 0.22 };
let from = { ...cur }, to = { ...cur };
let travelMs = 1200;
let toIsRest = false;
let lastKey = null;   // the mark we're currently holding on (double-letter detection)

function eligible() {
  return !isPhoneClient() && (isDisplayClient() || game.user?.isGM);
}

function letterAngle(ch) {
  const i = LETTERS.indexOf(ch);
  return i < 0 ? null : -Math.PI / 2 + (i / 26) * Math.PI * 2; // A at the top, clockwise
}
function digitAngle(ch) {
  const i = DIGITS.indexOf(ch);
  return i < 0 ? null : (140 - i * (100 / 9)) * D2R; // 1 at bottom-left … 0 at bottom-right
}
// Target for a token, in {a, r-in-letter-ring-units} — null if the board has no such mark.
function targetFor(tok) {
  if (tok.word) { const w = WORDS[tok.word]; return { a: w.a, r: w.r / LETTER_R, key: tok.word }; }
  if (tok.ch) {
    const la = letterAngle(tok.ch);
    if (la != null) return { a: la, r: 1, key: tok.ch };
    const da = digitAngle(tok.ch);
    if (da != null) return { a: da, r: DIGIT_R / LETTER_R, key: tok.ch };
  }
  return null;
}

// Deterministic per-index jitter so the marks look hand-scratched but never reflow.
function jig(i, mag) { return Math.sin(i * 12.9898) * mag; }

function boardHTML() {
  const glyphs = [...LETTERS].map((ch, i) => {
    const a = letterAngle(ch);
    const deg = (a / D2R) + 90 + jig(i, 5);
    const x = 50 + Math.cos(a) * LETTER_R * 50;
    const y = 50 + Math.sin(a) * LETTER_R * 50;
    return `<text x="${x}" y="${y}" transform="rotate(${deg} ${x} ${y})" font-size="${4.4 + jig(i + 7, 0.35)}"
      text-anchor="middle" dominant-baseline="central">${ch}</text>`;
  }).join("");
  const digits = [...DIGITS].map((ch, i) => {
    const a = digitAngle(ch);
    const deg = (a / D2R) - 90 + jig(i + 31, 4); // upright-facing-center along the bottom arc
    const x = 50 + Math.cos(a) * DIGIT_R * 50;
    const y = 50 + Math.sin(a) * DIGIT_R * 50;
    return `<text x="${x}" y="${y}" transform="rotate(${deg} ${x} ${y})" font-size="${3.5 + jig(i + 13, 0.25)}"
      text-anchor="middle" dominant-baseline="central">${ch}</text>`;
  }).join("");
  const words = Object.entries(WORDS).map(([w, p], i) => {
    const x = 50 + Math.cos(p.a) * p.r * 50;
    const y = 50 + Math.sin(p.a) * p.r * 50;
    return `<text x="${x}" y="${y}" transform="rotate(${jig(i + 51, 3)} ${x} ${y})" font-size="3.1"
      letter-spacing="0.35" text-anchor="middle" dominant-baseline="central">${w}</text>`;
  }).join("");
  return `
    <div class="mc-seance-board">
      <img class="mc-seance-table" src="modules/${MODULE_ID}/art/seance-table.jpg" alt="">
      <svg class="mc-seance-letters" viewBox="0 0 100 100">${glyphs}${digits}${words}</svg>
      <img class="mc-seance-planchette" src="modules/${MODULE_ID}/art/planchette.png" alt="">
    </div>`;
}

export function seanceSync(on) {
  if (!eligible()) on = false;
  if (on && !root) {
    root = document.createElement("div");
    root.id = "mc-seance";
    root.innerHTML = boardHTML();
    document.body.appendChild(root);
    planch = root.querySelector(".mc-seance-planchette");
    cur = { a: -Math.PI / 2, r: 0.22 }; from = { ...cur }; to = { ...cur };
    phase = "rest"; queue = []; lastKey = null;
    lastT = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    place();
  } else if (!on && root) {
    cancelAnimationFrame(raf);
    raf = 0; root.remove(); root = null; planch = null; queue = [];
  }
}

export function seancePhrase(text) {
  if (!root) return; // board not up (or this client doesn't show it)
  const clean = String(text ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/ +/g, " ").trim().slice(0, 120);
  if (!clean) return;
  const wasIdle = phase === "rest" && !queue.length;
  for (const word of clean.split(" ")) {
    if (WORDS[word]) queue.push({ word });
    else for (const ch of word) queue.push({ ch });
    queue.push({ space: true });
  }
  queue.pop(); // no trailing beat
  if (wasIdle) {
    // The wake-up (DM 2026-07-27): from dead-still, start SLOWLY, then a circling dance,
    // and only then head for the first mark.
    queue.unshift({ dance: 1 }, { dance: 2 });
    nextTarget();
  } else if (phase === "rest") nextTarget();
}

function nextTarget() {
  const tok = queue.shift();
  if (tok === undefined) {
    from = { ...cur }; to = { a: cur.a, r: 0.22 };
    travelMs = 1800; phase = "travel"; phaseT = 0; toIsRest = true; lastKey = null;
    return;
  }
  toIsRest = false;
  if (tok.dance === 1) { // slow first stir — barely more than a shiver, gathering itself
    from = { ...cur };
    to = { a: cur.a + 1.1, r: 0.45 };
    travelMs = 2600; phase = "pause"; phaseT = 0;
    return;
  }
  if (tok.dance === 2) { // the little circle before business begins
    from = { ...cur };
    to = { a: cur.a + 2.4, r: 0.68 };
    travelMs = 1600; phase = "pause"; phaseT = 0;
    return;
  }
  if (tok.space) {
    from = { ...cur };
    to = { a: cur.a + 0.6, r: 0.45 };
    travelMs = 1100; phase = "pause"; phaseT = 0; lastKey = null;
    return;
  }
  const t = targetFor(tok);
  if (!t) return nextTarget(); // mark not on the board — skip
  // Same mark again (double letters): swing away first so the return reads as a second tap.
  if (lastKey === t.key) {
    queue.unshift(tok);
    from = { ...cur };
    to = { a: cur.a + (Math.random() < 0.5 ? 0.45 : -0.45), r: Math.max(0.3, cur.r - 0.2) };
    travelMs = 900; phase = "pause"; phaseT = 0; lastKey = null;
    return;
  }
  from = { ...cur };
  to = { a: t.a, r: t.r };
  const dist = Math.abs(angDiff(from.a, t.a)) + Math.abs(t.r - from.r);
  travelMs = 900 + Math.min(1, dist / Math.PI) * 1700; // farther = slower, never a snap
  phase = "travel"; phaseT = 0; lastKey = t.key;
}

function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function tick(t) {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(50, t - lastT);
  lastT = t;
  phaseT += dt;
  if (phase === "travel" || phase === "pause") {
    let p = Math.min(1, phaseT / travelMs);
    p = p * p * (3 - 2 * p); // smoothstep
    // The JERK: stutter the eased progress with small backslides — a hand, not a motor.
    p = Math.max(0, Math.min(1, p + Math.sin(t / 71) * 0.018 + Math.sin(t / 133) * 0.012));
    cur.a = from.a + angDiff(from.a, to.a) * p;
    cur.r = from.r + (to.r - from.r) * p;
    if (phaseT >= travelMs) {
      cur = { a: to.a, r: to.r };
      if (phase === "pause") { phase = "travel"; nextTarget(); }
      else if (toIsRest) phase = "rest"; // …and the heart goes STILL
      else { phase = "hold"; phaseT = 0; }
    }
  } else if (phase === "hold") {
    if (phaseT >= HOLD_MS) nextTarget();
  }
  place(t);
}

function place(t = 0) {
  if (!root || !planch) return;
  const board = root.querySelector(".mc-seance-board");
  const S = board.clientWidth;
  if (!S) return;
  const R = (S / 2) * LETTER_R;
  // Tremble only while ALIVE — at rest the heart is dead still (DM 2026-07-27).
  const resting = phase === "rest";
  const wob = resting ? 0 : phase === "hold" ? 0.0035 : 0.006;
  const nx = Math.sin(t / 97) * S * wob, ny = Math.cos(t / 83) * S * wob;
  const px = S / 2 + Math.cos(cur.a) * R * cur.r + nx;
  const py = S / 2 + Math.sin(cur.a) * R * cur.r + ny;
  const w = S * PLANCHETTE_FRAC;
  const h = w * (653 / 626);
  // The lens lands on the mark; the tip points outward (sprite's tip is +y/down).
  const rotDeg = (cur.a / D2R) - 90 + (resting ? 0 : Math.sin(t / 151) * 2.5);
  planch.style.width = `${w}px`;
  planch.style.transformOrigin = `${LENS_X * 100}% ${LENS_Y * 100}%`;
  planch.style.transform = `translate(${px - w * LENS_X}px, ${py - h * LENS_Y}px) rotate(${rotDeg}deg)`;
}
