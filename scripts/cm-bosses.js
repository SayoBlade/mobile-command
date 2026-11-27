/**
 * ── THE BOSSES' TOYS (DM 2026-11-27) ─────────────────────────────────────────────────────────────────────────────────────────
 * His words: "The locomotive token at toy size (we can keep this a theme of collecting bosses)", and "open a popup on dm
 * foundry on killing locomotive asking if to add it to the landing page". A defeated boss can become a toy on the landing desk.
 *
 * Which bosses, and what they answer to, are the book's, so they live here (Mobile Command carries the Crooked Moon). The toys'
 * pictures are Deck Command's keepsake art (deck-command foundry-module/assets/keepsakes/bosses/<id>.webp). Deck Command reads
 * this list through `MobileCommand.bossToys()`, asks the DM on the boss's death and scatters the toy on the desk (deck-command
 * D-0243). A boss answers to its actor's id in his world or its name (a copy brought in from the book again keeps the name).
 * Offered only while the Crooked Moon tools are on.
 */
import { MODULE_ID } from "./preset.js";

const ART = "modules/deck-command/assets/keepsakes/bosses/";
export const BOSS_TOYS = Object.freeze([
  { id: "ghostlight-locomotive", label: "the Locomotive", names: ["The Ghostlight Locomotive"], actorIds: ["BWAI1K9gFR17hC1m"] },
].map((b) => Object.freeze({ ...b, img: `${ART}${b.id}.webp` })));

/** What Deck Command's landing desk offers: null without the Crooked Moon tools. */
export function bossToys() {
  let on = false; try { on = !!game.settings.get(MODULE_ID, "crookedMoonTools"); } catch { on = false; }
  return on ? { items: BOSS_TOYS.map((b) => ({ ...b, names: [...b.names], actorIds: [...b.actorIds] })) } : null;
}
