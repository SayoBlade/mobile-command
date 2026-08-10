import { MODULE_ID, SAVE_TIMEOUT_SETTING } from "./preset.js";
import { runPreflight } from "./preflight.js";
import { runDmWizard } from "./dm-wizard.js";

// §29 Settings mini-app — FOUR tabs (Display / Combat / Travel & world / System), one window,
// DM-panel styling, vertical tab rail. The home for the settings that had none: ~half the
// module's registrations are config:false, reachable before this only via the wizard, panel
// drawers, or nothing. Decisions baked in (DM 2026-07-26): TV volumes + mute stay on the DM
// panel ONLY (reflexive controls, one home each — no Sound tab); combat music lives under
// Combat → Music; the Effects toggles stay a panel tab; heartbeatSeconds / clockStart /
// softFog stay UNEXPOSED (plumbing constants and a superseded key — foot-guns, not choices).
//
// Every control writes its real setting on change (registration onChange side effects — e.g.
// fogStyle → refreshFog — fire on their own). Values re-read on every render, so the window
// always shows the live truth, including changes made elsewhere (wizard, panel, console).

const { ApplicationV2 } = foundry.applications.api;

export class MCSettingsApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "mc-settings-app",
    window: { title: "Mobile Command — Settings", resizable: true },
    position: { width: 600 }
  };

  #tab = "display";

  static open() {
    if (!game.user.isGM) return void ui.notifications.warn("Settings are the DM's.");
    (MCSettingsApp.#instance ??= new MCSettingsApp()).render({ force: true });
  }
  static #instance = null;

  async _renderHTML() { return this.#html(); }
  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender() {
    this.element.addEventListener("click", this.#onClick);
    this.element.addEventListener("change", this.#onChange);
  }

  // ── value helpers ──────────────────────────────────────────────────────────
  #get(key) { try { return game.settings.get(MODULE_ID, key); } catch (e) { return undefined; } }
  async #set(key, value) {
    try { await game.settings.set(MODULE_ID, key, value); }
    catch (e) { console.error(`${MODULE_ID} | settings app write failed`, key, e); ui.notifications.warn(`Couldn't save ${key}: ${e.message}`); }
    this.render();
  }

  // ── markup ────────────────────────────────────────────────────────────────
  #html() {
    const tabs = [
      ["display", "Display"], ["combat", "Combat"], ["travel", "Travel & world"], ["system", "System"]
    ];
    const rail = tabs.map(([id, label]) =>
      `<button class="mc-sa-tab ${this.#tab === id ? "mc-on" : ""}" data-sa-tab="${id}">${label}</button>`).join("");
    const pane = this.#tab === "display" ? this.#displayPane()
      : this.#tab === "combat" ? this.#combatPane()
      : this.#tab === "travel" ? this.#travelPane()
      : this.#systemPane();
    return `<div class="mc-sa">
      <div class="mc-sa-rail">${rail}</div>
      <div class="mc-sa-pane">${pane}</div>
    </div>`;
  }

  #sec(label) { return `<div class="mc-sa-sec">${label}</div>`; }
  #toggle(key, label, hint = "") {
    return `<div class="mc-sa-row" title="${foundry.utils.escapeHTML(hint)}">
      <span class="mc-sa-lbl">${label}</span>
      <button class="mc-sa-toggle ${this.#get(key) ? "mc-on" : ""}" data-sa-toggle="${key}" role="switch" aria-checked="${!!this.#get(key)}"></button>
    </div>`;
  }
  #chips(key, label, choices, hint = "") {
    const cur = this.#get(key);
    const chips = Object.entries(choices).map(([v, l]) =>
      `<button class="mc-sa-chip ${cur === v ? "mc-on" : ""}" data-sa-chip="${key}" data-value="${v}">${l}</button>`).join("");
    return `<div class="mc-sa-row" title="${foundry.utils.escapeHTML(hint)}"><span class="mc-sa-lbl">${label}</span><span class="mc-sa-chips">${chips}</span></div>`;
  }
  #number(key, label, { min = 0, max = 999, step = 1, unit = "" } = {}, hint = "") {
    return `<div class="mc-sa-row" title="${foundry.utils.escapeHTML(hint)}">
      <span class="mc-sa-lbl">${label}</span>
      <input class="mc-sa-num" type="number" data-sa-num="${key}" value="${this.#get(key)}" min="${min}" max="${max}" step="${step}">
      <span class="mc-sa-unit">${unit}</span>
    </div>`;
  }
  #slider(key, label, { min = 0, max = 100, step = 1, unit = "%" } = {}, hint = "") {
    const v = Number(this.#get(key)) || 0;
    return `<div class="mc-sa-row" title="${foundry.utils.escapeHTML(hint)}">
      <span class="mc-sa-lbl">${label}</span>
      <input class="mc-sa-range" type="range" data-sa-num="${key}" value="${v}" min="${min}" max="${max}" step="${step}">
      <span class="mc-sa-unit">${v}${unit}</span>
    </div>`;
  }
  #select(key, label, options, hint = "") {
    const cur = this.#get(key);
    const opts = options.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${foundry.utils.escapeHTML(l)}</option>`).join("");
    return `<div class="mc-sa-row" title="${foundry.utils.escapeHTML(hint)}"><span class="mc-sa-lbl">${label}</span><select class="mc-sa-select" data-sa-select="${key}">${opts}</select></div>`;
  }
  #hintRow(label, text) {
    return `<div class="mc-sa-row"><span class="mc-sa-lbl">${label}</span><span class="mc-sa-hint">${text}</span></div>`;
  }

  #displayPane() {
    const users = [["", "— none —"], ...game.users.filter(u => !u.isGM).map(u => [u.id, u.name])];
    // §39 the first thing to decide about a table, so it sits above everything the shared screen
    // does — every seat, rotation and dealt card downstream is an answer to this one question.
    const online = this.#get("tableMode") === "online";
    return this.#sec("The table")
      + this.#chips("tableMode", "This table plays", { person: "In person", online: "Online" },
        "In person assumes a TV lying flat with people around it; online drops the seating, the rotation and the face-down deal.")
      + this.#hintRow("What changes", online
        ? "No seats, no rotated controls, cards face up — and phones keep their own sound."
        : "Seats around the flat screen, rotated cards and controls, and the deal starts face down.")
      + this.#sec("The shared screen")
      + this.#select("displayOwnerUser", "TV / display account", users, "The account the shared display logs in as; PCs are auto-shared with it at Observer.")
      + this.#toggle("dmOmniscientVision", "Keep the DM's vision omniscient", "Shared-screen tables: the DM sees everything regardless of token vision.")
      + this.#toggle("combatPovVision", "Combat: only the active player's POV on the TV")
      + this.#toggle("hideGMCursor", "Hide the GM's cursor (keep pings)")
      + this.#sec("Fog of war")
      + this.#chips("fogStyle", "Fog edges", { off: "Off", soft: "Soft", gpu: "GPU" }, "GPU replaces the fog shader with soft penumbra edges (needs High performance mode on the TV).")
      + this.#slider("fogExploredLevel", "Explored-area brightness", { min: 0, max: 60, unit: "%" })
      + this.#sec("Tokens")
      + this.#number("tokenGlow", "PC token glow (ft of bright light)", { min: 0, max: 60, step: 0.1, unit: "ft" })
      + this.#toggle("ringPlayerColors", "Color PC rings by player")
      + this.#toggle("ringHealthColors", "Show HP on PC rings (green→red)")
      + this.#toggle("markDeadNpcs", "Mark dead NPCs with a skull")
      + this.#select("portraitStyle", "Campaign visual style (AI portraits)", [["", "— none set —"], ...(this.#get("portraitStyle") ? [[this.#get("portraitStyle"), this.#get("portraitStyle")]] : [])], "Set via the portrait generator; the style layer every AI portrait prompt shares.");
  }

  #combatPane() {
    const playlists = [["", "— none —"], ...game.playlists.map(p => [p.uuid, p.name])];
    const anthems = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner && a.getFlag(MODULE_ID, "combatTheme"))
      .map(a => foundry.utils.escapeHTML(a.name)).join(", ");
    return this.#sec("Reactions & opportunity attacks")
      + this.#toggle("aooEnabled", "Watch movement for opportunity attacks")
      + this.#chips("aooNpcMode", "NPC opportunity attacks", { prompt: "Ask", auto: "Auto", off: "Off" }, "Ask = a chip on the DM panel; Auto = the NPC swings on its own.")
      + this.#number("reactionTimeoutPct", "Reaction time for phones (% of midi's)", { min: 50, max: 400, step: 10, unit: "%" }, "Phone players must notice the prompt before they can tap — 120 gives them 20% more time than midi's timeout.")
      + this.#number(SAVE_TIMEOUT_SETTING, "Save prompt timeout", { min: 10, max: 600, step: 5, unit: "s" })
      + this.#sec("Music")
      + this.#select("combatMusicPlaylist", "Combat-music playlist", playlists, "The battle track for each fight is picked from this playlist in the Combat tab's staging.")
      + this.#hintRow("Per-PC anthems", anthems ? `Set: ${anthems} — drag tracks onto PCs in the DM panel.` : "Drag a track onto a PC in the DM panel's sound drawer.")
      + this.#toggle("combatPovAudio", "Combat: hear from the active combatant on the TV")
      + this.#sec("After the fight")
      + this.#toggle("autoLootNpcs", "Dead NPCs become lootable piles")
      + this.#sec("Table control")
      + this.#toggle("pauseGuard", "Pause guard (players can't act while paused)");
  }

  #travelPane() {
    const marked = (this.#get("travelOverworldSceneIds") || [])
      .map(id => game.scenes.get(id)?.name).filter(Boolean).map(foundry.utils.escapeHTML).join(", ");
    return this.#sec("Day & night")
      + this.#toggle("clockDaylight", "Daylight follows the clock", "Every scene's darkness moves with the time of day. Mark indoor areas with Foundry's \"Adjust Darkness Level\" region behaviour (Override) to opt them out; a scene with darkness LOCKED is left alone.")
      + this.#sec("Travel maps")
      + this.#hintRow("Overworld scenes", marked ? `Marked: ${marked}` : "None marked — mark scenes from the DM panel's Travel tab.")
      + this.#toggle("travelAutoLight", "Auto-set overworld lighting on load")
      + this.#toggle("travelDaylight", "Daylight follows the clock")
      + this.#toggle("partyTeleportActivates", "Activate scene when the party arrives")
      + this.#hintRow("Custom travel paces", "Edit from the DM panel's Travel tab.")
      + this.#sec("Players")
      + this.#number("awayThresholdSeconds", "Away alert after", { min: 30, max: 600, step: 15, unit: "s" });
  }

  #systemPane() {
    const gms = [["", "— active GM —"], ...game.users.filter(u => u.isGM).map(u => [u.id, u.name])];
    const roleChoices = { auto: "Auto", phone: "Phone", display: "Display", dm: "DM" };
    return this.#sec("Roles")
      + this.#chips("role", "This device is a…", roleChoices, "Per-device (client setting). Auto: players get the phone shell, GMs the desktop.")
      + this.#select("executorUser", "Executor (the GM client that runs actions)", gms)
      + this.#sec("Health & enforcement")
      + this.#toggle("enforcerAutoPrompt", "midi settings enforcer auto-prompt")
      + `<div class="mc-sa-row"><span class="mc-sa-lbl">System health (preflight)</span><button class="mc-sa-btn" data-sa-preflight>Run Checks</button></div>`
      + `<div class="mc-sa-row"><span class="mc-sa-lbl">First-run setup</span><button class="mc-sa-btn mc-sa-cta" data-sa-wizard>Re-Run Wizard</button></div>`;
  }

  // ── events ────────────────────────────────────────────────────────────────
  #onClick = async (ev) => {
    const tab = ev.target.closest("[data-sa-tab]");
    if (tab) { this.#tab = tab.dataset.saTab; return this.render(); }
    const tog = ev.target.closest("[data-sa-toggle]");
    if (tog) return this.#set(tog.dataset.saToggle, !this.#get(tog.dataset.saToggle));
    const chip = ev.target.closest("[data-sa-chip]");
    if (chip) return this.#set(chip.dataset.saChip, chip.dataset.value);
    if (ev.target.closest("[data-sa-preflight]")) {
      const results = await runPreflight();
      const bad = results.filter(r => r.status !== "ok");
      if (!bad.length) ui.notifications.info("System health: all checks pass.");
      else ui.notifications.warn(`System health: ${bad.map(b => `${b.label} — ${b.detail}`).join(" · ")}`);
      return;
    }
    if (ev.target.closest("[data-sa-wizard]")) { this.close(); return runDmWizard(); }
  };

  #onChange = (ev) => {
    const num = ev.target.closest("[data-sa-num]");
    if (num) return this.#set(num.dataset.saNum, Number(num.value));
    const sel = ev.target.closest("[data-sa-select]");
    if (sel) return this.#set(sel.dataset.saSelect, sel.value);
  };
}

// The app is reachable from BOTH front doors: Foundry's own module-settings page
// (registerMenu — where a DM instinctively looks first) and the DM panel's Settings tab.
export function registerSettingsMenu() {
  try {
    game.settings.registerMenu(MODULE_ID, "settingsApp", {
      name: "Mobile Command settings",
      label: "Open Settings",
      hint: "Every Mobile Command setting in one window — display, combat, travel, system.",
      icon: "fas fa-sliders",
      // A shim: Foundry instantiates + renders the menu's type; we redirect to the real app.
      type: class extends foundry.applications.api.ApplicationV2 {
        render() { MCSettingsApp.open(); return this; }
      },
      restricted: true
    });
  } catch (e) { console.warn(`${MODULE_ID} | could not register the settings menu`, e); }
}
