// PREPARE SPELLS ON THE PHONE — THE RULES (DM 2026-11-13: "BUILD option (b)", our own small screen instead of Spell
// Book's 512 px window; deck-command DECISIONS D-0106, DESIGN §56). Pure: no `game`. The executor gathers what Spell
// Book has set up for the character (prepare-data.js); this decides what the screen shows and what a save writes.
//
//   - only spells the character may prepare: the class list, or for a Wizard the spellbook alone
//   - limits from Spell Book's rules, "Prepared x / max"; too many picks WARN (as Spell Book does) unless the world
//     setting says block
//   - cantrips and levels grouped; filter chips for rituals and concentration
//   - swaps follow Spell Book's swap rule per class: a prepared spell can be swapped OUT only while the class's window
//     is open (after a long rest, or at a new level, by that rule); filling a free place is always allowed
//   - unticking unprepares and NEVER deletes (his ruling): a cantrip, which has no "prepared", cannot be unticked here
//
// Shapes. A class from the executor:
//   { id, name, wizard, max, cantripMax, spellSwap, cantripSwap, swapsOpen, cantripSwapsOpen, listSet, spells: [Spell] }
// A spell: { uuid, name, img, level, ritual, concentration, itemId|null, prepared: 0|1|2 }
// `picks`: Map<uuid, boolean>, the player's changes this session (absent = as it was).

export const SWAP = Object.freeze({ NONE: "none", LEVEL_UP: "levelUp", LONG_REST: "longRest" });
export const OVER = Object.freeze({ WARN: "warn", BLOCK: "block" });

/** Was this spell on (prepared, or for a cantrip: on the sheet) when the screen opened? */
export function wasOn(s) {
  if (!s) return false;
  if (Number(s.level) === 0) return Boolean(s.itemId);
  return Number(s.prepared) >= 1;
}
/** Is it on now, with the player's picks? */
export function isOn(s, picks) {
  const p = picks?.get?.(s.uuid);
  return typeof p === "boolean" ? p : wasOn(s);
}
const always = (s) => Number(s?.prepared) === 2;

/** The counts against the limits. Always-prepared spells don't count (dnd5e's rule); cantrips count apart. */
export function counts(cls, picks) {
  let spells = 0, cantrips = 0;
  for (const s of cls?.spells ?? []) {
    if (!isOn(s, picks) || always(s)) continue;
    if (Number(s.level) === 0) cantrips += 1; else spells += 1;
  }
  const max = Number(cls?.max) || 0, cmax = Number(cls?.cantripMax) || 0;
  return {
    spells: { cur: spells, max, over: max > 0 && spells > max },
    cantrips: { cur: cantrips, max: cmax, over: cmax > 0 && cantrips > cmax },
  };
}

const WINDOW_WHY = { [SWAP.LONG_REST]: "After a long rest", [SWAP.LEVEL_UP]: "At your next level", [SWAP.NONE]: "Kept for good" };

/**
 * May this spell's toggle change now? → { ok: true } | { ok: false, why }   (the why is the face's own words)
 * Turning ON is always allowed (a free place, or too many, which warns). Turning OFF something that was on at open is
 * a swap: it needs the class's window open. Turning off what you turned on this session is just changing your mind.
 */
export function canToggle(cls, s, picks, { inCombat = false } = {}) {
  if (inCombat) return { ok: false, why: "Not during a fight" };
  if (always(s)) return { ok: false, why: "Always prepared" };
  const on = isOn(s, picks);
  if (!on) return { ok: true };
  if (!wasOn(s)) return { ok: true };
  if (Number(s.level) === 0) return { ok: false, why: "Cantrips stay" };                 // never delete (his ruling)
  if (cls?.swapsOpen) return { ok: true };
  return { ok: false, why: WINDOW_WHY[cls?.spellSwap] ?? WINDOW_WHY[SWAP.LONG_REST] };
}

/** The filter chips: none on → everything; otherwise a spell matching ANY chip that is on. */
export function passes(s, filters) {
  const f = filters instanceof Set ? filters : new Set(filters ?? []);
  if (!f.size) return true;
  return (f.has("ritual") && Boolean(s.ritual)) || (f.has("concentration") && Boolean(s.concentration));
}

/**
 * What the screen draws for one class: groups by level (cantrips first), each row with its state.
 * @returns {{ groups: { level, label, rows: object[] }[], counts, empty: string|null }}
 */
export function view(cls, picks, { filters = [], inCombat = false } = {}) {
  const byLevel = new Map();
  for (const s of cls?.spells ?? []) {
    if (Number(s.level) === 0 && !(Number(cls?.cantripMax) > 0) && !s.itemId) continue; // no cantrips for this class
    if (!passes(s, filters)) continue;
    const t = canToggle(cls, s, picks, { inCombat });
    const row = { uuid: s.uuid, name: s.name, img: s.img, level: Number(s.level) || 0, ritual: !!s.ritual, concentration: !!s.concentration,
      on: isOn(s, picks), locked: !t.ok, why: t.ok ? null : t.why };
    if (!byLevel.has(row.level)) byLevel.set(row.level, []);
    byLevel.get(row.level).push(row);
  }
  const groups = [...byLevel.entries()].sort((a, b) => a[0] - b[0])
    .map(([level, rows]) => ({ level, label: levelLabel(level), rows: rows.sort((a, b) => String(a.name).localeCompare(String(b.name))) }));
  const empty = groups.length ? null : (cls?.listSet === false
    ? "No spell list is set for this class yet. The DM sets it in Spell Book."
    : (filters?.size ?? filters?.length) ? "Nothing here matches the filter." : "No spells to prepare.");
  return { groups, counts: counts(cls, picks), empty };
}

export function levelLabel(level) {
  const n = Number(level) || 0;
  if (n === 0) return "Cantrips";
  const s = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n}${s} level`;
}

/** Can the save go through? Over the limit warns (Save Anyway) unless the world says block. */
export function saveState(cls, picks, { over = OVER.WARN, inCombat = false } = {}) {
  if (inCombat) return { ok: false, label: "Save", why: "Not during a fight" };
  const c = counts(cls, picks);
  const tooMany = c.spells.over || c.cantrips.over;
  if (tooMany && over === OVER.BLOCK) return { ok: false, label: "Save", why: "Too many prepared — untick one" };
  return { ok: true, label: tooMany ? "Save Anyway" : "Save", warn: tooMany };
}

/**
 * What a save writes, for the executor to apply (prepare-data.js applyPlan). NEVER a delete.
 *   update:  [{ itemId, prepared: 0|1 }]          spells on the sheet whose prepared flips
 *   create:  [{ uuid, level }]                      ticked spells not on the sheet yet (from the list or the book)
 *   keys:    ["<class>:<uuid>"]                     Spell Book's preparedSpellsByClass for this class, kept in step
 *   swappedOut: true when a spell prepared at open was unticked (closes the class's swap window)
 */
export function planSave(cls, picks) {
  const update = [], create = [], keys = [];
  let swappedOut = false;
  for (const s of cls?.spells ?? []) {
    const on = isOn(s, picks), was = wasOn(s);
    if (on && !always(s)) keys.push(`${cls.id}:${s.uuid}`);
    if (on === was || always(s)) continue;
    if (Number(s.level) === 0) { if (on && !s.itemId) create.push({ uuid: s.uuid, level: 0 }); continue; }
    if (s.itemId) update.push({ itemId: s.itemId, prepared: on ? 1 : 0 });
    else if (on) create.push({ uuid: s.uuid, level: Number(s.level) || 1 });
    if (was && !on) swappedOut = true;
  }
  return { classId: cls?.id ?? null, update, create, keys, swappedOut };
}

/** Anything to save? */
export const hasChanges = (plan) => Boolean(plan && (plan.update.length || plan.create.length));
