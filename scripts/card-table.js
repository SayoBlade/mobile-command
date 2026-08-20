// §38.4a THE CARD TABLE — session zero on the shared screen.
//
// The TV lies FLAT on the table (DM 2026-08-04), so this is drawn as the room sees it from
// above: each seated player has a HAND of face-down cards at their edge, ROTATED to face them
// (TABLE_SEATS.rot). Every creation choice flips one card to the chosen item's artwork with its
// name beneath; the seat whose player is answering a story question is HIGHLIGHTED. Questions
// appear here — answers never do (§38.4).
//
// Mount: same shape as the séance board (seance.js) — a body-level overlay on the display
// client (or the DM's non-phone client), driven by a world flag so it survives a reload.
// Input: `tableSeats` (who sits where) + `mobile-command.szEvent` (the wizard narrating itself)
// + actor items as the fallback truth for what's been chosen.
import { MODULE_ID, TABLE_SEATS, isPlaceholderPCName, DEFAULT_CARD_THEME, ABILITY_ICONS, DEFAULT_CARD_BACK } from "./preset.js";
import { mountFaded, unmountFaded } from "./repaint.js"; // §6.8 fade, never cut
import { isPhoneClient, isDisplayClient } from "./shell.js";
import { isOnlineTable, hasSharedScreen } from "./settings.js";
import { cardSound, dealSound } from "./card-audio.js";

// Our own art is the default now (DM's set, 2026-08-04): the crescent-moon back and the wide
// rune table. The picker can still choose any of the Crooked Moon backs, or a custom upload.
//
// These MUST be absolute (getRoute prepends "/" and any route prefix). A relative path inside a
// CSS custom property resolves against the STYLESHEET that consumes the var, not the page — so
// `modules/…/card-table-wide.jpg` in --mc-ct-table became
// `modules/mobile-command/styles/modules/mobile-command/art/…` → 404 (live 2026-08-05).
const asset = (p) => { try { return foundry.utils.getRoute(p); } catch (e) { return `/${p.replace(/^\//, "")}`; } };
const DEFAULT_BACK = DEFAULT_CARD_BACK; // one definition, shared with the panel's picker and tarot
const TABLE_ART = "modules/mobile-command/art/card-table-wide.jpg";

// The hand, in wizard order. `spells` is dropped for non-casters (5 cards, DM 2026-08-04).
const HAND = [
  { step: "species", label: "Species" },
  { step: "background", label: "Background" },
  { step: "class", label: "Class" },
  { step: "abilities", label: "Abilities" },
  { step: "spells", label: "Spells" },
  { step: "gear", label: "Gear" }
];

let root = null;
// seatId → { userId, actorId, cards: {step: {name, img}}, active: step|null }
let state = new Map();

function eligible() {
  return !isPhoneClient() && (isDisplayClient() || game.user?.isGM);
}
export function cardTableIsUp() { return !!root; }

function seatMap() {
  try { return game.settings.get(MODULE_ID, "tableSeats") ?? {}; } catch (e) { return {}; }
}
function seatActors() {
  try { return game.settings.get(MODULE_ID, "seatActors") ?? {}; } catch (e) { return {}; }
}
function cardBack() {
  let p = DEFAULT_BACK;
  try { p = game.settings.get(MODULE_ID, "cardBackImage") || DEFAULT_BACK; } catch (e) { /* default */ }
  return asset(p); // absolute — see the note on `asset` above
}
// The PC a seated player is building: the DM's explicit pick for tonight if there is one (only
// the rare multi-PC player needs it, §38.4b), else their assigned character, else any character
// they own that's mid-creation. Seats exist before characters do, so "none yet" is normal.
function actorForUser(userId) {
  const u = game.users.get(userId);
  if (!u) return null;
  const picked = seatActors()[userId];
  if (picked) {
    const a = game.actors.get(picked);
    // A stale id (the actor was deleted, or ownership moved) falls through to the default rather
    // than blanking the seat — the pick is a preference, never a requirement.
    if (a?.type === "character" && a.testUserPermission(u, "OWNER")) return a;
  }
  if (u.character?.type === "character") return u.character;
  return game.actors.find(a => a.type === "character" && a.testUserPermission(u, "OWNER")
    && a.getFlag(MODULE_ID, "charGen")) ?? null;
}
function isCaster(actor) {
  const cls = actor?.items?.find(i => i.type === "class");
  return !!cls?.system?.spellcasting?.progression && cls.system.spellcasting.progression !== "none";
}
// What a seat's cards should show RIGHT NOW, read from the actor — the szEvent stream is the
// live narration, this is the truth it converges on (a reload rebuilds from here alone).
function readCards(actor) {
  const out = {};
  if (!actor) return out;
  const byType = t => actor.items.find(i => i.type === t);
  const race = byType("race"), bg = byType("background"), cls = byType("class");
  if (race) out.species = { name: race.name, img: race.img };
  if (bg) out.background = { name: bg.name, img: bg.img };
  if (cls) out.class = { name: cls.name, img: cls.img };
  if (actor.getFlag(MODULE_ID, "wizAbilitiesDone")) {
    // The TOP ability, and every ability tied with it — a 16/16/16 character is three things at
    // once and the card should say so. No score (DM 2026-08-05): the number is a sheet fact, the
    // table wants "this one is STRONG". Icon comes from dnd5e's own set.
    const ab = actor.system?.abilities ?? {};
    const entries = Object.entries(ab).filter(([k]) => ABILITY_ICONS[k]);
    const best = Math.max(...entries.map(([, v]) => Number(v?.value) || 0), 0);
    const top = entries.filter(([, v]) => (Number(v?.value) || 0) === best).slice(0, 3).map(([k]) => k);
    out.abilities = top.length
      ? { name: top.map(k => k.toUpperCase()).join("\n"), img: ABILITY_ICONS[top[0]], abilities: top }
      : { name: "Set", img: null };
  }
  const spell = actor.items.find(i => i.type === "spell");
  if (spell) out.spells = { name: spell.name, img: spell.img };
  if (actor.getFlag(MODULE_ID, "wizGearDone")) {
    // The player NAMES their main weapon on the gear step (DM 2026-08-05) — "the first weapon in
    // the bag" was arbitrary, and this card is the one the table reads as "who they fight with".
    const main = actor.getFlag(MODULE_ID, "mainWeapon");
    const gear = (main && actor.items.get(main))
      ?? actor.items.find(i => i.type === "weapon") ?? actor.items.find(i => i.type === "equipment");
    out.gear = gear ? { name: gear.name, img: gear.img } : { name: "Packed", img: null };
  }
  return out;
}

// §39 WHO the board deals to, and which way their cards face.
//
// In person the answer is the table map: six fixed places around a screen lying flat, each with
// a compass rotation, and only the ones the DM has filled hold a hand. Online there is no table
// — every player is looking at their own copy of the same board, head-on — so the places are
// simply the player accounts, in roster order, all upright. Everything below this line works in
// "slots" and never has to ask which mode it is in.
function onlineSlots() {
  let display = "";
  try { display = game.settings.get(MODULE_ID, "displayOwnerUser") || ""; } catch (e) { /* none set */ }
  return game.users.filter(u => !u.isGM && u.id !== display)
    .map(u => ({ id: `u:${u.id}`, rot: 0, label: u.name, userId: u.id }));
}
function slotDefs() {
  if (isOnlineTable()) return onlineSlots();
  const seats = seatMap();
  return TABLE_SEATS.map(s => ({ ...s, userId: seats[s.id] ?? null }));
}

function rebuild() {
  state = new Map();
  for (const def of slotDefs()) {
    if (!def.userId) continue; // an empty seat is drawn, but it holds nothing
    const actor = actorForUser(def.userId);
    state.set(def.id, { userId: def.userId, actorId: actor?.id ?? null, cards: readCards(actor), active: null, caster: isCaster(actor) });
  }
}

// Every seat's actor, re-checked against the world. The board caches what it has been told
// (szEvent carries an actorId, and readCards runs once per rebuild), so a PC deleted while the
// board is up used to sit there as a ghost — cards and all — until something unrelated forced a
// rebuild. The DM wiped his PCs to start over and session zero dealt him one of the dead
// (live 2026-08-06). Called before the opening and on every actor create/delete.
function dropDeadActors() {
  let changed = false;
  for (const [, s] of state) {
    if (s.actorId && !game.actors.get(s.actorId)) { s.actorId = null; s.cards = {}; s.caster = false; changed = true; }
  }
  return changed;
}

function cardHTML(seat, def, s, i = 0) {
  const face = s.cards[def.step];
  const flipped = !!face;
  const esc = foundry.utils.escapeHTML;
  // The abilities card is the one card whose "name" is a stack of short words, so it gets its
  // own treatment: dnd5e's icon up top, the ability names beneath it, one per line.
  const art = face?.abilities
    ? `<img class="mc-ct-art" src="${esc(asset(face.img))}" alt="">`
    : face?.img
      ? `<img class="mc-ct-art" src="${esc(face.img)}" alt="">`
      : `<div class="mc-ct-art mc-ct-art-text">${esc(face?.name ?? "")}</div>`;
  // A text card (Abilities, "Packed" gear) already prints its value large on the thorn frame —
  // repeating it in the name strip printed it twice on the same card (live 2026-08-05).
  const label = face?.name ?? def.label;
  // Ability names stack one per line; everything else is a single wrapping name.
  const nameHTML = face?.abilities
    ? label.split("\n").map(l => `<span>${esc(l)}</span>`).join("")
    : esc(label);
  const nameStrip = flipped && !face?.img ? "" : `<div class="mc-ct-name ${face?.abilities ? "mc-ct-name-stack" : ""}">${nameHTML}</div>`;
  // --i drives the deal: each card leaves the middle of the table a beat after the last.
  return `<div class="mc-ct-card ${flipped ? "mc-ct-flipped" : ""} ${s.active === def.step ? "mc-ct-active" : ""}" data-step="${def.step}" style="--i:${i}">
    <div class="mc-ct-inner">
      <div class="mc-ct-back" style="background-image:url('${esc(cardBack())}')"></div>
      <div class="mc-ct-face">
        ${flipped ? art : ""}
        ${nameStrip}
      </div>
    </div>
  </div>`;
}

// A seat whose PC has finished creation, so its character name has been revealed at least once.
// Keyed seat:actor — the reveal animation must play on the render where the name first lands and
// never again, and repaint() rewrites the whole board on every event.
const revealed = new Set();
// Seats whose portrait token has already dropped, keyed seat:actor:img — the drop plays once,
// and again if the DM regenerates the portrait (the img is part of the key).
const dropped = new Set();
// Foundry's placeholders are not a face. A portrait counts only once the player has actually
// made one, which is what the wizard's last step is for.
const PLACEHOLDER_IMG = /(mystery-man|^$)/i;
function hasPortrait(actor) {
  const img = String(actor?.img ?? "").trim();
  return !!img && !PLACEHOLDER_IMG.test(img) && !img.endsWith("/icons/svg/mystery-man.svg");
}

function seatHTML(def) {
  const s = state.get(def.id);
  if (!s) return `<div class="mc-ct-seat mc-ct-empty" data-seat="${def.id}"></div>`;
  const esc = foundry.utils.escapeHTML;
  const u = game.users.get(s.userId);
  const actor = s.actorId ? game.actors.get(s.actorId) : null;
  const hand = HAND.filter(h => h.step !== "spells" || s.caster);
  const writing = s.active ? `<div class="mc-ct-writing"><i class="fas fa-feather"></i> ${esc(s.question ?? "writing…")}</div>` : "";
  // THE PLAYER's name is up the moment they're seated; the CHARACTER's name is the last thing
  // the wizard asks, so it arrives late and arrives with a flourish (DM 2026-08-05). While the
  // PC is mid-creation its name is a placeholder ("Player Character (3)") — the room should
  // never read that, so the seat keeps showing the player until `charGen` clears at Finish.
  // Two guards, because either can be true on its own: mid-creation (the wizard hasn't reached
  // the name step) or a PC that finished but still wears Foundry's duplicate name. Neither is a
  // character, and the TV is the most public surface there is.
  const building = !!actor?.getFlag(MODULE_ID, "charGen");
  const named = !!actor && !building && !isPlaceholderPCName(actor.name);
  const key = named ? `${def.id}:${actor.id}` : null;
  const firstReveal = named && !revealed.has(key);
  if (key) revealed.add(key);
  const plate = named
    ? `<span class="mc-ct-who ${firstReveal ? "mc-ct-reveal" : ""}">${esc(actor.name)}</span>
       <span class="mc-ct-player">${esc(u?.name ?? "")}</span>`
    : `<span class="mc-ct-who">${esc(u?.name ?? "—")}</span>`;
  // The PORTRAIT lands as a token above the name (DM 2026-08-06) — the last thing the wizard
  // asks for, so it arrives after everything else and drops onto the table with a clank. Only
  // a REAL portrait counts; Foundry's mystery-man placeholder is not a face.
  const portrait = actor && hasPortrait(actor) ? actor.img : null;
  const tokenKey = portrait ? `${def.id}:${actor.id}:${portrait}` : null;
  const tokenNew = tokenKey && !dropped.has(tokenKey);
  if (tokenKey) dropped.add(tokenKey);
  const token = portrait
    ? `<div class="mc-ct-token ${tokenNew ? "mc-ct-token-drop" : ""}"
         style="background-image:url('${esc(portrait)}')"></div>`
    : "";
  return `<div class="mc-ct-seat ${s.active ? "mc-ct-seat-active" : ""}" data-seat="${def.id}" style="--mc-ct-rot:${def.rot}deg;--mc-seat:${u?.color?.css ?? "var(--mc-gold)"}">
    ${token}
    <div class="mc-ct-plate">${plate}</div>
    <div class="mc-ct-hand">${hand.map((h, i) => cardHTML(def, h, s, i)).join("")}</div>
    ${writing}
  </div>`;
}

// §38.4a CANDLES — the middle of the table (DM 2026-08-05, "how complex is that?").
//
// Cheap by construction. Every animated property here is `transform` or `opacity`, which the
// compositor handles on its own thread without re-rasterising anything. The expensive way to
// build this — and the obvious one — is an animated `filter: blur()` for the glow and an
// animated `drop-shadow` for the cast shadow: both force a repaint of the element EVERY FRAME,
// which is what would cost the DM's machine. Instead the glow is a pre-blurred radial gradient
// (a gradient is free) whose opacity/scale animate, and the shadow is a flat dark ellipse that
// rotates and stretches. No canvas, no sprites, no images.
// Wick and body positions measured off the keyed artwork (895×932) and stored as PERCENTAGES,
// so the cluster can be sized freely — a 4K TV scales it up and the flames stay on the wicks.
// Wick centroids came from the darkest pixels inside each candle: (496,252) (214,697) (704,705).
// `a` is the angle the shadow is thrown: straight out from the cluster's centroid (52.7, 60.8),
// i.e. away from the other two flames — atan2(dy, dx) in screen space, which is already CSS's
// rotate convention. Two shadows per candle, splayed either side of that, because the candle is
// lit by its neighbours as well as itself and a single hard finger reads as a pointer.
// Centres and radii MEASURED off the keyed PNG by flood-filling its three opaque blobs, not
// eyeballed — the first pass was 1–5% out and the shadows visibly missed their candles (DM
// 2026-08-05, "shadows are a bit misaligned"). True cluster centroid: (50.9%, 55.7%).
// `a` = atan2 of (candle centre − centroid) in PIXELS (the art is 895×932, so percentages are
// not isotropic and would skew the angle) — which is already CSS's rotate convention.
const CANDLES = [
  { wx: 55.5, wy: 27.1, cx: 56.0, cy: 28.1, r: 27.6, fire: 1, flame: 23, a: -80 }, // the thick one
  { wx: 23.9, wy: 74.8, cx: 25.2, cy: 75.8, r: 25.1, fire: 2, flame: 20, a: 141 },
  { wx: 78.8, wy: 75.7, cx: 78.8, cy: 77.7, r: 21.1, fire: 3, flame: 19, a: 39 }
];
const SHADOW_SPLAY = [-19, 17];
const FIRE_DIR = "modules/animated-fire-by-mattm/fire_animations";

function candlesHTML() {
  let on = true;
  try { on = !!game.settings.get(MODULE_ID, "cardCandles"); } catch (e) { /* default on */ }
  if (!on) return "";
  // The three "small fire" loops from animated-fire-by-mattm (DM 2026-08-05). They're authored
  // TOP-DOWN as map tiles, which is exactly the view the flat TV needs — a side-on flame would
  // be wrong for every seat. A different one per wick so the three never pulse in unison.
  const esc = foundry.utils.escapeHTML;
  const shadows = CANDLES.flatMap((c, i) => SHADOW_SPLAY.map((s, j) => `
    <div class="mc-ct-cd-shadow" style="--cx:${c.cx}%;--cy:${c.cy}%;--r:${c.r}%;--a:${c.a + s}deg;--d:${-(i * 0.9 + j * 0.4)}s"></div>`)).join("");
  const flames = CANDLES.map(c => `
    <video class="mc-ct-cd-fire" style="--wx:${c.wx}%;--wy:${c.wy}%;--fw:${c.flame}%"
      src="${esc(asset(`${FIRE_DIR}/small_fire_0${c.fire}_420x420.webm`))}"
      autoplay loop muted playsinline disablepictureinpicture></video>`).join("");
  return `<div class="mc-ct-candles">
    ${shadows}
    <img class="mc-ct-cd-art" src="${esc(asset("modules/mobile-command/art/candles-topdown.png"))}" alt="">
    ${flames}
  </div>`;
}

function boardHTML() {
  const felt = `--mc-ct-table:url('${asset(TABLE_ART)}')`;
  // §39 Online: no edges to sit at, so the hands are a plain wrapping row with the candles above
  // them. The felt, the deck and the deal are all unchanged — what goes is the geometry that only
  // means something when six people are physically around one screen.
  if (isOnlineTable()) {
    const slots = slotDefs();
    return `<div class="mc-ct-felt mc-ct-felt-online" style="${felt}">
      <div class="mc-ct-center">${candlesHTML()}</div>
      <div class="mc-ct-grid">${slots.length
        ? slots.map(seatHTML).join("")
        : `<div class="mc-ct-nobody">No player accounts yet.</div>`}</div>
    </div>`;
  }
  const seats = slotDefs();
  const at = id => seats.find(s => s.id === id);
  return `<div class="mc-ct-felt" style="${felt}">
    <div class="mc-ct-row mc-ct-row-n">${seats.filter(s => s.id.startsWith("n")).map(seatHTML).join("")}</div>
    <div class="mc-ct-mid">
      ${seatHTML(at("w"))}
      <div class="mc-ct-center">${candlesHTML()}</div>
      ${seatHTML(at("e"))}
    </div>
    <div class="mc-ct-row mc-ct-row-s">${seats.filter(s => s.id.startsWith("s")).map(seatHTML).join("")}</div>
  </div>`;
}

// Foundry's stock item icons are SQUARE emblems (mystery-man 512², the skill/magic webps 256²,
// dnd5e's class.svg 373×355) while a card is 5:7 — object-fit:cover crops ~29% off their sides
// and they read as bare clip-art next to real artwork. Compendium portraits (Bugbear, Bogborn)
// are genuinely portrait and full bleed suits them, so decide per image once it has loaded:
// anything not clearly taller than it is wide gets sat inside the same thorn frame the text
// cards wear. One deck, whatever the item's art happens to be (DM 2026-08-05).
const EMBLEM_RATIO = 0.85; // width/height above this = emblem, not artwork
function markEmblem(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return;
  if (w / h > EMBLEM_RATIO) img.closest(".mc-ct-face")?.classList.add("mc-ct-emblem");
}
function markEmblems() {
  for (const img of root.querySelectorAll("img.mc-ct-art")) {
    if (img.complete) markEmblem(img);
    else img.addEventListener("load", () => markEmblem(img), { once: true });
  }
}

function cardTheme() {
  try { return game.settings.get(MODULE_ID, "cardTheme") || DEFAULT_CARD_THEME; } catch (e) { return DEFAULT_CARD_THEME; }
}

// A token that just landed needs its clank at the moment it lands, not when the markup is built
// — the drop takes .72s and the sound belongs at the bottom of it.
function soundNewTokens() {
  const dropping = root?.querySelectorAll(".mc-ct-token-drop");
  if (!dropping?.length) return;
  setTimeout(() => cardSound("clank"), 620);
}

function repaint() {
  if (!root) return;
  // The deck's dress is a class on the root; everything else is CSS variables, so switching
  // decks never re-fetches the table image or the backs.
  const t = cardTheme();
  for (const c of [...root.classList]) if (c.startsWith("mc-ct-theme-")) root.classList.remove(c);
  if (t && t !== DEFAULT_CARD_THEME) root.classList.add(`mc-ct-theme-${t}`);
  // See the note in shell.css: the DM's own machine reports prefers-reduced-motion, which was
  // silently cancelling the whole show. This class opts the board back in.
  let motion = true;
  try { motion = !!game.settings.get(MODULE_ID, "szMotion"); } catch (e) { /* default on */ }
  root.classList.toggle("mc-ct-motion", motion);
  // §39 A face-down hand is a physical courtesy: your neighbour can't read your cards across the
  // table. Online the courtesy follows the SCREEN, not the room (§39.5, DM 2026-08-20): a
  // streamed display account IS the table, so the deal lands face down there and flips as
  // choices land, exactly as in person. Only a table with no shared screen at all starts face
  // up — there, backs would hide the board from the very people it is for.
  const online = isOnlineTable();
  root.classList.toggle("mc-ct-online", online);
  root.classList.toggle("mc-ct-faceup", online && !hasSharedScreen());
  root.innerHTML = boardHTML();
  markEmblems();
  soundNewTokens();
}

// §38.5 THE OPENING — the first thing a table ever sees of this system (DM 2026-08-05).
//
// "The table starts off empty, candles unlit, DM sets up players' locations and activates the
// flow, candle is lit, soft music starts as the candles illuminate the table, shadows stretch
// out and the cards are dealt."
//
// Staged rather than simultaneous, because a room needs a beat to look up. Each phase is a class
// on the root; all the motion is CSS, so the timeline here is only deciding WHEN.
const OPENING = [
  { at: 0,    cls: "mc-ct-dark" },    // wick cold, no cards, table barely lit
  { at: 600,  cls: "mc-ct-lit",    do: () => { cardSound("place"); openingMusic(); } },
  { at: 2400, cls: "mc-ct-shadows" }, // the light reaches the table and the shadows reach out
  { at: 4200, cls: "mc-ct-dealt",  do: () => { orderDealFromCentre(); dealSound(8); } }
];
let openingTimers = [];

// INSIDE OUT (DM 2026-08-05). The stagger was each hand's own left-to-right index, so six seats
// dealt in parallel and it read as six little rows rather than one wave leaving the middle of
// the table. Ranking every card on the board by its actual distance from the table's centre
// makes the deal radiate: the cards closest to the candles land first, the far corners last.
function orderDealFromCentre() {
  if (!root) return;
  const cards = [...root.querySelectorAll(".mc-ct-card")];
  if (!cards.length) return;
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  cards
    .map(el => {
      const r = el.getBoundingClientRect();
      return { el, d: Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy) };
    })
    .sort((a, b) => a.d - b.d)
    .forEach((c, i) => c.el.style.setProperty("--i", i));
}

function clearOpening() {
  for (const t of openingTimers) clearTimeout(t);
  openingTimers = [];
}
/** The DM's soft cue. A named Foundry playlist, so the DM chooses the music — we never ship any. */
function openingMusic() {
  let name = "";
  try { name = String(game.settings.get(MODULE_ID, "szMusic") ?? "").trim(); } catch (e) { /* none */ }
  if (!name) return;
  try {
    const pl = game.playlists?.find(p => p.name === name);
    if (!pl) return void console.warn(`${MODULE_ID} | session-zero playlist "${name}" not found`);
    if (!pl.playing) pl.playAll();
  } catch (e) { console.warn(`${MODULE_ID} | could not start the session-zero playlist`, e); }
}

/** Run the opening from the top. Idempotent — a second call restarts it cleanly. */
export function runOpening() {
  if (!root) return;
  clearOpening();
  // Re-read the world before the show. "Begin session zero" is the one moment the board must be
  // certain it is showing what EXISTS, not what it was last told — the DM may have spent the
  // gap deleting and remaking characters, which is exactly what session zero is for.
  rebuild();
  dropDeadActors();
  repaint();
  root.classList.remove("mc-ct-lit", "mc-ct-shadows", "mc-ct-dealt");
  for (const step of OPENING) {
    openingTimers.push(setTimeout(() => {
      if (!root) return;
      root.classList.add(step.cls);
      try { step.do?.(); } catch (e) { /* never let a cue break the sequence */ }
    }, step.at));
  }
}
/** Jump straight to the finished state — for a reload mid-session, or a DM who wants it now. */
function settleOpening() {
  if (!root) return;
  clearOpening();
  root.classList.add("mc-ct-dark", "mc-ct-lit", "mc-ct-shadows", "mc-ct-dealt");
}

/** Show/hide the table. Called from the panel toggle and by syncFx-style state restore. */
export function cardTableSync(on) {
  if (!eligible()) on = false;
  if (on && !root) {
    root = document.createElement("div");
    root.id = "mc-cardtable";
    mountFaded(root);
    rebuild();
    repaint();
    // Putting the board UP is not the opening. The board can go up while the DM is still seating
    // people — the opening is a separate, deliberate cue (§38.5). A board raised mid-session
    // (or after a reload) lands already-lit rather than replaying the show at the room.
    let ran = false;
    try { ran = !!game.settings.get(MODULE_ID, "szOpened"); } catch (e) { /* treat as fresh */ }
    if (ran) settleOpening(); else root.classList.add("mc-ct-dark");
  } else if (!on && root) {
    clearOpening();
    unmountFaded(root); root = null; state = new Map();
  }
}

/** §39 The DM changed how this table plays — re-lay the board from scratch, seats and all. */
export function cardTableRefreshMode() {
  if (!root) return;
  rebuild();
  repaint();
}

/** The wizard narrating itself (§38.4a lockstep): step | flip | writing. */
export function cardTableEvent(p = {}) {
  if (!root) return;
  // Find the player's PLACE on the board, whichever kind of place this table has (§39): a seat
  // in person, their own slot online. Reading `state` rather than the seat map means one lookup
  // serves both — and a player with no place on the board simply has nothing to narrate.
  const s = [...state.values()].find(x => x.userId === p.userId);
  if (!s) return;
  if (p.actorId && s.actorId !== p.actorId) { // first event tells us which PC this seat is building
    const actor = game.actors.get(p.actorId);
    if (!actor) return; // an event about a PC that no longer exists — never seat a ghost
    s.actorId = p.actorId;
    s.cards = readCards(actor); s.caster = isCaster(actor);
  }
  if (p.kind === "flip" && p.step) {
    // Only when the card actually TURNS. A repeat flip for a card already showing that item is
    // a re-render, and the room shouldn't hear the same card twice (§38.4a).
    if (s.cards[p.step]?.name !== (p.itemName ?? "")) cardSound("flip");
    s.cards[p.step] = { name: p.itemName ?? "", img: p.img ?? null };
    s.active = null; s.question = null;
  } else if (p.kind === "writing") {
    s.active = p.step ?? null;
    s.question = p.q ?? null;
    if (p.itemName) s.cards[p.step] = { name: p.itemName, img: p.img ?? null };
  } else if (p.kind === "step") {
    s.active = null; s.question = null;
  }
  repaint();
}

/** Wire the board's live inputs once, at ready. */
export function registerCardTable() {
  Hooks.on("mobile-command.szEvent", (p) => {
    if (p?.kind === "opening") return runOpening();  // the DM's cue, broadcast to the display
    cardTableEvent(p);
  });
  // Actor truth: an item landing (species/class/…) flips its card even with no szEvent — the
  // board must be right after a reload or when the DM builds a PC from the desktop.
  const onActorish = (doc) => {
    if (!root) return;
    const actorId = doc?.parent?.id ?? doc?.id;
    for (const [, s] of state) {
      if (s.actorId && s.actorId === actorId) { s.cards = readCards(game.actors.get(actorId)); s.caster = isCaster(game.actors.get(actorId)); repaint(); return; }
    }
    rebuild(); repaint(); // an unseen actor — a seat may have just gained its PC
  };
  Hooks.on("createItem", onActorish);
  Hooks.on("deleteItem", onActorish);
  Hooks.on("updateActor", onActorish);
  // A PC appearing or being deleted changes WHO is at a seat, not just what's on their cards —
  // so these rebuild from scratch rather than patching one seat. Without deleteActor the board
  // kept dealing a character that no longer existed (live 2026-08-06).
  Hooks.on("deleteActor", () => { if (!root) return; rebuild(); dropDeadActors(); repaint(); });
  Hooks.on("createActor", () => { if (!root) return; rebuild(); repaint(); });
  // BOTH create and update: a setting that has never been written has no Setting document, so
  // its FIRST write fires createSetting — listening only for updates means the first card-back
  // pick (or the first seating) silently doesn't repaint (bench 2026-08-04).
  const onSetting = (s) => {
    if (!root) return;
    const watched = ["tableSeats", "seatActors", "cardBackImage", "cardTheme", "tableMode", "displayOwnerUser"].map(k => `${MODULE_ID}.${k}`);
    if (watched.includes(s?.key)) { rebuild(); repaint(); }
  };
  Hooks.on("updateSetting", onSetting);
  Hooks.on("createSetting", onSetting);
}
