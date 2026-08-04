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

// Downtime activity catalog (§17.5). Player-facing labels only — NO DCs/costs are ever shown
// to players (the DM sees the official suggestions privately). "custom" lets a player describe
// anything. Gamble is deliberately excluded (kills RP). Days are the unit; a "workweek" ≈ 5 days.
export const DOWNTIME_ACTIVITIES = [
  { key: "work", label: "Work / Practice a profession", icon: "fa-hammer" },
  { key: "research", label: "Research a topic", icon: "fa-book-open-reader" },
  { key: "craft", label: "Craft an item", icon: "fa-screwdriver-wrench" },
  { key: "scribe", label: "Scribe / learn a spell", icon: "fa-scroll" },
  { key: "recuperate", label: "Recuperate", icon: "fa-bed-pulse" },
  { key: "train", label: "Train / Learn", icon: "fa-dumbbell" },
  { key: "teach", label: "Teach someone", icon: "fa-chalkboard-user" },
  { key: "perform", label: "Perform / Create art", icon: "fa-masks-theater" },
  { key: "custom", label: "Custom…", icon: "fa-feather" }
];
export const DOWNTIME_LABEL = Object.fromEntries(DOWNTIME_ACTIVITIES.map(a => [a.key, a.label]));

// ── Story questions (§38.4 slice 2) ─────────────────────────────────────────
// The DM's "buy a few seconds" deck: one tap pushes a question to every phone; answers land in
// each PC's private chapter. Curated to stay STORY questions (memories, people, wants, beliefs
// — never therapy). The DM's own additions ride a world setting and render after these.
export const STORY_QUESTIONS = [
  { cat: "Memories", q: "What childhood memory still shapes you?" },
  { cat: "Memories", q: "What smell takes you straight back home?" },
  { cat: "Memories", q: "What's the first thing you remember being proud of?" },
  { cat: "Memories", q: "What promise did you make that you haven't kept?" },
  { cat: "People", q: "Who taught you the most important thing you know?" },
  { cat: "People", q: "Who's waiting for you back home — and do they know where you are?" },
  { cat: "People", q: "Who do you owe, and what do you owe them?" },
  { cat: "People", q: "Whose opinion of you actually matters?" },
  { cat: "Goals", q: "What do you want most, long-term?" },
  { cat: "Goals", q: "What would you do first if you never had to fight again?" },
  { cat: "Goals", q: "What would make you walk away from the party tomorrow?" },
  { cat: "Goals", q: "What do you want written on your grave?" },
  { cat: "Beliefs", q: "What line will you not cross, no matter the pay?" },
  { cat: "Beliefs", q: "What's a rule you follow that no one else knows about?" },
  { cat: "Beliefs", q: "What do you believe that the others would laugh at?" },
  { cat: "Beliefs", q: "When is stealing the right thing to do?" },
  { cat: "The party", q: "What do you admire about the person who sat down next to you tonight?" },
  { cat: "The party", q: "Which party member would you trust with your secret — and which never?" },
  { cat: "The party", q: "What has a party member done that you still think about?" },
  { cat: "The party", q: "What lie have you told the party that they absolutely believe?" },
  { cat: "The world", q: "What place would you go back to if you could?" },
  { cat: "The world", q: "What's the strangest thing you've ever seen — before all this?" },
  { cat: "The world", q: "What story do people tell about your home town?" },
  { cat: "The world", q: "What's something ordinary here that would amaze the folk back home?" }
];

// ── The table map (§38.4b) ──────────────────────────────────────────────────
// Six seats around a TV lying FLAT on the table: one at each short end, two along each long
// side. `rot` is how far to rotate that seat's cards/HUD so they read upright to the person
// sitting there — the séance board's word rotation should eventually read this too.
export const TABLE_SEATS = [
  { id: "n1", side: "long", label: "Top left", rot: 180 },
  { id: "n2", side: "long", label: "Top right", rot: 180 },
  { id: "w", side: "short", label: "Left end", rot: 90 },
  { id: "e", side: "short", label: "Right end", rot: 270 },
  { id: "s1", side: "long", label: "Bottom left", rot: 0 },
  { id: "s2", side: "long", label: "Bottom right", rot: 0 }
];

// ── Creation beats (§38.4a — the Story wizard's questions) ──────────────────
// One question per wizard step, templated on the actual pick («name» = the chosen item).
// The abilities beat keys off the HIGHEST score. Closers run at the "Your story" step.
export const CREATION_BEATS = {
  species: "Where among the «name» did you grow up — and why did you leave?",
  background: "How did you end up a «name»?",
  class: "Who or what made you a «name»?",
  abilities: {
    str: "Where did that strength come from?",
    dex: "How did you get so quick?",
    con: "What made you so hard to kill?",
    int: "Where did you learn so much?",
    wis: "What taught you to notice what others miss?",
    cha: "Why do people listen to you?"
  },
  gear: "One thing you carry you'd never sell — what is it, and why?",
  closers: ["What do you want most, long-term?", "Who's waiting for you back home?"]
};

// ── Day/night curve (DM decision 2026-08-02) ────────────────────────────────
// "I'd rather have a small curve and keep global lighting in all scenes, I'll mark interior
// regions myself." So: the clock drives scene darkness EVERYWHERE — not just on maps whose
// global illumination happens to be off — and interiors are the DM's job, marked with Foundry's
// own `adjustDarknessLevel` region behaviour (a cave mouth is outdoors, the cave is not). The
// party arriving at a moor at 02:00 finds it dark; arriving at 10:00 finds it lit.
// Deliberately GENTLE: a cosine peaking at 0.7, never pitch black, so a fully-visible overworld
// map stays readable at night. Noon 0 · dawn/dusk (6h/18h) 0.35 · midnight 0.7.
// FOUR phases, not a rolling cosine (DM 2026-08-03: "gradual dark to light, full light, gradual
// light to dark and full dark"). The cosine was never flat — every hour was a slightly different
// shade, so "daytime" had no plateau and noon was the only true daylight. Now:
//
//   full dark ──/ dawn ramp /── full light ──\ dusk ramp \── full dark
//
// The ramps are CENTRED on sunrise and sunset, so sunrise is the midpoint of getting light (the
// half before it is twilight, the half after is the sun climbing) rather than its start.
export const NIGHT_DARKNESS_PEAK = 0.7;   // "full dark" — deliberately not 1.0, see above
export const DAWN_DUSK_RAMP_HOURS = 1;    // how long the gradual bit lasts, total
export const DEFAULT_SUNRISE_HOUR = 6;
export const DEFAULT_SUNSET_HOUR = 18;
/** Darkness at a given hour. `sunrise`/`sunset` come from the calendar when there is one
 *  (gametime.js); without them it's a plain 06:00/18:00 day. */
export function darknessForHour(hour, opts = {}) {
  const sunrise = Number.isFinite(opts.sunrise) ? opts.sunrise : DEFAULT_SUNRISE_HOUR;
  const sunset = Number.isFinite(opts.sunset) ? opts.sunset : DEFAULT_SUNSET_HOUR;
  const ramp = Math.max(0.01, Number.isFinite(opts.ramp) ? opts.ramp : DAWN_DUSK_RAMP_HOURS);
  const h = (((Number(hour) || 0) % 24) + 24) % 24;
  const half = ramp / 2;
  const N = NIGHT_DARKNESS_PEAK;
  if (h >= sunrise - half && h <= sunrise + half) return N * (1 - (h - (sunrise - half)) / ramp); // dark → light
  if (h >= sunset - half && h <= sunset + half) return N * ((h - (sunset - half)) / ramp);        // light → dark
  if (h > sunrise + half && h < sunset - half) return 0;                                          // full light
  return N;                                                                                       // full dark
}
// Global light is the SUN under this model, so it must yield before the curve tops out — a scene
// whose global-light threshold sits at or above the night peak never actually gets dark. 0.35 is
// exactly the curve's dawn/dusk value, so the sun is up from 06:00 to 18:00 and down outside it:
// the threshold and the curve describe the same day rather than two overlapping ones.
export const GLOBAL_LIGHT_NIGHT_THRESHOLD = 0.35;
