/**
 * ── THE ACTIVE PC: the one lookup (§38.4b "Moving players + the active PC"; deck-command D-0241) ─────────────────────────────
 * Which character a player is playing tonight: the DM's pick (the `seatActors` setting, {userId → actorId}) when it still names
 * a character that player owns, else Foundry's assigned character. Almost every player owns one PC and the pick stays empty.
 * The DM panel, the Fated Tarot and Deck Command's landing table (`MobileCommand.activePC`) all read THIS, so they can never
 * name different characters for the same player. Kept in its own file with no imports beyond preset.js: tests load it bare.
 */
import { MODULE_ID } from "./preset.js";

/** The pick itself, pure: `picked` = the seatActors entry (an id or nothing), `getActor(id)` → actor | null. */
export function resolveActivePC(user, picked, getActor) {
  if (!user) return null;
  if (picked) {
    const a = getActor(picked);
    if (a?.type === "character" && (a.testUserPermission?.(user, "OWNER") ?? true)) return a;
  }
  return user.character?.type === "character" ? user.character : null;
}

/** {userId → actorId}: the DM's picks (a copy). */
export function seatActors() {
  try { return foundry.utils.deepClone(game.settings.get(MODULE_ID, "seatActors") ?? {}); } catch (e) { return {}; }
}

/** A player's active PC (a User, or a user id). */
export function activePC(user) {
  const u = typeof user === "string" ? game.users?.get(user) : user;
  if (!u) return null;
  return resolveActivePC(u, seatActors()[u.id], (id) => game.actors?.get(id) ?? null);
}
