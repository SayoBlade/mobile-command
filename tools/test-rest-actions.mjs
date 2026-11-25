// Rest on the deck (DM 2026-11-26, the redesign's question 9: "add a rest subdrawer to party and place them there"):
// MC publishes Start rest · Pass watch · Finish in its "rest" area, each the panel's own rest step. Against the fake
// Foundry, no world.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-rest-actions.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import { installFakeFoundry } from "./fake-foundry.mjs";
const { A, brekka, gorbon } = await installFakeFoundry();
globalThis.document ??= { hidden: true, getElementById: () => null, querySelector: () => null }; // the panel repaints after a rest step (not mounted here)
await import(new URL("../scripts/actions-rest.js", import.meta.url));

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const rows = () => A.actionSnapshot({ area: "rest" });
const row = (id) => rows().find((r) => r.id === id);

/* ── 1–3. no party group ────────────────────────────────────────────────────────────────────────────── */
check("the rest area publishes Start rest · Pass watch · Finish, in that order, one group",
  rows().map((r) => r.label).join(" · ") === "Start rest · Pass watch · Finish" && new Set(rows().map((r) => r.group)).size === 1, rows().map((r) => r.label).join());
check("no party group: Start rest is dim and says why ('form a party group first')", row("rest.start").enabled === false && row("rest.start").sub === "form a party group first", JSON.stringify(row("rest.start")));
check("nothing under way: Pass watch and Finish are dim", row("rest.pass").enabled === false && row("rest.finish").enabled === false);

/* ── 4. a party group: Start shows the panel's picks ───────────────────────────────────────────────── */
const flags = {};
const group = { id: "g1", name: "Party", type: "group", uuid: "Actor.g1", system: { members: [{ actor: brekka }, { actor: gorbon }] },
  getFlag: (m, k) => flags[k], setFlag: async (m, k, v) => { flags[k] = JSON.parse(JSON.stringify(v)); }, unsetFlag: async (m, k) => { delete flags[k]; } };
game.actors.push(group);
check("with a party group: Start rest is live and its sub-line is the panel's pick ('long · watches')", row("rest.start").enabled === true && row("rest.start").sub === "long · watches", JSON.stringify(row("rest.start")));

/* ── 5–8. the stages, read from the rest the panel keeps ───────────────────────────────────────────── */
flags.rest = { id: "r1", size: "long", phases: { downtime: false, watches: true }, stage: "assign" };
check("stopped at the watch grid: Start says 'set the watches, then press to begin' (the panel's Begin Rest)",
  row("rest.start").enabled === true && row("rest.start").sub === "set the watches, then press to begin", JSON.stringify(row("rest.start")));
check("…Pass watch still dim (no watch yet); Finish live ('apply the rest')", row("rest.pass").enabled === false && row("rest.finish").enabled === true && row("rest.finish").sub === "apply the rest");
flags.rest.stage = "watches";
check("during the watches: Pass watch live, Start dim ('under way')", row("rest.pass").enabled === true && row("rest.start").enabled === false && row("rest.start").sub === "under way");
flags.rest.stage = "morning";
check("morning: only Finish", row("rest.start").enabled === false && row("rest.pass").enabled === false && row("rest.finish").enabled === true);

/* ── 9. Finish applies the rest and clears it ──────────────────────────────────────────────────────── */
const res = await A.runAction("rest.finish");
// (headless, the panel's repaint after the step has no page to draw on; the step itself is what is checked)
check("Finish ends the rest (the panel's own end: the rest flag goes)", !flags.rest && (res.ok === true || /document/.test(res.reason ?? "")), JSON.stringify(res));
console.log(`\nAll ${n} passed.`);
