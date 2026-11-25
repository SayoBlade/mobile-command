// A phone loads quietly (DM 2026-11-25: "Make sure as few popups open on mobile view on loading").
//
// Three parts, phones only (the DM's screen is untouched; the TV already hides every notice and window, shell.css
// body.mc-clean):
//   1. NOTICES. Every toast goes through core's `Notifications#notify` (info/warn/error/success call it), so it is
//      wrapped there, at MC's load, before any module's init/ready can raise one. On a phone, while it loads (until
//      QUIET_MS after `ready`), a notice from anyone but Mobile Command is held back: kept in `phoneQuietState.held`
//      and in the console, never on the screen. Kept on screen: our own (notifier.js passes through `asOurs`), and
//      the few a player must know (KEEP_RE: the server connection lost / back, the world shutting down).
//      After the load a notice shows as usual; MC's own five-a-burst rule (notifier.js) is unchanged.
//   2. WINDOWS a module opens on its own at load (welcome, changelog, "what's new"): closed on a phone the moment they
//      render (`LOAD_WINDOWS`), during the load only. Anything the player must answer is never on that list.
//   3. CLIENT SETTINGS where a module offers a clean "don't show this" switch: set on a phone (`PHONE_SETTINGS`).
// `globalThis.mcPhoneQuiet` shows what was held or closed, for a seat.

export const QUIET_MS = 20000;
/** Notices a player must still see while loading. */
export const KEEP_RE = /lost connection|connection lost|connection re-established|WorldShuttingDown|shutting down/i;

export const phoneQuietState = { phone: null, readyAt: 0, held: [], closed: [], set: [] };
try { globalThis.mcPhoneQuiet = phoneQuietState; } catch (e) { /* no global */ }

let ours = 0;
/** Run fn as Mobile Command's own notice (never held). */
export function asOurs(fn) {
  ours += 1;
  try { return fn(); } finally { ours -= 1; }
}

/** Is this client a phone? MC's own answer once known; before MC's init, the noCanvas MC sets on every phone. */
export function phoneNow(state = phoneQuietState, storage = globalThis.localStorage) {
  if (state.phone !== null) return state.phone;
  try { return storage?.getItem?.("core.noCanvas") === "true"; } catch (e) { return false; }
}

export function loading(state = phoneQuietState, now = Date.now()) {
  return !state.readyAt || now - state.readyAt < QUIET_MS;
}

/** Hold this notice back? Pure. */
export function holdNotice({ message, phone, isLoading, isOurs }) {
  if (!phone || isOurs || !isLoading) return false;
  return !KEEP_RE.test(String(message ?? ""));
}

/** What a held notice returns to its caller: the shape core returns, doing nothing. */
const stub = (message, type) => ({ id: -1, type, message: String(message ?? ""), active: false, permanent: false, pct: 0, remove() {}, update() {} });

/** Wrap core's Notifications#notify (the class, so it holds before `ui.notifications` exists). Once only. */
export function installNoticeFilter(proto = globalThis.foundry?.applications?.ui?.Notifications?.prototype, { state = phoneQuietState, now = () => Date.now() } = {}) {
  if (!proto || typeof proto.notify !== "function" || proto.notify.__mcQuiet) return false;
  const orig = proto.notify;
  const notify = function (message, type = "info", options) {
    try {
      if (holdNotice({ message, phone: phoneNow(state), isLoading: loading(state, now()), isOurs: ours > 0 })) {
        state.held.push({ type, message: String(message ?? "").slice(0, 200) });
        console.debug(`mobile-command | phone load: held a ${type} notice —`, message);
        return stub(message, type);
      }
    } catch (e) { /* never lose a notice to our own fault */ }
    return orig.call(this, message, type, options);
  };
  notify.__mcQuiet = true;
  proto.notify = notify;
  return true;
}

/**
 * Windows a module opens by itself at load, closed on a phone while it loads. Each: { why, test(app) }.
 * Filled from the installed modules (2026-11-25 survey); never a prompt a player must answer.
 */
// The book modules open their changelog (and The Crooked Moon its intro journal) on EVERY screen at ready while the world
// setting `lastVersion` is behind, and a player cannot write a world setting, so a phone reopened it on each load until
// the GM loaded once (dnd-players-handbook.mjs:44-53 and its siblings; the-crooked-moon-2014/scripts.mjs ready).
export const BOOK_CHANGELOGS = Object.freeze(["dnd-players-handbook", "dnd-dungeon-masters-guide", "dnd-monster-manual",
  "dnd-forge-artificer", "dnd-heroes-faerun", "dnd-ravenloft-horrors-within", "dnd-arcana-unleashed", "the-crooked-moon-2014"]);
const docUuid = (app) => String(app?.document?.uuid ?? app?.object?.uuid ?? "");
const titleOf = (app) => String(app?.options?.window?.title ?? app?.title ?? "");
const loc = (k) => { try { return globalThis.game?.i18n?.localize?.(k) ?? k; } catch (e) { return k; } };
export const LOAD_WINDOWS = [
  { why: "a book's changelog journal", test: (app) => /^JournalEntry/.test(app?.document?.documentName ?? app?.object?.documentName ?? "Journal")
      && BOOK_CHANGELOGS.some((id) => docUuid(app).startsWith(`Compendium.${id}.`)) },
  // Hero Mancer 3.4.3: its welcome window (ApplicationV2 "hero-mancer-welcome"), on every screen while showWelcome
  { why: "Hero Mancer's welcome", test: (app) => app?.id === "hero-mancer-welcome" },
  // Dicer 1.4.12 tray-pick: a DialogV2 at ready while its chat tray is on and another tray module (dice-calculator,
  // daggerdice) is active; closed unanswered it is marked seen for this version and does not come back
  { why: "Dicer's \"Pick one dice tray\"", test: (app) => app?.constructor?.name === "DialogV2" && titleOf(app) === loc("DICER.TrayPick.Title") },
  // Simple Calendar Reborn 2.6.1: its calendar window (v1 FormApplication MainApp, id "fsc-if") opens at its ready on every
  // screen while the client setting open-on-load is on (SEAT 32: a full-width calendar flashed ~1 s on each phone load)
  { why: "Simple Calendar's calendar window", test: (app) => app?.id === "fsc-if" || app?.options?.id === "fsc-if" },
];

/** Close this app on a phone during the load? Returns the matching entry's `why`, or null. Pure over the app. */
export function loadWindowWhy(app, { phone, isLoading, list = LOAD_WINDOWS }) {
  if (!phone || !isLoading || !app) return null;
  for (const w of list) { try { if (w.test(app)) return w.why; } catch (e) { /* not this one */ } }
  return null;
}

export function closeLoadWindow(app, { state = phoneQuietState, now = () => Date.now(), list = LOAD_WINDOWS } = {}) {
  const why = loadWindowWhy(app, { phone: phoneNow(state), isLoading: loading(state, now()), list });
  if (!why) return false;
  state.closed.push(why);
  try {
    const el = app.element?.style ? app.element : app.element?.[0];   // a v2 HTMLElement, or a v1 jQuery set
    if (el?.style) el.style.display = "none";          // no flash before it closes
  } catch (e) { /* headless */ }
  setTimeout(() => { try { app.close(); } catch (e) { /* already gone */ } }, 0);
  return true;
}

/** Client settings that switch a load-time popup off. Each: { module, key, value, why }. */
export const PHONE_SETTINGS = [
  { module: "hero-mancer", key: "showWelcome", value: false, why: "Hero Mancer's welcome (its own per-screen switch)" },
  // Simple Calendar Reborn registers its settings under its own id; "open-on-load" is a client setting (SEAT 32)
  { module: "foundryvtt-simple-calendar-reborn", key: "open-on-load", value: false, why: "Simple Calendar's open-on-load (its own per-screen switch)" },
];

/** On a phone: set each switch once (only if registered and different). Returns how many it set. */
export async function applyPhoneSettings(g = globalThis.game, { list = PHONE_SETTINGS, state = phoneQuietState } = {}) {
  let n = 0;
  for (const s of list) {
    try {
      if (!g?.modules?.get?.(s.module)?.active) continue;
      const full = `${s.module}.${s.key}`;
      if (!g.settings.settings.has(full)) continue;
      const want = typeof s.value === "function" ? s.value(g) : s.value;
      if (want === undefined || g.settings.get(s.module, s.key) === want) continue;
      await g.settings.set(s.module, s.key, want);
      state.set.push(s.why); n += 1;
    } catch (e) { /* a module's own setting; leave it */ }
  }
  return n;
}
