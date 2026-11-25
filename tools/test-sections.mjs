// The six sections (MC redesign phase 3, DM 2026-11-26: 1A, 4A "Stage", 10A): the DM panel's nine tabs regrouped as
// Fight · Party · Stage · Time · Story · Setup, nothing removed, plus the "found on the way" clean-up. By source:
// scripts/dm-panel.js, actions-cm.js, settings-app.js, dm-wizard.js.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-sections.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import fs from "node:fs";
const REPO = new URL("..", import.meta.url);
const src = (f) => fs.readFileSync(new URL(`scripts/${f}`, REPO), "utf8");
const P = src("dm-panel.js");
let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const between = (a, b) => { const i = P.indexOf(a); return i < 0 ? "" : P.slice(i, P.indexOf(b, i + a.length)); };

/* ── 1–4. the rail ──────────────────────────────────────────────────────────────────────────────────── */
const secBlock = between("export const SECTIONS = Object.freeze([", "]);");
const secs = [...secBlock.matchAll(/\{ id: "(\w+)", icon: "([\w-]+)", label: "(\w+)", views: \[(.*?)\] \}/g)].map((m) => ({ id: m[1], label: m[3], views: [...m[4].matchAll(/\["(\w+)", "(\w+)"\]/g)].map((v) => v[1]) }));
check("six sections, in order: Fight · Party · Stage · Time · Story · Setup", secs.map((s) => s.label).join(" · ") === "Fight · Party · Stage · Time · Story · Setup", secs.map((s) => s.label).join());
const OLD = ["combat", "party", "display", "rest", "travel", "effects", "crooked", "preflight", "settings"];
const all = secs.flatMap((s) => s.views);
check("every one of the nine old tabs lives in exactly one section", OLD.every((v) => all.filter((x) => x === v).length === 1), all.join());
check("Stage = Camera · Sound · Effects; Time = Clock · Travel · Rest; Story = Story · Moon; Setup = Health · Table",
  /\["display", "Camera"\], \["sound", "Sound"\], \["effects", "Effects"\]/.test(secBlock) && /\["clock", "Clock"\], \["travel", "Travel"\], \["rest", "Rest"\]/.test(secBlock)
  && /\["story", "Story"\], \["crooked", "Moon"\]/.test(secBlock) && /\["preflight", "Health"\], \["settings", "Table"\]/.test(secBlock));
const rail = between("function tabRailHTML() {", "\n}\n");
check("the rail draws the six (a section button, not the old nine)", (rail.match(/\$\{tab\("/g) ?? []).length === 6 && /data-dock-section/.test(rail) && !/tab\("crooked"/.test(rail), rail.slice(0, 200));

/* ── 5–8. views and the switch ──────────────────────────────────────────────────────────────────────── */
const fly = between("function flyoutHTML() {", "const grabTop");
check("the workspace draws all twelve views", all.every((v) => fly.includes(`dockTab === "${v}"`)), all.filter((v) => !fly.includes(`dockTab === "${v}"`)).join());
check("a section with several views shows the switch; the Moon view only while the campaign tools are on",
  /\$\{viewSwitchHTML\(\)\}<div class="mc-dmp-fly-body">/.test(P) && /function viewsOf\(sec\) \{ return sec\.views\.filter\(\(\[v\]\) => v !== "crooked" \|\| cmToolsOn\(\)\); \}/.test(P));
check("a section opens the view last used in it; tapping the open section closes it",
  /dockTab = sectionOf\(dockTab\)\?\.id === id \? null : openViewOf\(id\)/.test(P) && /if \(sec\) lastView\[sec\.id\] = dockTab;/.test(P));
check("the deck still opens any view by its old name, a section by its id, and a moved drawer where it lives now",
  /dockTab = SECTIONS\.some\(s => s\.id === tab\) \? openViewOf\(tab\) : \(tab \?\? null\);/.test(P) && /if \(k && DRAWER_VIEW\[k\]\) dockTab = DRAWER_VIEW\[k\];/.test(P)
  && /cmIntros: "story", cardTable: "story", storyQs: "story", charFiles: "story", players: "settings", setSound: "sound", setEars: "sound"/.test(P));

/* ── 9–13. nothing lost: every drawer from before the regroup is still drawn, in its new home ───────── */
const BEFORE = ["bossIntro", "cardTable", "catalog", "charFiles", "cmBoard", "cmClock", "cmCurses", "cmFate", "cmIntros", "cmRide", "cmTarot", "cmTwists",
  "dispFollow", "fxLoudness", "fxMagic", "fxMoments", "fxPlayer", "fxSeance", "fxWeather", "players", "roster", "setCampaign", "setEars", "setFog", "setMusic", "setSound", "storyQs"];
check("all 27 drawers from the nine tabs are still drawn", BEFORE.every((k) => P.includes(`dtDrawer("${k}"`)), BEFORE.filter((k) => !P.includes(`dtDrawer("${k}"`)).join());
const party = between("function partyTabFull() {", "\n}\n");
check("Party keeps the tokens, the marching order and Form Up; players, session zero, story questions and files moved out",
  /ownedTokensHTML\(\)\}\$\{marching\}/.test(party) && /partyMainHTML\(\)/.test(party) && !/players|cardTable|storyQs|charFiles/.test(party), party);
const story = between("function storyTabHTML() {", "\n}\n");
check("Story holds Intros, Session zero, Story questions, Character files (each built on its own)",
  ["cmIntros", "cardTable", "storyQs", "charFiles"].every((k) => story.includes(`dtDrawer("${k}"`)) && (story.match(/safeBody\(/g) ?? []).length === 4, story);
const settings = between("function settingsHTML(", "\nfunction soundTabHTML");
check("Stage › Sound is the table's sound (volumes and mute, who the TV hears through); Setup › Table the rest, with Players & seats and Run from",
  /if \(soundOnly\) return [\s\S]*?dtDrawer\("setSound"[\s\S]*?dtDrawer\("setEars"/.test(settings) && /dtDrawer\("setRunFrom", "Run from"[\s\S]*?dtDrawer\("players"[\s\S]*?dtDrawer\("setMusic"[\s\S]*?dtDrawer\("setFog"[\s\S]*?dtDrawer\("setCampaign"/.test(settings));
check("Time › Clock: set the time and ±10 minutes (or Simple Calendar's own calendar)",
  /function clockTabHTML\(\) \{[\s\S]*?hasSimpleCalendar\(\)[\s\S]*?data-dm-clock-nudge="-600"[\s\S]*?data-dm-clock-nudge="600"/.test(P));

/* ── 14–15. the floor ───────────────────────────────────────────────────────────────────────────────── */
const status = between("function statusHTML() {", "\n}\n");
check("the floor's clock moved to Time › Clock (its hour is in On now)", !/data-dm-clock/.test(status), status.slice(-300));
const camFloor = between("function cameraFloorHTML() {", "\n}\n");
check("the floor's Display shortcut is gone (a duplicate of the Stage section)", !/data-dock="display"/.test(camFloor) && /data-cam="focus"/.test(camFloor) && /data-cam="manual"/.test(camFloor));

/* ── 16–21. found on the way ────────────────────────────────────────────────────────────────────────── */
check("'Arrange & lock in' opens Party and never closes it (it was the tab's own toggle)", /data-dock-view="party"><i class="fas fa-border-all"><\/i> Arrange &amp; lock in/.test(P));
check("the 'Teddy returned' key lights: a toggle reads on(), not value()", /id: "cm\.teddy"[\s\S]{0,200}?on: \(\) => nursery\(\)\.atPeace/.test(src("actions-cm.js")));
const app = src("settings-app.js");
check("the auto-pause says what it does: 'Pause when you leave the active scene'", app.includes(`#toggle("pauseGuard", "Pause when you leave the active scene")`) && !/can't act while paused/.test(app));
check("the two daylight switches are told apart (the travel one says Travel)", app.includes(`#toggle("travelDaylight", "Travel: daylight follows the clock")`));
check("the setup wizard points to where per-hero themes really are", src("dm-wizard.js").includes("Setup › Table › Combat music"));
check("Roll NPCs once: hidden in the encounter controls while Ask rolls shows its own 'Roll all NPCs'",
  /\$\{rollTool\.type === "initiative" \? "" : `<button data-combat="rollNPC"/.test(P));
check("the old chip handlers with no button left are gone (scribe, crossing, trade, summon, place, dismiss)",
  !/data-dmscribe-ok\]|data-dmtravel\]|data-dmtrade-ok\]|data-dmsummon-ok\]|closest\("\[data-place\]"\)|closest\("\[data-dismiss\]"\)/.test(P));
console.log(`\nAll ${n} passed.`);
