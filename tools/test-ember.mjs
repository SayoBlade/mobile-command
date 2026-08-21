// Headless checks for the §50 Ember-compatibility layer — no world, no server, no locks.
// Run under the Electron-as-node runner like the rest of tools/test-*.mjs.
//
// What earns a test here: the DECISIONS. Who drives combat music (§50.3 — the wrong answer
// silences a whole combat), which calendar backend answers the clock (§50.4 — the wrong answer
// re-labels every world's dates), whether Ember-managed scenes are recognized (§50.5 — the
// wrong answer double-writes scene darkness), and the sky card's data shape (§50.4).
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
const imp = (f) => import("file:///" + path.join(REPO, "scripts", f).replace(/\\/g, "/"));

let fails = 0;
const ok = (n, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}${extra ? " — " + extra : ""}`); if (!cond) fails++; };

// ── Minimal Foundry globals. Rebuilt per scenario by world(); modules read them at CALL time. ──
class FakeCalendarData {}
globalThis.foundry = { data: { CalendarData: FakeCalendarData } };
globalThis.Hooks = { on: () => {}, callAll: () => {} };

function world({ emberActive = false, emberReady = false, cmTools = false, settings = {}, actors = [],
                 calendar = null, emberCalendar = undefined, managed = {} } = {}) {
  globalThis.game = {
    modules: { get: (id) => id === "ember" ? (emberActive ? { active: true } : undefined) : undefined },
    settings: { get: (ns, key) => {
      if (ns === "mobile-command" && key === "crookedMoonTools") return cmTools;
      if (key in settings) return settings[key];
      throw new Error(`unregistered setting ${ns}.${key}`);
    } },
    actors: { some: (fn) => actors.some(fn) },
    time: { calendar, worldTime: 1000, components: {} },
    i18n: { localize: (s) => s },
    user: { isGM: false }
  };
  globalThis.CONFIG = { Canvas: { managedScenes: managed } };
  globalThis.ember = emberCalendar === undefined
    ? (emberActive ? { ready: emberReady } : undefined)
    : { ready: emberReady, calendar: emberCalendar };
}

const campaigns = await imp("campaigns.js");
const music = await imp("combat-music.js");
const gametime = await imp("gametime.js");

// ── 1. Recognition ────────────────────────────────────────────────────────────
world({});
ok("plain world: not Ember", campaigns.isEmberWorld() === false);
ok("plain world: no campaign", campaigns.activeCampaign() === null);
world({ emberActive: true });
ok("ember active: recognized", campaigns.isEmberWorld() === true);
ok("ember not imported yet: emberReady false", campaigns.emberReady() === false);
ok("ember active: campaign is ember", campaigns.activeCampaign() === "ember");
world({ emberActive: true, emberReady: true });
ok("ember imported: emberReady true", campaigns.emberReady() === true);
world({ cmTools: true });
ok("CM tools on: campaign is crooked-moon", campaigns.activeCampaign() === "crooked-moon");
world({ emberActive: true, cmTools: true });
ok("both somehow: ember wins the slot", campaigns.activeCampaign() === "ember");

// ── 2. Managed scenes (§50.5 — the daylight stand-down) ──────────────────────
world({ emberActive: true, managed: { sceneA: class {} } });
ok("ember + managed scene: recognized", campaigns.campaignManagedScene({ id: "sceneA" }) === true);
ok("ember + the DM's own scene: ours to light", campaigns.campaignManagedScene({ id: "sceneB" }) === false);
world({ managed: { sceneA: class {} } });
ok("no ember: managed registry ignored", campaigns.campaignManagedScene({ id: "sceneA" }) === false);

// ── 3. Who drives combat music (§50.3) ───────────────────────────────────────
world({ emberActive: true, settings: { combatBattleTrack: "Playlist.x.Sound.y" } });
ok("ember world: ember drives, even with a track set", music.combatMusicMode() === "ember");
world({ settings: { combatBattleTrack: "" } });
ok("nothing configured: no takeover", music.combatMusicMode() === "unconfigured");
world({ settings: { combatBattleTrack: "Playlist.x.Sound.y" } });
ok("battle track set: ours", music.combatMusicMode() === "ours");
world({ settings: { combatBattleTrack: "" },
        actors: [{ type: "character", getFlag: (ns, k) => k === "combatTheme" ? "Playlist.a.Sound.b" : undefined }] });
ok("a PC anthem alone: ours", music.combatMusicMode() === "ours");
world({ settings: { combatBattleTrack: "" },
        actors: [{ type: "npc", getFlag: () => "Playlist.a.Sound.b" }] });
ok("an NPC flag doesn't count as an anthem", music.combatMusicMode() === "unconfigured");

// ── 4. The clock's calendar backend (§50.4) ──────────────────────────────────
// The untouched core default must NOT hijack the Day-N clock…
const defaultCal = new FakeCalendarData();
Object.assign(defaultCal, { name: "Simplified Gregorian",
  months: { values: [{ name: "January" }] }, days: { hoursPerDay: 24 } });
world({ calendar: defaultCal, settings: { clockStart: 0 } });
ok("default Gregorian: not a world calendar", gametime.hasWorldCalendar() === false);
ok("default Gregorian: Day-N clock keeps the label", gametime.readClock(3600).label === "Day 1 · 01:00",
  gametime.readClock(3600).label);

// …while a deliberate calendar (Ember subclasses CalendarData and names itself) answers.
class EmberishCal extends FakeCalendarData {}
const emberCal = new EmberishCal();
Object.assign(emberCal, {
  name: "Ember",
  months: { values: [{ name: "Seeding" }, { name: "Blooming" }] },
  days: { hoursPerDay: 24, minutesPerHour: 60, secondsPerMinute: 60 },
  seasons: { values: [{ name: "Seeding" }, { name: "Blooming" }] },
  timeToComponents: () => ({ day: 106, dayOfMonth: 46, month: 1, year: 2523, hour: 22, minute: 0, season: 1 })
});
world({ calendar: emberCal, settings: { clockStart: 0 } });
ok("a named custom calendar IS the world calendar", gametime.hasWorldCalendar() === true);
const cc = gametime.readClock(0);
ok("core backend label reads like Ember's own", cc.label === "47 Blooming 2523 · 22:00", cc.label);
ok("core backend source tagged", cc.source === "core-calendar");
ok("core backend keeps hour/minute for travel math", cc.hour === 22 && cc.minute === 0);

// A calendar that throws mid-read must fall back, never break the clock.
const brokenCal = new EmberishCal();
Object.assign(brokenCal, { name: "Ember", months: { values: [{ name: "X" }] },
  days: { hoursPerDay: 24 }, timeToComponents: () => { throw new Error("boom"); } });
world({ calendar: brokenCal, settings: { clockStart: 0 } });
ok("a throwing calendar falls back to Day-N", gametime.readClock(3600).label === "Day 1 · 01:00",
  gametime.readClock(3600).label);

// ── 5. Night and sun through Ember's sky (§50.4) ─────────────────────────────
const sunNight = { phase: "night", animate: () => ({ phase: "night" }) };
const sunDay = { phase: "day", animate: () => ({ phase: "day" }) };
const skyCalNight = Object.assign(new EmberishCal(), emberCal, { sun: sunNight, moons: {}, realms: {} });
world({ emberActive: true, calendar: skyCalNight, emberCalendar: skyCalNight, settings: { clockStart: 0 } });
ok("ember sun says night", gametime.isNight(0) === true);
ok("ember sun gives the day/night curve its sun", JSON.stringify(gametime.sunTimes(0)) === JSON.stringify({ sunrise: 7, sunset: 19 }));
const skyCalDay = Object.assign(new EmberishCal(), emberCal, { sun: sunDay, moons: {}, realms: {} });
world({ emberActive: true, calendar: skyCalDay, emberCalendar: skyCalDay, settings: { clockStart: 0 } });
ok("ember sun says day", gametime.isNight(0) === false);
world({ settings: { clockStart: 0 } });
ok("no calendar at all: sunTimes stays empty", JSON.stringify(gametime.sunTimes(0)) === "{}");

// ── 6. The sky card (§50.4 — "including moons and effects") ──────────────────
const moon = (id, name, phase, css) => ({ id, name, phase,
  color: { css }, get phaseLabel() { return phase.toUpperCase(); } });
const skyCal = Object.assign(new EmberishCal(), emberCal, {
  sun: { phase: "night" },
  moons: { ragen: moon("ragen", "Ragen", "full", "#b92517"), akon: moon("akon", "Akon", "none", "#a8a96c") },
  realms: { primordis: { id: "primordis", name: "Primordis", phase: "dominant" } }
});
world({ emberActive: true, calendar: skyCal, emberCalendar: skyCal });
const sky = campaigns.emberSky();
ok("sky present in an ember-calendar world", !!sky);
ok("sky: sun phase carried", sky.sunPhase === "night" && sky.sunLabel === "Night");
ok("sky: season resolved from components", sky.season === "Blooming", sky.season);
ok("sky: moons carry colour + phase", sky.moons.length === 2 && sky.moons[0].color === "#b92517");
ok("sky: a full moon is lit, a dark moon is not",
  sky.moons.find(m => m.name === "Ragen").lit === true && sky.moons.find(m => m.name === "Akon").lit === false);
ok("sky: realm phase title-cased without lang keys", sky.realms[0].label === "Dominant");
ok("sky: a dominant realm reads as lit", sky.realms[0].lit === true);
world({ emberActive: true, calendar: emberCal, emberCalendar: skyCal });
ok("sky null when ember's calendar is NOT the world calendar", campaigns.emberSky() === null);

console.log(fails ? `\n${fails} FAILED` : "\nall green");
process.exit(fails ? 1 : 0);
