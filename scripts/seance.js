import { MODULE_ID } from "./preset.js";
import { isPhoneClient, isDisplayClient } from "./shell.js";

// §30 Séance board (DM-idea 2026-07-26, for a Crooked Moon game — "might be useful for others";
// flagged for a standalone-module spin-off later). A spirit-board overlay on the TV: the DM
// types a phrase on the panel; the planchette wakes slowly, circles once (the little dance),
// then moves mark to mark and returns to a DEAD STILL center when done (the heart never moves
// at rest, DM 2026-07-27). Three gaits (DM 2026-07-27 live feedback): spelled phrases hurry
// with jittered timing and occasional sharp darts; the wake-up, the four printed words, and
// short one-word replies keep the slow spooky crawl.
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

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "1234567890";
const D2R = Math.PI / 180;
// Printed words — an X of four diagonals, each ROTATED TO FACE ITS SIDE of the table
// (people sit AROUND the TV, DM 2026-07-27: glyph-tops point at the center, so the person
// beyond that corner reads their word upright). Sized to FIT INSIDE THE LENS when the
// planchette lands (lens ≈ 12.6 units across at these proportions); GOODBYE breaks into
// two centered lines for the same reason. lines = render lines; size = font units.
const WORDS = {
  YES: { a: -135 * D2R, r: 0.32, lines: ["YES"], size: 2.6 },
  NO: { a: -45 * D2R, r: 0.32, lines: ["NO"], size: 2.6 },
  HELLO: { a: 135 * D2R, r: 0.32, lines: ["HELLO"], size: 2.0 },
  GOODBYE: { a: 45 * D2R, r: 0.32, lines: ["GOOD", "BYE"], size: 2.0 }
};

let root = null, planch = null, raf = 0;
let queue = [];       // token objects: {ch} | {word} | {space} | {dance:1|2}
let phase = "rest";   // rest | travel | hold | pause
let phaseT = 0, lastT = 0;
// Position in board polar coords: angle (rad) + radius in LETTER-ring units (1 = the A–Z ring).
let cur = { a: -Math.PI / 2, r: 0.22 };
let from = { ...cur }, to = { ...cur };
let travelMs = 1200;
let holdMs = 2000;    // per-stop rest on the mark — long for drama, short mid-spell
let toIsRest = false;
let lastKey = null;   // the mark we're currently holding on (double-letter detection)

function eligible() {
  return !isPhoneClient() && (isDisplayClient() || game.user?.isGM);
}

// ── the scrape (§26.2 house rule: synthesized, nothing licensed) ─────────────
// Wood dragging on wood: a narrow noise band whose GAIN follows the planchette's actual
// speed — silent at rest and during holds, a faint grainy drag while it travels. The
// granular wobble (random gain kicks every ~90ms) is what makes it scrape, not hiss.
// (Tiny local copy of effects.js's audio helpers — importing them would close an
// effects⇄seance module cycle, which this codebase deliberately avoids.)
let scrape = null; // { ctx, g, wobbleIv, src } | null
function audioOut() {
  const a = game.audio;
  if (!a || a.locked || !a.environment?.gainNode) return null;
  return { ctx: a.environment, dest: a.environment.gainNode };
}
function scrapeStart() {
  if (scrape) return;
  const out = audioOut();
  if (!out) return; // pre-gesture — a silent séance beats a console error
  const { ctx, dest } = out;
  const len = 2 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1050; bp.Q.value = 1.6;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(bp).connect(lp).connect(g).connect(dest);
  src.start();
  const wobbleIv = setInterval(() => {
    // grain: brief random kicks around the current drive level (set each tick via scrapeDrive)
    const base = scrape?.drive ?? 0;
    if (base > 0.002) g.gain.setTargetAtTime(base * (0.55 + Math.random() * 0.9), ctx.currentTime, 0.03);
  }, 90);
  scrape = { ctx, g, wobbleIv, src, drive: 0 };
}
function scrapeDrive(level) {
  if (!scrape) { if (level > 0) scrapeStart(); if (!scrape) return; }
  scrape.drive = level;
  if (level <= 0.002) scrape.g.gain.setTargetAtTime(0, scrape.ctx.currentTime, 0.08);
}
function scrapeStop() {
  if (!scrape) return;
  clearInterval(scrape.wobbleIv);
  try { scrape.g.gain.setTargetAtTime(0, scrape.ctx.currentTime, 0.05); } catch (e) { /* ctx died */ }
  const s = scrape; scrape = null;
  setTimeout(() => { try { s.src.stop(); s.g.disconnect(); } catch (e) { /* already gone */ } }, 400);
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
    // Face the reader beyond this corner: glyph-tops toward the board center.
    const deg = p.a / D2R - 90 + jig(i + 51, 2);
    const lineH = p.size * 1.15;
    const spans = p.lines.map((ln, li) =>
      `<tspan x="${x}" dy="${li === 0 ? -((p.lines.length - 1) * lineH) / 2 : lineH}">${ln}</tspan>`).join("");
    return `<text x="${x}" y="${y}" transform="rotate(${deg} ${x} ${y})" font-size="${p.size}"
      letter-spacing="0.3" text-anchor="middle" dominant-baseline="central">${spans}</text>`;
  }).join("");
  return `
    <div class="mc-seance-board">
      <img class="mc-seance-table" src="modules/${MODULE_ID}/art/seance-table.jpg" alt="">
      <svg class="mc-seance-letters" viewBox="0 0 100 100">${glyphs}${digits}${words}</svg>
      <div class="mc-seance-planchette">
        <img src="modules/${MODULE_ID}/art/planchette.png" alt="">
        <span class="mc-seance-ad">A.D.</span>
      </div>
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
    scrapeStop();
  }
}

export function seancePhrase(text) {
  if (!root) return; // board not up (or this client doesn't show it)
  const clean = String(text ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/ +/g, " ").trim().slice(0, 120);
  if (!clean) return;
  const wasIdle = phase === "rest" && !queue.length;
  // Pacing (DM 2026-07-27): spelled phrases move FAST — the old uniform crawl dragged on
  // longer words. Slow stays where the drama is: the wake-up, the four printed words, and a
  // short one-word reply. `fast` rides each token so back-to-back phrases keep their own gait.
  const words = clean.split(" ");
  const fast = !(words.length === 1 && (WORDS[words[0]] || words[0].length <= 4));
  for (const word of words) {
    if (WORDS[word]) queue.push({ word });
    else for (const ch of word) queue.push({ ch, fast });
    queue.push({ space: true, fast });
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
    travelMs = tok.fast ? 550 : 1100; phase = "pause"; phaseT = 0; lastKey = null;
    return;
  }
  const t = targetFor(tok);
  if (!t) return nextTarget(); // mark not on the board — skip
  // Same mark again (double letters): swing away first so the return reads as a second tap.
  if (lastKey === t.key) {
    queue.unshift(tok);
    from = { ...cur };
    to = { a: cur.a + (Math.random() < 0.5 ? 0.45 : -0.45), r: Math.max(0.3, cur.r - 0.2) };
    travelMs = tok.fast ? 480 : 900; phase = "pause"; phaseT = 0; lastKey = null;
    return;
  }
  from = { ...cur };
  to = { a: t.a, r: t.r };
  const dist = Math.min(1, (Math.abs(angDiff(from.a, t.a)) + Math.abs(t.r - from.r)) / Math.PI);
  // Three gaits (DM 2026-07-27): printed words land SLOW with a long rest (the spirits point —
  // that's the drama); fast spelling hurries mark to mark with jittered timing and the odd
  // SHARP DART (a hand yanked, not a motor) so it never reads consistent; slow spelling (short
  // single-word replies) keeps the original crawl.
  if (tok.word) {
    travelMs = 1100 + dist * 1500; holdMs = 2400;
  } else if (tok.fast) {
    travelMs = (420 + dist * 760) * (0.85 + Math.random() * 0.3);
    if (Math.random() < 0.18) travelMs = Math.max(240, travelMs * 0.45); // the dart
    holdMs = 750 + Math.random() * 250;
  } else {
    travelMs = 900 + dist * 1700; holdMs = 2000;
  }
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
  const prev = { a: cur.a, r: cur.r };
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
    if (phaseT >= holdMs) nextTarget();
  }
  // The scrape rides the actual speed: distance moved this frame (in board units) → gain.
  // FAINT is the brief (DM: "a scraping faint noise") — 0.045 is the ceiling, not the norm.
  const moved = Math.abs(angDiff(prev.a, cur.a)) * Math.max(prev.r, cur.r) + Math.abs(cur.r - prev.r);
  scrapeDrive(Math.min(0.045, (moved / Math.max(16, dt)) * 26));
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
