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
    // Total character level (multiclass = sum of class levels). Full class/
    // subclass breakdown + XP bar move into the long-press name tooltip later.
    const totalLevel = sys.details?.level
      || actor.items.filter(i => i.type === "class").reduce((n, c) => n + (c.system.levels || 0), 0);

    // Include toggled conditions (status effects, which often carry NO duration
    // — temporaryEffects alone misses them, so the chip read "No active
    // conditions" even with conditions set) alongside temporary effects (Bless).
    const effects = (actor.effects ?? []).filter(e =>
      e.active && e.name && (e.isTemporary || e.statuses?.size > 0)
      // Exclude midi's action-economy effects (Reaction / Bonus Action) — the
      // dedicated ACT/BA/RE indicator covers those; no chip needed.
      && !e.changes?.some?.(c => c.key?.startsWith("flags.midi-qol.actions")));
    const condHTML = effects.length
      ? effects.map(e =>
          `<span class="mc-chip">${e.img ? `<img class="mc-chip-icon" src="${e.img}" alt="">` : ""}${foundry.utils.escapeHTML(e.name)}</span>`
        ).join("")
      : `<span class="mc-chip mc-none">No active conditions</span>`;

    // B7: HP & temp are tap-to-edit. Tapping opens a roomy editor row with
    // on-screen − / + / Set so it works on the iOS numeric keypad (which has no
    // +/− or reliable return key) — not only an absolute fill.
    const hpBtn = `<button class="mc-stat-val mc-hp-cur ${hpClass} ${this.#editingField === "hp" ? "mc-editing" : ""}" data-action="edit-hp">${hp.value ?? "—"}</button>`;
    const tempBtn = `<button class="mc-stat-val mc-temp-val ${hp.temp ? "" : "mc-zero"} ${this.#editingField === "temp" ? "mc-editing" : ""}" data-action="edit-temp">${hp.temp || 0}</button>`;

    return `
      <header class="mc-header">
        <img class="mc-portrait" src="${img}" alt="">
        <div class="mc-id">
          <div class="mc-name">${totalLevel ? `<button class="mc-name-lvl ${this.#showLevels ? "mc-on" : ""}" data-action="toggle-levels">Lvl ${totalLevel}</button>` : ""}<span class="mc-name-text">${foundry.utils.escapeHTML(actor.name)}</span></div>
          <div class="mc-stats">
            <span class="mc-stat"><span class="mc-stat-label">HP</span>${hpBtn}<span class="mc-stat-sub">/${hp.max ?? "—"}</span></span>
            <span class="mc-stat"><span class="mc-stat-label">Temp</span>${tempBtn}</span>
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
      <main class="mc-content">${this.#tabContent(actor)}</main>
      ${this.#rollStripHTML()}
      ${this.#turnHudHTML()}
      <nav class="mc-tabs">
        ${this.#tabButton("actions", "fa-hand-fist", "Actions")}
        ${this.#tabButton("details", "fa-user", "Details")}
        ${this.#tabButton("sheet", "fa-compass", "Explore")}
        ${this.#tabButton("spells", "fa-wand-sparkles", "Spells")}
        ${this.#tabButton("journal", "fa-feather", "Journal")}
      </nav>`;
  }

  #tabButton(id, icon, label) {
    return `<button class="mc-tab ${this.#tab === id ? "mc-active" : ""}" data-action="tab" data-tab="${id}" title="${label}" aria-label="${label}"><i class="fas ${icon}"></i></button>`;
  }

  #tabContent(actor) {
    if (this.#atZeroHP(actor)) return this.#deathSaveHTML(actor); // §7.4: collapse to death saves
    // An in-progress action/cast overlays the current tab — so casting from the
    // Spells tab (or using a favorite from Explore) stays put instead of jumping.
    if (this.#actionState) return this.#targetPickerHTML();
    if (this.#tab === "actions") return this.#actionsHTML(actor);
    if (this.#tab === "details") return this.#detailsHTML(actor);
    if (this.#tab === "spells") return this.#spellsHTML(actor);
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

  // Explore tab = a movement row (Init/Hit Dice · D-pad · Speed/Prof), the
  // favorites container, the ability roll grid, and rest buttons.
  #exploreHTML(actor) {
    return this.#moveRowHTML(actor) + this.#favoritesHTML(actor)
      + this.#abilitiesHTML(actor) + this.#restsHTML();
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
    return activity?.uuid
      ? this.#favRowHTML({ img, name, cost, action: "fav-act", data: `data-uuid="${activity.uuid}"` })
      : this.#favRowHTML({ img, name, cost, action: "", data: "" });
  }

  #favRowHTML({ img, icon, name, val = "", cost = null, action, data }) {
    const tag = action ? "button" : "div";
    const attrs = action ? ` data-action="${action}" ${data}` : "";
    const media = img
      ? `<img class="mc-fav-icon" src="${img}" alt="">`
      : `<span class="mc-fav-glyph"><i class="fas ${icon}"></i></span>`;
    // Right edge: an action-economy cost badge for activities, else the modifier.
    const right = cost
      ? `<span class="mc-fav-cost mc-econ-${cost.type} ${cost.on ? "mc-on" : "mc-off"}">${cost.label}</span>`
      : val ? `<span class="mc-fav-val">${val}</span>` : "";
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

    let pv = 0, pm = 0;
    for (const c of actor.items.filter(i => i.type === "class")) {
      const p = c.system.spellcasting?.preparation;
      if (p?.max) { pv += p.value ?? 0; pm += p.max; }
    }
    const prepLine = pm > 0 ? `<div class="mc-prep-line ${pv > pm ? "mc-over" : ""}">Prepared ${pv}/${pm}</div>` : "";

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
      ${slotsRow}${prepLine}${sections}`;
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
        // uses, not just weapons/offensive spells. AoE still routes to the DM.
        if (!["attack", "save", "damage", "utility", "heal"].includes(a.type)) continue;
        if (a.target?.template?.type) continue; // AoE → DM places template
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
    // One group → skip the sub-header (it would just echo the title).
    const body = shown.length <= 1
      ? `<div class="mc-actions">${rowsFor(shown[0].key)}</div>`
      : shown.map(g => `<div class="mc-actions-sub mc-econ-${g.key}">${g.label}</div>
          <div class="mc-actions">${rowsFor(g.key)}</div>`).join("");
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
  #actionEconomy(actor) {
    const inCombat = !!game.combat?.combatants?.some(c => c.actor?.id === actor?.id);
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
  // Wind, etc.): "value/max", red at 0. Empty when the item has no use limit.
  #usesBadge(item) {
    const u = item?.system?.uses;
    if (!u || !(u.max > 0)) return "";
    return pips(u.value ?? 0, u.max);
  }

  #actionRowHTML(a, actor, editing) {
    const sub = a.item.name === a.name ? a.type : a.name;
    const icon = a.item.img || a.img || "icons/svg/upgrade.svg";
    const favId = `${a.item.getRelativeUUID(actor)}.Activity.${a.id}`;
    const isFav = actor.system.hasFavorite?.(favId) ?? false;
    // In edit mode the row toggles the favorite; otherwise it opens the picker.
    const action = editing ? "fav-toggle" : "action-pick";
    const data = editing ? `data-favid="${favId}"` : `data-uuid="${a.uuid}"`;
    const mark = (editing || isFav)
      ? `<i class="fas fa-bookmark mc-action-fav ${isFav ? "mc-on" : ""}"></i>`
      : "";
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
    return `
      <div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="action-back" aria-label="Close"><i class="fas fa-xmark"></i></button>
        <span class="mc-picker-title">${foundry.utils.escapeHTML(s.name)}</span>
        ${count}
      </div>
      ${s.hasAttack ? `<div class="mc-adv-row">${advBtn("advantage", "Advantage")}${advBtn("normal", "Normal")}${advBtn("disadvantage", "Disadvantage")}</div>` : ""}
      <div class="mc-targets">${body}${selfRow}</div>
      <button class="mc-fire ${canFire ? "" : "mc-disabled"}" data-action="fire" ${canFire ? "" : "disabled"}>
        ${s.busy ? "Using…" : "Use"}
      </button>`;
  }

  async #pickAction(uuid) {
    const activity = await fromUuid(uuid);
    if (!activity) return;
    this.#clearPreview(); // drop any stale preview from a prior action
    const affects = activity.target?.affects ?? {};
    // "selfTarget" = no enemy target needed → skip the picker. Attacks/saves/
    // damage ALWAYS need a target (weapon attacks have an empty affects.type
    // but still target a creature) — only treat an empty type as no-target for
    // non-roll features (Action Surge=utility, Second Wind=heal self).
    const targeted = ["attack", "save", "damage"].includes(activity.type);
    const selfTarget = affects.type === "self" || (!affects.type && !targeted);
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
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Leave Mobile Command?" },
      content: "<p>Return to the standard Foundry interface?</p>",
      modal: true, rejectClose: false
    });
    if (ok) this.close();
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
    root.removeEventListener("keydown", this.#onKeydown);
    root.addEventListener("keydown", this.#onKeydown);
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
  // Phone clients: suppress third-party combat HUDs (Argon / Enhanced Combat HUD
  // etc.) — they compete with the shell's own Actions tab and route actions
  // outside Route B. The DM client is untouched (its shell isn't rendered). The
  // log helps identify any popup we haven't classified yet.
  const ident = `${app.constructor?.name ?? ""} ${app.id ?? ""} ${typeof el.className === "string" ? el.className : ""}`.toLowerCase();
  console.debug("mobile-command | app over shell:", app.constructor?.name, app.id);
  if (/argon|enhancedcombat|combat-?hud|action-?pack|combat-guidance/.test(ident)) {
    el.style.display = "none"; // hide instantly so it doesn't flash before closing
    setTimeout(() => { try { app.close(); } catch (e) { /* best effort */ } }, 0);
    return;
  }
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
  Hooks.on("updateActor", (actor) => {
    if (shellInstance?.rendered && actor === shellInstance.actor) shellInstance.render();
  });
  Hooks.on("createActiveEffect", (effect) => {
    if (shellInstance?.rendered && effect.parent === shellInstance.actor) shellInstance.render();
  });
  Hooks.on("deleteActiveEffect", (effect) => {
    if (shellInstance?.rendered && effect.parent === shellInstance.actor) shellInstance.render();
  });
  // Item changes live on the item, not the actor: spell prepared toggle
  // (system.prepared), uses spent, and learning/removing items. Without these
  // the prepared toggle wrote data but the UI never refreshed (reported bug).
  const onItem = (item) => {
    if (shellInstance?.rendered && item.parent === shellInstance.actor) shellInstance.render();
  };
  Hooks.on("updateItem", onItem);
  Hooks.on("createItem", onItem);
  Hooks.on("deleteItem", onItem);
  // Surface this user's/actor's roll results inside the shell (it covers chat).
  Hooks.on("createChatMessage", (message) => {
    if (shellInstance?.rendered) shellInstance.noteRoll(message);
  });
  // Turn HUD: re-render on combat turn/round changes and combat start/stop.
  const onCombat = () => { if (shellInstance?.rendered) shellInstance.render(); };
  Hooks.on("updateCombat", onCombat);
  Hooks.on("deleteCombat", onCombat);
  Hooks.on("combatStart", onCombat);

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
