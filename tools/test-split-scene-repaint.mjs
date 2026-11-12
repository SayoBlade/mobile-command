// The split-scene card after a crossing (seat R5 rerun 103, 2026-11-12): the crossing deletes the PC's token on one map
// and creates it on the other; a paint caught between the two read "No token on this scene yet" instead of "Waiting
// for the party". The token hooks now paint once more after both edges have landed.
// Run: node tools/test-split-scene-repaint.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
const shell = fs.readFileSync(path.join(ROOT, "scripts", "shell.js"), "utf8");
const body = shell.slice(shell.indexOf("const onPartyToken = (tok) => {"), shell.indexOf('Hooks.on("deleteToken", onPartyToken);'));
check("the owned-token hook paints at once", /shellInstance\.render\(\);/.test(body));
check("and once more after a short tail, re-armed by each edge (delete then create = one trailing paint)",
  /clearTimeout\(partyTokenTail\);\s*partyTokenTail = setTimeout\(\(\) => \{ if \(shellInstance\?\.rendered\) shellInstance\.render\(\); \}, \d+\);/.test(body));
check("both edges use it", shell.includes('Hooks.on("createToken", onPartyToken);') && shell.includes('Hooks.on("deleteToken", onPartyToken);'));
check("the card itself still reads the token on another scene as a split", /const here = game\.scenes\.find\(s => s !== active && s\.tokens\.some\(t => t\.actorId === actor\.id\)\);/.test(shell));
console.log(`\nall ${n} passed`);
