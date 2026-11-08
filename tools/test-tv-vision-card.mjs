// "No PCs in scene" (scripts/tv-vision-card.js, DESIGN §23.7): when the TV gets the card, that it shows
// once per scene, and that it is the sound card's twin in look and behaviour. Headless: no Foundry.
// Run: node tools/test-tv-vision-card.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { tvSeesNoPc, noPcCard, NO_PC_ID } = await import(pathToFileURL(path.join(ROOT, "scripts", "tv-vision-card.js")).href);

let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}

const pc = (o = {}) => ({ pc: true, observed: true, hidden: false, sight: true, ...o });
const npc = (o = {}) => ({ pc: false, observed: false, hidden: false, sight: true, ...o });

// when
check("10.9 before They arrive: token vision on, only NPCs — no PC to see through", tvSeesNoPc({ tokenVision: true, tokens: [npc(), npc()] }) === true);
check("an empty map with token vision — no PC", tvSeesNoPc({ tokenVision: true, tokens: [] }) === true);
check("one visible PC the TV observes — it can see", tvSeesNoPc({ tokenVision: true, tokens: [npc(), pc()] }) === false);
check("token vision off — the whole map shows, no card", tvSeesNoPc({ tokenVision: false, tokens: [] }) === false);
check("PCs placed hidden (They arrive creates them hidden) — still nothing to see through", tvSeesNoPc({ tokenVision: true, tokens: [pc({ hidden: true })] }) === true);
check("a PC the TV is not an observer of — nothing to see through", tvSeesNoPc({ tokenVision: true, tokens: [pc({ observed: false })] }) === true);
check("a PC with its vision off — nothing to see through", tvSeesNoPc({ tokenVision: true, tokens: [pc({ sight: false })] }) === true);

// once per scene
const shown = new Set();
check("first time on a scene with no PC: the card", noPcCard({ noPc: true, sceneId: "a", shown }) === "card");
shown.add("a");
check("same scene again this load: nothing — it never repeats", noPcCard({ noPc: true, sceneId: "a", shown }) === null);
check("another scene with no PC: the card, once", noPcCard({ noPc: true, sceneId: "b", shown }) === "card");
check("a scene with a PC: nothing", noPcCard({ noPc: false, sceneId: "c", shown }) === null);

// the twin of the sound card
const src = fs.readFileSync(path.join(ROOT, "scripts", "tv-vision-card.js"), "utf8");
check("the card reads \"No PCs in scene\"", /<div class="mc-au-title">No PCs in scene<\/div>/.test(src));
check("a tap anywhere closes it, mouse and touch, as the sound card", /el\.addEventListener\("click", onTap\)/.test(src) && /el\.addEventListener\("touchend", onTap, \{ passive: true \}\)/.test(src));
check("display clients only", /if \(!isDisplayClient\?\.\(\)\) return;/.test(src));
const css = fs.readFileSync(path.join(ROOT, "styles", "shell.css"), "utf8");
for (const part of ["", " .mc-au-card", " .mc-au-ico", " .mc-au-title", " .mc-au-sub"]) {
  check(`shares the sound card's style rule${part || " (the overlay)"}`, css.includes(`#mc-audio-unlock${part}, #${NO_PC_ID}${part} {`));
}
const guard = fs.readFileSync(path.join(ROOT, "scripts", "overlay-guard.js"), "utf8");
check("never covers the DM's screen: on the rail in shell.css and overlay-guard.js (§22.7)",
  css.includes(`body.mc-dm-clear #${NO_PC_ID},`) && guard.includes(`"#${NO_PC_ID}",`));
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
check("started beside the sound card on load", /setupDisplayAudioUnlock\(\);[^\n]*\r?\n\s*setupTvVisionCard\(\{ isDisplayClient/.test(main));

console.log(`\nall ${n} passed`);
