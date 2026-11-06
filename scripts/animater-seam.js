/**
 * What MC does differently when the Animater module is on (DESIGN §26.8, 2026-11-06). Rules only, no
 * Foundry global: tools/test-weather-animater.mjs runs them headless. effects.js and rpc.js are the glue.
 *
 * ⚠️ ANIMATER OWNS THE OPEN SKY, AND ONLY THE OPEN SKY. Its map weather, weather sound and lightning all
 * stop on a scene it counts as underground (main.mjs `outdoorOn`). Foundry draws nothing for an `animater.*`
 * id either, so writing one on a Hall or Cave scene would light the key and show and sound nothing. Indoors
 * and in worlds without Animater, everything stays as it was: core ids, fog layers, MC's own loops.
 */

const PREFIX = "animater.";
export const PRECIP = Object.freeze(["rain", "rainStorm", "snow", "blizzard", "leaves"]);
export const FOG_OVER = "mcFog+";
export const THUNDERSTORM = `${PREFIX}thunderstorm`;
export const ANIMATER_RAIN = `${PREFIX}rain`;

// It has no heavy rain without lightning, so Downpour is its rain: the key that wrote it is remembered in
// fxActive, the way fxActive.dust tells the dust storm from fog. A scene weather holds one id, so a fog+X is X.
const TO_ANIMATER = Object.freeze({ rain: ANIMATER_RAIN, rainStorm: ANIMATER_RAIN, snow: `${PREFIX}snow`,
  blizzard: `${PREFIX}blizzard`, fog: `${PREFIX}fog`, leaves: `${PREFIX}autumn-leaves` });
const FROM_ANIMATER = Object.freeze({ [ANIMATER_RAIN]: "rain", [`${PREFIX}snow`]: "snow", [`${PREFIX}blizzard`]: "blizzard",
  [`${PREFIX}fog`]: "fog", [`${PREFIX}autumn-leaves`]: "leaves", [THUNDERSTORM]: "storm" });

/** Animater's own test for "there is a ceiling here" (main.mjs `undergroundScene`). */
export function sceneIndoors(scene) {
  const own = scene?.flags?.animater ?? {};
  return own.underground === true || own.acoustics === "cave" || own.acoustics === "hall";
}

/** Does Animater draw this scene's weather? `active`: the module; `mapOn`: its world "Weather on the map". */
export const animaterDrawsSky = ({ active, mapOn, scene }) => Boolean(active) && mapOn !== false && !sceneIndoors(scene);

/** The MC layers a scene weather id shows: fog + one precipitation at most, or the storm. */
export function layersOfWeather(weather) {
  const w = String(weather ?? "");
  if (!w) return new Set();
  if (FROM_ANIMATER[w]) return new Set([FROM_ANIMATER[w]]);
  if (w.startsWith(FOG_OVER)) return new Set(["fog", w.slice(FOG_OVER.length)]);
  return new Set([w]);
}

/** The scene weather id for these layers. `sky`: Animater draws this scene. */
export function weatherIdOf(layers, sky = false) {
  const precip = PRECIP.find((p) => layers.has(p));
  if (sky) return TO_ANIMATER[precip ?? (layers.has("fog") ? "fog" : "")] ?? "";
  if (layers.has("fog") && precip) return `${FOG_OVER}${precip}`;
  if (layers.has("fog")) return "fog";
  return precip ?? "";
}

/** Fog can't join rain in one Animater weather: the press is refused rather than doing nothing. */
export const fogRefused = ({ sky, atmos, wantOn, layers }) => Boolean(sky && atmos && wantOn) && PRECIP.some((p) => layers.has(p));
export const FOG_REFUSED = "Outdoors only one weather shows at a time. Turn the current one off first.";

/** Which of Rain and Downpour an `animater.rain` scene shows. */
export const animaterRainKeyOn = (id, downpour) => (id === "rainStorm") === Boolean(downpour);

/**
 * ONE STRIKE OF ANIMATER'S LIGHTNING, ON THIS SCREEN, NOW (DM 2026-11-06: one Lightning key, two functions).
 *
 * Animater has no public "strike now", and its running flash lives in a closure. But the flash itself is an
 * exported factory (engines/motion/sky-light.mjs `createLightningFlash`) with a `strike()`, so this makes its
 * own copy of Animater's flash, strikes it and runs it through its half second. `tick(now, 0)`: no storm, so
 * it can never strike a second time. Without `cover`, which needs Animater's private rooms and walls, it is
 * the plain flash over the whole map: no window patches and no thrown shadows.
 *
 * Why not its weather: a scene weather change is a full canvas redraw, twice, for every client, and a storm's
 * first strike is 3 to 21 s away, at a different moment on each screen.
 *
 * ⚠️ THE FILE PATH IS A PRIVATE COUPLING. Returns false rather than throwing if it moves or changes shape, and
 * the caller falls back to MC's own lightning. Checked against the installed file by test-weather-animater.
 */
export const ANIMATER_SKY_FILE = "modules/animater/scripts/engines/motion/sky-light.mjs";
export const ANIMATER_FLASH_MS = 700; // its flashLevel ends at 600

export async function playAnimaterFlash({ load, PIXI, root, bounds, now, frame, safety = setTimeout }) {
  let flash = null;
  try {
    const { createLightningFlash } = await load();
    if (typeof createLightningFlash !== "function") return false;
    flash = createLightningFlash({ PIXI, root, bounds });
    const at = now();
    flash.strike(at);
    flash.tick(now(), 0);
    let done = false;
    const finish = () => { if (done) return; done = true; try { flash.clear(); } catch { /* gone with the canvas */ } };
    const step = () => {
      if (done) return;
      try { flash.tick(now(), 0); } catch { return finish(); }
      if (now() - at >= ANIMATER_FLASH_MS) finish(); else frame(step);
    };
    safety(finish, 2000); // belt and braces: a hidden tab runs no frames, and a flash must never stay lit
    frame(step);
    return true;
  } catch {
    try { flash?.clear(); } catch { /* never made */ }
    return false;
  }
}

// ── corpses ─────────────────────────────────────────────────────────────────────────────────────────

/** Animater's knockout is a 2.4 s look and its kill-cam 1.2 s; the body has to be there for both. */
export const CORPSE_HIDE_DELAY_MS = 4000;

/** Re-read at the end of the delay: a body deleted, already hidden or revived in those 4 s is left alone. */
export function corpseStillDown(doc) {
  return Boolean(doc) && !doc.hidden && Number(doc.actor?.system?.attributes?.hp?.value ?? 0) <= 0;
}
