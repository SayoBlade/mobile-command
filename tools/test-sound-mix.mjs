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
check("default mix: music 0.15, environment 1, cues 1", JSON.stringify(M.mixOf({})) === JSON.stringify({ music: 0.15, environment: 1, cues: 1 }));
check("a stored layer wins, clamped, and nonsense falls back", M.mixOf({ music: 0.3 }).music === 0.3 && M.mixOf({ music: 0 }).music === M.LAYER_MIN && M.mixOf({ music: 99 }).music === M.LAYER_MAX && M.mixOf({ music: "x" }).music === 0.15);
check("DESIGN: the music layer puts his music 6–12 dB under the environment layer (the brief's 'clearly heard over')", (() => { const d = dB(M.MIX_DEFAULT.environment) - dB(M.MIX_DEFAULT.music); return d >= 6 && d <= 20; })());

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
const sy = M.syrinscapeNodes({});
const totalDb = (node) => 37.5 * (node - 1);
check("default: ambience at Syrinscape's ceiling (+18.75 dB), not marked capped", sy.global === 1.5 && sy.capped === false);
check("default: a mood's score lands at its lift + the music layer (dB add through the global)", near(totalDb(sy.global) + totalDb(sy.music), M.SYR_LIFT_DB.music + dB(0.15), 1e-6));
check("default: one-shots at their lift + the cues layer", near(totalDb(sy.global) + totalDb(sy.oneshot), M.SYR_LIFT_DB.oneshots, 1e-6));
check("an environment layer above 1 cannot lift Syrinscape past its ceiling: said, not hidden", M.syrinscapeNodes({ environment: 2 }).capped === true && M.syrinscapeNodes({ environment: 2 }).global === 1.5);
// The SEAT 3 arithmetic, so a change to a lift is a change to these predictions (DESIGN §58 table)
const TV_ENV = 0.5;
const oldNet = { ambience: 0, music: 0, oneshots: totalDb(1.4 / 1.5) };          // moods 1.5, one-shots 1.4, local 0.5 raw
const newLocal = totalDb(M.syrValueOfGain(TV_ENV));
const newNet = { ambience: totalDb(sy.global) + newLocal, music: totalDb(sy.global) + totalDb(sy.music) + newLocal, oneshots: totalDb(sy.global) + totalDb(sy.oneshot) + newLocal };
const pred = { ambience: -50 + newNet.ambience - oldNet.ambience, music: -34.5 + newNet.music - oldNet.music, oneshots: -37 + newNet.oneshots - oldNet.oneshots };
check(`predicted on the TV: Syrinscape ambience ≈ −37 dBFS (was ≈ −50), level with our loops`, near(pred.ambience, -37.3, 0.3), pred.ambience.toFixed(1));
check(`predicted: a Syrinscape score ≈ his own music at the new layer (−29 + ${dB(0.15).toFixed(1)} dB)`, near(pred.music, -29 + dB(0.15), 0.1), `${pred.music.toFixed(1)}`);
check(`predicted: Syrinscape one-shots stay on our Whistle (≈ −37.3)`, near(pred.oneshots, -37.3, 0.1), pred.oneshots.toFixed(1));

// ---- the rig, end to end ----
check("patch: wraps the one seam once", M.patchMix() === true && M.patchMix() === false);
const play = (doc) => { const s = doc._createSound(); return s; };
const roomSound = play(S(room));
check("rig: built on first use; the slider still feeds the speakers (through the trim)", Boolean(audio.music.mcMix) && audio.music.gainNode.outs.has(audio.music.mcMix.trim) && !audio.music.gainNode.outs.has(audio.music.destination));
check("a room-music sound is routed into the music group", roomSound.destination === audio.music.mcMix.groups.music && roomSound.mcMixLayer === "music");
// a sound's own volume × his slider × its layer, whatever channel it is on
audio.music.gainNode.gain.value = 0.5; audio.environment.gainNode.gain.value = 0.5;
check("music on the Music channel: slider × 0.15", near(pathGain(roomSound.destination, audio.music), 0.5 * 0.15));
const ghelfiSound = play(S(ghelfi, { repeat: true }));
check("an ambience on the MUSIC channel plays at the environment layer, not the music one", near(pathGain(ghelfiSound.destination, audio.music), 0.5 * 1));
const deckLoop = play(S(deck, { repeat: true })), deckShot = play(S(deck));
check("the deck's loop and cue on the Environment channel: slider × 1", near(pathGain(deckLoop.destination, audio.environment), 0.5) && near(pathGain(deckShot.destination, audio.environment), 0.5));
check("anything else on a channel (ambient sounds, our synth, dice) takes the channel's layer through the trim",
  near(pathGain(audio.music.gainNode, audio.music), 0.5 * 0.15) && near(pathGain(audio.environment.gainNode, audio.environment), 0.5));
// Syrinscape entries play through Syrinscape; their local twins are routed by the twin
const syrDoc = S(syrPl, { flags: { "syrinscape-control": { soundType: "mood", soundId: "1" } } });
check("a live Syrinscape entry is left alone (its sound is Syrinscape's)", play(syrDoc).destination === undefined);
twins["Playlist.X.PlaylistSound.rain"] = S(ghelfi, { repeat: true });
const fbDoc = S(syrPl, { flags: { "syrinscape-control": { soundType: "mood", soundId: "2" }, "mobile-command": { localFallback: "Playlist.X.PlaylistSound.rain" } } });
fbDoc._createSound = function () { return { mcLocalFallback: "x.ogg", destination: undefined, addEventListener() {} }; };
check("a local twin (Syrinscape offline) plays at its twin's layer", M.routeSound(fbDoc, fbDoc._createSound()).mcMixLayer === "environment");
// the setting moves every rig, live
settings.soundMix = { music: 0.3 };
M.applyMix();
check("a new mix re-gains every rig at once (music 0.3)", near(pathGain(roomSound.destination, audio.music), 0.5 * 0.3) && near(pathGain(ghelfiSound.destination, audio.music), 0.5));
// the duck and the mute still ride his slider node
audio.music.gainNode.gain.value = 0;
check("the TV mute / duck (his slider node) still silences everything on the channel", pathGain(roomSound.destination, audio.music) === 0 && pathGain(ghelfiSound.destination, audio.music) === 0);
audio.music.gainNode.gain.value = 0.5; settings.soundMix = {}; M.applyMix();

// ---- the glue ----
const src = (f) => fs.readFileSync(path.join(ROOT, "scripts", f), "utf8");
check("nothing in the mix writes a document, a sound volume or a client setting", !/\.update\(|game\.settings\.set\("core"|\.volume\s*=/.test(src("sound-mix.js").replace(/^\s*(\/\/|\*).*$/gm, "")));
check("registered after the bridge (it wraps the bridge's seam), published for the deck",
  /registerSyrinscapeBridge\(\);[^\n]*\n\s*registerSoundMix\(\);/.test(src("main.js")) && /mix: setSoundMix, mixState: soundMixState/.test(src("main.js")));
check("the card table's own audio takes the cues layer", /\* cues;/.test(src("card-audio.js")) && /import \{ mixNow \} from "\.\/sound-mix\.js"/.test(src("card-audio.js")));

console.log(`\nall ${n} passed`);
