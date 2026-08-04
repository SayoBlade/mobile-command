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
//  - setTrainMist(): the ride itself — the Shroud rushing past. Three tile-scroll layers
//    per window band (above and below the car hull): a slow dim far layer, the main
//    thick drift, and fast thin streaks that sell the speed. All six tiles per scene
//    share two webm textures (PIXI caches by src), so the decode cost stays flat.
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

const GRID = 140;                 // the book's car maps are all 140px / 5ft
const INSET = 4;                  // keep region edges off the wall planes
const MIST_THICK = "modules/animated-mist-and-fog-by-mattm/animations/mist_thick_horizontal.webm";
const MIST_THIN = "modules/animated-mist-and-fog-by-mattm/animations/mist_super_thin_horizontal.webm";
// [src, scrollSpeed, alpha, repeatx, tint, sort] — speeds are tile-scroll units (uv/10s).
const MIST_LAYERS = [
  [MIST_THICK, 3, 0.5, 2, "#4fa8a0", 4],   // far Shroud: slow, dim, bluer
  [MIST_THICK, 8, 0.9, 3, "#8ff5d2", 5],   // the main drift
  [MIST_THIN, 22, 0.65, 4, "#b8ffe9", 6],  // wisps streaking past — the speed read
];

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
function wallsBlock(scene, a, b) {
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
        if (beh) await beh.update({ system: sys });
        else await from.createEmbeddedDocuments("RegionBehavior", [{ name: "Car door teleport", type: "teleportToken", system: sys }]);
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
    const hull = wallHull(s);
    const bands = [[0, hull.y0], [hull.y1, s.height - hull.y1]];
    const tiles = bands.flatMap(([y, h]) => MIST_LAYERS.map(([src, speed, alpha, repeatx, tint, sort]) => ({
      // NOT locked: only GMs can edit tiles anyway, and a locked tile ignores clicks
      // entirely — the DM couldn't even select one to nudge it (found 2026-08-04).
      texture: { src, tint }, x: 0, y, width: s.width, height: h, alpha,
      elevation: 0, sort, locked: false,
      flags: {
        "tile-scroll": { enableScroll: true, scrollSpeed: speed, scrollDirection: 0, repeatx, repeaty: 1 },
        [MODULE_ID]: { trainMist: true },
      },
    })));
    await s.createEmbeddedDocuments("Tile", tiles);
    scenes++;
  }
  return scenes;
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
