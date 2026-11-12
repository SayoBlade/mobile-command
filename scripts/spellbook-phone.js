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

/**
 * ── SPELL BOOK OPENS AFTER A LEVEL-UP THAT RAISED A SPELL COUNT (DM 2026-11-12, "yes") ─────────────────────────────
 * Hero Mancer opens Spell Book after a level-up only when its own setting `autoOpenSpellBook` is on — a per-browser,
 * hidden setting, off by default, so it never fired here — and only for a new spell LEVEL or new cantrips: a Cleric or
 * Wizard going from 1 to 2 (more spells to prepare) never qualified (seat, 2026-11-12, spellbook-pc-11). So this client
 * counts the character's spells when Hero Mancer's level-up opens (`heroMancer.LevelUpStarted`) and again when it ends
 * (`heroMancer.LevelUpCompleted`), and opens Spell Book for the owner when any count rose. On a phone it opens only
 * with the phone switch on, and the shell lifts it (above). Hero Mancer's own auto-open, when on, is left to it.
 */
const num = (v) => Number(v?.value ?? v) || 0;
/** The counts a level-up can raise: prepared, known, cantrips, the highest slot level. Pure on the actor's data. */
export function spellCounts(actor) {
  const out = { prepared: 0, known: 0, cantrips: 0, maxLevel: 0, casters: 0 };
  for (const c of [...(actor?.items ?? [])]) {
    if (c?.type !== "class" || !c.system?.spellcasting?.progression || c.system.spellcasting.progression === "none") continue;
    out.casters += 1;
    out.prepared += num(c.system.spellcasting.preparation?.max);
    const scale = actor.system?.scale?.[c.system.identifier] ?? {};
    out.known += num(scale["spells-known"]);
    out.cantrips += num(scale["cantrips-known"] ?? scale.cantrips);
  }
  for (const [k, s] of Object.entries(actor?.system?.spells ?? {})) {
    if (!(Number(s?.max) > 0)) continue;
    const lvl = k === "pact" ? Number(s.level ?? 0) : Number(String(k).replace("spell", "")) || 0;
    if (lvl > out.maxLevel) out.maxLevel = lvl;
  }
  return out;
}
/** Did any count rise (or a first casting class arrive)? Pure. */
export function spellCountRose(before, after) {
  if (!after?.casters) return false;
  if (!before) return true; // nothing seen at the start (a window opened before this loaded): a caster levelled, open it
  return ["prepared", "known", "cantrips", "maxLevel", "casters"].some((k) => Number(after[k]) > Number(before[k] ?? 0));
}
/** Would Hero Mancer open Spell Book itself (its own setting on, and its own condition)? Then this stands down. */
export function heroMancerOpensItself(spellcasting, g = globalThis) {
  let on = false; try { on = g.game?.settings?.get?.("hero-mancer", "autoOpenSpellBook") === true; } catch (e) { on = false; }
  const s = spellcasting ?? {};
  return on && Boolean(s.firstCaster || Number(s.newMaxSpellLevel) > Number(s.previousMaxSpellLevel) || Number(s.newCantrips) > Number(s.previousCantrips));
}

const countsAtStart = new Map();
/** Hook it up (main.js, at ready). `isPhone` decides the phone switch; returns whether it installed. */
export function installSpellBookAfterLevelUp({ H = globalThis.Hooks, isPhone = () => false, g = globalThis } = {}) {
  if (!H?.on) return false;
  H.on("heroMancer.LevelUpStarted", ({ actor } = {}) => { if (actor?.id) countsAtStart.set(actor.id, spellCounts(actor)); });
  H.on("heroMancer.LevelUpCompleted", ({ actor, spellcasting } = {}) => {
    try {
      if (!actor?.isOwner || !spellBookApi(g) || !isSpellcaster(actor)) return;
      const before = countsAtStart.get(actor.id) ?? null; countsAtStart.delete(actor.id);
      if (!spellCountRose(before, spellCounts(actor))) return;
      if (heroMancerOpensItself(spellcasting, g)) return;
      if (isPhone() && !phoneSpellBookOn(g)) return;
      openSpellBookFor(actor, g).catch((e) => console.warn("mobile-command | Spell Book after level-up:", e?.message ?? e));
    } catch (e) { console.warn("mobile-command | Spell Book after level-up:", e?.message ?? e); }
  });
  return true;
}
