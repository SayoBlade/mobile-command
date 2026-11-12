// Casting as a ritual from the phone (seat LIVE TRY 2026-11-12: Detect Magic offered only "Cast at L1" and spent a
// slot). 2024 rules: a prepared ritual, any class; a wizard any ritual in their book. A ritual spends no slot.
// Run: node tools/test-ritual.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = await import(pathToFileURL(path.join(ROOT, "scripts", "ritual.js")).href);
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const spell = (o = {}) => ({ type: "spell", system: { level: 1, method: "spell", prepared: 0, properties: new Set(["vocal", "somatic", "ritual", "concentration"]), ...o } });
const cls = (id) => ({ type: "class", system: { identifier: id } });
const wizard = { items: [cls("wizard")] }, cleric = { items: [cls("cleric")] }, bard = { items: [cls("bard")] };

check("Detect Magic, prepared, any class (a cleric, a bard): may be cast as a ritual", R.canCastAsRitual(spell({ prepared: 1 }), cleric) && R.canCastAsRitual(spell({ prepared: 1 }), bard));
check("always prepared counts as prepared", R.canCastAsRitual(spell({ prepared: 2 }), cleric));
check("NOT prepared, not a wizard: no ritual", !R.canCastAsRitual(spell({ prepared: 0 }), cleric));
check("a WIZARD: any ritual in the spellbook, prepared or not (Ritual Adept)", R.canCastAsRitual(spell({ prepared: 0 }), wizard));
check("…but not a wizard's spell from another source (innate, at will, a pact)", !R.canCastAsRitual(spell({ prepared: 0, method: "pact" }), wizard)
  && !R.canCastAsRitual(spell({ method: "innate", prepared: 1 }), wizard));
check("no Ritual tag, or a cantrip: never", !R.canCastAsRitual(spell({ prepared: 1, properties: new Set(["vocal"]) }), wizard) && !R.canCastAsRitual(spell({ level: 0, prepared: 1 }), wizard));
check("ritual-only casting is already slot-free: no extra choice", !R.canCastAsRitual(spell({ method: "ritual", prepared: 1 }), wizard));
check("properties as an array (a plain object from a socket) work too", R.canCastAsRitual(spell({ prepared: 1, properties: ["ritual"] }), cleric));

check("the phone's ritual pick is its base slot, marked", R.ritualSlotId(1) === "ritual:spell1" && R.isRitualSlot("ritual:spell3") && !R.isRitualSlot("spell1"));
check("…and the executor casts it at that slot WITHOUT spending one", JSON.stringify(R.slotUsage("ritual:spell1")) === JSON.stringify({ spell: { slot: "spell1" }, consume: { spellSlot: false } }));
check("an ordinary pick casts at its slot and spends it as before; no pick changes nothing",
  JSON.stringify(R.slotUsage("spell2")) === JSON.stringify({ spell: { slot: "spell2" } }) && JSON.stringify(R.slotUsage(null)) === "{}");

const shell = fs.readFileSync(path.join(ROOT, "scripts", "shell.js"), "utf8");
const rpc = fs.readFileSync(path.join(ROOT, "scripts", "rpc.js"), "utf8");
check("the phone offers it on the cast screen: 'Ritual · +10 min', after the slots (a slot stays the default while there is one)",
  shell.includes("if (canCastAsRitual(item, this.actor)) slots.push({ id: ritualSlotId(base)") && shell.includes(">Ritual<span class=\"mc-slot-n\">+10 min</span>"));
check("a ritual spell is not greyed out for want of slots", shell.includes("|| canCastAsRitual(sp, sp.actor)"));
check("every executor path reads the pick through slotUsage (the two-tap, the announce, the teleport, the AoE)",
  rpc.includes("const spellCfg = slotUsage(spellSlot);") && (rpc.match(/Object\.assign\(usage, slotUsage\(/g) ?? []).length === 3 && !/usage\.spell = \{ slot:/.test(rpc));
check("out of charges AND a ritual: both stand down, neither overwrites the other", rpc.includes("spellCfg.consume = { ...(spellCfg.consume ?? {}), resources: false, spellSlot: false, action: false }"));
console.log(`\nall ${n} passed`);
