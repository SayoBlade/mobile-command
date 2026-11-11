/**
 * SPELL BOOK ON THE PHONE (DM 2026-11-11, asked through the deck-command lead: *"can't we use Spell Book for this as a
 * popup in the phone?"*). Spells are prepared and swapped in the Spell Book module's own window (deck-command
 * DECISIONS D-0105: level-ups and spell learning at the PC; preparing after a rest may be on the phone). This is the
 * code path for a SEAT TEST, behind the world setting `phoneSpellBook` (off by default):
 *
 *   - a "Spell Book" button on the phone's Spells tab and on the long-rest result, for the player's own spellcaster,
 *     while the setting is on and Spell Book is active;
 *   - the tap calls Spell Book's own api, `SPELLBOOK.api.openSpellBookForActor(actor)` (Spell Book 2.5.5: it prepares
 *     the swap state, then renders its player window — an ApplicationV2 with id "player-spell-book");
 *   - that window is FRAMELESS (`window: { frame: false }`, 700×850), so the shell's usual lift — which skips frameless
 *     apps — would leave it hidden under the shell. shell.js lifts this one window by name, full-screen
 *     (`mc-phone-spellbook`), with the same backdrop and z handling as every lifted dialog.
 *
 * Read from Spell Book 2.5.5's installed source (spell-book.mjs): the api is on `globalThis.SPELLBOOK.api`; its player
 * window touches no game canvas (only its token-quick-access helper does, which this never calls). Whether its layout
 * reads on a phone is the seat's question.
 */
export const SPELL_BOOK_ID = "spell-book";
export const SPELL_BOOK_APP_ID = "player-spell-book";

/** Spell Book's api when the module is active, else null. */
export function spellBookApi(g = globalThis) {
  const m = g.game?.modules?.get?.(SPELL_BOOK_ID);
  if (!m?.active) return null;
  const api = g.SPELLBOOK?.api ?? m.api ?? null;
  return typeof api?.openSpellBookForActor === "function" ? api : null;
}

/** The seat-test switch (world setting, off by default). */
export function phoneSpellBookOn(g = globalThis) {
  try { return g.game?.settings?.get?.("mobile-command", "phoneSpellBook") === true; } catch (e) { return false; }
}

/** A character with a spellcasting class. */
export function isSpellcaster(actor) {
  if (actor?.type !== "character") return false;
  return [...(actor.items ?? [])].some((i) => i?.type === "class" && i.system?.spellcasting?.progression && i.system.spellcasting.progression !== "none");
}

/** Whether the phone offers the button: the switch on, Spell Book there, the player's own spellcaster. Pure. */
export function spellBookOffer({ on = false, api = null, owner = false, caster = false } = {}) {
  return Boolean(on && api && owner && caster);
}

/** Is this rendered application Spell Book's player window? */
export function isSpellBookApp(app) {
  if (!app) return false;
  if (app.id === SPELL_BOOK_APP_ID || app.options?.id === SPELL_BOOK_APP_ID) return true;
  if ((app.options?.classes ?? []).includes(SPELL_BOOK_APP_ID)) return true;
  const el = app.element instanceof (globalThis.HTMLElement ?? Object) ? app.element : null;
  return Boolean(el?.classList?.contains?.(SPELL_BOOK_APP_ID));
}

/** Open Spell Book for this character through its own api. Resolves true when asked, false when it could not be. */
export async function openSpellBookFor(actor, g = globalThis) {
  const api = spellBookApi(g);
  if (!api || !actor) return false;
  await api.openSpellBookForActor(actor);
  return true;
}
