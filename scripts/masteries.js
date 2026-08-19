// §45 Weapon Mastery reminder — the phone half of a 2024 rule the phone couldn't see.
//
// dnd5e picks a mastery for every attack a mastery-trained PC makes and stamps it on the roll
// (`attackRoll.options.mastery`), then prints it as a line on the CHAT card. Automation modules
// (wm5e / Automated Masteries 5e) hang their Apply buttons off that same card. A phone player
// never sees any of it: they tap the weapon, watch a number land, and the mastery quietly never
// happens. This module is the copy + the gating that puts it back in front of them.
//
// We do NOT re-implement the effects. wm5e already does that, correctly and midi-aware; the
// preflight check "Automation prerequisites" turns its `autoMasteries` on for the executor so the
// effect actually lands (§45.2). This file only ever tells the truth about what happened.

// The eight masteries (PHB 2024). `line` is the consequence in the player's words — one line,
// sentence case, no rules citation (UI-BIBLE §7). `on` is the attack outcome the mastery cares
// about: showing Graze after a hit, or Topple after a miss, is noise that teaches players to
// ignore the card. `kind` decides the footer: an "effect" lands on the target (someone has to
// apply it), an "attack" is a second swing the player takes themselves.
export const MASTERIES = {
  cleave: { on: "hit",  kind: "attack",
    line: "One extra attack on another creature within 5 feet — no ability modifier on its damage.",
    foot: "Attack the second creature — it's free." },
  graze:  { on: "miss", kind: "effect",
    line: "You still deal your ability modifier in damage." },
  nick:   { on: "any",  kind: "attack",
    line: "Your Light extra attack rides along with this one — it costs no bonus action.",
    foot: "Tap the weapon again." },
  push:   { on: "hit",  kind: "effect",
    line: "Push the target up to 10 feet away (Large or smaller)." },
  sap:    { on: "hit",  kind: "effect",
    line: "The target has disadvantage on its next attack roll." },
  slow:   { on: "hit",  kind: "effect",
    line: "The target's speed drops by 10 feet until the start of your next turn." },
  topple: { on: "hit",  kind: "effect",
    line: "Constitution save or the target falls prone." },
  vex:    { on: "hit",  kind: "effect",
    line: "You have advantage on your next attack against this target." }
};

// dnd5e's own label, already localized (CONFIG.DND5E.weaponMasteries is preLocalized at init).
// Fall back to the key so a mastery added by a module still reads as a word, not a blank.
export function masteryLabel(key) {
  const cfg = CONFIG.DND5E?.weaponMasteries?.[key];
  if (cfg?.label) return cfg.label;
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "";
}

// Which mastery would THIS activity use — mirroring dnd5e's own choice, not guessing at it.
// dnd5e remembers the last pick per activity in the item flag `last.<activityId>.mastery` and
// otherwise takes the first of `masteryOptions` (dnd5e.mjs AttackActivity, ~28465). `masteryOptions`
// is null unless the actor actually has mastery with this weapon's base item AND the weapon has a
// mastery set — which is exactly the gate we want, so no separate proficiency check.
// Used as the phone-side fallback when the executor's answer is missing (a DM client still on
// pre-§45 rpc.js returns nothing here — see the executor-reload trap in DESIGN §28).
export function masteryOf(activity) {
  const item = activity?.item;
  const options = item?.system?.masteryOptions;
  if (!options?.length) return null;
  const last = item.getFlag?.("dnd5e", `last.${activity.id}.mastery`);
  if (last && options.some(o => o.value === last)) return last;
  return options[0]?.value ?? null;
}

// The reminder to show for a resolved attack, or null when there's nothing worth saying.
// `hit` is true / false / null (null = the attack resolved but the outcome never came back —
// assert neither, same rule the Hit/Miss badge follows).
// `auto` = wm5e is applying masteries on the executor, so the card reports what HAPPENED rather
// than handing the player homework.
export function masteryReminder(key, { hit, auto = false } = {}) {
  const m = MASTERIES[key];
  if (!m) return null;
  if (m.on === "hit" && hit !== true) return null;
  if (m.on === "miss" && hit !== false) return null;
  // Cleave is the one mastery automation takes AWAY from the player: wm5e opens the second-target
  // prompt on the executor, so telling the phone to "attack the second creature" would have them
  // firing a swing the DM is already resolving.
  const foot = m.kind === "attack"
    ? (key === "cleave" && auto ? "The DM picks the second target." : m.foot)
    : (auto ? "Applied for you." : "Ask the DM to apply it.");
  return { key, label: masteryLabel(key), line: m.line, foot, kind: m.kind };
}
