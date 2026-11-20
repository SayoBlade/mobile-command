/**
 * DICER DICE ON MIDI'S ROLLS (deck-command SEAT 9, 2026-11-20; DM: "posting the result only after the die is rolled
 * sounds like an advantage to me, it builds a little suspense, lets try the bridge").
 *
 * WHY MIDI SHOWS NO DICE UNDER DICER (read from midi-qol 14.6.13's own source, 2026-11-20):
 *   - `dice3dEnabled()` = `installedModules.get("dice-so-nice") && (game.dice3d.isEnabled() || game.dice3d.config.enabled)`.
 *   - `installedModules` is midi's private Map, filled ONCE by `setupModules()` inside midi's own `Hooks.once("setup")`
 *     from `game.modules.get("dice-so-nice")?.active`. Dicer is not that module, so it stays false forever.
 *   - Midi then still marks every die `hidden` (DSNMarkDiceDisplayed) so nobody's chat hook throws them either.
 *   Dicer's `game.dice3d.showForRoll(roll, user, synchronize, whisper, blind, messageId, speaker)` has Dice So Nice's
 *   shape, and Dicer answers `isEnabled()`. So the ONLY missing piece is midi's one startup look.
 *
 * WHAT THIS DOES — only when Dicer is on, Dice So Nice is OFF, and midi is on:
 *   1. Wraps midi's own setup callback (found by its call to `setupModules()`), so that while it runs, the FIRST read
 *      of `game.modules.get("dice-so-nice").active` answers true — then the real `get` is back. No other module, and
 *      no later midi code, ever sees the pretence. Midi's Map now says "dice-so-nice: yes" for the session.
 *   2. Answers the two Dice So Nice settings midi reads directly (they would throw, DSN being off):
 *      `hideNpcRolls` → false (DSN's default: NPC dice shown); `showGhostDice` → Dicer's own `showGhostDice`.
 *   3. Caps how long a caller waits for the dice at CAP_MS (5 s, his number), so midi can never hang on an animation
 *      that does not end: past it midi carries on and the dice finish on their own.
 *   From there midi does it all itself: it AWAITS the dice before it writes the result (the suspense he asked for),
 *   and it decides blind / whisper / GM-hidden by its own settings, as it did under Dice So Nice.
 *   No double dice: midi marks the dice it threw as shown, so Dicer's own chat path skips them; plain rolls (not midi's)
 *   never pass through here and stay Dicer's alone. Measured on the seat 2026-11-20.
 *
 * STANDS DOWN when Dice So Nice is active (it would be the real thing, and two engines would double the dice), when
 * Dicer or midi is off, when Dicer says it handles midi itself (a Dicer setting or API member naming midi — none in
 * 1.3.14), or when midi's setup callback cannot be found — the last one tells the GM once (RULES 16: a feature that
 * disappears must disappear visibly).
 *
 * ALSO (his requirement, relayed 2026-11-20): Dicer's 3D dice are OFF on a phone. "Enable 3D dice" is Dicer's per-
 * browser setting; on a device Mobile Command runs as a phone it is turned off, and turned back on only if we were the
 * ones who turned it off and the device stops being a phone.
 */

import { notifier } from "./notifier.js";

const DSN = "dice-so-nice";
export const CAP_MS = 5000;

/** Does Dicer say it handles midi itself? A Dicer setting (truthy) or an API member whose name mentions midi. */
export function dicerHandlesMidi({ settingKeys = [], settingValue = () => undefined, apiKeys = [] } = {}) {
  for (const k of settingKeys) { try { if (/midi/i.test(k) && settingValue(k)) return true; } catch { /* unreadable: not a yes */ } }
  return apiKeys.some((k) => /midi/i.test(String(k)));
}

/**
 * Dicer on a phone: what to do with this browser's "Enable 3D dice". Pure.
 * Returns { set: true|false|null, mark: true|false|null } — null means leave it alone.
 */
export function phoneDicePlan({ isPhone, enabled, markedByUs }) {
  if (isPhone) return enabled ? { set: false, mark: true } : { set: null, mark: null };
  if (markedByUs) return { set: true, mark: false };   // we turned it off when this was a phone; put it back
  return { set: null, mark: null };
}
export const PHONE_MARK = "mobile-command.dicerOffForPhone";

/** Apply phoneDicePlan on this browser. Call at "ready" with MC's own isPhoneClient(). */
export async function applyPhoneDice(isPhone) {
  if (!globalThis.game?.modules?.get("dicer")?.active) return null;
  let enabled; try { enabled = game.settings.get("dicer", "enabled"); } catch { return null; }
  let markedByUs = false; try { markedByUs = localStorage.getItem(PHONE_MARK) === "1"; } catch { /* storage off */ }
  const plan = phoneDicePlan({ isPhone: Boolean(isPhone), enabled: enabled === true, markedByUs });
  if (plan.set !== null) { try { await game.settings.set("dicer", "enabled", plan.set); } catch { return null; } }
  try {
    if (plan.mark === true) localStorage.setItem(PHONE_MARK, "1");
    if (plan.mark === false) localStorage.removeItem(PHONE_MARK);
  } catch { /* storage off */ }
  dicerMidiState.phoneDice = plan.set === null ? (enabled ? "on" : "off") : (plan.set ? "on (restored)" : "off (phone)");
  return plan;
}

/** Is the bridge wanted? Pure given an active(id) predicate. */
export function bridgeWanted(active) {
  return Boolean(active("dicer") && active("midi-qol") && !active(DSN));
}

/** Is this hooked function midi's setup callback? It is the one that calls setupModules(). */
export function isMidiSetup(fn) {
  try { return typeof fn === "function" && /\bsetupModules\(\)/.test(Function.prototype.toString.call(fn)); }
  catch { return false; }
}

/** The answers for Dice So Nice settings midi reads directly. `dicerGet(key)` reads a Dicer setting. */
export function dsnAnswer(key, dicerGet) {
  if (key === "hideNpcRolls") return false;
  if (key === "showGhostDice") { try { return dicerGet("showGhostDice") === true; } catch { return false; } }
  return undefined;
}
export const DSN_KEYS = new Set(["hideNpcRolls", "showGhostDice"]);

/**
 * A stand-in for the Dice So Nice module that says "active" exactly once, then calls `onServed`. Everything else is
 * read from the real (installed, inactive) module; with none installed, a version midi accepts.
 */
export function oneShotActive(real, onServed) {
  // ⚠️ NOT a Proxy over the real module: Foundry's Module.active is a read-only, non-configurable property, and a
  // Proxy that answers anything else for it THROWS (a JS invariant). Seen on the seat 2026-11-20: that throw landed
  // inside midi's setup and skipped the rest of it. A plain stand-in carries only what midi's check reads.
  let served = false;
  return {
    id: DSN,
    title: real?.title ?? "Dice So Nice!",
    version: real?.version || "6.0.0",
    get active() {
      if (!served) { served = true; onServed?.(); return true; }
      return Boolean(real?.active);
    }
  };
}

/** Wrap a hooked entry's fn so that, while it runs, modules.get(DSN) answers active once. Returns true if wrapped. */
export function wrapSetupEntry(entry, modules, onServed, shouldServe = () => true) {
  if (!entry || typeof entry.fn !== "function" || entry.fn.__mcDicerMidi) return false;
  const original = entry.fn;
  const wrapped = function (...args) {
    dicerMidiState.ran = true;
    // decided at "setup", when every module's settings exist: Dicer may have taken midi on by then
    let serve = true; try { serve = shouldServe() !== false; } catch { serve = true; }
    if (!serve) return original.apply(this, args);
    const hadOwn = Object.prototype.hasOwnProperty.call(modules, "get");
    const ownBefore = modules.get;
    const restore = () => {
      if (hadOwn) modules.get = ownBefore;
      else delete modules.get;
    };
    let restored = false;
    const restoreOnce = () => { if (!restored) { restored = true; restore(); } };
    const served = () => { onServed?.(); restoreOnce(); };
    modules.get = function (id, ...rest) {
      const m = ownBefore.call(this, id, ...rest);
      if (id !== DSN || restored) return m;
      try { return oneShotActive(m, served); } catch { restoreOnce(); return m; } // never break midi's own setup
    };
    try { return original.apply(this, args); }
    finally { restoreOnce(); }
  };
  wrapped.__mcDicerMidi = true;
  entry.fn = wrapped;
  return true;
}

/** Cap a showForRoll-like function: the caller waits at most `ms`, then gets false. */
export function capped(fn, ms = CAP_MS, onTimeout) {
  if (typeof fn !== "function" || fn.__mcCapped) return fn;
  const out = function (...args) {
    let timer;
    const timeout = new Promise((res) => { timer = setTimeout(() => { onTimeout?.(); res(false); }, ms); });
    const run = Promise.resolve().then(() => fn.apply(this, args));
    return Promise.race([run, timeout]).finally(() => clearTimeout(timer));
  };
  out.__mcCapped = true;
  return out;
}

/** What happened this session — for the console, the deck and a seat test. */
export const dicerMidiState = { wanted: false, hooked: false, ran: false, served: false, settings: false, capped: false, timeouts: 0, reason: "" };

/** Call from MC's init hook (before "setup" fires). */
export function registerDicerMidiBridge() {
  const active = (id) => globalThis.game?.modules?.get(id)?.active === true;
  dicerMidiState.wanted = bridgeWanted(active);
  if (!dicerMidiState.wanted) {
    dicerMidiState.reason = active(DSN) ? "Dice So Nice is on" : "Dicer or midi is off";
    return;
  }
  const entry = (Hooks.events?.setup ?? []).find((e) => isMidiSetup(e?.fn));
  dicerMidiState.entry = entry ? Function.prototype.toString.call(entry.fn).slice(0, 60) : "";
  const dicerSaysMidi = () => dicerHandlesMidi({
    settingKeys: [...(game.settings.settings?.keys?.() ?? [])].filter((k) => k.startsWith("dicer.")).map((k) => k.slice(6)),
    settingValue: (k) => game.settings.get("dicer", k),
    apiKeys: Object.keys(game.modules.get("dicer")?.api ?? {})
  });
  const shouldServe = () => {
    if (!dicerSaysMidi()) return true;
    dicerMidiState.reason = "Dicer handles midi itself";
    return false;
  };
  dicerMidiState.hooked = wrapSetupEntry(entry, game.modules, () => { dicerMidiState.served = true; }, shouldServe);
  if (!dicerMidiState.hooked) {
    dicerMidiState.reason = "midi's startup changed: could not find its setup step";
    Hooks.once("ready", () => {
      if (game.user?.isGM) notifier.warn("Mobile Command: midi rolls will show no Dicer dice this session (midi's startup changed). Tell Claude.", { permanent: true });
    });
    console.warn("mobile-command | Dicer↔midi bridge: " + dicerMidiState.reason);
    return;
  }

  const settings = game.settings;
  const realGet = settings.get;
  settings.get = function (namespace, key, ...rest) {
    if (namespace === DSN && DSN_KEYS.has(key) && !this.settings?.has?.(`${DSN}.${key}`)) {
      return dsnAnswer(key, (k) => realGet.call(this, "dicer", k));
    }
    return realGet.call(this, namespace, key, ...rest);
  };
  dicerMidiState.settings = true;

  // Dicer puts game.dice3d up AFTER "ready" (seen on the seat: absent on a player's screen right after ready), so the
  // cap waits for it — every half second, for up to a minute.
  const capWhenThere = (tries = 0) => {
    if (!dicerMidiState.served) return; // midi was not given the dice (Dicer took midi on itself): leave Dicer alone
    const d3 = game.dice3d;
    if (!(d3 && typeof d3.showForRoll === "function")) {
      if (tries < 120) setTimeout(() => capWhenThere(tries + 1), 500);
      return;
    }
    {
      // Dicer's game.dice3d may refuse a write (it guards some properties), so check that it took.
      try {
        d3.showForRoll = capped(d3.showForRoll.bind(d3), CAP_MS, () => {
          dicerMidiState.timeouts += 1;
          console.warn(`mobile-command | Dicer↔midi bridge: dice still rolling after ${CAP_MS / 1000} s; midi was let go`);
        });
      } catch { /* refused: midi waits on Dicer's own promise */ }
      dicerMidiState.capped = d3.showForRoll?.__mcCapped === true;
    }
    console.log("mobile-command | Dicer↔midi bridge on", { ...dicerMidiState });
  };
  Hooks.once("ready", () => capWhenThere());
}
