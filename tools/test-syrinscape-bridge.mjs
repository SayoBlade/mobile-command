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

// the glue
const set = fs.readFileSync(path.join(ROOT, "scripts", "settings.js"), "utf8");
check("both settings are WORLD scope (one shared Syrinscape room) and resync on change",
  /register\(MODULE_ID, "soundScenes", \{[\s\S]*?scope: "world"[\s\S]*?onChange: \(\) => resyncSyrinscapeEntries\(\)/.test(set)
  && /register\(MODULE_ID, "syrinscapeOffline", \{\s*scope: "world"[\s\S]*?onChange: \(\) => resyncSyrinscapeEntries\(\)/.test(set));
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
check("registered at ready and published for the deck", /registerSyrinscapeBridge\(\);/.test(main) && /soundScenes: \{ state: soundScenesState, set: setSoundScenes \}/.test(main));

// the ride bed
const T = fs.readFileSync(path.join(ROOT, "scripts", "cm-train.js"), "utf8");
check("the ride prefers the flagged Syrinscape bed, preloads and opens with the local loop",
  /function rideSound\(\) \{ return rideBed\(\) \?\? rideLocal\(\); \}/.test(T) && /export function preloadRideSound\(\) \{\s*const s = rideLocal\(\);/.test(T)
  && /export async function primeRideSound\(\) \{\s*const s = rideLocal\(\);/.test(T) && /!localNow\(\) && !opener\.playing/.test(T));

console.log(`\nall ${n} passed`);
