import { MODULE_ID } from "./preset.js";
import { api as rpc } from "./rpc.js";

// Phase 2 — Controller Shell + read-only Touch Sheet.
// Full-screen frameless takeover for phone-role clients. Rolls use the dnd5e
// document-level methods (rollAbilityCheck/rollSavingThrow/rollSkill), which
// render their dialog locally and work on a no-canvas client (Spike 3, Test 0).
// HP editing, inventory, spell prep, item use (Route B) come in later phases.

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
// 5e point-buy (PHB 2014 & 2024): 27-point budget, scores 8–15.
const PB_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const PB_BUDGET = 27;
// 5e standard array (PHB) — six fixed scores assigned one each to an ability.
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
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
  #levelUp = null;      // level-up flow from the Lvl panel: null | { adding, options }
  #imagePopup = null;   // full-screen image popup: null | "profile" | "token"
  #sharedImage = null;  // DM "Show Players" image routed onto the phone: null | { src, title }
  #assignedTargets = []; // §11: token uuids the DM assigned to this player
  #assignedBy = null;    // DM/user name who assigned them (for the picker banner)
  #subjectId = null;     // §7.1 token switcher: active-scene token id the shell controls
  #subjectActorId = null; // tokenless subject (a blank PC mid-creation, no token yet)
  #savePrompt = null;    // §7.4/§7.6 incoming save request relayed from the executor
  #savePromptTimer = null;
  #deathSaveDismissed = false; // X'd the death-save panel (DM's call overrides; warnings-not-walls)
  #openContainers = new Set(); // Equipment tab: container item ids currently expanded
  #itemPickerId = null; // Equipment tab: item whose multi-activity picker is open
  #detailCard = null;   // long-press: { name, img, subtitle, desc } of an item shown full-screen
  #detailStack = [];    // drill-down back-stack: closing a linked card returns to the previous one
  #dropArmed = null;    // itemId mid-confirm for a "Drop" (2-tap so a stray tap can't delete)
  #viewKey = null;      // identity of the current screen — scroll is kept while it's unchanged
  #longPressTimer = null;
  #lpStart = null;      // pointer start position, to abort the press on scroll
  #suppressClick = false; // a long-press fired → swallow the trailing click so the row doesn't also act
  #moveMode = null;       // chosen travel type (walk/fly/swim/climb/burrow); null → effective default
  #movePickerOpen = false; // character card: the travel-type picker is expanded
  #moveBudget = null;     // last D-pad move readout { text, cls } — persisted so a combat
                          //   re-render doesn't wipe the counter (it lived only in the DOM)
  #collapsedActionGroups = new Set(); // Actions tab: accordion groups the user/use closed
  #lastCombatantId = null; // track the active combatant to detect "my turn started"
  #charGen = null;        // char-gen workspace: null | { actorId, picking, abilMethod, abil, pool, rolled, assign }
                          //   picking: null|"race"|"background"|"class"|"abilities"
                          //   abilMethod: "pointbuy"|"array"|"roll"; abil = point-buy scores;
                          //   pool = active array/roll values; rolled = last 4d6 roll; assign = ability→pool index
  #charGenOptions = null; // compendium entries for the current picking type (null = loading)
  #charGenSpellOptions = null; // {cantrips:[], leveled:[]} for the spell-pick step (null = loading)
  #diceTrayOpen = false; // header D20: contextless dice-tray panel open
  #dtrayPool = {};       // dice tray: {faces: count}, e.g. {20:2, 6:1}
  #dtrayMod = 0;         // dice tray: flat modifier

  /** The actor this phone controls: the subject token if set, else an owned token
   *  ON THE ACTIVE SCENE (so a scene switch rebinds to the PC the player has here),
   *  else the assigned character, else the first owned character. */
  get actor() {
    // Tokenless subject: a blank PC the player picked from the switcher to build
    // (char-gen). It has no token yet, so it can't be reached the in-scene way.
    if (this.#subjectActorId) {
      const a = game.actors.get(this.#subjectActorId);
      if (a?.isOwner) return a;
    }
    // Token switcher (§7.1): an explicit subject token still present + owned on the
    // active scene (covers summons/familiars/wild shape, incl. unlinked).
    if (this.#subjectId) {
      const tok = game.scenes?.active?.tokens.get(this.#subjectId);
      if (tok?.actor?.isOwner) return tok.actor;
    }
    // Prefer an owned token on the ACTIVE scene so that when the GM switches scenes
    // the phone binds to the PC that's actually there — not a stranded off-scene
    // character with no token (which gives originTokenId=null → "token not found").
    // Favour the assigned character when it's on the scene, else any owned token.
    const inScene = this.#ownedTokens();
    const assigned = game.user.character;
    if (assigned && inScene.some(t => t.actor?.id === assigned.id)) return assigned;
    if (inScene.length) return inScene[0].actor;
    // No owned token here: fall back to the assigned / first owned character for
    // read-only viewing (spatial actions will warn there's no token on this scene).
    return assigned ?? game.actors.find(a => a.type === "character" && a.isOwner) ?? null;
  }

  // Drop a subject token that's no longer on the active scene (e.g. the GM switched
  // scenes) so `actor`/`originTokenId` rebind to an owned token that's actually
  // here. Public so the scene-change hook can call it before re-rendering.
  syncSubject() {
    if (this.#subjectId && !game.scenes?.active?.tokens.get(this.#subjectId)) this.#subjectId = null;
    // Keep a tokenless char-gen subject (blank or mid-creation) until it's no longer
    // owned or creation finishes (Finish clears the flag → it resolves normally).
    if (this.#subjectActorId) {
      const a = game.actors.get(this.#subjectActorId);
      // Keep a tokenless owned character selected — a blank PC mid-build OR a
      // just-finished PC with no token yet (so Finish doesn't strand the new PC).
      if (!a?.isOwner || a.type !== "character") this.#subjectActorId = null;
    }
  }

  async _renderHTML() {
    return this.#buildHTML();
  }

  // Identity of the current screen for scroll preservation: changes when the user
  // navigates (tab / detail card / target picker / item picker / stat editor), but
  // NOT for in-place toggles (containers, action drawers, prepared/equip, conditions)
  // — so those keep the scroll position while navigation resets it.
  #currentViewKey() {
    return [
      this.#tab,
      this.#detailCard?.name ?? "",
      this.#actionState?.uuid ?? "",
      this.#actionState?.phase ?? "",
      this.#itemPickerId ?? "",
      this.#editingField ?? ""
    ].join("|");
  }

  _replaceHTML(result, content) {
    // Detach the live toast first so the innerHTML swap doesn't destroy an
    // in-flight roll toast on an unrelated re-render (e.g. an HP/condition
    // update). The recent-rolls strip is rebuilt from #recentRolls below.
    const toast = this.#toastEl;
    if (toast?.parentElement === content) content.removeChild(toast);
    // Preserve scroll across SAME-view re-renders (open a container, toggle a
    // drawer/prepared/equip, edit HP) so the player stays put (DM 2026-06-19).
    // A view change (tab / detail card / picker) resets to top.
    const prevTop = content.querySelector(".mc-content, .mc-cg-scroll")?.scrollTop ?? 0;
    const prevKey = this.#viewKey;
    const nextKey = this.#currentViewKey();
    content.innerHTML = typeof result === "string" ? result : "";
    this.#attachListeners(content);
    if (toast) content.appendChild(toast);
    if (nextKey === prevKey) {
      const scroller = content.querySelector(".mc-content, .mc-cg-scroll");
      if (scroller && prevTop) scroller.scrollTop = prevTop;
    }
    this.#viewKey = nextKey;
    if (this.#editingField) {
      const inp = content.querySelector(".mc-stat-input");
      if (inp) { inp.focus(); inp.select(); }
    }
  }

  #buildHTML() {
    this.syncSubject(); // self-heal a subject stranded by a scene switch
    const actor = this.actor;
    if (!actor) {
      return `<div class="mc-placeholder">No owned character found for ${game.user.name}.</div>`;
    }
    // Char-gen (§7.x): once started, the build workspace replaces the sheet until
    // Finish. A blank PC (no class) that hasn't started offers only "Create
    // Character". Otherwise fall through to the normal sheet.
    // Resume after a reload: the charGen flag persists but the workspace state is
    // in-memory, so re-seat #charGen for a flagged PC.
    if (actor.getFlag(MODULE_ID, "charGen") && this.#charGen?.actorId !== actor.id) {
      this.#charGen = { actorId: actor.id, picking: null };
    }
    // Wrap char-gen in a scroll container (the shell root is overflow:hidden and
    // these views render outside .mc-content — long pick lists couldn't scroll).
    if (this.#charGen?.actorId === actor.id) return `<div class="mc-cg-scroll">${this.#charGenHTML(actor)}</div>`;
    if (this.#isBlankPC(actor)) return `<div class="mc-cg-scroll">${this.#charGenStartHTML(actor)}</div>`;
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
    // Every effect-backed chip is long-pressable for its detail (#showEffectDetails
    // picks rules reference → own description → change summary). The synthetic
    // "Action used" chip has no backing effect, so it isn't pressable.
    const condsHTML = effects.map(e =>
      `<span class="mc-chip${isEconEffect(e) ? " mc-chip-used" : ""}" data-detail="cond" data-effect-id="${e.id}">${e.img ? `<img class="mc-chip-icon" src="${e.img}" alt="">` : ""}${foundry.utils.escapeHTML(e.name)}</span>`
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
        <img class="mc-portrait" src="${img}" alt="" data-action="show-image" data-detail="bio" title="Tap for image · hold for bio">
        <div class="mc-id">
          <div class="mc-name">${totalLevel ? `<button class="mc-name-lvl ${this.#showLevels ? "mc-on" : ""}" data-action="toggle-levels">Lvl ${totalLevel}</button>` : ""}<span class="mc-name-text" data-action="show-summary" data-detail="bio" title="Tap for summary · hold for bio">${foundry.utils.escapeHTML(actor.name)}</span>
            <button class="mc-insp ${insp ? "mc-insp-on" : ""}" data-action="toggle-insp" title="Inspiration">★</button>
          </div>
          <div class="mc-stats">
            ${hpBtn}${tempBtn}
            <button class="mc-stat mc-stat-tap mc-stat-acwrap" data-action="ac-detail" title="Armor Class — tap for breakdown"><span class="mc-ac-frame"><i class="fas fa-shield"></i>${ac}</span></button>
            <button class="mc-dtray-btn ${this.#diceTrayOpen ? "mc-on" : ""}" data-action="dice-tray" title="Dice tray — roll any die" aria-label="Dice tray"><i class="fas fa-dice-d20"></i></button>
          </div>
        </div>
      </header>
      ${this.#showLevels ? this.#levelsHTML(actor) : ""}
      ${this.#statEditorHTML(hp)}
      <div class="mc-conditions">${condHTML}
        <button class="mc-cond-manage ${this.#condEditing ? "mc-on" : ""}" data-action="cond-edit" aria-label="Manage conditions" title="Add or remove conditions"><i class="fas fa-plus"></i></button>
      </div>
      ${this.#condEditing ? this.#conditionPaletteHTML(actor) : ""}
      ${this.#diceTrayOpen ? this.#diceTrayHTML() : ""}
      ${this.#atZeroHP(actor) && this.#deathSaveDismissed
        ? `<button class="mc-death-reopen" data-action="death-reopen"><i class="fas fa-skull"></i> At 0 HP — death saves</button>` : ""}
      <main class="mc-content">${this.#tabContent(actor)}</main>
      ${this.#rollStripHTML()}
      ${this.#initPromptHTML()}
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
      ${this.#sharedImageHTML()}
      ${this.#savePromptHTML()}`;
  }

  // ===== Character creation (§7.x) ==========================================
  // A blank PC (the DM drops the actor + grants ownership) shows only "Create
  // Character". Starting it opens a workspace where the player picks Species /
  // Background / Class from compendiums — each add fires dnd5e's real advancement
  // popups, which already lift onto the phone (verified). Snags → DM client.

  #isBlankPC(actor) {
    return actor?.type === "character" && !actor.items.some(i => i.type === "class");
  }

  // The switcher rides in the char-gen header (start screen AND build workspace) so
  // a player is never trapped on a blank/char-gen PC: the pickers below back out to
  // this workspace, and from here Prev/Next returns to their real characters. (Bug
  // 2026-06-21: a flagged-but-unfinished blank PC routes to the switcher-less
  // workspace, dead-ending the switcher cycle.)
  #charGenHeaderHTML(actor, sub) {
    const img = actor.img || "icons/svg/mystery-man.svg";
    return `<header class="mc-header mc-cg-header">
      <img class="mc-portrait" src="${img}" alt="">
      <div class="mc-id"><div class="mc-name"><span class="mc-name-text">${foundry.utils.escapeHTML(actor.name)}</span></div>
        <div class="mc-cg-sub">${sub}</div></div>
    </header>${this.#tokenSwitcherHTML()}`;
  }

  // Start screen: blank PC → only Create Character (the header carries the switcher
  // to move between owned PCs, some of which may already be built).
  #charGenStartHTML(actor) {
    return this.#charGenHeaderHTML(actor, "New character")
      + `<div class="mc-cg-start">
          <i class="fas fa-wand-magic-sparkles mc-cg-bigicon"></i>
          <div class="mc-cg-blurb">This character is blank. Build it together at the table.</div>
          <button class="mc-cg-create" data-action="char-gen-start"><i class="fas fa-hammer"></i> Create Character</button>
        </div>`;
  }

  // Workspace: pick Species / Background / Class (each → real advancement popup),
  // each row showing the chosen item once added. Ability scores + Finish below.
  #charGenHTML(actor) {
    if (this.#detailCard) return this.#detailCardHTML(); // long-press detail over any char-gen step
    if (this.#charGen?.picking === "abilities") return this.#abilityPanelHTML(actor);
    if (this.#charGen?.picking === "spells") return this.#spellPickerHTML(actor);
    if (this.#charGen?.picking === "equip") return this.#equipPickerHTML(actor);
    if (this.#charGen?.picking) return this.#charGenPickerHTML(actor);
    const row = (label, type, icon) => {
      const item = actor.items.find(i => i.type === type);
      return `<button class="mc-cg-row ${item ? "mc-cg-done" : ""}" data-action="char-gen-pick" data-cgtype="${type}">
        <i class="fas ${icon} mc-cg-row-ico"></i>
        <span class="mc-cg-row-label">${label}</span>
        <span class="mc-cg-row-val">${item ? foundry.utils.escapeHTML(item.name) : "Choose…"}</span>
        <i class="fas ${item ? "fa-check mc-cg-check" : "fa-chevron-right"}"></i>
      </button>`;
    };
    // Spells step: only for a known caster (has cantrips/spells-known scale values).
    const si = this.#charGenSpellInfo(actor);
    const spellsRow = si ? (() => {
      const done = si.haveCantrips >= si.knownCantrips && si.haveSpells >= si.knownSpells;
      const val = done ? "All chosen"
        : `${si.haveCantrips}/${si.knownCantrips} cantrips · ${si.haveSpells}/${si.knownSpells} spells`;
      return `<button class="mc-cg-row ${done ? "mc-cg-done" : ""}" data-action="char-gen-spells">
        <i class="fas fa-book-sparkles mc-cg-row-ico"></i>
        <span class="mc-cg-row-label">Spells</span>
        <span class="mc-cg-row-val">${val}</span>
        <i class="fas ${done ? "fa-check mc-cg-check" : "fa-chevron-right"}"></i>
      </button>`;
    })() : "";
    // Starting equipment — SEPARATE rows for class and background (each granted on
    // its own, so the DM can see which one took: dnd5e grants can silently fail).
    // Once granted, the row shows what was added + a ✓; re-tapping reviews/redoes it
    // rather than silently adding again.
    const granted = actor.getFlag(MODULE_ID, "equipGranted") || {};
    const equipRow = (source, label) => {
      const item = actor.items.find(i => i.type === source);
      if (!item?.system?.startingEquipment?.length) return "";
      const g = granted[source];
      const done = !!g;
      return `<button class="mc-cg-row ${done ? "mc-cg-done" : ""}" data-action="char-gen-equip" data-cgsource="${source}">
        <i class="fas fa-briefcase mc-cg-row-ico"></i>
        <span class="mc-cg-row-label">${label}</span>
        <span class="mc-cg-row-val">${foundry.utils.escapeHTML(done ? (g.summary || "Granted") : "Choose…")}</span>
        <i class="fas ${done ? "fa-check mc-cg-check" : "fa-chevron-right"}"></i>
      </button>`;
    };
    const abilitiesRow = `<button class="mc-cg-row" data-action="char-gen-abilities">
        <i class="fas fa-dumbbell mc-cg-row-ico"></i>
        <span class="mc-cg-row-label">Ability scores</span>
        <span class="mc-cg-row-val">Point buy…</span>
        <i class="fas fa-chevron-right"></i>
      </button>`;
    // Order (DM 2026-06-21): name/bio box on top, then abilities first, then each
    // source immediately followed by its own equipment row.
    return this.#charGenHeaderHTML(actor, "Building character…")
      + this.#charGenBioHTML(actor)
      + `<div class="mc-cg-steps">
          ${abilitiesRow}
          ${row("Species", "race", "fa-dragon")}
          ${row("Background", "background", "fa-scroll")}
          ${equipRow("background", "Background equipment")}
          ${row("Class", "class", "fa-hat-wizard")}
          ${equipRow("class", "Class equipment")}
          ${spellsRow}
        </div>
        <button class="mc-cg-finish" data-action="char-gen-finish"><i class="fas fa-check-double"></i> Finish</button>`;
  }
  // Name + biography box atop the workspace (DM: "all the inputs in the Foundry
  // biography tab"). Collapsed = just the name; expanded = the dnd5e details fields.
  // Each input commits on blur via #onChange (data-bio = the actor path, or "name").
  #charGenBioHTML(actor) {
    const open = !!this.#charGen?.bioOpen;
    const d = actor.system?.details ?? {};
    const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
    const fld = (label, path, val) => `<label class="mc-bio-field"><span class="mc-bio-label">${label}</span>
        <input class="mc-bio-input" type="text" data-bio="${path}" value="${esc(val)}"></label>`;
    const area = (label, path, val) => `<label class="mc-bio-field mc-bio-wide"><span class="mc-bio-label">${label}</span>
        <textarea class="mc-bio-area" data-bio="${path}" rows="2">${esc(val)}</textarea></label>`;
    const details = open ? `<div class="mc-bio-grid">
        ${fld("Alignment", "system.details.alignment", d.alignment)}
        ${fld("Faith", "system.details.faith", d.faith)}
        ${fld("Gender", "system.details.gender", d.gender)}
        ${fld("Age", "system.details.age", d.age)}
        ${fld("Height", "system.details.height", d.height)}
        ${fld("Weight", "system.details.weight", d.weight)}
        ${fld("Eyes", "system.details.eyes", d.eyes)}
        ${fld("Hair", "system.details.hair", d.hair)}
        ${fld("Skin", "system.details.skin", d.skin)}
        ${area("Appearance", "system.details.appearance", d.appearance)}
        ${area("Personality Traits", "system.details.trait", d.trait)}
        ${area("Ideals", "system.details.ideal", d.ideal)}
        ${area("Bonds", "system.details.bond", d.bond)}
        ${area("Flaws", "system.details.flaw", d.flaw)}
        ${area("Biography", "system.details.biography.value", d.biography?.value)}
      </div>` : "";
    return `<div class="mc-bio-box">
        <input class="mc-bio-name" type="text" data-bio="name" value="${esc(actor.name)}" placeholder="Character name" aria-label="Character name">
        <button class="mc-bio-toggle" data-action="char-gen-bio-toggle">
          <i class="fas fa-feather"></i> ${open ? "Hide biography & details" : "Biography & details"}
          <i class="fas fa-chevron-${open ? "up" : "down"} mc-bio-chev"></i>
        </button>
        ${details}
      </div>`;
  }

  // Known-caster spell needs: the cantrips/spells-known scale values define the
  // limits; "have" counts the actor's current cantrip/leveled spell items. Returns
  // null for non-casters and prepared casters (no -known scale → handled later).
  #charGenSpellInfo(actor) {
    const cls = actor.items.find(i => i.type === "class" && i.system?.spellcasting?.progression
      && i.system.spellcasting.progression !== "none");
    if (!cls) return null;
    const id = cls.system.identifier;
    const scale = actor.system.scale?.[id] ?? {};
    const num = (v) => Number(v?.value ?? v) || 0;
    const knownCantrips = num(scale["cantrips-known"]);
    // Known casters (Sorcerer/Bard/Ranger) carry a spells-known scale; prepared
    // casters (Wizard/Cleric/Druid/Paladin) instead carry max-prepared and no
    // spells-known — use that as the leveled target so they aren't stuck at "0/0".
    const prepared = scale["spells-known"] == null && scale["max-prepared"] != null;
    const knownSpells = num(scale["spells-known"]) || num(scale["max-prepared"]);
    if (!knownCantrips && !knownSpells) return null; // not a list caster we can scope
    const maxLevel = Math.max(0, ...Object.entries(actor.system.spells ?? {})
      .filter(([k, v]) => /^spell\d/.test(k) && v?.max > 0).map(([k]) => Number(k.replace("spell", ""))));
    let haveCantrips = 0, haveSpells = 0;
    for (const s of actor.items) {
      if (s.type !== "spell") continue;
      if ((s.system?.level ?? 0) === 0) haveCantrips++; else haveSpells++;
    }
    return { classId: id, maxLevel, knownCantrips, knownSpells, haveCantrips, haveSpells, prepared };
  }

  // Compendium chooser for the current pick type (null options = still loading).
  #charGenPickerHTML(actor) {
    const type = this.#charGen.picking;
    const label = { race: "Species", background: "Background", class: "Class" }[type] ?? type;
    const head = `<div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="char-gen-pick-back" aria-label="Back"><i class="fas fa-arrow-left"></i></button>
        <span class="mc-picker-title">Choose ${label}</span>
      </div>`;
    if (this.#charGenOptions === null) return head + `<div class="mc-target-note">Loading ${label.toLowerCase()}…</div>`;
    if (!this.#charGenOptions.length) return head + `<div class="mc-target-note">No ${label.toLowerCase()} options found in the available compendiums.</div>`;
    const rows = this.#charGenOptions.map(o =>
      `<button class="mc-cg-opt" data-action="char-gen-add" data-uuid="${o.uuid}">
        <img class="mc-cg-opt-icon" src="${o.img || "icons/svg/mystery-man.svg"}" alt="">
        <span class="mc-cg-opt-text">
          <span class="mc-cg-opt-name">${foundry.utils.escapeHTML(o.name)}</span>
          <span class="mc-cg-opt-src">${foundry.utils.escapeHTML(o.src)}</span>
        </span>
      </button>`).join("");
    return head + `<div class="mc-cg-opts">${rows}</div>`;
  }

  // A PC needing char-gen: a blank PC (no class), OR one flagged mid-creation. The
  // flag persists creation across the moment a class is added (no longer "blank")
  // and across a reload (the workspace state is in-memory) — so the subject stays
  // reachable + resumable until the player actually taps Finish.
  #isCharGenPC(actor) {
    return actor?.type === "character"
      && (!actor.items.some(i => i.type === "class") || !!actor.getFlag?.(MODULE_ID, "charGen"));
  }
  #startCharGen() {
    const actor = this.actor; if (!actor) return;
    this.#charGen = { actorId: actor.id, picking: null };
    actor.setFlag(MODULE_ID, "charGen", true); // persist so a reload can resume
    this.render();
  }
  async #finishCharGen() {
    const actor = this.actor;
    // Stay on the just-finished PC. It has no token yet, so pin it as the tokenless
    // subject — otherwise `actor` would fall back to an in-scene token and the new
    // PC would be unreachable until the DM drops a token.
    if (actor) { this.#subjectActorId = actor.id; this.#subjectId = null; }
    // AWAIT the flag clear before clearing in-memory state + rendering: otherwise the
    // synchronous re-render reads the still-set flag and the #buildHTML resume logic
    // re-creates #charGen — stranding the player back in the builder after Finish.
    await actor?.unsetFlag(MODULE_ID, "charGen");
    this.#charGen = null; this.#charGenOptions = null;
    this.render();
  }

  // Player-facing sources = the DM's curated list, mirroring dnd5e's own
  // compendium-browser exclusion (Settings → dnd5e → "Compendium Browser /
  // Sources", a.k.a. packSourceConfiguration). dnd5e includes a pack when the
  // stored value !== false; a pack the DM unticked there is set false (excluded).
  #packSourceAllowed(collection) {
    const cfg = game.settings.get("dnd5e", "packSourceConfiguration") ?? {};
    return cfg[collection] !== false;
  }
  // Load every compendium item of the requested type from the DM-approved
  // sources. Scans allowed Item packs' indexes for the matching subtype.
  async #charGenPick(type) {
    if (!this.#charGen) return;
    this.#charGen.picking = type;
    this.#charGenOptions = null; // loading
    this.render();
    const out = [];
    for (const pack of game.packs) {
      if (pack.metadata.type !== "Item") continue;
      if (!this.#packSourceAllowed(pack.collection)) continue;
      let idx;
      try { idx = await pack.getIndex({ fields: ["type", "system.source.book"] }); } catch (e) { continue; }
      for (const e of idx) {
        if (e.type === type) out.push({ name: e.name, uuid: `Compendium.${pack.collection}.Item.${e._id}`, src: this.#optionSource(e.system?.source?.book, pack), img: e.img });
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    if (this.#charGen?.picking === type) { this.#charGenOptions = out; this.render(); }
  }

  // Add the chosen item via dnd5e's advancement manager — the real creation
  // popup (lifted onto the phone). Not awaited: the player completes the popup,
  // dnd5e commits the item, and the createItem hook re-renders this workspace.
  async #charGenAdd(uuid) {
    const actor = this.actor; if (!actor) return;
    const item = await fromUuid(uuid);
    this.#charGen.picking = null; this.#charGenOptions = null;
    this.render();
    if (!item) return ui.notifications.warn("That option couldn't load.");
    try {
      const AM = dnd5e.applications?.advancement?.AdvancementManager ?? dnd5e.documents?.advancement?.AdvancementManager;
      if (!AM) throw new Error("AdvancementManager unavailable");
      AM.forNewItem(actor, item.toObject()).render(true);
    } catch (e) {
      console.error("mobile-command | char-gen add failed", e);
      ui.notifications.warn(`Couldn't add ${item.name} — see console.`);
    }
  }

  // ===== Spell selection (known casters) ====================================
  // dnd5e exposes the class spell list as a registry: forType("class", id).
  // getSpells() → resolved spells; we split cantrips vs leveled (≤ max slot), dedupe
  // by name across compendium sources, and let the player pick up to the known count.

  async #charGenSpells() {
    const actor = this.actor; if (!actor || !this.#charGen) return;
    this.#charGen.picking = "spells";
    this.#charGenSpellOptions = null;
    this.#charGen.spellSel = new Set();
    this.#charGen.spellFilter = { q: "", school: "all" };
    this.render();
    const opts = await this.#loadSpellOptions(actor);
    if (this.#charGen?.picking !== "spells") return;
    // pre-select what the actor already knows (best-effort by name, one option per
    // name so identically-named versions don't all light up) so re-opening is stable.
    const have = new Set(actor.items.filter(i => i.type === "spell").map(i => i.name));
    const sel = new Set(); const used = new Set();
    for (const s of [...opts.cantrips, ...opts.leveled]) {
      if (have.has(s.name) && !used.has(s.name)) { sel.add(s.uuid); used.add(s.name); }
    }
    this.#charGen.spellSel = sel;
    this.#charGenSpellOptions = opts;
    this.render();
  }
  // Short, distinguishing source label for a compendium pack (the package title,
  // minus the common "Dungeons & Dragons" prefix) — so same-named items from
  // different sources are told apart (pack labels like "Spells" collide).
  #srcLabel(meta) {
    if (!meta) return "";
    const pkg = meta.packageName;
    const title = pkg === game.system.id ? game.system.title : (game.modules.get(pkg)?.title ?? pkg ?? meta.label);
    return String(title ?? "").replace(/^Dungeons\s*&\s*Dragons\s*/i, "").trim() || String(title ?? "");
  }
  // The item's actual source BOOK (system.source.book, e.g. "PHB 2024"), resolved
  // to its full title via CONFIG.DND5E.sourceBooks ("Player's Handbook (2024)") —
  // the real source, not the generic pack label ("Character Classes"). Empty when
  // the item declares no book (caller falls back to the pack/package label).
  #sourceBookLabel(book) {
    if (!book) return "";
    return CONFIG.DND5E?.sourceBooks?.[book] ?? String(book);
  }
  // dnd5e's source.book is a DERIVED getter: when an item's stored book is empty,
  // the full doc fills it from the module's declared source book. The index only
  // has the raw (empty) value, so for index scans we mirror that fallback —
  // the module's single declared book (unambiguous only when it declares one).
  #packDefaultBook(pack) {
    const pkg = pack?.metadata?.packageName;
    const mod = pkg === game.system.id ? game.system : game.modules.get(pkg);
    const keys = Object.keys(mod?.flags?.dnd5e?.sourceBooks ?? {});
    return keys.length === 1 ? keys[0] : "";
  }
  // Resolve an index entry's display source: its own book, else the module default,
  // else the generic pack label (last resort). For full docs use source.book direct.
  #optionSource(indexBook, pack) {
    return this.#sourceBookLabel(indexBook || this.#packDefaultBook(pack)) || pack.metadata.label;
  }
  async #loadSpellOptions(actor) {
    const si = this.#charGenSpellInfo(actor);
    if (!si) return { cantrips: [], leveled: [] };
    try {
      const sl = await dnd5e.registry.spellLists.forType("class", si.classId);
      const all = await sl.getSpells();
      // No name-dedupe: same-named spells from different sources can have different
      // stats/text — show every version with its source; which to use is the DM's
      // call (scoped later by the compendium-approval handshake).
      const cantrips = [], leveled = [];
      for (const s of all) {
        if (!s) continue; // getSpells() yields null for any UUID that no longer resolves
        if (s.compendium && !this.#packSourceAllowed(s.compendium.collection)) continue; // DM-excluded source
        const lvl = s.system?.level ?? 0;
        const entry = { name: s.name, uuid: s.uuid, level: lvl, src: this.#sourceBookLabel(s.system?.source?.book) || this.#srcLabel(s.compendium?.metadata),
          img: s.img || "icons/svg/daze.svg", school: s.system?.school || "" };
        if (lvl === 0) cantrips.push(entry);
        else if (lvl <= si.maxLevel) leveled.push(entry);
      }
      cantrips.sort((a, b) => a.name.localeCompare(b.name) || a.src.localeCompare(b.src));
      leveled.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name) || a.src.localeCompare(b.src));
      return { cantrips, leveled };
    } catch (e) {
      console.error("mobile-command | spell list load failed", e);
      return { cantrips: [], leveled: [] };
    }
  }
  #spellPickerHTML(actor) {
    const si = this.#charGenSpellInfo(actor) ?? { knownCantrips: 0, knownSpells: 0 };
    const head = `<div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="char-gen-pick-back" aria-label="Back"><i class="fas fa-arrow-left"></i></button>
        <span class="mc-picker-title">Choose spells</span>
      </div>`;
    if (this.#charGenSpellOptions === null) return head + `<div class="mc-target-note">Loading the ${si.classId ?? "class"} spell list…</div>`;
    const sel = this.#charGen.spellSel ?? new Set();
    const opts = this.#charGenSpellOptions;
    const selCant = opts.cantrips.filter(s => sel.has(s.uuid)).length;
    const selLev = opts.leveled.filter(s => sel.has(s.uuid)).length;
    // Reuse the spellbook row look (icon + name) + source; tap toggles, long-press
    // (data-uuid) opens the spell's detail card, which carries an Add/Remove button.
    const spellRow = (s) => `<button class="mc-spellpick ${sel.has(s.uuid) ? "mc-on" : ""}" data-action="char-gen-spell-toggle" data-uuid="${s.uuid}">
        <img class="mc-spell-icon" src="${s.img}" alt="">
        <span class="mc-spellpick-name">${foundry.utils.escapeHTML(s.name)}${s.src ? `<span class="mc-spellpick-src">${foundry.utils.escapeHTML(s.src)}</span>` : ""}</span>
        <i class="fas ${sel.has(s.uuid) ? "fa-circle-check" : "fa-circle"} mc-spellpick-tick"></i>
      </button>`;
    // Filters (like the compendium spell browser): name search + school. The count
    // headers track the FULL selection; the filter only narrows what's shown.
    const f = this.#charGen.spellFilter ?? { q: "", school: "all" };
    const filt = (list) => list.filter(s =>
      (!f.q || s.name.toLowerCase().includes(f.q)) &&
      (!f.school || f.school === "all" || s.school === f.school));
    const schools = CONFIG.DND5E?.spellSchools ?? {};
    const schoolOpts = `<option value="all">All schools</option>` + Object.entries(schools).map(([k, v]) =>
      `<option value="${k}" ${f.school === k ? "selected" : ""}>${foundry.utils.escapeHTML(v.label ?? v)}</option>`).join("");
    const filterBar = `<div class="mc-spellfilter-bar">
        <input class="mc-spellfilter-q" type="search" inputmode="search" placeholder="Search spells…" value="${foundry.utils.escapeHTML(f.q ?? "")}">
        <select class="mc-spellfilter-school">${schoolOpts}</select>
      </div>`;
    const sec = (label, list, selN, cap) => {
      if (!list.length) return "";
      const shown = filt(list);
      const rows = shown.length ? shown.map(spellRow).join("") : `<div class="mc-target-note">No matches.</div>`;
      return `<div class="mc-section-label">${label} <span class="mc-spell-count ${selN > cap ? "mc-over" : selN === cap ? "mc-full" : ""}">${selN}/${cap}</span></div>${rows}`;
    };
    return head + filterBar
      + `<div class="mc-spellpick-body">
          ${sec("Cantrips", opts.cantrips, selCant, si.knownCantrips)}
          ${sec(si.prepared ? "Spells to prepare" : "Spells", opts.leveled, selLev, si.knownSpells)}
        </div>
        <button class="mc-cg-finish" data-action="char-gen-spell-apply">Add spells</button>`;
  }
  #toggleSpellSel(uuid) {
    const cg = this.#charGen; if (!cg) return;
    const sel = cg.spellSel ?? (cg.spellSel = new Set());
    // No cap-block — over-picking is allowed (the DM may permit it); the count
    // just turns red over the limit (warnings, not walls).
    if (sel.has(uuid)) sel.delete(uuid); else sel.add(uuid);
    this.render();
  }
  async #applySpells(actor) {
    const cg = this.#charGen; if (!actor || !cg) return;
    const sel = cg.spellSel ?? new Set();
    const opts = this.#charGenSpellOptions ?? { cantrips: [], leveled: [] };
    const haveNames = new Set(actor.items.filter(i => i.type === "spell").map(i => i.name));
    const toAdd = [];
    for (const s of [...opts.cantrips, ...opts.leveled]) {
      if (!sel.has(s.uuid) || haveNames.has(s.name)) continue; // add-only (no removal)
      const doc = await fromUuid(s.uuid);
      if (!doc) continue;
      const data = doc.toObject();
      foundry.utils.setProperty(data, "system.preparation.mode", "prepared");
      foundry.utils.setProperty(data, "system.preparation.prepared", true);
      toAdd.push(data);
    }
    try {
      const created = toAdd.length ? await actor.createEmbeddedDocuments("Item", toAdd) : [];
      // dnd5e resets preparation.prepared to false on create; a known caster's
      // leveled spells must be prepared to be castable (cantrips auto-become mode
      // "always" and are fine). Re-prepare the leveled ones in a follow-up update.
      const reprep = created
        .filter(i => (i.system?.level ?? 0) > 0 && i.system?.preparation?.mode === "prepared" && !i.system.preparation.prepared)
        .map(i => ({ _id: i.id, "system.preparation.prepared": true }));
      if (reprep.length) await actor.updateEmbeddedDocuments("Item", reprep);
    } catch (e) { return ui.notifications.warn(`Couldn't add spells: ${e.message}`); }
    cg.picking = null; this.#charGenSpellOptions = null;
    this.render();
    ui.notifications.info(toAdd.length ? `Learned ${toAdd.length} spell${toAdd.length > 1 ? "s" : ""}.` : "No new spells added.");
  }

  // ===== Starting equipment (class + background) ============================
  // dnd5e stores startingEquipment as an OR/AND/linked/category tree. We auto-grant
  // the fixed items and present each OR as a tap choice — concrete items, a gold
  // alternative (2024 "take gold instead"), or a category ("any simple weapon") that
  // opens a nested pick. Once on the actor's items, this never re-runs (warnings,
  // not walls — the DM can still adjust).

  #stripHtml(s) { return String(s ?? "").replace(/<[^>]+>/g, "").replace(/&times;/g, "×").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim(); }
  #equipPlanFor(item) {
    const se = item?.system?.startingEquipment ?? [];
    const top = se.filter(e => !e.group);
    const auto = [], choices = []; let autoGold = 0;
    const linked = (entry) => { const out = []; const walk = e => { if (e.type === "linked" && e.key) out.push({ uuid: e.key, count: e.count || 1 }); (e.children ?? []).forEach(walk); }; walk(entry); return out; };
    // Fixed wealth granted outright (not an "or gold" choice) — e.g. a background's
    // flat starting gold. Walk the entry so nested wealth counts too.
    const wealthOf = (entry) => { let g = 0; const walk = e => { if (e.type === "wealth") g += Number(e.count ?? e.key) || 0; (e.children ?? []).forEach(walk); }; walk(entry); return g; };
    for (const e of top) {
      if (e.type === "OR") {
        const options = (e.children ?? []).map(c => {
          if (c.type === "wealth") return { label: this.#stripHtml(c.label), kind: "gold", gold: Number(c.count ?? c.key) || 0 };
          if (["weapon", "armor", "tool", "focus"].includes(c.type)) return { label: this.#stripHtml(c.label), kind: "category", catType: c.type, catKey: c.key };
          return { label: this.#stripHtml(c.label), kind: "items", items: linked(c) };
        });
        choices.push({ label: this.#stripHtml(e.label), options });
      } else { auto.push(...linked(e)); autoGold += wealthOf(e); }
    }
    return { auto, choices, autoGold };
  }
  #charGenEquip(source) {
    const actor = this.actor, cg = this.#charGen; if (!actor || !cg) return;
    if (source !== "class" && source !== "background") source = "class";
    const item = actor.items.find(i => i.type === source);
    const plan = item ? this.#equipPlanFor(item) : { auto: [], choices: [], autoGold: 0 };
    cg.equip = { source, plan, sel: plan.choices.map(() => 0), catUuid: {}, catOpen: null, catOptions: null };
    cg.picking = "equip";
    this.render();
  }
  #equipPickerHTML() {
    const eq = this.#charGen?.equip;
    const srcLabel = eq?.source === "background" ? "Background" : "Class";
    const head = `<div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="char-gen-pick-back" aria-label="Back"><i class="fas fa-arrow-left"></i></button>
        <span class="mc-picker-title">${srcLabel} equipment</span>
      </div>`;
    if (!eq) return head + `<div class="mc-target-note">No starting equipment.</div>`;
    if (eq.catOpen != null) return head + this.#equipCatBodyHTML(eq);
    const prior = this.actor?.getFlag(MODULE_ID, "equipGranted")?.[eq.source];
    const choiceHTML = eq.plan.choices.map((ch, ci) => {
      const opts = ch.options.map((o, oi) => {
        const on = eq.sel[ci] === oi;
        const needsPick = o.kind === "category" && on && !eq.catUuid[ci];
        const picked = o.kind === "category" && eq.catUuid[ci];
        const sub = picked ? ` — ${foundry.utils.escapeHTML(this.#charGenEquipCatName(ci))}` : (needsPick ? " — tap to choose" : "");
        const icon = o.kind === "gold" ? "fa-coins" : o.kind === "category" ? "fa-list" : "fa-box";
        return `<button class="mc-equip-opt ${on ? "mc-on" : ""}" data-action="equip-opt" data-ci="${ci}" data-oi="${oi}">
            <i class="fas ${on ? "fa-circle-dot" : "fa-circle"} mc-equip-radio"></i>
            <i class="fas ${icon} mc-equip-ico"></i>
            <span class="mc-equip-label">${foundry.utils.escapeHTML(o.label)}${sub}</span>
          </button>`;
      }).join("");
      return `<div class="mc-equip-choice"><div class="mc-section-label">Choose one</div>${opts}</div>`;
    }).join("");
    const grantedBanner = prior
      ? `<div class="mc-equip-auto mc-equip-granted"><i class="fas fa-circle-check"></i> Already added: ${foundry.utils.escapeHTML(prior.summary || "granted")}</div>` : "";
    const autoBits = [];
    if (eq.plan.auto.length) autoBits.push(`${eq.plan.auto.length} fixed item${eq.plan.auto.length > 1 ? "s" : ""}`);
    if (eq.plan.autoGold) autoBits.push(`${eq.plan.autoGold} gp`);
    const autoNote = autoBits.length
      ? `<div class="mc-equip-auto"><i class="fas fa-check"></i> Also granted: ${autoBits.join(" + ")}</div>` : "";
    return head + `<div class="mc-equip-body">${grantedBanner}${choiceHTML || `<div class="mc-target-note">No equipment choices.</div>`}${autoNote}</div>`
      + `<button class="mc-cg-finish" data-action="equip-apply">${prior ? "Grant again" : "Add equipment"}</button>`;
  }
  #charGenEquipCatName(ci) {
    return this.#charGen?.equip?.catName?.[ci] ?? "chosen";
  }
  // Nested category pick: scan Item compendiums for the catType, loosely filtered
  // by the category key (weapon proficiency / armor / tool / focus).
  async #openEquipCat(ci) {
    const eq = this.#charGen?.equip; if (!eq) return;
    const opt = eq.plan.choices[ci]?.options[eq.sel[ci]];
    if (!opt || opt.kind !== "category") return;
    eq.catOpen = ci; eq.catOptions = null;
    this.render();
    const out = [];
    const wpMap = CONFIG.DND5E?.weaponProficienciesMap ?? {};
    // starting equipment is mundane: skip magic items (any rarity) and "+N" variants.
    const mundane = (e) => !e.system?.rarity && !/\s\+\d\b/.test(e.name);
    const match = (e) => {
      if (!mundane(e)) return false;
      const tv = e.system?.type?.value;
      if (opt.catType === "weapon") return !opt.catKey || wpMap[tv] === opt.catKey || tv === opt.catKey;
      if (opt.catType === "focus") return tv === "focus";
      return !opt.catKey || tv === opt.catKey; // armor/tool
    };
    for (const pack of game.packs) {
      if (pack.metadata.type !== "Item") continue;
      if (!this.#packSourceAllowed(pack.collection)) continue;
      let idx; try { idx = await pack.getIndex({ fields: ["type", "system.type.value", "system.rarity", "system.source.book"] }); } catch (e) { continue; }
      for (const e of idx) {
        if (e.type !== (opt.catType === "focus" ? "equipment" : opt.catType)) continue;
        if (!match(e)) continue;
        out.push({ name: e.name, uuid: `Compendium.${pack.collection}.Item.${e._id}`, src: this.#optionSource(e.system?.source?.book, pack), img: e.img });
      }
    }
    // No name-dedupe: same-named items can differ by source — show every version
    // with its source (the DM scopes sources via the approval handshake later).
    out.sort((a, b) => a.name.localeCompare(b.name) || a.src.localeCompare(b.src));
    if (this.#charGen?.equip?.catOpen === ci) { this.#charGen.equip.catOptions = out; this.render(); }
  }
  #equipCatBodyHTML(eq) {
    if (eq.catOptions === null) return `<div class="mc-target-note">Loading options…</div>`;
    if (!eq.catOptions.length) return `<div class="mc-target-note">No matching items found.</div>`;
    const rows = eq.catOptions.map(o => `<button class="mc-equip-opt" data-action="equip-cat-pick" data-uuid="${o.uuid}">
        <img class="mc-cg-opt-icon" src="${o.img || "icons/svg/item-bag.svg"}" alt="">
        <span class="mc-equip-label">${foundry.utils.escapeHTML(o.name)}${o.src ? `<span class="mc-spellpick-src">${foundry.utils.escapeHTML(o.src)}</span>` : ""}</span>
      </button>`).join("");
    return `<div class="mc-equip-body">${rows}</div>`;
  }
  #selectEquipOption(ci, oi) {
    const eq = this.#charGen?.equip; if (!eq) return;
    eq.sel[ci] = oi;
    const opt = eq.plan.choices[ci]?.options[oi];
    if (opt?.kind === "category") { if (!eq.catUuid[ci]) return this.#openEquipCat(ci); } // pick the specific item
    this.render();
  }
  #pickEquipCat(uuid) {
    const eq = this.#charGen?.equip; if (!eq || eq.catOpen == null) return;
    eq.catUuid[eq.catOpen] = uuid;
    (eq.catName ??= {})[eq.catOpen] = (eq.catOptions ?? []).find(o => o.uuid === uuid)?.name; // keep the label after options clear
    eq.catOpen = null; eq.catOptions = null;
    this.render();
  }
  async #applyEquip(actor) {
    const eq = this.#charGen?.equip; if (!actor || !eq) return;
    const want = [...eq.plan.auto.map(i => ({ uuid: i.uuid, count: i.count }))];
    let gold = eq.plan.autoGold || 0;
    eq.plan.choices.forEach((ch, ci) => {
      const o = ch.options[eq.sel[ci]];
      if (!o) return;
      if (o.kind === "items") want.push(...o.items.map(i => ({ uuid: i.uuid, count: i.count })));
      else if (o.kind === "gold") gold += o.gold || 0;
      else if (o.kind === "category" && eq.catUuid[ci]) want.push({ uuid: eq.catUuid[ci], count: 1 });
    });
    const toAdd = [], names = [];
    for (const w of want) {
      const doc = await fromUuid(w.uuid); if (!doc) continue;
      const data = doc.toObject();
      if (w.count > 1 && "quantity" in (data.system ?? {})) data.system.quantity = w.count;
      toAdd.push(data);
      names.push(w.count > 1 ? `${doc.name} ×${w.count}` : doc.name);
    }
    try {
      if (toAdd.length) await actor.createEmbeddedDocuments("Item", toAdd);
      if (gold) await actor.update({ "system.currency.gp": (actor.system.currency?.gp ?? 0) + gold });
      // Record what THIS source granted so its row shows the list + a ✓, and a re-tap
      // is a deliberate "Grant again" rather than the silent duplicate that bit us.
      const summaryBits = [...names];
      if (gold) summaryBits.push(`${gold} gp`);
      const grant = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "equipGranted") || {});
      grant[eq.source] = { summary: summaryBits.join(", ") || "nothing", count: toAdd.length, gold };
      await actor.setFlag(MODULE_ID, "equipGranted", grant);
    } catch (e) { return ui.notifications.warn(`Couldn't add equipment: ${e.message}`); }
    this.#charGen.picking = null; this.#charGen.equip = null;
    this.render();
    ui.notifications.info(`Added ${toAdd.length} item${toAdd.length === 1 ? "" : "s"}${gold ? ` + ${gold} gp` : ""}.`);
  }

  // Ability scores — three methods: point-buy (27-pt budget), standard array, and
  // 4d6-drop-lowest roll. Working state lives on #charGen while editing; Apply
  // writes to the actor. Point-buy edits #charGen.abil (8–15 each via ±). Array
  // and roll assign a fixed value pool (#charGen.pool) to abilities via
  // #charGen.assign (ability → pool index, so duplicate rolled scores stay
  // distinct). Default method = point-buy.
  #openAbilities() {
    const cg = this.#charGen; if (!cg) return;
    cg.abilMethod = cg.abilMethod || "pointbuy";
    this.#resetPointBuy(cg);
    cg.pool = cg.abilMethod === "array" ? STANDARD_ARRAY.slice()
      : cg.abilMethod === "roll" ? (cg.rolled ?? null) : null;
    cg.assign = {};
    cg.picking = "abilities";
    this.render();
  }
  #resetPointBuy(cg) {
    // Seed from the saved point-buy BASE (abilBase flag), NOT the live value —
    // species/background/class ASIs bake their bonus into system.abilities.X.value,
    // so reading the live value would treat 15+2=17 as out-of-range (→ reset to 8,
    // "refunding" points) or 14+1=15 as a 15 you didn't pay for. Fall back to the
    // live value only before the first Apply (no flag yet).
    const base = this.actor?.getFlag(MODULE_ID, "abilBase") || {};
    const cur = this.actor?.system?.abilities ?? {};
    cg.abil = {};
    for (const k of ABILITIES) {
      const v = Number(base[k] ?? cur[k]?.value);
      cg.abil[k] = (v >= 8 && v <= 15) ? v : 8;
    }
  }
  #setAbilMethod(m) {
    const cg = this.#charGen; if (!cg || cg.abilMethod === m) return;
    cg.abilMethod = m;
    cg.assign = {};
    if (m === "array") cg.pool = STANDARD_ARRAY.slice();
    else if (m === "roll") cg.pool = cg.rolled ?? null; // restore a prior roll if any
    else { cg.pool = null; this.#resetPointBuy(cg); }
    this.render();
  }
  // 4d6, drop the lowest die.
  #roll4d6dl() {
    const d = () => 1 + Math.floor(Math.random() * 6);
    const dice = [d(), d(), d(), d()].sort((a, b) => a - b);
    return dice[1] + dice[2] + dice[3];
  }
  #rollAbilityScores() {
    const cg = this.#charGen; if (!cg) return;
    cg.rolled = Array.from({ length: 6 }, () => this.#roll4d6dl()).sort((a, b) => b - a);
    cg.pool = cg.rolled.slice();
    cg.assign = {};
    this.render();
  }
  // Tap an ability to cycle it through the still-free pool slots, then "unassigned".
  #assignAbility(k) {
    const cg = this.#charGen; if (!cg?.pool) return;
    const usedByOther = new Set(ABILITIES.filter(a => a !== k).map(a => cg.assign?.[a]).filter(i => i != null));
    const cycle = [...cg.pool.map((_, i) => i).filter(i => !usedByOther.has(i)), null];
    const cur = cg.assign?.[k] ?? null;
    cg.assign[k] = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
    this.render();
  }
  #pbUsed(scores) { return ABILITIES.reduce((n, k) => n + (PB_COST[scores[k]] ?? 0), 0); }
  #adjAbility(abil, delta) {
    const cg = this.#charGen; if (!cg?.abil) return;
    const next = Math.max(8, Math.min(15, (cg.abil[abil] ?? 8) + delta));
    if (this.#pbUsed({ ...cg.abil, [abil]: next }) > PB_BUDGET) return; // over budget
    cg.abil[abil] = next;
    this.render();
  }
  async #applyAbilities() {
    const a = this.actor, cg = this.#charGen; if (!a || !cg) return;
    const scores = {};
    if (cg.abilMethod === "pointbuy") {
      for (const k of ABILITIES) scores[k] = cg.abil?.[k] ?? 8;
    } else {
      if (!cg.pool || ABILITIES.some(k => cg.assign?.[k] == null))
        return ui.notifications.warn("Assign every ability score first.");
      for (const k of ABILITIES) scores[k] = cg.pool[cg.assign[k]];
    }
    // `scores` is the chosen BASE per ability. Species/background/class ASIs bake
    // their bonus into `system.abilities.X.value`, so writing the base raw would
    // wipe them. Preserve the bonus = current value − the base we set last time
    // (10 = the blank-PC default on first apply, tracked in a flag for re-apply),
    // and write base + bonus so the racial/background increases still count.
    const prevBase = a.getFlag(MODULE_ID, "abilBase") || {};
    const upd = {};
    for (const k of ABILITIES) {
      const cur = Number(a.system.abilities[k]?.value) || 10;
      const base0 = Number(prevBase[k]) || 10;
      const bonus = Math.max(0, cur - base0); // ASI bonus already applied
      upd[`system.abilities.${k}.value`] = scores[k] + bonus;
    }
    try { await a.update(upd); await a.setFlag(MODULE_ID, "abilBase", scores); }
    catch (e) { return ui.notifications.warn(`Couldn't set scores: ${e.message}`); }
    cg.picking = null; cg.abil = null; cg.assign = {};
    this.render();
    ui.notifications.info("Ability scores set.");
  }
  #abilityPanelHTML() {
    const cg = this.#charGen ?? {};
    const method = cg.abilMethod ?? "pointbuy";
    const seg = (m, label) =>
      `<button class="mc-abil-seg ${method === m ? "mc-on" : ""}" data-action="abil-method" data-method="${m}">${label}</button>`;
    const head = `<div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="char-gen-pick-back" aria-label="Back"><i class="fas fa-arrow-left"></i></button>
        <span class="mc-picker-title">Ability scores</span>
      </div>
      <div class="mc-abil-method">${seg("pointbuy", "Point buy")}${seg("array", "Standard array")}${seg("roll", "Roll")}</div>`;
    const body = method === "pointbuy" ? this.#pointBuyBodyHTML(cg) : this.#assignBodyHTML(cg, method);
    const complete = method === "pointbuy" || (!!cg.pool && ABILITIES.every(k => cg.assign?.[k] != null));
    return head + body
      + `<button class="mc-cg-finish" data-action="char-gen-abil-apply" ${complete ? "" : "disabled"}>Apply scores</button>`;
  }
  #pointBuyBodyHTML(cg) {
    const scores = cg.abil ?? {};
    const left = PB_BUDGET - this.#pbUsed(scores);
    const rows = ABILITIES.map(k => {
      const v = scores[k] ?? 8;
      const label = CONFIG.DND5E.abilities[k]?.label ?? k.toUpperCase();
      const canDec = v > 8;
      const incCost = (PB_COST[Math.min(15, v + 1)] ?? 99) - (PB_COST[v] ?? 0);
      const canInc = v < 15 && (left - incCost) >= 0;
      return `<div class="mc-abil-row">
        <span class="mc-abil-name">${foundry.utils.escapeHTML(label)}</span>
        <button class="mc-pm mc-minus" data-action="abil-dec" data-abil="${k}" ${canDec ? "" : "disabled"}>−</button>
        <span class="mc-abil-val">${v}</span>
        <button class="mc-pm mc-plus" data-action="abil-inc" data-abil="${k}" ${canInc ? "" : "disabled"}>+</button>
      </div>`;
    }).join("");
    return `<div class="mc-abil-budget"><span>Point buy</span><b>${left}</b><span>points left</span></div>
      <div class="mc-abils">${rows}</div>`;
  }
  // Standard array / roll: a fixed value pool assigned one-per-ability. Each
  // ability row is a tap-to-cycle button; the pool strip dims spent values.
  #assignBodyHTML(cg, method) {
    if (method === "roll" && !cg.pool) {
      return `<div class="mc-abil-rollintro">
          <div class="mc-cg-blurb">Roll six scores (4d6, drop the lowest die), then assign each to an ability.</div>
          <button class="mc-abil-roll" data-action="abil-roll"><i class="fas fa-dice-d6"></i> Roll 4d6 ×6</button>
        </div>`;
    }
    const pool = cg.pool ?? [];
    const used = new Set(ABILITIES.map(k => cg.assign?.[k]).filter(i => i != null));
    const chips = pool.map((v, i) =>
      `<span class="mc-abil-chip ${used.has(i) ? "mc-used" : ""}">${v}</span>`).join("");
    const rows = ABILITIES.map(k => {
      const idx = cg.assign?.[k];
      const v = idx != null ? pool[idx] : null;
      const label = CONFIG.DND5E.abilities[k]?.label ?? k.toUpperCase();
      return `<button class="mc-abil-row mc-abil-assignrow" data-action="abil-assign" data-abil="${k}">
        <span class="mc-abil-name">${foundry.utils.escapeHTML(label)}</span>
        <span class="mc-abil-slot ${v == null ? "mc-empty" : ""}">${v == null ? "—" : v}</span>
      </button>`;
    }).join("");
    const reroll = method === "roll"
      ? `<button class="mc-abil-reroll" data-action="abil-roll"><i class="fas fa-rotate"></i> Reroll all</button>` : "";
    return `<div class="mc-abil-pool">${chips}<span class="mc-abil-poolnote">${pool.length - used.size} left</span></div>
      <div class="mc-abils">${rows}</div>${reroll}`;
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

  // DM "Show Players" image, routed onto the phone (the shell hides native windows,
  // so Foundry's own ImagePopout never reaches a phone). Full-screen, tap ✕ to close.
  #sharedImageHTML() {
    const s = this.#sharedImage;
    if (!s?.src) return "";
    return `<div class="mc-imgpop mc-imgpop-shared">
      <button class="mc-imgpop-x" data-action="shared-img-close" aria-label="Close"><i class="fas fa-xmark"></i></button>
      <img class="mc-imgpop-img" src="${s.src}" alt="">
      ${s.title ? `<div class="mc-imgpop-title">${foundry.utils.escapeHTML(s.title)}</div>` : ""}
    </div>`;
  }
  // Called from the shareImage socket relay (main.js) when the DM shares an image.
  showSharedImage(src, title = "") {
    if (!src) return;
    this.#sharedImage = { src, title };
    if (this.rendered) this.render();
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

  // Switchable subjects: every owned token on the active scene, PLUS owned blank
  // PCs (no class) with no token here — so a player can reach a blank PC to BUILD
  // it (char-gen) before the DM drops a token. Token subjects carry tokenId; a
  // blank PC is tokenless (actorId only).
  #subjects() {
    const toks = this.#ownedTokens();
    const list = toks.map(t => ({ actorId: t.actor.id, tokenId: t.id, name: t.actor.name }));
    const seen = new Set(toks.map(t => t.actor.id));
    for (const a of game.actors) {
      if (!a.isOwner || seen.has(a.id) || a.type !== "character") continue;
      // Blank/char-gen PCs (to build them) AND — for a player — any of their own PCs
      // not on this scene, so a JUST-FINISHED tokenless PC stays reachable (the DM
      // hasn't dropped a token yet). Skip the GM's blanket ownership (would list the
      // whole world); the GM reaches characters by selecting their token.
      if (this.#isCharGenPC(a) || !game.user.isGM) {
        list.push({ actorId: a.id, tokenId: null, name: a.name });
      }
    }
    return list;
  }
  #currentSubjectIndex(subs) {
    if (this.#subjectActorId) {
      const i = subs.findIndex(s => s.tokenId == null && s.actorId === this.#subjectActorId);
      if (i >= 0) return i;
    }
    const i = subs.findIndex(s => s.tokenId && s.tokenId === this.originTokenId);
    return i >= 0 ? i : 0;
  }

  // §7.1 token switcher: Prev/Next to change the controlled subject (token or a
  // blank PC to build). Shown when the user has more than one switchable subject.
  #tokenSwitcherHTML() {
    const subs = this.#subjects();
    if (subs.length < 2) return "";
    // Label by the *actor* (sheet) name + position (i/n): the actor name is the
    // one players recognize (DM 2026-06-16), and the position counter still makes
    // a switch obvious even when two tokens share an actor or look alike.
    const i = this.#currentSubjectIndex(subs);
    const label = subs[i]?.name ?? this.actor?.name ?? "—";
    return `<div class="mc-tokensw">
      <button class="mc-tokensw-btn" data-action="token-prev" aria-label="Previous token"><i class="fas fa-chevron-left"></i></button>
      <span class="mc-tokensw-name">${foundry.utils.escapeHTML(label)} <span class="mc-tokensw-count">${i + 1}/${subs.length}</span></span>
      <button class="mc-tokensw-btn" data-action="token-next" aria-label="Next token"><i class="fas fa-chevron-right"></i></button>
    </div>`;
  }

  #cycleSubject(dir) {
    const subs = this.#subjects();
    if (subs.length < 2) return;
    const i = this.#currentSubjectIndex(subs);
    const next = subs[(i + dir + subs.length) % subs.length];
    if (next.tokenId) { this.#subjectId = next.tokenId; this.#subjectActorId = null; }
    else { this.#subjectActorId = next.actorId; this.#subjectId = null; }
    this.#moveBudget = null; // the readout was for the previous subject's token
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
    // Speed shows the ACTIVE travel mode's icon + its speed, and taps → the picker.
    const activeMode = this.#activeMoveMode(actor);
    const am = this.#movementModes(actor).find((m) => m.key === activeMode);
    const speedNum = am ? am.speed : (move.walk != null ? move.walk : null);
    const speed = speedNum == null ? "—"
      : `${activeMode ? `<i class="fas ${this.#moveModeIcon(activeMode)} mc-speed-ico"></i> ` : ""}${speedNum}`;
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
        ${estat("mc-gray mc-tappable", "speed-picker", "Speed", speed)}
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
    // Class/subclass/species/background are progression items, not usable actions —
    // never list them in Favorites even if dnd5e (or the desktop sheet) favorited
    // them. System-wide: applies to every character (DM 2026-06-21).
    if (type === "item" && ["class", "subclass", "race", "species", "background"].includes(doc.type)) return "";
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
    // Exclude item-granted spells (a Cast activity caches its linked spell with
    // flags.dnd5e.cachedFor) — they muddy the spellbook with staff/wand spells.
    // They stay usable in the Actions tab (the activity scan still surfaces them).
    const spellItems = actor.items.filter(i => i.type === "spell" && !i.getFlag?.("dnd5e", "cachedFor"));
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
      const lvlSpells = byLevel.get(lvl).sort((a, b) => a.name.localeCompare(b.name));
      const rows = lvlSpells.map(sp => this.#spellRowHTML(sp)).join("");
      const label = lvl === 0 ? "Cantrips" : `${ordinal(lvl)} level`;
      const slot = spells[`spell${lvl}`];
      const headPips = (lvl >= 1 && (slot?.max ?? 0) > 0) ? pips(slot.value, slot.max) : "";
      // Learned count near the header — prepared/known for prepared casters at this
      // level, else just the number known (DM 2026-06-19).
      const known = lvlSpells.length;
      const isPrep = lvl >= 1 && lvlSpells.some(sp => sp.system.preparation?.mode === "prepared");
      const preparedN = lvlSpells.filter(sp => { const p = sp.system.preparation ?? {}; return p.prepared || p.mode !== "prepared"; }).length;
      const countBadge = `<span class="mc-spell-count">${isPrep ? `${preparedN}/${known}` : known}</span>`;
      return `<div class="mc-actions-sub mc-spell-sub">${label}${countBadge}${headPips}</div><div class="mc-spells">${rows}</div>`;
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
    // Drop electrum (ep) from the row — rarely used, and it lets the remaining
    // four coins sit on one line (DM 2026-06-18). The ep value is untouched, just hidden.
    const order = Object.keys(CONFIG.DND5E?.currencies ?? { pp: 1, gp: 1, sp: 1, cp: 1 }).filter(k => k !== "ep");
    // Tap-to-edit: each coin is a numeric input (mobile numpad); writes the new
    // amount to system.currency.<k> on blur/Enter (#onChange). DM 2026-06-18.
    const chips = order.map(k =>
      `<label class="mc-coin mc-coin-${k}"><input class="mc-coin-input" type="number" inputmode="numeric" min="0" step="1" data-coin="${k}" value="${cur[k] ?? 0}" aria-label="${k}"><span class="mc-coin-label">${k}</span></label>`).join("");
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
        ? `<div class="mc-inv-main" data-action="action-pick" data-uuid="${usable[0].uuid}" data-item-id="${item.id}">`
        // Non-usable items (armor, ammo, plain gear, "other", player-made with no
        // activity) still carry data-item-id so a long-press opens their details
        // popup — without it the row had no detail target and nothing happened.
        : `<div class="mc-inv-main" data-item-id="${item.id}">`;
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

    // Full skills list (same model as the dnd5e sheet): proficiency dot
    // (empty/half/full/full-with-ring), governing ability (3-letter), the roll
    // bonus, and the native roll flow on tap (rollSkill).
    const skills = sys.skills ?? {};
    const skillRows = Object.keys(CONFIG.DND5E.skills ?? {}).map(key => {
      const sk = skills[key] ?? {};
      const label = CONFIG.DND5E.skills[key]?.label ?? key;
      const abil = (sk.ability ?? CONFIG.DND5E.skills[key]?.ability ?? "").toUpperCase();
      const total = sk.total;
      return `<button class="mc-skillrow" data-action="skill" data-skill="${key}" data-detail="skill">
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
      return `<button class="mc-skillrow" data-action="tool" data-tool="${key}" data-detail="tool">
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
    // Item-backed row: each value is long-pressable for the item's description
    // (same #detailTargetFor → #showDetails path as inventory rows). Used for
    // race/background, whose items carry real descriptions (DM: long-press "all
    // the stuff in the character info area").
    const itemRow = (k, items) => items.length
      ? `<div class="mc-detail-row"><span class="mc-detail-key">${k}</span><span class="mc-detail-val">${items.map(i => `<span class="mc-detail-link" data-item-id="${i.id}">${foundry.utils.escapeHTML(i.name)}</span>`).join(", ")}</span></div>`
      : "";
    const raceItems = actor.items.filter(i => i.type === "race" || i.type === "species");
    const bgItems = actor.items.filter(i => i.type === "background");
    const featItems = actor.items.filter(i => i.type === "feat");
    const featChips = featItems.length
      ? `<div class="mc-section-label">Feats &amp; Features</div><div class="mc-feat-chips">${featItems.map(i => `<span class="mc-feat-chip" data-item-id="${i.id}">${foundry.utils.escapeHTML(i.name)}</span>`).join("")}</div>`
      : "";
    // Defenses, split into the dnd5e categories (DM 2026-06-19): resistances (dr),
    // damage immunities (di), condition immunities (ci — condition labels, not
    // damage types), vulnerabilities (dv), and damage modification (dm.amount,
    // a {damageType: ±N} map, e.g. "Force +2").
    const condTraits = (path) => {
      const t = foundry.utils.getProperty(sys, path) ?? {};
      const vals = Array.from(t.value ?? []).map(k => CONFIG.DND5E.conditionTypes?.[k]?.label ?? k);
      if (t.custom) vals.push(...String(t.custom).split(";").map(s => s.trim()).filter(Boolean));
      return vals;
    };
    const dmgMods = () => {
      const dm = sys.traits?.dm?.amount ?? {};
      return Object.entries(dm).filter(([, v]) => v !== "" && v != null).map(([k, v]) => {
        const label = CONFIG.DND5E.damageTypes[k]?.label ?? k;
        const n = Number(v);
        const amt = Number.isFinite(n) ? (n >= 0 ? `+${n}` : `${n}`) : String(v);
        return `${label} ${amt}`;
      });
    };
    const defSec = (label, chips, cls) => chips.length
      ? `<div class="mc-section-label">${label}</div><div class="mc-defenses">${chips.map(l =>
          `<span class="mc-def mc-def-${cls}">${foundry.utils.escapeHTML(l)}</span>`).join("")}</div>`
      : "";
    const defenseSec = defSec("Resistances", dmgTraits("traits.dr"), "res")
      + defSec("Damage Immunities", dmgTraits("traits.di"), "imm")
      + defSec("Condition Immunities", condTraits("traits.ci"), "cimm")
      + defSec("Vulnerabilities", dmgTraits("traits.dv"), "vuln")
      + defSec("Damage Modification", dmgMods(), "dmod");

    return `
      <div class="mc-section-label">Skills</div>
      <div class="mc-skillrows">${skillRows}</div>
      ${toolsBlock}
      <div class="mc-detail-sec">
        ${itemRow("Race", raceItems)}
        ${itemRow("Background", bgItems)}
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
    // Render the last move readout from #moveBudget (not blank): a combat re-render
    // (frequent — every updateCombat/updateCombatant) would otherwise reset the note
    // to empty right after #move set it, so the counter "vanished" mid-turn.
    const nb = this.#moveBudget;
    // Readout ABOVE the pad (over the Up key), not below: under the down row it sat
    // right where the thumb rests during a move, so the DM couldn't see it (2026-06-21).
    return `
      <div class="${nb?.cls ?? "mc-move-note"}" data-role="move-note">${nb ? foundry.utils.escapeHTML(nb.text) : ""}</div>
      <div class="mc-dpad">
        ${cell(-1, -1)}${cell(0, -1)}${cell(1, -1)}
        ${cell(-1, 0)}${blank}${cell(1, 0)}
        ${cell(-1, 1)}${cell(0, 1)}${cell(1, 1)}
      </div>`;
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

  // Dice tray (header D20): roll any die with no context — e.g. a DM "1-10 the
  // guard sneezes, 11-20 he doesn't" luck check. Pure core Roll API: it posts a
  // PUBLIC chat message, so the existing createChatMessage hook toasts it on the
  // phone AND Dice So Nice — if installed — animates the 3D dice on the TV.
  // Neither DSN nor any dice-tray module is required; both are merely supported.
  #dtrayFormula() {
    const parts = Object.keys(this.#dtrayPool).map(Number)
      .filter(f => this.#dtrayPool[f] > 0)
      .sort((a, b) => b - a)
      .map(f => `${this.#dtrayPool[f]}d${f}`);
    let formula = parts.join(" + ");
    const m = this.#dtrayMod;
    // ASCII operators only — this string is fed to new Roll(), which won't parse
    // a typographic minus (the on-screen "−" buttons are display-only).
    if (m) formula = formula ? `${formula} ${m > 0 ? "+" : "-"} ${Math.abs(m)}` : `${m}`;
    return formula;
  }

  #diceTrayHTML() {
    const DICE = [4, 6, 8, 10, 12, 20, 100];
    const formula = this.#dtrayFormula();
    const dieBtns = DICE.map(f => {
      const n = this.#dtrayPool[f] || 0;
      return `<button class="mc-dtray-die ${n ? "mc-has" : ""}" data-action="dtray-add" data-faces="${f}"><i class="fas fa-dice-d20"></i>d${f}${n ? `<span class="mc-dtray-n">${n}</span>` : ""}</button>`;
    }).join("");
    const m = this.#dtrayMod;
    return `<div class="mc-dtray">
      <div class="mc-dtray-formula ${formula ? "" : "mc-empty"}">${formula ? foundry.utils.escapeHTML(formula) : "Tap dice to build a roll"}</div>
      <div class="mc-dtray-dice">${dieBtns}</div>
      <div class="mc-dtray-row">
        <span class="mc-dtray-modlabel">Mod</span>
        <button class="mc-pm mc-minus" data-action="dtray-mod" data-delta="-1">−</button>
        <span class="mc-dtray-mod">${m > 0 ? `+${m}` : m}</span>
        <button class="mc-pm mc-plus" data-action="dtray-mod" data-delta="1">+</button>
        <button class="mc-dtray-clear" data-action="dtray-clear">Clear</button>
        <button class="mc-dtray-roll" data-action="dtray-roll"><i class="fas fa-dice-d20"></i> Roll</button>
      </div>
    </div>`;
  }

  async #rollDiceTray() {
    if (!Object.values(this.#dtrayPool).some(n => n > 0)) {
      return ui.notifications.info("Dice tray: tap a die first.");
    }
    const formula = this.#dtrayFormula();
    let roll;
    try {
      roll = await new Roll(formula).evaluate();
    } catch (e) {
      return ui.notifications.warn(`Dice tray: couldn't roll "${formula}".`);
    }
    // Force PUBLIC so the roll always reaches the shared TV (and players can't
    // change roll mode from the phone anyway). DSN animates it there if present.
    await roll.toMessage(
      { speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: "Dice tray" },
      { rollMode: CONST.DICE_ROLL_MODES.PUBLIC }
    );
    // Keep the pool so repeated Roll taps re-roll the same dice (spam a luck
    // check); Clear resets it. noteRoll (createChatMessage hook) toasts the result.
  }

  // Tap-to-open header/Explore controls toggle: re-tapping the trigger of the
  // card that's already showing closes it back to the sheet. The detail card
  // renders in the content area, so the header trigger stays visible above it
  // (DM 2026-06-19). Identity is the card's `kind` tag (ac / character / travel).
  #detailCardIs(kind) { return this.#detailCard?.kind === kind; }
  #closeDetail() { this.#detailCard = null; this.#detailStack = []; this.#dropArmed = null; }

  // Class / subclass / level breakdown + XP bar, opened by tapping the Lvl
  // button (a button, not a long-press). This is where class/subclass/level/XP
  // now live — the duplicated rows were removed from the Details tab.
  #levelsHTML(actor) {
    if (this.#levelUp) return this.#levelUpPanelHTML(actor);
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
      ${classes.length ? `<button class="mc-lvlup-btn" data-action="level-up-open"><i class="fas fa-arrow-up-right-dots"></i> Level up</button>` : ""}
    </div>`;
  }
  // Level-up flow (from the Lvl panel): pick which class to level — the actor's
  // existing classes are the highlighted primary choices (forLevelChange +1) — or
  // add a different class (multiclass → the real advancement popup via forNewItem).
  #levelUpPanelHTML(actor) {
    const lu = this.#levelUp;
    const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
    const classes = actor.items.filter(i => i.type === "class");
    const head = `<div class="mc-cond-panel-head">
        <span>Level up</span>
        <button class="mc-cond-close" data-action="level-up-back" aria-label="Back"><i class="fas fa-arrow-left"></i></button>
      </div>`;
    if (lu.adding) {
      if (lu.options === null) return `<div class="mc-levels-panel">${head}<div class="mc-target-note">Loading classes…</div></div>`;
      const have = new Set(classes.map(c => c.system.identifier));
      const rows = lu.options.map(o => `<button class="mc-cg-opt ${have.has(o.identifier) ? "mc-on" : ""}" data-action="level-up-pick" data-uuid="${o.uuid}">
          <img class="mc-cg-opt-icon" src="${o.img || "icons/svg/mystery-man.svg"}" alt="">
          <span class="mc-cg-opt-text"><span class="mc-cg-opt-name">${esc(o.name)}</span><span class="mc-cg-opt-src">${esc(o.src)}</span></span>
        </button>`).join("") || `<div class="mc-target-note">No classes found.</div>`;
      return `<div class="mc-levels-panel">${head}<div class="mc-lvlup-sub">Add a class — your current ones are highlighted</div><div class="mc-cg-opts">${rows}</div></div>`;
    }
    const total = classes.reduce((n, c) => n + (c.system.levels || 0), 0);
    const rows = classes.map(c => `<button class="mc-lvlup-class mc-on" data-action="level-up-class" data-class-id="${c.id}">
        <span class="mc-lvlup-name">${esc(c.name)}</span>
        <span class="mc-lvlup-arrow">${c.system.levels ?? 0} <i class="fas fa-arrow-right"></i> ${(c.system.levels ?? 0) + 1}</span>
      </button>`).join("") || `<div class="mc-target-note">No classes to level.</div>`;
    return `<div class="mc-levels-panel">${head}
        <div class="mc-lvlup-sub">Which class? (character level ${total})</div>
        ${rows}
        <button class="mc-lvlup-add" data-action="level-up-add"><i class="fas fa-plus"></i> Add a different class (multiclass)</button>
      </div>`;
  }
  #openLevelUp() { this.#levelUp = { adding: false, options: null }; this.render(); }
  #closeLevelUp() {
    // Back from the multiclass list returns to the class choice; back from the class
    // choice closes the flow.
    if (this.#levelUp?.adding) this.#levelUp = { adding: false, options: null };
    else this.#levelUp = null;
    this.render();
  }
  #doLevelUp(classId) {
    const actor = this.actor; if (!actor || !classId) return;
    this.#levelUp = null; this.#showLevels = false; this.render();
    try {
      const AM = dnd5e.applications?.advancement?.AdvancementManager ?? dnd5e.documents?.advancement?.AdvancementManager;
      AM.forLevelChange(actor, classId, 1).render(true); // dnd5e advancement popup, lifted onto the phone
    } catch (e) { console.error("mobile-command | level-up failed", e); ui.notifications.warn("Couldn't start level-up — see console."); }
  }
  async #openMulticlass() {
    this.#levelUp = { adding: true, options: null }; this.render();
    const out = [];
    for (const pack of game.packs) {
      if (pack.metadata.type !== "Item" || !this.#packSourceAllowed(pack.collection)) continue;
      let idx; try { idx = await pack.getIndex({ fields: ["type", "system.identifier", "system.source.book"] }); } catch (e) { continue; }
      for (const e of idx) if (e.type === "class") out.push({ name: e.name, uuid: `Compendium.${pack.collection}.Item.${e._id}`, identifier: e.system?.identifier, src: this.#optionSource(e.system?.source?.book, pack), img: e.img });
    }
    out.sort((a, b) => a.name.localeCompare(b.name) || a.src.localeCompare(b.src));
    if (this.#levelUp?.adding) { this.#levelUp.options = out; this.render(); }
  }
  async #addMulticlass(uuid) {
    const actor = this.actor; if (!actor) return;
    const item = await fromUuid(uuid);
    this.#levelUp = null; this.#showLevels = false; this.render();
    if (!item) return ui.notifications.warn("That class couldn't load.");
    try {
      const AM = dnd5e.applications?.advancement?.AdvancementManager ?? dnd5e.documents?.advancement?.AdvancementManager;
      AM.forNewItem(actor, item.toObject()).render(true);
    } catch (e) { console.error("mobile-command | multiclass add failed", e); ui.notifications.warn(`Couldn't add ${item.name}.`); }
  }

  // Condition palette (header): the standard dnd5e conditions from
  // CONFIG.statusEffects, active ones highlighted; tap toggles via the
  // document-level actor.toggleStatusEffect (no canvas needed; dnd5e applies
  // riders like unconscious→prone). Concentration is special — shown as a
  // break button, never a manual add. Exhaustion is leveled (0–6) → a −/value/+
  // stepper (below), not an on/off toggle.
  #conditionPaletteHTML(actor) {
    const active = actor.statuses;
    const conc = CONFIG.specialStatusEffects?.CONCENTRATING;
    const conditions = (CONFIG.statusEffects ?? []).filter(s => s.id && s.id !== conc && s.id !== "exhaustion");
    const cells = conditions.map(s => {
      const on = active?.has?.(s.id);
      return `<button class="mc-cond-opt ${on ? "mc-on" : ""}" data-action="cond-toggle" data-status="${s.id}" data-detail="status">
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
        <span>Conditions — tap to toggle, hold for details</span>
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
    // "Your turn" = the current combatant is one of MINE (#myCombatants handles both
    // token-linked NPC copies and actor-linked PC combatants with a null tokenId — a
    // raw token compare disabled End turn for the latter, DM 2026-06-21).
    const cur = combat.combatant;
    const isMyTurn = !!cur && this.#myCombatants(combat).some(c => c.id === cur.id);
    const label = isMyTurn ? "Your turn"
      : `Up: ${foundry.utils.escapeHTML(cur?.name ?? "—")}`;
    return `<div class="mc-turnhud ${isMyTurn ? "mc-myturn" : ""}">
      <span class="mc-turn-label">${label}</span>
      <button class="mc-endturn" data-action="end-turn" ${isMyTurn ? "" : "disabled"}>End turn</button>
    </div>`;
  }

  // Players have no combat tracker, so when the DM adds them to an encounter
  // (combat exists, they're a combatant, initiative not yet rolled) surface a
  // prominent "Roll initiative" prompt. This covers the pre-start roll phase —
  // the Turn HUD above only appears once combat has *started* (DM 2026-06-20).
  // The combatant(s) for the CURRENT subject. An NPC actor with several tokens in the
  // encounter shares ONE base actor id, so matching by actor id alone returned every
  // copy — the GM picked one token and got them all rolling/prompting (DM 2026-06-21:
  // "2 NPCs roll when I select one"). But PC combatants are often ACTOR-linked with a
  // null tokenId, so a pure token match wrongly EXCLUDED the player (live: Belnor's
  // combatant has tokenId=null → End turn disabled + initiative re-spawned a dupe,
  // 2026-06-21). So: a token-linked combatant matches only its own token (precise for
  // multi-token NPCs); an actor-linked one (null tokenId) matches by actor.
  #myCombatants(combat = game.combat) {
    if (!combat) return [];
    const tokenId = this.originTokenId;
    const actorId = this.actor?.id;
    return combat.combatants.filter(c =>
      c.tokenId == null ? c.actor?.id === actorId : (tokenId && c.tokenId === tokenId)
    );
  }

  #initPromptHTML() {
    const combat = game.combat;
    if (!combat) return "";
    const me = this.#myCombatants(combat)[0];
    if (!me || me.initiative != null) return ""; // not in this combat, or already rolled
    return `<div class="mc-turnhud mc-myturn mc-init-prompt">
      <span class="mc-turn-label"><i class="fas fa-dice-d20" style="margin-right:6px"></i>Roll initiative</span>
      <button class="mc-endturn" data-action="roll-init">Roll</button>
    </div>`;
  }

  // Initiative from the phone — the player's only entry (no tracker). Opens
  // dnd5e's roll-config dialog (lifted above the shell like saves) and writes the
  // combatant's initiative. The old handler fired it with ?.() and swallowed any
  // rejection; now we guard for an active combat, await, and surface failures.
  async #rollInitiative() {
    const actor = this.actor;
    if (!actor) return;
    if (!game.combat) {
      ui.notifications.info("No active encounter yet — ask the DM to start combat.");
      return;
    }
    try {
      // Roll the EXISTING combatant for THIS subject token. Calling
      // actor.rollInitiativeDialog() on a canvas-off phone can ADD a second,
      // token-based combatant alongside the one already in the tracker → duplicate
      // combatant and a double roll. And matching by actor id alone rolled every
      // token of a multi-token NPC (the GM picks one, several roll) — #myCombatants
      // scopes to the subject token. Only fall back to the dialog if this subject
      // truly isn't in the encounter yet.
      const mine = this.#myCombatants().map(c => c.id);
      if (mine.length) await game.combat.rollInitiative(mine);
      else await actor.rollInitiativeDialog();
    } catch (e) {
      console.error("mobile-command | initiative roll failed", {
        hasCombat: !!game.combat,
        isCombatant: !!game.combat?.combatants?.some(c => c.actor?.id === actor.id),
        error: e
      });
      ui.notifications.warn("Couldn't roll initiative — check the console (F12) and tell me what it says.");
    }
    if (this.rendered) this.render();
  }

  // Combat-start cue on the phone: a vibration + Foundry's combat sound, so a
  // player watching the TV (phone in hand) knows the fight kicked off. Vibration
  // is Android-only (iOS Safari has no Vibration API → silent no-op) and needs the
  // app foregrounded; the sound needs audio unlocked (true after the first tap of
  // the session). Fires for every phone client on combatStart. DM 2026-06-20.
  alertCombatStart() {
    if (!isPhoneClient()) return;
    try { navigator.vibrate?.([180, 70, 180]); } catch (e) { /* unsupported */ }
    try {
      const src = CONFIG.sounds?.combat;
      if (src) foundry.audio.AudioHelper.play({ src, volume: 0.8, autoplay: true, loop: false }, false);
    } catch (e) { /* audio context may still be locked */ }
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

    const recMode = s.recommendation?.mode;
    const recOf = (mode) => recMode === mode && recMode !== "normal"; // only flag adv/dis, not "normal"
    const advBtn = (mode, label) =>
      `<button class="mc-adv ${s.adv === mode ? "mc-adv-on" : ""} ${recOf(mode) ? "mc-adv-rec" : ""}" data-action="adv" data-mode="${mode}">${label}${recOf(mode) ? ' <i class="fas fa-star mc-adv-rec-star"></i>' : ""}</button>`;
    const rec = s.recommendation;
    const recBanner = !s.hasAttack ? ""
      : s.recPending && !rec ? `<div class="mc-rec mc-rec-pending"><i class="fas fa-circle-notch fa-spin"></i> Checking adv/dis…</div>`
      : rec && rec.reasons?.length
        ? `<div class="mc-rec mc-rec-${rec.mode}">
             <ul class="mc-rec-reasons">${rec.reasons.map((r) => `<li class="mc-rec-${r.kind}">${foundry.utils.escapeHTML(r.label)}</li>`).join("")}</ul>
           </div>`
        : "";

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
        // B8 in-range hint: flag a target past the activity's reach (still tappable).
        const far = s.rangeFt != null && Number(c.distanceFt) > s.rangeFt + 0.5;
        return `<button class="mc-target ${on ? "mc-target-on" : ""} ${far ? "mc-target-far" : ""}" data-action="target-toggle" data-uuid="${c.uuid}">
          <span class="mc-target-name">${foundry.utils.escapeHTML(c.name)}</span>
          <span class="mc-target-right">
            <span class="mc-disp mc-${cls}">${label}</span>
            <span class="mc-target-dist ${far ? "mc-far" : ""}">${Math.round(c.distanceFt)} ft</span>
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
    // Upcast: slot-level chips for leveled spells (badge = slots left at that level).
    const slotRow = (s.slotOptions?.length)
      ? `<div class="mc-slot-row"><span class="mc-slot-label">Cast at</span>${s.slotOptions.map(o =>
          `<button class="mc-slot ${s.slot === o.id ? "mc-slot-on" : ""}" data-action="slot-pick" data-slot="${o.id}" title="Level ${o.level} — ${o.value} left">L${o.level}<span class="mc-slot-n">${o.value}</span></button>`
        ).join("")}</div>`
      : "";
    return `
      <div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="action-back" aria-label="Close"><i class="fas fa-xmark"></i></button>
        <span class="mc-picker-title">${foundry.utils.escapeHTML(s.name)}${s.rangeLabel ? `<span class="mc-picker-range">${foundry.utils.escapeHTML(s.rangeLabel)}</span>` : ""}</span>
        ${count}
      </div>
      ${assignedBanner}
      ${slotRow}
      ${s.hasAttack ? `<div class="mc-adv-row">${advBtn("advantage", "Advantage")}${advBtn("normal", "Normal")}${advBtn("disadvantage", "Disadvantage")}</div>` : ""}
      ${recBanner}
      <div class="mc-targets">${body}${selfRow}</div>
      <button class="mc-fire ${canFire ? "" : "mc-disabled"}" data-action="fire" ${canFire ? "" : "disabled"}>
        ${s.busy ? "Using…" : "Use"}
      </button>`;
  }

  // Upcast (§7.5): the slot levels a leveled spell can be cast at — every slot
  // tier at or above the spell's base level that still has charges. Returns []
  // for cantrips/non-spells (no picker). Mirrors dnd5e's own slot filtering
  // (system.spells keyed by slot id, each {value,max,level}).
  #spellSlotOptions(activity) {
    const item = activity?.item;
    if (item?.type !== "spell") return [];
    const base = item.system?.level ?? 0;
    if (base < 1) return []; // cantrip — no slot
    const spells = this.actor?.system?.spells ?? {};
    return Object.entries(spells)
      .filter(([, s]) => s?.max && s.level >= base && (s.value ?? 0) > 0)
      .map(([id, s]) => ({ id, level: s.level, value: s.value }))
      .sort((a, b) => a.level - b.level);
  }

  async #pickAction(uuid) {
    this.#itemPickerId = null; // leaving any multi-activity picker
    const activity = await fromUuid(uuid);
    if (!activity) {
      console.debug("mobile-command | pickAction: activity not found", { uuid });
      return ui.notifications.warn("That action couldn't load — try reopening the sheet.");
    }
    console.debug("mobile-command | pickAction", {
      name: activity.item?.name, type: activity.type,
      template: activity.target?.template?.type ?? null, affects: activity.target?.affects?.type ?? null
    });
    // AoE push (§11): a no-canvas phone can't place a template, so an area spell
    // asks the DM to place it instead of opening the target picker.
    if (activity.target?.template?.type) return this.#announceCast(activity, "aoe");
    // Summons (#12): route to the DM to place the summoned token(s) rather than
    // auto-resolving silently — the phone has no canvas to drop the token on.
    if (activity.type === "summon") return this.#announceCast(activity, "summon");
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
    const slotOptions = this.#spellSlotOptions(activity); // upcast picker (leveled spells)
    // In-range badge (B8): the activity's max reach in feet (melee reach / normal /
    // long), but only when it's a plain distance in the scene's units — used to flag
    // out-of-range targets in the picker (a hint, not a wall: still selectable).
    const rng = activity.range ?? {};
    const distUnits = game.scenes.active?.grid?.units || "ft";
    const rangeFt = (rng.units === "ft" || rng.units === distUnits)
      ? (Math.max(0, Number(rng.reach) || 0, Number(rng.value) || 0, Number(rng.long) || 0) || null)
      : null;
    // dnd5e's own range/reach label for the picker header (e.g. "reach 5 ft",
    // "80/320 ft") — explains why a target reads out-of-range. No reimplementation.
    const rangeLabel = activity.item?.labels?.range || activity.item?.labels?.reach || null;
    this.#actionState = { uuid, name: activity.item.name, selfTarget, maxTargets, rangeFt, rangeLabel,
      slotOptions, slot: slotOptions[0]?.id ?? null, // default = lowest available slot ≥ base level
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
      targetError: null, recommendation: null, recPending: false };
    this.render();
    if (assigned.length) { this.#pushPreview(); this.#refreshAttackPreview(); } // reflect the assigned selection on the TV + recommend
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
  async #announceCast(activity, kind = "aoe") {
    const name = activity.item?.name ?? (kind === "summon" ? "summon" : "spell");
    const casterTokenUuid = game.scenes.active?.tokens.get(this.originTokenId)?.uuid ?? null;
    let res;
    try {
      res = await rpc.announceCast({
        activityUuid: activity.uuid,
        casterName: this.actor?.name,
        spellName: name,
        kind,
        casterTokenUuid
      });
    } catch (e) {
      console.error("mobile-command | announceCast failed", { name, kind, error: e });
      return ui.notifications.warn(`${name}: couldn't reach the DM (${e?.message ?? "error"}).`);
    }
    const verb = kind === "summon" ? "summon" : "place";
    if (res?.ok) ui.notifications.info(`Asked the DM to ${verb} ${name}.`);
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
  // Phone-side fallback for the save prompt. The executor relay (rpc.js) is the
  // primary path, but it only fires if the GM/executor client is running current
  // code — so if that's stale, no prompt reaches the phone. midi ALSO whispers a
  // plain save-request card to the player (requestPCSave: {content, whisper}, no
  // flags, no rolls). The shell hides chat, so catch that card here and surface the
  // same tappable prompt. De-dupes with the relay (skip if a prompt for this actor
  // is already up). Saves only (matches the relay scope); checks/skills are skipped.
  maybeSavePromptFromCard(message) {
    try {
      if (!(message?.whisper ?? []).includes(game.user.id)) return; // whispered to me
      if ((message.rolls?.length ?? 0) > 0) return;                 // a result, not a request
      if (message.flags?.["midi-qol"]) return;                      // midi workflow card, not the plain request
      const text = (message.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!/sav(?:e|ing)\s*throw/i.test(text)) return;              // saving throws only
      const actor = game.actors.find(a => a.isOwner && a.type === "character" && a.name && text.includes(a.name));
      if (!actor) return;
      const abil = Object.entries(CONFIG.DND5E?.abilities ?? {})
        .find(([, v]) => v?.label && new RegExp(`\\b${v.label}\\b`, "i").test(text))?.[0];
      if (!abil) return;
      if (this.#savePrompt?.actorUuid === actor.uuid) return;        // relay (or a prior card) already prompted
      const dc = Number((text.match(/DC\s*(\d+)/i) || [])[1]) || null;
      const flavor = (text.split(/\s[-–]\s/).pop() || "").replace(/[)\s]+$/, "").trim();
      const timeout = game.settings.get("midi-qol", "ConfigSettings")?.playerSaveTimeout ?? 0;
      this.noteSavePrompt({
        actorUuid: actor.uuid, abilities: [abil], dc,
        advantage: /\badvantage\b/i.test(text) && !/\bdisadvantage\b/i.test(text),
        disadvantage: /\bdisadvantage\b/i.test(text),
        isConcentration: /concentrat/i.test(text),
        spellName: flavor && flavor.length < 40 ? flavor : "",
        ttlMs: timeout > 0 ? timeout * 1000 : null, ts: Date.now(), source: "card"
      });
    } catch (e) { console.warn(`${MODULE_ID} | save-card fallback failed`, e); }
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

  // Combat turn changed: when it becomes THIS actor's turn again (or combat ends),
  // reopen the Actions drawers that auto-collapsed as actions were used last turn —
  // a fresh turn shouldn't inherit last turn's closed/"used" UI. The ACT/BA/RE
  // strip itself reads midi's flags, which midi resets GM-side on turn start
  // (midi-qol.js, removeActionBonusReaction); the shell re-renders on that flag
  // change, so this only owns the drawer state we collapse ourselves.
  noteCombatTurn() {
    const cur = game.combat?.combatant?.actor?.id ?? null;
    if (cur === this.#lastCombatantId) return;
    this.#lastCombatantId = cur;
    this.#moveBudget = null; // the executor resets a token's ft when its turn begins → clear the stale readout
    if (!cur || cur === this.actor?.id) this.#collapsedActionGroups.clear();
  }

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
        midiOptions,
        spellSlot: s.slot ?? null // upcast: cast at the chosen slot level
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
    s.hit = res.hit;
    // -100 is midi's pre-roll placeholder (minAttackTotal, midi-qol.js:24342) — it
    // leaks through when the executor reads the workflow before the attack roll is
    // applied (e.g. an executor still on pre-fix rpc.js). The phone always reloads,
    // so guard here too: show "—" (with the Hit/Attack label + Roll-damage step)
    // rather than a bogus -100, no matter what the executor returns.
    s.attackTotal = res.attackTotal === -100 ? null : res.attackTotal;
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
    this.#detailStack = [];
  }

  // B9 live target preview: reflect the current selection on the executor's
  // canvas/TV as the player taps (empty list clears it).
  #pushPreview() {
    rpc.previewTargets({ tokenUuids: this.#actionState ? Array.from(this.#actionState.selected) : [] });
  }
  #clearPreview() {
    rpc.previewTargets({ tokenUuids: [] });
  }

  // §14: ask the executor for AC5E's adv/dis recommendation for this attack at the
  // current target(s). Runs there (canvas + targets); the phone can't evaluate it.
  // Pre-selects the recommended button (player can still override) + lists reasons.
  async #refreshAttackPreview() {
    const s = this.#actionState;
    if (!s || !s.hasAttack) return;
    const targetTokenUuids = Array.from(s.selected);
    if (!targetTokenUuids.length) { s.recommendation = null; return; }
    const token = s.uuid; // capture to detect navigation/target changes mid-flight
    s.recPending = true;
    let res;
    try { res = await rpc.attackPreview({ attackerTokenId: this.originTokenId, activityUuid: s.uuid, targetTokenUuids }); }
    catch (e) { res = null; }
    if (this.#actionState !== s || s.uuid !== token) return; // navigated away
    s.recPending = false;
    if (res?.ok) {
      s.recommendation = { mode: res.mode ?? "normal", reasons: res.reasons ?? [], unevaluated: res.unevaluated ?? null };
      if (["advantage", "normal", "disadvantage"].includes(res.mode)) s.adv = res.mode; // pre-select; overridable
    } else {
      s.recommendation = null;
    }
    this.render();
  }

  // Step 2 of the two-tap: trigger the held workflow's damage roll.
  async #rollDamage() {
    const s = this.#actionState;
    if (!s || s.busy || !s.requestId) {
      console.debug("mobile-command | rollDamage skipped", { hasState: !!s, busy: s?.busy, requestId: s?.requestId });
      return;
    }
    s.busy = true; this.render();
    let res;
    try {
      res = await this.#withTimeout(rpc.useActivityDamage({ requestId: s.requestId }));
    } catch (err) {
      console.error("mobile-command | useActivityDamage failed", err);
      res = { ok: false, reason: err?.message ?? "error — see DM console" };
    }
    this.#actionState = null; this.render();
    if (!res?.ok) return ui.notifications.warn(`${s.name}: ${res?.reason ?? "damage failed"}`);
    // Damage toaster (DM 2026-06-19): the damage rolls on the executor and midi's
    // card doesn't reach the phone's chat-roll hook cleanly, so toast the total the
    // executor returned, the same way attack/check rolls toast.
    if (res.damageTotal != null) {
      const entry = { id: `${s.requestId}-dmg`, label: `${s.name} — damage`, total: res.damageTotal, formula: "", outcome: "dmg" };
      this.#recentRolls.unshift(entry);
      if (this.#recentRolls.length > ROLL_HISTORY_MAX) this.#recentRolls.length = ROLL_HISTORY_MAX;
      this.#refreshStrip();
      this.#showToast(entry);
    }
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
      case "ac-detail":
        // AC opens its breakdown on a tap (it has no other tap action) rather than
        // long-press — DM preference, and more discoverable for a bare stat.
        // Re-tap closes it (the header AC stays visible above the card).
        if (this.#detailCardIs("ac")) { this.#closeDetail(); return this.render(); }
        return this.#showACDetails();
      case "show-summary":
        // Tap the name → character summary (long-press the name → biography).
        // Re-tap closes it.
        if (this.#detailCardIs("character")) { this.#closeDetail(); return this.render(); }
        return this.#showCharacterDetails();
      case "show-bio": // (still used elsewhere if wired)
        return this.#showBioDetails();
      case "detail-close":
        // Drill-down back: pop to the previous card if we navigated into a link,
        // else close the card entirely back to the sheet.
        this.#dropArmed = null;
        this.#detailCard = this.#detailStack.pop() ?? null;
        return this.render();
      case "detail-fav": {
        const d = this.#detailCard;
        if (!d?.favId) return;
        if (d.isFav) actor?.system.removeFavorite?.(d.favId);
        else actor?.system.addFavorite?.({ type: d.favType, id: d.favId });
        d.isFav = !d.isFav; // optimistic; the updateActor hook re-renders with the saved state
        return this.render();
      }
      case "effect-remove": {
        const e = actor?.effects?.get(el.dataset.effectId);
        if (!e) return;
        const statuses = [...(e.statuses ?? [])];
        // Mirror Foundry: status conditions toggle off (dnd5e clears its riders);
        // other effects (a buff like Bless) delete directly.
        if (statuses.length) statuses.forEach((sid) => actor.toggleStatusEffect(sid, { active: false }));
        else e.delete();
        this.#detailCard = this.#detailStack.pop() ?? null; // the chip is gone — close the card
        return this.render();
      }
      // --- detail-card action footer (#detailActionsHTML) ---
      case "detail-use-activity": // Use / Cast → the normal target-picker flow
        this.#detailCard = null; this.#detailStack = []; this.#dropArmed = null;
        return this.#pickAction(el.dataset.uuid);
      case "detail-use-item": // multi-activity item → its activity picker
        this.#detailCard = null; this.#detailStack = []; this.#dropArmed = null;
        this.#itemPickerId = el.dataset.itemId; return this.render();
      case "detail-equip": {
        const it = actor?.items.get(el.dataset.itemId);
        return it?.update({ "system.equipped": !it.system.equipped }); // updateActor re-renders → footer reads live state
      }
      case "detail-attune": {
        const it = actor?.items.get(el.dataset.itemId);
        return it?.update({ "system.attuned": !it.system.attuned });
      }
      case "detail-prepare": {
        const it = actor?.items.get(el.dataset.itemId);
        return it?.update({ "system.preparation.prepared": !it.system.preparation?.prepared });
      }
      case "detail-roll":
        this.#detailCard = null; // close the card; the native (Restyled) roll dialog opens
        if (el.dataset.checkKind === "skill") return actor?.rollSkill?.({ skill: el.dataset.checkKey });
        if (el.dataset.checkKind === "tool") return actor?.rollToolCheck?.({ tool: el.dataset.checkKey });
        return this.render();
      case "detail-qty": {
        const it = actor?.items.get(el.dataset.itemId);
        if (!it) return;
        const q = Math.max(1, (it.system.quantity ?? 1) + Number(el.dataset.delta));
        return it.update({ "system.quantity": q });
      }
      case "detail-drop": {
        const id = el.dataset.itemId;
        if (this.#dropArmed !== id) { this.#dropArmed = id; return this.render(); } // arm (2-tap guard)
        const it = actor?.items.get(id);
        this.#dropArmed = null;
        this.#detailCard = this.#detailStack.pop() ?? null;
        it?.delete();
        return this.render();
      }
      case "roll-damage":
        return this.#rollDamage();
      case "adv":
        if (this.#actionState) { this.#actionState.adv = el.dataset.mode; this.render(); }
        return;
      case "slot-pick": // upcast: choose the spell-slot level to cast at
        if (this.#actionState) { this.#actionState.slot = el.dataset.slot; this.render(); }
        return;
      case "target-toggle": {
        const s = this.#actionState;
        if (!s) return;
        const uuid = el.dataset.uuid;
        if (s.selected.has(uuid)) s.selected.delete(uuid);
        else if (s.selected.size < s.maxTargets) s.selected.add(uuid);
        else if (s.maxTargets === 1) { s.selected.clear(); s.selected.add(uuid); } // single-target: tap to swap
        this.#pushPreview(); // B9: commit the target to the canvas/TV on tap
        this.#refreshAttackPreview(); // §14: ask the executor for AC5E's recommendation
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
      case "dice-tray":
        this.#diceTrayOpen = !this.#diceTrayOpen; return this.render();
      case "dtray-add": {
        const f = Number(el.dataset.faces);
        this.#dtrayPool[f] = (this.#dtrayPool[f] || 0) + 1;
        return this.render();
      }
      case "dtray-mod":
        this.#dtrayMod = Math.max(-99, Math.min(99, this.#dtrayMod + Number(el.dataset.delta)));
        return this.render();
      case "dtray-clear":
        this.#dtrayPool = {}; this.#dtrayMod = 0; return this.render();
      case "dtray-roll":
        return this.#rollDiceTray();
      case "char-gen-start":
        return this.#startCharGen();
      case "char-gen-pick":
        return this.#charGenPick(el.dataset.cgtype);
      case "char-gen-add":
        return this.#charGenAdd(el.dataset.uuid);
      case "char-gen-pick-back":
        if (this.#charGen) {
          if (this.#charGen.equip?.catOpen != null) { this.#charGen.equip.catOpen = null; this.#charGen.equip.catOptions = null; }
          else { this.#charGen.picking = null; this.#charGenOptions = null; this.#charGenSpellOptions = null; this.#charGen.equip = null; }
          this.render();
        }
        return;
      case "char-gen-finish":
        return this.#finishCharGen();
      case "char-gen-abilities":
        return this.#openAbilities();
      case "char-gen-bio-toggle":
        if (this.#charGen) { this.#charGen.bioOpen = !this.#charGen.bioOpen; this.render(); }
        return;
      case "char-gen-spells":
        return this.#charGenSpells();
      case "char-gen-spell-toggle":
        return this.#toggleSpellSel(el.dataset.uuid);
      case "spell-pick-detail-toggle":
        return this.#toggleSpellSel(el.dataset.uuid); // from the long-press detail card
      case "char-gen-spell-apply":
        return this.#applySpells(this.actor);
      case "char-gen-equip":
        return this.#charGenEquip(el.dataset.cgsource);
      case "equip-opt":
        return this.#selectEquipOption(Number(el.dataset.ci), Number(el.dataset.oi));
      case "equip-cat-pick":
        return this.#pickEquipCat(el.dataset.uuid);
      case "equip-apply":
        return this.#applyEquip(this.actor);
      case "abil-method":
        return this.#setAbilMethod(el.dataset.method);
      case "abil-roll":
        return this.#rollAbilityScores();
      case "abil-assign":
        return this.#assignAbility(el.dataset.abil);
      case "abil-inc":
        return this.#adjAbility(el.dataset.abil, 1);
      case "abil-dec":
        return this.#adjAbility(el.dataset.abil, -1);
      case "char-gen-abil-apply":
        return this.#applyAbilities();
      case "cond-edit":
        this.#condEditing = !this.#condEditing; return this.render();
      case "toggle-levels":
        this.#showLevels = !this.#showLevels; this.#levelUp = null; return this.render();
      case "level-up-open": return this.#openLevelUp();
      case "level-up-back": return this.#closeLevelUp();
      case "level-up-class": return this.#doLevelUp(el.dataset.classId);
      case "level-up-add": return this.#openMulticlass();
      case "level-up-pick": return this.#addMulticlass(el.dataset.uuid);
      case "token-prev": return this.#cycleSubject(-1);
      case "token-next": return this.#cycleSubject(1);
      case "set-primary":
        return actor?.update({ "system.attributes.spellcasting": el.dataset.ability });
      case "show-image":
        // Re-tap the portrait to close the image popup.
        this.#imagePopup = this.#imagePopup ? null : "profile"; return this.render();
      case "img-show":
        this.#imagePopup = el.dataset.which; return this.render();
      case "img-close":
        this.#imagePopup = null; return this.render();
      case "shared-img-close":
        this.#sharedImage = null; return this.render();
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
      case "move-toggle":
        this.#movePickerOpen = !this.#movePickerOpen;
        return this.#showCharacterDetails(); // rebuild the card with the picker open/closed
      case "speed-picker": // Explore Speed → travel chip popup
        // Re-tap closes the travel card.
        if (this.#detailCardIs("travel")) { this.#closeDetail(); return this.render(); }
        return this.#showTravelPicker();
      case "move-mode": {
        this.#moveMode = el.dataset.mode;
        this.#movePickerOpen = false;
        // Reflect the travel type on the actual token (DM/TV ruler, terrain cost).
        // Executor-side; safe to ignore the result on the phone.
        if (this.originTokenId) Promise.resolve(rpc.setMovementAction({ tokenId: this.originTokenId, action: this.#moveMode })).catch(() => {});
        // Rebuild whichever surface is showing the chips so the active one updates.
        if (this.#detailCard?.kind === "travel") return this.#showTravelPicker();
        if (this.#detailCard?.kind === "character") return this.#showCharacterDetails();
        return this.render();
      }
      case "end-turn":
        return this.#endTurn();
      case "roll-init":
        return this.#rollInitiative();
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
        return this.#doRest("short");
      case "long-rest":
        return this.#doRest("long");
    }
  };

  // Run a rest, then show a card of what it recovered (HP, hit dice, spell slots,
  // item charges, exhaustion). Diffs the actor before/after rather than parsing
  // dnd5e's RestResult, so it's robust to what the rest actually restored.
  #restSnapshot(actor) {
    const s = actor.system ?? {};
    const snap = { hp: s.attributes?.hp?.value ?? 0, hd: s.attributes?.hd?.value ?? null, exhaustion: s.attributes?.exhaustion ?? 0, slots: {}, uses: {} };
    for (const [k, v] of Object.entries(s.spells ?? {})) if (v && typeof v === "object" && "value" in v) snap.slots[k] = v.value;
    for (const it of actor.items) if (it.system?.uses?.max > 0) snap.uses[it.id] = it.system.uses.value;
    return snap;
  }
  #restBenefits(before, after, actor) {
    const rows = [];
    const dhp = after.hp - before.hp; if (dhp > 0) rows.push(`+${dhp} HP`);
    const dhd = (after.hd ?? 0) - (before.hd ?? 0); if (dhd > 0) rows.push(`+${dhd} Hit ${dhd === 1 ? "Die" : "Dice"}`);
    const dexh = before.exhaustion - after.exhaustion; if (dexh > 0) rows.push(`−${dexh} Exhaustion`);
    for (const [k, av] of Object.entries(after.slots)) {
      const d = av - (before.slots[k] ?? 0);
      if (d <= 0) continue;
      const lvl = actor.system.spells?.[k]?.level;
      const label = k === "pact" ? "Pact slot" : lvl ? `level-${lvl} slot` : "spell slot";
      rows.push(`+${d} ${label}${d > 1 ? "s" : ""}`);
    }
    for (const [id, av] of Object.entries(after.uses)) {
      const d = av - (before.uses[id] ?? 0);
      if (d > 0) rows.push(`+${d} ${actor.items.get(id)?.name ?? "charge"}`);
    }
    return rows;
  }
  async #doRest(kind) {
    const actor = this.actor; if (!actor) return;
    const before = this.#restSnapshot(actor);
    let result;
    try { result = await (kind === "long" ? actor.longRest() : actor.shortRest()); }
    catch (e) { return; } // dialog error
    if (this.actor !== actor) return;
    const after = this.#restSnapshot(actor);
    const benefits = this.#restBenefits(before, after, actor);
    if (!result && !benefits.length) return; // dialog cancelled, nothing happened
    const list = benefits.length
      ? `<ul class="mc-rest-benefits">${benefits.map((b) => `<li>${foundry.utils.escapeHTML(b)}</li>`).join("")}</ul>`
      : `<div class="mc-rest-none">Nothing needed recovering.</div>`;
    this.#detailStack = [];
    this.#detailCard = {
      name: kind === "long" ? "Long Rest" : "Short Rest", glyph: kind === "long" ? "fa-bed" : "fa-campground",
      subtitle: "Recovered", desc: list, favId: null, isFav: false
    };
    this.render();
  }

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
    const res = await rpc.moveToken({ tokenId: this.originTokenId, dxGrid: dx, dyGrid: dy });
    // Blocked → red reason. In combat on your turn → "used / speed ft" coloured
    // green (within speed) / yellow (within dash) / red (beyond), like the drag
    // ruler. Out of combat → blank (no turn budget to show). Persist it in
    // #moveBudget so the next combat re-render keeps the readout (see #moveHTML).
    if (!res?.ok) this.#moveBudget = { text: res?.reason ?? "can't move there", cls: "mc-move-note mc-move-red" };
    else if (res.speed) this.#moveBudget = { text: `${res.used} / ${res.speed} ft`, cls: `mc-move-note mc-move-${res.color}` };
    else this.#moveBudget = null;
    // Update the note in place so the readout is snappy (no full re-render needed).
    const note = this.element?.querySelector('[data-role="move-note"]');
    if (note) { note.textContent = this.#moveBudget?.text ?? ""; note.className = this.#moveBudget?.cls ?? "mc-move-note"; }
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
      ["pointerleave", this.#cancelLongPress], ["contextmenu", this.#onContextMenu],
      ["change", this.#onChange], // currency inputs save on blur/commit
      ["focusin", this.#onFocusIn] // select a coin's value on focus → typing replaces it
    ];
    for (const [type, fn] of pairs) { root.removeEventListener(type, fn); root.addEventListener(type, fn); }
    // Capture-phase so it beats Foundry's content-link handler AND the bubble #onClick.
    root.removeEventListener("click", this.#onContentLinkCapture, true);
    root.addEventListener("click", this.#onContentLinkCapture, true);
  }

  // The closest element carrying an item/activity reference (a "detailable" row).
  #detailTargetFor(target) {
    if (!(target instanceof Element)) return null;
    // Links inside an open details card are handled by tap (#onContentLinkCapture),
    // not long-press — so a long-press there doesn't fight the in-card navigation.
    if (target.closest(".mc-detail-desc")) return null;
    return target.closest("[data-uuid], [data-item-id], [data-detail]");
  }
  // Capture-phase: a content link inside the details card opens the linked
  // item/spell/journal in THIS card (not Foundry's native window, which gets
  // trapped over/under the full-screen shell). Capture beats both Foundry's
  // handler and the shell's own #onClick.
  #onContentLinkCapture = (ev) => {
    const link = ev.target?.closest?.(".mc-detail-desc a.content-link[data-uuid], .mc-detail-desc a[data-uuid]");
    if (!link?.dataset?.uuid) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.#openLinkDetails(link.dataset.uuid);
  };
  async #openLinkDetails(uuid, subtitleOverride = null, removeEffectId = null) {
    let doc; try { doc = await fromUuid(uuid); } catch (e) { return; }
    if (!doc) return;
    const raw = doc.system?.description?.value ?? doc.text?.content ?? "";
    let desc = raw;
    try {
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      desc = await TE.enrichHTML(raw, { relativeTo: doc, secrets: false });
    } catch (e) { desc = raw; }
    const subtitle = subtitleOverride ?? (doc.system ? this.#itemSubtitle(doc) : (doc.documentName === "JournalEntryPage" ? "Reference" : ""));
    // Drilling into a link from an open card: remember it so the X steps back here.
    if (this.#detailCard) this.#detailStack.push(this.#detailCard);
    // Linked refs aren't the actor's own item, so no favorite toggle (favId null).
    // removeEffectId is set only when a condition chip opened its rules page → the
    // card still offers "Remove condition".
    this.#detailCard = { name: doc.name ?? "Reference", img: doc.img || "icons/svg/book.svg", subtitle, meta: doc.system ? this.#itemMeta(doc) : "", desc, favId: null, isFav: false, removeEffectId };
    this.render();
  }
  #onPointerDown = (ev) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return; // right-click → contextmenu path
    // A fresh interaction clears any stuck swallow: a long-press sets #suppressClick
    // to eat its trailing click, but if the press re-rendered the element out from
    // under the finger the click never fires — so the flag would otherwise survive
    // and eat the user's NEXT real tap (e.g. the first tap on the detail card's X).
    this.#suppressClick = false;
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
  async #triggerDetail(el) {
    this.#detailStack = []; // a fresh long-press starts a new drill-down context
    this.#movePickerOpen = false; // and a collapsed travel-type picker
    this.#dropArmed = null; // and a disarmed Drop
    const { uuid, itemId, detail } = el.dataset;
    if (detail === "character") return this.#showCharacterDetails();
    if (detail === "bio") return this.#showBioDetails();
    if (detail === "cond") return this.#showEffectDetails(el.dataset.effectId);
    if (detail === "status") return this.#showStatusDetails(el.dataset.status);
    if (detail === "skill") return this.#showCheckDetails("skill", el.dataset.skill);
    if (detail === "tool") return this.#showCheckDetails("tool", el.dataset.tool);
    let item = null, activity = null;
    if (uuid) {
      // Compendium uuids resolve SYNC to an index stub (no description) — load the
      // full document async so the detail card has the real text (char-gen pickers).
      let doc = uuid.startsWith("Compendium.")
        ? await fromUuid(uuid).catch(() => null)
        : fromUuidSync(uuid, { relative: this.actor });
      if (doc?.item) { activity = doc; item = doc.item; } else item = doc;
    }
    else if (itemId) item = this.actor?.items.get(itemId);
    // In the char-gen spell picker, long-press → detail card carries an Add/Remove
    // button bound to the selection (the pressed uuid is the option's spell uuid).
    const pickUuid = (this.#charGen?.picking === "spells" && uuid) ? uuid : null;
    if (item?.system) this.#showDetails(item, activity, pickUuid);
  }
  // Full details card (long-press v1): mirror Foundry's item card — name, a short
  // subtitle, and the (enriched) item description. Async because enrichHTML is.
  async #showDetails(item, activity = null, spellPickUuid = null) {
    const sys = item.system ?? {};
    const raw = sys.description?.value || "";
    let desc = raw;
    try {
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      desc = await TE.enrichHTML(raw, { relativeTo: item, secrets: false });
    } catch (e) { desc = raw; /* fall back to the raw HTML if enrichment is unavailable */ }
    // Favorite descriptor: the activity if one was long-pressed (matches the Actions
    // bookmark), else the bare item — so the card's ★ adds/removes the same entry.
    const rel = item.getRelativeUUID?.(this.actor);
    const favType = activity ? "activity" : "item";
    const favId = rel ? (activity ? `${rel}.Activity.${activity.id}` : rel) : null;
    const isFav = favId ? !!this.actor?.system?.hasFavorite?.(favId) : false;
    this.#detailCard = { name: item.name, img: item.img || "icons/svg/item-bag.svg", subtitle: this.#itemSubtitle(item), meta: this.#itemMeta(item), desc, favType, favId, isFav, itemId: item.id, spellPickUuid };
    this.render();
  }
  // Compact mechanical stats line for the detail-card head, built from dnd5e's own
  // prepared `item.labels` (mirror Foundry, not reimplemented): spell time/range/
  // duration/components, weapon damage/reach/properties, else activation/target/range.
  #itemMeta(item) {
    const sys = item?.system ?? {}, L = item?.labels ?? {};
    const props = sys.properties ?? new Set();
    const has = (k) => (props.has ? props.has(k) : Array.isArray(props) && props.includes(k));
    const parts = [];
    if (item?.type === "spell") {
      if (L.activation) parts.push(L.activation);
      if (L.range) parts.push(L.range);
      let dur = L.duration || "";
      if (sys.duration?.concentration) dur = dur ? `Conc., ${dur}` : "Concentration";
      if (dur) parts.push(dur);
      const comps = [has("vocal") && "V", has("somatic") && "S", has("material") && "M"].filter(Boolean);
      if (comps.length) parts.push(comps.join(", "));
      if (has("ritual")) parts.push("Ritual");
    } else if (item?.type === "weapon") {
      if (L.damage) parts.push(`${L.damage}${L.damageTypes ? " " + L.damageTypes : ""}`);
      const reach = L.range || L.reach; if (reach) parts.push(reach);
      const wp = Array.isArray(L.properties) ? L.properties.map((p) => p?.label ?? p).filter(Boolean) : [];
      if (wp.length) parts.push(wp.join(", "));
    } else {
      if (L.activation) parts.push(L.activation);
      if (L.target) parts.push(L.target);
      if (L.range && L.range !== "Self") parts.push(L.range);
    }
    return parts.filter(Boolean).join(" · ");
  }
  // AC breakdown card (long-press the AC stat): mirror dnd5e's AC config — the
  // equipped-armor/base value plus dex/shield/bonus/cover contributions and the
  // total. Calc-agnostic: shows whatever components the prepared `ac` carries.
  #showACDetails() {
    this.#detailStack = []; // tap-entry → a clean top-level card
    const ac = this.actor?.system?.attributes?.ac ?? {};
    const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
    const rows = [];
    const baseLabel = ac.equippedArmor?.name || ac.label || "Base";
    const baseVal = ac.calc === "flat" ? (ac.flat ?? ac.value ?? 10) : (ac.armor ?? 10);
    rows.push([baseLabel, `${baseVal}`]);
    if (ac.dex) rows.push(["Dexterity", sign(ac.dex)]);
    if (ac.shield) rows.push(["Shield", sign(ac.shield)]);
    if (ac.bonus) rows.push(["Bonus", sign(ac.bonus)]);
    if (ac.cover) rows.push(["Cover", sign(ac.cover)]);
    const list = rows.map(([l, v]) =>
      `<div class="mc-ac-row"><span class="mc-ac-k">${foundry.utils.escapeHTML(String(l))}</span><span class="mc-ac-v">${v}</span></div>`).join("");
    const desc = `<div class="mc-ac-breakdown">${list}
      <div class="mc-ac-row mc-ac-total"><span class="mc-ac-k">Total</span><span class="mc-ac-v">${ac.value ?? "—"}</span></div></div>`;
    this.#detailCard = { name: "Armor Class", glyph: "fa-shield-halved", subtitle: ac.label || "", desc, favId: null, isFav: false, kind: "ac" };
    this.render();
  }
  // Skill/tool check card (long-press a row; tap still rolls): governing ability,
  // proficiency level, total modifier, and passive score (skills) — the static
  // facts behind the roll (adv/dis is computed live by AC5E at roll time, not here).
  async #showCheckDetails(kind, key) {
    const sys = this.actor?.system ?? {};
    const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
    const data = (kind === "skill" ? sys.skills : sys.tools)?.[key] ?? {};
    const label = kind === "skill" ? (CONFIG.DND5E.skills?.[key]?.label ?? key) : traitLabel(key, "tools");
    const abilKey = data.ability ?? (kind === "skill" ? CONFIG.DND5E.skills?.[key]?.ability : CONFIG.DND5E.tools?.[key]?.ability);
    const abilLabel = CONFIG.DND5E.abilities?.[abilKey]?.label ?? (abilKey || "").toUpperCase();
    const profMult = data.value ?? (data.proficient ? 1 : 0);
    const profLabel = { 0: "Not proficient", 0.5: "Half proficient", 1: "Proficient", 2: "Expertise" }[profMult] ?? "Proficient";
    const rows = [["Ability", abilLabel], ["Proficiency", profLabel], ["Modifier", data.total == null ? "—" : sign(data.total)]];
    if (kind === "skill" && data.passive != null) rows.push(["Passive", `${data.passive}`]);
    const list = rows.map(([k, v]) =>
      `<div class="mc-ac-row"><span class="mc-ac-k">${k}</span><span class="mc-ac-v">${foundry.utils.escapeHTML(String(v))}</span></div>`).join("");
    // Favorite from the check card: a skill/tool favorite is {type, id:<key>} in
    // dnd5e's system.favorites (the favorites container already renders those types —
    // this is the missing ADD path on the phone). detail-fav uses favType + favId.
    const card = {
      name: label, glyph: kind === "skill" ? "fa-dice-d20" : "fa-screwdriver-wrench",
      subtitle: kind === "skill" ? "Skill" : "Tool",
      favType: kind, favId: key, isFav: this.actor?.system?.hasFavorite?.(key) ?? false,
      skillKey: kind === "skill" ? key : null, toolKey: kind === "tool" ? key : null
    };
    const ledger = `<div class="mc-ac-breakdown">${list}</div>`;
    this.#detailStack = [];
    this.#detailCard = { ...card, desc: ledger };
    this.render();
    // Append the official skill/tool description (PHB reference page) below the ledger.
    const ref = kind === "skill" ? CONFIG.DND5E.skills?.[key]?.reference : CONFIG.DND5E.tools?.[key]?.reference;
    if (!ref) return;
    let body = "";
    try {
      const page = await fromUuid(ref);
      const raw = page?.text?.content ?? page?.system?.description?.value ?? "";
      if (raw) {
        const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
        body = await TE.enrichHTML(raw, { relativeTo: page, secrets: false });
      }
    } catch (e) { /* no description available */ }
    if (!body || this.#detailCard?.name !== label) return; // navigated away
    this.#detailCard = { ...card, desc: `${ledger}<div class="mc-check-desc">${body}</div>` };
    this.render();
  }
  // Condition/effect card (long-press a chip): best-available detail, in priority —
  // (1) the dnd5e/status rules reference page (standard conditions), opened in-shell;
  // (2) the effect's own description; (3) a plain summary of its stat changes. So
  // every chip is long-pressable, not just standard-5e conditions (DM ask 2026-06-18).
  async #showEffectDetails(effectId) {
    const e = this.actor?.effects?.get(effectId);
    if (!e) return;
    const refOf = (id) => CONFIG.DND5E?.conditionTypes?.[id]?.reference
      || (CONFIG.statusEffects ?? []).find((s) => s.id === id)?.reference;
    for (const id of (e.statuses ?? [])) { const ref = refOf(id); if (ref) return this.#openLinkDetails(ref, "Condition", e.id); }
    let desc = (e.description ?? "").trim();
    if (desc) {
      try {
        const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
        desc = await TE.enrichHTML(desc, { relativeTo: this.actor, secrets: false });
      } catch (err) { /* keep raw */ }
    } else if (e.changes?.length) {
      const modes = CONST.ACTIVE_EFFECT_MODES;
      const op = { [modes.ADD]: "+", [modes.MULTIPLY]: "×", [modes.OVERRIDE]: "=", [modes.UPGRADE]: "↑", [modes.DOWNGRADE]: "↓" };
      desc = `<ul class="mc-eff-changes">${e.changes.map((c) =>
        `<li>${foundry.utils.escapeHTML(c.key)} ${op[c.mode] ?? ""} ${foundry.utils.escapeHTML(String(c.value))}</li>`).join("")}</ul>`;
    } else {
      desc = "<em>No description.</em>";
    }
    if (this.#detailCard) this.#detailStack.push(this.#detailCard);
    this.#detailCard = { name: e.name, img: e.img || "icons/svg/aura.svg", subtitle: "Condition", desc, favId: null, isFav: false, removeEffectId: e.id };
    this.render();
  }
  // Condition detail by status id (long-press a palette cell, which may not be on
  // the actor): if it IS active, show its effect card (rules + Remove); otherwise
  // just its rules page, else a minimal card from the status config.
  #showStatusDetails(statusId) {
    const eff = this.actor?.effects?.find((e) => e.statuses?.has?.(statusId));
    if (eff) return this.#showEffectDetails(eff.id);
    const ref = CONFIG.DND5E?.conditionTypes?.[statusId]?.reference
      || (CONFIG.statusEffects ?? []).find((s) => s.id === statusId)?.reference;
    if (ref) return this.#openLinkDetails(ref, "Condition");
    const cfg = (CONFIG.statusEffects ?? []).find((s) => s.id === statusId);
    this.#detailCard = { name: cfg?.name ?? statusId, img: cfg?.img || "icons/svg/aura.svg", subtitle: "Condition", desc: "<em>No description.</em>", favId: null, isFav: false };
    this.render();
  }
  // Travel speeds the actor actually has (speed > 0), in a sensible order.
  #movementModes(actor) {
    const mv = actor?.system?.attributes?.movement ?? {};
    return ["walk", "fly", "swim", "climb", "burrow"]
      .filter((k) => Number(mv[k]) > 0)
      .map((k) => ({ key: k, speed: Number(mv[k]), units: mv.units || "ft" }));
  }
  // The effective active travel type: the user's pick if the actor still has it,
  // else walk (or the only/fastest available mode).
  #activeMoveMode(actor) {
    const modes = this.#movementModes(actor);
    if (!modes.length) return null;
    if (this.#moveMode && modes.some((m) => m.key === this.#moveMode)) return this.#moveMode;
    return (modes.find((m) => m.key === "walk") ?? modes[0]).key;
  }
  #moveModeLabel(key) {
    const raw = CONFIG.Token?.movement?.actions?.[key]?.label;
    const loc = raw ? game.i18n.localize(raw) : "";
    return loc && !loc.includes("TOKEN.MOVEMENT") ? loc : key.charAt(0).toUpperCase() + key.slice(1);
  }
  #moveModeIcon(key) {
    return { walk: "fa-person-walking", fly: "fa-feather", swim: "fa-person-swimming", climb: "fa-person-hiking", burrow: "fa-worm" }[key] ?? "fa-shoe-prints";
  }
  // Horizontal single-select travel-type chips (big icon + speed) — DM 2026-06-19
  // wanted toggle chips, not a dropdown. Used in the character summary + the Explore
  // Speed popup. Tapping a chip → move-mode (sets #moveMode + token movementAction).
  #travelChipsHTML(actor) {
    const modes = this.#movementModes(actor);
    if (!modes.length) return "";
    const active = this.#activeMoveMode(actor);
    return `<div class="mc-move-chips">${modes.map((m) =>
      `<button class="mc-move-chip ${m.key === active ? "mc-on" : ""}" data-action="move-mode" data-mode="${m.key}" aria-label="${this.#moveModeLabel(m.key)} ${m.speed} ${m.units}">
         <i class="fas ${this.#moveModeIcon(m.key)}"></i>
         <span class="mc-move-chip-spd">${m.speed}</span>
       </button>`).join("")}</div>`;
  }
  // Explore "Speed" → a popup with just a header + the travel chip row (DM 2026-06-19).
  #showTravelPicker() {
    const a = this.actor; if (!a) return;
    if (!this.#movementModes(a).length) return;
    this.#detailStack = [];
    this.#detailCard = { name: "Travel", glyph: "fa-person-running", subtitle: "Movement", desc: this.#travelChipsHTML(a), favId: null, isFav: false, kind: "travel" };
    this.render();
  }
  // Biography card (long-press the portrait; tap still opens the image): the
  // actor's (enriched) biography. Public bio falls back to the GM bio.
  async #showBioDetails() {
    const a = this.actor; if (!a) return;
    const bio = a.system?.details?.biography ?? {};
    const raw = bio.value || bio.public || "";
    let desc = raw;
    try {
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      desc = await TE.enrichHTML(raw, { relativeTo: a, secrets: false });
    } catch (e) { /* keep raw */ }
    this.#detailStack = [];
    this.#detailCard = { name: a.name, img: a.img || "icons/svg/mystery-man.svg", subtitle: "Biography", desc: desc || "<em>No biography.</em>", favId: null, isFav: false };
    this.render();
  }
  // Character summary card (long-press the name): level/race/class line, an
  // ability-score grid (modifier + score, save-proficient abilities flagged),
  // and a prof/speed/init meta line. Mirrors the top of Foundry's character sheet.
  #showCharacterDetails() {
    const a = this.actor; if (!a) return;
    const s = a.system ?? {};
    const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
    const subs = a.itemTypes.subclass ?? [];
    const classes = a.itemTypes.class ?? [];
    const multiclass = classes.length > 1; // per-class level only helps when multiclassed
    const cls = classes.map((c) => {
      const sub = subs.find((x) => x.system?.classIdentifier === c.system?.identifier)?.name
        || ((classes.length === 1 && subs.length === 1) ? subs[0].name : c.system?.subclass);
      return `${c.name}${multiclass && c.system?.levels ? ` ${c.system.levels}` : ""}${sub ? ` (${sub})` : ""}`;
    }).join(" / ");
    const race = a.itemTypes.race?.[0]?.name ?? s.details?.race ?? "";
    const lvl = s.details?.level;
    const subtitle = [lvl ? `Level ${lvl}` : "", race, cls].filter(Boolean).join(" ");
    const abils = Object.entries(s.abilities ?? {}).map(([k, v]) =>
      `<div class="mc-ab${v.proficient ? " mc-ab-prof" : ""}"><span class="mc-ab-k">${k.toUpperCase()}</span><span class="mc-ab-mod">${sign(v.mod ?? 0)}</span><span class="mc-ab-score">${v.value ?? "—"}</span></div>`).join("");
    // Prof / Init as their own boxed stat tiles (bigger, with presence) — DM 2026-06-19.
    const initV = s.attributes?.init?.total;
    const statTile = (label, val) => `<div class="mc-pc-stat"><span class="mc-pc-stat-label">${label}</span><span class="mc-pc-stat-val">${val}</span></div>`;
    const pcStats = `<div class="mc-pc-stats">${statTile("Prof", sign(s.attributes?.prof ?? 0))}${initV != null ? statTile("Init", sign(initV)) : ""}</div>`;
    // Travel types as a horizontal single-select chip row (DM 2026-06-19), not a dropdown.
    const chips = this.#travelChipsHTML(a);
    const bg = a.itemTypes.background?.[0]?.name ?? s.details?.background;
    const desc = `<div class="mc-pc-abils">${abils}</div>
      ${pcStats}
      ${chips ? `<div class="mc-pc-speed-label">Speed</div>${chips}` : ""}
      ${bg ? `<div class="mc-pc-bg">${foundry.utils.escapeHTML(bg)}</div>` : ""}`;
    this.#detailCard = { name: a.name, img: a.img || "icons/svg/mystery-man.svg", subtitle, desc, favId: null, isFav: false, kind: "character" };
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
  #actBtn(label, icon, action, data = {}, cls = "") {
    const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(" ");
    return `<button class="mc-detail-act ${cls}" data-action="${action}" ${attrs}><i class="fas ${icon}"></i> ${label}</button>`;
  }
  // Contextual action footer for the detail card (DM 2026-06-19: spell→Cast/Learn,
  // skill/tool→Roll, item→Use/Equip/Attune, physical→quantity ± and Drop). Buttons
  // dispatch the SAME flows the rows already use; item state is read LIVE so toggles
  // reflect on the next render. Conditions keep their own Remove button.
  #detailActionsHTML(d) {
   try {
    if (d.skillKey) return `<div class="mc-detail-acts">${this.#actBtn("Roll", "fa-dice-d20", "detail-roll", { "check-kind": "skill", "check-key": d.skillKey }, "mc-act-primary")}</div>`;
    if (d.toolKey) return `<div class="mc-detail-acts">${this.#actBtn("Roll", "fa-dice-d20", "detail-roll", { "check-kind": "tool", "check-key": d.toolKey }, "mc-act-primary")}</div>`;
    if (!d.itemId) return "";
    const item = this.actor?.items.get(d.itemId);
    if (!item) return "";
    const sys = item.system ?? {};
    const usable = this.#itemUsableActivities(item);
    const btns = [];
    if (item.type === "spell") {
      const castUuid = usable[0]?.uuid ?? [...(sys.activities ?? [])][0]?.uuid;
      if (castUuid) btns.push(this.#actBtn("Cast", "fa-wand-sparkles", "detail-use-activity", { uuid: castUuid }, "mc-act-primary"));
      const prep = sys.preparation ?? {};
      if (prep.mode === "prepared" && (sys.level ?? 0) > 0)
        btns.push(this.#actBtn(prep.prepared ? "Learned" : "Learn", "fa-book", "detail-prepare", { "item-id": item.id }, prep.prepared ? "mc-on" : ""));
    } else {
      if (usable.length === 1) btns.push(this.#actBtn("Use", "fa-bolt", "detail-use-activity", { uuid: usable[0].uuid }, "mc-act-primary"));
      else if (usable.length > 1) btns.push(this.#actBtn("Use", "fa-bolt", "detail-use-item", { "item-id": item.id }, "mc-act-primary"));
      if ("equipped" in sys) btns.push(this.#actBtn(sys.equipped ? "Equipped" : "Equip", "fa-shield-halved", "detail-equip", { "item-id": item.id }, sys.equipped ? "mc-on" : ""));
      if (sys.attunement) btns.push(this.#actBtn(sys.attuned ? "Attuned" : "Attune", "fa-sun", "detail-attune", { "item-id": item.id }, sys.attuned ? "mc-on" : ""));
    }
    let qtyRow = "";
    if ("quantity" in sys) {
      const qty = sys.quantity ?? 1;
      const armed = this.#dropArmed === item.id;
      const stepper = qty > 1
        ? `<div class="mc-qty"><button class="mc-qty-btn" data-action="detail-qty" data-item-id="${item.id}" data-delta="-1" aria-label="Remove one">−</button><span class="mc-qty-val">${qty}</span><button class="mc-qty-btn" data-action="detail-qty" data-item-id="${item.id}" data-delta="1" aria-label="Add one">+</button></div>`
        : "";
      const dropBtn = `<button class="mc-detail-act mc-act-danger ${armed ? "mc-armed" : ""}" data-action="detail-drop" data-item-id="${item.id}"><i class="fas fa-trash"></i> ${armed ? "Confirm drop" : "Drop"}</button>`;
      qtyRow = `<div class="mc-detail-qtyrow">${stepper}${dropBtn}</div>`;
    }
    return `${btns.length ? `<div class="mc-detail-acts">${btns.join("")}</div>` : ""}${qtyRow}`;
   } catch (e) { console.warn("mobile-command | detail actions failed", e); return ""; }
  }
  #detailCardHTML() {
    const d = this.#detailCard;
    if (!d) return "";
    return `<div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="detail-close" aria-label="Close"><i class="fas fa-xmark"></i></button>
        <span class="mc-picker-title">${foundry.utils.escapeHTML(d.name)}</span>
        ${d.favId ? `<button class="mc-detail-fav ${d.isFav ? "mc-on" : ""}" data-action="detail-fav" aria-label="${d.isFav ? "Unfavorite" : "Favorite"}" title="${d.isFav ? "Remove from favorites" : "Add to favorites"}"><i class="fas fa-bookmark"></i></button>` : ""}
      </div>
      <div class="mc-detail">
        <div class="mc-detail-head">
          ${d.glyph ? `<span class="mc-detail-icon mc-detail-glyph"><i class="fas ${d.glyph}"></i></span>` : `<img class="mc-detail-icon" src="${d.img}" alt="">`}
          <div class="mc-detail-headtext">
            ${d.subtitle ? `<span class="mc-detail-sub">${foundry.utils.escapeHTML(d.subtitle)}</span>` : ""}
            ${d.meta ? `<span class="mc-detail-meta">${foundry.utils.escapeHTML(d.meta)}</span>` : ""}
          </div>
        </div>
        <div class="mc-detail-desc">${d.desc || "<em>No description.</em>"}</div>
        ${this.#detailActionsHTML(d)}
        ${d.spellPickUuid ? (() => {
          const on = this.#charGen?.spellSel?.has(d.spellPickUuid);
          return `<button class="mc-spellpickbtn ${on ? "mc-on" : ""}" data-action="spell-pick-detail-toggle" data-uuid="${d.spellPickUuid}">
            <i class="fas ${on ? "fa-circle-minus" : "fa-circle-plus"}"></i> ${on ? "Remove from character" : "Add to character"}</button>`;
        })() : ""}
        ${d.removeEffectId ? `<button class="mc-detail-remove" data-action="effect-remove" data-effect-id="${d.removeEffectId}"><i class="fas fa-circle-xmark"></i> Remove condition</button>` : ""}
      </div>`;
  }

  // Keyboard convenience for the stat editor (where a return key exists):
  // Enter = Set absolute; Escape = cancel. The −/+/Set buttons are the
  // primary, keyboard-independent path.
  #onKeydown = (ev) => {
    if (ev.target.matches?.(".mc-coin-input")) {
      if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } // commit → #onChange
      return;
    }
    if (!ev.target.matches?.(".mc-stat-input")) return;
    if (ev.key === "Enter") { ev.preventDefault(); this.#applyStat(0); }
    else if (ev.key === "Escape") { this.#editingField = null; this.render(); }
  };

  // Currency tap-to-edit: write the new coin amount on blur/Enter. A non-negative
  // integer; the updateActor hook re-renders the row with the saved value.
  #onChange = (ev) => {
    const inp = ev.target;
    // Char-gen name/biography box: commit the field to the actor on blur. data-bio is
    // the actor path ("name" → the document name, else a system.details.* path).
    if (inp?.dataset?.bio) {
      const path = inp.dataset.bio;
      const val = inp.value;
      this.actor?.update(path === "name" ? { name: val || "Unnamed Character" } : { [path]: val });
      return;
    }
    // Spell-picker filters (commit on blur/change — no live re-render to keep focus).
    if (inp?.classList?.contains?.("mc-spellfilter-q") && this.#charGen) {
      (this.#charGen.spellFilter ??= {}).q = (inp.value || "").trim().toLowerCase(); return this.render();
    }
    if (inp?.classList?.contains?.("mc-spellfilter-school") && this.#charGen) {
      (this.#charGen.spellFilter ??= {}).school = inp.value; return this.render();
    }
    if (!inp?.classList?.contains?.("mc-coin-input")) return;
    const k = inp.dataset.coin;
    const v = Math.max(0, Math.floor(Number(inp.value) || 0));
    if (k) this.actor?.update({ [`system.currency.${k}`]: v });
  };
  // Select a coin's current amount on focus so typing replaces it (no manual clear).
  #onFocusIn = (ev) => {
    if (ev.target?.classList?.contains?.("mc-coin-input")) ev.target.select?.();
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
    if (!shellInstance) return;
    shellInstance.maybeSavePromptFromCard(message); // phone-side save-prompt fallback (relay-independent)
    if (shellInstance.rendered) shellInstance.noteRoll(message);
  });
  // §11 DM-assign: the executor relays assigned targets here; pre-load them in
  // the next picker (ControllerShell.noteAssignedTargets).
  Hooks.on("mobile-command.assignTargets", (uuids, from) => shellInstance?.noteAssignedTargets(uuids, from));
  // §7.4/§7.6 save/reaction prompt: the executor relays a midi save request here.
  Hooks.on("mobile-command.savePrompt", (payload) => shellInstance?.noteSavePrompt(payload));
  // "Show Players" image → the phone. The shell hides native windows, so Foundry's
  // ImagePopout never reaches a phone; mirror the core `shareImage` broadcast into the
  // shell's full-screen overlay instead (respect an explicit users allowlist).
  game.socket?.on("shareImage", (data = {}) => {
    if (!shellInstance || !isPhoneClient()) return;
    if (Array.isArray(data.users) && data.users.length && !data.users.includes(game.user.id)) return;
    shellInstance.showSharedImage(data.image, data.showTitle === false ? "" : (data.title || ""));
  });
  // Turn HUD: re-render on combat turn/round changes and combat start/stop.
  // Also expire DM-assigned targets once the player's turn ends (§11).
  const onCombat = () => {
    shellInstance?.expireAssignedIfNotMyTurn();
    shellInstance?.noteCombatTurn(); // reopen drawers when my turn comes around again
    if (shellInstance?.rendered) shellInstance.render();
  };
  Hooks.on("updateCombat", onCombat);
  Hooks.on("deleteCombat", onCombat);
  Hooks.on("combatStart", onCombat);
  // Also react to being added/removed from combat and to initiative being set,
  // so the "Roll initiative" prompt appears and clears without a manual refresh.
  Hooks.on("createCombat", onCombat);
  Hooks.on("createCombatant", onCombat);
  Hooks.on("updateCombatant", onCombat);
  Hooks.on("deleteCombatant", onCombat);
  // Scene switch: the controlled token lives on a scene, so when the GM activates
  // a new scene the shell can be stranded on an off-scene actor with no token
  // ("token not found: null") and the switcher hides. Drop a stale subject + re-
  // render so the phone rebinds to an owned token on the new active scene.
  Hooks.on("updateScene", (scene, changes) => {
    if (shellInstance && "active" in changes) {
      shellInstance.syncSubject();
      if (shellInstance.rendered) shellInstance.render();
    }
  });
  // Phone combat-start cue (vibration + Foundry's combat sound).
  Hooks.on("combatStart", () => shellInstance?.alertCombatStart?.());

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
