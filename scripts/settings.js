import { MODULE_ID, SAVE_TIMEOUT_SETTING } from "./preset.js";
import { makeConfirmMenuClass, deactivate, reactivate, hasBackup, hasReactivateSnapshot } from "./enforcer.js";

export function registerSettings() {
  // D7 role, per-client. Phase 1 uses it only to decide which client runs
  // executor duties ("dm" + GM role); the phone/display shells come later.
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

  // Auto-own new player characters for the shared display/TV account so their vision shows on
  // the TV without per-actor ownership fiddling (DM 2026-06-27). Stores a user id; "" = off.
  // The field renders as a player dropdown (renderSettingsConfig below — game.users isn't ready
  // at registration). Choosing an account also grants it ownership of EXISTING characters
  // (onChange → retroGrantOwnership, executor-only).
  game.settings.register(MODULE_ID, "displayOwnerUser", {
    name: "Auto-own new PCs for (display/TV account)", // nbsp keeps the parenthetical from wrapping mid-phrase
    hint: "Pick your shared TV/display account. Any newly-created player character is automatically given to it as Owner, so the TV shows that character's vision. Choosing an account also grants it ownership of your existing characters. Leave as “none” to turn this off.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: (value) => { if (value) retroGrantOwnership(value); }
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

// Grant `userId` OWNER on every existing player-character that lacks it — the "fix existing"
// half of auto-own, run when displayOwnerUser is chosen. Executor-only (one writer; ownership
// writes are GM-only).
async function retroGrantOwnership(userId) {
  try {
    if (!isExecutor()) return;
    const user = game.users.get(userId);
    if (!user || user.isGM) return;
    const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    let n = 0;
    for (const actor of game.actors) {
      if (actor.type !== "character" || !actor.hasPlayerOwner) continue; // real PCs only, not templates/NPCs
      if ((actor.ownership?.[user.id] ?? 0) >= OWNER) continue;
      await actor.update({ [`ownership.${user.id}`]: OWNER });
      n++;
    }
    ui.notifications?.info?.(`Mobile Command: gave ${user.name} ownership of ${n} character(s).`);
  } catch (e) {
    console.warn(`${MODULE_ID} | retro ownership grant failed`, e);
  }
}

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
