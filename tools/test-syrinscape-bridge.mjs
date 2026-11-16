// Sound scenes, Syrinscape or local (scripts/syrinscape-bridge.js; deck-command D-0116, SOUND-PLAN-2026-11-16 §2.5/§2.7),
// and the ride bed (cm-train.js rideBed). Headless: Foundry stubbed at the one seam the bridge patches.
// Run: node tools/test-syrinscape-bridge.mjs   (stops at the first failure)
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

// ---- a minimal Foundry ----
const settings = { soundScenes: "syrinscape", syrinscapeOffline: false };
let moduleOn = true;
const made = [];
globalThis.game = {
  settings: { get: (m, k) => settings[k], set: async (m, k, v) => { settings[k] = v; } },
  modules: { get: () => ({ active: moduleOn }) },
  audio: {
    locked: false,
    create: ({ src }) => {
      const s = { src, loads: [], fades: [], listeners: [], load(o) { this.loads.push(o); }, fade(v, o) { this.fades.push(v); }, stop(o) { this.stopped = o; }, addEventListener(e) { this.listeners.push(e); } };
      made.push(s); return s;
    },
  },
  user: { isGM: true, id: "gm" }, users: { activeGM: { id: "gm" } }, playlists: [],
};
const local = { path: "modules/ambiences-vol-6/Steam-Train-(no-passenger).ogg", volume: 0.37, name: "Steam-Train-(no-passenger)" };
globalThis.fromUuidSync = (u) => (u === "Playlist.A.PlaylistSound.steam" ? local : null);
class PlaylistSound {
  constructor(data) { Object.assign(this, data); this.context = "env"; }
  _createSound() { const s = { syr: true, stop(o) { this.stopped = o; } }; return s; }
  _onStart() {} _onEnd() {} _onStop() {}
}
globalThis.CONFIG = { PlaylistSound: { documentClass: PlaylistSound } };

const B = await import(pathToFileURL(path.join(ROOT, "scripts", "syrinscape-bridge.js")).href);

// pure parts
check("Local switch → local", B.scenesLocal({ mode: "local", offline: false, moduleActive: true }) === true);
check("offline → local", B.scenesLocal({ mode: "syrinscape", offline: true, moduleActive: true }) === true);
check("no module → local", B.scenesLocal({ mode: "syrinscape", offline: false, moduleActive: false }) === true);
check("Syrinscape, online, module on → Syrinscape", B.scenesLocal({ mode: "syrinscape", offline: false, moduleActive: true }) === false);
check("an entry is Syrinscape only with both soundType and soundId", B.isSyrinscapeEntry({ flags: { "syrinscape-control": { soundType: "mood", soundId: "861010" } } }) && !B.isSyrinscapeEntry({ flags: { "syrinscape-control": { soundType: "mood" } } }) && !B.isSyrinscapeEntry({ path: "a.ogg" }));
const fb = B.fallbackOf({ flags: { "mobile-command": { localFallback: "Playlist.A.PlaylistSound.steam" } } }, globalThis.fromUuidSync);
check("the fallback is the twin's own file and its own volume", fb?.path === local.path && fb.volume === 0.37, JSON.stringify(fb));
check("no fallback named → null (silent)", B.fallbackOf({ flags: {} }, globalThis.fromUuidSync) === null);

let w = B.nextOffline({ state: "Connecting", since: 0, offline: false, now: 29000 });
check("not Active for 29 s: not yet offline", w.offline === false && w.flip === null);
w = B.nextOffline({ state: "Error", since: 0, offline: false, now: 30000 });
check("not Active for 30 s: offline, said once", w.offline === true && w.flip === "offline");
w = B.nextOffline({ state: "Error", since: 0, offline: true, now: 90000 });
check("still offline: no second toast", w.offline === true && w.flip === null);
w = B.nextOffline({ state: "Active", since: 0, offline: true, now: 95000 });
check("Active again: back online, said once", w.offline === false && w.flip === "online" && w.since === 95000);

// the seam
check("the patch installs once", B.patchPlaylistSound() === true && B.patchPlaylistSound() === false);
const plain = new PlaylistSound({ name: "file", path: "x.ogg", flags: {} });
check("a plain file is untouched", plain._createSound().syr === true);
const entry = new PlaylistSound({ name: "On board the doom train", volume: 0.4, flags: { "syrinscape-control": { soundType: "mood", soundId: "861010" }, "mobile-command": { localFallback: "Playlist.A.PlaylistSound.steam" } } });
let s = entry._createSound();
check("online: the module's Syrinscape Sound is used", s.syr === true);
s.stop({ fade: 3000, volume: 0 });
check("a faded stop of a Syrinscape Sound stops at once (fade 0)", s.stopped?.fade === 0, JSON.stringify(s.stopped));
settings.syrinscapeOffline = true;
s = entry._createSound();
check("offline: the local twin plays instead", s.src === local.path && !s.syr, JSON.stringify(s));
s.load({ autoplay: true, autoplayOptions: { volume: 0.4, loop: true } });
check("…at the twin's own level, not the entry's", s.loads[0].autoplayOptions.volume === 0.37 && s.loads[0].autoplayOptions.loop === true, JSON.stringify(s.loads[0]));
s.fade(0.4); s.fade(0);
check("…and fades to that level, or to 0", s.fades[0] === 0.37 && s.fades[1] === 0, JSON.stringify(s.fades));
check("…and still reports play/end/stop to the entry", ["play", "end", "stop"].every((e) => s.listeners.includes(e)));
settings.syrinscapeOffline = false; settings.soundScenes = "local";
check("Local switch: the twin too", entry._createSound().src === local.path);
const lonely = new PlaylistSound({ name: "Smash window", flags: { "syrinscape-control": { soundType: "element", soundId: "4669021" } } });
check("Local, no twin: silent (null), never Syrinscape", lonely._createSound() === null);
settings.soundScenes = "syrinscape"; moduleOn = false;
check("module off: the twin (Syrinscape cannot play)", entry._createSound().src === local.path);
moduleOn = true;

// resync on a flip
let synced = 0, oldStopped = null;
const playing = new PlaylistSound({ name: "bed", playing: true, flags: entry.flags });
playing.sound = { stop(o) { oldStopped = o; } };
playing.sync = () => { synced += 1; };
const idle = new PlaylistSound({ name: "idle", playing: false, flags: entry.flags });
idle.sound = { stop() {} }; idle.sync = () => { synced += 100; };
game.playlists = [{ sounds: [playing, idle, plain] }];
B.resyncSyrinscapeEntries();
check("a flip rebuilds a playing entry's Sound and resyncs it; an idle one is only cleared", synced === 1 && playing.sound === null && idle.sound === null && oldStopped?.fade === 0, `synced ${synced}`);

// his switch
const r = await B.setSoundScenes();
check("the deck's toggle flips Syrinscape → Local", r.ok && settings.soundScenes === "local");
await B.setSoundScenes();
check("…and back", settings.soundScenes === "syrinscape");
check("the state the deck draws", JSON.stringify(B.soundScenesState()) === JSON.stringify({ mode: "syrinscape", offline: false, local: false, module: true }));

// ---- one mood at a time, and the bed underneath (seat SOUND PHASE 2 B4/E4) ----
const M = (id, bed = false) => ({ id, mood: true, bed });
check("a moment mood starting stops the other moments, never the bed underneath",
  JSON.stringify(B.planMoodStart({ started: M("car2"), playing: [M("ride", true), M("car1"), { id: "breath", mood: false, bed: false }] })) === JSON.stringify(["car1"]));
check("a bed mood starting stops every other mood, beds too (a new scene's bed)",
  JSON.stringify(B.planMoodStart({ started: M("town", true), playing: [M("forest", true), M("platform"), { id: "loop", mood: false }] })) === JSON.stringify(["forest", "platform"]));
check("an element starting stops nothing (elements layer)", B.planMoodStart({ started: { id: "e", mood: false }, playing: [M("ride", true)] }).length === 0);
check("a moment ending with no other moment playing brings the bed back", JSON.stringify(B.planMoodEnd({ ended: M("car1"), playing: [M("ride", true)] })) === JSON.stringify(["ride"]));
check("…but not while another moment still plays", B.planMoodEnd({ ended: M("car1"), playing: [M("ride", true), M("car2")] }).length === 0);
check("a bed ending brings nothing back", B.planMoodEnd({ ended: M("ride", true), playing: [M("forest", true)] }).length === 0);

const played = [];
globalThis.syrinscapeControl = { utils: { playMood: (id) => played.push(["mood", id]), playElement: (id) => played.push(["element", id]) } };
const entryOf = (id, type, soundId, o = {}) => {
  const d = new PlaylistSound({ id, uuid: `Playlist.T.PlaylistSound.${id}`, name: id, playing: false, repeat: true, ...o,
    flags: { "syrinscape-control": { soundType: type, soundId }, "mobile-command": { ...(o.bed ? { syrBed: true } : {}), ...(o.ride ? { rideBed: true } : {}) } } });
  d.update = async (u) => { Object.assign(d, u); await B.onSyrinscapePlaying(d, Boolean(u.playing)); };
  return d;
};
const ride = entryOf("ride", "mood", "861010", { ride: true });
const departing = entryOf("departing", "mood", "862586");
const cards = entryOf("cards", "mood", "920");
const breath = entryOf("breath", "element", "4669024");
game.playlists = [{ sounds: [ride, departing, cards, breath] }];
const press = async (d, on) => { d.playing = on; await B.onSyrinscapePlaying(d, on); };
await press(ride, true); await press(breath, true); await press(departing, true);
check("E4: a car's mood leaves the ride reading playing (it waits underneath), and the loop on top", ride.playing === true && departing.playing === true && breath.playing === true);
await press(cards, true);
check("B4: the replaced car mood's entry stops, so its key goes dark; no bed is replayed by OUR stop", departing.playing === false && cards.playing === true && played.length === 0, JSON.stringify(played));
await press(cards, false);
check("E4: stopping the car mood brings the ride bed back (play sent again)", JSON.stringify(played) === JSON.stringify([["mood", "861010"]]), JSON.stringify(played));
await press(ride, false); await press(departing, true); await press(departing, false);
check("a ride stopped by hand does not come back after a car", played.length === 1, JSON.stringify(played));
settings.soundScenes = "local"; await press(ride, true); await press(cards, true);
check("Local: local files layer, nothing is stopped", ride.playing === true && cards.playing === true);
settings.soundScenes = "syrinscape"; cards.playing = false;
check("Syrinscape stopping an element loop by itself stops its entry", B.onSyrinscapeElementStopped("4669024").length === 1);
await new Promise((r) => setTimeout(r, 0));
check("…its key goes dark", breath.playing === false);

// ---- his Syrinscape follows his Environment level (seat D2) ----
const HALF = 1 + 20 * Math.log10(0.5) / 37.5; // 0.8395: Environment 0.5 (−6 dB) on Syrinscape's dB scale (§58)
check("the wanted level is the Environment volume ON SYRINSCAPE'S SCALE (0.5 → −6 dB, not −18.75)", B.wantedSyrinscapeLevel(0) === 0 && Math.abs(B.wantedSyrinscapeLevel(0.5) - HALF) < 1e-9 && B.wantedSyrinscapeLevel(1) === 1 && B.wantedSyrinscapeLevel("x") === null);
check("no Syrinscape player: nothing to do", B.syncSyrinscapeVolume() === "no player");
const node = { value: -Infinity, writes: [] };
Object.defineProperty(node, "v", { value: 0 });
globalThis.syrinscape = { player: { audioSystem: { effectSystem: { localVolume: node } } } };
settings.globalAmbientVolume = 0.5;
check("D: a level trapped at −∞ is written straight back (no fade)", B.syncSyrinscapeVolume() === "set 0.839" && node.value === HALF);
settings.globalAmbientVolume = 0;
check("D: the TV connects → his Environment 0 → Syrinscape exactly 0", B.syncSyrinscapeVolume() === "set 0" && node.value === 0);
settings.globalAmbientVolume = 0.5;
check("D: the TV leaves → back to 0.5 (0.84 on its scale), from 0", B.syncSyrinscapeVolume() === "set 0.839" && node.value === HALF);
check("an unchanged level is left alone", B.syncSyrinscapeVolume() === "same");
const mainSrc = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
check("the TV rule hands Syrinscape the new level after it writes Environment", /applyDmMusicSilence\(\) \{[\s\S]*?setTimeout\(syncSyrinscapeVolume, 100\);[\s\S]*?\n\}/.test(mainSrc));

// ---- the table's mix on Syrinscape's three groups (DESIGN §58, superseding the two levels) ----
const gnode = { value: 1 }; const shotWrites = [], musicWrites = [];
globalThis.syrinscape.player.audioSystem.effectSystem.globalVolume = gnode;
globalThis.syrinscape.player.elementSystem = { setOneshotVolume: (v) => shotWrites.push(v), setMusicVolume: (v) => musicWrites.push(v) };
settings.soundMix = {};
settings.globalPlaylistVolume = 0.25; // the launch default (§58.7): a mood's score follows Music ÷ Environment
const r0 = B.syncSyrinscapeLevels();
check("mix: the default mix writes all three groups", r0 === "set ambience 1.5, music 0.367, one-shots 0.585" && gnode.value === 1.5 && musicWrites.length === 1 && shotWrites.length === 1, r0);
check("mix: kept — the next check reports nothing new but re-asserts both groups", B.syncSyrinscapeLevels() === "same" && musicWrites.length === 2 && shotWrites.length === 2);
gnode.value = 0.4; // Syrinscape's server pushed its own global volume
check("mix: a server reset of the global volume is put back", B.syncSyrinscapeLevels() === "set ambience 1.5" && gnode.value === 1.5);
settings.soundMix = { environment: 0.5 };
check("mix: a lower environment lowers the global and lifts the groups under it to keep them where they were",
  B.syncSyrinscapeLevels() === "set ambience 1.339, music 0.528, one-shots 0.746");
settings.soundMix = {};
B.syncSyrinscapeLevels();
check("mix: the old levels setting is no longer read", (settings.syrinscapeLevels = { moods: 0.2, oneshots: 0.2 }) && B.syncSyrinscapeLevels() === "same" && gnode.value === 1.5);
const bsrc = fs.readFileSync(path.join(ROOT, "scripts", "syrinscape-bridge.js"), "utf8");
check("mix: no entry volume is touched; an element's volume is written only from a trim (§58.10)",
  !/setElementVolume\b|\.update\(\{ volume/.test(bsrc) && (bsrc.match(/setElementIdVolume\(/g) ?? []).length === 1 && /syr:element:/.test(bsrc));
// ---- per-sound trims on Syrinscape (§58.10) ----
const elWrites = [];
globalThis.syrinscape.player.elementSystem.setElementIdVolume = (id, v) => elWrites.push([id, v]);
settings.soundTrims = { "syr:element:4668915": -6, "syr:mood:861010": 3 };
B.syncSyrinscapeLevels();
check("trim: an element's trim lands on Syrinscape's own element volume, by number, on its dB scale",
  elWrites.some(([id, v]) => id === 4668915 && Math.abs(37.5 * (v - 1) + 6) < 1e-9));
settings.soundTrims = {};
elWrites.length = 0; B.syncSyrinscapeLevels();
check("trim: a removed element trim goes back to 0 dB once", elWrites.length === 1 && elWrites[0][0] === 4668915 && elWrites[0][1] === 1);
elWrites.length = 0; B.syncSyrinscapeLevels();
check("…and is then left alone", elWrites.length === 0);
// a mood trim rides the local volume while that mood plays, and the one-shot group takes it back off
const moodDoc = { flags: { "syrinscape-control": { soundType: "mood", soundId: "861010" } }, playing: true, uuid: "P.m" };
game.playlists = [{ sounds: [moodDoc] }];
settings.soundTrims = { "syr:mood:861010": -4 };
settings.globalAmbientVolume = 0.5;
check("trim: the playing mood's trim is found (one mood at a time)", B.moodTrimNow() === -4);
B.syncSyrinscapeVolume();
const loc = globalThis.syrinscape.player.audioSystem.effectSystem.localVolume.value;
check("trim: …and lowers this screen's Syrinscape local volume by it", Math.abs(37.5 * (loc - 1) - (20 * Math.log10(0.5) - 4)) < 1e-6, String(loc));
shotWrites.length = 0; B.syncSyrinscapeLevels();
check("trim: …while the one-shot group is lifted by the same 4 dB, so one-shots stay where they were",
  Math.abs(37.5 * (shotWrites.at(-1) - 1) - (37.5 * (0.585 - 1) + 4)) < 0.05, String(shotWrites.at(-1)));
settings.soundTrims = { "syr:mood:861010": 12 };
B.syncSyrinscapeVolume();
check("trim: a big positive mood trim stops at Syrinscape's top (local 1 = 0 dB), not past it",
  globalThis.syrinscape.player.audioSystem.effectSystem.localVolume.value === 1);
moodDoc.playing = false;
check("trim: a mood that is not playing carries no trim", B.moodTrimNow() === 0);
settings.soundTrims = {}; game.playlists = []; B.syncSyrinscapeVolume(); B.syncSyrinscapeLevels();
check("mix: the keeper applies it on every client with the Environment level",
  /const keep = \(\) => \{ syncSyrinscapeVolume\(\); syncSyrinscapeLevels\(\); \};/.test(fs.readFileSync(path.join(ROOT, "scripts", "syrinscape-bridge.js"), "utf8")));
check("mix: a WORLD setting that re-applies the channels and Syrinscape on change",
  /register\(MODULE_ID, "soundMix", \{\s*scope: "world", config: false, type: Object, default: \{\},\s*onChange: \(\) => \{ applyMix\(\); syncSyrinscapeLevels\(\); \}/.test(fs.readFileSync(path.join(ROOT, "scripts", "settings.js"), "utf8")));
check("levels(): retired, says where to go", (await B.setSyrinscapeLevels({ moods: 1 })).ok === false);

// the glue
const set = fs.readFileSync(path.join(ROOT, "scripts", "settings.js"), "utf8");
check("both settings are WORLD scope (one shared Syrinscape room) and resync on change",
  /register\(MODULE_ID, "soundScenes", \{[\s\S]*?scope: "world"[\s\S]*?onChange: \(\) => resyncSyrinscapeEntries\(\)/.test(set)
  && /register\(MODULE_ID, "syrinscapeOffline", \{\s*scope: "world"[\s\S]*?onChange: \(\) => resyncSyrinscapeEntries\(\)/.test(set));
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
check("registered at ready and published for the deck", /registerSyrinscapeBridge\(\);/.test(main) && /soundScenes: \{ state: soundScenesState, set: setSoundScenes, mix: setSoundMix, mixState: soundMixState, master: \{ get: getSoundMaster, set: setSoundMaster, step: stepSoundMaster \}, trim: setSoundTrim, trims: getSoundTrims, levels: setSyrinscapeLevels, applyLevels: syncSyrinscapeLevels \}/.test(main));

// the ride bed
const T = fs.readFileSync(path.join(ROOT, "scripts", "cm-train.js"), "utf8");
check("the ride prefers the flagged Syrinscape bed, preloads and opens with the local loop",
  /function rideSound\(\) \{ return rideBed\(\) \?\? rideLocal\(\); \}/.test(T) && /export function preloadRideSound\(\) \{\s*const s = rideLocal\(\);/.test(T)
  && /export async function primeRideSound\(\) \{\s*const s = rideLocal\(\);/.test(T) && /!localNow\(\) && !opener\.playing/.test(T));

console.log(`\nall ${n} passed`);
