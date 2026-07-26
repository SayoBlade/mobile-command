import { MODULE_ID } from "./preset.js";
import { isPhoneClient, isDisplayClient } from "./shell.js";

// §30 Séance board (DM-idea 2026-07-26, for a Crooked Moon game — "might be useful for others").
// A spirit-board overlay on the TV: the DM types a phrase on the panel; the planchette drifts
// letter to letter — slow, a bit jerky — resting 2s on each, then returns to the center and
// waits. Layering (the decision that makes it work): the TABLE ART carries no letters at all
// (image models butcher radial text, and baked letters have unknowable coordinates) — the
// widget draws the letter ring itself as SVG, so every glyph's angle is exact and the
// planchette's see-through lens (chroma-keyed + punched in tools/process-planchette.ps1)
// lands dead-on with the letter visible THROUGH the glass.
//
// Visibility: the display client and the DM's own (non-phone) client — table theatre, not a
// phone feature. State rides fxActive.seance (effects.js syncFx calls seanceSync), so the TV
// re-mounts after a reload mid-scene; phrases are fxOneShot broadcasts (id "seancePhrase").

const BOARD_FRAC = 0.72;      // board size as a fraction of the smaller viewport side
const LETTER_R = 0.60;        // letter ring radius as a fraction of half the board
const PLANCHETTE_FRAC = 0.30; // planchette width as a fraction of the board
// Lens center within the processed sprite (tools/process-planchette.ps1 output: 626x653,
// lens at 315,338) — the point that must land on a glyph.
const LENS_X = 315 / 626, LENS_Y = 338 / 653;
const HOLD_MS = 2000;

let root = null;      // the overlay element, or null
let planch = null;    // the planchette <img>
let raf = 0;
let queue = [];       // remaining letters of the current phrase (uppercase, " " = pause)
let phase = "rest";   // rest | travel | hold | pause
let phaseT = 0;       // ms elapsed in the current phase
let lastT = 0;
// Position in board polar coords: angle (rad) + radius (fraction of letter-ring radius).
let cur = { a: -Math.PI / 2, r: 0.22 };
let from = { ...cur };
let to = { ...cur };
let travelMs = 1200;

function eligible() {
  return !isPhoneClient() && (isDisplayClient() || game.user?.isGM);
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function letterAngle(ch) {
  const i = LETTERS.indexOf(ch);
  return i < 0 ? null : -Math.PI / 2 + (i / 26) * Math.PI * 2; // A at the top, clockwise
}

// Deterministic per-index jitter so the ring looks hand-scratched but never reflows.
function jig(i, mag) { return Math.sin(i * 12.9898) * mag; }

function boardHTML() {
  const glyphs = [...LETTERS].map((ch, i) => {
    const a = letterAngle(ch);
    const deg = (a * 180) / Math.PI + 90 + jig(i, 5); // baseline follows the circle
    const x = 50 + Math.cos(a) * LETTER_R * 50;
    const y = 50 + Math.sin(a) * LETTER_R * 50;
    const size = 4.4 + jig(i + 7, 0.35);
    return `<text x="${x}" y="${y}" transform="rotate(${deg} ${x} ${y})" font-size="${size}"
      text-anchor="middle" dominant-baseline="central">${ch}</text>`;
  }).join("");
  return `
    <div class="mc-seance-board">
      <img class="mc-seance-table" src="modules/${MODULE_ID}/art/seance-table.jpg" alt="">
      <svg class="mc-seance-letters" viewBox="0 0 100 100">${glyphs}</svg>
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
    phase = "rest"; queue = [];
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
  const clean = String(text ?? "").toUpperCase().replace(/[^A-Z ]/g, "").replace(/ +/g, " ").trim().slice(0, 120);
  if (!clean) return;
  queue.push(...clean.split(""));
  if (phase === "rest") nextTarget();
}

function nextTarget() {
  const ch = queue.shift();
  if (ch === undefined) {
    // phrase done — drift home and wait
    from = { ...cur }; to = { a: cur.a, r: 0.22 };
    travelMs = 1600; phase = "travel"; phaseT = 0; toIsRest = true;
    return;
  }
  toIsRest = false;
  if (ch === " ") {
    // a beat between words: wander toward the middle
    from = { ...cur };
    to = { a: cur.a + 0.6, r: 0.45 };
    travelMs = 1100; phase = "pause"; phaseT = 0;
    return;
  }
  const a = letterAngle(ch);
  // Same letter again (double letters): swing away first so the return reads as a second tap.
  const dSame = Math.abs(angDiff(cur.a, a));
  if (cur.r > 0.9 && dSame < 0.05) {
    queue.unshift(ch);
    from = { ...cur };
    to = { a: cur.a + (Math.random() < 0.5 ? 0.45 : -0.45), r: 0.8 };
    travelMs = 900; phase = "pause"; phaseT = 0;
    return;
  }
  from = { ...cur };
  to = { a, r: 1 };
  const dist = Math.abs(angDiff(from.a, a)) + Math.abs(to.r - from.r);
  travelMs = 900 + Math.min(1, dist / Math.PI) * 1700; // farther = slower, never a snap
  phase = "travel"; phaseT = 0;
}
let toIsRest = false;

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
      else if (toIsRest) phase = "rest";
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
  // Idle tremble — the planchette is never perfectly still.
  const wob = phase === "hold" || phase === "rest" ? 0.0035 : 0.006;
  const nx = Math.sin(t / 97) * S * wob, ny = Math.cos(t / 83) * S * wob;
  const px = S / 2 + Math.cos(cur.a) * R * cur.r + nx;
  const py = S / 2 + Math.sin(cur.a) * R * cur.r + ny;
  const w = S * PLANCHETTE_FRAC;
  const h = w * (653 / 626);
  // The lens lands on the point; the tip points outward (sprite's tip is +y/down).
  const rotDeg = (cur.a * 180) / Math.PI - 90 + Math.sin(t / 151) * 2.5;
  planch.style.width = `${w}px`;
  planch.style.transformOrigin = `${LENS_X * 100}% ${LENS_Y * 100}%`;
  planch.style.transform = `translate(${px - w * LENS_X}px, ${py - h * LENS_Y}px) rotate(${rotDeg}deg)`;
}
