// Headless check of deeds.js (§44.4 slice B) pure reducers — no world, no server, no locks.
// Run: ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules \
//   "/c/Program Files/Foundry Virtual Tabletop 14/Foundry Virtual Tabletop.exe" tools/test-deeds.mjs
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
const D = await import("file:///" + path.join(REPO, "scripts/deeds.js").replace(/\\/g, "/"));

let fails = 0;
const ok = (n, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}${extra ? " — " + extra : ""}`); if (!cond) fails++; };

// 1. the empty ledger: bounded shapes from birth
let d = D.emptyDeeds();
ok("empty: arrays are arrays", Array.isArray(d.kills) && Array.isArray(d.weapons) && Array.isArray(d.spells) && Array.isArray(d.nemesis));
ok("empty: counters at zero", d.totalKills === 0 && d.drops === 0 && d.nat20 === 0 && d.healGiven === 0);
ok("empty: maxima start null", d.maxHit === null && d.maxTurn === null && d.maxFoe === null && d.maxHeal === null);

// 2. the worthy bar — CR > level, STRICTLY (DM 2026-08-15: an even fight is no trophy)
ok("CR 5 at level 3 is worthy", D.isWorthy(5, 3));
ok("CR 5 at level 5 is NOT", !D.isWorthy(5, 5));
ok("CR ¼ at level 1 is NOT", !D.isWorthy(0.25, 1));
ok("an unreadable CR is NOT", !D.isWorthy(NaN, 3));

// 3. pair lists: count up, and a full list only grows what it already knows
let pairs = [];
D.bumpPair(pairs, "Longsword"); D.bumpPair(pairs, "Longsword"); D.bumpPair(pairs, "Dagger");
ok("bumpPair counts", pairs.find(p => p[0] === "Longsword")?.[1] === 2 && pairs.length === 2);
pairs = Array.from({ length: 30 }, (_, i) => [`w${i}`, 1]);
D.bumpPair(pairs, "brand-new");
ok("full pair list drops a newcomer", pairs.length === 30 && !pairs.find(p => p[0] === "brand-new"));
D.bumpPair(pairs, "w7");
ok("full pair list still grows a known name", pairs.find(p => p[0] === "w7")?.[1] === 2);

// 4. nemesis: accumulates, and at the cap a BIGGER newcomer evicts the smallest
let nem = [];
D.bumpNemesis(nem, "Hag", 10); D.bumpNemesis(nem, "Hag", 5);
ok("nemesis accumulates", nem[0][1] === 15);
nem = Array.from({ length: 24 }, (_, i) => [`n${i}`, i + 2]); // smallest is n0 at 2
D.bumpNemesis(nem, "Big Bad", 100);
ok("big newcomer evicts the smallest", nem.length === 24 && nem.find(p => p[0] === "Big Bad") && !nem.find(p => p[0] === "n0"));
D.bumpNemesis(nem, "Gnat", 1);
ok("small newcomer bounces off a full list", !nem.find(p => p[0] === "Gnat"));
ok("topPair finds the champion", D.topPair(nem)[0] === "Big Bad");
ok("topPair of nothing is null", D.topPair([]) === null);

// 5. uses: weapons and spells to their own lists, anything else ignored
d = D.emptyDeeds();
D.recordUse(d, { type: "weapon", name: "Maul" });
D.recordUse(d, { type: "spell", name: "Fire Bolt" });
D.recordUse(d, { type: "consumable", name: "Potion" });
ok("weapon counted", d.weapons[0]?.[0] === "Maul");
ok("spell counted", d.spells[0]?.[0] === "Fire Bolt");
ok("other item types ignored", d.weapons.length === 1 && d.spells.length === 1);

// 6. maxima: hit, turn, worthy-foe total
D.recordHit(d, { amount: 12, victim: "Bandit" });
D.recordHit(d, { amount: 9, victim: "Rat" });
ok("biggest hit keeps the bigger", d.maxHit.amount === 12 && d.maxHit.name === "Bandit");
D.recordTurn(d, { amount: 20 }); D.recordTurn(d, { amount: 15 });
ok("biggest turn keeps the bigger", d.maxTurn.amount === 20);
D.recordFoeTotal(d, { name: "Hag", cr: 5, total: 30, level: 3 });
ok("worthy foe total recorded", d.maxFoe?.total === 30);
D.recordFoeTotal(d, { name: "Rat", cr: 0, total: 99, level: 3 });
ok("unworthy foe never takes the record", d.maxFoe.name === "Hag");

// 7. kills: every kill counts, only worthy ones enter the ranked, capped list
d = D.emptyDeeds();
D.recordKill(d, { name: "Rat", cr: 0.125, level: 3 });
ok("unworthy kill counts but is not listed", d.totalKills === 1 && d.kills.length === 0);
D.recordKill(d, { name: "Hag", cr: 5, level: 3 });
D.recordKill(d, { name: "Dragon", cr: 10, level: 3 });
D.recordKill(d, { name: "Ogre", cr: 4, level: 3 });
ok("worthy kills listed", d.totalKills === 4 && d.kills.length === 3);
ok("ranked by CR − level", d.kills[0].name === "Dragon" && d.kills[1].name === "Hag" && d.kills[2].name === "Ogre");
for (let i = 0; i < 25; i++) D.recordKill(d, { name: `W${i}`, cr: 6, level: 3 });
ok("kill list capped at 20", d.kills.length === 20);
ok("the biggest trophy survives the cap", d.kills[0].name === "Dragon");

// 8. mercy: totals plus the biggest single heal
d = D.emptyDeeds();
D.recordHeal(d, { amount: 8, target: "Rogue" });
D.recordHeal(d, { amount: 15, target: "Wizard" });
ok("healing totals", d.healGiven === 23);
ok("biggest heal kept", d.maxHeal.amount === 15 && d.maxHeal.name === "Wizard");

// 9. scars: drops, and RAW death saves (nat 1 is TWO failures, nat 20 is a made save)
D.recordDrop(d);
ok("drop counted", d.drops === 1);
D.recordDeathSave(d, { total: 14, die: 14 });
D.recordDeathSave(d, { total: 6, die: 4 });
D.recordDeathSave(d, { total: 3, die: 1 });
D.recordDeathSave(d, { total: 25, die: 20 });
ok("death saves: 2 made", d.dsMade === 2);
ok("death saves: nat 1 counts twice", d.dsFail === 3);

// 10. luck
D.recordLuck(d, 20); D.recordLuck(d, 20); D.recordLuck(d, 1); D.recordLuck(d, 13);
ok("luck counts only the edges", d.nat20 === 2 && d.nat1 === 1);

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
process.exit(fails ? 1 : 0);
