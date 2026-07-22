import { MODULE_ID } from "./preset.js";
import { registerSettings, resolveExecutorId, isExecutor, displayUserId, isDisplayShared, syncDisplayObserver, DISPLAY_LEVEL } from "./settings.js";
import { diffPreset, applyPreset, checkAndPrompt, deactivate, reactivate, hasBackup } from "./enforcer.js";
import { initSocket, startHeartbeat, registerSaveRelay, registerDialogWatchdog, registerReactionNotifier, registerSummonOwnership, api, actorTokenSight } from "./rpc.js";
import { initPauseGuard } from "./pause-guard.js";
import { initPauseOverlay } from "./pause-overlay.js";
import { initHeartbeat } from "./heartbeat.js";
import { openShell, closeShell, maybeAutoOpenShell, registerShellHooks, isPhoneClient, isDisplayClient } from "./shell.js";
import { registerDMPanel } from "./dm-panel.js";
import { maybePromptDmWizard } from "./dm-wizard.js";
import { registerSceneTransitions, registerPartyTeleportActivation } from "./transitions.js";
import { registerAoO } from "./aoo.js";
import { setupCalendarSkin } from "./gametime.js";

Hooks.once("init", () => {
  registerSettings();
  registerSceneTransitions(); // zoom in/out entries in CONFIG.Canvas.sceneTransitions (scene config + teleport pickers)
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
        if (on) showCleanHint(); else hideCleanHint();
        return true;
      },
      restricted: false
    });
  } catch (e) {
    console.warn(`${MODULE_ID} | could not register the clean-display keybinding`, e);
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

// Shared TV framing constants in scene feet (DM 2026-06-27). Both the "Focus the
// party" press and the continuous party-follow use these so the resting frame and
// the corrected frame agree: keep this much empty space outside the party, and
// never frame tighter than this radius (a clustered party still shows context).
const TV_PARTY_BUFFER_FT = 40;
const TV_MIN_RADIUS_FT = 26; // default/min party-view radius — ~25% tighter than 35 (DM 2026-07-03)
const TV_TOKEN_MARGIN_FT = 25; // always keep ≥ this much visible around every party token (DM 2026-07-03)
// On each combat turn the display spotlights the ACTIVE token (DM 2026-06-27): zoom OUT
// then zoom IN, centred on that token, ending at a TV_COMBAT_RADIUS_FT radius. The pull-
// back is TV_COMBAT_OUT_FACTOR × the spotlight scale (a wider establishing view).
const TV_COMBAT_RADIUS_FT = 30;                       // spotlight radius on the active token (was 60 — too wide; the view exceeded the scene so it clamped to scene-centre every turn, DM 2026-06-28)
const TV_COMBAT_OUT_FACTOR = 0.6;                     // zoom-out factor before the push-in
const TV_COMBAT_OUT_MS = 600, TV_COMBAT_IN_MS = 900;  // out, then in (~1.5 s total)

// DM-locked TV zoom for the party view (DM 2026-06-27). null = auto (TV_MIN_RADIUS_FT
// fit; the party framing still zooms OUT past it when the party splits so everyone
// stays in view); the zoom buttons set it. Used in and out of combat — the combat
// turn pulse settles back to this same party framing.
let tvLockedScale = null;

// A zoom-button press locks the party-view zoom.
function setTvLockedScale(scale) {
  tvLockedScale = scale;
}

// Decide the party-framing scale for a bounding box of size (extentW × extentH) px.
// Locked → hold the DM's zoom but never tighter than the party + buffer fits (so a
// split party stays in view). Unlocked → auto-fit the party + buffer, floored at the
// TV_MIN_RADIUS_FT minimum so a clustered party isn't over-zoomed.
function tvPartyScale(extentW, extentH, buffer, minDim, screenW, screenH) {
  const minZoom = CONFIG.Canvas?.minZoom ?? 0.1, maxZoom = CONFIG.Canvas?.maxZoom ?? 3;
  const spreadW = extentW + buffer * 2, spreadH = extentH + buffer * 2;
  const fitScale = Math.min(screenW / spreadW, screenH / spreadH, maxZoom); // party + buffer fits exactly
  if (tvLockedScale != null) return Math.max(minZoom, Math.min(tvLockedScale, fitScale));
  const reqW = Math.max(spreadW, minDim), reqH = Math.max(spreadH, minDim);
  return Math.max(minZoom, Math.min(screenW / reqW, screenH / reqH, maxZoom));
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

// The whole-party frame: centroid + target scale over every visible PC token. Used by
// Focus (centroid only — pure pan) and the combat turn pulse. null when no party.
function partyFrame() {
  const toks = (canvas.tokens?.placeables ?? []).filter(
    (t) => isPartyActor(t.actor) && !t.document?.hidden);
  if (!toks.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of toks) {
    const w = t.w ?? t.width ?? 0, h = t.h ?? t.height ?? 0;
    minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + w); maxY = Math.max(maxY, t.y + h);
  }
  const gridSize = canvas.grid?.size ?? 100, gridDist = canvas.grid?.distance ?? 5;
  const ftToPx = (ft) => (ft / gridDist) * gridSize;
  const [screenW, screenH] = canvas.screenDimensions ?? [window.innerWidth, window.innerHeight];
  const scale = tvPartyScale(maxX - minX, maxY - minY, ftToPx(TV_PARTY_BUFFER_FT), ftToPx(TV_MIN_RADIUS_FT * 2), screenW, screenH);
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale };
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
    if (!frame) { ui.notifications?.info?.(`${MODULE_ID} | no party tokens on this scene to frame`); return false; }
    const scale = canvas.stage.scale.x || 1; // pure pan — keep current zoom
    canvas.animatePan({ x: frame.cx, y: frame.cy, scale, duration: 1000, easing: tvEase });
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
  if (!payload || typeof payload !== "object" || !isDisplayClient()) return; // only the shared display reacts
  if (payload.cmd === "frameParty") { tvManual = false; framePartyTokens(); }
  else if (payload.cmd === "fitScene") { tvManual = false; fitSceneLocal(); } // §camera: show the whole map
  else if (payload.cmd === "manual") { tvManual = !!payload.on; }
  else if (payload.cmd === "zoom" && canvas?.ready) {
    // Zoom around the display's CURRENT centre. Not gated on manual mode — a direct
    // DM control of the TV (DM 2026-06-21). Clamp to the canvas zoom limits.
    const s = canvas.stage;
    const min = CONFIG.Canvas?.minZoom ?? 0.1, max = CONFIG.Canvas?.maxZoom ?? 3;
    const scale = Math.max(min, Math.min((s.scale?.x || 1) * (payload.factor || 1), max));
    setTvLockedScale(scale); // zoom overrides the context's radius until reload (DM 2026-06-27)
    canvas.animatePan({ x: s.pivot.x, y: s.pivot.y, scale, duration: 250, easing: tvEase });
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
  ui.notifications?.info?.(`${MODULE_ID} | manual TV control ${dmRelaying ? "ON — your pan/zoom drives the display" : "OFF"}`);
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
    setTvLockedScale(scale); // zoom overrides the context's radius until reload (DM 2026-06-27)
    canvas.animatePan({ x: s.pivot.x, y: s.pivot.y, scale, duration: 250, easing: tvEase });
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
    setTvLockedScale(scale);
    canvas.animatePan({ x: r.x + r.width / 2, y: r.y + r.height / 2, scale, duration: 1000, easing: tvEase });
    return true;
  } catch (e) { console.warn(`${MODULE_ID} | fitSceneLocal failed`, e); return false; }
}
// Like focusPartyAll: frame here if this IS the display, always drive the display(s), and drop manual.
function tvFitScene() {
  if (isDisplayClient()) fitSceneLocal();
  tvBroadcast({ cmd: "fitScene" });
  if (dmRelaying) setDmRelaying(false);
}

// --- TV party-follow (DM 2026-06-20, whole-party rework 2026-06-27) ----------
// Keep the ENTIRE party in view at all times, with a TV_PARTY_BUFFER_FT empty
// margin around the party's bounding box. On every PC step, recompute that box
// and correct the camera if the buffer is broken: pan the minimum to bring the
// party + buffer back inside the viewport, and zoom OUT if it no longer fits.
// As the party regroups it zooms back IN (past a deadzone, so it doesn't hunt),
// converging on the same frame the "Focus the party" press produces — floored at
// the TV_MIN_RADIUS_FT minimum. Clamp to the scene so we never overscroll past
// the map edge (there the party may sit nearer the edge). Display client only,
// and yields to manual TV control.
const TV_ZOOM_IN_SLACK = 1.15; // only tighten when the ideal frame is ≥15% closer than now

function tvPartyFollow(tokenDoc, changes) {
  try {
    if (!isDisplayClient() || tvManual || !canvas?.ready) return;
    if (game.combat?.started) return; // in combat the active-token spotlight takes over
    if (!("x" in changes) && !("y" in changes)) return; // only on movement
    const actor = tokenDoc.actor;
    if (!isPartyActor(actor)) return; // a PC (or the packed party token) moved

    // Party bounding box over every visible PC token. The just-moved token's new
    // position comes from the update doc (robust while the move animates); the
    // rest from their current document positions.
    const gs = canvas.dimensions?.size ?? 100;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of canvas.tokens?.placeables ?? []) {
      const d = t.document;
      if (d?.hidden || !isPartyActor(t.actor)) continue;
      const x = d.id === tokenDoc.id ? tokenDoc.x : d.x;
      const y = d.id === tokenDoc.id ? tokenDoc.y : d.y;
      const w = (d.width ?? 1) * gs, h = (d.height ?? 1) * gs;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    }
    if (!Number.isFinite(minX)) return; // no visible party

    const gridDist = canvas.dimensions?.distance ?? canvas.grid?.distance ?? 5;
    // Always keep ≥ TV_TOKEN_MARGIN_FT visible around every token — the required
    // rect is the party box grown by that margin on each side (used for both the
    // zoom-out and the pan deadzone). This is the "25ft around each" the DM wants.
    const margin = (TV_TOKEN_MARGIN_FT / gridDist) * gs;
    const buffer = margin;
    const reqW = (maxX - minX) + margin * 2;
    const reqH = (maxY - minY) + margin * 2;
    const bx = (minX + maxX) / 2, by = (minY + maxY) / 2; // party centre

    const stage = canvas.stage;
    const [screenW, screenH] = canvas.screenDimensions ?? [window.innerWidth, window.innerHeight];
    const minZoom = CONFIG.Canvas?.minZoom ?? 0.1, maxZoom = CONFIG.Canvas?.maxZoom ?? 3;

    // Zoom: the scale at which the whole required rect (party + 25ft each) fits.
    // The DM's locked zoom is a CEILING — hold it while the party is grouped, but
    // as they SPREAD, `needed` drops below it and the camera zooms OUT to keep
    // everyone (with their margin) in view; regrouping raises `needed` back above
    // the lock, returning to the set zoom. No manual zoom → auto-frame at `needed`.
    const needed = Math.min(screenW / reqW, screenH / reqH, maxZoom);
    const scale = Math.max(minZoom, tvLockedScale != null ? Math.min(tvLockedScale, needed) : needed);

    // Pan the minimum to keep the whole required rect inside the viewport; if an
    // axis is fully filled by the rect, just centre the party on it.
    const halfW = screenW / scale / 2, halfH = screenH / scale / 2;
    let cx = stage.pivot.x, cy = stage.pivot.y;
    if (halfW * 2 <= reqW) cx = bx;
    else { if (minX - buffer < cx - halfW) cx = minX - buffer + halfW;
           if (maxX + buffer > cx + halfW) cx = maxX + buffer - halfW; }
    if (halfH * 2 <= reqH) cy = by;
    else { if (minY - buffer < cy - halfH) cy = minY - buffer + halfH;
           if (maxY + buffer > cy + halfH) cy = maxY + buffer - halfH; }

    // Clamp so the viewport stays within the scene (centre an axis smaller than it).
    const r = canvas.dimensions?.sceneRect ?? canvas.dimensions?.rect;
    if (r) {
      cx = r.width  <= halfW * 2 ? r.x + r.width  / 2 : Math.min(Math.max(cx, r.x + halfW), r.x + r.width  - halfW);
      cy = r.height <= halfH * 2 ? r.y + r.height / 2 : Math.min(Math.max(cy, r.y + halfH), r.y + r.height - halfH);
    }

    const curScale = stage.scale.x || 1;
    const scaleChanged = Math.abs(scale - curScale) / curScale > 0.01;
    if (!scaleChanged && Math.abs(cx - stage.pivot.x) < 1 && Math.abs(cy - stage.pivot.y) < 1) return; // already framed
    canvas.animatePan({ x: cx, y: cy, scale, duration: 250, easing: tvEase });
  } catch (e) { /* follow is best-effort */ }
}

// --- TV combat spotlight (DM 2026-06-27) ------------------------------------
// On each turn change the display zooms OUT then zooms IN onto the ACTIVE token,
// ending at a TV_COMBAT_RADIUS_FT radius — "zoom in to the new token". Both phases
// are centred on that token (not the party). Display only, yields to manual TV,
// sequence-guarded against rapid turns; movement within a turn → tvCombatFollow.
let _tvCineSeq = 0;
async function tvCombatTurnPulse() {
  if (!isDisplayClient() || tvManual || !canvas?.ready) return;
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
    if (!isDisplayClient() || tvManual || !canvas?.ready) return;
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
  ui.notifications?.info?.(`${MODULE_ID} | synced token sight on ${n} PC token(s) from senses${skipped ? ` (${skipped} skipped — need ownership)` : ""}`);
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

Hooks.once("setup", () => {
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
  // Phones get nagged that the window is too small (core #validateResolution).
  // Nothing actually breaks for a DOM-only client; keep the suppression narrow.
  if (isPhoneClient()) {
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
    document.body.classList.add("mc-display", "mc-clean"); showCleanHint(); warnDisplayGM(); suppressMcdCamera(); mountTvCompass();
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
  });
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
  initSocket(); // idempotent fallback in case socketlib.ready raced or didn't fire
  initPauseGuard();
  if (!isPhoneClient()) initPauseOverlay(); // corner spinners replace the "GAME PAUSED" bar (phones have their own overlay)
  if (!isPhoneClient()) initHeartbeat();    // critical-HP heartbeat pulse on PC token rings (canvas only)
  startHeartbeat();
  registerShellHooks();
  registerDMPanel(); // DM-assign panel (GM clients only; self-gates)
  maybePromptDmWizard(); // §16.3 first-run setup offer (GM only; once per world)
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
  setupNoDoubleTapMinimize(); // no window collapses to a stranded title bar on an accidental double-tap
  setupGMCursorHiding(); // hide the GM's broadcast cursor on other screens (keep pings); reads hideGMCursor live
  setupDMOmniscientVision(); // keep the DM's canvas omniscient when a token is selected (shared-screen tables)
  setupDisplayItemPileNames(); // hide item-pile token names on the shared TV (spoiler/clutter)
  setupAutoOwnNewPCs(); // auto-own new PCs for the display/TV account (opt-in; see displayOwnerUser)
  registerPartyTeleportActivation(); // party token teleports to a new scene → activate it (TV follows; primary-GM-gated)
  setupCalendarSkin(); // SC Reborn's popup = the table's "Calendar": retitle (tool column hidden in CSS)
  registerAoO(); // opportunity-attack movement watcher (executor-gated inside; see aoo.js)

  globalThis.MobileCommand = {
    ...api,
    enforcer: { diff: diffPreset, apply: applyPreset, prompt: checkAndPrompt, deactivate, reactivate, revert: deactivate, hasBackup },
    openShell,
    closeShell,
    frameParty: framePartyTokens,        // local canvas only
    focusParty: focusPartyAll,           // here + the display(s) + exit manual
    toggleTvManual,                      // DM drives the display by panning own view
    tvManualActive: isTvManualActive,
    tvZoom,                              // zoom the display in/out (factor >1 in, <1 out) — Stream Deck via macro
    tvFitScene,                          // frame the whole scene on the display ("Fit whole scene")
    refreshCombatVision,                 // re-apply combat POV vision on the display (settings onChange + manual)
    syncPartyTokenSight,                 // GM: set each PC token's sight/detection from its dnd5e senses
    resolveExecutorId,
    isExecutor
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

// Clean-display escape-hatch hint: a dismissable pill telling the user how to get
// the Foundry UI back, so a display-role client (or anyone who toggled clean mode)
// isn't stranded. Auto-fades after ~60s; click or the keybinding dismisses it.
function showCleanHint() {
  let hint = document.getElementById("mc-clean-hint");
  if (!hint) {
    hint = document.createElement("div");
    hint.id = "mc-clean-hint";
    hint.innerHTML = `Table display — press <kbd>\`</kbd> for the Foundry UI`;
    hint.addEventListener("click", () => hint.remove());
    document.body.appendChild(hint);
  }
  hint.classList.remove("mc-fade");
  clearTimeout(showCleanHint._timer);
  showCleanHint._timer = setTimeout(() => {
    hint.classList.add("mc-fade");
    setTimeout(() => hint.remove(), 900);
  }, 60000);
}
function hideCleanHint() {
  clearTimeout(showCleanHint._timer);
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
