import { MODULE_ID } from "./preset.js";
import { defineActions } from "./actions.js";
import { FX_DEFS, fxIsOn, fxIsOnFor, fxActiveMap, dmToggleFx, dmToggleFxFor, dmFireFx } from "./effects.js";

/**
 * ── THE EFFECTS TAB, AS ACTIONS (deck-command ledger 151, area G) ────────────────────────────────
 *
 * Every row calls what the panel's own button calls (dm-panel.js, the `data-fx*` handlers), so the
 * two surfaces cannot drift: a toggle reads fxIsOn, which reads the scene or the fxActive setting —
 * the same truth the panel paints from.
 *
 * EVERY EFFECT HERE CHANGES WHAT SOMEONE SEES (DM 2026-09-18: effects that are more than sound
 * "should look like the other behavior buttons"), so each is does: "scene" with Foundry's own
 * painted icon — even the Doom Bell, which dims every screen, the TV's included. Loudness is NOT
 * here: *"loudness is too much for the deck"* — it stays on the panel's Effects tab.
 */

/** Foundry's painted icons (core, on every install), one per effect — the behaviour-key picture. */
const ART = {
  rain: "icons/magic/air/weather-clouds-rain.webp",
  rainStorm: "icons/magic/water/waves-water-blue.webp",
  snow: "icons/magic/air/weather-clouds-snow.webp",
  blizzard: "icons/magic/air/wind-weather-snow-gusts.webp",
  fog: "icons/magic/air/fog-gas-smoke-swirling-gray.webp",
  leaves: "icons/magic/nature/leaf-glow-triple-orange.webp",
  night: "icons/magic/time/day-night-sun-moon.webp",
  heat: "icons/magic/fire/projectile-wave-yellow.webp",
  dust: "icons/magic/air/fog-gas-smoke-dense-orange.webp",
  storm: "icons/magic/lightning/bolt-strike-clouds-blue.webp",
  lightning: "icons/magic/lightning/bolt-cloud-sky-white.webp", // the scene board's Lightning key wears the same
  bell: "icons/magic/sonic/bell-alarm-red-purple.webp",
  rainbow: "icons/magic/air/weather-clouds-rainbow.webp",
  invert: "icons/magic/perception/third-eye-blue-red.webp",
  dreamy: "icons/commodities/treasure/dreamcatcher-purple.webp",
  drained: "icons/magic/unholy/strike-body-life-soul-purple.webp",
  heartbeat: "icons/commodities/biological/organ-heart-red.webp",
  woozy: "icons/magic/control/hypnosis-mesmerism-swirl.webp",
  static: "icons/magic/lightning/bolt-strike-embers-teal.webp",
};

/** The players the panel's Player drawer lists: every non-GM user except the table display. */
function players() {
  let tvId = "";
  try { tvId = game.settings.get(MODULE_ID, "displayOwnerUser") || ""; } catch (e) { /* unset */ }
  return game.users.filter((u) => !u.isGM && u.id !== tvId);
}

const toggle = (id, group, icon) => ({
  id: `fx.${id}`, area: "effects", group, kind: "toggle", icon, does: "scene", art: ART[id],
  label: FX_DEFS[id]?.label ?? id,
  on: () => fxIsOn(id),
  run: () => dmToggleFx(id),
});

const shot = (id, group, icon) => ({
  id: `fx.${id}`, area: "effects", group, kind: "shot", icon, does: "scene", art: ART[id],
  label: FX_DEFS[id]?.label ?? id,
  run: () => dmFireFx(id),
});

/** A player's key picture: their character's token art (as the deck's party pages show them). */
const userImg = (u) => u.character?.prototypeToken?.texture?.src || u.character?.img || u.avatar || undefined;

/** A per-player state effect: pick the players; each choice toggles, and the list stays open. */
const perPlayer = (id, icon) => ({
  id: `fx.${id}`, area: "effects", group: "One player", kind: "pick", multi: true, icon, does: "scene", art: ART[id],
  label: FX_DEFS[id]?.label ?? id,
  sub: () => {
    const n = players().filter((u) => fxIsOnFor(id, u.id)).length;
    return n ? `${n} on` : undefined;
  },
  choices: () => players().map((u) => ({ id: u.id, label: u.name, img: userImg(u), on: fxIsOnFor(id, u.id) })),
  run: ({ choice }) => (choice ? dmToggleFxFor(id, choice) : { ok: false, reason: "pick a player" }),
});

/** Any per-player state effect running for anyone — the stop-all is dim (not absent) otherwise. */
const anyPlayerFx = () => players().some((u) =>
  Object.entries(FX_DEFS).some(([id, d]) => d.player === "state" && fxIsOnFor(id, u.id)));

defineActions([
  // Weather + the sky. Single-slot like Foundry's own scene weather: dmToggleFx turns the others off.
  toggle("rain", "Weather", "rain"),
  toggle("rainStorm", "Weather", "rain"),
  toggle("snow", "Weather", "snow"),
  toggle("blizzard", "Weather", "snow"),
  toggle("fog", "Weather", "fog"),
  toggle("leaves", "Weather", "leaf"),
  toggle("night", "Weather", "moon"),
  toggle("heat", "Weather", "sun"),
  toggle("dust", "Weather", "wind"),
  toggle("storm", "Weather", "bolt"),

  // One-press moments.
  shot("lightning", "Moments", "bolt"),
  shot("bell", "Moments", "bell"),

  // Screen visions (canvas filters on the DM screen and the TV).
  toggle("rainbow", "Visions", "rainbow"),
  toggle("invert", "Visions", "invert"),
  toggle("dreamy", "Visions", "blur"),
  toggle("drained", "Visions", "drain"),

  // One player's phone.
  perPlayer("heartbeat", "heart"),
  perPlayer("woozy", "woozy"),
  {
    id: "fx.static", area: "effects", group: "One player", kind: "pick", icon: "static", does: "scene", art: ART.static,
    label: FX_DEFS.static?.label ?? "Static",
    choices: () => players().map((u) => ({ id: u.id, label: u.name, img: userImg(u) })),
    run: ({ choice }) => (choice ? dmFireFx("static", { users: [choice] }) : { ok: false, reason: "pick a player" }),
  },
  {
    // The guaranteed off switch (§8.1): dim when nothing runs, never absent.
    id: "fx.playerStopAll", area: "effects", group: "One player", kind: "shot", icon: "stop", danger: true,
    label: "Stop player effects",
    when: anyPlayerFx,
    run: async () => {
      const cur = { ...fxActiveMap() };
      for (const [id, d] of Object.entries(FX_DEFS)) if (d.player === "state") delete cur[id];
      await game.settings.set(MODULE_ID, "fxActive", cur);
    },
  },

  // (§26.5 Loudness is panel-only — DM 2026-09-18: "loudness is too much for the deck".)
]);
