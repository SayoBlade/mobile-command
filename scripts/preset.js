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
  "autoCheckSaves": "whisper",
  // "letme" is dead in midi 14 — it silently auto-rolls on the player's client.
  // "chat" = whispered request; the player rolls from their own sheet/UI and
  // midi intercepts the matching save roll (Spike 3, Test B).
  "playerRollSaves": "chat",
  "autoTarget": "none",
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
  "gmConsumeResource": "none"
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
