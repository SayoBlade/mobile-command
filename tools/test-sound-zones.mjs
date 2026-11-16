// Sound zones (DM 2026-11-17: "lower the chanting outside the cauldron room"; DESIGN §59.6): the attic's chanting is
// full while a player character stands in the Cauldron Room, 12 dB lower while none does. Pure rules, then the runtime
// against a fake attic (sound-zones.js → sound-mix.js trims).
// Run: node tools/test-sound-zones.mjs   (numbered; stops at the first failure)
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const MOD = "mobile-command";
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

const settings = { soundTrims: { "syr:mood:44420": -30, "Playlist.VQIqq23NxXQ9yQtZ.PlaylistSound.VQfSDAX1FG2kbu7x": 12, "syr:mood:1": -5 }, displayOwnerUser: "" };
const GM = { id: "gm", isGM: true }, P1 = { id: "p1", isGM: false }, P2 = { id: "p2", isGM: false };
const users = [GM, P1, P2];
const hooks = {};
globalThis.game = {
  user: GM, users: Object.assign(users, { activeGM: GM }), world: { id: "crooked-moon-6x" }, playlists: [], folders: [], combats: [],
  modules: { get: () => null }, scenes: { active: null, get: () => null }, system: { id: "dnd5e" },
  settings: { get: (m, k) => settings[k], set: async (m, k, v) => { settings[k] = v; return v; } },
};
globalThis.Hooks = { callAll: () => {}, on: (h, fn) => { (hooks[h] ??= []).push(fn); }, once: () => {} };
globalThis.foundry = { utils: { fromUuidSync: () => null, randomID: () => "x" } };
globalThis.CONST = { PLAYLIST_MODES: { SEQUENTIAL: 0, SHUFFLE: 1, SIMULTANEOUS: 2, DISABLED: -1 } };

const Z = await import(pathToFileURL(path.join(ROOT, "scripts", "sound-zones.js")).href);
const SM = await import(pathToFileURL(path.join(ROOT, "scripts", "sound-mix.js")).href);
const A = await import(pathToFileURL(path.join(ROOT, "scripts", "cm-attic.js")).href);

const ATTIC = "N7rxbhvGMk3cs6k5";
const cauldronShapes = [{ type: "polygon", points: A.ATTIC_ROOMS.find((r) => r.key === "music:12.4:cauldron").points }];
const regions = { "music:12.4:cauldron": cauldronShapes };
const LANDING = { x: 1610, y: 1050 }, CAULDRON = { x: 1610, y: 1820 };
const zone = Z.SOUND_ZONES[0];

// ── the rule (pure) ──
const out1 = Z.zoneOffsets({ sceneId: ATTIC, regions, points: [LANDING] });
check("the party on the Secret Landing → every chant key 12 dB lower (Foul Ritual, the solo chants, the incanting, the drone)",
  zone.keys.length === 5 && zone.keys.every((k) => out1[k] === -12) && "syr:mood:44420" in out1, JSON.stringify(out1));
check("a player character in the Cauldron Room → no cut (full)", Object.keys(Z.zoneOffsets({ sceneId: ATTIC, regions, points: [CAULDRON] })).length === 0);
check("one of two in the Cauldron Room → full (whoever is in the room hears it close)", Object.keys(Z.zoneOffsets({ sceneId: ATTIC, regions, points: [LANDING, CAULDRON] })).length === 0);
check("no player character on the map → nothing changes", Object.keys(Z.zoneOffsets({ sceneId: ATTIC, regions, points: [] })).length === 0);
check("another scene, or the attic before its Cauldron Room region exists → nothing changes",
  Object.keys(Z.zoneOffsets({ sceneId: "other", regions, points: [LANDING] })).length === 0 && Object.keys(Z.zoneOffsets({ sceneId: ATTIC, regions: {}, points: [LANDING] })).length === 0);

// ── on top of the trims (pure) ──
const heard = SM.withZones(settings.soundTrims, out1);
check("heard: Foul Ritual's −30 becomes −42; the drone's +12 becomes 0; an untrimmed chant −12; other trims unchanged",
  heard["syr:mood:44420"] === -42 && heard["Playlist.VQIqq23NxXQ9yQtZ.PlaylistSound.VQfSDAX1FG2kbu7x"] === 0 && heard["syr:element:244024"] === -12 && heard["syr:mood:1"] === -5, JSON.stringify(heard));
check("a cut on a trim already at the −40 floor still lands (read floor −64; a WRITTEN trim stays −40 … +24)",
  SM.trimDbOf("k", SM.withZones({ k: -40 }, { k: -12 })) === -52 && SM.TRIM_MIN_DB === -40 && SM.trimDbOf("k", SM.withZones({ k: -99 }, { k: -12 })) === -52);
check("a Syrinscape mood cut of −42 lands in full on its global volume (room ≈ 56 dB there)", near(SM.moodTrimSplit(0.5, 1, 1.5, -42).appliedDb, -42));
const bedSound = { uuid: "Playlist.VQIqq23NxXQ9yQtZ.PlaylistSound.VQfSDAX1FG2kbu7x", flags: { [MOD]: { cm: "12.4:bed" } }, parent: { flags: {} } };
check("the drone (a local bed) starts 12 dB lower outside than inside",
  near(20 * Math.log10(SM.setLevelOf(bedSound, "music", null, heard) / SM.setLevelOf(bedSound, "music", null, settings.soundTrims)), -12));

// ── the runtime: this screen works it out from the tokens ──
const token = (id, uid, x, y) => ({ id, x: x - 70, y: y - 70, width: 1, height: 1, getFlag: () => undefined,
  actor: { id: `a-${id}`, type: "character", getFlag: () => undefined, testUserPermission: (u) => u.id === uid } });
const hero = token("barb", "p1", LANDING.x, LANDING.y);
const attic = { id: ATTIC, name: "12.4 Attic", grid: { size: 140 }, tokens: [hero],
  regions: [{ flags: { [MOD]: { cm: "music:12.4:cauldron" } }, shapes: cauldronShapes }] };
game.scenes.active = attic;
check("on the Secret Landing: the screen's heard trims carry the cut, the world's stored trims do not",
  Z.syncSoundZones() === true && SM.trimsNow()["syr:mood:44420"] === -42 && SM.storedTrims()["syr:mood:44420"] === -30 && SM.getSoundTrims("syr:mood:44420") === -30);
check("…and nothing is redone while nobody moves", Z.syncSoundZones() === false);
hero.x = CAULDRON.x - 70; hero.y = CAULDRON.y - 70;
check("through the door into the Cauldron Room → full again (−30)", Z.syncSoundZones() === true && SM.trimsNow()["syr:mood:44420"] === -30);
game.scenes.active = { id: "skzmyUz6MM2U4862", tokens: [], regions: [] };
check("on another floor → no zone at all", Z.syncSoundZones() === false && Object.keys(SM.zoneOffsetsNow()).length === 0);
Z.registerSoundZones();
check("it listens for tokens moving, regions and scene changes", ["updateToken", "createToken", "deleteToken", "createRegion", "updateRegion", "updateScene"].every((h) => hooks[h]?.length));

console.log(`\nall ${n} passed`);
