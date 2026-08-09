import { MODULE_ID } from "./preset.js";
import { isPhoneClient, isDisplayClient } from "./shell.js";
import { isOnlineTable } from "./settings.js";
import { socket } from "./rpc.js"; // the same one-shot channel effects.js fires on — importing
                                   // effects.js instead would close a cycle (it imports this file)

// §40 THE BOSS INTRO — an entrance, on the table's own screen (DM 2026-08-09).
//
// "First pause, then the selected token's image appears enlarged on the screen, first facing
// down, playing a predetermined sound, and wiggles a little for about 2 seconds. Then the token
// turns to face right, does the same wiggle, turns to top, does the wiggle and sound again. Then
// the image zooms out and shrinks."
//
// THE TURN IS THE WHOLE POINT. A screen lying flat on the table has people on three of its four
// sides (the fourth is the DM's chair — "on the left would be the default DM seat, making the
// turn to it pointless"), so a top-down token that only ever faces one way has its back to two
// thirds of the table. It addresses each side in turn instead: down → right → top, never left,
// and always the short way round so it never sweeps past the DM.
//
// Online there are no sides — everyone is square on to their own screen — so the turn is dropped
// and the beat plays twice facing down (§39). Same sequence code, a different list of facings.
//
// Wiring mirrors the séance / the station: the DM fires a one-shot over the socket (effects.js
// `bossIntro`) and each client that should see it builds the overlay itself. Nothing persists —
// an entrance is a moment, not a state, so a client that reloads mid-roar simply misses it.

/* -------------------------------------------- */
/*  The stored bosses                           */
/* -------------------------------------------- */

/** Every boss the DM has built, as `{ id, actorId, sound }`. Name and art are NOT stored — they
 *  are read from the actor at play time, so renaming a monster or repainting its token is enough. */
export function bossList() {
  try { const v = game.settings.get(MODULE_ID, "bosses"); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
export async function bossSave(list) {
  await game.settings.set(MODULE_ID, "bosses", list);
}
/** The picture that turns: the PROTOTYPE TOKEN's art, because that is the top-down piece the
 *  table already knows this monster by — the portrait is a side-on painting and "facing down"
 *  means nothing to it. Falls back to the portrait when a monster has no token art of its own. */
export function bossImage(actor) {
  return actor?.prototypeToken?.texture?.src || actor?.img || null;
}
/** A stored sound is either a PlaylistSound uuid (dragged from a playlist) or a bare file path
 *  (picked from disk). Resolve to something an <audio> can actually load. */
export function bossSoundSrc(sound) {
  if (!sound) return null;
  try { const doc = fromUuidSync(sound); if (doc?.path) return doc.path; } catch (e) { /* not a uuid */ }
  return sound;
}
/** What to CALL the sound in the panel — the track's name when it has one, else the file. */
export function bossSoundLabel(sound) {
  if (!sound) return "";
  try { const doc = fromUuidSync(sound); if (doc?.name) return doc.name; } catch (e) { /* not a uuid */ }
  return String(sound).split("/").pop();
}

/* -------------------------------------------- */
/*  The sequence                                */
/* -------------------------------------------- */

// Every duration in one place — this is a piece of theatre and the DM will want to tune it.
const BEAT = {
  in: 700,      // the image swelling up out of nothing
  wiggle: 2000, // "wiggles a little for about 2 seconds" — the DM's number, kept
  turn: 620,    // one quarter turn to face the next side of the table
  gap: 240,     // online: the breath between the two roars, so they read as two and not one
  out: 900      // zooming out and shrinking away
};

// Screen degrees, clockwise, for a token drawn facing UP (the Foundry convention): 180 points it
// at the bottom edge of the screen, 90 at the right, 0 at the top. Down → right → top is two
// quarter turns anticlockwise, which is exactly the path that avoids the DM's chair on the left.
const FACING = { down: 180, right: 90, top: 0 };
function facings() {
  return isOnlineTable() ? [FACING.down, FACING.down] : [FACING.down, FACING.right, FACING.top];
}
// TWO ROARS, whatever the table (DM 2026-08-09: "keep it at 2"). The rule that gives both modes
// two is the FIRST AND LAST beat: in person that's the arrival facing down and the last turn to
// the top, with the middle turn silent — exactly the DM's original wording — and online, where
// there are only two beats, both of them.
function roarsOn(i, total) { return i === 0 || i === total - 1; }

// THE NAME, on three sides at once (DM 2026-08-09: "add name on all three sides at once"). Not on
// the turning box — the boss turns, the name does not. Three fixed labels around the picture, each
// rotated so it reads right way up to the people on that side, so the whole table can read it the
// moment it appears instead of waiting their turn. The left is skipped for the same reason the
// boss never turns there: that's the DM's chair.
//
// Text reads correctly when its TOP points AWAY from the reader, which is why these are not the
// same numbers as the token's facings: the reader at the screen's right needs 270°, not 90°.
// (This is the same convention as TABLE_SEATS.rot — seat `e` at 270 is the right-hand seat.)
const NAME_SIDES = [
  { cls: "mc-bi-name-down", rot: 0 },
  { cls: "mc-bi-name-right", rot: 270 },
  { cls: "mc-bi-name-top", rot: 180 }
];

// In person this is the ROOM's screen and nothing else — six phones roaring a half-second apart
// is the same mess that took music off the phones in the first place (§20.6). Online every
// player has their own screen and there is no room to be out of step with, so everyone gets it.
function eligible() {
  if (isOnlineTable()) return true;
  return !isPhoneClient() && (isDisplayClient() || game.user?.isGM);
}

let root = null;
let timers = [];
function clearTimers() { for (const t of timers) clearTimeout(t); timers = []; }
function teardown() {
  clearTimers();
  if (root) { root.remove(); root = null; }
}

// Re-triggering a CSS animation needs the element taken out of it and put back — assigning the
// same class again is a no-op to the engine. The reflow read is what commits the removal.
function shudder(el) {
  if (!el) return;
  el.classList.remove("mc-bi-shake");
  void el.offsetWidth;
  el.classList.add("mc-bi-shake");
}

function roar(src) {
  if (!src) return;
  // The INTERFACE channel, deliberately. It is the one channel the phone-silencing rule leaves
  // alone (§20.6) and it is still governed by the DM's mirrored TV volume, so the roar lands on
  // the television at the level the DM set and never at whatever the file was mastered to.
  try { foundry.audio.AudioHelper.play({ src, volume: 1, autoplay: true, loop: false, channel: "interface" }, false); }
  catch (e) { console.warn(`${MODULE_ID} | boss intro: could not play ${src}`, e); }
}

/** Run the entrance on THIS client. `{ img, sound, name }` — the rest is read from the world. */
export function bossIntroPlay({ img, sound, name } = {}) {
  if (!eligible() || !img) return;
  teardown(); // a second trigger restarts cleanly rather than stacking two bosses

  const esc = foundry.utils.escapeHTML;
  // Online everyone is square on to their own screen, so three copies of the name would just be
  // two upside-down ones — the down-facing label is the only one that means anything.
  const sides = isOnlineTable() ? NAME_SIDES.slice(0, 1) : NAME_SIDES;
  const nameHTML = name
    ? sides.map(s => `<div class="mc-bi-name ${s.cls}" style="--mc-bi-nrot:${s.rot}deg">${esc(name)}</div>`).join("")
    : "";

  root = document.createElement("div");
  root.id = "mc-bossintro";
  root.innerHTML = `
    <div class="mc-bi-scrim"></div>
    <div class="mc-bi-stage">
      <div class="mc-bi-turn">
        <div class="mc-bi-shakebox">
          <img class="mc-bi-img" src="${esc(img)}" alt="">
        </div>
      </div>
      ${nameHTML}
    </div>`;
  document.body.appendChild(root);

  const turn = root.querySelector(".mc-bi-turn");
  const shake = root.querySelector(".mc-bi-shakebox");
  const seq = facings();
  turn.style.setProperty("--mc-bi-rot", `${seq[0]}deg`);

  // One reflow, then the entrance class — otherwise the browser may coalesce "created at scale
  // .18" and "now at scale 1" into a single style computation and the swell never animates.
  void root.offsetWidth;
  root.classList.add("mc-bi-up");

  let t = BEAT.in;
  for (let i = 0; i < seq.length; i++) {
    if (i > 0) {
      const gap = seq[i] === seq[i - 1] ? BEAT.gap : BEAT.turn;
      const deg = seq[i];
      const at = t;
      timers.push(setTimeout(() => turn.style.setProperty("--mc-bi-rot", `${deg}deg`), at));
      t += gap;
    }
    const at = t;
    const loud = roarsOn(i, seq.length);
    timers.push(setTimeout(() => { shudder(shake); if (loud) roar(bossSoundSrc(sound)); }, at));
    t += BEAT.wiggle;
  }
  timers.push(setTimeout(() => root?.classList.add("mc-bi-out"), t));
  timers.push(setTimeout(teardown, t + BEAT.out));
}

/** Cut it short — the escape hatch for a sound that turned out to be four minutes long. */
export function bossIntroStop() { teardown(); }

/* -------------------------------------------- */
/*  DM side — pause, fire, hand the game back   */
/* -------------------------------------------- */

/** Play a stored boss's entrance. `bossId` is the id from `bossList()`; pass an actor id instead
 *  and it will play that actor with no sound, which is what a macro-driven trigger wants. */
export async function dmPlayBossIntro(bossId) {
  if (!game.user?.isGM) return false;
  const boss = bossList().find(b => b.id === bossId);
  const actor = game.actors.get(boss?.actorId ?? bossId);
  if (!actor) { ui.notifications?.warn("Mobile Command: that boss's actor is gone — drag it in again."); return false; }
  const img = bossImage(actor);
  if (!img) { ui.notifications?.warn(`Mobile Command: ${actor.name} has no token art to show.`); return false; }

  // THE PAUSE COMES FIRST, AND IT STAYS (DM 2026-08-09: "no unpause"). The entrance is the beat
  // before the fight, not a cutscene the table walks out of — the DM starts the game again when
  // they're ready to roll initiative. So this only ever pauses; nothing here gives the game back,
  // which also means there is no claim to track and no timer that could fire over a DM who
  // already resumed.
  if (!game.paused) game.togglePause(true, { broadcast: true });

  const payload = { id: "bossIntro", img, name: actor.name, sound: boss?.sound ?? null };
  if (socket) socket.executeForEveryone("fxOneShot", payload);
  else bossIntroPlay(payload); // socketlib missing — at least the DM's own screen performs it
  return true;
}
