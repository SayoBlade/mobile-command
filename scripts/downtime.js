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
export const RULE_KINDS = ["freestyle", "scribe", "craft", "learn"]; // authoring-preset hint (informational)
export const WINDOW_SIZES = ["short", "long"];                   // short = a slice (~1/5 day); long = a day+ / hub

// A blank Rule of the given type. `kind` is just an authoring hint (drives which preset
// seeded the defaults); the engine only branches on `type`.
// nat20: "none" | "succeed" (auto-success) | "double" (double the DC step / gain)
// nat1:  "none" | "fail" (auto-miss)      | "zero"   (no DC step / no gain)
// The DM chooses per rule — auto-succeeding a DC 100 on a 1-in-20 makes no sense, but doubling
// the learning step does; for a simple check, auto-succeed is fine (DM 2026-07-13).
export function defaultRule(type = "roll", kind = "freestyle") {
  const base = { type, kind, reward: "", roll: blankRoll(), nat20: "none", nat1: "none" };
  if (type === "roll") return { ...base, dc: 15, autoShift: 0, autoShiftFloor: null };
  if (type === "tally") return { ...base, target: 10, tickSource: "day", perTick: 1, requireRoll: false, dc: 15 };
  if (type === "cumulative") return { ...base, target: 100, tickSource: "attempt", gainMode: "total", perTick: 5, minGain: 1, nat20: "double", dc: 10 };
  return base;
}
// Read the nat-20 / nat-1 mode, falling back to the old critBonus/fumbleZero booleans so rules
// authored before v0.1.156 still behave.
function nat20Mode(rule) { return rule?.nat20 ?? (rule?.critBonus ? (rule.type === "roll" ? "succeed" : "double") : "none"); }
function nat1Mode(rule) { return rule?.nat1 ?? (rule?.fumbleZero ? (rule.type === "roll" ? "fail" : "zero") : "none"); }
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
    const n20 = nat20Mode(rule), n1 = nat1Mode(rule);
    const autoSucceed = n20 === "succeed" && nat === 20;
    const autoMiss = n1 === "fail" && nat === 1;
    const success = autoSucceed || (!autoMiss && total >= p.dc);
    if (success) { p.done = true; return { progress: p, completed: true, delta: 0, note: autoSucceed ? `Nat 20 — success!` : `Success vs DC ${p.dc} (rolled ${total}).` }; }
    // Miss → shift the working DC. nat 20 "double" doubles the step (learns faster); nat 1 "zero"
    // wastes the night (no step). Clamp at the floor.
    let step = Number(rule.autoShift) || 0;
    if (n20 === "double" && nat === 20) step *= 2;
    if (n1 === "zero" && nat === 1) step = 0;
    let dc = p.dc + step;
    if (rule.autoShiftFloor != null) dc = step < 0 ? Math.max(rule.autoShiftFloor, dc) : (step > 0 ? Math.min(rule.autoShiftFloor, dc) : dc);
    p.dc = dc;
    const why = autoMiss ? "Nat 1 — miss" : `Missed (rolled ${total})`;
    const luck = (n20 === "double" && nat === 20) ? " (nat 20 ×2 step)" : (n1 === "zero" && nat === 1) ? " (nat 1 — no step)" : "";
    return { progress: p, completed: false, delta: 0, note: step ? `${why}${luck}. DC now ${dc}.` : `${why}${luck} vs DC ${p.dc}.` };
  }

  if (rule.type === "tally") {
    let gain = Number(rule.perTick) || 1;
    let critNote = "";
    if (rule.requireRoll) {
      const n20 = nat20Mode(rule), n1 = nat1Mode(rule);
      if ((n1 === "zero" || n1 === "fail") && nat === 1) return { progress: p, completed: false, delta: 0, note: `Nat 1 — no progress.` };
      if (total < Number(rule.dc || 0)) return { progress: p, completed: false, delta: 0, note: `No progress (rolled ${total} vs DC ${rule.dc}).` };
      if ((n20 === "double" || n20 === "succeed") && nat === 20) { gain *= 2; critNote = " (nat 20 ×2)"; }
    }
    p.count = Math.min(Number(rule.target) || 0, (Number(p.count) || 0) + gain);
    p.done = p.count >= (Number(rule.target) || 0);
    return { progress: p, completed: p.done, delta: gain, note: `+${gain}${critNote} → ${p.count}/${rule.target}${p.done ? " — complete!" : ""}` };
  }

  if (rule.type === "cumulative") {
    let base;
    if (rule.gainMode === "total") base = total;
    else if (rule.gainMode === "margin") base = total - Number(rule.dc || 0);
    else base = Number(rule.perTick) || 1;
    const n20 = nat20Mode(rule), n1 = nat1Mode(rule);
    let gain;
    if ((n1 === "zero" || n1 === "fail") && nat === 1) gain = 0; // nat 1 — overrides the min-forward floor
    else {
      gain = Math.max(Number(rule.minGain ?? 1), base); // never zero — always forward
      if ((n20 === "double" || n20 === "succeed") && nat === 20) gain += Math.max(Number(rule.minGain ?? 1), base);
    }
    p.count = Math.min(Number(rule.target) || 0, (Number(p.count) || 0) + gain);
    p.done = p.count >= (Number(rule.target) || 0);
    const luckNote = ((n1 === "zero" || n1 === "fail") && nat === 1) ? " (nat 1)" : ((n20 === "double" || n20 === "succeed") && nat === 20) ? " (nat 20 ×2)" : "";
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

// The nat-20 / nat-1 luck suffix, shown only when the Rule involves a roll.
function luckSuffix(rule) {
  if (!needsRoll(rule)) return "";
  const n20 = nat20Mode(rule), n1 = nat1Mode(rule);
  const parts = [];
  if (n20 === "succeed") parts.push("20 wins");
  else if (n20 === "double") parts.push("×2 on 20");
  if (n1 === "fail") parts.push("1 fails");
  else if (n1 === "zero") parts.push("0 on 1");
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

// PHB p.114 "Copying a Spell into the Book": 2 hours AND 50 gp per spell level; copying from a
// Spell Scroll consumes the scroll. No roll by RAW — it's pure time + money, so the natural Rule is
// a tally of `level` short slices (~2h each). The DM picks the LEVEL on the rule (a template is
// generic — it can't read a specific PC's scroll), and the form shows the derived hours/gp.
export function learnSpellSuggest(level, spellName = "") {
  const lvl = Math.max(1, Math.min(9, Number(level) || 1));
  const rule = defaultRule("tally", "learn");
  rule.target = lvl; rule.tickSource = "slice"; rule.perTick = 1; rule.requireRoll = false;
  rule.reward = spellName ? `${spellName} in your spellbook` : "The spell in your spellbook";
  rule._level = lvl;
  return { level: lvl, hours: 2 * lvl, gp: 50 * lvl, rule };
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
  const w = s.window && typeof s.window === "object"
    ? { open: !!s.window.open, size: s.window.size === "long" ? "long" : "short", id: String(s.window.id || ""), started: !!s.window.started }
    : null;
  return {
    window: w,
    templates: Array.isArray(s.templates) ? s.templates : [],
    activities: s.activities && typeof s.activities === "object" ? s.activities : {},
    actorSettings: s.actorSettings && typeof s.actorSettings === "object" ? s.actorSettings : {},
    selection: s.selection && typeof s.selection === "object" ? s.selection : {}
  };
}

// ── One activity per player, per downtime (DM 2026-07-14 simplification) ─────────────────────
// The player picks ONE activity from a dropdown; it shows on the DM's screen immediately (no
// player lock-in — the DM sees the choice, they talk it over, then the DM hits "Start activities").
// Picking REUSES an existing instance of the same template when the player has one, so a long-term
// goal (100 nights of pushups) keeps its progress across windows instead of restarting.
export function selectActivity(state, actorId, templateId) {
  let s = normalizeState(state);
  if (!templateId) return { ...s, selection: { ...s.selection, [actorId]: null } }; // "— nothing —"
  const existing = (s.activities[actorId] || []).find(a => a.templateId === templateId && a.status !== "complete");
  if (existing) return { ...s, selection: { ...s.selection, [actorId]: existing.id } };
  s = pickTemplate(s, actorId, templateId, "");
  const made = (s.activities[actorId] || []).filter(a => a.templateId === templateId).pop();
  return { ...s, selection: { ...s.selection, [actorId]: made?.id ?? null } };
}
export function selectedActivityId(state, actorId) { return normalizeState(state).selection[actorId] ?? null; }
export function selectedActivity(state, actorId) {
  const id = selectedActivityId(state, actorId);
  return id ? (normalizeState(state).activities[actorId] || []).find(a => a.id === id) ?? null : null;
}
// The DM commits the table's choices; rolls only fire once activities have started.
export function startActivities(state, on = true) {
  const s = normalizeState(state);
  return s.window ? { ...s, window: { ...s.window, started: !!on } } : s;
}
export function isStarted(state) { return !!normalizeState(state).window?.started; }

// ── Catalog of DM-authored templates (§17.7 redesign, DM 2026-07-13) ─────────────────────────
// The DM names an activity and gives it a Rule; it becomes a reusable Template. Players PICK a
// template (they don't free-create), which copies it into their own list as an independent
// instance with its own progress. The `note` is DM-only (balancing reminders, gold/time) and is
// never rendered player-side.
export function listTemplates(state) { return normalizeState(state).templates.slice(); }
export function newTemplate(name, createdBy = "") {
  return { id: randId(), name: String(name || "Untitled").slice(0, 80), note: "", rule: null, seed: false, createdBy };
}
export function upsertTemplate(state, template) {
  const s = normalizeState(state);
  const list = s.templates.slice();
  const i = list.findIndex(t => t.id === template.id);
  if (i >= 0) list[i] = template; else list.push(template);
  return { ...s, templates: list };
}
export function removeTemplate(state, id) {
  const s = normalizeState(state);
  return { ...s, templates: s.templates.filter(t => t.id !== id) };
}
function mapTemplate(state, id, fn) {
  const s = normalizeState(state);
  return { ...s, templates: s.templates.map(t => (t.id === id ? fn({ ...t }) : t)) };
}
export function setTemplateRule(state, id, rule) { return mapTemplate(state, id, t => ({ ...t, rule })); }
export function setTemplateNote(state, id, note) { return mapTemplate(state, id, t => ({ ...t, note: String(note || "") })); }
// Seed a few example templates the DM can edit/delete (a starting point, per DM 2026-07-13).
// Skips names that already exist so it's safe to call again.
export function seedTemplates(state, createdBy = "") {
  let s = normalizeState(state);
  const athl = { ability: null, skill: "ath", save: null, tool: null, formula: null, label: "Athletics" };
  const mk = (name, note, build) => { const t = newTemplate(name, createdBy); t.note = note; t.rule = build(); t.seed = true; return t; };
  const examples = [
    mk("Scribe a spell", "Pick the spell on the player's sheet; XGE sets the time/gp — charge it or not, your call.",
      () => { const r = defaultRule("tally", "scribe"); r.tickSource = "day"; r.reward = "The finished scroll"; return r; }),
    mk("Learn a spell from a scroll", "PHB: 2h + 50gp per spell level, and the scroll is consumed. Set the spell's level on the rule.",
      () => learnSpellSuggest(1).rule),
    mk("Teaching to use a Sword", "On a success, grant the student advantage on their next Learning roll (apply by hand).",
      () => { const r = defaultRule("roll"); r.dc = 15; r.roll = { ...athl }; return r; }),
    mk("Learning to use a Sword", "A group activity — pair with a teacher for advantage.",
      () => { const r = defaultRule("roll"); r.dc = 50; r.autoShift = -1; r.nat20 = "double"; r.nat1 = "zero"; r.roll = { ...athl }; r.reward = "Sword proficiency"; return r; }),
    mk("Nightly pushups", "Reward +1 STR at 100; a per-rest tally, no roll.",
      () => { const r = defaultRule("tally"); r.target = 100; r.tickSource = "rest"; r.perTick = 1; r.requireRoll = false; r.reward = "+1 STR"; return r; })
  ];
  for (const t of examples) if (!s.templates.some(x => x.name === t.name)) s = upsertTemplate(s, t);
  return s;
}

// A player (or the DM) picks a template → an independent instance is added to that actor's list.
export function pickTemplate(state, actorId, templateId, createdBy = "") {
  const s = normalizeState(state);
  const tmpl = s.templates.find(t => t.id === templateId);
  if (!tmpl) return s;
  const rule = tmpl.rule ? JSON.parse(JSON.stringify(tmpl.rule)) : null;
  const inst = {
    id: randId(), name: tmpl.name, note: tmpl.note || "", rule,
    progress: rule ? initProgress(rule) : null, visible: false, status: "active",
    reward: rule?.reward || "", createdBy, pending: false, templateId
  };
  return upsertActivity(s, actorId, inst);
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
    rule: null, progress: null, visible: false, status: "active", reward: "", createdBy, pending: false };
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
// DM push-roll: flag an Activity as awaiting the player's roll (the player's board then shows the
// roll button). Cleared automatically once an attempt is applied.
export function setPending(state, actorId, id, on) {
  return mapActivity(state, actorId, id, a => ({ ...a, pending: !!on }));
}
// Push an attempt outcome (or null) through the Activity's Rule; clears any pending push.
export function applyAttemptTo(state, actorId, id, outcome) {
  return mapActivity(state, actorId, id, a => {
    if (!a.rule || !a.progress) return a;
    const res = applyAttempt(a.rule, a.progress, outcome);
    return { ...a, progress: res.progress, pending: false, status: res.completed ? "complete" : a.status };
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
  // A fresh window starts un-started with nobody selected; instances (and their progress) persist.
  return { ...s, window: { open: true, size: size === "long" ? "long" : "short", id: String(id || randId()), started: false }, selection: {} };
}
export function closeWindow(state) {
  const s = normalizeState(state);
  return { ...s, window: s.window ? { ...s.window, open: false } : null };
}

// Local id generator (avoids foundry.utils.randomID so the module stays framework-free /
// Node-testable). A per-load random prefix makes ids unique ACROSS clients — otherwise a
// DM-created and a player-created Activity both started at "a1x…" and the upsert silently
// replaced one with the other (DM 2026-07-13: activities disappearing).
let _seq = 0;
const _idBase = Math.floor(Math.random() * 2176782336).toString(36); // 36^6
function randId() {
  _seq = (_seq + 1) % 1e6;
  return "a" + _idBase + "-" + _seq.toString(36);
}
