// WHO IS CROSSING, ON THE DM'S ANSWER (lead 2026-11-12, section W: "Move Test" on every hero, because the key took the
// first word of the name and every test hero is "Test …"). The full name when it fits; else the first word of it that
// no other hero's name shares ("Barbarian", never the shared "Test"); else the full name, which the key shrinks.
// Pure: no `game`.
export const CROSSING_NAME_MAX = 12; // "Move " + 12 characters is two short lines on a deck key

export function crossingName(name, others = [], { max = CROSSING_NAME_MAX } = {}) {
  const full = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!full) return "Them";
  if (full.length <= max) return full;
  const words = (n) => String(n ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const taken = new Set(others.filter((o) => String(o ?? "").trim() && String(o).trim() !== full).flatMap(words));
  const own = full.split(" ");
  return own.find((w) => !taken.has(w.toLowerCase())) ?? full;
}

/** The other heroes' names, from the world: every player-owned character but this one. */
export function otherHeroNames(actorId, g = globalThis.game) {
  try {
    return (g?.actors ?? []).filter((a) => a?.type === "character" && a.id !== actorId && a.hasPlayerOwner).map((a) => a.name);
  } catch (e) { return []; }
}
