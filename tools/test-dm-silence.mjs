// The DM's machine stays quiet while the TV is connected: music (2026-10-09) AND environment (2026-11-16, Syrinscape
// plays on Environment). scripts/dm-silence.js planDmSilence + the glue in main.js. Headless: no Foundry.
// Run: node tools/test-dm-silence.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { planDmSilence } = await import(pathToFileURL(path.join(ROOT, "scripts", "dm-silence.js")).href);

let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const both = { music: true, environment: true };
const none = { music: false, environment: false };
const lv = (music, environment) => ({ music, environment });
const keys = (w) => w.map((x) => `${x.channel}:${x.set ?? "-"}:${x.claim}`).join(",");

let w = planDmSilence({ tvActive: true, want: both, level: lv(0.5, 0.5), claimed: none });
check("TV connected, both on: music AND environment go to 0, both claimed", keys(w) === "music:0:true,environment:0:true", keys(w));
check("environment is core's globalAmbientVolume, its own claim flag", w[1].key === "globalAmbientVolume" && w[1].flag === "dmEnvSilenced", JSON.stringify(w[1]));
check("music is unchanged: globalPlaylistVolume, dmAudioSilenced", w[0].key === "globalPlaylistVolume" && w[0].flag === "dmAudioSilenced", JSON.stringify(w[0]));

w = planDmSilence({ tvActive: true, want: { music: true, environment: false }, level: lv(0.5, 0.5), claimed: none });
check("environment switch off: only music is silenced (the old rule, exactly)", keys(w) === "music:0:true", keys(w));

w = planDmSilence({ tvActive: false, want: both, level: lv(0.5, 0.5), claimed: none });
check("TV not connected: nothing is touched", w.length === 0, keys(w));

w = planDmSilence({ tvActive: true, want: both, level: lv(0, 0), claimed: lv(true, true) });
check("already silenced by us: no write (no settings churn on every userConnected)", w.length === 0, keys(w));

w = planDmSilence({ tvActive: true, want: both, level: lv(0, 0.3), claimed: none });
check("his own music at 0 is left alone; only environment is claimed", keys(w) === "environment:0:true", keys(w));

w = planDmSilence({ tvActive: false, want: both, level: lv(0, 0), claimed: lv(true, true) });
check("TV drops: both come back to Foundry's 0.5 and are released", keys(w) === "music:0.5:false,environment:0.5:false", keys(w));

w = planDmSilence({ tvActive: false, want: both, level: lv(0, 0), claimed: lv(true, false) });
check("TV drops: an environment we never zeroed (he set 0 himself) stays at 0", keys(w) === "music:0.5:false", keys(w));

w = planDmSilence({ tvActive: false, want: both, level: lv(0.7, 0.2), claimed: lv(true, true) });
check("TV drops after he moved the sliders: his levels kept, only the claims released", keys(w) === "music:-:false,environment:-:false", keys(w));

w = planDmSilence({ tvActive: true, want: { music: true, environment: false }, level: lv(0, 0), claimed: lv(true, true) });
check("environment switched off mid-session with the TV on: environment comes back, music stays silenced", keys(w) === "environment:0.5:false", keys(w));

// the glue in main.js and settings.js
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
const body = main.slice(main.indexOf("function applyDmMusicSilence"), main.indexOf("function setupTvVolumes"));
check("main.js applies the plan, never on the display client itself", /if \(!game\.user\?\.isGM \|\| isDisplayClient\(\)\) return;/.test(body) && /planDmSilence\(\{ tvActive: Boolean\(tv\?\.active\)/.test(body), body.slice(0, 300));
check("both channels read live from core", /globalPlaylistVolume/.test(body) && /globalAmbientVolume/.test(body));
check("switching the new setting re-applies at once", /dmSilentEnvironment` \|\| s\?\.key === `\$\{MODULE_ID\}\.displayOwnerUser`\) applyDmMusicSilence\(\)/.test(main));
const settings = fs.readFileSync(path.join(ROOT, "scripts", "settings.js"), "utf8");
check("the new world switch is registered, on by default, with a client claim flag",
  /register\(MODULE_ID, "dmSilentEnvironment", \{[\s\S]*?scope: "world"[\s\S]*?default: true/.test(settings) && /register\(MODULE_ID, "dmEnvSilenced", \{\s*scope: "client"/.test(settings));

console.log(`\nall ${n} passed`);
