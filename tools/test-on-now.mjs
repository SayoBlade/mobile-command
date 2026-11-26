// On now (MC redesign phase 2, DM 2026-11-26): the panel floor's one line (music · weather · hour · TV) and the sheet
// behind it, saying what the automatic systems are doing and why. scripts/on-now.js (pure) + the panel and the pause
// sites (by source).
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-on-now.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import fs from "node:fs";
const REPO = new URL("..", import.meta.url);
const O = await import(new URL("scripts/on-now.js", REPO));
let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const J = JSON.stringify;

/* ── 1–6. music and why ─────────────────────────────────────────────────────────────────────────────── */
check("the music layer off says so", O.musicWhy({ enabled: false }).text === "off");
check("silence you chose: 'silence · you chose silence'", J(O.musicWhy({ enabled: true, manual: "silence" })) === J({ text: "silence", why: "you chose silence" }));
check("a room's music names the room", O.musicWhy({ enabled: true, auto: true, now: "Crooked House", nowRoom: "r1", rooms: [{ uuid: "r1", name: "Parlour" }] }).why === "the party is in Parlour");
check("in a fight: 'the fight'", O.musicWhy({ enabled: true, auto: true, now: "Battle", inCombat: true }).why === "the fight");
check("a pick of yours outranks the fight: 'you chose it'", O.musicWhy({ enabled: true, manual: "mood", now: "Eerie", inCombat: true }).why === "you chose it");
check("nothing for this place, on auto", J(O.musicWhy({ enabled: true, auto: true, now: "" })) === J({ text: "nothing", why: "no music for this place" }));

/* ── 7–11. the TV's camera ──────────────────────────────────────────────────────────────────────────── */
check("an intro holding the picture wins over everything", O.tvCameraWhat({ held: true, manual: true }).text === "held");
check("manual: your pan and zoom", O.tvCameraWhat({ manual: true, of: 4, followed: 4 }).text === "manual");
check("in a fight: spotlight", O.tvCameraWhat({ combat: true, of: 4, followed: 4 }).text === "spotlight");
check("some heroes not followed: 'follows 3/4'", O.tvCameraWhat({ of: 4, followed: 3 }).text === "follows 3/4");
check("nobody followed is a warning", O.tvCameraWhat({ of: 4, followed: 0 }).warn === true);

/* ── 12–15. the TV's sound ──────────────────────────────────────────────────────────────────────────── */
const now = 1e6;
check("no report for 45 s: 'no TV' (warning)", O.tvSoundWhat({ at: now - 46000 }, false, now).text === "no TV");
check("never tapped: 'tap the TV'", O.tvSoundWhat({ at: now, locked: true }, false, now).text === "tap the TV");
check("muted by you: 'muted'", O.tvSoundWhat({ at: now }, true, now).text === "muted");
check("playing: 'live', no warning", J(O.tvSoundWhat({ at: now }, false, now)) === J({ text: "live", why: "the TV is playing sound" }));

/* ── 16–20. the lines ───────────────────────────────────────────────────────────────────────────────── */
let L = O.onNowLines({ music: { enabled: true, auto: true, now: "Crooked House" }, weather: "Rain", clock: "21:40", tv: { of: 4, followed: 4 }, tvSound: { at: now }, now });
check("the first four lines, in order: music, weather, hour, TV", L.slice(0, 4).map((l) => l.key).join() === "music,weather,hour,tv", L.map((l) => l.key).join());
check("…reading 'Crooked House', 'Rain', '21:40', 'follows party'", L.slice(0, 4).map((l) => l.text).join("|") === "Crooked House|Rain|21:40|follows party");
check("not paused: no Game line", !L.some((l) => l.key === "pause"));
L = O.onNowLines({ paused: true, pauseWhy: "Gorbon's boss intro", tvSound: { at: now }, now });
const p = L.find((l) => l.key === "pause");
check("paused by an intro: 'paused · by Gorbon's boss intro', a warning, with Resume", p && p.why === "by Gorbon's boss intro" && p.warn && p.act === "resume", J(p));
check("paused with no named reason: 'by you'", O.onNowLines({ paused: true }).find((l) => l.key === "pause").why === "by you");
L = O.onNowLines({ syr: { module: true, offline: true }, now });
check("Syrinscape offline is a warning line: 'offline · playing the local copies instead'", J(L.find((l) => l.key === "syr")) === J({ key: "syr", icon: "cloud", label: "Syrinscape", text: "offline", why: "playing the local copies instead", warn: true }));
check("no Syrinscape module: no Syrinscape line", !O.onNowLines({ syr: { module: false } }).some((l) => l.key === "syr"));

/* ── 22–24. the pause reason ────────────────────────────────────────────────────────────────────────── */
O.notePause("an intro");
check("a named pause reads back while paused", O.pauseReason(true) === "an intro" && O.pauseReason(false) === null);
O.onPauseGameForWhy(false);
check("resuming clears it (a later pause of yours reads 'by you')", O.pauseReason(true) === null);
const src = (f) => fs.readFileSync(new URL(`scripts/${f}`, REPO), "utf8");
check("every automatic pause names itself: boss intro, intro, leaving the scene, a player's ask, travel",
  /notePause\(`\$\{actor\.name\}'s boss intro`\)/.test(src("boss-intro.js")) && /notePause\("an intro"\)/.test(src("entrances.js"))
  && /notePause\("you leaving the active scene"\)/.test(src("pause-guard.js")) && /if \(on\) notePause\(/.test(src("rpc.js")) && /notePauseWhy\("travel"\)/.test(src("dm-panel.js")));

/* ── 25–26. the panel ───────────────────────────────────────────────────────────────────────────────── */
const panel = src("dm-panel.js");
check("the floor draws On now under Waiting, above the camera buttons", /waitingHTML\(\) \+ onNowHTML\(\) \+ cameraFloorHTML\(\)/.test(panel));
check("the line opens the sheet, and Resume lifts the pause", /\[data-now-toggle\]"\)\) \{ nowOpen = !nowOpen/.test(panel) && /\[data-now-resume\]"\)\) \{ if \(game\.paused\) game\.togglePause\(false/.test(panel));

/* ── SEAT 37 ────────────────────────────────────────────────────────────────────────────────────────── */
const F = O.onNowFloor(O.onNowLines({ music: { enabled: true, auto: true, now: "Tension" }, weather: "Thunderstorm", clock: "7 October 2026 · 00:02:13", tv: { of: 4, followed: 4 }, tvSound: { at: now }, now }));
check("SEAT 37: the floor line is music · weather · TV, no hour", F.map((f) => f.key).join() === "music,weather,tv", J(F));
check("…the music by name; weather and a following camera are glyphs only, named on hover",
  F[0].text === "Tension" && !("text" in F[1]) && F[1].title === "Weather: Thunderstorm" && !("text" in F[2]) && /^TV camera: follows party/.test(F[2].title), J(F));
const short = (tv) => O.onNowFloor(O.onNowLines({ tv })).find((f) => f.key === "tv").text;
check("…a camera doing something else says so in one short word",
  short({ manual: true }) === "manual" && short({ of: 4, followed: 0 }) === "nobody" && short({ of: 4, followed: 2 }) === "2/4" && short({ combat: true, of: 4, followed: 4 }) === "turns");
const css = fs.readFileSync(new URL("styles/shell.css", REPO), "utf8");
check("…only the music's name may shorten (CSS)", /\.mc-dmp-now-f \{[^}]*flex: 0 0 auto;/.test(css) && /\.mc-dmp-now-f\.mc-dmp-now-music \{ flex: 1 1 auto; min-width: 0; \}/.test(css));
check("SEAT 37: the line repaints when the music layer says what it made audible, and when a pick is stored",
  /Hooks\.on\(`\$\{MODULE_ID\}\.music`, \(\) => render\(\)\)/.test(panel) && /s\?\.key === `\$\{MODULE_ID\}\.musicState`\) render\(\)/.test(panel));
console.log(`\nAll ${n} passed.`);
