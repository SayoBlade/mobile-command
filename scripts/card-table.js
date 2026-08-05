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
import { MODULE_ID, TABLE_SEATS } from "./preset.js";
import { isPhoneClient, isDisplayClient } from "./shell.js";

// Our own art is the default now (DM's set, 2026-08-04): the crescent-moon back and the wide
// rune table. The picker can still choose any of the Crooked Moon backs, or a custom upload.
//
// These MUST be absolute (getRoute prepends "/" and any route prefix). A relative path inside a
// CSS custom property resolves against the STYLESHEET that consumes the var, not the page — so
// `modules/…/card-table-wide.jpg` in --mc-ct-table became
// `modules/mobile-command/styles/modules/mobile-command/art/…` → 404 (live 2026-08-05).
const asset = (p) => { try { return foundry.utils.getRoute(p); } catch (e) { return `/${p.replace(/^\//, "")}`; } };
const DEFAULT_BACK = "modules/mobile-command/art/card-back.png";
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
    const ab = actor.system?.abilities ?? {};
    const top = Object.entries(ab).sort((a, b) => (b[1]?.value ?? 0) - (a[1]?.value ?? 0))[0];
    out.abilities = { name: top ? `${top[0].toUpperCase()} ${top[1]?.value ?? ""}` : "Set", img: null };
  }
  const spell = actor.items.find(i => i.type === "spell");
  if (spell) out.spells = { name: spell.name, img: spell.img };
  if (actor.getFlag(MODULE_ID, "wizGearDone")) {
    const gear = actor.items.find(i => i.type === "weapon") ?? actor.items.find(i => i.type === "equipment");
    out.gear = gear ? { name: gear.name, img: gear.img } : { name: "Packed", img: null };
  }
  return out;
}

function rebuild() {
  state = new Map();
  const seats = seatMap();
  for (const [seatId, userId] of Object.entries(seats)) {
    const actor = actorForUser(userId);
    state.set(seatId, { userId, actorId: actor?.id ?? null, cards: readCards(actor), active: null, caster: isCaster(actor) });
  }
}

function cardHTML(seat, def, s) {
  const face = s.cards[def.step];
  const flipped = !!face;
  const esc = foundry.utils.escapeHTML;
  const art = face?.img
    ? `<img class="mc-ct-art" src="${esc(face.img)}" alt="">`
    : `<div class="mc-ct-art mc-ct-art-text">${esc(face?.name ?? "")}</div>`;
  // A text card (Abilities, "Packed" gear) already prints its value large on the thorn frame —
  // repeating it in the name strip printed it twice on the same card (live 2026-08-05).
  const nameStrip = flipped && !face?.img ? "" : `<div class="mc-ct-name">${esc(face?.name ?? def.label)}</div>`;
  return `<div class="mc-ct-card ${flipped ? "mc-ct-flipped" : ""} ${s.active === def.step ? "mc-ct-active" : ""}" data-step="${def.step}">
    <div class="mc-ct-inner">
      <div class="mc-ct-back" style="background-image:url('${esc(cardBack())}')"></div>
      <div class="mc-ct-face">
        ${flipped ? art : ""}
        ${nameStrip}
      </div>
    </div>
  </div>`;
}

function seatHTML(def) {
  const s = state.get(def.id);
  if (!s) return `<div class="mc-ct-seat mc-ct-empty" data-seat="${def.id}"></div>`;
  const esc = foundry.utils.escapeHTML;
  const u = game.users.get(s.userId);
  const actor = s.actorId ? game.actors.get(s.actorId) : null;
  const hand = HAND.filter(h => h.step !== "spells" || s.caster);
  const writing = s.active ? `<div class="mc-ct-writing"><i class="fas fa-feather"></i> ${esc(s.question ?? "writing…")}</div>` : "";
  return `<div class="mc-ct-seat ${s.active ? "mc-ct-seat-active" : ""}" data-seat="${def.id}" style="--mc-ct-rot:${def.rot}deg;--mc-seat:${u?.color?.css ?? "var(--mc-gold)"}">
    <div class="mc-ct-plate">
      <span class="mc-ct-who">${esc(actor?.name ?? u?.name ?? "—")}</span>
      ${actor && actor.name !== u?.name ? `<span class="mc-ct-player">${esc(u?.name ?? "")}</span>` : ""}
    </div>
    <div class="mc-ct-hand">${hand.map(h => cardHTML(def, h, s)).join("")}</div>
    ${writing}
  </div>`;
}

function boardHTML() {
  const rows = {
    n: TABLE_SEATS.filter(s => s.id.startsWith("n")),
    s: TABLE_SEATS.filter(s => s.id.startsWith("s")),
    w: TABLE_SEATS.find(s => s.id === "w"),
    e: TABLE_SEATS.find(s => s.id === "e")
  };
  return `<div class="mc-ct-felt" style="--mc-ct-table:url('${asset(TABLE_ART)}')">
    <div class="mc-ct-row mc-ct-row-n">${rows.n.map(seatHTML).join("")}</div>
    <div class="mc-ct-mid">
      ${seatHTML(rows.w)}
      <div class="mc-ct-center"></div>
      ${seatHTML(rows.e)}
    </div>
    <div class="mc-ct-row mc-ct-row-s">${rows.s.map(seatHTML).join("")}</div>
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

function repaint() {
  if (!root) return;
  root.innerHTML = boardHTML();
  markEmblems();
}

/** Show/hide the table. Called from the panel toggle and by syncFx-style state restore. */
export function cardTableSync(on) {
  if (!eligible()) on = false;
  if (on && !root) {
    root = document.createElement("div");
    root.id = "mc-cardtable";
    document.body.appendChild(root);
    rebuild();
    repaint();
  } else if (!on && root) {
    root.remove(); root = null; state = new Map();
  }
}

/** The wizard narrating itself (§38.4a lockstep): step | flip | writing. */
export function cardTableEvent(p = {}) {
  if (!root) return;
  const seats = seatMap();
  const seatId = Object.entries(seats).find(([, uid]) => uid === p.userId)?.[0];
  if (!seatId) return; // that player isn't seated — nothing to narrate
  const s = state.get(seatId);
  if (!s) return;
  if (p.actorId && s.actorId !== p.actorId) { // first event tells us which PC this seat is building
    s.actorId = p.actorId;
    const actor = game.actors.get(p.actorId);
    s.cards = readCards(actor); s.caster = isCaster(actor);
  }
  if (p.kind === "flip" && p.step) {
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
  Hooks.on("mobile-command.szEvent", (p) => cardTableEvent(p));
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
  // BOTH create and update: a setting that has never been written has no Setting document, so
  // its FIRST write fires createSetting — listening only for updates means the first card-back
  // pick (or the first seating) silently doesn't repaint (bench 2026-08-04).
  const onSetting = (s) => {
    if (!root) return;
    const watched = ["tableSeats", "seatActors", "cardBackImage"].map(k => `${MODULE_ID}.${k}`);
    if (watched.includes(s?.key)) { rebuild(); repaint(); }
  };
  Hooks.on("updateSetting", onSetting);
  Hooks.on("createSetting", onSetting);
}
