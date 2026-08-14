import { MODULE_ID } from "./preset.js";
import { isPhoneClient, isDisplayClient } from "./shell.js";
import { reading, cardByKey, cardFace, tarotBack, hasBookArt } from "./tarot.js";

// §42.1 THE TAROT TABLE — five cards, face down, where the room can see them.
//
// This is the piece the first build simply didn't have (DM 2026-08-11: "the table isn't shown").
// A reading is a physical thing: cards laid out, someone reaching for one, and the turn. Without
// the spread on the shared screen the whole ritual was a notification.
//
// Mount is the same shape as the séance board and the card table — a body-level overlay on the
// display client (or the DM's own non-phone client), driven entirely by the `tarotReading` world
// setting so it survives a reload mid-reading and a late-joining TV catches up.
//
// The highlight is the ONLY moving part: the chooser slides it with ← → on their phone and the
// outline follows here, so the person picking and the room watching are looking at one object.

let root = null;
let lastSig = "";

function eligible() {
  return !isPhoneClient() && (isDisplayClient() || game.user?.isGM);
}

// A cheap signature of everything the board draws, so a repaint only happens when something the
// ROOM can see has actually changed — the setting is written on every arrow press.
function signature(r) {
  return [r.open ? "1" : "0", r.spread.join(","), r.flipped.map(f => f || "-").join(","), r.cursor, r.turn ?? "-"].join("|");
}

function cardHTML(key, i, r) {
  const flippedBy = r.flipped[i];
  const card = cardByKey(key);
  const esc = foundry.utils.escapeHTML;
  const face = card ? cardFace(card) : null;
  const who = flippedBy ? game.users.get(flippedBy) : null;
  // The name is printed under a turned card whether or not the book's plates are installed —
  // without them the name IS the card, and with them it's the caption the table reads aloud.
  const faceInner = face
    ? `<img class="mc-tt-art" src="${esc(face)}" alt="">`
    : `<div class="mc-tt-art mc-tt-art-text">${esc(card?.name ?? "")}</div>`;
  return `<div class="mc-tt-card ${flippedBy ? "mc-tt-flipped" : ""} ${!flippedBy && i === r.cursor && r.turn ? "mc-tt-here" : ""}" style="--i:${i}">
    <div class="mc-tt-inner">
      <div class="mc-tt-back" style="background-image:url('${esc(tarotBack())}')"></div>
      <div class="mc-tt-face">
        ${faceInner}
        ${hasBookArt() && face ? `<div class="mc-tt-name">${esc(card?.name ?? "")}</div>` : ""}
      </div>
    </div>
    ${who ? `<div class="mc-tt-claim" style="--who:${who.color?.css ?? "var(--mc-gold)"}">${esc(who.name)}</div>` : ""}
  </div>`;
}

function repaint() {
  const r = reading();
  const sig = signature(r);
  if (sig === lastSig) return;
  lastSig = sig;
  const chooser = r.turn ? game.users.get(r.turn) : null;
  const esc = foundry.utils.escapeHTML;
  root.innerHTML = `
    <div class="mc-tt-veil"></div>
    <div class="mc-tt-spread">${r.spread.map((k, i) => cardHTML(k, i, r)).join("")}</div>
    <div class="mc-tt-caption">${chooser
      ? `<span style="color:${chooser.color?.css ?? "var(--mc-gold)"}">${esc(chooser.name)}</span> is choosing`
      : "&nbsp;"}</div>`;
}

/** Show/hide/refresh the table. Driven by the setting, so every client agrees without a socket. */
export function tarotTableSync() {
  const r = reading();
  const on = eligible() && r.open;
  if (on && !root) {
    root = document.createElement("div");
    root.id = "mc-tarottable";
    document.body.appendChild(root);
    lastSig = "";
  } else if (!on && root) {
    root.remove(); root = null; lastSig = "";
    return;
  }
  if (root) repaint();
}

export function registerTarotTable() {
  // BOTH create and update: a world setting that has never been written has no Setting document,
  // so its very first write fires createSetting — the trap that bit the card-back picker (§38.4a).
  const onSetting = (s) => { if (s?.key === `${MODULE_ID}.tarotReading`) tarotTableSync(); };
  Hooks.on("updateSetting", onSetting);
  Hooks.on("createSetting", onSetting);
  Hooks.on("canvasReady", tarotTableSync);
  Hooks.on("ready", tarotTableSync);
}
