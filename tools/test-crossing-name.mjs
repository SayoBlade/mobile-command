// Who is crossing, on the DM's answer (lead 2026-11-12, section W: "Move Test" on every hero). scripts/crossing-name.js
// Run: node tools/test-crossing-name.mjs   (stops at the first failure)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
const { crossingName, otherHeroNames } = await import(pathToFileURL(path.join(ROOT, "scripts", "crossing-name.js")).href);
const TEST = ["Test Barbarian", "Test Gunner", "Test Wizard", "Test Cleric"];
check("the full name when it fits", crossingName("Gilly Jenkin", []) === "Gilly Jenkin" && crossingName("Test Wizard", TEST) === "Test Wizard");
check("too long: the first word no other hero shares — never the shared 'Test'", crossingName("Test Barbarian", TEST) === "Barbarian", crossingName("Test Barbarian", TEST));
check("real heroes with distinct first names: the first name", crossingName("Ottoline Fairweather", ["Brannoc Hale"]) === "Ottoline");
check("no word of its own: the full name (the key shrinks it)", crossingName("Test Barbarian Two", ["Test Barbarian Two x", "Two Test Barbarian"]) === "Test Barbarian Two");
check("nobody named: 'Them'", crossingName("", []) === "Them" && crossingName(null) === "Them");
const g = { actors: [{ id: "a", type: "character", name: "Test Barbarian", hasPlayerOwner: true }, { id: "b", type: "character", name: "Test Gunner", hasPlayerOwner: true },
  { id: "c", type: "npc", name: "Test Monster", hasPlayerOwner: false }, { id: "d", type: "character", name: "Player Character", hasPlayerOwner: false }] };
check("the others are the player-owned characters but this one", JSON.stringify(otherHeroNames("a", g)) === JSON.stringify(["Test Gunner"]));
const asks = fs.readFileSync(path.join(ROOT, "scripts", "actions-asks.js"), "utf8");
check("the deck's answer and the sub-line both name the hero this way, with the token art marked as token",
  asks.includes("label: `Move ${who(e)}`, img: tokenArt(e.forActorUuid), token: true") && asks.includes("sub: (e) => `${who(e)} · cross to"));
check("the DM panel's chip says the same", fs.readFileSync(path.join(ROOT, "scripts", "dm-panel.js"), "utf8").includes("crossingName(r.actorName, otherHeroNames("));
console.log(`\nall ${n} passed`);
