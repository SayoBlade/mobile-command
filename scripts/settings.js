import { MODULE_ID, SAVE_TIMEOUT_SETTING } from "./preset.js";
import { makeConfirmMenuClass, deactivate, reactivate, hasBackup, hasReactivateSnapshot } from "./enforcer.js";

export function registerSettings() {
  // D7 role, per-client. Phase 1 uses it only to decide which client runs
  // executor duties ("dm" + GM role); the phone/display shells come later.
  // The campaign's start TIME OF DAY, in seconds past midnight (0 = midnight, 43200 = noon).
  // Our own clock is this + game.time.worldTime — because worldTime is seconds since the world
  // began, not a time of day. IGNORED when Simple Calendar is installed: SC interprets worldTime
  // itself and we defer to it (see gametime.js). Hidden: the DM sets it from the panel's clock,
  // not from a settings list.
  game.settings.register(MODULE_ID, "clockStart", {
    scope: "world",
    config: false,
    type: Number,
    default: 21 * 3600 // 21:00 — a campaign's first scene is usually an evening, and a rest flow
                       // that opens at "Day 1 · 21:00" needs no explaining.
  });

  game.settings.register(MODULE_ID, "role", {
    name: "MOBILECOMMAND.Role.Name",
    hint: "MOBILECOMMAND.Role.Hint",
    scope: "client",
    config: true,
    type: String,
    default: "auto",
    choices: {
      auto: "MOBILECOMMAND.Role.Auto",
      phone: "MOBILECOMMAND.Role.Phone",
      display: "MOBILECOMMAND.Role.Display",
      dm: "MOBILECOMMAND.Role.Dm"
    }
  });

  // §2.1: "service" is a capability flag on a GM client, not a dedicated user.
  // Empty = auto: the active GM (game.users.activeGM) is the executor.
  game.settings.register(MODULE_ID, "executorUser", {
    name: "MOBILECOMMAND.ExecutorUser.Name",
    hint: "MOBILECOMMAND.ExecutorUser.Hint",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  // §2.1 pause-based freeze: executor auto-pauses when it leaves the active
  // scene, auto-resumes on return (only for pauses it initiated itself).
  game.settings.register(MODULE_ID, "pauseGuard", {
    name: "MOBILECOMMAND.PauseGuard.Name",
    hint: "MOBILECOMMAND.PauseGuard.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "heartbeatSeconds", {
    name: "MOBILECOMMAND.Heartbeat.Name",
    hint: "MOBILECOMMAND.Heartbeat.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 5
  });

  // Q4: expected midi playerSaveTimeout, policed by the enforcer.
  game.settings.register(MODULE_ID, SAVE_TIMEOUT_SETTING, {
    name: "MOBILECOMMAND.SaveTimeout.Name",
    hint: "MOBILECOMMAND.SaveTimeout.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 60
  });

  game.settings.register(MODULE_ID, "enforcerAutoPrompt", {
    name: "MOBILECOMMAND.EnforcerAutoPrompt.Name",
    hint: "MOBILECOMMAND.EnforcerAutoPrompt.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Idea #2: a world art-direction string folded into every player's AI portrait
  // prompt so generated portraits share the table's look (e.g. "dark and gritty").
  game.settings.register(MODULE_ID, "portraitStyle", {
    name: "Campaign visual style (AI portraits)",
    hint: "Your campaign's art direction, folded into every player's AI portrait prompt so generated images share one look — e.g. \"dark and gritty, muted earthy palette\". Leave blank for none.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  // Hide the GM's broadcast cursor on player/display screens (it otherwise glides around
  // constantly). Pings are untouched — the GM still points by pinging — so they can call
  // out a spot without a moving cursor. On by default (DM request 2026-06-25). World-scoped
  // for one consistent behaviour across every viewer; the toggle takes effect on the GM's
  // next mouse move.
  game.settings.register(MODULE_ID, "hideGMCursor", {
    name: "Hide the GM's cursor (keep pings)",
    hint: "Stops the GM's mouse cursor from gliding across player and display screens. Pings still work, so the GM can point out a location without a constantly-moving cursor. On by default.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Shared-screen tables: controlling a PC token normally collapses the DM's canvas to that
  // PC's vision (POV), which is wrong when the players watch a shared TV. On, the DM's OWN
  // client stays omniscient while a token is selected; players + the TV/display are untouched
  // (the check is per-client). DM request 2026-06-26. On by default.
  // Interface-layer ring recolor on the shared display (#13): drawn on the
  // controls layer (like pings), so it stays player-colored under darkvision
  // grayscale, dim light, or any vision effect. Targeting uses CORE's native
  // per-user colored pips (default Foundry behavior) — no custom reticle.
  // PC token self-glow (DM 2026-07-03: "0.1 is better than nothing"). Lit areas
  // are exempt from vision-mode grayscale, so a tiny light keeps the token in
  // color. The radius extends from the token EDGE (the body is the emitter), so
  // there's a bleed floor ≈ the token's own circle — 0.1 is the practical minimum.
  game.settings.register(MODULE_ID, "tokenGlow", {
    name: "PC token glow (ft of bright light)",
    hint: "Written onto PC tokens + the party token on pack/disperse/release so they keep color under darkvision. Radius is from the token's edge, so ~0.1 is the smallest visible; 0 disables. Applies on the NEXT pack/disperse.",
    scope: "world",
    config: true,
    type: Number,
    default: 0.1
  });

  game.settings.register(MODULE_ID, "ringPlayerColors", {
    name: "Color PC dynamic rings by player",
    hint: "On disperse/release, each PC token's native dynamic ring is colored in the ASSIGNED player's color (User Configuration → assign characters). Native = perfect sync/scale, and the Ring tab's width/pulse/'color over subject' options all work. Under night vision the color mutes (−0.6 saturation) but stays legible. PCs only.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Health-at-a-glance on the token ring (DM 2026-07-20). The player's colour moves to the ring
  // BACKGROUND (identity kept), and the ring BORDER shows a 5-band green→red gradient by current HP
  // (>80% green, >60% yellow-green, >40% amber, >20% orange, ≤20% red). Recolours live as HP changes.
  // Needs "Color PC dynamic rings by player" on (it's the same ring pipeline). PCs (+ owned tokens).
  game.settings.register(MODULE_ID, "ringHealthColors", {
    name: "Show HP on PC token rings (green→red)",
    hint: "The token's ring border becomes a health bar: green at full, through amber, to red when bloodied (5 bands at 100/80/60/40/20%). The player's colour moves to the ring background so you still see whose token it is. Updates live as HP changes. Requires the player-ring-colour option above. Off by default.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "dmOmniscientVision", {
    name: "Keep the DM's vision omniscient (shared-screen tables)",
    hint: "When the DM selects/controls a player's token, don't shrink the DM's view to that token's point of view — the DM keeps seeing the whole map. Players and the TV/display are unaffected. On by default.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => { try { canvas?.perception?.update({ refreshVision: true, initializeVision: true }); } catch (e) {} }
  });

  // Combat POV vision on the TV (DM 2026-06-27): restrict the shared display to the active
  // combatant's own vision each turn — a PC sees only what their senses/light reach (a PC
  // without darkvision is blind in a dark room). NPC turns fall back to shared party vision.
  // Off by default; needs a dark scene (no global illumination) + token sight synced to senses.
  game.settings.register(MODULE_ID, "combatPovVision", {
    name: "Combat: show only the active player's POV on the TV",
    hint: "During combat the shared display shows just the active player's vision (their darkvision/tremorsense/light) — so a PC with no way to see in the dark is blind without a light source. Enemy turns show the shared party vision instead. Needs a dark scene and each PC's token sight range set from their senses. Off by default.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => { try { globalThis.MobileCommand?.refreshCombatVision?.(); } catch (e) {} }
  });

  // Auto-share new player characters with the shared display/TV account so their vision shows on
  // the TV without per-actor fiddling (DM 2026-06-27). Stores a user id; "" = off. The field
  // renders as a player dropdown (renderSettingsConfig below — game.users isn't ready at
  // registration). Choosing an account also shares EXISTING characters with it (onChange →
  // syncDisplayObserver, executor-only). OBSERVER, never OWNER — see DISPLAY_LEVEL.
  game.settings.register(MODULE_ID, "displayOwnerUser", {
    name: "Share PCs with the display/TV account",
    hint: "Pick your shared TV/display account. Every player character is shared with it as Observer, so the TV shows the party’s merged vision — new characters automatically, existing ones as soon as you pick the account. Observer is deliberate: it keeps save and reaction prompts going to players’ phones instead of the television. Leave as “none” to turn this off.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: (value) => { if (value) syncDisplayObserver(value); }
  });

  // Table-display volumes (DM 2026-07-22: "sound settings for the TV"). Foundry's own volumes are
  // scope:"client", so the DM sliding them on the DM screen moves the DM screen and nothing else —
  // which is exactly the confusion that started this ("I turned down the volume in the DM screen,
  // and i dont hear anything"). The TV usually has no keyboard and runs in clean mode, so its
  // volumes are otherwise unreachable. Keeping them in a WORLD setting means the DM panel can show
  // the real current value, the choice survives a reload, and the display applies it deterministically
  // instead of us fire-and-forgetting over the socket. 0..1 each, matching core's AlphaField.
  game.settings.register(MODULE_ID, "tvVolume", {
    scope: "world",
    config: false,
    type: Object,
    default: { music: 0.5, ambient: 0.5, interface: 0.5 }
  });

  // Silence the table in one tap — a break, a phone call, someone talking over the ambience.
  // Applied on the display as `game.audio.globalMute`, which zeroes all three gains and restores
  // them from the settings on unmute (core AudioHelper), so the levels above survive the round trip.
  // A world setting because globalMute itself is runtime-only and per-client: it would not persist
  // a reload, and the DM cannot reach the TV's own controls anyway.
  game.settings.register(MODULE_ID, "tvMuted", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  // Combat audio POV — the exact counterpart of combatPovVision (above). With it on, the display
  // hears from the ACTIVE COMBATANT alone instead of the whole party, so the soundscape follows
  // whoever is acting. It matters because loudness is nearest-listener-wins, never an average:
  // without this, a party spread across a map means the room always hears whoever happens to be
  // standing closest to a source, regardless of whose turn it is.
  game.settings.register(MODULE_ID, "combatPovAudio", {
    name: "Combat: hear from the active combatant on the TV",
    hint: "During combat the shared display hears positional sound from the active combatant's position only, instead of from the whole party. Enemy turns fall back to the party. Pairs with the combat POV vision setting above. Off by default.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // §16.3 DM first-run wizard: true once the DM finished (or dismissed) the
  // guided setup. Hidden — the wizard flips it; reopen lives on the Preflight tab.
  game.settings.register(MODULE_ID, "dmOnboarded", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  // In-house opportunity attacks (aoo.js): the executor watches combat movement
  // for leave-reach events. Player attackers get a phone prompt; NPC attackers
  // follow aooNpcMode. midi's recordAOO (D4 preset) charges the reaction.
  game.settings.register(MODULE_ID, "aooEnabled", {
    name: "Opportunity attacks: watch movement in combat",
    hint: "When a combatant leaves an enemy's melee reach, prompt the enemy's owner for an opportunity attack (players on their phone, NPCs per the setting below). Only runs during combat.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, "aooNpcMode", {
    name: "Opportunity attacks: NPC behavior",
    hint: "What happens when an NPC could take an opportunity attack: ask the DM, roll it automatically, or ignore NPCs (players still get prompts).",
    scope: "world",
    config: true,
    type: String,
    default: "prompt",
    choices: { prompt: "Ask the DM", auto: "Roll automatically", off: "NPCs don't react" }
  });

  // Reaction time for phone players (DM 2026-07-19). midi's reactionTimeout is tuned for a desktop
  // where the reaction dialog is already on screen; a phone player must first NOTICE the prompt light
  // up and then tap, so they need a beat longer. This is a PERCENTAGE of midi's reaction timeout, and
  // it OVERRIDES midi for prompts Mobile Command relays to phones (reactions + opportunity attacks) —
  // it never touches midi's stored setting (so the enforcer is unaffected) or the DM's own rolls.
  // Default 120 = 20% more time; 100 = same as midi; higher for a slower table.
  game.settings.register(MODULE_ID, "reactionTimeoutPct", {
    name: "Reaction time for phone players (% of midi's)",
    hint: "Phone players need a moment to see a reaction / opportunity-attack prompt light up before they can tap it — midi's timeout assumes the dialog is already on their screen. This multiplies midi's reaction timeout for the prompts Mobile Command relays to phones. 120 = 20% more time (default); 100 = identical to midi; raise it for a slower table. Only affects phone prompts, never the DM's own rolls, and it doesn't change midi's own setting.",
    scope: "world",
    config: true,
    type: Number,
    default: 120
  });

  // Party-teleport follow-through: when the packed party token arrives on a new
  // scene (core Teleport Token region behavior / DM drag), the executor activates
  // that scene so the TV + every phone transitions together (transitions.js).
  game.settings.register(MODULE_ID, "partyTeleportActivates", {
    name: "Activate scene when the party travels to it",
    hint: "When the packed party token teleports or moves to another scene, make that scene active so the shared display and phones follow — the destination scene's transition animation plays for everyone.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // §18 travel mode: the DM's chosen overworld scene — picked from the DM panel's
  // Travel tab, not the settings sheet (config: false).
  game.settings.register(MODULE_ID, "travelOverworldSceneId", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  // §18 travel: DM-authored custom transport paces (horse/cart/ship/airship + whatever the DM
  // adds), each a name + MPH. mi/day = MPH × 8 (an 8-hour travel day). Managed from the Pace [+]
  // popup, config:false. Prepopulated with sensible defaults.
  game.settings.register(MODULE_ID, "travelCustomPaces", {
    scope: "world",
    config: false,
    type: Array,
    default: [
      { id: "horse", name: "Horseback", mph: 8 },
      { id: "cart", name: "Cart", mph: 3 },
      { id: "ship", name: "Ship", mph: 5 },
      { id: "airship", name: "Airship", mph: 10 }
    ]
  });

  // §18 travel: during a journey the scene's darkness sweeps to match the clock. Moved out of the
  // Travel tab into settings (DM 2026-07-18 — the inline toggle read as unclear).
  game.settings.register(MODULE_ID, "travelDaylight", {
    name: "Travel: daylight follows the clock",
    hint: "During a travel journey the scene's darkness moves with the time of day (dawn → day → dusk → night). Needs the overworld's Global Illumination off and darkness unlocked (Preflight → Travel lighting fixes this). Off: the light stays put while the party travels.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // §18 travel: any scene whose grid cell measures at least this many FEET is auto-treated as an
  // overworld travel map (multi-overworld — no per-scene designation, DM 2026-07-19). A battle map
  // (~5 ft/cell) never qualifies; a world/region map (miles, or hundreds of ft, per cell) does.
  // Feeds isOverworldScene() → the on-load auto-lighting + the Preflight lighting check.
  game.settings.register(MODULE_ID, "travelOverworldGridThreshold", {
    name: "Overworld detection: grid feet per cell",
    hint: "Any scene whose grid measures at least this many feet per cell is treated as a travel/overworld map — the whole map stays visible and dims with the clock. Battle maps (5 ft/cell) are never affected. Default 100.",
    scope: "world",
    config: true,
    type: Number,
    default: 100
  });

  // §18 travel: the first time you open a detected overworld, set it up for travel once — whole map
  // visible (Token Vision off), Global Illumination off, darkness unlocked, and darkness synced to
  // the clock. One-shot per scene (a flag guards it) so a scene you later customise is never
  // re-stomped. Off = leave scene lighting alone; use Preflight → Travel lighting by hand.
  game.settings.register(MODULE_ID, "travelAutoLight", {
    name: "Travel: auto-set overworld lighting on load",
    hint: "The first time you open a detected overworld map, automatically make the whole map visible and let its darkness follow the clock (the same fix as Preflight → Travel lighting). Done once per scene. Turn off to configure overworld lighting yourself.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Auto-loot (DESIGN §7.6): when an NPC token dies, the executor turns it into an Item
  // Piles loot pile so players can loot it from the phone with the flow we already built.
  // Off by default (opt-in); needs Item Piles installed. Skips PCs, linked tokens, tokens
  // already piles, and tokens the DM flags no-loot.
  game.settings.register(MODULE_ID, "autoLootNpcs", {
    name: "Auto-loot: dead NPCs become lootable piles",
    hint: "When an NPC token drops to 0 HP (or is marked Defeated) during play, automatically turn it into an Item Piles loot pile so players can loot its gear from their phones. Requires the Item Piles module. Player characters are never converted.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // Mark dead NPCs (DM 2026-07-12): when an NPC dies, put a skull OVERLAY on its token, keep the
  // token VISIBLE (so it shows on the shared TV, not just the DM), and drop it from the combat
  // tracker. Document-level — the overlay syncs to every client, unlike a per-client blood splatter.
  // On by default; independent of auto-loot (that's the separate Item Piles opt-in above).
  game.settings.register(MODULE_ID, "markDeadNpcs", {
    name: "Mark dead NPCs with a skull",
    hint: "When an NPC drops to 0 HP (or is marked Defeated), place a skull marker over its token, keep the token visible on the shared display, and remove it from the combat tracker. The skull is a token status, so it appears on every screen. Turn off if you handle dead tokens yourself.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Away-timer escalation (DESIGN §7.8): flip a player's presence dot to RED once their phone
  // has been backgrounded/away longer than this many seconds. 0 = escalate immediately.
  game.settings.register(MODULE_ID, "awayThresholdSeconds", {
    name: "Away alert: seconds before a player reads as “away”",
    hint: "If a player backgrounds the app (or their phone sleeps) for longer than this many seconds during play, their presence dot on the DM panel turns red. Default 90. Set 0 to flag them the moment they leave the app.",
    scope: "world",
    config: true,
    type: Number,
    default: 90
  });

  // Downtime (§17): the shared state of an open downtime window + each PC's activity picks.
  // Hidden setting (GM writes directly; players relay picks via the executor). Projects/goals
  // (long-term ticked goals) are added in a later slice. Player-side is invisible unless a
  // window is open, so a DM who never opens one shows nothing to players.
  // NOTE: this is the Phase-1a "day-budget" shape, retired by the §17.7 redesign — kept
  // registered so the old board doesn't error mid-rebuild; superseded by `downtimeState`.
  game.settings.register(MODULE_ID, "downtime", {
    scope: "world", config: false, type: Object,
    default: { open: false, days: 0, windowId: "", picks: {} }
  });

  // Downtime v2 (§17.7 redesign): persistent per-PC Activities, each with a DM-authored Rule
  // (the "formula"), plus the current window {open,size,id}. Shape + all transforms live in
  // scripts/downtime.js (pure, unit-tested). GM writes directly; players relay create/name/pick
  // through the executor. Activities persist across windows; the window just gates the board.
  game.settings.register(MODULE_ID, "downtimeState", {
    scope: "world", config: false, type: Object,
    default: { window: null, activities: {}, actorSettings: {} }
  });

  // Comprehensive snapshots so the module's changes can be reverted/reactivated
  // (Foundry won't revert them on disable). presetBackup = original pre-module state;
  // reactivateSnapshot = the module-active state captured when you revert.
  game.settings.register(MODULE_ID, "presetBackup", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, "reactivateSnapshot", { scope: "world", config: false, type: Object, default: {} });

  // Two buttons in the module config: "Remove Mobile Command & revert" (snapshots the
  // current state for reactivation, then restores your original settings) and
  // "Reactivate". Guarded — a base-class hiccup must never break module load.
  try {
    const DeactivateMenu = makeConfirmMenuClass(() => ({
      title: "Remove Mobile Command & revert settings",
      content: `<p><strong>This reverts the midi-qol / dnd5e settings to the snapshot from before Mobile Command was first applied.</strong></p>
        <p>First it snapshots your <em>current</em> settings so you can <b>Reactivate Mobile Command</b> later. It does <em>not</em> uninstall the module — disable or remove it from <b>Manage Modules</b> afterward.</p>
        <p>${hasBackup() ? "✓ An original backup exists." : "<strong>⚠ No original backup found</strong> — apply the preset at least once first, or there's nothing to revert to."}</p>`,
      yesLabel: "Revert now",
      icon: "fas fa-rotate-left",
      action: deactivate
    }));
    const ReactivateMenu = makeConfirmMenuClass(() => ({
      title: "Reactivate Mobile Command",
      content: `<p>Restore the Mobile Command settings ${hasReactivateSnapshot() ? "from the snapshot taken when you last reverted." : "by re-applying the preset (no prior active snapshot found)."}</p>`,
      yesLabel: "Reactivate",
      icon: "fas fa-rotate-right",
      action: reactivate
    }));
    if (DeactivateMenu) {
      game.settings.registerMenu(MODULE_ID, "deactivate", {
        name: "⚠ Remove Mobile Command & revert",
        label: "⚠ Remove & revert settings",
        hint: "IMPORTANT — run this BEFORE you disable or remove Mobile Command. Foundry does NOT restore the midi-qol / dnd5e settings it changed; this button restores the snapshot from before it was applied (and snapshots the current state first so you can Reactivate).",
        icon: "fas fa-triangle-exclamation",
        type: DeactivateMenu,
        restricted: true
      });
    }
    if (ReactivateMenu) {
      game.settings.registerMenu(MODULE_ID, "reactivate", {
        name: "Reactivate Mobile Command",
        label: "Reactivate Mobile Command",
        hint: "Re-apply the Mobile Command settings (restores the snapshot taken at the last revert, else re-applies the preset).",
        icon: "fas fa-rotate-right",
        type: ReactivateMenu,
        restricted: true
      });
    }
  } catch (e) {
    console.warn(`${MODULE_ID} | could not register the deactivate/reactivate menus (use MobileCommand.enforcer.deactivate()/reactivate())`, e);
  }

  // A dominant red warning at the top of Mobile Command's settings so the
  // revert-before-disable step is impossible to miss (GM only).
  Hooks.on("renderSettingsConfig", (app, html) => {
    try {
      if (!game.user?.isGM) return;
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root || root.querySelector("#mc-revert-warning")) return;
      const warning = document.createElement("div");
      warning.id = "mc-revert-warning";
      warning.innerHTML = `<strong><i class="fas fa-triangle-exclamation"></i> Before you disable or remove Mobile Command,</strong> click <b>“Remove &amp; revert settings”</b> below — Foundry will <u>not</u> restore the midi-qol / dnd5e settings it changed on its own.`;
      // Block + full width (span any grid) so the text flows as a paragraph, not a
      // squished column inside a narrow settings cell.
      warning.style.cssText = "display:block;width:100%;grid-column:1 / -1;box-sizing:border-box;margin:10px 0;padding:11px 14px;border:1px solid #c0504a;border-left:4px solid #c0504a;border-radius:8px;background:rgba(192,80,74,0.14);color:#f1b5b0;font-weight:600;line-height:1.5;";
      // Put it at the top of Mobile Command's own settings section (full width).
      const btn = [...root.querySelectorAll("button")].find((b) => /remove & revert/i.test(b.textContent || ""));
      const section = btn?.closest("fieldset, section, .settings-list");
      if (section) section.prepend(warning);
      else if (btn?.closest(".form-group")?.parentElement) {
        const group = btn.closest(".form-group");
        group.parentElement.insertBefore(warning, group);
      } else {
        (root.querySelector(".scrollable, form") ?? root).prepend(warning);
      }
    } catch (e) {
      console.warn(`${MODULE_ID} | could not inject the revert warning`, e);
    }
  });

  // Upgrade the displayOwnerUser text field to a player dropdown (game.users is ready here, not
  // at registration). Foundry serialises the <select> by its name, so the value saves normally.
  Hooks.on("renderSettingsConfig", (app, html) => {
    try {
      if (!game.user?.isGM) return;
      const root = html instanceof HTMLElement ? html : html?.[0];
      const input = root?.querySelector(`[name="${MODULE_ID}.displayOwnerUser"]`);
      if (!input || input.tagName !== "INPUT") return;
      const cur = game.settings.get(MODULE_ID, "displayOwnerUser");
      const sel = document.createElement("select");
      sel.name = input.name;
      sel.innerHTML = `<option value="">— none (auto-own off) —</option>` +
        game.users.filter((u) => !u.isGM).map((u) => `<option value="${u.id}"${u.id === cur ? " selected" : ""}>${foundry.utils.escapeHTML(u.name)}</option>`).join("");
      input.replaceWith(sel);
    } catch (e) {
      console.warn(`${MODULE_ID} | could not build the display-owner dropdown`, e);
    }
  });
}

// The configured display/TV account, or null when the feature is off.
export function displayUserId() {
  try { return game.settings.get(MODULE_ID, "displayOwnerUser") || null; } catch (e) { return null; }
}

// OBSERVER, not OWNER — the level the TV actually needs (2026-07-21). Foundry 14 builds vision
// from OBSERVER (`Token#_isVisionSource`: `testUserPermission(game.user, "OBSERVER")`), so the
// shared screen sees the party's merged view at this level. OWNER bought only two things beyond
// that: token CONTROL (which the display never legitimately needs — see refreshCombatVision) and
// a seat in midi's prompt routing, which was the whole "Shield bug": `playerForActor`
// (midi-qol.js:18174) matches `ownership[p.id] === OWNER` by strict equality on every fallback
// branch, so an OBSERVER display account is INELIGIBLE to receive a save/reaction prompt. That is
// what retires the "every player must have an assigned character" requirement (DESIGN §2).
export const DISPLAY_LEVEL = 2; // CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER (CONST isn't ready at import)

/** Does the display/TV account observe this actor? True for anything shared with it — including a
 *  GM-created summon, which has NO player owner until the DM hands it over. Vision/POV code used
 *  `hasPlayerOwner` to mean this, which only worked while the TV held OWNER (a summon's grant was
 *  what made hasPlayerOwner true). Distinct from main.js's isPartyActor, which is the TV CAMERA's
 *  narrower "who do I frame" test — don't merge them. */
export function isDisplayShared(actor) {
  const tv = displayUserId();
  return !!tv && !!actor && (actor.ownership?.[tv] ?? 0) >= DISPLAY_LEVEL;
}

// Put the display/TV account at exactly OBSERVER on every existing player-character — the "fix
// existing" half of the auto-share, run when displayOwnerUser is chosen and once at startup as a
// migration. Levels DOWN as well as up: a world set up before 2026-07-21 has the TV on OWNER,
// which is what mis-routed prompts. Executor-only (one writer; ownership writes are GM-only).
export async function syncDisplayObserver(userId, { quiet = false } = {}) {
  try {
    if (!isExecutor()) return 0;
    const user = game.users.get(userId);
    if (!user || user.isGM) return 0;
    let raised = 0, lowered = 0;
    for (const actor of game.actors) {
      const have = actor.ownership?.[user.id] ?? 0;
      if (have === DISPLAY_LEVEL) continue;
      // Share PCs up to OBSERVER; on anything else only ever level DOWN. That second clause is
      // what catches summons (Unseen Servant, Sphinx of Wonder): the old summon path granted the
      // TV OWNER on npc actors, and OWNER on a summon means midi can route its saves to the
      // television exactly like a PC's.
      const isPC = actor.type === "character" && actor.hasPlayerOwner;
      if (!isPC && have <= DISPLAY_LEVEL) continue;
      await actor.update({ [`ownership.${user.id}`]: DISPLAY_LEVEL });
      if (have > DISPLAY_LEVEL) lowered++; else raised++;
    }
    if (!quiet || raised || lowered) {
      const bits = [];
      if (raised) bits.push(`${raised} shared`);
      if (lowered) bits.push(`${lowered} lowered from Owner (prompts now reach the player, not the TV)`);
      if (bits.length) ui.notifications?.info?.(`Mobile Command: ${user.name} — ${bits.join(", ")}.`);
    }
    return raised + lowered;
  } catch (e) {
    console.warn(`${MODULE_ID} | display observer sync failed`, e);
    return 0;
  }
}

// The shared display's last audio report (locked / muted), pushed over the socket by the display
// and read by the DM panel. It lives HERE rather than in main.js because dm-panel.js would then
// have to import main.js, which already imports dm-panel.js — a cycle whose binding order is
// exactly the sort of thing that breaks silently at load. settings.js imports neither, so both can
// depend on it safely.
export let tvAudioState = null;
export function setTvAudioState(v) { tvAudioState = v; }

export function resolveExecutorId() {
  const configured = game.settings.get(MODULE_ID, "executorUser");
  if (configured) {
    const user = game.users.get(configured) ?? game.users.getName(configured);
    if (user?.active && user.isGM) return user.id;
  }
  return game.users.activeGM?.id ?? null;
}

export function isExecutor() {
  return game.user.id === resolveExecutorId();
}

// §18 travel (DM 2026-07-19): a scene is an "overworld" travel map when its grid cell measures at
// least travelOverworldGridThreshold FEET. Auto-detection replaces the single hand-picked scene, so
// several overworlds all behave as travel maps. Gridless / undefined-grid scenes never qualify.
const GRID_UNIT_FEET = { "'": 1, ft: 1, foot: 1, feet: 1, yd: 3, yard: 3, yards: 3, m: 3.28084, meter: 3.28084, metre: 3.28084, meters: 3.28084, metres: 3.28084, km: 3280.84, kilometer: 3280.84, kilometre: 3280.84, mi: 5280, mile: 5280, miles: 5280, league: 15840, leagues: 15840, hex: 1 };
export function gridFeetPerCell(scene) {
  const g = scene?.grid;
  if (!g || !(g.distance > 0)) return 0;
  const u = String(g.units ?? "ft").trim().toLowerCase();
  const per = GRID_UNIT_FEET[u]
    ?? (/mile|(^|[^k])mi\b/.test(u) ? 5280 : /league/.test(u) ? 15840 : /km|kilom/.test(u) ? 3280.84
      : /meter|metre|(^|[^k])m\b/.test(u) ? 3.28084 : /yard|yd/.test(u) ? 3 : 1);
  return g.distance * per;
}
export function isOverworldScene(scene) {
  try {
    if (!scene) return false;
    const thr = Number(game.settings.get(MODULE_ID, "travelOverworldGridThreshold")) || 100;
    return gridFeetPerCell(scene) >= thr;
  } catch (e) { return false; }
}

// Reaction/opportunity-attack ttl for phone prompts (DM 2026-07-19): midi's reactionTimeout scaled by
// the module's reactionTimeoutPct (default 120 = +20%), floored at 5s. Single source of truth for the
// reaction relay and the AoO dispatch, so "give phone players more time" is set in one place.
export function reactionTimeoutMs() {
  let base = 30;
  try {
    const mid = (globalThis.MidiQOL?.configSettings?.().reactionTimeout)
      ?? game.settings.get("midi-qol", "ConfigSettings")?.reactionTimeout;
    if (Number(mid) > 0) base = Number(mid);
  } catch (e) { /* midi absent or key moved — keep the 30s default */ }
  let pct = 120;
  try { const p = Number(game.settings.get(MODULE_ID, "reactionTimeoutPct")); if (p > 0) pct = p; } catch (e) {}
  return Math.max(5, Math.round(base * pct / 100)) * 1000;
}
