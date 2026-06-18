import { MODULE_ID } from "./preset.js";
import { api as rpc } from "./rpc.js";

// Phase 2 — Controller Shell + read-only Touch Sheet.
// Full-screen frameless takeover for phone-role clients. Rolls use the dnd5e
// document-level methods (rollAbilityCheck/rollSavingThrow/rollSkill), which
// render their dialog locally and work on a no-canvas client (Spike 3, Test 0).
// HP editing, inventory, spell prep, item use (Route B) come in later phases.

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const ROLL_HISTORY_MAX = 6;   // recent-rolls strip cap (newest-first)
const ROLL_TOAST_MS = 4500;   // transient roll toast lifetime (ms)

export function isPhoneClient() {
  const role = game.settings.get(MODULE_ID, "role");
  return role === "phone" || (role === "auto" && !game.user.isGM);
}

// The shared table display (TV): a canvas client with no shell. It still needs
// third-party combat HUDs suppressed so the map view stays clean (those HUDs are
// player-action helpers meant for phones, not a passive display).
export function isDisplayClient() {
  return game.settings.get(MODULE_ID, "role") === "display";
}

// Third-party combat HUDs (Argon / Enhanced Combat HUD / Action Pack /
// combat-guidance) that compete with the shell on phones and clutter the TV.
const COMBAT_HUD_RE = /argon|enhancedcombat|combat-?hud|action-?pack|combat-guidance/;

/** Hide + close a third-party combat HUD app. Returns true if it matched. */
function killCombatHUD(app) {
  const el = app?.element;
  if (!(el instanceof HTMLElement)) return false;
  const ident = `${app.constructor?.name ?? ""} ${app.id ?? ""} ${typeof el.className === "string" ? el.className : ""}`.toLowerCase();
  if (!COMBAT_HUD_RE.test(ident)) return false;
  el.style.display = "none"; // hide instantly so it doesn't flash before closing
  setTimeout(() => { try { app.close(); } catch (e) { /* best effort */ } }, 0);
  return true;
}

function signed(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// dnd5e-style use/slot indicator: gold dots, filled = remaining, hollow = spent.
// Falls back to value/max text above 8 (too many dots to read).
function pips(value, max) {
  if (!(max > 0)) return "";
  const v = Math.max(0, Math.min(value ?? 0, max));
  if (max > 8) return `<span class="mc-pips-num ${v === 0 ? "mc-spent" : ""}">${v}/${max}</span>`;
  let dots = "";
  for (let i = 0; i < max; i++) dots += `<span class="mc-pip ${i < v ? "mc-on" : ""}"></span>`;
  return `<span class="mc-pips">${dots}</span>`;
}

// Proficiency dot class from the dnd5e multiplier (0 / 0.5 / 1 / 2).
function profClassFor(v) {
  if (v >= 2) return "2";       // expertise — full + ring
  if (v >= 1) return "1";       // proficient — full
  if (v >= 0.5) return "half";  // half proficiency
  return "0";                    // not proficient — empty
}

// Resolve a trait key (mar/lgt/etc.) to its full label via CONFIG.DND5E.
function findInTree(tree, key) {
  for (const [k, v] of Object.entries(tree ?? {})) {
    if (k === key) return typeof v === "string" ? v : (v?.label ?? key);
    if (v && typeof v === "object" && v.children) {
      const r = findInTree(v.children, key);
      if (r) return r;
    }
  }
  return null;
}
function traitLabel(key, trait) {
  const C = CONFIG.DND5E ?? {};
  if (trait === "weaponProf") return C.weaponProficiencies?.[key] ?? key;
  if (trait === "armorProf") return C.armorProficiencies?.[key] ?? key;
  if (trait === "languages") return findInTree(C.languages, key) ?? key;
  if (trait === "tools") {
    const id = C.tools?.[key]?.id;
    const fromPack = id ? fromUuidSync(id)?.name : null;          // "Mason's Tools"
    return fromPack ?? findInTree(C.toolProficiencies, key) ?? (key.titleCase?.() ?? key);
  }
  return key;
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
  #favEditing = false;  // Actions tab: bookmark-toggle mode (add/remove favorites)
  #condEditing = false; // header: condition palette (add/remove) open
  #showLevels = false;  // header: class/level/XP panel (Lvl button) open
  #imagePopup = null;   // full-screen image popup: null | "profile" | "token"
  #assignedTargets = []; // §11: token uuids the DM assigned to this player
  #assignedBy = null;    // DM/user name who assigned them (for the picker banner)
  #subjectId = null;     // §7.1 token switcher: active-scene token id the shell controls
  #savePrompt = null;    // §7.4/§7.6 incoming save request relayed from the executor
  #savePromptTimer = null;
  #deathSaveDismissed = false; // X'd the death-save panel (DM's call overrides; warnings-not-walls)
  #openContainers = new Set(); // Equipment tab: container item ids currently expanded
  #itemPickerId = null; // Equipment tab: item whose multi-activity picker is open
  #detailCard = null;   // long-press: { name, img, subtitle, desc } of an item shown full-screen
  #longPressTimer = null;
  #lpStart = null;      // pointer start position, to abort the press on scroll
  #suppressClick = false; // a long-press fired → swallow the trailing click so the row doesn't also act
  #collapsedActionGroups = new Set(); // Actions tab: accordion groups the user/use closed

  /** The actor this phone controls: assigned character, else first owned character. */
  get actor() {
    // Token switcher (§7.1): if a subject token is selected and still owned, the
    // shell controls its actor (covers summons/familiars/wild shape, incl. unlinked).
    if (this.#subjectId) {
      const tok = game.scenes?.active?.tokens.get(this.#subjectId);
      if (tok?.actor?.isOwner) return tok.actor;
    }
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
    // Total character level (multiclass = sum of class levels). Full class/
    // subclass breakdown + XP bar move into the long-press name tooltip later.
    const totalLevel = sys.details?.level
      || actor.items.filter(i => i.type === "class").reduce((n, c) => n + (c.system.levels || 0), 0);

    // Include toggled conditions (status effects, which often carry NO duration
    // — temporaryEffects alone misses them, so the chip read "No active
    // conditions" even with conditions set) alongside temporary effects (Bless).
    const effects = (actor.effects ?? []).filter(e =>
      e.active && e.name && (e.isTemporary || e.statuses?.size > 0));
    // DM request (2026-06-18): surface the action-economy "used" conditions as
    // chips. midi ships visible effects for "Bonus Action used" / "Reaction used"
    // (we no longer exclude them) and styles them as spent (mc-chip-used). The main
    // Action has no status effect — only the per-turn flag — so synthesize an
    // "Action used" chip from it, in combat where the economy applies.
    const isEconEffect = (e) => e.changes?.some?.(c => c.key?.startsWith("flags.midi-qol.actions"));
    const econ = this.#actionEconomy(actor);
    const actionChip = (econ.inCombat && !econ.action) ? `<span class="mc-chip mc-chip-used">Action used</span>` : "";
    const condsHTML = effects.map(e =>
      `<span class="mc-chip${isEconEffect(e) ? " mc-chip-used" : ""}">${e.img ? `<img class="mc-chip-icon" src="${e.img}" alt="">` : ""}${foundry.utils.escapeHTML(e.name)}</span>`
    ).join("");
    const condHTML = (actionChip + condsHTML) || `<span class="mc-chip mc-none">No active conditions</span>`;

    // B7: HP & temp are tap-to-edit. Tapping opens a roomy editor row with
    // on-screen − / + / Set so it works on the iOS numeric keypad (which has no
    // +/− or reliable return key) — not only an absolute fill.
    // Whole stat (label + number) is the tap target, not just the digit — temp
    // is usually 0 and far too small to hit on touch (DM 2026-06-17).
    const hpBtn = `<button class="mc-stat mc-stat-tap ${this.#editingField === "hp" ? "mc-editing" : ""}" data-action="edit-hp">
      <span class="mc-stat-label">HP</span>
      <span class="mc-stat-val mc-hp-cur ${hpClass}">${hp.value ?? "—"}</span>
      <span class="mc-stat-sub">/${hp.max ?? "—"}</span>
    </button>`;
    const tempBtn = `<button class="mc-stat mc-stat-tap ${this.#editingField === "temp" ? "mc-editing" : ""}" data-action="edit-temp">
      <span class="mc-stat-label">Temp</span>
      <span class="mc-stat-val mc-temp-val ${hp.temp ? "" : "mc-zero"}">${hp.temp || 0}</span>
    </button>`;

    return `
      <header class="mc-header">
        <img class="mc-portrait" src="${img}" alt="" data-action="show-image">
        <div class="mc-id">
          <div class="mc-name">${totalLevel ? `<button class="mc-name-lvl ${this.#showLevels ? "mc-on" : ""}" data-action="toggle-levels">Lvl ${totalLevel}</button>` : ""}<span class="mc-name-text">${foundry.utils.escapeHTML(actor.name)}</span></div>
          <div class="mc-stats">
            ${hpBtn}${tempBtn}
            <span class="mc-stat mc-stat-acwrap"><span class="mc-ac-frame" title="Armor Class"><i class="fas fa-shield"></i>${ac}</span></span>
            <button class="mc-insp ${insp ? "mc-insp-on" : ""}" data-action="toggle-insp" title="Inspiration">★</button>
          </div>
        </div>
      </header>
      ${this.#showLevels ? this.#levelsHTML(actor) : ""}
      ${this.#statEditorHTML(hp)}
      <div class="mc-conditions">${condHTML}
        <button class="mc-cond-manage ${this.#condEditing ? "mc-on" : ""}" data-action="cond-edit" aria-label="Manage conditions" title="Add or remove conditions"><i class="fas fa-plus"></i></button>
      </div>
      ${this.#condEditing ? this.#conditionPaletteHTML(actor) : ""}
      ${this.#atZeroHP(actor) && this.#deathSaveDismissed
        ? `<button class="mc-death-reopen" data-action="death-reopen"><i class="fas fa-skull"></i> At 0 HP — death saves</button>` : ""}
      <main class="mc-content">${this.#tabContent(actor)}</main>
      ${this.#rollStripHTML()}
      ${this.#turnHudHTML()}
      <nav class="mc-tabs">
        ${this.#tabButton("actions", "fa-hand-fist", "Actions")}
        ${this.#tabButton("details", "fa-user", "Details")}
        ${this.#tabButton("sheet", "fa-compass", "Explore")}
        ${this.#tabButton("spells", "fa-wand-sparkles", "Spells")}
        ${this.#tabButton("equipment", "fa-suitcase", "Equipment")}
        ${this.#tabButton("journal", "fa-feather", "Journal")}
      </nav>
      ${this.#imagePopupHTML(actor)}
      ${this.#savePromptHTML()}`;
  }

  // Save/reaction prompt (§7.4/§7.6): a persistent, tappable cue when the
  // executor relays a midi save request to this player (the whispered chat card
  // is hidden behind the shell). Tapping rolls the save the normal way
  // (actor.rollSavingThrow → the native dialog, Restyled), which midi intercepts.
  #savePromptHTML() {
    const s = this.#savePrompt;
    if (!s) return "";
    const abilLabel = (a) => CONFIG.DND5E?.abilities?.[a]?.label ?? a.toUpperCase();
    const dc = s.dc != null ? ` DC ${s.dc}` : "";
    const tag = s.advantage && !s.disadvantage ? " · advantage"
      : (!s.advantage && s.disadvantage ? " · disadvantage" : "");
    const title = s.isConcentration ? "Concentration check" : "Saving throw";
    const btns = (s.abilities ?? []).map(a =>
      `<button class="mc-save-roll" data-action="save-prompt-roll" data-ability="${a}">Roll ${abilLabel(a)}${dc}</button>`).join("");
    // Bottom-sheet styled to match the Prompt Restyler's native dialogs
    // (.mc-phone-dialog): header bar with title + X, then content.
    return `<div class="mc-saveprompt">
      <div class="mc-saveprompt-bar">
        <span class="mc-saveprompt-title">${title}</span>
        <button class="mc-saveprompt-x" data-action="save-prompt-dismiss" aria-label="Close"><i class="fas fa-xmark"></i></button>
      </div>
      <div class="mc-saveprompt-body">
        <div class="mc-saveprompt-sub">${foundry.utils.escapeHTML(s.spellName || title)}${tag}</div>
        <div class="mc-saveprompt-btns">${btns}</div>
      </div>
    </div>`;
  }

  // Full-screen image popup (tap the portrait): toggles between the actor's
  // portrait and its token art. Closable with the X.
  #imagePopupHTML(actor) {
    if (!this.#imagePopup) return "";
    const profile = actor.img || "icons/svg/mystery-man.svg";
    const token = actor.prototypeToken?.texture?.src || profile;
    const src = this.#imagePopup === "token" ? token : profile;
    const tab = (which, label) =>
      `<button class="mc-imgpop-tab ${this.#imagePopup === which ? "mc-on" : ""}" data-action="img-show" data-which="${which}">${label}</button>`;
    return `<div class="mc-imgpop">
      <button class="mc-imgpop-x" data-action="img-close" aria-label="Close"><i class="fas fa-xmark"></i></button>
      <img class="mc-imgpop-img" src="${src}" alt="">
      <div class="mc-imgpop-toggle">${tab("profile", "Portrait")}${tab("token", "Token")}</div>
    </div>`;
  }

  #tabButton(id, icon, label) {
    return `<button class="mc-tab ${this.#tab === id ? "mc-active" : ""}" data-action="tab" data-tab="${id}" title="${label}" aria-label="${label}"><i class="fas ${icon}"></i></button>`;
  }

  #tabContent(actor) {
    if (!this.#atZeroHP(actor)) this.#deathSaveDismissed = false; // back above 0 → re-arm for next time
    // §7.4: collapse to death saves at 0 HP — unless the player X'd it (the DM
    // may rule otherwise; warnings-not-walls). A reopen chip (#buildHTML) brings
    // it back while still down.
    if (this.#atZeroHP(actor) && !this.#deathSaveDismissed) return this.#deathSaveHTML(actor);
    // An in-progress action/cast overlays the current tab — so casting from the
    // Spells tab (or using a favorite from Explore) stays put instead of jumping.
    if (this.#detailCard) return this.#detailCardHTML();
    if (this.#actionState) return this.#targetPickerHTML();
    if (this.#itemPickerId) return this.#itemActivityPickerHTML(actor);
    if (this.#tab === "actions") return this.#actionsHTML(actor);
    if (this.#tab === "details") return this.#detailsHTML(actor);
    if (this.#tab === "spells") return this.#spellsHTML(actor);
    if (this.#tab === "equipment") return this.#equipmentHTML(actor);
    if (this.#tab === "journal") {
      return `<div class="mc-placeholder">The shared journal composer arrives in Phase 4.</div>`;
    }
    return this.#exploreHTML(actor); // "Explore" tab: move pad + the sheet
  }

  // At 0 HP a player character can only make death saves — the content area
  // collapses to the death-save panel regardless of the selected tab (§7.4).
  #atZeroHP(actor) {
    return actor?.type === "character" && (actor.system.attributes?.hp?.value ?? 1) <= 0;
  }

  // Death saves (§7.4): 3 success / 3 failure pips + a big Roll button.
  // actor.rollDeathSave() is document-level (no canvas); dnd5e tallies the
  // result, stabilizes at 3 successes, and a nat 20 restores 1 HP — the
  // updateActor hook re-renders this panel as the state changes.
  #deathSaveHTML(actor) {
    const d = actor.system.attributes?.death ?? {};
    const succ = d.success ?? 0;
    const fail = d.failure ?? 0;
    const pips = (count) => Array.from({ length: 3 }, (_, i) =>
      `<span class="mc-death-pip ${i < count ? "mc-on" : ""}"></span>`).join("");
    const stable = succ >= 3;
    const dead = fail >= 3;
    const footer = dead
      ? `<div class="mc-death-status mc-dead">Dead</div>`
      : stable
        ? `<div class="mc-death-status mc-stable">Stabilized</div>`
        : `<button class="mc-death-roll" data-action="death-save">Roll Death Save</button>`;
    return `<div class="mc-death">
      <button class="mc-death-x" data-action="death-dismiss" aria-label="Close" title="Close (DM's call)"><i class="fas fa-xmark"></i></button>
      <div class="mc-section-label">Death Saves</div>
      <div class="mc-death-pips">
        <div class="mc-death-group mc-death-success">
          <span class="mc-death-grouplabel">Successes</span>
          <span class="mc-death-row">${pips(succ)}</span>
        </div>
        <div class="mc-death-group mc-death-failure">
          <span class="mc-death-grouplabel">Failures</span>
          <span class="mc-death-row">${pips(fail)}</span>
        </div>
      </div>
      ${footer}
    </div>`;
  }

  // Explore tab = a token switcher (when the user owns >1 token), a movement row
  // (Init/Hit Dice · D-pad · Speed/Prof), the favorites container, the ability
  // roll grid, and rest buttons.
  #exploreHTML(actor) {
    return this.#tokenSwitcherHTML() + this.#moveRowHTML(actor) + this.#favoritesHTML(actor)
      + this.#abilitiesHTML(actor) + this.#restsHTML();
  }

  // Active-scene tokens the user owns (PC + summons/familiars/wild shape).
  #ownedTokens() {
    return (game.scenes?.active?.tokens ?? []).filter(t => t.actor?.isOwner);
  }

  // §7.1 token switcher: Prev/Next to change the controlled token. Only shown
  // when the user owns more than one token on the active scene. "Follow leader"
  // (familiars trailing the PC) is a later-version item — likely an existing mod.
  #tokenSwitcherHTML() {
    const toks = this.#ownedTokens();
    if (toks.length < 2) return "";
    // Label by the *actor* (sheet) name + position (i/n): the actor name is the
    // one players recognize (DM 2026-06-16), and the position counter still makes
    // a switch obvious even when two tokens share an actor or look alike.
    let i = toks.findIndex(t => t.id === this.originTokenId);
    if (i < 0) i = 0;
    const label = toks[i]?.actor?.name ?? this.actor?.name ?? "—";
    return `<div class="mc-tokensw">
      <button class="mc-tokensw-btn" data-action="token-prev" aria-label="Previous token"><i class="fas fa-chevron-left"></i></button>
      <span class="mc-tokensw-name">${foundry.utils.escapeHTML(label)} <span class="mc-tokensw-count">${i + 1}/${toks.length}</span></span>
      <button class="mc-tokensw-btn" data-action="token-next" aria-label="Next token"><i class="fas fa-chevron-right"></i></button>
    </div>`;
  }

  #cycleSubject(dir) {
    const toks = this.#ownedTokens();
    if (toks.length < 2) return;
    let i = toks.findIndex(t => t.id === this.originTokenId);
    if (i < 0) i = 0;
    this.#subjectId = toks[(i + dir + toks.length) % toks.length].id;
    this.#abandonAction(); // leave any open picker clean when switching subject
    this.render();
  }

  // Movement row: Init / Hit Dice (tappable) flank the D-pad on the left,
  // Speed / Prof (read-only) on the right. All four cells are equal height so
  // the columns line up regardless of the drop shadow on the tappable ones.
  #moveRowHTML(actor) {
    const a = actor.system.attributes ?? {};
    const init = a.init?.total ?? a.init?.mod;
    const initStr = init == null ? "—" : signed(init);
    const hd = a.hd?.value;
    const hdStr = hd == null ? "—" : (a.hd?.max != null ? `${hd}/${a.hd.max}` : `${hd}`);
    const move = a.movement ?? {};
    const speed = move.walk != null ? `${move.walk}` : "—";
    const prof = a.prof != null ? signed(a.prof) : "—";
    const estat = (cls, action, label, val) => {
      const tag = action ? "button" : "div";
      const attr = action ? ` data-action="${action}"` : "";
      return `<${tag} class="mc-estat ${cls}"${attr}>
        <span class="mc-estat-label">${label}</span><span class="mc-estat-val">${val}</span></${tag}>`;
    };
    return `<div class="mc-move-row">
      <div class="mc-estat-col">
        ${estat("mc-tappable", "roll-init", "Init", initStr)}
        ${estat("mc-tappable", "roll-hd", "Hit Dice", hdStr)}
      </div>
      <div class="mc-dpad-wrap">${this.#moveHTML()}</div>
      <div class="mc-estat-col">
        ${estat("mc-gray", "", "Speed", speed)}
        ${estat("mc-gray", "", "Prof", prof)}
      </div>
    </div>`;
  }

  // Favorites container (§7.2): the actor's dnd5e system.favorites, resolved for
  // display and tappable by type — activities/items open the Actions picker,
  // skills/tools roll natively. Curate from the Actions bookmark toggle (or a
  // laptop). Grows downward as favorites are added.
  #favoritesHTML(actor) {
    const favs = [...(actor.system.favorites ?? [])].sort((x, y) => (x.sort ?? 0) - (y.sort ?? 0));
    const econ = this.#actionEconomy(actor);
    const rows = favs.map(f => this.#favoriteRow(actor, f, econ)).filter(Boolean).join("");
    const body = rows || `<div class="mc-fav-empty">No favorites yet — tap the bookmark in Actions to pin one.</div>`;
    return `<div class="mc-section-label">Favorites</div>
      <div class="mc-favorites">${body}</div>`;
  }

  #favoriteRow(actor, fav, econ) {
    const { id, type } = fav;
    if (type === "skill") {
      const cfg = CONFIG.DND5E.skills[id] ?? {};
      const mod = actor.system.skills?.[id]?.total;
      return this.#favRowHTML({ img: cfg.icon, icon: "fa-dice-d20", name: cfg.label ?? id,
        val: mod == null ? "" : signed(mod), action: "skill", data: `data-skill="${id}"` });
    }
    if (type === "tool") {
      const mod = actor.system.tools?.[id]?.total;
      return this.#favRowHTML({ icon: "fa-screwdriver-wrench", name: traitLabel(id, "tools"),
        val: mod == null ? "" : signed(mod), action: "tool", data: `data-tool="${id}"` });
    }
    if (type === "slots") return ""; // slot trackers aren't actionable on the phone
    const doc = fromUuidSync(id, { relative: actor });
    if (!doc) return "";
    if (type === "effect") {
      return this.#favRowHTML({ img: doc.img, name: doc.name, action: "", data: "" });
    }
    // item or activity → route into the Actions target picker.
    const activity = type === "activity" ? doc : [...(doc.system?.activities ?? [])][0];
    // Prefer the parent item's art for activities — activity.img is midi's
    // generic action icon, not the weapon/spell icon the player recognizes.
    const img = (type === "activity" ? (doc.item?.img || doc.img) : doc.img) || "icons/svg/upgrade.svg";
    const name = type === "activity" ? (doc.item?.name ?? doc.name) : doc.name;
    const cost = this.#costBadge(activity, econ);
    const uses = this.#usesBadge(type === "activity" ? doc.item : doc); // X/Y, like Equipment
    return activity?.uuid
      ? this.#favRowHTML({ img, name, cost, uses, action: "fav-act", data: `data-uuid="${activity.uuid}"` })
      : this.#favRowHTML({ img, name, cost, uses, action: "", data: "" });
  }

  #favRowHTML({ img, icon, name, val = "", cost = null, uses = "", action, data }) {
    const tag = action ? "button" : "div";
    const attrs = action ? ` data-action="${action}" ${data}` : "";
    const media = img
      ? `<img class="mc-fav-icon" src="${img}" alt="">`
      : `<span class="mc-fav-glyph"><i class="fas ${icon}"></i></span>`;
    // Right edge: item uses (X/Y, same as the Equipment row), then an action-economy
    // cost badge for activities, else the ability modifier — so a favorited thing
    // carries the same info as its native tab (DM 2026-06-18).
    const costOrVal = cost
      ? `<span class="mc-fav-cost mc-econ-${cost.type} ${cost.on ? "mc-on" : "mc-off"}">${cost.label}</span>`
      : val ? `<span class="mc-fav-val">${val}</span>` : "";
    const right = `${uses}${costOrVal}`;
    return `<${tag} class="mc-fav"${attrs}>
      ${media}
      <span class="mc-fav-name">${foundry.utils.escapeHTML(name)}</span>
      ${right}
    </${tag}>`;
  }

  #restsHTML() {
    return `<div class="mc-rests">
      <button class="mc-rest" data-action="short-rest"><i class="fas fa-mug-hot"></i> Short Rest</button>
      <button class="mc-rest" data-action="long-rest"><i class="fas fa-campground"></i> Long Rest</button>
    </div>`;
  }

  // Spells tab: slot counters, a prepared count, and the spellbook grouped by
  // level with prepared toggles. Casting routes a spell's first activity into
  // the Actions picker (Route B); slot-level upcast selection is a later add
  // (§7.5 pre-roll). Backed entirely by document data — no canvas.
  #spellsHTML(actor) {
    const spellItems = actor.items.filter(i => i.type === "spell");
    const spells = actor.system.spells ?? {};
    const hasSlots = Object.values(spells).some(s => (s?.max ?? 0) > 0);
    if (!spellItems.length && !hasSlots) {
      return `<div class="mc-placeholder">No spellcasting.</div>`;
    }
    const slotChip = (label, value, max) =>
      `<span class="mc-slot">
        <span class="mc-slot-label">${label}</span>
        ${pips(value, max)}</span>`;
    const chips = [];
    for (let lvl = 1; lvl <= 9; lvl++) {
      const s = spells[`spell${lvl}`];
      if ((s?.max ?? 0) > 0) chips.push(slotChip(ordinal(lvl), s.value, s.max));
    }
    if ((spells.pact?.max ?? 0) > 0) {
      chips.push(slotChip(`Pact ${ordinal(spells.pact.level ?? 1)}`, spells.pact.value, spells.pact.max));
    }
    const slotsRow = chips.length ? `<div class="mc-slots">${chips.join("")}</div>` : "";

    const cards = this.#spellcastingCardsHTML(actor);

    const byLevel = new Map();
    for (const sp of spellItems) {
      const lvl = sp.system.level ?? 0;
      if (!byLevel.has(lvl)) byLevel.set(lvl, []);
      byLevel.get(lvl).push(sp);
    }
    const sections = [...byLevel.keys()].sort((a, b) => a - b).map(lvl => {
      const rows = byLevel.get(lvl).sort((a, b) => a.name.localeCompare(b.name))
        .map(sp => this.#spellRowHTML(sp)).join("");
      const label = lvl === 0 ? "Cantrips" : `${ordinal(lvl)} level`;
      const slot = spells[`spell${lvl}`];
      const headPips = (lvl >= 1 && (slot?.max ?? 0) > 0) ? pips(slot.value, slot.max) : "";
      return `<div class="mc-actions-sub mc-spell-sub">${label}${headPips}</div><div class="mc-spells">${rows}</div>`;
    }).join("");

    return `<div class="mc-actions-head"><span class="mc-section-label">Spells</span></div>
      ${cards}${slotsRow}${sections}`;
  }

  // Per-class spellcasting cards (ability mod · spell attack · save DC · prepared
  // x/y), like the dnd5e sheet. Sourced from actor.spellcastingClasses, whose
  // computed spellcasting.{ability,attack,save,preparation} cover multiclass and
  // homebrew casters (e.g. "Bender") for free.
  #spellcastingCardsHTML(actor) {
    const classes = Object.values(actor.spellcastingClasses ?? {});
    if (!classes.length) return "";
    const stat = (label, val, extra = "") =>
      `<div class="mc-sc-stat"><span class="mc-sc-label">${label}</span><span class="mc-sc-val ${extra}">${val}</span></div>`;
    const primaryAbil = actor.system.attributes?.spellcasting; // the actor-level primary caster ability
    const cards = classes.map(cls => {
      const sc = cls.spellcasting ?? cls.system?.spellcasting ?? {};
      const abilMod = actor.system.abilities?.[sc.ability]?.mod;
      const prep = sc.preparation ?? {};
      const over = (prep.value ?? 0) > (prep.max ?? 0);
      const isPrimary = !!sc.ability && sc.ability === primaryAbil;
      // The whole header row is the tap target for "set primary caster" — the
      // old wand button alone was too small for touch (DM 2026-06-18). A <div>
      // (clicks via delegation) dodges the iOS Safari <button> flex-centering bug.
      return `<div class="mc-sc-card ${isPrimary ? "mc-primary" : ""}">
        <div class="mc-sc-head" data-action="set-primary" data-ability="${sc.ability}" role="button" aria-label="Set ${foundry.utils.escapeHTML(cls.name)} as primary caster">
          <i class="fas fa-wand-sparkles mc-sc-wand"></i>
          <span class="mc-sc-name">${foundry.utils.escapeHTML(cls.name)}</span>
          ${isPrimary ? `<span class="mc-sc-primary">Primary</span>` : `<span class="mc-sc-setp">Set primary</span>`}
        </div>
        <div class="mc-sc-stats">
          ${stat("Ability", abilMod == null ? "—" : signed(abilMod))}
          ${stat("Attack", sc.attack == null ? "—" : signed(sc.attack))}
          ${stat("Spell DC", sc.save ?? "—")}
          ${stat("Prepared", `${prep.value ?? 0}/${prep.max ?? 0}`, over ? "mc-over" : "")}
        </div>
      </div>`;
    }).join("");
    return `<div class="mc-sc-cards">${cards}</div>`;
  }

  #spellRowHTML(sp) {
    const prep = sp.system.preparation ?? {};
    const canPrepare = prep.mode === "prepared" && sp.system.level > 0; // cantrips are always prepared
    const isPrepared = !!prep.prepared;
    const activity = [...(sp.system.activities ?? [])][0];
    const img = sp.img || "icons/svg/daze.svg";
    const open = activity?.uuid
      ? `<button class="mc-spell-main" data-action="fav-act" data-uuid="${activity.uuid}">`
      : `<div class="mc-spell-main">`;
    const close = activity?.uuid ? `</button>` : `</div>`;
    const prepBtn = canPrepare
      ? `<button class="mc-spell-prep ${isPrepared ? "mc-on" : ""}" data-action="toggle-prep" data-item-id="${sp.id}" aria-label="Toggle prepared"><i class="fas fa-book"></i></button>`
      : "";
    return `<div class="mc-spell ${canPrepare && !isPrepared ? "mc-unprepared" : ""}">
      ${open}
        <img class="mc-spell-icon" src="${img}" alt="">
        <span class="mc-spell-name">${foundry.utils.escapeHTML(sp.name)}</span>
      ${close}
      ${prepBtn}
    </div>`;
  }

  // Equipment tab: the actor's physical inventory, grouped by type, with
  // equip/attune toggles and one-tap use for items that have a usable activity
  // (potions, scrolls, wands). Document-data driven (no canvas); the updateItem
  // hook re-renders on equip/attune/quantity changes. Containers' contents are a
  // later add (§13). Currency is shown read-only for now.
  #equipmentHTML(actor) {
    const physical = actor.items.filter(i => "quantity" in (i.system ?? {}));
    // Only items NOT inside a container show at the top level; contained items
    // render nested under their container (system.container = container id).
    const topLevel = physical.filter(i => !i.system.container);
    const groups = [
      { key: "weapon", label: "Weapons" },
      { key: "equipment", label: "Armor & Gear" }, // distinct from the "Equipment" tab title
      { key: "consumable", label: "Consumables" },
      { key: "tool", label: "Tools" },
      { key: "container", label: "Containers" },
      { key: "loot", label: "Other" }
    ];
    const bucket = { weapon: [], equipment: [], consumable: [], tool: [], container: [], loot: [] };
    for (const i of topLevel) (bucket[i.type] ?? bucket.loot).push(i);
    const currency = this.#currencyHTML(actor);
    const enc = this.#encumbranceHTML(actor);
    if (!physical.length) {
      return `<div class="mc-actions-head"><span class="mc-section-label">Equipment</span></div>
        ${currency}${enc}<div class="mc-placeholder">No items carried.</div>`;
    }
    const sections = groups.filter(g => bucket[g.key].length).map(g => {
      const items = bucket[g.key].sort((a, b) => a.name.localeCompare(b.name));
      return `<div class="mc-actions-sub">${g.label}</div><div class="mc-inv">${this.#inventoryItemsHTML(items)}</div>`;
    }).join("");
    return `<div class="mc-actions-head"><span class="mc-section-label">Equipment</span></div>
      ${currency}${enc}${sections}`;
  }

  // Encumbrance readout — mirrors Foundry exactly: dnd5e renders/applies nothing
  // when the encumbrance variant is "none" (updateEncumbrance returns early,
  // dnd5e.mjs ~39547), so we hide it too. "normal" only flags exceeding the carry
  // maximum; "variant" adds the encumbered (>⅓) / heavily-encumbered (>⅔) tiers.
  // Whether penalties bite is the DM's setting to enable — we just surface what
  // the native sheet shows (DM, 2026-06-18: always copy Foundry's flows).
  #encumbranceHTML(actor) {
    let mode = "none";
    try { mode = game.settings.get("dnd5e", "encumbrance"); } catch (e) { /* setting absent → treat as off */ }
    if (mode === "none") return "";
    const enc = actor.system?.attributes?.encumbrance;
    if (!enc?.max) return "";
    const variant = mode === "variant";
    const th = enc.thresholds ?? {};
    const pct = Math.max(0, Math.min(100, Math.round(enc.pct ?? (enc.value / enc.max) * 100)));
    let tier = "ok";
    if (enc.value > th.maximum) tier = "over";
    else if (variant && enc.value > th.heavilyEncumbered) tier = "heavy";
    else if (variant && enc.value > th.encumbered) tier = "enc";
    const labels = { over: "Over capacity", heavy: "Heavily encumbered", enc: "Encumbered" };
    let unit = "lb";
    try { unit = game.settings.get("dnd5e", "metricWeightUnits") ? "kg" : "lb"; } catch (e) { /* default lb */ }
    const r = (n) => Math.round((n ?? 0) * 10) / 10;
    // Variant marks the two tier boundaries at dnd5e's computed stop positions.
    const stops = variant && enc.stops
      ? `<span class="mc-enc-stop" style="left:${enc.stops.encumbered}%"></span><span class="mc-enc-stop" style="left:${enc.stops.heavilyEncumbered}%"></span>`
      : "";
    const note = tier !== "ok" ? `<span class="mc-enc-tier mc-enc-${tier}">${labels[tier]}</span>` : "";
    return `<div class="mc-enc">
      <div class="mc-enc-head"><span class="mc-enc-label">Weight</span><span class="mc-enc-val">${r(enc.value)} / ${r(enc.max)} ${unit}</span>${note}</div>
      <div class="mc-enc-bar mc-enc-${tier}"><div class="mc-enc-fill" style="width:${pct}%"></div>${stops}</div>
    </div>`;
  }

  // Render rows, expanding any open container in place to show its contents
  // (recurses for nested containers). #openContainers tracks expanded ids.
  #inventoryItemsHTML(items) {
    return items.map(i => {
      let html = this.#inventoryRowHTML(i);
      if (i.type === "container" && this.#openContainers.has(i.id)) {
        const contents = this.actor.items
          .filter(x => x.system.container === i.id)
          .sort((a, b) => a.name.localeCompare(b.name));
        html += `<div class="mc-inv-contents">${contents.length ? this.#inventoryItemsHTML(contents) : `<div class="mc-inv-empty">Empty</div>`}</div>`;
      }
      return html;
    }).join("");
  }

  #currencyHTML(actor) {
    const cur = actor.system?.currency;
    if (!cur) return "";
    const order = Object.keys(CONFIG.DND5E?.currencies ?? { pp: 1, gp: 1, ep: 1, sp: 1, cp: 1 });
    const chips = order.map(k =>
      `<span class="mc-coin mc-coin-${k}"><span class="mc-coin-amt">${cur[k] ?? 0}</span><span class="mc-coin-label">${k}</span></span>`).join("");
    return `<div class="mc-currency">${chips}</div>`;
  }

  #inventoryRowHTML(item) {
    const sys = item.system ?? {};
    const qty = sys.quantity ?? 1;
    const img = item.img || "icons/svg/item-bag.svg";
    const canEquip = "equipped" in sys;
    const canAttune = !!sys.attunement;
    const equipped = !!sys.equipped;
    const attuned = !!sys.attuned;
    const needsAttune = sys.attunement === "required" && !attuned;
    // Two fixed columns on the RIGHT — attune then equip — each always rendered
    // (transparent placeholder when N/A) so the sun column AND the shield column
    // each line up across every row, incl. container headers (DM 2026-06-18).
    const attuneBtn = canAttune
      ? `<button class="mc-inv-toggle ${attuned ? "mc-on" : ""} ${needsAttune ? "mc-warn" : ""}" data-action="attune-toggle" data-item-id="${item.id}" aria-label="Toggle attunement" title="${attuned ? "Attuned" : (needsAttune ? "Requires attunement" : "Not attuned")}"><i class="fas fa-sun"></i></button>`
      : `<span class="mc-inv-toggle mc-ph"></span>`;
    const equipBtn = canEquip
      ? `<button class="mc-inv-toggle ${equipped ? "mc-on" : ""}" data-action="equip-toggle" data-item-id="${item.id}" aria-label="Toggle equipped" title="${equipped ? "Equipped" : "Not equipped"}"><i class="fas fa-shield-halved"></i></button>`
      : `<span class="mc-inv-toggle mc-ph"></span>`;
    const toggles = `<span class="mc-inv-toggles">${attuneBtn}${equipBtn}</span>`;
    // Containers: the main area is an expand toggle (contents count + chevron).
    if (item.type === "container") {
      const opened = this.#openContainers.has(item.id);
      const n = this.actor.items.filter(x => x.system.container === item.id).length;
      return `<div class="mc-inv-row mc-inv-container ${equipped ? "mc-equipped" : ""}">
        <div class="mc-inv-main" data-action="container-toggle" data-item-id="${item.id}">
          <img class="mc-inv-icon" src="${img}" alt="">
          <span class="mc-inv-name">${foundry.utils.escapeHTML(item.name)}<span class="mc-inv-qty">${n} item${n === 1 ? "" : "s"}</span></span>
          <i class="fas fa-chevron-${opened ? "down" : "right"} mc-inv-chev"></i>
        </div>
        ${toggles}
      </div>`;
    }
    // Usable activities (incl. `cast` — e.g. a Staff of Healing's Cure Wounds).
    // One → tap the row to use it directly (potion, scroll, wand…). Many → tap
    // opens an activity picker so a multi-activity item isn't reduced to just its
    // first activity (the Staff used to expose only its quarterstaff attack; DM
    // 2026-06-18, #8). The main is a <div> (not <button>): clicks route via
    // delegation, dodging the iOS Safari flex-centering bug on <button>.
    const usable = this.#itemUsableActivities(item);
    const multi = usable.length > 1;
    // Multi-activity items get a small "+" badge on the icon corner (DM 2026-06-18,
    // replacing the row-edge chevron) — signals "tap for multiple actions".
    const iconHTML = `<span class="mc-inv-icon-wrap"><img class="mc-inv-icon" src="${img}" alt="">${multi ? `<span class="mc-inv-multi" title="Multiple actions"><i class="fas fa-plus"></i></span>` : ""}</span>`;
    const open = multi
      ? `<div class="mc-inv-main" data-action="item-activities" data-item-id="${item.id}">`
      : usable.length === 1
        ? `<div class="mc-inv-main" data-action="action-pick" data-uuid="${usable[0].uuid}">`
        : `<div class="mc-inv-main">`;
    return `<div class="mc-inv-row ${equipped ? "mc-equipped" : ""}">
      ${open}
        ${iconHTML}
        <span class="mc-inv-name">${foundry.utils.escapeHTML(item.name)}${qty > 1 ? `<span class="mc-inv-qty">×${qty}</span>` : ""}</span>
        ${this.#usesBadge(item)}
      </div>
      ${toggles}
    </div>`;
  }

  // Activities of an item that the phone can drive directly — incl. `cast` (an
  // item that casts a linked spell, e.g. the Staff of Healing's heals), which the
  // Actions list intentionally omits to avoid clutter but which belong on the item.
  #itemUsableActivities(item) {
    // Surface EVERY usable activity — NO activity-type allowlist (DM 2026-06-18:
    // global solution, no per-item handling). Items with summon/check/enchant/etc.
    // activities are at least tappable; execution routes through Route B on the
    // executor (a full client) which handles whatever the activity is. Only
    // canUse/automationOnly gate what's offered (dnd5e's own "can this be used").
    return [...(item.system?.activities ?? [])].filter(a =>
      a.canUse !== false && !a.midiProperties?.automationOnly);
  }

  // Multi-activity picker (#8): tap a multi-activity inventory item → choose which
  // activity to use. Selecting one routes through the normal action flow
  // (#pickAction → target picker → Route B), so charge/slot consumption applies.
  #itemActivityPickerHTML(actor) {
    const item = actor?.items.get(this.#itemPickerId);
    if (!item) { this.#itemPickerId = null; return this.#equipmentHTML(actor); }
    const rows = this.#itemUsableActivities(item).map(a => {
      const cost = (a.consumption?.targets ?? []).find(t => t.type === "itemUses")?.value;
      const right = cost ? `<span class="mc-action-right">${cost} use${cost === "1" ? "" : "s"}</span>` : "";
      return `<button class="mc-action" data-action="action-pick" data-uuid="${a.uuid}">
        <img class="mc-action-icon" src="${a.item?.img || item.img}" alt="">
        <span class="mc-action-text">
          <span class="mc-action-name">${foundry.utils.escapeHTML(a.name ?? a.type)}</span>
          <span class="mc-action-sub">${foundry.utils.escapeHTML(item.name)}</span>
        </span>
        ${right}
      </button>`;
    }).join("");
    return `<div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="item-pick-back" aria-label="Back"><i class="fas fa-xmark"></i></button>
        <span class="mc-picker-title">${foundry.utils.escapeHTML(item.name)}</span>
      </div>
      <div class="mc-actions">${rows}</div>`;
  }

  // Details tab: read-only character info. Tooltips / long-press detail cards
  // are a later refinement (logged); proficiency/language labels are best-effort
  // raw keys for now.
  #detailsHTML(actor) {
    const sys = actor.system;
    const names = (t) => actor.items.filter(i => i.type === t).map(i => i.name);
    const race = [...names("race"), ...names("species")];

    // Full skills list (same model as the dnd5e sheet): proficiency dot
    // (empty/half/full/full-with-ring), governing ability (3-letter), the roll
    // bonus, and the native roll flow on tap (rollSkill).
    const skills = sys.skills ?? {};
    const skillRows = Object.keys(CONFIG.DND5E.skills ?? {}).map(key => {
      const sk = skills[key] ?? {};
      const label = CONFIG.DND5E.skills[key]?.label ?? key;
      const abil = (sk.ability ?? CONFIG.DND5E.skills[key]?.ability ?? "").toUpperCase();
      const total = sk.total;
      return `<button class="mc-skillrow" data-action="skill" data-skill="${key}">
        <span class="mc-prof mc-prof-${profClassFor(sk.value ?? sk.proficient ?? 0)}"></span>
        <span class="mc-skillrow-name">${foundry.utils.escapeHTML(label)}</span>
        <span class="mc-skillrow-abbr">${abil}</span>
        <span class="mc-skillrow-mod">${total == null ? "—" : signed(total)}</span>
      </button>`;
    }).join("");

    // Proficiencies, resolved to full labels (not "mar"/"lgt").
    const traitLabels = (path, trait) => {
      const t = foundry.utils.getProperty(sys, path) ?? {};
      const vals = Array.from(t.value ?? []).map(k => traitLabel(k, trait));
      if (t.custom) vals.push(...String(t.custom).split(";").map(s => s.trim()).filter(Boolean));
      return vals;
    };
    // Damage resistances / vulnerabilities / immunities (system.traits.dr/dv/di).
    const dmgTraits = (path) => {
      const t = foundry.utils.getProperty(sys, path) ?? {};
      const vals = Array.from(t.value ?? []).map(k => CONFIG.DND5E.damageTypes[k]?.label ?? k);
      if (t.custom) vals.push(...String(t.custom).split(";").map(s => s.trim()).filter(Boolean));
      return vals;
    };
    // Tools — same row style as skills (prof dot, ability, bonus), tappable to
    // roll a tool check (rollToolCheck). Shown under the skills, own header.
    const toolRows = Object.keys(sys.tools ?? {}).map(key => {
      const tl = sys.tools[key] ?? {};
      const abil = (tl.ability ?? CONFIG.DND5E.tools?.[key]?.ability ?? "").toUpperCase();
      return `<button class="mc-skillrow" data-action="tool" data-tool="${key}">
        <span class="mc-prof mc-prof-${profClassFor(tl.value ?? 0)}"></span>
        <span class="mc-skillrow-name">${foundry.utils.escapeHTML(traitLabel(key, "tools"))}</span>
        <span class="mc-skillrow-abbr">${abil}</span>
        <span class="mc-skillrow-mod">${tl.total == null ? "—" : signed(tl.total)}</span>
      </button>`;
    }).join("");
    const toolsBlock = toolRows
      ? `<div class="mc-section-label">Tools</div><div class="mc-skillrows">${toolRows}</div>`
      : "";
    const senses = sys.attributes?.senses ?? {};
    const sr = senses.ranges ?? senses;
    const senseList = ["darkvision", "blindsight", "tremorsense", "truesight"]
      .filter(k => Number(sr?.[k]) > 0).map(k => `${k.titleCase?.() ?? k} ${sr[k]} ft`);

    const row = (k, v) => (v && v.length)
      ? `<div class="mc-detail-row"><span class="mc-detail-key">${k}</span><span class="mc-detail-val">${foundry.utils.escapeHTML(v.join(", "))}</span></div>`
      : "";
    const feats = actor.items.filter(i => i.type === "feat").map(i => i.name);
    const featChips = feats.length
      ? `<div class="mc-section-label">Feats &amp; Features</div><div class="mc-feat-chips">${feats.map(f => `<span class="mc-feat-chip">${foundry.utils.escapeHTML(f)}</span>`).join("")}</div>`
      : "";
    // Resistances / vulnerabilities / immunities as colour-coded chips (green =
    // resist, filled green = immune, red = vulnerable) — colour replaces labels.
    const defChips = (types, cls) => types.map(l =>
      `<span class="mc-def mc-def-${cls}">${foundry.utils.escapeHTML(l)}</span>`).join("");
    const defenseChips = defChips(dmgTraits("traits.dr"), "res")
      + defChips(dmgTraits("traits.di"), "imm")
      + defChips(dmgTraits("traits.dv"), "vuln");
    const defenseSec = defenseChips
      ? `<div class="mc-section-label">Resistances / Vulnerabilities</div><div class="mc-defenses">${defenseChips}</div>`
      : "";

    return `
      <div class="mc-section-label">Skills</div>
      <div class="mc-skillrows">${skillRows}</div>
      ${toolsBlock}
      <div class="mc-detail-sec">
        ${row("Race", race)}
        ${row("Background", names("background"))}
        ${row("Senses", senseList)}
      </div>
      <div class="mc-detail-sec">
        <div class="mc-section-label">Proficiencies</div>
        ${row("Languages", traitLabels("traits.languages", "languages"))}
        ${row("Weapons", traitLabels("traits.weaponProf", "weaponProf"))}
        ${row("Armor", traitLabels("traits.armorProf", "armorProf"))}
      </div>
      ${defenseSec}
      ${featChips}
      <button class="mc-leave" data-action="exit"><i class="fas fa-right-from-bracket"></i> Leave Mobile Command</button>
      <button class="mc-logout" data-action="logout"><i class="fas fa-power-off"></i> Log out</button>`;
  }

  // Move pad (§7.4): D-pad steps the player's own token via the move.request
  // RPC (executor wall-validates and applies). Out-of-combat group-token
  // binding is a later refinement; this moves the controlled actor's token.
  #moveHTML() {
    if (!this.originTokenId) return "";
    // One Font Awesome arrow, rotated per direction — renders uniformly (the
    // unicode diagonals ↖↗↙↘ get emoji-fied on iOS, which looked inconsistent).
    const cell = (dx, dy) => {
      const deg = Math.round(Math.atan2(dx, -dy) * 180 / Math.PI);
      // Orthogonal moves (up/down/left/right) get the primary blue; diagonals
      // stay neutral.
      const ortho = (dx === 0) !== (dy === 0);
      return `<button class="mc-dpad-btn ${ortho ? "mc-dpad-primary" : ""}" data-action="move" data-dx="${dx}" data-dy="${dy}">
        <i class="fas fa-arrow-up" style="transform: rotate(${deg}deg)"></i>
      </button>`;
    };
    const blank = `<span class="mc-dpad-blank"></span>`;
    return `
      <div class="mc-dpad">
        ${cell(-1, -1)}${cell(0, -1)}${cell(1, -1)}
        ${cell(-1, 0)}${blank}${cell(1, 0)}
        ${cell(-1, 1)}${cell(0, 1)}${cell(1, 1)}
      </div>
      <div class="mc-move-note" data-role="move-note"></div>`;
  }

  // B7 stat editor: roomy row under the header when editing HP/Temp. On-screen
  // − / + apply the typed amount as a delta; Set applies it absolute. Works on
  // the iOS numeric keypad, which lacks +/− and a reliable return key.
  #statEditorHTML(hp) {
    const f = this.#editingField;
    if (f !== "hp" && f !== "temp") return "";
    const cur = f === "hp" ? (hp.value ?? 0) : (hp.temp || 0);
    return `<div class="mc-stat-editor">
      <span class="mc-stat-editor-label">${f === "hp" ? "HP" : "Temp"}: <b>${cur}</b></span>
      <input class="mc-stat-input" data-field="${f}" type="text" inputmode="numeric" placeholder="amount">
      <button class="mc-pm mc-minus" data-action="stat-minus">−</button>
      <button class="mc-pm mc-plus" data-action="stat-plus">+</button>
      <button class="mc-pm mc-set" data-action="stat-set">Set</button>
      <button class="mc-pm mc-cancel" data-action="stat-cancel" aria-label="cancel">✕</button>
    </div>`;
  }

  // Class / subclass / level breakdown + XP bar, opened by tapping the Lvl
  // button (a button, not a long-press). This is where class/subclass/level/XP
  // now live — the duplicated rows were removed from the Details tab.
  #levelsHTML(actor) {
    const classes = actor.items.filter(i => i.type === "class");
    const subs = actor.items.filter(i => i.type === "subclass");
    const rows = classes.map(c => {
      const sub = subs.find(s => s.system.classIdentifier === c.system.identifier);
      const name = sub ? `${c.name} / ${sub.name}` : c.name;
      return `<div class="mc-lvl-row">
        <span class="mc-lvl-cls">${foundry.utils.escapeHTML(name)}</span>
        <span class="mc-lvl-num">${c.system.levels ?? ""}</span></div>`;
    }).join("") || `<div class="mc-lvl-row"><span class="mc-lvl-cls">No classes</span></div>`;
    const xp = actor.system.details?.xp ?? {};
    const hasXp = (xp.max ?? 0) > 0;
    const pct = hasXp ? Math.round(Math.min(100, Math.max(0, (xp.value ?? 0) / xp.max * 100))) : 0;
    const xpBar = hasXp
      ? `<div class="mc-xp"><div class="mc-xp-track"><div class="mc-xp-fill" style="width:${pct}%"></div></div>
          <div class="mc-xp-num">${xp.value ?? 0} / ${xp.max} XP</div></div>`
      : "";
    return `<div class="mc-levels-panel">
      <div class="mc-cond-panel-head">
        <span>Classes &amp; level</span>
        <button class="mc-cond-close" data-action="toggle-levels" aria-label="Close"><i class="fas fa-xmark"></i></button>
      </div>
      ${rows}
      ${xpBar}
    </div>`;
  }

  // Condition palette (header): the standard dnd5e conditions from
  // CONFIG.statusEffects, active ones highlighted; tap toggles via the
  // document-level actor.toggleStatusEffect (no canvas needed; dnd5e applies
  // riders like unconscious→prone). Concentration is special — shown as a
  // break button, never a manual add. Exhaustion is on/off here; level
  // stepping is a logged follow-up.
  #conditionPaletteHTML(actor) {
    const active = actor.statuses;
    const conc = CONFIG.specialStatusEffects?.CONCENTRATING;
    const conditions = (CONFIG.statusEffects ?? []).filter(s => s.id && s.id !== conc && s.id !== "exhaustion");
    const cells = conditions.map(s => {
      const on = active?.has?.(s.id);
      return `<button class="mc-cond-opt ${on ? "mc-on" : ""}" data-action="cond-toggle" data-status="${s.id}">
        ${s.img ? `<img class="mc-cond-opt-icon" src="${s.img}" alt="">` : ""}
        <span class="mc-cond-opt-name">${foundry.utils.escapeHTML(s.name)}</span>
      </button>`;
    }).join("");
    const isConc = conc && active?.has?.(conc);
    const breakRow = isConc
      ? `<button class="mc-cond-break" data-action="break-conc"><i class="fas fa-brain"></i> Break concentration</button>`
      : "";
    // Exhaustion is leveled (0–6) — a stepper rather than an on/off toggle.
    const exh = actor.system.attributes?.exhaustion ?? 0;
    const exhRow = `<div class="mc-cond-exh">
      <span class="mc-cond-exh-label">Exhaustion</span>
      <button class="mc-cond-exh-btn" data-action="exh-step" data-delta="-1" ${exh <= 0 ? "disabled" : ""}>−</button>
      <span class="mc-cond-exh-val">${exh}</span>
      <button class="mc-cond-exh-btn" data-action="exh-step" data-delta="1" ${exh >= 6 ? "disabled" : ""}>+</button>
    </div>`;
    return `<div class="mc-cond-panel">
      <div class="mc-cond-panel-head">
        <span>Conditions — tap to toggle</span>
        <button class="mc-cond-close" data-action="cond-edit" aria-label="Close"><i class="fas fa-xmark"></i></button>
      </div>
      ${breakRow}
      ${exhRow}
      <div class="mc-cond-grid">${cells}</div>
    </div>`;
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

  #abilitiesHTML(actor) {
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
    if (this.#subjectId && game.scenes?.active?.tokens.get(this.#subjectId)) return this.#subjectId;
    const id = this.actor?.id;
    return game.scenes.active?.tokens.find(t => t.actor?.id === id)?.id ?? null;
  }

  #usableActivities() {
    const out = [];
    for (const item of this.actor?.items ?? []) {
      const acts = item.system?.activities;
      if (!acts) continue;
      for (const a of acts) {
        // Include features (Action Surge=utility, Second Wind=heal) and item
        // uses, not just weapons/offensive spells. AoE activities are kept too —
        // tapping one announces the cast to the DM (#announceCast), not the picker.
        if (!["attack", "save", "damage", "utility", "heal"].includes(a.type)) continue;
        out.push(a);
      }
    }
    return out;
  }

  #actionsHTML() {
    const actor = this.actor;
    const acts = this.#usableActivities();
    if (!acts.length) {
      return `<div class="mc-placeholder">No usable actions found.</div>`;
    }
    const editing = this.#favEditing;
    // Group by activation cost: Action / Bonus / Reaction, with everything else
    // (timed/special activations) under Other. Fixed order; empty groups drop.
    const groups = [
      { key: "action", label: "Actions" },
      { key: "bonus", label: "Bonus actions" },
      { key: "reaction", label: "Reactions" },
      { key: "free", label: "Free" },
      { key: "other", label: "Other" }
    ];
    const bucket = { action: [], bonus: [], reaction: [], free: [], other: [] };
    for (const a of acts) bucket[this.#econGroup(a)].push(a);
    const shown = groups.filter(g => bucket[g.key].length);
    const rowsFor = (key) => bucket[key].map(a => this.#actionRowHTML(a, actor, editing)).join("");
    // Accordion: each group header is a drawer the user can open/close; using an
    // action auto-collapses its drawer (still reopenable). One group → no header.
    const body = shown.length <= 1
      ? `<div class="mc-actions">${rowsFor(shown[0].key)}</div>`
      : shown.map(g => {
          const collapsed = this.#collapsedActionGroups.has(g.key);
          const header = `<button class="mc-actions-sub mc-econ-${g.key} mc-accordion ${collapsed ? "mc-collapsed" : ""}" data-action="agroup" data-group="${g.key}">
            <span>${g.label}</span><i class="fas fa-chevron-${collapsed ? "right" : "down"}"></i></button>`;
          return header + (collapsed ? "" : `<div class="mc-actions">${rowsFor(g.key)}</div>`);
        }).join("");
    const editBtn = `<button class="mc-fav-edit ${editing ? "mc-on" : ""}" data-action="fav-edit-toggle" title="Add/remove favorites" aria-label="Add or remove favorites"><i class="fas fa-bookmark"></i></button>`;
    return `<div class="mc-actions-head">
        <span class="mc-section-label">Actions — ${editing ? "tap to favorite" : "tap to use"}</span>
        ${editBtn}
      </div>
      ${this.#actionEconomyHTML(actor)}
      ${body}`;
  }

  // Action-economy state from midi's per-turn flags (flags.midi-qol.actions) —
  // plain document data the phone reads directly. Each boolean = the resource is
  // still AVAILABLE. ACT is recorded unconditionally on your turn; BA/RE need
  // enforce*Actions ≥ "displayOnly" (set in the preset) to be recorded.
  #inCombat(actor = this.actor) {
    return !!game.combat?.combatants?.some(c => c.actor?.id === actor?.id);
  }
  #actionEconomy(actor) {
    const inCombat = this.#inCombat(actor);
    const f = actor?.getFlag?.("midi-qol", "actions") ?? {};
    return {
      inCombat,
      action: !f.action,
      bonus: (f.bonusActionsUsed ?? 0) < (f.bonusActionsMax ?? 1),
      reaction: (f.reactionsUsed ?? 0) < (f.reactionsMax ?? 1)
    };
  }

  // Compact ACT / BA / RE availability strip atop the Actions tab (combat only).
  #actionEconomyHTML(actor) {
    const e = this.#actionEconomy(actor);
    if (!e.inCombat) return "";
    const chip = (type, label, on) =>
      `<span class="mc-econ-chip mc-econ-${type} ${on ? "mc-on" : "mc-off"}">${label}</span>`;
    return `<div class="mc-econ">
      ${chip("action", "ACT", e.action)}
      ${chip("bonus", "BA", e.bonus)}
      ${chip("reaction", "RE", e.reaction)}
    </div>`;
  }

  // Action-economy badge for a favorite activity: ACT/BA/RE colored by cost, lit
  // when that resource is still available (always lit out of combat).
  #costBadge(activity, econ) {
    if (!activity) return null;
    // Out of combat there's no economy to track — drop the ACT/BA/RE label so the
    // sheet isn't "counting" actions when it doesn't matter (DM, 2026-06-18).
    if (!econ.inCombat) return null;
    const g = this.#econGroup(activity);
    const labels = { action: "ACT", bonus: "BA", reaction: "RE", free: "FREE" };
    if (!labels[g]) return null; // "other" (timed/rest) → no badge
    // Free has no economy cost → always lit; the rest dim once used (in combat).
    const on = g === "free" ? true : (!econ.inCombat || econ[g]);
    return { type: g, label: labels[g], on };
  }

  // Action-group key for an activity. Free = at-will / no economy cost (special
  // or no activation, e.g. Action Surge); timed/rest activations fall to other.
  #econGroup(a) {
    const t = a.activation?.type;
    if (t === "action" || t === "bonus" || t === "reaction") return t;
    if (!t || t === "special") return "free";
    return "other";
  }

  // Limited-use counter from item.system.uses (Rage, Ki, Action Surge, Second
  // Wind, charges, etc.). Always "value/max" — DM 2026-06-18 prefers a single
  // counter style over dots-below-8 / number-above (no mixed dots + X/Y). Red at 0.
  #usesBadge(item) {
    const u = item?.system?.uses;
    if (!u || !(u.max > 0)) return "";
    return `<span class="mc-pips-num ${(u.value ?? 0) === 0 ? "mc-spent" : ""}">${u.value ?? 0}/${u.max}</span>`;
  }

  #actionRowHTML(a, actor, editing) {
    const sub = a.item.name === a.name ? a.type : a.name;
    const icon = a.item.img || a.img || "icons/svg/upgrade.svg";
    const favId = `${a.item.getRelativeUUID(actor)}.Activity.${a.id}`;
    const isFav = actor.system.hasFavorite?.(favId) ?? false;
    // In edit mode the row toggles the favorite; otherwise it opens the picker.
    const action = editing ? "fav-toggle" : "action-pick";
    const data = editing ? `data-favid="${favId}"` : `data-uuid="${a.uuid}"`;
    // Always render the bookmark slot (hidden when not favorited/not editing) so
    // the usage dots line up across rows.
    const showMark = editing || isFav;
    const mark = `<i class="fas fa-bookmark mc-action-fav ${isFav ? "mc-on" : ""} ${showMark ? "" : "mc-ph"}"></i>`;
    const right = `<span class="mc-action-right">${this.#usesBadge(a.item)}${mark}</span>`;
    return `<button class="mc-action" data-action="${action}" ${data}>
      <img class="mc-action-icon" src="${icon}" alt="">
      <span class="mc-action-text">
        <span class="mc-action-name">${foundry.utils.escapeHTML(a.item.name)}</span>
        <span class="mc-action-sub">${foundry.utils.escapeHTML(sub)}</span>
      </span>
      ${right}
    </button>`;
  }

  #targetPickerHTML() {
    const s = this.#actionState;

    // Post-attack phase: show the attack result + a deliberate "Roll damage" tap.
    if (s.phase === "rolling" || s.phase === "attacked") {
      const head = `<div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="action-back" aria-label="Close"><i class="fas fa-xmark"></i></button>
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

    // Self is always a target option (gray "Self" tag, at the bottom).
    const selfUuid = game.scenes.active?.tokens.get(this.originTokenId)?.uuid;
    const selfRow = (!s.selfTarget && selfUuid)
      ? `<button class="mc-target ${s.selected.has(selfUuid) ? "mc-target-on" : ""}" data-action="target-toggle" data-uuid="${selfUuid}">
          <span class="mc-target-name">Self</span>
          <span class="mc-target-right"><span class="mc-disp mc-self">Self</span></span>
        </button>`
      : "";
    const count = s.selfTarget ? "" : `<span class="mc-target-count">${s.selected.size}/${s.maxTargets}</span>`;
    const canFire = s.selfTarget || s.selected.size > 0;
    const assignedBanner = s.assignedByDM
      ? `<div class="mc-assigned"><span><i class="fas fa-crosshairs"></i> Targets set by ${foundry.utils.escapeHTML(s.assignedByDM)} (${s.selected.size})</span>
          <button class="mc-assigned-change" data-action="assigned-change">change</button></div>`
      : "";
    return `
      <div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="action-back" aria-label="Close"><i class="fas fa-xmark"></i></button>
        <span class="mc-picker-title">${foundry.utils.escapeHTML(s.name)}</span>
        ${count}
      </div>
      ${assignedBanner}
      ${s.hasAttack ? `<div class="mc-adv-row">${advBtn("advantage", "Advantage")}${advBtn("normal", "Normal")}${advBtn("disadvantage", "Disadvantage")}</div>` : ""}
      <div class="mc-targets">${body}${selfRow}</div>
      <button class="mc-fire ${canFire ? "" : "mc-disabled"}" data-action="fire" ${canFire ? "" : "disabled"}>
        ${s.busy ? "Using…" : "Use"}
      </button>`;
  }

  async #pickAction(uuid) {
    this.#itemPickerId = null; // leaving any multi-activity picker
    const activity = await fromUuid(uuid);
    if (!activity) return;
    // AoE push (§11): a no-canvas phone can't place a template, so an area spell
    // asks the DM to place it instead of opening the target picker.
    if (activity.target?.template?.type) return this.#announceCast(activity);
    this.#clearPreview(); // drop any stale preview from a prior action
    const affects = activity.target?.affects ?? {};
    // "selfTarget" = no enemy target needed → skip the picker. Attacks/saves/
    // damage ALWAYS need a target (weapon attacks have an empty affects.type
    // but still target a creature) — only treat an empty type as no-target for
    // non-roll features (Action Surge=utility, Second Wind=heal self).
    const targeted = ["attack", "save", "damage"].includes(activity.type);
    const selfTarget = affects.type === "self" || (!affects.type && !targeted);
    const maxTargets = Math.max(1, Number(affects.count) || 1);
    // §11: DM-assigned targets pre-load the picker (skip the cycler), capped to
    // the activity's target count.
    const assigned = (!selfTarget && this.#assignedTargets.length)
      ? this.#assignedTargets.slice(0, maxTargets) : [];
    this.#actionState = { uuid, name: activity.item.name, selfTarget, maxTargets,
      hasAttack: activity.type === "attack",
      // Auto-resolve on the executor for anything that ISN'T a player-rolled
      // attack/damage/save/heal (cast/utility/summon/check/enchant/…): those have
      // no damage to park OR spawn an untrackable linked workflow (cast), so the
      // two-tap scan can't follow them — running to completion on the executor
      // applies the effect + consumes resources instead of orphaning a roll card.
      autoResolve: !["attack", "damage", "save", "heal"].includes(activity.type),
      group: this.#econGroup(activity),
      candidates: selfTarget ? [] : null, selected: new Set(assigned), adv: "normal",
      assignedByDM: assigned.length ? this.#assignedBy : null,
      busy: false, phase: "pick", requestId: null, hit: null, attackTotal: null,
      targetError: null };
    this.render();
    if (assigned.length) this.#pushPreview(); // reflect the assigned selection on the TV
    if (!selfTarget) {
      const res = await rpc.listTargets({ forTokenId: this.originTokenId });
      if (this.#actionState?.uuid !== uuid) return; // user navigated away
      this.#actionState.candidates = res?.ok ? res.candidates : [];
      this.#actionState.targetError = res?.ok ? null : (res?.reason ?? "could not load targets");
      this.render();
    }
  }

  // AoE push (§11): tell the DM to place this area spell's template. The cast
  // resolves on the executor (caster's slot deducts, saves fan to targets); the
  // phone only announces. Live aiming preview isn't broadcast to the TV — the
  // player guides the DM verbally off the placed result.
  async #announceCast(activity) {
    const name = activity.item?.name ?? "spell";
    const casterTokenUuid = game.scenes.active?.tokens.get(this.originTokenId)?.uuid ?? null;
    const res = await rpc.announceCast({
      activityUuid: activity.uuid,
      casterName: this.actor?.name,
      spellName: name,
      casterTokenUuid
    });
    if (res?.ok) ui.notifications.info(`Asked the DM to place ${name}.`);
    else ui.notifications.warn(`${name}: ${res?.reason ?? "could not reach the DM"}`);
  }

  // Save/reaction prompt: the executor relayed a midi save request for one of
  // this user's actors. Store it, show the cue, and auto-clear when midi's
  // timeout would have lapsed (so a stale prompt doesn't linger after the
  // auto-roll). A new request replaces the old.
  noteSavePrompt(payload) {
    clearTimeout(this.#savePromptTimer);
    this.#savePrompt = payload || null;
    if (payload?.ttlMs) {
      this.#savePromptTimer = setTimeout(() => {
        this.#savePrompt = null;
        if (this.rendered) this.render();
      }, payload.ttlMs);
    }
    if (this.rendered) this.render();
  }
  #clearSavePrompt() {
    clearTimeout(this.#savePromptTimer);
    this.#savePrompt = null;
  }
  // Roll the requested save on the *specific* actor that needs it (which may not
  // be the currently-viewed subject). midi intercepts the matching roll.
  async #rollSavePrompt(ability) {
    const s = this.#savePrompt;
    this.#clearSavePrompt();
    this.render();
    const actor = s?.actorUuid ? await fromUuid(s.actorUuid) : this.actor;
    actor?.rollSavingThrow?.({ ability });
  }

  // §11 DM-assign: the DM panel hands targets here (mobile-command.assignTargets
  // hook). They pre-load the next action's picker ("Targets set by DM") and
  // expire at the end of the player's turn.
  noteAssignedTargets(uuids, from) {
    this.#assignedTargets = Array.isArray(uuids) ? uuids.filter(Boolean) : [];
    this.#assignedBy = this.#assignedTargets.length ? (from || "DM") : null;
    if (this.#assignedTargets.length) ui.notifications.info(`Targets set by ${this.#assignedBy}`);
    if (this.rendered) this.render();
  }
  expireAssignedIfNotMyTurn() {
    if (!this.#assignedTargets.length) return;
    const cur = game.combat?.combatant?.actor?.id;
    if (cur && cur !== this.actor?.id) this.#clearAssigned();
  }
  #clearAssigned() { this.#assignedTargets = []; this.#assignedBy = null; }

  // Favorites (dnd5e system.favorites): the Actions bookmark toggle adds/removes
  // the tapped activity; the Explore favorites container renders the result. The
  // updateActor hook re-renders the shell on change.
  async #toggleFavorite(favId) {
    const actor = this.actor;
    if (!actor || !favId) return;
    if (actor.system.hasFavorite?.(favId)) await actor.system.removeFavorite(favId);
    else await actor.system.addFavorite?.({ type: "activity", id: favId });
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
    // Auto-resolve non player-rolled activities on the executor (see autoResolve
    // in #pickAction): a full client can run cast/summon/check/utility/enchant to
    // completion, applying the effect + consuming resources in one tap, instead of
    // orphaning an untrackable roll card (the cast/Staff-of-Healing footgun).
    if (s.autoResolve) { midiOptions.autoRollDamage = "always"; midiOptions.fastForwardDamage = true; }
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
    // Used → auto-collapse its Actions drawer (the action is committed now;
    // resource consumed). Reopenable; takes effect when the list re-renders.
    // Only in combat: out of combat you often fire several things in a row, and
    // the drawer snapping shut each time is just friction (DM, 2026-06-18).
    if (s.group && this.#inCombat()) this.#collapsedActionGroups.add(s.group);
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
    this.#itemPickerId = null;
    this.#detailCard = null;
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
    if (this.#suppressClick) { this.#suppressClick = false; return; } // swallow the tap after a long-press
    const el = ev.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const actor = this.actor;
    switch (action) {
      case "exit": return this.#confirmExit();
      case "logout": return game.logOut?.(); // temp: switching Foundry users on a phone is painful
      case "tab":
        this.#tab = el.dataset.tab;
        this.#abandonAction(); // leave the picker clean; cancel any held workflow
        return this.render();
      case "action-pick":
        return this.#pickAction(el.dataset.uuid);
      case "fav-edit-toggle":
        this.#favEditing = !this.#favEditing; return this.render();
      case "fav-toggle":
        return this.#toggleFavorite(el.dataset.favid);
      case "fav-act":
        return this.#pickAction(el.dataset.uuid);
      case "toggle-prep": {
        const item = actor?.items.get(el.dataset.itemId);
        if (!item) return;
        return item.update({ "system.prepared": (item.system.prepared ?? 0) ? 0 : 1 });
      }
      case "equip-toggle": {
        const item = actor?.items.get(el.dataset.itemId);
        return item?.update({ "system.equipped": !item.system.equipped });
      }
      case "attune-toggle": {
        const item = actor?.items.get(el.dataset.itemId);
        return item?.update({ "system.attuned": !item.system.attuned });
      }
      case "container-toggle": {
        const id = el.dataset.itemId;
        if (this.#openContainers.has(id)) this.#openContainers.delete(id);
        else this.#openContainers.add(id);
        return this.render();
      }
      case "item-activities":
        this.#itemPickerId = el.dataset.itemId; return this.render();
      case "item-pick-back":
        this.#itemPickerId = null; return this.render();
      case "agroup": {
        const g = el.dataset.group;
        if (this.#collapsedActionGroups.has(g)) this.#collapsedActionGroups.delete(g);
        else this.#collapsedActionGroups.add(g);
        return this.render();
      }
      case "action-back":
        this.#abandonAction();
        return this.render();
      case "detail-close":
        this.#detailCard = null;
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
      case "assigned-change":
        this.#clearAssigned();
        if (this.#actionState) { this.#actionState.assignedByDM = null; this.#actionState.selected.clear(); this.#pushPreview(); }
        return this.render();
      case "fire":
        return this.#fireAction();
      case "check":
        return actor?.rollAbilityCheck({ ability: el.dataset.ability });
      case "save":
        return actor?.rollSavingThrow({ ability: el.dataset.ability });
      case "skill":
        return actor?.rollSkill({ skill: el.dataset.skill });
      case "tool":
        return actor?.rollToolCheck?.({ tool: el.dataset.tool });
      case "edit-hp":
        this.#editingField = (this.#editingField === "hp") ? null : "hp"; return this.render();
      case "edit-temp":
        this.#editingField = (this.#editingField === "temp") ? null : "temp"; return this.render();
      case "stat-minus":
        return this.#applyStat(-1);
      case "stat-plus":
        return this.#applyStat(1);
      case "stat-set":
        return this.#applyStat(0);
      case "stat-cancel":
        this.#editingField = null; return this.render();
      case "toggle-insp":
        return this.#toggleInspiration();
      case "cond-edit":
        this.#condEditing = !this.#condEditing; return this.render();
      case "toggle-levels":
        this.#showLevels = !this.#showLevels; return this.render();
      case "token-prev": return this.#cycleSubject(-1);
      case "token-next": return this.#cycleSubject(1);
      case "set-primary":
        return actor?.update({ "system.attributes.spellcasting": el.dataset.ability });
      case "show-image":
        this.#imagePopup = "profile"; return this.render();
      case "img-show":
        this.#imagePopup = el.dataset.which; return this.render();
      case "img-close":
        this.#imagePopup = null; return this.render();
      case "cond-toggle":
        return actor?.toggleStatusEffect?.(el.dataset.status);
      case "break-conc":
        return actor?.endConcentration?.();
      case "exh-step": {
        const cur = actor?.system.attributes?.exhaustion ?? 0;
        const next = Math.max(0, Math.min(6, cur + Number(el.dataset.delta)));
        return actor?.update({ "system.attributes.exhaustion": next });
      }
      case "move":
        return this.#move(Number(el.dataset.dx), Number(el.dataset.dy));
      case "end-turn":
        return this.#endTurn();
      case "roll-init":
        return actor?.rollInitiativeDialog?.();
      case "roll-hd":
        return actor?.rollHitDie?.();
      case "death-save":
        return actor?.rollDeathSave?.();
      case "death-dismiss":
        this.#deathSaveDismissed = true; return this.render();
      case "death-reopen":
        this.#deathSaveDismissed = false; return this.render();
      case "save-prompt-roll":
        this.#rollSavePrompt(el.dataset.ability); return;
      case "save-prompt-dismiss":
        this.#clearSavePrompt(); return this.render();
      case "short-rest":
        return actor?.shortRest?.();
      case "long-rest":
        return actor?.longRest?.();
    }
  };

  // B7: apply the editor's typed amount. sign −1 subtract / +1 add (delta) /
  // 0 set absolute. On-screen buttons drive this, so no keyboard +/− or return
  // is needed (iOS numeric keypad has neither).
  async #applyStat(sign) {
    const f = this.#editingField;
    if (f !== "hp" && f !== "temp") return;
    const input = this.element?.querySelector(".mc-stat-input");
    const amt = Math.abs(parseInt(input?.value, 10));
    this.#editingField = null;
    const actor = this.actor;
    const hp = actor?.system.attributes?.hp;
    if (!actor || !hp || Number.isNaN(amt)) return this.render();
    const cur = f === "hp" ? (hp.value ?? 0) : (hp.temp || 0);
    let next = Math.max(0, sign === 0 ? amt : cur + sign * amt);
    if (f === "hp") next = Math.min(hp.max ?? next, next);
    const path = f === "hp" ? "system.attributes.hp.value" : "system.attributes.hp.temp";
    await actor.update({ [path]: next });
    this.render();
  }

  async #confirmExit() {
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: "Leave Mobile Command?" },
      content: "<p>Return to the standard Foundry interface, or set this device up as the shared table display (TV)?</p>",
      buttons: [
        { action: "leave", label: "Leave", icon: "fas fa-right-from-bracket", callback: () => "leave" },
        { action: "tv", label: "This is the TV", icon: "fas fa-tv", callback: () => "tv" },
        { action: "cancel", label: "Cancel", icon: "fas fa-xmark", default: true, callback: () => "cancel" }
      ],
      modal: true, rejectClose: false
    });
    if (choice === "tv") return this.#becomeDisplay();
    if (choice === "leave") this.close();
  }

  // "This is the TV": switch this client to the Display role (per-client, D7) so
  // it shows the canvas/map instead of the phone shell. D2 force-disables the
  // canvas for phone clients at setup-time, so a reload is required for this
  // client to re-evaluate as a non-phone client (canvas on, shell suppressed).
  async #becomeDisplay() {
    await game.settings.set(MODULE_ID, "role", "display");
    window.location.reload();
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
    // Bound handlers → remove+add is idempotent across re-renders.
    const pairs = [
      ["click", this.#onClick], ["keydown", this.#onKeydown],
      // Long-press (touch hold ~500ms) / right-click (desktop + CC testing) on an
      // actionable row → its full details card (#showDetails). Move/up/cancel abort.
      ["pointerdown", this.#onPointerDown], ["pointermove", this.#onPointerMove],
      ["pointerup", this.#cancelLongPress], ["pointercancel", this.#cancelLongPress],
      ["pointerleave", this.#cancelLongPress], ["contextmenu", this.#onContextMenu]
    ];
    for (const [type, fn] of pairs) { root.removeEventListener(type, fn); root.addEventListener(type, fn); }
  }

  // The closest element carrying an item/activity reference (a "detailable" row).
  #detailTargetFor(target) {
    return target instanceof Element ? target.closest("[data-uuid], [data-item-id]") : null;
  }
  #onPointerDown = (ev) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return; // right-click → contextmenu path
    const el = this.#detailTargetFor(ev.target);
    if (!el) return;
    this.#lpStart = { x: ev.clientX, y: ev.clientY };
    clearTimeout(this.#longPressTimer);
    this.#longPressTimer = setTimeout(() => {
      this.#longPressTimer = null;
      this.#suppressClick = true; // the upcoming click must not also fire the row's action
      this.#triggerDetail(el);
    }, 500);
  };
  #onPointerMove = (ev) => {
    if (!this.#longPressTimer || !this.#lpStart) return;
    const dx = ev.clientX - this.#lpStart.x, dy = ev.clientY - this.#lpStart.y;
    if (dx * dx + dy * dy > 100) this.#cancelLongPress(); // moved >10px → it's a scroll, not a press
  };
  #cancelLongPress = () => { clearTimeout(this.#longPressTimer); this.#longPressTimer = null; };
  #onContextMenu = (ev) => {
    const el = this.#detailTargetFor(ev.target);
    if (!el) return;
    ev.preventDefault(); // right-click = the desktop / CC-testing long-press
    this.#triggerDetail(el);
  };
  // Resolve a detailable row to its Item and show the details card.
  #triggerDetail(el) {
    const { uuid, itemId } = el.dataset;
    let item = null;
    if (uuid) { const doc = fromUuidSync(uuid, { relative: this.actor }); item = doc?.item ?? doc; }
    else if (itemId) item = this.actor?.items.get(itemId);
    if (item?.system) this.#showDetails(item);
  }
  // Full details card (long-press v1): mirror Foundry's item card — name, a short
  // subtitle, and the (enriched) item description. Async because enrichHTML is.
  async #showDetails(item) {
    const sys = item.system ?? {};
    const raw = sys.description?.value || "";
    let desc = raw;
    try {
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      desc = await TE.enrichHTML(raw, { relativeTo: item, secrets: false });
    } catch (e) { desc = raw; /* fall back to the raw HTML if enrichment is unavailable */ }
    this.#detailCard = { name: item.name, img: item.img || "icons/svg/item-bag.svg", subtitle: this.#itemSubtitle(item), desc };
    this.render();
  }
  // Short type/level/rarity line under the name.
  #itemSubtitle(item) {
    const sys = item.system ?? {};
    if (item.type === "spell") {
      const lvl = sys.level ? `${ordinal(sys.level)}-level` : "Cantrip";
      const school = CONFIG.DND5E?.spellSchools?.[sys.school]?.label ?? sys.school ?? "";
      return [lvl, school].filter(Boolean).join(" ");
    }
    const typeLabel = CONFIG.Item?.typeLabels?.[item.type] ? game.i18n.localize(CONFIG.Item.typeLabels[item.type]) : item.type;
    const rarity = sys.rarity ? (CONFIG.DND5E?.itemRarity?.[sys.rarity] ?? sys.rarity) : "";
    return [rarity, typeLabel].filter(Boolean).join(" ");
  }
  #detailCardHTML() {
    const d = this.#detailCard;
    if (!d) return "";
    return `<div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="detail-close" aria-label="Close"><i class="fas fa-xmark"></i></button>
        <span class="mc-picker-title">${foundry.utils.escapeHTML(d.name)}</span>
      </div>
      <div class="mc-detail">
        <div class="mc-detail-head">
          <img class="mc-detail-icon" src="${d.img}" alt="">
          ${d.subtitle ? `<span class="mc-detail-sub">${foundry.utils.escapeHTML(d.subtitle)}</span>` : ""}
        </div>
        <div class="mc-detail-desc">${d.desc || "<em>No description.</em>"}</div>
      </div>`;
  }

  // Keyboard convenience for the stat editor (where a return key exists):
  // Enter = Set absolute; Escape = cancel. The −/+/Set buttons are the
  // primary, keyboard-independent path.
  #onKeydown = (ev) => {
    if (!ev.target.matches?.(".mc-stat-input")) return;
    if (ev.key === "Enter") { ev.preventDefault(); this.#applyStat(0); }
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
    // Close the save prompt once a save actually rolls — however it was rolled
    // (our card, the native card, or the sheet), so it never lingers (DM 2026-06-17).
    if (this.#savePrompt && message.author?.id === game.user.id
        && message.flags?.dnd5e?.roll?.type === "save") {
      this.#clearSavePrompt();
      if (this.rendered) this.render();
    }
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
  // Display (TV) clients have no shell, but still suppress the combat HUDs so the
  // shared map view stays clean (they pop on turn changes — DM-reported 2026-06-16).
  if (isDisplayClient()) { killCombatHUD(app); return; }
  if (!shellInstance?.rendered || app === shellInstance) return;
  if (app.options?.window?.frame === false) return; // skip docked/frameless UI
  const el = app.element;
  if (!(el instanceof HTMLElement)) return;
  // Phone clients: suppress third-party combat HUDs (Argon / Enhanced Combat HUD
  // etc.) — they compete with the shell's own Actions tab and route actions
  // outside Route B. The DM client is untouched (its shell isn't rendered). The
  // log helps identify any popup we haven't classified yet.
  console.debug("mobile-command | app over shell:", app.constructor?.name, app.id);
  if (killCombatHUD(app)) return;
  // Prompt Restyler (§7.6) MVP: any dialog/prompt opened over the shell
  // (rest, attack/roll config, reactions, our confirms) becomes a full-width
  // bottom-sheet (CSS .mc-phone-dialog) — the native popups are tiny/unusable
  // on a phone. The dialog's own header X handles close.
  el.classList.add("mc-phone-dialog");
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
  // Match the controlled actor by id, not object identity: a GM-initiated change
  // can hand us a different document instance (e.g. a synthetic/token actor) than
  // the one our getter returns, and a `===` check would silently drop the render
  // (DM-reported: items a DM added didn't appear until a full page reload).
  const controlsActor = (a) => {
    const mine = shellInstance?.actor;
    return !!mine && !!a && a.id === mine.id;
  };
  Hooks.on("updateActor", (actor) => {
    if (shellInstance?.rendered && controlsActor(actor)) shellInstance.render();
  });
  Hooks.on("createActiveEffect", (effect) => {
    if (shellInstance?.rendered && controlsActor(effect.parent)) shellInstance.render();
  });
  Hooks.on("deleteActiveEffect", (effect) => {
    if (shellInstance?.rendered && controlsActor(effect.parent)) shellInstance.render();
  });
  // Item changes live on the item, not the actor: spell prepared toggle
  // (system.prepared), uses spent, and learning/removing items. Without these
  // the prepared toggle wrote data but the UI never refreshed (reported bug).
  const onItem = (item) => {
    if (shellInstance?.rendered && controlsActor(item.parent)) shellInstance.render();
  };
  Hooks.on("updateItem", onItem);
  Hooks.on("createItem", (item) => {
    // DIAGNOSTIC (remove once #3 verified): confirm the create hook reaches the
    // phone when a DM adds an item, and whether it matched the controlled actor.
    console.debug("mobile-command | createItem", { item: item?.name, parent: item?.parent?.name, matched: controlsActor(item?.parent), rendered: !!shellInstance?.rendered });
    onItem(item);
  });
  Hooks.on("deleteItem", onItem);
  // Surface this user's/actor's roll results inside the shell (it covers chat).
  Hooks.on("createChatMessage", (message) => {
    if (shellInstance?.rendered) shellInstance.noteRoll(message);
  });
  // §11 DM-assign: the executor relays assigned targets here; pre-load them in
  // the next picker (ControllerShell.noteAssignedTargets).
  Hooks.on("mobile-command.assignTargets", (uuids, from) => shellInstance?.noteAssignedTargets(uuids, from));
  // §7.4/§7.6 save/reaction prompt: the executor relays a midi save request here.
  Hooks.on("mobile-command.savePrompt", (payload) => shellInstance?.noteSavePrompt(payload));
  // Turn HUD: re-render on combat turn/round changes and combat start/stop.
  // Also expire DM-assigned targets once the player's turn ends (§11).
  const onCombat = () => {
    shellInstance?.expireAssignedIfNotMyTurn();
    if (shellInstance?.rendered) shellInstance.render();
  };
  Hooks.on("updateCombat", onCombat);
  Hooks.on("deleteCombat", onCombat);
  Hooks.on("combatStart", onCombat);

  // TV vision: monks-common-display focuses the current combatant each turn
  // (control({releaseOthers}), monks-common-display.js:684) so the shared screen
  // shows the active player's LOS — good in combat. But it leaves that token
  // controlled when combat ends, stranding the TV on the last turn's view. On
  // the Display client, release on combat end so vision reverts to the shared
  // party view (out of combat every player is "active" at once). Doesn't fight
  // MCD — MCD only re-focuses while combat is running.
  if (isDisplayClient()) {
    Hooks.on("deleteCombat", () => {
      try {
        canvas?.tokens?.releaseAll();
        canvas?.perception?.update({ initializeVision: true });
      } catch (e) { console.warn(`${MODULE_ID} | TV vision reset failed`, e); }
    });
  }

  // Partial Connection Guard (§7.8): iOS suspends backgrounded tabs, so a turn
  // change while the phone is locked can leave the shell stale. Re-render on
  // refocus during combat so it catches up to the current turn. (A full state
  // re-fetch on socket reconnect is the larger §7.8 item.)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && shellInstance?.rendered && game.combat?.started) {
      shellInstance.render();
    }
  });
}
