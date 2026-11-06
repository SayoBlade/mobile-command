// The weather keys and empty corpses with Animater on and off (scripts/animater-seam.js), plus the glue
// in effects.js and rpc.js the rules depend on. Headless: no Foundry.
// Run: node tools/test-weather-animater.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { sceneIndoors, animaterDrawsSky, layersOfWeather, weatherIdOf, fogRefused, animaterRainKeyOn, playAnimaterFlash, ANIMATER_SKY_FILE, ANIMATER_FLASH_MS, corpseStillDown, CORPSE_HIDE_DELAY_MS } =
  await import(pathToFileURL(path.join(ROOT, "scripts", "animater-seam.js")).href);

let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const L = (...a) => new Set(a);
const open = { flags: {} }, hall = { flags: { animater: { acoustics: "hall" } } }, cave = { flags: { animater: { acoustics: "cave" } } },
  under = { flags: { animater: { underground: true } } }, outdoors = { flags: { animater: { acoustics: "outdoors" } } };
const sky = (scene, active = true, mapOn = true) => animaterDrawsSky({ active, mapOn, scene });

// ── who draws the sky ─────────────────────────────────────────────────────────────────────────────
check("indoors is Animater's own test: hall, cave or underground", sceneIndoors(hall) && sceneIndoors(cave) && sceneIndoors(under));
check("an open scene and 'Open air' acoustics are outdoors", !sceneIndoors(open) && !sceneIndoors(outdoors) && !sceneIndoors(null));
check("Animater on, outdoors: it draws the sky", sky(open) === true);
check("Animater on, indoors: it draws nothing, so MC keeps the scene", sky(hall) === false && sky(under) === false);
check("no Animater: MC keeps the scene", sky(open, false) === false);
check("Animater's map weather switched off: MC keeps the scene", sky(open, true, false) === false);

// ── writing ───────────────────────────────────────────────────────────────────────────────────────
check("Downpour outdoors writes animater.rain, so no second storm", weatherIdOf(L("rainStorm"), true) === "animater.rain");
check("Downpour without Animater writes rainStorm", weatherIdOf(L("rainStorm"), false) === "rainStorm");
check("the other keys map to Animater's names", weatherIdOf(L("snow"), true) === "animater.snow" && weatherIdOf(L("blizzard"), true) === "animater.blizzard" && weatherIdOf(L("fog"), true) === "animater.fog" && weatherIdOf(L("leaves"), true) === "animater.autumn-leaves");
check("fog+rain outdoors is rain", weatherIdOf(L("fog", "rain"), true) === "animater.rain");
check("nothing left writes nothing", weatherIdOf(L(), true) === "" && weatherIdOf(L(), false) === "");
check("fallback: core ids and the fog layer stay", weatherIdOf(L("fog", "rain"), false) === "mcFog+rain" && weatherIdOf(L("fog"), false) === "fog" && weatherIdOf(L("snow"), false) === "snow");

// ── reading ───────────────────────────────────────────────────────────────────────────────────────
const has = (w, ...a) => { const s = layersOfWeather(w); return s.size === a.length && a.every((x) => s.has(x)); };
check("Animater's names read back as MC's layers", has("animater.snow", "snow") && has("animater.autumn-leaves", "leaves") && has("animater.fog", "fog") && has("animater.thunderstorm", "storm"));
check("core ids and the fog layer read as before", has("rainStorm", "rainStorm") && has("mcFog+snow", "fog", "snow") && has(""));
check("Downpour and Rain share animater.rain; the marker tells the keys apart",
  animaterRainKeyOn("rainStorm", true) && !animaterRainKeyOn("rain", true) && animaterRainKeyOn("rain", false) && !animaterRainKeyOn("rainStorm", false));
check("a key turned off really goes off: rain removed from animater.rain writes nothing", (() => { const l = layersOfWeather("animater.rain"); l.delete("rain"); return weatherIdOf(l, true) === ""; })());
check("Fog pressed in Animater's rain is refused, not silently dropped", fogRefused({ sky: true, atmos: true, wantOn: true, layers: L("rain") }));
check("Fog works on a clear sky, and without Animater it layers", !fogRefused({ sky: true, atmos: true, wantOn: true, layers: L() }) && !fogRefused({ sky: false, atmos: true, wantOn: true, layers: L("rain") }));

// ── lightning ─────────────────────────────────────────────────────────────────────────────────────
// One strike, driven by a clock this test owns. The stub records what Animater's factory is asked for.
function fakeFlash() {
  const log = { made: 0, strikes: 0, ticks: [], cleared: 0, args: null };
  const createLightningFlash = (args) => { log.made += 1; log.args = args; return {
    strike() { log.strikes += 1; }, tick(_now, storm) { log.ticks.push(storm); return 0; }, clear() { log.cleared += 1; } }; };
  return { log, createLightningFlash };
}
const driver = (load, over = {}) => { let t = 0; return { load, PIXI: {}, root: () => ({}), bounds: () => ({}), now: () => t, frame: (fn) => { t += 16; fn(); }, safety: () => {}, ...over }; };
{
  const { log, createLightningFlash } = fakeFlash();
  const ok = await playAnimaterFlash(driver(async () => ({ createLightningFlash })));
  check("one press: one flash made, one strike, cleared once", ok === true && log.made === 1 && log.strikes === 1 && log.cleared === 1, JSON.stringify(log));
  check("it runs with no storm, so it can never strike again", log.ticks.length > 10 && log.ticks.every((v) => v === 0), JSON.stringify(log.ticks.slice(0, 3)));
  check("it asks for no rooms: the plain flash, nothing of Animater's private state", !("cover" in log.args) && !("render" in log.args));
}
check("Animater's file missing: false, not a throw, so MC's lightning takes over", await playAnimaterFlash(driver(async () => { throw new Error("404"); })) === false);
check("the factory renamed: false", await playAnimaterFlash(driver(async () => ({}))) === false);
{
  const { log } = fakeFlash();
  const broken = () => ({ strike() { log.strikes += 1; }, tick() { throw new Error("no"); }, clear() { log.cleared += 1; } });
  check("a flash that breaks on its first frame: false, and cleared", await playAnimaterFlash(driver(async () => ({ createLightningFlash: broken }))) === false && log.cleared === 1);
}
{
  const { log, createLightningFlash } = fakeFlash();
  let late = null;
  await playAnimaterFlash(driver(async () => ({ createLightningFlash }), { frame: () => {}, safety: (fn) => { late = fn; } }));
  late();
  check("a hidden tab runs no frames: the safety timer still clears the flash", log.cleared === 1);
}
// The real file, if this machine has Animater: the seam is a private path, so an update must fail HERE.
{
  const real = path.join(process.env.LOCALAPPDATA ?? "", "FoundryVTT", "Data", ...ANIMATER_SKY_FILE.split("/"));
  if (fs.existsSync(real)) {
    const mod = await import(pathToFileURL(real).href);
    let t = 1000, peak = 0;
    class Sprite { constructor() { this.destroyed = false; this.position = { set() {} }; } set alpha(v) { peak = Math.max(peak, v); } get alpha() { return 0; } destroy() { this.destroyed = true; } }
    const kids = [], root = { addChild: (c) => kids.push(c), sortChildren() {} };
    const PIXI = { Sprite, Texture: { WHITE: {} }, BLEND_MODES: { ADD: 1 } };
    const ok = await playAnimaterFlash({ load: async () => mod, PIXI, root: () => root, bounds: () => ({ x: 0, y: 0, width: 100, height: 100 }), now: () => t,
      frame: (fn) => { t += 16; fn(); }, safety: () => {} });
    check("Animater's real factory: one bright flash at once, then gone", ok === true && kids.length === 1 && peak > 0.3 && kids[0].destroyed === true, `${ok} peak ${peak} kids ${kids.length}`);
  } else console.log("(Animater not installed here: real-file check skipped)");
}

// ── the glue ──────────────────────────────────────────────────────────────────────────────────────
const fx = fs.readFileSync(path.join(ROOT, "scripts", "effects.js"), "utf8");
const body = (src, from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
const fire = body(fx, "export function dmFireFx", "A one-shot KEY");
check("dmFireFx picks nothing: the rolling storm and a boss intro keep MC's lightning", !/animater/i.test(fire));
check("the keys choose, panel and action list alike", /dmPressFx\(id\)/.test(fs.readFileSync(path.join(ROOT, "scripts", "actions-effects.js"), "utf8"))
  && /dmPressFx\(fxShot\.dataset\.fxShot\)/.test(fs.readFileSync(path.join(ROOT, "scripts", "dm-panel.js"), "utf8")));
const sync = body(fx, "export function syncFx", "export function registerFxEngine");
check("Animater's sky silences MC's weather loops, whatever fxActive says", /def\.sound/.test(sync) && /wanted\(id, def\) && !phone && !\(sky && def\.weather !== undefined\)/.test(sync));
check("the dust filter is not silenced with its loop", /if \(wanted\(id, def\) && !phone && canvas\?\.ready\) mountFilter/.test(sync));
check("the rolling storm never runs under Animater's sky", /active\.storm && isExecutor\(\) && !sky/.test(sync));
check("a strike already scheduled re-checks the sky", /!fxActiveMap\(\)\.storm \|\| !isExecutor\(\) \|\| animaterSky\(\)/.test(body(fx, "function scheduleStormStrike", "/*  Client engine")));

// ── corpses ───────────────────────────────────────────────────────────────────────────────────────
const doc = (hp, hidden = false) => ({ hidden, actor: { system: { attributes: { hp: { value: hp } } } } });
check("the delay outlasts the knockout", CORPSE_HIDE_DELAY_MS === 4000);
check("a body still down hides", corpseStillDown(doc(0)) === true);
check("a body healed above 0 is left alone", corpseStillDown(doc(5)) === false);
check("a body gone or already hidden is left alone", corpseStillDown(null) === false && corpseStillDown(doc(0, true)) === false);
const rpc = fs.readFileSync(path.join(ROOT, "scripts", "rpc.js"), "utf8");
const retire = body(rpc, "async function retireEmptyCorpse", "REVIVE");
check("leaving the fight stays immediate, before any delay", retire.indexOf("cbt.delete()") < retire.indexOf("setTimeout"));
check("without Animater it hides at once", /if \(!afterDeath \|\| !game\.modules\.get\("animater"\)\?\.active\) \{ await tokenDoc\.update\(\{ hidden: true \}\); return true; \}/.test(retire));
check("only a death waits; a body looted bare hides at once", /retireEmptyCorpse\(tokenDoc, \{ afterDeath: true \}\)/.test(rpc) && (rpc.match(/afterDeath: true/g) ?? []).length === 1);

console.log(`\nall ${n} passed`);
