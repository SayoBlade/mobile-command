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

// WHERE A CROSSING LEADS, IN THE DM'S WORDS (seat R6 finish 2026-11-12: the stairs read "cross to The Crooked House" on
// every floor). The scene's name without its number, and its parenthesis only when it names a part of the place:
// "10.2 Sleeper Car (Colored)" → "Sleeper Car"; "12.2 The Crooked House (Second Floor, Colored)" → "Second Floor".
// The map's style words (Colored, Gridless…) are not places.
const STYLE_WORDS = /^(colou?red|uncolou?red|gridless|gridded|grid|no grid|hd|4k)$/i;
export function placeName(sceneName) {
  const full = String(sceneName ?? "").trim();
  const m = /^(?:\d+(?:\.\d+)*\s+)?(.*?)\s*(?:\(([^)]*)\))?\s*$/.exec(full);
  const base = (m?.[1] ?? "").trim();
  const part = String(m?.[2] ?? "").split(",").map((w) => w.trim()).filter((w) => w && !STYLE_WORDS.test(w)).join(", ");
  return part || base || full;
}
