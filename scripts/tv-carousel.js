// The fight carousel on the TV (DM 2026-11-24: "I'm also missing the combat carousel on tv").
//
// Carousel Combat Tracker (combat-tracker-dock 5.0.5, docked: direction "rowDocked") draws #combat-dock INSIDE core's
// #ui-top, and the dock is an ApplicationV2 (.application). The TV's clean view (styles/shell.css, body.mc-clean) hid
// both #ui-top and every .application since 2026-06-19, so the carousel never showed on an MC TV — not a Foundry or
// carousel update. Now: #ui-top stays laid out but empty (everything in it but the dock hidden — the dock sizes its
// portraits from #ui-top's width, so it must not be display:none), and the dock fades in while a fight has STARTED
// (`mc-tv-fight` on <body>) and fades out when it ends. A fight still being set up shows nothing on the TV.

export const TV_FIGHT_CLASS = "mc-tv-fight";

/** Show the carousel on the TV for this combat? Pure. */
export function tvFightOn(combat) {
  return Boolean(combat && combat.started === true);
}

/** Put `mc-tv-fight` on <body> to match the viewed combat. */
export function syncTvFight(body = globalThis.document?.body, combat = globalThis.game?.combat) {
  if (!body?.classList) return false;
  const on = tvFightOn(combat);
  body.classList.toggle(TV_FIGHT_CLASS, on);
  return on;
}

export const TV_FIGHT_HOOKS = ["createCombat", "updateCombat", "deleteCombat", "combatStart", "canvasReady"];

/** Call once on the display client. */
export function registerTvCarousel(hooks = globalThis.Hooks) {
  // a tick later: game.combat follows the hook's own document change
  const sync = () => setTimeout(() => { try { syncTvFight(); } catch (e) { /* never break a hook */ } }, 0);
  for (const h of TV_FIGHT_HOOKS) hooks.on(h, sync);
  syncTvFight();
}
