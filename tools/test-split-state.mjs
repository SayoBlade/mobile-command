// A phone whose hero is not on the table's map (§17.3), and the landing room's intros (seat LIVE TRY 2026-11-12, B0:
// every phone read "Waiting for the party — you're on 10.1 Passenger Car (Colored), the action is on The Crooked Moon"
// while the heroes' tokens waited hidden in the car). A scene flagged `mobile-command.stage` is calm, not a wait.
// Run: node tools/test-split-state.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { splitState, splitCard, splitCardShown } = await import(pathToFileURL(path.join(ROOT, "scripts", "split-state.js")).href);
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const car = { id: "car", name: "10.1 Passenger Car (Colored)", flags: {}, tokens: [{ actorId: "barb" }] };
const landing = { id: "land", name: "The Crooked Moon", flags: { "mobile-command": { stage: true } }, tokens: [] };
const sleeper = { id: "sleep", name: "10.2 Sleeper Car (Colored)", flags: {}, tokens: [] };
const scenes = [car, landing, sleeper];

const onStage = splitState({ active: landing, scenes, actorId: "barb" });
check("the intros: the hero waits in the car while the table is on the landing room → a STAGE, not a split", onStage?.stage === true, JSON.stringify(onStage));
const card = splitCard(onStage);
check("…its card is calm: 'The story is about to begin', no hourglass, no 'you're on'", card.calm && card.title === "The story is about to begin"
  && card.icon !== "fa-hourglass-half" && !JSON.stringify(card).includes("You're on"), JSON.stringify(card));

const split = splitState({ active: sleeper, scenes, actorId: "barb" });
check("a real split (the table on the Sleeper Car, the hero in the Passenger Car) still waits", split && split.stage === false, JSON.stringify(split));
const wait = splitCard(split);
check("…'Waiting for the party', naming the places as the DM says them (no number, no 'Colored')", wait.title === "Waiting for the party"
  && wait.sub.join("") === "You're on Passenger Car — the action is on Sleeper Car. The DM will bring the scene to you.", JSON.stringify(wait));

check("on the table's map: no card", splitState({ active: car, scenes, actorId: "barb" }) === null);
check("no token anywhere, a packed party, char-gen or not a character: no card",
  splitState({ active: landing, scenes, actorId: "nobody" }) === null && splitState({ active: sleeper, scenes, actorId: "barb", packed: true }) === null
  && splitState({ active: sleeper, scenes, actorId: "barb", charGen: true }) === null && splitState({ active: sleeper, scenes, actorId: "barb", isCharacter: false }) === null);
check("each card has its own dismiss key (the two scenes), so 'Browse my sheet anyway' holds until either changes", onStage.key === "land:car" && split.key === "sleep:car");

const shell = fs.readFileSync(path.join(ROOT, "scripts", "shell.js"), "utf8");
check("the phone shell draws its card from these two (no second copy of the rule)", shell.includes("return splitState({") && shell.includes("splitCard(st)") && !shell.includes("Waiting for the party</div>"));
check("a shared picture on a stage: the calm card steps aside and the picture shows (seat INTROS RERUN 16, the conductor)",
  splitCardShown(onStage, { picture: true }) === false && splitCardShown(onStage, { picture: false }) === true);
check("…a real split keeps its card under a picture; a card browsed past stays away", splitCardShown(split, { picture: true }) === true && splitCardShown(split, { dismissedKey: split.key }) === false);
check("the shell asks this before drawing the card", shell.includes("if (!splitCardShown(st, { dismissedKey: this.#pausedDismissed, picture: Boolean(this.#sharedImage?.src) })) return \"\";"));
console.log(`\nall ${n} passed`);
