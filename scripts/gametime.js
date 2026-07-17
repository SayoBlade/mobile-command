// Game time — ONE source, two backends (DM 2026-07-17: "how doable is two versions, one with SC
// installed one without it? that way if a version conflicts with the mod it won't completely
// break").
//
// The key fact that makes this cheap: **Simple Calendar does not own the time.** Foundry's
// `game.time.worldTime` does — SC only INTERPRETS it into a calendar (months, moons, sunset).
// So:
//   • advancing time is `game.time.advance()` in BOTH worlds — identical, no branch;
//   • only the LABEL differs, and that's the only thing we ask SC for.
//
// Every SC call is feature-detected AT CALL TIME and wrapped: if SC is absent, disabled, mid-update,
// or its API shape changes under us, we fall back to our own clock instead of throwing. A broken
// calendar module must never take the rest flow down with it — that was the DM's whole worry.
//
// Our own clock is just: campaignStart (a time-of-day offset, in seconds) + worldTime.
// worldTime is SECONDS SINCE THE WORLD BEGAN (probed live 2026-07-17: 360 = 6 minutes in), NOT a
// time of day — which is why "show the current game-time" had no source before this file existed.

import { MODULE_ID } from "./preset.js";

const DAY = 86400;

/** Is a usable Simple Calendar API present RIGHT NOW? Never cached — it can be disabled or updated
 *  between calls, and a stale `true` is exactly how a dependency takes you down.
 *  Capability-checked, NOT id-checked (DM 2026-07-17: original SC never got v14 — the table runs
 *  Simple Calendar REBORN, a different module id with the same `SimpleCalendar` global; the
 *  Seasons & Stars compat bridge exposes it too). Whoever provides the global keeps the clock. */
export function hasSimpleCalendar() {
  try {
    return !!globalThis.SimpleCalendar?.api?.timestampToDate;
  } catch (e) {
    return false;
  }
}

/** Our clock's zero: the offset (in seconds) added to worldTime to get game time. Encodes a full
 *  date, not just a time of day, so the DM can re-anchor to any Day·HH:MM. SC ignores it. */
function startOffset() {
  try {
    const v = Number(game.settings.get(MODULE_ID, "clockStart"));
    return Number.isFinite(v) ? v : 0;
  } catch (e) {
    return 0;
  }
}

/** Our own reading of worldTime: { day, hour, minute, time, date, label }. */
function ownClock(ts) {
  const total = Math.max(0, startOffset() + Math.floor(ts));
  const day = Math.floor(total / DAY) + 1;
  const hour = Math.floor((total % DAY) / 3600);
  const minute = Math.floor((total % 3600) / 60);
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { day, hour, minute, time, date: `Day ${day}`, label: `Day ${day} · ${time}`, source: "module" };
}

/** Time-of-day + date for a worldTime stamp. SC when it's there and works; ours otherwise. */
export function readClock(ts = game.time?.worldTime ?? 0) {
  if (hasSimpleCalendar()) {
    try {
      const d = SimpleCalendar.api.timestampToDate(ts);
      // SC's shape has moved between versions, so take what's there and demand nothing.
      const time = d?.display?.time ?? `${String(d?.hour ?? 0).padStart(2, "0")}:${String(d?.minute ?? 0).padStart(2, "0")}`;
      const date = [d?.display?.day, d?.display?.monthName, d?.display?.year].filter(Boolean).join(" ")
                || d?.display?.date || "";
      if (time) {
        return {
          day: d?.day ?? 0, hour: d?.hour ?? 0, minute: d?.minute ?? 0,
          time, date, label: [date, time].filter(Boolean).join(" · "), source: "simple-calendar"
        };
      }
    } catch (e) {
      console.warn(`${MODULE_ID} | Simple Calendar read failed — falling back to our own clock`, e);
    }
  }
  return ownClock(ts);
}

/** "Day 3 · 21:40" (or SC's own wording). Safe to call from any client. */
export function clockLabel(ts) {
  try { return readClock(ts).label; } catch (e) { return ""; }
}

/** Is it dark? SC knows properly (sunset/sunrise); otherwise assume 18:00–06:00. Advisory only —
 *  nothing mechanical hangs off this, so a wrong guess costs a moon icon, not a rule. */
export function isNight(ts = game.time?.worldTime ?? 0) {
  if (hasSimpleCalendar()) {
    try {
      const now = Number(ts);
      const sunrise = SimpleCalendar.api.getCurrentSunrise?.();
      const sunset = SimpleCalendar.api.getCurrentSunset?.();
      if (Number.isFinite(sunrise) && Number.isFinite(sunset)) return now < sunrise || now >= sunset;
    } catch (e) { /* fall through */ }
  }
  const h = readClock(ts).hour;
  return h >= 18 || h < 6;
}

/** Advance the world clock. IDENTICAL with or without SC — SC derives from worldTime, so this is
 *  the one call either way. GM-only in Foundry; callers route through the executor. */
export async function advance(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (!s) return false;
  if (!game.user?.isGM) return false;
  await game.time.advance(s);
  return true;
}

export const HOURS = (n) => Math.round(Number(n) * 3600);
