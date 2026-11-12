// ── SOUNDS WITH THEIR LEADING SILENCE CUT (DM 2026-11-12: "Sounds seem to be delayed overall, also with the door") ──
// Measured in Chrome's own decoder the same day: fetch and decode take 2-20 ms on the table PC, but most door and creak
// files open with 0.1-0.75 s of near-silence (the plain wooden door close 0.75 s, the heavy door close 0.42 s), heard as
// lag on every play. These are COPIES with the silence cut to a 30 ms lead-in and a 10 ms fade-in, 16-bit WAV, in his
// Data folder under assets/Personal/SFX/_trimmed-deck-command/ (never in a repo: his purchased sounds). His originals
// are untouched; delete the folder and empty this map to go back. Only files that opened with 90 ms or more are here.
export const TRIMMED = Object.freeze({
  "assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 2.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 2.wav",
  "assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 9.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 9.wav",
  "assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 12.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 12.wav",
  "assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 17.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 17.wav",
  "assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 18.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 18.wav",
  "assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 27.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 27.wav",
  "assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 10.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 10.wav",
  "assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 28.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 28.wav",
  "assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 21.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 21.wav",
  "assets/Personal/Music/Medieval Fantasy 2 Audio Bundle/MP3/SFX (Mp3 320)/Misc/DoorMediumClose.mp3":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/Music/Medieval Fantasy 2 Audio Bundle/MP3/SFX (Mp3 320)/Misc/DoorMediumClose.wav",
  "modules/psfx/library/doors/clean/wooden/01/wooden-close-clean-01.ogg":
    "assets/Personal/SFX/_trimmed-deck-command/modules/psfx/library/doors/clean/wooden/01/wooden-close-clean-01.wav",
  "modules/psfx/library/doors/clean/wooden/01/wooden-lock-clean-01.ogg":
    "assets/Personal/SFX/_trimmed-deck-command/modules/psfx/library/doors/clean/wooden/01/wooden-lock-clean-01.wav",
  "modules/psfx/library/doors/clean/wooden/01/wooden-unlock-clean-01.ogg":
    "assets/Personal/SFX/_trimmed-deck-command/modules/psfx/library/doors/clean/wooden/01/wooden-unlock-clean-01.wav",
  "assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 29.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 29.wav",
  "modules/psfx/library/doors/clean/wooden/01/wooden-test-clean-01.ogg":
    "assets/Personal/SFX/_trimmed-deck-command/modules/psfx/library/doors/clean/wooden/01/wooden-test-clean-01.wav",
  "assets/Personal/Music/Medieval Fantasy 2 Audio Bundle/MP3/SFX (Mp3 320)/Misc/DoorHugeOpen.mp3":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/Music/Medieval Fantasy 2 Audio Bundle/MP3/SFX (Mp3 320)/Misc/DoorHugeOpen.wav",
  "assets/Personal/Music/Medieval Fantasy 2 Audio Bundle/MP3/SFX (Mp3 320)/Misc/DoorHugeClose.mp3":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/Music/Medieval Fantasy 2 Audio Bundle/MP3/SFX (Mp3 320)/Misc/DoorHugeClose.wav",
  "assets/Personal/Music/Medieval Fantasy 2 Audio Bundle/MP3/SFX (Mp3 320)/Inventory/UnequipClothes.mp3":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/Music/Medieval Fantasy 2 Audio Bundle/MP3/SFX (Mp3 320)/Inventory/UnequipClothes.wav",
  "modules/ember/assets/audio/environment/fire-and-heat/one-shots/heat-sizzle-1.ogg":
    "assets/Personal/SFX/_trimmed-deck-command/modules/ember/assets/audio/environment/fire-and-heat/one-shots/heat-sizzle-1.wav",
  "assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 19.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD 19.wav",
  "assets/Personal/Music/Horror Audio Bundle/MP3/FX/Voices/Baby Crying.mp3":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/Music/Horror Audio Bundle/MP3/FX/Voices/Baby Crying.wav",
  "assets/Personal/SFX/Dark Fantasy Studio- Dissonant vocals/Dark Fantasy Studio- Dissonant vocals 34.wav":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/SFX/Dark Fantasy Studio- Dissonant vocals/Dark Fantasy Studio- Dissonant vocals 34.wav",
  "assets/Personal/Music/Horror Audio Bundle/MP3/FX/Misc/Swinging.mp3":
    "assets/Personal/SFX/_trimmed-deck-command/assets/Personal/Music/Horror Audio Bundle/MP3/FX/Misc/Swinging.wav",
});
/** The trimmed copy of a take when there is one, else the take. */
export const trimmed = (p) => TRIMMED[p] ?? p;
