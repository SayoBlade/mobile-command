// The travel area, run end to end against the fake Foundry — no world, no server, no locks.
//
//   node tools/test-travel-actions.mjs
//
// ⚠️ WHY THIS AREA GETS ITS OWN FILE. `travel` was DECLARED in AREAS and published nothing, so
// pressing it answered "nothing here right now" — one of the seven empty areas the DM asked to
// populate. An area that is empty passes every test there is, which is how it stayed empty for a
// month. These checks are about the rows EXISTING and about saying the right thing when they
// cannot run, which is the state they will be in most of the time.
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md protocol).
import { installFakeFoundry } from "./fake-foundry.mjs";

const { A } = await installFakeFoundry();

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const rows = () => A.actionSnapshot({ area: "travel" });
const row = (id) => rows().find((r) => r.id === id);

/* ── 1–3 the area is no longer empty ──────────────────────────────────────────────────────────── */
{
  const area = A.actionAreas().find((a) => a.id === "travel");
  check("the travel area is offered at all", Boolean(area), JSON.stringify(A.actionAreas().map((a) => a.id)));
}
check("it publishes rows — the whole point, since an empty area passes every other test",
  rows().length >= 3, String(rows().length));
check("every row is in one group, so the deck never splits them across two pages",
  new Set(rows().map((r) => r.group)).size === 1, [...new Set(rows().map((r) => r.group))].join(","));

/* ── 4–6 the verbs, and the one that is a decision ───────────────────────────────────────────── */
check("the three standing verbs are Travel, Draw road and Go",
  ["travel.begin", "travel.route", "travel.go"].every((id) => row(id)),
  rows().map((r) => r.id).join(" "));
check("⚠️ the commit says `Go`, never `Done` — Done is already the ask-commit's word",
  row("travel.go").label === "Go", row("travel.go").label);
check("Stop is HIDDEN while nothing is walking, rather than sitting there inviting a press",
  !row("travel.stop"), "stop is listed");

/* ── 7–9 a key that cannot run says why, and does not lie ────────────────────────────────────── */
check("nothing is packed, so Draw road is disabled and says so",
  row("travel.route").enabled === false && /form up/i.test(row("travel.route").sub),
  JSON.stringify(row("travel.route")));
check("no road drawn, so Go is disabled and names what is missing",
  row("travel.go").enabled === false && /draw a road/i.test(row("travel.go").sub),
  JSON.stringify(row("travel.go")));
check("Travel itself is always available — it is the key that gets you packed",
  row("travel.begin").enabled === true, JSON.stringify(row("travel.begin")));

/* ── 10–11 refusing is an answer, not a crash ────────────────────────────────────────────────── */
{
  const r = await A.runAction("travel.go");
  check("pressing Go with nothing to walk refuses with a reason rather than throwing",
    r?.ok === false && typeof r.reason === "string" && r.reason.length > 0, JSON.stringify(r));
}
{
  const r = await A.runAction("travel.route");
  check("pressing Draw road with no panel refuses the same way",
    r?.ok === false && typeof r.reason === "string", JSON.stringify(r));
}

/* ── 12 the headless bench itself ────────────────────────────────────────────────────────────── */
check("⚠️ reading the area does not need a DOM — `travelState` reaches for `document` and a bare "
  + "reference threw on every read until it was guarded, which only showed up here",
  rows().every((r) => typeof r.sub === "string"), JSON.stringify(rows().map((r) => r.sub)));

console.log(`\nAll ${n} passed.`);
