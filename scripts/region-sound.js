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
      const changes = {};
      if (d.count !== this.count) changes["system.count"] = d.count;
      if (d.fired !== this.fired) changes["system.fired"] = d.fired;
      if (d.fire && this.rule === "arm" && !this.armed) changes["system.armed"] = true;
      if (Object.keys(changes).length) {
        try { await this.behavior.update(changes); } catch (e) { console.warn(`${MODULE_ID} | cue count not saved`, e); }
      }
      if (!d.fire) return;
      if (this.rule === "arm") { Hooks.callAll(`${MODULE_ID}.cueArmed`, this.behavior); return; }
      const position = event.data?.position ?? event.data?.movement?.destination ?? null;
      await playCue(this, { token, position, now });
    }
  };
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
}
