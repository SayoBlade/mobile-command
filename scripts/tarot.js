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
// THIS IS A CROOKED MOON FEATURE, and it is switched off without it (DM 2026-08-11: "if the DM
// doesn't have CM installed there's no real reason to have it active"). The reading is a scene
// from one specific adventure — Adela, on the Ghostlight Express — and every card's meaning is a
// pointer into that book's chapters. Offering it to a table running something else would be
// twenty-two pretty pictures wired to nothing. So it rides `crookedMoonTools`, the same gate as
// the DM panel's Crooked Moon tab, which itself defaults on exactly when the book is installed.
// That also retires the "no art" fallback: if the book is here, so are all 22 plates.
// (The book's tarot deck ships no BACK art at all, which is why the back is ours by default.)

/** Is the Fated Tarot available at this table? Gated on the Crooked Moon tools setting. */
export function tarotEnabled() {
  try { return !!game.settings.get(MODULE_ID, "crookedMoonTools"); } catch (e) { return false; }
}

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
/** Is the book itself installed? The tools setting defaults from this, but a DM can turn the
 *  tools on without it — in which case the plates 404 and the card is a blank rectangle, which is
 *  worth saying out loud on the panel rather than leaving them to wonder. */
export function hasBookArt() {
  try { return !!game.modules.get("the-crooked-moon-2014")?.active; } catch (e) { return false; }
}
/** The card's face. The feature is gated on the book being present, so the plate always exists. */
export function cardFace(card) {
  return card ? cmPlate(card) : null;
}
/** The back of the tarot deck: ours, unless the DM chose a file (§38.4a's rule, same picker). */
export function tarotBack() {
  try { return game.settings.get(MODULE_ID, "tarotBackImage") || DEFAULT_CARD_BACK; }
  catch (e) { return DEFAULT_CARD_BACK; }
}

export function cardByKey(key) { return ARCANA.find(c => c.key === key) ?? null; }

// §32.1 WHAT EACH CARD IS ACTUALLY FOR. The card does nothing when drawn — it GATES one Fabled
// Heirloom (an item that levels with its owner) or a boon, available at one named point later in
// the adventure. The book's own reason is rationing: handing out every heirloom "could quickly
// trivialize the threats that await them", so a party of four unlocks four of twenty-two.
//
// Extracted from the installed module's journal pack (DESIGN §32.1), not recalled. This map is
// DM-SIDE ONLY: it is never written to an actor and never reaches a phone, so there is nothing on
// the player's side that could leak what their card means. The card key is the pointer; this is
// the lookup, and it lives in a DM-owned book.
export const ARCANA_REWARD = {
  fool:       { item: "Whistle of the Vagrant",           where: "Conclusion: The Last Stop" },
  magician:   { item: "Marotte of the Lord of Fools",     where: "Phase 2: Carnival of Chaos" },
  priestess:  { item: "Mask of Lethica Nightborne",       where: "L19: Lethica's Quarters" },
  empress:    { item: "Cauldron of the Vermintoll Coven", where: "Conclusion: Dreaming No More" },
  emperor:    { item: "Blunderbuss of the Grinning Sinner", where: "Phase 2: Double Down" },
  hierophant: { item: "Sword of the Crimson Abbot",       where: "Phase 2: Beneath a Blood Moon" },
  lovers:     { item: "Planchette of Adela Druskenvald",  where: "The Green Queen Inn" },
  chariot:    { item: "Scythe of the Harvest Terror",     where: "Phase 2: Demon of Secrets" },
  strength:   { item: "Shovel of Yorgrim",                where: "Y9: Shadestone Sanctuary" },
  hermit:     { item: "Staff of Farryn of the Greenwood", where: "F10: Befouled Wellspring" },
  wheel:      { item: "Cutlass of Briggsy Kratch",        where: "To the Sinner's Shack" },
  justice:    { item: "Shield of Marius Renathyr",        where: "M2: Stables" },
  hanged:     { item: "Banjo of Ol' Jericho Sticks",      where: "J9b: Windmill Cellar" },
  death:      { item: "Idol of the Beast of Blight",      where: "Phase 2: Dead and Gone" },
  temperance: { item: "Veil of the Weeping Widow",        where: "Phase 2: Desperate Measures" },
  devil:      { item: "Cane of Phillip Druskenvald",      where: "Encounter 5: Live Deliciously" },
  tower:      { item: "Visage of the Old Ways",           where: "Phase 2: Dying Embers" },
  // The four boons — no item, and The Moon lands straight on machinery we already built (§31).
  star:       { item: "A feat of their choice",           where: "S7: Stonoga's Laboratory — after defeating Stonoga Blackstinger" },
  moon:       { item: "Three Twists of Fate",             where: "H17: Cauldron Room — after defeating Vessla Browntooth" },
  sun:        { item: "+2 to one ability score (max 24)", where: "R2: Pigeon Roost — after defeating Golub Graygullet" },
  judgement:  { item: "Lantern of the Chained Reaper",    where: "Phase 2: Cold Fire" },
  world:      { item: "Cast Wish, once",                  where: "Phase 2: Wrath of the Crooked Queen — after defeating the Horned King" }
};

// §44 (DM ask 2026-08-21: "give a link to the fate, so the DM gets the full context"): the
// Character File's Fate chapter links the card's reward to the BOOK'S OWN document. The
// heirlooms live as Items in the treasury pack under their exact names — except the pack
// writes curly apostrophes where our map writes straight ones (probed live: "Ol’ Jericho"),
// and every heirloom has an "Enchant: …" twin that is the enchantment half, not the item.
export function normName(s) { return s?.replace(/[’']/g, "'") ?? ""; }
export function pickRewardEntry(entries, wantItem) {
  const want = normName(wantItem);
  if (!want) return null;
  return entries.find(x => x?.name && !x.name.startsWith("Enchant:") && normName(x.name) === want) ?? null;
}

/** Compendium uuid of the card's reward item, or null (boons have no item; module may be off).
 *  Name-resolved at compile time — the map stores names, the pack holds the truth — and cached:
 *  pack indexes don't change mid-session. */
const rewardUuidCache = new Map();
export function cmRewardUuid(cardKey) {
  if (rewardUuidCache.has(cardKey)) return rewardUuidCache.get(cardKey);
  let uuid = null;
  try {
    const item = ARCANA_REWARD[cardKey]?.item;
    if (item && hasBookArt()) {
      const treasury = game.packs.get("the-crooked-moon-2014.tcm2014-treasury");
      const rest = game.packs.filter(p => p !== treasury && p.collection.startsWith("the-crooked-moon"));
      for (const p of [treasury, ...rest]) {
        const e = p ? pickRewardEntry(p.index.contents, item) : null;
        if (e) { uuid = e.uuid; break; }
      }
    }
  } catch (e) { /* no packs — no link, the plain text stands */ }
  rewardUuidCache.set(cardKey, uuid);
  return uuid;
}

/** The book's own 1d22 reward table — the fallback "full context" link when a card's reward is
 *  a boon with no item document (Star, Moon, Sun, World). Id recorded in DESIGN §32. */
export function cmRewardTableUuid() {
  try {
    const p = game.packs.get("the-crooked-moon-2014.tcm2014-rollable-tables");
    return p?.index?.get("PgDCRgyABMbAxork") ? `Compendium.${p.collection}.RollTable.PgDCRgyABMbAxork` : null;
  } catch (e) { return null; }
}

/** The character a player is playing tonight — the DM's explicit pick if there is one (§38.4b),
 *  else their assigned character. Seats and readings both key to USERS, so this is the bridge. */
export function userActor(user) {
  if (!user) return null;
  try {
    const picked = (game.settings.get(MODULE_ID, "seatActors") ?? {})[user.id];
    if (picked) {
      const a = game.actors.get(picked);
      if (a?.type === "character") return a;
    }
  } catch (e) { /* no seating in play */ }
  return user.character ?? null;
}

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
    return card ? { ...card, at: f.at ?? 0, shown: !!f.shown, shownAt: Number(f.shownAt) || 0 } : null;
  } catch (e) { return null; }
}
export async function setActorCard(actor, key, { shown = false } = {}) {
  if (!actor) return;
  if (!key) return void await actor.unsetFlag(MODULE_ID, "tarot");
  await actor.setFlag(MODULE_ID, "tarot", { key, at: Date.now(), shown });
}
// WHEN it was turned, not just that it was. The phone's 5s guard reads this rather than an
// in-memory flag: a single tap on a touch screen can deliver a second, synthesised click ~300ms
// later, and by then the reveal has landed and re-rendered — so a guard held in a field the
// re-render doesn't reset let that ghost click dismiss a card the player never saw (DM
// 2026-08-11: "clicking it returns to the main UI"). A timestamp on the document cannot drift
// out of step with the thing it's guarding.
export async function revealActorCard(actor, shown = true) {
  const f = actor?.getFlag(MODULE_ID, "tarot");
  if (!f?.key) return;
  await actor.setFlag(MODULE_ID, "tarot", { ...f, shown: !!shown, shownAt: shown ? Date.now() : 0 });
}

/** How long the turn itself takes — must match the CSS transition on .mc-tarot-hand-inner. */
export const TAROT_FLIP_MS = 1050;
/** How long a freshly-turned card refuses to be dismissed (§42.2), measured from the reveal. */
export const TAROT_HOLD_MS = 5000;
/** Has a turned card been up long enough to be put away? Face-down cards are never dismissible. */
export function tarotCanDismiss(card) {
  if (!card?.shown) return false;
  return (Date.now() - (card.shownAt || 0)) >= TAROT_HOLD_MS;
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

/**
 * §42.2 Hand ONE character their card, face down (DM 2026-08-11). `key` is the DM's choice when
 * they've made one — the cheat is just this argument, so there is no "forced card" state to keep
 * in sync with anything. Without it the deck decides, skipping every arcana already spoken for.
 * Returns the card dealt, or null when the deck is out.
 */
export async function dealOne(actor, key = null) {
  if (!actor) return null;
  const chosen = key ? cardByKey(key) : null;
  if (!chosen) {
    const taken = takenKeys([actor]); // their own current card goes back in the deck
    const pool = ARCANA.filter(c => !taken.has(c.key));
    if (!pool.length) return null;
    const card = pool[Math.floor(Math.random() * pool.length)];
    await setActorCard(actor, card.key, { shown: false });
    return card;
  }
  await setActorCard(actor, chosen.key, { shown: false });
  return chosen;
}

// (Adela's per-card interpretation used to be fetched from the book and shown under the turned
// card. Removed 2026-08-11 — "no need for the text, the DM reads that": her words are the DM's to
// say out loud, and printing them under the art was the interface talking over the person whose
// scene it is. All 22 are transcribed in DESIGN §32.1 if the panel ever wants them.)
