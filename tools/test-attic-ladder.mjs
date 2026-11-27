// The attic ladder (scripts/cm-house.js, DM 2026-11-27: "Is there currently a way to climb to the attic via Foundry as a
// player? (I'm ok with a 'travel' button that will transfer them there)", then yes to the pair). Pure parts headless, the
// wiring by source. Run: node tools/test-attic-ladder.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
globalThis.Hooks = { on: () => 0 };
const H = await import(pathToFileURL(path.join(ROOT, "scripts", "cm-house.js")).href);
const { planAtticLadder, ladderRegion, isAtticClimb, ladderUuid, ATTIC_LADDER, ATTIC_TRAP, LADDER_TOP, LADDER_CLIMB, HOUSE_STAIRS, onAtticClimb } = H;
const S3 = "gl3mouQf0eAdouY5", S4 = "N7rxbhvGMk3cs6k5";
const world = (regions = {}) => ({ scenes: { [S3]: { regions: regions[S3] ?? [] }, [S4]: { regions: regions[S4] ?? [] } } });
const J = JSON.stringify;

// ── the square is a placeholder until Seat 41 reads it off the map ───────────────────────────────────────────────
check("the trap door's square is a placeholder (null) until the seat reads it", ATTIC_TRAP === null);
const none = planAtticLadder({ trap: null, ...world() });
check("…and while it is unknown NOTHING is made (no half ladder)", none.make.length === 0 && /not set yet/.test(none.skipped[0] ?? ""), J(none));
const src = read("scripts/cm-house.js");
check("…and the run-once marker is not set then, so the ladder appears on the first GM load after the square is filled in",
  /if \(plan\.skipped\.some\(\(s\) => s\.startsWith\("the trap door"\)\)\) return null;/.test(src));

// ── the two ends ─────────────────────────────────────────────────────────────────────────────────────────────────
const plan = planAtticLadder({ trap: { col: 11, row: 8 }, ...world() });
check("with a square: both ends are made, up on 12.3 and down on 12.4", J(plan.make.map((m) => m.end)) === J(["up", "down"]), J(plan));
const up = plan.make[0].region, down = plan.make[1].region;
check("up: 'Climb up to the attic?', on the trap door's square, our key and fixed id", up._id === "mcAtticTrapUp001" && up.flags["mobile-command"].cm === "stair:12.3:attic"
  && up.behaviors[0].system.dialog.revealed === "Climb up to the attic?" && up.shapes[0].x === 11 * 140 && up.shapes[0].y === 8 * 140, J(up));
check("up ships SEALED: no destination, so core's teleport neither asks nor pauses, and MC's phone offers no crossing",
  up.behaviors[0].type === "teleportToken" && up.behaviors[0].system.destinations.length === 0 && up.behaviors[0].system.choice === true);
check("…and drawn on the GM's region layer only (invisible to players)", up.visibility === 0);
check("…and marked for the deck's resets to seal again (our own flag; the down end is not)", up.flags["mobile-command"].sealOnReset === true && !down.flags["mobile-command"].sealOnReset);
check("down: 'Climb down to the third floor?', at the ladder drawn on the attic (10, 8), open, to the trap door",
  down._id === "mcAtticLadderDn1" && down.behaviors[0].system.dialog.revealed === "Climb down to the third floor?"
  && down.shapes[0].x === LADDER_TOP.col * 140 && down.shapes[0].y === LADDER_TOP.row * 140
  && J(down.behaviors[0].system.destinations) === J([`Scene.${S3}.Region.mcAtticTrapUp001`]), J(down));
check("the deck's gate names the same two regions", ladderUuid("up") === `Scene.${S3}.Region.mcAtticTrapUp001` && ladderUuid("down") === `Scene.${S4}.Region.mcAtticLadderDn1`);
check("the house's four stairs are unchanged (the ladder is its own pair)", Object.keys(HOUSE_STAIRS).length === 4 && !Object.keys(HOUSE_STAIRS).some((k) => /attic|12\.4/.test(k)));

// ── additive ─────────────────────────────────────────────────────────────────────────────────────────────────────
const again = planAtticLadder({ trap: { col: 11, row: 8 }, ...world({ [S3]: [{ id: "mcAtticTrapUp001", cm: "stair:12.3:attic" }], [S4]: [{ id: "x", cm: "stair:12.4:down" }] }) });
check("an end that exists (by id or by our key) is left exactly where he put it", again.make.length === 0 && again.kept.length === 2, J(again));

// ── the climb's sound ────────────────────────────────────────────────────────────────────────────────────────────
check("a teleport between 12.3 and 12.4 is the climb, either way; other floors are not",
  isAtticClimb(S3, `Scene.${S4}.Token.abc`) && isAtticClimb(S4, `Scene.${S3}.Token.abc`) && !isAtticClimb("LTGEO7JXWxFvbcIJ", `Scene.${S3}.Token.abc`) && !isAtticClimb(S3, null));
const played = [];
globalThis.foundry = { audio: { AudioHelper: { play: (o, all) => played.push({ ...o, all }) } } };
const users = (self) => ({ activeGM: { id: "A" }, current: self });
globalThis.game = { user: { id: "A", isGM: true }, users: users(), playlists: { contents: [{ sounds: { contents: [{ name: "Ladder Climb", path: "his/climb.ogg" }] } }] } };
const tok = { id: "t1", parent: { id: S3 } };
check("the primary GM plays it once, for everyone, on the environment channel, at his 'Ladder Climb' path",
  onAtticClimb(tok, { replacements: { t1: `Scene.${S4}.Token.t9` } }) === true && played.length === 1 && played[0].src === "his/climb.ogg"
  && played[0].channel === "environment" && played[0].all === true && played[0].volume === LADDER_CLIMB.volume, J(played));
globalThis.game.user = { id: "B", isGM: true }; // the second GM (DM 2026-11-27: "Claude" is a GM too)
check("the second GM plays nothing (one client, one climb)", onAtticClimb(tok, { replacements: { t1: `Scene.${S4}.Token.t9` } }) === false && played.length === 1);
globalThis.game.user = { id: "A", isGM: true };
check("a token deleted without a teleport plays nothing", onAtticClimb(tok, {}) === false && played.length === 1);
check("…and with no such sound in his world, the file itself", (() => { game.playlists = { contents: [] }; onAtticClimb(tok, { replacements: { t1: `Scene.${S4}.Token.t9` } }); return played.at(-1).src === LADDER_CLIMB.src; })());

// ── wiring ───────────────────────────────────────────────────────────────────────────────────────────────────────
const main = read("scripts/main.js"), settings = read("scripts/settings.js");
check("made on the primary GM's load (one GM of two), the climb heard on every client's hook", /makeAtticLadder\(\)\.catch/.test(main) && /registerAtticLadder\(\);/.test(main)
  && /export async function makeAtticLadder[\s\S]{0,200}game\.users\.activeGM\?\.id !== game\.user\.id\) return null;/.test(src));
check("its run-once marker is a world setting", /register\(MODULE_ID, "atticLadderMade", \{\s*scope: "world", config: false, type: Boolean, default: false/.test(settings));
check("made with its fixed ids (keepId), so the deck's key can name it", /createEmbeddedDocuments\("Region", \[\{ \.\.\.region, visibility: CONST\.REGION_VISIBILITY\.LAYER_UNLOCKED \}\], \{ keepId: true \}\)/.test(src));
console.log(`\nAll ${n} passed.`);
