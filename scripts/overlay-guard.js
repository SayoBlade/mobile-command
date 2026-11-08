import { MODULE_ID } from "./preset.js";
import { notifier } from "./notifier.js";

// §22.7 THE DM IS NEVER COVERED — one gate for every full-viewport overlay, plus a kill path.
//
// WHY THIS FILE EXISTS (session-one blocker, 2026-10-02). Six shared-screen features each carried
// their own private copy of the same audience gate:
//
//   function eligible() { return !isPhoneClient() && (isDisplayClient() || game.user?.isGM); }
//
// — card-table.js:45, cm-boarding.js:25, seance.js:59, entrances.js:44, boss-intro.js:108,
// druskenvald.js:67. That `|| game.user?.isGM` was written for a DM who wanted to see on his own
// screen what the table screen was showing. Three of those features mount an OPAQUE, fixed,
// inset-0 layer — `#mc-cardtable` (z 55, `background: #07070a`, and NOT pointer-events:none, so it
// eats every click), `#mc-cmstation` (z 55, opaque), `#mc-seance` (z 60, opaque) — and all three
// are driven by WORLD settings (`cardTableOn`, `fxActive.cmStation`, `fxActive.seance`) that
// effects.js `syncFx()` re-applies at every `ready` and `canvasReady` (effects.js:1093–1098,
// :1112, :1128). Nothing anywhere clears them on load. So one toggle left on — by the DM, by a
// bench run, by a session that ended with the board up — covers the DM's desktop in black on
// every subsequent load of that world, on every browser he opens it in, forever. Which is exactly
// what happened: the fault followed the WORLD (desktop app and web client both), never the
// browser, which is also why the per-device `role` setting and the phone shell were not the cause.
//
// THE RULE NOW: a SHARED-SCREEN overlay may cover the table's screen, and nothing else — that is
// its whole job there. (A phone's own full-screen pieces, the ticket and the flashes, travel
// effects.js's PHONE_FX path and never ask this gate.) On the DM's own client it is OPT-IN ONLY, via the
// per-device setting `dmScreenOverlays`, default OFF. And every uncertainty — a setting that throws, a
// `game.user` that isn't there yet — resolves to NOT COVERING. We would rather a DM miss a bit of
// theatre on his own monitor than lose his Foundry with no way back in.
//
// Detection is re-derived here rather than imported from shell.js, deliberately: shell.js imports
// half the module, and openShell() calls back into this file, so importing it would close a cycle
// this codebase avoids (same precedent and same tradeoff as gametime.js:54). The three functions
// below are the ONLY copy — keep them in step with shell.js:42–64 if that logic ever moves.

// Set by forceRail() — the console panic button. Session-only and one-way: nothing can turn the
// rail back off from code, only a fresh load. Declared up here because both halves of the rail
// read it (mayCoverViewport and shouldKeepGmClear) and `let` has no hoisting to rely on.
let forced = false;

/** A setting read that can never throw and never surprises: unknown → the stated fallback. */
function stg(key, fallback) {
  try {
    const v = game.settings.get(MODULE_ID, key);
    return v === undefined || v === null ? fallback : v;
  } catch (e) { return fallback; }
}

/** shell.js isDisplayAccount() — the account the DM nominated as the shared screen. */
function isDisplayAccount() {
  const tv = stg("displayOwnerUser", null);
  try { return !!tv && game.user?.id === tv; } catch (e) { return false; }
}

// §22.10 — how wide a screen may be and still be a phone or a small tablet, measured on the
// SMALLEST side so orientation doesn't matter (a phone in landscape is still a phone). 820px sits
// above every handset and above a 10" tablet in portrait, and below any laptop: the narrowest
// common laptop panel is 768 tall but 1366 wide, so its smallest side is 768 — which is why the
// pointer test below is required as well and this number alone decides nothing.
const HANDHELD_MAX_PX = 820;

/**
 * §22.10 Does this client actually LOOK like a handheld — a phone or a small tablet?
 *
 * Asked only to settle the `auto` role (see phoneHere() / shell.js isPhoneClient()). Until
 * 2026-10-08 `auto` meant "any non-GM client is a phone", with no device test of any kind, so a
 * player who opened Foundry on a laptop got the full-screen phone shell — `#mobile-command-shell`,
 * fixed/inset-0/opaque at z 9999 — over a 1568px viewport with no canvas and no visible way out.
 *
 * BOTH halves are required, and each one alone is known to be wrong:
 *   • `(pointer: coarse)` alone is true of a touchscreen laptop and of a Windows desktop with a
 *     pen digitizer — the hardware §22.7 exists to protect (see isTouchOnlyClient's 2026-10-05
 *     note, which is the same trap from the other side).
 *   • the width alone is true of any desktop window dragged narrow.
 * A phone is coarse AND small. A laptop fails one or the other.
 *
 * ⚠️ THIS FUNCTION'S UNCERTAINTY FAILS THE OPPOSITE WAY FROM isTouchOnlyClient() BELOW, deliberately.
 * There, "I cannot tell" must answer "there is a mouse here" because the cost of guessing wrong is
 * a DM losing his screen. Here, "I cannot tell" answers "yes, a phone" — the pre-2026-10-08
 * behaviour — because the cost of guessing wrong is a phone that stops being a phone, and an
 * exotic handset browser without `matchMedia` is a likelier reader of this line than a laptop
 * without it. The two tests are not interchangeable; neither direction is a mistake.
 */
export function isHandheldDevice() {
  try {
    if (typeof window.matchMedia !== "function") return true;  // can't tell → the old behaviour
    if (window.matchMedia("(pointer: coarse)").matches !== true) return false;
    const w = Number(window.innerWidth) || 0;
    const h = Number(window.innerHeight) || 0;
    const px = Math.min(w, h);
    if (!(px > 0)) return true;                                // no usable size → the old behaviour
    return px <= HANDHELD_MAX_PX;
  } catch (e) { return true; }                                 // threw → the old behaviour
}

/** shell.js isPhoneClient(), re-derived (see the header note on the cycle). Exported because
 *  gametime.js needs the same answer and cannot import shell.js either (shell.js imports IT) —
 *  this file is now the one cycle-free source of client-role truth for everything downstream.
 *
 *  §22.10 2026-10-08: the `auto` arm now also asks isHandheldDevice(). shell.js imports that
 *  helper from HERE rather than carrying its own copy — the two isPhoneClient() bodies have to
 *  stay in step by hand, but the device test underneath them cannot drift, which is the half a
 *  reader would never think to re-check. (shell.js → overlay-guard.js is an existing, allowed
 *  import direction: shell.js already takes shouldKeepGmClear() from this file.) */
export function phoneHere() {
  const role = stg("role", "auto");
  if (role === "phone") return true;
  if (isDisplayAccount()) return false;
  try { return role === "auto" && !game.user.isGM && isHandheldDevice(); } catch (e) { return false; }
}

/** shell.js isDisplayClient(), re-derived (see the header note on the cycle). Carries §22.9 with
 *  it: the nominated-ACCOUNT path cannot promote a GM client to the TV, because `displayOwnerUser`
 *  is world-scoped and a DM who names his own GM account there loses his UI on every client he
 *  opens the world in (the 2026-10-02 blocker). Only an explicit per-device role does. */
export function displayHere() {
  const role = stg("role", "auto");
  if (role === "display") return true;
  if (role === "phone") return false;
  try { if (game.user?.isGM) return false; } catch (e) { return false; }
  return isDisplayAccount();
}

/** Did the DM ask for the table's overlays on his own screen too? Default: no. */
export function dmScreenOverlaysOn() { return stg("dmScreenOverlays", false) === true; }

/**
 * Is this a TOUCH-ONLY device — an iPad or a phone, with no mouse or trackpad at all?
 *
 * Not "does it have a touchscreen". `(any-pointer: coarse)` alone is true of a Windows 11 desktop
 * or laptop with a touch monitor or a pen digitizer attached, which is a fair description of the
 * DM's own machine — and letting that disarm the rail would hand the blocker straight back on the
 * exact hardware it happened on. A device with ANY fine pointer has a mouse, so it is a
 * workstation and stays protected, touchscreen or not. Uncertainty resolves to "has a mouse",
 * which is the protecting answer.
 *
 * ⚠️ 2026-10-05 — `(any-pointer: fine)` ALONE WAS NOT ENOUGH, and the machine it failed on is his
 * office PC. Over a remote-desktop session the physical mouse is at the CLIENT end; what the
 * browser inside the session enumerates is a virtual input stack, and where touch redirection is
 * on, that stack can present as a digitizer — `(any-pointer: fine)` fails to match while
 * `maxTouchPoints` reports the Windows HID default of 10. Line by line that is: no fine pointer →
 * touch points > 1 → `true`. A GM sitting at a real keyboard and mouse was classified as "an iPad
 * that might be the table surface", and the rail stood down on exactly the class of machine §22.7
 * exists to protect. (READ: the three checks below, and the chain is arithmetic. INFERRED: that
 * this is what his RDP session reports — it is the only reading consistent with the symptom, and
 * one `MobileCommand.showUI()` on that machine confirms or kills it.)
 *
 * HOVER is the signal that catches it, and it is the signal this function never read. A touch-only
 * device cannot hover: there is no pointer resting anywhere when nothing is touching the glass.
 * A mouse — local or tunnelled — can, because hover is a property of the POINTER, not of the
 * transport. So `(any-hover: hover)` corroborates "there is a mouse here" where `any-pointer: fine`
 * is defeated by the virtual digitizer. It is checked in the protecting direction, as a second way
 * to say "workstation", never as a way to say "tablet" — which keeps the function's stated
 * invariant ("uncertainty resolves to has a mouse") true of the RDP case too, where before it was
 * true only of the `catch`.
 */
export function isTouchOnlyClient() {
  try {
    const fine = window.matchMedia?.("(any-pointer: fine)")?.matches === true;
    if (fine) return false;                                       // a mouse is present → workstation
    const hover = window.matchMedia?.("(any-hover: hover)")?.matches === true;
    if (hover) return false;                                      // something can hover → so is this
    if (Number(navigator.maxTouchPoints) > 1) return true;
    return window.matchMedia?.("(any-pointer: coarse)")?.matches === true;
  } catch (e) { return false; } // can't tell → treat as a workstation (keep the rail armed)
}

/* -------------------------------------------- */
/*  The gate                                    */
/* -------------------------------------------- */

/**
 * May a full-viewport overlay cover THIS client's screen? The one gate — every opaque
 * inset-0 layer asks this and nothing else. Any uncertainty answers NO.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.selfScreen] §39.5: online with no shared screen, a PLAYER's own client
 *   is the screen, so it carries the show. Never promotes a GM — that is what the opt-in is for.
 */
export function mayCoverViewport({ selfScreen = false } = {}) {
  let gm = null;
  try { gm = !!game.user?.isGM; } catch (e) { return false; } // can't even tell who we are → no
  // The bypasses first, so the gate and the rail can never disagree about the same client: the
  // URL/localStorage hatch and the console panic button both mean "cover nothing here", and that
  // has to include the TV, or `uncover()` on the table's screen would hide the board while every
  // feature still believed it was up.
  if (forced || onlyEscapeHatch()) return false;
  if (displayHere()) return true;              // the table's screen: covering it IS the feature
  // An explicit per-device `dm` role outranks the opt-in, in BOTH halves (2026-10-05). The rail
  // reads the same setting in shouldKeepGmClear(), and this half has to read it too or the two
  // disagree about one client — a GM with role `dm` AND the opt-in ticked would have features
  // mounting layers the rail then strips on the next sweep, which is the one state the header of
  // this function promises cannot arise. "This device is my workstation" is a stronger statement
  // than "show me the table's theatre", so it wins over it rather than falling through to it.
  if (gm && stg("role", "auto") === "dm") return false;
  if (gm) return dmScreenOverlaysOn();         // the DM's own screen: opt-in only
  // §39.5, and it has to be asked BEFORE the phone question, exactly as the gates it replaces did
  // (entrances.js/boss-intro.js both returned true here ahead of their own `!isPhoneClient()`):
  // online with no shared screen there IS no table screen, so every player's own client is the
  // screen — phones included, because a phone is all that player has. Checked only for callers
  // that pass selfScreen, and it never reaches a GM: that is settled one line above.
  //
  // settings.js's isOnlineTable() + hasSharedScreen(), read through stg() rather than imported so
  // this file keeps its single dependency (preset.js) and stays cycle-proof. Unknown → "in person"
  // and "no TV", the conservative pair: it does not light up a player's own screen on a guess.
  if (selfScreen && stg("tableMode", "person") === "online" && !stg("displayOwnerUser", null)) return true;
  // Everyone else, phones included: a shared-screen overlay is not for them. (A phone's own
  // full-screen pieces — the ticket, the flashes — travel effects.js's PHONE_FX path, not this one.)
  return false;
}

/**
 * The OLD gate, kept for the one overlay that does not cover: `#mc-drusk` (styles/shell.css)
 * is z-index 4 at 30% opacity under every piece of Foundry's UI — a sky tint on the canvas, not a
 * layer over the screen. It stays on the DM's client because it was never the problem; it is named
 * here so that "which overlays bypass the gate, and why" is one short, auditable list of one.
 */
export function onSharedScreenNonCovering() {
  try { return !phoneHere() && (displayHere() || !!game.user?.isGM); } catch (e) { return false; }
}

/* -------------------------------------------- */
/*  The kill path                                */
/* -------------------------------------------- */

/** Is this the client that must NEVER be covered: a GM, at a keyboard, not the TV, not a phone,
 *  without the opt-in? EVERY uncertain answer is YES (keep it clear) — that is the rail's whole
 *  reason to exist, and it is the direction the three `return true`s below all fail in. */
export function shouldKeepGmClear() {
  if (forced || onlyEscapeHatch()) return true; // asked for explicitly: nothing outranks it
  let gm = false;
  // `game` itself missing means we are running before ready, from a macro or an early hook — the
  // one state where we cannot tell whether we are the GM. Protect: refusing to build an overlay
  // costs a beat of theatre, and the alternative is the blocker this file exists to stop.
  try { gm = !!game.user?.isGM; } catch (e) { return true; }
  if (!gm) return false;                  // a player's client: the rail has nothing to do with it
  if (phoneHere()) return false;          // an explicit per-device "this is a phone" wins
  if (displayHere()) return false;        // an explicit per-device / per-account "this is the TV"
  // ⚠️ 2026-10-05 — THE REMEDY THE MESSAGE BELOW PRESCRIBES DID NOT EXIST. It has told anyone who
  // landed here to *Set the per-device role to "dm" to force the rail on* since it was written.
  // The `dm` choice is real (`settings.js` role choices) but NOTHING in scripts/ ever compared
  // `role` to `"dm"` — grep found zero reads — so following the instruction changed nothing and
  // the stand-down fired anyway. Worse, it is the first thing an RDP-affected DM would try, so
  // the one branch with a known false positive sent him to a dead end. This line is that read:
  // an explicit per-device "this is a workstation" now outranks any guess about the hardware,
  // which is the same courtesy `phone` and `display` already got two lines up.
  if (stg("role", "auto") === "dm") return true;
  if (isTouchOnlyClient()) {
    // A GM signed in on an iPad with no mouse may BE the table surface. Said out loud, because a
    // rail that silently declines to arm is indistinguishable from a rail that is broken.
    console.log(`${MODULE_ID} | safety rail stood down: touch-only GM client (no mouse) — treating this device as a possible table surface. Set the per-device role to "dm" to force the rail on, or run MobileCommand.uncover() right now.`);
    return false;
  }
  return !dmScreenOverlaysOn();
}

// A bypass that OUTLIVES the opt-in: a DM who opted in and then got covered has no UI to opt back
// out with. `?mcNoCover=1` on the URL, or `localStorage["mc.noCover"] = "1"`, arms the rail for
// that load whatever the setting says. Both halves honour it — shouldKeepGmClear() (the body
// class, the sweep, the watchers, openShell's refusal) and mayCoverViewport() (every feature-side
// mount) — so the gate and the rail can never disagree about the same client. It is NOT GM-gated:
// a player's phone stuck behind a ticket, or a TV showing a board nobody can clear, is the same
// problem and the same escape. The URL form writes nothing at all; the localStorage form is the
// one to use when it must survive a reload, and removing that key is the whole undo.
function onlyEscapeHatch() {
  try {
    if (new URLSearchParams(window.location.search).get("mcNoCover") === "1") return true;
    return window.localStorage.getItem("mc.noCover") === "1";
  } catch (e) { return false; }
}

/** The panic button, for the DM who opted in and then lost his screen. Arms the rail for the rest
 *  of this session — body class, sweep and watchers all — regardless of the opt-in, so the board
 *  cannot come back on the next canvasReady/syncFx pass. Reload to undo; nothing is written. */
export function forceRail() {
  forced = true;
  return reapplyGuard();
}

// Every MC layer that can cover the viewport, by selector. The CSS rail (styles/shell.css, the
// `body.mc-dm-clear` block) hides this same list declaratively — so a layer that re-mounts after
// the sweep is hidden the moment it appears, with no observer in the hot path. Keep the two lists
// identical; `verifyRail()` below fails loudly if they drift.
// Line numbers are deliberately NOT cited here: this list is one edit away from shifting every
// number in styles/shell.css (adding the rail's own CSS block moved 30 of them), and a comment
// that lies is worse than one that says less. The selector IS the address — grep it.
export const COVERING_SELECTORS = [
  "#mobile-command-shell",  // the phone shell (shell.css, z 9999, opaque)
  "#mc-shell-backdrop",     // shell.css
  "#mc-cardtable",          // §38.4a (shell.css, z 55, opaque, and swallows clicks)
  "#mc-cmstation",          // §36 (shell.css, z 55, opaque)
  "#mc-seance",             // §30 (shell.css, z 60, opaque)
  "#mc-entrance",           // §40.6 (entrances.css, z 99500)
  "#mc-bossintro",          // §40 (shell.css, z 99500)
  "#mc-audio-unlock",       // §27 display audio (shell.css, z 95)
  "#mc-tv-nopc",            // §23.7 "No PCs in scene", the sound card's twin (shell.css, z 95)
  ".mc-cmticket",           // §36 the ticket (shell.css, z 99000)
  ".mc-tarot-hand",         // §42 (shell.css, z 9998)
  ".mc-onboard",            // player onboarding (shell.css, z 10001)
  ".mc-paused"              // §17.3 split-scene wait (shell.css, z 10001)
];

// Things that are fixed and ours but are MEANT to be on a DM's screen — never swept, by the listed
// pass or by the geometry pass. The DM panel is first by necessity, not preference: it is the only
// way back to the toggles. The §26 one-shots are here because they ARE full-viewport by geometry
// and the unlisted-geometry branch would otherwise hide them permanently on a protected client —
// they are pointer-events:none, they self-remove in under a second, and they cannot strand anyone.
const KEEP = [
  "#mc-dm-panel",       // the way back to every toggle
  "#mc-clean-hint",     // the clean-mode escape hatch's own hint
  ".mc-phone-dialog",   // lifted dialogs (and their own close)
  "#mc-drusk",          // §43 the sky tint (shell.css): z 4, 30% opacity, under all of Foundry's UI
  "#mc-pause-edge",     // the pause edge-glow: pointer-events:none, no content
  ".mc-fx-flash",       // §26 lightning — one-shot, pointer-events:none
  ".mc-fx-dim",         // §26 the doom dim — one-shot
  ".mc-fx-static",      // §26 cursed static — one-shot, and it starts at non-zero opacity
  ".mc-fxp-heart"       // §26 the phone heartbeat vignette (phone-only; here for completeness)
];

/** Is `el` a fixed layer that covers most of the viewport? Geometry + computed style, so an
 *  overlay nobody listed is caught too. Cheap: only ever run on direct children of <body>. */
function coversViewport(el) {
  try {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed") return false;
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    const w = window.innerWidth || 1, h = window.innerHeight || 1;
    return r.width >= w * 0.9 && r.height >= h * 0.9;
  } catch (e) { return false; }
}

const swept = new Set();
/** What the rail has hidden this session — the diagnostic the DM can read from the console. */
export function clearedLayers() { return [...swept]; }

/** Hide — never remove — every covering MC layer on this client. Hiding, not removing, because
 *  each feature holds its own `root` reference and a removed node would leave it believing the
 *  board is still up (and the house rule is that we delete nothing). */
export function sweepCoveringLayers({ quiet = false } = {}) {
  const hit = [];
  const mark = (el, why) => {
    if (!el || el.dataset?.mcCleared === "1") return;
    el.dataset.mcCleared = "1";
    el.style.setProperty("display", "none", "important");
    const name = el.id ? `#${el.id}` : `.${[...el.classList].join(".")}`;
    hit.push(`${name} (${why})`);
    swept.add(name);
  };
  try {
    for (const sel of COVERING_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) mark(el, "listed");
    }
    // The unlisted case: anything of OURS, body-level, fixed and covering the screen.
    for (const el of document.body?.children ?? []) {
      if (!(el instanceof HTMLElement)) continue;
      if (KEEP.some(k => el.matches?.(k))) continue;
      const ours = /^(mc-|mobile-command)/.test(el.id || "") || [...el.classList].some(c => c.startsWith("mc-"));
      if (!ours) continue;
      if (coversViewport(el)) mark(el, "unlisted — geometry");
    }
  } catch (e) { console.warn(`${MODULE_ID} | overlay sweep failed`, e); }
  if (hit.length && !quiet) {
    console.warn(`${MODULE_ID} | safety rail: hid ${hit.length} full-screen overlay(s) on this GM client — ${hit.join(", ")}`);
  }
  return hit;
}

/**
 * §22.9 PUT THE FOUNDRY UI BACK. The rail's other half: MC hides core UI in exactly one way —
 * `body.mc-clean`, whose CSS block in styles/shell.css hides #ui-top, #ui-left, #ui-right,
 * #ui-bottom, #scene-navigation, #scene-controls, #sidebar, #hotbar, #players, #logo,
 * #notifications and every `.app`/`.application` window (the v14 ids; the list also carries v13's
 * #navigation/#controls, which are inert on 14 and harmless). Nothing in this module detaches a
 * core UI node — the templates compile and render, then this class hides them, which is exactly
 * the "compiles but isn't there" signature.
 *
 * So on a protected client the rail takes the class off and says so. It does NOT fight the
 * keybinding afterwards: ` is a deliberate, reversible, per-press choice and a DM may genuinely
 * want a clean canvas on his own screen. What cannot happen any more is arriving in clean mode
 * without having asked.
 */
export function restoreCoreUi() {
  const undone = [];
  try {
    for (const c of ["mc-clean", "mc-display"]) {
      if (document.body.classList.contains(c)) { document.body.classList.remove(c); undone.push(c); }
    }
    // The skin that reaches into Simple Calendar's own DOM goes with them (§22.8): on a protected
    // client MC authors nothing onto a third-party app window.
    if (document.body.classList.contains("mc-skin-calendar")) {
      document.body.classList.remove("mc-skin-calendar"); undone.push("mc-skin-calendar");
    }
    document.getElementById("mc-clean-hint")?.remove();
  } catch (e) { console.warn(`${MODULE_ID} | could not restore the core UI`, e); }
  if (undone.length) {
    console.warn(`${MODULE_ID} | safety rail: removed ${undone.join(", ")} — the Foundry UI is visible again on this GM desktop client (§22.9)`);
  }
  return undone;
}

/** Which persisted world states would put a board up — the thing the DM actually has to turn off.
 *  Read-only: we never write or clear a world setting to repair a client-side symptom. */
export function stuckOverlayStates() {
  const on = [];
  const fx = stg("fxActive", {}) || {};
  if (stg("cardTableOn", false) === true) on.push("the session-zero card table (DM panel → Session zero)");
  if (fx.cmStation) on.push("the Ghostlight station (DM panel → Crooked Moon → All aboard)");
  if (fx.cmIntro) on.push("a Crooked Moon introduction card");
  if (fx.cmTrain) on.push("the Ghostlight train");
  if (fx.seance) on.push("the séance board (DM panel → Crooked Moon → Séance)");
  return on;
}

/** Undo the hiding — for the DM who deliberately turns the opt-in ON mid-session. Clears the body
 *  class and the per-element marks so each feature's next sync can show its layer again. */
export function releaseGuard() {
  try {
    document.body.classList.remove("mc-dm-clear");
    for (const el of document.querySelectorAll('[data-mc-cleared="1"]')) {
      el.removeAttribute("data-mc-cleared");
      el.style.removeProperty("display");
    }
    swept.clear();
  } catch (e) { console.warn(`${MODULE_ID} | could not release the overlay rail`, e); }
}

/** Re-decide, now. The `dmScreenOverlays` onChange calls this, so a tick of the box takes effect
 *  in both directions without a reload — and the rail re-arms itself the moment it is wanted. */
export function reapplyGuard() {
  // The calendar skin (§22.8) rides the same decision, so it flips with the rail rather than
  // staying wherever `ready` left it — the opt-in is symmetric in both directions or it is a trap.
  try { globalThis.MobileCommand?.applyCalendarSkinClass?.(); } catch (e) { /* pre-ready */ }
  if (shouldKeepGmClear()) {
    document.body.classList.add("mc-dm-clear");
    const restored = restoreCoreUi();
    return { rail: "on", restored, hidden: sweepCoveringLayers() };
  }
  releaseGuard();
  return { rail: "off", restored: [], hidden: [] };
}

/** The sweep as the watchers call it: gated, so it never touches a TV or an opted-in DM screen. */
function sweepIfProtected() { if (shouldKeepGmClear()) sweepCoveringLayers(); }

/**
 * Install the rail, from main.js's ready hook, BEFORE registerFxEngine() can mount anything.
 *
 * The watchers are installed on EVERY client, unconditionally, and each one re-asks
 * shouldKeepGmClear() at call time — so a DM who toggles the opt-in back off mid-session is
 * protected again immediately, without the "the observer was never installed because the rail
 * wasn't needed at ready" hole. On an unprotected client they are a matched pair of no-ops.
 */
export function installOverlayGuard() {
  // The imperative half, for anything the CSS list does not name. An observer rather than a poll:
  // body-level childList only, so it fires a handful of times a session.
  try {
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          if (KEEP.some(k => n.matches?.(k))) continue;
          const ours = /^(mc-|mobile-command)/.test(n.id || "") || [...n.classList].some(c => c.startsWith("mc-"));
          if (ours) sweepIfProtected();
        }
      }
    });
    obs.observe(document.body, { childList: true });
  } catch (e) { console.warn(`${MODULE_ID} | could not watch for overlays`, e); }
  // canvasReady runs syncFx() again (effects.js:1112) — catch that pass too.
  Hooks.on("canvasReady", () => sweepIfProtected());

  if (!shouldKeepGmClear()) return false;
  document.body.classList.add("mc-dm-clear"); // the declarative half (styles/shell.css)
  const unhid = restoreCoreUi();             // §22.9 the actual blocker: clean mode on a workstation
  sweepCoveringLayers({ quiet: true });
  // Tell him, in plain words and in a notification that does NOT fade, what was wrong and what is
  // still switched on. The rail makes his Foundry usable; this is how he learns which setting to
  // change so it stays that way and the real TV still behaves.
  const notes = [];
  // Report the CONDITION, not the symptom. §22.9 in isDisplayClient() means `mc-clean` is no
  // longer applied on a GM client at all, so waiting for restoreCoreUi() to have undone something
  // would make this message unreachable on exactly the client it was written for — the DM whose
  // own GM account is sitting in `displayOwnerUser`, which is the blocker's own configuration.
  // The misconfiguration is still there and still wrong (a GM display shows GM vision), so say so
  // whether or not it managed to hide anything this time.
  try {
    if (game.user?.isGM && game.user.id === stg("displayOwnerUser", null)) {
      notes.push("Your own GM account is set as the table's shared display, which is why Mobile "
        + "Command was hiding the Foundry UI on this screen. It will not hide it again. Fix the "
        + "setting in Module Settings → Mobile Command → \"Share PCs with the display/TV account\": "
        + "choose a non-GM player account, or \"none\" if you have no table screen yet.");
    }
  } catch (e) { /* pre-ready: the ready caller always has a user */ }
  if (unhid.includes("mc-clean")) {
    notes.push("Mobile Command was hiding the Foundry UI on this screen (clean display mode). "
      + "The UI is back. Press ` to hide it again if you meant to.");
  }
  const stuck = stuckOverlayStates();
  if (stuck.length) {
    notes.push(`Still switched on for the table: ${stuck.join("; ")}.`);
  }
  for (const msg of notes) {
    console.warn(`${MODULE_ID} | ${msg}`);
    try { notifier.warn(msg, { permanent: true }); } catch (e) { /* notifications late */ }
  }
  console.log(`${MODULE_ID} | safety rail active — this GM desktop client cannot be covered or hidden (§22.7/§22.9)`);
  return true;
}

/** Self-check for the §28.4 preflight: does the CSS rail name every selector the JS list does?
 *  A selector in one list and not the other is the failure mode this whole file exists to stop. */
export function verifyRail() {
  // Every `body.mc-dm-clear …` selector our stylesheets declare, flattened into one string.
  let railText = "";
  try {
    for (const sheet of document.styleSheets) {
      let rules = null;
      try { rules = sheet.cssRules; } catch (e) { continue; } // cross-origin sheet: not ours
      for (const r of rules ?? []) {
        if (r.selectorText?.includes("mc-dm-clear")) railText += ` ${r.selectorText}`;
      }
    }
  } catch (e) { return { ok: false, error: String(e) }; }
  if (!railText) return { ok: false, error: "no body.mc-dm-clear rule found — the CSS half of the rail is missing" };
  const missing = COVERING_SELECTORS.filter(sel => !railText.includes(sel));
  return { ok: missing.length === 0, checked: COVERING_SELECTORS.length, missing };
}
