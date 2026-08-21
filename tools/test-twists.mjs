// Headless check of twists.js (§31 v2 auto-apply) — no world, no server, no locks.
// Run: ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules \
//   "/c/Program Files/Foundry Virtual Tabletop 14/Foundry Virtual Tabletop.exe" tools/test-twists.mjs
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");

// Minimal Hooks + game so registerTwists() wires up and the hook flow can be driven by hand.
globalThis.Hooks = {
  _h: {},
  on(n, f) { (this._h[n] ??= []).push(f); },
  fire(n, ...args) { for (const f of this._h[n] ?? []) f(...args); }
};
globalThis.game = { user: { id: "gm" }, users: { activeGM: { id: "gm" } } };

const T = await import("file:///" + path.join(REPO, "scripts/twists.js").replace(/\\/g, "/"));
const { MODULE_ID } = await import("file:///" + path.join(REPO, "scripts/preset.js").replace(/\\/g, "/"));

let fails = 0;
const ok = (n, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}${extra ? " — " + extra : ""}`); if (!cond) fails++; };

// A flag-bearing stand-in for an Actor (linked or a token's synthetic — same interface).
class FakeActor {
  constructor(name = "A") { this.name = name; this._f = new Map(); }
  getFlag(scope, key) { return this._f.get(`${scope}.${key}`); }
  async setFlag(scope, key, v) { this._f.set(`${scope}.${key}`, v); }
  async unsetFlag(scope, key) { this._f.delete(`${scope}.${key}`); }
}

// 1. the declared face becomes the right d20 bound — and evicts the opposing one
const o20 = T.twistRollOptions(20);
ok("20 → minimum 20", o20.minimum === 20);
ok("20 → maximum evicted", "maximum" in o20 && o20.maximum === undefined);
const o1 = T.twistRollOptions(1);
ok("1 → maximum 1", o1.maximum === 1);
ok("1 → minimum evicted", "minimum" in o1 && o1.minimum === undefined);

// 2. config mutation: force a 20 over a foreign maximum (a curse capping the die)
let cfg = { rolls: [{ options: { maximum: 15 } }] };
ok("apply(20) returns true", T.applyTwistToRollConfig(cfg, { die: 20 }) === true);
ok("apply(20) sets minimum 20", cfg.rolls[0].options.minimum === 20);
ok("apply(20) deletes the foreign maximum", !("maximum" in cfg.rolls[0].options));

// …and force a 1 over Reliable Talent's minimum 10 — declared fate beats every bound
cfg = { rolls: [{ options: { minimum: 10 } }] };
T.applyTwistToRollConfig(cfg, { die: 1 });
ok("apply(1) sets maximum 1", cfg.rolls[0].options.maximum === 1);
ok("apply(1) deletes Reliable Talent's minimum", !("minimum" in cfg.rolls[0].options));

// …a roll config with no options object yet gets one
cfg = { rolls: [{}] };
T.applyTwistToRollConfig(cfg, { die: 20 });
ok("options object created when missing", cfg.rolls[0].options?.minimum === 20);

// …only the primary roll is touched, and degenerate configs refuse quietly
cfg = { rolls: [{ options: {} }, { options: {} }] };
T.applyTwistToRollConfig(cfg, { die: 20 });
ok("secondary rolls untouched", !("minimum" in cfg.rolls[1].options));
ok("no rolls → false", T.applyTwistToRollConfig({ rolls: [] }, { die: 20 }) === false);
ok("no armed → false", T.applyTwistToRollConfig({ rolls: [{}] }, null) === false);

// 3. the subject resolves to the creature for both hook shapes
const actor = new FakeActor("Hag");
ok("subject = actor (checks/saves)", T.rollSubjectActor({ subject: actor }) === actor);
ok("subject = activity (attacks)", T.rollSubjectActor({ subject: { actor } }) === actor);
ok("no subject → null", T.rollSubjectActor({}) === null);

// 4. arm / read / disarm round-trip, with the die normalized to the two legal faces
await T.armTwist(actor, { die: 1, by: "Puck", note: "the hag's save" });
ok("armed flag lands", T.armedTwistOf(actor)?.die === 1);
ok("armed carries the spender", T.armedTwistOf(actor)?.by === "Puck");
await T.disarmTwist(actor);
ok("disarm clears", T.armedTwistOf(actor) === null);
await T.armTwist(actor, { die: 7 });
ok("a garbage die normalizes to 20", T.armedTwistOf(actor)?.die === 20);
await T.disarmTwist(actor);

// 5. the wired hook flow — registerTwists() driven end to end through the mock Hooks
T.registerTwists();

// an armed creature's roll gets forced…
await T.armTwist(actor, { die: 20, by: "Puck" });
cfg = { subject: actor, rolls: [{ options: {} }] };
Hooks.fire("dnd5e.preRollD20Test", cfg);
ok("preRollD20Test forces the armed die", cfg.rolls[0].options.minimum === 20);
ok("pre hook does NOT consume", T.armedTwistOf(actor)?.die === 20);

// …a cancelled dialog (post hook never fires) leaves it armed for the real attempt…
ok("dialog cancel leaves the twist armed", T.armedTwistOf(actor)?.die === 20);

// …a built-but-never-thrown roll must not consume either…
Hooks.fire("dnd5e.postD20TestRollConfiguration", [], { subject: actor, evaluate: false });
ok("evaluate:false does not consume", T.armedTwistOf(actor)?.die === 20);

// …and the real roll consumes exactly once
Hooks.fire("dnd5e.postD20TestRollConfiguration", [], { subject: actor });
ok("the real roll consumes the twist", T.armedTwistOf(actor) === null);

// an unarmed creature's roll passes through untouched
cfg = { subject: actor, rolls: [{ options: {} }] };
Hooks.fire("dnd5e.preRollD20Test", cfg);
ok("unarmed roll untouched", !("minimum" in cfg.rolls[0].options));

// attacks arrive with the ACTIVITY as subject — the force still finds the creature
await T.armTwist(actor, { die: 1 });
cfg = { subject: { actor }, rolls: [{ options: {} }] };
Hooks.fire("dnd5e.preRollD20Test", cfg);
ok("attack (activity subject) forced too", cfg.rolls[0].options.maximum === 1);
Hooks.fire("dnd5e.postD20TestRollConfiguration", [], { subject: { actor } });
ok("attack consume works via activity subject", T.armedTwistOf(actor) === null);

// 6. combat-end sweep: the active GM clears leftovers; every other client leaves them be
const a1 = new FakeActor("B1"); const a2 = new FakeActor("B2");
await T.armTwist(a1, { die: 20 }); await T.armTwist(a2, { die: 1 });
game.user = { id: "not-the-active-gm" };
Hooks.fire("deleteCombat", { combatants: [{ actor: a1 }, { actor: a2 }] });
ok("non-activeGM does not sweep", T.armedTwistOf(a1) !== null && T.armedTwistOf(a2) !== null);
game.user = { id: "gm" };
Hooks.fire("deleteCombat", { combatants: [{ actor: a1 }, { actor: a2 }, { actor: null }] });
ok("activeGM sweeps the fight's leftovers", T.armedTwistOf(a1) === null && T.armedTwistOf(a2) === null);

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
process.exit(fails ? 1 : 0);
