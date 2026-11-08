/**
 * ── THE CROOKED HOUSE, PUT BACK INTO THE WORLD HE PLAYS (DM 2026-11-08, WORKPLAN decisions 9 and 11) ─
 *
 * Lost Lore #17 and #18: the house's 21 doors with their own sounds and the 4 stairs between floors were
 * built in 2026-09 by MC's apply scripts, which would only write `offline-test`. Every later world was
 * made from Deck Command's capture, which leaves MC's content out, so crooked-moon-6x has every door on
 * the adventure's own `woodCreaky` and no stairs. Tonight's put-backs (deck-command m68/m74) restored the
 * sounds and the beds, not these. Decision 9 adds the house's fight music: the old test world's battle
 * pack (Combat Music Vol. 1) for the house, and a track of its own for the Cauldron Room.
 *
 * ⚠️ IT RUNS ITSELF, ONCE, ON THE PRIMARY GM'S NEXT LOAD — the seat is someone else's tonight, and he
 * has asked not to be made the hands for console pastes (see cm-train.js freeTrainWeather).
 *
 * ⚠️ ADDITIVE, AND NEVER OVER ANYTHING OF HIS:
 *   - a door is given its set only while it still has the adventure's default (`woodCreaky` or blank);
 *     any other sound on it is his choice and stands.
 *   - a staircase is made only where none of ours exists (found by our `cm` flag); one that exists is
 *     left exactly as it is, wherever he dragged it.
 *   - a fight playlist is made only if none carries our key; a scene's fight music is set only while
 *     the scene names none.
 *   - nothing is ever deleted. Guarded by a world setting, so a door he puts back by hand stays put.
 *
 * Stairs are player-walked: core's own question ("Go up to the second floor?") asks whoever moved the
 * token, and in Basic a phone's tap on the square goes to the DM (rpc handleTravelTo) — nobody is moved
 * without an answer.
 */
import { MODULE_ID } from "./preset.js";
import { notifier } from "./notifier.js";

export const HOUSE_RESTORED = "crookedHouseRestored";
export const HOUSE_WORLDS = new Set(["crooked-moon-6x", "offline-test"]);
/** The adventure's own door sound: replaceable. Anything else is his. */
export const DEFAULT_DOOR_SOUNDS = new Set(["", "woodCreaky"]);

const S1 = "skzmyUz6MM2U4862", S2 = "LTGEO7JXWxFvbcIJ", S3 = "gl3mouQf0eAdouY5", S4 = "N7rxbhvGMk3cs6k5";

/** The 21 doors and their sets — tools/crooked-house-wiring.apply.js (2026-09-20), ids identical in 6x (read 2026-11-08). */
export const HOUSE_DOORS = {
  [S1]: [["1j1BFGw5Vz6IXojY", "mcCrookedFront"], ...["4GWhFMFUVOEjOk1n", "4OOyXcsbSvqxL6Dd", "OcSrPCVOGh7jkKNS", "PvaXEzSRpcgy55xC", "dsr0DC47Wf0aAQ7x", "g3mj8Odjo0XHKOUF", "oG2d3dxzS8kBKRl4", "qO53OQmK3QDBcUvc", "uQegHmci80vuH1cg", "x2or6mD2AUxtFM0Z"].map((id) => [id, "mcCrookedHouse"])],
  [S2]: [["6QU2ABkhk4blqlG2", "mcCrookedWet"], ...["QzgmzcI56DeyWXYV", "elao0qtem56H6OwS", "n6yEconUA55xYDTM", "pUg00SPg1Qf99key", "uI7GsUE7JXvEkhih"].map((id) => [id, "mcCrookedHouse"])],
  [S3]: ["aNvSfadpGf8o0ovd", "iByB8uV5XRW55T0F", "snvJl6aRXE7GxHYH"].map((id) => [id, "mcCrookedHouse"]),
  [S4]: [["HGxbW6Eu6iCJL3it", "mcCrookedWrong"]],
};

/** The stairs — tools/crooked-house-stairs.apply.js: the LAST tread of each flight (the squares the offline-test world ended on). */
export const HOUSE_STAIRS = {
  "stair:12.1:up": { scene: S1, name: "Stairs — up to the Second Floor", col: 9, row: 13, to: "stair:12.2:down", ask: "Go up to the second floor?" },
  "stair:12.2:down": { scene: S2, name: "Stairs — down to the First Floor", col: 9, row: 13, to: "stair:12.1:up", ask: "Go down to the first floor?" },
  "stair:12.2:up": { scene: S2, name: "Stairs — up to the Third Floor", col: 6, row: 9, to: "stair:12.3:down", ask: "Go up to the third floor?" },
  "stair:12.3:down": { scene: S3, name: "Stairs — down to the Second Floor", col: 6, row: 9, to: "stair:12.2:up", ask: "Go down to the second floor?" },
};

const MGS = "modules/combat-music-vol-1-MGS/music/";
/** The house's fights (decision 9). Paths only, into his Data folder; no audio ships. */
export const HOUSE_FIGHTS = {
  "crooked-house": {
    name: "Fight · Crooked House",
    // the old test world's house battle pack, all ten, as it was there
    tracks: [["01 The Airship Armada", "01-The-Airship-Armada.ogg"], ["02 The Last Dragonlord", "02-The-Last-Dragonlord.ogg"], ["03 The Eternal War", "03-The-Eternal-War.ogg"],
      ["04 The Rise Of The Valkyries", "04-The-Rise-Of-The-Valkyries.ogg"], ["05 Apolon's Fate", "05-Apolon%27s-Fate.ogg"], ["06 Wrath Of The Blood Queen", "06-Wrath-Of-The-Blood-Queen.ogg"],
      ["07 Last March Of The Serpent King", "07-Last-March-Of-The-Serpent-King.ogg"], ["08 Cannibal's Path", "08-Cannibal%27s-Path.ogg"], ["09 The Clockwork Dragon", "09-The-Clockwork-Dragon.ogg"],
      ["10 Dragon King Of The South", "10-Dragon-King-Of-The-South.ogg"]].map(([name, f]) => ({ name, path: MGS + f })),
    scenes: [S1, S2, S3],
  },
  "cauldron-room": {
    name: "Fight · Cauldron Room",
    // House Divided's boss loop — the audio catalogue's boss pick, loop-friendly, from the pack the house's beds come from
    tracks: [{ name: "bbeg", path: "modules/house-divided/assets/audio/music/combat/bbeg.ogg", repeat: true }],
    scenes: [S4],
  },
};

/**
 * What the restore would do, from a plain snapshot. Pure: tools/test-house-restore.mjs runs it headless.
 * @param {object} w
 * @param {Object<string,{walls:Object<string,{door:number,doorSound:string}>, stairs:string[], battle:string|null}>} w.scenes
 *        per scene id: its doors, the `cm` keys of our stairs already there, the scene's own fight music
 * @param {string[]} w.fights  the `music.key`s of the fight playlists already in the world
 * @returns {{doors:object[], stairs:string[], fights:string[], sceneBattles:object[], kept:string[], skipped:string[]}}
 */
export function planHouse(w) {
  const out = { doors: [], stairs: [], fights: [], sceneBattles: [], kept: [], skipped: [] };
  for (const [sceneId, list] of Object.entries(HOUSE_DOORS)) {
    const sc = w.scenes?.[sceneId];
    if (!sc) { out.skipped.push(`scene ${sceneId} not in this world`); continue; }
    for (const [id, set] of list) {
      const wall = sc.walls?.[id];
      if (!wall?.door) { out.skipped.push(`door ${id} missing`); continue; }
      const now = wall.doorSound ?? "";
      if (now === set) continue;
      if (!DEFAULT_DOOR_SOUNDS.has(now)) { out.kept.push(`door ${id}: ${now} (his)`); continue; }
      out.doors.push({ scene: sceneId, _id: id, doorSound: set });
    }
  }
  for (const [key, st] of Object.entries(HOUSE_STAIRS)) {
    const sc = w.scenes?.[st.scene];
    if (!sc) { out.skipped.push(`${key}: no scene`); continue; }
    if ((sc.stairs ?? []).includes(key)) { out.kept.push(`${key} (already there)`); continue; }
    out.stairs.push(key);
  }
  for (const [key, f] of Object.entries(HOUSE_FIGHTS)) {
    if (!(w.fights ?? []).includes(key)) out.fights.push(key);
    for (const sceneId of f.scenes) {
      const sc = w.scenes?.[sceneId];
      if (!sc) continue;
      if (sc.battle) { out.kept.push(`${sceneId} fight music (his)`); continue; }
      out.sceneBattles.push({ scene: sceneId, fight: key });
    }
  }
  return out;
}

/** A stair's teleport behaviour: core's own question, to its twin. */
export function stairBehavior(ask, destUuid) {
  return {
    name: "Stairs", type: "teleportToken",
    system: { destinations: [destUuid], placement: "center", snap: false, choice: true, revealed: true, dialog: { revealed: ask, unrevealed: null }, transition: { type: null, duration: 1500 } },
  };
}

const flagKey = (d) => d?.flags?.[MODULE_ID]?.cm ?? null;
const fightKey = (p) => p?.flags?.[MODULE_ID]?.music?.role === "battle" ? p.flags[MODULE_ID].music.key : null;

function snapshot() {
  const scenes = {};
  for (const id of [S1, S2, S3, S4]) {
    const sc = game.scenes.get(id);
    if (!sc) continue;
    const walls = {};
    for (const wl of sc.walls) walls[wl.id] = { door: wl.door, doorSound: wl.doorSound ?? "" };
    scenes[id] = { walls, stairs: sc.regions.map(flagKey).filter((k) => k?.startsWith("stair:")), battle: sc.flags?.[MODULE_ID]?.music?.battle ?? null };
  }
  return { scenes, fights: game.playlists.map(fightKey).filter(Boolean) };
}

/** What a run would do in this world right now, without doing it — `MobileCommand.house.plan()`. */
export function planHouseNow() { return game.scenes?.get(S1) ? planHouse(snapshot()) : null; }

/**
 * Put the house back. Primary GM only, the Crooked Moon worlds only, once (unless `force`).
 * Returns the list of every document it changed, or null when it did not run.
 */
export async function restoreCrookedHouse({ force = false } = {}) {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) return null;
  if (!HOUSE_WORLDS.has(game.world?.id)) return null;
  try {
    if (!force && game.settings.get(MODULE_ID, HOUSE_RESTORED)) return null;
    if (!game.scenes.get(S1)) { console.log(`${MODULE_ID} | the Crooked House is not in this world — nothing to put back`); return null; }
    const plan = planHouse(snapshot());
    const changed = [];

    // the doors
    const byScene = {};
    for (const d of plan.doors) (byScene[d.scene] ??= []).push({ _id: d._id, doorSound: d.doorSound });
    for (const [id, ups] of Object.entries(byScene)) {
      const sc = game.scenes.get(id);
      await sc.updateEmbeddedDocuments("Wall", ups);
      changed.push(`${sc.name} · ${ups.length} door${ups.length === 1 ? "" : "s"} given their own sounds`);
    }

    // the stairs: the regions first, then each new one's question to its twin (old or new)
    const G = (sc) => sc.grid?.size ?? 140;
    const made = {};
    for (const key of plan.stairs) {
      const st = HOUSE_STAIRS[key], sc = game.scenes.get(st.scene), g = G(sc);
      const [r] = await sc.createEmbeddedDocuments("Region", [{
        name: st.name, color: "#2fbd9c", visibility: CONST.REGION_VISIBILITY.LAYER_UNLOCKED,
        shapes: [{ type: "rectangle", x: st.col * g, y: st.row * g, width: g, height: g, rotation: 0, hole: false }],
        flags: { [MODULE_ID]: { cm: key } },
      }]);
      made[key] = r;
    }
    const find = (key) => made[key] ?? game.scenes.get(HOUSE_STAIRS[key].scene)?.regions.find((r) => flagKey(r) === key) ?? null;
    for (const [key, r] of Object.entries(made)) {
      const st = HOUSE_STAIRS[key], dest = find(st.to);
      if (!dest) { changed.push(`${r.parent.name} · ${st.name} made, but its other end is missing — it asks nothing yet`); continue; }
      await r.createEmbeddedDocuments("RegionBehavior", [stairBehavior(st.ask, dest.uuid)]);
      changed.push(`${r.parent.name} · ${st.name} (asks "${st.ask}")`);
    }

    // the fight music: the playlists, beside his other fights, then the scenes that name none
    const sibling = game.playlists.find((p) => fightKey(p));
    for (const key of plan.fights) {
      const f = HOUSE_FIGHTS[key];
      const pl = await Playlist.create({
        name: f.name, mode: CONST.PLAYLIST_MODES.SHUFFLE, fade: 1000, channel: "music", folder: sibling?.folder?.id ?? null,
        flags: { [MODULE_ID]: { music: { role: "battle", key } } },
      });
      await pl.createEmbeddedDocuments("PlaylistSound", f.tracks.map((t) => ({ name: t.name, path: t.path, repeat: Boolean(t.repeat), volume: 0.5, fade: 1000 })));
      changed.push(`playlist "${f.name}" (${f.tracks.length} track${f.tracks.length === 1 ? "" : "s"})`);
    }
    for (const { scene, fight } of plan.sceneBattles) {
      const pl = game.playlists.find((p) => fightKey(p) === fight);
      const sc = game.scenes.get(scene);
      if (!pl || !sc) continue;
      await sc.setFlag(MODULE_ID, "music", { ...(sc.getFlag(MODULE_ID, "music") ?? {}), battle: pl.uuid });
      changed.push(`${sc.name} · fights play "${pl.name}"`);
    }

    await game.settings.set(MODULE_ID, HOUSE_RESTORED, true);
    console.log(`${MODULE_ID} | the Crooked House put back:\n  ${changed.join("\n  ") || "nothing needed"}`
      + (plan.kept.length ? `\n  left as he has them: ${plan.kept.join("; ")}` : "")
      + (plan.skipped.length ? `\n  skipped: ${plan.skipped.join("; ")}` : ""));
    if (changed.length) notifier.info(`Crooked House: door sounds, stairs and fight music put back (${changed.length} changes, list in console).`);
    return changed;
  } catch (e) {
    console.warn(`${MODULE_ID} | could not put the Crooked House back`, e);
    notifier.warn("Crooked House: the put-back stopped part-way — see the console.");
    return null;
  }
}
