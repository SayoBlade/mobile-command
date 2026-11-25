// The DM panel's drawers, drawn so one broken drawer can never stop a tab from opening (DM 2026-11-25: "when trying
// the seance table I noticed the mc tab doesn't open and the input doesn't work"). The Crooked Moon tab builds all nine
// drawers' bodies eagerly, closed or not, inside one render: a throw in any of them (a campaign helper meeting a
// Foundry or dnd5e change) failed the whole render, so the tab button changed nothing. Each body is now built on its
// own; a failure shows one plain line in that drawer and is logged once.

const logged = new Set();

/** fn()'s HTML, or a one-line notice if it throws. Pure apart from the console. */
export function safeBody(label, fn, { log = (...a) => console.error(...a) } = {}) {
  try { return String(fn() ?? ""); }
  catch (e) {
    if (!logged.has(label)) { logged.add(label); try { log(`mobile-command | the "${label}" drawer could not be drawn`, e); } catch (_) { /* console */ } }
    return `<div class="mc-dmp-empty">${String(label).replace(/[<>&"]/g, "")} could not be drawn just now (details in the console).</div>`;
  }
}

/**
 * The drawer a deck press should open with its tab: the group of the MC action it just ran ("Séance" → the Séance
 * drawer). Only for a press within `withinMs`. Pure.
 */
export const DRAWER_FOR_GROUP = Object.freeze({ "Séance": "fxSeance", "Curses": "cmCurses", "Bargains": "cmCurses", "Twists": "cmTwists",
  "Twists of fate": "cmTwists", "Fate": "cmFate", "Intros": "cmIntros", "Tarot": "cmTarot", "All aboard": "cmBoard", "Boarding": "cmBoard",
  "Ghostlight": "cmRide", "Druskenvald": "cmClock" });

/** The last MC action run (its group and when): a deck press opens the matching DM-panel drawer with its tab. */
export const lastRun = { group: null, id: null, at: 0 };
export function drawerForPress(last, now, withinMs = 5000) {
  if (!last?.group || !(now - (last.at ?? 0) <= withinMs)) return null;
  return DRAWER_FOR_GROUP[last.group] ?? null;
}
