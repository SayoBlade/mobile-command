/**
 * ── THE SETS A CUE PLAYS FROM (§53; catalogue 1–3, 7, 20–24, 33, 39) ────────────────────────────
 *
 * Real recordings from the DM's own library, never synthesized — every path is under Foundry's Data folder
 * and tools/test-cues.mjs checks each one is on disk. A SET is a handful of takes for one thing (a creaking
 * board, a stair tread); the cue picks one at random and never the one that just played. The DM's rule
 * (2026-09-18): *"Simple single sounds only, nothing layered."*
 *
 * Which takes, and why (audio-catalogue/catalogue/world-foley.md, the Dark Fantasy Studio "Craking wood"
 * pack): 21 and 29 sound like doors and are kept for doors; 24 is sharp cracks (timber about to snap); the
 * ratcheting ones (4, 5, 6, 19, 22, 25) read as machinery, not a step. What is left — 2, 9, 12, 17, 18 and
 * the groans 27/28 — is a board under a foot. The sound plan (crooked-moon.md) named 2, 9, 17 and 27.
 */

const WOOD = (n) => `assets/Personal/SFX/crackingwood_darkfantasystudio/NOISE ALCHEMY- CRAKING WOOD ${n}.wav`;
const HORROR = (p) => `assets/Personal/Music/Horror Audio Bundle/MP3/FX/${p}`;
const MF2 = (p) => `assets/Personal/Music/Medieval Fantasy 2 Audio Bundle/MP3/SFX (Mp3 320)/Misc/${p}`;
const PSFX_DOOR = (p) => `modules/psfx/library/doors/clean/wooden/01/wooden-${p}-clean-01.ogg`;

/** The sets the region menu offers. `label` is what the DM reads; `takes` are the files. */
export const CUE_SETS = Object.freeze({
  creak: {
    label: "Crooked House creak (a board under a foot)",
    takes: [WOOD(2), WOOD(9), WOOD(12), WOOD(17), WOOD(18), WOOD(27)],
  },
  stair: {
    label: "Stair tread",
    takes: [HORROR("Misc/Wood Creaking.mp3"), WOOD(7), WOOD(10)],
  },
  groan: {
    label: "Loud groan (the running step — catalogue 21)",
    takes: [WOOD(27), WOOD(28)],
  },
  teeth: {
    // GAP in the library (catalogue 24: "human teeth crunching and skittering underfoot"); the plan's closest.
    label: "Teeth underfoot (stand-in: small shards)",
    takes: ["assets/Personal/SFX/Dark Fantasy Studio- Broken glass/Dark Fantasy Studio- Broken glass 4.wav"],
  },
  wall: {
    // The weasels in the walls (catalogue 33). NOT the insect swarm (DM 2026-09-19); the library has no weasel
    // mob, so a plain scratching is the stand-in until he finds a skittering file.
    label: "Scratching in the walls (stand-in for the weasels)",
    takes: [HORROR("Misc/Scratching.mp3")],
  },
});

/**
 * Door sound sets for CONFIG.Wall.doorSounds (catalogue 1, 2, 3, 7). Core picks one take at random from an
 * array — *"the cheapest realism in the whole list"*. `test` is the sound of trying a locked door.
 */
export const CM_DOOR_SOUNDS = Object.freeze({
  // 1 — every house door, a different creak each time
  mcCrookedHouse: {
    label: "Crooked House door (creaks differently each time)",
    open: [WOOD(21), WOOD(2), WOOD(9), WOOD(17), WOOD(18)],
    close: [MF2("DoorMediumClose.mp3"), MF2("DoorSmallClose.mp3"), PSFX_DOOR("close")],
    lock: [PSFX_DOOR("lock")],
    unlock: [PSFX_DOOR("unlock")],
    test: [WOOD(29), PSFX_DOOR("test")],
  },
  // 2 — the front door is heavier: a slower groan
  mcCrookedFront: {
    label: "Crooked House front door (heavier, slower)",
    open: [WOOD(27), WOOD(28), MF2("DoorHugeOpen.mp3")],
    close: [MF2("DoorHugeClose.mp3")],
    lock: [PSFX_DOOR("lock")],
    unlock: [PSFX_DOOR("unlock")],
    test: [WOOD(29)],
  },
  // 3 — the attic's little door sounds wrong on purpose: dry, high, splintering
  mcCrookedWrong: {
    label: "Crooked House attic door (dry, splintering)",
    open: [WOOD(24), WOOD(8), WOOD(5)],
    close: [MF2("DoorSmallClose.mp3"), WOOD(24)],
    lock: [PSFX_DOOR("lock")],
    unlock: [PSFX_DOOR("unlock")],
    test: [WOOD(24), WOOD(29)],
  },
  // 7 — a door that should not be opened: trying the handle is wet and organic (the bathroom, H11 —
  // the kitchen oven is painted art, not a door wall, so it cannot carry a set)
  mcCrookedWet: {
    label: "Crooked House bathroom door (wet when tried)",
    open: [WOOD(21), WOOD(2), WOOD(9)],
    close: [MF2("DoorMediumClose.mp3"), PSFX_DOOR("close")],
    lock: ["assets/Personal/SFX/smashed_darkfantasystudio/Dark Fantasy Studio- Smashed 34.wav"],
    unlock: [PSFX_DOOR("unlock")],
    test: ["assets/Personal/SFX/smashed_darkfantasystudio/Dark Fantasy Studio- Smashed 34.wav", WOOD(29)],
  },
});

/** Every file the sets and door sets name, once each — for the on-disk check. */
export function allCuePaths() {
  const out = new Set();
  for (const s of Object.values(CUE_SETS)) for (const t of s.takes) out.add(t);
  for (const d of Object.values(CM_DOOR_SOUNDS)) for (const k of ["open", "close", "lock", "unlock", "test"]) for (const t of d[k]) out.add(t);
  return [...out];
}
