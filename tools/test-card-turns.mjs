// Headless check of §38.4c (deck-command D-0245; SEAT 51): the card table picks up a hero Hero Mancer creates and assigns, its
// cards turn one at a time, and Abilities and Gear turn for a character finished outside Mobile Command's wizard.
//
//   node tools/test-card-turns.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import fs from "node:fs";
import { installFakeFoundry } from "./fake-foundry.mjs";

await installFakeFoundry();
const T = await import("../scripts/card-turns.js");
const { readCards, hasPortrait } = await import("../scripts/card-table.js");

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}

/* ── 1–4 the turn plan ───────────────────────────────────────────────────────────────────────── */
{
  const seen = new Set(), seatNext = new Map();
  const f = (seat, step, name = step) => ({ seat, step, key: T.faceKey(seat, "A", step, name) });
  const first = T.planTurns({ faces: [f("s1", "species")], seen, seatNext, now: 1000, primed: false });
  check("the board's first paint: what is there is simply shown, nothing turns", first.length === 0 && seen.size === 1);
  const hero = [f("s2", "gear"), f("s2", "class"), f("s2", "species"), f("s2", "abilities"), f("s2", "background")];
  const turns = T.planTurns({ faces: [f("s1", "species"), ...hero], seen, seatNext, now: 2000 });
  const order = turns.map((t) => t.key.split("|")[2]);
  check("a hero arriving whole: its new cards turn in the hand's order (species, background, class, abilities, gear)",
    JSON.stringify(order) === JSON.stringify(["species", "background", "class", "abilities", "gear"]), JSON.stringify(order));
  const gaps = turns.slice(1).map((t, i) => t.at - turns[i].at);
  check("one at a time: the first a beat after it arrives, then a fixed gap each",
    turns[0].at === 2000 + T.TURN_LEAD_MS && gaps.every((g) => g === T.TURN_GAP_MS), JSON.stringify(turns.map((t) => t.at)));
  const later = T.planTurns({ faces: [...hero, f("s2", "spells")], seen, seatNext, now: 2100 });
  check("a card arriving mid-ceremony waits its turn after the last; a face already shown never turns again",
    later.length === 1 && later[0].at === turns.at(-1).at + T.TURN_GAP_MS && T.planTurns({ faces: hero, seen, seatNext, now: 9000 }).length === 0,
    JSON.stringify(later));
}

/* ── 5–8 Abilities and Gear for a character built elsewhere ─────────────────────────────────── */
const item = (type, name, img = `x/${name}.webp`) => ({ type, name, img, id: name });
function actor({ items = [], flags = {}, abilities = {} } = {}) {
  return { type: "character", items: Object.assign(items, { get: (id) => items.find((i) => i.id === id) }), system: { abilities },
    getFlag: (m, k) => flags[k] };
}
const tens = { str: { value: 10 }, dex: { value: 10 }, con: { value: 10 }, int: { value: 10 }, wis: { value: 10 }, cha: { value: 10 } };
const rolled = { ...tens, str: { value: 16 }, con: { value: 15 } };
const kit = [item("race", "Aasimar"), item("background", "Artisan"), item("class", "Fighter"), item("weapon", "Longsword"), item("equipment", "Chain Mail")];
{
  const c = readCards(actor({ items: [...kit], abilities: rolled }));
  check("a Hero Mancer hero (no wizard flags, a class): species, background, class, and now Abilities (its top score) and Gear (its weapon)",
    c.species?.name === "Aasimar" && c.background?.name === "Artisan" && c.class?.name === "Fighter"
      && c.abilities?.name === "STR" && c.gear?.name === "Longsword", JSON.stringify(c));
  const blank = readCards(actor({ items: [...kit.slice(0, 3)], abilities: tens }));
  check("the data not there: all tens and no weapon or armour → Abilities and Gear stay face down (never a guess)",
    !blank.abilities && !blank.gear, JSON.stringify(blank));
  const mid = readCards(actor({ items: [...kit], abilities: rolled, flags: { charGen: true } }));
  check("mid-build in Mobile Command's own wizard: still the wizard's flags, as before", !mid.abilities && !mid.gear, JSON.stringify(mid));
  const noClass = readCards(actor({ items: [item("race", "Elf"), item("weapon", "Dagger")], abilities: rolled }));
  check("no class yet: not a finished character, Abilities and Gear wait", !noClass.abilities && !noClass.gear && noClass.species?.name === "Elf");
}

/* ── 9 the portrait ─────────────────────────────────────────────────────────────────────────── */
check("dnd5e's grey character.svg (a Hero Mancer hero with no portrait) is not a portrait; a picture is",
  !hasPortrait({ img: "systems/dnd5e/icons/svg/actors/character.svg" }) && !hasPortrait({ img: "icons/svg/mystery-man.svg" })
    && hasPortrait({ img: "worlds/x/hero.webp" }));

/* ── 10–11 the wiring ───────────────────────────────────────────────────────────────────────── */
{
  const src = fs.readFileSync(new URL("../scripts/card-table.js", import.meta.url), "utf8");
  check("the board re-seats when a player is given a character (Hero Mancer assigns ~6 s after approval)",
    /Hooks\.on\("updateUser", \(u, ch\) => \{ if \(!root \|\| !ch \|\| !\("character" in ch\)\) return; rebuild\(\); repaint\(\); \}\);/.test(src));
  check("the seat follows the one active-PC lookup; a new face is drawn face down until its turn; the turn state clears with the board",
    /const pc = activePC\(u\);/.test(src) && /const flipped = !!face && !pending;/.test(src) && /clearCardTurns\(\);\s+dealt\.clear\(\);/.test(src));
}
console.log(`ALL ${n} PASS`);
