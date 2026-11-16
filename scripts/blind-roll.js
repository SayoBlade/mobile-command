/**
 * A BLIND ROLL REQUEST (deck-command D-0118; DM 2026-11-16: "hold on roll requests to make the roll a blind one (i.e.
 * only the DM sees results)").
 *
 * The DM holds the ask on his deck; the request reaches the phone carrying `blind: true`. The player still rolls their
 * own (advantage and all), but the roll goes out in Foundry's BLIND message mode: whispered to the GMs, and drawn as
 * "???" for its own author. The phone must not undo that, so its toast and its recent-rolls strip show a hidden mark
 * instead of the number. The TV is never a recipient, so it shows nothing.
 *
 * ⚠️ THE MODE'S NAME CHANGED IN FOUNDRY 14: the message modes are `CONFIG.ChatMessage.modes` ("public", "gm", "blind",
 * "self"); the old `CONST.DICE_ROLL_MODES.BLIND` is "blindroll", which v14's `applyMode` does not know and quietly
 * replaces with the client's DEFAULT mode, i.e. a public roll. dnd5e 6 hands `rollMode` straight to `applyMode`, so the
 * name must be the one the running Foundry knows. Read from the install 2026-11-16 (14.364, dnd5e 6.0.6).
 */

/** The blind mode's name in this Foundry. Pure given `modes` (CONFIG.ChatMessage.modes, or undefined before v14). */
export function blindModeName(modes = globalThis.CONFIG?.ChatMessage?.modes) {
  return modes && typeof modes === "object" && "blind" in modes ? "blind" : "blindroll";
}

/** Is this roll request blind? */
export const requestIsBlind = (p) => p?.blind === true;

/** dnd5e's message config for a request: blind adds the mode, anything else is left as it was. */
export function messageForRequest(p, message = {}, modes) {
  return requestIsBlind(p) ? { ...message, rollMode: blindModeName(modes) } : message;
}

/** Must THIS client keep the number to itself? A blind message, seen by anyone but a GM. */
export function hiddenFromMe(message, user = globalThis.game?.user) {
  return Boolean(message?.blind) && !user?.isGM;
}
