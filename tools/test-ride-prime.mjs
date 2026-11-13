// The ride's loop is readied on EVERY client ahead of Start ride (deck-command D-0108; seat Start ride (3) 2026-11-13:
// the TV heard the train 2.1 s late, and Foundry's preloadAudio had left it nothing — a long loop is never buffered).
// Headless: a stand-in playlist; checks primeRideSound loads the very PlaylistSound Foundry will play, after unlock,
// once; and that preloadRideSound broadcasts the prime to the other clients.
// Run: node tools/test-ride-prime.mjs   (stops at the first failure)
let n = 0;
function check(label, ok, detail = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
globalThis.Hooks = { on() {}, once() {}, callAll() {} };
let unlock; const unlocked = new Promise((r) => { unlock = r; });
const loads = []; const emitted = [];
const loop = { name: "Steam-Train-(with-passengers)", path: "sounds/train.ogg", sound: null,
  async load() { loads.push(this.name); this.sound = { loaded: true }; } };
globalThis.game = { playlists: [{ sounds: [loop] }], audio: { unlock: unlocked }, socket: { emit: (ch, p) => emitted.push([ch, p]) }, settings: { get: () => null } };
const { primeRideSound, preloadRideSound } = await import(new URL("../scripts/cm-train.js", import.meta.url).href);

const p = primeRideSound();
await new Promise((r) => setTimeout(r, 10));
check("a locked client waits for its first click before loading", loads.length === 0, JSON.stringify(loads));
unlock();
check("then loads the ride's own playlist sound (the one Foundry plays)", (await p) === loop.name && loads.length === 1);
await primeRideSound();
check("once: a sound already loaded is not loaded again", loads.length === 1);
check("View car's call broadcasts the prime to every other client", preloadRideSound() === loop.name
  && emitted.some(([ch, x]) => ch === "module.mobile-command" && x?.cmd === "primeRide"), JSON.stringify(emitted));
game.playlists = [];
check("no ride loop in the playlists: nothing, quietly", (await primeRideSound()) === null);
console.log("all passed");
