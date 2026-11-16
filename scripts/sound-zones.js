/**
 * ── SOUND ZONES: a sound heard full in its room and lower outside it (DM 2026-11-17, DESIGN §59.6) ───────────────────
 *
 * His words: *"lower the chanting outside the cauldron room"*. The attic's chanting is not a positional sound: Vessla's
 * Foul Ritual and her solo chants are Syrinscape (one shared player, no position), and the Dark Ritual drone is the
 * floor's bed (a playlist sound, no position). So an ambient sound's radius and walls cannot do it. Instead a REGION
 * decides: while no player character stands inside the zone's region, the zone's sounds play `outsideDb` lower; the
 * moment one does, they are back at full. It rides the trims (sound-mix.js `setZoneOffsets`): a local sound fades to
 * its new level, a Syrinscape mood's cut moves its whole output, a standalone element its own volume. Nothing is
 * written; every screen works it out from the tokens it already has.
 */
import { MODULE_ID } from "./preset.js";
import { inRegion } from "./music-core.js";
import { partyPoints } from "./music.js";
import { setZoneOffsets, zoneOffsetsNow, refreshTrims } from "./sound-mix.js";
import { syncSyrinscapeVolume, syncSyrinscapeLevels } from "./syrinscape-bridge.js";

export const SOUND_ZONES = Object.freeze([
  {
    id: "cauldron-chant", scene: "N7rxbhvGMk3cs6k5", region: "music:12.4:cauldron", outsideDb: -12,
    keys: [
      "syr:mood:44420",     // 12.4 Vessla · Foul Ritual (has music): the hag's ritual, the hot one (SEAT 4: +0.3 dBFS)
      "syr:element:244024", // 12.4 Vessla · Solo chant i
      "syr:element:244025", // 12.4 Vessla · Solo chant ii
      "syr:element:244009", // Cultist Mutter · Incanting (SEAT 4: −4.6 dBFS), should it be played here
      "Playlist.VQIqq23NxXQ9yQtZ.PlaylistSound.VQfSDAX1FG2kbu7x", // 12.4 Attic — dark ritual (the floor's drone)
    ],
  },
]);

/**
 * Pure: the dB each zone adds to its sounds now. `regions` = { cm key → shapes } on the scene, `points` = the player
 * characters' points. A zone whose region is missing, or a scene with no player character on it, adds nothing.
 */
export function zoneOffsets({ sceneId, regions = {}, points = [], zones = SOUND_ZONES } = {}) {
  const out = {};
  for (const z of zones) {
    if (z.scene !== sceneId) continue;
    const shapes = regions[z.region];
    if (!shapes || !points.length) continue;
    if (points.some((p) => inRegion(shapes, p.x, p.y))) continue;
    for (const k of z.keys) out[k] = (out[k] ?? 0) + z.outsideDb;
  }
  return out;
}

/** This screen: work the zones out for the table's scene and, when they changed, move the sounds. */
export function syncSoundZones() {
  const scene = game.scenes?.active ?? null;
  const regions = {};
  for (const r of scene?.regions ?? []) { const k = r.flags?.[MODULE_ID]?.cm; if (k) regions[k] = r.shapes ?? []; }
  const next = zoneOffsets({ sceneId: scene?.id ?? null, regions, points: partyPoints(scene) });
  if (JSON.stringify(next) === JSON.stringify(zoneOffsetsNow())) return false;
  setZoneOffsets(next);
  try { refreshTrims(); syncSyrinscapeVolume(); syncSyrinscapeLevels(); } catch (e) { console.warn(`${MODULE_ID} | sound zones`, e?.message); }
  return true;
}

let _t = null;
const soon = () => { clearTimeout(_t); _t = setTimeout(syncSoundZones, 150); };

/** ready, every screen. */
export function registerSoundZones() {
  Hooks.on("updateToken", (_d, ch) => { if ("x" in ch || "y" in ch || "actorId" in ch) soon(); });
  for (const h of ["createToken", "deleteToken", "createRegion", "updateRegion", "deleteRegion"]) Hooks.on(h, soon);
  Hooks.on("updateScene", (_s, ch) => { if ("active" in ch) soon(); });
  soon();
}
