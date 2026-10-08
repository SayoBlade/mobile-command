import { MODULE_ID } from "./preset.js";

/**
 * ── CONTENT PACKS — how a companion module contributes to Mobile Command (§54) ─────────────────
 *
 * MC is an engine; a campaign's own tools (the Crooked Moon's séance board, curses, tarot, the
 * Ghostlight ride…) are CONTENT. A content pack is one plain object handed to registerContentPack()
 * at module-load time — before MC's own `ready` — and every place in the engine that used to import
 * a campaign symbol now asks the registry instead. MC never imports a pack; a pack imports MC.
 *
 * Nothing here knows what a pack does with a contribution. Each kind below names the ENGINE seam it
 * plugs into, and the file that owns that seam is the only reader (effects.js reads `fx`, dm-panel.js
 * reads `panelTab`, and so on). Keep this file free of engine imports beyond preset.js: a companion
 * imports it at load time, when nothing else of MC may be ready yet.
 *
 * A pack:
 *   id         stable slug; a second registration under the same id REPLACES the first (that is how a
 *              companion module wins over the copy MC still ships during the transition, §54 phase one)
 *   label      what a human calls it
 *   active()   is this content ON for this world right now? (a world setting, usually). Default: yes.
 *              Every reader below re-asks it per read, so a gate flipped live takes effect live.
 *   settings   [{ key, data }] — registered under MC's OWN namespace (`mobile-command.<key>`), because
 *              a pack's world data was written under it before the pack existed (curses are effect
 *              flags, tarot cards are actor flags, boarding is user flags — all `flags.mobile-command`).
 *              Moving namespaces is a migration; this is not.
 *   hooks()    register the pack's Foundry hooks and sweeps; called ONCE on every client at MC ready
 *   fx         { defs: { id: FX_DEF }, oneShot(id, payload) → true if handled, sync(active) } — entries
 *              in the Effects table, the one-shot dispatch, and the remount pass (effects.js)
 *   darkness(scene) → 0..1 or null: this pack's opinion of a scene's darkness (daylight.js); null = none
 *   campaign   { id, icon, label } — claims the ONE campaign-tab slot on the phone while active()
 *              (campaigns.js; a world-owning adventure such as Ember still outranks a book)
 *   chapters   [{ key, name, build(actor) → html }] — Character File chapters (character-file.js)
 *   entrances  [ENTRANCE] — themed intro banners (entrances.js)
 *   cueSets    { id: CUE_SET } — sound sets a region cue can play from (cue-sets.js)
 *   panelTab   the DM panel tab: { id, icon, title, label, body(ctx) → html,
 *                onClick(ev, ctx) → true if handled, onInput(ev, ctx) → true, onKeydown(ev, ctx) → true,
 *                rerender: { settings: [keys], actorFlags: bool, tokenFlags: bool } }
 *              ctx = { render, drawer, backPicker, panelEl } — the panel's own helpers, lent out
 *   shellTab   the phone tab: { id, icon, label, body(ctx) → html, header(ctx) → html (above the tab
 *                bar), onAction(action, el, ctx) → true if handled, onInput(el, ctx) → true,
 *                chipClass(effect) → extra class for a condition chip, dot(actor) → attention dot }
 *              ctx = { shell, actor, state, render, showEffectDetails } — `state` is this pack's own
 *              object on this shell instance (drafts, dismissals), so a pack keeps no globals
 *   api        object merged onto globalThis.MobileCommand (macro access); keys must not collide
 */

const REGISTRY = new Map();

export function registerContentPack(pack) {
  if (!pack?.id || typeof pack.id !== "string") throw new Error(`${MODULE_ID} | a content pack needs a string id`);
  const previous = REGISTRY.get(pack.id);
  REGISTRY.set(pack.id, pack);
  if (previous) console.log(`${MODULE_ID} | content pack "${pack.id}" replaced (${previous.label ?? "?"} → ${pack.label ?? "?"})`);
  Hooks.callAll("mobile-command.packRegistered", pack, previous ?? null);
  return pack;
}

export function contentPack(id) { return REGISTRY.get(id) ?? null; }

/** Registered packs, in registration order. Active ones only unless asked otherwise. */
export function contentPacks({ activeOnly = true } = {}) {
  const all = [...REGISTRY.values()];
  return activeOnly ? all.filter(isPackActive) : all;
}

export function isPackActive(pack) {
  try { return pack.active ? !!pack.active() : true; } catch (e) { return false; }
}

/** [ [pack, contribution] … ] for every active pack that offers `kind`. */
export function packContributions(kind) {
  return contentPacks().filter(p => p[kind] != null).map(p => [p, p[kind]]);
}

/* ── the seams, one reader each ─────────────────────────────────────────────────────────────── */

/** settings.js: a pack's settings are registered whether or not it is active — a gate is itself
 *  usually one of them, and a setting must exist before anything can read it. */
export function registerPackSettings() {
  for (const pack of contentPacks({ activeOnly: false })) {
    for (const { key, data } of pack.settings ?? []) {
      try { game.settings.register(MODULE_ID, key, data); }
      catch (e) { console.warn(`${MODULE_ID} | pack "${pack.id}" setting "${key}" failed to register`, e); }
    }
  }
}

/** main.js at ready: every pack's hooks, once. A pack registered later still gets its turn. */
const hooked = new Set();
export function mountPackHooks() {
  const mount = (pack) => {
    if (hooked.has(pack.id) || typeof pack.hooks !== "function") return;
    hooked.add(pack.id);
    try { pack.hooks(); } catch (e) { console.error(`${MODULE_ID} | pack "${pack.id}" hooks() failed`, e); }
  };
  for (const pack of contentPacks({ activeOnly: false })) mount(pack);
  Hooks.on("mobile-command.packRegistered", (pack) => { if (game.ready) mount(pack); });
}

/** effects.js: the table entries, in the order packs registered. */
export function packFxDefs() {
  return Object.assign({}, ...packContributions("fx").map(([, fx]) => fx.defs ?? {}));
}
/** effects.js: first pack that claims the one-shot wins; false when nobody does. */
export function packFxOneShot(id, payload) {
  for (const [pack, fx] of packContributions("fx")) {
    try { if (fx.oneShot?.(id, payload) === true) return true; }
    catch (e) { console.warn(`${MODULE_ID} | pack "${pack.id}" one-shot "${id}" failed`, e); }
  }
  return false;
}
/** effects.js: the remount pass — each pack re-reads what fxActive still wants of it. */
export function packFxSync(active) {
  for (const [pack, fx] of packContributions("fx")) {
    try { fx.sync?.(active); } catch (e) { console.warn(`${MODULE_ID} | pack "${pack.id}" fx sync failed`, e); }
  }
}

/** daylight.js: the first pack with an opinion about this scene's darkness. */
export function packDarkness(scene) {
  for (const [, fn] of packContributions("darkness")) {
    const v = fn(scene);
    if (typeof v === "number") return v;
  }
  return null;
}

/** campaigns.js: the pack that wears the phone's campaign-tab slot right now, or null. */
export function packCampaign() {
  return packContributions("campaign").map(([, c]) => c)[0] ?? null;
}

export function packChapters() { return packContributions("chapters").flatMap(([, c]) => c); }
export function packEntrances() { return packContributions("entrances").flatMap(([, e]) => e); }
export function packCueSets() { return Object.assign({}, ...packContributions("cueSets").map(([, s]) => s)); }
export function packPanelTabs() { return packContributions("panelTab").map(([, t]) => t); }
export function packShellTabs() { return packContributions("shellTab").map(([, t]) => t); }

/** shell.js: extra classes a condition chip wears (a curse is a live condition like Prone). */
export function packChipClass(effect) {
  return packShellTabs().map(t => { try { return t.chipClass?.(effect) ?? ""; } catch (e) { return ""; } }).filter(Boolean).join(" ");
}

/** main.js: what packs add to globalThis.MobileCommand (macro access, §8.1). Collisions are refused. */
export function packApi(existing = {}) {
  const out = {};
  for (const [pack, api] of packContributions("api")) {
    for (const [k, v] of Object.entries(api)) {
      if (k in existing || k in out) { console.warn(`${MODULE_ID} | pack "${pack.id}" api key "${k}" collides — skipped`); continue; }
      out[k] = v;
    }
  }
  return out;
}
