// The ride is heard and felt only on a car (scripts/cm-train.js rideHere / followRideScene / registerRideFollow,
// cm-live.js setRide, DESIGN §37). Driven through the real updateScene/canvasReady hooks and the real 300 ms
// debounce, with a stand-in playlist and FXMaster. Headless: no Foundry.
// Run: node tools/test-ride-scene.mjs   (stops at the first failure)
const MOD = "mobile-command";
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}

const hooks = {};
globalThis.Hooks = { on: (name, fn) => { (hooks[name] ??= []).push(fn); }, once() {}, callAll() {} };
// The jolt says what it did in the console; that is what is read here.
const said = [];
const realLog = console.log;
console.log = (...a) => { const t = a.join(" "); if (t.startsWith(`${MOD} |`)) said.push(t); else realLog(...a); };
const jolting = () => {
  const last = [...said].reverse().find((t) => /will jolt|stops jolting/.test(t));
  return Boolean(last && /will jolt/.test(last));
};
const joltStarts = () => said.filter((t) => /will jolt/.test(t)).length;
globalThis.FXMASTER = { api: { effects: { filters: { toggle: async () => {}, stop: async () => {} } } } };

const loop = { name: "Steam-Train-(with-passengers)", repeat: true, volume: 0.4, playing: false };
const playlist = { sounds: [loop], async playSound(s) { s.playing = true; }, async stopSound(s) { s.playing = false; } };
loop.parent = playlist;

const mistTile = () => ({ flags: { [MOD]: { trainMist: true } } });
const car = (id, name) => ({ id, name, tiles: [], tokens: [], regions: [] });
const lounge = car("s3", "10.3 Lounge Car (Colored)");
const sleeper = car("s2", "10.2 Sleeper Car (Colored)");
const loco = car("s9", "10.9 The Ghostlight Locomotive");
const house = car("h", "12.2 The Crooked House");
const scenes = [lounge, sleeper, loco, house];
const setMist = (on) => { for (const s of [lounge, sleeper]) s.tiles = on ? [mistTile()] : []; };
const scenesColl = { active: null, [Symbol.iterator]: () => scenes[Symbol.iterator]() };
globalThis.game = { scenes: scenesColl, playlists: [playlist], user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } } };

const { rideHere, followRideScene, registerRideFollow } = await import("../scripts/cm-train.js");
const goTo = async (s) => {
  scenesColl.active = s;
  for (const fn of hooks.updateScene ?? []) { fn(s, { active: true }); fn(house, { active: false }); } // two scenes update
  await new Promise((r) => setTimeout(r, 350));
};

// ── rideHere, pure ───────────────────────────────────────────────────────────────────────────────
setMist(true); scenesColl.active = lounge;
check("ride on, a car active: here", rideHere() === true);
scenesColl.active = house;
check("ride on, the Crooked House active: not here", rideHere() === false);
scenesColl.active = loco;
check("ride on, 10.9 active: not a car, not here", rideHere() === false);
setMist(false); scenesColl.active = lounge;
check("ride off, a car active: not here", rideHere() === false);
scenesColl.active = null; setMist(true);
check("no active scene: not here", rideHere() === false);

// ── the GM load, then the hooks ──────────────────────────────────────────────────────────────────
// The found-live case: the ride left on, a GM loads with the house active.
scenesColl.active = house;
registerRideFollow();
await followRideScene();
check("GM load on the house with the ride on: no loop, no jolts", !loop.playing && !jolting(), JSON.stringify({ playing: loop.playing }));
await goTo(lounge);
check("the table goes to a car: the loop plays and the carriage jolts", loop.playing && jolting());
const starts = joltStarts();
await goTo(sleeper);
for (const fn of hooks.canvasReady) fn();
await new Promise((r) => setTimeout(r, 20));
check("car to car, and a canvasReady: nothing restarts", loop.playing && joltStarts() === starts, String(joltStarts() - starts));
await goTo(house);
check("car to the house: the loop stops and the jolts stop", !loop.playing && !jolting());
await goTo(house);
check("a second identical update does nothing", !loop.playing && joltStarts() === starts);
await goTo(lounge);
check("house back to a car: both come back", loop.playing && jolting() && joltStarts() === starts + 1);

// ── setRide keeps the follow honest ──────────────────────────────────────────────────────────────
await goTo(house);
check("(reset) on the house, quiet", !loop.playing && !jolting());
setMist(false);
scenesColl.active = lounge; // the table on a car, ride stopped, then Start ride pressed there
await followRideScene();
setMist(true);
const r1 = await followRideScene({ force: true });
check("Start ride on a car: the loop plays now", r1?.here === true && loop.playing && jolting());
await goTo(house);
check("then leaving the car stops it", !loop.playing && !jolting());
setMist(false);
await followRideScene({ force: true });
await goTo(lounge);
check("Stop ride from the house, then back to a car: still quiet", !loop.playing && !jolting());
const liveSrc = (await import("node:fs")).readFileSync(new URL("../scripts/cm-live.js", import.meta.url), "utf8");
const setRideSrc = liveSrc.slice(liveSrc.indexOf("export async function setRide")).slice(0, 900);
// The draft started the loop in setRide directly and left the follow's memory at "not here", so leaving the car
// compared equal and the loop played on over the house. Going through the follow is what keeps 14 true.
check("setRide goes through the follow and no longer starts the loop or the jolts itself",
  setRideSrc.includes("followRideScene({ force: true })") && !/setTrainSound\(|setTrainJolt\(/.test(setRideSrc));
setMist(true);
await followRideScene({ force: true });
check("(Start ride on a car again: running)", loop.playing && jolting());
setMist(false);
await followRideScene({ force: true });
check("Stop ride pressed on a car stops both at once", !loop.playing && !jolting());

// ── not the primary GM ───────────────────────────────────────────────────────────────────────────
game.users.activeGM = { id: "other" };
setMist(true);
await goTo(lounge);
check("a second GM's client never plays it", !loop.playing);

console.log = realLog;
console.log(`\nall ${n} passed`);
process.exit(0);
