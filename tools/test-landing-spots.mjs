// Where crossing heroes land (lead 2026-11-12, section W: one-at-a-time crossings stacked on the landing; a group
// following one who went ahead landed on top of him). scripts/landing-spots.js, and its use in rpc.js handleTravelTo.
// Run: node tools/test-landing-spots.mjs   (stops at the first failure)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
const { landingSpots, LANDING_RING } = await import(pathToFileURL(path.join(ROOT, "scripts", "landing-spots.js")).href);
const L = { x: 840, y: 420 }, G = 140, k = (p) => `${p.x},${p.y}`;
const one = landingSpots(L, G, 1);
check("the first hero onto an empty car lands on the landing", k(one[0]) === "840,420");
const second = landingSpots(L, G, 1, { occupied: [{ x: 840, y: 420 }] });
check("one at a time: the next hero lands beside the one already there, not on him", k(second[0]) !== "840,420" && Math.abs(second[0].x - 840) <= G && Math.abs(second[0].y - 420) <= G, k(second[0]));
const group = landingSpots(L, G, 3, { occupied: [{ x: 840, y: 420 }] });
check("a group after one went ahead: nobody on top of him, nobody on each other",
  !group.some((p) => k(p) === "840,420") && new Set(group.map(k)).size === 3, group.map(k).join(" "));
const off = landingSpots(L, G, 1, { occupied: [{ x: 845, y: 418 }] });
check("a token a few pixels off the grid still takes its square", k(off[0]) !== "840,420");
const walled = landingSpots(L, G, 2, { blocked: (x, y) => !(y === 420 && x > 840) });
check("a wall-cut square is skipped (the corridor: only east is open)", k(walled[0]) === "840,420" && k(walled[1]) === "980,420", walled.map(k).join(" "));
const stuck = landingSpots(L, G, 2, { occupied: [{ x: 840, y: 420 }], blocked: () => true });
check("nowhere free at all: the landing itself, rather than inside a wall", k(stuck[0]) === "840,420");
check("the rings: 8 neighbours first, then 16, sides before corners", LANDING_RING.length === 24 && LANDING_RING.slice(0, 4).every(([x, y]) => Math.abs(x) + Math.abs(y) === 1));
const rpc = fs.readFileSync(path.join(ROOT, "scripts", "rpc.js"), "utf8");
const body = rpc.slice(rpc.indexOf("async function handleTravelTo"), rpc.indexOf("let moved = 0;", rpc.indexOf("async function handleTravelTo")));
check("handleTravelTo takes the destination's tokens as occupied (not the movers on a same-scene hop) and spreads with landingSpots",
  /landing\.scene\.tokens/.test(body) && /moverIds\.has\(t\.id\)/.test(body) && /landingSpots\(\{ x: landing\.x, y: landing\.y \}, grid, movers\.length, \{ occupied, blocked \}\)/.test(body));
console.log(`\nall ${n} passed`);
