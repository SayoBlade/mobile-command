// Headless check of the Basic / Complex gate (scripts/tier.js, DM 2026-10-08/09) and of its wiring
// into the phone shell — no world, no server:
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-tier.mjs   (or plain node)
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
// Results 1–9 exercise the gate itself; 10 onward read shell.js / settings.js as TEXT, because the
// shell can't run headless — they pin the call sites so a rename can't silently ungate a surface.
import { readFileSync } from "node:fs";

const REPO = new URL("..", import.meta.url);
let tier = "basic", registered = true;
globalThis.game = { settings: { get: (m, k) => { if (!registered) throw new Error("not registered"); return k === "playerTier" ? tier : undefined; } } };
const T = await import(new URL("scripts/tier.js", REPO));

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const SURFACES = ["party", "downtime", "sharedInventory", "travel"];
const origError = console.error; let errors = 0; console.error = () => { errors += 1; };

check("the four Complex surfaces are exactly party / downtime / sharedInventory / travel",
  JSON.stringify(Object.keys(T.COMPLEX_SURFACES).sort()) === JSON.stringify([...SURFACES].sort()), Object.keys(T.COMPLEX_SURFACES).join(","));
check("default tier is Basic", T.DEFAULT_TIER === "basic");
tier = "basic";
check("Basic: every Complex surface is hidden", SURFACES.every(s => T.surfaceOn(s) === false));
tier = "complex";
check("Complex: every Complex surface shows", SURFACES.every(s => T.surfaceOn(s) === true));
check("an unknown surface fails CLOSED, even in Complex, and logs", T.surfaceOn("partyy") === false && errors === 1, `errors=${errors}`);
tier = "basic";
check("Basic: Complex actions are refused (party-cell, dt-roll, transfer-commit, trade-accept, travel-group)",
  ["party-cell", "dt-roll", "transfer-commit", "trade-accept", "travel-group"].every(a => !T.actionAllowed(a)));
check("Basic: backing out is never refused (transfer-close, travel-cancel, dt-collapse)",
  ["transfer-close", "travel-cancel", "dt-collapse"].every(a => T.actionAllowed(a)));
check("Basic still offers a travel square (travel-open) — it asks the DM instead of the player", T.actionAllowed("travel-open"));
check("Basic keeps his kept list (story/journal delete, night, light, move, use, rests, scribe, wild shape, placement)",
  ["story-entry-delete", "journal-entry-delete", "journal-entry-save", "night-toggle", "light-toggle", "move", "use-nearby",
   "short-rest", "long-rest", "scroll-scribe", "wildshape-pick", "place-confirm", "fav-act", "tab"].every(a => T.actionAllowed(a)));
tier = "garbage"; const g = T.playerTier(); registered = false; const u = T.playerTier(); registered = true;
check("a bad stored value and an unregistered setting both read as Basic", g === "basic" && u === "basic", `${g}/${u}`);
console.error = origError;

// ── the wiring, read as text ────────────────────────────────────────────────────────────────
const shell = readFileSync(new URL("scripts/shell.js", REPO), "utf8");
const settings = readFileSync(new URL("scripts/settings.js", REPO), "utf8");
const tierSrc = readFileSync(new URL("scripts/tier.js", REPO), "utf8");
const gatedActions = [...tierSrc.matchAll(/"([a-z-]+)": "(party|downtime|sharedInventory|travel)"/g)].map(m => m[1]);
const missing = gatedActions.filter(a => !shell.includes(`data-action="${a}"`) && !shell.includes(`case "${a}"`));
check("every gated action still exists in the shell (no silent rename)", gatedActions.length >= 20 && !missing.length, missing.join(",") || `${gatedActions.length}`);
const keys = [...shell.matchAll(/surfaceOn\("([A-Za-z]+)"\)/g)].map(m => m[1]);
check("every surfaceOn() key used by the shell is a known surface", keys.length && keys.every(k => SURFACES.includes(k)), keys.join(","));
check("every surface is actually gated somewhere in the shell", SURFACES.every(s => keys.includes(s)), SURFACES.filter(s => !keys.includes(s)).join(","));
check("the shell never reads the tier setting directly (one gate)", !/settings\.get\([^)]*playerTier/.test(shell));
check("the click dispatcher asks actionAllowed() before the switch",
  /if \(!actionAllowed\(action\)\) return this\.leaveComplexIfGated\(\);\s*switch \(action\)/.test(shell));
check("the tier setting's update AND create hooks call leaveComplexIfGated()",
  /\$\{MODULE_ID\}\.playerTier`[\s\S]{0,120}leaveComplexIfGated\(\)/.test(shell)
  && /Hooks\.on\("updateSetting", onTier\)/.test(shell) && /Hooks\.on\("createSetting", onTier\)/.test(shell));
const rescue = shell.slice(shell.indexOf("  leaveComplexIfGated() {"), shell.indexOf("  #tabContent(actor) {"));
check("the rescue leaves the party view for Explore, clears transfer + trade offers + the player's travel question, then repaints",
  /#partyView = false; this\.#tab = "sheet"/.test(rescue) && /#transferState = null/.test(rescue)
  && /e\.kind !== "trade"/.test(rescue) && /#travelAsk = null/.test(rescue)
  && /this\.render\(\)/.test(rescue));
check("…but leaves the travel squares listed (DM 2026-10-09: in Basic a tap asks the DM)", !/#nearbyTravel = null/.test(rescue));
check("the packed-party UI (tab bar, content, sheet pad) goes through #partyUI()",
  (shell.match(/this\.#partyUI\(\)/g) ?? []).length === 3);
check("setting: playerTier is world, DM-set, default basic, choices basic/complex",
  /register\(MODULE_ID, "playerTier", \{[\s\S]{0,700}scope: "world", config: true, type: String, default: "basic",\s*choices: \{ basic: "Basic", complex: "Complex" \}/.test(settings));
const choose = shell.slice(shell.indexOf("  #chooseTravel(regionId, label) {"), shell.indexOf("  noteTravelResult("));
check("choosing a travel square: Complex opens the player's own question, Basic asks the DM (and nothing else)",
  /if \(surfaceOn\("travel"\)\) \{ this\.#travelAsk = \{ regionId, label \}; return this\.render\(\); \}/.test(choose)
  && /rpc\.travelRequest\(/.test(choose) && !/rpc\.travelTo\(/.test(choose));
check("the Use list no longer drops travel squares in Basic", /travel = inter\?\.ok \? \(inter\.travel \?\? \[\]\) : \[\];/.test(shell));
const story = shell.slice(shell.indexOf("  async #storyDeleteEntry(entryId) {"), shell.indexOf("rpc.storyDelete("));
check("deleting a My Story entry asks first (DialogV2.confirm before rpc.storyDelete)", /DialogV2\.confirm/.test(story) && /if \(!ok\) return;/.test(story));
console.log(`All ${n} passed.`);
