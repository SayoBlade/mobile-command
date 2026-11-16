/**
 * ── THE ATTIC'S ROOMS GET MUSIC (DM 2026-11-17, DESIGN §59) ─────────────────────────────────────────────────────────
 *
 * His words: *"Wait, so music starts when the party enters a room? I actually like that better"* and *"But I want music
 * for the attic too"*. The attic (12.4) had no Music regions; it has two areas in the book: **H16 Secret Landing** (the
 * top of the ladder, the runes, the little door) and **H17 Cauldron Room** (the cauldron, Vessla). Each gets a Music
 * region like the first floor's Foyer, Parlor and Music Room, so the music starts when the whole party stands in it.
 *
 * ⚠️ THE SHAPES ARE THE MAP'S OWN WALLS, never a distance from a pin: the attic's outer walls, cut in two by the one
 * wall that runs west–east at y ≈ 1235–1278 with the little door in it (wall 1255,1268 → 1403,1252, a door). North of it
 * is H16, south of it H17 (read from crooked-moon-6x 2026-11-17, SEAT 5 snapshot; 33 walls).
 *
 * ⚠️ IT RUNS ITSELF, ONCE, ON THE PRIMARY GM'S NEXT LOAD (as cm-house.js). ADDITIVE, NEVER OVER ANYTHING OF HIS:
 *   - a room is made only if no region of ours carries its key;
 *   - nothing is made if the attic already has a Music region of his own (his rooms win);
 *   - a room whose playlist is gone is skipped, not guessed;
 *   - nothing is deleted; a world setting remembers it ran, so a region he moves or removes stays that way.
 */
import { MODULE_ID } from "./preset.js";
import { notifier } from "./notifier.js";

export const ATTIC_ROOMS_MADE = "atticRoomsMade";
export const ATTIC_WORLDS = new Set(["crooked-moon-6x", "offline-test"]);
export const ATTIC = "N7rxbhvGMk3cs6k5";
const MUSIC = `${MODULE_ID}.music`;

/** The two rooms. Playlists are his (Music → Rooms), picked by title, for his veto. */
export const ATTIC_ROOMS = Object.freeze([
  {
    key: "music:12.4:landing", name: "Music · Secret Landing", label: "Secret Landing", book: "H16",
    playlist: "cmroM7sdO9ufQBvA", // Room · Off the Spectral Rails: Tides Move Inward, Sky Behind the Sky, Architecture That Watches
    points: [1199, 919, 1587, 934, 1884, 936, 1879, 1235, 1690, 1241, 1403, 1252, 1255, 1268, 1190, 1278, 1187, 941],
  },
  {
    key: "music:12.4:cauldron", name: "Music · Cauldron Room", label: "Cauldron Room", book: "H17",
    playlist: "cmro4pYJ6raL8tHW", // Room · Abandoned Church: Bone Chapel, Cathedral Phantom, Monster in the Chapel
    points: [1190, 1278, 1255, 1268, 1403, 1252, 1690, 1241, 1879, 1235, 2045, 1227, 2052, 1601, 2032, 2126, 1992, 2120,
      1996, 2165, 1643, 2151, 1264, 2168, 1238, 2131, 1206, 2123, 1210, 1808, 1198, 1455],
  },
]);

const flagKey = (d) => d?.flags?.[MODULE_ID]?.cm ?? null;

/**
 * Pure: what a run would make. `snap` = { scene: null | { regions: [{ cm, music: bool }] }, playlists: [ids] }.
 * → { make: [room], kept: [why], skipped: [why] }
 */
export function planAtticRooms(snap) {
  const out = { make: [], kept: [], skipped: [] };
  if (!snap?.scene) { out.skipped.push("no attic in this world"); return out; }
  const regions = snap.scene.regions ?? [];
  const his = regions.filter((r) => r.music && !String(r.cm ?? "").startsWith("music:12.4:"));
  if (his.length) { out.kept.push(`the attic has ${his.length} Music region${his.length === 1 ? "" : "s"} of his own`); return out; }
  const have = new Set(regions.map((r) => r.cm).filter(Boolean));
  const pls = new Set(snap.playlists ?? []);
  for (const room of ATTIC_ROOMS) {
    if (have.has(room.key)) { out.kept.push(`${room.label}: already there`); continue; }
    if (!pls.has(room.playlist)) { out.skipped.push(`${room.label}: its playlist is gone`); continue; }
    out.make.push(room);
  }
  return out;
}

function snapshot() {
  const sc = game.scenes?.get(ATTIC);
  return {
    scene: sc ? { regions: [...sc.regions].map((r) => ({ cm: flagKey(r), music: [...(r.behaviors ?? [])].some((b) => b.type === MUSIC) })) } : null,
    playlists: [...(game.playlists ?? [])].map((p) => p.id),
  };
}

/** What a run would do now, without doing it — `MobileCommand.house.atticPlan()`. */
export function planAtticNow() { return planAtticRooms(snapshot()); }

/** Make the rooms. Primary GM, the Crooked Moon worlds, once (unless `force`). → the names made, or null. */
export async function makeAtticRooms({ force = false } = {}) {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) return null;
  if (!ATTIC_WORLDS.has(game.world?.id)) return null;
  try {
    if (!force && game.settings.get(MODULE_ID, ATTIC_ROOMS_MADE)) return null;
    const plan = planAtticRooms(snapshot());
    const sc = game.scenes.get(ATTIC);
    const made = [];
    for (const room of plan.make) {
      await sc.createEmbeddedDocuments("Region", [{
        name: room.name, color: "#7f5af0", visibility: CONST.REGION_VISIBILITY.LAYER_UNLOCKED,
        shapes: [{ type: "polygon", points: room.points, hole: false }],
        flags: { [MODULE_ID]: { cm: room.key, book: room.book } },
        behaviors: [{ name: room.name, type: MUSIC, system: { playlist: `Playlist.${room.playlist}`, fade: 3000, label: room.label } }],
      }]);
      made.push(`${room.label} (${room.book}) → ${game.playlists.get(room.playlist)?.name ?? room.playlist}`);
    }
    if (sc) await game.settings.set(MODULE_ID, ATTIC_ROOMS_MADE, true);
    console.log(`${MODULE_ID} | the attic's rooms: ${made.join("; ") || "nothing made"}`
      + (plan.kept.length ? `\n  left as he has them: ${plan.kept.join("; ")}` : "")
      + (plan.skipped.length ? `\n  skipped: ${plan.skipped.join("; ")}` : ""));
    if (made.length) notifier.info(`Attic: room music for ${made.length} room${made.length === 1 ? "" : "s"} (list in console).`);
    return made;
  } catch (e) {
    console.warn(`${MODULE_ID} | could not make the attic's rooms`, e);
    return null;
  }
}
