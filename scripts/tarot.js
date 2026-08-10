import { MODULE_ID, DEFAULT_CARD_BACK } from "./preset.js";

// §42 THE FATED TAROT — one Major Arcana per character, kept for the campaign.
//
// From the book (ch9/ch10): Adela pulls one Major Arcana per PC on the Ghostlight Express.
// Always upright, never a duplicate, and each PC KEEPS their card — it's not a fortune for the
// evening, it's a thread they carry, and later chapters key rewards off it (Lovers = Adela's
// planchette, Moon = three Twists of Fate, Star = a free feat, Sun = +2 to an ability, World =
// one Wish). So the draw has to persist on the actor, survive everything, and be readable months
// later — which is why it lives on an actor flag and not in some reading-session state.
//
// THE DECK IS NAMES, THE ART IS OPTIONAL. The 22 arcana are public domain and the module ships no
// tarot art of its own; the Crooked Moon book ships all 22 faces, so we use those WHEN THEY ARE
// INSTALLED and fall back to a named card on our own blank face when they aren't. A table without
// the book still gets a working tarot draw — it just reads the name instead of seeing the plate.
// (The book's tarot deck ships no BACK art at all, which is why the back is ours by default.)

export const ARCANA = [
  { n: 0, key: "fool", name: "The Fool" },
  { n: 1, key: "magician", name: "The Magician" },
  { n: 2, key: "priestess", name: "The High Priestess" },
  { n: 3, key: "empress", name: "The Empress" },
  { n: 4, key: "emperor", name: "The Emperor" },
  { n: 5, key: "hierophant", name: "The Hierophant" },
  { n: 6, key: "lovers", name: "The Lovers" },
  { n: 7, key: "chariot", name: "The Chariot" },
  { n: 8, key: "strength", name: "Strength" },
  { n: 9, key: "hermit", name: "The Hermit" },
  { n: 10, key: "wheel", name: "Wheel of Fortune" },
  { n: 11, key: "justice", name: "Justice" },
  { n: 12, key: "hanged", name: "The Hanged Man" },
  { n: 13, key: "death", name: "Death" },
  { n: 14, key: "temperance", name: "Temperance" },
  { n: 15, key: "devil", name: "The Devil" },
  { n: 16, key: "tower", name: "The Tower" },
  { n: 17, key: "star", name: "The Star" },
  { n: 18, key: "moon", name: "The Moon" },
  { n: 19, key: "sun", name: "The Sun" },
  { n: 20, key: "judgement", name: "Judgement" },
  { n: 21, key: "world", name: "The World" }
];

// The book's own plates. Filenames are "1_<n> - <Name>_Bleed.webp" and the <Name> is the card's
// name WITHOUT the article ("Fool", "Hanged Man", "Wheel of Fortune"), so it's derived rather
// than a second hand-typed list that could drift from the one above.
const CM_DIR = "modules/the-crooked-moon-2014/assets/card/card tarot";
function cmPlate(card) {
  const bare = card.name.replace(/^The\s+/i, "");
  return `${CM_DIR}/1_${card.n} - ${bare}_Bleed.webp`;
}
export function hasBookArt() {
  try { return !!game.modules.get("the-crooked-moon-2014")?.active; } catch (e) { return false; }
}
/** The face to show for a card, or null when we have no plate and the name must carry it. */
export function cardFace(card) {
  return hasBookArt() ? cmPlate(card) : null;
}
/** The back of the tarot deck: ours, unless the DM chose a file (§38.4a's rule, same picker). */
export function tarotBack() {
  try { return game.settings.get(MODULE_ID, "tarotBackImage") || DEFAULT_CARD_BACK; }
  catch (e) { return DEFAULT_CARD_BACK; }
}

export function cardByKey(key) { return ARCANA.find(c => c.key === key) ?? null; }

/* -------------------------------------------- */
/*  What a character is holding                 */
/* -------------------------------------------- */

// { key, at, shown } on the ACTOR — the card outlives the reading, the session and the scene.
// `shown` is the reveal: the card is drawn face down and turns when the DM says so, because the
// moment of turning it is the whole point of a reading.
export function actorCard(actor) {
  try {
    const f = actor?.getFlag(MODULE_ID, "tarot");
    if (!f?.key) return null;
    const card = cardByKey(f.key);
    return card ? { ...card, at: f.at ?? 0, shown: !!f.shown } : null;
  } catch (e) { return null; }
}
export async function setActorCard(actor, key, { shown = false } = {}) {
  if (!actor) return;
  if (!key) return void await actor.unsetFlag(MODULE_ID, "tarot");
  await actor.setFlag(MODULE_ID, "tarot", { key, at: Date.now(), shown });
}
export async function revealActorCard(actor, shown = true) {
  const f = actor?.getFlag(MODULE_ID, "tarot");
  if (!f?.key) return;
  await actor.setFlag(MODULE_ID, "tarot", { ...f, shown: !!shown });
}

/* -------------------------------------------- */
/*  The draw                                    */
/* -------------------------------------------- */

/** Which arcana are already spoken for, so a fresh draw can't repeat one (the book's rule).
 *  `actors` are the people about to be re-dealt: their old cards go back in the deck. */
export function takenKeys(actors = []) {
  // Exclude by WHO, never by which card. Releasing the key instead — `taken.delete(theirCard)` —
  // frees that arcana even when somebody ELSE is also holding it, and hands out a duplicate. It
  // only takes one pre-existing duplicate (a hand-set flag, an imported actor, a restored backup)
  // for that to compound rather than heal. Identity can't have that failure mode: a re-dealt
  // character simply contributes nothing, and everyone else's card stays reserved.
  const exclude = new Set();
  for (const a of actors) { if (a?.id) exclude.add(a.id); }
  const taken = new Set();
  for (const a of game.actors ?? []) {
    if (a?.id && exclude.has(a.id)) continue;
    if (!a?.id && actors.includes(a)) continue; // ids are normal; object identity is the fallback
    const k = a?.getFlag?.(MODULE_ID, "tarot")?.key;
    if (k) taken.add(k);
  }
  return taken;
}

/**
 * Deal one card to each actor: no duplicates across the whole table, always upright, face down.
 * Returns [{ actor, card }] in deal order. Throws nothing — a table larger than the deck simply
 * runs out, which is reported rather than silently dealing a repeat.
 */
export async function dealTarot(actors = []) {
  const taken = takenKeys(actors);
  const pool = ARCANA.filter(c => !taken.has(c.key));
  const out = [];
  for (const actor of actors) {
    if (!pool.length) break; // 22 arcana; a table this size has bigger problems
    const i = Math.floor(Math.random() * pool.length);
    const [card] = pool.splice(i, 1);
    await setActorCard(actor, card.key, { shown: false });
    out.push({ actor, card });
  }
  return out;
}
