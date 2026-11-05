// The music layer's rules (scripts/music-core.js) — priority, combat picks, Phase 2, rooms and the
// 5-second dwell — plus the licence guard on the ch10 playlist script. Headless: no Foundry.
// Run: node tools/test-music.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { resolveMusic, targetKey, manualStillHolds, battleFor, inShape, inRegion, partyRoom, Dwell, OVERLAP_DEFAULT, overlapApplies, handOffIn, handOffUpdate } =
  await import(pathToFileURL(path.join(ROOT, "scripts", "music-core.js")).href);

let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const P = (uuid) => ({ kind: "playlist", uuid });
const SIL = { kind: "silence" };
const room = P("Playlist.room"), scene = P("Playlist.scene"), battle = P("Playlist.battle"), mood = P("Playlist.mood"), cueT = { kind: "sound", uuid: "Playlist.cue.PlaylistSound.a" };
const r = (s) => resolveMusic(s);

// ── priority ──────────────────────────────────────────────────────────────────────────────────────
check("nothing at all → keep playing", r({}).layer === "keep" && r({}).target === null);
check("scene default alone plays", r({ sceneDefault: scene }).layer === "scene");
check("room beats scene default", r({ room, sceneDefault: scene }).target === room);
check("manual pick outside combat beats room", r({ manual: { target: mood, combatId: null }, room }).layer === "manual");
check("combat beats a manual pick made outside combat", r({ manual: { target: mood, combatId: null }, combatId: "c1", combatTarget: battle, room }).layer === "combat");
check("manual pick made in THIS combat beats combat", r({ manual: { target: SIL, combatId: "c1" }, combatId: "c1", combatTarget: battle }).layer === "manual-combat");
check("a pick from an EARLIER combat does not hold in this one", r({ manual: { target: SIL, combatId: "c0" }, combatId: "c1", combatTarget: battle }).layer === "combat");
check("a pick made in a fight does not survive it", r({ manual: { target: SIL, combatId: "c1" }, room }).layer === "room");
check("cue beats everything, including a manual pick in combat", r({ cue: { target: cueT }, manual: { target: SIL, combatId: "c1" }, combatId: "c1", combatTarget: battle }).layer === "cue");
check("combat with nothing to play falls through to the room", r({ combatId: "c1", combatTarget: null, room }).layer === "room");
check("cue ends → the layer below (combat) takes over", r({ cue: null, combatId: "c1", combatTarget: battle }).target === battle);
check("targetKey tells playlists, sounds and silence apart",
  targetKey(battle) === "playlist:Playlist.battle" && targetKey(cueT).startsWith("sound:") && targetKey(SIL) === "silence" && targetKey(null) === "");

// ── manual picks and combat ───────────────────────────────────────────────────────────────────────
check("manualStillHolds: outside pick holds outside, not in a fight", manualStillHolds({ target: mood, combatId: null }, null) && !manualStillHolds({ target: mood, combatId: null }, "c1"));
check("manualStillHolds: in-fight pick holds in that fight only", manualStillHolds({ target: SIL, combatId: "c1" }, "c1") && !manualStillHolds({ target: SIL, combatId: "c1" }, null));

const loco = { id: "loco", isPC: false, battle: "Playlist.p1", phase2: "Playlist.p2" };
const haint = { id: "haint", isPC: false, battle: "Playlist.haint", phase2: null };
const pc = { id: "pc", isPC: true, battle: "Playlist.anthemish", phase2: null };
const plain = { id: "rat", isPC: false, battle: null, phase2: null };
check("the boss (a foe with Phase 2) wins over a haint in the same fight", battleFor([haint, pc, loco], "Playlist.def").uuid === "Playlist.p1");
check("bloodied boss → its Phase 2 playlist", battleFor([haint, loco], "Playlist.def", ["loco"]).uuid === "Playlist.p2");
check("haint fight → the haint playlist", battleFor([pc, haint, plain], "Playlist.def").uuid === "Playlist.haint");
check("a PC's flag never picks the battle music", battleFor([pc, plain], "Playlist.def").uuid === "Playlist.def");
check("no flag anywhere → the default", battleFor([plain], "Playlist.def").uuid === "Playlist.def" && battleFor([plain], null).uuid === null);

// ── rooms ─────────────────────────────────────────────────────────────────────────────────────────
const rect = { type: "rectangle", x: 0, y: 0, width: 100, height: 100, rotation: 0 };
check("rectangle contains its inside, not its outside", inShape(rect, 50, 50) && !inShape(rect, 150, 50));
check("a rotated rectangle is tested in its own frame", inShape({ ...rect, rotation: 45 }, 50, -15) && !inShape({ ...rect, rotation: 45 }, 2, 2));
check("polygon (triangle) contains its centroid only", inShape({ type: "polygon", points: [0, 0, 100, 0, 0, 100] }, 20, 20) && !inShape({ type: "polygon", points: [0, 0, 100, 0, 0, 100] }, 80, 80));
check("circle and ellipse", inShape({ type: "circle", x: 0, y: 0, radius: 10 }, 5, 5) && !inShape({ type: "ellipse", x: 0, y: 0, radiusX: 10, radiusY: 2 }, 0, 5));
check("a hole cuts out of the region", inRegion([rect], 10, 10) && !inRegion([rect, { ...rect, x: 0, y: 0, width: 20, height: 20, hole: true }], 10, 10));

const A = { id: "A", shapes: [rect] }, B = { id: "B", shapes: [{ ...rect, x: 200 }] };
check("whole party in A → A", partyRoom([{ x: 10, y: 10 }, { x: 90, y: 90 }], [A, B]) === "A");
check("split party → no room (keep the music)", partyRoom([{ x: 10, y: 10 }, { x: 250, y: 50 }], [A, B]) === null);
check("party in an unscored place → no room (keep)", partyRoom([{ x: 500, y: 500 }], [A, B]) === null);
check("no party, or no rooms → no room", partyRoom([], [A]) === null && partyRoom([{ x: 1, y: 1 }], []) === null);

const d = new Dwell(5000);
d.tick("A", 0);
check("dwell: not settled before 5 s", d.tick("A", 4999) === null);
check("dwell: settled at 5 s", d.tick("A", 5000) === "A");
d.tick(null, 6000);
check("dwell: split keeps the settled room", d.settled === "A");
d.tick("B", 7000); d.tick(null, 9000); d.tick("B", 9500);
check("dwell: leaving before 5 s resets the clock", d.tick("B", 13000) === "A" && d.tick("B", 14500) === "B");

// ── the overlap inside a playlist (ported with deck-command's test-overlap, 2026-11-06) ────────────
const MODES = { DISABLED: -1, SEQUENTIAL: 0, SHUFFLE: 1, SIMULTANEOUS: 2 };
const flagged = (role, mode = MODES.SHUFFLE) => ({ mode, flags: role ? { "mobile-command": { music: { role } } } : {} });
check("overlap: the default is 5 s", OVERLAP_DEFAULT === 5);
check("overlap: room, battle and mood apply", overlapApplies(flagged("room"), MODES) && overlapApplies(flagged("battle", MODES.SEQUENTIAL), MODES) && overlapApplies(flagged("mood"), MODES));
check("overlap: cues and unflagged playlists keep core's hand-off", !overlapApplies(flagged("cue", MODES.SIMULTANEOUS), MODES) && !overlapApplies(flagged("cue"), MODES) && !overlapApplies(flagged(null), MODES));
check("overlap: a simultaneous room does not apply", !overlapApplies(flagged("room", MODES.SIMULTANEOUS), MODES));
check("overlap: hand-off is `overlap` seconds before the end", handOffIn({ duration: 180, elapsed: 0, overlap: 5 }) === 175000 && handOffIn({ duration: 180, elapsed: 170, overlap: 5 }) === 5000);
check("overlap: already past the point → now", handOffIn({ duration: 180, elapsed: 178, overlap: 5 }) === 0);
check("overlap: never for a repeat, a short track or overlap 0", handOffIn({ duration: 180, elapsed: 0, overlap: 5, repeat: true }) === null && handOffIn({ duration: 8, elapsed: 0, overlap: 5 }) === null && handOffIn({ duration: 180, elapsed: 0, overlap: 0 }) === null);
check("overlap: unknown length or position → leave it to core", handOffIn({ duration: NaN, elapsed: 0, overlap: 5 }) === null && handOffIn({ duration: 180, elapsed: null, overlap: 5 }) === null);
const tracks = [{ id: "a", fade: 3000 }, { id: "b", fade: null }, { id: "c", fade: 3000 }];
const plan = handOffUpdate(tracks, "a", "b", 5000);
check("overlap: one update, core's playNext shape, both fades set to the overlap", JSON.stringify(plan.sounds) === JSON.stringify([
  { _id: "a", playing: false, pausedTime: null, fade: 5000 }, { _id: "b", playing: true, pausedTime: null, fade: 5000 }, { _id: "c", playing: false, pausedTime: null },
]), JSON.stringify(plan.sounds));
check("overlap: the restore puts his fades back", JSON.stringify(plan.restore) === JSON.stringify([{ _id: "a", fade: 3000 }, { _id: "b", fade: null }]));
check("overlap: one track has nothing to overlap with", handOffUpdate(tracks, "a", "a", 5000) === null && handOffUpdate(tracks, "a", null, 5000) === null);

// ── the licence: no audio anywhere in what the layer stores or the playlist script writes ──────────
const music = fs.readFileSync(path.join(ROOT, "scripts", "music.js"), "utf8");
check("music.js names no audio file", !/\.(ogg|mp3|wav|flac|m4a|webm|opus)\b/i.test(music.replace(/\/\/.*$/gm, "")));
const apply = fs.readFileSync(path.join(ROOT, "tools", "ch10-music-playlists.apply.js"), "utf8");
const files = [...apply.matchAll(/"([^"]+\.(?:ogg|wav|mp3|flac))"/gi)].map((m) => m[1]);
check("the ch10 script references 51 tracks (48 files), every one an OGG under BGM-ogg, no WAV",
  files.length === 51 && new Set(files).size === 48 && files.every((f) => /\.ogg$/i.test(f) && !f.includes("..")) && /const BASE = "assets\/Personal\/Music\/BGM-ogg\/"/.test(apply), `${files.length} files`);
check("the ch10 script refuses any world but crooked-moon-test", /game\.world\?\.id !== "crooked-moon-test"/.test(apply));

console.log(`\nall ${n} passed`);
