/**
 * ── THE DARK BARGAINS' FIGURINES (DM 2026-11-27) ─────────────────────────────────────────────────────────────────────────────
 * His words: a small figurine for each of the 13 Dark Bargains, "placed beside a player's cage/card on the landing table when that
 * player takes a bargain" — "These should be on the lower left corner of the card near the cage".
 *
 * The bargains are the book's, so their names live here (Mobile Command carries the Crooked Moon); the pictures are Deck
 * Command's keepsake art (deck-command foundry-module/assets/keepsakes/bargains/<id>.webp, his generated images, or placeholders
 * until his arrive: a new image replaces the file, the id never changes). Deck Command reads this list through
 * `MobileCommand.figurines()` and places / removes the figurine itself, by hand from the console (deck-command D-0236; no deck key,
 * DM: "I'll let you know what to add, no need to build UI"): `DeckCommand.bargains.place("Archer", "Wings of Whispers")`.
 * Offered only while the Crooked Moon tools are on.
 */
import { MODULE_ID } from "./preset.js";

const ART = "modules/deck-command/assets/keepsakes/bargains/";
export const BARGAINS = Object.freeze([
  ["wings-of-whispers", "Wings of Whispers"], ["cult-of-personality", "Cult of Personality"], ["bestial-awakening", "Bestial Awakening"],
  ["call-of-the-lonely", "Call of the Lonely"], ["unquenchable-fury", "Unquenchable Fury"], ["self-serving-sacrifice", "Self-Serving Sacrifice"],
  ["hand-of-death", "Hand of Death"], ["crooked-fortune", "Crooked Fortune"], ["stilled-hungers", "Stilled Hungers"],
  ["shrouded-spirit", "Shrouded Spirit"], ["skin-of-coffin-nails", "Skin of Coffin Nails"], ["collector-of-stories", "Collector of Stories"],
  ["might-of-the-old", "Might of the Old"],
].map(([id, label]) => Object.freeze({ id, label, img: `${ART}${id}.webp` })));

/** What the deck's figurine key offers: null without the Crooked Moon tools. */
export function figurines() {
  let on = false; try { on = !!game.settings.get(MODULE_ID, "crookedMoonTools"); } catch { on = false; }
  return on ? { title: "Bargain", what: "a Dark Bargain", items: BARGAINS.map((b) => ({ ...b })) } : null;
}
