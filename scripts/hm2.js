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

/** Has the GM sent this character a level-up through HM2 (its `levelUpReady` actor flag)? */
export function hm2LevelUpSent(actor) {
  if (!hm2Api() || actor?.type !== "character") return false;
  try { return actor.getFlag("hero-mancer", "levelUpReady") === true; } catch (e) { return false; }
}
