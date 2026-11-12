// Either or (DM 2026-11-09): "No dual music tracks (not counting environmental sound), either or." Seen: in the
// Attic, the Cauldron fight's music played over the floor's Dark Ritual bed at the same level. Now a MUSIC bed stops
// when a fight (or room, cue, pick) takes over and comes back when it ends; an ENVIRONMENT bed (the first floor's
// rain) plays on under it. Drives music.js's own combat hooks against a fake world with the 6x beds playlist.
// Run: node tools/test-music-either-or.mjs   (stops at the first failure)
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

// ── playlists, as 6x holds them (CM 12 — Beds: one bed per floor; Fight · Cauldron Room) ──────────────────────
const docs = {};
function playlist(id, name, flags, sounds) {
  const pl = { id, name, uuid: `Playlist.${id}`, documentName: "Playlist", flags, fade: 0,
    getFlag: (m, k) => flags?.[m]?.[k], update: async () => {}, mode: 0 };
  pl.sounds = Object.assign(sounds.map((s) => Object.assign(s, { parent: pl, documentName: "PlaylistSound", uuid: `${pl.uuid}.PlaylistSound.${s.id}`, getFlag: (m, k) => s.flags?.[m]?.[k] })), { get: (id2) => pl.sounds.find((s) => s.id === id2), contents: null });
  pl.sounds.contents = pl.sounds;
  Object.defineProperty(pl, "playing", { get: () => pl.sounds.some((s) => s.playing) });
  pl.playAll = async () => { pl.sounds[0].playing = true; };
  pl.playSound = async (s) => { s.playing = true; };
  pl.stopSound = async (s) => { s.playing = false; };
  docs[pl.uuid] = pl; for (const s of pl.sounds) docs[s.uuid] = s;
  return pl;
}
const bed = (id, cm, name) => ({ id, name, path: `${name}.ogg`, repeat: true, playing: false, flags: { [MOD]: { cm } } });
const beds = playlist("beds", "CM 12 — Beds", {}, [bed("rain", "12.1:bed", "abandoned-mansion-rain"), bed("haunted", "12.2:bed", "haunted-house"),
  bed("hall", "12.3:bed", "Hall-of-Horrors"), bed("ritual", "12.4:bed", "Dark-Ritual")]);
const fight = playlist("fight", "Fight · Cauldron Room", { [MOD]: { music: { role: "battle", key: "cauldron-room" } } }, [{ id: "bbeg", name: "bbeg", path: "bbeg.ogg", repeat: true, playing: false }]);
const roomPl = playlist("room", "Room · Parlor", { [MOD]: { music: { role: "room" } } }, [{ id: "r1", name: "Velvet Drapes", path: "v.ogg", playing: false }]);

const store = new Map([["musicLayer", true], ["musicState", {}], ["combatMusicPlaylist", ""]]);
const GM = { id: "gm", isGM: true };
const scene = { id: "attic", name: "12.4 Attic", flags: { [MOD]: { music: { battle: fight.uuid } } }, tokens: [], regions: [], grid: { size: 140 },
  playlist: beds, playlistSound: beds.sounds.get("ritual") };
const foe = { actor: { id: "hag", type: "npc", getFlag: () => undefined, hasPlayerOwner: false } };
const combat = { id: "c1", started: true, scene, combatant: foe, combatants: [foe], getFlag: () => [] };
const hooks = {};
globalThis.game = {
  user: GM, users: Object.assign([GM], { activeGM: GM, filter: (f) => [GM].filter(f) }), world: { id: "crooked-moon-6x" },
  scenes: { active: scene }, playlists: Object.assign([beds, fight, roomPl], { get playing() { return [beds, fight, roomPl].filter((p) => p.playing); }, get: (id) => [beds, fight, roomPl].find((p) => p.id === id) }),
  folders: [], combat: null, actors: [], modules: { get: () => null }, system: { id: "dnd5e" },
  settings: { get: (m, k) => store.get(k), set: async (m, k, v) => { store.set(k, v); return v; } },
};
// every combat in the world (music.js reads the fights themselves, not the tracker's view); `live` overrides
let live = null;
Object.defineProperty(game, "combats", { get: () => live ?? (game.combat ? [game.combat] : []) });
globalThis.Hooks = { callAll: () => {}, on: (h, fn) => { (hooks[h] ??= []).push(fn); }, once: () => {} };
globalThis.foundry = { utils: { fromUuidSync: (u) => docs[u] ?? null, randomID: () => "x" } };
globalThis.fromUuid = async (u) => docs[u] ?? null;
globalThis.CONST = { PLAYLIST_MODES: { SEQUENTIAL: 0, SHUFFLE: 1, SIMULTANEOUS: 2, DISABLED: -1 } };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
const M = await import(pathToFileURL(path.join(ROOT, "scripts", "music.js")).href);
M.registerMusic();
const fire = async (h, ...a) => { for (const fn of hooks[h] ?? []) await fn(...a); await new Promise((r) => setTimeout(r, 0)); };
const playing = () => [...beds.sounds, ...fight.sounds, ...roomPl.sounds].filter((s) => s.playing).map((s) => s.name).sort().join(", ");

// ── the Attic: Dark Ritual is a music bed ────────────────────────────────────────────────────────────────────
beds.sounds.get("ritual").playing = true; // core started the scene's playlist on activation
await new Promise((r) => setTimeout(r, 0));
check("before the fight: only the Attic's bed plays", playing() === "Dark-Ritual", playing());
game.combat = combat;
await fire("combatStart", combat);
check("the Cauldron fight starts → its music plays and Dark Ritual STOPS (one music track)", playing() === "bbeg", playing());
game.combat = null;
await fire("deleteCombat", combat);
check("the fight ends → the fight music stops and Dark Ritual comes back by itself", playing() === "Dark-Ritual", playing());

// ── R6 (seat 2026-11-12): the fight runs on, the DM looks at the first floor, comes back, ends it ──────────────────
// The combat lives on 12.4, so on 12.1 no fight is running there (game.combat is the viewed scene's). Core plays the
// floor's bed on each activation (one beds playlist, sequential: one bed at a time).
{
  const attic = { ...scene }; const first = { ...scene, id: "first", name: "12.1 First Floor", flags: {}, playlistSound: beds.sounds.get("rain") };
  for (const s of [...beds.sounds, ...fight.sounds]) s.playing = false;
  game.scenes.active = attic; await fire("updateScene", attic, { active: true });
  beds.sounds.get("ritual").playing = true;
  game.combat = combat; await fire("combatStart", combat);
  check("R6: the Cauldron fight plays its music, Dark Ritual stopped", playing() === "bbeg", playing());
  game.combat = null; game.scenes.active = first;
  beds.sounds.get("rain").playing = true; // core plays 12.1's bed
  await fire("updateScene", first, { active: true });
  check("R6: on the first floor (no fight there) the rain plays and the fight music stops", playing() === "abandoned-mansion-rain", playing());
  game.combat = combat; game.scenes.active = attic;
  beds.sounds.get("rain").playing = false; beds.sounds.get("ritual").playing = true; // core: back to the Attic's bed
  await fire("updateScene", attic, { active: true });
  check("R6: back in the Attic with the fight still on → its music again, Dark Ritual stopped", playing() === "bbeg", playing());
  game.combat = null; await fire("deleteCombat", combat);
  check("R6: End fight → the Attic's music (Dark Ritual) comes back", playing() === "Dark-Ritual", playing());
  check("R6: …and the layer's state names it as a MUSIC bed (so the deck's Music key can read it, not \"silent\")", M.state().now === "Dark-Ritual" && M.state().nowBed === "music", JSON.stringify({ now: M.state().now, nowBed: M.state().nowBed }));

  // R6 finish (seat 2026-11-12, 19:18): the same trip, as Foundry really orders it. The fight lives on in game.combats,
  // but `game.combat` is the GM's tracker, which still shows the car he LEFT when the activation arrives.
  for (const s of [...beds.sounds, ...fight.sounds]) s.playing = false;
  game.scenes.active = attic; await fire("updateScene", attic, { active: true });
  beds.sounds.get("ritual").playing = true;
  game.combat = combat; live = [combat]; await fire("combatStart", combat);
  check("R6 finish: the Cauldron fight's music plays", playing() === "bbeg", playing());
  game.combat = null; game.scenes.active = first;           // the tracker shows 12.1 (no fight there)
  beds.sounds.get("rain").playing = true;
  await fire("updateScene", first, { active: true });
  check("R6 finish: on the first floor the fight on 12.4 is not the table's: the rain plays", playing() === "abandoned-mansion-rain", playing());
  game.scenes.active = attic;                                // back in the Attic, the tracker NOT yet caught up
  beds.sounds.get("rain").playing = false; beds.sounds.get("ritual").playing = true;
  await fire("updateScene", attic, { active: true });
  check("R6 finish: back in the Attic with the fight on → the fight's music, though the tracker still shows 12.1", playing() === "bbeg", playing());
  check("R6 finish: …and the Music key names the fight (Cauldron Room), not Dark Ritual", M.state().now === "Cauldron Room", JSON.stringify(M.state().now));
  live = null; await fire("deleteCombat", combat);
  check("R6 finish: End fight → Dark Ritual comes back", playing() === "Dark-Ritual", playing());
  game.scenes.active = scene;
}

// ── the first floor: the rain is environment and stays under the fight ──────────────────────────────────────
for (const s of [...beds.sounds, ...fight.sounds]) s.playing = false;
Object.assign(scene, { id: "first", name: "12.1 First Floor", playlistSound: beds.sounds.get("rain") });
await fire("updateScene", scene, { active: true });
beds.sounds.get("rain").playing = true;
game.combat = combat;
await fire("combatStart", combat);
check("12.1: a fight's music comes in and the rain plays on under it (environment layers)", playing() === "abandoned-mansion-rain, bbeg", playing());
game.combat = null;
await fire("deleteCombat", combat);
check("…and after the fight only the rain is left", playing() === "abandoned-mansion-rain", playing());

// ── the second floor: a mood pick (manual) stops the haunted-house bed too ──────────────────────────────────
for (const s of beds.sounds) s.playing = false;
Object.assign(scene, { id: "second", name: "12.2 Second Floor", playlistSound: beds.sounds.get("haunted"), flags: {} });
await fire("updateScene", scene, { active: true });
beds.sounds.get("haunted").playing = true;
store.set("musicState", { manual: { target: { kind: "playlist", uuid: roomPl.uuid }, combatId: null, what: "room" } });
await fire("updateCombat", null, { turn: 1 }); // any event that re-applies the layer
await new Promise((r) => setTimeout(r, 0));
check("12.2: another music track comes in → the haunted-house bed stops (never two music tracks)", playing() === "Velvet Drapes", playing());

console.log(`\nall ${n} passed`);
