// Campaign-module recognition (DESIGN §50.8; DM 2026-08-21: "make sure the mod recognizes
// supported modules (ember, CM and whatever we add)"). ONE place answers "whose campaign world
// is this?" — every campaign-aware behavior (combat-music stand-down §50.3, rest copy §50.6,
// the clock backend §50.4, the daylight writer §50.5, preflight's advisory row, and later the
// shell's campaign-tab slot) asks HERE instead of sniffing modules itself.
//
// The principle: a campaign module OWNS parts of the running world — Ember owns combat music,
// rests, the calendar and the sky on its scenes. We step back where it does; we never fight
// the module the DM bought the campaign from. Crooked Moon stays gated on its own setting
// (`crookedMoonTools`, §35) because CM is book CONTENT, not an engine — it owns nothing at
// runtime; its entry here exists so the tab slot and future consumers have one registry.

/** Is this world running Foundry's Ember campaign module? (The module being active is enough
 *  for stand-downs — Ember's engines register at init. Content reads want emberReady() too.) */
export function isEmberWorld() {
  try { return game.modules.get("ember")?.active === true; } catch (e) { return false; }
}

/** Ember is active AND its adventure content is imported (journals, packs, the party actor).
 *  Gate anything that READS Ember content (the creation door, the sky card) on this. */
export function emberReady() {
  try { return isEmberWorld() && globalThis.ember?.ready === true; } catch (e) { return false; }
}

/** The active campaign for the ONE campaign-tab slot (UI-BIBLE §6.9: optional tabs at the
 *  edges; DM 2026-08-21: "the ember tab replaces the CM tab"). Ember wins when both somehow
 *  coexist — the campaign whose ADVENTURE owns the world outranks installed book content. */
export function activeCampaign() {
  if (isEmberWorld()) return "ember";
  try { if (game.settings.get("mobile-command", "crookedMoonTools")) return "crooked-moon"; } catch (e) { /* unregistered */ }
  return null;
}

/** Is this scene run by a campaign module's SceneManager (Ember vistas / region maps / area
 *  maps)? Core registers managers in CONFIG.Canvas.managedScenes — in an Ember world only
 *  Ember does that, and those are exactly the scenes whose light/sky it drives (§50.5).
 *  The DM's own scenes in the same world stay unmanaged, so our daylight loop still serves
 *  them. */
export function campaignManagedScene(scene) {
  try { return !!(isEmberWorld() && scene && CONFIG.Canvas?.managedScenes?.[scene.id]); } catch (e) { return false; }
}

/** Ember's calendar instance, only when it really is the world calendar. */
function emberCalendar() {
  try {
    const cal = globalThis.ember?.calendar;
    return (cal && cal.sun && game.time?.calendar === cal) ? cal : null;
  } catch (e) { return null; }
}

/** Ember's sun, when Ember keeps the world calendar. `sun.animate(ts)` computes a position
 *  for any timestamp without disturbing the live one — gametime.js uses it for isNight. */
export function emberSun() {
  return emberCalendar()?.sun ?? null;
}

const TITLE = (s) => String(s ?? "").replace(/^\w/, (c) => c.toUpperCase());

/** The sky right now, for the panel's time card (§50.4 — DM: "including moons and effects"):
 *  sun phase, the six moons with phase + colour, the three realms with phase. Null when Ember
 *  isn't keeping the calendar. Moon phase labels use Ember's own localization (all four keys
 *  exist); realm phases are title-cased ourselves — Ember's realm labels lean on lang keys it
 *  doesn't ship yet. */
export function emberSky() {
  try {
    const cal = emberCalendar();
    if (!cal) return null;
    const moons = Object.values(cal.moons ?? {}).map((m) => ({
      name: m.name,
      color: m.color?.css ?? "#888888",
      phase: m.phase,
      label: (() => { try { return m.phaseLabel; } catch (e) { return TITLE(m.phase); } })(),
      lit: m.phase !== "none"
    }));
    const realms = Object.values(cal.realms ?? {}).map((r) => ({
      name: r.name,
      phase: r.phase,
      label: TITLE(r.phase),
      lit: r.phase !== "dormant"
    }));
    const season = (() => {
      try {
        const o = cal.timeToComponents(game.time.worldTime);
        const s = cal.seasons?.values?.[o.season]?.name;
        return s ? game.i18n.localize(s) : "";
      } catch (e) { return ""; }
    })();
    return { sunPhase: cal.sun.phase, sunLabel: TITLE(cal.sun.phase), season, moons, realms };
  } catch (e) { return null; }
}

// ── Ember tab data (§50.8 slice A — read-only mirrors of what Ember shows players) ─────────
// Every reader is wrapped: Ember is Early Access and its internals may shift under us — a
// changed shape must cost a card on the tab, never the shell. All of it is client-side world
// data players legitimately see (the Codex shows the same things).

/** Plain text out of enriched HTML — phone cards carry words, not dead content-links. */
function textOf(html) {
  try {
    const div = document.createElement("div");
    div.innerHTML = String(html ?? "");
    return div.textContent.replace(/\s+/g, " ").trim();
  } catch (e) { return ""; }
}

/** The party's milestone level for the phone header card: where the party stands, and whether
 *  THIS hero has levels waiting. Mirrors Ember's own getMilestones math via its API. */
export function emberPartyStatus(actor) {
  try {
    if (!emberReady()) return null;
    const party = game.actors.get(globalThis.ember.CONST.PARTY_ACTOR_ID);
    if (!party) return null;
    const m = globalThis.ember.system?.actors?.getMilestones?.(party);
    if (!m) return null;
    const thresholds = globalThis.ember.CONST.ADVANCEMENT ?? [];
    const nextAt = thresholds[m.level + 1];
    const myLevel = Number(actor?.system?.details?.level) || 0;
    return {
      level: m.level, points: m.total,
      nextAt: Number.isFinite(nextAt) ? nextAt : null,
      canLevel: !!actor && (actor.type === "character") && (myLevel < m.level)
    };
  } catch (e) { return null; }
}

/** This hero's cosmological attunements: the active one first, then every other with rank > 0
 *  or any points. rank/start/next/end come from Ember's own progression API. */
export function emberAttunements(actor) {
  try {
    if (!emberReady() || !actor) return [];
    const awarded = actor.getFlag("ember", "attunements") || {};
    const activeId = actor.getFlag("ember", "attunement") || "";
    const rankOf = globalThis.ember.api?.systems?.attunement?.getEffectiveAttunementRank;
    if (typeof rankOf !== "function") return [];
    const out = [];
    for (const [type, config] of Object.entries(globalThis.ember.CONST.ATTUNEMENTS ?? {})) {
      const p = awarded[type];
      const current = (p?.current ?? 0) + (p?.bonus ?? 0);
      const rank = rankOf(p);
      const active = activeId === config.identifier;
      if (!active && !current && !(rank?.rank > 0)) continue;
      const span = (rank?.next ?? 0) - (rank?.start ?? 0);
      out.push({
        type, label: config.label ?? type, active,
        rank: rank?.rank ?? 0, current,
        next: rank?.next ?? null,
        pct: span > 0 ? Math.clamp((current - rank.start) / span, 0, 1) : 1
      });
    }
    out.sort((a, b) => (b.active - a.active) || (b.rank - a.rank) || (b.current - a.current));
    return out;
  } catch (e) { return []; }
}

/** The story so far — Ember's completed narrative events, bucketed by campaign day, newest
 *  day first (a phone reads backwards from "what just happened"). Mirrors the Codex journal:
 *  label, quest-or-standalone context, the readaloud summary as plain text. */
export function emberJournal() {
  try {
    if (!emberReady()) return [];
    const em = globalThis.ember;
    const days = new Map();
    for (const [eventId, state] of Object.entries(em.state?.events ?? {})) {
      if ((state?.step ?? 0) < 3) continue; // completed only — same bar as the Codex
      const event = em.narrative?.events?.[eventId];
      if (!event) continue;
      const context = event.root ? `Quest: ${event.root.label}` : "On the road";
      const add = (label, summary, time) => {
        let o;
        try { o = em.calendar.timeToComponents(time ?? 0); } catch (e) { return; }
        const key = o.campaignDay ?? 0;
        if (!days.has(key)) {
          let header;
          try { header = em.calendar.format(o, "emberDay"); } catch (e) { header = `Day ${key}`; }
          days.set(key, { day: key, header, entries: [] });
        }
        days.get(key).entries.push({ label, context, time: time ?? 0, summary: textOf(summary) });
      };
      const eventTime = state.endTime ?? state.startTime ?? 0;
      add(event.label, event.text?.summary, eventTime);
      for (const outcome of Object.values(event.outcomes ?? {})) {
        if (!outcome?.state?.complete) continue;
        add(outcome.label ?? event.label, outcome.text?.summary, outcome.state.time ?? eventTime);
      }
    }
    const out = [...days.values()].sort((a, b) => b.day - a.day);
    for (const d of out) d.entries.sort((a, b) => b.time - a.time);
    return out;
  } catch (e) { return []; }
}

// ── Ember character creation on a small screen (§50.7) ─────────────────────────────────────
// Ember's creation sheet is a fullscreen app DESIGNED FOR 1920×1080 that adapts by transform-
// scaling the whole layout (--ui-scale, floor 0.7). Below Foundry's own 1024×768 minimum that
// floor isn't nearly enough, so on small viewports we set the scale to FIT — the entire layout
// stays intact, just smaller (measured live: 0.45 on a phone in landscape — squinty but whole;
// the DM chose to "try the original" over a rebuild, 2026-08-21). Desktop-size viewports are
// left entirely to Ember's own media queries.

export const EMBER_CREATION_SHEET = "ember.EmberCharacterCreationSheet";
const CREATION_ROOT_ID = "ember-character-creation";
// The layout's design span. 1440×830 (not 1600×1080) fits the content column with its margins —
// the live calibration that produced a fully-intact 0.45 fit on 812×375.
const FIT_W = 1440, FIT_H = 830;

function fitEmberCreation() {
  try {
    const el = document.getElementById(CREATION_ROOT_ID);
    if (!el) return;
    const small = window.innerWidth < 1024 || window.innerHeight < 768;
    if (!small) { el.style.removeProperty("--ui-scale"); return; }
    const scale = Math.min(window.innerWidth / FIT_W, window.innerHeight / FIT_H, 1);
    el.style.setProperty("--ui-scale", String(Math.max(scale, 0.2)));
  } catch (e) { /* the fit is garnish — never break creation itself */ }
}

let watching = false;
function watchViewport() {
  if (watching) return;
  watching = true;
  window.addEventListener("resize", fitEmberCreation);
  window.addEventListener("orientationchange", fitEmberCreation);
}
function unwatchViewport() {
  if (!watching) return;
  watching = false;
  window.removeEventListener("resize", fitEmberCreation);
  window.removeEventListener("orientationchange", fitEmberCreation);
}

/** Wire the fit shim to Ember's creation sheet. Registered from main.js at init; the hooks fire
 *  per ApplicationV2 class name, so they simply never fire in worlds without Ember. */
export function registerCampaigns() {
  Hooks.on("renderEmberCharacterCreationSheet", () => { fitEmberCreation(); watchViewport(); });
  Hooks.on("closeEmberCharacterCreationSheet", () => { unwatchViewport(); });
}
