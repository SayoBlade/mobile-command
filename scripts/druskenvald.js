import { MODULE_ID, DRUSK_HOURS, DRUSK_HOUR_SPAN, druskHourAt } from "./preset.js";
import { readClock } from "./gametime.js";
import { isPhoneClient, isDisplayClient } from "./shell.js";

export { DRUSK_HOURS };

// §43 THE DRUSKENVALD CLOCK — eternal night, told in six named hours.
//
// From §32: "Eternal night, 6 named hours (Twilight/Dusk/Nightfall/Evening/Midnight/Witching)
// each with a sky colour — a TV time-of-day HUD + ambient tint; NPC copy uses the hour names."
//
// THE POINT IS THE NAME. In a place where the sun never comes up, "half past four" means nothing
// and "come back at Witching" means everything. So the six hours are a vocabulary the table
// shares: the shared screen says which one it is, the DM reads it off the panel, and NPCs can
// name it without anybody doing arithmetic.
//
// IT IS THE SAME LOOP AS §41, WITH A DIFFERENT CURVE. That is the whole architecture. daylight.js
// already owns "the clock decides this scene's darkness"; Druskenvald doesn't get its own writer,
// its own hook, or its own opinion about scene data — it just answers `darknessFor` differently
// for the scenes the DM has marked. Everything §41 built (the write-rate floor, darknessLock, the
// manual hold, travel's claim) applies here for free and cannot drift out of sync.
//
// SCENE-SCOPED, FROM AN EXPLICIT LIST. Never a heuristic — the same rule the DM set for travel
// maps ("misidentification of a map as a travel map is very bad"). The party walks out of
// Druskenvald and the sun comes back on its own, because no other scene was ever involved.

// The hour table and the block maths live in preset.js — pure data beside darknessForHour, so a
// headless test can reach them without importing the shell (see tools/test-druskenvald.mjs).
export const hourAt = druskHourAt;
const HOUR_SPAN = DRUSK_HOUR_SPAN;

export function currentHour() {
  const c = readClock();
  return hourAt((Number(c.hour) || 0) + (Number(c.minute) || 0) / 60);
}

/* -------------------------------------------- */
/*  Which scenes are Druskenvald                */
/* -------------------------------------------- */

export function druskSceneIds() {
  try { const v = game.settings.get(MODULE_ID, "druskenvaldSceneIds"); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
export function isDruskScene(scene) {
  try { return !!scene && druskSceneIds().includes(scene.id); } catch (e) { return false; }
}
export async function markDruskScene(sceneId, on) {
  const ids = new Set(druskSceneIds());
  if (on) ids.add(sceneId); else ids.delete(sceneId);
  await game.settings.set(MODULE_ID, "druskenvaldSceneIds", [...ids]);
}

/** The darkness a Druskenvald scene should be right now — read by daylight.js in place of the
 *  day curve. Never reaches daylight, and never exceeds the night the rest of the world gets:
 *  Midnight here is exactly NIGHT_DARKNESS_PEAK, so this is a different SHAPE of night, not a
 *  darker one nobody tuned. */
export function druskDarkness() { return currentHour().darkness; }

/* -------------------------------------------- */
/*  The shared screen: the hour, and the sky    */
/* -------------------------------------------- */

// The plate + tint mount on the display (and the DM's own canvas client, like every other shared
// -screen piece), never on phones — a phone has no sky and the hour is the DM's to announce.
function eligible() {
  return !isPhoneClient() && (isDisplayClient() || game.user?.isGM);
}

let root = null;
let shownKey = null;

/** Put the plate + sky up, take them down, or move them to the current hour. Idempotent. */
export function druskSync() {
  const on = eligible() && isDruskScene(canvas?.scene);
  if (!on) {
    if (root) { root.remove(); root = null; shownKey = null; }
    return;
  }
  if (!root) {
    root = document.createElement("div");
    root.id = "mc-drusk";
    // The sky sits UNDER everything of ours (the card table is 55, a boss entrance 99500) and
    // over the canvas, so it tints the map and never the things we deliberately put on top of it.
    root.innerHTML = `<div class="mc-drusk-sky"></div><div class="mc-drusk-plate"><span class="mc-drusk-hour"></span></div>`;
    document.body.appendChild(root);
    shownKey = null;
  }
  const h = currentHour();
  if (shownKey === h.key) return; // same hour — don't restart the fade
  shownKey = h.key;
  root.querySelector(".mc-drusk-sky").style.background = h.sky;
  root.querySelector(".mc-drusk-hour").textContent = h.name;
  // A brief lift as the hour turns, so the room notices a change it didn't ask for.
  const plate = root.querySelector(".mc-drusk-plate");
  plate.classList.remove("mc-drusk-turn");
  void plate.offsetWidth;
  plate.classList.add("mc-drusk-turn");
}

export function registerDruskenvald() {
  Hooks.on("updateWorldTime", druskSync);
  Hooks.on("canvasReady", druskSync);
  const onSetting = (s) => { if (s?.key === `${MODULE_ID}.druskenvaldSceneIds`) druskSync(); };
  Hooks.on("updateSetting", onSetting);
  Hooks.on("createSetting", onSetting); // a never-written setting's first write is a CREATE
  Hooks.on("ready", druskSync);
}

/* -------------------------------------------- */
/*  The DM's own hand on the clock              */
/* -------------------------------------------- */

/** Push the world clock forward to the start of the NEXT named hour. The die is the ritual and
 *  the button is the authority (UI-BIBLE §8.1): a haunt that wants Witching should not have to
 *  wait for arithmetic. Returns the hour landed on. */
export async function advanceToNextHour() {
  if (!game.user?.isGM) return null;
  const c = readClock();
  const now = (Number(c.hour) || 0) + (Number(c.minute) || 0) / 60;
  const here = hourAt(now);
  const idx = DRUSK_HOURS.indexOf(here);
  const next = DRUSK_HOURS[(idx + 1) % DRUSK_HOURS.length];
  // Distance to the next block's opening, always forward, never zero.
  let delta = (next.from - now + 24) % 24;
  if (delta <= 0.001) delta = HOUR_SPAN;
  await game.time.advance(Math.round(delta * 3600));
  return next;
}
