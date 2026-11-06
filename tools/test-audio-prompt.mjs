// The display's sound prompt (scripts/audio-prompt.js): card, icon or nothing, and the wait after a
// tap that a hanging AudioContext.resume() cannot hold open. Headless: no Foundry.
// Run: node tools/test-audio-prompt.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { audioPrompt, settleWithin } = await import(pathToFileURL(path.join(ROOT, "scripts", "audio-prompt.js")).href);

let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}

check("sound running, never tapped: nothing shows", audioPrompt({ paused: false, dismissed: false }) === null);
check("sound running, card dismissed: nothing shows", audioPrompt({ paused: false, dismissed: true }) === null);
check("no sound, card not yet dismissed: the card", audioPrompt({ paused: true, dismissed: false }) === "card");
check("no sound, card dismissed: only the icon, never the card again", audioPrompt({ paused: true, dismissed: true }) === "icon");

const never = new Promise(() => {});
const race = (p) => Promise.race([p.then(() => "settled"), new Promise((r) => setTimeout(() => r("hung"), 200))]);
check("a resume() that never settles cannot hold the wait open", await race(settleWithin([never], 20)) === "settled");
check("a resume() that rejects does not reject the wait", await race(settleWithin([Promise.reject(new Error("no"))], 20)) === "settled");
let fired = false;
await settleWithin([Promise.resolve()], 5000, () => { fired = true; });
check("resumes that finish end the wait without running out the clock", fired === true);

// the glue: the tap must close the card without waiting on the resume
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
const body = main.slice(main.indexOf("function setupDisplayAudioUnlock"), main.indexOf("/** Core's three AudioContexts"));
check("the card's tap closes it before any await", /const onTap = \(\) => \{\s*dismissed = true;\s*const tried = attempt\("card"\);\s*el\.remove\(\);/.test(body));
check("the 15 s heartbeat still runs, through the same show()", /setInterval\(show, 15000\)/.test(body));
const css = fs.readFileSync(path.join(ROOT, "styles", "shell.css"), "utf8");
check("the icon is a 44 px square and hides with the card for the DM", /#mc-audio-off \{[^}]*width: 44px; height: 44px/.test(css) && /body\.mc-dm-clear #mc-audio-off/.test(css));

console.log(`\nall ${n} passed`);
