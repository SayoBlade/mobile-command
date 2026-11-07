// The table follows the party car to car (scripts/cm-train.js registerTrainFollow, DESIGN §37), driven through
// the real createToken/deleteToken hooks and the real 250 ms debounce. Headless: no Foundry.
// Run: node tools/test-train-follow.mjs   (stops at the first failure)
const MOD = "mobile-command";
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}

const hooks = {};
globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; }, once() {}, callAll() {} };
const settings = { partyTeleportActivates: true };
const pc = () => ({ type: "character", hasPlayerOwner: true });
const packedGroup = () => ({ type: "group", getFlag: (m, k) => m === MOD && k === "packed" });
const token = (actor, hidden = false) => ({ actor, hidden });
let activated = [];
function scene(id, name, tokens = [], land = true) {
  const s = { id, name, tokens, active: false, flags: {},
    regions: land ? [{ flags: { [MOD]: { trainLand: true } } }] : [],
    tiles: [], activate() { activated.push(name); } };
  return s;
}
const world = (active, ...rest) => {
  const list = [active, ...rest];
  active.active = true;
  activated = [];
  const scenes = { active, [Symbol.iterator]: () => list[Symbol.iterator]() };
  globalThis.game = { scenes, settings: { get: (_, k) => settings[k] }, user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } } };
};
const settle = () => new Promise((r) => setTimeout(r, 300));
// A PC token appearing or going is the only thing that pokes the follow.
const poke = async (kind = "createToken") => { hooks[kind](token(pc())); await settle(); };

const { registerTrainFollow } = await import("../scripts/cm-train.js");
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } } };
registerTrainFollow();

const lounge = () => scene("s3", "10.3 Lounge Car (Colored)", [token(pc()), token(pc()), token(pc()), token(pc())]);

// 1. The found-live case, exactly: 10.9, PCs created hidden, visible leftovers on the Lounge Car.
world(scene("s9", "10.9 The Ghostlight Locomotive", [token(pc(), true), token(pc(), true), token(pc(), true), token(pc(), true)]), lounge());
await poke();
check("They arrive on 10.9: PCs created hidden, leftovers on 10.3, the table stays on 10.9", activated.length === 0, activated.join());

// 2. Group up off the train: the PC tokens go, a packed token stands in.
world(scene("sX", "A Crossroads", [token(packedGroup())], false), lounge());
await poke("deleteToken");
check("Group up on a non-train scene: the table stays", activated.length === 0, activated.join());

// 3. Off the train with no party token at all: still no follow.
world(scene("sY", "Night Road", [], false), lounge());
await poke("deleteToken");
check("a scene off the train with nobody on it: the table stays", activated.length === 0, activated.join());

// 4. Group up in a car.
world(scene("s2", "10.2 Sleeper Car (Colored)", [token(packedGroup())]), lounge());
await poke("deleteToken");
check("a car holding only the packed party: the table stays", activated.length === 0, activated.join());

// 5. A packed party left in another car is not somewhere to follow to.
world(scene("s2", "10.2 Sleeper Car (Colored)"), scene("s4", "10.4 Dining Car (Colored)", [token(packedGroup())]));
await poke("deleteToken");
check("an empty car and a packed token left in the next: no pull to it", activated.length === 0, activated.join());

// 6. What the follow is for.
world(scene("s2", "10.2 Sleeper Car (Colored)"), lounge());
await poke();
check("the party crosses a door, car to car: the next car activates", activated.length === 1 && activated[0] === "10.3 Lounge Car (Colored)", activated.join());

// 7. A split holds.
world(scene("s2", "10.2 Sleeper Car (Colored)", [token(pc())]), lounge());
await poke();
check("one PC still in the active car: the table stays", activated.length === 0, activated.join());

// 8. The most PCs wins.
world(scene("s2", "10.2 Sleeper Car (Colored)"), scene("s1", "10.1 Passenger Car (Colored)", [token(pc())]), lounge());
await poke();
check("the party split across two cars: the car with more of them", activated.length === 1 && activated[0] === "10.3 Lounge Car (Colored)", activated.join());

// 9. The setting.
settings.partyTeleportActivates = false;
world(scene("s2", "10.2 Sleeper Car (Colored)"), lounge());
await poke();
check("the setting off: no follow", activated.length === 0, activated.join());

console.log(`\nall ${n} passed`);
