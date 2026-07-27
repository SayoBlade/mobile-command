import { MODULE_ID } from "./preset.js";

// §34 Fateweaving — the book's per-PC story-arc system as a TRACKER, not automation. Thread
// NAMES are the book's (titles, like the tarot card names); every goal line below is our own
// original one-line summary — the book's thread prose stays in the book.
export const FATE_THREADS = {
  apocalypse: { name: "Apocalypse", goal: "You have seen how it ends. Stop it — or finish it." },
  ascendancy: { name: "Ascendancy", goal: "Power was promised to you. Collect." },
  deliverance: { name: "Deliverance", goal: "Someone you lost is here, somewhere. Bring them home." },
  duality: { name: "Duality", goal: "Something wears your face. Only one of you leaves." },
  evolution: { name: "Evolution", goal: "You are becoming something new. Choose what." },
  immortality: { name: "Immortality", goal: "Death touched you once. Never again." },
  kindred: { name: "Kindred", goal: "Find where you truly belong." },
  liberation: { name: "Liberation", goal: "A debt binds you. Break it." },
  malediction: { name: "Malediction", goal: "Your curse has an author. Find them." },
  pilgrimage: { name: "Pilgrimage", goal: "Carry your burden to the holy end of the road." },
  rapture: { name: "Rapture", goal: "The voice that calls you is real. Answer it." },
  rejuvenation: { name: "Rejuvenation", goal: "Heal what the rot has taken." },
  slaughter: { name: "Slaughter", goal: "Something must die by your hand. It knows you're coming." }
};

// The six touchpoints, in order (index 1..6), with each step's FIXED book reward.
export const FATE_STEPS = [
  { name: "Incitement", reward: "Heroic Inspiration" },
  { name: "Connection", reward: "an ally + Bless for a day" },
  { name: "Discovery", reward: "a Twist of Fate" },
  { name: "Confrontation", reward: "+2 to an ability score (max 24)" },
  { name: "Climax", reward: "a feat of their choice" },
  { name: "Catharsis", reward: "the story's resolution" }
];

// Apply the mechanical part of reaching touchpoint `step` (1-based). What the module can do
// safely, it does (inspiration, the Bless-style effect, the twist token); sheet-level
// advancements (+2 ability, a feat) become GM-whispered reminders — we never write base
// actor data (§31/§33 house rule).
export async function applyFateReward(actor, step) {
  const gmWhisper = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id);
  const note = (html) => ChatMessage.create({
    speaker: { alias: "Fateweaving" }, content: html, whisper: gmWhisper()
  });
  const name = foundry.utils.escapeHTML(actor.name);
  if (step === 1) {
    await actor.update({ "system.attributes.inspiration": true });
  } else if (step === 2) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Connection — a friend's blessing",
      img: "icons/svg/angel.svg",
      duration: { seconds: 86400 },
      changes: [
        { key: "system.bonuses.abilities.save", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "+1d4" },
        { key: "system.bonuses.mwak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "+1d4" },
        { key: "system.bonuses.rwak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "+1d4" },
        { key: "system.bonuses.msak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "+1d4" },
        { key: "system.bonuses.rsak.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "+1d4" }
      ],
      flags: { [MODULE_ID]: { fateweaving: 2 } }
    }]);
  } else if (step === 3) {
    await actor.setFlag(MODULE_ID, "twists", Number(actor.getFlag(MODULE_ID, "twists") ?? 0) + 1);
  } else if (step === 4) {
    await note(`<p><b>${name}</b> reached <b>Confrontation</b> — grant <b>+2 to one ability score</b> (max 24) on the sheet.</p>`);
  } else if (step === 5) {
    await note(`<p><b>${name}</b> reached <b>Climax</b> — grant <b>a feat of their choice</b> on the sheet.</p>`);
  } else if (step === 6) {
    await note(`<p><b>${name}</b> reached <b>Catharsis</b> — their thread resolves. Give the ending its scene.</p>`);
  }
}
