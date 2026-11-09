/**
 * ── TRAVEL TAKES THE BOOK'S TIME, BY ROUTE (DM 2026-11-09, deck-command MC-PATCHES T2) ───────────────────────────
 *
 * *"Let's go with time and not miles for travel (leave miles for dm) and let's set times based on the book
 * description."* Wickermoor Hollow's grid is the module's default (100 px = 5 ft), so measured miles were ~0 and the
 * walk took no time (ledger 0ᵠ / T1). Now a drawn road is a ROUTE: the pin the party leaves (nearest to the road's
 * start) and the pin it is drawn to (nearest to its end); its time is the book's, not the line's length.
 *
 * The book (quoted in MC-PATCHES T2): Ch 11 "Going to Town": the wreck to the village is "four hours"; Ch 9 "Running the
 * Adventure": "most of the areas throughout the valley are a three-to-five night trek from Wickermoor Village …
 * Exceptions … Foxwillow and Maidenmist Cemetery, which are a one-to-two night walk." It measures only FROM THE VILLAGE.
 *
 * A time is `{ hours: n }` or `{ nights: [min, max] }`; `null` = the book gives none (no time shown; the DM's pace and
 * miles stand). Pure: tools/test-travel-times.mjs runs it headless.
 */

export const HOLLOW_SCENE = "W1Kw4TXP0Mw9zVMw";
export const VILLAGE_PIN = "fp7SS6QSmuJKRUKt"; // Chap 11 Wickermoor Village

/** From (and back to) the village, by the other pin's Note id on Wickermoor Hollow. Data, one row per pin. */
export const BOOK_TIMES = Object.freeze({
  GGOOtwS040uDV95D: { hours: 4 },       // Chap 10 The Ghostlight Express: Ch 11 "four hours"
  uUEd2cmoalleiE91: { nights: [1, 2] }, // Chap 13 Fields of the Crow (Foxwillow): Ch 9 exception
  uiuqih19BNSbMcWS: { nights: [1, 2] }, // Chap 19 Maidenmist Cemetery: Ch 9 exception
  atxNfGVTBDHcuekR: { nights: [3, 5] }, // Chap 14 Crimson Monastery
  haimRSHVS9MOVYJg: { nights: [3, 5] }, // Chap 15 Drowned Crossroads
  ZYMMZ0vJ3IkrWz1h: { nights: [3, 5] }, // Chap 16 Skitterdeep Mine
  Ti8GMcjUHag7Aicq: { nights: [3, 5] }, // Chap 17 Memory's Rest
  WhdvDjPBO39Ul6GV: { nights: [3, 5] }, // Chap 18 Hartsblight Forest
  "4CGate3VkKrjuKq4": { nights: [3, 5] }, // Chap 20 The Roving Rookery
  cgOZbUXvfMdbYa6l: { nights: [3, 5] }, // Chap 23 Wicker's Vigil
  F9mWZrE8nHKcjTJp: { nights: [3, 5] }, // Chap 24 The Crooked Tree
  N4oqjvgh1JRR1por: null,               // Chap 12 The Crooked House: the book gives no time (his to set)
  U4Rj4fYVfRJ8aVYS: null,               // Chap 21 Fool's Day: none
  "9ZxcQAzfIMns37Iv": null,             // Chap 22 The Crooked Nightmare: none
});

/** How close (px) a road's end must come to a pin to be "at" it. The NEAREST pin always wins (the Hollow's closest two
 *  are 104 px apart), so this only says "too far from any pin": the party drops by a pin, not on it. */
export const PIN_SNAP_PX = 150;

/**
 * The book's time for a route between two pins, or null. The village is one end (the book measures from it), either
 * direction. A scene's `flags.mobile-command.travelTimes` (pin id → time, or null) overrides a row: his edit, no code.
 */
export function routeTime(fromPin, toPin, overrides = {}) {
  if (!fromPin || !toPin || fromPin === toPin) return null;
  const other = fromPin === VILLAGE_PIN ? toPin : toPin === VILLAGE_PIN ? fromPin : null;
  if (!other) return null; // the book only measures from the village
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, other)) return overrides[other] ?? null;
  return Object.prototype.hasOwnProperty.call(BOOK_TIMES, other) ? BOOK_TIMES[other] : null;
}

/** The route pin nearest a point, within PIN_SNAP_PX: its id, or null. Only pins the table knows count. */
export function pinAt(notes, pt, snap = PIN_SNAP_PX) {
  const known = (id) => id === VILLAGE_PIN || Object.prototype.hasOwnProperty.call(BOOK_TIMES, id);
  let best = null, bestD = Infinity;
  for (const n of notes ?? []) {
    const id = n.id ?? n._id;
    if (!known(id)) continue;
    const d = Math.hypot((n.x ?? 0) - pt.x, (n.y ?? 0) - pt.y);
    if (d < bestD) { best = id; bestD = d; }
  }
  return bestD <= snap ? best : null;
}

/** {from, to, time} of a drawn road on a scene ({id, notes, flags}); time null off the Hollow or between unknown pins. */
export function routeOf(scene, pts) {
  if (!scene || scene.id !== HOLLOW_SCENE || !pts?.length) return { from: null, to: null, time: null };
  const notes = [...(scene.notes ?? [])];
  const from = pinAt(notes, pts[0]), to = pinAt(notes, pts[pts.length - 1]);
  const overrides = scene.flags?.["mobile-command"]?.travelTimes ?? {};
  return { from, to, time: routeTime(from, to, overrides) };
}

/** The game hours the walk advances the clock by: hours as given; nights → the LOW end × 24 (his discretion above). */
export function bookHours(t) {
  if (!t) return null;
  if (Number.isFinite(Number(t.hours))) return Number(t.hours);
  if (Array.isArray(t.nights) && t.nights.length) return Number(t.nights[0]) * 24;
  return null;
}

/** "4 hours" · "3–5 nights" · "1 night" · null. The same words the deck's Go key uses (deck page.js travelTimeLabel). */
export function travelTimeLabel(t) {
  if (!t) return null;
  const n = (v, one, many) => `${v} ${Number(v) === 1 ? one : many}`;
  if (Number.isFinite(Number(t.hours))) return n(t.hours, "hour", "hours");
  if (Array.isArray(t.nights) && t.nights.length) {
    const [a, b = a] = t.nights.map(Number);
    return a === b ? n(a, "night", "nights") : `${a}–${b} nights`;
  }
  return null;
}
