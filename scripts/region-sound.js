/**
 * ── A "SOUND" OPTION IN FOUNDRY'S OWN REGION MENU (§53; catalogue 231, DM 2026-09-18) ────────────
 *
 * *"Foundry has no such option; we add one, the same supported way D&D 5e adds its Difficult Terrain
 * behaviour. In the region's menu, beside teleport and darkness: the sound set, how loud, how far it
 * carries, and the rule — Always, Once, On these passes (e.g. 3 and 12, then the count starts over) or
 * 1 in N. No script to write. The count lives on the region, so it survives reloads and sessions; each
 * one gets fire-now, mute and reset-count from the DM's side. Only player characters count by default,
 * so moving a hidden monster across a board never gives it away."*
 *
 * How it plays. ONE client decides, so six browsers never play six creaks: for the animate events (the
 * token's picture actually reaching the patch — the honest moment for a footstep) it is the one active GM
 * viewing the scene; for the move events (the document change, which every client sees whether it views
 * the scene or not) it is the designated active GM, and only when no GM views the scene — otherwise the
 * animate event already covered that step. The chosen client then plays for everyone through core's own
 * positional one-shot (SoundsLayer#emitAtPosition): each client hears it from ITS listeners — the TV from
 * the party (§23), the DM at full (core's gmAlways), phones not at all (their environment channel is
 * zero, §14) — so "room sound → TV only" needs nothing extra. Radius 0 means "everyone, everywhere" and
 * goes through AudioHelper instead.
 *
 * "Arm, don't fire" (catalogue 119): a cue with the rule *arm* never plays by itself — it marks itself
 * armed and raises `mobile-command.cueArmed` so a deck key can light; `cues.fire(uuid)` then plays it.
 *
 * Nothing at module scope touches a Foundry global: the class is built inside registerSoundBehavior(),
 * so tools/test-cues.mjs can import this file headless.
 */
import { MODULE_ID } from "./preset.js";
import { CUE_SETS, CM_DOOR_SOUNDS } from "./cue-sets.js";
import { CUE_RULES, decide, pickTake, withinCooldown, isPlayerCharacter } from "./cue-rules.js";

export const BEHAVIOR_TYPE = `${MODULE_ID}.sound`;

/** What the deciding client remembers between plays: when, and which take (never twice running). */
const lastPlayed = new Map();
/** The extra step beats still queued per cue (cadenceBeats), so a new move can drop them. */
const pendingBeats = new Map();

function buildType() {
  const F = foundry.data.fields;
  const E = CONST.REGION_EVENTS;

  // State the DM reads on the region but must not be asked to edit as a form field.
  class StateNumberField extends F.NumberField { static hasFormSupport = false; }
  class StateBooleanField extends F.BooleanField { static hasFormSupport = false; }

  const setChoices = { "": "MOBILECOMMAND.BEHAVIORS.SOUND.SET.none", ...Object.fromEntries(Object.entries(CUE_SETS).map(([k, v]) => [k, v.label])) };

  return class SoundRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
    static LOCALIZATION_PREFIXES = ["MOBILECOMMAND.BEHAVIORS.SOUND"];

    static defineSchema() {
      return {
        // ⚠️ MOVE_WITHIN BELONGS HERE (2026-09-20). It was left out of the allowed list, and a cue built on it —
        // the eight that make a room speak up now and then rather than on a loop — failed validation on every
        // scene load: "tokenMoveWithin is not a valid choice", eight times, forever. Restricting the choices is
        // worth doing (the menu should not offer events this behaviour ignores) but the list has to hold every
        // event the thing is actually used with.
        events: this._createEventsField({
          events: [E.TOKEN_ANIMATE_IN, E.TOKEN_MOVE_IN, E.TOKEN_MOVE_WITHIN, E.TOKEN_ENTER, E.TOKEN_ANIMATE_OUT,
            E.TOKEN_MOVE_OUT, E.TOKEN_EXIT, E.TOKEN_TURN_START, E.TOKEN_ROUND_START],
          initial: [E.TOKEN_ANIMATE_IN, E.TOKEN_MOVE_IN],
        }),
        set: new F.StringField({ required: true, blank: true, initial: "creak", choices: setChoices }),
        src: new F.FilePathField({ categories: ["AUDIO"], required: false, blank: true }),
        volume: new F.NumberField({ required: true, nullable: false, initial: 0.8, min: 0, max: 1, step: 0.05 }),
        radius: new F.NumberField({ required: true, nullable: false, initial: 20, min: 0, step: 5 }),
        walls: new F.BooleanField({ initial: true }),
        origin: new F.StringField({ required: true, initial: "token", choices: {
          token: "MOBILECOMMAND.BEHAVIORS.SOUND.ORIGIN.token", region: "MOBILECOMMAND.BEHAVIORS.SOUND.ORIGIN.region",
        } }),
        rule: new F.StringField({ required: true, initial: "always", choices: CUE_RULES }),
        passes: new F.StringField({ required: true, blank: true, initial: "3, 12" }),
        chance: new F.NumberField({ required: true, nullable: false, integer: true, initial: 3, min: 1 }),
        cooldown: new F.NumberField({ required: true, nullable: false, initial: 2, min: 0, step: 0.5 }),
        playersOnly: new F.BooleanField({ initial: true }),
        muted: new F.BooleanField(),
        count: new F.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        fired: new StateBooleanField(),
        armed: new StateBooleanField(),
        lastAt: new StateNumberField({ required: false, nullable: true, initial: null }),
      };
    }

    /** Is THIS client the one that decides this event? (see the header) */
    #decides(event) {
      const scene = this.scene;
      const viewsIt = (u) => u.active && u.isGM && u.viewedScene === scene?.id;
      const anyGM = (u) => u.active && u.isGM;
      const animate = event.name === E.TOKEN_ANIMATE_IN || event.name === E.TOKEN_ANIMATE_OUT;
      if (animate) return game.user.isDesignated(viewsIt);
      // A move WITHIN the region has no animate twin, so the designated GM answers it outright (below).
      const move = event.name === E.TOKEN_MOVE_IN || event.name === E.TOKEN_MOVE_OUT;
      if (move) {
        const twin = event.name === E.TOKEN_MOVE_IN ? E.TOKEN_ANIMATE_IN : E.TOKEN_ANIMATE_OUT;
        if (this.events.has(twin) && game.users.some(viewsIt)) return false; // the animate event covers this step
      }
      return game.user.isDesignated(anyGM);
    }

    /** @override */
    async _handleRegionEvent(event) {
      const token = event.data?.token;
      if (!token || !this.#decides(event)) return;
      if (this.muted || this.behavior?.disabled) return;
      if (this.playersOnly && !isPlayerCharacter(token)) return;
      if (token.hidden) return;
      const uuid = this.behavior.uuid;
      const now = Date.now();
      if (withinCooldown(lastPlayed.get(uuid)?.at, now, this.cooldown)) return;

      const d = decide({ rule: this.rule, count: this.count, fired: this.fired, passes: this.passes, chance: this.chance });
      // ⚠️ CLAIM THE COOLDOWN NOW, BEFORE ANY AWAIT (DM 2026-11-12: "a strange moan repeated several times, then
      // nothing" in the Cauldron Room). One move raises several region events at once; each passed the cooldown
      // check above while the first was still awaiting its count save, because the time was only written inside
      // playCue — so a 1-in-5, once-per-25-s moan came out as a burst, then the cooldown silenced the room.
      if (d.fire && this.rule !== "arm") lastPlayed.set(uuid, { at: now, take: lastPlayed.get(uuid)?.take ?? null });
      const changes = {};
      if (d.count !== this.count) changes["system.count"] = d.count;
      if (d.fired !== this.fired) changes["system.fired"] = d.fired;
      if (d.fire && this.rule === "arm" && !this.armed) changes["system.armed"] = true;
      /**
       * ⚠️ PLAY FIRST, SAVE AFTER (DM 2026-11-12: "the teeth crunch plays about a second after the token stops
       * moving"). The count was saved — a round trip to the server — BEFORE the sound started; the decision above is
       * already made, so the save no longer stands in front of the play. Foundry raises a move-within event the moment
       * the move is saved (TokenDocument _onUpdate), i.e. as the token starts to slide, so this now plays then.
       */
      const save = Object.keys(changes).length
        ? this.behavior.update(changes).catch((e) => console.warn(`${MODULE_ID} | cue count not saved`, e)) : null;
      if (!d.fire) { await save; return; }
      if (this.rule === "arm") { await save; Hooks.callAll(`${MODULE_ID}.cueArmed`, this.behavior); return; }
      const movement = event.data?.movement ?? null;
      const position = event.data?.position ?? movement?.origin ?? movement?.destination ?? null;
      const played = playCue(this, { token, position, now });
      // A LIGHT STEP CADENCE for a set that asks for one (the teeth): one more take every few squares of a longer move,
      // spread along its path, capped — never stacked on one spot, never one per pixel
      const beats = cadenceBeats(this.set && CUE_SETS[this.set]?.cadence, movement, this.scene);
      // a new move drops what the last one still had queued: no stacking
      for (const t of pendingBeats.get(uuid) ?? []) clearTimeout(t);
      pendingBeats.set(uuid, beats.map((b) => setTimeout(() => { playCue(this, { token, position: b.at, now: Date.now() }).catch(() => {}); }, b.wait)));
      await played; await save;
    }
  };
}

/**
 * The extra beats of a longer move, for a set with `cadence: { every, max, gap }` (cue-sets.js): one more take per
 * `every` squares past the first, at most `max` in all, `gap` ms apart, placed along the path from origin to
 * destination. Pure apart from the scene's grid. Returns [{ wait, at }] (the first take is not in it).
 */
export function cadenceBeats(cadence, movement, scene) {
  if (!cadence || !movement) return [];
  const per = Number(scene?.grid?.distance) || 5;
  const squares = Math.max(0, Number(movement.passed?.distance ?? 0) / per);
  const extra = Math.min(Math.max(0, (cadence.max ?? 3) - 1), Math.floor(Math.max(0, squares - 1) / Math.max(1, cadence.every ?? 2)));
  const a = movement.origin, z = movement.destination;
  const out = [];
  for (let i = 1; i <= extra; i++) {
    const u = i / (extra + 1);
    out.push({ wait: i * (cadence.gap ?? 250), at: a && z ? { x: a.x + (z.x - a.x) * u, y: a.y + (z.y - a.y) * u, elevation: z.elevation ?? 0 } : (z ?? null) });
  }
  return out;
}

/**
 * ⚠️ EVERY SCREEN HAS THE FILES BEFORE THE FIRST STEP (DM 2026-11-12, the late crunch): core's positional play makes a
 * fresh Sound and loads it on each client, so the first time a take played, every screen fetched and decoded it first.
 * On a map opening, every cue take on that map with a radius goes into Foundry's buffer cache; core's `load()` then
 * finds it there. Small sets only (a step cue, not a playlist).
 */
export function preloadSceneCues(scene = globalThis.canvas?.scene) {
  try {
    const files = new Set();
    for (const r of scene?.regions ?? []) for (const b of r.behaviors ?? []) {
      if (b.type !== BEHAVIOR_TYPE || b.disabled || b.system?.muted) continue;
      const takes = b.system?.set && CUE_SETS[b.system.set] ? CUE_SETS[b.system.set].takes : (b.system?.src ? [b.system.src] : []);
      if (takes.length <= 8) for (const t of takes) files.add(t);
    }
    // ⚠️ AND THE DOORS (DM 2026-11-12: "sounds seem to be delayed overall, also with the door"): Foundry plays a door's
    // sound on each screen as the change arrives (Wall#_onUpdate → playAtPosition), but a take never heard before is
    // fetched twice and decoded first. Every take of every door set used on this map, so the first open is as quick
    // as the tenth.
    for (const w of scene?.walls ?? []) {
      const set = w.door ? globalThis.CONFIG?.Wall?.doorSounds?.[w.doorSound] : null;
      if (!set) continue;
      for (const k of ["open", "close", "lock", "unlock", "test"]) for (const t of [set[k] ?? []].flat()) if (t) files.add(t);
    }
    for (const f of files) foundry.audio.AudioHelper.preloadSound(f).catch?.(() => {});
    return [...files];
  } catch (e) { return []; }
}

/** Play one take of a cue for everyone, from where it happened. Returns the take played (or null). */
async function playCue(system, { token = null, position = null, now = Date.now() } = {}) {
  const uuid = system.behavior?.uuid;
  const takes = system.set && CUE_SETS[system.set] ? CUE_SETS[system.set].takes : (system.src ? [system.src] : []);
  const src = pickTake(takes, Math.random, lastPlayed.get(uuid)?.take ?? null);
  if (!src) return null;
  lastPlayed.set(uuid, { at: now, take: src });
  const volume = Math.max(0, Math.min(1, Number(system.volume) || 0));
  let origin = null;
  try {
    if (system.origin === "region") origin = regionCenter(system.region);
    else if (token) origin = position ? token.getCenterPoint(position) : token.getCenterPoint();
    if (!origin) origin = regionCenter(system.region);
  } catch (e) { origin = null; }
  if (!system.radius || !origin || !canvas?.ready) {
    // everywhere, for everyone — the socket flag plays it on every client, on the environment channel
    foundry.audio.AudioHelper.play({ src, volume, loop: false, channel: "environment" }, true);
    return src;
  }
  await canvas.sounds.emitAtPosition(src, origin, system.radius, { volume, walls: !!system.walls, easing: true });
  return src;
}

/**
 * The middle of a region, from its SHAPES rather than its drawn object: a client that is not looking at the scene
 * has no placeable, so `region.object.bounds` is null there — and the client that decides a cue is often exactly
 * that one (a GM on another map still owns the move events).
 */
export function regionCenter(region) {
  const shapes = region?.shapes ?? [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const s of shapes) {
    if (s.type === "rectangle") { grow(s.x, s.y); grow(s.x + s.width, s.y + s.height); }
    else if (s.type === "circle") { grow(s.x - s.radius, s.y - s.radius); grow(s.x + s.radius, s.y + s.radius); }
    else if (s.type === "ellipse") { grow(s.x - s.radiusX, s.y - s.radiusY); grow(s.x + s.radiusX, s.y + s.radiusY); }
    else if (s.type === "polygon") for (let i = 0; i + 1 < (s.points?.length ?? 0); i += 2) grow(s.points[i], s.points[i + 1]);
  }
  if (!Number.isFinite(x0)) {
    const b = region?.object?.bounds;
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

const resolve = (uuid) => {
  const sync = foundry.utils.fromUuidSync ?? globalThis.fromUuidSync;
  const doc = typeof uuid === "string" ? sync(uuid) : uuid;
  return doc?.type === BEHAVIOR_TYPE ? doc : null;
};

/** One row per Sound behaviour on a scene — what the deck's per-scene list and the panel read (catalogue 232). */
function listCues(scene = canvas?.scene) {
  const rows = [];
  for (const region of scene?.regions ?? []) {
    for (const b of region.behaviors) {
      if (b.type !== BEHAVIOR_TYPE) continue;
      const s = b.system;
      rows.push({
        uuid: b.uuid, name: b.name || region.name, region: region.name, disabled: b.disabled,
        set: s.set || null, src: s.src || null, rule: s.rule, passes: s.passes, chance: s.chance,
        count: s.count, fired: s.fired, armed: s.armed, muted: s.muted, volume: s.volume, radius: s.radius,
        at: regionCenter(region), // where it sounds from — so a caller can pick the one nearest the party
      });
    }
  }
  return rows;
}

/**
 * The DM's side of every cue (catalogue 231: "fire-now, mute and reset-count"), for the panel, the deck and
 * macros. GM clients only — the writes are region updates.
 */
export const cues = Object.freeze({
  list: listCues,
  rules: CUE_RULES,
  sets: () => Object.entries(CUE_SETS).map(([id, s]) => ({ id, label: s.label, takes: s.takes.length })),
  /** Play it now, whatever its rule or count says; clears an armed cue. */
  async fire(uuid) {
    const b = resolve(uuid);
    if (!b) return null;
    if (b.system.armed) await b.update({ "system.armed": false });
    return playCue(b.system, {});
  },
  async mute(uuid, on = true) {
    const b = resolve(uuid);
    return b ? b.update({ "system.muted": !!on }) : null;
  },
  async reset(uuid) {
    const b = resolve(uuid);
    return b ? b.update({ "system.count": 0, "system.fired": false, "system.armed": false }) : null;
  },
  /** Every armed cue on the scene — the deck lights a key per row. */
  armed: (scene) => listCues(scene).filter((r) => r.armed && !r.disabled),
});

/** init: the behaviour type in Foundry's region menu, and the house's door sets in the wall menu. */
export function registerSoundBehavior() {
  try {
    CONFIG.RegionBehavior.dataModels[BEHAVIOR_TYPE] = buildType();
    CONFIG.RegionBehavior.typeIcons[BEHAVIOR_TYPE] = "fa-solid fa-volume-high";
  } catch (e) { console.error(`${MODULE_ID} | could not register the Sound region behaviour`, e); }
  try {
    for (const [id, set] of Object.entries(CM_DOOR_SOUNDS)) CONFIG.Wall.doorSounds[id] = { ...set };
  } catch (e) { console.error(`${MODULE_ID} | could not register the door sound sets`, e); }
  Hooks.on("canvasReady", () => { preloadSceneCues(); });
}
