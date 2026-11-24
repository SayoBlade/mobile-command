// The fight carousel on the TV (DM 2026-11-24: "I'm also missing the combat carousel on tv").
//
// Carousel Combat Tracker (combat-tracker-dock 5.0.5, docked: direction "rowDocked") draws #combat-dock INSIDE core's
// #ui-top, and the dock is an ApplicationV2 (.application). The TV's clean view (styles/shell.css, body.mc-clean) hid
// both #ui-top and every .application since 2026-06-19, so the carousel never showed on an MC TV — not a Foundry or
// carousel update. Now: #ui-top stays laid out but empty (everything in it but the dock hidden — the dock sizes its
// portraits from #ui-top's width, so it must not be display:none), and the dock fades in while a fight has STARTED
// (`mc-tv-fight` on <body>) and fades out when it ends. A fight still being set up shows nothing on the TV.
//
// SEAT 17 (2026-11-24): with the CSS right, the carousel still never drew on the TV-like client. Read from its source:
//   - it opens its dock only from createCombat (when `game.combat === combat`), updateCombat with `active`, and
//     canvasReady → the NEXT renderCombatTracker → `ui.combat.viewed`. On a player screen `game.combat` IS the sidebar
//     tracker's `viewed`, and core moves `viewed` to a new fight only if it had none (Combat#_onCreate). The TV never
//     shows its sidebar, so nothing on it re-points the tracker: the dock was never opened (seen: not in the page).
//   - its dock starts with the class `hidden`, removed ONCE, at the end of the opening animation of its first render
//     (`_playAnimation`, after every portrait is ready). A dock whose first render did not finish stays hidden for
//     good; forcing `render(true)` again does not replay it (seen: in #ui-top, `hidden`, 0×0).
// So on the TV, MC drives the carousel's own open path for the started fight on the TV's map: a FRESH dock (its own
// constructor, so its own opening animation) when none shows that fight, and, if `hidden` is still on once that
// animation should have run (UNHIDE_AFTER_MS), the same two lines its animation ends with. What it shows stays the
// carousel's: its player view, hidden combatants hidden. `globalThis.mcTvCarousel` says what was done, for a seat.

export const TV_FIGHT_CLASS = "mc-tv-fight";
export const UNHIDE_AFTER_MS = 3000;   // the carousel's intro: portraits ready + 10 ms; a slow TV gets slack
export const REOPEN_GAP_MS = 2000;     // never open twice for the same fight within this (a render in flight)

export const tvCarouselState = { last: "", opened: 0, unhid: 0, combat: null };
try { globalThis.mcTvCarousel = tvCarouselState; } catch (e) { /* no global */ }

/** Show the carousel on the TV for this combat? Pure. */
export function tvFightOn(combat) {
  return Boolean(combat && combat.started === true);
}

const sceneIdOf = (c) => c?.scene?.id ?? c?.sceneId ?? c?._source?.scene ?? null;

/**
 * The fight the TV should show: a started one on the TV's map (or scene-less), the active one first; else the
 * fallback (core's game.combat) if it has started. Not core's sidebar `viewed` alone (see the header). Pure.
 */
export function tvFight(combats, sceneId, fallback = null) {
  const list = [...(combats ?? [])].filter((c) => tvFightOn(c) && (sceneIdOf(c) === null || sceneIdOf(c) === sceneId));
  const pick = list.find((c) => c.active) ?? list[0] ?? null;
  if (pick) return pick;
  return tvFightOn(fallback) ? fallback : null;
}

/** The TV's fight, from the live game. */
export function currentTvFight(g = globalThis.game, cv = globalThis.canvas) {
  try { return tvFight(g?.combats, cv?.scene?.id ?? g?.scenes?.viewed?.id ?? null, g?.combat ?? null); }
  catch (e) { return null; }
}

/** Put `mc-tv-fight` on <body> to match the TV's fight. */
export function syncTvFight(body = globalThis.document?.body, combat = currentTvFight()) {
  if (!body?.classList) return false;
  const on = tvFightOn(combat);
  body.classList.toggle(TV_FIGHT_CLASS, on);
  return on;
}

/**
 * Make sure the carousel shows the TV's fight. `ctd` = CONFIG.combatTrackerDock, `uiRef` = ui. Returns what it did:
 * "no carousel" | "no fight" | "open" | "opened" | "wait".
 */
export function ensureDock(combat, { ctd = globalThis.CONFIG?.combatTrackerDock, uiRef = globalThis.ui, now = Date.now() } = {}) {
  if (typeof ctd?.CombatDock !== "function") return "no carousel";
  if (!tvFightOn(combat)) return "no fight";                     // the carousel closes itself when a fight ends
  const dock = uiRef?.combatDock ?? null;
  if (dock && !dock._closed && dock.combat === combat && dock.rendered) return "open";
  if (tvCarouselState.combat === combat.id && now - tvCarouselState.at < REOPEN_GAP_MS) return "wait";
  tvCarouselState.combat = combat.id; tvCarouselState.at = now;
  new ctd.CombatDock(combat).render(true);                       // the carousel's own open path (its main.js)
  tvCarouselState.opened += 1;
  return "opened";
}

/**
 * If the dock for this fight is drawn but still carries the carousel's own `hidden`, do what its opening animation
 * ends with. Returns true if it unhid it.
 */
export function unhideDock(combat, { uiRef = globalThis.ui, body = globalThis.document?.body } = {}) {
  const dock = uiRef?.combatDock ?? null;
  const el = dock?.element;
  if (!tvFightOn(combat) || !dock || dock._closed || dock.combat !== combat || !el?.classList?.contains("hidden")) return false;
  el.classList.remove("hidden");
  body?.classList?.add("ctd-dock-visible");
  try { dock.centerCurrentCombatant?.(); } catch (e) { /* its own layout */ }
  tvCarouselState.unhid += 1;
  return true;
}

export const TV_FIGHT_HOOKS = ["createCombat", "updateCombat", "deleteCombat", "combatStart", "canvasReady"];

/** Call once on the display client. */
export function registerTvCarousel(hooks = globalThis.Hooks, { later = (fn, ms) => setTimeout(fn, ms) } = {}) {
  const run = () => {
    try {
      const combat = currentTvFight();
      syncTvFight(globalThis.document?.body, combat);
      tvCarouselState.last = ensureDock(combat);
      if (tvFightOn(combat)) later(() => { try { unhideDock(combat); } catch (e) { /* never break */ } }, UNHIDE_AFTER_MS);
    } catch (e) { tvCarouselState.last = `error: ${e?.message ?? e}`; }
  };
  // a beat later than the carousel's own hooks, so its own open path goes first
  const sync = () => later(run, 300);
  for (const h of TV_FIGHT_HOOKS) hooks.on(h, sync);
  sync();
}
