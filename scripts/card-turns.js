/**
 * ── THE CARDS TURN ONE AT A TIME (§38.4c; DM 2026-11-28 via deck-command D-0245, SEAT 51) ─────────────────────────────────────
 * A hero built in Hero Mancer arrives whole: nothing exists until the DM approves it, then every card it has is new at once.
 * So that the table still gets a little ceremony, a card that newly has a face on a board already up turns on its own beat:
 * a seat's new cards in the hand's order (species → background → class → abilities → spells → gear), TURN_GAP_MS apart, the
 * first TURN_LEAD_MS after it arrives. What was already face up when the board went up (a reload, a raise) is simply shown.
 * Also the rule for the two cards Mobile Command's own wizard used to gate (wizAbilitiesDone / wizGearDone): a character
 * finished elsewhere (no `charGen` in progress, a class taken) shows them from its sheet when the data is there.
 * Pure, no imports: tests load it bare.
 */
export const TURN_ORDER = ["species", "background", "class", "abilities", "spells", "gear"];
export const TURN_GAP_MS = 650;
export const TURN_LEAD_MS = 250;

/** One face on one seat: what makes a turn new (another character, or another item on that card, is a new face). */
export function faceKey(seatId, actorId, step, name) { return `${seatId}|${actorId ?? ""}|${step}|${name ?? ""}`; }

/**
 * Which faces turn, and when. `faces` = [{ seat, step, key }] as the board stands now; `seen` (a Set, updated) = the faces
 * already shown; `seatNext` (a Map, updated) = when each seat may next turn a card; `primed` false = the board's first paint
 * (everything is simply shown). → [{ key, at }].
 */
export function planTurns({ faces = [], seen, seatNext, now = 0, primed = true }) {
  if (!primed) { for (const f of faces) seen.add(f.key); return []; }
  const rank = (s) => { const i = TURN_ORDER.indexOf(s); return i < 0 ? TURN_ORDER.length : i; };
  const fresh = faces.filter((f) => !seen.has(f.key))
    .sort((a, b) => (a.seat === b.seat ? rank(a.step) - rank(b.step) : String(a.seat).localeCompare(String(b.seat))));
  const turns = [];
  for (const f of fresh) {
    seen.add(f.key);
    const at = Math.max(now + TURN_LEAD_MS, seatNext.get(f.seat) ?? 0);
    seatNext.set(f.seat, at + TURN_GAP_MS);
    turns.push({ key: f.key, at });
  }
  return turns;
}

/** A character finished outside Mobile Command's wizard (Hero Mancer, the sheet): not mid-build, with a class. */
export function builtElsewhere({ building = false, hasClass = false } = {}) { return !building && hasClass; }

/** Real scores: any ability off dnd5e's blank 10. All tens (or none) = not set yet. `abilities` = { str: { value }, … }. */
export function scoresSet(abilities = {}) {
  const v = Object.values(abilities ?? {}).map((a) => Number(a?.value));
  return v.some((n) => Number.isFinite(n) && n !== 10);
}
