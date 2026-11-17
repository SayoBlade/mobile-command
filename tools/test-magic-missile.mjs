// SEAT 7 (2026-11-17), §28.4 leg 5 FAILED: three Magic Missile darts on one goblin, the phone said 12 damage, the
// goblin lost 7. midi applies its own dart AFTER rollDamage returns (AllRollsComplete → processDamageRoll writes an
// absolute hp.value - delta from the HP it read); our extra darts landed in that window and one write was lost.
// Drives the real rpc.applyExtraInstances against a fake midi workflow whose apply lands late, as midi 14.6.13's does.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-magic-missile.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import { installFakeFoundry } from "./fake-foundry.mjs";

await installFakeFoundry();
const rpc = await import(new URL("../scripts/rpc.js", import.meta.url));

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// A goblin whose HP writes round-trip like a real update: read now, land a tick later (dnd5e applyDamage is
// read-then-update with an absolute value).
function goblin(hp = 20) {
  const a = { name: "Goblin", hp, writes: [] };
  a.applyDamage = async (parts) => { const from = a.hp; const v = parts.reduce((s, p) => s + p.value, 0); await tick(); await tick(); a.hp = from - v; a.writes.push(["mc", v]); };
  return a;
}
// midi's workflow: rollDamage has returned (the dart total is known); a few ticks later AllRollsComplete reads the
// HP and writes hp - dart, then moves on.
function midiWorkflow(actor, dart, { applyAfterTicks = 3, never = false } = {}) {
  const wf = { currentAction: { name: "WorkflowState_DamageRollComplete" }, damageTotal: dart, damageDetail: [{ type: "force" }],
    item: { name: "Magic Missile" }, actor: { name: "Wizard" }, mcExtraInstances: { "Scene.s.Token.gob": 2 } };
  wf.done = (async () => {
    if (never) return;
    for (let i = 0; i < applyAfterTicks; i++) await tick();
    wf.currentAction = { name: "WorkflowState_AllRollsComplete" };
    const from = actor.hp; await tick(); await tick(); actor.hp = from - dart; actor.writes.push(["midi", dart]);
    wf.currentAction = { name: "WorkflowState_ApplyDynamicEffects" };
  })();
  return wf;
}
const deps = (actor, rolls, waitOpts = { step: 0, wait: tick }) => ({
  resolve: async () => ({ name: "Goblin", actor }), roll: async () => rolls.shift(), record: async () => {}, whisper: async () => {}, waitOpts });

// ── 1–4. three darts (midi's 5, ours 4 and 3) on one goblin at 20 HP ─────────────────────────────────
{
  const g = goblin(20), wf = midiWorkflow(g, 5);
  const extra = await rpc.applyExtraInstances(wf, deps(g, [4, 3]));
  await wf.done;
  check("the extras add up to the two extra darts (4 + 3)", extra === 7, String(extra));
  check("the phone's total is midi's dart + the extras = 12", wf.damageTotal + extra === 12, String(wf.damageTotal + extra));
  check("the goblin lost all 12 (20 → 8), no dart overwritten", g.hp === 8, String(g.hp));
  check("midi's dart landed first, then the extras one at a time", JSON.stringify(g.writes) === JSON.stringify([["midi", 5], ["mc", 4], ["mc", 3]]), JSON.stringify(g.writes));
}
// ── 5. the old way (no wait) loses a dart: the proof the test sees the race ───────────────────────────
{
  const g = goblin(20), wf = midiWorkflow(g, 5);
  wf.currentAction = { name: "WorkflowState_Completed" };       // pretend midi is done, so nothing waits
  const extra = await rpc.applyExtraInstances(wf, deps(g, [4, 3]));
  await wf.done;
  check("without the wait the same volley loses a dart (the seat's 12-said, fewer-lost)", g.hp > 8, `hp ${g.hp}, extras ${extra}`);
}
// ── 6–7. midi never gets there (stalled/hidden client): the extras still land after the timeout ──────
{
  const g = goblin(20), wf = midiWorkflow(g, 5, { never: true });
  let clock = 0;
  const extra = await rpc.applyExtraInstances(wf, deps(g, [4, 3], { timeoutMs: 1000, step: 50, now: () => clock, wait: async (ms) => { clock += ms; await tick(); } }));
  check("a stalled workflow: the extras are applied anyway after the wait runs out", extra === 7 && g.hp === 13, `extra ${extra}, hp ${g.hp}`);
  check("…and the wait gave up at its timeout, not forever", clock >= 1000 && clock < 1100, String(clock));
}
// ── 8. an aborted workflow does not hold the extras ─────────────────────────────────────────────────
{
  const g = goblin(20), wf = midiWorkflow(g, 5, { never: true }); wf.aborted = true;
  let waited = 0;
  await rpc.applyExtraInstances(wf, deps(g, [2, 2], { step: 50, wait: async () => { waited++; await tick(); } }));
  check("an aborted workflow: no waiting", waited === 0, String(waited));
}
// ── 9. no duplicates sent: nothing waits, nothing applied ───────────────────────────────────────────
{
  const g = goblin(20), wf = midiWorkflow(g, 5); wf.mcExtraInstances = {};
  let waited = 0;
  const extra = await rpc.applyExtraInstances(wf, deps(g, [], { step: 50, wait: async () => { waited++; await tick(); } }));
  await wf.done;
  check("one dart per target: no extras, no wait, midi's own apply alone", extra === 0 && waited === 0 && g.hp === 15, `extra ${extra}, waited ${waited}, hp ${g.hp}`);
}
console.log(`All ${n} passed.`);
process.exit(0);
