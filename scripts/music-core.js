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

// ── the overlap inside a playlist (ported from deck-command's overlap.js, 2026-11-06) ─────────────

export const OVERLAP_SETTING = "musicOverlapSeconds";
// ── the floor's bed plays on under the music (DM 2026-11-08, WORKPLAN decision 8) ───────────────────
//
// *"Rain keeps playing under the room music"* — it is the storm outside. A floor's ambience bed is the
// scene's own Playlist field, so the layer counted it as "the scene default" and stopped it the moment a
// room, a fight or a mood took over. A BED is not music: it is a PlaylistSound flagged `mobile-command.bed`
// (or one of the Crooked House's `<floor>:bed` tracks, `cm` flag). It keeps playing under every layer, at
// its own volume (his slider, never ours), and only an explicit Silence stops it.

/** Is this PlaylistSound (its `flags`) an ambience bed? */
export function isBed(flags) {
  const m = flags?.["mobile-command"] ?? {};
  return m.bed === true || /:bed$/.test(String(m.cm ?? ""));
}

// ── EITHER OR: one music track at a time (DM 2026-11-09) ────────────────────────────────────────────
// *"No dual music tracks (not counting environmental sound), either or."* Seen: the Attic's bed (Dark Ritual)
// played under the Cauldron fight's music at the same level. So a bed is one of two kinds:
//   environment  rain, wind, creaks, drips: layers under any music, as decision 8 had it (only Silence stops it)
//   music        a tonal mood bed: it IS the music while nothing else plays, and stops the moment room, fight,
//                cue or a manual pick takes over. It comes back by itself: when that layer ends, the layer drops
//                to the scene default, which is this bed, and plays it again.
// The kind is `flags.mobile-command.bedKind` when set ("music" | "environment": his to flip on any sound), else
// the table below for the beds MC put in the world, else environment (a bed flag is the ambience promise).
// The table is by ear-and-file (2026-11-09, chunk 5): the catalogue files all four under ambience, but only the
// first floor's is weather; the other three are sustained dark-tone pieces with no environment in them, and the
// DM heard the Attic's as music under the fight.
export const BED_KINDS = Object.freeze({
  "12.1:bed": "environment", // house-divided ambient/ruined/abandoned-mansion-rain.ogg: the storm outside
  "12.2:bed": "music",       // house-divided ambient/ruined/haunted-house.ogg: an even, tonal haunted-house pad
  "12.3:bed": "music",       // Ghelfi Ambiences 6 shortloops/Hall-of-Horrors.ogg: a dark-tone piece
  "12.4:bed": "music",       // Ghelfi Ambiences 3 shortloops/Dark-Ritual.ogg: the ritual drone (the Attic case)
});

/** "music" | "environment" for a bed's `flags`. */
export function bedKind(flags) {
  const m = flags?.["mobile-command"] ?? {};
  if (m.bedKind === "music" || m.bedKind === "environment") return m.bedKind;
  return BED_KINDS[String(m.cm ?? "")] ?? "environment";
}

/** Does the bed keep playing while the layer plays `target`? An environment bed: everything but Silence.
 *  A music bed: never under other music (when the target is the bed itself, crossfade keeps it as the target). */
export function bedStays(target, kind = "environment") {
  if (!target || target.kind === "silence") return false;
  return kind !== "music";
}

// ── a scene's own fight music (DM 2026-11-08, WORKPLAN decision 9) ─────────────────────────────────
// The Crooked House's fights play its own battle pack, and the Cauldron Room its own track, without a flag
// on every weasel: `flags.mobile-command.music.battle` on the SCENE, a playlist uuid. A foe that names its
// own battle still wins (battleFor); the scene's beats the world default.

/** The scene's battle playlist uuid from its `flags`, or null. */
export function sceneBattleOf(flags) {
  const b = flags?.["mobile-command"]?.music?.battle;
  return typeof b === "string" && b ? b : null;
}

// ── a scene's DEFAULT soundtrack (DM 2026-11-17, SEAT 5; revised the same day, DESIGN §59) ──────────────────
// First ask: *"a quite soundtrack default for each scene"*. His correction: *"Wait, so music starts when the party
// enters a room? I actually like that better"*. So: ROOMS stay the model. A map with Music regions gets its music from
// its rooms only, never a scene-wide default over them. A default is only for a map with NO rooms, and only when HE
// names it: `flags.mobile-command.music.default` on the scene, a playlist uuid ("none" = none). MC never auto-plays
// one; SCENE_MUSIC_APPROVED is what he said yes to (from his Music → Rooms playlists, by title, no new files), and
// `MobileCommand.music.adoptSceneMusic(ids?)` writes the flag for the ones he says yes to. The scene's own Playlist
// field (his earlier choice, e.g. 10.9's) still plays as before.
export const SCENE_MUSIC_WORLD = "crooked-moon-6x";
// HIS ANSWERS (DM 2026-11-17, later): Druskenvald YES, Wickermoor Hollow YES (written once on his GM load, cm-scene-music
// one-shot in music.js `adoptApprovedOnce`). 10.8 Tender NO, on purpose (*"a little buildup"*): nothing. The landing
// YES to the Passenger Car list BUT *"Music should start 2 seconds after lights go on, so the train sounds first,
// visual than music"*: so no default on the landing at all; 10.1's own Playlist field (the same list) is HELD during
// Start ride and starts 2 s after the lamps (musicHoldOf below; deck-command ride.js releases it).
export const SCENE_MUSIC_APPROVED = Object.freeze({
  UbgWWsXfPSmO9dWu: "cmroM7sdO9ufQBvA", // Druskenvald → Room · Off the Spectral Rails
  W1Kw4TXP0Mw9zVMw: "cmroAveP8tcNEzPe", // Wickermoor Hollow → Room · Wickermoor Hollow (10.9's list)
});
export const SCENE_MUSIC_DECLINED = Object.freeze({ rnp1No8kbQe8ejMU: "10.8 Tender: no music on purpose (a little buildup)" });

/**
 * Pure: is this scene's music HELD right now (§59.9)? `flags.mobile-command.musicHold = { until: ms }`, written by a
 * ride before it activates a dark car and let go 2 s after its lamps. While held, neither the scene's own Playlist field
 * (core's activation start is deferred) nor its rooms nor a default start; cue and combat still win. `until` is a safety:
 * a ride that never lets go cannot silence the car past it.
 */
export const MUSIC_HOLD_FLAG = "musicHold";
export const MUSIC_HOLD_MAX_MS = 20000;
export function musicHoldOf(flags, now = Date.now()) {
  const h = flags?.["mobile-command"]?.[MUSIC_HOLD_FLAG];
  const until = Number(h?.until);
  return Number.isFinite(until) && until > now ? until : 0;
}

/** The scene's own default-music flag: a playlist uuid, "none", or null (not set). */
export function sceneMusicFlagOf(flags) {
  const d = flags?.["mobile-command"]?.music?.default;
  if (d === "none" || d === false) return "none";
  return typeof d === "string" && d ? d : null;
}

/** Pure: the playlist uuid of a scene's default soundtrack, or null. Only his flag, and never on a map with rooms. */
export function sceneMusicOf({ flags, hasRooms = false } = {}) {
  if (hasRooms) return null;
  const f = sceneMusicFlagOf(flags);
  return f && f !== "none" ? f : null;
}

export const OVERLAP_DEFAULT = 5;
export const OVERLAP_ROLES = new Set(["room", "battle", "mood"]);

/** Is this playlist one the overlap applies to? `{ mode, flags }` in; the role is the flag ch10 writes. */
export function overlapApplies(pl, modes) {
  const role = pl?.flags?.["mobile-command"]?.music?.role ?? null;
  if (!OVERLAP_ROLES.has(role)) return false;
  return pl.mode === modes.SEQUENTIAL || pl.mode === modes.SHUFFLE;
}

/**
 * When to hand off, in ms from now, or null for "never".
 * @param {{ duration: number, elapsed: number, overlap: number, repeat?: boolean }} t  seconds
 */
export function handOffIn({ duration, elapsed, overlap, repeat = false }) {
  if (repeat || !(overlap > 0) || !Number.isFinite(duration) || !Number.isFinite(elapsed)) return null;
  // a track shorter than two overlaps would spend its whole life fading: leave it to core
  if (duration < overlap * 2) return null;
  const at = duration - overlap - elapsed;
  return Math.max(0, Math.round(at * 1000));
}

/**
 * The update for one hand-off: the shape core's `playNext` writes, plus the two fades.
 * @returns {{ sounds: object[], restore: object[] } | null}
 */
export function handOffUpdate(sounds, currentId, nextId, overlapMs) {
  if (!nextId || nextId === currentId) return null;
  const by = new Map(sounds.map((s) => [s.id, s]));
  if (!by.has(currentId) || !by.has(nextId)) return null;
  const update = sounds.map((s) => {
    const u = { _id: s.id, playing: s.id === nextId, pausedTime: null };
    if (s.id === currentId || s.id === nextId) u.fade = overlapMs;
    return u;
  });
  const restore = [currentId, nextId].map((id) => ({ _id: id, fade: by.get(id).fade ?? null }));
  return { sounds: update, restore };
}

// ── the duck: the music dips under a sting (Deck Command's crit and fumble, 2026-11-07, DESIGN §25.6) ─

export const DUCK_DEFAULTS = Object.freeze({ ms: 2600, to: 0.3 });
export const DUCK_DOWN_MS = 150;
export const DUCK_UP_MS = 400;
export const DUCK_MAX_MS = 30000; // a wild `ms` from a caller must not leave a table's music low all night

/** Whatever a caller sends, a duck that ends. */
export function duckArgs({ ms, to } = {}) {
  const m = ms === null || ms === undefined ? NaN : Number(ms), t = to === null || to === undefined ? NaN : Number(to);
  return {
    ms: Number.isFinite(m) ? Math.min(DUCK_MAX_MS, Math.max(0, m)) : DUCK_DEFAULTS.ms,
    to: Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : DUCK_DEFAULTS.to,
  };
}

/**
 * ⚠️ THE CHANNEL'S GAIN, NEVER A SOUND'S. Every music track on a screen plays through one gain node, the
 * music slider's, and a track's own fades live on its own node, upstream of that. Core's fade-in and
 * fade-out, a crossfade, the overlap's hand-off and Animater's card dip all write those track nodes, and
 * each remembers or assumes a level there. A dip on the channel multiplies all of them and disturbs none.
 * Dipping the tracks instead lets a card remember the dipped level and restore to it, leaving the music
 * low, and brings a track back up in the middle of its fade-out.
 *
 * @param {() => ({param: AudioParam, time: () => number}|null)} o.channel  the gain, or null: no audio here
 * @param {() => number} o.level  the level the channel belongs at NOW (0 while muted), read at each end
 * @returns {{hold: (o?: {ms?: number, to?: number}) => boolean}}
 */
export function createDuck({ channel, level, later = setTimeout, cancel = clearTimeout }) {
  let timer = null, depth = 1;
  const rampTo = (c, value, ms) => {
    const t = c.time();
    c.param.cancelScheduledValues(t);
    c.param.setValueAtTime(c.param.value, t);
    c.param.linearRampToValueAtTime(value, t + ms / 1000);
  };
  const release = () => {
    timer = null; depth = 1;
    const c = channel();
    if (c) rampTo(c, level(), DUCK_UP_MS);
  };
  return {
    hold(opts) {
      const c = channel();
      if (!c || !(level() > 0)) return false; // nothing to dip: no audio here yet, or this screen's music at zero
      const { ms, to } = duckArgs(opts);
      if (timer) cancel(timer);    // a second sting extends the first, and the music comes back once
      depth = Math.min(depth, to);
      rampTo(c, level() * depth, DUCK_DOWN_MS);
      timer = later(release, ms);
      return true;
    },
  };
}
