/**
 * ── THE MUSIC LAYER'S ARITHMETIC (deck-command MUSIC-LAYER.md, DM 2026-10-31) ─────────────────────
 *
 * Pure functions, no Foundry global anywhere: tools/test-music.mjs runs every rule here headless.
 * music.js is the glue that reads the world into these shapes and plays what they answer.
 *
 * A TARGET is what should be heard: `{ kind: "playlist", uuid }`, `{ kind: "sound", uuid }` or
 * `{ kind: "silence" }`. `null` means "nothing new — keep playing".
 *
 * PRIORITY, highest wins; when a layer ends, the one below takes over:
 *   1 cue · 2 manual pick made in THIS combat · 3 combat · 4 manual pick made outside combat
 *   5 room · 6 scene default · 7 keep playing
 */

export const LAYERS = Object.freeze(["cue", "manual-combat", "combat", "manual", "room", "scene", "keep"]);

/** A stable string for a target, so "is this already what is playing" is one comparison. */
export function targetKey(t) {
  if (!t) return "";
  if (t.kind === "silence") return "silence";
  return `${t.kind}:${t.uuid ?? ""}`;
}

/**
 * Which layer wins, and what it plays.
 * @param {object} s
 * @param {{target:object}|null} s.cue          a cue in progress
 * @param {{target:object, combatId:string|null}|null} s.manual  the DM's pick and the fight it was made in (null = outside)
 * @param {string|null} s.combatId              the running fight, or null
 * @param {object|null} s.combatTarget          what combat plays this turn (null = combat has nothing to play)
 * @param {object|null} s.room                  the settled room's playlist target
 * @param {object|null} s.sceneDefault          the scene's own Playlist field
 * @returns {{layer:string, target:object|null}}
 */
export function resolveMusic(s = {}) {
  if (s.cue?.target) return { layer: "cue", target: s.cue.target };
  const inCombat = Boolean(s.combatId);
  const manual = s.manual?.target ? s.manual : null;
  if (inCombat && manual && manual.combatId === s.combatId) return { layer: "manual-combat", target: manual.target };
  if (inCombat && s.combatTarget) return { layer: "combat", target: s.combatTarget };
  if (!inCombat && manual && !manual.combatId) return { layer: "manual", target: manual.target };
  if (s.room) return { layer: "room", target: s.room };
  if (s.sceneDefault) return { layer: "scene", target: s.sceneDefault };
  return { layer: "keep", target: null };
}

/**
 * Is a manual pick still in force? Combat start clears every earlier pick (DM ruling: "no", a mood
 * does not survive Fight); combat end clears any pick made during that fight.
 */
export function manualStillHolds(manual, combatId) {
  if (!manual?.target) return false;
  if (combatId) return manual.combatId === combatId; // during a fight only a pick made in it holds
  return !manual.combatId;                           // outside, only a pick made outside holds
}

/**
 * The fight's battle music from its combatants.
 * Each combatant: `{ isPC, battle, phase2 }` (playlist uuids from `flags.mobile-command.music`).
 * A foe with its own Phase 2 is the boss and wins; otherwise the first foe that names a battle
 * playlist; otherwise the world default. `phased` = the boss has gone bloodied this fight.
 * @returns {{uuid:string|null, boss:number}} boss = index of the combatant that set it, or -1
 */
export function battleFor(combatants = [], fallback = null, phasedIds = []) {
  const foes = combatants.map((c, i) => ({ ...c, i })).filter((c) => !c.isPC);
  const boss = foes.find((c) => c.battle && c.phase2) ?? null;
  if (boss) {
    const phased = phasedIds.includes(boss.id);
    return { uuid: phased ? boss.phase2 : boss.battle, boss: boss.i, phased };
  }
  const named = foes.find((c) => c.battle) ?? null;
  if (named) return { uuid: named.battle, boss: named.i, phased: false };
  return { uuid: fallback || null, boss: -1, phased: false };
}

// ── rooms ─────────────────────────────────────────────────────────────────────────────────────────

/** Is (x, y) inside one region shape? Rectangles may be rotated (degrees, about their centre). */
export function inShape(sh, x, y) {
  if (!sh) return false;
  if (sh.type === "rectangle") {
    let px = x, py = y;
    const rot = Number(sh.rotation) || 0;
    if (rot) {
      const cx = sh.x + sh.width / 2, cy = sh.y + sh.height / 2, r = (-rot * Math.PI) / 180;
      const dx = x - cx, dy = y - cy;
      px = cx + dx * Math.cos(r) - dy * Math.sin(r);
      py = cy + dx * Math.sin(r) + dy * Math.cos(r);
    }
    return px >= sh.x && px <= sh.x + sh.width && py >= sh.y && py <= sh.y + sh.height;
  }
  if (sh.type === "circle") return (x - sh.x) ** 2 + (y - sh.y) ** 2 <= sh.radius ** 2;
  if (sh.type === "ellipse") {
    const rx = sh.radiusX || 0, ry = sh.radiusY || 0;
    if (!rx || !ry) return false;
    return ((x - sh.x) / rx) ** 2 + ((y - sh.y) / ry) ** 2 <= 1;
  }
  if (sh.type === "polygon") {
    const p = sh.points ?? [];
    let inside = false;
    for (let i = 0, j = p.length - 2; i + 1 < p.length; j = i, i += 2) {
      const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
    }
    return inside;
  }
  return false;
}

/** Inside a region = inside any solid shape and no hole. */
export function inRegion(shapes = [], x, y) {
  let solid = false;
  for (const sh of shapes) {
    if (!inShape(sh, x, y)) continue;
    if (sh.hole) return false;
    solid = true;
  }
  return solid;
}

/**
 * The scored room the WHOLE party stands in, or null (split, or not all in one scored room).
 * @param {Array<{x:number,y:number}>} party   one point per member (a grouped token's members share its point)
 * @param {Array<{id:string, shapes:Array}>} rooms   the scene's scored regions
 */
export function partyRoom(party = [], rooms = []) {
  if (!party.length || !rooms.length) return null;
  for (const r of rooms) if (party.every((p) => inRegion(r.shapes, p.x, p.y))) return r.id;
  return null;
}

/**
 * The 5-second rule. Feed it the candidate room every tick; it answers the settled room.
 * A different candidate restarts the clock; null (split / unscored) resets the clock and keeps the
 * settled room — "keep the current music".
 */
export class Dwell {
  constructor(ms = 5000) { this.ms = ms; this.pending = null; this.since = 0; this.settled = null; }
  reset() { this.pending = null; this.since = 0; this.settled = null; }
  tick(candidate, now = Date.now()) {
    if (candidate !== this.pending) { this.pending = candidate; this.since = now; }
    if (candidate && candidate !== this.settled && now - this.since >= this.ms) this.settled = candidate;
    return this.settled;
  }
}
