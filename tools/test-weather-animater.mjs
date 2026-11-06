// The weather keys and empty corpses with Animater on and off (scripts/animater-seam.js), plus the glue
// in effects.js and rpc.js the rules depend on. Headless: no Foundry.
// Run: node tools/test-weather-animater.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { sceneIndoors, animaterDrawsSky, layersOfWeather, weatherIdOf, fogRefused, animaterRainKeyOn, lightningRefusal, corpseStillDown, CORPSE_HIDE_DELAY_MS } =
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
check("Lightning outdoors under Animater is refused, in words", typeof lightningRefusal(sky(open)) === "string");
check("Lightning indoors, and without Animater, fires", lightningRefusal(sky(hall)) === null && lightningRefusal(sky(open, false)) === null);

// ── the glue ──────────────────────────────────────────────────────────────────────────────────────
const fx = fs.readFileSync(path.join(ROOT, "scripts", "effects.js"), "utf8");
const body = (src, from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
const fire = body(fx, "export function dmFireFx", "A one-shot KEY");
check("dmFireFx itself is not gated: the rolling storm and a boss intro must not toast or vanish", !/lightningRefusal|notifier/.test(fire));
check("the keys go through the gate, panel and action list alike", /dmPressFx\(id\)/.test(fs.readFileSync(path.join(ROOT, "scripts", "actions-effects.js"), "utf8"))
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
