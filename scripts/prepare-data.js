// PREPARE SPELLS ON THE PHONE — THE EXECUTOR'S HALF (DM 2026-11-13, deck-command D-0106; the rules are prepare-plan.js).
// The GM client reads what Spell Book (2.5.5) has set up for the character and writes the save, so a phone never needs
// read access to Spell Book's compendium (where a wizard's book lives) or to its internals, which its bundle does not
// export. Read from Spell Book's own source, and kept to the same data it keeps:
//
//   class rules     actor flag `spell-book.classRules[<class>]` (customSpellList, customSubclassSpellList,
//                   spellSwapping, cantripSwapping, showCantrips, spellPreparationBonus, cantripPreparationBonus);
//                   with none stored, Spell Book's defaults for the world's rule set (ruleDefaults, its own table)
//   the class list  the spell-list journal pages those rules name, merged (spell-list-resolver.mjs)
//   a wizard's book the journal Spell Book keeps for the actor in `spell-book.custom-spell-lists` (flags actorId +
//                   classIdentifier), its "spells" page (wizard-book.mjs)
//   the limit       the class's dnd5e preparation max + the rule's bonus; cantrips: the class scale value named by the
//                   world setting `spell-book.cantripScaleValues` + its bonus (spell-manager.mjs)
//   the save        Spell Book's `preparedSpellsByClass[<class>] = ["<class>:<uuid>"…]`, so its own window agrees
//
// ⚠️ NEVER A DELETE (his ruling). Spell Book's own save removes an unprepared spell's item; ours sets `prepared: 0`.
// The swap window (prepare-plan.js) is ours, per class on the actor: `flags.mobile-command.prepare.<class>` =
// { open, level } — opened by a long rest or a new level per the class's swap rule, closed by a save that swapped out.
import { planSave, SWAP, canToggle, saveState, isOn, wasOn } from "./prepare-plan.js";

export const SB = "spell-book";
const SB_PACK = "spell-book.custom-spell-lists";
const MC = "mobile-command";

/** Spell Book's default rules for a class (its rule-set.mjs, legacy and modern). Pure. */
export function ruleDefaults(classId, ruleSet = "legacy") {
  const d = { cantripSwapping: SWAP.NONE, spellSwapping: SWAP.NONE, showCantrips: true, customSpellList: [], customSubclassSpellList: [],
    spellPreparationBonus: 0, cantripPreparationBonus: 0, forceWizardMode: false };
  const id = String(classId ?? "").toLowerCase();
  if (ruleSet === "modern") {
    d.cantripSwapping = SWAP.LEVEL_UP;
    if (id === "wizard") { d.cantripSwapping = SWAP.LONG_REST; d.spellSwapping = SWAP.LONG_REST; }
    else if (id === "cleric" || id === "druid" || id === "artificer") d.spellSwapping = SWAP.LONG_REST;
    else if (id === "paladin" || id === "ranger") { d.cantripSwapping = SWAP.NONE; d.spellSwapping = SWAP.LONG_REST; d.showCantrips = false; }
    else d.spellSwapping = SWAP.LEVEL_UP;
  } else {
    if (["wizard", "cleric", "druid", "artificer"].includes(id)) d.spellSwapping = SWAP.LONG_REST;
    else if (id === "paladin") { d.spellSwapping = SWAP.LONG_REST; d.showCantrips = false; }
    else if (id === "ranger") { d.spellSwapping = SWAP.LEVEL_UP; d.showCantrips = false; }
    else d.spellSwapping = SWAP.LEVEL_UP;
  }
  return d;
}

/** The rules Spell Book applies to this class of this actor. */
export function classRules(actor, classId, g = globalThis) {
  const stored = actor?.flags?.[SB]?.classRules?.[classId];
  if (stored) return { ...ruleDefaults(classId, ruleSetOf(actor, g)), ...stored };
  return ruleDefaults(classId, ruleSetOf(actor, g));
}
function ruleSetOf(actor, g) {
  const o = actor?.flags?.[SB]?.ruleSetOverride;
  if (o === "legacy" || o === "modern") return o;
  try { const w = g.game?.settings?.get?.(SB, "spellcastingRuleSet"); return w === "modern" ? "modern" : "legacy"; } catch (e) { return "legacy"; }
}

const num = (v) => Number(v?.value ?? v) || 0;
/** Max cantrips: the first scale value Spell Book's setting names, + the rule's bonus; 0 when the class shows none. Pure. */
export function cantripMax(scale, keysCsv = "cantrips-known, cantrips", rules = {}) {
  if (rules.showCantrips === false) return 0;
  let base = 0;
  for (const k of String(keysCsv ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const v = scale?.[k]; const n = Number(v?.value ?? v);
    if (Number.isFinite(n) && v != null) { base = n; break; }
  }
  return base ? Math.max(0, base + (Number(rules.cantripPreparationBonus) || 0)) : 0;
}
/** Max prepared: dnd5e's preparation max for the class, + the rule's bonus. Pure. */
export function preparedMax(classItem, rules = {}) {
  const base = num(classItem?.system?.spellcasting?.preparation?.max);
  return Math.max(0, base + (Number(rules.spellPreparationBonus) || 0));
}
/** Is the class's swap window open? No record yet (first setup) → open. Pure. */
export function swapOpen(rec, rule, levels) {
  if (!rec) return true;
  if (rec.open) return true;
  return rule === SWAP.LEVEL_UP && Number(levels) > Number(rec.level ?? 0);
}

function casterClasses(actor) {
  return [...(actor?.items ?? [])].filter((i) => i?.type === "class" && i.system?.spellcasting?.progression && i.system.spellcasting.progression !== "none");
}
const classOfSpell = (it) => {
  const s = it?.system?.sourceItem;
  if (typeof s === "string" && s.startsWith("class:")) return s.slice(6);
  return it?.system?.classIdentifier || "";
};
const srcUuid = (it) => it?._stats?.compendiumSource || it?.flags?.core?.sourceId || it?.uuid;
const hasProp = (p, k) => (p instanceof Set ? p.has(k) : Array.isArray(p) ? p.includes(k) : Boolean(p?.[k]));

/** Index entries (name, img, level, properties) for spell uuids, read pack by pack. */
async function describe(uuids, g) {
  const out = new Map(), byPack = new Map();
  for (const u of uuids) {
    const m = /^Compendium\.([^.]+\.[^.]+)\.Item\.([^.]+)$/.exec(String(u));
    if (!m) continue;
    if (!byPack.has(m[1])) byPack.set(m[1], []);
    byPack.get(m[1]).push([u, m[2]]);
  }
  for (const [packId, list] of byPack) {
    const pack = g.game?.packs?.get?.(packId);
    if (!pack) continue;
    let index; try { index = await pack.getIndex({ fields: ["system.level", "system.properties", "img"] }); } catch (e) { continue; }
    for (const [u, id] of list) {
      const e = index.get(id); if (!e) continue;
      out.set(u, { name: e.name, img: e.img, level: Number(e.system?.level) || 0, properties: e.system?.properties ?? [] });
    }
  }
  return out;
}
async function listSpells(pageUuids, g) {
  const out = new Set();
  for (const u of pageUuids ?? []) {
    if (!u || typeof u !== "string") continue;
    let page; try { page = await g.fromUuid(u); } catch (e) { page = null; }
    for (const s of page?.system?.spells ?? []) out.add(s);
  }
  return out;
}
async function wizardBook(actor, classId, g) {
  const pack = g.game?.packs?.get?.(SB_PACK);
  if (!pack) return new Set();
  let index; try { index = await pack.getIndex({ fields: ["flags"] }); } catch (e) { return new Set(); }
  const hit = [...index].find((e) => e.flags?.[SB]?.actorId === actor.id && e.flags?.[SB]?.classIdentifier === classId);
  if (!hit) return new Set();
  const doc = await pack.getDocument(hit._id);
  const page = [...(doc?.pages ?? [])].find((p) => p.type === "spells");
  return new Set(page?.system?.spells ?? []);
}

/**
 * Everything the phone's screen needs for one character (the executor answers the phone's `prepareData`).
 * @returns {{ ok, actorId, inCombat, over, classes: object[] }}
 */
export async function gatherPrepare(actor, g = globalThis) {
  const game = g.game;
  const keysCsv = (() => { try { return game.settings.get(SB, "cantripScaleValues"); } catch (e) { return "cantrips-known, cantrips"; } })();
  const over = (() => { try { return game.settings.get(MC, "prepareOverLimit") === "block" ? "block" : "warn"; } catch (e) { return "warn"; } })();
  const inCombat = Boolean(game.combat?.started && [...(game.combat.combatants ?? [])].some((c) => c.actorId === actor.id));
  const classes = casterClasses(actor);
  const spellsOnSheet = [...(actor.items ?? [])].filter((i) => i.type === "spell");
  const out = [];
  for (const cls of classes) {
    const id = cls.system.identifier;
    const rules = classRules(actor, id, g);
    const wizard = id === "wizard" || rules.forceWizardMode === true;
    const listUuids = await listSpells([...(rules.customSpellList ?? []), ...(rules.customSubclassSpellList ?? [])], g);
    const book = wizard ? await wizardBook(actor, id, g) : new Set();
    const mine = spellsOnSheet.filter((it) => {
      const c = classOfSpell(it);
      if (c) return c === id;
      return classes.length === 1 || listUuids.has(srcUuid(it));       // unassigned: a single-class actor's, or on this list
    }).filter((it) => !["innate", "atwill", "ritual"].includes(it.system?.method));   // granted, at will, Spell Book's ritual copies: not prepared
    // what may be prepared: a wizard's book (+ the class list's cantrips); anyone else the class list; always what is on the sheet
    const allowed = new Set();
    if (wizard) { for (const u of book) allowed.add(u); }
    else for (const u of listUuids) allowed.add(u);
    const meta = await describe([...allowed, ...(wizard ? listUuids : [])], g);
    if (wizard) for (const u of listUuids) if (meta.get(u)?.level === 0) allowed.add(u);
    const spells = new Map();
    for (const it of mine) {
      const u = srcUuid(it);
      spells.set(u, { uuid: u, name: it.name, img: it.img, level: Number(it.system?.level) || 0, ritual: hasProp(it.system?.properties, "ritual"),
        concentration: hasProp(it.system?.properties, "concentration"), itemId: it.id, prepared: Number(it.system?.prepared) || 0 });
    }
    for (const u of allowed) {
      if (spells.has(u)) continue;
      const m = meta.get(u); if (!m) continue;
      spells.set(u, { uuid: u, name: m.name, img: m.img, level: m.level, ritual: hasProp(m.properties, "ritual"), concentration: hasProp(m.properties, "concentration"), itemId: null, prepared: 0 });
    }
    const rec = actor.flags?.[MC]?.prepare?.[id];
    const levels = Number(cls.system?.levels) || 0;
    out.push({ id, name: cls.name, wizard, levels,
      max: preparedMax(cls, rules), cantripMax: cantripMax(actor.system?.scale?.[id], keysCsv, rules),
      spellSwap: rules.spellSwapping ?? SWAP.NONE, cantripSwap: rules.cantripSwapping ?? SWAP.NONE,
      swapsOpen: swapOpen(rec, rules.spellSwapping, levels),
      listSet: wizard ? true : listUuids.size > 0,
      spells: [...spells.values()] });
  }
  return { ok: true, actorId: actor.id, inCombat, over, classes: out };
}

/**
 * Write a save (the executor answers the phone's `prepareSave`). The plan is recomputed HERE from fresh data and the
 * phone's picks, so a stale or crafted phone payload cannot write what the rules would not.
 */
export async function savePrepare(actor, classId, picksObj, g = globalThis) {
  const data = await gatherPrepare(actor, g);
  if (data.inCombat) return { ok: false, reason: "Not during a fight" };
  const cls = data.classes.find((c) => c.id === classId);
  if (!cls) return { ok: false, reason: "That class casts no spells" };
  const picks = new Map();
  for (const [u, on] of Object.entries(picksObj ?? {})) {
    const s = cls.spells.find((x) => x.uuid === u);
    if (!s || on === wasOn(s)) continue;                                       // unknown spell or no change: ignored
    const t = canToggle(cls, s, new Map(), {});
    if (!t.ok && !on) return { ok: false, reason: `${s.name}: ${t.why}` };                // a swap out the rules don't allow now
    picks.set(u, Boolean(on));
  }
  const st = saveState(cls, picks, { over: data.over });
  if (!st.ok) return { ok: false, reason: st.why };
  const plan = planSave(cls, picks);
  await applyPlan(actor, cls, plan, g);
  return { ok: true, updated: plan.update.length, created: plan.create.length, warned: Boolean(st.warn), prepared: cls.spells.filter((s) => isOn(s, picks) && s.level > 0).length };
}

/** Apply a plan: flip `prepared`, create from the compendium, keep Spell Book's flag in step, close the window. Never deletes. */
export async function applyPlan(actor, cls, plan, g = globalThis) {
  if (plan.update.length) await actor.updateEmbeddedDocuments("Item", plan.update.map((u) => ({ _id: u.itemId, "system.prepared": u.prepared })));
  const create = [];
  for (const c of plan.create) {
    let src; try { src = await g.fromUuid(c.uuid); } catch (e) { src = null; }
    if (!src) continue;
    const data = await g.game.items.fromCompendium(src);
    data.system = { ...(data.system ?? {}), method: "spell", prepared: c.level > 0 ? 1 : 0, sourceItem: `class:${cls.id}` };
    create.push(data);
  }
  if (create.length) await actor.createEmbeddedDocuments("Item", create);
  const byClass = { ...(actor.flags?.[SB]?.preparedSpellsByClass ?? {}) };
  byClass[cls.id] = plan.keys;
  const rec = actor.flags?.[MC]?.prepare?.[cls.id];
  await actor.update({
    [`flags.${SB}.preparedSpellsByClass`]: byClass,
    [`flags.${MC}.prepare.${cls.id}`]: { open: plan.swappedOut ? false : Boolean(rec ? rec.open : false), level: Number(cls.levels) || 0 },
  });
}

/** After a long rest: open the window of every class whose swap rule is the long rest (dnd5e.restCompleted). */
export async function openWindowsAfterRest(actor, result, g = globalThis) {
  if (!result?.longRest || !actor?.isOwner) return false;
  const patch = {};
  for (const cls of casterClasses(actor)) {
    const id = cls.system.identifier;
    const rules = classRules(actor, id, g);
    if (rules.spellSwapping !== SWAP.LONG_REST && rules.cantripSwapping !== SWAP.LONG_REST) continue;
    patch[`flags.${MC}.prepare.${id}`] = { open: true, level: Number(cls.system?.levels) || 0 };
  }
  if (!Object.keys(patch).length) return false;
  await actor.update(patch);
  return true;
}

/** Is Spell Book's own long-rest swap prompt (a 450 px DialogV2) this app? The phone closes it and offers ours. */
export function isSpellBookRestPrompt(app) {
  const classes = app?.options?.classes ?? [];
  const icon = String(app?.options?.window?.icon ?? "");
  return classes.includes(SB) && icon.includes("fa-bed");
}
