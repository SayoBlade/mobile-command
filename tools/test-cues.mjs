// §53 the cues that play themselves — the rules' arithmetic, the sets' files on disk, the manifest's type
// declaration and the words in lang/en.json. Headless: no Foundry.
// Run: ELECTRON_RUN_AS_NODE=1 "<Foundry>.exe" tools/test-cues.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const DATA = path.join(process.env.LOCALAPPDATA ?? "", "FoundryVTT", "Data");
const load = (f) => import(pathToFileURL(path.join(ROOT, "scripts", f)).href);
const { decide, parsePasses, pickTake, withinCooldown, isPlayerCharacter, CUE_RULES } = await load("cue-rules.js");
const { CUE_SETS, CM_DOOR_SOUNDS, allCuePaths } = await load("cue-sets.js");
const { BEHAVIOR_TYPE, cues } = await load("region-sound.js");

let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const seq = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };

// ── the rules ─────────────────────────────────────────────────────────────────────────────────────
check("parsePasses reads \"3, 12\", ignores junk, sorts and de-duplicates",
  JSON.stringify(parsePasses("12, 3 x 3;0 -1 7.5")) === "[3,12]" && parsePasses("").length === 0 && JSON.stringify(parsePasses([5, 2])) === "[2,5]",
  JSON.stringify(parsePasses("12, 3 x 3;0 -1 7.5")));

check("always: fires on every crossing and counts them",
  [1, 2, 3].every((c) => { const d = decide({ rule: "always", count: c - 1 }); return d.fire && d.count === c; }));

{
  const a = decide({ rule: "once", count: 0, fired: false });
  const b = decide({ rule: "once", count: a.count, fired: a.fired });
  check("once: the first crossing plays, the second never does, the count still climbs",
    a.fire && a.fired && !b.fire && b.fired && b.count === 2, JSON.stringify([a, b]));
}

{
  // the DM's own example: the 3rd and the 12th pass, then the count starts over
  let s = { count: 0, fired: false };
  const fired = [];
  for (let i = 1; i <= 26; i++) {
    const d = decide({ rule: "passes", count: s.count, fired: s.fired, passes: "3, 12" });
    if (d.fire) fired.push(i);
    s = d;
  }
  check("passes \"3, 12\": plays on the 3rd and 12th crossing, then again on the 15th and 24th (the count restarted)",
    JSON.stringify(fired) === "[3,12,15,24]" && s.count === 2, JSON.stringify(fired) + " count=" + s.count);
}

check("passes with nothing named falls back to every time",
  decide({ rule: "passes", passes: "" }).fire && decide({ rule: "passes", passes: "nope" }).fire);

{
  const yes = decide({ rule: "chance", chance: 3, random: seq(0.1) });
  const no = decide({ rule: "chance", chance: 3, random: seq(0.5) });
  const one = decide({ rule: "chance", chance: 1, random: seq(0.99) });
  check("chance 1 in 3: a draw under 1/3 plays, over it stays silent; 1 in 1 always plays; all are counted",
    yes.fire && !no.fire && one.fire && yes.count === 1 && no.count === 1, JSON.stringify([yes, no, one]));
}

check("arm: reports fire (the behaviour arms a key instead of playing) and counts",
  decide({ rule: "arm" }).fire && decide({ rule: "arm", count: 4 }).count === 5);

check("an unknown rule behaves as every time, never throws",
  decide({ rule: "whatever" }).fire && decide({}).fire);

// ── the takes ─────────────────────────────────────────────────────────────────────────────────────
check("pickTake never repeats the take that just played when there is a choice",
  ["a", "b", "c"].every((avoid) => [0, 0.5, 0.99].every((r) => pickTake(["a", "b", "c"], seq(r), avoid) !== avoid))
    && pickTake(["only"], seq(0.7), "only") === "only" && pickTake([], seq(0)) === null);

check("cooldown: 2 s after a play is quiet, 2.5 s after is not, and a never-played cue is never in cooldown",
  withinCooldown(1000, 2500, 2) && !withinCooldown(1000, 3500, 2) && !withinCooldown(null, 3500, 2) && !withinCooldown(1000, 1001, 0));

check("only player characters count: a linked PC with a player owner yes; hidden, NPC, pet, no actor, no",
  isPlayerCharacter({ actor: { type: "character", hasPlayerOwner: true } })
    && !isPlayerCharacter({ hidden: true, actor: { type: "character", hasPlayerOwner: true } })
    && !isPlayerCharacter({ actor: { type: "npc", hasPlayerOwner: true } })
    && !isPlayerCharacter({ actor: { type: "character", hasPlayerOwner: false } })
    && !isPlayerCharacter({ actor: null }) && !isPlayerCharacter(null));

// ── the sets ──────────────────────────────────────────────────────────────────────────────────────
check("five sets, each with a label and at least one take; the creak set is the plan's board-under-a-foot family",
  Object.keys(CUE_SETS).length === 5 && Object.values(CUE_SETS).every((s) => s.label && s.takes.length >= 1)
    && CUE_SETS.creak.takes.length === 6 && !CUE_SETS.creak.takes.some((t) => /WOOD (21|29|24)\.wav$/.test(t)),
  Object.keys(CUE_SETS).join());

check("the weasels' stand-in is a scratching, never the insect swarm (DM 2026-09-19)",
  CUE_SETS.wall.takes.every((t) => !/swarm\.mp3$/i.test(t)) && allCuePaths().every((t) => !/swarm\.mp3$/i.test(t)));

check("four door sets, each with open/close/lock/unlock/test as arrays of takes",
  Object.keys(CM_DOOR_SOUNDS).length === 4 && Object.values(CM_DOOR_SOUNDS).every((d) => d.label
    && ["open", "close", "lock", "unlock", "test"].every((k) => Array.isArray(d[k]) && d[k].length >= 1)));

check("the front door opens on the groans, the attic door on the cracks, the bathroom is wet when tried",
  /WOOD 27/.test(CM_DOOR_SOUNDS.mcCrookedFront.open[0]) && /WOOD 24/.test(CM_DOOR_SOUNDS.mcCrookedWrong.open[0])
    && /Smashed 34/.test(CM_DOOR_SOUNDS.mcCrookedWet.test[0]));

{
  const paths = allCuePaths();
  const missing = fs.existsSync(DATA) ? paths.filter((p) => !fs.existsSync(path.join(DATA, p))) : [];
  check(`every take is a real file in this machine's Foundry Data folder (${paths.length} paths${fs.existsSync(DATA) ? "" : " — no Data folder here, skipped"})`,
    missing.length === 0, missing.join("\n  "));
}

// ── the wiring ────────────────────────────────────────────────────────────────────────────────────
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));
  check("module.json declares the RegionBehavior subtype \"sound\" (Foundry refuses an undeclared type)",
    manifest.documentTypes?.RegionBehavior?.sound !== undefined && BEHAVIOR_TYPE === "mobile-command.sound");
}
{
  const lang = JSON.parse(fs.readFileSync(path.join(ROOT, "lang", "en.json"), "utf8"));
  const fields = ["set", "src", "volume", "radius", "walls", "origin", "rule", "passes", "chance", "cooldown", "playersOnly", "muted", "count"];
  const missing = fields.filter((f) => !lang[`MOBILECOMMAND.BEHAVIORS.SOUND.FIELDS.${f}.label`]);
  check("lang/en.json names the type, its hint and every form field",
    lang["TYPES.RegionBehavior.mobile-command.sound"] && lang["TYPES.HINTS.RegionBehavior.mobile-command.sound"] && missing.length === 0,
    "missing: " + missing.join());
}
check("the rules the behaviour offers are the five the DM shaped, and the API exposes list/fire/mute/reset/armed",
  JSON.stringify(Object.keys(CUE_RULES)) === JSON.stringify(["always", "once", "passes", "chance", "arm"])
    && ["list", "fire", "mute", "reset", "armed"].every((k) => typeof cues[k] === "function") && cues.sets().length === 5);

console.log(`\n${n} passed`);
