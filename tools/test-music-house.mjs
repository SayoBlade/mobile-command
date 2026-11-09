// The Crooked House's music (DM 2026-11-08, WORKPLAN decisions 8 and 9): the floor's bed keeps playing
// under the room music, and a scene names its own fight music. Pure rules from music-core.js, then the
// battle pick through music.js against a fake world. Headless: no Foundry.
// Run: node tools/test-music-house.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}

const core = await import(pathToFileURL(path.join(ROOT, "scripts", "music-core.js")).href);
const { isBed, bedStays, bedKind, BED_KINDS, sceneBattleOf, battleFor } = core;

// ── which sounds are beds ─────────────────────────────────────────────────────────────────────────
check("a Crooked House floor track (cm '12.1:bed') is a bed", isBed({ "mobile-command": { cm: "12.1:bed" } }));
check("a sound flagged bed: true is a bed", isBed({ "mobile-command": { bed: true } }));
check("a room's music track is not a bed", !isBed({ "mobile-command": { cm: "12.1:sound:0" } }) && !isBed({}) && !isBed(undefined));

// ── what keeps it playing ─────────────────────────────────────────────────────────────────────────
check("room music coming in leaves the bed playing", bedStays({ kind: "playlist", uuid: "Playlist.room" }));
check("a fight or a cue coming in leaves it playing too", bedStays({ kind: "sound", uuid: "Playlist.b.PlaylistSound.x" }));
check("Silence stops it", !bedStays({ kind: "silence" }));
check("no target (keep playing) changes nothing, so stops nothing", !bedStays(null));

// ── a scene's own fight music ─────────────────────────────────────────────────────────────────────
check("a scene flag names its fight playlist", sceneBattleOf({ "mobile-command": { music: { battle: "Playlist.house" } } }) === "Playlist.house");
check("no flag, or a blank one, names nothing", sceneBattleOf({}) === null && sceneBattleOf({ "mobile-command": { music: { battle: "" } } }) === null);
const weasel = { isPC: false, battle: null, phase2: null }, pc = { isPC: true, battle: null, phase2: null };
check("the scene's music is the fallback when no foe names one", battleFor([pc, weasel], "Playlist.house").uuid === "Playlist.house");
check("a foe that names its own battle still beats the scene's", battleFor([pc, { ...weasel, battle: "Playlist.haint" }], "Playlist.house").uuid === "Playlist.haint");

// ── the glue: music.js plays only this floor's bed through, and reads the scene's fight music ───────
const src = fs.readFileSync(path.join(ROOT, "scripts", "music.js"), "utf8");
check("crossfade spares only the ACTIVE scene's bed, and only if its kind stays (the four floors share one playlist)",
  src.includes("const bed = here && bedStays(target, here.kind) ? here.id : null;") && /if \(bed && s\.id === bed\) continue;/.test(src));

// ── either or (DM 2026-11-09): one music track at a time; environment layers under it ──────────────
const F = (cm, extra = {}) => ({ "mobile-command": { cm, ...extra } });
check("6x's beds classified: 12.1 rain = environment; 12.2 haunted house, 12.3 hall of horrors, 12.4 dark ritual = music",
  bedKind(F("12.1:bed")) === "environment" && ["12.2:bed", "12.3:bed", "12.4:bed"].every((k) => bedKind(F(k)) === "music") && Object.keys(BED_KINDS).length === 4);
check("his flag wins either way (bedKind on the sound)", bedKind(F("12.1:bed", { bedKind: "music" })) === "music" && bedKind(F("12.4:bed", { bedKind: "environment" })) === "environment");
check("an unknown bed (bed: true) is environment", bedKind({ "mobile-command": { bed: true } }) === "environment");
const room = { kind: "playlist", uuid: "Playlist.room" }, fight = { kind: "playlist", uuid: "Playlist.fight" }, cue = { kind: "sound", uuid: "Playlist.c.PlaylistSound.x" };
check("the Attic case: the Cauldron fight's music comes in → the Dark Ritual bed stops", !bedStays(fight, bedKind(F("12.4:bed"))));
check("…and so for room music and a cue on the 2nd and 3rd floors", [room, cue].every((t) => !bedStays(t, "music")));
check("the 1st floor's rain still plays under room, fight and cue music", [room, fight, cue].every((t) => bedStays(t, bedKind(F("12.1:bed")))));

const MOD = "mobile-command";
const store = new Map([["musicLayer", true], ["musicState", {}], ["combatMusicPlaylist", "Playlist.world"]]);
const pls = { "Playlist.world": { uuid: "Playlist.world", documentName: "Playlist" }, "Playlist.house": { uuid: "Playlist.house", documentName: "Playlist" }, "Playlist.haint": { uuid: "Playlist.haint", documentName: "Playlist" } };
const scene = { id: "S", flags: { [MOD]: { music: { battle: "Playlist.house" } } }, tokens: [], regions: [], playlist: null };
const actor = (id, type, music) => ({ id, type, getFlag: (m, k) => (k === "music" ? music : undefined) });
const combat = { id: "c1", started: true, scene, combatant: null, combatants: [{ actor: actor("pc", "character", {}) }, { actor: actor("w", "npc", {}) }], getFlag: () => [] };
const GM = { id: "gm", isGM: true };
globalThis.game = {
  user: GM, users: Object.assign([GM], { activeGM: GM }), world: { id: "x" },
  scenes: { active: scene }, playlists: [], folders: [], combat, actors: [],
  modules: { get: () => null }, system: { id: "dnd5e" },
  settings: { get: (m, k) => store.get(k), set: async (m, k, v) => { store.set(k, v); return v; } },
};
globalThis.Hooks = { callAll: () => {}, on: () => {}, once: () => {} };
globalThis.foundry = { utils: { fromUuidSync: (u) => pls[u] ?? null, randomID: () => "x" } };
globalThis.CONST = { PLAYLIST_MODES: { SEQUENTIAL: 0, SHUFFLE: 1 } };
const M = await import(pathToFileURL(path.join(ROOT, "scripts", "music.js")).href);

await M.pick("battle");
let t = store.get("musicState")?.manual?.target;
check("in a house fight with plain weasels, Battle plays the scene's own playlist", t?.uuid === "Playlist.house", JSON.stringify(t));
combat.combatants[1] = { actor: actor("h", "npc", { battle: "Playlist.haint" }) };
await M.pick("battle");
t = store.get("musicState")?.manual?.target;
check("a foe with its own battle music still wins over the scene's", t?.uuid === "Playlist.haint", JSON.stringify(t));
combat.combatants[1] = { actor: actor("w", "npc", {}) };
scene.flags = {};
await M.pick("battle");
t = store.get("musicState")?.manual?.target;
check("a scene without its own music falls back to the world's battle music, as before", t?.uuid === "Playlist.world", JSON.stringify(t));
scene.flags = { [MOD]: { music: { battle: "Playlist.gone" } } };
await M.pick("battle");
t = store.get("musicState")?.manual?.target;
check("a scene naming a playlist that no longer exists falls back too", t?.uuid === "Playlist.world", JSON.stringify(t));

console.log(`\nall ${n} passed`);
