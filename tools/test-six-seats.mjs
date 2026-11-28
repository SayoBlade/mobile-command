// Six players at the table (2026-11-28, session 0: a sixth player, Jay, joined; deck-command D-0247 gives the landing desk its
// sixth cage and card). Mobile Command already carries six: this guards it. Run: node tools/test-six-seats.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, d = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${d}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
const P = await import(pathToFileURL(path.join(ROOT, "scripts", "preset.js")).href);
const ids = P.TABLE_SEATS.map((s) => s.id);
check("six seats, each its own id", ids.length === 6 && new Set(ids).size === 6, JSON.stringify(ids));
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const panel = read("scripts/dm-panel.js");
check("Players & seats draws all six on its table map", ids.every((id) => panel.includes(`slot("${id}")`)));
const css = read("styles/shell.css");
check("and each has its place on that map", ids.every((id) => new RegExp(`\\.mc-seat-${id}\\s+\\{ grid-area: ${id}; \\}`).test(css)));
const ct = read("scripts/card-table.js");
check("the card table makes a hand for every seat (no cap)", /return TABLE_SEATS\.map\(s => \(\{ \.\.\.s, userId: seats\[s\.id\] \?\? null \}\)\);/.test(ct));
check("and lays out all six: both long rows (n…, s…) and both ends (w, e)",
  /seats\.filter\(s => s\.id\.startsWith\("n"\)\)\.map\(seatHTML\)/.test(ct) && /seats\.filter\(s => s\.id\.startsWith\("s"\)\)\.map\(seatHTML\)/.test(ct)
  && /seatHTML\(at\("w"\)\)/.test(ct) && /seatHTML\(at\("e"\)\)/.test(ct));
check("online, every player account gets a hand (no cap)", /return game\.users\.filter\(u => !u\.isGM && u\.id !== display\)\s*\n\s*\.map\(u => \(\{ id: `u:\$\{u\.id\}`/.test(ct));
console.log(`\nAll ${n} passed.`);
