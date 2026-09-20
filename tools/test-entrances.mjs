// §40.6 entrance data check: every picture, mist video and sound window an entrance names must exist in this
// machine's Foundry Data folder, and every look it asks for must exist in styles/entrances.css. The Crooked Moon's
// set points at the DM's own library, so on another machine the file checks report as skipped, not failed.
// Run: ELECTRON_RUN_AS_NODE=1 "<Foundry>.exe" tools/test-entrances.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const DATA = path.join(process.env.LOCALAPPDATA ?? "", "FoundryVTT", "Data");
const haveData = fs.existsSync(path.join(DATA, "modules", "the-crooked-moon-2014"));
const { CM_ENTRANCES: E } = await import(pathToFileURL(path.join(ROOT, "scripts", "cm-entrances.js")).href);
const css = fs.readFileSync(path.join(ROOT, "styles", "entrances.css"), "utf8");

let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const onDisk = (p) => p.startsWith("modules/mobile-command/")
  ? fs.existsSync(path.join(ROOT, p.slice("modules/mobile-command/".length)))
  : fs.existsSync(path.join(DATA, p));
const srcs = (html) => [...String(html ?? "").matchAll(/src="([^"]+)"/g)].map((m) => m[1]);

check("94 entrances (51 themed, 43 generic), keys unique, each with a name, a hold and a chapter",
  E.length === 94 && E.filter((e) => e.generic).length === 43 && new Set(E.map((e) => e.key)).size === 94
    && E.every((e) => e.name && typeof e.sub === "string" && e.hold >= 5000 && Number.isInteger(e.chapter) && e.short),
  E.filter((e) => !(e.name && e.hold >= 5000 && e.short)).map((e) => e.key).join());

// DM 2026-09-19: a line under the name only when it is a job or eerie — the Crooked Man and the Abomination have none.
check("the lines the DM ruled out are gone (the Crooked Man, the Abomination), the jobs and the eerie ones stay",
  E.find((e) => e.key === "crooked")?.sub === "" && E.find((e) => e.key === "coven")?.sub === ""
    && E.find((e) => e.key === "rusty")?.sub === "Groundskeeper of Wickermoor Village"
    && E.find((e) => e.key === "queen")?.sub === "The Wytchwood bows to her",
  ["crooked", "coven", "rusty", "queen"].map((k) => `${k}: "${E.find((e) => e.key === k)?.sub}"`).join(" "));

// DM 2026-09-19: "give Chuckles a transformation too, and doesn't the Horned King need one too?" — the balloon is
// Chuckles' own token (the jester is its projection), Phillip's token leaves as the King's arrives; the first
// meeting with Chuckles is not a fight, so it doesn't pause.
{
  const k = (key) => E.find((e) => e.key === key) ?? {};
  const [ft, hk, f] = [k("foolstf"), k("horned"), k("fools")];
  check("Chuckles and the Horned King change form on the banner, with the token swap set; meeting Chuckles doesn't pause",
    ft.art2 && ft.name1 === "Chuckles the Clown" && ft.match?.[0] === "Lord of Fools" && ft.change === 2.8 && ft.pause
      && hk.art2 && hk.name1 === "Phillip Druskenvald" && hk.match1?.[0] === "Phillip Druskenvald" && hk.match?.[0] === "Horned King"
      && hk.change === 2.8 && hk.pause && f.pause === false && !f.art2,
    JSON.stringify({ ft: [ft.name1, ft.match, ft.change, ft.pause], hk: [hk.name1, hk.match1, hk.match, hk.change], f: f.pause }));
}

// DM 2026-09-19 "you can add fonts": each banner's own title face ships in fonts/ — the first face every name and
// subtitle asks for is declared (here, or among shell.css's bundled title faces) and its file is in the module.
{
  const shell = fs.readFileSync(path.join(ROOT, "styles", "shell.css"), "utf8");
  const declared = new Map([...`${css}\n${shell}`.matchAll(/@font-face\s*\{[^}]*?font-family:\s*'([^']+)'[^}]*?url\('\.\.\/fonts\/([^']+)'\)/g)]
    .map((m) => [m[1], m[2]]));
  const asked = new Set([...css.matchAll(/--(?:name|sub)-font:"([^"]+)"/g)].map((m) => m[1]));
  asked.add("IM Fell English"); // the subtitle's default face (the .mc-en-sub rule's fallback chain)
  const missing = [...asked].filter((f) => !declared.has(f) || !fs.existsSync(path.join(ROOT, "fonts", declared.get(f))));
  check(`every banner's title face is bundled (${asked.size} faces)`, missing.length === 0, missing.join(", "));
}

// DM 2026-09-19 "with reveals": the crow demon is nameless until Adelaide's own banner turns it into her; Belkin is met
// with his head in shadow (no pause) and shown whole later; the White Worm shrieks, as the book has it.
{
  const k = (key) => E.find((e) => e.key === key) ?? {};
  const [cd, ad, bn, bt, wm] = [k("crowdemon"), k("adelaide"), k("belkin"), k("belkintf"), k("worm")];
  const wormSounds = (wm.sound ?? []).map((c) => c.src).join(" ");
  const cutTop = (html) => Number(/--ct:(-?[\d.]+)%/.exec(html ?? "")?.[1] ?? 0); // how far the crop box lifts the picture
  check("the crow demon stays nameless until Adelaide's reveal; Belkin's head stays hidden until his; the worm shrieks",
    cd.name === "The Crow Demon" && !/Adelaide/.test(`${cd.name} ${cd.sub}`) && cd.appears && cd.pause
      && ad.name1 === "The Crow Demon" && ad.name === "Adelaide Langtree" && ad.art2
      && bn.pause === false && !bn.art2 && cutTop(bn.art) < -20 && bt.art2 && cutTop(bt.art) < -20 && cutTop(bt.art2) > -1
      && /Dragon 30/.test(wormSounds) && /Alien voices-25/.test(wormSounds) && !/Abyss 53/.test(wormSounds),
    JSON.stringify({ cd: [cd.name, cd.appears], ad: [ad.name1, ad.name], bn: bn.pause, top: [cutTop(bn.art), cutTop(bt.art), cutTop(bt.art2)], wormSounds }));
}

// DM 2026-09-19: Golub "change the name based on token present" — Geneva is the alternate; and "for Father Renathyr &
// Friar Olaf make sure Olaf is less prominent, the focus is Father Renathyr".
{
  const g = E.find((e) => e.key === "golubtf") ?? {};
  const r = E.find((e) => e.key === "renathyrolaf") ?? {};
  check("Golub's banner carries Geneva as an alternate known form; the Night of Flames banner names Father Renathyr alone",
    g.alts?.length === 1 && g.alts[0].name === "Geneva Fairchild" && g.alts[0].match?.[0] === "Geneva" && g.name1 === "Theodora Mayville"
      && r.name === "Father Renathyr" && /Olaf/.test(r.sub) && r.pair && css.includes("mc-en-t-monastery .mc-en-art.mc-en-pair > span:nth-child(2)"),
    JSON.stringify({ alts: g.alts, r: [r.name, r.sub, r.pair] }));
}

// DM 2026-09-19 "sure": every transformation bursts on the map at its change (a JB2A path Sequencer resolves); the
// bestiary's "Pigeon Hag" is Golub's own token name.
check("every transformation names the map's burst at its change; Golub's monster answers to the bestiary's Pigeon Hag",
  E.filter((e) => e.art2).every((e) => /^jb2a\./.test(e.swapFx ?? "")) && E.every((e) => e.art2 || !e.swapFx)
    && E.find((e) => e.key === "golubtf")?.match.includes("Pigeon Hag"),
  E.filter((e) => e.art2).map((e) => `${e.key}: ${e.swapFx}`).join(", "));

check("in campaign order (chapters never go backwards)",
  E.every((e, i) => i === 0 || E[i - 1].chapter <= e.chapter), E.map((e) => e.chapter).join());

check("a transformation carries both forms (name1/sub1/art2) and a longer hold; the rest carry neither",
  E.every((e) => (e.art2 ? e.name1 && e.sub1 && e.hold >= 9000 : !e.name1 && !e.sub1)),
  E.filter((e) => e.art2 && !(e.name1 && e.sub1)).map((e) => e.key).join());

{
  const missing = [];
  for (const e of E) for (const c of e.classes.split(/\s+/)) if (!css.includes(`.${c}`)) missing.push(`${e.key}: ${c}`);
  check("every look an entrance asks for exists in entrances.css", missing.length === 0, missing.join(", "));
}

{
  const bad = E.flatMap((e) => (e.sound ?? []).filter((c) => !(c.to > c.from && c.gain > 0 && c.at >= 0 && c.at * 1000 < e.hold)).map((c) => `${e.key}: ${c.src}`));
  check("every sound window plays forwards, at a positive level, and starts before the banner leaves", bad.length === 0, bad.join("; "));
}

if (!haveData) {
  console.log(`SKIP  the file checks — no Crooked Moon module under ${DATA}`);
} else {
  const want = new Set();
  for (const e of E) {
    want.add(e.portrait);
    for (const s of [...srcs(e.art), ...srcs(e.art2), ...srcs(e.weather), ...srcs(e.extra)]) want.add(s);
    for (const c of e.sound ?? []) want.add(c.src);
  }
  const missing = [...want].filter((p) => !onDisk(p));
  check(`every picture, mist video and sound an entrance names exists on this machine (${want.size} files)`, missing.length === 0, missing.join("\n  "));
}

console.log(`\nAll ${n} passed.`);
process.exit(0);
