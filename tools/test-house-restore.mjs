// The Crooked House put back into the world he plays (scripts/cm-house.js, DM 2026-11-08, Lost Lore #17/#18,
// WORKPLAN decisions 9 and 11). The plan is pure: what a run changes and, as much, what it must never touch.
// Headless: no Foundry. Run: node tools/test-house-restore.mjs   (stops at the first failure)
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
const H = await import(pathToFileURL(path.join(ROOT, "scripts", "cm-house.js")).href);
const { planHouse, HOUSE_DOORS, HOUSE_STAIRS, HOUSE_FIGHTS, HOUSE_WORLDS, stairBehavior } = H;

// a world like crooked-moon-6x on 2026-11-08: every door on the adventure's woodCreaky, no stairs, no house fights
const fresh = () => {
  const scenes = {};
  for (const [id, list] of Object.entries(HOUSE_DOORS)) {
    const walls = {};
    for (const [w] of list) walls[w] = { door: 1, doorSound: "woodCreaky" };
    walls.plainWall = { door: 0, doorSound: "" };
    scenes[id] = { walls, stairs: [], battle: null };
  }
  return { scenes, fights: ["haint-fight", "locomotive-phase-1"] };
};

// ── the counts the Lost Lore names ────────────────────────────────────────────────────────────────
check("21 doors with their own sets", Object.values(HOUSE_DOORS).flat().length === 21);
check("4 stairs, each pointing at a twin that points back",
  Object.keys(HOUSE_STAIRS).length === 4 && Object.entries(HOUSE_STAIRS).every(([k, s]) => HOUSE_STAIRS[s.to]?.to === k));
check("the stairs sit on the last tread the test world ended on (12.1/12.2 at 9,13; 12.2/12.3 at 6,9)",
  HOUSE_STAIRS["stair:12.1:up"].col === 9 && HOUSE_STAIRS["stair:12.1:up"].row === 13 && HOUSE_STAIRS["stair:12.3:down"].col === 6 && HOUSE_STAIRS["stair:12.3:down"].row === 9);
check("it runs in the Crooked Moon worlds only", HOUSE_WORLDS.has("crooked-moon-6x") && HOUSE_WORLDS.has("offline-test") && HOUSE_WORLDS.size === 2);

// ── a fresh 6x ────────────────────────────────────────────────────────────────────────────────────
let p = planHouse(fresh());
check("a fresh world: all 21 doors get their sets", p.doors.length === 21 && p.doors.find((d) => d._id === "1j1BFGw5Vz6IXojY")?.doorSound === "mcCrookedFront");
check("a fresh world: all 4 stairs are made", p.stairs.length === 4);
check("a fresh world: both fight playlists are made, and all four floors get fight music",
  p.fights.join() === "crooked-house,cauldron-room" && p.sceneBattles.length === 4 && p.sceneBattles.find((b) => b.scene === "N7rxbhvGMk3cs6k5")?.fight === "cauldron-room");
check("a wall that is not a door is never in the plan", !p.doors.some((d) => d._id === "plainWall"));

// ── never over anything of his ────────────────────────────────────────────────────────────────────
const his = fresh();
his.scenes.skzmyUz6MM2U4862.walls["1j1BFGw5Vz6IXojY"].doorSound = "metal";
his.scenes.LTGEO7JXWxFvbcIJ.stairs = ["stair:12.2:up"];
his.scenes.gl3mouQf0eAdouY5.battle = "Playlist.hisOwn";
his.fights.push("cauldron-room");
p = planHouse(his);
check("a door he gave another sound keeps it", !p.doors.some((d) => d._id === "1j1BFGw5Vz6IXojY") && p.kept.some((k) => k.includes("metal")));
check("a staircase already there is left where it is (not made twice)", !p.stairs.includes("stair:12.2:up") && p.stairs.length === 3);
check("a floor that already names its fight music keeps it", !p.sceneBattles.some((b) => b.scene === "gl3mouQf0eAdouY5"));
check("a fight playlist already there is not made twice", p.fights.join() === "crooked-house");
check("a blank door sound counts as the default", planHouse((() => { const w = fresh(); w.scenes.N7rxbhvGMk3cs6k5.walls.HGxbW6Eu6iCJL3it.doorSound = ""; return w; })()).doors.some((d) => d._id === "HGxbW6Eu6iCJL3it"));

// ── a second run changes nothing ──────────────────────────────────────────────────────────────────
const done = fresh();
for (const [id, list] of Object.entries(HOUSE_DOORS)) for (const [w, set] of list) done.scenes[id].walls[w].doorSound = set;
for (const [k, s] of Object.entries(HOUSE_STAIRS)) done.scenes[s.scene].stairs.push(k);
for (const id of Object.keys(done.scenes)) done.scenes[id].battle = "Playlist.x";
done.fights.push("crooked-house", "cauldron-room");
p = planHouse(done);
check("after a run, a second run would change nothing", !p.doors.length && !p.stairs.length && !p.fights.length && !p.sceneBattles.length);
check("a world without the house plans nothing and says why", (() => { const q = planHouse({ scenes: {}, fights: [] }); return !q.doors.length && !q.stairs.length && q.skipped.length >= 4; })());

// ── the stair asks, and the music is paths into his Data folder only ──────────────────────────────
const b = stairBehavior("Go up to the second floor?", "Scene.x.Region.y");
check("a stair asks the mover with core's own question before moving anyone", b.type === "teleportToken" && b.system.choice === true && b.system.dialog.revealed === "Go up to the second floor?" && b.system.destinations[0] === "Scene.x.Region.y");
const tracks = Object.values(HOUSE_FIGHTS).flatMap((f) => f.tracks);
check("house fights: the old test world's Combat Music Vol. 1, all ten; the Cauldron Room: one looping track",
  HOUSE_FIGHTS["crooked-house"].tracks.length === 10 && HOUSE_FIGHTS["crooked-house"].tracks.every((t) => t.path.startsWith("modules/combat-music-vol-1-MGS/music/"))
  && HOUSE_FIGHTS["cauldron-room"].tracks.length === 1 && HOUSE_FIGHTS["cauldron-room"].tracks[0].repeat === true);
check("every track is a path under modules/ (no audio ships, nothing outside his Data)", tracks.every((t) => /^modules\/[^.][^]*\.ogg$/.test(t.path) && !t.path.includes("..")));
const data = path.join(process.env.LOCALAPPDATA ?? "", "FoundryVTT", "Data");
if (fs.existsSync(data)) {
  const missing = tracks.filter((t) => !fs.existsSync(path.join(data, decodeURIComponent(t.path))));
  check("every track's file is on this PC", !missing.length, missing.map((t) => t.path).join(", "));
}

// ── the source never deletes ──────────────────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(ROOT, "scripts", "cm-house.js"), "utf8").replace(/\/\/.*$/gm, "");
check("cm-house.js deletes nothing", !/delete(Embedded)?Documents|\.delete\(|unsetFlag/.test(src));
check("it runs once, primary GM only, guarded by its own setting", /activeGM\?\.id !== game\.user\.id/.test(src) && /game\.settings\.set\(MODULE_ID, HOUSE_RESTORED, true\)/.test(src));

console.log(`\nall ${n} passed`);
