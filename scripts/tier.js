// Player tier — Basic / Complex (DM 2026-10-08, "complex" his rename 2026-10-09).
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────┐
// │ THE LINE IS "AFFECTS ONLY ME" vs "AFFECTS EVERYONE" — NOT SIMPLE vs COMPLEX.             │
// │ Shared state is the risk, not difficulty. A phone action that writes something other     │
// │ players are standing on (the formation, the stash, the scene the party is in, the        │
// │ downtime board) is Complex; anything that touches only the player's own sheet is Basic.  │
// └──────────────────────────────────────────────────────────────────────────────────────────┘
//
// His words: *"I'm thinking of giving mc a basic and advanced version (set by dm in settings)
// letting players mess around with the group up order, all the downtime options … I'll start my
// game in basic since I'm not too happy with it in the mobile side, they still need time."*
//
// COMPLEX ONLY (hidden on every phone while the table is Basic) — COMPLEX_SURFACES below.
//
// STAYS IN BASIC, his ruling, three of them OVERRIDING the rule above: story & scribe questions,
// party journal add / edit / delete, and the night toggle + token light DO touch shared state —
// he kept them because they carry flavour and have a small blast radius. Do not "fix" them into
// Complex. Also Basic, as genuinely self-contained: Actions, Details, Spells, Equipment, the
// Explore move pad and Use, rests, favourites, Journal, the Crooked Moon tab, template placement,
// wild shape.
//
// THE DM IS NEVER GATED. Everything hidden here stays on the DM panel, which can do all of it on
// its own (place, lock in, stage, deploy, release, combine, the downtime board, the stash). The
// gate applies to the phone shell for every user, a GM included, so a DM holding a phone sees what
// the players see.
//
// ONE gate: surfaceOn(). Every phone surface that must vanish in Basic asks it — nothing else
// reads the setting. Flipping mid-campaign is safe because the shell's setting hook calls
// leaveComplexIfGated(), which steps a phone out of whatever just disappeared (the same rescue
// leaveCrookedTabIfGated() does for the Crooked Moon tab).
import { MODULE_ID } from "./preset.js";

export const TIER_SETTING = "playerTier";
export const TIERS = Object.freeze({ basic: "Basic", complex: "Complex" });
export const DEFAULT_TIER = "basic"; // he starts his campaign in Basic

// surface key → what it covers on the phone. A key missing from here is a bug; see surfaceOn.
export const COMPLEX_SURFACES = Object.freeze({
  // party / marching order AND staging (lock in, travel stage, deploy, release, combine) — on the
  // phone these are one place: the packed-party view (Party · Party order · Exploration · Shared
  // inventory tabs, the group pad on the sheet). In Basic a packed player keeps their own sheet.
  party: "Packed party: marching order, staging, deploy, the group's move pad",
  downtime: "The downtime board: choosing an activity, pushed rolls",
  sharedInventory: "Shared inventory: put in / take from the stash, offering items to an ally",
  travel: "Travel squares, including the travel-alone-or-as-group question",
});

// Every phone click action that belongs to a Complex surface. The shell's dispatcher asks
// actionAllowed() before running one, so a stale button left on screen can't act after a flip.
// Close / cancel / minimise (transfer-close, travel-cancel, dt-collapse) are deliberately NOT
// here: backing out of something must always work.
const ACTION_SURFACE = Object.freeze({
  "party-view-toggle": "party", "ptab": "party", "party-cell": "party", "party-mine": "party",
  "party-move": "party", "party-stage": "party", "party-check": "party", "party-done": "party",
  "party-forward": "party", "party-disperse": "party", "group-portrait": "party",
  "dt-roll": "downtime", "dt-remove": "downtime",
  "transfer-open": "sharedInventory", "transfer-dest": "sharedInventory",
  "transfer-item": "sharedInventory", "transfer-qty": "sharedInventory", "transfer-commit": "sharedInventory",
  "trade-accept": "sharedInventory", "trade-decline": "sharedInventory",
  "travel-open": "travel", "travel-alone": "travel", "travel-group": "travel",
});

export function playerTier() {
  try {
    const v = game.settings.get(MODULE_ID, TIER_SETTING);
    return v in TIERS ? v : DEFAULT_TIER;
  } catch (e) { return DEFAULT_TIER; } // unregistered (very early boot) → the safe tier
}

// THE gate. True when the surface may show on this phone. Unknown keys fail CLOSED (and say so):
// a typo must hide a surface, never leak a shared-state one into a Basic table.
export function surfaceOn(surface) {
  if (!(surface in COMPLEX_SURFACES)) {
    console.error(`${MODULE_ID} | tier gate: unknown surface "${surface}" — hidden`);
    return false;
  }
  return playerTier() === "complex";
}

// Click-dispatch guard: actions outside ACTION_SURFACE are Basic and always allowed.
export function actionAllowed(action) {
  const surface = ACTION_SURFACE[action];
  return surface ? surfaceOn(surface) : true;
}
