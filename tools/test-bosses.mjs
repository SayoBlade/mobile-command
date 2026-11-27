// The bosses' toys (scripts/cm-bosses.js; deck-command D-0243): the Locomotive, its picture in Deck Command's keepsake art,
// what it answers to; offered only with the Crooked Moon tools on. Run: node tools/test-bosses.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, d = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${d}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
const B = await import(pathToFileURL(path.join(ROOT, "scripts", "cm-bosses.js")).href);
const loco = B.BOSS_TOYS.find((b) => b.id === "ghostlight-locomotive");
check("the Locomotive: its label is what the DM's question says", loco?.label === "the Locomotive");
check("it answers to the boss's name and its actor in his world", loco.names.includes("The Ghostlight Locomotive") && loco.actorIds.includes("BWAI1K9gFR17hC1m"));
check("its picture is Deck Command's boss art", loco.img === "modules/deck-command/assets/keepsakes/bosses/ghostlight-locomotive.webp");
const deck = path.join(ROOT, "..", "deck-command", "foundry-module", "assets", "keepsakes", "bosses");
if (fs.existsSync(deck)) check("and the picture is there", B.BOSS_TOYS.every((b) => fs.existsSync(path.join(deck, `${b.id}.webp`))));
globalThis.game = { settings: { get: (m, k) => k === "crookedMoonTools" } };
const list = B.bossToys();
check("offered with the Crooked Moon tools on (copies, not the frozen list)", list.items.length === B.BOSS_TOYS.length && list.items[0] !== B.BOSS_TOYS[0]);
globalThis.game = { settings: { get: () => false } };
check("and not without them", B.bossToys() === null);
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
check("published as MobileCommand.bossToys(), beside resolveExecutorId (the deck's asker)", /bossToys: \(\) => bossToys\(\),/.test(main) && /import \{ bossToys \} from "\.\/cm-bosses\.js";/.test(main) && /\n\s*resolveExecutorId,/.test(main));
console.log(`\nAll ${n} passed.`);
