// A scene's DEFAULT soundtrack (DM 2026-11-17, SEAT 5; DESIGN §59): "I want a quiet soundtrack default for each scene,
// the idea is to keep the environmental sound on and switch to combat music instead of the default music during combat."
// Drives music.js's own hooks (scene activation, the room clock, combat start/end) against a fake world with 6x's ids.
// Run: node tools/test-music-scene-default.mjs   (numbered; stops at the first failure)
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

const docs = {};
const all = [];
function playlist(id, name, flags, sounds) {
  const pl = { id, name, uuid: `Playlist.${id}`, documentName: "Playlist", flags, fade: 0,
    getFlag: (m, k) => flags?.[m]?.[k], update: async () => {}, mode: 0 };
  pl.sounds = Object.assign(sounds.map((s) => Object.assign(s, { parent: pl, documentName: "PlaylistSound", uuid: `${pl.uuid}.PlaylistSound.${s.id}`, getFlag: (m, k) => s.flags?.[m]?.[k] })), { get: (id2) => pl.sounds.find((s) => s.id === id2), contents: null });
  pl.sounds.contents = pl.sounds;
  pl.sounds.size = pl.sounds.length;
  Object.defineProperty(pl, "playing", { get: () => pl.sounds.some((s) => s.playing) });
  pl.playAll = async () => { if (pl.sounds[0]) pl.sounds[0].playing = true; };
  pl.playSound = async (s) => { s.playing = true; };
  pl.stopSound = async (s) => { s.playing = false; };
  docs[pl.uuid] = pl; for (const s of pl.sounds) docs[s.uuid] = s;
  all.push(pl);
  return pl;
}
const track = (id, name) => ({ id, name, path: `${id}.ogg`, playing: false, flags: {} });
const room = (id, name, key, t) => playlist(id, name, { [MOD]: { music: { role: "room", key } } }, [track(`${id}-1`, t)]);
// the 6x playlists the picks name (ids as in the world)
const passenger = room("cmron2HWl0FUr6gR", "Room · Passenger Car", "passenger-car", "Carriage Through Fog");
const baggage = room("cmror6Nct8Pen2I3", "Room · Baggage Car", "baggage-car", "Breathing Behind the Door");
room("cmroM7sdO9ufQBvA", "Room · Off the Spectral Rails", "off-the-spectral-rails", "Tides Move Inward");
room("cmroAveP8tcNEzPe", "Room · Wickermoor Hollow", "wickermoor-hollow", "Lanterns Between Trees");
const estate = room("cmro2nWH0lUFyjHW", "Room · Druskenvald Estate", "druskenvald-estate", "The Ancestral Estate");
const foyer = room("cmrobq7MZo5KfuWH", "Room · Foyer", "foyer", "Guest at the Gate");
const eerie = playlist("cmmoI3oZK5qbEzBQ", "Mood · Eerie", { [MOD]: { music: { role: "mood", key: "eerie" } } }, [track("eerie-1", "Architecture That Watches")]);
const empty = playlist("cmmor6Lap4JYn2gR", "Mood · Calm", { [MOD]: { music: { role: "mood", key: "calm" } } }, []);
const bed = (id, cm, name) => ({ id, name, path: `${name}.ogg`, repeat: true, playing: false, flags: { [MOD]: { cm } } });
const beds = playlist("VQIqq23NxXQ9yQtZ", "CM 12 — Beds", {}, [bed("rain", "12.1:bed", "rain"), bed("ritual", "12.4:bed", "Dark-Ritual")]);
const fight = playlist("vxiJygkc1EJ4Wv2p", "Fight · Crooked House", { [MOD]: { music: { role: "battle", key: "crooked-house" } } }, [track("lastdragon", "The Last Dragonlord")]);
const haint = playlist("cmbaaL6rYJ4pWHl0", "Fight · Haint Fight", { [MOD]: { music: { role: "battle", key: "haint-fight" } } }, [track("blood", "Blood In The Hall")]);

const store = new Map([["musicLayer", true], ["musicState", {}], ["combatMusicPlaylist", haint.uuid], ["musicDwellSeconds", 0]]);
const GM = { id: "gm", isGM: true };
const P1 = { id: "p1", isGM: false };
const users = [GM, P1];
const mkScene = (id, name, o = {}) => ({ id, name, flags: {}, tokens: [], regions: [], grid: { size: 100 }, playlist: null, playlistSound: null, ...o });
const landing = mkScene("dcLandingRoom001", "The Crooked Moon");
const car1 = mkScene("uW1VhjyAIsyXUayN", "10.1 Passenger Car", { playlist: passenger });
const tender = mkScene("rnp1No8kbQe8ejMU", "10.8 Tender");
const foyerRegion = { name: "Music · Foyer", shapes: [{ type: "rectangle", x: 0, y: 0, width: 500, height: 500, rotation: 0 }],
  behaviors: [{ type: `${MOD}.music`, uuid: "Scene.skz.Region.foyer.RegionBehavior.b", disabled: false, system: { playlist: foyer.uuid, fade: null, label: "Foyer" } }] };
const house = mkScene("skzmyUz6MM2U4862", "12.1 First Floor", { playlist: beds, playlistSound: beds.sounds.get("rain"),
  flags: { [MOD]: { music: { battle: fight.uuid } } }, regions: [foyerRegion] });
const attic = mkScene("N7rxbhvGMk3cs6k5", "12.4 Attic", { playlist: beds, playlistSound: beds.sounds.get("ritual") });
const hero = { id: "barb", x: 1000, y: 1000, width: 1, height: 1, getFlag: () => undefined,
  actor: { id: "a1", type: "character", getFlag: () => undefined, testUserPermission: (u) => u.id === "p1" } };
house.tokens.push(hero);

const hooks = {};
globalThis.game = {
  user: GM, users: Object.assign(users, { activeGM: GM }), world: { id: "crooked-moon-6x" },
  scenes: { active: landing }, playlists: Object.assign(all, { get playing() { return all.filter((p) => p.playing); }, get: (id) => all.find((p) => p.id === id) }),
  folders: [], combat: null, actors: [], modules: { get: () => null }, system: { id: "dnd5e" },
  settings: { get: (m, k) => store.get(k), set: async (m, k, v) => { store.set(k, v); return v; } },
};
Object.defineProperty(game, "combats", { get: () => (game.combat ? [game.combat] : []) });
globalThis.Hooks = { callAll: () => {}, on: (h, fn) => { (hooks[h] ??= []).push(fn); }, once: () => {} };
globalThis.foundry = { utils: { fromUuidSync: (u) => docs[u] ?? null, randomID: () => "x" } };
globalThis.fromUuid = async (u) => docs[u] ?? null;
globalThis.CONST = { PLAYLIST_MODES: { SEQUENTIAL: 0, SHUFFLE: 1, SIMULTANEOUS: 2, DISABLED: -1 } };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
const M = await import(pathToFileURL(path.join(ROOT, "scripts", "music.js")).href);
const C = await import(pathToFileURL(path.join(ROOT, "scripts", "music-core.js")).href);
M.registerMusic();
const tickOnce = () => new Promise((r) => setTimeout(r, 0));
const fire = async (h, ...a) => { for (const fn of hooks[h] ?? []) await fn(...a); await tickOnce(); await tickOnce(); };
const playing = () => all.flatMap((p) => p.sounds).filter((s) => s.playing).map((s) => s.name).sort().join(", ");
const activate = async (sc) => {
  game.scenes.active = sc;
  // core plays the scene's own Playlist field on activation (its sound, or the whole list)
  if (sc.playlistSound) sc.playlistSound.playing = true; else if (sc.playlist) await sc.playlist.playAll();
  await fire("updateScene", sc, { active: true });
};
const stopAll = () => { for (const s of all.flatMap((p) => p.sounds)) s.playing = false; };

// ── the picks themselves (pure) ─────────────────────────────────────────────────────────────────────────────
check("pure: MC's pick for a scene of The Crooked Moon (the Tender → Room · Baggage Car)", C.sceneMusicOf({ id: "rnp1No8kbQe8ejMU", flags: {}, worldId: "crooked-moon-6x" }) === baggage.uuid);
check("pure: no pick in another world, nor for a scene that has music of its own (10.1)",
  C.sceneMusicOf({ id: "rnp1No8kbQe8ejMU", flags: {}, worldId: "other" }) === null && C.sceneMusicOf({ id: car1.id, flags: {}, worldId: "crooked-moon-6x" }) === null);
check("pure: his scene flag wins over the pick; \"none\" turns the pick off",
  C.sceneMusicOf({ id: tender.id, flags: { [MOD]: { music: { default: eerie.uuid } } }, worldId: "crooked-moon-6x" }) === eerie.uuid
  && C.sceneMusicOf({ id: tender.id, flags: { [MOD]: { music: { default: "none" } } }, worldId: "crooked-moon-6x" }) === null);
check("pure: every pick names one of his playlists here, and none goes to a scene whose field already plays music",
  Object.values(C.SCENE_MUSIC).every((id) => docs[`Playlist.${id}`]) && !(car1.id in C.SCENE_MUSIC) && !(attic.id in C.SCENE_MUSIC));

// ── the intros: the landing room has no music of its own ───────────────────────────────────────────────────
await activate(landing);
check("the landing room activates → its default (Room · Passenger Car) starts on its own", playing() === "Carriage Through Fog", playing());
await activate(car1);
check("the train starts on 10.1 → the same playlist plays on, unbroken (10.1's own field is that playlist)", playing() === "Carriage Through Fog" && passenger.sounds[0].playing, playing());
await activate(tender);
check("into the Tender (no music of its own) → Room · Baggage Car crossfades in; the Passenger Car stops", playing() === "Breathing Behind the Door", playing());
await activate(car1);
check("back on 10.1 → its own room music again, the Tender's default stopped", playing() === "Carriage Through Fog", playing());

// ── the Crooked House's first floor: only the rain in its field ────────────────────────────────────────────
stopAll();
await activate(house);
check("12.1 activates → the rain (environment) AND the default soundtrack (Room · Druskenvald Estate)", playing() === "The Ancestral Estate, rain", playing());
hero.x = 100; hero.y = 100;           // the party stands in the Foyer
M.roomTick(Date.now()); M.roomTick(Date.now() + 10); await tickOnce(); await tickOnce();
check("the party in the Foyer → the room's music overrides the default; the rain plays on", playing() === "Guest at the Gate, rain", playing());
hero.x = 1000; hero.y = 1000;         // out in the hall again
M.roomTick(Date.now() + 20); M.roomTick(Date.now() + 30); await tickOnce(); await tickOnce();
check("out of the room into the hall → the room's music KEEPS playing (his 2026-10-31 rule: an unscored spot keeps the music); the rain plays on", playing() === "Guest at the Gate, rain", playing());
const foe = { actor: { id: "weasel", type: "npc", getFlag: () => undefined, hasPlayerOwner: false } };
const combat = { id: "c1", started: true, scene: house, combatant: foe, combatants: [foe], getFlag: () => [] };
game.combat = combat; await fire("combatStart", combat);
check("a fight starts on 12.1 → the scene's fight music replaces the default; the rain plays on", playing() === "The Last Dragonlord, rain", playing());
check("…and the fight sounds sit 3 dB over the default music (the mix's combat lift)", (await import(pathToFileURL(path.join(ROOT, "scripts", "sound-mix.js")).href)).combatLiftDbOf(fight.sounds[0]) === 3);
game.combat = null; await fire("deleteCombat", combat);
check("the fight ends → what played before it comes back (the Foyer's music), the fight music stops, the rain still plays", playing() === "Guest at the Gate, rain", playing());
stopAll(); await activate(house); // a fresh visit: no room settled
check("12.1 again (no room settled) → the floor's default over the rain", playing() === "The Ancestral Estate, rain", playing());
const c1b = { id: "c1b", started: true, scene: house, combatant: foe, combatants: [foe], getFlag: () => [] };
game.combat = c1b; await fire("combatStart", c1b);
check("a fight there → the fight music replaces the default; the rain plays on", playing() === "The Last Dragonlord, rain", playing());
game.combat = null; await fire("deleteCombat", c1b);
check("the fight ends → the floor's default soundtrack crossfades back; the rain still plays", playing() === "The Ancestral Estate, rain", playing());

// ── a fight on a scene with no fight music of its own: the battle library ─────────────────────────────────
stopAll(); await activate(tender);
const c2 = { id: "c2", started: true, scene: tender, combatant: foe, combatants: [foe], getFlag: () => [] };
game.combat = c2; await fire("combatStart", c2);
check("a fight in the Tender (no fight flag) → the world's battle music (Haint Fight) replaces the default", playing() === "Blood In The Hall", playing());
game.combat = null; await fire("deleteCombat", c2);
check("…and after it the Tender's default comes back", playing() === "Breathing Behind the Door", playing());

// ── his overrides ─────────────────────────────────────────────────────────────────────────────────────────
stopAll();
house.flags[MOD].music.default = "none";
await activate(house);
check("his flag \"none\" on 12.1 → only the rain, as before", playing() === "rain", playing());
stopAll();
house.flags[MOD].music.default = eerie.uuid;
await activate(house);
check("his flag naming another playlist (Mood · Eerie) → that plays over the rain instead of MC's pick", playing() === "Architecture That Watches, rain", playing());
stopAll();
house.flags[MOD].music.default = empty.uuid;
await activate(house);
check("a default naming a playlist with no tracks (Calm) → ignored: only the rain, nothing silenced", playing() === "rain", playing());
delete house.flags[MOD].music.default;

// ── a floor whose bed is its music (12.4): untouched ──────────────────────────────────────────────────────
stopAll(); await activate(attic);
check("12.4 (its Dark Ritual bed is the floor's music) → that bed alone, no second music track", playing() === "Dark-Ritual", playing());

console.log(`\nall ${n} passed`);
