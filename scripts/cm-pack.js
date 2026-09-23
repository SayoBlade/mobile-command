import { MODULE_ID } from "./preset.js";
import { registerContentPack, contentPack } from "./packs.js";
import { crookedPanelTab, cmToolsOn } from "./cm-panel.js";
import { crookedShellTab } from "./cm-shell.js";
import { fateChapter } from "./cm-chapter.js";
import { seanceSync, seancePhrase } from "./seance.js"; // §30 séance board (TV overlay)
import { cmStationSync, cmTicketFx, playTrainWhistle, playTrainApproach, stopTrainApproach, playTrainStop, playTrainFiddle, stopTrainFiddle } from "./cm-boarding.js"; // §36 the station, the ticket, the arrival cues
import { initCurseSweep } from "./cm-curses.js"; // §33: one GM client lifts expired curses
import { registerTwists } from "./twists.js"; // §31 v2: an armed twist forces the creature's next d20
import { registerDruskenvald, isDruskScene, druskDarkness } from "./druskenvald.js"; // §43 eternal night, told in six named hours
import { registerTrainFollow, wireTrainDoors, setTrainMist, trainMistOn } from "./cm-train.js"; // §37 the Ghostlight ride
import { CM_ENTRANCES } from "./cm-entrances.js"; // §40.6 the book's NPC entrances
import "./actions-cm.js"; // §52 area H — the Crooked Moon tab's actions for the deck (defineActions at load)

/**
 * ── THE CROOKED MOON, AS A CONTENT PACK (§54) ─────────────────────────────────────────────────
 *
 * Everything the campaign adds to Mobile Command, declared in one object and handed to the pack
 * registry. Phase one (2026-09-22): MC still ships this copy; the companion module
 * `mobile-command-crooked-moon` registers the SAME id and, loading after MC, replaces it — or, if
 * it happens to load first, the guard at the bottom leaves its registration alone. Disable the
 * companion and this copy is back. Phase two deletes this file and the cm-*.js it imports.
 *
 * Nothing in here is new behaviour: the settings, the FX entries, the hooks and the two tabs were
 * lifted verbatim from settings.js, effects.js, main.js, dm-panel.js and shell.js.
 */

// Plain words on a staircase (DM 2026-09-20: "change the text to something that sounds less sci-fi").
// Core's teleport confirmation is written for teleporters: the buttons say "Teleport" and "Don't
// Teleport". On the Crooked House stairs that is jargon — the player is climbing a flight of stairs.
// ⚠️ THESE ARE CORE KEYS. A module that rewrites them rewrites them for every world it is installed
// in, so this is gated on the pack being on — which defaults on only when the book module is active.
function plainTeleportWording() {
  try {
    if (!cmToolsOn()) return;
    const T = game.i18n.translations?.BEHAVIOR?.TYPES?.teleportToken;
    if (!T) return;
    T.Teleport = "Go through";
    T.DoNotTeleport = "Stay here";
    T.Confirm = "Move {token} on?";
    T.ConfirmRevealed = "Move {token} to {region}?";
    T.ConfirmDisabled = "{token} cannot go through from where they are standing.";
    T.ConfirmSelectSameScene = "Where should {token} go in {scene}?";
    T.ConfirmSelectDifferentScene = "Where should {token} go?";
  } catch (e) {
    console.warn(`${MODULE_ID} | could not plain-word the teleport dialog`, e);
  }
}

const SOUND_FILE = (name) => ({
  name: `${name} (sound file)`,
  hint: "Leave empty to use the built-in synthesized cue.",
  scope: "world", config: true, type: String, filePicker: "audio", default: ""
});

export const CROOKED_MOON_PACK = {
  id: "crooked-moon",
  label: "The Crooked Moon",

  // §35 the world gate: the tab, the effects and the phone tab all ride this switch.
  active: cmToolsOn,
  gate: {
    key: "crookedMoonTools", icon: "mc-icon-cmoon",
    onLabel: "Crooked Moon tools are on", offLabel: "Turn on Crooked Moon tools",
    note: "Adds <b>The Crooked Moon</b> tab to the panel — séance board and the campaign's other table tools. Leave it off for other campaigns."
  },
  // §35.1 + §50.8: the phone's one campaign-tab slot, worn by the crone while the tools are on.
  campaign: { id: "crooked-moon", icon: "mc-icon-cmoon", label: "The Crooked Moon", tab: "crooked" },

  settings: [
    // §35 Campaign tools. Defaults ON when the Crooked Moon module itself is installed & active
    // (that table obviously wants the tools); toggle in Settings → Campaign.
    { key: "crookedMoonTools", data: { scope: "world", config: false, type: Boolean, default: !!game.modules?.get("the-crooked-moon-2014")?.active } },
    // §33 Chaotic Curses: optional RollTable UUID that replaces the built-in d100 (the book's own
    // 1d156 for DMs who own it, or a homebrew table). Empty = our original list.
    { key: "curseTable", data: { scope: "world", config: false, type: String, default: "" } },
    // §33 bargain mode (default OFF): a player may ask to reroll at the price of a curse roll.
    { key: "bargainMode", data: { scope: "world", config: false, type: Boolean, default: false } },
    // §35 / §52 the Crooked Moon tab's working state — séance sitters and escalation, the curse's
    // target/minutes/staged card, the tarot cheat, the fiddle and engine beds. Read and written only
    // through cm-live.js, so the deck presses the same state.
    { key: "cmLiveState", data: { scope: "world", config: false, type: Object, default: {} } },
    // §43 which scenes are under Druskenvald's eternal night. An EXPLICIT DM list, never a guess.
    { key: "druskenvaldSceneIds", data: { scope: "world", config: false, type: Array, default: [] } },
    // §42 the tarot deck's back: ours by default, or a file the DM picks (the book ships no back).
    { key: "tarotBackImage", data: { scope: "world", config: false, type: String, default: "" } },
    // §36.1 the Ghostlight's arrival cues: synthesized so nothing licensed is bundled; a DM may point
    // any cue at a real recording and the file wins. File pickers, not free text.
    { key: "sndTrainFiddle", data: SOUND_FILE("The Vagrant's fiddle") },
    { key: "sndTrainApproach", data: SOUND_FILE("Train approaching") },
    { key: "sndTrainWhistle", data: SOUND_FILE("Train whistle") },
    { key: "sndTrainStop", data: SOUND_FILE("Train grinding to a stop") }
  ],

  // Hooks and sweeps, once per client at MC ready. Each gates itself inside.
  hooks() {
    registerTwists();      // §31 v2: armed twists land on the next d20 (the roller forces its own die)
    registerDruskenvald(); // §43: the named hour + sky on the shared screen
    initCurseSweep();      // §33: no-op unless this client is the activeGM at tick time
    registerTrainFollow(); // §37: the whole party crosses a train-car door → that car goes active
    plainTeleportWording();
  },

  // §26 the Effects table's Crooked Moon entries. None renders as a grid chip — the panel tab's
  // drawers own their UI; they are here so fxActive, the one-shot socket and the remount pass know them.
  fx: {
    defs: {
      // §30 séance board: the toggle is a normal fxActive state (survives TV reloads); the phrase is a one-shot with { text }.
      seance: { label: "Séance", icon: "fa-circle-dot", state: true, hint: "The spirit board on the table display" },
      seancePhrase: { label: "Spell it out", icon: "fa-hand-point-up", oneShot: true, hint: "The planchette spells the phrase" },
      // §36 All aboard: station + intro are display states; the ticket is a per-player state; the whistle a one-shot.
      cmStation: { label: "The Station", icon: "fa-train", state: true, hint: "The Ghostlight Express on the table display" },
      cmIntro: { label: "Introduce", icon: "fa-masks-theater", state: true, hint: "Put one character's card on the display" },
      cmTicket: { label: "Ticket", icon: "fa-ticket", player: "state", hint: "A life-size ticket fills their phone until they board" },
      cmWhistle: { label: "Whistle", icon: "fa-bullhorn", oneShot: true, hint: "Two blasts of the Ghostlight's whistle" },
      // §36.1 the arrival. cmTrain is a STATE ({ in, rot, actorId }) so a reloading TV puts the train back where it was.
      cmTrain: { label: "Bring in the train", icon: "fa-train", state: true, hint: "The Ghostlight emerges from the fog, facing whoever it came for" },
      cmTrainApproach: { label: "Approach", icon: "fa-volume-low", oneShot: true, hint: "A distant engine, fading in under the narration" },
      cmTrainStop: { label: "Grinding stop", icon: "fa-hand", oneShot: true, hint: "Brakes: it squeals, sighs, and halts" },
      cmFiddle: { label: "Fiddle", icon: "fa-music", oneShot: true, hint: "A lone fiddle through the fog — plays until stopped" }
    },
    // §36 the Ghostlight ticket — full-screen on the holder's phone; stop() is the boarding punch.
    phone: { cmTicket: cmTicketFx },
    oneShot(id, payload = {}) {
      if (id === "seancePhrase") { seancePhrase(payload.text); return true; } // no-op on clients without the board
      if (id === "cmWhistle") { playTrainWhistle(); return true; }           // canvas clients only, gates itself
      if (id === "cmTrainApproach") { if (payload.on === false) stopTrainApproach(); else playTrainApproach(); return true; }
      if (id === "cmTrainStop") { playTrainStop(); return true; }
      if (id === "cmFiddle") { if (payload.on === false) stopTrainFiddle(); else playTrainFiddle(); return true; } // §36.1.8 — the stop cue never ducks this one
      return false;
    },
    sync(active) {
      seanceSync(!!active.seance); // §30: mounts on the display + the DM's client (seance.js gates itself)
      cmStationSync(!!active.cmStation, active.cmIntro?.actorId ?? null, active.cmTrain ?? null); // §36
    }
  },

  // §43: a scene the DM marked as Druskenvald answers with the eternal-night curve instead of the day one.
  darkness: (scene) => (isDruskScene(scene) ? druskDarkness() : null),
  chapters: [fateChapter],   // §44 the "Fate" chapter of the Character File
  entrances: CM_ENTRANCES,   // §40.6 the book's NPC entrances
  panelTab: crookedPanelTab, // §35 the DM panel tab
  shellTab: crookedShellTab, // §35.1 the phone tab
  api: { train: { wire: wireTrainDoors, ride: setTrainMist, riding: trainMistOn } } // §37 macro access (§8.1)
};

// Phase one: the companion module wins when present. Registering replaces an earlier registration
// of the same id, so the only case to guard is the companion having loaded FIRST.
if (!contentPack(CROOKED_MOON_PACK.id)) registerContentPack(CROOKED_MOON_PACK);
