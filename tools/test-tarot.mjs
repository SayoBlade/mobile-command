// Headless check of tarot.js + the day/night curve — no world, no server, no locks.
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
const CM_DIR = path.join(process.env.LOCALAPPDATA || "", "FoundryVTT/Data/modules/the-crooked-moon-2014/assets/card/card tarot");

// Minimal globals tarot.js touches.
globalThis.game = {
  modules: { get: () => ({ active: true }) },      // pretend the book IS installed
  settings: { get: () => "" },                      // no custom back chosen
  actors: []
};

const tarot = await import("file:///" + path.join(REPO, "scripts/tarot.js").replace(/\\/g, "/"));
const preset = await import("file:///" + path.join(REPO, "scripts/preset.js").replace(/\\/g, "/"));

let fails = 0;
const ok = (n, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}${extra ? " — " + extra : ""}`); if (!cond) fails++; };

// 1. the deck
ok("22 arcana", tarot.ARCANA.length === 22, `got ${tarot.ARCANA.length}`);
ok("keys unique", new Set(tarot.ARCANA.map(c => c.key)).size === 22);
ok("numbers 0..21", tarot.ARCANA.every((c, i) => c.n === i));

// 2. every derived plate path actually exists on disk (the filename convention is guessed from
//    the card name, so this is the check that matters)
const missing = [];
for (const c of tarot.ARCANA) {
  const face = tarot.cardFace(c);
  const abs = face.replace("modules/the-crooked-moon-2014/assets/card/card tarot", CM_DIR);
  if (!fs.existsSync(abs)) missing.push(`${c.name} -> ${path.basename(abs)}`);
}
ok("all 22 plates resolve to real files", missing.length === 0, missing.join(" | "));

// 3. the draw: no duplicates, right count, and it persists per actor
let _id = 0;
const mkActor = (name) => {
  let flag = null;
  return { name, id: `actor${++_id}`, getFlag: () => flag, setFlag: (_m, _k, v) => { flag = v; }, unsetFlag: () => { flag = null; } };
};
const table = [mkActor("A"), mkActor("B"), mkActor("C"), mkActor("D"), mkActor("E")];
globalThis.game.actors = table;
const dealt = await tarot.dealTarot(table);
ok("dealt one each", dealt.length === 5);
ok("no duplicate arcana", new Set(dealt.map(d => d.card.key)).size === 5);
ok("all land face down", table.every(a => a.getFlag().shown === false));
ok("actorCard reads back", table.every(a => tarot.actorCard(a)?.key === a.getFlag().key));

// 4. a re-deal to the SAME people may reuse their own cards but must not collide with others'
const outsider = mkActor("Z");
globalThis.game.actors = [...table, outsider];
await tarot.setActorCard(outsider, "world");
const redeal = await tarot.dealTarot(table);
ok("re-deal avoids the outsider's card", !redeal.some(d => d.card.key === "world"));
ok("re-deal still unique", new Set(redeal.map(d => d.card.key)).size === redeal.length);

// 4b. THE REGRESSION: a pre-existing duplicate must not free that arcana for re-dealing.
//     (The first version released a card by KEY, so one stray duplicate handed out a second copy.)
const dup = mkActor("Dup");
await tarot.setActorCard(dup, "world");            // now Z and Dup both hold The World
globalThis.game.actors = [...table, outsider, dup];
const redeal2 = await tarot.dealTarot(table);       // re-deal the table only
ok("a duplicate elsewhere never frees that card", !redeal2.some(d => d.card.key === "world"));

// 5. a table bigger than the deck runs out rather than repeating
globalThis.game.actors = [];
const huge = Array.from({ length: 25 }, (_, i) => mkActor("P" + i));
globalThis.game.actors = huge;
const big = await tarot.dealTarot(huge);
ok("deck runs out at 22", big.length === 22, `dealt ${big.length}`);
ok("no repeats even at capacity", new Set(big.map(d => d.card.key)).size === 22);

// 6. the darker night
ok("night peak is 0.8", preset.NIGHT_DARKNESS_PEAK === 0.8, String(preset.NIGHT_DARKNESS_PEAK));
ok("global-light threshold is half the peak", preset.GLOBAL_LIGHT_NIGHT_THRESHOLD === 0.4, String(preset.GLOBAL_LIGHT_NIGHT_THRESHOLD));
ok("midnight = peak", preset.darknessForHour(0) === 0.8);
// SS41.1 daylight is a FLOOR now, not zero — a world with no real sun.
ok("noon sits at the day floor", preset.darknessForHour(12) === preset.DAY_DARKNESS_FLOOR,
  String(preset.darknessForHour(12)));
ok("noon is still much lighter than night", preset.darknessForHour(12) < preset.NIGHT_DARKNESS_PEAK - 0.4);
ok("dawn midpoint sits between floor and peak", (() => {
  const d = preset.darknessForHour(6);
  return d > preset.DAY_DARKNESS_FLOOR && d < preset.NIGHT_DARKNESS_PEAK;
})(), String(preset.darknessForHour(6)));
ok("an explicit day floor of 0 restores true daylight", preset.darknessForHour(12, { day: 0 }) === 0);
ok("the curve never leaves [floor, peak]", (() => {
  for (let h = 0; h < 24; h += 0.25) {
    const d = preset.darknessForHour(h);
    if (d < preset.DAY_DARKNESS_FLOOR - 1e-9 || d > preset.NIGHT_DARKNESS_PEAK + 1e-9) return false;
  }
  return true;
})());

// 7. SS42.2 dealing ONE card into a hand — the cheat is just the argument
const solo = mkActor("Solo");
globalThis.game.actors = [solo];
const c1 = await tarot.dealOne(solo);
ok("a solo deal lands a card", !!c1 && solo.getFlag().key === c1.key);
ok("and it lands FACE DOWN", solo.getFlag().shown === false);
const c2 = await tarot.dealOne(solo, "death");
ok("the DM's choice is dealt exactly", c2?.key === "death" && solo.getFlag().key === "death");
const other = mkActor("Other");
await tarot.setActorCard(other, "moon");
globalThis.game.actors = [solo, other];
let clash = false;
for (let i = 0; i < 60; i++) { const c = await tarot.dealOne(solo); if (c.key === "moon") clash = true; }
ok("a random deal never takes a card someone else holds", !clash);
// Their OWN current card must go back in the deck on a re-deal, or a player who re-draws can
// never land on what they already had — a subtle bias, and the reason takenKeys excludes by WHO.
await tarot.setActorCard(solo, "tower");
let sawOwnAgain = false;
for (let i = 0; i < 300 && !sawOwnAgain; i++) {
  await tarot.setActorCard(solo, "tower");
  if ((await tarot.dealOne(solo)).key === "tower") sawOwnAgain = true;
}
ok("re-dealing can return their OWN previous card (it goes back in the deck)", sawOwnAgain);

console.log(fails ? `\n${fails} FAILED` : "\nall green");
process.exit(fails ? 1 : 0);
