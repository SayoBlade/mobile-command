// The carriage jolt is Animater's Shake Moment (DM 2026-11-23, deck-command D-0172): sized as a lurch, its own sound off,
// no scene write; FXMaster's screen shake only while Animater is not active. Headless.
// Run: node tools/test-jolt-animater.mjs   (stops at the first failure)
const MOD = "mobile-command";
let n = 0;
function check(label, ok, detail = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
globalThis.Hooks = { on() {}, once() {}, callAll() {} };
const realLog = console.log; console.log = (...a) => { if (!String(a[0]).startsWith(`${MOD} |`)) realLog(...a); };
const moments = [], fx = [];
let animaterOn = true;
globalThis.game = { modules: { get: (id) => (id === "animater" ? { active: animaterOn, api: { moment: (c) => { moments.push(c); return c; } } } : null) },
  scenes: [], playlists: [], user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } } };
globalThis.FXMASTER = { api: { effects: { filters: { toggle: async (l) => { fx.push(["toggle", l[0].type]); }, stop: async (l) => { fx.push(["stop", l[0].type]); } } } } };
const T = await import("../scripts/cm-train.js");
check("joltNow answers that it jolted", (await T.joltNow()) === "jolted");
check("one Animater Shake, sized as a lurch, its own sound off", moments.length === 1 && moments[0].kind === "shake" && moments[0].strength === 0.22 && moments[0].ms === 600 && moments[0].heard === "", JSON.stringify(moments));
check("FXMaster is not touched while Animater is on", fx.length === 0, JSON.stringify(fx));
check("the lurch is gentler and shorter than Animater's own Shake (0.6, 900 ms)", T.JOLT_MOMENT.strength < 0.6 && T.JOLT_MOMENT.ms < 900);
animaterOn = false;
check("without Animater: FXMaster's shake is the fallback", (await T.joltNow()) === "jolted" && fx.some(([v, t]) => v === "toggle" && t === "screenShake"), JSON.stringify(fx));
delete globalThis.FXMASTER;
check("with neither: it says so and fires nothing", /neither/.test(await T.joltNow()));
console.log(`\nall ${n} passed`); process.exit(0);
