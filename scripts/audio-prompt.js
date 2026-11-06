/**
 * The display's sound prompt, the rules only (DESIGN §21, 2026-11-06). No Foundry global here:
 * tools/test-audio-prompt.mjs runs both headless. main.js `setupDisplayAudioUnlock` is the glue.
 */

/**
 * What the display shows: the full "card", the small corner "icon", or null.
 * The card is offered once per load; a tap closes it, whatever the audio did after that tap.
 */
export function audioPrompt({ paused, dismissed }) {
  if (!paused) return null;
  return dismissed ? "icon" : "card";
}

/**
 * Wait for these promises, but never longer than `ms`.
 *
 * ⚠️ `AudioContext.resume()` is allowed to stay PENDING forever: while a browser won't start the
 * context it neither resolves nor rejects. Nothing that has to happen after a tap may await it bare.
 */
export function settleWithin(promises, ms, timer = setTimeout) {
  return Promise.race([
    Promise.all(promises.map((p) => Promise.resolve(p).catch(() => {}))),
    new Promise((resolve) => { timer(resolve, ms); }),
  ]);
}
