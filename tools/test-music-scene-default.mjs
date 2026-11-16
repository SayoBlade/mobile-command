// Music by ROOM, a default only where a map has no rooms and only when he says so (DM 2026-11-17, SEAT 5; DESIGN §59).
// His correction: "Wait, so music starts when the party enters a room? I actually like that better" and "But I want
// music for the attic too". Drives music.js's own hooks (activation, the room clock, combat start/end) and cm-attic.js
// against a fake world with 6x's ids.
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
const passenger = room("cmron2HWl0FUr6gR", "Room · Passenger Car", "passenger-car", "Carriage Through Fog");
const baggage = room("cmror6Nct8Pen2I3", "Room · Baggage Car", "baggage-car", "Breathing Behind the Door");
room("cmroM7sdO9ufQBvA", "Room · Off the Spectral Rails", "off-the-spectral-rails", "Tides Move Inward");
room("cmroAveP8tcNEzPe", "Room · Wickermoor Hollow", "wickermoor-hollow", "Lanterns Between Trees");
room("cmro4pYJ6raL8tHW", "Room · Abandoned Church", "abandoned-church", "Bone Chapel");
const foyer = room("cmrobq7MZo5KfuWH", "Room · Foyer", "foyer", "Guest at the Gate");
const eerie = playlist("cmmoI3oZK5qbEzBQ", "Mood · Eerie", { [MOD]: { music: { role: "mood", key: "eerie" } } }, [track("eerie-1", "Architecture That Watches")]);
const empty = playlist("cmmor6Lap4JYn2gR", "Mood · Calm", { [MOD]: { music: { role: "mood", key: "calm" } } }, []);
const bed = (id, cm, name) => ({ id, name, path: `${name}.ogg`, repeat: true, playing: false, flags: { [MOD]: { cm } } });
const beds = playlist("VQIqq23NxXQ9yQtZ", "CM 12 — Beds", {}, [bed("rain", "12.1:bed", "rain"), bed("ritual", "12.4:bed", "Dark-Ritual")]);
const fight = playlist("vxiJygkc1EJ4Wv2p", "Fight · Crooked House", { [MOD]: { music: { role: "battle", key: "crooked-house" } } }, [track("lastdragon", "The Last Dragonlord")]);
const cauldronFight = playlist("gszxbhYuogCcgm51", "Fight · Cauldron Room", { [MOD]: { music: { role: "battle", key: "cauldron-room" } } }, [track("bbeg", "bbeg")]);
const haint = playlist("cmbaaL6rYJ4pWHl0", "Fight · Haint Fight", { [MOD]: { music: { role: "battle", key: "haint-fight" } } }, [track("blood", "Blood In The Hall")]);

const store = new Map([["musicLayer", true], ["musicState", {}], ["combatMusicPlaylist", haint.uuid], ["musicDwellSeconds", 0], ["atticRoomsMade", false]]);
const GM = { id: "gm", isGM: true };
const P1 = { id: "p1", isGM: false };
const users = [GM, P1];
const mkScene = (id, name, o = {}) => {
  const sc = { id, name, flags: {}, tokens: [], regions: [], grid: { size: 100 }, playlist: null, playlistSound: null, ...o };
  sc.getFlag = (m, k) => sc.flags?.[m]?.[k];
  sc.setFlag = async (m, k, v) => { ((sc.flags[m] ??= {}))[k] = v; return sc; };
  sc.createEmbeddedDocuments = async (type, data) => data.map((d) => {
    const r = { ...d, behaviors: (d.behaviors ?? []).map((b, i) => ({ ...b, uuid: `Scene.${id}.Region.${d.flags[MOD].cm}.RegionBehavior.${i}`, disabled: false })) };
    sc.regions.push(r); return r;
  });
  return sc;
};
const landing = mkScene("dcLandingRoom001", "The Crooked Moon");
const car1 = mkScene("uW1VhjyAIsyXUayN", "10.1 Passenger Car", { playlist: passenger });
const tender = mkScene("rnp1No8kbQe8ejMU", "10.8 Tender");
const drusk = mkScene("UbgWWsXfPSmO9dWu", "Druskenvald");
const hollow = mkScene("W1Kw4TXP0Mw9zVMw", "Wickermoor Hollow");
const foyerRegion = { name: "Music · Foyer", shapes: [{ type: "rectangle", x: 0, y: 0, width: 500, height: 500, rotation: 0 }],
  behaviors: [{ type: `${MOD}.music`, uuid: "Scene.skz.Region.foyer.RegionBehavior.b", disabled: false, system: { playlist: foyer.uuid, fade: null, label: "Foyer" } }] };
const house = mkScene("skzmyUz6MM2U4862", "12.1 First Floor", { playlist: beds, playlistSound: beds.sounds.get("rain"),
  flags: { [MOD]: { music: { battle: fight.uuid } } }, regions: [foyerRegion] });
const attic = mkScene("N7rxbhvGMk3cs6k5", "12.4 Attic", { playlist: beds, playlistSound: beds.sounds.get("ritual"), grid: { size: 140 },
  flags: { [MOD]: { music: { battle: cauldronFight.uuid } } } });
const hero = { id: "barb", x: 1000, y: 1000, width: 1, height: 1, getFlag: () => undefined,
  actor: { id: "a1", type: "character", getFlag: () => undefined, testUserPermission: (u) => u.id === "p1" } };
const scenes = [landing, car1, tender, drusk, hollow, house, attic];

const hooks = {};
globalThis.game = {
  user: GM, users: Object.assign(users, { activeGM: GM }), world: { id: "crooked-moon-6x" },
  scenes: Object.assign(scenes, { active: landing, get: (id) => scenes.find((s) => s.id === id) }),
  playlists: Object.assign(all, { get playing() { return all.filter((p) => p.playing); }, get: (id) => all.find((p) => p.id === id) }),
  folders: [], combat: null, actors: [], modules: { get: () => null }, system: { id: "dnd5e" },
  settings: { get: (m, k) => store.get(k), set: async (m, k, v) => { store.set(k, v); return v; } },
};
Object.defineProperty(game, "combats", { get: () => (game.combat ? [game.combat] : []) });
globalThis.Hooks = { callAll: () => {}, on: (h, fn) => { (hooks[h] ??= []).push(fn); }, once: () => {} };
globalThis.foundry = { utils: { fromUuidSync: (u) => docs[u] ?? null, randomID: () => "x" } };
globalThis.fromUuid = async (u) => docs[u] ?? null;
globalThis.CONST = { PLAYLIST_MODES: { SEQUENTIAL: 0, SHUFFLE: 1, SIMULTANEOUS: 2, DISABLED: -1 }, REGION_VISIBILITY: { LAYER_UNLOCKED: 0 } };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
const M = await import(pathToFileURL(path.join(ROOT, "scripts", "music.js")).href);
const C = await import(pathToFileURL(path.join(ROOT, "scripts", "music-core.js")).href);
const A = await import(pathToFileURL(path.join(ROOT, "scripts", "cm-attic.js")).href);
M.registerMusic();
const tickOnce = () => new Promise((r) => setTimeout(r, 0));
const fire = async (h, ...a) => { for (const fn of hooks[h] ?? []) await fn(...a); await tickOnce(); await tickOnce(); };
const playing = () => all.flatMap((p) => p.sounds).filter((s) => s.playing).map((s) => s.name).sort().join(", ");
const activate = async (sc) => {
  game.scenes.active = sc;
  if (sc.playlistSound) sc.playlistSound.playing = true; else if (sc.playlist) await sc.playlist.playAll(); // core plays the field
  await fire("updateScene", sc, { active: true });
};
const stopAll = () => { for (const s of all.flatMap((p) => p.sounds)) s.playing = false; };
const standAt = async (sc, x, y, t = 0) => {
  for (const s of scenes) s.tokens = s.tokens.filter((tk) => tk !== hero);
  sc.tokens.push(hero); hero.x = x - 50; hero.y = y - 50; // the token's centre at (x, y): grid 100 fake, 1 square
  if (sc.grid.size !== 100) { hero.x = x - sc.grid.size / 2; hero.y = y - sc.grid.size / 2; }
  M.roomTick(1000 + t); M.roomTick(1010 + t); await tickOnce(); await tickOnce();
};

// ── 1–4: the rules, pure ─────────────────────────────────────────────────────────────────────────────────
check("pure: MC never plays a default of its own — a proposed scene with no flag has none", C.sceneMusicOf({ flags: {} }) === null && tender.id in C.SCENE_MUSIC_PROPOSED);
check("pure: his flag is the default; \"none\" is none", C.sceneMusicOf({ flags: { [MOD]: { music: { default: eerie.uuid } } } }) === eerie.uuid && C.sceneMusicOf({ flags: { [MOD]: { music: { default: "none" } } } }) === null);
check("pure: a map with ROOMS never gets a default, even one he flagged (music there comes only from rooms)", C.sceneMusicOf({ flags: { [MOD]: { music: { default: eerie.uuid } } }, hasRooms: true }) === null);
check("pure: the four proposals are maps with no rooms and no music of their own, each naming one of his playlists",
  Object.keys(C.SCENE_MUSIC_PROPOSED).sort().join() === [landing.id, tender.id, drusk.id, hollow.id].sort().join() && Object.values(C.SCENE_MUSIC_PROPOSED).every((id) => docs[`Playlist.${id}`]));

// ── 5–8: before his yes, nothing new plays; adopting writes only where nothing of his is ─────────────────────
await activate(landing);
check("the landing room activates before his yes → nothing new starts (no auto-play)", playing() === "", playing());
tender.flags[MOD] = { music: { default: eerie.uuid } }; // the Tender already carries a choice of his
const ad = await M.adoptSceneMusic();
check("adoptSceneMusic(): the landing room, Druskenvald and Wickermoor Hollow get their proposal",
  ad.ok && ad.set.length === 3 && landing.flags[MOD].music.default === passenger.uuid && drusk.flags[MOD].music.default.endsWith("cmroM7sdO9ufQBvA") && hollow.flags[MOD].music.default.endsWith("cmroAveP8tcNEzPe"), JSON.stringify(ad));
check("…and a scene that has his own default (the Tender) is left as he has it", tender.flags[MOD].music.default === eerie.uuid && ad.kept.some((k) => /Tender: has his own/.test(k)), JSON.stringify(ad.kept));
delete tender.flags[MOD].music.default;
const ad2 = await M.adoptSceneMusic([tender.id]);
check("adoptSceneMusic([the Tender]) once he says yes to it alone → Room · Baggage Car", ad2.set.length === 1 && tender.flags[MOD].music.default === baggage.uuid, JSON.stringify(ad2));

// ── 9–14: the defaults he adopted, on maps with no rooms; combat in their place ─────────────────────────────
stopAll(); await activate(landing);
check("the landing room → its default (Room · Passenger Car) starts on activation", playing() === "Carriage Through Fog", playing());
await activate(car1);
check("the train starts on 10.1 → the same playlist plays on, unbroken (10.1's own field is that list)", playing() === "Carriage Through Fog", playing());
await activate(tender);
check("the Tender → Room · Baggage Car crossfades in; the Passenger Car stops", playing() === "Breathing Behind the Door", playing());
const foe = { actor: { id: "haint", type: "npc", getFlag: () => undefined, hasPlayerOwner: false } };
const c2 = { id: "c2", started: true, scene: tender, combatant: foe, combatants: [foe], getFlag: () => [] };
game.combat = c2; await fire("combatStart", c2);
check("a fight in the Tender → the world's battle music (Haint Fight) replaces the default", playing() === "Blood In The Hall", playing());
game.combat = null; await fire("deleteCombat", c2);
check("…and the Tender's default crossfades back after it", playing() === "Breathing Behind the Door", playing());
stopAll(); tender.flags[MOD].music.default = empty.uuid; await activate(tender);
check("a default naming a playlist with no tracks (Calm) is ignored: nothing starts, nothing goes silent by it", playing() === "", playing());

// ── 15–19: a map WITH rooms: music only from its rooms ───────────────────────────────────────────────────
stopAll(); house.flags[MOD].music.default = eerie.uuid; // even a flag of his does not play over a map with rooms
await standAt(house, 1000, 1000);
await activate(house);
check("12.1 (rooms) → only the rain: no scene-wide music, even with a default flag on it", playing() === "rain", playing());
await standAt(house, 100, 100);
check("the party enters the Foyer → its music starts; the rain plays on", playing() === "Guest at the Gate, rain", playing());
const c1 = { id: "c1", started: true, scene: house, combatant: foe, combatants: [foe], getFlag: () => [] };
game.combat = c1; await fire("combatStart", c1);
check("a fight on 12.1 → the house's fight music replaces the room's; the rain (environment) plays on", playing() === "The Last Dragonlord, rain", playing());
game.combat = null; await fire("deleteCombat", c1);
check("the fight ends → the Foyer's music crossfades back; the rain still plays", playing() === "Guest at the Gate, rain", playing());
delete house.flags[MOD].music.default;

// ── 19–26: the attic gets its two book rooms; music by room there too ────────────────────────────────────
const plan = A.planAtticRooms({ scene: { regions: [] }, playlists: all.map((p) => p.id) });
check("attic plan: two rooms, H16 Secret Landing and H17 Cauldron Room, each on one of his room playlists",
  plan.make.map((r) => r.book).join() === "H16,H17" && plan.make.every((r) => docs[`Playlist.${r.playlist}`]?.flags?.[MOD]?.music?.role === "room"));
check("attic plan: nothing made where he has a Music region of his own, nor twice, nor with a playlist gone",
  A.planAtticRooms({ scene: { regions: [{ cm: null, music: true }] }, playlists: all.map((p) => p.id) }).make.length === 0
  && A.planAtticRooms({ scene: { regions: [{ cm: "music:12.4:landing", music: true }, { cm: "music:12.4:cauldron", music: true }] }, playlists: all.map((p) => p.id) }).make.length === 0
  && A.planAtticRooms({ scene: { regions: [] }, playlists: [] }).make.length === 0);
// the shapes are the map's walls: the book's spots fall in the right room (the creak squares; the cauldron; the ladder)
const inR = (key, x, y) => C.inRegion([{ type: "polygon", points: A.ATTIC_ROOMS.find((r) => r.key === key).points }], x, y);
check("the walls' rooms: the Secret Landing holds its creak squares and the runes; the Cauldron Room holds the cauldron",
  inR("music:12.4:landing", 1330, 1190) && inR("music:12.4:landing", 1750, 1050) && inR("music:12.4:landing", 1470, 1050)
  && inR("music:12.4:cauldron", 1610, 1680) && inR("music:12.4:cauldron", 1750, 1610) && !inR("music:12.4:landing", 1610, 1680) && !inR("music:12.4:cauldron", 1330, 1190));
const made = await A.makeAtticRooms();
check("makeAtticRooms(): both regions made once on the primary GM's load, the marker set; a second load makes nothing",
  made?.length === 2 && attic.regions.length === 2 && store.get("atticRoomsMade") === true && (await A.makeAtticRooms()) === null, JSON.stringify(made));
stopAll(); await standAt(attic, 1610, 1050); // at the top of the ladder
await activate(attic);
await standAt(attic, 1610, 1050, 100);
check("the party on the Secret Landing → Room · Off the Spectral Rails (the floor's Dark Ritual drone yields: one music track)", playing() === "Tides Move Inward", playing());
await standAt(attic, 1610, 1820, 200);
check("through the little door into the Cauldron Room → Room · Abandoned Church", playing() === "Bone Chapel", playing());
const c4 = { id: "c4", started: true, scene: attic, combatant: foe, combatants: [foe], getFlag: () => [] };
game.combat = c4; await fire("combatStart", c4);
check("the Cauldron fight → Fight · Cauldron Room replaces the room's music", playing() === "bbeg", playing());
game.combat = null; await fire("deleteCombat", c4);
check("…and the Cauldron Room's music comes back after it", playing() === "Bone Chapel", playing());

console.log(`\nall ${n} passed`);
