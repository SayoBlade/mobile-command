// The table's one mix (scripts/sound-mix.js, DESIGN §58). Headless: a fake Web Audio graph and Foundry's three
// channel contexts, so the wiring and the gain arithmetic can be checked end to end.
// Run: node tools/test-sound-mix.mjs   (stops at the first failure)
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
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const dB = (g) => 20 * Math.log10(g);

// ---- a fake Web Audio graph: nodes know where they go, so a path's gain can be multiplied out ----
class Param { constructor(v) { this.value = v; } cancelScheduledValues() {} setTargetAtTime(v) { this.value = v; } setValueAtTime(v) { this.value = v; } }
class Node {
  constructor(name) { this.name = name; this.outs = new Set(); this.gain = new Param(1); }
  connect(d) { this.outs.add(d); return d; }
  disconnect(d) { if (d === undefined) this.outs.clear(); else if (!this.outs.delete(d)) throw new Error("not connected"); }
}
class Ctx {
  constructor(name) { this.name = name; this.currentTime = 0; this.destination = new Node(`${name}:speakers`); this.gainNode = this.createGain(`${name}:slider`); this.gainNode.connect(this.destination); }
  createGain(name = "gain") { return new Node(name); }
}
/** Total gain from a node to its context's speakers (every path summed; the graph here has one path each). */
function pathGain(node, ctx, seen = new Set()) {
  if (node === ctx.destination) return 1;
  if (seen.has(node)) return 0;
  seen.add(node);
  let sum = 0;
  for (const o of node.outs) sum += pathGain(o, ctx, new Set(seen));
  return node.gain.value * sum;
}

const settings = { soundMix: {}, combatMusicPlaylist: "" };
const audio = { locked: false, music: new Ctx("music"), environment: new Ctx("environment"), interface: new Ctx("interface") };
audio.unlock = Promise.resolve();
globalThis.game = { settings: { get: (m, k) => settings[k], set: async (m, k, v) => { settings[k] = v; } }, audio, user: { isGM: true } };
const twins = {};
globalThis.fromUuidSync = (u) => twins[u] ?? null;

class PlaylistSound {
  constructor(data) { Object.assign(this, data); }
  get context() { return audio[this.parent?.channel ?? "music"]; }
  _createSound() { return { src: this.path, destination: undefined, addEventListener() {} }; }
}
globalThis.CONFIG = { PlaylistSound: { documentClass: PlaylistSound } };

const M = await import(pathToFileURL(path.join(ROOT, "scripts", "sound-mix.js")).href);

// ---- the defaults ----
check("default mix: music 0.6 (+6 dB after SEAT 5, §59), environment 1, cues 1; sliders Music 25%, Environment 50%, Interface 50%",
  JSON.stringify(M.mixOf({})) === JSON.stringify({ music: 0.6, environment: 1, cues: 1 }) && JSON.stringify(M.SLIDER_DEFAULT) === JSON.stringify({ music: 0.25, environment: 0.5, interface: 0.5 }));
check("a stored layer wins, clamped, and nonsense falls back", M.mixOf({ music: 0.2 }).music === 0.2 && M.mixOf({ music: 0 }).music === M.LAYER_MIN && M.mixOf({ music: 99 }).music === M.LAYER_MAX && M.mixOf({ music: "x" }).music === 0.6);
check("DESIGN §59: his music in total (slider × layer) is 6 dB over seat 3's 50% × 0.15 (SEAT 5: 11–17 dB under the beds was too quiet)", near(20 * Math.log10((M.SLIDER_DEFAULT.music * M.MIX_DEFAULT.music) / (0.5 * 0.15)), 6, 0.05));
check("DESIGN: every default slider sits in the brief's 25–50%", Object.values(M.SLIDER_DEFAULT).every((v) => v >= 0.25 && v <= 0.5));
check("DESIGN: the set levels: music 0.8 (his playlists' own), environment 0.5 (his beds), cues 0.6", JSON.stringify(M.SET_LEVEL) === JSON.stringify({ music: 0.8, environment: 0.5, cues: 0.6 }));

// ---- what goes where: the world's own playlist shapes (crooked-moon-6x, seat 3 snapshot 2026-11-16) ----
const PL = (name, channel, music = null, extra = {}) => ({ name, channel, id: name, uuid: `Playlist.${name}`, flags: music ? { "mobile-command": { music, ...extra } } : (Object.keys(extra).length ? { "mobile-command": extra } : {}) });
const S = (pl, o = {}) => new PlaylistSound({ parent: pl, repeat: false, flags: {}, path: "a.ogg", name: "s", ...o });
const room = PL("Room · Foyer", "music", { role: "room", key: "foyer" });
const fight = PL("Fight · Cauldron Room", "music", { role: "battle", key: "cauldron-room" });
const sting = PL("Cue · Fight Won", "music", { role: "cue", key: "fight-won" });
const mood = PL("Mood · Calm", "music", { role: "mood", key: "calm" });
const ghelfi = PL("Ambiences Vol.6 - Michael Ghelfi", "music");
const beds = PL("CM 12 — Beds", "music", null, { cm: true });
const misc = PL("Misc", "music");
const deck = PL("Deck Command · Linked sounds", "environment");
const syrPl = PL("Syrinscape · House", "environment");
const L = (s) => M.layerOf(s);
check("his room, fight, mood music and the music stings → music", L(S(room)) === "music" && L(S(fight, { repeat: true })) === "music" && L(S(mood)) === "music" && L(S(sting)) === "music");
check("the Ghelfi ambiences (loops on the Music channel) → environment", L(S(ghelfi, { repeat: true })) === "environment");
check("12.1's rain bed → environment; the other floors' music beds → music (§25.8)",
  L(S(beds, { repeat: true, flags: { "mobile-command": { cm: "12.1:bed" } } })) === "environment" && L(S(beds, { repeat: true, flags: { "mobile-command": { cm: "12.4:bed" } } })) === "music");
check("the deck's loops → environment, its one-shots → cues", L(S(deck, { repeat: true })) === "environment" && L(S(deck)) === "cues");
check("an unflagged one-shot on the Music channel → music (Foundry's own label)", L(S(misc)) === "music");
check("a Syrinscape bed's local twin → environment", L(S(syrPl, { repeat: false, flags: { "mobile-command": { syrBed: true } } })) === "environment");
check("the battle library → music", M.layerOf(S(PL("Battle", "environment")), { battleLibId: "Playlist.Battle" }) === "music");
check("his escape hatch: a mixLayer flag on the sound, then on its playlist", L(S(room, { flags: { "mobile-command": { mixLayer: "cues" } } })) === "cues" && L(S(PL("X", "music", null, { mixLayer: "environment" }))) === "environment");

// ---- Syrinscape's scale ----
check("Syrinscape value = 37.5 × (v − 1) dB: 0 dB → 1, +18.75 → 1.5 (its ceiling), floor above 0", M.syrValueDb(0) === 1 && M.syrValueDb(18.75) === 1.5 && M.syrValueDb(99) === 1.5 && M.syrValueDb(-999) === M.SYR_FLOOR);
check("his Environment gain on Syrinscape's scale: 0 → 0, 0.5 → −6 dB (0.84), 1 → 1",
  M.syrValueOfGain(0) === 0 && near(37.5 * (M.syrValueOfGain(0.5) - 1), dB(0.5)) && M.syrValueOfGain(1) === 1 && M.syrValueOfGain("x") === null);
const TVS = { music: M.SLIDER_DEFAULT.music, environment: M.SLIDER_DEFAULT.environment };
const sy = M.syrinscapeNodes({}, TVS);
const totalDb = (node) => 37.5 * (node - 1);
check("default: ambience at Syrinscape's ceiling (+18.75 dB), not marked capped", sy.global === 1.5 && sy.capped === false);
check("default: a mood's score lands at its lift + the music layer + Music ÷ Environment (as our music does)", near(totalDb(sy.global) + totalDb(sy.music), M.SYR_LIFT_DB.music + dB(M.MIX_DEFAULT.music) + dB(0.25 / 0.5), 1e-6));
check("a zero slider (a silenced screen) adds nothing to the score's group", near(M.syrinscapeNodes({}, { music: 0, environment: 0.5 }).music, M.syrinscapeNodes({}).music));
check("default: one-shots at their lift + the cues layer", near(totalDb(sy.global) + totalDb(sy.oneshot), M.SYR_LIFT_DB.oneshots, 1e-6));
check("an environment layer above 1 cannot lift Syrinscape past its ceiling: said, not hidden", M.syrinscapeNodes({ environment: 2 }).capped === true && M.syrinscapeNodes({ environment: 2 }).global === 1.5);
// The SEAT 3 arithmetic, so a change to a lift is a change to these predictions (DESIGN §58 table)
const TV_ENV = 0.5;
const oldNet = { ambience: 0, music: 0, oneshots: totalDb(1.4 / 1.5) };          // moods 1.5, one-shots 1.4, local 0.5 raw
const newLocal = totalDb(M.syrValueOfGain(TV_ENV));
const newNet = { ambience: totalDb(sy.global) + newLocal, music: totalDb(sy.global) + totalDb(sy.music) + newLocal, oneshots: totalDb(sy.global) + totalDb(sy.oneshot) + newLocal };
const pred = { ambience: -50 + newNet.ambience - oldNet.ambience, music: -34.5 + newNet.music - oldNet.music, oneshots: -37 + newNet.oneshots - oldNet.oneshots };
check(`predicted on the TV: Syrinscape ambience ≈ −37 dBFS (was ≈ −50), level with our loops`, near(pred.ambience, -37.3, 0.3), pred.ambience.toFixed(1));
const ownMusic = M.MIX_DEFAULT.music * M.SLIDER_DEFAULT.music / M.SLIDER_DEFAULT.environment;
check(`predicted: a Syrinscape score ≈ his own music at the new mix (−29 + ${dB(ownMusic).toFixed(1)} dB)`, near(pred.music, -29 + dB(ownMusic), 0.1), `${pred.music.toFixed(1)}`);
check(`predicted: Syrinscape one-shots stay on our Whistle (≈ −37.3)`, near(pred.oneshots, -37.3, 0.1), pred.oneshots.toFixed(1));

// ---- the rig, end to end ----
check("patch: wraps the one seam once", M.patchMix() === true && M.patchMix() === false);
const play = (doc) => { const s = doc._createSound(); return s; };
const roomSound = play(S(room));
check("rig: built on first use; the slider still feeds the speakers (through the trim)", Boolean(audio.music.mcMix) && audio.music.gainNode.outs.has(audio.music.mcMix.trim) && !audio.music.gainNode.outs.has(audio.music.destination));
check("a room-music sound is routed into the music group", roomSound.destination === audio.music.mcMix.groups.music && roomSound.mcMixLayer === "music");
// a sound's own volume × his slider × its layer, whatever channel it is on
audio.music.gainNode.gain.value = 0.5; audio.environment.gainNode.gain.value = 0.5;
check("music on the Music channel: slider × the music layer (0.6)", near(pathGain(roomSound.destination, audio.music), 0.5 * 0.6));
const ghelfiSound = play(S(ghelfi, { repeat: true }));
check("an ambience on the MUSIC channel plays at the environment layer, not the music one", near(pathGain(ghelfiSound.destination, audio.music), 0.5 * 1));
const deckLoop = play(S(deck, { repeat: true })), deckShot = play(S(deck));
check("the deck's loop and cue on the Environment channel: slider × 1", near(pathGain(deckLoop.destination, audio.environment), 0.5) && near(pathGain(deckShot.destination, audio.environment), 0.5));
check("anything else on a channel (ambient sounds, our synth, dice) takes the channel's layer through the trim",
  near(pathGain(audio.music.gainNode, audio.music), 0.5 * 0.6) && near(pathGain(audio.environment.gainNode, audio.environment), 0.5));
// Syrinscape entries play through Syrinscape; their local twins are routed by the twin
const syrDoc = S(syrPl, { flags: { "syrinscape-control": { soundType: "mood", soundId: "1" } } });
check("a live Syrinscape entry is left alone (its sound is Syrinscape's)", play(syrDoc).destination === undefined);
twins["Playlist.X.PlaylistSound.rain"] = S(ghelfi, { repeat: true });
const fbDoc = S(syrPl, { flags: { "syrinscape-control": { soundType: "mood", soundId: "2" }, "mobile-command": { localFallback: "Playlist.X.PlaylistSound.rain" } } });
fbDoc._createSound = function () { return { mcLocalFallback: "x.ogg", destination: undefined, addEventListener() {} }; };
check("a local twin (Syrinscape offline) plays at its twin's layer", M.routeSound(fbDoc, fbDoc._createSound()).mcMixLayer === "environment");
// the setting moves every rig, live
settings.soundMix = { music: 0.6 };
M.applyMix();
check("a new mix re-gains every rig at once (music 0.6)", near(pathGain(roomSound.destination, audio.music), 0.5 * 0.6) && near(pathGain(ghelfiSound.destination, audio.music), 0.5));
// the duck and the mute still ride his slider node
audio.music.gainNode.gain.value = 0;
check("the TV mute / duck (his slider node) still silences everything on the channel", pathGain(roomSound.destination, audio.music) === 0 && pathGain(ghelfiSound.destination, audio.music) === 0);
audio.music.gainNode.gain.value = 0.5; settings.soundMix = { music: 0.6 }; M.applyMix();

// ---- a set level at the moment it plays (§58.7) ----
const loaded = [];
const mk = (doc) => { const snd = { destination: undefined, addEventListener() {}, load(o) { loaded.push(o?.autoplayOptions?.volume); } }; return M.routeSound(doc, snd); };
const lev = M.levelledFromPatches([
  { id: "m158-a", worlds: ["w1"], sound: { uuid: "U.fiddle", volume: { from: 0.43, to: 0.51 } } },
  { id: "m158-b", worlds: ["w1"], sound: { uuid: "U.village", volume: { from: 0.35, to: 1 }, path: { from: "a.ogg", to: "norm/a.ogg" } } },
  { id: "m158-c", worlds: ["other"], sound: { uuid: "U.elsewhere", volume: { from: 0.2, to: 0.9 } } },
  { id: "x", sound: { uuid: "U.no-volume" } },
], "w1");
check("the deck's levelled table: this world's volume patches only", lev.size === 2 && lev.get("U.fiddle").volume === 0.51 && !lev.has("U.elsewhere"));
check("a levelled sound plays its measured level, not what was left on it", M.setLevelOf({ uuid: "U.fiddle", volume: 1, path: "f.ogg" }, "environment", lev) === 0.51);
check("…only while it still plays the file that level was measured on", M.setLevelOf({ uuid: "U.village", path: "norm/a.ogg" }, "environment", lev) === 1 && M.setLevelOf({ uuid: "U.village", path: "his-swap.ogg" }, "environment", lev) === 0.5);
check("anything else plays its layer's set level, whatever its stored volume", M.setLevelOf({ uuid: "U.x", volume: 1 }, "music") === 0.8 && M.setLevelOf({ uuid: "U.x", volume: 0.06 }, "environment") === 0.5 && M.setLevelOf({}, "cues") === 0.6);
const turnedUp = S(fight, { volume: 1, uuid: "Playlist.F.PlaylistSound.1" });
const ts = mk(turnedUp);
ts.load({ autoplay: true, autoplayOptions: { volume: 1, loop: true, fade: 1000 } });
const fightLevel = 0.8 * M.dbToGain(M.COMBAT_LIFT_DB);
check("start: Foundry's autoplay volume (his turned-up 1.0) is replaced by the set level (0.8, + the fight's 3 dB, §59)", near(loaded.at(-1), fightLevel) && near(ts.mcSetLevel, fightLevel), String(loaded.at(-1)));
// §59 (DM 2026-11-17): fight music sits 3 dB over the scene's default music; nothing else moves
check("§59: a battle playlist's sound is lifted 3 dB; a room's, a mood's and a cue's are not",
  M.COMBAT_LIFT_DB === 3 && M.combatLiftDbOf(S(fight)) === 3 && M.combatLiftDbOf(S(room)) === 0 && M.combatLiftDbOf(S(mood)) === 0 && M.combatLiftDbOf(S(sting)) === 0);
check("§59: the world's battle library is lifted too; a fight sound flagged out of the music layer is not",
  M.combatLiftDbOf(S(PL("Battle", "environment")), { battleLibId: "Playlist.Battle" }) === 3 && M.combatLiftDbOf(S(fight, { flags: { "mobile-command": { mixLayer: "cues" } } })) === 0);
check("§59: the lift adds to a trim (a fight sound trimmed −2 starts at 0.8 + 1 dB)", near(M.setLevelOf(S(fight, { uuid: "U.f" }), "music", null, { "U.f": -2 }), 0.8 * M.dbToGain(1)));
check("§59: in total, fight music ≈ 3 dB over a room's at the same set level", near(20 * Math.log10(M.setLevelOf(S(fight, { uuid: "U.g" }), "music") / M.setLevelOf(S(room, { uuid: "U.h" }), "music")), 3, 1e-9));
ts.load({ autoplay: true, autoplayOptions: { volume: 0 } });
ts.load();
check("a start at 0 and a plain preload pass through untouched", loaded.at(-2) === 0 && loaded.at(-1) === undefined);
check("the stored volume is never written", turnedUp.volume === 1);
// SEAT 6 2026-11-17: a fight track at its own 0.5 played at 0.5, not 1.13: core f6s a started sound IN to the
// document's volume (PlaylistSound#_onStart) and re-f6s a playing one to it on any update (#sync)
const f6s = [];
const fightDoc = S(fight, { volume: 0.5, uuid: "Playlist.F.PlaylistSound.2" });
const fs6 = M.routeSound(fightDoc, { destination: undefined, addEventListener() {}, load() {}, fade(v, o) { f6s.push([v, o?.from ?? null]); } });
fs6.fade(0.5, { duration: 1000, from: 0 });
check("SEAT 6: core's fade-in to the document's volume (0.5) goes to the fight's set level (0.8 + 3 dB ≈ 1.13) instead",
  near(f6s.at(-1)[0], fightLevel) && f6s.at(-1)[1] === 0, JSON.stringify(f6s));
fs6.fade(0.5, { duration: 500 });
check("…and so does core's re-fade on an update of the playing sound (the overlap's hand-off, a fade written)", near(f6s.at(-1)[0], fightLevel));
fs6.fade(0, { duration: 1000 });
check("a fade to 0 (a stop, the fade-out at the end) passes through", f6s.at(-1)[0] === 0);
fightDoc.volume = 0.3; fs6.fade(0.3, { duration: 500 });
check("a drag that changes the document's volume is his: it plays (and stays) as dragged", f6s.at(-1)[0] === 0.3 && fs6.mcDragged === true);
fs6.fade(0.3, { duration: 500 });
check("…a later re-fade keeps his drag", f6s.at(-1)[0] === 0.3);
const roomDoc = S(room, { volume: 0.8, uuid: "Playlist.R.PlaylistSound.2" }); const rf = [];
M.routeSound(roomDoc, { destination: undefined, addEventListener() {}, load() {}, fade(v) { rf.push(v); } }).fade(0.8, { duration: 3000, from: 0 });
check("a room's track takes the same path (its set level 0.8)", near(rf.at(-1), 0.8));

// ---- per-sound trims (§58.10) ----
check("trim key: a local sound by uuid; a Syrinscape entry by its Syrinscape sound (shared by all its entries)",
  M.trimKeyOf({ uuid: "Playlist.A.PlaylistSound.b" }) === "Playlist.A.PlaylistSound.b" && M.trimKeyOf({ uuid: "x", flags: { "syrinscape-control": { soundType: "mood", soundId: 861010 } } }) === "syr:mood:861010" && M.trimKeyOf("syr:element:5") === "syr:element:5");
check("trim: on top of the set level, in dB; clamped −40 … +24", near(M.setLevelOf({ uuid: "U.x" }, "music", null, { "U.x": -6 }), 0.8 * M.dbToGain(-6)) && M.trimDbOf("k", { k: 99 }) === 24 && M.trimDbOf("k", { k: "x" }) === 0);
check("trim: on top of a levelled sound's measured level too", near(M.setLevelOf({ uuid: "U.fiddle", path: "f.ogg" }, "environment", lev, { "U.fiddle": 3 }), 0.51 * M.dbToGain(3)));
check("the active mood: a moment wins over the waiting bed; nothing playing → none",
  M.activeMood([{ playing: true, type: "mood", id: "bed", bed: true }, { playing: true, type: "mood", id: "car" }]).id === "car" && M.activeMood([{ playing: false, type: "mood", id: "x" }]) === null);
const lw = M.syrLocalWithTrim(0.5, 1, -4);
check("a mood trim on Syrinscape's local volume: −4 dB lands in full", near(lw.appliedDb, -4) && near(37.5 * (lw.local - 1), dB(0.5) - 4));
const hi = M.syrLocalWithTrim(0.5, 1, 10);
check("…+10 dB stops at the top (0 dB) and says how much landed", hi.local === 1 && near(hi.appliedDb, -dB(0.5)));
// the API and live refresh
const TS = S(room, { uuid: "Playlist.Room.PlaylistSound.t1", playing: true });
globalThis.fromUuidSync = (u) => (u === TS.uuid ? Object.assign(TS, { documentName: "PlaylistSound" }) : (u === "Playlist.Syr.PlaylistSound.m" ? { documentName: "PlaylistSound", uuid: u, flags: { "syrinscape-control": { soundType: "mood", soundId: "777" } } } : twins[u] ?? null));
const fades = [];
TS.sound = { playing: true, mcSetLevel: 0.8, fade(v) { fades.push(v); } };
TS.sound.mcLevelOf = () => M.setLevelOf(TS, "music", null, M.trimsNow());
game.playlists = [{ sounds: [TS] }];
let tr = await M.setSoundTrim(TS.uuid, -6);
check("trim(uuid, dB): written under the sound's uuid", tr.ok && settings.soundTrims[TS.uuid] === -6);
M.refreshTrims();
check("a trim reaches a sound that is playing at once (a short fade to its new level)", near(fades.at(-1), 0.8 * M.dbToGain(-6)));
tr = await M.setSoundTrim({ "Playlist.Syr.PlaylistSound.m": 2.04, "syr:element:4668915": -3, "not-a-sound": 1 });
check("trim({…}): one write; a Syrinscape entry's uuid becomes its syr: key; rounded to 0.1 dB; a stranger is refused",
  settings.soundTrims["syr:mood:777"] === 2 && settings.soundTrims["syr:element:4668915"] === -3 && tr.refused.length === 1 && tr.refused[0] === "not-a-sound");
check("trims(): all, or one by id", M.getSoundTrims()["syr:mood:777"] === 2 && M.getSoundTrims(TS.uuid) === -6);
await M.setSoundTrim(TS.uuid, null);
check("trim(id, null) removes it", !(TS.uuid in settings.soundTrims) && M.getSoundTrims(TS.uuid) === 0);
settings.soundTrims = {}; game.playlists = [];
// ---- §58.11: a sound MC already levelled keeps its level (the Whistle: 0.28, not 0.6) ----
const whistle = { uuid: "Playlist.BZ.PlaylistSound.ySu0", path: "Train Whistle.mp3", volume: 0.28, flags: { "mobile-command": { volumeWas: 0.5 } } };
check("base: a sound MC levelled by its measured loudness (§53, volumeWas) plays its stored volume, 0.28 (the first build gave 0.6: +6.6 dB, SEAT 4's step 4)",
  near(M.baseLevelOf(whistle, "cues", null), 0.28) && near(M.firstBuildBaseOf(whistle, "cues", null), 0.6));
check("base: the deck's measured level still wins; an unlevelled sound still plays its layer's set level",
  near(M.baseLevelOf({ ...whistle, uuid: "U.fiddle", path: "f.ogg" }, "environment", lev), 0.51) && near(M.baseLevelOf({ uuid: "U.n", volume: 0.9 }, "cues", null), 0.6));
const rb = M.planTrimRebase({ [whistle.uuid]: -6.6, "U.other": 2, "syr:mood:1": 3 }, [{ key: whistle.uuid, old: 0.6, now: 0.28 }, { key: "U.other", old: 0.6, now: 0.6 }]);
check("rebase: tonight's −6.6 on the Whistle becomes 0.0, so it plays exactly as loud as the seat set it (0.6·−6.6 dB = 0.28·0 dB)",
  rb.trims[whistle.uuid] === 0 && near(0.6 * M.dbToGain(-6.6), 0.28 * M.dbToGain(rb.trims[whistle.uuid]), 0.002) && rb.moved.length === 1);
check("rebase: a trim whose base did not change and Syrinscape trims are left as they are", rb.trims["U.other"] === 2 && rb.trims["syr:mood:1"] === 3);
const rc = M.planTrimRebase({ k: 20 }, [{ key: "k", old: 0.6, now: 0.07 }]);
const rm = M.planTrimRebase({}, [{ key: "U.bear", old: 0.6, now: 0.3, measured: true }, { key: "U.unheard", old: 0.6, now: 0.3 }]);
check("rebase: a sound the seat heard and left untrimmed (within 1 dB) gets the trim that keeps it as loud (+6 dB); one never heard is left to its level",
  rm.trims["U.bear"] === 6 && !("U.unheard" in rm.trims));
check("rebase covers the trimmed sounds' whole playlists (the seat heard all of them)", /for \(const sib of doc\.parent\?\.sounds/.test(fs.readFileSync(path.join(ROOT, "scripts", "sound-mix.js"), "utf8")));
check("rebase: a result past +24 dB is clamped and reported", rc.trims.k === 24 && rc.clamped[0] === "k");
check("rebase runs once, primary GM, after the deck's table, keeping the old map",
  /loadLevelled\(\)\.then\(\(\) => rebaseTrimsOnce\(\)\)/.test(fs.readFileSync(path.join(ROOT, "scripts", "sound-mix.js"), "utf8")) && /"soundTrimsV1", trims\)/.test(fs.readFileSync(path.join(ROOT, "scripts", "sound-mix.js"), "utf8")) && /"soundTrimsBase", \{ scope: "world"/.test(fs.readFileSync(path.join(ROOT, "scripts", "settings.js"), "utf8")));

// ---- launch sliders (§58.7) ----
check("launch: a screen at 1 / 1 / 1 is put back to 25 / 50 / 50",
  JSON.stringify(M.planLaunchSliders({ music: 1, environment: 1, interface: 1 })) === JSON.stringify([{ key: "globalPlaylistVolume", value: 0.25 }, { key: "globalAmbientVolume", value: 0.5 }, { key: "globalInterfaceVolume", value: 0.5 }]));
check("launch: a screen already there is not written", M.planLaunchSliders({ music: 0.25, environment: 0.5, interface: 0.5 }).length === 0);
const coreSet = [];
const gget = game.settings.get, gset = game.settings.set;
const core = { globalPlaylistVolume: 1, globalAmbientVolume: 1, globalInterfaceVolume: 1 };
game.settings.get = (m, k) => (m === "core" ? core[k] : settings[k]);
game.settings.set = (m, k, v) => { if (m === "core") { core[k] = v; coreSet.push(k); } else settings[k] = v; };
game.user = { isGM: true, id: "gm" }; game.users = { activeGM: { id: "gm" } };
// ---- the staged conversion on HIS world (§58.13): stage 2 = acccf7e already converted; only the fill-in may run ----
{
  const pl = { sounds: [] };
  const mk = (id, vol, was) => ({ documentName: "PlaylistSound", uuid: `Playlist.L.PlaylistSound.${id}`, path: `${id}.ogg`, volume: vol, parent: pl, flags: was == null ? {} : { "mobile-command": { volumeWas: was } } });
  const W = mk("whistle", 0.28, 0.5), B = mk("bear", 0.3, 0.5), U = mk("plain", 0.6, null);
  pl.sounds.push(W, B, U);
  const byU = { [W.uuid]: W, [B.uuid]: B, [U.uuid]: U };
  const oldFU = globalThis.fromUuidSync; globalThis.fromUuidSync = (u) => byU[u] ?? null;
  settings.soundTrimsV1 = { [W.uuid]: -6.6, "syr:mood:9": -5 };
  settings.soundTrims = { [W.uuid]: 0, "syr:mood:9": -5 };   // what his 22:29 load left
  settings.soundTrimsBase = 2;
  const r1 = await M.rebaseTrimsOnce();
  check("stage 2: the fill-in adds ONLY the heard-but-untrimmed sound whose base moved (Bear Ripped 0.6 → 0.3: +6 dB)",
    settings.soundTrims[B.uuid] === 6 && !(U.uuid in settings.soundTrims) && r1.moved.length === 1, JSON.stringify(settings.soundTrims));
  check("stage 2: the trims acccf7e already converted are NOT converted again (the Whistle stays 0; moods as they were)",
    settings.soundTrims[W.uuid] === 0 && settings.soundTrims["syr:mood:9"] === -5);
  check("stage 2: the kept original map (soundTrimsV1) is left as it was; the world is marked 3",
    settings.soundTrimsV1[W.uuid] === -6.6 && settings.soundTrimsBase === 3);
  const snap = JSON.stringify(settings.soundTrims);
  check("stage 3: a later load does nothing", (await M.rebaseTrimsOnce()) === null && JSON.stringify(settings.soundTrims) === snap);
  settings.soundTrims[B.uuid] = -1; settings.soundTrimsBase = 2;
  await M.rebaseTrimsOnce();
  check("stage 2 never overwrites a trim a sound already has", settings.soundTrims[B.uuid] === -1);
  // a world that never converted (stage 1) gets the whole thing in one go, straight to 3
  settings.soundTrims = { [W.uuid]: -6.6 }; settings.soundTrimsV1 = {}; settings.soundTrimsBase = 1;
  await M.rebaseTrimsOnce();
  check("stage 1: the full conversion (Whistle −6.6 → 0, Bear +6), the old map kept, marked 3",
    settings.soundTrims[W.uuid] === 0 && settings.soundTrims[B.uuid] === 6 && settings.soundTrimsV1[W.uuid] === -6.6 && settings.soundTrimsBase === 3);
  globalThis.fromUuidSync = oldFU; settings.soundTrims = {}; settings.soundTrimsV1 = {}; delete settings.soundTrimsBase;
  // SEAT 6 2026-11-17: the Secret door's −31 was 6 dB too deep; −25, once, only while it still reads −31
  const door = "syr:element:244016";
  settings.soundTrims = { [door]: -31, "syr:element:244009": -32 }; settings.soundTrimFixes = [];
  const fx = await M.fixTrimsOnce();
  check("SEAT 6: the Secret door's trim −31 → −25 on the GM's load; nothing else moves; marked done",
    settings.soundTrims[door] === -25 && settings.soundTrims["syr:element:244009"] === -32 && settings.soundTrimFixes.includes("secret-door-25") && fx.applied.length === 1, JSON.stringify(settings.soundTrims));
  settings.soundTrims[door] = -20;
  check("…a later load does nothing, and never touches a change of his", (await M.fixTrimsOnce()) === null && settings.soundTrims[door] === -20);
  settings.soundTrims = { [door]: -28 }; settings.soundTrimFixes = [];
  await M.fixTrimsOnce();
  check("a trim he had already changed (not −31) is left as he has it, and the fix is not tried again",
    settings.soundTrims[door] === -28 && settings.soundTrimFixes.includes("secret-door-25"));
  check("pure: planTrimFixes skips done ids", M.planTrimFixes({ [door]: -31 }, ["secret-door-25"]).applied.length === 0);
  settings.soundTrims = {}; delete settings.soundTrimFixes;
}
settings.tvVolume = { music: 1, ambient: 1, interface: 1 };
const did = M.applyLaunchVolumes({ isDisplay: false });
check("launch, the primary GM: its own sliders AND the TV's (tvVolume) to the defaults",
  core.globalPlaylistVolume === 0.25 && core.globalAmbientVolume === 0.5 && core.globalInterfaceVolume === 0.5 && JSON.stringify(settings.tvVolume) === JSON.stringify(M.TV_DEFAULT), did.join());
core.globalPlaylistVolume = 1; coreSet.length = 0;
M.applyLaunchVolumes({ isDisplay: true });
check("launch, the TV: its own sliders are left to tvVolume (the mirror it always had)", coreSet.length === 0);
settings.launchVolumes = false;
check("launch: the world switch off writes nothing", M.applyLaunchVolumes({}).length === 0);
settings.launchVolumes = true;
game.settings.get = gget; game.settings.set = gset;

// ---- the master (§58.8) ----
check("master: 10% grid, 0 … 200%, default 100%", M.masterOf(undefined) === 1 && M.masterOf(1.04) === 1 && M.masterOf(1.26) === 1.3 && M.masterOf(9) === 2 && M.masterOf(-1) === 0 && M.MASTER_MAX === 2);
check("master: scales every channel's trim, so every layer moves together (ratios kept)",
  near(M.rigGains({}, "music", 0.5).trim, M.MIX_DEFAULT.music * 0.5) && near(M.rigGains({}, "environment", 0.5).trim, 0.5) && M.rigGains({}, "music", 0.5).groups.environment === M.rigGains({}, "music", 1).groups.environment);
check("master: Syrinscape follows through its local volume (Environment × master)", near(37.5 * (M.syrLocalOf(0.5, 0.5) - 1), dB(0.25)) && M.syrLocalOf(0.5, 0) === 0);
check("master: the top end is where Syrinscape's local volume runs out: 200% at Environment 50% = 0 dB", M.syrLocalOf(0.5, 2) === 1 && M.syrLocalOf(0.5, 3) === 1);
settings.soundMaster = 1;
let rr = await M.stepSoundMaster(+1);
check("step +: 100% → 110%", rr.ok && rr.pct === 110 && settings.soundMaster === 1.1);
await M.setSoundMaster(1.95); rr = await M.stepSoundMaster(+1);
check("step + at the top stays at 200% and says so", rr.pct === 200 && rr.atMax === true);
await M.setSoundMaster(0.05); rr = await M.stepSoundMaster(-1);
check("step − at the bottom stays at 0% and says so", rr.pct === 0 && rr.atMin === true);
settings.soundMaster = 0.5; M.applyMix();
check("master: applied to the live rigs", near(pathGain(roomSound.destination, audio.music), 0.5 * 0.6 * 0.5));
settings.soundMaster = 1; settings.soundMix = {}; M.applyMix();

// ---- the glue ----
const src = (f) => fs.readFileSync(path.join(ROOT, "scripts", f), "utf8");
check("nothing in the mix writes a document or a sound's stored volume; the only core write is the launch sliders",
  !/\.update\(|\.volume\s*=/.test(src("sound-mix.js").replace(/^\s*(\/\/|\*).*$/gm, "")) && (src("sound-mix.js").match(/game\.settings\.set\("core"/g) ?? []).length === 1);
check("launch volumes run first in ready, before the phone and DM-machine rules", /Hooks\.once\("ready", \(\) => \{[\s\S]{0,400}applyLaunchVolumes\(\{ isDisplay: isDisplayClient\(\) \}\)/.test(src("main.js")));
check("a released silence comes back to the launch defaults, not 0.5", /restore: \{ music: SLIDER_DEFAULT\.music, environment: SLIDER_DEFAULT\.environment \}/.test(src("main.js")) && /back\[key\] \?\? 0\.5/.test(src("main.js")));
check("master and trims published: master.get / set / step, trim, trims", /master: \{ get: getSoundMaster, set: setSoundMaster, step: stepSoundMaster \}, trim: setSoundTrim, trims: getSoundTrims/.test(src("main.js")));
check("trims are a WORLD setting that re-levels what plays and Syrinscape on change",
  /register\(MODULE_ID, "soundTrims", \{\s*scope: "world", config: false, type: Object, default: \{\},\s*onChange: \(\) => \{ refreshTrims\(\); syncSyrinscapeVolume\(\); syncSyrinscapeLevels\(\); \}/.test(fs.readFileSync(path.join(ROOT, "scripts", "settings.js"), "utf8")));
check("registered after the bridge (it wraps the bridge's seam), published for the deck",
  /registerSyrinscapeBridge\(\);[^\n]*\n\s*registerSoundMix\(\);/.test(src("main.js")) && /mix: setSoundMix, mixState: soundMixState/.test(src("main.js")));
check("the card table's own audio takes the cues layer", /\* cues;/.test(src("card-audio.js")) && /import \{ mixNow \} from "\.\/sound-mix\.js"/.test(src("card-audio.js")));

console.log(`\nall ${n} passed`);
