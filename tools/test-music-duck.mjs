// The music dipping under a sting (scripts/music-core.js createDuck, the one-shot in effects.js, DESIGN §25.6).
// The fake gain below keeps a real timeline, so these read the level the way a listener would hear it, at a
// moment, against the track fades it has to live beside. Headless: no Foundry.
// Run: node tools/test-music-duck.mjs   (stops at the first failure)
import { installFakeFoundry } from "./fake-foundry.mjs";

const { createDuck, duckArgs, DUCK_DEFAULTS, DUCK_MAX_MS } = await import("../scripts/music-core.js");

let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const near = (a, b) => Math.abs(a - b) < 0.001;

/** An AudioParam with a clock: set points and linear ramps, read at any moment. */
function fakeGain(start) {
  const g = {
    now: 0,
    events: [{ at: 0, v: start, ramp: false }],
    at(t) {
      let v = g.events[0].v, t0 = g.events[0].at;
      for (const e of g.events.slice(1)) {
        if (e.at > t) return e.ramp ? v + (e.v - v) * ((t - t0) / (e.at - t0)) : v;
        v = e.v; t0 = e.at;
      }
      return v;
    },
    get value() { return g.at(g.now); },
    cancelScheduledValues(t) { g.events = g.events.filter((e, i) => i === 0 || e.at < t); },
    setValueAtTime(v, t) { g.events.push({ at: t, v, ramp: false }); },
    linearRampToValueAtTime(v, t) { g.events.push({ at: t, v, ramp: true }); },
  };
  return g;
}

/** A screen: the channel at `slider`, a clock this test turns, timers on that clock. */
function rig(slider = 0.5) {
  const gain = fakeGain(slider), timers = [];
  const w = { gain, slider, muted: false, audio: true, pending: timers };
  w.duck = createDuck({
    channel: () => (w.audio ? { param: gain, time: () => gain.now } : null),
    level: () => (w.muted ? 0 : w.slider),
    later: (fn, ms) => { const t = { fn, at: gain.now + ms / 1000 }; timers.push(t); return t; },
    cancel: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
  });
  w.to = (t) => {
    while (timers.length && timers[0].at <= t) { const x = timers.shift(); gain.now = x.at; x.fn(); }
    gain.now = t;
  };
  return w;
}

// ── the shape of one dip ──────────────────────────────────────────────────────────────────────────
{
  const w = rig();
  check("a dip starts", w.duck.hold({ ms: 2600, to: 0.3 }) === true);
  w.to(0.075);
  check("halfway down at 75 ms", near(w.gain.value, 0.325), String(w.gain.value));
  w.to(0.15);
  check("down to 30% of the slider in 150 ms", near(w.gain.value, 0.15), String(w.gain.value));
  w.to(2.5);
  check("it holds there", near(w.gain.value, 0.15), String(w.gain.value));
  w.to(3.0);
  check("back at the slider 400 ms after the hold", near(w.gain.value, 0.5), String(w.gain.value));
  check("nothing left pending", w.pending.length === 0);
}

// ── what it lives beside: a track's fades are on its own gain, and you hear the two multiplied ────────
{
  // Core's fade-out at a track's end, starting during the dip. A dip on the track came back up here.
  const w = rig(1), track = fakeGain(1);
  w.duck.hold({ ms: 2600, to: 0.3 });
  track.setValueAtTime(1, 1); track.linearRampToValueAtTime(0, 6);
  w.to(3.2);
  check("a fade-out begun during the dip keeps falling through the restore", near(track.at(3.2) * w.gain.value, 0.56), String(track.at(3.2) * w.gain.value));
}
{
  // The overlap's hand-off: the incoming ramp finishes on its own 5 s, not at the end of the dip.
  const w = rig(1), incoming = fakeGain(0);
  incoming.setValueAtTime(0, 0); incoming.linearRampToValueAtTime(1, 5);
  w.duck.hold({ ms: 2600, to: 0.3 });
  w.to(3.1);
  check("a track fading in during the dip stays on its own 5 s ramp", near(incoming.at(3.1) * w.gain.value, 0.62), String(incoming.at(3.1) * w.gain.value));
}
{
  // Animater's card remembers the track's level at its start and fades back to it at its end.
  const w = rig(1), track = fakeGain(0.8);
  w.duck.hold({ ms: 2600, to: 0.3 });
  w.to(1);
  const remembered = track.value;
  check("a card starting mid-dip remembers the track's real level, not a dipped one", near(remembered, 0.8), String(remembered));
  track.setValueAtTime(remembered * 0.3, 1.25); // its own dip, inside ours: 0.3 × 0.3 for a moment
  track.setValueAtTime(remembered, 5);          // and its restore, after ours has ended
  w.to(10);
  check("so a card ending after the dip cannot leave the music low", near(track.at(10) * w.gain.value, 0.8), String(track.at(10) * w.gain.value));
}

// ── two at once, and what changes under it ────────────────────────────────────────────────────────
{
  const w = rig();
  w.duck.hold({ ms: 2600, to: 0.3 });
  w.to(2);
  w.duck.hold({ ms: 2600, to: 0.3 });
  check("a second sting replaces the first's timer: one restore pending", w.pending.length === 1);
  w.to(4);
  check("the music stays down for the second", near(w.gain.value, 0.15), String(w.gain.value));
  w.to(5.1);
  check("and comes back after it", near(w.gain.value, 0.5), String(w.gain.value));
}
{
  const w = rig();
  w.duck.hold({ ms: 2600, to: 0.2 });
  w.to(1);
  w.duck.hold({ ms: 2600, to: 0.6 });
  w.to(2);
  check("a shallower dip on top of a deeper one stays at the deeper", near(w.gain.value, 0.1), String(w.gain.value));
  w.to(4.2);
  w.duck.hold({ ms: 2600, to: 0.6 });
  w.to(4.4);
  check("and the depth is forgotten once the music is back", near(w.gain.value, 0.3), String(w.gain.value));
}
{
  const w = rig(0.5);
  w.duck.hold({ ms: 2600 });
  w.slider = 0.8;
  w.to(3.5);
  check("the TV's slider moved during the dip: it comes back to the new level", near(w.gain.value, 0.8), String(w.gain.value));
}
{
  const w = rig(0.5);
  w.duck.hold({ ms: 2600 });
  w.muted = true;
  w.to(3.5);
  check("muted during the dip: it does not come back loud", near(w.gain.value, 0), String(w.gain.value));
}
{
  const w = rig(0);
  check("a screen with its music at zero (the DM's, with a TV up) does nothing", w.duck.hold() === false && w.pending.length === 0);
  const a = rig();
  a.audio = false;
  check("no audio yet on this screen does nothing", a.duck.hold() === false && a.pending.length === 0);
}

// ── arguments ─────────────────────────────────────────────────────────────────────────────────────
check("nothing sent: the defaults", duckArgs().ms === DUCK_DEFAULTS.ms && duckArgs().to === DUCK_DEFAULTS.to);
{
  const bad = duckArgs({ ms: "x", to: null });
  check("nonsense: the defaults", bad.ms === DUCK_DEFAULTS.ms && bad.to === DUCK_DEFAULTS.to);
  const wild = duckArgs({ ms: 9e9, to: 4 });
  check("a wild hold is capped, a wild depth clamped", wild.ms === DUCK_MAX_MS && wild.to === 1 && duckArgs({ to: -1 }).to === 0);
}

// ── the real one-shot, end to end ─────────────────────────────────────────────────────────────────
const { store, fired } = await installFakeFoundry();
const fx = await import("../scripts/effects.js");
store.set("globalPlaylistVolume", 0.5);
const gain = fakeGain(0.5);
game.audio = { music: { currentTime: 0, gainNode: { gain } } };
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const writes = () => gain.events.length;

fx.handleFxOneShot({ id: "musicDuck", ms: 10, to: 0.3, users: ["tv"] });
check("a duck addressed to another screen does nothing here", writes() === 1);

const r = await fx.musicDuck({ ms: 10, to: 0.3, users: ["gm"] });
await wait(40);
check("music.duck goes out: a real one-shot, not dropped at dmFireFx's door",
  r.ok === true && (fired.some((p) => p.id === "musicDuck" && p.to === 0.3 && p.users?.[0] === "gm") || writes() > 1), JSON.stringify(fired));

fx.handleFxOneShot({ id: "musicDuck", ms: 10, to: 0.3, users: [game.user.id] });
check("addressed here, the channel's gain goes down", near(gain.events.at(-1).v, 0.15), JSON.stringify(gain.events.at(-1)));
await wait(40);
check("and back up to the slider", near(gain.events.at(-1).v, 0.5), JSON.stringify(gain.events.at(-1)));

game.user.isGM = false;
const refused = await fx.musicDuck();
game.user.isGM = true;
check("a player cannot call it", refused.ok === false);

console.log(`\nall ${n} passed`);
process.exit(0);
