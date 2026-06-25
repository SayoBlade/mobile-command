// Canonical settings preset — the machine-readable form of DESIGN.md §D4.
// Every value here was verified against the live test world / installed module
// source on 2026-06-12. When DESIGN.md and this file disagree, DESIGN.md wins:
// update this file from it, never the other way around.

export const MODULE_ID = "mobile-command";

// Paths inside the midi-qol "ConfigSettings" world-setting object.
// NOTE: optionalRules.* mechanics apply even when optionalRulesEnabled is false
// (midi's checkMechanic() ignores that flag) — they must be policed individually.
export const MIDI_CONFIG_PRESET = {
  "autoRollAttack": false,
  "gmAutoAttack": false,
  "autoRollDamage": "none",
  "gmAutoDamage": "none",
  "autoCheckHit": "all",
  "autoApplyDamage": "yesCard",
  // Auto-apply a spell/item's ActiveEffects (buffs, conditions) to its targets so a phone
  // player's cast actually LANDS without the DM applying it by hand — core to self-serve
  // play (DM 2026-06-25). "applyRemove" = apply on use, auto-remove on expiry (midi's own
  // automatic-config value). CE-backed spells may also need autoCEEffects if the table
  // relies on Convenient Effects for the actual effect document.
  "autoItemEffects": "applyRemove",
  // Resolve target saves BEFORE the caster rolls damage (SavesFirstWorkflow): each player
  // handles their part in order — targets save on their phones, then the caster rolls —
  // instead of damage landing then being retroactively halved (DM 2026-06-25).
  "savesBeforeDamage": true,
  "autoCheckSaves": "whisper",
  // "letme" is dead in midi 14 — it silently auto-rolls on the player's client.
  // "chat" = whispered request; the player rolls from their own sheet/UI and
  // midi intercepts the matching save roll (Spike 3, Test B).
  "playerRollSaves": "chat",
  // AoE auto-targeting on template placement. Was "none" (no-canvas phones can't
  // place templates, so it seemed irrelevant) — but the AoE-push flow (§11) has
  // the DM place the template on the executor, and with "none" midi selects no
  // tokens under it → the workflow stalls with nothing to resolve. A targeting
  // value is safe: the refreshMeasuredTemplate auto-target only fires for the
  // placing user (midi-qol.js:13653), and phones never create templates, so this
  // affects ONLY DM-placed templates. wallsBlock* respects walls (the executor
  // has a real canvas) and ignores already-defeated tokens.
  "autoTarget": "wallsBlockIgnoreDefeated",
  // Auto-delete a spell's measured template once the workflow finishes, but ONLY
  // for instantaneous-duration spells (midi checks activity.duration.units ===
  // "inst", midi-qol.js:26846). For the AoE-push flow the template only appears
  // on the TV after the DM commits the placement — by then the spell's own
  // effect/damage is the visual, so the template is redundant and otherwise
  // lingers until manually deleted (DM-reported 2026-06-16). Persistent-area
  // spells (Wall of Fire, Spike Growth — non-"inst") keep their template, as they
  // should. midi waits ~5s before deleting so any cast animation plays first.
  "autoRemoveInstantaneousTemplate": true,
  "rangeTarget": "none",
  // The actual attack-blocking range check (midi UI: Mechanics tab). Module
  // default "longFail" blocks beyond long range. Warnings-not-walls => none.
  "optionalRules.checkRange": "none",
  // Wall/total-cover attack block ("target is blocked by a wall"). Runs for
  // melee too despite the "ranged" UI label. Required none for no-canvas play.
  "optionalRules.wallsBlockRange": "none",
  "doReactions": "all",
  "gmDoReactions": "all",
  // "displayOnly" makes midi RECORD bonus/reaction usage (flags.midi-qol.actions)
  // so the phone can show the ACT/BA/RE availability indicator — WITHOUT blocking
  // re-use (warnings-not-walls, §11). "all"/"none" would enforce/disable; the
  // record-without-enforce path is gated on "all"|"displayOnly" (midi-qol.js:18665,18697).
  "enforceReactions": "displayOnly",
  "enforceBonusActions": "displayOnly",
  // Charge the reaction when an off-turn attack (opportunity attack) is made, so
  // the RE indicator reflects it. midi does NOT auto-prompt OAs on movement —
  // this only records the reaction once a manual OA is rolled (midi-qol.js:8382).
  "recordAOO": "all",
  "undoWorkflow": true,
  // midi 14 dropdown: "none"|"spell"|"item"|"both"; non-strings migrate to
  // "none" on load (midi-qol.js:32313) — booleans here would flap forever.
  "consumeResource": "none",
  "gmConsumeResource": "none",
  // Ammunition confirmation: an ammo-consuming weapon (revolver/bow) pops midi's
  // "use this ammunition?" dialog when the ammo is auto-selected — confirmAmmunition
  // getter (midi-qol.js:9764-65) → forces dialog.configure=true (:9489-91), defeating
  // our {configure:false}. It renders on the headless executor (the GM client) where
  // the player can't answer, so the attack TIMES OUT (DM-reported revolver/bullets,
  // 2026-06-21). The executor IS the GM, so gmConfirmAmmunition is the live flag; set
  // the player one too. midi defaults both false, but a world can flip them — the
  // preset must guarantee off. (The "ammo required but none on the sheet" case still
  // warns regardless; that's a weapon-data fix, not this dialog.)
  "confirmAmmunition": false,
  "gmConfirmAmmunition": false
};

// playerSaveTimeout is preset-policed too, but its expected value is a module
// setting (Q4: the right number is a table-feel question, tuned in play).
export const SAVE_TIMEOUT_SETTING = "expectedSaveTimeout";

// Plain world settings outside ConfigSettings.
export function standaloneSettingsPreset() {
  return [
    { namespace: "midi-qol", key: "EnableWorkflow", value: true },
    // dnd5e 5.3 default "full" makes enemy tokens hard-block PC movement.
    // "noBlocking" keeps difficult-terrain automation, drops the blocking.
    { namespace: "dnd5e", key: "movementAutomation", value: "noBlocking" },
    { namespace: "dnd5e", key: "encumbrance", value: "none" }
  ];
}

export function midiPresetEntries() {
  const expectedTimeout = game.settings.get(MODULE_ID, SAVE_TIMEOUT_SETTING);
  return { ...MIDI_CONFIG_PRESET, "playerSaveTimeout": expectedTimeout };
}
