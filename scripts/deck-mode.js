/**
 * ── DECK MODE — what the DM panel still needs to show when he has a deck ────────────────────────
 *
 * DM 2026-10-12: *"create deck/no deck modes, deck mode doesn't duplicate any of the dc abilities,
 * so only things I need stay."*
 *
 * ⚠️ NOTHING IN HERE IS WIRED YET, ON PURPOSE. `dm-panel.js` does not import this file. The policy
 * is written and tested first so his review (DECK-MODE.md §3) is an edit to two short lists rather
 * than a trawl through a 5,000-line renderer. Wiring it is one `if` per control group in the
 * renderer and wants a live press, which is why it waits for him.
 *
 * THREE RULES, IN THIS ORDER:
 *
 *  1. **Derived, not listed.** A control that runs a published action (`actions.js`) is ON THE DECK
 *     by construction — DC's Table page draws the registry without deck code. So deck mode hides it
 *     and no list has to be maintained. An effect added to the registry next month is hidden the day
 *     it appears, with nothing to remember.
 *  2. **Pins win.** Some registry actions are a worse experience on a key than on the screen (free
 *     text the deck cannot type, a hundred-item pick). Those are pinned and stay on the panel.
 *  3. **Everything else is kept.** A control with no registry action and no entry in HIDE_NATIVE is
 *     RENDERED. Forgetting an entry therefore shows a duplicate button — mildly untidy — rather than
 *     removing his only route to something. That asymmetry is deliberate: this file fails safe.
 *
 * ⚠️ MC MUST NOT DETECT DC (DC DESIGN §7.11). The mode is a setting the DM sets. Nothing here asks
 * whether `deck-command` is installed, and nothing should: the seam is that MC never learns the deck
 * exists, and a one-line module check is exactly how that seam would quietly stop being true.
 */

import { MODULE_ID } from "./preset.js";

export const SURFACE_SETTING = "dmSurface";
export const SURFACE_PANEL = "panel";
export const SURFACE_DECK = "deck";

/**
 * World-scoped, not client-scoped, and the reason is scar tissue: `dmScreenOverlays` is
 * `scope: "client"`, defaults off, and therefore never appears until it is ticked IN THAT BROWSER —
 * which was the 2026-10-02 blocker. A DM who chooses deck mode at home should not find the whole
 * panel back on the office PC.
 */
export function registerDeckModeSetting() {
  game.settings.register(MODULE_ID, SURFACE_SETTING, {
    name: "DM surface",
    hint: "Deck mode hides the panel controls a macro deck already covers. Panel mode shows everything.",
    scope: "world",
    config: true,
    type: String,
    choices: { [SURFACE_PANEL]: "Panel — show everything", [SURFACE_DECK]: "Deck — hide what the deck covers" },
    default: SURFACE_PANEL,
  });
}

/** Defensive: an unregistered setting, or no `game` at all, means PANEL — the mode that hides nothing. */
export function surface() {
  try {
    const v = game.settings.get(MODULE_ID, SURFACE_SETTING);
    return v === SURFACE_DECK ? SURFACE_DECK : SURFACE_PANEL;
  } catch (e) {
    return SURFACE_PANEL;
  }
}

export const deckMode = () => surface() === SURFACE_DECK;

/**
 * RULE 2 — registry actions that stay on the panel anyway.
 *
 * Each needs a reason that is about the INSTRUMENT, not about taste: the deck cannot do this well,
 * or cannot do it at all. "I like it on the screen" belongs in HIDE_NATIVE's absence, not here.
 */
export const PINNED_KEEP = new Map([
  // The deck's version is a pick over the fixed SEANCE_WORDS list; the panel's is free text with
  // send-on-Enter. A spirit board that can only say the words we shipped is not a spirit board.
  ["cm.seanceSay", "free text — the deck can only offer the preset words"],
  // A hundred curses is ten pages of ten on the deck. Workable, but the dropdown is faster when he
  // is already looking at the screen to read them.
  ["cm.curseHand", "100 choices — a dropdown beats ten deck pages"],
]);

/**
 * RULE 1's exceptions in the other direction — controls with NO registry action that DC covers with
 * a verb of its own. Every entry here was checked against DC's current code, not assumed, and the
 * comment says which DC verb does it. ⚠️ If DC drops a verb, its entry must come out of this list or
 * the control vanishes from both surfaces.
 */
export const HIDE_NATIVE = new Map([
  // Combat — DC's own combat pages.
  // ⚠️ prevTurn is deliberately ABSENT: he retired the deck key, so the panel is its only route.
  ["combat.start", "the deck's staging page"],
  ["combat.nextTurn", "the deck's turn pages"],
  ["combat.endCombat", "the deck: hold Back"],
  ["combat.rollNpcs", "the deck's Roll Init"],
  ["combat.battleMusic", "the deck's battle-track keys"],
]);

/**
 * ⚠️ HIS RULINGS, 2026-10-13 — two groups came OUT of the list above, and must not drift back:
 *
 *  - **Camera and display.** *"Keep camera controls."* Follow, follow-all, fit, zoom and the floor's
 *    focus-party / manual-TV chips all stay, even though DC covers every one of them.
 *  - **The whole Party tab.** *"We still need party order, and if that stays keep the group up
 *    ungroup, and everything else in the tab."* Beyond his preference there is a structural reason:
 *    `tier.js` promises *"the DM is never gated — everything hidden here stays on the DM panel"*,
 *    and Basic hides the packed party, marching order, staging, the stash and the downtime board
 *    from every phone. His table starts in Basic. Hiding those from the panel as well would leave
 *    them reachable by nobody.
 *
 * The rule that generalises: **anything a Basic phone cannot reach stays on the panel, whatever the
 * surface setting says.** See `tierKeepsOnPanel()`.
 */
import { COMPLEX_SURFACES } from "./tier.js";

/** Panel controls that back a Complex-only phone surface — never hidden, so Basic keeps a route. */
export const TIER_BACKED = new Map([
  ["party.order", "party"],
  ["party.staging", "party"],
  ["party.deploy", "party"],
  ["party.release", "party"],
  ["party.combine", "party"],
  ["party.lockIn", "party"],
  ["downtime.board", "downtime"],
  ["stash.putIn", "sharedInventory"],
  ["stash.takeFrom", "sharedInventory"],
  ["travel.square", "travel"],
]);

export function tierKeepsOnPanel(controlId) {
  const surface = TIER_BACKED.get(controlId);
  return !!surface && surface in COMPLEX_SURFACES;
}

/**
 * Should this panel control be hidden right now?
 *
 * @param {string} controlId      the panel's own id for the control (HIDE_NATIVE's keys)
 * @param {object} [o]
 * @param {string|null} [o.actionId]  the published action it runs, if any
 * @returns {boolean}
 */
export function hiddenInDeckMode(controlId, { actionId = null } = {}) {
  if (!deckMode()) return false;                  // panel mode hides nothing, ever
  if (tierKeepsOnPanel(controlId)) return false;  // Basic phones have no other route — outranks all
  if (actionId && PINNED_KEEP.has(actionId)) return false;  // rule 2 beats rule 1
  if (actionId) return true;                      // rule 1: the registry is the duplication
  return HIDE_NATIVE.has(controlId);              // rule 3: unlisted and unpublished means keep
}

/** Why a control is hidden — for a devreport line, and for answering "where did that button go?" */
export function hiddenBecause(controlId, { actionId = null } = {}) {
  if (!hiddenInDeckMode(controlId, { actionId })) return null;
  return actionId ? `published as ${actionId} — the deck's Table draws it` : HIDE_NATIVE.get(controlId);
}

/** A whole drawer disappears when every control in it is hidden — a panel of dead rows is worse. */
export function drawerHidden(controls = []) {
  if (!deckMode() || !controls.length) return false;
  return controls.every((c) => hiddenInDeckMode(c.id, { actionId: c.actionId ?? null }));
}
