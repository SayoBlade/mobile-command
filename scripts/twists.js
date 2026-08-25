// §31 v2 Twists of Fate — auto-apply (APPROVED DM 2026-08-20 "yes"; built 2026-08-21).
//
// v1 spent the twist and posted the fate card, then left the DM to fudge the die by hand.
// v2: the panel's Apply now ARMS the declared face on a chosen creature, and that creature's
// next qualifying d20 — attack, saving throw (death and concentration included), ability
// check, skill, tool, initiative — LANDS it as a true natural 1 or 20: crit and fumble
// semantics intact, midi's hit/save math reads the same die everyone sees.
//
// Mechanism (dnd5e 5.3.3, read from installed source): every one of those rolls funnels
// through BasicRoll.build with "d20Test" among its hookNames, so a single hook pair covers
// the lot. `dnd5e.preRollD20Test` fires before the roll dialog with the process config;
// D20Roll's own configureModifiers turns `options.minimum`/`options.maximum` into min/max
// die modifiers — the exact machinery Reliable Talent rides — so setting minimum 20 (or
// maximum 1) on the roll config is all the surgery there is. The system builds the die,
// on any client, with or without midi in the path.
//
// `dnd5e.postD20TestRollConfiguration` is the consume point: it fires after the dialog with
// the rolls constructed and evaluation next, so a player cancelling the roll dialog leaves
// the twist armed for the real attempt. Builds with `evaluate: false` (a roll constructed
// but never thrown) deliberately don't consume either.
//
// The armed state is a flag on the ROLLING actor — written via token.actor for scene picks,
// which for an unlinked token is its delta-backed synthetic actor: the very document the
// roll hook receives (the unlinked-token trap, honored). Cleanup is threefold: consumed on
// use, one-tap disarm on the panel's armed chip, and a deleteCombat sweep (active GM) so a
// fight's leftovers never outlive it. There is deliberately NO turn-end expiry: the twisted
// roll is usually a save made on someone ELSE'S turn, and out of combat the visible chip —
// not a timer — keeps a stale arm honest.

import { MODULE_ID, attackPreviewLatch } from "./preset.js";

export const ARMED_FLAG = "twistArmed";

// What the declared face does to a d20 roll's options. The opposing bound comes back as an
// explicit `undefined` so appliers DELETE it — a foreign minimum (Reliable Talent) or maximum
// (a curse) must never argue with declared fate: the book says the die IS the number.
export function twistRollOptions(die) {
  return die === 1 ? { maximum: 1, minimum: undefined } : { minimum: 20, maximum: undefined };
}

// Mutate a d20Test process config in place (the primary roll only — config.rolls[0] is the
// test itself; anything after it is another module's rider). Returns true when it took.
export function applyTwistToRollConfig(config, armed) {
  const roll = config?.rolls?.[0];
  if (!roll || !armed) return false;
  roll.options ??= {};
  for (const [k, v] of Object.entries(twistRollOptions(armed.die))) {
    if (v === undefined) delete roll.options[k];
    else roll.options[k] = v;
  }
  return true;
}

// config.subject is the rolling Actor for checks/saves/initiative but the Activity for
// attacks — `.actor ?? itself` resolves both to the creature.
export function rollSubjectActor(config) {
  const s = config?.subject;
  return s?.actor ?? s ?? null;
}

export function armedTwistOf(actor) {
  return actor?.getFlag?.(MODULE_ID, ARMED_FLAG) ?? null;
}

export async function armTwist(actor, { die, by = "", note = "" } = {}) {
  if (!actor) return;
  await actor.setFlag(MODULE_ID, ARMED_FLAG, { die: die === 1 ? 1 : 20, by, note, ts: Date.now() });
}

export async function disarmTwist(actor) {
  await actor?.unsetFlag?.(MODULE_ID, ARMED_FLAG);
}

export function registerTwists() {
  // Arm the die. Idempotent and cheap (one in-memory flag read per d20 roll), so it runs on
  // every client — whichever one ends up performing the roll does the forcing itself.
  // The attack-preview guard (both hooks): the phone's adv/dis hint runs a HIDDEN midi
  // pre-roll (§28.8 Round 34) that is a real d20 test — without the guard an armed twist
  // forced, and CONSUMED itself on, the invisible throwaway, and the player's actual attack
  // rolled un-fated (caught live on the first forced-ATTACK leg, 2026-08-25).
  Hooks.on("dnd5e.preRollD20Test", (config) => {
    if (attackPreviewLatch.up) return;
    const armed = armedTwistOf(rollSubjectActor(config));
    if (armed) applyTwistToRollConfig(config, armed);
  });

  // Consume on use — after the dialog, before evaluation. Fire-and-forget: the roll must not
  // wait on a server round-trip, and the rolling client can always write here (the executor
  // and DM clients are GMs; a player rolling their own save owns their own actor).
  Hooks.on("dnd5e.postD20TestRollConfiguration", (rolls, config) => {
    if (attackPreviewLatch.up) return; // the hidden preview roll is not a use
    if (config?.evaluate === false) return; // built but never thrown — not a use
    const actor = rollSubjectActor(config);
    if (armedTwistOf(actor)) disarmTwist(actor);
  });

  // A combat ending sweeps its leftovers, on exactly one client.
  Hooks.on("deleteCombat", (combat) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    for (const c of combat.combatants) {
      if (armedTwistOf(c.actor)) disarmTwist(c.actor);
    }
  });
}
