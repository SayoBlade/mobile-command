// ── §17 Downtime — data model + Rule engine (DM 2026-07-13 redesign) ──────────
//
// The redesign (DESIGN.md §17.7): downtime is a DM-narrated, fragmented experience,
// not a point-budget planner. Two objects:
//
//   Activity — a player's NAMED, reusable pursuit ("Learn Elvish", "Nightly pushups").
//              Persists across windows; carries its own progress. The player authors
//              the name + a free-text plan; the DM attaches the Rule.
//
//   Rule     — the DM-authored mechanics (the "formula"), attached to an Activity and
//              activated. One of three engine TYPES (below). The player may or may not
//              see it (per-Activity `visible` flag; DCs/targets are DM-only otherwise).
//
// This module is PURE (no Foundry globals) so the whole engine is unit-testable via
// Electron-as-node. Foundry-specific bits (resolving a tool's bonus, listing the PC's
// scrolls, pushing a roll request) live in the UI/relay layer and pass plain values in.
//
// Rule TYPES — these cover every scenario the DM raised:
//   "roll"       — one check vs a DC; optional auto-shift ("lower DC by 2 each attempt").
//                  → a backflip, arm-wrestle, or Learn Elvish (DC 100 → 20 over nights).
//   "tally"      — a running count toward a target; +perTick each qualifying tick
//                  (per attempt / day / rest / short slice), optionally gated on a roll.
//                  → 100 nights of pushups → +1 STR.
//   "cumulative" — each attempt adds the roll's total (or margin, or a fixed amount)
//                  toward a points target; min 1 always forward; optional crit bonus.
//                  → research a spell, craft a magic item, tiered lore (Draw Steel model).

export const RULE_TYPES = ["roll", "tally", "cumulative"];
export const TICK_SOURCES = ["attempt", "day", "rest", "slice"]; // when a tally/cumulative advances
export const GAIN_MODES = ["fixed", "total", "margin"];          // how much a tick adds
export const RULE_KINDS = ["freestyle", "scribe", "craft"];      // authoring-preset hint (informational)
export const WINDOW_SIZES = ["short", "long"];                   // short = a slice (~1/5 day); long = a day+ / hub

// A blank Rule of the given type. `kind` is just an authoring hint (drives which preset
// seeded the defaults); the engine only branches on `type`.
export function defaultRule(type = "roll", kind = "freestyle") {
  const base = { type, kind, reward: "", roll: blankRoll() };
  if (type === "roll") return { ...base, dc: 15, autoShift: 0, autoShiftFloor: null };
  if (type === "tally") return { ...base, target: 10, tickSource: "day", perTick: 1, requireRoll: false, dc: 15 };
  if (type === "cumulative") return { ...base, target: 100, tickSource: "attempt", gainMode: "total", perTick: 5, minGain: 1, critBonus: true, dc: 10 };
  return base;
}
function blankRoll() {
  // Exactly one of ability/skill/save/tool identifies the d20 flavour; `formula` (raw
  // dice like "1d20+5") overrides all of them when set. null everywhere = the DM will
  // narrate the roll / it's a no-roll tally. `label` is the UI-resolved display noun
  // ("Dexterity", "Acrobatics", "Thieves' Tools") the DM's client fills from CONFIG so
  // this pure module never needs the dnd5e label tables.
  return { ability: null, skill: null, save: null, tool: null, formula: null, label: null };
}
const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
function article(word) { return /^[aeiou]/i.test(String(word || "")) ? "an" : "a"; }
// The plain noun for a roll ("Dexterity", "Acrobatics", "Constitution", "Smith's Tools",
// "2d6") — no "check"/"save" suffix (the caller adds it). Prefers the UI-resolved label.
export function rollFlavor(roll) {
  if (!roll) return "a check";
  if (roll.label) return roll.label;
  if (roll.formula) return roll.formula;
  if (roll.ability) return ABILITY_NAMES[roll.ability] || String(roll.ability).toUpperCase();
  if (roll.skill) return String(roll.skill).toUpperCase();
  if (roll.save) return ABILITY_NAMES[roll.save] || String(roll.save).toUpperCase();
  if (roll.tool) return roll.tool;
  return "a check";
}

// Fresh progress for a newly-activated Rule. `dc` is copied so a "roll" type can shift its
// own working DC without mutating the Rule; `startDc` is kept so the UI can show the drop.
export function initProgress(rule) {
  return { attempts: 0, dc: Number(rule?.dc ?? 0), startDc: Number(rule?.dc ?? 0), count: 0, done: false };
}

// Does this Rule need a pushed d20 roll to advance (vs. a no-roll auto tick)?
export function needsRoll(rule) {
  if (!rule) return false;
  if (rule.type === "roll") return true;
  if (rule.type === "cumulative") return rule.gainMode !== "fixed"; // fixed cumulative can auto-tick
  if (rule.type === "tally") return !!rule.requireRoll;
  return false;
}

// Apply one attempt to a progress state and return a NEW progress + a report. `outcome` is
// { total, nat } from a pushed roll (nat = the natural d20 face, for crits) or null for a
// no-roll auto tick. Never mutates its inputs. `delta` is the change to the tracked value;
// `note` is a short DM-feed line.
export function applyAttempt(rule, progress, outcome = null) {
  const p = { ...progress };
  const total = outcome ? Number(outcome.total) || 0 : 0;
  const nat = outcome ? outcome.nat : null;
  p.attempts = (Number(p.attempts) || 0) + 1;

  if (rule.type === "roll") {
    // "Double on 20" → a nat 20 always succeeds; "None on 1" → a nat 1 always misses.
    const critHit = rule.critBonus && nat === 20;
    const critMiss = rule.fumbleZero && nat === 1;
    const success = critHit || (!critMiss && total >= p.dc);
    if (success) { p.done = true; return { progress: p, completed: true, delta: 0, note: critHit ? `Nat 20 — success!` : `Success vs DC ${p.dc} (rolled ${total}).` }; }
    // Miss → shift the working DC by autoShift (negative lowers), clamped at the floor.
    const shift = Number(rule.autoShift) || 0;
    let dc = p.dc + shift;
    if (rule.autoShiftFloor != null) dc = shift < 0 ? Math.max(rule.autoShiftFloor, dc) : Math.min(rule.autoShiftFloor, dc);
    p.dc = dc;
    const missWhy = critMiss ? "Nat 1 — miss" : `Missed (rolled ${total})`;
    return { progress: p, completed: false, delta: 0, note: shift ? `${missWhy}. DC now ${dc}.` : `${missWhy} vs DC ${p.dc}.` };
  }

  if (rule.type === "tally") {
    let gain = Number(rule.perTick) || 1;
    if (rule.requireRoll) {
      if (rule.fumbleZero && nat === 1) return { progress: p, completed: false, delta: 0, note: `Nat 1 — no progress.` };
      if (total < Number(rule.dc || 0)) return { progress: p, completed: false, delta: 0, note: `No progress (rolled ${total} vs DC ${rule.dc}).` };
      if (rule.critBonus && nat === 20) gain *= 2; // "Double on 20"
    }
    p.count = Math.min(Number(rule.target) || 0, (Number(p.count) || 0) + gain);
    p.done = p.count >= (Number(rule.target) || 0);
    const critNote = rule.requireRoll && rule.critBonus && nat === 20 ? " (nat 20 ×2)" : "";
    return { progress: p, completed: p.done, delta: gain, note: `+${gain}${critNote} → ${p.count}/${rule.target}${p.done ? " — complete!" : ""}` };
  }

  if (rule.type === "cumulative") {
    let base;
    if (rule.gainMode === "total") base = total;
    else if (rule.gainMode === "margin") base = total - Number(rule.dc || 0);
    else base = Number(rule.perTick) || 1;
    let gain;
    if (rule.fumbleZero && nat === 1) gain = 0; // "None on 1" — overrides the min-forward floor
    else {
      gain = Math.max(Number(rule.minGain ?? 1), base); // never zero — always forward
      if (rule.critBonus && nat === 20) gain += Math.max(Number(rule.minGain ?? 1), base); // "Double on 20"
    }
    p.count = Math.min(Number(rule.target) || 0, (Number(p.count) || 0) + gain);
    p.done = p.count >= (Number(rule.target) || 0);
    const luckNote = (rule.fumbleZero && nat === 1) ? " (nat 1)" : (rule.critBonus && nat === 20) ? " (nat 20 ×2)" : "";
    return { progress: p, completed: p.done, delta: gain, note: `+${gain}${luckNote} → ${p.count}/${rule.target}${p.done ? " — complete!" : ""}` };
  }

  return { progress: p, completed: false, delta: 0, note: "No rule." };
}

// DM manual adjustment (the "tutor lump", "worth 5 nights", or a correction). Positive or
// negative. For "roll" types delta shifts the working DC; for tally/cumulative it moves the count.
export function adjustProgress(rule, progress, delta) {
  const p = { ...progress };
  const d = Number(delta) || 0;
  if (rule.type === "roll") { p.dc = p.dc + d; return p; }
  p.count = Math.max(0, Math.min(Number(rule.target) || 0, (Number(p.count) || 0) + d));
  p.done = p.count >= (Number(rule.target) || 0);
  return p;
}

export function isComplete(rule, progress) {
  if (!rule || !progress) return false;
  if (rule.type === "roll") return !!progress.done;
  return (Number(progress.count) || 0) >= (Number(rule.target) || 0);
}

// A display summary for a progress bar / label. ratio is 0..1 for tally/cumulative, null for
// "roll" (no bar — it's a shifting DC). headline/detail are DM-facing (full numbers).
export function progressSummary(rule, progress) {
  if (!rule || !progress) return { headline: "", detail: "", ratio: null };
  if (rule.type === "roll") {
    return { headline: progress.done ? "Done" : `DC ${progress.dc}`, detail: `${progress.attempts} attempt${progress.attempts === 1 ? "" : "s"}`, ratio: null };
  }
  const target = Number(rule.target) || 0;
  const count = Number(progress.count) || 0;
  return { headline: `${count}/${target}`, detail: `${progress.attempts} attempt${progress.attempts === 1 ? "" : "s"}`, ratio: target > 0 ? Math.max(0, Math.min(1, count / target)) : null };
}

// The "double on 20 / none on 1" d20-luck suffix, shown only when the Rule involves a roll.
function luckSuffix(rule) {
  if (!needsRoll(rule)) return "";
  const parts = [];
  if (rule.critBonus) parts.push("×2 on 20");
  if (rule.fumbleZero) parts.push("0 on 1");
  return parts.length ? ` · ${parts.join(", ")}` : "";
}
// A one-line DM-facing description of the Rule's mechanics (for the authoring/summary view).
export function describeRule(rule) {
  if (!rule) return "No rule yet";
  const r = rollLabel(rule.roll);
  if (rule.type === "roll") {
    const shift = Number(rule.autoShift) || 0;
    const shiftTxt = shift ? `, ${shift < 0 ? "−" : "+"}${Math.abs(shift)} DC each try` : "";
    return `${r} vs DC ${rule.dc}${shiftTxt}${luckSuffix(rule)}`;
  }
  if (rule.type === "tally") {
    const gate = rule.requireRoll ? ` on ${r} vs DC ${rule.dc}` : "";
    return `Tally to ${rule.target}, +${rule.perTick} per ${rule.tickSource}${gate}${luckSuffix(rule)}`;
  }
  if (rule.type === "cumulative") {
    const g = rule.gainMode === "total" ? `${r} total` : rule.gainMode === "margin" ? `${r} margin over DC ${rule.dc}` : `+${rule.perTick}`;
    return `Cumulative to ${rule.target}, add ${g} per ${rule.tickSource} (min ${rule.minGain ?? 1})${luckSuffix(rule)}`;
  }
  return "Unknown rule";
}
export function rollLabel(roll) {
  if (!roll) return "a roll";
  if (roll.label) return roll.label;
  if (roll.formula) return roll.formula;
  if (roll.skill) return `${String(roll.skill).toUpperCase()} (skill)`;
  if (roll.save) return `${String(roll.save).toUpperCase()} save`;
  if (roll.tool) return `${roll.tool} check`;
  if (roll.ability) return `${String(roll.ability).toUpperCase()} check`;
  return "a roll";
}

// What the PLAYER sees for a Rule, honouring the DM's per-Activity `visible` toggle. Same
// Rule, two faces (DM 2026-07-13): hidden → a bare "Roll a Dexterity check" button (no
// numbers); shown → "Roll a DC 50 Dexterity check" + a note ("−1 DC each miss" / "18/150").
// Returns { button, note }; button is null when the Rule advances with no player roll (a
// no-roll tally the DM ticks). The DM always sees the full mechanics via describeRule().
export function playerRuleView(rule, progress, visible) {
  if (!rule) return { button: null, note: "" };
  if (!needsRoll(rule)) return { button: null, note: visible ? progressSummary(rule, progress).headline : "" };
  const flavor = rollFlavor(rule.roll);
  const dc = rule.type === "roll" ? (progress?.dc ?? rule.dc) : rule.dc;
  let button;
  if (rule.roll?.formula) button = visible && dc != null ? `Roll ${flavor} vs DC ${dc}` : `Roll ${flavor}`;
  else {
    const kind = rule.roll?.save ? "save" : "check";
    // "a DC …" always (D reads as a consonant); otherwise a/an by the flavour word.
    button = (visible && dc != null) ? `Roll a DC ${dc} ${flavor} ${kind}` : `Roll ${article(flavor)} ${flavor} ${kind}`;
  }
  let note = "";
  if (visible) {
    if (rule.type === "roll" && Number(rule.autoShift)) note = `${rule.autoShift < 0 ? "−" : "+"}${Math.abs(rule.autoShift)} DC each miss`;
    else if (rule.type !== "roll") note = progressSummary(rule, progress).headline;
  }
  return { button, note };
}

// ── Preset suggestions (pure data; the UI seeds these into a Rule the DM can tweak) ──

// XanatharsGuide spell-scroll scribing: time (days) + cost (gp) by spell level. The natural
// Rule is a per-day tally to `days` with the reward = "Scroll of <spell>". Materials/GP is a
// DM-only suggestion the DM may or may not gate on.
const SCROLL_TABLE = {
  0: { days: 1, gp: 15 }, 1: { days: 1, gp: 25 }, 2: { days: 3, gp: 250 },
  3: { days: 5, gp: 500 }, 4: { days: 10, gp: 2500 }, 5: { days: 25, gp: 5000 },
  6: { days: 40, gp: 15000 }, 7: { days: 60, gp: 25000 }, 8: { days: 90, gp: 50000 },
  9: { days: 120, gp: 250000 }
};
export function scribeScrollSuggest(level, spellName = "") {
  const lvl = Math.max(0, Math.min(9, Number(level) || 0));
  const t = SCROLL_TABLE[lvl];
  const rule = defaultRule("tally", "scribe");
  rule.target = t.days; rule.tickSource = "day"; rule.perTick = 1; rule.requireRoll = false;
  rule.reward = spellName ? `Scroll of ${spellName}` : "The finished scroll";
  return { days: t.days, gp: t.gp, level: lvl, rule };
}

// PHB crafting: 5 gp of item value produced per day; materials = half the market value. The
// natural Rule is a per-day tally to the day-count; the DM can switch it to a tool-check
// cumulative if they want rolls to matter.
export function craftSuggest(itemValueGp, toolKey = null, itemName = "") {
  const value = Math.max(0, Number(itemValueGp) || 0);
  const days = Math.max(1, Math.ceil(value / 5));
  const rule = defaultRule("tally", "craft");
  rule.target = days; rule.tickSource = "day"; rule.perTick = 1; rule.requireRoll = false;
  if (toolKey) rule.roll = { ...blankRoll(), tool: toolKey };
  rule.reward = itemName ? itemName : "The finished item";
  return { days, gpMaterials: Math.floor(value / 2), rule };
}

// ── Shared world state — pure transforms (thin relay wrappers call these) ──────────────
//
// Shape (world setting `downtimeState`):
//   { window: { open, size, id } | null,
//     activities: { [actorId]: [ Activity, ... ] } }   // persistent across windows
//
// Activity: { id, name, plan, rule|null, progress|null, visible:bool, status, reward, createdBy }

export function normalizeState(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    window: s.window && typeof s.window === "object" ? { open: !!s.window.open, size: s.window.size === "long" ? "long" : "short", id: String(s.window.id || "") } : null,
    activities: s.activities && typeof s.activities === "object" ? s.activities : {},
    actorSettings: s.actorSettings && typeof s.actorSettings === "object" ? s.actorSettings : {}
  };
}

// Per-character gear settings — rare, hidden behind a gear icon (DM 2026-07-13). `bonusActivities`
// is the "doesn't sleep" case (a race trait or undocumented backstory ability): extra Activities
// this PC may pursue per beat beyond the base. `showMechanicsByDefault` seeds the DM's show/hide
// toggle when authoring a Rule for this PC (a per-player crunch preference).
export const ACTOR_SETTINGS_DEFAULT = { bonusActivities: 0, showMechanicsByDefault: false };
export const WINDOW_SLOTS = { short: 1, long: 1 }; // base Activities per beat by window size (soft guide; DM dictates)
export function getActorSettings(state, actorId) {
  return { ...ACTOR_SETTINGS_DEFAULT, ...(normalizeState(state).actorSettings[actorId] || {}) };
}
export function setActorSetting(state, actorId, key, value) {
  const s = normalizeState(state);
  const cur = { ...ACTOR_SETTINGS_DEFAULT, ...(s.actorSettings[actorId] || {}) };
  cur[key] = value;
  return { ...s, actorSettings: { ...s.actorSettings, [actorId]: cur } };
}
// Soft guide for how many Activities a PC can juggle in a beat: base (by size) + the gear bonus.
export function slotsFor(size, settings) {
  const base = WINDOW_SLOTS[size === "long" ? "long" : "short"];
  return base + Math.max(0, Number(settings?.bonusActivities) || 0);
}
export function listActivities(state, actorId) {
  return (normalizeState(state).activities[actorId] || []).slice();
}
export function newActivity(name, plan, createdBy = "") {
  return { id: randId(), name: String(name || "Untitled").slice(0, 80), plan: String(plan || "").slice(0, 500),
    rule: null, progress: null, visible: false, status: "active", reward: "", createdBy };
}
// Insert or replace an Activity by id (immutably) and return the new state.
export function upsertActivity(state, actorId, activity) {
  const s = normalizeState(state);
  const list = (s.activities[actorId] || []).slice();
  const i = list.findIndex(a => a.id === activity.id);
  if (i >= 0) list[i] = activity; else list.push(activity);
  return { ...s, activities: { ...s.activities, [actorId]: list } };
}
export function removeActivity(state, actorId, id) {
  const s = normalizeState(state);
  const list = (s.activities[actorId] || []).filter(a => a.id !== id);
  return { ...s, activities: { ...s.activities, [actorId]: list } };
}
function mapActivity(state, actorId, id, fn) {
  const s = normalizeState(state);
  const list = (s.activities[actorId] || []).map(a => (a.id === id ? fn({ ...a }) : a));
  return { ...s, activities: { ...s.activities, [actorId]: list } };
}
// DM attaches/replaces a Rule and (re)initialises progress.
export function setRule(state, actorId, id, rule) {
  return mapActivity(state, actorId, id, a => ({ ...a, rule, progress: initProgress(rule), status: "active" }));
}
// Push an attempt outcome (or null) through the Activity's Rule.
export function applyAttemptTo(state, actorId, id, outcome) {
  return mapActivity(state, actorId, id, a => {
    if (!a.rule || !a.progress) return a;
    const res = applyAttempt(a.rule, a.progress, outcome);
    return { ...a, progress: res.progress, status: res.completed ? "complete" : a.status };
  });
}
export function adjustActivity(state, actorId, id, delta) {
  return mapActivity(state, actorId, id, a => {
    if (!a.rule || !a.progress) return a;
    const progress = adjustProgress(a.rule, a.progress, delta);
    return { ...a, progress, status: isComplete(a.rule, progress) ? "complete" : (a.status === "complete" ? "active" : a.status) };
  });
}
export function setVisible(state, actorId, id, visible) {
  return mapActivity(state, actorId, id, a => ({ ...a, visible: !!visible }));
}
export function openWindow(state, size, id) {
  const s = normalizeState(state);
  return { ...s, window: { open: true, size: size === "long" ? "long" : "short", id: String(id || randId()) } };
}
export function closeWindow(state) {
  const s = normalizeState(state);
  return { ...s, window: s.window ? { ...s.window, open: false } : null };
}

// Local id generator (avoids foundry.utils.randomID so the module stays framework-free /
// Node-testable). Not cryptographic — collision-safe enough for per-actor activity lists.
let _seq = 0;
function randId() {
  _seq = (_seq + 1) % 1e6;
  return "a" + _seq.toString(36) + "x" + (_seq * 2654435761 % 1e9).toString(36);
}
