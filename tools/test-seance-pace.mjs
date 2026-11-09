// Tour Rehearsal R5 step 98 (2026-11-09): the deck's Answer reached the TV, but the planchette only trembled a few
// pixels in place and no mark was reached. Cause: tick() let one frame advance at most 50 ms, so a TV whose frames
// came slowly (a throttled tab gets ~1 a second) ran the séance in slow motion — the 2.6 s wake-up alone took 52 s.
// The board's marks are pure constants in seance.js (no world data), so 6x vs the test world was not it.
//
// Drives the real seance.js with a fake board and a fake frame clock, follows the LENS (the transform origin, so
// rotation never moves it) and records each mark it rests on.
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-seance-pace.mjs   (or plain node)
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
let now = 1000; const frames = [];
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = (f) => { frames.push(f); return frames.length; };
globalThis.cancelAnimationFrame = () => {};
const planch = { style: {} };
const S = 900; // board width, px
const board = { clientWidth: S };
const el = () => ({ classList: { add() {}, remove() {} }, querySelector: (s) => (s.includes("planchette") ? planch : board), set innerHTML(v) {}, remove() {} });
globalThis.document = { createElement: el, body: { appendChild() {} }, querySelector: () => null, getElementById: () => null };
globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null }; globalThis.location = { search: "" };
globalThis.game = { user: { isGM: false, id: "tv" }, settings: { get: () => "tv" }, audio: { locked: true } };
globalThis.Hooks = { on() {}, once() {}, callAll() {} };
const M = await import(new URL("../scripts/seance.js", import.meta.url));

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}

// ── the marks, from seance.js's own constants (LETTER_R .60, DIGIT_R .42, words at r .32, lens 315/626 × 338/653) ──
const D2R = Math.PI / 180, R = (S / 2) * 0.60, w = S * 0.30, h = w * (653 / 626);
const marks = {};
[..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].forEach((ch, i) => { const a = -Math.PI / 2 + (i / 26) * Math.PI * 2; marks[ch] = [S / 2 + Math.cos(a) * R, S / 2 + Math.sin(a) * R]; });
for (const [k, deg] of [["YES", -135], ["NO", -45], ["HELLO", 135], ["GOODBYE", 45]]) {
  const r = 0.32 / 0.60; marks[k] = [S / 2 + Math.cos(deg * D2R) * R * r, S / 2 + Math.sin(deg * D2R) * R * r];
}
const lens = () => {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(planch.style.transform ?? "");
  return m ? [Number(m[1]) + w * (315 / 626), Number(m[2]) + h * (338 / 653)] : null;
};
// run the clock at `step` ms per frame; return the marks the lens RESTED on (within 8 px for ≥ 0.6 s — two frames
// in a row when frames are a second apart), in order. Passing over a mark on the way does not count.
function spell(text, step, maxMs) {
  M.seancePhrase(text);
  const seen = []; let near = null, dwell = 0;
  for (const end = now + maxMs; now < end;) {
    now += step;
    for (const f of frames.splice(0)) f(now);
    const p = lens(); if (!p) continue;
    const hit = Object.entries(marks).find(([, [x, y]]) => Math.hypot(p[0] - x, p[1] - y) < 8)?.[0] ?? null;
    if (hit !== near) { near = hit; dwell = 0; continue; }
    dwell += step;
    if (hit && dwell >= Math.max(600, step) && seen.at(-1) !== hit) seen.push(hit);
  }
  return seen.join(" ");
}

check("the cap is real time, up to a second per frame (was 50 ms)", M.SEANCE_MAX_DT === 1000);
M.seanceSync(true);
for (const f of frames.splice(0)) f(now += 16);

check("60 frames/s: YES lands on the printed YES", spell("YES", 16.7, 15000) === "YES");
let got = spell("HAG", 16.7, 20000);
check("60 frames/s: HAG is spelled H, A, G", got === "H A G", got);
got = spell("HELLO", 1000, 20000);
check("1 frame/s (a throttled TV tab, as in R5): HELLO still reaches the printed HELLO within 20 s", got === "HELLO", got);
got = spell("HAG", 1000, 30000);
check("1 frame/s: HAG is still spelled H, A, G within 30 s", got === "H A G", got);
// a tab that comes back after a minute in the background: one 60 s frame must not swallow the phrase
M.seancePhrase("ATTIC");
now += 60000; for (const f of frames.splice(0)) f(now);
got = spell("", 16.7, 25000);
check("back from a minute in the background: the next frame moves one step, not the whole phrase (ATTIC still spelled)", /A T I C/.test(got), got);

console.log(`\nall ${n} passed`);
