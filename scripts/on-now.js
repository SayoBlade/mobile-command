// ON NOW (MC redesign phase 2, DM 2026-11-26): what the automatic systems are doing, said in one place on the DM
// panel's floor. One line (music · weather · hour · TV) and a sheet behind it with the reason for each, starting with
// the lines that have bitten at the table: the game paused (and by what), the music and why, Syrinscape offline, the
// TV's sound, the TV's camera. Read-only, except the one control that overrides a line (Resume on a pause).
//
// The pieces are read from where they already live; nothing here changes what any system does. `onNowLines` is pure
// (the test drives it); `readOnNow` gathers the live state on the DM's screen.

/* ── why the game is paused ──────────────────────────────────────────────────────────────────────────────────────
 * Each place that pauses the game on its own names itself here just before it does. A pause nobody named is yours.
 * Cleared when the game resumes. Kept on this screen only (the pausing screen is the DM's). */
let pauseWhy = null;
export function notePause(why) { pauseWhy = String(why ?? "") || null; }
export function pauseReason(paused = globalThis.game?.paused) { return paused ? pauseWhy : null; }
export function onPauseGameForWhy(paused) { if (!paused) pauseWhy = null; }

const first = (s) => String(s ?? "").trim();

/** Why this music: a pure read of music.js state(). */
export function musicWhy(m = {}) {
  if (!m.enabled) return { text: "off", why: "the music layer is off" };
  if (m.manual === "silence") return { text: "silence", why: "you chose silence" };
  if (!m.now) return { text: "nothing", why: m.auto ? "no music for this place" : "you chose it" };
  if (m.cue) return { text: m.now, why: "a cue is playing" };
  if (m.manual) return { text: m.now, why: m.manual === "battle" ? "you chose battle music" : "you chose it" };
  if (m.inCombat) return { text: m.now, why: "the fight" };
  if (m.nowRoom) return { text: m.now, why: `the party is in ${first((m.rooms ?? []).find((r) => r.uuid === m.nowRoom)?.name) || "a scored room"}` };
  return { text: m.now, why: "this scene" };
}

/** The TV's camera, in a word or two. */
export function tvCameraWhat({ manual = false, held = false, combat = false, followed = 0, of = 0 } = {}) {
  // `short`: the word the floor line shows beside the TV glyph; none when the camera does its usual thing
  if (held) return { text: "held", short: "held", why: "an intro holds the picture" };
  if (manual) return { text: "manual", short: "manual", why: "your pan and zoom drive it" };
  if (combat) return { text: "spotlight", short: "turns", why: "it follows whose turn it is" };
  if (!of) return { text: "party", why: "no party tokens on this scene" };
  if (followed === 0) return { text: "follows nobody", short: "nobody", why: "you turned off following everyone", warn: true };
  if (followed < of) return { text: `follows ${followed}/${of}`, short: `${followed}/${of}`, why: "some heroes are not followed" };
  return { text: "follows party", why: "it frames every hero" };
}

/** The TV's sound, from the display's own report (settings.js tvAudioState). */
export function tvSoundWhat(rep, muted, now = Date.now()) {
  if (!rep || now - (rep.at ?? 0) > 45000) return { text: "no TV", why: "no display is reporting", warn: true };
  if (rep.locked) return { text: "tap the TV", why: "its browser plays nothing until it is tapped once", warn: true };
  if (rep.paused) return { text: "tap the TV", why: "its browser has paused its sound", warn: true };
  if (muted || rep.muted) return { text: "muted", why: "you muted the table", warn: true };
  return { text: "live", why: "the TV is playing sound" };
}

/**
 * The floor line (SEAT 37: four facts cut to a few letters each at the panel's width). The line now carries the
 * music by name and two glyphs: the weather (its kind as the glyph; the name on hover and in the sheet) and the TV
 * camera (a short word only when it is not simply following the party). The hour lives in the sheet. A warning
 * line that is not on the floor line marks it. Each: { key, icon, text?, title, warn? }.
 */
export function onNowFloor(lines = []) {
  const by = (k) => lines.find((l) => l.key === k);
  const out = [];
  const m = by("music"); if (m) out.push({ key: "music", icon: m.icon, text: m.text, title: `Music: ${m.text}${m.why ? ` · ${m.why}` : ""}`, warn: m.warn });
  const w = by("weather"); if (w) out.push({ key: "weather", icon: w.icon, title: `Weather: ${w.text}` });
  const t = by("tv"); if (t) out.push({ key: "tv", icon: t.icon, ...(t.short ? { text: t.short } : {}), title: `TV camera: ${t.text}${t.why ? ` · ${t.why}` : ""}`, warn: t.warn });
  return out;
}

/**
 * The floor line and the sheet, from plain state. Each line: { key, icon, label, text, why?, warn?, act? }.
 * The floor line shows music, weather and TV (onNowFloor); the sheet shows them all.
 */
export function onNowLines(s = {}) {
  const lines = [];
  const mus = musicWhy(s.music ?? {});
  lines.push({ key: "music", icon: "music", label: "Music", text: mus.text, why: mus.why });
  lines.push({ key: "weather", icon: s.weather ? "cloud-rain" : "sun", label: "Weather", text: s.weather || "clear" });
  lines.push({ key: "hour", icon: "clock", label: "Time", text: s.clock || "—" });
  const cam = tvCameraWhat(s.tv ?? {});
  lines.push({ key: "tv", icon: "tv", label: "TV camera", text: cam.text, short: cam.short, why: cam.why, warn: cam.warn });
  if (s.paused) lines.push({ key: "pause", icon: "pause", label: "Game", text: "paused", why: s.pauseWhy ? `by ${s.pauseWhy}` : "by you", warn: true, act: "resume" });
  const snd = tvSoundWhat(s.tvSound, s.tvMuted, s.now);
  lines.push({ key: "sound", icon: "volume-high", label: "TV sound", text: snd.text, why: snd.why, warn: snd.warn });
  if (s.syr?.module) {
    const local = s.syr.local;
    lines.push({ key: "syr", icon: "cloud", label: "Syrinscape",
      text: s.syr.offline ? "offline" : local ? "local files" : "online",
      why: s.syr.offline ? "playing the local copies instead" : local ? "you chose local files" : undefined, warn: !!s.syr.offline });
  }
  if (s.reactions) lines.push({ key: "reactions", icon: "bolt", label: "Reactions", text: s.reactions });
  return lines;
}
