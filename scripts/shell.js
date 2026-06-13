import { MODULE_ID } from "./preset.js";
import { api as rpc } from "./rpc.js";

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
  #actionState = null; // null = action list; object = target-pick/fire sub-view
  #editingField = null; // B7: "hp" | "temp" while that stat is an inline input

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
    if (this.#editingField) {
      const inp = content.querySelector(".mc-stat-input");
      if (inp) { inp.focus(); inp.select(); }
    }
  }

  #buildHTML() {
    const actor = this.actor;
    if (!actor) {
      return `<div class="mc-placeholder">No owned character found for ${game.user.name}.</div>`;
    }
    const sys = actor.system;
    const hp = sys.attributes?.hp ?? {};
    const pct = hp.max ? (hp.value / hp.max) : 1;
    const hpClass = pct <= 0.33 ? "mc-bloodied" : pct < 1 ? "mc-hurt" : "";
    const ac = sys.attributes?.ac?.value ?? "—";
    const insp = !!sys.attributes?.inspiration;
    const img = actor.img || actor.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg";

    const conditions = (actor.temporaryEffects ?? [])
      .map(e => e.name).filter(Boolean);
    const condHTML = conditions.length
      ? conditions.map(c => `<span class="mc-chip">${foundry.utils.escapeHTML(c)}</span>`).join("")
      : `<span class="mc-chip mc-none">No active conditions</span>`;

    // B7: HP & temp are tap-to-edit — input accepts absolute ("22") or relative ("-10"/"+3").
    const hpField = this.#editingField === "hp"
      ? `<input class="mc-stat-input" data-field="hp" type="text" inputmode="numeric" value="${hp.value ?? ""}">`
      : `<button class="mc-stat-val mc-hp-cur ${hpClass}" data-action="edit-hp">${hp.value ?? "—"}</button>`;
    const tempField = this.#editingField === "temp"
      ? `<input class="mc-stat-input mc-temp-input" data-field="temp" type="text" inputmode="numeric" value="${hp.temp || ""}">`
      : `<button class="mc-stat-val mc-temp-val ${hp.temp ? "" : "mc-zero"}" data-action="edit-temp">${hp.temp || 0}</button>`;

    return `
      <header class="mc-header">
        <img class="mc-portrait" src="${img}" alt="">
        <div class="mc-id">
          <div class="mc-name">${foundry.utils.escapeHTML(actor.name)}</div>
          <div class="mc-stats">
            <span class="mc-stat"><span class="mc-stat-label">HP</span>${hpField}<span class="mc-stat-sub">/${hp.max ?? "—"}</span></span>
            <span class="mc-stat"><span class="mc-stat-label">Temp</span>${tempField}</span>
            <span class="mc-stat"><span class="mc-stat-label">AC</span><span class="mc-stat-val mc-stat-ac">${ac}</span></span>
            <button class="mc-insp ${insp ? "mc-insp-on" : ""}" data-action="toggle-insp" title="Inspiration">★</button>
          </div>
        </div>
        <button class="mc-exit" data-action="exit" title="Exit (testing)">✕</button>
      </header>
      <div class="mc-conditions">${condHTML}</div>
      <main class="mc-content">${this.#tabContent(actor)}</main>
      ${this.#rollStripHTML()}
      ${this.#turnHudHTML()}
      <nav class="mc-tabs">
        ${this.#tabButton("actions", "Actions")}
        ${this.#tabButton("sheet", "Sheet")}
        ${this.#tabButton("move", "Move")}
        ${this.#tabButton("journal", "Journal")}
      </nav>`;
  }

  #tabButton(id, label) {
    return `<button class="mc-tab ${this.#tab === id ? "mc-active" : ""}" data-action="tab" data-tab="${id}">${label}</button>`;
  }

  #tabContent(actor) {
    if (this.#tab === "actions") return this.#actionsHTML(actor);
    if (this.#tab === "move") return this.#moveHTML();
    if (this.#tab === "journal") {
      return `<div class="mc-placeholder">The shared journal composer arrives in Phase 4.</div>`;
    }
    return this.#sheetHTML(actor);
  }

  // Move pad (§7.4): D-pad steps the player's own token via the move.request
  // RPC (executor wall-validates and applies). Out-of-combat group-token
  // binding is a later refinement; this moves the controlled actor's token.
  #moveHTML() {
    if (!this.originTokenId) {
      return `<div class="mc-placeholder">No token for this character on the active scene.</div>`;
    }
    const cell = (dx, dy, glyph, cls = "") =>
      `<button class="mc-dpad-btn ${cls}" data-action="move" data-dx="${dx}" data-dy="${dy}">${glyph}</button>`;
    const blank = `<span class="mc-dpad-blank"></span>`;
    return `
      <div class="mc-section-label">Move — one square per tap</div>
      <div class="mc-dpad">
        ${cell(-1, -1, "↖")}${cell(0, -1, "↑")}${cell(1, -1, "↗")}
        ${cell(-1, 0, "←")}${blank}${cell(1, 0, "→")}
        ${cell(-1, 1, "↙")}${cell(0, 1, "↓")}${cell(1, 1, "↘")}
      </div>
      <div class="mc-move-note" data-role="move-note"></div>`;
  }

  // Turn HUD (§7.4): shows the current combatant; End turn routes to the
  // executor (nextTurn is GM-side) and is enabled only on the player's turn.
  #turnHudHTML() {
    const combat = game.combat;
    if (!combat?.started) return "";
    const cur = combat.combatant;
    const isMyTurn = !!cur?.actor && cur.actor.id === this.actor?.id;
    const label = isMyTurn ? "Your turn"
      : `Up: ${foundry.utils.escapeHTML(cur?.name ?? "—")}`;
    return `<div class="mc-turnhud ${isMyTurn ? "mc-myturn" : ""}">
      <span class="mc-turn-label">${label}</span>
      <button class="mc-endturn" data-action="end-turn" ${isMyTurn ? "" : "disabled"}>End turn</button>
    </div>`;
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

  // --- Actions tab: combat loop (Route B, Step 1 — fully resolved) ----------
  // Lists the actor's usable offensive activities; tapping one opens a target
  // picker (candidates from the Service listTargets RPC) + adv/normal/dis, then
  // fires via the proven Route B path (rpc.useActivity). AoE activities are
  // excluded (DM template flow); the RPC surfaces refusals (no slots, etc.).

  /** The controlled actor's token id on the active scene (no canvas needed). */
  get originTokenId() {
    const id = this.actor?.id;
    return game.scenes.active?.tokens.find(t => t.actor?.id === id)?.id ?? null;
  }

  #usableActivities() {
    const out = [];
    for (const item of this.actor?.items ?? []) {
      const acts = item.system?.activities;
      if (!acts) continue;
      for (const a of acts) {
        if (!["attack", "save", "damage"].includes(a.type)) continue;
        if (a.target?.template?.type) continue; // AoE → DM places template
        out.push(a);
      }
    }
    return out;
  }

  #actionsHTML() {
    if (this.#actionState) return this.#targetPickerHTML();
    const acts = this.#usableActivities();
    if (!acts.length) {
      return `<div class="mc-placeholder">No usable attacks or offensive spells found.</div>`;
    }
    const rows = acts.map(a => {
      const sub = a.item.name === a.name ? a.type : a.name;
      return `<button class="mc-action" data-action="action-pick" data-uuid="${a.uuid}">
        <span class="mc-action-name">${foundry.utils.escapeHTML(a.item.name)}</span>
        <span class="mc-action-sub">${foundry.utils.escapeHTML(sub)}</span>
      </button>`;
    }).join("");
    return `<div class="mc-section-label">Actions — tap to target &amp; use</div>
      <div class="mc-actions">${rows}</div>`;
  }

  #targetPickerHTML() {
    const s = this.#actionState;

    // Post-attack phase: show the attack result + a deliberate "Roll damage" tap.
    if (s.phase === "rolling" || s.phase === "attacked") {
      const head = `<div class="mc-picker-head">
        <button class="mc-back" data-action="action-back">‹ Back</button>
        <span class="mc-picker-title">${foundry.utils.escapeHTML(s.name)}</span>
      </div>`;
      if (s.phase === "rolling") {
        return head + `<div class="mc-target-note">Rolling…</div>`;
      }
      const attackLine = s.hasAttack
        ? `<div class="mc-attack-result ${s.hit ? "mc-hit" : "mc-miss"}">
             <span class="mc-attack-total">${s.attackTotal ?? "—"}</span>
             <span class="mc-attack-label">${s.hit ? "Hit" : "Attack"}</span>
           </div>`
        : "";
      return head + attackLine + `
        <button class="mc-fire mc-roll-damage" data-action="roll-damage" ${s.busy ? "disabled" : ""}>
          ${s.busy ? "Rolling…" : "Roll damage"}
        </button>`;
    }

    const advBtn = (mode, label) =>
      `<button class="mc-adv ${s.adv === mode ? "mc-adv-on" : ""}" data-action="adv" data-mode="${mode}">${label}</button>`;

    let body;
    if (s.selfTarget) {
      body = `<div class="mc-target-note">Self-target — no enemy needed.</div>`;
    } else if (s.candidates === null) {
      body = `<div class="mc-target-note">Finding targets…</div>`;
    } else if (!s.candidates.length) {
      const msg = s.targetError === "game is paused" ? "Game is paused — ask the DM to resume."
        : s.targetError ? foundry.utils.escapeHTML(s.targetError)
        : "No targets in range/sight. Ask the DM to assign, or move closer.";
      body = `<div class="mc-target-note">${msg}</div>`;
    } else {
      body = s.candidates.map(c => {
        const on = s.selected.has(c.uuid);
        const [cls, label] = c.disposition < 0 ? ["foe", "Foe"]
          : c.disposition > 0 ? ["ally", "Ally"] : ["neutral", "Neutral"];
        return `<button class="mc-target ${on ? "mc-target-on" : ""}" data-action="target-toggle" data-uuid="${c.uuid}">
          <span class="mc-target-name">${foundry.utils.escapeHTML(c.name)}</span>
          <span class="mc-target-right">
            <span class="mc-disp mc-${cls}">${label}</span>
            <span class="mc-target-dist">${Math.round(c.distanceFt)} ft</span>
          </span>
        </button>`;
      }).join("");
    }

    const count = s.selfTarget ? "" : `<span class="mc-target-count">${s.selected.size}/${s.maxTargets}</span>`;
    const canFire = s.selfTarget || s.selected.size > 0;
    return `
      <div class="mc-picker-head">
        <button class="mc-back" data-action="action-back">‹ Back</button>
        <span class="mc-picker-title">${foundry.utils.escapeHTML(s.name)}</span>
        ${count}
      </div>
      <div class="mc-adv-row">${advBtn("advantage", "Advantage")}${advBtn("normal", "Normal")}${advBtn("disadvantage", "Disadvantage")}</div>
      <div class="mc-targets">${body}</div>
      <button class="mc-fire ${canFire ? "" : "mc-disabled"}" data-action="fire" ${canFire ? "" : "disabled"}>
        ${s.busy ? "Using…" : "Use"}
      </button>`;
  }

  async #pickAction(uuid) {
    const activity = await fromUuid(uuid);
    if (!activity) return;
    this.#clearPreview(); // drop any stale preview from a prior action
    const affects = activity.target?.affects ?? {};
    const selfTarget = affects.type === "self";
    const maxTargets = Math.max(1, Number(affects.count) || 1);
    this.#actionState = { uuid, name: activity.item.name, selfTarget, maxTargets,
      hasAttack: activity.type === "attack",
      candidates: selfTarget ? [] : null, selected: new Set(), adv: "normal",
      busy: false, phase: "pick", requestId: null, hit: null, attackTotal: null,
      targetError: null };
    this.render();
    if (!selfTarget) {
      const res = await rpc.listTargets({ forTokenId: this.originTokenId });
      if (this.#actionState?.uuid !== uuid) return; // user navigated away
      this.#actionState.candidates = res?.ok ? res.candidates : [];
      this.#actionState.targetError = res?.ok ? null : (res?.reason ?? "could not load targets");
      this.render();
    }
  }

  // Step 1 of the two-tap: fire the attack (or park a damage/save workflow);
  // the executor holds it at WaitForDamageRoll and returns the attack result.
  async #fireAction() {
    const s = this.#actionState;
    if (!s || s.busy) return;
    s.busy = true; s.phase = "rolling"; this.render();
    const midiOptions = {};
    if (s.adv === "advantage") midiOptions.advantage = true;
    if (s.adv === "disadvantage") midiOptions.disadvantage = true;
    let res;
    try {
      res = await this.#withTimeout(rpc.useActivityStart({
        activityUuid: s.uuid,
        targetUuids: s.selfTarget ? [] : Array.from(s.selected),
        midiOptions
      }));
    } catch (err) {
      console.error("mobile-command | useActivityStart failed", err);
      res = { ok: false, reason: err?.message ?? "error — see DM console" };
    }
    if (this.#actionState !== s) return; // navigated away mid-roll
    this.#clearPreview(); // attack fired — the workflow owns its targets now
    if (!res?.ok) {
      this.#actionState = null; this.render();
      return ui.notifications.warn(`${s.name}: ${res?.reason ?? "could not use"}`);
    }
    if (!res.needsDamage) {
      // Resolved without a damage step (a miss, or nothing to roll).
      this.#actionState = null; this.render();
      if (res.reason) ui.notifications.info(`${s.name}: ${res.reason}`);
      return;
    }
    s.busy = false; s.phase = "attacked";
    s.requestId = res.requestId; s.hasAttack = res.hasAttack;
    s.hit = res.hit; s.attackTotal = res.attackTotal;
    this.render();
  }

  // Clear the picker; if a workflow is parked awaiting damage, cancel it on the
  // executor so we never orphan a held workflow when the player backs out.
  #abandonAction() {
    const s = this.#actionState;
    if (s?.requestId) rpc.useActivityCancel({ requestId: s.requestId });
    this.#clearPreview();
    this.#actionState = null;
  }

  // B9 live target preview: reflect the current selection on the executor's
  // canvas/TV as the player taps (empty list clears it).
  #pushPreview() {
    rpc.previewTargets({ tokenUuids: this.#actionState ? Array.from(this.#actionState.selected) : [] });
  }
  #clearPreview() {
    rpc.previewTargets({ tokenUuids: [] });
  }

  // Step 2 of the two-tap: trigger the held workflow's damage roll.
  async #rollDamage() {
    const s = this.#actionState;
    if (!s || s.busy || !s.requestId) return;
    s.busy = true; this.render();
    let res;
    try {
      res = await this.#withTimeout(rpc.useActivityDamage({ requestId: s.requestId }));
    } catch (err) {
      console.error("mobile-command | useActivityDamage failed", err);
      res = { ok: false, reason: err?.message ?? "error — see DM console" };
    }
    this.#actionState = null; this.render();
    if (!res?.ok) ui.notifications.warn(`${s.name}: ${res?.reason ?? "damage failed"}`);
  }

  // Never let a hung RPC strand the UI on "Rolling…".
  #withTimeout(promise, ms = 12000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("request timed out")), ms))
    ]);
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
        this.#abandonAction(); // leave the picker clean; cancel any held workflow
        return this.render();
      case "action-pick":
        return this.#pickAction(el.dataset.uuid);
      case "action-back":
        this.#abandonAction();
        return this.render();
      case "roll-damage":
        return this.#rollDamage();
      case "adv":
        if (this.#actionState) { this.#actionState.adv = el.dataset.mode; this.render(); }
        return;
      case "target-toggle": {
        const s = this.#actionState;
        if (!s) return;
        const uuid = el.dataset.uuid;
        if (s.selected.has(uuid)) s.selected.delete(uuid);
        else if (s.selected.size < s.maxTargets) s.selected.add(uuid);
        else if (s.maxTargets === 1) { s.selected.clear(); s.selected.add(uuid); } // single-target: tap to swap
        this.#pushPreview(); // B9: commit the target to the canvas/TV on tap
        return this.render();
      }
      case "fire":
        return this.#fireAction();
      case "check":
        return actor?.rollAbilityCheck({ ability: el.dataset.ability });
      case "save":
        return actor?.rollSavingThrow({ ability: el.dataset.ability });
      case "skill":
        return actor?.rollSkill({ skill: el.dataset.skill });
      case "edit-hp":
        this.#editingField = "hp"; return this.render();
      case "edit-temp":
        this.#editingField = "temp"; return this.render();
      case "toggle-insp":
        return this.#toggleInspiration();
      case "move":
        return this.#move(Number(el.dataset.dx), Number(el.dataset.dy));
      case "end-turn":
        return this.#endTurn();
    }
  };

  // B7: commit a tapped HP/temp edit — absolute ("22") or relative ("+3"/"-10").
  // Guarded by #editingField so the Enter-keydown and the blur-change don't both
  // apply (which would double a relative delta).
  async #commitStat(field, raw) {
    if (this.#editingField !== field) return;
    this.#editingField = null;
    const actor = this.actor;
    const hp = actor?.system.attributes?.hp;
    raw = String(raw ?? "").trim();
    if (!actor || !hp || !raw) return this.render();
    const rel = /^[+-]/.test(raw);
    const n = Number(raw);
    if (Number.isNaN(n)) return this.render();
    if (field === "hp") {
      const next = Math.max(0, Math.min(hp.max ?? Infinity, rel ? hp.value + n : n));
      await actor.update({ "system.attributes.hp.value": next });
    } else {
      const cur = hp.temp || 0;
      await actor.update({ "system.attributes.hp.temp": Math.max(0, rel ? cur + n : n) });
    }
    this.render(); // ensure the input drops even if the value didn't change
  }

  async #toggleInspiration() {
    const actor = this.actor;
    if (!actor) return;
    await actor.update({ "system.attributes.inspiration": !actor.system.attributes?.inspiration });
  }

  async #move(dx, dy) {
    const note = this.element?.querySelector('[data-role="move-note"]');
    const res = await rpc.moveToken({ tokenId: this.originTokenId, dxGrid: dx, dyGrid: dy });
    if (note) note.textContent = res?.ok ? "" : (res?.reason ?? "can't move there");
  }

  async #endTurn() {
    const res = await rpc.endTurn({});
    if (res && !res.ok) ui.notifications.warn(`End turn: ${res.reason ?? "failed"}`);
  }

  #attachListeners(root) {
    root.removeEventListener("click", this.#onClick);
    root.addEventListener("click", this.#onClick);
    root.removeEventListener("change", this.#onChange);
    root.addEventListener("change", this.#onChange);
    root.removeEventListener("keydown", this.#onKeydown);
    root.addEventListener("keydown", this.#onKeydown);
  }

  // Commit a stat input on blur/Enter; cancel on Escape.
  #onChange = (ev) => {
    if (ev.target.matches?.(".mc-stat-input")) this.#commitStat(ev.target.dataset.field, ev.target.value);
  };
  #onKeydown = (ev) => {
    if (!ev.target.matches?.(".mc-stat-input")) return;
    if (ev.key === "Enter") { ev.preventDefault(); this.#commitStat(ev.target.dataset.field, ev.target.value); }
    else if (ev.key === "Escape") { this.#editingField = null; this.render(); }
  };

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
    this.#abandonAction(); // cancel any held workflow if the shell closes mid-flow
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
  // Turn HUD: re-render on combat turn/round changes and combat start/stop.
  const onCombat = () => { if (shellInstance?.rendered) shellInstance.render(); };
  Hooks.on("updateCombat", onCombat);
  Hooks.on("deleteCombat", onCombat);
  Hooks.on("combatStart", onCombat);
}
