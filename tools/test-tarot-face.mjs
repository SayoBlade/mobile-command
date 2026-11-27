// MobileCommand.cardFace (deck-command D-0231, DM 2026-11-27: "keep the cards flipped until then"): a character's Fated
// Tarot face, only once it has been turned; null while face down or undrawn. Deck Command's landing table reads it.
// Run: node tools/test-tarot-face.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, d = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${d}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
const T = await import(pathToFileURL(path.join(ROOT, "scripts", "tarot.js")).href);
const face = (actor) => { const c = T.actorCard(actor); return c?.shown ? T.cardFace(c) : null; }; // the published one, below, by source
const actor = (f) => ({ getFlag: (m, k) => (m === "mobile-command" && k === "tarot" ? f : undefined) });
check("undrawn: no face", face(actor(undefined)) === null);
check("drawn face down (Adela's deal): still no face", face(actor({ key: "moon", at: 1, shown: false })) === null);
check("turned: the book's plate", face(actor({ key: "moon", at: 1, shown: true })) === "modules/the-crooked-moon-2014/assets/card/card tarot/1_18 - Moon_Bleed.webp", face(actor({ key: "moon", shown: true })));
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
check("published on MobileCommand exactly so", /cardFace: \(actor\) => \{ const c = actorCard\(actor\); return c\?\.shown \? cardFace\(c\) : null; \},/.test(main)
  && /import \{ actorCard, cardFace \} from "\.\/tarot\.js";/.test(main));
console.log(`\nAll ${n} passed.`);
