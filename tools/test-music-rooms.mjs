// Room switching glue (scripts/music.js): who counts as the party, which regions are scored rooms,
// and the 5-second whole-party rule driven against a fake world. Headless: no Foundry.
// Run: node tools/test-music-rooms.mjs   (stops at the first failure)
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}

// ── a fake world ──────────────────────────────────────────────────────────────────────────────────
const MOD = "mobile-command";
const GM = { id: "gm", isGM: true }, P1 = { id: "p1", isGM: false }, P2 = { id: "p2", isGM: false }, TV = { id: "tv", isGM: false };
const store = new Map([["musicLayer", true], ["musicDwellSeconds", 5], ["displayOwnerUser", "tv"], ["musicState", {}]]);
const owned = (...ids) => (u, lvl) => lvl === "OWNER" && ids.includes(u.id);
const actor = (id, type, owners, extra = {}) => ({ id, type, flags: {}, getFlag: () => undefined, testUserPermission: owned(...owners), ...extra });
const tok = (id, a, x, y, extra = {}) => ({ id, actor: a, x, y, width: 1, height: 1, hidden: false, getFlag: () => undefined, ...extra });
const regionOf = (id, name, rect, behaviors) => ({ id, name, shapes: [{ type: "rectangle", rotation: 0, ...rect }], behaviors });
const music = (id, playlist, extra = {}) => ({ uuid: `Region.${id}.Behavior.m`, type: `${MOD}.music`, disabled: false, system: { playlist, fade: null, label: "" }, ...extra });

const scene = { id: "S", grid: { size: 100 }, tokens: [], regions: [], playlist: null };
globalThis.game = {
  user: GM, users: Object.assign([GM, P1, P2, TV], { activeGM: GM }),
  scenes: { active: scene }, playlists: [], folders: [], combat: null,
  settings: { get: (m, k) => store.get(k), set: async (m, k, v) => { store.set(k, v); return v; } },
};
globalThis.Hooks = { callAll: () => {}, on: () => {} };
globalThis.foundry = { utils: { fromUuidSync: () => null, randomID: () => "x" } };
globalThis.CONST = { PLAYLIST_MODES: { SEQUENTIAL: 0, SHUFFLE: 1 } };

const M = await import(pathToFileURL(path.join(ROOT, "scripts", "music.js")).href);

// ── who is the party ──────────────────────────────────────────────────────────────────────────────
const barb = actor("barb", "character", ["p1"]), wiz = actor("wiz", "character", ["p2"]);
const tvPc = actor("tvpc", "character", ["tv"]);                     // owned only by the TV account
const pile = actor("pile", "character", ["p1"], { getFlag: (s, k) => (s === "item-piles" && k === "data" ? { enabled: true } : undefined) });
const npc = actor("npc", "npc", []);
const group = actor("grp", "group", [], { system: { members: [{ actor: { id: "a" } }, { actor: { id: "b" } }, { actor: { id: "c" } }] }, getFlag: (s, k) => (k === "formation" ? { released: ["c"] } : undefined) });

scene.tokens = [tok("t1", barb, 0, 0), tok("t2", wiz, 200, 0, { hidden: true }), tok("t3", tvPc, 0, 0), tok("t4", pile, 0, 0), tok("t5", npc, 0, 0)];
let pts = M.partyPoints(scene);
check("party = player-owned characters, hidden ones too; not the TV's, not an item pile, not an NPC", pts.length === 2, JSON.stringify(pts));
check("a token counts from its centre", pts[0].x === 50 && pts[0].y === 50);
scene.tokens = [tok("g", group, 300, 300)];
pts = M.partyPoints(scene);
check("a grouped-party token counts every member still inside it (3 members, 1 released → 2)", pts.length === 2 && pts.every((p) => p.x === 350));

// ── which regions score ───────────────────────────────────────────────────────────────────────────
scene.regions = [
  regionOf("A", "Lounge", { x: 0, y: 0, width: 400, height: 400 }, [music("A", "Playlist.lounge")]),
  regionOf("B", "Dining", { x: 1000, y: 0, width: 400, height: 400 }, [music("B", "Playlist.dining")]),
  regionOf("C", "Unscored", { x: 2000, y: 0, width: 400, height: 400 }, [{ type: "suppressWeather", system: {} }]),
  regionOf("D", "Off", { x: 3000, y: 0, width: 400, height: 400 }, [music("D", "Playlist.off", { disabled: true })]),
  regionOf("E", "Empty", { x: 4000, y: 0, width: 400, height: 400 }, [music("E", null)]),
];
const rooms = M.scoredRooms(scene);
check("scored rooms = enabled Music behaviours that name a playlist", rooms.map((r) => r.playlist).join() === "Playlist.lounge,Playlist.dining");

// ── the 5-second rule against the fake world ──────────────────────────────────────────────────────
const at = (x, y) => [tok("t1", barb, x, y), tok("t2", wiz, x + 100, y)];
scene.tokens = at(0, 0);
check("whole party enters the lounge: not yet at 0 s", M.roomTick(0) === null);
check("…nor at 4.9 s", M.roomTick(4900) === null);
check("…switches at 5 s", M.roomTick(5000) === rooms[0].id);
scene.tokens = [tok("t1", barb, 0, 0), tok("t2", wiz, 1100, 0)];
check("split party keeps the lounge", M.roomTick(7000) === rooms[0].id && M.roomTick(20000) === rooms[0].id);
scene.tokens = at(2000, 0);
check("whole party in an unscored room keeps the lounge", M.roomTick(21000) === rooms[0].id && M.roomTick(30000) === rooms[0].id);
scene.tokens = at(1000, 0);
M.roomTick(31000);
scene.tokens = [tok("t1", barb, 1000, 0), tok("t2", wiz, 0, 0)]; M.roomTick(33000);   // one steps back out
scene.tokens = at(1000, 0); M.roomTick(34000);
check("someone leaving before 5 s resets the clock", M.roomTick(37000) === rooms[0].id && M.roomTick(39000) === rooms[1].id);
const downed = actor("wiz", "character", ["p2"], { system: { attributes: { hp: { value: 0 } } } });
scene.tokens = [tok("t1", barb, 0, 0), tok("t2", downed, 100, 0, { hidden: true })];
M.roomTick(40000);
check("downed and hidden PCs count (back to the lounge after 5 s)", M.roomTick(45000) === rooms[0].id);
store.set("musicDwellSeconds", 2);
scene.tokens = at(1000, 0); M.roomTick(46000);
check("dwell time is the world setting (2 s)", M.roomTick(48000) === rooms[1].id);
game.user = P1;
check("only the primary GM drives", M.roomTick(60000) === null);

// ── rooms only: the surface is offered this scene's rooms, and a pick of anything else is refused ──
game.user = GM;
const PL = new Map(["Playlist.lounge", "Playlist.dining", "Playlist.elsewhere", "Playlist.mood"].map((u) => [u, { uuid: u, documentName: "Playlist", name: u, sort: 0, folder: u === "Playlist.mood" ? { id: "F" } : null }]));
foundry.utils.fromUuidSync = (u) => PL.get(u) ?? null;
game.folders = [{ id: "F", type: "Playlist", name: "Moods" }];
game.playlists = Object.assign([...PL.values()], { find: Array.prototype.find });
game.user.isGM = true;
const st = M.state();
check("state lists this scene's scored rooms only, by label or region name", st.rooms.map((r) => r.playlist).join() === "Playlist.lounge,Playlist.dining" && st.rooms[0].name === "Lounge");
check("roomOf answers the room under a point (a surface's own pin), or null", M.roomOf(50, 50) === rooms[0].id && M.roomOf(5000, 5000) === null);
check("a pick of this scene's room is accepted", (await M.pick("Playlist.dining")).ok === true && store.get("musicState").manual.what === "room");
check("a pick of a mood is accepted", (await M.pick("Playlist.mood")).ok === true && store.get("musicState").manual.what === "mood");
check("a pick of ANOTHER scene's playlist is refused (rooms only)", (await M.pick("Playlist.elsewhere")).ok === false);
scene.regions = [];
check("a scene with no Music regions (a train car) offers no rooms at all", M.state().rooms.length === 0);

console.log(`\nall ${n} passed`);
