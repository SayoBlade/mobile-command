import { MODULE_ID, TABLE_SEATS } from "./preset.js";
import { isOnlineTable } from "./settings.js";

/**
 * ── WHO IS AT THE TABLE — the roster reads the panel and the deck share (deck-command ledger 151) ──
 *
 * Lifted out of dm-panel.js unchanged (2026-09-18) so the action list (actions-*.js) can offer the
 * same people the panel's rows offer, from the same rules. Before this they were private to the
 * panel, which is exactly how two surfaces end up listing different players.
 */

/**
 * The player characters, scene-scoped per UI-BIBLE §6.6 — every PC with a token in the ACTIVE scene;
 * all of them when the active scene has none (campaign start: boarding happens before anyone is
 * placed).
 */
export function scenePcs() {
  let pcs = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
  const inScene = new Set((game.scenes.active?.tokens ?? []).map(t => t.actor?.id).filter(Boolean));
  if (pcs.some(a => inScene.has(a.id))) pcs = pcs.filter(a => inScene.has(a.id));
  return pcs;
}

/** The PC's player (their user) — a ticket or a card goes to the USER, whatever device they hold.
 *
 * ⚠️ 2026-10-05 — THE DISPLAY ACCOUNT IS NOT A PLAYER, and this function was the one place in this
 * file that had not been told. `playerUsers()` thirteen lines down already excludes it; both
 * branches here filtered on `!u.isGM` only. The TV is a non-GM user, and in the live world it
 * holds `Player Character` as its assigned `character` (READ from the world DB, 2026-10-05) — so
 * the FIRST branch matched the TV for that PC and `pcUser()` handed the TV its ticket. That is a
 * life-size ticket at z 99000 filling the shared screen, over the station and everything else on
 * it, with no shell on that client to dismiss it from and no safety rail (the rail only arms for
 * GMs) — recoverable only by the DM punching it from the panel. `boardingUsers()` is built from
 * this function, so "hand out all the tickets" put one on the TV too.
 *
 * One exclusion, same source of truth `playerUsers()` reads. It cannot strand a PC that genuinely
 * belongs to a person: a real player's own ownership entry still matches the second branch.
 */
export function pcUser(a) {
  let display = ""; try { display = game.settings.get(MODULE_ID, "displayOwnerUser") || ""; } catch (e) { /* */ }
  const player = (u) => !u.isGM && u.id !== display;
  return game.users.find(u => player(u) && u.character?.id === a?.id)
    ?? game.users.find(u => player(u) && a?.testUserPermission?.(u, "OWNER")) ?? null;
}

/** The player colour for a PC (their user's colour), for tinting a roster — falls back to gold.
 *  Routed through `pcUser` rather than repeating its lookup (2026-10-05): the duplicate is how the
 *  two drifted apart in the first place, and a roster tinted in the TV's colour beside a ticket
 *  button that names a different person is its own small lie. */
export function pcColor(a) {
  return pcUser(a)?.color?.css ?? "#c8a44d";
}

/** Seat id → user id (§38.4b). A copy — callers edit it and write it back. */
export function tableSeats() {
  try { return foundry.utils.deepClone(game.settings.get(MODULE_ID, "tableSeats") ?? {}); } catch (e) { return {}; }
}

/** Every player: the non-GM users, minus the account the table display logs in as. */
export function playerUsers() {
  let display = ""; try { display = game.settings.get(MODULE_ID, "displayOwnerUser") || ""; } catch (e) { /* */ }
  return game.users.filter(u => !u.isGM && u.id !== display);
}

/**
 * Which way something aimed at a character should face: their player's seat angle (§38.4b), or
 * straight-on when nobody is seated — an online table has no "their side of the screen".
 */
export function pcSeatRot(actor) {
  const u = pcUser(actor);
  if (!u || isOnlineTable()) return 0;
  const seatId = Object.entries(tableSeats()).find(([, uid]) => uid === u.id)?.[0] ?? null;
  return TABLE_SEATS.find(s => s.id === seatId)?.rot ?? 0;
}
