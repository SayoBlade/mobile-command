import { MODULE_ID } from "./preset.js";

/**
 * ── THE ACTION LIST (DM 2026-09-18 — deck-command ledger 151) ───────────────────────────────────
 *
 * *"make sure all MC actions are duplicated in the deck, i dont need to switch interfaces between
 * sceens"*, then *"fix the other 132 as suggested"*.
 *
 * Every action the DM presses in the panel during play, published ONCE as plain data plus a runner,
 * so any other surface — the deck is the first — can draw it and run it without knowing MC's
 * internals. MC still never learns the deck exists (DC DESIGN §7.11): this is a list, not a client.
 *
 * ⚠️ THE RUNNERS CALL THE SAME FUNCTIONS THE PANEL CALLS. Nothing here re-implements a feature; an
 * action that the panel does in three steps is three calls here, in the same order. A behaviour
 * that only lived in the panel's memory was moved into a setting first (see each area file), so the
 * panel and the deck read one truth and can never disagree.
 *
 * A definition:
 *   id        stable, dotted ("fx.rain") — the deck binds keys to it, so never rename one
 *   area      which drawer it belongs to (AREAS below)
 *   group     a heading inside the area — the deck never splits a group across two pages, so a
 *             group's keys stay together however many actions the area gains later
 *   label     what the key says;  icon: a picture NAME the consumer maps to its own glyphs
 *   does      what pressing it changes, so a surface can SHOW the difference (DM 2026-09-18: "make the
 *             difference between sound only and additional change very clear"):
 *               "sound"  a sound and nothing else — the deck draws it like a sound-board key
 *               "scene"  changes what the table SEES — the map, its lighting, the TV, a player's
 *                        screen — usually with a sound; the deck draws it like a behaviour key
 *             absent for plain controls (a target, a counter, a curse)
 *   art       for "scene" keys: Foundry's own painted icon (a core icons/ path, on every install) —
 *             the picture a behaviour key wears
 *   kind      "shot"   press runs it
 *             "toggle" press flips it; on() says which way it is
 *             "pick"   press opens a list of choices(); a choice runs it with { choice }
 *                      (`multi`: each choice toggles and the list stays open;
 *                       `steps`: a choice opens a − / + pair that runs with { choice, delta })
 *   cm        Crooked Moon only — offered only while the Crooked Moon tools are on
 *   hidden()  not part of this table at all (a setting rules it out) — never drawn, never counted
 *   when()    offered right now? (default yes) — a request with nothing pending, a rest not started.
 *             No means drawn dim, so the keys around it never move; add hideWhenOff: true for a
 *             queue, where a dead key would be clutter
 *   alert()   this key wants the DM now (a staged curse, an armed bite) — drawn in the alert style
 *   waiting() Requests area: how many people this key answers (default 1) — the Table key's count
 *   on()      toggle state;  sub(): a short caption;  danger: a key worth a second look
 *   choices() [{ id, label, img?, on?, sub? }] for pick kinds, computed when the area is read
 *   value(choice)  the number a step page shows between − and +
 *   run(params)    does it. Returns nothing on success, or { ok: false, reason } to refuse.
 */

export const AREAS = [
  { id: "effects", label: "Effects", icon: "bolt" },
  { id: "cm", label: "Crooked Moon", short: "Crooked", icon: "moon", cm: true }, // short: under the moon glyph, where a caption leaves one line
  { id: "tv", label: "TV", icon: "panel" },
  { id: "clock", label: "Clock & HP", icon: "clock" },
  { id: "combat", label: "Combat", icon: "target" },
  { id: "party", label: "Party", icon: "shield" },
  { id: "rest", label: "Rest", icon: "pause" },
  { id: "travel", label: "Travel", icon: "jump" },
  { id: "sound", label: "Sound", icon: "music" },
  { id: "requests", label: "Requests", icon: "warn" },
];

const DEFS = new Map();

export function defineAction(def) {
  if (!def?.id || !def.area || !def.run) throw new Error(`${MODULE_ID} | action needs id, area and run: ${def?.id}`);
  DEFS.set(def.id, def);
}
export function defineActions(list) { for (const d of list) defineAction(d); }

/** The Crooked Moon tools switch — the same gate the panel's CM tab uses. */
export function cmToolsOn() {
  try { return !!game.settings.get(MODULE_ID, "crookedMoonTools"); } catch (e) { return false; }
}

const safe = (fn, fallback) => {
  if (typeof fn !== "function") return fallback;
  try { return fn(); } catch (e) { console.warn(`${MODULE_ID} | action read failed`, e); return fallback; }
};

function offered(d) {
  if (d.cm && !cmToolsOn()) return false;
  if (safe(d.hidden, false)) return false;
  return safe(d.when, true) !== false;
}

/** How many people a Requests key answers — so "Spend" + "Keep" for one twist count once, not twice. */
function waitingOf(d) {
  if (d.area !== "requests") return 0;
  if (typeof d.waiting !== "function") return 1;
  return Math.max(0, Number(safe(d.waiting, 0)) || 0);
}

/**
 * The areas, with enough to caption a menu key: how many actions it offers now, how many of its
 * toggles are on, and how many requests are waiting (the Requests area is the one that counts those).
 */
export function actionAreas() {
  if (!game.user?.isGM) return [];
  const out = [];
  for (const a of AREAS) {
    if (a.cm && !cmToolsOn()) continue;
    let count = 0; let on = 0; let waiting = 0;
    for (const d of DEFS.values()) {
      if (d.area !== a.id || !offered(d)) continue;
      count += 1;
      if (d.kind === "toggle" && safe(d.on, false)) on += 1;
      waiting += waitingOf(d);
    }
    out.push({ id: a.id, label: a.label, short: a.short ?? a.label, icon: a.icon, count, on, waiting });
  }
  return out;
}

/** One area's actions, in definition order, as plain data. Computed only for the area asked for. */
export function actionSnapshot({ area } = {}) {
  if (!game.user?.isGM) return [];
  const out = [];
  for (const d of DEFS.values()) {
    if (area && d.area !== area) continue;
    if (d.cm && !cmToolsOn()) continue;
    if (safe(d.hidden, false)) continue;
    const enabled = safe(d.when, true) !== false;
    // A request with nothing pending is not an offer at all — it would be a dead key.
    if (!enabled && d.hideWhenOff) continue;
    const row = {
      id: d.id, area: d.area, group: d.group ?? null, label: d.label, icon: d.icon ?? null, kind: d.kind ?? "shot",
      enabled, danger: Boolean(d.danger),
    };
    if (d.does) row.does = d.does;
    if (d.art) row.art = d.art;
    if (enabled && safe(d.alert, false)) row.alert = true;
    if (d.kind === "toggle") row.on = Boolean(safe(d.on, false));
    const sub = safe(d.sub, undefined);
    if (sub) row.sub = String(sub);
    if (d.kind === "pick") {
      row.multi = Boolean(d.multi);
      row.steps = Boolean(d.steps);
      row.choices = (safe(d.choices, []) ?? []).map((c) => ({
        id: String(c.id), label: String(c.label ?? c.id), img: c.img ?? undefined,
        on: c.on === undefined ? undefined : Boolean(c.on), sub: c.sub ?? undefined,
        value: d.steps ? safe(() => d.value?.(String(c.id)), undefined) : undefined,
      }));
    }
    out.push(row);
  }
  return out;
}

/** Run one action. Always resolves — { ok: true } or { ok: false, reason } — never throws. */
export async function runAction(id, params = {}) {
  if (!game.user?.isGM) return { ok: false, reason: "only a GM can run table actions" };
  const d = DEFS.get(id);
  if (!d) return { ok: false, reason: `no action called ${id}` };
  if (d.cm && !cmToolsOn()) return { ok: false, reason: "the Crooked Moon tools are off" };
  if (safe(d.hidden, false)) return { ok: false, reason: `${d.label} is not part of this table` };
  if (safe(d.when, true) === false) return { ok: false, reason: `${d.label} is not available right now` };
  try {
    const r = await d.run(params ?? {});
    notifyActionsChanged();
    return r?.ok === false ? r : { ok: true };
  } catch (err) {
    console.error(`${MODULE_ID} | action ${id} failed`, err);
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

/**
 * Anything whose state lives outside a document or setting (a sound playing, a request arriving)
 * says so here, so a surface that draws the list can repaint. Settings and documents already fire
 * Foundry's own hooks.
 */
export function notifyActionsChanged() {
  try { Hooks.callAll(`${MODULE_ID}.actionsChanged`); } catch (e) { /* nobody listening */ }
}

/** How many definitions exist, per area — for the tests and the dev report. */
export function actionCounts() {
  const c = {};
  for (const d of DEFS.values()) c[d.area] = (c[d.area] ?? 0) + 1;
  return c;
}
