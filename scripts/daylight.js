import { MODULE_ID, darknessForHour, NIGHT_DARKNESS_PEAK } from "./preset.js";
import { readClock, sunTimes } from "./gametime.js";
import { isExecutor } from "./settings.js";
import { isDruskScene, druskDarkness } from "./druskenvald.js"; // §43 the same loop, a second curve
import { campaignManagedScene } from "./campaigns.js"; // §50.5 Ember owns the sky on its own scenes

// §41 THE CLOCK ACTUALLY DRIVES THE LIGHT (DM report 2026-08-09: "I don't see any change in
// lighting over time, am I doing something wrong?" — no).
//
// The day/night curve has existed since 2026-08-02 and is exactly what the DM asked for: four
// phases, a gentle peak at 0.7, never pitch black. What was never built is the thing that CALLS
// it as time passes. `darknessForHour` had precisely two call sites, both inside travel — the
// one-shot when a marked travel map is first opened, and the per-waypoint sweep during a journey
// — and the module's only `updateWorldTime` hook repainted the panel's clock chip. So the clock
// moved and the light never did, on any map, ever, unless the party was literally walking.
//
// preset.js already recorded the decision as settled ("the clock drives scene darkness
// EVERYWHERE"). This is that sentence, implemented, and reconfirmed 2026-08-09: "keep every map
// with environmental light by default" — interiors are marked by the DM with Foundry's own
// `adjustDarknessLevel` region behaviour in OVERRIDE mode, which pins darkness inside the region
// regardless of what the scene says, so the two compose: outdoors follows the sun, the cave
// doesn't.
//
// Three ways out, because a rule that applies to every map needs them:
//   • `environment.darknessLock` — the DM froze this scene on purpose. Oldest rule, still wins.
//   • a `daylightHold` flag — the DM took manual control via the Effects tab's Night toggle;
//     the clock stops arguing with them until they hand it back.
//   • the `clockDaylight` setting — off, and none of this runs.

// Below this, a write isn't worth the round trip or the fade: a scene's darkness moving by a
// fiftieth is invisible and the curve's ramps step far finer than that.
const MIN_STEP = 0.02;

// AND NEVER MORE OFTEN THAN THIS, whatever the clock is doing (bench 2026-08-09). The delta gate
// alone assumes time passes at the speed a DM taps it. It doesn't have to: the test world was
// advancing world time at ~60× real time, and at that rate a dawn ramp — 0.7 of darkness inside
// one game-hour — crosses MIN_STEP about thirty-five times in sixty real seconds. Every crossing
// is a scene update: a database write plus a broadcast to every connected client, on a machine
// we already know is modest. A floor of four seconds caps a running clock at ~15 writes per ramp
// instead, and because the fade is timed to the SAME interval each step glides into the next —
// so a fast clock reads as a continuous sunrise rather than a staircase, and costs less.
const MIN_WRITE_MS = 4000;
let lastWriteAt = 0;
let pending = null;

// The travel journey drives darkness itself, waypoint by waypoint, with its own animation timed
// to the walk. Two writers animating the same field at different durations makes the map stutter,
// so travel says "mine" for the length of the trip. Set from dm-panel.js — the dependency points
// that way (dm-panel imports this file, never the reverse) so there is no cycle.
let suspended = false;
export function setDaylightSuspended(v) { suspended = !!v; }

export function daylightEnabled() {
  try { return !!game.settings.get(MODULE_ID, "clockDaylight"); } catch (e) { return true; }
}

/** The darkness the clock says this scene should be right now. Exported so the panel can show it.
 *  §43: a scene the DM marked as Druskenvald answers with the eternal-night curve instead of the
 *  day one. That is the ONLY thing the Crooked Moon clock changes here — it gets no writer, no
 *  hook and no opinion about scene data of its own, so the write-rate floor, darknessLock, the
 *  manual hold and travel's claim all keep applying to it and cannot drift out of sync. */
export function darknessNow(scene = null) {
  if (scene && isDruskScene(scene)) return druskDarkness();
  const c = readClock();
  return darknessForHour((Number(c.hour) || 0) + (Number(c.minute) || 0) / 60, sunTimes());
}

// A scene whose Global Illumination never yields will not visibly change no matter what we write
// to its darkness — the map stays lit right through midnight. That is the SECOND reason a DM sees
// nothing happen, and it is invisible from the outside, so say it out loud rather than let the
// feature look broken twice. Once per scene per session; Preflight → Travel lighting fixes it.
const warned = new Set();
function warnIfGlobalLightSwallows(scene) {
  const env = scene.environment ?? {};
  const max = env.globalLight?.darkness?.max ?? 1;
  if (!env.globalLight?.enabled || max < NIGHT_DARKNESS_PEAK) return;
  if (warned.has(scene.id)) return;
  warned.add(scene.id);
  ui.notifications?.warn(`Mobile Command: “${scene.name}” won't look any darker — its Global Illumination stays on until darkness ${max}, and night only reaches ${NIGHT_DARKNESS_PEAK}. Fix it in Preflight → Travel lighting.`);
}

/** Put `scene` at the darkness the clock says. Returns true if it actually wrote.
 *  `force` skips the write-rate floor — for arrivals, where the map must already BE right. */
export async function applyDaylight(scene, { animate = null, force = false } = {}) {
  try {
    if (!scene || suspended || !daylightEnabled()) return false;
    if (!game.user?.isGM || !isExecutor()) return false; // one writer, and only a GM may write a scene
    // _source, NEVER prepared. During an animateDarkness fade Foundry writes the animation's
    // CURRENT FRAME back onto scene.environment.darknessLevel, so the prepared value is wherever
    // the fade has got to — compare against that and the throttle is measuring a moving target,
    // which makes a second tick mid-fade re-write a scene that was already correct. effects.js
    // learned this the same way (its Night toggle read stale-day for 5s). Source is the intent.
    const env = scene._source?.environment ?? scene.environment ?? {};
    if (env.darknessLock) return false;                              // the DM froze this map
    if (scene.getFlag(MODULE_ID, "daylightHold")) return false;      // the DM is driving it by hand
    if (campaignManagedScene(scene)) return false;                   // §50.5: Ember's sun runs its own scenes — two hands, one dial
    const want = darknessNow(scene);
    const have = Number(env.darknessLevel) || 0;
    if (Math.abs(want - have) <= MIN_STEP) return false;
    // The write-rate floor. A skipped tick schedules ONE trailing catch-up rather than being
    // dropped, so a fast clock still arrives at the right darkness — just in fewer, bigger,
    // smoothly-faded steps instead of a storm of updates.
    const since = Date.now() - lastWriteAt;
    if (!force && since < MIN_WRITE_MS) {
      if (!pending) {
        pending = setTimeout(() => { pending = null; applyDaylight(game.scenes?.active); }, MIN_WRITE_MS - since);
      }
      return false;
    }
    lastWriteAt = Date.now();
    await scene.update({ "environment.darknessLevel": want },
      { animateDarkness: animate ?? MIN_WRITE_MS }); // fade across the gap, so steps blend
    warnIfGlobalLightSwallows(scene);
    return true;
  } catch (e) {
    console.warn(`${MODULE_ID} | daylight apply failed`, e);
    return false;
  }
}

export function registerDaylight() {
  // Time moved — the scene the TABLE is on follows it. Not canvas.scene: the DM peeking at next
  // week's dungeon shouldn't re-light it, and the scene in play is the one the room can see.
  Hooks.on("updateWorldTime", () => { applyDaylight(game.scenes?.active); });
  // Arriving somewhere is the other half of "the party arriving at a moor at 02:00 finds it dark"
  // (preset.js). No fade on arrival — the map should already BE that dark when it appears, not
  // dawn into it over two seconds in front of everyone.
  Hooks.on("canvasReady", () => { applyDaylight(canvas?.scene, { animate: 0, force: true }); });
  Hooks.on("updateScene", (scene, changes) => {
    // Only on activation. Our own darkness write also fires updateScene, so reacting to anything
    // wider than this is how you build an infinite loop out of a lighting feature.
    if (changes?.active) applyDaylight(scene, { animate: 0, force: true });
  });
}
