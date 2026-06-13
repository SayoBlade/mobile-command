import { MODULE_ID } from "./preset.js";

// Phase 2 — Controller Shell + read-only Touch Sheet.
// Full-screen frameless takeover for phone-role clients. Rolls use the dnd5e
// document-level methods (rollAbilityCheck/rollSavingThrow/rollSkill), which
// render their dialog locally and work on a no-canvas client (Spike 3, Test 0).
// HP editing, inventory, spell prep, item use (Route B) come in later phases.

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const SKILL_STRIP = ["prc", "ste", "ins"]; // §7.2 common one-tap skills
const ROLL_HISTORY_MAX = 6;   // recent-rolls strip cap (newest-first)
const ROLL_TOAST_MS = 4500;   // transient roll toast lifetime (ms)

export function isPhoneClient() {
  const role = game.settings.get(MODULE_ID, "role");
  return role === "phone" || (role === "auto" && !game.user.isGM);
}

function signed(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}

export class ControllerShell extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "mobile-command-shell",
    classes: ["mc-shell"],
    window: { frame: false, positioned: false }
  };

  #tab = "sheet";
  #recentRolls = [];   // newest-first cache backing the recent-rolls strip
  #toastEl = null;     // transient roll toast; overlay node kept across re-renders
  #toastTimer = null;

  /** The actor this phone controls: assigned character, else first owned character. */
  get actor() {
    if (game.user.character) return game.user.character;
    return game.actors.find(a => a.type === "character" && a.isOwner) ?? null;
  }

  async _renderHTML() {
    return this.#buildHTML();
  }

  _replaceHTML(result, content) {
    // Detach the live toast first so the innerHTML swap doesn't destroy an
    // in-flight roll toast on an unrelated re-render (e.g. an HP/condition
    // update). The recent-rolls strip is rebuilt from #recentRolls below.
    const toast = this.#toastEl;
    if (toast?.parentElement === content) content.removeChild(toast);
    content.innerHTML = typeof result === "string" ? result : "";
    this.#attachListeners(content);
    if (toast) content.appendChild(toast);
  }

  #buildHTML() {
    const actor = this.actor;
    if (!actor) {
      return `<div class="mc-placeholder">No owned character found for ${game.user.name}.</div>`;
    }
    const hp = actor.system.attributes?.hp ?? {};
    const pct = hp.max ? (hp.value / hp.max) : 1;
    const hpClass = pct <= 0.33 ? "mc-bloodied" : pct < 1 ? "mc-hurt" : "";
    const img = actor.img || actor.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg";

    const conditions = (actor.temporaryEffects ?? [])
      .map(e => e.name).filter(Boolean);
    const condHTML = conditions.length
      ? conditions.map(c => `<span class="mc-chip">${foundry.utils.escapeHTML(c)}</span>`).join("")
      : `<span class="mc-chip mc-none">No active conditions</span>`;

    return `
      <header class="mc-header">
        <img class="mc-portrait" src="${img}" alt="">
        <div class="mc-id">
          <div class="mc-name">${foundry.utils.escapeHTML(actor.name)}</div>
          <div class="mc-hp">
            <button class="mc-hp-step" data-action="hp-delta" data-delta="-1" aria-label="HP −1">−</button>
            <span class="mc-hp-cur ${hpClass}">${hp.value ?? "—"}</span>
            <button class="mc-hp-step" data-action="hp-delta" data-delta="1" aria-label="HP +1">+</button>
            <span class="mc-hp-max">/ ${hp.max ?? "—"} HP</span>
            ${hp.temp ? `<span class="mc-hp-temp">+${hp.temp} temp</span>` : ""}
          </div>
        </div>
        <button class="mc-exit" data-action="exit" title="Exit (testing)">✕</button>
      </header>
      <div class="mc-hp-edit">
        <input class="mc-hp-input" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="amount">
        <button class="mc-btn mc-hp-damage" data-action="hp-apply" data-mode="damage">Damage</button>
        <button class="mc-btn mc-hp-heal" data-action="hp-apply" data-mode="heal">Heal</button>
      </div>
      <div class="mc-conditions">${condHTML}</div>
      <main class="mc-content">${this.#tabContent(actor)}</main>
      ${this.#rollStripHTML()}
      <nav class="mc-tabs">
        ${this.#tabButton("actions", "Actions")}
        ${this.#tabButton("sheet", "Sheet")}
        ${this.#tabButton("journal", "Journal")}
      </nav>`;
  }

  #tabButton(id, label) {
    return `<button class="mc-tab ${this.#tab === id ? "mc-active" : ""}" data-action="tab" data-tab="${id}">${label}</button>`;
  }

  #tabContent(actor) {
    if (this.#tab === "actions") {
      return `<div class="mc-placeholder">Actions &amp; item use arrive in Phase 3 (Route B).</div>`;
    }
    if (this.#tab === "journal") {
      return `<div class="mc-placeholder">The shared journal composer arrives in Phase 4.</div>`;
    }
    return this.#sheetHTML(actor);
  }

  #sheetHTML(actor) {
    const skills = actor.system.skills ?? {};
    const skillStrip = SKILL_STRIP.map(s => {
      const label = CONFIG.DND5E.skills[s]?.label ?? s;
      const mod = skills[s]?.total;
      return `<button class="mc-skill" data-action="skill" data-skill="${s}">
        <div class="mc-skill-name">${label}</div>
        <div class="mc-skill-mod">${mod == null ? "—" : signed(mod)}</div>
      </button>`;
    }).join("");

    const abilities = actor.system.abilities ?? {};
    const abilityGrid = ABILITIES.map(a => {
      const abbr = (CONFIG.DND5E.abilities[a]?.abbreviation ?? a).toUpperCase();
      const mod = abilities[a]?.mod;
      return `<div class="mc-ability">
        <div class="mc-ability-top">
          <span class="mc-ability-abbr">${abbr}</span>
          <span class="mc-ability-mod">${mod == null ? "—" : signed(mod)}</span>
        </div>
        <div class="mc-ability-btns">
          <button class="mc-btn" data-action="check" data-ability="${a}">Check</button>
          <button class="mc-btn mc-save" data-action="save" data-ability="${a}">Save</button>
        </div>
      </div>`;
    }).join("");

    return `
      <div class="mc-section-label">Skills</div>
      <div class="mc-skills">${skillStrip}</div>
      <div class="mc-section-label">Abilities — tap Check or Save</div>
      <div class="mc-abilities">${abilityGrid}</div>`;
  }

  // Bound once so remove+add is idempotent — prevents handler stacking across
  // re-renders, and re-binds correctly if the root element is recreated.
  #onClick = (ev) => {
    const el = ev.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const actor = this.actor;
    switch (action) {
      case "exit": return this.close();
      case "tab":
        this.#tab = el.dataset.tab;
        return this.render();
      case "check":
        return actor?.rollAbilityCheck({ ability: el.dataset.ability });
      case "save":
        return actor?.rollSavingThrow({ ability: el.dataset.ability });
      case "skill":
        return actor?.rollSkill({ skill: el.dataset.skill });
      case "hp-delta":
        return this.#applyHP(Number(el.dataset.delta));
      case "hp-apply": {
        const input = this.element?.querySelector(".mc-hp-input");
        const n = Math.abs(parseInt(input?.value, 10)) || 0;
        if (input) input.value = "";
        if (!n) return;
        return this.#applyHP(el.dataset.mode === "damage" ? -n : n);
      }
    }
  };

  /** Apply an HP delta to the controlled actor, clamped to [0, max]. */
  async #applyHP(delta) {
    const actor = this.actor;
    if (!actor || !delta) return;
    const hp = actor.system.attributes?.hp;
    if (!hp) return;
    const max = hp.max ?? (hp.value + delta);
    const next = Math.max(0, Math.min(max, hp.value + delta));
    if (next === hp.value) return;
    await actor.update({ "system.attributes.hp.value": next });
    // The updateActor hook re-renders the shell, refreshing the HP display.
  }

  #attachListeners(root) {
    root.removeEventListener("click", this.#onClick);
    root.addEventListener("click", this.#onClick);
  }

  // --- roll-result surface (read-only) -------------------------------------
  // The full-screen shell covers Foundry's native chat, so a phone player can't
  // see their own roll outcomes (DESIGN §9 build-phase-2 finding, 2026-06-13).
  // A createChatMessage hook (registerShellHooks) routes this user's/actor's
  // roll messages here: a transient toast over the sheet + a persistent
  // recent-rolls strip. Read-only — pairs with the Prompt Restyler (§7.6),
  // which handles the roll *dialog*, not its *output*.

  /** Called from the createChatMessage hook for every new message. */
  noteRoll(message) {
    const entry = this.#describeRoll(message);
    if (!entry) return;
    if (this.#recentRolls[0]?.id === entry.id) return; // belt-and-suspenders dedupe
    this.#recentRolls.unshift(entry);
    if (this.#recentRolls.length > ROLL_HISTORY_MAX) this.#recentRolls.length = ROLL_HISTORY_MAX;
    this.#refreshStrip();
    this.#showToast(entry);
  }

  /** Map a chat message to a roll summary, or null if it isn't this user's roll. */
  #describeRoll(message) {
    const rolls = message.rolls ?? [];
    if (!rolls.length) return null;
    const actorId = this.actor?.id;
    const mine = message.author?.id === game.user.id
      || (actorId && message.speaker?.actor === actorId);
    if (!mine) return null;

    const roll = rolls[0];
    // Flavor may carry HTML (dnd5e labels); read text only.
    const tmp = document.createElement("div");
    tmp.innerHTML = message.flavor ?? "";
    const label = tmp.textContent.trim() || "Roll";

    // Natural 20 / 1 on the kept d20 — system-agnostic, no dnd5e internals.
    const d20 = roll.dice?.find(d => d.faces === 20);
    const natural = d20?.results?.find(r => r.active)?.result ?? null;
    const outcome = natural === 20 ? "nat20" : natural === 1 ? "nat1" : "";

    return { id: message.id, label, total: roll.total, formula: roll.formula, outcome };
  }

  #rollStripHTML() {
    return `<div class="mc-roll-strip"${this.#recentRolls.length ? "" : " hidden"}>${this.#stripPills()}</div>`;
  }

  #stripPills() {
    return this.#recentRolls.map((r, i) => `
      <div class="mc-roll-pill ${r.outcome} ${i === 0 ? "mc-latest" : ""}">
        <span class="mc-roll-pill-total">${r.total}</span>
        <span class="mc-roll-pill-label">${foundry.utils.escapeHTML(r.label)}</span>
      </div>`).join("");
  }

  /** Update the in-flow strip without a full re-render (rolls don't touch the actor). */
  #refreshStrip() {
    const strip = this.element?.querySelector(".mc-roll-strip");
    if (!strip) return;
    strip.innerHTML = this.#stripPills();
    strip.hidden = this.#recentRolls.length === 0;
  }

  #ensureToast() {
    if (!this.#toastEl) {
      const toast = document.createElement("div");
      toast.className = "mc-roll-toast";
      toast.addEventListener("click", () => this.#hideToast());
      this.#toastEl = toast;
    }
    if (!this.#toastEl.isConnected && this.element) {
      this.element.appendChild(this.#toastEl);
      void this.#toastEl.offsetWidth; // flush layout so the first show transitions
    }
    return this.#toastEl;
  }

  #showToast(entry) {
    const toast = this.#ensureToast();
    const tag = entry.outcome === "nat20" ? "Natural 20"
      : entry.outcome === "nat1" ? "Natural 1" : "";
    toast.classList.remove("nat20", "nat1");
    if (entry.outcome) toast.classList.add(entry.outcome);
    toast.innerHTML = `
      <div class="mc-roll-toast-total">${entry.total}</div>
      <div class="mc-roll-toast-meta">
        <div class="mc-roll-toast-label">${foundry.utils.escapeHTML(entry.label)}</div>
        <div class="mc-roll-toast-formula">${foundry.utils.escapeHTML(entry.formula ?? "")}</div>
        ${tag ? `<span class="mc-roll-tag">${tag}</span>` : ""}
      </div>`;
    toast.classList.add("mc-show");
    clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => this.#hideToast(), ROLL_TOAST_MS);
  }

  #hideToast() {
    clearTimeout(this.#toastTimer);
    this.#toastEl?.classList.remove("mc-show");
  }

  _onClose(options) {
    clearTimeout(this.#toastTimer);
    this.#toastEl = null;
    this.#recentRolls = [];
    super._onClose(options);
  }
}

let shellInstance = null;

// The shell is frameless and pinned at z-index 9999 (CSS). Framed dialogs
// (roll config, save/reaction prompts) get z = ++ApplicationV2._maxZ, which
// starts ~100s — i.e. BELOW the shell, so they'd open hidden behind it. Raise
// _maxZ above the shell and lift framed apps on render so the interactive
// moments always appear on top. Docked UI (sidebar/hotbar) is frameless and
// thus excluded by the frame check.
const SHELL_Z = 9999;

function liftDialogAboveShell(app) {
  if (!shellInstance?.rendered || app === shellInstance) return;
  if (app.options?.window?.frame === false) return; // skip docked/frameless UI
  const el = app.element;
  if (!(el instanceof HTMLElement)) return;
  const AppV2 = foundry.applications.api.ApplicationV2;
  AppV2._maxZ = Math.max(AppV2._maxZ + 1, SHELL_Z + 2);
  el.style.zIndex = String(AppV2._maxZ);
}

export function openShell() {
  if (!shellInstance) shellInstance = new ControllerShell();
  // Ensure subsequent framed dialogs out-stack the shell even via bringToFront.
  const AppV2 = foundry.applications.api.ApplicationV2;
  if (AppV2._maxZ < SHELL_Z + 1) AppV2._maxZ = SHELL_Z + 1;
  shellInstance.render({ force: true });
  return shellInstance;
}

export function closeShell() {
  shellInstance?.close();
}

export function maybeAutoOpenShell() {
  if (isPhoneClient()) openShell();
}

// Re-render the open shell when the controlled actor changes (HP, conditions…).
export function registerShellHooks() {
  // Keep framed dialogs/prompts above the full-screen shell.
  Hooks.on("renderApplicationV2", liftDialogAboveShell);
  Hooks.on("updateActor", (actor) => {
    if (shellInstance?.rendered && actor === shellInstance.actor) shellInstance.render();
  });
  Hooks.on("createActiveEffect", (effect) => {
    if (shellInstance?.rendered && effect.parent === shellInstance.actor) shellInstance.render();
  });
  Hooks.on("deleteActiveEffect", (effect) => {
    if (shellInstance?.rendered && effect.parent === shellInstance.actor) shellInstance.render();
  });
  // Surface this user's/actor's roll results inside the shell (it covers chat).
  Hooks.on("createChatMessage", (message) => {
    if (shellInstance?.rendered) shellInstance.noteRoll(message);
  });
}
