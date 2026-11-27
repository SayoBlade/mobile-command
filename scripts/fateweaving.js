import { MODULE_ID } from "./preset.js";
import { aeKey } from "./dnd5e-compat.js"; // 6.0 renamed the roll-bonus keys the blessing targets

// §34 Fateweaving — the book's per-PC story-arc system as a TRACKER, not automation. Thread
// NAMES are the book's (titles, like the tarot card names); every goal and board line below is our
// own original one-line summary — the book's thread prose stays in the book.
// 2026-11-27 (DM: "we kind of forgot about threads of fate", then GO on "the corrected Thread
// descriptions"): the goal lines re-read against ch9 and rewritten where they missed the book's goal
// (Kindred, Deliverance and Immortality had another story; Apocalypse, Ascendancy, Duality, Evolution,
// Malediction, Pilgrimage, Rapture, Slaughter drifted). `board` is new: the Thread's own reason to be at
// the ghost train when it comes (the book's Call to Adventure, in a line), shown on the player's card.
export const FATE_THREADS = {
  apocalypse: { name: "Apocalypse", goal: "Your past is gone, but a half-familiar song shows you the end of a world. Learn who you were, and stop it.",
    board: "The song played, and the vision ended with a ghost train coming out of the fog. Here it is." },
  ascendancy: { name: "Ascendancy", goal: "A fool's ghost only you can hear rhymes of your rebirth as something greater than mortal. Decode it, and rise.",
    board: "The fool's strangest rhyme named this gloomy night and this place." },
  deliverance: { name: "Deliverance", goal: "Your family heirloom was stolen on this very train and broken in three. Find the pieces and make it whole.",
    board: "Your broken compass woke tonight, its needle pointing down the misty rails." },
  duality: { name: "Duality", goal: "You cut the sin out of your soul, and it walked off wearing your face. Stop your double and mend yourself.",
    board: "Your reflection taunted you about catching a train, and its clues led here." },
  evolution: { name: "Evolution", goal: "Experiments made you more than you were, but not enough. Finish what your idol's research began.",
    board: "Your idol's ruined notes pointed to this place." },
  immortality: { name: "Immortality", goal: "A magical sickness no healer can cure. Master the alchemy of life itself and brew the remedy, and maybe more.",
    board: "The strange thing in the flask spoke of this time and place." },
  kindred: { name: "Kindred", goal: "A relative haunted by nightmares of a crooked-grinned man has vanished. Find them and save them.",
    board: "The dream journal they left behind showed exactly where to wait." },
  liberation: { name: "Liberation", goal: "You sold your soul, and the deal has gone bad. Outwit its owner and take your fate back.",
    board: "Your shadow won you a game of chance, then led you here." },
  malediction: { name: "Malediction", goal: "A curse hangs over your whole bloodline. Find the forbidden lore that breaks it.",
    board: "The page you stole from a secret library led you here." },
  pilgrimage: { name: "Pilgrimage", goal: "You feel the torment of the dead. Raise sacred markers where the restless gather, and lay them to rest.",
    board: "Your augury, cast amid a flood of suffering souls, named this time and place." },
  rapture: { name: "Rapture", goal: "Your god brought you back from death to win them a foothold in a godless land. Preach, gather the faithful, make way for a miracle.",
    board: "Your god's own voice sent you here." },
  rejuvenation: { name: "Rejuvenation", goal: "A land beyond the seasons is rotting. Find the corruption, learn the cure, and bring the regrowth.",
    board: "The oldest trees begged for help and showed you the way here." },
  slaughter: { name: "Slaughter", goal: "Your spirit-beast showed you deadlier hunting grounds. Hunt the worst of the night and become its apex predator.",
    board: "After your greatest hunt you simply knew: here, tonight." }
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
        { key: aeKey("system.bonuses.abilities.save"), type: "add", value: "+1d4" },
        { key: aeKey("system.bonuses.mwak.attack"), type: "add", value: "+1d4" },
        { key: aeKey("system.bonuses.rwak.attack"), type: "add", value: "+1d4" },
        { key: aeKey("system.bonuses.msak.attack"), type: "add", value: "+1d4" },
        { key: aeKey("system.bonuses.rsak.attack"), type: "add", value: "+1d4" }
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
