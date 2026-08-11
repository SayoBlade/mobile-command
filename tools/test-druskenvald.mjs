// Headless check of the Druskenvald hour math (§43) — no world, no server, no locks.
// The Witching block WRAPS midnight (02:00 comes after 22:00 in the cycle), which is exactly the
// kind of thing that looks right and tiles the day wrong, so every hour of the day is checked.
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
const imp = (f) => import("file:///" + path.join(REPO, "scripts", f).replace(/\\/g, "/"));

// The hour table and its maths live in preset.js precisely so this needs no Foundry at all —
// druskenvald.js itself pulls in the shell for its display-client check, and none of that is
// relevant to whether the six blocks tile a day.
const p = await imp("preset.js");
const d = { DRUSK_HOURS: p.DRUSK_HOURS, hourAt: p.druskHourAt };

let fails = 0;
const ok = (n, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}${extra ? " — " + extra : ""}`); if (!cond) fails++; };

// 1. shape
ok("six named hours", d.DRUSK_HOURS.length === 6);
ok("keys unique", new Set(d.DRUSK_HOURS.map(h => h.key)).size === 6);
ok("never reaches daylight", d.DRUSK_HOURS.every(h => h.darkness >= 0.5));
ok("never darker than the world's night", d.DRUSK_HOURS.every(h => h.darkness <= 0.8));
ok("Midnight is the deepest", Math.max(...d.DRUSK_HOURS.map(h => h.darkness)) === d.DRUSK_HOURS.find(h => h.key === "midnight").darkness);

// 2. THE BLOCKS TILE THE DAY. Every one of the 24 hours (and each half hour) must land in
//    exactly one block, and the blocks must be contiguous in cycle order.
const seen = {};
let holes = [];
for (let h = 0; h < 24; h += 0.5) {
  const b = d.hourAt(h);
  if (!b) { holes.push(h); continue; }
  (seen[b.key] ??= []).push(h);
}
ok("no hour falls outside a block", holes.length === 0, holes.join(","));
ok("all six blocks are used", Object.keys(seen).length === 6, Object.keys(seen).join(","));
ok("each block spans 4 hours", Object.values(seen).every(v => v.length === 8),
  Object.entries(seen).map(([k, v]) => `${k}:${v.length / 2}h`).join(" "));

// 3. the anchor the whole mapping exists for: MIDNIGHT must contain actual midnight
ok("00:00 is Midnight", d.hourAt(0).key === "midnight", d.hourAt(0).name);
ok("23:30 is Midnight", d.hourAt(23.5).key === "midnight", d.hourAt(23.5).name);
ok("01:59 is Midnight", d.hourAt(1.99).key === "midnight", d.hourAt(1.99).name);
ok("02:00 has turned to Witching", d.hourAt(2).key === "witching", d.hourAt(2).name);
ok("06:00 opens Twilight", d.hourAt(6).key === "twilight", d.hourAt(6).name);

// 4. wrapping is handled the same going round the clock
ok("negative hours wrap", d.hourAt(-1).key === d.hourAt(23).key);
ok("over-24 wraps", d.hourAt(26).key === d.hourAt(2).key);

// 5. the cycle order is the book's
ok("cycle order", d.DRUSK_HOURS.map(h => h.key).join(">") ===
  "twilight>dusk>nightfall>evening>midnight>witching");

// 6. every block's start lands in its own block (an off-by-one here shifts the whole dial)
ok("each block owns its own start hour", d.DRUSK_HOURS.every(b => d.hourAt(b.from).key === b.key),
  d.DRUSK_HOURS.filter(b => d.hourAt(b.from).key !== b.key).map(b => b.key).join(","));

console.log(fails ? `\n${fails} FAILED` : "\nall green");
process.exit(fails ? 1 : 0);
