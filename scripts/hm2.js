/**
 * Hero Mancer 2 on the phone (DM 2026-11-09: "Wouldn't the hm2 popup work in the phone?").
 *
 * HM2 3.3.3's level-up is `api.openLevelUp(actor)`: one framed ApplicationV2 (its wizard in "level_up" mode). It never
 * touches the game canvas (its only `canvas` is a DOM one for image colours), so it renders on a canvasless phone;
 * shell.js liftDialogAboveShell puts it above the shell, as it does dnd5e's advancement window. HM2's own rule for
 * players stands: a player levels up only when the GM has sent one (`flags.hero-mancer.levelUpReady`, set by the
 * sheet's "Send Level Up"). Character CREATION stays off the phone.
 */

/** Hero Mancer 2's api when it is active (game.modules.get("hero-mancer").api), else null. */
export function hm2Api() {
  const m = game.modules?.get?.("hero-mancer");
  return m?.active && typeof m.api?.openLevelUp === "function" ? m.api : null;
}

/**
 * LEVEL-UPS ARE PC-ONLY (DM 2026-11-11, deck-command DECISIONS D-0105: "level-ups are PC-only too: Hero Mancer, plus
 * Spell Book for spell learning"). The phone shows no Level up button; when the DM has sent one, it says to ask at the
 * PC. The world setting `phoneLevelUp` (off by default) brings the phone's button back — "for now" stays reversible.
 */
export function phoneLevelUps() {
  try { return game.settings.get("mobile-command", "phoneLevelUp") === true; } catch (e) { return false; }
}
/**
 * What the Lvl panel offers, pure: "hm2" (HM2's window), "dnd5e" (dnd5e's own flow), "ask" (a note: ask the DM at the
 * PC) or null. `phone` is phoneLevelUps(); `hm2` whether HM2 is on; `sent` HM2's levelUpReady; `owner`, `classes`.
 */
export function levelUpOffer({ phone = false, hm2 = false, sent = false, owner = false, classes = 0 } = {}) {
  if (!phone) return hm2 && sent && owner ? "ask" : null;
  if (hm2) return sent && owner ? "hm2" : null;
  return classes ? "dnd5e" : null;
}

/** Has the GM sent this character a level-up through HM2 (its `levelUpReady` actor flag)? */
export function hm2LevelUpSent(actor) {
  if (!hm2Api() || actor?.type !== "character") return false;
  try { return actor.getFlag("hero-mancer", "levelUpReady") === true; } catch (e) { return false; }
}
