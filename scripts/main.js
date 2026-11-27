import { MODULE_ID } from "./preset.js";
import { notifier } from "./notifier.js";
import { registerSettings, resolveExecutorId, isExecutor, displayUserId, isDisplayShared, syncDisplayObserver, DISPLAY_LEVEL, setTvAudioState, setTvSoftFogState, isOnlineTable, hasSharedScreen } from "./settings.js";
import { diffPreset, applyPreset, checkAndPrompt, deactivate, reactivate, hasBackup } from "./enforcer.js";
import { initSocket, startHeartbeat, registerSaveRelay, registerDialogWatchdog, registerReactionNotifier, registerSummonOwnership, api, actorTokenSight, raiseOutsideAsk, settleOutsideAsk, pendingAsks } from "./rpc.js";
import { initPauseGuard } from "./pause-guard.js";
import { initPauseOverlay } from "./pause-overlay.js";
import { initHeartbeat } from "./heartbeat.js";
import { openShell, closeShell, maybeAutoOpenShell, registerShellHooks, isPhoneClient, isDisplayClient } from "./shell.js";
import { installSpellBookAfterLevelUp } from "./spellbook-phone.js";
import { openWindowsAfterRest, isSpellBookRestPrompt, phonePrepareOn } from "./prepare-data.js"; // Prepare spells (D-0106)
import { registerDMPanel, refreshPanel, openDock, panelCompact } from "./dm-panel.js";
import { reportDeck } from "./panel-mode.js"; // MC redesign phase 4.1: the deck reports its reach
import { setupTvVisionCard } from "./tv-vision-card.js"; // §23.7 "No PCs in scene" on the TV
import { planDmSilence } from "./dm-silence.js"; // the DM's music AND environment while the TV is connected
import { registerSyrinscapeBridge, soundScenesState, setSoundScenes, syncSyrinscapeVolume, setSyrinscapeLevels, syncSyrinscapeLevels } from "./syrinscape-bridge.js"; // Syrinscape or local (deck-command D-0116)
import { registerSoundMix, setSoundMix, soundMixState, applyLaunchVolumes, SLIDER_DEFAULT, getSoundMaster, setSoundMaster, stepSoundMaster, setSoundTrim, getSoundTrims } from "./sound-mix.js"; // the table's one mix (DESIGN §58)
import { maybePromptDmWizard } from "./dm-wizard.js";
import { registerSceneTransitions, registerPartyTeleportActivation } from "./transitions.js";
import { registerTrainFollow, registerRideFollow, followRideScene, wireTrainDoors, setTrainMist, setTrainSound, preloadRideSound, primeRideSound, setTrainJolt, joltNow, trainMistOn, trainCarHasWindows, setTrainWindows, freeTrainWeather } from "./cm-train.js"; // §37 the Ghostlight ride
import { restoreCrookedHouse, planHouseNow, makeAtticLadder, registerAtticLadder, keepSealsInert } from "./cm-house.js"; // the Crooked House put back (Lost Lore #17/#18)
import { bossToys } from "./cm-bosses.js"; // MobileCommand.bossToys: a defeated boss as a toy on the deck's landing desk (deck-command D-0243)
import { figurines } from "./cm-bargains.js"; // MobileCommand.figurines: the Dark Bargains for the deck's landing table (deck-command D-0235)
import { activePC } from "./active-pc.js"; // MobileCommand.activePC: the deck's landing table follows the DM's pick (deck-command D-0241)
import { actorCard, cardFace } from "./tarot.js"; // MobileCommand.cardFace: the deck's landing table turns a character's card (deck-command D-0231)
import { makeAtticRooms, planAtticNow } from "./cm-attic.js"; // the attic's rooms get music (§59)
import { registerSoundZones, syncSoundZones } from "./sound-zones.js"; // the chanting lower outside the Cauldron Room (§59.6)
import { registerAoO } from "./aoo.js";
import { setupCalendarSkin, applyCalendarSkinClass, redrawCalendarAfterSave } from "./gametime.js";
import { registerFog, refreshFog } from "./fog-soft.js";
import { registerCombatMusic, combatTracks, setCombatTrack } from "./combat-music.js";
import { registerCampaigns } from "./campaigns.js"; // §50 campaign recognition (Ember creation fit-shim)
import { unionBox, measureClearancePx, clampClearanceFt, planPartyFrame } from "./camera-frame.js";
import { registerFxEngine, registerLayeredWeather, dmFireFx, musicDuck } from "./effects.js"; // §26 Effects tab engine
import { cardTableRefreshMode } from "./card-table.js"; // §39: re-lay the board when the table mode changes
import { dmPlayBossIntro, bossList, bossImage } from "./boss-intro.js"; // §40 the boss's entrance
import { dmPlayEntrance, dmStopEntrance, entranceList, registerEntranceShadow } from "./entrances.js"; // §40.6 the themed entrances ("Intros")
import { tvHeld } from "./tv-hold.js"; // §40.6 an entrance holding the TV camera
import { registerDaylight, applyDaylight, darknessNow } from "./daylight.js"; // §41 the clock drives scene darkness
import { registerTwists } from "./twists.js"; // §31 v2: an armed twist forces the creature's next d20
import { registerDruskenvald } from "./druskenvald.js"; // §43 eternal night, told in six named hours
import { registerCharacterFiles, compileCharacterFiles } from "./character-file.js"; // §44 a book per PC
import { registerDeeds } from "./deeds.js"; // §44.4 slice B: the Deeds recorder feeding chapter 8
import { registerSettingsMenu } from "./settings-app.js"; // §29 settings mini-app (menu button)
import { installErrorCapture, buildDevReport } from "./devreport.js"; // §47 the technical report
import { openFeedback, registerFeedbackMenu } from "./feedback.js"; // §48 the feedback window
import { actionAreas, actionSnapshot, runAction, actionCounts } from "./actions.js"; // §52 the published action list (deck-command ledger 151)
import "./actions-effects.js"; // §52 area G — each area file registers its rows on import
import "./actions-cm.js"; // §52 area H — the Crooked Moon tab (and its requests)
import { travelState } from "./dm-panel.js"; // §18 travel state for the public API (read-only)
import "./actions-travel.js"; // the travel area, which was declared and published nothing (2026-10-18)
import "./actions-moon.js"; // the Moon's Due: Reroll · Redirect for the deck (DM 2026-11-26)
import { registerMoonsDue, registerMoonMenu, initMoonTv, moonsDue, setMoonsDue, moonArt, MOON_CAP } from "./moons-due.js";
import "./actions-rest.js"; // Start rest · Pass watch · Finish, for the deck's Rest drawer (DM 2026-11-26, redesign question 9)
import { registerAskKind } from "./actions-asks.js"; // §55.6 players waiting on the DM (a Basic travel square) — the deck's Notifications
import { registerSoundBehavior, cues } from "./region-sound.js"; // §53 the "Sound" region behaviour + the house door sets
import { audioPrompt, settleWithin } from "./audio-prompt.js"; // the display's sound prompt: card, icon or nothing
import { registerMusicBehavior, registerMusic, state as musicState, pick as musicPick, next as musicNext, cue as musicCue, moods as musicMoods, roomOf as musicRoomOf, overlapState as musicOverlap, adoptSceneMusic as musicAdoptSceneMusic, adoptApprovedOnce as musicAdoptApprovedOnce, holdMusic as musicHold, releaseMusic as musicRelease } from "./music.js"; // the music layer (deck-command MUSIC-LAYER.md)
import { installOverlayGuard, sweepCoveringLayers, reapplyGuard, restoreCoreUi, forceRail, stuckOverlayStates, clearedLayers, shouldKeepGmClear, verifyRail } from "./overlay-guard.js"; // §22.7/§22.9 the DM is never covered or hidden

import { installNoticeFilter, closeLoadWindow, applyPhoneSettings, phoneQuietState } from "./phone-quiet.js"; // a phone loads quietly (DM 2026-11-25)
import { forwardGpsWorkflows, trackGpsPrompts, guardGpsOa, clearGpsOa, gpsActive } from "./gps-bridge.js"; // Gambit's Premades: a phone's reaction item-use runs on the executor (DM 2026-11-25)
import { registerTvCarousel } from "./tv-carousel.js"; // the fight carousel on the TV (DM 2026-11-24)
import { registerDicerMidiBridge, applyPhoneDice, hideGhostDice } from "./dicer-midi.js"; // Dicer dice on midi's rolls (deck-command SEAT 9)
// Blind / GM-only dice on the GM only (SEAT 16): Dicer caches a setting on its first read, so turn its ghost dice off
// now, before any module's init can read it.
try { if (globalThis.game?.settings) hideGhostDice(game.settings); } catch (e) { console.warn("mobile-command | ghost dice", e); }
// A phone loads quietly (DM 2026-11-25, phone-quiet.js): notices held and module welcome windows closed while it loads.
// Installed at load, ahead of every module's init/ready, so the earliest notice is caught too.
try { installNoticeFilter(); } catch (e) { console.warn("mobile-command | phone quiet", e); }
for (const h of ["renderApplicationV2", "renderApplication"]) Hooks.on(h, (app) => { try { closeLoadWindow(app); } catch (e) { /* never break a render */ } });

Hooks.once("init", () => {
  // FIRST thing, before anything of ours can throw: the errors worth having are the ones nobody was
  // watching the console for, and a report is only useful if it caught the start of the session.
  installErrorCapture();
  registerDicerMidiBridge(); // Dicer's dice on midi's rolls; must run before "setup" (deck-command SEAT 9)
  registerSettings();
  registerAtticLadder(); // every client listens; only the primary GM plays the climb (cm-house.js onAtticClimb)
  registerMoonMenu(); // the chat log asks for its right-click entries once, as it first draws (before "ready"), SEAT 39
  registerSettingsMenu(); // §29: registered from here, not settings.js — the app imports preflight, which imports settings.js (cycle)
  try { phoneQuietState.phone = isPhoneClient(); } catch (e) { /* role unreadable: the noCanvas guess stands */ }
  registerFeedbackMenu(); // §48: unrestricted — the people who hit bugs are mostly not the GM
  registerSceneTransitions(); // zoom in/out entries in CONFIG.Canvas.sceneTransitions (scene config + teleport pickers)
  registerLayeredWeather(); // §26: fog over rain/snow/leaves as one weather id, on every client (DM 2026-09-19)
  registerMusicBehavior(); // "Music" in the region menu + the layer's settings, on every client
  registerSoundBehavior(); // §53: "Sound" in the region menu + the Crooked House door sets, on every client
  // TV clean-canvas toggle (DM 2026-06-19): hide ALL Foundry UI so the shared
  // display shows only the canvas. Auto-on for the "display" role; this keybinding
  // toggles it back so the DM can reach settings on the display client (escape hatch).
  try {
    game.keybindings.register(MODULE_ID, "toggleCleanDisplay", {
      name: "Mobile Command: Toggle clean display (TV)",
      hint: "Hide/show all Foundry UI so a shared display shows only the canvas. Use it to reach settings on a display-role client.",
      editable: [{ key: "Backquote" }],
      onDown: () => {
        const on = document.body.classList.toggle("mc-clean");
        // §22.9: ` is a single unmodified key on `restricted: false`, so ANY client can hide ALL
        // of Foundry's UI with one keypress — and the hint pill used to be the only way back and
        // used to fade. It still works (a deliberate press is a deliberate choice), but it now
        // logs the way back to the console (the pill fades after 30 s again since 2026-10-31).
        if (on) {
          showCleanHint();
          console.warn(`${MODULE_ID} | clean display ON — all Foundry UI is hidden on this client. Press \` again, or run MobileCommand.showUI() in the console, to bring it back.`);
        } else hideCleanHint();
        return true;
      },
      restricted: false
    });
  } catch (e) {
    console.warn(`${MODULE_ID} | could not register the clean-display keybinding`, e);
  }
  // Desktop escape hatch (DM 2026-08-25): a player on a full keyboard sometimes wants plain
  // Foundry back. The chord is deliberately obscure (Ctrl+Shift+Alt+X — nothing core or the
  // stack's modules claims it) and ONE-WAY by design: nothing is written, so the next page
  // load boots the shell again. Phones can't press it, which is exactly the point — the
  // shortcut can close the app but never be needed to open it. Registered through Foundry's
  // own keybinding system so it shows in Configure Controls and core arbitrates conflicts.
  try {
    game.keybindings.register(MODULE_ID, "closeShellUntilRefresh", {
      name: "Mobile Command: Close the phone app (until refresh)",
      hint: "Closes the mobile overlay and returns this browser to the normal Foundry player view. Nothing is saved — reload the page to get the app back.",
      editable: [{ key: "KeyX", modifiers: ["Control", "Shift", "Alt"] }],
      onDown: () => {
        closeShell();
        document.body.classList.remove("mc-phone"); // release the phone-scoped CSS with it
        notifier.info("Phone app closed — reload the page to get it back.");
        return true;
      },
      restricted: false
    });
  } catch (e) {
    console.warn(`${MODULE_ID} | could not register the shell-escape keybinding`, e);
  }
  // "Frame the party" (DM 2026-06-19): pan + zoom the local canvas to fit all PC
  // tokens. Out of combat nothing auto-frames the TV, so press this on the display
  // client to recenter on the party (their combined vision is already shown OOC).
  try {
    game.keybindings.register(MODULE_ID, "frameParty", {
      name: "Mobile Command: Focus the party",
      hint: "Frame the whole party — PCs and their pets — here AND on the table display, and return the display to its default camera (Stream Deck-friendly).",
      editable: [{ key: "KeyP" }],
      onDown: () => { focusPartyAll(); return true; },
      restricted: false
    });
    game.keybindings.register(MODULE_ID, "toggleTvManual", {
      name: "Mobile Command: Toggle manual TV control",
      hint: "While on, your pan/zoom drives the table display (a spotlight tool). Focus-party turns it back off (Stream Deck-friendly).",
      editable: [{ key: "KeyM" }],
      onDown: () => { toggleTvManual(); return true; },
      restricted: false
    });
  } catch (e) {
    console.warn(`${MODULE_ID} | could not register the camera keybindings`, e);
  }
});

// Cinematic ease (0→1) for TV camera moves — a smooth pan/zoom instead of a jump cut.
const tvEase = (t) => (1 - Math.cos(Math.PI * t)) / 2;

// On each combat turn the display spotlights the ACTIVE token (DM 2026-06-27): zoom OUT
// then zoom IN, centred on that token, ending at a TV_COMBAT_RADIUS_FT radius. The pull-
// back is TV_COMBAT_OUT_FACTOR × the spotlight scale (a wider establishing view).
const TV_COMBAT_RADIUS_FT = 30;                       // spotlight radius on the active token (was 60 — too wide; the view exceeded the scene so it clamped to scene-centre every turn, DM 2026-06-28)
const TV_COMBAT_OUT_FACTOR = 0.6;                     // zoom-out factor before the push-in
const TV_COMBAT_OUT_MS = 600, TV_COMBAT_IN_MS = 900;  // out, then in (~1.5 s total)

// --- The DM's frame: one scale + one clearance, captured together (DM 2026-07-24) ------
//
// REPLACES the fixed-margin model (the party box grown by TV_TOKEN_MARGIN_FT = 25 ft per side,
// re-fitted from scratch on every step). Because that recomputed the ZOOM on each move, any step
// that widened the party box pulled the camera out — on a large scene, straight to the whole map:
// "every move I make that should open up the FOV a bit goes to full screen" (DM 2026-07-23), still
// happening 2026-07-24. Tuning the constant was never going to fix it; the model was wrong.
//
// The rule now is the DM's own: whatever frame you set, the camera KEEPS THE CLOSEST FOLLOWED TOKEN
// THE SAME DISTANCE FROM THE EDGE as it was when you set it. Three players at 15 / 20 / 20 ft of
// clearance → the frame holds 15 ft, and the camera PANS to maintain it. The zoom is yours.
//
// A frame is therefore a PAIR — the scale you set and the clearance you left — captured together
// whenever you reframe (zoom buttons, Focus, Fit Scene, releasing manual control). An automatic
// pull-back never overwrites `tvFrameScale`, which is exactly what lets the camera settle back to
// YOUR zoom once the party regroups.
const TV_FOLLOW_MIN_CLEARANCE_FT = 5;   // floor — a followed token never gets nearer than this to the edge
const TV_FOLLOW_MAX_CLEARANCE_FT = 60;  // ceiling — from a wide frame, don't chase a token 300 ft out
let tvFrameScale = null;   // the scale the DM last established (null = capture from the view as it stands)
let tvClearanceFt = null;  // ...and the closest driver's edge clearance at that moment, in scene feet

const ftToPx = (ft) => (ft / (canvas.dimensions?.distance ?? canvas.grid?.distance ?? 5)) * (canvas.dimensions?.size ?? canvas.grid?.size ?? 100);
const pxToFt = (px) => (px / (canvas.dimensions?.size ?? canvas.grid?.size ?? 100)) * (canvas.dimensions?.distance ?? canvas.grid?.distance ?? 5);

// The closest followed driver's distance to the nearest viewport edge, in scene feet.
function measureClearanceFt() {
  const box = followBox();
  if (!box) return null;
  const s = canvas.stage;
  const [screenW, screenH] = canvas.screenDimensions ?? [window.innerWidth, window.innerHeight];
  return pxToFt(measureClearancePx({ box, pivot: s.pivot, scale: s.scale.x || 1, screenW, screenH }));
}

// Record the frame the DM just set: its scale, and the clearance it leaves the party.
function captureTvFrame() {
  if (!canvas?.ready) return;
  tvFrameScale = canvas.stage.scale.x || 1;
  const ft = measureClearanceFt();
  tvClearanceFt = ft == null ? null
    : clampClearanceFt(ft, TV_FOLLOW_MIN_CLEARANCE_FT, TV_FOLLOW_MAX_CLEARANCE_FT);
}
// Every reframe is animated, so capture once it has landed — measuring mid-flight would record
// whatever the camera happened to be passing through.
function captureAfter(p) { Promise.resolve(p).then(captureTvFrame).catch(() => {}); return p; }
// Forget the frame: the next follow re-derives it from wherever the display has been left.
function resetTvFrame() { tvFrameScale = null; tvClearanceFt = null; }

// Does an update touch our noFollow flag (set, cleared, or nulled by unsetFlag)?
function touchesNoFollowFlag(changes) {
  return foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE_ID}.noFollow`)
    || (typeof changes?.flags?.[MODULE_ID] === "object" && "noFollow" in changes.flags[MODULE_ID]);
}

// Re-frame the party when WHO-is-followed changes (Follow Everyone / None / solo from the panel).
// We react to the flag UPDATE itself rather than the frameParty socket message: that message races
// ahead of the token-flag sync, so the display framed a stale (still-excluded) set and left the real
// reframe waiting for the first token move — the "focus only works on the first move" bug
// (DM 2026-07-25). Debounced because Follow Everyone clears several flags back-to-back.
let _followFlagTimer = null;
function reframeOnFollowChange() {
  if (!isDisplayClient() || tvManual || game.combat?.started) return;
  clearTimeout(_followFlagTimer);
  // Same reframe a move would do (planPartyFrame), over the now-current followed set — reframeParty
  // is defined below; this fires from a hook, long after load. Debounced: Follow Everyone / None
  // flips several flags in a row, and we want one reframe over the settled set.
  _followFlagTimer = setTimeout(() => { try { reframeParty(); } catch (e) { /* best-effort */ } }, 80);
}

// TV compass (DM 2026-07-03): players sit AROUND the TV facing it from different
// sides, so "forward ↑" needs an anchor — a static compass pinned top-right that
// always points map-north (the top of the TV). Plain DOM above the canvas
// (pointer-events:none), inline SVG: no assets, no canvas work, ~zero cost.
function mountTvCompass() {
  if (document.getElementById("mc-tv-compass")) return;
  const el = document.createElement("div");
  el.id = "mc-tv-compass";
  el.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="North is up">
    <circle cx="50" cy="50" r="42" fill="rgba(12,10,6,.55)" stroke="#c8a44d" stroke-width="3"/>
    <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(200,164,77,.35)" stroke-width="1"/>
    <g stroke="#c8a44d" stroke-width="3" stroke-linecap="round">
      <line x1="50" y1="4" x2="50" y2="14"/><line x1="50" y1="86" x2="50" y2="96"/>
      <line x1="4" y1="50" x2="14" y2="50"/><line x1="86" y1="50" x2="96" y2="50"/>
    </g>
    <path d="M50 20 L60 52 L50 46 L40 52 Z" fill="#e6c46a" stroke="#8a6d2a" stroke-width="1.5" opacity="0.8"/>
    <text x="50" y="36" text-anchor="middle" font-family="serif" font-weight="bold" font-size="15" fill="#f0dfae">N</text>
  </svg>`;
  document.body.appendChild(el);
}

// Interface-layer identity rings + target reticles (#13, Spike 6). Drawn into a
// PIXI.Graphics on the CONTROLS layer (pings/rulers live there), which renders
// above lighting/fog and is exempt from vision-mode saturation — so rings keep
// their player color under darkvision grayscale where token lights/rings cannot
// (Round 10 finding: a token light can't shrink below the emitter body, so the
// glow approach always bleeds). Display client only; `tvRings` setting gates it.
// (Custom TV ring overlay removed, Round 10d: it desynced from movement animation
// and ignored token scale. Party Mode now colors the NATIVE dnd5e dynamic ring
// per player instead — applyRingColor in rpc.js — which syncs/scales perfectly
// and keeps the stock Ring-tab options. Targeting = core's per-user colored pips.)

// A token the TV camera should treat as "the party": ANY player-owned creature — the PCs and their
// pets/summons alike — or the PACKED group token (Party Mode §15 — while packed it IS the party;
// without this the camera ignores it and the party walks off the display).
//
// Pets were excluded by a `type === "character"` test until 2026-07-22, so a druid's beast or a
// familiar could walk clean off the display and Focus would frame the party without it (DM: "pets
// don't seem to be taken into account for focus on party"). That was the last holdout of the same
// assumption fixed elsewhere: scenePartyActors() already folds those pets into the travelling group,
// and watchMembers() lets them stand watch.
//
// Two deliberate exclusions. Item piles: a lootable pile is often player-owned precisely so players
// can open it, and framing one would drag the camera off to a chest (scenePartyActors guards the
// same way). GM-run summons nobody has been given yet: `hasPlayerOwner` is false until the DM hands
// control over, and until then it's a DM-driven NPC, not somebody's pet.
function isPartyActor(actor) {
  if (!actor) return false;
  if (actor.type === "group") return !!actor.getFlag?.("mobile-command", "packed");
  if (actor.flags?.["item-piles"]) return false;
  return !!actor.hasPlayerOwner;
}

// Who feeds the shared display's positional audio — PLAYER CHARACTERS ONLY. Deliberately narrower
// than isPartyActor (the camera still frames pets): pets are "deaf" (DM 2026-07-23, "remove them
// from the hearing feature completely, only PCs get to share sound"). This also sidesteps a real
// mess — a summon is an UNLINKED token whose `t.actor` is a synthetic clone sharing the base's id
// but not its flags, so deafening one never reached the object the listener read. PCs are linked,
// so the whole class of problems disappears with the pets.
function isAudioListener(actor) {
  if (!actor) return false;
  // While the party is PACKED there are no member tokens on the scene — just the one group token —
  // so without this a travelling party is stone deaf (DM 2026-07-23). The packed group token stands
  // in as a single listener at the party's position, which is also cheaper than N separate ones.
  if (actor.type === "group") return !!actor.getFlag?.("mobile-command", "packed");
  return actor.type === "character" && !!actor.hasPlayerOwner;
}

// --- Who the camera follows (DM 2026-07-24) ----------------------------------------------
// The DM's follow filter: a per-TOKEN opt-out, toggled from the panel's "Who the display
// follows" list. It lives on the TokenDocument, never the actor — an unlinked summon's
// `token.actor` is a synthetic clone sharing the base actor's id but NOT its flags, so an
// actor flag written on one summon reads back on every other token off the same base, and
// reliably on none of them (§22.1; this is the bug that made per-token deafening impossible).
function isFollowedToken(doc) { return !doc?.getFlag?.(MODULE_ID, "noFollow"); }

// Movement TRIGGER = a PC or the packed group token. A wandering familiar must never yank the
// camera on its own (a Mage Hand sent across the room was pulling the view to full screen every
// move, DM 2026-07-23).
function isFollowDriver(actor) {
  if (!actor) return false;
  if (actor.type === "group") return !!actor.getFlag?.(MODULE_ID, "packed");
  return actor.type === "character" && !!actor.hasPlayerOwner;
}

// The followed tokens as screen rects, split into two tiers — because DM 2026-07-22 ("pets aren't
// taken into account for focus on party") and DM 2026-07-23 ("a mage hand shouldn't drag the
// camera") are both right, they just describe different tiers:
//   DRIVERS   — PCs + the packed group. They trigger the follow and the frame GUARANTEES them.
//   TAGALONGS — the other player-owned tokens (pets, summons). Kept in shot only while they are
//               free; the instant holding one would cost zoom, it drops out of the frame.
// `movedDoc` (the update document) is authoritative for the token being moved — the placeable's
// own x/y still lag while the move animates.
function followTiers(movedDoc) {
  const gs = canvas.dimensions?.size ?? 100;
  const drivers = [], tagalongs = [];
  for (const t of canvas.tokens?.placeables ?? []) {
    const d = t.document;
    if (!d || d.hidden || !isPartyActor(t.actor) || !isFollowedToken(d)) continue;
    const src = movedDoc && d.id === movedDoc.id ? movedDoc : d;
    const rect = { minX: src.x, minY: src.y, maxX: src.x + (d.width ?? 1) * gs, maxY: src.y + (d.height ?? 1) * gs };
    (isFollowDriver(t.actor) ? drivers : tagalongs).push(rect);
  }
  return { drivers, tagalongs };
}

// The box the follow is RESPONSIBLE for: the drivers. (With no PC on the scene — a pets-only
// scene — the tagalongs stand in, so the camera isn't blind.) Clearance is measured against this.
function followBox(movedDoc) {
  const { drivers, tagalongs } = followTiers(movedDoc);
  return unionBox(drivers.length ? drivers : tagalongs);
}

// The party's centre for the Focus press — over EVERY followed token, pets included (DM
// 2026-07-22), and honouring the filter: Focus shouldn't fly off to a token the display has been
// told to ignore. Pure pan, so no scale. null when nobody is on the scene.
function partyFrame() {
  const { drivers, tagalongs } = followTiers();
  const box = unionBox([...drivers, ...tagalongs]);
  return box ? { cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2 } : null;
}

// Frame a single token: its centre + the scale that shows `radiusFt` across the smaller
// screen axis, scene-clamped. Used by the combat spotlight. null when no token.
function tokenFrame(tokenDoc, radiusFt) {
  if (!tokenDoc) return null;
  const gs = canvas.dimensions?.size ?? 100;
  const gridDist = canvas.dimensions?.distance ?? canvas.grid?.distance ?? 5;
  const [screenW, screenH] = canvas.screenDimensions ?? [window.innerWidth, window.innerHeight];
  const minZoom = CONFIG.Canvas?.minZoom ?? 0.1, maxZoom = CONFIG.Canvas?.maxZoom ?? 3;
  const diam = (radiusFt * 2 / gridDist) * gs;
  const scale = Math.max(minZoom, Math.min(screenW / diam, screenH / diam, maxZoom));
  const tw = (tokenDoc.width ?? 1) * gs, th = (tokenDoc.height ?? 1) * gs;
  let cx = tokenDoc.x + tw / 2, cy = tokenDoc.y + th / 2;
  const halfW = screenW / scale / 2, halfH = screenH / scale / 2;
  const r = canvas.dimensions?.sceneRect ?? canvas.dimensions?.rect;
  if (r) {
    cx = r.width  <= halfW * 2 ? r.x + r.width  / 2 : Math.min(Math.max(cx, r.x + halfW), r.x + r.width  - halfW);
    cy = r.height <= halfH * 2 ? r.y + r.height / 2 : Math.min(Math.max(cy, r.y + halfH), r.y + r.height - halfH);
  }
  return { cx, cy, scale };
}

// "Frame the party": centre ONLY — pan to the party centroid and keep the current zoom
// untouched (DM 2026-06-27: "centre only centres"; the zoom is owned by the zoom buttons
// + the follow). Keybinding + MobileCommand.frameParty().
function framePartyTokens() {
  try {
    if (!canvas?.ready) return false;
    const frame = partyFrame();
    if (!frame) { notifier.info(`${MODULE_ID} | no party tokens on this scene to frame`); return false; }
    const scale = canvas.stage.scale.x || 1; // pure pan — keep current zoom
    // Focus IS a reframe: the clearance it leaves becomes the one the follow maintains.
    captureAfter(canvas.animatePan({ x: frame.cx, y: frame.cy, scale, duration: 1000, easing: tvEase }));
    return true;
  } catch (e) {
    console.warn(`${MODULE_ID} | framePartyTokens failed`, e);
    return false;
  }
}

// --- TV camera remote control (DM 2026-06-19) -------------------------------
// The DM drives the shared display's camera: "focus party" reframes it, and a
// "manual" toggle mirrors the DM's own pan/zoom to the display (a spotlight tool
// for OOC scene-setting). Relayed over Foundry's socket; only display clients act.
let tvManual = false;   // (display side) currently under manual DM control
let dmRelaying = false; // (DM side) mirroring our pan/zoom to the display
let _panTimer = null, _lastPan = 0;

function tvBroadcast(payload) { try { game.socket?.emit(`module.${MODULE_ID}`, payload); } catch (e) { /* socket not ready */ } }

function onTvControl(payload) {
  if (!payload || typeof payload !== "object") return;
  // Travels display → everyone, so it is handled BEFORE the display-only gate below.
  if (payload.cmd === "audioState") {
    // Newest wins. Stored in settings.js so the panel can read it without an import cycle.
    setTvAudioState({
      locked: !!payload.locked,
      paused: !!payload.paused,
      contexts: payload.contexts && typeof payload.contexts === "object" ? payload.contexts : null,
      muted: !!payload.muted,
      at: Number(payload.at) || Date.now(),
    });
    try { globalThis.MobileCommand?.refreshPanel?.(); } catch (e) { /* panel may not exist */ }
    return;
  }
  if (payload.cmd === "softFogState") {
    setTvSoftFogState({ on: !!payload.on, style: payload.style ?? (payload.on ? "soft" : "off"), supported: !!payload.supported, at: Number(payload.at) || Date.now() });
    try { globalThis.MobileCommand?.refreshPanel?.(); } catch (e) { /* panel may not exist */ }
    return;
  }
  // Every client, not only the display: the ride's loop readied ahead of Start ride (deck-command D-0108)
  if (payload.cmd === "primeRide") { primeRideSound().catch(() => {}); return; }
  if (!isDisplayClient()) return; // only the shared display reacts to the rest
  if (payload.cmd === "frameParty") { tvManual = false; framePartyTokens(); }
  else if (payload.cmd === "fitScene") { tvManual = false; fitSceneLocal(); } // §camera: show the whole map
  else if (payload.cmd === "frameRect") { tvManual = false; frameRectLocal(payload.rect); } // a room (deck-command)
  else if (payload.cmd === "panTo") { tvManual = false; panToLocal(Number(payload.x), Number(payload.y)); } // a pin (deck-command)
  // Leaving manual control hands the camera back wherever the DM parked it — that view is now
  // the frame the follow maintains, so forget the old pair and re-derive from it.
  else if (payload.cmd === "manual") { tvManual = !!payload.on; if (!tvManual) resetTvFrame(); }
  else if (payload.cmd === "zoom" && canvas?.ready) {
    // Zoom around the display's CURRENT centre. Not gated on manual mode — a direct
    // DM control of the TV (DM 2026-06-21). Clamp to the canvas zoom limits.
    const s = canvas.stage;
    const min = CONFIG.Canvas?.minZoom ?? 0.1, max = CONFIG.Canvas?.maxZoom ?? 3;
    const scale = Math.max(min, Math.min((s.scale?.x || 1) * (payload.factor || 1), max));
    captureAfter(canvas.animatePan({ x: s.pivot.x, y: s.pivot.y, scale, duration: 250, easing: tvEase }));
  }
  else if (payload.cmd === "pan" && tvManual && canvas?.ready) {
    // dur present (e.g. entering manual) → animated glide; live drag-follow stays instant/responsive.
    try {
      if (payload.dur) canvas.animatePan({ x: payload.x, y: payload.y, scale: payload.scale, duration: payload.dur, easing: tvEase });
      else canvas.pan({ x: payload.x, y: payload.y, scale: payload.scale });
    } catch (e) { /* pan best-effort */ }
  }
}

// Focus the party here AND on the display(s), and end manual mode so the display
// returns to default (follow the turn in combat / shared party vision out of it).
function focusPartyAll() {
  // On the display client this IS the TV → frame here. On the DM client, only drive
  // the display (the DM keeps their own view — they were zoomed out to click this).
  if (isDisplayClient()) framePartyTokens();
  tvBroadcast({ cmd: "frameParty" });
  if (dmRelaying) setDmRelaying(false);
}

function setDmRelaying(on) {
  dmRelaying = !!on;
  tvBroadcast({ cmd: "manual", on: dmRelaying });
  // Smoothly glide the display to the DM's current view when manual turns on, so
  // entering manual is a pan-and-zoom rather than a jump cut.
  if (dmRelaying && canvas?.ready) {
    const s = canvas.stage;
    tvBroadcast({ cmd: "pan", x: s.pivot.x, y: s.pivot.y, scale: s.scale.x, dur: 1000 });
  }
  Hooks.callAll("mobile-command.tvManualChanged", dmRelaying);
  notifier.info(`${MODULE_ID} | manual TV control ${dmRelaying ? "ON — your pan/zoom drives the display" : "OFF"}`);
}
function toggleTvManual() { setDmRelaying(!dmRelaying); return dmRelaying; }
function isTvManualActive() { return dmRelaying; }

// Zoom the shared display in/out around its current centre (DM 2026-06-21). factor
// > 1 zooms in, < 1 out. Like focusPartyAll: act locally if this IS a display, and
// always drive the display(s) over the socket. Independent of manual mode so the DM
// can nudge the TV's zoom without taking over its pan. (game.socket.emit doesn't echo
// to the sender, so a display client never double-applies its own broadcast.)
function tvZoom(factor) {
  if (isDisplayClient() && canvas?.ready) {
    const s = canvas.stage;
    const min = CONFIG.Canvas?.minZoom ?? 0.1, max = CONFIG.Canvas?.maxZoom ?? 3;
    const scale = Math.max(min, Math.min((s.scale?.x || 1) * factor, max));
    captureAfter(canvas.animatePan({ x: s.pivot.x, y: s.pivot.y, scale, duration: 250, easing: tvEase }));
  }
  tvBroadcast({ cmd: "zoom", factor });
}

// Fit the WHOLE scene on the display (DM 2026-07-19: the missing "Fullscreen zoom" — show the entire
// map, the natural opposite of Focus party). Computed on the DISPLAY from ITS own screen (like the
// zoom relay), so the framing is right for the TV, not the DM's window. Locks the scale (like the
// zoom buttons) so the party-follow holds this overview until the DM reframes.
function fitSceneLocal() {
  try {
    if (!canvas?.ready) return false;
    const r = canvas.dimensions?.sceneRect ?? canvas.dimensions?.rect;
    if (!r) return false;
    const [screenW, screenH] = canvas.screenDimensions ?? [window.innerWidth, window.innerHeight];
    const minZoom = CONFIG.Canvas?.minZoom ?? 0.1, maxZoom = CONFIG.Canvas?.maxZoom ?? 3;
    const scale = Math.max(minZoom, Math.min(screenW / r.width, screenH / r.height, maxZoom) * 0.96); // 0.96 = a sliver of edge padding
    captureAfter(canvas.animatePan({ x: r.x + r.width / 2, y: r.y + r.height / 2, scale, duration: 1000, easing: tvEase }));
    return true;
  } catch (e) { console.warn(`${MODULE_ID} | fitSceneLocal failed`, e); return false; }
}
// Like focusPartyAll: frame here if this IS the display, always drive the display(s), and drop manual.
function tvFitScene() {
  if (isDisplayClient()) fitSceneLocal();
  tvBroadcast({ cmd: "fitScene" });
  if (dmRelaying) setDmRelaying(false);
}

// Frame a RECTANGLE of the map on the display (deck-command's "Frame room", 2026-11-01). The same
// shape as fitSceneLocal — computed on the DISPLAY from its own screen, scale locked so the follow
// holds the frame until the DM reframes — for any {x, y, width, height} in canvas px. The caller
// decides which rectangle; this only frames it.
function frameRectLocal(rect) {
  try {
    if (!canvas?.ready || !rect || !(rect.width > 0) || !(rect.height > 0)) return false;
    const [screenW, screenH] = canvas.screenDimensions ?? [window.innerWidth, window.innerHeight];
    const minZoom = CONFIG.Canvas?.minZoom ?? 0.1, maxZoom = CONFIG.Canvas?.maxZoom ?? 3;
    const scale = Math.max(minZoom, Math.min(screenW / rect.width, screenH / rect.height, maxZoom) * 0.92);
    captureAfter(canvas.animatePan({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, scale, duration: 1000, easing: tvEase }));
    return true;
  } catch (e) { console.warn(`${MODULE_ID} | frameRectLocal failed`, e); return false; }
}
function tvFrameRect(rect) {
  if (!rect) return false;
  const r = { x: Number(rect.x), y: Number(rect.y), width: Number(rect.width), height: Number(rect.height) };
  if (isDisplayClient()) frameRectLocal(r);
  tvBroadcast({ cmd: "frameRect", rect: r });
  if (dmRelaying) setDmRelaying(false);
  return true;
}
// Glide the display to a point, keeping its zoom (deck-command's "To pin", 2026-11-01).
function panToLocal(x, y) {
  try {
    if (!canvas?.ready || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    captureAfter(canvas.animatePan({ x, y, scale: canvas.stage.scale.x, duration: 800, easing: tvEase }));
    return true;
  } catch (e) { return false; }
}
function tvPanTo(point) {
  const x = Number(point?.x), y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (isDisplayClient()) panToLocal(x, y);
  tvBroadcast({ cmd: "panTo", x, y });
  if (dmRelaying) setDmRelaying(false);
  return true;
}

// --- TV party-follow (DM 2026-06-20 · clearance rework 2026-07-24) ------------
// PAN, don't re-fit. The camera holds the DM's frame and slides it so the closest DRIVER keeps
// the clearance that frame was set with (see "The DM's frame" above). The zoom changes in
// exactly one case: the drivers no longer fit even at the 5 ft floor — a party that has genuinely
// split — and then it pulls back the minimum that fits, without touching the DM's stored scale,
// so regrouping settles straight back to it. Nothing else moves the zoom, which is what ends the
// "every step goes to full screen" behaviour: a step that widens the party box now costs a pan.
// Display client only, yields to manual TV control, scene-clamped so we never overscroll the map.
// The shared party reframe: hold the driver box's clearance, panning (and only zooming when the
// party won't fit at the floor). `movedDoc` (optional) is the token being moved — authoritative for
// its position while the move still animates; omit it for a reframe NOT tied to a move, e.g. the
// followed set changing (DM 2026-07-25 wants "the same repositioning action done on move" for any
// active-focus change from the panel, not a plain re-center).
function reframeParty(movedDoc) {
  if (!isDisplayClient() || tvManual || tvHeld() || !canvas?.ready) return;
  if (game.combat?.started) return; // in combat the active-token spotlight takes over

  const { drivers, tagalongs } = followTiers(movedDoc);
  const core = unionBox(drivers);
  if (!core) return; // nobody the camera is responsible for

  const stage = canvas.stage;
  const [screenW, screenH] = canvas.screenDimensions ?? [window.innerWidth, window.innerHeight];
  const minZoom = CONFIG.Canvas?.minZoom ?? 0.1, maxZoom = CONFIG.Canvas?.maxZoom ?? 3;

  // First move after a reframe (or after a reload) — adopt the view as it stands.
  if (tvFrameScale == null || tvClearanceFt == null) captureTvFrame();
  const curScale = stage.scale.x || 1;
  const { cx, cy, scale } = planPartyFrame({
    core, tagalongs, pivot: stage.pivot, screenW, screenH,
    frameScale: tvFrameScale, curScale,
    wantPx: ftToPx(tvClearanceFt ?? TV_FOLLOW_MIN_CLEARANCE_FT),
    floorPx: ftToPx(TV_FOLLOW_MIN_CLEARANCE_FT),
    minZoom, maxZoom,
    sceneRect: canvas.dimensions?.sceneRect ?? canvas.dimensions?.rect ?? null
  });

  const scaleChanged = Math.abs(scale - curScale) / curScale > 0.01;
  if (!scaleChanged && Math.abs(cx - stage.pivot.x) < 1 && Math.abs(cy - stage.pivot.y) < 1) return; // already framed
  canvas.animatePan({ x: cx, y: cy, scale, duration: 250, easing: tvEase });
}

function tvPartyFollow(tokenDoc, changes) {
  try {
    if (!("x" in changes) && !("y" in changes)) return; // only on movement
    if (!isFollowDriver(tokenDoc.actor) || !isFollowedToken(tokenDoc)) return;
    reframeParty(tokenDoc);
  } catch (e) { /* follow is best-effort */ }
}

// --- TV combat spotlight (DM 2026-06-27) ------------------------------------
// On each turn change the display zooms OUT then zooms IN onto the ACTIVE token,
// ending at a TV_COMBAT_RADIUS_FT radius — "zoom in to the new token". Both phases
// are centred on that token (not the party). Display only, yields to manual TV,
// sequence-guarded against rapid turns; movement within a turn → tvCombatFollow.
let _tvCineSeq = 0;
async function tvCombatTurnPulse() {
  if (!isDisplayClient() || tvManual || tvHeld() || !canvas?.ready) return;
  if (!game.combat?.started) return;
  const token = game.combat.combatant?.token;
  const frame = tokenFrame(token, TV_COMBAT_RADIUS_FT);
  if (!frame) return;
  const minZoom = CONFIG.Canvas?.minZoom ?? 0.1;
  const outScale = Math.max(minZoom, frame.scale * TV_COMBAT_OUT_FACTOR);
  const seq = ++_tvCineSeq;
  // Phase 1: pull back (zoom out), centred on the active token.
  await canvas.animatePan({ x: frame.cx, y: frame.cy, scale: outScale, duration: TV_COMBAT_OUT_MS, easing: tvEase });
  if (seq !== _tvCineSeq || tvManual) return; // a newer turn (or manual takeover) superseded us
  // Phase 2: push in to the spotlight, centred on the active token.
  await canvas.animatePan({ x: frame.cx, y: frame.cy, scale: frame.scale, duration: TV_COMBAT_IN_MS, easing: tvEase });
}

// The active token moved within its turn → keep it centred at the spotlight zoom.
function tvCombatFollow(tokenDoc, changes) {
  try {
    if (!isDisplayClient() || tvManual || tvHeld() || !canvas?.ready) return;
    if (!("x" in changes) && !("y" in changes)) return; // only on movement
    const active = game.combat?.combatant?.token;
    if (!active || active.id !== tokenDoc.id) return;   // only the active combatant
    const frame = tokenFrame(tokenDoc, TV_COMBAT_RADIUS_FT);
    if (frame) canvas.animatePan({ x: frame.cx, y: frame.cy, scale: frame.scale, duration: 250, easing: tvEase });
  } catch (e) { /* follow is best-effort */ }
}

// Combat POV vision on the TV (DM 2026-06-27, opt-in `combatPovVision`). The actual
// restriction lives in the `_isVisionSource` patch (setupDMOmniscientVision): on the
// display, while the feature is on and it's a PC's turn, only the active combatant is a
// vision source. This just re-evaluates vision so the patch re-runs for the new active
// token — called on turn change + combat start, and from the setting's onChange. When
// the feature is off (or NPC turn / no combat) the patch falls through to shared vision,
// so a plain re-evaluation also restores shared vision when toggled off.
function refreshCombatVision() {
  if (!isDisplayClient() || !canvas?.ready) return;
  // RELEASING IS LOAD-BEARING — do not "restore" the control() call that used to be here.
  //
  // Core's Token#_isVisionSource ends with:
  //     return !this.layer.controlled.some(t => !t.document.hidden && t.hasSight)
  // so a single CONTROLLED token suppresses every merely-OBSERVED one. Measured live 2026-07-21 on
  // a vision-on scene, as a non-GM holding OBSERVER (2) on one token and OWNER (3) on another:
  //     controlling the owned token  → observed token isVisionSource FALSE, 1 live source
  //     releaseAll()                 → observed token isVisionSource TRUE,  2 live sources
  // That is the whole shared-display picture: the TV shows the party's MERGED vision only while it
  // controls nothing. The old control() call was actively harmful to that, and it is doubly moot
  // now the display account is OBSERVER and cannot control anything at all.
  //
  // The vision refresh below is still needed to RE-RENDER fog from the new source set; the
  // `_isVisionSource` patch decides which tokens are eligible (it returns true for the active
  // combatant outright, without consulting ownership).
  try { canvas.tokens?.releaseAll(); } catch (e) { /* best-effort */ }
  try { canvas.perception?.update({ initializeVision: true, refreshVision: true, refreshLighting: true }); } catch (e) {}
  try { canvas.effects?.initializeVisionSources?.(); } catch (e) {} // force a synchronous rebuild if available
}

// Sync each PC token's vision from its actor's dnd5e senses (DM 2026-06-27, onboarding
// #11). Fixes the uneven token config that made combat-POV "work for some, not others":
// a darkvision-30 actor whose token has sight disabled / range 0 is blind on the TV.
// Sets sight.range + visionMode from darkvision, and detection modes for the special
// senses (tremorsense/blindsight/truesight) so they detect creatures in their radius.
// Run by a client that can update the tokens (the GM, or the display via auto-own).
// Reads installed dnd5e: senses live at system.attributes.senses.ranges.{darkvision,…}.
async function syncPartyTokenSight() {
  if (!canvas?.ready) return 0;
  let n = 0, skipped = 0;
  for (const t of canvas.tokens?.placeables ?? []) {
    const actor = t.actor;
    // PCs + party summons. Deliberately WIDER than isPartyActor (the camera's test): this also
    // covers a summon the DM hasn't handed over yet, whose hasPlayerOwner is still false — it needs
    // its senses synced regardless, or it walks the TV blind (2026-07-21: hasPlayerOwner only read
    // true for those while the TV held OWNER).
    if (!actor?.hasPlayerOwner && !isDisplayShared(actor)) continue;
    // Senses → sight/detection now lives in ONE place (rpc.js actorTokenSight) and is
    // ALSO applied at token creation on deploy/scout-release (2026-07-04: a dispersed
    // PC kept the prototype's range-0 sight, so darkvision members walked blind until
    // a combat started and this sync ran). Saturation is DARKVISION_SAT (-0.8) —
    // supersedes this function's old -1 full-greyscale (DM 2026-07-03: "-0.6 was too
    // colorful; halfway to full gray").
    const update = actorTokenSight(actor);
    // Also fix the token name → the actor's name (DM 2026-06-28). PCs were all left as
    // the generic "Player Character" token name; the GM-side sync has the permission to
    // rename them, which char-gen can't reliably do from the phone.
    const rename = (actor.name && t.document.name !== actor.name) ? actor.name : null;
    if (rename) update.name = rename;
    // Per-token log (pre-update name) so the DM can see what got applied. If a sense
    // the DM expects is missing, it's not in senses.ranges (check senses.special).
    console.log(`${MODULE_ID} | sight-sync ${t.name} → rename=${rename ?? "(no change)"}: range=${update.sight.range} mode=${update.sight.visionMode} detect=[${Object.entries(update.detectionModes).map(([id, m]) => `${id}:${m.range}`).join(", ")}]`);
    try { await t.document.update(update); n++; }
    catch (e) { skipped++; console.warn(`${MODULE_ID} | sight sync failed for ${t.name} (permission?)`, e); }
  }
  notifier.info(`${MODULE_ID} | synced token sight on ${n} PC token(s) from senses${skipped ? ` (${skipped} skipped — need ownership)` : ""}`);
  return n;
}

// monks-common-display ALSO drives the shared display's camera: its "screen" follow
// (screen-toggle) re-frames getTokens(screenValue) on every token move with its own
// square-based padding, and wins the animatePan race — so the TV tracks a single
// token at MCD's tight zoom instead of mobile-command's whole-party / combat framing
// (DM live finding 2026-06-27). On OUR display client, neutralise MCD's CAMERA so
// mobile-command owns pan/zoom, while LEAVING its token control (vision/LOS, the
// focus-toggle path) intact. Gated on isDisplayClient(), so the camera is always
// owned by exactly one module — never zero. Runtime-only: a reload restores MCD.
async function suppressMcdCamera() {
  try {
    const mcd = game.modules.get("monks-common-display");
    if (!mcd?.active) return; // MCD not in play — nothing to do
    const ns = await import("/modules/monks-common-display/monks-common-display.js");
    const C = ns?.MonksCommonDisplay;
    if (!C) { console.warn(`${MODULE_ID} | MCD active but class not importable — TV camera may conflict`); return; }
    // changeScreen/sceneView frame the camera; canvasPan mirrors the GM's view. All
    // camera-only — token control (controlToken/changeFocus) is untouched, so vision
    // still follows the turn. Replace with no-ops on this display client only.
    let patched = 0;
    for (const m of ["changeScreen", "sceneView", "canvasPan"]) {
      if (typeof C[m] === "function") { C[m] = () => {}; patched++; }
    }
    console.log(`${MODULE_ID} | suppressed monks-common-display camera (${patched} methods) — mobile-command owns the TV pan/zoom; MCD vision kept`);
  } catch (e) {
    console.warn(`${MODULE_ID} | could not suppress MCD camera; TV framing may be overridden`, e);
  }
}

// ── PLAIN WORDS ON A STAIRCASE (DM 2026-09-20: "change the text to something that sounds less sci-fi") ───────────
// Core's teleport confirmation is written for teleporters: the buttons say "Teleport" and "Don't Teleport" and the
// fallback question is "Do you want to teleport {token}?". On the Crooked House stairs that is jargon — the player is
// climbing a flight of stairs, not blinking across a starship. Each staircase already carries its own question
// ("Go up to the second floor?"); these are the strings core keeps for itself and a region cannot set.
//
// ⚠️ THESE ARE CORE KEYS. A module that rewrites them rewrites them for every world it is installed in, so this is
// gated on the Crooked Moon tools being on — which default on only when that module is active. A sci-fi table where
// "Teleport" is the right word keeps core's wording untouched.
function plainTeleportWording() {
  try {
    if (!game.settings.get(MODULE_ID, "crookedMoonTools")) return;
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

Hooks.once("setup", () => {
  plainTeleportWording();
  // D2: phones run canvasless. The canvas draws on world entry — AFTER setup,
  // BEFORE ready — and loading it crashes iOS Safari (confirmed on real
  // hardware 2026-06-13). So disable it here, before the draw, by writing the
  // exact localStorage key core reads at canvas-init time (foundry.mjs
  // #setClient: storage key is `${namespace}.${key}`, value JSON-encoded).
  // Phones: no canvas (D2). Everyone else (DM, TV): canvas ON. Set BOTH
  // directions so a browser that switches roles (e.g. a player account then
  // the DM in the same browser) self-corrects — core.noCanvas is per-browser
  // localStorage, so a leftover "true" from a phone session would otherwise
  // strand a GM without a canvas.
  try {
    const want = isPhoneClient();
    const current = game.settings.get("core", "noCanvas") === true;
    if (want !== current) {
      window.localStorage.setItem("core.noCanvas", want ? "true" : "false");
      console.log(`${MODULE_ID} | ${want ? "phone" : "non-phone"} client — canvas ${want ? "disabled" : "enabled"} (D2)`);
    }
  } catch (e) {
    console.warn(`${MODULE_ID} | could not set canvas mode`, e);
  }
});

Hooks.once("socketlib.ready", () => {
  initSocket();
});

Hooks.once("ready", () => {
  // §58.7 LAUNCH VOLUMES FIRST (DM 2026-11-16: "a set volume for everything that's defaulted on launch"): this screen's
  // Music / Environment / Interface to the mix's defaults, BEFORE the phone and DM-machine rules below silence theirs.
  try { applyLaunchVolumes({ isDisplay: isDisplayClient() }); } catch (e) { console.warn(`${MODULE_ID} | launch volumes`, e); }
  // Dicer's 3D dice off on a phone, back on if this browser stops being one (his requirement, deck-command SEAT 9)
  applyPhoneDice(isPhoneClient()).catch((e) => console.warn(`${MODULE_ID} | phone dice`, e));
  // Phones get nagged that the window is too small (core #validateResolution).
  // Nothing actually breaks for a DOM-only client; keep the suppression narrow.
  phoneQuietState.readyAt = Date.now();
  if (isPhoneClient()) {
    applyPhoneSettings().catch((e) => console.warn(`${MODULE_ID} | phone quiet settings`, e));
    suppressResolutionWarning();
    document.body.classList.add("mc-phone"); // scopes phone-only CSS (e.g. roll-dialog spacing)
    enableSafeAreaInsets(); // so env(safe-area-inset-*) is non-zero on iOS (B1 tab clearance)
    // Canvas-less phones must not run Sequencer's CANVAS effects: they construct
    // PlaceableObjects against a canvas that doesn't exist and throw ("You must
    // provide an embedded Document instance…" — the Shield-reaction error,
    // FINDINGS 2026-07-05 B3). effectsEnabled is client-scoped, so flipping it
    // here sticks per-browser; sounds stay on (phones play their own SFX).
    try {
      if (game.modules.get("sequencer")?.active && game.settings.get("sequencer", "effectsEnabled")) {
        game.settings.set("sequencer", "effectsEnabled", false);
        console.log(`${MODULE_ID} | phone client — Sequencer canvas effects disabled (no canvas here; takes effect next reload)`);
      }
    } catch (e) { /* sequencer absent or its setting key moved */ }
    // iPhone has NO Fullscreen API — "Add to Home Screen" is the fullscreen there.
    // These metas make that home-screen launch chromeless (standalone). Android
    // gets the real fullscreen toggle in the shell (Details → Go full screen).
    for (const [name, content] of [["apple-mobile-web-app-capable", "yes"], ["mobile-web-app-capable", "yes"], ["apple-mobile-web-app-status-bar-style", "black-translucent"]]) {
      if (!document.head.querySelector(`meta[name="${name}"]`)) {
        const m = document.createElement("meta"); m.name = name; m.content = content; document.head.appendChild(m);
      }
    }
    // THE ROOM HAS ONE SET OF SPEAKERS, AND IT ISN'T IN ANYONE'S POCKET (DM 2026-08-08: "I'm
    // getting environmental sound from my phone, that's no good"). Six phones each playing the
    // same ambience half a second apart is worse than silence — the TV is the speaker. Music and
    // environment go to zero; INTERFACE stays, so the player still hears their own dice and UI.
    // Client-scoped settings, so this is per-device and the sliders remain in Foundry's audio
    // controls if someone wants them back. World setting `phoneSilentAudio` turns it off.
    // §39.5 …AND ONLINE, THE STREAM IS THE SPEAKERS. The SCREEN decides, not the room: the DM
    // confirmed (2026-08-20) his stream carries the game's audio, so a shared screen online
    // means phone + stream would play the same soundscape at an offset — the same doubling the
    // at-table rule exists for. Phones keep their own sound ONLY at a table with no shared
    // screen at all, where they are the player's one speaker. We only ever un-mute a phone we
    // muted ourselves.
    try {
      let silent = true;
      try { silent = !!game.settings.get(MODULE_ID, "phoneSilentAudio"); } catch (e) { /* default on */ }
      if (isOnlineTable() && !hasSharedScreen()) silent = false;
      const keys = ["globalPlaylistVolume", "globalAmbientVolume"];
      if (silent) {
        let did = false;
        for (const key of keys) {
          if (game.settings.get("core", key) !== 0) {
            game.settings.set("core", key, 0);
            did = true;
            console.log(`${MODULE_ID} | phone client — ${key} silenced (the TV is the room's speaker)`);
          }
        }
        if (did) game.settings.set(MODULE_ID, "phoneAudioSilenced", true);
      } else if (game.settings.get(MODULE_ID, "phoneAudioSilenced")) {
        // Foundry's own default level — we zeroed these without recording what they were, and a
        // level the player never chose is better restored to the one Foundry ships than left dead.
        const back = { globalPlaylistVolume: SLIDER_DEFAULT.music, globalAmbientVolume: SLIDER_DEFAULT.environment }; // §58.7: the launch defaults
        for (const key of keys) if (game.settings.get("core", key) === 0) game.settings.set("core", key, back[key] ?? 0.5);
        game.settings.set(MODULE_ID, "phoneAudioSilenced", false);
        console.log(`${MODULE_ID} | phone client — music/ambience restored (this table plays online)`);
      }
    } catch (e) { console.warn(`${MODULE_ID} | could not set phone audio`, e); }
    // Players can't reach the chat roll-mode dropdown from the shell, so pin their
    // default to PUBLIC — every roll then shows on the shared TV (and in chat).
    try {
      if (game.settings.get("core", "rollMode") !== CONST.DICE_ROLL_MODES.PUBLIC) {
        game.settings.set("core", "rollMode", CONST.DICE_ROLL_MODES.PUBLIC);
      }
    } catch (e) { console.warn(`${MODULE_ID} | could not set public roll mode`, e); }
  }

  // TV (display role): canvas-only clean view. mc-display marks the role; mc-clean
  // hides the chrome (toggle with the keybinding to reach settings). Runtime-only —
  // disabling the module just stops adding these classes, so it auto-reverts.
  if (isDisplayClient()) {
    // §22.9 CLEAN MODE IS WHAT HID HIS FOUNDRY. `mc-clean` hides every piece of core UI
    // (styles/shell.css, the clean block) and this is the only place that applies it
    // automatically. The primary lock is in isDisplayClient() itself: a GM client can no longer
    // reach this block at all unless THIS DEVICE's role was explicitly set to "display", which is
    // a deliberate and reversible choice. This is the second lock on the same door — it only ever
    // differs from the first when the `?mcNoCover=1` / localStorage escape hatch is in play, which
    // is precisely the case where someone is recovering a screen and must not be hidden again.
    const clean = !shouldKeepGmClear();
    document.body.classList.add("mc-display");
    if (clean) { document.body.classList.add("mc-clean"); showCleanHint(); }
    else console.warn(`${MODULE_ID} | display role, but the no-cover escape hatch is set on this client — leaving the Foundry UI visible (§22.9). Clear ?mcNoCover=1 / localStorage["mc.noCover"] and reload to let the TV go clean again.`);
    warnDisplayGM(); suppressMcdCamera(); mountTvCompass();
    registerTvCarousel(); // the fight carousel fades in on the TV while a fight is on (shell.css, tv-carousel.js)
    // The TV is the screen that SHOULD show spell/attack VFX. Sequencer's effectsEnabled is
    // client-scoped and STICKY — if this browser was ever a phone (we disable it there), it stays off,
    // so animations vanish on the TV while the DM still sees them (DM 2026-07-20). Force it back on.
    try {
      if (game.modules.get("sequencer")?.active && !game.settings.get("sequencer", "effectsEnabled")) {
        game.settings.set("sequencer", "effectsEnabled", true);
        console.log(`${MODULE_ID} | display client — re-enabled Sequencer canvas effects (takes effect on the next reload of this TV)`);
      }
    } catch (e) { /* sequencer absent or its setting key moved */ }
    // Kill the ORANGE controlled-token borders on the TV: Monk's Common Display
    // CONTROLS the party tokens to merge vision, and controlled tokens draw an
    // orange border (CONFIG.Canvas dispositionColors.CONTROLLED). View-only screen
    // → no borders at all (DM 2026-07-03).
    Hooks.on("refreshToken", (t) => { try { t.border?.clear?.(); } catch (e) { /* border internals moved */ } });
  }

  // TV camera remote control: receive DM commands (display clients act), and on the
  // DM side mirror pan/zoom to the display while manual mode is on (throttled — the
  // canvasPan hook fires rapidly during a drag).
  game.socket.on(`module.${MODULE_ID}`, onTvControl);
  Hooks.on("canvasPan", (_c, view) => {
    if (!dmRelaying || !view) return;
    const now = Date.now();
    const send = () => { _lastPan = Date.now(); tvBroadcast({ cmd: "pan", x: view.x, y: view.y, scale: view.scale }); };
    clearTimeout(_panTimer);
    if (now - _lastPan > 80) send(); else _panTimer = setTimeout(send, 80 - (now - _lastPan));
  });
  // TV camera follow (display only): in combat keep the ACTIVE token spotlit; out of
  // combat keep the whole party + 40 ft buffer framed. Each self-gates on combat state.
  Hooks.on("updateToken", (tokenDoc, changes) => {
    if (game.combat?.started) tvCombatFollow(tokenDoc, changes);
    else tvPartyFollow(tokenDoc, changes);
    // Follow-set change (Follow Everyone / None / solo) → reframe off the synced flag update, not the
    // racing frameParty broadcast. Fires regardless of movement; self-gates on display/manual/combat.
    if (touchesNoFollowFlag(changes)) reframeOnFollowChange();
  });
  // A new scene is a new frame — a scale and a clearance measured on the old map mean nothing here.
  Hooks.on("canvasReady", resetTvFrame);
  // On turn change / combat start: a zoom-out→zoom-in pulse on the whole party (camera)
  // + re-point vision (POV) on the active combatant. refreshCombatVision self-gates on
  // the opt-in setting.
  Hooks.on("updateCombat", (_combat, changed) => {
    if ("turn" in changed || "round" in changed) { tvCombatTurnPulse(); refreshCombatVision(); }
  });
  Hooks.on("combatStart", () => { tvCombatTurnPulse(); refreshCombatVision(); });
  // Auto-sync PC token sight from senses at combat start, when the POV feature is on.
  // Runs on the PRIMARY GM — only a GM can update every token (a player would silently
  // skip tokens it doesn't own, which is likely why darkvision wasn't applying). Removes
  // the manual console step so darkvision/tremorsense actually register on the tokens.
  Hooks.on("combatStart", () => {
    try {
      const primaryGM = game.user.isGM && (game.users?.activeGM?.id ?? game.user.id) === game.user.id;
      if (primaryGM && game.settings.get(MODULE_ID, "combatPovVision")) syncPartyTokenSight();
    } catch (e) { /* best-effort */ }
  });
  // After any advancement (char-gen build or a level-up), a caster's spell-slot MAX is
  // raised but the current value stays at 0 — so a freshly built/levelled caster shows
  // 0 usable slots until a long rest. Top each slot up to its max on the client that ran
  // the advancement (it owns the actor). Fill UP only — never reduce — so an advancement
  // taken mid-session can't wipe slots a player already spent.
  Hooks.on("dnd5e.advancementManagerComplete", (manager) => {
    try {
      const actor = manager?.actor;
      if (!actor?.isOwner) return;
      const spells = actor.system?.spells; if (!spells) return;
      const update = {};
      for (const [key, slot] of Object.entries(spells)) {
        const max = slot?.max ?? 0;
        if (max > 0 && (slot.value ?? 0) < max) update[`system.spells.${key}.value`] = max;
      }
      if (Object.keys(update).length) actor.update(update).catch(e => console.error(`${MODULE_ID} | spell-slot top-up failed`, e));
    } catch (e) { console.error(`${MODULE_ID} | spell-slot top-up failed`, e); }
  });

  injectShellStyles(); // load CSS via JS so a plain F5 works without re-reading the manifest
  // §22.7 THE SAFETY RAIL, FIRST — before registerFxEngine()'s syncFx() can mount anything and
  // before any of our overlays exist. A GM at a desktop without the opt-in gets body.mc-dm-clear
  // (the CSS half, which also catches whatever mounts later) plus a sweep of anything already up.
  // This has to follow injectShellStyles() — the rule it relies on lives in that stylesheet — and
  // precede everything that can build a layer. It no-ops on every other kind of client.
  installOverlayGuard();
  initSocket(); // idempotent fallback in case socketlib.ready raced or didn't fire
  registerFxEngine(); // §26 Effects tab: apply/remove screen filters + ambience loops as fxActive changes (all clients; phones flash-only)
  registerEntranceShadow(); // §40.6 a reveal's token drawn in shadow until its intro completes (every canvas client)
  initPauseGuard();
  registerDaylight(); // §41: scene darkness follows the world clock (executor-gated inside)
  registerTwists(); // §31 v2: armed twists land on the next d20 (all clients — the roller forces its own die)
  registerMoonsDue(initSocket()); // the Moon's Due: a player's natural 1 offers Redirect; a redirected roll can't crit (all clients)
  if (isDisplayClient()) initMoonTv(); // …and the table sees the bank as a crescent on the TV
  registerDruskenvald(); // §43: the named hour + sky on the shared screen (gates itself)
  registerCharacterFiles(); // §44: compile each PC's book on a timer (executor-only, dirty-checked)
  registerDeeds(); // §44.4: the Deeds recorder — event-driven, bounded flag per PC (chapter 8 reads it)
  if (!isPhoneClient()) initPauseOverlay(); // corner spinners replace the "GAME PAUSED" bar (phones have their own overlay)
  if (!isPhoneClient()) initHeartbeat();    // critical-HP heartbeat pulse on PC token rings (canvas only)
  startHeartbeat();
  registerShellHooks();
  // Spell Book opens after a Hero Mancer level-up that raised a spell count (DM 2026-11-12; spellbook-phone.js)
  try { installSpellBookAfterLevelUp({ isPhone: isPhoneClient }); } catch (e) { console.warn(`${MODULE_ID} | spell book after level-up`, e); }
  // PREPARE SPELLS (D-0106): a long rest opens each class's swap window (Spell Book's swap rule); on a phone, Spell
  // Book's own 450 px long-rest prompt is closed, because the phone's rest card offers "Change Prepared Spells" instead.
  Hooks.on("dnd5e.restCompleted", (actor, result) => { openWindowsAfterRest(actor, result).catch((e) => console.warn(`${MODULE_ID} | prepare after rest`, e)); });
  if (isPhoneClient()) Hooks.on("renderDialogV2", (app) => { try { if (phonePrepareOn() && isSpellBookRestPrompt(app)) app.close(); } catch (e) { /* not ours */ } });
  registerDMPanel(); // DM-assign panel (GM clients only; self-gates)
  maybePromptDmWizard(); // §16.3 first-run setup offer (GM only; once per world)
  suppressAutomatedAnimationsTips(); // one-time: quiet AA's "Persistent Effect" toast on sleeping tokens
  // The TV/display account must sit at OBSERVER, never OWNER: OWNER puts it in midi's prompt
  // routing (playerForActor matches OWNER by strict equality) and it wins over the real player
  // because it's always connected — the Shield bug. Worlds set up before 2026-07-21 have OWNER
  // grants baked in, so level them down once, on the executor, at startup. Idempotent: after the
  // first pass every actor already reads OBSERVER and this writes nothing.
  try { const tv = displayUserId(); if (tv) syncDisplayObserver(tv, { quiet: true }); } catch (e) { /* best-effort */ }
  // (The user.character tracer from 2026-07-09 retired with the assignment requirement itself —
  //  nothing routes on user.character any more, so a drifting slot is no longer a bug.)
  registerSaveRelay(); // executor relays midi save requests to phones (self-gates on isExecutor)
  registerReactionNotifier(); // DM toast when a player gets a reaction window (self-gates)
  registerSummonOwnership(); // summoned-creature control chip for the DM (self-gates on isExecutor)
  registerDialogWatchdog(); // executor alerts DM + pings phone when an action strands a dialog (self-gates)
  setupDisplayAudioListeners(); // the TV hears positional sound from the party (it controls nothing + is only an Observer)
  setupDisplayAudioUnlock();    // …and can actually play it: browsers need one tap before any audio starts
  setupTvVisionCard({ isDisplayClient, moduleId: MODULE_ID, fitScene: fitSceneLocal }); // …and says "No PCs in scene" when it has no one to see through (§23.7)
  setupAudioResume();           // …and on iPad Safari the contexts core made can stay paused until a tap resumes them
  setupTvVolumes();             // the TV mirrors the DM's chosen volumes (its own are unreachable at the table)
  setupNoDoubleTapMinimize(); // no window collapses to a stranded title bar on an accidental double-tap
  setupGMCursorHiding(); // hide the GM's broadcast cursor on other screens (keep pings); reads hideGMCursor live
  setupDMOmniscientVision(); // keep the DM's canvas omniscient when a token is selected (shared-screen tables)
  setupDisplayItemPileNames(); // hide item-pile token names on the shared TV (spoiler/clutter)
  setupAutoOwnNewPCs(); // auto-own new PCs for the display/TV account (opt-in; see displayOwnerUser)
  registerPartyTeleportActivation(); // party token teleports to a new scene → activate it (TV follows; primary-GM-gated)
  registerTrainFollow(); // §37 the whole party crosses a train-car door → that car goes active (same setting gate)
  /**
   * ⚠️ A RIDE ALREADY RUNNING MUST PICK UP ITS OWN EFFECTS (DM 2026-10-11: *"No shakes btw"*).
   *
   * The jolt and the loop are started by `setRide`, which only runs when the key is PRESSED. His
   * mist had been on since the day before, so on every reload since there was a train visibly
   * running outside the windows with no sound and no tremor — and the only way to get them was to
   * stop the train and start it again, which is not a thing anyone would think to do.
   *
   * The mist is the state of record (`trainMistOn` reads his tiles), so it is also the thing to
   * resume from. Primary-GM-gated inside each call, so the other clients ignore this.
   * ⚠️ 2026-11-07: only where the train is. It resumed over the Crooked House on a GM load; now the loop and the
   * jolts follow the active scene (`followRideScene`, cm-train.js), here and on every scene change after.
   */
  // every client: a stage scene (the landing room, where Start ride is pressed) readies the ride's loop here, so the
  // table hears the train the moment the press says play (deck-command D-0108; seat Start ride (3): the TV +2.1 s)
  const primeOnStage = () => { try { if (canvas?.scene?.getFlag?.(MODULE_ID, "stage")) primeRideSound().catch(() => {}); } catch (e) { /* no canvas */ } };
  Hooks.on("canvasReady", primeOnStage); primeOnStage();
  try { registerRideFollow(); followRideScene().catch((e) => console.warn(`${MODULE_ID} | the ride's effects`, e?.message)); }
  catch (e) { console.warn(`${MODULE_ID} | could not resume the ride's effects`, e?.message); }
  // ⚠️ ONE-SHOT, primary GM only, guarded by its own setting: take the weather suppression off the
  // train cars so the jolt is visible inside a carriage (his ruling 2026-10-13). See cm-train.js.
  freeTrainWeather().catch((e) => console.warn(`${MODULE_ID} | freeTrainWeather`, e?.message));
  // ⚠️ ONE-SHOT, the same way: the Crooked House's door sounds, stairs and fight music put back into the
  // Crooked Moon worlds (DM 2026-11-08, Lost Lore #17/#18). Additive only; see cm-house.js.
  restoreCrookedHouse().catch((e) => console.warn(`${MODULE_ID} | restoreCrookedHouse`, e?.message));
  // ⚠️ ONE-SHOT, the same way: the attic's two book rooms get Music regions (DM 2026-11-17, §59). See cm-attic.js.
  makeAtticRooms().catch((e) => console.warn(`${MODULE_ID} | makeAtticRooms`, e?.message));
  // ⚠️ ONE-SHOT, the same way, once the trap door's square is known: the attic ladder's two ends (DM 2026-11-27). cm-house.js.
  makeAtticLadder().catch((e) => console.warn(`${MODULE_ID} | makeAtticLadder`, e?.message));
  // a sealed crossing (the trap door) must be a DISABLED teleport, never an enabled empty one (D-0240; the system check's HARD FAIL)
  makeAtticLadder().then(() => keepSealsInert()).catch((e) => console.warn(`${MODULE_ID} | keepSealsInert`, e?.message));
  // ⚠️ ONE-SHOT, the same way: his approved default soundtracks (Druskenvald, Wickermoor Hollow; DM 2026-11-17, §59).
  musicAdoptApprovedOnce().catch((e) => console.warn(`${MODULE_ID} | default music`, e?.message));
  setupCalendarSkin(); // SC Reborn's popup = the table's "Calendar": retitle (tool column hidden in CSS)
  Hooks.on("updateSetting", redrawCalendarAfterSave); // §22.11: a player's calendar catches up when the GM's save lands
  registerAoO(); // opportunity-attack movement watcher (executor-gated inside; see aoo.js)
  // GPS asks a phone to run a reaction's item use; a phone has no canvas, so the executor runs it (gps-bridge.js)
  try { if (isPhoneClient()) forwardGpsWorkflows({ isPhone: () => isPhoneClient(), executor: () => game.users.get(resolveExecutorId()) ?? null }); }
  catch (e) { console.warn(`${MODULE_ID} | gps bridge`, e?.message ?? e); }
  // SEAT 22: a GPS question mid-roll is waited out (every client); GPS sets up only fights that start while it is on,
  // and the active GM clears its leftovers at load, when a fight ends and when one is deleted (gps-bridge.js).
  if (gpsActive()) {
    try { trackGpsPrompts(); } catch (e) { console.warn(`${MODULE_ID} | gps prompts`, e?.message ?? e); }
    const guard = () => { try { guardGpsOa(); } catch (e) { console.warn(`${MODULE_ID} | gps oa guard`, e?.message ?? e); } };
    guard(); setTimeout(guard, 1000);
  }
  // SEAT 23 (b): the sweep runs on the GM whether GPS is on or not — disabling GPS first, cleaning later, is the
  // seat's own path, and a load with GPS off clears everything it left.
  if (game.user.isGM) {
    const sweep = () => clearGpsOa().catch((e) => console.warn(`${MODULE_ID} | gps oa sweep`, e?.message ?? e));
    setTimeout(sweep, 5000);
    Hooks.on("deleteCombat", () => setTimeout(sweep, 1500));
    Hooks.on("updateCombat", (c, chg) => { if (chg && "round" in chg && Number(chg.round) === 0) setTimeout(sweep, 1500); });
  }
  registerFog(); // fog-of-war edge styles on the display (off/soft/gpu via `fogStyle`; see fog-soft.js)
  registerMusic();       // rooms, battle, Phase 2, cues — crossfaded; the primary GM drives (music.js)
  registerSyrinscapeBridge(); // a Syrinscape entry plays its local twin while Local/offline, and stops at a fade's start
  registerSoundMix();         // the table's one mix: music / environment / cues layers after every screen's sliders (§58). AFTER the bridge: it wraps the bridge's seam
  registerSoundZones();       // §59.6: a sound full in its room, lower outside it (the attic's chanting)
  registerCombatMusic(); // per-PC themes + battle track over combat turns (primary GM drives; see combat-music.js)
  registerCampaigns();   // §50: Ember's creation sheet gets the small-screen fit-shim (no-op elsewhere)

  globalThis.MobileCommand = {
    ...api,
    // THE DECK'S REACH (MC redesign phase 4.1, DM 2026-11-26): Deck Command reports whether the deck is reachable (service
    // up, deck plugged in, this screen drives it); MC's "Run from: Auto" goes compact while it is, and grows back at
    // once when it drops (one notice). Shrinking back is offered on the panel's pill, never done under the DM's hand.
    deck: {
      report: (reachable) => {
        let rf = "auto"; try { rf = game.settings.get(MODULE_ID, "runFrom") || "auto"; } catch (e) { /* pre-ready */ }
        const what = reportDeck(reachable, rf);
        if (what === "lost") notifier.info("Deck lost: the full panel is back.");
        refreshPanel();
        return what;
      },
      compact: () => panelCompact(),
    },
    // ANOTHER MODULE'S QUESTION FOR THE DM, on the deck's Notifications row (deck-command D-0197, the Maim offer):
    // register its kind once, raise and settle its asks (executor only). See actions-asks.js and rpc.js raiseOutsideAsk.
    asks: { register: registerAskKind, raise: raiseOutsideAsk, settle: settleOutsideAsk, pending: () => pendingAsks() },
    // THE MOON'S DUE (DM 2026-11-26): the deck's key reads the count and wears the crescent of that count
    moon: { due: () => moonsDue(), cap: MOON_CAP, art: (n = moonsDue()) => moonArt(n), set: (n) => setMoonsDue(n) },
    enforcer: { diff: diffPreset, apply: applyPreset, prompt: checkAndPrompt, deactivate, reactivate, revert: deactivate, hasBackup },
    train: { wire: wireTrainDoors, ride: setTrainMist, sound: setTrainSound, preload: preloadRideSound, jolt: setTrainJolt, joltNow, riding: trainMistOn, hasWindows: trainCarHasWindows, setWindows: setTrainWindows, freeWeather: (o) => freeTrainWeather({ force: true, ...o }) }, // §37 macro access (§8.1 manual triggers)
    // A character's Fated Tarot face, only once it has been turned (`shown`); null while face down or undrawn. Read by Deck
    // Command's landing table (deck-command D-0231): the card on the table turns when Adela's does.
    bossToys: () => bossToys(), // the bosses that become toys on the deck's landing desk (deck-command D-0243)
    figurines: () => figurines(), // the 13 Dark Bargains' figurines, for the deck's Bargain key (deck-command D-0235)
    cardFace: (actor) => { const c = actorCard(actor); return c?.shown ? cardFace(c) : null; },
    // A player's active PC (§38.4b): the DM's pick, else their assigned character. Deck Command's landing table drops, turns and
    // names by it, and swaps the cage's token when the pick changes (deck-command D-0241).
    activePC: (user) => activePC(user),
    house: { restore: (o) => restoreCrookedHouse({ force: true, ...o }), plan: () => planHouseNow(), atticRooms: (o) => makeAtticRooms({ force: true, ...o }), atticLadder: (o) => makeAtticLadder({ force: true, ...o }), atticPlan: () => planAtticNow(), zones: () => { syncSoundZones(); return soundMixState().zones; } }, // the Crooked House put-back (§8.1 manual trigger)
    soundScenes: { state: soundScenesState, set: setSoundScenes, mix: setSoundMix, mixState: soundMixState, master: { get: getSoundMaster, set: setSoundMaster, step: stepSoundMaster }, trim: setSoundTrim, trims: getSoundTrims, levels: setSyrinscapeLevels, applyLevels: syncSyrinscapeLevels }, // Syrinscape or local (deck-command D-0116): the deck's Music drawer switch; mix = the table's layers (§58; levels is retired)
    /**
     * §18/§41 TRAVEL, READ-ONLY — what a second surface needs to draw its own travel keys
     * (deck-command D-0065). The VERBS are published as actions (`travel.*`), which is the
     * proper seam; this is only the state those keys cannot get from a row: which map is the
     * travel map, and whether the party has stopped somewhere.
     *
     * ⚠️ READ-ONLY ON PURPOSE. Nothing here sets anything. The deck presses `travel.begin`,
     * `travel.route`, `travel.go` and `travel.stop` like any other consumer, and MC stays a list
     * rather than a client.
     */
    travel: {
      state: () => travelState(),
      mapId: () => { try { return game.settings.get(MODULE_ID, "travelOverworldSceneId") || null; } catch { return null; } },
      onMap: () => { try { const id = game.settings.get(MODULE_ID, "travelOverworldSceneId"); return Boolean(id) && canvas?.scene?.id === id; } catch { return false; } },
    },
    openShell,
    closeShell,
    // §22.7/§22.9 RECOVERY FROM THE CONSOLE — the one route that still works with no UI at all,
    // and the reason it must stay on this object: with the UI hidden there is no Module Settings
    // to reach, and (per the DM's own constraint) a module cannot be disabled from inside a world.
    //
    // showUI() does both halves and reports WHICH switch was responsible, so one paste both fixes
    // the screen and ends the diagnosis. It writes nothing and needs no reload.
    showUI: () => {
      const restored = restoreCoreUi();        // §22.9 un-hide core UI (clean mode)
      const uncovered = sweepCoveringLayers(); // §22.7 hide anything covering it
      const d = (id) => { const el = document.getElementById(id); return el ? getComputedStyle(el).display : "absent"; };
      return {
        // What was actually wrong, in the order worth reading:
        restored, uncovered,
        // …and which of the only three switches that can hide core UI was set. `role` is
        // per-device, `displayOwnerUser` is world-wide, and the ` keybinding is neither.
        why: {
          bodyClasses: document.body.className,
          role: (() => { try { return game.settings.get(MODULE_ID, "role"); } catch (e) { return "?"; } })(),
          displayAccount: (() => { try { return game.settings.get(MODULE_ID, "displayOwnerUser") || "(none)"; } catch (e) { return "?"; } })(),
          displayAccountIsMe: (() => { try { return game.user.id === game.settings.get(MODULE_ID, "displayOwnerUser"); } catch (e) { return "?"; } })(),
          railArmed: shouldKeepGmClear()
        },
        // Proof, from the live DOM, using the Foundry 14 ids (not v13's #navigation/#controls):
        coreUi: { "#ui-top": d("ui-top"), "#ui-left": d("ui-left"), "#ui-right": d("ui-right"), "#scene-navigation": d("scene-navigation"), "#scene-controls": d("scene-controls"), "#sidebar": d("sidebar"), "#hotbar": d("hotbar"), "#players": d("players") },
        stillOnForTheTable: stuckOverlayStates()
      };
    },
    // Kept as the narrower §22.7 call: sweep covering layers and arm the rail for this session.
    uncover: () => ({
      railActive: shouldKeepGmClear(),
      hidden: forceRail().hidden,
      alreadyHidden: clearedLayers(),
      stillOnForTheTable: stuckOverlayStates()
    }),
    restoreCoreUi,
    // §22.8: overlay-guard calls this back through the API rather than importing gametime.js,
    // which would close a cycle (gametime imports overlay-guard).
    applyCalendarSkinClass,
    sweepOverlays: sweepCoveringLayers,  // sweep once, unconditionally (the manual hammer)
    reapplyRail: reapplyGuard,           // re-decide in both directions (the dmScreenOverlays onChange)
    overlayStates: stuckOverlayStates,   // which persisted world states would raise a board
    verifyRail,                          // do the CSS and JS halves of the rail still agree?
    // §25.2 the battle tracks, and the choice, for any surface that wants to offer them — the
    // Combat tab's staging was the only thing that could see them (combat-music.js `combatTracks`).
    combatTracks,
    setCombatTrack,
    // THE MUSIC LAYER, for any surface (the deck's Music key and drawer; a cue step `music:`).
    // state() answers what is playing and what is pinned; the verbs write the shared state the
    // primary GM acts on. Hook "mobile-command.music" fires with state() on every change.
    music: { state: musicState, pick: musicPick, next: musicNext, cue: musicCue, roomOf: musicRoomOf, overlap: musicOverlap, duck: musicDuck, adoptSceneMusic: musicAdoptSceneMusic, hold: musicHold, release: musicRelease, moods: () => musicMoods().map((p) => ({ uuid: p.uuid, name: p.name })) },
    frameParty: framePartyTokens,        // local canvas only
    focusParty: focusPartyAll,           // here + the display(s) + exit manual
    toggleTvManual,                      // DM drives the display by panning own view
    tvManualActive: isTvManualActive,
    tvZoom,                              // zoom the display in/out (factor >1 in, <1 out) — Stream Deck via macro
    tvFitScene,                          // frame the whole scene on the display ("Fit whole scene")
    tvFrameRect,                         // frame {x,y,width,height} on the display (deck-command "Frame room")
    tvPanTo,                             // glide the display to {x,y}, zoom kept (deck-command "To pin")
    refreshSoftFog: refreshFog,          // (display) re-apply/clear fog-edge style on the setting change (name kept for callers)
    refreshFog,                          // (display) re-apply/clear fog-edge style (off/soft/gpu)
    // What the follow thinks the DM's frame is (§23). Run on the DISPLAY client when the camera
    // misbehaves: it separates "captured the wrong clearance" from "the pan maths is wrong".
    tvFrameInfo: () => ({ scale: tvFrameScale, clearanceFt: tvClearanceFt, measuredFt: canvas?.ready ? measureClearanceFt() : null }),
    refreshCombatVision,                 // re-apply combat POV vision on the display (settings onChange + manual)
    refreshPanel,                        // repaint the DM panel (used by the display's audio report)
    refreshTableMode: cardTableRefreshMode, // §39 in person ⇄ online: re-lay the card table's seats
    playBossIntro: dmPlayBossIntro,      // §40 macro/Stream Deck access to a boss's entrance (§8.1)
    // the configured bosses, for Deck Command's Boss intro pick (2026-11-13): id, name and the art the entrance shows
    bosses: () => bossList().map((b) => { const a = game.actors.get(b.actorId); return a ? { id: b.id, name: a.name, img: bossImage(a) } : null; }).filter(Boolean),
    // ONE RECORDING ON THE TABLE'S SPEAKERS, for a beat somebody else owns — deck-command's action keys call
    // this (DM 2026-09-18: a whole-room sound plays on every screen at a plain table, but only on the TV at an
    // MC table). It is §26's `fxSound` one-shot: broadcast to every client, and phones drop it because their
    // environment channel is silent (§14), so the room hears it from the TV and the DM's own monitor and nobody
    // gets a tinny second copy out of a pocket. Takes { src, volume, at, radius, fadeAfter, fadeMs }; with `at`
    // and `radius` it plays positionally through the walls instead of flat.
    playSound: (o = {}) => dmFireFx("fxSound", o),
    // §40.6 the themed entrances ("Intros"): play one by key (see entrances()), or cut the running one short.
    playEntrance: dmPlayEntrance,
    stopEntrance: dmStopEntrance,
    entrances: () => entranceList().map(e => ({ key: e.key, name: e.name, sub: e.sub, chapter: e.chapter, portrait: e.portrait, hold: e.hold, outMs: 1200 })), // hold/outMs: how long the banner holds the screen (deck-command D-0129 plays a group's entrances one after another)
    // §41 put the CURRENT scene at the clock's darkness right now — the manual trigger beside the
    // automatic one (§8.1), and what the setting's onChange calls when you switch it back on.
    applyDaylightNow: () => applyDaylight(canvas?.scene ?? game.scenes?.active, { animate: 1200 }),
    // the darkness the clock gives THIS scene now (a train car half of it, D-0108): Deck Command's Start ride fades to it
    darknessFor: (scene) => darknessNow(scene ?? null),
    compileCharacterFiles,               // §44 rebuild every PC's file now (macro access)
    // §47: the same block the panel's "Message for dev" button produces, for anyone on any client —
    // a player on a phone can run this from a macro and paste the result.
    devReport: (note = "") => buildDevReport(note),
    // §48: the feedback window, openable from anywhere — a macro a player can be handed, the
    // console, or a keybinding.
    feedback: openFeedback,
    syncPartyTokenSight,                 // GM: set each PC token's sight/detection from its dnd5e senses
    resolveExecutorId,
    isExecutor,
    // §52 (deck-command ledger 151): every DM action the panel offers mid-session, as data plus one
    // runner — so a second surface can draw and run them without knowing MC. GM clients only.
    actions: { areas: actionAreas, snapshot: actionSnapshot, run: runAction, counts: actionCounts },
    // open the DM panel on a dock tab (2026-09-27): the deck fires the spirit board and brings the
    // replies tab forward with it. A general verb; the deck is one caller.
    openDock,
    // §53 the cues that play themselves: list / fire / mute / reset / armed — the deck's per-scene list
    // (catalogue 232) and the fire-now keys read this. GM clients only.
    cues
  };

  maybeAutoOpenShell();

  if (game.user.isGM && game.settings.get(MODULE_ID, "enforcerAutoPrompt")) {
    checkAndPrompt();
  }

  console.log(`${MODULE_ID} | ready — executor: ${resolveExecutorId() ?? "none"} (this client: ${isExecutor()})`);
});

// Hide the GM's broadcast cursor on player/display screens (DM request 2026-06-25): the
// GM's mouse otherwise glides around constantly. Pings stay fully working — they live on
// separate ControlsLayer methods (handlePing/drawPing) we never touch — so the GM still
// points by pinging. Two complementary patches on the layer prototype (applies to every
// client): drawCursor skips GM cursors at initial draw, and updateCursor passes a NULL
// position for GM users, which reuses Foundry's own hide-on-null teardown (no reimpl).
// Both read the setting LIVE, so toggling hideGMCursor takes effect on the GM's next move.
// The GM's own client is unaffected — it never renders its own broadcast cursor.
// No window is minimizable by double-tapping its header (DM 2026-07-21: double-tapping the
// Calendar header "minimizes the popup in a strange way" — a collapsed title bar stranded over the
// canvas, which on a touch screen you hit by accident constantly and can't obviously undo).
//
// One capture-phase listener instead of patching two prototypes: ApplicationV2 binds
// `header.dblclick → #onWindowDoubleClick` (application.mjs:1885) and AppV1 binds
// `header.dblclick → _onToggleMinimize` (application-v1.mjs:571). Both are listeners on the header
// element itself, so a capture-phase handler on `document` runs FIRST and can stop the event before
// either sees it. That also covers third-party windows (Simple Calendar Reborn's MainApp is the one
// that bit us) without knowing anything about them.
//
// Deliberately narrow: this kills the *accidental gesture*, not the feature. A real minimize
// control in a V2 header is a single click carrying a data-action, so it still works — and that's
// the one a DM presses on purpose.
function setupNoDoubleTapMinimize() {
  document.addEventListener("dblclick", (ev) => {
    try {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (!t.closest(".window-header")) return;
      // Let real controls through — buttons, links, and anything action-bound.
      if (t.closest("[data-action], button, a, input, select")) return;
      ev.preventDefault();
      ev.stopPropagation();
    } catch (e) { /* never break a click handler */ }
  }, true); // capture: beat the header's own listener
}

// Positional ambient sound on the shared display (2026-07-22). Core picks listener positions from
// CONTROLLED tokens, falling back — for non-GMs only — to every token whose actor the user OWNS
// (SoundsLayer#getListenerPositions, client/canvas/layers/sounds.mjs). The TV satisfies NEITHER: it
// deliberately controls nothing (releaseAll is what keeps merged party vision alive — see
// refreshCombatVision) and it has only been an OBSERVER since 2026-07-21, so isOwner is false on
// every PC. Measured on Cave A: 4 ambient sounds, 0 listeners — every positional sound silent on
// the one machine that actually plays the table's audio.
//
// So the display listens from the PARTY's tokens — the same set the camera frames, pets included.
// Core's own rule still decides loudness: _syncPositions keeps the CLOSEST listener to each source,
// so a brazier or a waterfall swells as the party walks toward it. Only the FALLBACK is ours; the
// moment anything is actually controlled, core's answer stands untouched.
//
// …AND THE DM'S OWN SCREEN (§53, catalogue 230, DM go 2026-09-20). The same core rule leaves a GM who
// controls no token stone deaf to every ambient sound — so the DM would place a ticking clock and hear
// silence, and could judge none of the cues that play themselves. The display's fallback now serves the
// GM's client too (world setting `dmHearsTable`, on by default): with nothing selected he hears the
// scene from the party's tokens, exactly as the TV does; select a token and core's own answer is back.
// Only the LISTENERS are shared — the combat POV and the follow filter stay the display's.
// SEAT 13 (2026-11-23): core's `Sound.fade → linearRampToValueAtTime … non-finite` from this refresh on a token delete —
// the token on its way out can still be in `placeables` with no real position, and one NaN listener makes every
// ambient sound's volume NaN. Only finite points listen.
function finitePoint(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.elevation === undefined || Number.isFinite(p.elevation));
}

function setupDisplayAudioListeners() {
  const dmHears = () => {
    try { return !!game.user?.isGM && !isDisplayClient() && !isPhoneClient() && !!game.settings.get(MODULE_ID, "dmHearsTable"); } catch (e) { return false; }
  };
  const hearsFromParty = () => isDisplayClient() || dmHears();
  const patch = () => {
    try {
      if (!hearsFromParty() || !canvas?.sounds) return;
      const proto = Object.getPrototypeOf(canvas.sounds);
      const orig = proto?.getListenerPositions;
      if (!proto || proto.__mcAudioListenersPatched || typeof orig !== "function") return;
      proto.getListenerPositions = function () {
        const base = orig.call(this);
        if (base.length || !hearsFromParty()) return base; // something is controlled → core decides
        // Combat audio POV — the counterpart of combatPovVision. On a PC's turn the room hears from
        // that combatant alone; a pet's or enemy's turn falls through to the party.
        let pov = false;
        try { pov = isDisplayClient() && game.settings.get(MODULE_ID, "combatPovAudio"); } catch (e) { /* setting late */ }
        if (pov && game.combat?.started) {
          const active = game.combat.combatant?.token?.object;
          if (active && isAudioListener(active.actor) && !active.document?.hidden
              && !active.actor?.getFlag?.(MODULE_ID, "muteListener")) {
            try { const p = active.document.getListenerPosition(); if (finitePoint(p)) return [p]; } catch (e) { /* fall through */ }
          }
        }
        const out = [];
        for (const t of canvas.tokens?.placeables ?? []) {
          if (t.destroyed || !t.document || t.document.hidden || !isAudioListener(t.actor)) continue;
          // Deafened by the DM (Settings › Sound). Loudness is NEAREST-listener-wins, not an
          // average, so one scout beside a waterfall drives the whole room's audio on its own —
          // this is the opt-out for exactly that (DM 2026-07-22).
          if (t.actor?.getFlag?.(MODULE_ID, "muteListener")) continue;
          // Not FOLLOWED by the camera → not heard (DM 2026-07-25): when the display is focused on a
          // subset, the story is on those tokens, so we hear their room, not the one left behind. A
          // no-op when everyone is followed (no token carries noFollow).
          if (t.document?.getFlag?.(MODULE_ID, "noFollow")) continue;
          try { const p = t.document.getListenerPosition(); if (finitePoint(p)) out.push(p); } catch (e) { /* skip a bad token */ }
        }
        return out.length ? out : base;
      };
      proto.__mcAudioListenersPatched = true;
      try { canvas.sounds.refresh(); } catch (e) { /* refresh is best-effort */ }
    } catch (e) {
      console.warn(`${MODULE_ID} | could not patch display audio listeners`, e);
    }
  };
  // `canvasReady` has ALREADY fired by the time the `ready` hook runs, so registering only the hook
  // silently never patched anything (caught on the first live re-test). Patch now AND on every
  // future canvas draw, which also re-arms it after a scene change.
  patch();
  Hooks.on("canvasReady", patch);

  // Recompute the soundscape when the LISTENER SET changes but no token moved. Core only re-runs
  // _syncPositions on its own triggers (a token moving, a sound edit) — so patching
  // getListenerPositions is not enough on its own: a change that only affects WHO listens leaves
  // the old volumes playing until the next unrelated refresh. That is why "ignore" did nothing you
  // could hear (DM 2026-07-23) — the flag flipped, the list was correct, but the mix never
  // recomputed. Same latency hit combat audio POV on a turn change. Nudge a refresh on:
  //   • a token's muteListener flag flipping (the deafen toggle),
  //   • the combat POV audio setting changing,
  //   • combat turn/round change and start/end (the active combatant is the listener under POV).
  // `fade` (ms) is forwarded straight to core's AmbientSound#sync, so a volume change RAMPS instead
  // of snapping. Core's own default is 250ms; deafening a listener uses a gentler 750ms so a player
  // dropping out doesn't cut sound abruptly (DM 2026-07-24: "avoid sharp cuts… ~750ms to mute
  // completely" — and the same principle for sound changes generally).
  const MUTE_FADE_MS = 750;
  const refresh = (fade) => { try { if (hearsFromParty()) canvas?.sounds?.refresh(fade != null ? { fade } : {}); } catch (e) { /* best-effort */ } };
  const touchesMuteFlag = (changes) => foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE_ID}.muteListener`)
    // an UNLINKED token's flag change arrives inside the ActorDelta, not as a top-level flags path
    || foundry.utils.hasProperty(changes ?? {}, `delta.flags.${MODULE_ID}.muteListener`)
    || (typeof changes?.flags?.[MODULE_ID] === "object" && "muteListener" in changes.flags[MODULE_ID]);
  // A LISTENER moving should move the soundscape — but core only auto-refreshes sound for the
  // CONTROLLED listener, and the display controls nothing, so a party (or packed-group) move never
  // updated the mix there (DM 2026-07-24: "moving the party doesn't change the sound… overworld
  // might have location-based sounds too"). Debounced ~250ms: a step-by-step travel tick refreshes
  // once each, and a fast drag coalesces into one refresh instead of one per frame. PERF: each
  // refresh raycasts every ambient sound against the listeners, so the debounce keeps a busy scene
  // from hitching on movement.
  let moveTimer = null;
  const refreshSoon = () => { if (!hearsFromParty()) return; clearTimeout(moveTimer); moveTimer = setTimeout(() => refresh(), 250); };

  // The listener set ALSO changes with nobody moving: packing and dispersing swap N member tokens
  // for one group token and back (rpc.js `deleteEmbeddedDocuments`/`createEmbeddedDocuments`).
  // Core does not cover this — checked in Foundry 14.365's own source, `refreshSounds` is raised on
  // token control, release, move, size/elevation and hidden, and by an ambient sound initialising,
  // but NOT on token create/delete. So a party that packs beside a waterfall kept the mix computed
  // from tokens that no longer exist, until its first step happened to refresh it (2026-07-24).
  //
  // ORDERING MATTERS, and naively refreshing on create/delete alone is WORSE than the bug: pack
  // creates the group token, deletes the members, and only THEN writes the `packed` flag — so a
  // refresh landing mid-sequence sees no listeners at all (the group isn't packed yet, the members
  // are gone) and silences every positional sound with nothing scheduled to undo it. Watching the
  // flag too, through the SAME debounce, makes the sequence self-correcting: each step resets the
  // timer, so exactly one refresh runs 250ms after the LAST of them, with the state settled.
  const touchesPackedFlag = (changes) => foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE_ID}.packed`);
  // Deliberately looser than isAudioListener: a group token's `packed` flag may not be written yet
  // (or may already be cleared) at create/delete time, and the cost of being wrong is one
  // debounced recompute.
  const couldListen = (actor) => !!actor
    && (actor.type === "group" || (actor.type === "character" && !!actor.hasPlayerOwner));

  Hooks.on("updateActor", (_a, changes) => {
    if (!hearsFromParty()) return;
    if (touchesMuteFlag(changes)) return refresh(MUTE_FADE_MS);
    if (touchesPackedFlag(changes)) refreshSoon(); // party packed/dispersed → whole new listener set
  });
  // A noFollow flag flip changes who's heard too (DM 2026-07-25: unfollowed → unheard), so refresh.
  const touchesNoFollowFlag = (changes) => foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE_ID}.noFollow`)
    || (typeof changes?.flags?.[MODULE_ID] === "object" && "noFollow" in changes.flags[MODULE_ID]);
  Hooks.on("updateToken", (t, changes) => {
    if (!hearsFromParty()) return;
    if (touchesMuteFlag(changes)) return refresh(MUTE_FADE_MS); // deafen → gentle 750ms fade
    if (touchesNoFollowFlag(changes)) return refresh(MUTE_FADE_MS); // follow subset changed → new listener set
    if (("x" in changes || "y" in changes) && isAudioListener(t.actor)) refreshSoon();
  });
  Hooks.on("createToken", (t) => { if (hearsFromParty() && couldListen(t.actor)) refreshSoon(); });
  Hooks.on("deleteToken", (t) => { if (hearsFromParty() && couldListen(t.actor)) refreshSoon(); });
  Hooks.on("updateSetting", (s) => {
    if (s?.key === `${MODULE_ID}.combatPovAudio`) refresh();
    if (s?.key === `${MODULE_ID}.dmHearsTable`) { patch(); try { canvas?.sounds?.refresh(); } catch (e) { /* best-effort */ } }
  });
  Hooks.on("updateCombat", (_c, changed = {}) => { if ("turn" in changed || "round" in changed) refresh(); });
  Hooks.on("combatStart", refresh);
  Hooks.on("deleteCombat", refresh);
}

// The shared display can't play a sound until someone touches it (DM 2026-07-22: "I turned down the
// volume in the DM screen, and i dont hear anything"). Browsers suspend the AudioContext until a
// real user gesture; Foundry waits for the first contextmenu/auxclick/pointerdown/pointerup/keydown
// on document (AudioHelper#awaitFirstGesture) and, until then, SoundsLayer bails on the very first
// line of _syncPositions — `if (!this.sources.size || game.audio.locked) return`.
//
// A TV is the one client that never gets that gesture: nobody clicks it, and in clean-display mode
// core's own hint is hidden along with the rest of the UI. Measured on the TV: audioLocked true,
// ambient volume a healthy 0.5, 7 listeners, 3 audible sources — and not one of them playing.
// Volume was never the problem, so turning a volume knob could never have fixed it.
//
// The gesture is a browser requirement — it cannot be faked or auto-dispatched. All we can do is
// make it ONE obvious tap instead of an invisible prerequisite. The panel is huge, centred and
// unmissable on a TV, any tap anywhere dismisses it (core's listener is on document, so the tap
// that closes this IS the unlocking gesture), and it removes itself the moment audio unlocks.
//
// ⚠️ ON iPad SAFARI, "UNLOCKED" MAY NOT MEAN "PLAYING" (DM 2026-09-15, the TV on an iPad: "It's been
// unlocked and the volume is up" — still no sound). Read in core 14.367: `AudioHelper#onFirstGesture`
// runs on the first contextmenu/auxclick/pointerdown/pointerup/keydown, creates the three
// AudioContexts (music / environment / interface), sets `locked = false`, and never calls `resume()`.
// A desktop browser starts a context created inside `pointerdown`; iOS WebKit is stricter about which
// events may start audio, so a context born there can stay SUSPENDED — and core, having flipped
// `locked`, never looks at it again. Every status then reads "unlocked" while each sound plays into a
// stopped graph. ⚠️ THE WORKING THEORY, NOT YET CONFIRMED ON HIS iPad: the status line now reports each
// context's real state, which settles it on the next reload.
//
// ⚠️ A TAP ALWAYS CLOSES THE CARD (DM 2026-11-06, TV on desktop Chrome: "I'm tapping, nothing is
// happening"). The card used to stay until every context ran, so one context stuck in "suspended" kept
// it up for good, and `resume()` can stay pending forever, so the check after the tap might never even
// run. Now the tap tries `resume()` inside the gesture and closes the card without waiting. If sound
// still isn't running, a small speaker-off icon sits in the top-right corner and each tap on it retries.
// Once the card has been dismissed this load, the heartbeat and a waking screen bring back only the icon
// (a tap anywhere still resumes, via setupAudioResume). Every tap logs each context's state to the console.
function setupDisplayAudioUnlock() {
  const ID = "mc-audio-unlock";
  const ICON_ID = "mc-audio-off";
  let dismissed = false; // this load: the card has been tapped away, so it never comes back
  // Safari's audio session: "playback" keeps the table's sound going when the iPad is in silent mode —
  // a shared speaker must not go quiet because someone muted notifications. Safari 16.4+; browsers
  // without `navigator.audioSession` are untouched.
  try { if (isDisplayClient() && navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* unsupported */ }
  // Audio really runs now; re-sync so ambient sounds start at their correct volumes.
  const soundBack = () => { try { canvas?.sounds?.refresh(); } catch (e) { /* best-effort */ } };
  // Called inside the gesture, because that is where the browser allows the resume.
  const attempt = (where) => {
    console.log(`${MODULE_ID} | sound tap (${where}), before:`, audioContextStates());
    return resumeAudioContexts().then(() => {
      console.log(`${MODULE_ID} | sound tap (${where}), after:`, audioContextStates());
      broadcastAudioState();
    });
  };
  const showIcon = () => {
    const el = document.createElement("button");
    el.id = ICON_ID;
    el.type = "button";
    el.title = "Sound is off. Tap to try again.";
    el.setAttribute("aria-label", el.title);
    el.innerHTML = `<i class="fas fa-volume-xmark"></i>`;
    el.addEventListener("click", () => { attempt("icon").then(show); });
    document.body.appendChild(el);
  };
  const show = () => {
    try {
      if (!isDisplayClient()) return;
      const want = audioPrompt({ paused: audioPaused(), dismissed });
      const card = document.getElementById(ID), icon = document.getElementById(ICON_ID);
      if (want !== "card") card?.remove();
      if (want !== "icon") icon?.remove();
      if (!want && (card || icon)) { soundBack(); broadcastAudioState(); }
      if (want === "icon" && !icon) showIcon();
      if (want !== "card" || card) return;
      const el = document.createElement("div");
      el.id = ID;
      el.innerHTML = `<div class="mc-au-card">
        <i class="fas fa-volume-high mc-au-ico"></i>
        <div class="mc-au-title">Tap to enable sound</div>
        <div class="mc-au-sub">Browsers only play sound after a tap on this screen.
          Tap anywhere to start it — again after a reload, or after the screen has slept.</div>
      </div>`;
      // The END of the tap is the gesture WebKit honours; core's own unlock already ran on pointerdown.
      const onTap = () => {
        dismissed = true;
        const tried = attempt("card");
        el.remove();
        tried.then(() => { if (!audioPaused()) soundBack(); show(); });
      };
      el.addEventListener("click", onTap);
      el.addEventListener("touchend", onTap, { passive: true });
      document.body.appendChild(el);
      game.audio.unlock?.then?.(() => setTimeout(show, 300)).catch?.(() => {});
    } catch (e) { console.warn(`${MODULE_ID} | audio-unlock prompt failed`, e); }
  };
  show();
  Hooks.on("canvasReady", show); // a scene change on a still-locked display re-offers it
  // iPad Safari suspends audio again when the screen sleeps or Safari goes to the background, and a tap
  // is again the only way back — so the card returns with the screen, and on a slow heartbeat.
  // (2026-11-06: only until it has been dismissed this load; after that it is the icon that returns.)
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(show, 500); });
  setInterval(show, 15000);
}

/** Core's three AudioContexts — music, environment, interface — once audio has been unlocked. */
function audioContexts() {
  return [game.audio?.music, game.audio?.environment, game.audio?.interface].filter(Boolean);
}

/** Locked, or unlocked with a context that is not actually running (suspended / interrupted). */
function audioPaused() {
  if (game.audio?.locked) return true;
  return audioContexts().some((c) => c.state !== "running" && c.state !== "closed");
}

/** Each context's real state, by name; "none" before core has created it. */
function audioContextStates() {
  return Object.fromEntries(["music", "environment", "interface"].map((k) => [k, game.audio?.[k]?.state ?? "none"]));
}

/**
 * Resume every context that isn't running. It must be CALLED inside a gesture WebKit accepts.
 * Settles within a second even if a `resume()` never does (see settleWithin).
 */
function resumeAudioContexts() {
  return settleWithin(audioContexts()
    .filter((c) => c.state !== "running" && c.state !== "closed")
    .map((c) => c.resume()), 1000);
}

// Every client, not only the TV: an iPhone shell or an iPad DM screen can strand the same contexts,
// and nothing is attempted while they are running. `touchend` / `click` / `keydown` are the ends of a
// gesture, which is where WebKit grants audio.
function setupAudioResume() {
  const onGesture = () => {
    if (game.audio?.locked || !audioPaused()) return;
    resumeAudioContexts().then(() => {
      try { canvas?.sounds?.refresh(); } catch (e) { /* best-effort */ }
      broadcastAudioState();
      if (!audioPaused()) document.getElementById("mc-audio-off")?.remove(); // a tap anywhere can fix it
    });
  };
  for (const type of ["touchend", "click", "keydown"]) {
    document.addEventListener(type, onGesture, { capture: true, passive: true });
  }
}

// Apply the DM's chosen table-display volumes on THIS client (display only). Foundry's three
// volumes are scope:"client", so nobody but the TV itself can set the TV's — the DM panel writes a
// world setting (tvVolume) and the display mirrors it into its own client settings here, which is
// what actually moves core's gain nodes. Runs at ready and whenever the DM moves a slider.
function applyTvVolumes() {
  try {
    if (!isDisplayClient()) return;
    const v = game.settings.get(MODULE_ID, "tvVolume") ?? {};
    const map = { music: "globalPlaylistVolume", ambient: "globalAmbientVolume", interface: "globalInterfaceVolume" };
    for (const [key, coreKey] of Object.entries(map)) {
      const want = Number(v[key]);
      if (!Number.isFinite(want)) continue;
      const clamped = Math.max(0, Math.min(1, want));
      if (game.settings.get("core", coreKey) !== clamped) game.settings.set("core", coreKey, clamped);
    }
  } catch (e) { console.warn(`${MODULE_ID} | could not apply TV volumes`, e); }
}
// Mute/unmute the table. globalMute zeroes all three gains and restores them from the settings on
// release, so the DM's levels survive the round trip untouched.
function applyTvMute() {
  try {
    if (!isDisplayClient() || !game.audio) return;
    const want = !!game.settings.get(MODULE_ID, "tvMuted");
    if (game.audio.globalMute !== want) game.audio.globalMute = want;
  } catch (e) { console.warn(`${MODULE_ID} | could not apply TV mute`, e); }
}

// Tell the DM what the display's audio is actually doing. Without this the panel cannot distinguish
// "muted", "volume at zero" and "the browser has never been tapped, so nothing can play at all" —
// and that last one cost a session's confusion (2026-07-22). One-way display → everyone; the panel
// keeps the latest report and renders it in Settings › Sound.
function broadcastAudioState() {
  try {
    if (!isDisplayClient()) return;
    // `paused` = locked OR unlocked with a context that isn't running; `contexts` names each one's
    // real state, so the panel can tell "never tapped" from "Safari stopped it" (2026-09-15, the iPad).
    const contexts = audioContextStates();
    tvBroadcast({ cmd: "audioState", userId: game.user.id, locked: !!game.audio?.locked,
      paused: audioPaused(), contexts, muted: !!game.audio?.globalMute, at: Date.now() });
  } catch (e) { /* socket not ready */ }
}

// Quiet Automated Animations' persistent-effect tip. When a token gets the "sleeping" status (the
// watch phase marks the off-duty party asleep), AA plays a persistent Sequencer effect and toasts
// "This is a SEQUENCER Persistent Effect… " on every one — noise the DM doesn't want (2026-07-23).
// AA gates that toast on its own world setting `autoanimations.noTips`; flip it ON, ONCE, on the
// executor. Guarded by our own flag so a DM who later re-enables tips isn't overridden every load.
async function suppressAutomatedAnimationsTips() {
  try {
    if (!isExecutor()) return;
    if (!game.modules.get("autoanimations")?.active) return;
    if (game.settings.get(MODULE_ID, "aaTipsSuppressed")) return; // already did it once
    if (game.settings.settings.has("autoanimations.noTips") && !game.settings.get("autoanimations", "noTips")) {
      await game.settings.set("autoanimations", "noTips", true);
    }
    await game.settings.set(MODULE_ID, "aaTipsSuppressed", true);
  } catch (e) { console.warn(`${MODULE_ID} | could not suppress Automated Animations tips`, e); }
}

/**
 * The DM's own machine stops doubling the room — §39.5's rule, which until 2026-10-09 lived only
 * in the phone shell and so only ever covered phones. ~~See `dmSilentMusic` in settings.js for why
 * this is the MUSIC channel alone and must not touch ambient.~~ 2026-11-16: ENVIRONMENT too, behind its own
 * switch `dmSilentEnvironment` (Syrinscape plays on Environment, so it doubled out of the one PC; see settings.js
 * and `dm-silence.js`). Each channel is claimed and released on its own.
 *
 * Claim-and-release, exactly as the phone rule does it: we restore only a volume WE zeroed, and we
 * restore it to Foundry's shipped 0.5 rather than to a remembered value, because we never recorded
 * one — a level he never chose is better left at the default than left dead.
 */
function applyDmMusicSilence() {
  try {
    if (!game.user?.isGM || isDisplayClient()) return;
    const flag = (k, d) => { try { return !!game.settings.get(MODULE_ID, k); } catch (e) { return d; } };
    const want = { music: flag("dmSilentMusic", true), environment: flag("dmSilentEnvironment", true) };
    /**
     * ⚠️ IS THE DISPLAY **ON**, NOT IS IT CONFIGURED (DM 2026-10-09: *"if it's remote DMing and
     * I'm sharing the tv then it's in the same computer, if I'm not sharing it's probably not on,
     * and if it's a local game, both are running from my pc"*).
     *
     * Two things follow from that, and they rewrote this function.
     *
     * First, the doubling is worse than two machines disagreeing: the TV client and the DM client
     * are the SAME PC in every one of his setups, so the same track plays twice out of one sound
     * card, a few hundred milliseconds apart. That is not a balance problem, it is a flam.
     *
     * Second, the configured-display check was the wrong gate. A display ACCOUNT exists whether or
     * not anyone has opened it, and when he is not sharing, the TV is simply not running — so
     * gating on configuration would silence the music on the only client that was playing it. The
     * gate has to be live: silence while the display is actually connected, restore the moment it
     * drops. `userConnected` keeps it honest, so closing the TV tab mid-session brings his own
     * sound back without him touching anything.
     */
    const tv = hasSharedScreen() ? game.users.get(displayUserId()) : null;
    const level = { music: Number(game.settings.get("core", "globalPlaylistVolume")), environment: Number(game.settings.get("core", "globalAmbientVolume")) };
    const claimed = { music: flag("dmAudioSilenced", false), environment: flag("dmEnvSilenced", false) };
    for (const w of planDmSilence({ tvActive: Boolean(tv?.active), want, level, claimed, restore: { music: SLIDER_DEFAULT.music, environment: SLIDER_DEFAULT.environment } })) {
      if (w.set !== undefined) game.settings.set("core", w.key, w.set);
      game.settings.set(MODULE_ID, w.flag, w.claim);
      console.log(`${MODULE_ID} | DM client — ${w.channel} ${w.claim ? "silenced (the shared screen is the room's speaker)" : "restored (no shared screen)"}`);
    }
    // ⚠️ Syrinscape does not hear a settings write, only the slider: hand it the new level (seat SOUND PHASE 2 D2, 2026-11-16)
    setTimeout(syncSyrinscapeVolume, 100);
  } catch (e) { console.warn(`${MODULE_ID} | could not set the DM's music/environment volume`, e); }
}

function setupTvVolumes() {
  applyTvVolumes();
  applyTvMute();
  applyDmMusicSilence();
  Hooks.on("updateSetting", (s) => {
    if (s?.key === `${MODULE_ID}.tvVolume`) applyTvVolumes();
    if (s?.key === `${MODULE_ID}.tvMuted`) { applyTvMute(); broadcastAudioState(); }
    // the rule depends on BOTH the preference and which account is the display
    if (s?.key === `${MODULE_ID}.dmSilentMusic` || s?.key === `${MODULE_ID}.dmSilentEnvironment` || s?.key === `${MODULE_ID}.displayOwnerUser`) applyDmMusicSilence();
  });
  // ...and on whether that account is CONNECTED, which is the half that changes mid-session: the
  // TV tab opening or closing is exactly when the DM's own music should go quiet or come back.
  Hooks.on("userConnected", (user) => { if (user?.id === displayUserId()) applyDmMusicSilence(); });
  if (isDisplayClient()) {
    broadcastAudioState();
    // Re-announce once audio unlocks, and on a slow heartbeat so a DM panel opened later still
    // learns the state without having to ask.
    game.audio?.unlock?.then?.(() => broadcastAudioState()).catch?.(() => {});
    setInterval(broadcastAudioState, 15000);
  }
}

function setupGMCursorHiding() {
  try {
    const CL = foundry.canvas?.layers?.ControlsLayer
      ?? globalThis.ControlsLayer
      ?? CONFIG.Canvas?.layers?.controls?.layerClass;
    if (!CL?.prototype || CL.prototype.__mcCursorPatched) return;
    const hidden = () => { try { return game.settings.get(MODULE_ID, "hideGMCursor"); } catch (e) { return false; } };
    const origUpdate = CL.prototype.updateCursor;
    CL.prototype.updateCursor = function (user, position) {
      if (user?.isGM && hidden()) position = null; // null => Foundry hides that cursor; pings unaffected
      return origUpdate.call(this, user, position);
    };
    const origDraw = CL.prototype.drawCursor;
    CL.prototype.drawCursor = function (user) {
      if (user?.isGM && hidden()) return undefined; // never create the GM's cursor display object
      return origDraw.call(this, user);
    };
    CL.prototype.__mcCursorPatched = true;
    try { canvas?.controls?.drawCursors?.(); } catch (e) {} // re-sync any cursors already on this canvas
  } catch (e) {
    console.warn(`${MODULE_ID} | could not patch GM cursor hiding`, e);
  }
}

// Patch the Token vision-source test for two shared-screen behaviours (both per-client,
// reading their settings live; the settings' onChange refreshes vision):
//  (1) DM omniscient (DM request 2026-06-26): on the DM's OWN client (GM, not the
//      display), no token restricts the view while dmOmniscientVision is on — controlling
//      a PC normally collapses the GM's canvas to that PC's POV; this keeps the GM seeing
//      the whole map.
//  (2) Combat POV on the TV (DM 2026-06-27): on the display, while combatPovVision is on
//      and it's a PC's turn, ONLY the active combatant's token is a vision source — every
//      other token contributes nothing, as if the display didn't own them. So the TV shows
//      just that PC's senses/light. NPC turns (and the feature off) fall through to the
//      normal shared display vision. This is forced at the vision-source level so it can't
//      be undone by control()/release races (e.g. monks-common-display's focus toggle).
function setupDMOmniscientVision() {
  try {
    const Tk = CONFIG.Token?.objectClass ?? foundry.canvas?.placeables?.Token ?? globalThis.Token;
    if (!Tk?.prototype || Tk.prototype.__mcOmniVisionPatched) return;
    const orig = Tk.prototype._isVisionSource;
    if (typeof orig !== "function") return;
    Tk.prototype._isVisionSource = function () {
      if (game.user?.isGM && !isDisplayClient()) {
        let on = true; try { on = game.settings.get(MODULE_ID, "dmOmniscientVision"); } catch (e) {}
        if (on) return false; // no token restricts the DM's view → GM sees the whole map
      }
      if (isDisplayClient() && game.combat?.started) {
        let pov = false; try { pov = game.settings.get(MODULE_ID, "combatPovVision"); } catch (e) {}
        if (pov) {
          const active = game.combat.combatant?.token;
          // PC OR party summon (ally turn). The isDisplayShared half matters because a GM-created
          // summon has no player owner until the DM hands it over — it only read as "party" before
          // because the TV held OWNER on it (2026-07-21 — the TV is OBSERVER now).
          const owned = active?.actor?.hasPlayerOwner || isDisplayShared(active?.actor);
          if (owned) {
            if (this.document?.id !== active.id) return false;        // other tokens: no vision
            return canvas.visibility?.tokenVision !== false && this.hasSight; // active token sees per its senses
          }
          // Unowned NPC (monster) turn → fall through to shared party vision.
        }
      }
      return orig.call(this);
    };
    Tk.prototype.__mcOmniVisionPatched = true;
    try { canvas?.perception?.update({ refreshVision: true, initializeVision: true }); } catch (e) {}
  } catch (e) {
    console.warn(`${MODULE_ID} | could not patch DM omniscient vision`, e);
  }
}

// Item piles on the shared TV shouldn't show their name — a loot/merchant pile's token name
// can be a spoiler ("Mimic", "Trapped Chest") or just clutter on the players' screen. Hide the
// nameplate of any item-pile token, on the display client only (the DM's and players' own
// canvases are untouched). DM request 2026-06-26.
function setupDisplayItemPileNames() {
  if (!isDisplayClient()) return;
  const hide = (token) => {
    try {
      if (!token?.nameplate || !game.itempiles?.API?.isValidItemPile?.(token)) return;
      token.nameplate.visible = false; // re-applied on every refresh, so it stays hidden
    } catch (e) { /* item-piles not installed / API shape changed — leave the nameplate */ }
  };
  Hooks.on("drawToken", hide);
  Hooks.on("refreshToken", hide);
  try { canvas?.tokens?.placeables?.forEach(hide); } catch (e) {}
}

// Auto-share new player characters with the configured display/TV account (DM 2026-06-27), so the
// TV picks up their vision without manual fiddling. Executor-only writer; opt-in (off until a
// display account is chosen in settings → displayOwnerUser). Existing characters are handled by
// that setting's onChange and by the startup migration (syncDisplayObserver).
function setupAutoOwnNewPCs() {
  // Share a player-owned character with the display/TV account at exactly OBSERVER (idempotent).
  // `hasPlayerOwner` keeps it to real PCs — not the many test/template "character" actors.
  // OBSERVER not OWNER: enough for vision, and it keeps the TV out of midi's prompt routing
  // (see DISPLAY_LEVEL in settings.js).
  const grant = async (actor) => {
    try {
      if (!isExecutor() || actor?.type !== "character" || !actor.hasPlayerOwner) return;
      const targetId = displayUserId();
      if (!targetId) return;
      const user = game.users.get(targetId);
      if (!user || user.isGM) return;
      if ((actor.ownership?.[user.id] ?? 0) === DISPLAY_LEVEL) return;
      await actor.update({ [`ownership.${user.id}`]: DISPLAY_LEVEL });
    } catch (e) { console.warn(`${MODULE_ID} | display share failed`, e); }
  };
  Hooks.on("createActor", (actor) => grant(actor));
  // A PC usually gets its player owner AFTER creation, so also react to ownership edits.
  Hooks.on("updateActor", (actor, changes) => { if (changes?.ownership) grant(actor); });
}

// Clean-display escape-hatch hint: a dismissable pill telling the user how to get the Foundry UI
// back, so a display-role client (or anyone who toggled clean mode) isn't stranded.
//
// §22.9 (2026-10-31, DM: "keep it to 30 seconds from load, even one minute is too much"): the pill
// fades CLEAN_HINT_MS after it appears — at load, that is 30 s from load. The 2026-10-02 no-fade
// rule is superseded: the stranding it guarded against is closed by the rail instead (a GM client
// is never auto-promoted to the TV, restoreCoreUi strips mc-clean at ready, MobileCommand.showUI()
// recovers from the console), so a permanent pill on the TV no longer buys safety. Still removed
// early by hideCleanHint() when clean mode ends, by the rail, or by a click; ` still toggles.
const CLEAN_HINT_MS = 30000;
let cleanHintTimer = null;
function showCleanHint() {
  let hint = document.getElementById("mc-clean-hint");
  if (!hint) {
    hint = document.createElement("div");
    hint.id = "mc-clean-hint";
    hint.innerHTML = `Table display — press <kbd>\`</kbd> for the Foundry UI`;
    hint.addEventListener("click", () => hideCleanHint());
    document.body.appendChild(hint);
  }
  hint.classList.remove("mc-fade");
  clearTimeout(cleanHintTimer);
  cleanHintTimer = setTimeout(() => {
    hint.classList.add("mc-fade");
    // Matches the 0.8 s opacity transition in shell.css.
    cleanHintTimer = setTimeout(() => hint.remove(), 900);
  }, CLEAN_HINT_MS);
}
function hideCleanHint() {
  clearTimeout(cleanHintTimer);
  cleanHintTimer = null;
  document.getElementById("mc-clean-hint")?.remove();
}

// A shared display logged into a GM account shows GM vision (through walls, hidden
// tokens, no fog) — the players' POV is lost. mobile-command can't change the login,
// but it CAN make the mistake obvious instead of silent (DM/Sqyre hit exactly this:
// the TV ran on "Michael [GM]"). Persistent, dismissible banner; GM display only.
function warnDisplayGM() {
  if (!isDisplayClient() || !game.user.isGM) return;
  console.warn(`${MODULE_ID} | display is a GM account — it shows GM vision, not the players' view. Use a non-GM account that owns the party.`);
  if (document.getElementById("mc-display-gm-warn")) return;
  const warn = document.createElement("div");
  warn.id = "mc-display-gm-warn";
  warn.innerHTML = `⚠ This display is on a <b>GM account</b>, so it shows GM vision — through walls, hidden tokens, no fog.<br>Log the screen into a <b>non-GM player account that owns the party</b> to show the players' view. <span class="mc-warn-x">tap to dismiss</span>`;
  warn.addEventListener("click", () => warn.remove());
  document.body.appendChild(warn);
}

function enableSafeAreaInsets() {
  // env(safe-area-inset-*) only resolves to non-zero when the viewport opts in
  // with viewport-fit=cover. Append it to Foundry's existing viewport meta.
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/viewport-fit/.test(vp.content)) vp.content += ", viewport-fit=cover";
}

function injectShellStyles() {
  const id = `${MODULE_ID}-shell-styles`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `modules/${MODULE_ID}/styles/shell.css`;
  document.head.appendChild(link);
}

function suppressResolutionWarning() {
  const RE = /usable window dimensions/i;
  const isSizeWarning = (m) => typeof m === "string" && RE.test(m);
  for (const key of ["notify", "warn", "error", "info"]) {
    const orig = ui.notifications[key]?.bind(ui.notifications);
    if (!orig) continue;
    ui.notifications[key] = (message, ...rest) => isSizeWarning(message) ? null : orig(message, ...rest);
  }
  // Foundry ALSO logs the same warning straight to console.error (separate from the toast), so
  // it leaks into the console even with the toast suppressed — mildly annoying while testing.
  // Filter just that one message; everything else passes through untouched. (DM 2026-06-27.)
  for (const key of ["error", "warn"]) {
    const orig = console[key]?.bind(console);
    if (!orig || console[key].__mcResFiltered) continue;
    const wrapped = (...args) => { if (args.some((a) => RE.test(String(a?.message ?? a)))) return; return orig(...args); };
    wrapped.__mcResFiltered = true;
    console[key] = wrapped;
  }
  // The core resolution warning fires during ready (often before this wrapper installs) and
  // can re-fire on resize, so a one-shot sweep misses it. Sweep now + on a few timers, AND
  // watch the DOM so it's stripped the instant it (re)appears — covering the early sticky
  // one and any container/timing the wrapper doesn't intercept.
  const sweep = () => document.querySelectorAll("#notifications li, .notification, #notifications > *")
    .forEach((el) => { if (RE.test(el.textContent || "")) el.remove(); });
  sweep(); setTimeout(sweep, 400); setTimeout(sweep, 1500);
  const list = document.querySelector("#notifications");
  if (list) { try { new MutationObserver(sweep).observe(list, { childList: true }); } catch (e) {} }
  try {
    // Wider safety net while the UI settles, in case the early warning lands elsewhere.
    const bodyObs = new MutationObserver(sweep);
    bodyObs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => bodyObs.disconnect(), 12000);
  } catch (e) {}
}
