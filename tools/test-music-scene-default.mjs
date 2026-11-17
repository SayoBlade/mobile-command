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

const store = new Map([["musicLayer", true], ["musicState", {}], ["combatMusicPlaylist", haint.uuid], ["musicDwellSeconds", 0], ["atticRoomsMade", false], ["sceneMusicAdopted", false]]);
const GM = { id: "gm", isGM: true };
const P1 = { id: "p1", isGM: false };
const users = [GM, P1];
const mkScene = (id, name, o = {}) => {
  const sc = { id, name, flags: {}, tokens: [], regions: [], grid: { size: 100 }, playlist: null, playlistSound: null, ...o };
  sc.getFlag = (m, k) => sc.flags?.[m]?.[k];
  sc.setFlag = async (m, k, v) => { ((sc.flags[m] ??= {}))[k] = v; return sc; };
  sc.update = async (data) => { // dotted keys, then the hook as Foundry fires it (the change nested)
    const ch = {};
    for (const [k, v] of Object.entries(data)) {
      const parts = k.split("."); let o = sc, c = ch;
      for (const q of parts.slice(0, -1)) { o = (o[q] ??= {}); c = (c[q] ??= {}); }
      o[parts.at(-1)] = v; c[parts.at(-1)] = v;
    }
    await fire("updateScene", sc, ch);
    return sc;
  };
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
const tickOnce = () => new Promise((r) => setTimeout(r, 0));
const fire = async (h, ...a) => { for (const fn of hooks[h] ?? []) await fn(...a); await tickOnce(); await tickOnce(); };
// core's own start of a scene's Playlist field on activation (PlaylistCollection#_onChangeScene, Foundry 14), faithfully
let coreState = { playlistId: null, soundId: null }, starts = 0;
game.playlists._onChangeScene = async function (scene) {
  const pid = scene?.playlist?.id ?? null, sid = scene?.playlistSound?.id ?? null;
  if (pid === coreState.playlistId && sid === coreState.soundId) return;
  const prior = all.find((x) => x.id === coreState.playlistId);
  if (prior) { const ps = prior.sounds.get(coreState.soundId); if (ps) ps.playing = false; else if (!coreState.soundId) for (const x of prior.sounds) x.playing = false; }
  coreState = { playlistId: pid, soundId: sid };
  if (scene?.playlistSound) { scene.playlistSound.playing = true; starts += 1; } else if (scene?.playlist) { await scene.playlist.playAll(); starts += 1; }
};
const playing = () => all.flatMap((p) => p.sounds).filter((s) => s.playing).map((s) => s.name).sort().join(", ");
const activate = async (sc) => {
  game.scenes.active = sc; for (const x of scenes) x.active = x === sc;
  await game.playlists._onChangeScene(sc); // core plays the field (wrapped by music.js for a held scene)
  await fire("updateScene", sc, { active: true });
};
M.registerMusic(); // after the fake core, so its _onChangeScene is the one wrapped
const stopAll = () => { for (const s of all.flatMap((p) => p.sounds)) s.playing = false; };
const standAt = async (sc, x, y, t = 0) => {
  for (const s of scenes) s.tokens = s.tokens.filter((tk) => tk !== hero);
  sc.tokens.push(hero); hero.x = x - 50; hero.y = y - 50; // the token's centre at (x, y): grid 100 fake, 1 square
  if (sc.grid.size !== 100) { hero.x = x - sc.grid.size / 2; hero.y = y - sc.grid.size / 2; }
  M.roomTick(1000 + t); M.roomTick(1010 + t); await tickOnce(); await tickOnce();
};

// ── 1–4: the rules, pure ─────────────────────────────────────────────────────────────────────────────────
check("pure: his yes — Druskenvald and Wickermoor Hollow only; the Tender declined (a little buildup); no default on the landing",
  Object.keys(C.SCENE_MUSIC_APPROVED).sort().join() === [drusk.id, hollow.id].sort().join() && tender.id in C.SCENE_MUSIC_DECLINED
  && !(landing.id in C.SCENE_MUSIC_APPROVED) && Object.values(C.SCENE_MUSIC_APPROVED).every((id) => docs[`Playlist.${id}`]) && C.sceneMusicOf({ flags: {} }) === null);
check("pure: his flag is the default; 'none' is none", C.sceneMusicOf({ flags: { [MOD]: { music: { default: eerie.uuid } } } }) === eerie.uuid && C.sceneMusicOf({ flags: { [MOD]: { music: { default: "none" } } } }) === null);
check("pure: a map with ROOMS never gets a default, even one he flagged (music there comes only from rooms)", C.sceneMusicOf({ flags: { [MOD]: { music: { default: eerie.uuid } } }, hasRooms: true }) === null);
check("pure: a music hold holds until its time, and never past it (a ride that never lets go cannot silence the car)",
  C.musicHoldOf({ [MOD]: { musicHold: { until: 5000 } } }, 4000) === 5000 && C.musicHoldOf({ [MOD]: { musicHold: { until: 5000 } } }, 5000) === 0
  && C.musicHoldOf({ [MOD]: { musicHold: { until: 0 } } }, 1) === 0 && C.musicHoldOf({}, 1) === 0 && C.MUSIC_HOLD_MAX_MS === 20000);

// ── 5–8: his yes, written once on his GM load, never over a choice of his ───────────────────────────────────
await activate(landing);
check("the landing room → no music starts (the ride brings it)", playing() === "", playing());
hollow.flags[MOD] = { music: { default: eerie.uuid } }; // as if Wickermoor Hollow already carried a choice of his
const once = await M.adoptApprovedOnce();
check("the one-time step: Druskenvald → Room · Off the Spectral Rails; a scene with his own choice left as he has it; the landing and the Tender untouched",
  once?.ok && once.set.length === 1 && drusk.flags[MOD].music.default.endsWith("cmroM7sdO9ufQBvA") && hollow.flags[MOD].music.default === eerie.uuid
  && once.kept.some((k) => /Hollow: has his own/.test(k)) && !landing.flags[MOD]?.music && !tender.flags[MOD]?.music, JSON.stringify(once));
check("…its marker is set, and a second load writes nothing", store.get("sceneMusicAdopted") === true && (await M.adoptApprovedOnce()) === null);
delete hollow.flags[MOD].music.default;
const ad = await M.adoptSceneMusic([hollow.id]);
check("on a clean Wickermoor Hollow the same step gives it its own list (Room · Wickermoor Hollow)", ad.set.length === 1 && hollow.flags[MOD].music.default.endsWith("cmroAveP8tcNEzPe"), JSON.stringify(ad));

// ── 9–16: Start ride — the train, the lights, THEN the music (2 s after the lamps; deck-command ride.js) ─────
stopAll(); starts = 0;
const h = await M.holdMusic(car1, 9000);
await activate(car1);
check("held, the dark car activates → core's start of 10.1's own list is deferred and the layer starts nothing: silence but the train",
  h.ok && playing() === "" && starts === 0 && C.musicHoldOf(car1.flags) === h.until, `${playing()} starts=${starts}`);
const rel = await M.releaseMusic(car1);
check("let go (2 s after the lamps) → Room · Passenger Car starts, once (core's own start; the layer finds it playing)",
  rel.ok && rel.started && playing() === "Carriage Through Fog" && starts === 1 && C.musicHoldOf(car1.flags) === 0, `${playing()} starts=${starts} ${JSON.stringify(rel)}`);
await activate(tender);
check("on to the Tender → the Passenger Car stops and nothing replaces it (no music there, on purpose)", playing() === "", playing());
stopAll(); car1.flags[MOD].musicHold = { until: Date.now() - 1 }; await activate(car1);
check("a hold that has run out holds nothing: the car's list starts on activation", playing() === "Carriage Through Fog", playing());
await activate(drusk);
check("Druskenvald → its default (Room · Off the Spectral Rails) crossfades in; the Passenger Car stops", playing() === "Tides Move Inward", playing());
const foe = { actor: { id: "haint", type: "npc", getFlag: () => undefined, hasPlayerOwner: false } };
const c2 = { id: "c2", started: true, scene: drusk, combatant: foe, combatants: [foe], getFlag: () => [] };
game.combat = c2; await fire("combatStart", c2);
check("a fight in Druskenvald → the world's battle music (Haint Fight) replaces the default", playing() === "Blood In The Hall", playing());
game.combat = null; await fire("deleteCombat", c2);
check("…and the default crossfades back after it", playing() === "Tides Move Inward", playing());
stopAll(); drusk.flags[MOD].music.default = empty.uuid; await activate(landing); await activate(drusk);
check("a default naming a playlist with no tracks (Calm) is ignored: nothing starts", playing() === "", playing());

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

// SEAT 7 (2026-11-17): after a fight ≈ 1.5 s of near-silence, then the room faded in. The incoming file LOADS before it
// sounds; the fight must keep playing until it does (a crossfade, not a gap).
const events = [];
const loading = (s) => { s.sound = { playing: false }; setTimeout(() => { s.sound.playing = true; events.push(`${s.name} sounding`); }, 120); };
for (const pl of all) {
  const ps = pl.playSound, pa = pl.playAll, st = pl.stopSound;
  pl.playSound = async (s) => { await ps(s); loading(s); };
  pl.playAll = async () => { await pa(); if (pl.sounds[0]) loading(pl.sounds[0]); };
  pl.stopSound = async (s) => { events.push(`${s.name} stopped`); await st(s); };
}
const c5 = { id: "c5", started: true, scene: attic, combatant: foe, combatants: [foe], getFlag: () => [] };
game.combat = c5; await fire("combatStart", c5);
const atFight = events.join(" | ");
check("a fight begins: the room's music is stopped only once the fight track is sounding",
  atFight.indexOf("bbeg sounding") >= 0 && atFight.indexOf("bbeg sounding") < atFight.indexOf("Bone Chapel stopped"), atFight);
events.length = 0;
game.combat = null; await fire("deleteCombat", c5);
const atEnd = events.join(" | ");
check("the fight ends: the fight plays on until the room's music is SOUNDING, then fades out under it (no gap)",
  atEnd.indexOf("Bone Chapel sounding") >= 0 && atEnd.indexOf("Bone Chapel sounding") < atEnd.indexOf("bbeg stopped") && playing() === "Bone Chapel", atEnd);
const W = await import(pathToFileURL(path.join(ROOT, "scripts", "music.js")).href);
const stuck = { documentName: "PlaylistSound", playing: true, sound: { playing: false } };
let clock = 0;
const gaveUp = await W.waitAudible(stuck, { timeoutMs: 6000, step: 50, now: () => clock, wait: async (ms) => { clock += ms; } });
check("a file that never loads holds the old music at most 6 s, then lets go", gaveUp === false && clock >= 6000 && clock < 6100, String(clock));

console.log(`\nall ${n} passed`);
