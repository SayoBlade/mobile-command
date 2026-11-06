/**
 * THE ONE WAY OUT TO THE SCREEN. Every toast this module raises goes through here.
 *
 * ⚠️ DM 2026-11-06: *"the mods send out no more than 5 messages, errors or warnings in one go; if
 * something happens multiple times report it once."* A migration pass had just raised one toast per
 * key, hundreds of them, on loading his world.
 *
 * Within a burst (WINDOW_MS from its first toast) a message shows once, and at most MAX_TOASTS - 1
 * distinct ones show. Everything else goes to console.debug and comes back as ONE closing toast when
 * the burst ends, so the five is a true five: repeats of one message close as "that message (×7)",
 * a mix closes as "Mobile Command: 12 more messages (details in console)". The closing toast takes the
 * worst level it covers, and stays up if anything it covers was permanent, so a held-back fatal is
 * not lost by arriving sixth.
 *
 * Returns the toast's handle, or null if it was held back.
 * `onHeld` is how rpc.js's captureNotifications still hears a refusal that never reached the screen.
 * Never throws: a missing `ui` is a headless test or a very early load.
 */
const WINDOW_MS = 5000;
const MAX_TOASTS = 5;
const RANK = { info: 0, warn: 1, error: 2 };

export function createNotifier(label, { windowMs = WINDOW_MS } = {}) {
  let sink = null;    // ui.notifications as of the last call; a new object is a new client, so a new burst
  let burst = null;
  let tap = null;

  const close = (b, target) => {
    if (burst === b) burst = null;
    const { held, shown } = b;
    if (!held.length) return;
    const level = held.reduce((worst, h) => (RANK[h.level] > RANK[worst] ? h.level : worst), "info");
    const permanent = held.some((h) => h.permanent);
    const one = new Set(held.map((h) => h.text)).size === 1;
    const text = one
      ? `${held[0].text} (×${held.length + (shown.has(`${held[0].level}|${held[0].text}`) ? 1 : 0)})`
      : `${label}: ${held.length} more messages (details in console)`;
    try { target[level]?.(text, permanent ? { permanent } : undefined); } catch { /* headless */ }
  };

  const open = (target) => {
    const b = { shown: new Set(), held: [], timer: null };
    b.timer = setTimeout(() => close(b, target), windowMs);
    b.timer?.unref?.();     // never hold a node test open
    return b;
  };

  function send(level, message, options) {
    const text = String(message);
    try {
      const target = globalThis.ui?.notifications;
      if (target !== sink) { clearTimeout(burst?.timer); burst = null; sink = target; }
      if (!target) { console.debug(`${label} | ${text}`); return null; }
      burst ??= open(target);
      const key = `${level}|${text}`;
      if (!burst.shown.has(key) && burst.shown.size < MAX_TOASTS - 1) {
        burst.shown.add(key);
        return target[level]?.(text, options) ?? null;
      }
      burst.held.push({ level, text, permanent: !!options?.permanent });
      console.debug(`${label} | toast held back: ${text}`);
      tap?.(level, text);
    } catch { /* a toast is never worth a press */ }
    return null;
  }

  return {
    info: (message, options) => send("info", message, options),
    warn: (message, options) => send("warn", message, options),
    error: (message, options) => send("error", message, options),
    onHeld: (fn) => { tap = fn; },
    remove: (handle) => { try { globalThis.ui?.notifications?.remove?.(handle); } catch { /* an older Foundry */ } },
  };
}

export const notifier = createNotifier("Mobile Command");
