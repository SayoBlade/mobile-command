// §37 The Ghostlight ride — the Crooked Moon train (ch10) in motion.
//
// Three pieces, all operating on the book's car scenes ("10.1 …" through "10.8 …",
// plain and (Colored) sets are wired as two independent chains):
//
//  - wireTrainDoors(): car-to-car travel via core Teleport Token regions. Each car end
//    gets a TRIGGER region (the full vestibule column inside the end door — step in and
//    you cross) and a separate LANDING region (a collision-probed walkable cell the
//    arrival is dropped onto, snap OFF). The landing probe is what makes this safe: a
//    snapped arrival can straddle an interior wall (Sleeper Car cabin partitions), and a
//    token overlapping a wall cannot move at all — a stuck PC mid-session. Landing cells
//    are chosen by testing a clear move path from the cell to the car's interior.
//    Front of the train is map-RIGHT on every car map (10.8 Tender has no front door —
//    the locomotive is the Vagrant's alone; 10.1's rear door is the arcane-locked
//    exterior — both ends stay unwired, exactly like the book).
//
//  - setTrainMist(): the ride itself — the Shroud rushing past. TWO tile-scroll tiles per
//    WINDOWED car (one per window band, above and below the hull), the thick mist webm in a
//    deep green. Windowless cars (Mail, Baggage, Circus) get none — DM's ruling, see
//    WINDOWED_CARS. ⚠️ The geometry is the DM's own hand placement ("moving state"), emitted
//    literally — read MIST_BANDS / MIST_TILE below before touching it. Both tiles share one
//    webm texture (PIXI caches by src), so the decode cost stays flat.
//    Requires the DM's tile-scroll module (theripper93) + animated-mist-and-fog-by-mattm.
//
//  - registerTrainFollow(): the table follows the party through the doors. When a PC
//    token lands on a trainLand region of a non-active car and the active scene has no
//    unhidden PC tokens left, the car with the party becomes active (TV follows, scene
//    transition plays). Splits stay put: while any PC remains on the active car, the
//    display doesn't move. Gated by the same partyTeleportActivates setting as the
//    packed-party rule, primary-GM client only.
//
// Everything is idempotent and touches only documents flagged mobile-command.trainDoor /
// trainLand / trainMist — run Wire twice, get one set; nothing of the book's own scene
// content is ever modified or deleted.
import { MODULE_ID } from "./preset.js";
import { notifier } from "./notifier.js";

const GRID = 140;                 // the book's car maps are all 140px / 5ft
const INSET = 4;                  // keep region edges off the wall planes
/**
 * ⚠️⚠️ MOVING STATE — THE DM'S OWN GEOMETRY. DO NOT RECOMPUTE, DERIVE, "FIX", RE-CENTRE OR LOCK IT. ⚠️⚠️
 *
 * 2026-10-09, DM verbatim: *"the movement fog has been moved to the wrong location again, I redid the
 * fog, save its location and duplicate to the other cars, do not move it again (don't lock it though),
 * and remember this as moving state."*
 *
 * Every value below was READ from his hand-placed tiles on `10.1 Passenger Car (Colored)` and is
 * emitted verbatim on every car. Each earlier generation of this generator derived the bands (wall
 * hull, `s.dimensions`, the webm's native aspect — three layers, full scene width, repeatx from a
 * formula) and each put the mist somewhere he then had to move by hand. That ends here.
 *
 *  - LITERAL, NOT DERIVED, ON PURPOSE. The two x values differ by 4px (1761 vs 1757) — a hand nudge,
 *    not a formula — and 1761 is neither the centre of a 3360 car (1680) nor anything the hull gives.
 *    A derivation that reproduced both numbers would just be these constants in disguise. All eight
 *    cars are 3360×980 (the Tender 3358 — 2px, immaterial), so one absolute set fits every car; the
 *    plain-art chain uses the same map sizes and gets the same tiles.
 *  - x/y are copied exactly as his documents store them (with anchorX/Y 0.5, the tile CENTRE).
 *    Width is 1800, NOT scene width — his choice, keep it.
 *  - `repeatx` is HIS flat 6. The old NATIVE_ASPECT formula (sceneWidth / (h × 1.5) × density) gave 9
 *    on 10.1's 250px band; it is deleted, not kept alongside.
 *  - `locked: false` — "don't lock it though": he still nudges it by hand. Never add locking as a way
 *    of protecting it. If he moves it again, read his new values back into THIS table, nowhere else.
 *  - The thin-wisp layer (mist_super_thin) and the pale mint tints are gone. One tile per band.
 */
const MIST_SRC = "modules/animated-mist-and-fog-by-mattm/animations/mist_thick_horizontal.webm";
const MIST_BANDS = [   // [x, y] — the DM's placement; edit only by reading his world back
  [1761, 122],         // top band (above the hull)
  [1757, 858],         // bottom band (below the hull)
];
const MIST_TILE = {    // everything else on his tiles, verbatim
  texture: { src: MIST_SRC, tint: "#08442d", anchorX: 0.5, anchorY: 0.5, fit: "fill", scaleX: 1, scaleY: 1, alphaThreshold: 0.3 },
  width: 1800, height: 260, alpha: 0.35, elevation: 0, sort: 4,
  locked: false,       // DM: "don't lock it though"
  restrictions: { light: true, weather: false },
  video: { loop: true, autoplay: true, volume: 0 },
  // tile-scroll flags; speed/10000 = uv per ms, direction 0 = content drifts map-left (rearward)
  scroll: { enableScroll: true, scrollSpeed: 30, scrollDirection: 0, repeatx: 6, repeaty: 1,
    enableRotate: false, pivotx: 0.5, pivoty: 0.5, offsetx: 0, offsety: 0, parallax: 0 },
};

/**
 * ⚠️ MOVING STATE, PART 2 — WHICH CARS GET MIST IS THE DM'S RULING, NOT AN OPTIMISATION.
 *
 * Same message, 2026-10-09, DM verbatim: *"i removed the moving fog effect from maps that dont have
 * windows"*. The mist goes ONLY on cars with windows: 10.1 Passenger · 10.2 Sleeper · 10.3 Lounge ·
 * 10.4 Dining · 10.8 Tender. NEVER on 10.5 Mail, 10.6 Baggage or 10.7 Circus — he deleted it from
 * those three by hand. Placing it there again undoes his work.
 *
 * "Has windows" belongs to HIS CURRENT SCENES, not to the book: the Tender is on the list because he
 * cut windows into it himself (its walls went 13 → 21). So it is recorded per scene:
 *
 *  - Scene flag `mobile-command.trainWindows` (true / false) is the source of truth when it is set.
 *    When he adds windows to another car, setting this flag is the whole change — no code edit.
 *    Macro: `MobileCommand.train.setWindows(game.scenes.getName("10.5 …"), true)`.
 *  - When the flag is unset, WINDOWED_CARS (his 2026-10-09 ruling) is the default. Both art sets
 *    share car numbers, so the plain chain follows the same ruling.
 *  - Do NOT try to infer windows from wall geometry: a wall count can't tell a window from a doorway
 *    or a cabin partition (the Tender's 8 new walls look like any other).
 */
const WINDOWED_CARS = new Set([1, 2, 3, 4, 8]); // DM 2026-10-09; 5 Mail · 6 Baggage · 7 Circus have none
export function trainCarHasWindows(scene) {
  const flag = scene.flags?.[MODULE_ID]?.trainWindows;
  if (typeof flag === "boolean") return flag;
  const m = /^10\.([1-8]) /.exec(scene.name);
  return !!m && WINDOWED_CARS.has(Number(m[1]));
}
export function setTrainWindows(scene, hasWindows) {
  return scene.setFlag(MODULE_ID, "trainWindows", !!hasWindows);
}

// The two car chains, rear (10.1) to front (10.8), sorted and grouped by art set.
export function trainChains() {
  const chains = { colored: [], plain: [] };
  for (const s of game.scenes) {
    const m = /^10\.([1-8]) /.exec(s.name);
    if (m) chains[s.name.includes("(Colored)") ? "colored" : "plain"].push({ n: Number(m[1]), scene: s });
  }
  for (const k of Object.keys(chains)) chains[k].sort((a, b) => a.n - b.n);
  return chains;
}
export function trainScenes() {
  const c = trainChains();
  return [...c.colored, ...c.plain].map(e => e.scene);
}

// Pure-data segment-vs-walls test (movement sense) — works on NON-VIEWED scenes, where
// canvas collision backends are useless. Open doors and non-blocking walls don't block.
export function wallsBlock(scene, a, b) {
  return scene.walls.contents.some(w => {
    if (w.door > 0 && w.ds === 1) return false;
    if ((w.move ?? 20) === 0) return false;
    const [x1, y1, x2, y2] = w.c;
    const d = (a.x - b.x) * (y1 - y2) - (a.y - b.y) * (x1 - x2);
    if (!d) return false;
    const t = ((a.x - x1) * (y1 - y2) - (a.y - y1) * (x1 - x2)) / d;
    const u = -((a.x - b.x) * (a.y - y1) - (a.y - b.y) * (a.x - x1)) / d;
    return t > 0 && t < 1 && u > 0 && u < 1;
  });
}

function wallHull(scene) {
  const xs = scene.walls.contents.flatMap(w => [w.c[0], w.c[2]]);
  const ys = scene.walls.contents.flatMap(w => [w.c[1], w.c[3]]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

// The nearest grid cell to the door that (a) no wall crosses and (b) has a clear straight
// walk to some mid-car probe point — i.e. a cell the arrival can actually leave.
function findLanding(scene, hull, side, doorYMid) {
  const rows = [];
  for (let y = Math.ceil(hull.y0 / GRID) * GRID; y + GRID <= hull.y1; y += GRID) rows.push(y);
  const probes = rows.map(y => ({ x: (hull.x0 + hull.x1) / 2, y: y + GRID / 2 }));
  const cols = [];
  for (let k = 0; k < 3; k++) {
    cols.push(side === "back" ? Math.ceil(hull.x0 / GRID) * GRID + k * GRID
      : Math.floor(hull.x1 / GRID) * GRID - (k + 1) * GRID);
  }
  for (const cx of cols) {
    const sorted = [...rows].sort((a, b) => Math.abs(a + GRID / 2 - doorYMid) - Math.abs(b + GRID / 2 - doorYMid));
    for (const cy of sorted) {
      const c = { x: cx + GRID / 2, y: cy + GRID / 2 };
      const corners = [[cx + 8, cy + 8], [cx + GRID - 8, cy + 8], [cx + 8, cy + GRID - 8], [cx + GRID - 8, cy + GRID - 8]]
        .map(([px, py]) => ({ x: px, y: py }));
      if (corners.some(p => wallsBlock(scene, c, p))) continue;
      if (probes.some(p => !wallsBlock(scene, c, p))) return { x: cx, y: cy };
    }
  }
  return null;
}

async function ensureRegion(scene, flagKey, side, name, shape, extra = {}) {
  let region = scene.regions.find(r => r.flags[MODULE_ID]?.[flagKey] === side);
  if (region) { await region.update({ shapes: [shape] }); return region; }
  [region] = await scene.createEmbeddedDocuments("Region", [{
    name, shapes: [shape], ...extra, flags: { [MODULE_ID]: { [flagKey]: side } },
  }]);
  return region;
}

// Wire (or re-wire) every car door in both chains. Returns a human-readable report.
export async function wireTrainDoors() {
  const chains = trainChains();
  const report = [];
  for (const key of Object.keys(chains)) {
    const chain = chains[key];
    for (const e of chain) {
      const s = e.scene;
      const hull = wallHull(s);
      const vDoors = s.walls.filter(w => w.door > 0 && Math.abs(w.c[0] - w.c[2]) < 10);
      e.doors = {};
      for (const w of vDoors) {
        const x = (w.c[0] + w.c[2]) / 2, yMid = (w.c[1] + w.c[3]) / 2;
        let side = null;
        if (Math.abs(x - hull.x0) < 40) side = "back";
        else if (Math.abs(x - hull.x1) < 40) side = "front";
        if (!side || e.doors[side]) continue;
        const landing = findLanding(s, hull, side, yMid);
        if (!landing) { report.push(`${s.name}: no walkable landing at the ${side} door`); continue; }
        const stripX = side === "back" ? hull.x0 + INSET : hull.x1 - GRID - INSET;
        const strip = {
          type: "rectangle", x: Math.round(stripX), y: Math.round(hull.y0 + INSET),
          width: GRID, height: Math.round(hull.y1 - hull.y0 - 2 * INSET), rotation: 0, hole: false,
        };
        const landRect = {
          type: "rectangle", x: landing.x + INSET, y: landing.y + INSET,
          width: GRID - 2 * INSET, height: GRID - 2 * INSET, rotation: 0, hole: false,
        };
        const trig = await ensureRegion(s, "trainDoor", side, `Train door — ${side}`, strip, { color: "#2fbd9c" });
        const land = await ensureRegion(s, "trainLand", side, `Train landing — ${side}`, landRect, { color: "#1f7a66" });
        e.doors[side] = { trig, land };
      }
    }
    for (let i = 0; i < chain.length - 1; i++) {
      const A = chain[i].doors?.front, B = chain[i + 1].doors?.back;
      if (!A || !B) { report.push(`${key}: cars 10.${chain[i].n} and 10.${chain[i + 1].n} not linked`); continue; }
      for (const [from, to] of [[A.trig, B.land], [B.trig, A.land]]) {
        const sys = { destinations: [to.uuid], placement: "center", snap: false, choice: false };
        const beh = from.behaviors.find(b => b.type === "teleportToken");
        // disabled:true is the DESIGN, not damage (SS20.5, 074c987): entry triggers are
        // off — the phone's travel-point flow performs every crossing itself, and these
        // behaviours are kept only as the record of where each end leads (travelPointOf's
        // compatibility branch reads them). Wiring must therefore (re)write the
        // destination but keep the trigger dormant — an ENABLED door would let core
        // teleport walkers silently, with no phone ask and no group option.
        if (beh) await beh.update({ system: sys, disabled: true });
        else await from.createEmbeddedDocuments("RegionBehavior", [{ name: "Car door teleport", type: "teleportToken", system: sys, disabled: true }]);
      }
      report.push(`${key}: 10.${chain[i].n} ⇄ 10.${chain[i + 1].n}`);
    }
  }
  return report;
}

export function trainMistOn() {
  return trainScenes().some(s => s.tiles.some(t => t.flags[MODULE_ID]?.trainMist));
}

// The ride: put the rushing Shroud outside every car's windows, or bring it to a stop
// (removing only our own flagged tiles). Content streams toward the rear — the train
// runs front-of-map-right, per the car maps' orientation.
export async function setTrainMist(on) {
  let scenes = 0;
  for (const s of trainScenes()) {
    const mine = s.tiles.filter(t => t.flags[MODULE_ID]?.trainMist).map(t => t.id);
    if (!on) {
      if (mine.length) { await s.deleteEmbeddedDocuments("Tile", mine); scenes++; }
      continue;
    }
    if (mine.length) continue; // already riding
    // ADOPT, DON'T DUPLICATE. The DM placed the moving state BY HAND, so his tiles carry no
    // trainMist flag: without this branch, starting the ride would create a second pair on top
    // of his (two mists at alpha 0.35 reading as one wrong, darker one), and stopping it would
    // delete only ours and leave his — the ride toggle would drift one pair per cycle. Claiming
    // his tiles instead makes the toggle idempotent over work he did outside it. Matching on the
    // mist webm alone is deliberate: his nudged x/y must NOT be a condition of recognising them.
    const his = s.tiles.filter(t => t.texture?.src === MIST_SRC && !t.flags[MODULE_ID]?.trainMist);
    if (his.length) {
      await s.updateEmbeddedDocuments("Tile", his.map(t => ({
        _id: t.id, [`flags.${MODULE_ID}.trainMist`]: true,
      })));
      scenes++;
      continue; // his geometry stands; we only took ownership of the stop
    }
    // DM's ruling (WINDOWED_CARS / the trainWindows flag above): no windows, no mist. Stopping the
    // ride still clears our flagged tiles from EVERY car, above, so a stray set can always be removed.
    if (!trainCarHasWindows(s)) continue;
    // MOVING STATE: the DM's literal geometry (MIST_BANDS / MIST_TILE above). Nothing here is
    // computed from the scene, the wall hull or the texture — do not reintroduce that.
    // Fresh copies per tile so no two documents share a nested object.
    const { scroll, texture, restrictions, video, ...rest } = MIST_TILE;
    const tiles = MIST_BANDS.map(([x, y]) => ({
      ...rest, x, y,
      texture: { ...texture }, restrictions: { ...restrictions }, video: { ...video },
      flags: { "tile-scroll": { ...scroll }, [MODULE_ID]: { trainMist: true } },
    }));
    await s.createEmbeddedDocuments("Tile", tiles);
    scenes++;
  }
  return scenes;
}

/**
 * THE RIDE HAS TO BE AUDIBLE (DM 2026-10-09, mid-session: *"Why are there nature sounds like
 * crickets in the train and not the train sound!?"*).
 *
 * `setTrainMist` made the Shroud rush past the windows and the room stayed silent — the ride was
 * a VISUAL ONLY, and whatever ambience was already playing (the scene's own, or vgmusic's) kept
 * playing under it. Meanwhile the asset literally named `Train-inside.mp3` sat in the Misc
 * playlist, not repeating, wired to nothing.
 *
 * So the ride now carries its own loop, and it is deliberately ONE sound rather than a playlist:
 * a loop that starts and stops with the mist can never drift out of step with what he can see
 * through the window.
 *
 * ⚠️ IT DOES NOT SILENCE ANYTHING ELSE. Stopping other playlists from here would be this module
 * reaching across into whatever the DM chose for the room, and a mis-stop mid-session is worse
 * than an overlap he can mute in one click.
 */
/**
 * ⚠️ THE ORDER HERE IS THE WHOLE FEATURE, AND I GOT IT WRONG ONCE. The first version preferred
 * `Train Inside` and `Chugging` because those were the train sounds in
 * `deck-command/packs/crooked-moon-world.json` — which is a snapshot of the OLD world. Both do
 * exist in `crooked-moon-6x`, so it would have worked; but both are FX one-shots (`Train
 * (loop) 1.mp3`, `Train-inside.mp3`) sitting at `repeat: false`, and his library already carries
 * two proper looping ambiences recorded for exactly this — `Steam-Train-(with-passengers)` is a
 * carriage interior, which is where the party is standing.
 *
 * So: the ambiences first, the FX as the fallback. Found by reading his live playlists instead of
 * the capture, after he said *"both dm and tv are running, both are playing sounds… but no train
 * sounds."*
 */
const RIDE_SOUND = [
  "Steam-Train-(with-passengers)", // Ambiences Vol.6 — a carriage interior, already a loop
  "Steam-Train-(no-passenger)",    // the same recording without the crowd
  "Train Inside",                  // Misc — an FX one-shot, looped by us
  "Chugging",                      // Deck Command · Linked sounds — ditto
];

function rideSound() {
  for (const name of RIDE_SOUND) {
    for (const pl of game.playlists ?? []) {
      const s = pl.sounds?.find?.((x) => x.name === name);
      if (s) return s;
    }
  }
  return null;
}

/**
 * THE CARRIAGE JOLTS (DM 2026-10-11): *"can we get a screen shake up and down every so often as a
 * visual effect when the train is running? Say every 20 seconds or so, minor jump, check fxmaster,
 * it might already be built."*
 *
 * ⚠️ HE WAS RIGHT — IT IS ALREADY BUILT, so none of this is a shader. FXMaster 8.4.1 registers a
 * `screenShake` filter with a timed mode and a `vertical` axis, which is exactly "up and down, a
 * minor jump". We only have to decide when it fires and how hard.
 *
 * Verified against the installed module rather than recalled: the parameter schema is
 * `{ timed, strength, blur, duration, speed, smoothness, decay, axis, edgeProtection, audioAware,
 * audioChannels, audioBassThreshold }`, and `axis` takes `both | horizontal | vertical`.
 *
 * ⚠️ IT IS A SCENE FLAG, NOT A CLIENT EFFECT. FXMaster stores filters on the scene
 * (⚠️ under a GENERATED key, `flags.fxmaster.filters.apiMacro_<id>_f` — NOT `core_screenShake`, which
 * is what this comment said until 2026-10-13 and what every diagnostic was written against; that
 * wrong name is most of why "no shakes" took three attempts to explain), so every jolt is a
 * document write that reaches the
 * TV and the phones too — which is what we want, the whole table should feel the carriage — but it
 * is also why this runs on the PRIMARY GM only and why stopping the ride must remove it. A jolt
 * left behind in the flag would shake his next scene for no reason.
 *
 * The interval is jittered. A tremor exactly every twenty seconds reads as a metronome rather than
 * a train, and the one thing a background effect must not do is become countable.
 */
/**
 * ⚠️ HIS CADENCE, NOT A RANDOM ONE (DM 2026-10-11): *"let's do it every 15, 12, 2 seconds in a loop
 * to make it seem more random."* A repeating uneven pattern beats true randomness here: the long
 * gaps let the carriage settle, and the 2-second pair lands as one double-lurch over a rail joint
 * rather than two separate events. Random intervals produce clumps and holes that read as a fault.
 */
const JOLT_GAPS_MS = [15_000, 12_000, 2_000];
const JOLT_KEY = "cm-train-jolt";
const JOLT = {
  timed: true,
  axis: "vertical",       // "up and down", his words
  strength: 0.13,         // default is 0.55 — this is a lurch, not an earthquake
  blur: 0.04,
  duration: 0.6,
  speed: 0.5,
  smoothness: 0.6,
  decay: 0.85,
  edgeProtection: 0.7,    // keeps the map's edge from showing at the top of the jump
};

let joltTimer = null;

function fxReady() {
  try { return Boolean(globalThis.FXMASTER?.api?.effects?.filters?.toggle); } catch (e) { return false; }
}

/**
 * ⚠️ APPLY WITH `toggle`, REMOVE WITH `stop` — NEVER toggle twice.
 *
 * The first version called `toggle` to raise the shake and `toggle` again to clear it, which is a
 * coin flip rather than a sequence: if the filter was already present (a cycle that failed
 * half-way, a leftover flag, a timed shake that had already expired) the "on" press turned it OFF
 * and the "off" press turned it ON. Over a loop that alternates silently, and silent alternation
 * looks exactly like "no shakes". Both verbs exist on the API — `filters.toggle` and
 * `filters.stop` — so the sequence is now unambiguous in both directions.
 */
async function oneJolt() {
  if (!fxReady()) return false;
  const fx = globalThis.FXMASTER.api.effects.filters;
  try {
    await fx.stop([{ type: "screenShake" }], { toggleKey: JOLT_KEY }).catch(() => {}); // clear any leftover
    await fx.toggle([{ type: "screenShake", options: { ...JOLT } }], { toggleKey: JOLT_KEY });
    console.log(`${MODULE_ID} | jolt`);
    setTimeout(() => { fx.stop([{ type: "screenShake" }], { toggleKey: JOLT_KEY })?.catch?.(() => {}); },
      (JOLT.duration + 0.4) * 1000);
    return true;
  } catch (e) { console.warn(`${MODULE_ID} | the carriage jolt:`, e?.message); return false; }
}

/**
 * ── FREE THE TRAIN SCENES FROM WEATHER SUPPRESSION (his ruling, 2026-10-13) ─────────────────────
 *
 * *"Let's just lose the suppression region and not start experimenting, no rain for the train
 * scenes, that's not a big loss."*
 *
 * The shake was never failing to fire — measured 2026-10-12, six firings in thirty-five seconds on
 * his cadence, each cleaning up after itself. FXMaster routes the screen shake through the same
 * machinery as weather, so each car's `suppressWeather` region masked it, which is what he had
 * already narrowed it to himself: *"only the outside of the room shakes (too much)"*.
 *
 * ⚠️ IT RUNS ITSELF, ONCE, BECAUSE HE ASKED NOT TO BE MY HANDS: *"we're going back to me being an
 * agent which I don't like."* A console paste would have worked and he was right to refuse it.
 *
 * Deliberately conservative:
 *   - the BEHAVIOUR is disabled, never the region — the region may carry other behaviours, and a
 *     disabled behaviour is one click to put back. `underCover` in effects.js already reads
 *     `!b.disabled`, so disabling is enough for both the shake and the weather sound.
 *   - scenes whose name starts with `10.` only — the train chapter, nothing else in the world.
 *   - once, guarded by a world setting, so it can never undo a decision he reverses by hand.
 *   - primary GM only, and it says what it changed.
 */
export const TRAIN_WEATHER_FREED = "trainWeatherFreed";
export async function freeTrainWeather({ force = false } = {}) {
  if (!game.user?.isGM) return null;
  if (game.users.activeGM?.id !== game.user.id) return null;
  try {
    if (!force && game.settings.get(MODULE_ID, TRAIN_WEATHER_FREED)) return null;
    const changed = [];
    for (const sc of game.scenes.filter((x) => x.name?.startsWith("10."))) {
      for (const r of sc.regions ?? []) {
        const on = (r.behaviors ?? []).filter((b) => b.type === "suppressWeather" && !b.disabled);
        if (!on.length) continue;
        await r.updateEmbeddedDocuments("RegionBehavior", on.map((b) => ({ _id: b.id, disabled: true })));
        changed.push(`${sc.name} · ${r.name ?? "region"}`);
      }
    }
    await game.settings.set(MODULE_ID, TRAIN_WEATHER_FREED, true);
    if (changed.length) {
      console.log(`${MODULE_ID} | the train shakes indoors now — suppression off on:\n  ${changed.join("\n  ")}`);
      notifier.info(`Train weather suppression removed on ${changed.length} region${changed.length === 1 ? "" : "s"} — the carriage can shake.`);
    } else {
      console.log(`${MODULE_ID} | no weather suppression found on the 10.* scenes — nothing to free`);
    }
    return changed;
  } catch (e) {
    console.warn(`${MODULE_ID} | could not free the train scenes' weather`, e);
    return null;
  }
}

/** Fire ONE jolt now — `MobileCommand.train.joltNow()`. For judging the strength without waiting. */
export async function joltNow() { const did = await oneJolt(); return did ? "jolted" : "FXMaster not reachable — nothing fired"; }

/** The ride's tremor: on while the train runs, off the moment it stops. Primary GM only. */
export function setTrainJolt(on) {
  if (joltTimer) { clearTimeout(joltTimer); joltTimer = null; }
  if (!on) { console.log(`${MODULE_ID} | the carriage stops jolting`); return null; }
  // ⚠️ EVERY REFUSAL SAYS WHY. He reported "no shakes" twice, and a silent `return null` is why:
  // with two Foundry tabs open neither of us could have known the primary-GM gate had declined.
  if (!game.user?.isGM) { console.log(`${MODULE_ID} | not a GM, so no jolt here (correct)`); return null; }
  if (game.users.activeGM?.id !== game.user.id) {
    console.warn(`${MODULE_ID} | NOT the primary GM, so the jolt is someone else's job — if nothing shakes, close the other Foundry tab`);
    return null;
  }
  if (!fxReady()) { console.warn(`${MODULE_ID} | FXMaster's filter api is not reachable, so the train cannot jolt`); return null; }
  let step = 0;
  const next = () => {
    const wait = JOLT_GAPS_MS[step++ % JOLT_GAPS_MS.length];
    joltTimer = setTimeout(async () => { await oneJolt(); if (joltTimer) next(); }, wait);
    joltTimer.unref?.();
  };
  next();
  console.log(`${MODULE_ID} | the carriage will jolt on ${JOLT_GAPS_MS.map((m) => m / 1000).join("/")}s, repeating`);
  return JOLT_GAPS_MS;
}

export async function setTrainSound(on) {
  if (!game.user?.isGM) return null;
  const s = rideSound();
  if (!s) return null;
  try {
    if (on) {
      // ⚠️ REPEAT IS THE ONLY THING WE IMPOSE. A one-shot would end a minute into the journey and
      // leave the window moving in silence, so looping is not optional — but the VOLUME is his,
      // set per sound in his own library, and a module that renormalises someone's mix every time
      // it plays something is a module they stop trusting. Only a muted sound is nudged, because
      // silence would read as this being broken.
      if (!s.repeat) await s.update({ repeat: true });
      if (!s.volume) await s.update({ volume: 0.4 });
      if (!s.playing) await s.parent.playSound(s);
    } else if (s.playing) {
      await s.parent.stopSound(s);
    }
    return s.name;
  } catch (e) {
    console.warn(`${MODULE_ID} | the ride's sound:`, e?.message);
    return null;
  }
}

// The table follows the party car to car. Debounced because a cross-scene teleport is a
// create + a delete whose order isn't ours to rely on — we evaluate the settled state.
let followTimer = null;
function evaluateFollow() {
  followTimer = null;
  try {
    if (!game.settings.get(MODULE_ID, "partyTeleportActivates")) return;
    const active = game.scenes.active;
    if (!active) return;
    const pcTokens = (s) => s.tokens.filter(t => !t.hidden && t.actor?.type === "character" && t.actor.hasPlayerOwner);
    if (pcTokens(active).length) return; // somebody is still in the active car — hold the shot
    let best = null;
    for (const s of trainScenes()) {
      if (s.active || !s.regions.some(r => r.flags[MODULE_ID]?.trainLand)) continue;
      const n = pcTokens(s).length;
      if (n && (!best || n > best.n)) best = { s, n };
    }
    if (best) {
      console.log(`${MODULE_ID} | party crossed to "${best.s.name}" — activating (train follow)`);
      best.s.activate();
    }
  } catch (e) { /* best-effort glue */ }
}
export function registerTrainFollow() {
  const poke = (tok) => {
    if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
    if (tok.actor?.type !== "character") return;
    if (followTimer) clearTimeout(followTimer);
    followTimer = setTimeout(evaluateFollow, 250);
  };
  Hooks.on("createToken", poke);
  Hooks.on("deleteToken", poke);
}
