// The train takes half the clock (DM 2026-11-13, deck-command D-0108): cars 10.1–10.8 follow the clock at half its
// darkness, because their own lamps light the interior; the wreck (10.9) and everything after follow it whole.

const preset = await import(new URL("../scripts/preset.js", import.meta.url).href);
let fails = 0;
const ok = (n, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}${extra ? " — " + extra : ""}`); if (!cond) fails++; };

ok("1. half, on purpose", preset.TRAIN_CLOCK_SHARE === 0.5);
for (const n of ["10.1 Passenger Car (Colored)", "10.4 Dining Car", "10.8 Caboose (Colored)"]) ok(`2. ${n}: half the clock`, preset.clockShare(n) === 0.5);
for (const n of ["10.9 The Wreck (Colored)", "10.10 Outside", "11.1 Druskenvald", "The Crooked Moon", "12.4 The Crooked House (Attic, Colored)", "", null])
  ok(`3. ${n}: the whole clock`, preset.clockShare(n) === 1);
// at night a car is half as dark as the moor outside, so its own lamps carry the interior
const night = preset.darknessForHour(0);
ok("4. night in a car is half the night outside", Math.abs(night * preset.clockShare("10.1 Passenger Car") - night / 2) < 1e-9, `${night} → ${night / 2}`);
if (fails) { console.log(`${fails} FAILED`); process.exit(1); } else console.log("all passed");
