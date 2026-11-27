// The Dark Bargains' figurines (scripts/cm-bargains.js; deck-command D-0235): the 13, the book's names, their pictures in Deck
// Command's keepsake art; offered to the deck only with the Crooked Moon tools on. Run: node tools/test-bargains.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, d = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${d}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
const B = await import(pathToFileURL(path.join(ROOT, "scripts", "cm-bargains.js")).href);
check("the 13, in the book's order", B.BARGAINS.length === 13 && B.BARGAINS[0].label === "Wings of Whispers" && B.BARGAINS[12].label === "Might of the Old");
check("ids are file names (his images replace a file, never an id)", B.BARGAINS.every((b) => /^[a-z-]+$/.test(b.id) && b.img === `modules/deck-command/assets/keepsakes/bargains/${b.id}.webp`));
globalThis.game = { settings: { get: (m, k) => k === "crookedMoonTools" } };
const f = B.figurines();
check("offered with the Crooked Moon tools on: 'Bargain', the 13 items", f.title === "Bargain" && f.items.length === 13 && f.items[0].id === "wings-of-whispers");
globalThis.game = { settings: { get: () => false } };
check("and not without them", B.figurines() === null);
const deck = path.join(ROOT, "..", "deck-command", "foundry-module", "assets", "keepsakes", "bargains");
if (fs.existsSync(deck)) check("every one has its picture in Deck Command", B.BARGAINS.every((b) => fs.existsSync(path.join(deck, `${b.id}.webp`))));
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
check("published as MobileCommand.figurines()", /figurines: \(\) => figurines\(\),/.test(main) && /import \{ figurines \} from "\.\/cm-bargains\.js";/.test(main));
console.log(`\nAll ${n} passed.`);
