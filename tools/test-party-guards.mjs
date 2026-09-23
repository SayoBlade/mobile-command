// Headless check of Form Up's refusals (§15, 2026-09-23 — the two guards deck-command's Form Up key
// needs, and the shape of every refusal): run against tools/fake-foundry.mjs — no world, no server.
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-party-guards.mjs   (or plain node)
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import { installFakeFoundry } from "./fake-foundry.mjs";

const { brekka, gorbon, MOD } = await installFakeFoundry();
const REPO = new URL("..", import.meta.url);
const rpc = await import(new URL("scripts/rpc.js", REPO));

/* ── the runner ──────────────────────────────────────────────────────────────────────────── */
let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const words = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;

/* ── the world: two linked PCs standing side by side, a group actor holding both ─────────── */
const scene = canvas.scene;
globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1, SECRET: -2 } };
canvas.ready = true; // onActiveScene(): the DM is viewing the active scene
scene.deleteEmbeddedDocuments = async (type, ids) => { scene.tokens = scene.tokens.filter((t) => !ids.includes(t.id)); };
const setTokens = () => {
  scene.tokens = [
    { id: "tk1", actor: brekka, actorId: brekka.id, actorLink: true, x: 500, y: 500, width: 1, height: 1, hidden: false, sight: { range: 60 }, parent: scene },
    { id: "tk2", actor: gorbon, actorId: gorbon.id, actorLink: true, x: 600, y: 500, width: 1, height: 1, hidden: false, sight: { range: 60 }, parent: scene },
  ];
};
setTokens();
const gflags = {};
const group = {
  id: "g1", name: "The Party", type: "group", uuid: "Actor.g1",
  system: { members: [{ actor: brekka }, { actor: gorbon }] },
  flags: { [MOD]: gflags },
  getFlag: (m, k) => gflags[k],
  setFlag: async (m, k, v) => { gflags[k] = JSON.parse(JSON.stringify(v)); },
  update: async (data) => {
    for (const [k, v] of Object.entries(data)) {
      const f = /^flags\.mobile-command\.(.+)$/.exec(k);
      if (f) gflags[f[1]] = JSON.parse(JSON.stringify(v));
      else if (k === "prototypeToken") group.prototypeToken = v;
    }
  },
  getTokenDocument: async (data = {}) => ({ toObject: () => ({ name: "The Party", actorId: "g1", width: 1, height: 1, ...data }) }),
};
game.actors.push(group);
const pack = (p = {}) => rpc.api.partyPack({ groupId: "g1", ...p });
const memberTokens = () => scene.tokens.filter((t) => t.actorId === brekka.id || t.actorId === gorbon.id).length;
const reset = () => { setTokens(); delete gflags.packed; delete gflags.formation; delete game.combat; };

/* ── 1–2 a clean party packs (the guards never block the ordinary case) ─────────────────── */
{
  const r = await pack();
  check("a clustered, linked, out-of-combat party forms up", r?.ok === true, JSON.stringify(r));
  check("its member tokens are gone and the group carries the packed flag", memberTokens() === 0 && gflags.packed === true,
    `tokens ${memberTokens()}, packed ${gflags.packed}`);
}

/* ── 3–6 in combat: refused, named, not forceable, nothing written ───────────────────────── */
reset();
game.combat = { started: true, combatants: [{ id: "c1", tokenId: "tk2", actorId: gorbon.id }] };
{
  const r = await pack();
  check("a member in the encounter refuses with reason \"in combat\"", r?.ok === false && r.reason === "in combat", JSON.stringify(r));
  check("the detail names the combatant and says what to do", /Gorbon/.test(r.detail) && /end combat/i.test(r.detail), r?.detail);
  check("nothing was written: both tokens still stand, no packed flag", memberTokens() === 2 && !gflags.packed,
    `tokens ${memberTokens()}, packed ${gflags.packed}`);
  const f = await pack({ force: true });
  check("force does not bypass the combat guard", f?.ok === false && f.reason === "in combat", JSON.stringify(f));
}
{
  // A combat that exists but has not started (staging) still holds the combatant — still refused.
  game.combat = { started: false, combatants: [{ id: "c1", tokenId: "tk1", actorId: brekka.id }] };
  const r = await pack();
  check("a staged (unstarted) encounter with a member in it is refused too", r?.ok === false && r.reason === "in combat", JSON.stringify(r));
}

/* ── 8–11 unlinked: refused, named, not forceable, nothing written ───────────────────────── */
reset();
scene.tokens[0].actorLink = false;
{
  const r = await pack();
  check("an unlinked member token refuses with reason \"unlinked token\"", r?.ok === false && r.reason === "unlinked token", JSON.stringify(r));
  check("the detail names the token's owner and says how to fix it", /Brekka/.test(r.detail) && /Link Actor Data/.test(r.detail), r?.detail);
  check("nothing was written", memberTokens() === 2 && !gflags.packed, `tokens ${memberTokens()}, packed ${gflags.packed}`);
  const f = await pack({ force: true });
  check("force does not bypass the unlinked guard", f?.ok === false && f.reason === "unlinked token", JSON.stringify(f));
}

/* ── 12–13 the cluster gate keeps its shape, and force still lifts it ────────────────────── */
reset();
scene.tokens[1].x = 1500; // ten squares away
{
  const r = await pack();
  check("a scattered party refuses with reason \"not clustered\"", r?.ok === false && r.reason === "not clustered", JSON.stringify(r));
  const f = await pack({ force: true });
  check("force lifts the cluster gate (travel's pull-out still works)", f?.ok === true && gflags.packed === true, JSON.stringify(f));
}

/* ── 14–15 every refusal is key-shaped: a reason a face can wear, a detail a toast can read ── */
reset();
const refusals = [];
game.combat = { started: true, combatants: [{ id: "c1", tokenId: "tk1", actorId: brekka.id }] }; refusals.push(await pack());
reset(); scene.tokens[0].actorLink = false; refusals.push(await pack());
reset(); scene.tokens[1].x = 1500; refusals.push(await pack());
reset(); scene.tokens = []; refusals.push(await pack());                    // not on scene
reset(); refusals.push(await rpc.api.partyPack({ groupId: "nope" }));        // no group
reset(); group.system.members = []; refusals.push(await pack()); group.system.members = [{ actor: brekka }, { actor: gorbon }];
check("every refusal is { ok:false, reason, detail } — never a throw, never a bare false",
  refusals.every((r) => r && r.ok === false && typeof r.reason === "string" && typeof r.detail === "string"),
  JSON.stringify(refusals.map((r) => r?.reason)));
check("every reason is three words or fewer (a key face can wear it); every detail is longer than its reason",
  refusals.every((r) => words(r.reason) <= 3 && r.detail.length > r.reason.length),
  JSON.stringify(refusals.map((r) => [r?.reason, words(r?.reason)])));

console.log(`\nAll ${n} passed.`);
