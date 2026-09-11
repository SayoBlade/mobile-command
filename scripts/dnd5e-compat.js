// The dnd5e version seam (DESIGN D6: isolate system churn behind an adapter).
//
// dnd5e 6.0 (released 2026-09-10, read from installed source) changed three things this module
// reads directly:
//  - chat cards became typed ChatMessage subtypes: the roll metadata that lived in
//    `flags.dnd5e.roll` (5.3) now lives in `message.type` + `message.system` (6.0), and a 6.0
//    card may carry NO `flags.dnd5e` at all;
//  - the actor keys Active Effects target for roll bonuses and senses were renamed
//    (`system.bonuses.mwak.attack` → `system.rolls.attack.mwak.bonus`,
//    `system.attributes.senses.darkvision` → `…senses.ranges.darkvision`); the old names ride a
//    deprecation shim that logs a warning per effect and is removed at 6.1 (senses) / 7.0 (bonuses);
//  - a flat armor class is `ac.override` (6.0) rather than the `flat` calc (5.3).
// midi-qol still declares dnd5e ≤ 5.3.99, so 5.3.3 tables and 6.0 tables both have to work —
// every version-sensitive read goes through here, nowhere else.

/** Installed dnd5e major version (5 or 6). */
export function dnd5eMajor() {
  return parseInt(String(globalThis.game?.system?.version ?? "0"), 10) || 0;
}

/** Normalised roll kind of a chat message, in the 5.3 vocabulary this module grew up with:
 *  "attack" | "damage" | "healing" | "save" | "death" | "concentration" | "ability" | "skill" |
 *  "tool" | "initiative" | "hitDie" | "hitPoints" | "generic" | "recharge" | null.
 *  5.3: `flags.dnd5e.roll.type` (concentration saves were plain "save" there).
 *  6.0: `message.type` + `message.system.type/skill/tool`. */
export function messageRollKind(message) {
  if (!message) return null;
  const legacy = message.flags?.dnd5e?.roll?.type;
  if (legacy) return legacy;
  const sys = message.system ?? {};
  switch (message.type) {
    case "save": return sys.type === "death" ? "death" : sys.type === "concentration" ? "concentration" : "save";
    case "check": return sys.type === "initiative" ? "initiative" : sys.skill ? "skill" : sys.tool ? "tool" : "ability";
    case "attack": case "damage": case "healing": case "hitDie": case "hitPoints": case "generic": case "recharge":
      return message.type;
    default: return null;
  }
}

/** Is this message a saving throw result (ability save or concentration — the prompts the phone
 *  shows for both), as opposed to a death save or anything else? */
export function isSaveResult(message) {
  const k = messageRollKind(message);
  return k === "save" || k === "concentration";
}

/** Is this message dnd5e machinery (a card of any kind), as opposed to something a person typed?
 *  6.0 cards are typed subtypes and may carry no flags.dnd5e at all; 5.3 cards always flagged. */
export function isDnd5eCard(message) {
  if (!message) return false;
  if (message.flags?.dnd5e) return true;
  const t = message.type;
  return !!t && t !== "base";
}

// Active-effect change keys dnd5e renamed in 6.0. The 5.3 spelling is what our own effects
// were written with; on 6.0 the system still honours it through a shim but warns on every
// application, and the senses shim is gone at 6.1.
const AE_KEYS_6 = {
  "system.bonuses.mwak.attack": "system.rolls.attack.mwak.bonus",
  "system.bonuses.msak.attack": "system.rolls.attack.msak.bonus",
  "system.bonuses.rwak.attack": "system.rolls.attack.rwak.bonus",
  "system.bonuses.rsak.attack": "system.rolls.attack.rsak.bonus",
  "system.bonuses.mwak.damage": "system.rolls.damage.mwak.bonus",
  "system.bonuses.msak.damage": "system.rolls.damage.msak.bonus",
  "system.bonuses.rwak.damage": "system.rolls.damage.rwak.bonus",
  "system.bonuses.rsak.damage": "system.rolls.damage.rsak.bonus",
  "system.bonuses.abilities.check": "system.rolls.ability.check.bonus",
  "system.bonuses.abilities.save": "system.rolls.ability.save.bonus",
  "system.bonuses.abilities.skill": "system.rolls.ability.skill.bonus",
  "system.attributes.senses.darkvision": "system.attributes.senses.ranges.darkvision",
  "system.attributes.senses.blindsight": "system.attributes.senses.ranges.blindsight",
  "system.attributes.senses.tremorsense": "system.attributes.senses.ranges.tremorsense",
  "system.attributes.senses.truesight": "system.attributes.senses.ranges.truesight",
  "system.attributes.movement.walk": "system.attributes.movement.speeds.walk",
  "system.attributes.movement.fly": "system.attributes.movement.speeds.fly",
  "system.attributes.movement.swim": "system.attributes.movement.speeds.swim",
  "system.attributes.movement.climb": "system.attributes.movement.speeds.climb",
  "system.attributes.movement.burrow": "system.attributes.movement.speeds.burrow"
};

/** The change key the installed dnd5e wants for an effect written in the 5.3 spelling. */
export function aeKey(key) {
  return dnd5eMajor() >= 6 ? (AE_KEYS_6[key] ?? key) : key;
}

/** Armor class as the phone's breakdown card wants it, from a prepared `attributes.ac`:
 *  { flat, armored, calc, label }. `flat` is the override that replaces every calculation
 *  (6.0 `ac.override`; 5.3 the "flat" calc), or null. `armored` means armor value + capped Dex
 *  (5.3 "default", 6.0 "armored"); any other calc's base already owns its own Dex. */
export function acShape(ac = {}) {
  const flat = Number.isFinite(ac.override) ? ac.override : ac.calc === "flat" ? (ac.flat ?? ac.value ?? 10) : null;
  return { flat, armored: ac.calc === "default" || ac.calc === "armored", calc: ac.calc, label: ac.label };
}
