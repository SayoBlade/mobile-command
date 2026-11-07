// Which dead NPCs become loot piles (scripts/corpse-rules.js, handleNpcDeath in rpc.js). The end-to-end half fires
// the real updateActor hook against a stand-in Item Piles whose getActorItems, like the real one's public API,
// TAKES NO FILTERS. The bodies are the real 6x actors, read 2026-11-07. Headless: no Foundry.
// Run: node tools/test-corpse.mjs   (stops at the first failure)
import { installFakeFoundry } from "./fake-foundry.mjs";

const { lootableItems, authoredDeath, isDeckEcho } = await import("../scripts/corpse-rules.js");

let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}

const NATURAL = { path: "system.type.value", filters: "natural" };
const TYPES = { path: "type", filters: "spell, feat, class" };
const stale = { path: "system.weaponType", filters: "natural" }; // Item Piles' own, a path dnd5e no longer has
const FILTERS = [TYPES, stale, NATURAL];
const feat = (name) => ({ name, type: "feat", system: {} });
const claw = (name) => ({ name, type: "weapon", system: { type: { value: "natural" } } });
const sword = { name: "Longsword", type: "weapon", system: { type: { value: "martialM" } } };
const potion = { name: "Potion", type: "consumable", system: { type: { value: "potion" } } };
const names = (l) => l.map((i) => i.name).join();

// ── (a) what counts as loot ───────────────────────────────────────────────────────────────────────
check("the Haint Echo: a natural weapon and two features is nothing", lootableItems([feat("Bottle Trap"), feat("Incorporeal Movement"), claw("Draining Regret")], FILTERS).length === 0);
check("the Locomotive's Rail Slam is nothing either", lootableItems([claw("Rail Slam"), feat("Crooked Switch")], FILTERS).length === 0);
check("a real weapon and a potion are loot", names(lootableItems([sword, claw("Bite"), potion], FILTERS)) === "Longsword,Potion");
check("filters given as an array work too", lootableItems([sword], [{ path: "type", filters: ["weapon"] }]).length === 0);
check("a value in a list matches", lootableItems([{ name: "x", type: "loot", system: { tags: ["a", "b"] } }], [{ path: "system.tags", filters: "b" }]).length === 0);
check("a number matches its text", lootableItems([{ name: "x", type: "loot", system: { price: 5 } }], [{ path: "system.price", filters: "5" }]).length === 0);
check("no filters: everything", lootableItems([sword, potion], []).length === 2);
check("a document is read through toObject", lootableItems([{ toObject: () => claw("Bite") }], FILTERS).length === 0);
check("no items: an empty list", lootableItems(undefined, FILTERS).length === 0);

// ── (b) an authored death ─────────────────────────────────────────────────────────────────────────
const dc = (death) => ({ "deck-command": { death } });
const asks = (answer) => ({ animater: { deathFor: () => answer } });
check("the flag on the actor", authoredDeath({ flags: dc("own") }) === true);
check("a placed copy reads the actor it was made from", authoredDeath({ flags: {}, baseActor: { flags: dc("own") } }) === true);
check("'plain' keeps its body and its loot: not authored", authoredDeath({ flags: dc("plain") }) === false);
check("'animater' is not authored", authoredDeath({ flags: dc("animater") }) === false);
check("an explicit flag beats what Deck Command would derive", authoredDeath({ flags: dc("plain") }, asks("own")) === false);
check("unflagged, Deck Command's derived answer counts: the Locomotive is unflagged in 6x", authoredDeath({ flags: {} }, asks("own")) === true);
check("no Deck Command: nothing is authored", authoredDeath({ flags: {} }, undefined) === false);
check("a Deck Command that throws: nothing is authored", authoredDeath({ flags: {} }, { animater: { deathFor() { throw new Error("no"); } } }) === false);

// ── (c) an echo ───────────────────────────────────────────────────────────────────────────────────
check("the echo flag on the token", isDeckEcho({ flags: { "deck-command": { echo: { feeder: null } } } }) === true);
check("any other token, or none", isDeckEcho({ flags: {} }) === false && isDeckEcho(null) === false);

// ── the real hook ─────────────────────────────────────────────────────────────────────────────────
const { store, hooks } = await installFakeFoundry();
foundry.utils.getProperty = (o, p) => p.split(".").reduce((v, k) => v?.[k], o);
store.set("autoLootNpcs", true);
store.set("markDeadNpcs", true);
const piled = [];
game.itempiles = { API: {
  ITEM_FILTERS: [TYPES, stale],
  getActorItems(target) { return Array.from(target.items).filter((i) => i.type !== "feat"); }, // one argument: the real public API
  getActorCurrencies: (a) => (a.coins ? [{ quantity: a.coins }] : []),
  isValidItemPile: () => false,
  turnTokensIntoItemPiles: async (doc) => { piled.push(doc.name); },
} };
let deathFor = () => "animater";
const realModules = game.modules.get;
game.modules.get = (id) => (id === "deck-command" ? { active: true, api: { animater: { deathFor: (a) => deathFor(a) } } }
  : id === "item-piles" ? { active: true } : id === "animater" ? { active: false } : realModules(id));

/** A token and its synthetic actor at 0 HP. */
function body(name, { items = [], coins = 0, flags = {}, tokenFlags = {}, statuses = new Set() } = {}) {
  const token = { id: `t-${name}`, uuid: `Token.${name}`, name, hidden: false, alpha: 1, isLinked: false, flags: tokenFlags, texture: {},
    update: async (u) => { Object.assign(token, u); }, getFlag: () => undefined, setFlag: async () => {}, parent: { tokens: { get: () => token } } };
  const actor = { id: name, name, type: "npc", items, coins, flags, statuses, token, system: { attributes: { hp: { value: 0 } } }, marked: 0,
    toggleStatusEffect: async () => { actor.marked += 1; } };
  token.actor = actor;
  return actor;
}
const kill = async (actor) => {
  for (const fn of hooks.updateActor ?? []) await fn(actor, { system: { attributes: { hp: { value: 0 } } } });
  await new Promise((r) => setTimeout(r, 20));
};
const fight = (id) => { let gone = false; game.combat = { combatants: [{ tokenId: id, delete: async () => { gone = true; } }] }; return () => gone; };

{
  const a = body("Empty");
  const left = fight(a.token.id);
  await kill(a);
  check("nothing lootable: no pile, no skull, hidden, out of the fight", piled.length === 0 && a.marked === 0 && a.token.hidden === true && left(), JSON.stringify({ piled, marked: a.marked, hidden: a.token.hidden }));
}
{
  const a = body("Bare Brute", { items: [claw("Bite"), feat("Rage")] });
  await kill(a);
  check("a natural weapon alone is nothing lootable, through the filter-less API", piled.length === 0 && a.token.hidden === true, piled.join());
}
{
  const a = body("Bandit", { items: [claw("Bite"), sword] });
  await kill(a);
  check("a body with real loot still piles", piled.includes("Bandit"), piled.join());
}
{
  const a = body("Purse", { items: [claw("Bite")], coins: 3 });
  await kill(a);
  check("coins alone are loot", piled.includes("Purse"), piled.join());
}
{
  deathFor = () => "own";
  const a = body("The Ghostlight Locomotive", { items: [claw("Rail Slam")] });
  const left = fight(a.token.id);
  await kill(a);
  check("an authored death: no pile, no skull, not hidden, still in the fight", !piled.includes(a.name) && a.marked === 0 && a.token.hidden === false && !left(), JSON.stringify({ marked: a.marked, hidden: a.token.hidden }));
  deathFor = () => "animater";
}
{
  const a = body("Armoured Boss", { items: [sword], flags: dc("own") });
  await kill(a);
  check("even with real loot on it", !piled.includes(a.name), piled.join());
}
{
  const a = body("Lich", { items: [sword], flags: dc("plain") });
  await kill(a);
  check("a 'plain' boss with loot still piles", piled.includes("Lich"), piled.join());
}
{
  const a = body("Haint Echo · Can 1", { items: [sword], tokenFlags: { "deck-command": { echo: { feeder: null } } } });
  const left = fight(a.token.id);
  await kill(a);
  check("an echo: no pile even with loot, no skull, DC does the hiding, and its turn goes", !piled.includes(a.name) && a.marked === 0 && a.token.hidden === false && left(), JSON.stringify({ marked: a.marked, hidden: a.token.hidden }));
}
{
  store.set("autoLootNpcs", false);
  const a = body("Ghost Echo", { tokenFlags: { "deck-command": { echo: {} } } });
  await kill(a);
  check("with auto-loot off an echo gets no skull either", a.marked === 0, String(a.marked));
  const b = body("Wolf");
  game.combat = null;
  await kill(b);
  check("and an ordinary NPC still does", b.marked === 1, String(b.marked));
}

console.log(`\nall ${n} passed`);
process.exit(0);
