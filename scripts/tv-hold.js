// The TV camera's HOLD (§40.6, DM 2026-09-19: "focus the MC camera on the NPC … 1 second after the intro's end
// revert to the last view"). While an entrance has the display's camera, the party follow and the combat spotlight
// (main.js) wait instead of pulling it back to the party mid-banner. A hold always expires on its own, so a torn-down
// entrance can never leave the camera frozen.
let until = 0;

/** Keep the follow off the camera for `ms` from now (extends, never shortens, a running hold). */
export function holdTv(ms) { until = Math.max(until, Date.now() + Math.max(0, ms)); }
/** Hand the camera back now. */
export function releaseTv() { until = 0; }
/** Is an entrance holding the camera right now? */
export function tvHeld() { return Date.now() < until; }
