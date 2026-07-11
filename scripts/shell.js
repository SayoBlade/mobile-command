import { MODULE_ID } from "./preset.js";
import { api as rpc, actorTokenSight } from "./rpc.js";

// Phase 2 — Controller Shell + read-only Touch Sheet.
// Full-screen frameless takeover for phone-role clients. Rolls use the dnd5e
// document-level methods (rollAbilityCheck/rollSavingThrow/rollSkill), which
// render their dialog locally and work on a no-canvas client (Spike 3, Test 0).
// HP editing, inventory, spell prep, item use (Route B) come in later phases.

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
// Mobile-friendly player-colour palette (task #18). Distinct, table-legible hues;
// the same set the DM's Player-colours tab uses.
const MC_COLOR_PALETTE = ["#d94a3a", "#e0842b", "#e6c229", "#4caf50", "#1fa79a", "#3a86d6", "#8a5cd6", "#d861a8", "#9c6b3f", "#5a6b7a", "#e8e6df", "#2c3e50"];
// 5e point-buy (PHB 2014 & 2024): 27-point budget, scores 8–15.
const PB_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const PB_BUDGET = 27;
// 5e standard array (PHB) — six fixed scores assigned one each to an ability.
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const ROLL_HISTORY_MAX = 6;   // recent-rolls strip cap (newest-first)
const ROLL_TOAST_MS = 4500;   // transient roll toast lifetime (ms)
const COMBAT_EVENT_MAX = 4;   // combat-event chip strip cap (damage taken / saves required)

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

// Idea #2 — assemble a layered AI image-generation prompt for a character portrait.
// Layers, in order: (1) a fixed framing+style layer that keeps the result safe for the
// circular token-ring crop — centred bust, headroom, even margins; (2) the DM's world
// art-direction; (3) auto-pulled species/class + a standout HIGH ability turned into a
// visual cue (lows don't read on a face, so they're skipped); (4) the player's own
// free-text last, so it refines/overrides. Pure + side-effect-free so it's easy to test.
const PORTRAIT_STAT_LOOK = {
  str: "powerfully built and muscular",
  dex: "lean, lithe and quick",
  con: "sturdy, hardy and robust",
  int: "with sharp, keenly intelligent eyes",
  wis: "with a calm, weathered, perceptive gaze",
  cha: "strikingly handsome with a commanding presence",
};
export function buildPortraitPrompt(actor, { freeText = "", dmStyle = "", mode = "portrait" } = {}) {
  const parts = [];
  // (1) framing + base style — always present so the result survives the ring crop. The
  // body/portrait toggle picks the composition; both keep the head clear of the top edge
  // so a circular token crop never decapitates (full-body keeps the head high, feet low).
  if (mode === "body") {
    parts.push("Square 1:1 full-body character illustration showing the entire figure from head to toe, standing and facing the viewer, centred in the frame with even side margins, the head in the upper portion with clear space above it and the feet near the bottom edge, a simple background in a tone that gently contrasts with the character (subtle, not harsh) so they stay readable at small token sizes, detailed painterly fantasy D&D character illustration.");
  } else {
    parts.push("Square 1:1 character portrait, head and shoulders, the subject centred and facing the viewer, their face in the middle of the frame with clear space above the head and an even margin on all sides, a simple background in a tone that gently contrasts with the character (subtle, not harsh) so they stay readable at small token sizes, detailed painterly fantasy D&D character illustration.");
  }
  // (1.5) player-color banner (DM 2026-07-03): a soft banner in the owning
  // player's colour fills the backdrop — augments the token ring so a player
  // spots their character on the map fast. No insignia (kept generic/reusable).
  const owner = game.users?.find?.(u => !u.isGM && u.character?.id === actor?.id)
    ?? game.users?.find?.(u => !u.isGM && actor?.testUserPermission?.(u, "OWNER"));
  const bannerColor = owner?.color?.css;
  if (bannerColor) parts.push(`Background: a large cloth banner in the solid colour ${bannerColor}, no insignia or emblem, flowing and rippling softly, filling most of the backdrop behind the subject.`);
  // Group portrait (task #12): seed the subject from the party's members and return.
  if (actor?.type === "group") {
    if (dmStyle && dmStyle.trim()) parts.push(`Art direction: ${dmStyle.trim()}.`);
    const descs = (actor.system?.members ?? []).map(m => m.actor).filter(Boolean).map(a => {
      const r = a.items?.find(i => i.type === "race")?.name || (typeof a.system?.details?.race === "string" ? a.system.details.race : "");
      const c = (a.items?.filter(i => i.type === "class") || []).map(i => i.name).join("/");
      return [r, c].filter(Boolean).join(" ") || "adventurer";
    });
    parts.push(`Subject: an adventuring party group portrait — ${descs.length ? descs.join(", ") : "a band of heroes"} — standing together as a group.`);
    if (freeText && freeText.trim()) parts.push(freeText.trim());
    return parts.join(" ");
  }
  // (2) the DM's world art-direction
  if (dmStyle && dmStyle.trim()) parts.push(`Art direction: ${dmStyle.trim()}.`);
  // (3) auto from the sheet: species, class(es)/subclass, and a standout high ability
  const race = actor?.items?.find(i => i.type === "race")?.name
    || actor?.system?.details?.race?.name
    || (typeof actor?.system?.details?.race === "string" ? actor.system.details.race : "");
  const classes = (actor?.items?.filter(i => i.type === "class") || []).map(i => i.name);
  const subclass = actor?.items?.find(i => i.type === "subclass")?.name;
  const subj = [race, classes.join("/")].filter(Boolean).join(" ");
  let line = `Subject: ${subj ? `a ${subj}` : "an adventurer"}`;
  if (subclass) line += ` (${subclass})`;
  const abil = actor?.system?.abilities || {};
  let topKey = null, topVal = -Infinity;
  for (const k of ABILITIES) { const v = abil[k]?.value ?? 0; if (v > topVal) { topVal = v; topKey = k; } }
  if (topKey && topVal >= 16 && PORTRAIT_STAT_LOOK[topKey]) line += `, ${PORTRAIT_STAT_LOOK[topKey]}`;
  parts.push(line + ".");
  // (4) the player's own description last so it refines/overrides (gender, gear, colours)
  if (freeText && freeText.trim()) parts.push(freeText.trim());
  return parts.join(" ");
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
  #combatEvents = [];  // newest-first combat events (damage taken, save required) → bottom chips
  #toastEl = null;     // transient roll toast; overlay node kept across re-renders
  #toastTimer = null;
  #actionState = null; // null = action list; object = target-pick/fire sub-view
  #editingField = null; // B7: "hp" | "temp" while that stat is an inline input
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
  #reactionPrompt = null; // §9 incoming reaction chooser relayed from the executor
  #reactionTimer = null;
  #deathSaveDismissed = false; // X'd the death-save panel (DM's call overrides; warnings-not-walls)
  #partyMoveNote = null;  // party-mode move pad: last wall/refusal readout
  #partyView = true;      // packed: party tab set (true) vs the normal PC sheet (false)
  #partyTab = "view";     // party tab: view | order | explore | inventory | journal
  #wasPacked = false;     // pack-transition latch: jump phones to the order tab once per pack
  #lastReleased = null;   // scout release-follow: last-seen released member set
  #rollRequest = null;    // DM roll-request prompt {actorUuid, rollType, ability, label}
  #aooPrompt = null;      // opportunity-attack prompt {activityUuid, targetUuid, attackerName, moverName, ttlMs}
  #aooTimer = null;
  #colorPickOpen = false; // DM-triggered colour-picker overlay is showing
  #pausedDismissed = null; // §17.3 split-scene overlay: "activeId:hereId" the player browsed past
  #nightDismissed = null;  // §17.4 night overlays: "assign" | "watch:N" the player browsed past
  #placement = null;       // Round 33: active spell placement session { mode, kind, spellName, rangeFt, distFt, inRange, direction, activityUuid, busy }
  #onboardOpen = null;    // first-run welcome overlay: null = unresolved, true/false = show/hide
  #partySelf = null;      // marching-order: the owned member the player picked up
  #journalFilter = "";    // journal: live post filter ("shopke" → matching notes)
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
  #nearbyLoot = null;     // Item Piles loot: null (not checked) | [] (none) | [{uuid,name,img,itemCount,distance}]
  #nearbyDoors = null;    // doors within reach: [{id, ds, distance}]
  #nearbyTiles = null;    // active-tile interactables within reach: [{id, label, distance}]
  #lootBusy = false;      // a nearby-scan round-trip is in flight
  #journalDraft = "";     // party-journal composer text, kept across re-renders so typing isn't wiped
  #journalBusy = false;   // a partyJournalAdd round-trip is in flight
  #bioOpen = false;       // biography editor overlay (long-press the portrait/name)
  #bioEditing = false;    // biography: read+search (false) vs edit textarea (true)
  #bioDraft = "";         // biography composer text, kept across re-renders
  #bioFilter = "";        // biography read-mode search
  #bioBusy = false;       // a biography save is in flight
  #searchOpen = false;    // magnifying-glass search drawer is open (Spells/Equipment/Actions)
  #searchQuery = "";      // live search text; filtered via DOM toggle (no re-render → keeps focus)
  #wildShape = null;      // Druid shape browser: null | { open, beasts:null|[], loading }
  #summonConfig = null;   // summon options the player picks before the DM places: null | { uuid, name, slotOptions, slotId, profiles, profileId }
  #portraitGen = null;    // portrait generator screen: null | { actorId, mode:"portrait"|"body", freeText }
  #lastCombatantId = null; // track the active combatant to detect "my turn started"
  #charGen = null;        // char-gen workspace: null | { actorId, picking, abilMethod, abil, pool, rolled, assign }
                          //   picking: null|"race"|"background"|"class"|"abilities"
                          //   abilMethod: "pointbuy"|"array"|"roll"; abil = point-buy scores;
                          //   pool = active array/roll values; rolled = last 4d6 roll; assign = ability→pool index
  #charGenOptions = null; // compendium entries for the current picking type (null = loading)
  #cgBusy = false;        // char-gen step in flight — swallow repeat taps (Yaniv's triple grant, 2026-07-05)
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
    // Party Mode (§15): while packed there are no member tokens on-scene, so bind
    // to the player's own member PC (the actor doc) — the marching-order editor
    // keys "my character" off the subject. Prefer the assigned PC if it's a member.
    const packed = this.#partyGroup();
    if (packed) {
      const members = packed.system.members.map(m => m.actor).filter(Boolean);
      const owned = members.find(a => a.id === assigned?.id && a.isOwner) ?? members.find(a => a.isOwner);
      if (owned) return owned;
    }
    // No owned token on this scene. For a player, prefer a blank/in-build PC (the
    // switcher lists these) so they land on something actionable instead of being
    // stranded on a complete off-scene character the switcher won't show — which is
    // exactly what trapped them on "Multi". With no token AND no blank PC, return
    // null so the shell shows the "no token on this scene" screen (#noTokenHTML).
    // The GM/Display client keep the old read-only fallback — not the screen's audience.
    if (!game.user.isGM && !isDisplayClient()) {
      return game.actors.find(a => a.isOwner && this.#isCharGenPC(a)) ?? null;
    }
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
    this.#applyTheme(); // keep the saved theme's body class in sync each render
    content.style.setProperty("--mc-user", game.user?.color?.css ?? "var(--mc-gold)"); // personal color accent
    try { this.#applyMyTokenRing(); } catch (e) { console.warn(`${MODULE_ID} | ring paint skipped`, e); } // never let a token-visual write break the render
    if (toast) content.appendChild(toast);
    if (nextKey === prevKey) {
      const scroller = content.querySelector(".mc-content, .mc-cg-scroll");
      if (scroller && prevTop) scroller.scrollTop = prevTop;
    }
    this.#viewKey = nextKey;
    if (this.#searchOpen && this.#searchQuery) this.#applySearch(this.#searchQuery); // keep the filter after a re-render
    if (this.#editingField) {
      const inp = content.querySelector(".mc-stat-input");
      if (inp) { inp.focus(); inp.select(); }
    }
  }

  // "No player token available" mode: shown when the player has no token on the
  // active scene and no blank PC to build (get actor() returned null). Explains the
  // wait clearly and lists any characters they own — tap to view/build — so it isn't
  // a dead end. Carries the player's colour accent (--mc-user) like the rest of the UI.
  #noTokenHTML() {
    const scene = game.scenes?.active?.name ?? "this scene";
    const chars = game.actors.filter(a => a.type === "character" && a.isOwner);
    const rows = chars.map(a => `
      <button class="mc-nt-row" data-action="pick-offscene" data-actor-id="${a.id}">
        <img class="mc-nt-img" src="${a.img || "icons/svg/mystery-man.svg"}" alt="">
        <span class="mc-nt-name">${foundry.utils.escapeHTML(a.name)}</span>
        <span class="mc-nt-tag">${this.#isCharGenPC(a) ? "Build" : "View"}</span>
      </button>`).join("");
    return `<div class="mc-notoken">
      <div class="mc-nt-badge"><i class="fa-solid fa-location-dot"></i></div>
      <div class="mc-nt-title">No token on this scene</div>
      <div class="mc-nt-sub">The DM hasn't placed a token for you on <b>${foundry.utils.escapeHTML(scene)}</b> yet. This updates automatically the moment they do.</div>
      ${rows ? `<div class="mc-nt-listhead">Your characters</div><div class="mc-nt-list">${rows}</div>` : ""}
    </div>`;
  }
  #buildHTML() {
    this.syncSubject(); // self-heal a subject stranded by a scene switch
    // §17.3: the paused overlay must ride EVERY branch — when the PC's token is on
    // a non-active scene the shell rebinds to some off-scene actor and renders the
    // no-token/blank-PC screens (live 2026-07-08: the traveler's phone offered to
    // build the spare blank instead of saying "wait"). Computed once, prefixed to
    // each early return; the normal sheet includes it in its own template.
    const paused = this.#pausedHTML() || this.#nightOverlayHTML();
    const actor = this.actor;
    if (!actor) return paused + this.#noTokenHTML();
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
    // The portrait generator can overlay char-gen too (entry: tap the char-gen
    // portrait), so NEW characters get it as a build step — not just existing ones
    // via the sheet. Back (portrait-back) clears it and returns to the build view.
    if (this.#portraitGen && ((this.#charGen?.actorId === actor.id) || this.#isBlankPC(actor)))
      return `<div class="mc-cg-scroll">${this.#portraitGenHTML(actor)}</div>`;
    if (this.#charGen?.actorId === actor.id) return `<div class="mc-cg-scroll">${this.#charGenHTML(actor)}</div>`;
    if (this.#isBlankPC(actor)) return paused + `<div class="mc-cg-scroll">${this.#charGenStartHTML(actor)}</div>`;
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
    const classIcons = this.#classIconsHTML(actor);

    // Show every effect Foundry shows ON the character: direct ones (Monstrosity, status
    // conditions like Prone, temporary buffs like Bless) AND effects TRANSFERRED from items —
    // Rage / Unarmored Defense / Danger Sense live on their feature item, not actor.effects, so
    // the old actor.effects read dropped them. appliedEffects is exactly the active set the
    // sheet shows. DM 2026-06-27: "any effect in the Foundry UI should show up on mobile."
    const effects = (actor.appliedEffects ?? []).filter(e => e.name);
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
    // Tap OR long-press opens the condition detail (DM 2026-07-04: "a tap should
    // open the condition too") — data-action for the tap, data-detail for the hold.
    const condsHTML = effects.map(e =>
      `<span class="mc-chip mc-chip-tap${isEconEffect(e) ? " mc-chip-used" : ""}" data-action="cond-open" data-detail="cond" data-effect-id="${e.id}">${e.img ? `<img class="mc-chip-icon" src="${e.img}" alt="">` : ""}${foundry.utils.escapeHTML(e.name)}</span>`
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
          <div class="mc-name">${classIcons ? `<span class="mc-cls-run">${classIcons}</span>` : ""}${totalLevel ? `<button class="mc-name-lvl ${this.#showLevels ? "mc-on" : ""}" data-action="toggle-levels"><span class="mc-lvl-num">Lvl ${totalLevel}</span></button>` : ""}<span class="mc-name-text" data-action="show-summary" data-detail="bio" title="Tap for summary · hold for bio">${foundry.utils.escapeHTML(actor.name)}</span>
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
      ${this.#eventStripHTML()}
      ${this.#rollStripHTML()}
      ${this.#initPromptHTML()}
      ${this.#turnHudHTML()}
      <nav class="mc-tabs">${this.#tabBarHTML()}</nav>
      ${this.#imagePopupHTML(actor)}
      ${this.#sharedImageHTML()}
      ${this.#savePromptHTML()}
      ${this.#reactionPromptHTML()}
      ${this.#rollRequestHTML()}
      ${this.#aooPromptHTML()}
      ${this.#colorPickOpen ? this.#colorPickHTML() : ""}
      ${this.#placementHTML()}
      ${this.#pausedHTML() || this.#nightOverlayHTML()}
      ${this.#onboardHTML()}`;
  }

  // §17.3 (DM 2026-07-08): ONE shared screen, the DM alone picks the active scene.
  // A phone whose PC is on a DIFFERENT scene than the active one (ran ahead through
  // a teleporter — or left behind while a scout plays) waits behind this overlay
  // instead of poking a board it can't act on (the executor is active-scene-bound).
  // "Browse my sheet anyway" dismisses until either scene changes; the overlay
  // returns on the next split. Char-gen and packed party are exempt (no/soft token).
  #pausedState() {
    if (this.#charGen) return null;
    const active = game.scenes.active;
    if (!active) return null;
    const actor = game.user.character ?? this.actor;
    if (!actor || actor.type !== "character") return null;
    if (active.tokens.some(t => t.actorId === actor.id)) return null; // on the action scene
    const here = game.scenes.find(s => s !== active && s.tokens.some(t => t.actorId === actor.id));
    if (!here) return null; // no token anywhere (char-gen/limbo) — not a split
    // packed party: the PC rides inside the group token, not their own — exempt
    const packed = game.actors.some(a => a.type === "group" && a.getFlag("mobile-command", "packed")
      && (a.system?.members ?? []).some(m => m.actor?.id === actor.id));
    if (packed) return null;
    return { key: `${active.id}:${here.id}`, hereName: here.name, activeName: active.name };
  }
  // §17.4 guard duty: my party group's night flag drives two phone overlays —
  // the WATCH BOARD while assigning (tap a row to stand that watch, multi-duty
  // allowed) and the Zzz card while the current watch doesn't include me.
  // Both carry the same "Browse my sheet" escape as the paused overlay.
  #nightInfo() {
    const me = game.user.character ?? this.actor;
    if (!me || me.type !== "character") return null;
    for (const g of game.actors.filter(a => a.type === "group")) {
      const night = g.getFlag("mobile-command", "night");
      if (!night) continue;
      if (!(g.system?.members ?? []).some(m => m.actor?.id === me.id)) continue;
      return { group: g, night, me };
    }
    return null;
  }
  #nightOverlayHTML() {
    const info = this.#nightInfo();
    if (!info) return "";
    const esc = foundry.utils.escapeHTML;
    const { group, night, me } = info;
    // Keys carry the night's session id so a NEW night (or a restarted one)
    // re-arms the overlay even if the player browsed past the last one
    // (2026-07-09: a dismissed board stayed hidden across a DM restart). While
    // dismissed but the night's still live, a small floating pill re-opens it —
    // "browse my sheet" is a peek, not a one-way exit.
    const sid = night.id ?? "n";
    if (night.stage === "assign") {
      const key = `assign:${sid}`;
      if (this.#nightDismissed === key)
        return `<button class="mc-night-reopen" data-action="night-reopen"><i class="fas fa-moon"></i> Watches</button>`;
      const first = id => game.actors.get(id)?.name?.split(" ")[0] ?? "?";
      const rows = [1, 2, 3].map(w => {
        const ids = night.watches?.[w] ?? [];
        const mine = ids.includes(me.id);
        const others = ids.filter(id => id !== me.id).map(first).join(", ");
        return `<button class="mc-night-row ${mine ? "mc-on" : ""}" data-action="night-toggle" data-watch="${w}" data-group="${group.id}">
          <b>${["1st", "2nd", "3rd"][w - 1]} watch</b>
          <span>${mine ? "You" : ""}${mine && others ? ", " : ""}${esc(others)}${!mine && !others ? "—" : ""}</span>
          <i class="fas ${mine ? "fa-circle-check" : "fa-circle"}"></i>
        </button>`;
      }).join("");
      return `<div class="mc-paused"><div class="mc-paused-card">
        <i class="fas fa-moon mc-paused-ico" style="animation:none"></i>
        <div class="mc-paused-title">Setting the watches</div>
        <div class="mc-paused-sub">Tap the watches <b>${esc(me.name.split(" ")[0])}</b> will stand. You can take more than one — or none and sleep through.</div>
        <div class="mc-night-rows">${rows}</div>
        <button class="mc-paused-browse" data-action="night-dismiss" data-key="${key}"><i class="fas fa-book-open"></i> Browse my sheet</button>
      </div></div>`;
    }
    if (night.stage === "watch") {
      const onDuty = (night.watches?.[night.watch] ?? []).includes(me.id);
      if (onDuty) return "";
      const key = `watch:${sid}:${night.watch}`;
      if (this.#nightDismissed === key)
        return `<button class="mc-night-reopen" data-action="night-reopen"><i class="fas fa-bed"></i> Zzz</button>`;
      return `<div class="mc-paused"><div class="mc-paused-card">
        <i class="fas fa-bed mc-paused-ico" style="animation:none"></i>
        <div class="mc-paused-title">Zzz…</div>
        <div class="mc-paused-sub">Watch ${night.watch} — <b>${esc(me.name.split(" ")[0])}</b> is asleep. The DM will wake you if the night turns loud.</div>
        <button class="mc-paused-browse" data-action="night-dismiss" data-key="${key}"><i class="fas fa-book-open"></i> Browse my sheet</button>
      </div></div>`;
    }
    return "";
  }
  #pausedHTML() {
    const st = this.#pausedState();
    if (!st || this.#pausedDismissed === st.key) return "";
    return `<div class="mc-paused">
      <div class="mc-paused-card">
        <i class="fas fa-hourglass-half mc-paused-ico"></i>
        <div class="mc-paused-title">Waiting for the party</div>
        <div class="mc-paused-sub">You're on <b>${foundry.utils.escapeHTML(st.hereName)}</b> — the action is on
          <b>${foundry.utils.escapeHTML(st.activeName)}</b>. The DM will bring the scene to you.</div>
        <button class="mc-paused-browse" data-action="paused-dismiss" data-key="${foundry.utils.escapeHTML(st.key)}">
          <i class="fas fa-book-open"></i> Browse my sheet anyway</button>
      </div>
    </div>`;
  }

  // First-run welcome (playtest 2026-07-05: testers never found fullscreen and
  // didn't know the gestures). Shows ONCE per device (localStorage flag), and can
  // be reopened from Details ("Show the welcome tips"). Deliberately three beats:
  // fullscreen (the working button / iOS how-to), the three gestures, go play.
  #onboardHTML() {
    if (this.#onboardOpen === null) {
      try { this.#onboardOpen = window.localStorage.getItem("mc-onboarded") !== "1"; }
      catch (e) { this.#onboardOpen = false; } // private mode: never nag every load
    }
    if (!this.#onboardOpen) return "";
    const standalone = navigator.standalone === true;
    const fsStep = standalone
      ? `<div class="mc-ob-note">✓ You're running as an app — already full screen.</div>`
      : document.fullscreenEnabled
        ? `<button class="mc-ob-fs" data-action="fullscreen"><i class="fas ${document.fullscreenElement ? "fa-compress" : "fa-expand"}"></i> ${document.fullscreenElement ? "✓ Full screen — tap to exit" : "Go full screen"}</button>`
        : `<div class="mc-ob-note"><b>iPhone:</b> tap Safari's <i class="fas fa-arrow-up-from-bracket"></i> Share button → <b>Add to Home Screen</b>, then open Mobile Command from that icon — it runs full screen like an app.</div>`;
    return `<div class="mc-onboard">
      <div class="mc-ob-card">
        <div class="mc-ob-title">Welcome to the table</div>
        <div class="mc-ob-step">
          <div class="mc-ob-head"><span class="mc-ob-n">1</span> Make it big</div>
          ${fsStep}
        </div>
        <div class="mc-ob-step">
          <div class="mc-ob-head"><span class="mc-ob-n">2</span> Three moves</div>
          <div class="mc-ob-gestures">
            <div class="mc-ob-g"><i class="fas fa-hand-point-up"></i><span><b>Tap</b> a thing to do it</span></div>
            <div class="mc-ob-g"><i class="fas fa-hand-holding"></i><span><b>Hold</b> a thing to read about it</span></div>
            <div class="mc-ob-g"><i class="fas fa-hand-fist"></i><span>The <b>hand</b> in the move pad uses doors, loot &amp; levers next to you</span></div>
          </div>
        </div>
        <div class="mc-ob-step">
          <div class="mc-ob-head"><span class="mc-ob-n">3</span> Eyes on the TV</div>
          <div class="mc-ob-note">The map lives on the shared screen — your phone is your character. Prompts (saves, reactions) pop up here when it's your moment.</div>
        </div>
        <button class="mc-ob-done" data-action="onboard-done"><i class="fas fa-dice-d20"></i> Let's play</button>
      </div>
    </div>`;
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
      <img class="mc-portrait" src="${img}" alt="" data-action="portrait-open" title="Generate a portrait">
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
      // Redo chip (playtest 2026-07-05): a CANCELLED advancement wizard never
      // re-offered itself — the item sat on the sheet with its choices unapplied and
      // no way back in (Tomo's empty sheet). ⟳ re-runs the item's advancement flow
      // via dnd5e's own forModifyChoices, so skipped/cancelled steps are recoverable.
      const redo = item ? `<span class="mc-cg-redo" role="button" data-action="char-gen-redo" data-item-id="${item.id}" title="Redo the choices for ${foundry.utils.escapeHTML(item.name)}"><i class="fas fa-rotate-left"></i></span>` : "";
      return `<button class="mc-cg-row ${item ? "mc-cg-done" : ""}" data-action="char-gen-pick" data-cgtype="${type}">
        <i class="fas ${icon} mc-cg-row-ico"></i>
        <span class="mc-cg-row-label">${label}</span>
        <span class="mc-cg-row-val">${item ? foundry.utils.escapeHTML(item.name) : "Choose…"}</span>
        ${redo}
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
    // Highest castable level: leveled slots AND pact slots (a warlock has ONLY
    // system.spells.pact — the old spellN-only scan read maxLevel 0 and emptied
    // the leveled list entirely; DM 2026-07-09 "new warlock, nothing I can cast").
    const pact = cls.system.spellcasting.progression === "pact";
    const maxLevel = Math.max(0, ...Object.entries(actor.system.spells ?? {})
      .filter(([k, v]) => (/^spell\d/.test(k) || k === "pact") && v?.max > 0)
      .map(([k, v]) => k === "pact" ? Number(v.level ?? 1) : Number(k.replace("spell", ""))));
    let haveCantrips = 0, haveSpells = 0;
    for (const s of actor.items) {
      if (s.type !== "spell") continue;
      if ((s.system?.level ?? 0) === 0) haveCantrips++; else haveSpells++;
    }
    return { classId: id, maxLevel, knownCantrips, knownSpells, haveCantrips, haveSpells, prepared, pact };
  }

  // Compendium chooser for the current pick type (null options = still loading).
  #charGenPickerHTML(actor) {
    const type = this.#charGen.picking;
    const label = { race: "Species", background: "Background", class: "Class" }[type] ?? type;
    const head = `<div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="char-gen-pick-back" aria-label="Back"><i class="fas fa-xmark"></i></button>
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
    // Push the finished PC's senses onto its token(s) so a fresh caster/darkvision PC
    // actually sees on the shared TV/DM canvas. The placed token was dropped while the PC
    // was still blank (sight range 0 / basic), so its darkvision never reached the token
    // and it looked blind on the TV. Fire-and-forget — never blocks Finish.
    if (actor) this.#syncFinishedTokenSight(actor).catch((e) => console.warn(`${MODULE_ID} | finish sight-sync failed`, e));
    // Claim the finished PC as THIS user's assigned character (2026-07-07): midi
    // routes save/reaction prompts to "the active user whose CHARACTER is this
    // actor" FIRST — without the assignment, the first active player-OWNER wins,
    // and the TV account (which auto-owns every PC) can swallow the prompt (the
    // Shield-didn't-reach-mobile report). Players may set their own character;
    // never overrides an existing assignment.
    if (actor && !game.user.isGM && !game.user.character) {
      game.user.update({ character: actor.id }).catch((e) => console.warn(`${MODULE_ID} | character self-assign failed`, e));
    }
    // Every character creation ends "rested" (DM 2026-07-05: fresh casters had zero
    // spell slots — "you need to rest to get slots after CC"). Try a silent long rest
    // (recovers uses/HD properly) — but dnd5e's allowRests=false world setting makes a
    // PLAYER's rest silently refuse (initiateRest, dnd5e.mjs:38142), so follow with a
    // direct fill-UP of HP + slots, which an owner may always write. Fill-up only —
    // never reduces anything, so a mid-session re-finish can't wipe spent resources.
    if (actor) this.#finishTopUp(actor).catch((e) => console.warn(`${MODULE_ID} | finish top-up failed`, e));
  }

  async #finishTopUp(actor) {
    try { await actor.longRest({ dialog: false, chat: false }); } catch (e) { /* permission-gated world */ }
    const update = {};
    const hp = actor.system?.attributes?.hp;
    if (hp && (hp.value ?? 0) < (hp.max ?? 0)) update["system.attributes.hp.value"] = hp.max;
    for (const [key, slot] of Object.entries(actor.system?.spells ?? {})) {
      if ((slot?.max ?? 0) > 0 && (slot.value ?? 0) < slot.max) update[`system.spells.${key}.value`] = slot.max;
    }
    if (Object.keys(update).length) await actor.update(update);
  }

  // Sync ONE actor's token sight from its dnd5e senses — the char-gen-finish counterpart
  // to main.js syncPartyTokenSight, but scoped to a single actor, runnable WITHOUT a ready
  // canvas (char-gen runs on the phone) and by the token's OWNER (no GM needed). Uses scene
  // token DOCS, not canvas placeables. The senses→sight computation itself is the shared
  // actorTokenSight (rpc.js) — one source of truth with deploy/release/combat-sync (2026-07-04).
  async #syncFinishedTokenSight(actor) {
    if (!actor) return;
    const update = actorTokenSight(actor);
    const { sight, detectionModes } = update;
    // Future drops: fix the prototype token so a re-drop is already correct.
    try { await actor.update({ "prototypeToken.sight": sight, "prototypeToken.detectionModes": detectionModes }); }
    catch (e) { console.warn(`${MODULE_ID} | proto sight-sync failed`, e); }
    // Already-placed tokens for this actor across scenes (owner can update its own).
    for (const scene of game.scenes ?? []) {
      for (const td of (scene.tokens?.filter((t) => t.actorId === actor.id) ?? [])) {
        try { await td.update(update); } catch (e) { console.warn(`${MODULE_ID} | token sight-sync failed for ${td.name}`, e); }
      }
    }
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
    // In-flight lock: a double-tap here opens TWO advancement managers → duplicate
    // class/species items (playtest 2026-07-05). One at a time; unlocks in finally.
    if (this.#cgBusy) return;
    this.#cgBusy = true;
    try {
      const item = await fromUuid(uuid);
      this.#charGen.picking = null; this.#charGenOptions = null;
      this.render();
      if (!item) return ui.notifications.warn("That option couldn't load.");
      const AM = dnd5e.applications?.advancement?.AdvancementManager ?? dnd5e.documents?.advancement?.AdvancementManager;
      if (!AM) throw new Error("AdvancementManager unavailable");
      AM.forNewItem(actor, item.toObject()).render(true);
    } catch (e) {
      console.error("mobile-command | char-gen add failed", e);
      ui.notifications.warn("Couldn't add that option — see console.");
    } finally {
      this.#cgBusy = false;
    }
  }

  // Re-run an owned item's advancement flow (species/background/class) so a
  // cancelled or skipped wizard is recoverable — dnd5e's own "Modify Choices"
  // path, lifted onto the phone. Class advancements start at level 1; species/
  // background live at level 0 in dnd5e's byLevel model.
  async #charGenRedo(itemId) {
    const actor = this.actor; if (!actor) return;
    if (this.#cgBusy) return;
    this.#cgBusy = true;
    try {
      const item = actor.items.get(itemId);
      if (!item) return;
      const AM = dnd5e.applications?.advancement?.AdvancementManager ?? dnd5e.documents?.advancement?.AdvancementManager;
      if (!AM) throw new Error("AdvancementManager unavailable");
      const level = item.type === "class" ? 1 : 0;
      const manager = AM.forModifyChoices(actor, item.id, level);
      if (manager.steps?.length) manager.render(true);
      else ui.notifications.info(`${item.name} has no choices to redo.`);
    } catch (e) {
      console.error("mobile-command | advancement redo failed", e);
      ui.notifications.warn("Couldn't reopen those choices — see console.");
    } finally {
      this.#cgBusy = false;
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
        <button class="mc-back mc-picker-x" data-action="char-gen-pick-back" aria-label="Back"><i class="fas fa-xmark"></i></button>
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
    // Over-cap picks stay ALLOWED (warnings, not walls — the DM may permit them),
    // but an ACCIDENTAL over-pick shouldn't slip through on one tap (live 2026-07-08:
    // 4/2 leveled picks stood unnoticed) — confirm before granting past a cap.
    const si = this.#charGenSpellInfo(actor) ?? {};
    const selCant = opts.cantrips.filter(s => sel.has(s.uuid)).length;
    const selLev = opts.leveled.filter(s => sel.has(s.uuid)).length;
    const over = [];
    if (Number.isFinite(si.knownCantrips) && selCant > si.knownCantrips) over.push(`${selCant} of ${si.knownCantrips} cantrips`);
    if (Number.isFinite(si.knownSpells) && selLev > si.knownSpells) over.push(`${selLev} of ${si.knownSpells} spells`);
    if (over.length) {
      const yes = await foundry.applications.api.DialogV2.confirm({
        window: { title: "More than the class allows" },
        content: `<p>You picked <b>${over.join(" and ")}</b> — over your class limit. Add them anyway? (Your DM may not allow it.)</p>`
      }).catch(() => false);
      if (!yes) return;
    }
    const haveNames = new Set(actor.items.filter(i => i.type === "spell").map(i => i.name));
    // A pact caster's leveled spells must be preparation.mode "pact" — they cast
    // from pact slots. "prepared" on a warlock = uncastable (no leveled slots at
    // all; DM 2026-07-09 "new warlock, nothing I can cast").
    const levMode = si.pact ? "pact" : "prepared";
    const toAdd = [];
    for (const s of [...opts.cantrips, ...opts.leveled]) {
      if (!sel.has(s.uuid) || haveNames.has(s.name)) continue; // add-only (no removal)
      const doc = await fromUuid(s.uuid);
      if (!doc) continue;
      const data = doc.toObject();
      const mode = (data.system?.level ?? 0) > 0 ? levMode : "prepared";
      foundry.utils.setProperty(data, "system.preparation.mode", mode);
      foundry.utils.setProperty(data, "system.preparation.prepared", true);
      toAdd.push(data);
    }
    try {
      const created = toAdd.length ? await actor.createEmbeddedDocuments("Item", toAdd) : [];
      // dnd5e resets preparation.prepared to false on create; a known caster's
      // leveled spells must be prepared to be castable (cantrips auto-become mode
      // "always", pact spells are always-prepared by mode). Re-prepare in a
      // follow-up update where it didn't stick.
      const reprep = created
        .filter(i => (i.system?.level ?? 0) > 0 && ["prepared", "pact"].includes(i.system?.preparation?.mode) && !i.system.preparation.prepared)
        .map(i => ({ _id: i.id, "system.preparation.prepared": true }));
      if (reprep.length) await actor.updateEmbeddedDocuments("Item", reprep);
    } catch (e) { return ui.notifications.warn(`Couldn't add spells: ${e.message}`); }
    if (cg.learn) this.#charGen = null; // post-creation "Learn spells" → back to the sheet, not the workspace
    else cg.picking = null;
    this.#charGenSpellOptions = null;
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
        <button class="mc-back mc-picker-x" data-action="char-gen-pick-back" aria-label="Back"><i class="fas fa-xmark"></i></button>
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
    // In-flight lock (Yaniv's triple-tap, 2026-07-05): the grant awaits compendium
    // loads BEFORE the "already granted" flag lands, so rapid taps each fired a full
    // grant → three copies of everything. Repeat taps are swallowed until it settles.
    if (this.#cgBusy) return;
    this.#cgBusy = true;
    try {
      await this.#applyEquipInner(actor, eq);
    } finally {
      this.#cgBusy = false;
    }
  }
  async #applyEquipInner(actor, eq) {
    const want = [...eq.plan.auto.map(i => ({ uuid: i.uuid, count: i.count }))];
    let gold = eq.plan.autoGold || 0;
    eq.plan.choices.forEach((ch, ci) => {
      const o = ch.options[eq.sel[ci]];
      if (!o) return;
      if (o.kind === "items") want.push(...o.items.map(i => ({ uuid: i.uuid, count: i.count })));
      else if (o.kind === "gold") gold += o.gold || 0;
      else if (o.kind === "category" && eq.catUuid[ci]) want.push({ uuid: eq.catUuid[ci], count: 1 });
    });
    // Auto-equip the grant (2026-07-07): grants used to arrive UNEQUIPPED, so a
    // fresh PC had no equipped armor (wrong AC) and no equipped weapon (invisible
    // to the AoO watcher — Grukk's whole arsenal read equipped=false). Weapons all
    // equip; the FIRST body armor and FIRST shield equip unless one is already
    // worn (dnd5e warns on doubled armor).
    const BODY_ARMOR = ["light", "medium", "heavy"];
    const wearing = (kinds) => actor.itemTypes.equipment.some(e =>
      e.system?.equipped && kinds.includes(e.system?.type?.value));
    let hasArmor = wearing(BODY_ARMOR), hasShield = wearing(["shield"]);
    const autoEquip = (data) => {
      if (data.type === "weapon") { data.system.equipped = true; return; }
      if (data.type !== "equipment") return;
      const kind = data.system?.type?.value;
      if (BODY_ARMOR.includes(kind) && !hasArmor) { data.system.equipped = true; hasArmor = true; }
      else if (kind === "shield" && !hasShield) { data.system.equipped = true; hasShield = true; }
    };
    const toAdd = [], names = [];
    for (const w of want) {
      const doc = await fromUuid(w.uuid); if (!doc) continue;
      const data = doc.toObject();
      autoEquip(data);
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
        <button class="mc-back mc-picker-x" data-action="char-gen-pick-back" aria-label="Back"><i class="fas fa-xmark"></i></button>
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

  // Reaction chooser (§9): the executor relayed midi's reaction window here because midi's
  // own dialog is dead on the canvasless phone. Each option fires that reaction on the
  // executor (rpc.useActivity) with the attacker pre-targeted + isReaction — so the slot is
  // spent, the damage rolls, and the reaction's own save fans to the attacker (DM 2026-07-11).
  noteReactionPrompt(payload) {
    clearTimeout(this.#reactionTimer);
    this.#reactionPrompt = (payload?.reactions?.length ? payload : null);
    if (this.#reactionPrompt) {
      this.#sfx("prompt");
      if (payload.ttlMs) {
        this.#reactionTimer = setTimeout(() => { this.#reactionPrompt = null; if (this.rendered) this.render(); }, payload.ttlMs);
      }
    }
    if (this.rendered) this.render();
  }
  #reactionPromptHTML() {
    const r = this.#reactionPrompt;
    if (!r) return "";
    const who = r.attackerName ? `from ${foundry.utils.escapeHTML(r.attackerName)}` : "";
    const btns = (r.reactions ?? []).map(rx =>
      `<button class="mc-save-roll mc-react-opt" data-action="reaction-pick" data-uuid="${rx.uuid}" data-self="${rx.selfTarget ? "1" : ""}">
        <img class="mc-react-img" src="${rx.img}" alt="">
        <span>${foundry.utils.escapeHTML(rx.itemName && rx.itemName !== rx.name ? `${rx.itemName}: ${rx.name}` : (rx.itemName || rx.name))}</span>
      </button>`).join("");
    return `<div class="mc-saveprompt mc-reaction">
      <div class="mc-saveprompt-bar">
        <span class="mc-saveprompt-title"><i class="fas fa-bolt"></i> Reaction ${who}</span>
        <button class="mc-saveprompt-x" data-action="reaction-dismiss" aria-label="Close"><i class="fas fa-xmark"></i></button>
      </div>
      <div class="mc-saveprompt-body">
        <div class="mc-saveprompt-btns mc-react-btns">${btns}</div>
      </div>
    </div>`;
  }

  // Fire the chosen reaction on the executor: the attacker is the target (unless the
  // reaction is self-targeted, e.g. Shield), isReaction spends the reaction + slot, and midi
  // rolls the damage + fans the reaction's own save to the attacker. Reuses the proven
  // useActivity/handleItemUse path — same as a normal action, just pre-targeted.
  async #useReaction(uuid, selfTarget) {
    const r = this.#reactionPrompt;
    clearTimeout(this.#reactionTimer);
    this.#reactionPrompt = null;
    this.render();
    if (!uuid) return;
    const chosen = (r?.reactions ?? []).find(x => x.uuid === uuid);
    const label = chosen ? (chosen.itemName || chosen.name) : "Reaction";
    try {
      const res = await rpc.useActivity({
        activityUuid: uuid,
        targetUuids: (selfTarget || !r?.attackerTokenUuid) ? [] : [r.attackerTokenUuid],
        midiOptions: { isReaction: true, workflowOptions: { targetConfirmation: "none" } }
      });
      if (res?.ok === false) ui.notifications?.warn(`Reaction failed: ${res.reason ?? "unknown"}`);
      else this.#pushEvent({ kind: "reaction", text: `Reacted: ${label}` });
    } catch (e) {
      console.warn(`${MODULE_ID} | useReaction failed`, e);
      ui.notifications?.warn("Reaction failed.");
    }
  }

  // Opportunity-attack prompt (aoo.js watcher → this phone): an enemy is walking
  // out of this player's reach. Attack = the normal two-tap attack flow with the
  // mover PRE-TARGETED (assigned-targets path); midi charges the reaction on roll.
  #aooPromptHTML() {
    const p = this.#aooPrompt;
    if (!p) return "";
    return `<div class="mc-saveprompt mc-aoo">
      <div class="mc-saveprompt-bar">
        <span class="mc-saveprompt-title"><i class="fas fa-bolt"></i> ${foundry.utils.escapeHTML(p.title || "Opportunity attack!")}</span>
        <button class="mc-saveprompt-x" data-action="aoo-dismiss" aria-label="Close"><i class="fas fa-xmark"></i></button>
      </div>
      <div class="mc-saveprompt-body">
        <div class="mc-saveprompt-sub">${foundry.utils.escapeHTML(p.reason || `${p.moverName ?? "An enemy"} is escaping ${p.attackerName ?? "your"}'s reach`)}</div>
        <div class="mc-saveprompt-btns">
          <button class="mc-save-roll" data-action="aoo-attack">Attack with ${foundry.utils.escapeHTML(p.weaponName || "your weapon")}</button>
        </div>
      </div>
    </div>`;
  }

  noteAoOPrompt(payload) {
    clearTimeout(this.#aooTimer);
    this.#aooPrompt = payload || null;
    if (payload) this.#sfx("prompt"); // off-turn attention cue — eyes are on the TV
    if (payload?.ttlMs) {
      this.#aooTimer = setTimeout(() => {
        this.#aooPrompt = null;
        if (this.rendered) this.render();
      }, payload.ttlMs);
    }
    if (this.rendered) this.render();
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
      <button class="mc-imgpop-gen" data-action="portrait-open"><i class="fas fa-wand-magic-sparkles"></i> Generate portrait</button>
    </div>`;
  }

  // DM "Show Players" image, routed onto the phone (the shell hides native windows,
  // so Foundry's own ImagePopout never reaches a phone). Full-screen, tap ✕ to close.
  #sharedImageHTML() {
    const s = this.#sharedImage;
    if (!s?.src) return "";
    // Image only — never a caption/name. A shared image's name can be a major spoiler
    // (e.g. a potion image labelled "Poison of Wither"), so MC shows the picture alone.
    // DM request 2026-06-26.
    return `<div class="mc-imgpop mc-imgpop-shared">
      <button class="mc-imgpop-x" data-action="shared-img-close" aria-label="Close"><i class="fas fa-xmark"></i></button>
      <img class="mc-imgpop-img" src="${s.src}" alt="">
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

  // Bottom bar. Packed party view gets its own tab set (Party OS, DESIGN §15
  // Round 7); "My sheet" flips to the full normal PC UI, which then carries a
  // "Party" tab to flip back. Unpacked = the classic six.
  #tabBarHTML() {
    const packed = this.#partyGroup();
    const pbtn = (id, icon, label) =>
      `<button class="mc-tab ${this.#partyTab === id ? "mc-active" : ""}" data-action="ptab" data-ptab="${id}" title="${label}" aria-label="${label}"><i class="fas ${icon}"></i></button>`;
    if (packed && this.#partyView) {
      return `${pbtn("view", "fa-people-group", "Party")}
        ${pbtn("order", "fa-border-all", "Party order")}
        ${pbtn("explore", "fa-compass", "Exploration")}
        ${pbtn("inventory", "fa-box-open", "Shared inventory")}
        ${pbtn("journal", "fa-feather", "Journal")}
        <button class="mc-tab" data-action="party-view-toggle" data-on="0" title="My sheet" aria-label="My sheet"><i class="fas fa-user"></i></button>`;
    }
    return `${this.#tabButton("actions", "fa-hand-fist", "Actions")}
      ${this.#tabButton("details", "fa-user", "Details")}
      ${this.#tabButton("sheet", "fa-compass", "Explore")}
      ${this.#tabButton("spells", "fa-wand-sparkles", "Spells")}
      ${this.#tabButton("equipment", "fa-suitcase", "Equipment")}
      ${this.#tabButton("journal", "fa-feather", "Journal")}
      ${packed ? `<button class="mc-tab mc-tab-party" data-action="party-view-toggle" data-on="1" title="Party" aria-label="Party"><i class="fas fa-people-group"></i></button>` : ""}`;
  }

  #tabContent(actor) {
    if (!this.#atZeroHP(actor)) this.#deathSaveDismissed = false; // back above 0 → re-arm for next time
    // §7.4: collapse to death saves at 0 HP — unless the player X'd it (the DM
    // may rule otherwise; warnings-not-walls). A reopen chip (#buildHTML) brings
    // it back while still down.
    if (this.#atZeroHP(actor) && !this.#deathSaveDismissed) return this.#deathSaveHTML(actor);
    // Party Mode (§15 Round 7): while packed, the shell offers a party tab set —
    // but "My sheet" flips back to the FULL normal PC UI (tokenless rolls, items,
    // feats all work document-level: "roll a group stealth check" happens there).
    const party = this.#partyGroup();
    // On PACK (transition into packed), pull every member's phone to the order
    // tab — that's the task at hand (DM 2026-07-03). Unpack re-arms the jump.
    if (party && !this.#wasPacked) { this.#wasPacked = true; this.#partyView = true; this.#partyTab = "order"; }
    else if (!party) this.#wasPacked = false;
    // Biography editor overlays everything (opened from the header, packed or not).
    if (this.#bioOpen) return this.#bioHTML(actor);
    if (party && this.#partyView) return this.#partyContent(party, actor);
    // An in-progress action/cast overlays the current tab — so casting from the
    // Spells tab (or using a favorite from Explore) stays put instead of jumping.
    if (this.#detailCard) return this.#detailCardHTML();
    if (this.#actionState) return this.#targetPickerHTML();
    if (this.#itemPickerId) return this.#itemActivityPickerHTML(actor);
    if (this.#wildShape?.open) return this.#wildShapeBrowserHTML();
    if (this.#summonConfig) return this.#summonConfigHTML();
    if (this.#portraitGen) return this.#portraitGenHTML();
    if (this.#tab === "actions") return this.#actionsHTML(actor);
    if (this.#tab === "details") return this.#detailsHTML(actor);
    if (this.#tab === "spells") return this.#spellsHTML(actor);
    if (this.#tab === "equipment") return this.#equipmentHTML(actor);
    if (this.#tab === "journal") return this.#journalHTML();
    return this.#exploreHTML(actor); // "Explore" tab: move pad + the sheet
  }

  // At 0 HP a player character can only make death saves — the content area
  // collapses to the death-save panel regardless of the selected tab (§7.4).
  #atZeroHP(actor) {
    return actor?.type === "character" && (actor.system.attributes?.hp?.value ?? 1) <= 0;
  }

  // Class (and subclass) icon run for an actor — used by the header (beside the
  // Lvl button) and the party roster. Multiclass: each class then its paired
  // subclass (via classIdentifier), primary class first; imgs from the items.
  #classIconsHTML(actor) {
    const subItems = actor.items.filter(i => i.type === "subclass");
    return actor.items.filter(i => i.type === "class")
      .sort((a, b) => (b.system.levels || 0) - (a.system.levels || 0) || a.name.localeCompare(b.name))
      .flatMap(c => {
        const run = [{ img: c.img, label: `${c.name} ${c.system.levels || 1}`, sub: false }];
        const sub = subItems.find(s => s.system?.classIdentifier === c.system?.identifier);
        if (sub) run.push({ img: sub.img, label: sub.name, sub: true });
        return run;
      })
      .map(ic => `<img class="mc-cls-icon${ic.sub ? " mc-subcls-icon" : ""}" src="${foundry.utils.escapeHTML(ic.img || "icons/svg/mystery-man.svg")}" title="${foundry.utils.escapeHTML(ic.label)}" alt="${foundry.utils.escapeHTML(ic.label)}">`)
      .join("");
  }

  // Facing indicator: one FA arrow rotated to the facing (45° steps after the
  // ring-rotation upgrade; uniform glyphs — the unicode ←→ rendered differently).
  #fwdIcon(forward) {
    return `<i class="fas fa-arrow-up mc-fwd-i" style="transform: rotate(${(forward ?? 0) * 45}deg)"></i>`;
  }

  // Party OS content router (packed + party view active).
  #partyContent(group, actor) {
    if (this.#detailCard) return this.#detailCardHTML(); // long-press cards work here too
    if (this.#portraitGen) return this.#portraitGenHTML(); // group portrait (task #12)
    if (this.#partyTab === "inventory") return this.#partyInventoryHTML(group);
    if (this.#partyTab === "journal") return this.#journalHTML();
    if (this.#partyTab === "order") return this.#partyModeHTML(group, actor);
    if (this.#partyTab === "explore") return this.#partyExploreHTML(group);
    return this.#partyViewHTML(group);
  }

  // Exploration tab: travel only — the pad up top (travel pace + group checks
  // join it, task #11). The order grid lives in its own "Party order" tab.
  #partyExploreHTML(group) {
    const formation = group.getFlag(MODULE_ID, "formation") ?? {};
    const pad = this.#partyPadHTML(group);
    // Travel pace — dnd5e's own getTravelPace(). "—" means the DM hasn't set the
    // GROUP's land/water/air speeds on its sheet (they aren't derived from members
    // — the native sheet's "—" was unset data, not a bug; probed 2026-07-03).
    let pace = null; try { pace = group.system.getTravelPace?.(); } catch (e) { /* older data */ }
    const spd = (v) => v ? `${v}` : "—";
    const paceHTML = `<div class="mc-party-pace">
      <span class="mc-pace-label"><i class="fas fa-gauge"></i> ${foundry.utils.escapeHTML(pace?.pace?.label ?? "Travel pace")}</span>
      <span class="mc-pace-spd" title="Land"><i class="fas fa-person-walking"></i> ${spd(pace?.paces?.land)}</span>
      <span class="mc-pace-spd" title="Water"><i class="fas fa-person-swimming"></i> ${spd(pace?.paces?.water)}</span>
      <span class="mc-pace-spd" title="Air"><i class="fas fa-feather-pointed"></i> ${spd(pace?.paces?.air)}</span>
    </div>${!pace?.paces?.land && !pace?.paces?.water && !pace?.paces?.air ? `<div class="mc-pv-note">Speeds unset — the DM fills land/water/air on the Group sheet.</div>` : ""}`;
    // Group checks roll like ANY roll (DM 2026-07-03): tapping rolls YOUR check via
    // the native dialog — no broadcast/prompt relay (removed; each player taps their own).
    // Group checks (#11): everyone rolls their own; the DM averages.
    const checks = `<div class="mc-party-checks">
      <button data-action="party-check" data-skill="prc"><i class="fas fa-eye"></i> Perception</button>
      <button data-action="party-check" data-skill="ste"><i class="fas fa-user-ninja"></i> Stealth</button>
      <button data-action="party-check" data-skill="sur"><i class="fas fa-tree"></i> Survival</button>
    </div>`;
    return `<div class="mc-party">
      <div class="mc-party-head"><span><i class="fas fa-route"></i> Travel</span><span class="mc-party-fwd">Forward ${this.#fwdIcon(formation.forward)}</span></div>
      ${pad || `<div class="mc-party-hint">Lock in the marching order (Party order tab) to travel.</div>`}
      ${paceHTML}
      <div class="mc-party-pad-head"><i class="fas fa-dice-d20"></i> Group checks</div>
      ${checks}
    </div>`;
  }

  // "Party view": the group card's member roster (AC · speed · HP/HD · the three
  // passive-sense skills), minus faction standing / group rests (DM 2026-07-03).
  #partyViewHTML(group) {
    const esc = foundry.utils.escapeHTML;
    const rows = (group.system?.members ?? []).map(m => m.actor).filter(Boolean).map(a => {
      const sys = a.system;
      const hp = sys.attributes?.hp ?? {};
      const pct = hp.max ? Math.max(0, Math.min(100, (hp.value / hp.max) * 100)) : 0;
      const hd = sys.attributes?.hd;
      const skill = (id, icon, label) => {
        const s = sys.skills?.[id];
        return s ? `<span class="mc-pv-skill" title="${label}"><i class="fas ${icon}"></i> ${s.total >= 0 ? "+" : ""}${s.total} <b>(${s.passive})</b></span>` : "";
      };
      return `<div class="mc-pv-row">
        <img class="mc-pv-img" src="${esc(a.img || "icons/svg/mystery-man.svg")}" alt="">
        <div class="mc-pv-main">
          <div class="mc-pv-name">${esc(a.name)} <span class="mc-pv-cls">${this.#classIconsHTML(a)}</span></div>
          <div class="mc-pv-bar"><div class="mc-pv-fill${pct <= 33 ? " mc-low" : ""}" style="width:${pct}%"></div></div>
          <div class="mc-pv-sub">HP ${hp.value ?? "—"}/${hp.max ?? "—"}${hp.temp ? ` +${hp.temp}` : ""} · HD ${hd?.value ?? "—"}/${hd?.max ?? "—"}</div>
        </div>
        <div class="mc-pv-stats">
          <span class="mc-pv-stat" title="Armor Class"><i class="fas fa-shield"></i> ${sys.attributes?.ac?.value ?? "—"}</span>
          <span class="mc-pv-stat" title="Speed"><i class="fas fa-person-running"></i> ${sys.attributes?.movement?.walk ?? "—"}</span>
          <div class="mc-pv-skills">${skill("prc", "fa-eye", "Perception")}${skill("inv", "fa-magnifying-glass", "Investigation")}${skill("ins", "fa-brain", "Insight")}</div>
        </div>
      </div>`;
    }).join("");
    return `<div class="mc-pv">
      <div class="mc-pv-head"><i class="fas fa-people-group"></i> ${esc(group.name)}</div>
      ${rows || `<div class="mc-pv-empty">No members in the group.</div>`}
      <button class="mc-pv-portrait" data-action="group-portrait" data-group-id="${group.id}"><i class="fas fa-wand-magic-sparkles"></i> Group portrait</button>
    </div>`;
  }

  // Shared inventory: the GROUP actor's own items (the party stash). v1 is
  // read-only browse + long-press detail cards; PC↔stash transfers are the v2
  // "item transfers" feature.
  #partyInventoryHTML(group) {
    const esc = foundry.utils.escapeHTML;
    const items = group.items.filter(i => "quantity" in (i.system ?? {}))
      .sort((a, b) => a.name.localeCompare(b.name));
    const rows = items.map(i => `<div class="mc-pv-item" data-uuid="${i.uuid}">
        <img class="mc-pv-item-img" src="${esc(i.img)}" alt="">
        <span class="mc-pv-item-name">${esc(i.name)}</span>
        ${(i.system.quantity ?? 1) > 1 ? `<span class="mc-pv-item-qty">×${i.system.quantity}</span>` : ""}
      </div>`).join("");
    return `<div class="mc-pv">
      <div class="mc-pv-head"><i class="fas fa-box-open"></i> Shared inventory</div>
      ${rows || `<div class="mc-pv-empty">The party stash is empty — the DM can drop items onto the Group sheet.</div>`}
      <div class="mc-pv-note">Hold an item for details. Moving items in/out is DM-side for now.</div>
    </div>`;
  }

  // Party Mode (DESIGN §15). While a group this player belongs to is packed, the
  // content collapses to a shared 3×3 marching-order editor. Tapping a cell moves
  // THIS player's own PC there (anyone can place anywhere — decision #4); "Done"
  // locks their spot; the DM rotates facing and Disperses. Every change routes
  // through the executor (rpc.party*) and Foundry's document sync repaints all
  // phones — no custom relay.
  #partyGroup() {
    // A member RELEASED as a scout (#11) plays normally — their phone leaves party
    // mode. Only an owned, still-packed member keeps this user in the party UI.
    return game.actors.find(a => a.type === "group"
      && a.getFlag(MODULE_ID, "packed")
      && (a.system?.members ?? []).some(m => m.actor?.testUserPermission(game.user, "OWNER")
        && !(a.getFlag(MODULE_ID, "formation")?.released ?? []).includes(m.actor.id))) ?? null;
  }

  #partyModeHTML(group, actor) {
    const formation = group.getFlag(MODULE_ID, "formation") ?? { cells: {}, forward: 0, locked: [] };
    const members = (group.system?.members ?? []).map(m => m.actor).filter(Boolean);
    const locked = new Set(formation.locked ?? []);
    const isGM = game.user.isGM;
    // "Mine" is EVERY group member this player owns (PC + pet + familiar…), not just
    // the active subject — so one player can arrange all their tokens (DM 2026-07-03).
    const mine = members.filter(m => m.testUserPermission(game.user, "OWNER"));
    const myIds = new Set(mine.map(m => m.id));
    const arrows = ["↑", "→", "↓", "←"]; // N E S W
    const forward = formation.forward ?? 0;
    // Two-stage packed mode (DM 2026-07-02): "arrange" = grid editing + Done locks;
    // "travel" (after the DM's Lock in) = read-only grid + the move pad drives.
    const arranging = (formation.stage ?? "arrange") === "arrange";
    if (!arranging && this.#partySelf) this.#partySelf = null; // can't carry into travel
    const picked = this.#partySelf && myIds.has(this.#partySelf) ? this.#partySelf : (this.#partySelf = null);

    // occupants per cell (a cell may hold >1 while players sort themselves out)
    const keyOf = (m) => { const cl = formation.cells?.[m.id]; return cl ? `${cl.r},${cl.c}` : null; };
    const placedKeys = members.map(keyOf).filter(Boolean);
    const cellOcc = (r, c) => members.filter(m => keyOf(m) === `${r},${c}`);
    const allPlaced = members.every(m => formation.cells?.[m.id]);
    const unique = new Set(placedKeys).size === placedKeys.length;
    const canDeploy = allPlaced && unique;

    const released = new Set(formation.released ?? []);
    const cell = (r, c) => {
      const occ = cellOcc(r, c);
      const primary = occ[0];
      const mineHere = occ.some(m => myIds.has(m.id));
      const pickedHere = picked && occ.some(m => m.id === picked);
      const dupe = occ.length > 1;
      const isLocked = primary && locked.has(primary.id);
      const away = primary && released.has(primary.id); // out scouting (#11) — ghosted
      const img = primary ? (primary.prototypeToken?.texture?.src || primary.img || "icons/svg/mystery-man.svg") : "";
      return `<button class="mc-party-cell${primary ? " mc-full" : ""}${mineHere ? " mc-mine" : ""}${pickedHere ? " mc-picked" : ""}${dupe ? " mc-dupe" : ""}${isLocked ? " mc-locked" : ""}${away ? " mc-away" : ""}"${arranging ? ` data-action="party-cell" data-r="${r}" data-c="${c}"` : ""}>
        ${primary ? `<img class="mc-party-tok" src="${img}" alt=""><span class="mc-party-nm">${foundry.utils.escapeHTML(primary.name.split(" ")[0])}</span>` : ""}
        ${away ? `<span class="mc-party-lock"><i class="fas fa-binoculars"></i></span>` : dupe ? `<span class="mc-party-badge">${occ.length}</span>` : isLocked ? `<span class="mc-party-lock"><i class="fas fa-lock"></i></span>` : ""}
      </button>`;
    };
    const grid = [0, 1, 2].map(r => `<div class="mc-party-row">${[0, 1, 2].map(c => cell(r, c)).join("")}</div>`).join("");

    // Done locks EVERY token this player owns; enabled once they're all placed.
    const iLocked = mine.length > 0 && mine.every(m => locked.has(m.id));
    const iPlaced = mine.length > 0 && mine.every(m => !!formation.cells?.[m.id]);
    const doneLabel = iLocked ? "Locked — tap to change" : mine.length > 1 ? "Done — lock my tokens" : "Done";
    const doneBtn = mine.length ? `<button class="mc-party-done ${iLocked ? "mc-on" : ""}" data-action="party-done"${iPlaced ? "" : " disabled"}>
      <i class="fas ${iLocked ? "fa-lock" : "fa-check"}"></i> ${doneLabel}
    </button>` : "";

    // Stage flow (DM 2026-07-03): you can't disperse an order that isn't locked —
    // Disperse only exists in TRAVEL, on its own full-width row (4 buttons in one
    // row overflowed). Arrange's primary action is a gold Lock in.
    // Rotate buttons FLANK the stage button (DM 2026-07-03).
    const dmRow = isGM ? `<div class="mc-party-dm">
      <button class="mc-party-rot" data-action="party-forward" data-dir="-1" aria-label="Rotate left"><i class="fas fa-rotate-left"></i></button>
      <button class="mc-party-stage${arranging ? " mc-primary" : ""}" data-action="party-stage" data-stage="${arranging ? "travel" : "arrange"}"${arranging && !canDeploy ? " disabled" : ""}>
        <i class="fas ${arranging ? "fa-lock" : "fa-pen-to-square"}"></i> ${arranging ? "Lock in" : "Rearrange"}</button>
      <button class="mc-party-rot" data-action="party-forward" data-dir="1" aria-label="Rotate right"><i class="fas fa-rotate-right"></i></button>
    </div>${arranging ? "" : `<button class="mc-party-deploy mc-party-deploy-row" data-action="party-disperse"><i class="fas fa-people-group"></i> Disperse</button>`}` : "";

    const pickedName = picked ? (members.find(m => m.id === picked)?.name.split(" ")[0] ?? "token") : null;
    const hint = !arranging
      ? (isGM ? "Traveling — the pad moves the party. Rearrange to edit the order."
        : "On the move — drive the party with the pad.")
      : picked ? `Moving ${pickedName} — tap a square (tap it again to drop).`
      : mine.length > 1 ? "Tap one of your tokens, then tap where it should go."
      : !allPlaced ? "Waiting for everyone to take a spot…"
      : !unique ? "Two characters share a spot — nudge one over."
      : isGM ? "Everyone's set — Lock in to travel, or Disperse."
      : "You're set — waiting on the DM to lock in.";

    return `<div class="mc-party">
      <div class="mc-party-head"><span><i class="fas fa-people-group"></i> ${arranging ? "Marching order" : "Marching order (locked)"}</span><span class="mc-party-fwd">Forward ${this.#fwdIcon(forward)}</span></div>
      <div class="mc-party-grid">${grid}</div>
      <div class="mc-party-hint${canDeploy ? " mc-ok" : ""}">${hint}</div>
      ${arranging ? doneBtn : ""}${dmRow}
    </div>`;
  }

  // Scout release-follow (DM 2026-07-03): when the DM releases a member THIS
  // player owns, jump their phone to that PC's Explore tab with the released token
  // selected (e.g. send the wizard's cat to scout). On combine, return to party
  // view. Called from the group's updateActor hook before re-render.
  maybeFollowRelease(group) {
    if (group?.type !== "group") return;
    const released = new Set(group.getFlag(MODULE_ID, "formation")?.released ?? []);
    const prev = this.#lastReleased ?? new Set();
    const mine = (id) => game.actors.get(id)?.testUserPermission(game.user, "OWNER");
    for (const id of released) {
      if (prev.has(id) || !mine(id)) continue; // newly released & mine → follow it out
      const tok = game.scenes?.active?.tokens.find(t => t.actorId === id);
      if (tok) { this.#subjectId = tok.id; this.#subjectActorId = null; }
      this.#partyView = false; this.#tab = "sheet";
    }
    for (const id of prev) {
      if (!released.has(id) && mine(id)) this.#partyView = true; // combined back → party view
    }
    this.#lastReleased = released;
  }

  async #partyStage(stage) {
    const group = this.#partyGroup();
    if (!group || !game.user.isGM) return;
    const res = await rpc.partyStage({ groupId: group.id, stage });
    if (res?.ok === false) ui.notifications?.warn(res.reason ?? "Couldn't switch stage.");
  }

  // Party travel (§15 / original MVP goal "move the group token out of combat"):
  // while packed, the party screen carries its own D-pad that steps the GROUP
  // token. Any member-owner may drive (executor enforces); walls refuse with a
  // readout, same as the personal pad.
  #partyPadHTML(group) {
    // Central travel gate: the pad exists only after the DM's Lock in — every
    // caller (party explore tab AND the PC sheet's Explore tab) inherits it.
    if ((group.getFlag(MODULE_ID, "formation")?.stage ?? "arrange") !== "travel") return "";
    const tok = game.scenes?.active?.tokens.find(t => t.actorId === group.id);
    if (!tok) return "";
    const cell = (dx, dy) => {
      const deg = Math.round(Math.atan2(dx, -dy) * 180 / Math.PI);
      const ortho = (dx === 0) !== (dy === 0);
      return `<button class="mc-dpad-btn ${ortho ? "mc-dpad-primary" : ""}" data-action="party-move" data-dx="${dx}" data-dy="${dy}">
        <i class="fas fa-arrow-up" style="transform: rotate(${deg}deg)"></i>
      </button>`;
    };
    const blank = `<span class="mc-dpad-blank"></span>`;
    const nb = this.#partyMoveNote;
    return `
      <div class="mc-party-pad-head"><i class="fas fa-route"></i> Move the party</div>
      <div class="${nb?.cls ?? "mc-move-note"}" data-role="party-move-note">${nb ? foundry.utils.escapeHTML(nb.text) : ""}</div>
      <div class="mc-dpad">
        ${cell(-1, -1)}${cell(0, -1)}${cell(1, -1)}
        ${cell(-1, 0)}${blank}${cell(1, 0)}
        ${cell(-1, 1)}${cell(0, 1)}${cell(1, 1)}
      </div>`;
  }

  async #partyMove(dx, dy) {
    const group = this.#partyGroup();
    const tok = group && game.scenes?.active?.tokens.find(t => t.actorId === group.id);
    if (!tok) return;
    const res = await rpc.moveToken({ tokenId: tok.id, dxGrid: dx, dyGrid: dy });
    this.#partyMoveNote = res?.ok ? null : { text: res?.ok === false ? "Blocked" : (res?.reason ?? "Blocked"), cls: "mc-move-note mc-move-red" };
    // Direct DOM update, no re-render (mirrors #doMove): the group token's move
    // doesn't repaint the shell, and a full render mid-taps would eat the pad.
    const note = this.element?.querySelector('[data-role="party-move-note"]');
    if (note) { note.textContent = this.#partyMoveNote?.text ?? ""; note.className = this.#partyMoveNote?.cls ?? "mc-move-note"; }
  }

  // Marching-order tap handler. The executor brokers every flag write; the
  // updateActor hook repaints all phones. Players who own several members (PC + pet)
  // pick a token up, then drop it — one-tap "move" is kept for the common
  // single-token case. Moving clears the lock: you're rearranging (DM 2026-07-03).
  async #partyPlace(r, c) {
    const group = this.#partyGroup();
    if (!group) return;
    const formation = group.getFlag(MODULE_ID, "formation") ?? { cells: {} };
    const members = (group.system?.members ?? []).map(m => m.actor).filter(Boolean);
    const mine = members.filter(m => m.testUserPermission(game.user, "OWNER"));
    if (!mine.length) return;
    const mineIds = new Set(mine.map(m => m.id));
    const occ = members.filter(m => { const cl = formation.cells?.[m.id]; return cl && cl.r === r && cl.c === c; });
    const mineHere = occ.find(m => mineIds.has(m.id));

    if (!this.#partySelf) {
      if (mineHere) { this.#partySelf = mineHere.id; return this.render(); } // pick up
      if (mine.length === 1) return this.#partyGridMove(group, mine[0].id, r, c);   // one-tap
      ui.notifications?.info("Tap one of your tokens first, then a square.");
      return;
    }
    // carrying a token
    if (mineHere?.id === this.#partySelf) { this.#partySelf = null; return this.render(); } // drop in place
    // swap if another of MY tokens sits on the target
    const other = occ.find(m => mineIds.has(m.id) && m.id !== this.#partySelf);
    const selCell = formation.cells?.[this.#partySelf];
    if (other && selCell) await this.#partyGridMove(group, other.id, selCell.r, selCell.c);
    await this.#partyGridMove(group, this.#partySelf, r, c);
    this.#partySelf = null;
    this.render();
  }

  // NOTE: #partyGridMove (grid-cell write), NOT #partyMove — that name is taken by
  // the travel pad above. A duplicate private name is a SyntaxError that killed the
  // WHOLE module 0.1.68–0.1.69 (no settings, no shell, phones fell back to native
  // Foundry). Syntax-check shell.js before shipping (2026-07-04).
  async #partyGridMove(group, actorId, r, c) {
    const res = await rpc.partySetCell({ groupId: group.id, actorId, r, c, lock: false });
    if (res?.ok === false) ui.notifications?.warn(res.reason ?? "Couldn't move there.");
  }

  async #partyToggleLock() {
    const group = this.#partyGroup();
    if (!group) return;
    const members = (group.system?.members ?? []).map(m => m.actor).filter(Boolean);
    const mine = members.filter(m => m.testUserPermission(game.user, "OWNER"));
    if (!mine.length) return;
    const formation = group.getFlag(MODULE_ID, "formation") ?? {};
    const placed = mine.filter(m => formation.cells?.[m.id]);
    if (placed.length < mine.length) return ui.notifications?.warn("Place all your tokens first.");
    // Toggle as a group: unlock if every one is locked, otherwise lock them all.
    const lockedSet = new Set(formation.locked ?? []);
    const lock = !mine.every(m => lockedSet.has(m.id));
    for (const m of placed) {
      const cell = formation.cells[m.id];
      const res = await rpc.partySetCell({ groupId: group.id, actorId: m.id, r: cell.r, c: cell.c, lock });
      if (res?.ok === false) { ui.notifications?.warn(res.reason ?? "Couldn't lock in."); break; }
    }
  }

  async #partyForward(dir) {
    const group = this.#partyGroup();
    if (!group || !game.user.isGM) return;
    const cur = group.getFlag(MODULE_ID, "formation")?.forward ?? 0;
    await rpc.partySetForward({ groupId: group.id, forward: cur + dir });
  }

  async #partyDisperse() {
    const group = this.#partyGroup();
    if (!group || !game.user.isGM) return;
    const res = await rpc.partyDeploy({ groupId: group.id });
    if (res?.ok === false) ui.notifications?.warn(res.detail ?? res.reason ?? "Couldn't disperse.");
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
    // The interactables list sits right under the movement row — its trigger is
    // the Use hand in the D-pad centre, so the list appears "under the button".
    return this.#tokenSwitcherHTML() + this.#moveRowHTML(actor) + this.#lootHTML()
      + this.#favoritesHTML(actor) + this.#abilitiesHTML(actor) + this.#restsHTML();
  }

  // Use pick list: the executor (which has the canvas) lists loot/shops (Item
  // Piles), doors, and active-tile interactables the player is standing next to,
  // and operates them on the phone's behalf. Triggered by the D-pad Use hand.
  #lootHTML() {
    const loot = this.#nearbyLoot, doors = this.#nearbyDoors, tiles = this.#nearbyTiles;
    const checked = loot != null || doors != null || tiles != null;
    const pileRows = (loot ?? []).map(p => {
      const merchant = p.kind === "merchant";
      const dist = p.distance != null ? `${p.distance} ft` : "";
      let meta;
      if (merchant) { meta = ["Shop", dist].filter(Boolean).join(" · "); }
      else {
        const parts = [];
        if (p.itemCount) parts.push(`${p.itemCount} item${p.itemCount === 1 ? "" : "s"}`);
        if (p.money) parts.push(foundry.utils.escapeHTML(p.money));
        if (dist) parts.push(dist);
        meta = parts.join(" · ") || "empty";
      }
      const fallbackImg = merchant ? "icons/svg/coins.svg" : (p.itemCount ? "icons/svg/chest.svg" : "icons/svg/coins.svg");
      return `<button class="mc-loot-row${merchant ? " mc-loot-shop" : ""}" data-action="loot-open" data-uuid="${p.uuid}">
        <img class="mc-loot-img" src="${p.img || fallbackImg}" alt="">
        <span class="mc-loot-name">${foundry.utils.escapeHTML(p.name)}</span>
        <span class="mc-loot-meta">${meta}</span>
      </button>`;
    }).join("");
    const doorRows = (doors ?? []).map(d => {
      const locked = d.ds === 2, open = d.ds === 1;
      const label = locked ? "Door — locked" : open ? "Close door" : "Open door";
      const icon = locked ? "fa-lock" : open ? "fa-door-open" : "fa-door-closed";
      return `<button class="mc-loot-row${locked ? " mc-loot-locked" : ""}" ${locked ? "disabled" : `data-action="door-toggle" data-id="${d.id}"`}>
        <span class="mc-loot-ico"><i class="fas ${icon}"></i></span>
        <span class="mc-loot-name">${label}</span>
        <span class="mc-loot-meta">${d.distance} ft</span>
      </button>`;
    }).join("");
    const tileRows = (tiles ?? []).map(t => `<button class="mc-loot-row" data-action="tile-trigger" data-id="${t.id}">
      <span class="mc-loot-ico"><i class="fas fa-toggle-on"></i></span>
      <span class="mc-loot-name">${foundry.utils.escapeHTML(t.label)}</span>
      <span class="mc-loot-meta">${t.distance} ft</span>
    </button>`).join("");
    const all = pileRows + doorRows + tileRows;
    // List-only section (Use rework, DM 2026-07-04): shown ONLY when Use found
    // MORE than one interactable — a single hit is operated directly, none shows
    // a note over the pad. The rows keep their existing form.
    if (!checked || !all) return "";
    return `<section class="mc-loot"><div class="mc-loot-list">${all}</div></section>`;
  }

  // Clear the Use list (after an interaction, or when nothing is around).
  #clearNearby() { this.#nearbyLoot = null; this.#nearbyDoors = null; this.#nearbyTiles = null; }

  // A small readout over the pad — same slot as the move budget, so Use feedback
  // ("Nothing nearby to use.", "The door is locked.") appears where the eye already is.
  #useNote(text) {
    this.#moveBudget = text ? { text, cls: "mc-move-note" } : null;
    const note = this.element?.querySelector('[data-role="move-note"]');
    if (note) { note.textContent = text ?? ""; note.className = "mc-move-note"; }
  }

  // "Use" (DM 2026-07-04, replaces "Check what's nearby"): the hand in the D-pad
  // centre. Scan the adjacent squares via the executor; ONE hit → operate it
  // immediately (doors open, piles/shops open, tiles trigger), SEVERAL → list them
  // under the pad in the usual rows, NONE → just a note. One tap to use the world.
  async #useNearby() {
    if (this.#lootBusy) return;
    this.#lootBusy = true; this.render();
    const actorUuid = this.actor?.uuid;
    let piles = [], doors = [], tiles = [], reached = false;
    try {
      const [loot, inter] = await Promise.all([
        rpc.listLoot({ forActorUuid: actorUuid }).catch(() => ({ ok: false })),
        rpc.listInteractables({ forActorUuid: actorUuid }).catch(() => ({ ok: false }))
      ]);
      reached = !!(loot?.ok || inter?.ok);
      piles = loot?.ok ? (loot.piles ?? []) : [];
      doors = inter?.ok ? (inter.doors ?? []) : [];
      tiles = inter?.ok ? (inter.tiles ?? []) : [];
    } finally {
      this.#lootBusy = false;
    }
    if (!reached) { this.render(); return ui.notifications.warn("Use: couldn't reach the DM — is its screen reloaded since the update?"); }
    const total = piles.length + doors.length + tiles.length;
    if (total === 0) { this.#clearNearby(); this.render(); return this.#useNote("Nothing to use."); }
    if (total === 1) { // operate the single hit directly — no list step
      this.#clearNearby(); this.render(); this.#useNote("");
      if (piles.length) return this.#openLoot(piles[0].uuid);
      if (doors.length) {
        if (doors[0].ds === 2) return this.#useNote("The door is locked.");
        return this.#operateInteractable("door", doors[0].id);
      }
      return this.#operateInteractable("tile", tiles[0].id);
    }
    // several → show the pick list under the pad
    this.#nearbyLoot = piles; this.#nearbyDoors = doors; this.#nearbyTiles = tiles;
    this.render();
  }

  async #openLoot(pileUuid) {
    const res = await rpc.openLoot({ pileUuid, forActorUuid: this.actor?.uuid });
    if (!res?.ok) ui.notifications.warn(`Loot: ${res?.reason ?? "couldn't open that loot"}`);
    // success → Item Piles renders its window on this client; the dialog-lift surfaces it.
  }

  async #operateInteractable(kind, id) {
    let res;
    try { res = await rpc.operateInteractable({ kind, id, forActorUuid: this.actor?.uuid }); }
    catch (e) { return ui.notifications.warn("Couldn't reach the DM client."); }
    if (!res?.ok) return ui.notifications.warn(res?.reason ?? "couldn't operate that");
    // Use rework: the pick list collapses after acting — tap Use again for a fresh
    // scan (replaces the old auto re-scan, which kept a stale-feeling list open).
    this.#clearNearby(); this.render();
  }

  // Shared party journal (MVP goal, replacing the Phase-4 placeholder): read the
  // module-owned "Party Journal" entry's notes (newest first) + a composer. Players
  // OBSERVE the entry (read direct) but can't author on it, so posting routes through
  // the executor, which creates the page — and the entry itself on first use.
  #partyJournalEntry() {
    return game.journal?.find(j => j.getFlag(MODULE_ID, "partyJournal")) ?? null;
  }
  #journalHTML() {
    const entry = this.#partyJournalEntry();
    const pages = entry ? entry.pages.contents.slice() : [];
    pages.sort((a, b) => (b.getFlag(MODULE_ID, "ts") ?? 0) - (a.getFlag(MODULE_ID, "ts") ?? 0));
    // Format the date HERE (at render) from the stored timestamp, not from the page name —
    // the name froze the CREATING device's locale (DM 2026-06-26: a UK phone showed
    // "26/06/2026, 00:21:43", a US one "6/23/2026, 10:54:12 AM" in the same list). Rendering
    // from the ts flag with a month-name format makes every note uniform on the viewer's
    // screen and removes the day/month ambiguity. Old notes lacking the flag keep the name.
    const fmtDate = (ts) => { try { return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return new Date(ts).toLocaleString(); } };
    // Tint each note in its poster's player colour (DM 2026-06-27). `author` is the character
    // name, so map it to the owning player's colour; fall back to a user of that name. The
    // lookup is live, so old notes colour too and a note tracks the player's current colour.
    // --mc-note drives the header text + a left accent (see CSS); no colour → the gold default.
    const colorFor = (author) => {
      if (!author) return null;
      const actor = game.actors?.getName?.(author);
      let user = actor ? game.users?.find?.(u => !u.isGM && actor.testUserPermission(u, "OWNER")) : null;
      if (!user) user = game.users?.getName?.(author);
      return user?.color?.css ?? null;
    };
    const notes = pages.map(p => {
      const ts = p.getFlag(MODULE_ID, "ts");
      const author = p.getFlag(MODULE_ID, "author");
      const color = colorFor(author);
      const head = (ts && author) ? `${foundry.utils.escapeHTML(author)} · ${fmtDate(ts)}` : foundry.utils.escapeHTML(p.name);
      return `
      <div class="mc-jn-note"${color ? ` style="--mc-note:${color}"` : ""}>
        <div class="mc-jn-head">${head}</div>
        <div class="mc-jn-body">${p.text?.content ?? ""}</div>
      </div>`;
    }).join("");
    const list = pages.length ? notes : `<div class="mc-jn-empty">No notes yet — start the party log.</div>`;
    return `
      <section class="mc-journal">
        <div class="mc-jn-filterrow"><i class="fas fa-magnifying-glass"></i><input class="mc-jn-filter" type="search" placeholder="Filter notes… (e.g. shopke)" value="${foundry.utils.escapeHTML(this.#journalFilter)}"></div>
        <div class="mc-jn-list">${list}</div>
        <div class="mc-jn-compose">
          <textarea class="mc-jn-input" rows="2" placeholder="Add a note to the party journal…" ${this.#journalBusy ? "disabled" : ""}>${foundry.utils.escapeHTML(this.#journalDraft)}</textarea>
          <button class="mc-jn-post" data-action="journal-post" ${this.#journalBusy ? "disabled" : ""}>${this.#journalBusy ? "Posting…" : "Post note"}</button>
        </div>
      </section>`;
  }
  async #postJournalNote() {
    const live = this.element?.querySelector(".mc-jn-input")?.value;
    const text = String(live ?? this.#journalDraft).trim();
    if (!text || this.#journalBusy) return;
    this.#journalBusy = true; this.render();
    try {
      const entry = this.#partyJournalEntry();
      // If we OWN the shared entry, append the page DIRECTLY — no GM round-trip, and it
      // works even if the executor is momentarily offline. The executor is only needed
      // the first time, to CREATE the entry (players can't create top-level journals).
      const res = entry?.testUserPermission(game.user, "OWNER")
        ? await this.#addJournalPageDirect(entry, text)
        : await rpc.partyJournalAdd({ text, authorName: this.actor?.name ?? game.user?.name });
      if (res?.ok) this.#journalDraft = "";
      else ui.notifications.warn(`Journal: ${res?.reason ?? "couldn't post that note"}`);
    } catch (e) {
      console.error("mobile-command | journal post failed", e);
      ui.notifications.warn("Journal: couldn't post that note.");
    } finally {
      this.#journalBusy = false; this.render();
    }
  }

  async #addJournalPageDirect(entry, text) {
    const ts = Date.now();
    const author = String(this.actor?.name ?? game.user?.name ?? "Someone").slice(0, 60);
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: `${author} · ${new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`,
      type: "text",
      title: { show: true, level: 3 },
      text: { content: `<p>${foundry.utils.escapeHTML(text)}</p>`, format: 1 },
      flags: { [MODULE_ID]: { ts, author } }
    }]);
    return { ok: true };
  }

  // --- Wild Shape (Druid) ----------------------------------------------------
  // Players can't transform locally (allowPolymorphing off + actor-create is GM-only),
  // so the executor runs dnd5e's real transform/revert. Here we surface the entry, the
  // beast browser, and a revert banner. The shape feature is matched by name.
  #wildShapeFeat(actor) {
    return actor?.items?.find(i => i.type === "feat" && /wild\s*shape/i.test(i.name)) ?? null;
  }
  // Only the revert banner now — the Wild Shape ENTRY rides the normal Actions list as
  // a regular row (its "transform" activity, grouped by activation = Bonus action, with
  // long-press detail), routed to the beast browser in #pickAction (DM 2026-06-23).
  #wildShapeBarHTML(actor) {
    if (actor?.isPolymorphed) {
      return `<button class="mc-ws-bar mc-ws-revert" data-action="wildshape-revert"><i class="fas fa-rotate-left"></i> Revert to your true form</button>`;
    }
    return "";
  }
  #wildShapeCR(cr) {
    return cr === 0.125 ? "1/8" : cr === 0.25 ? "1/4" : cr === 0.5 ? "1/2" : String(cr);
  }
  #wildShapeBrowserHTML() {
    const ws = this.#wildShape;
    const beasts = ws?.beasts ?? [];
    const rows = beasts.map(b => `
      <button class="mc-action" data-action="wildshape-pick" data-uuid="${b.uuid}" data-search-name="${foundry.utils.escapeHTML(b.name.toLowerCase())}">
        <img class="mc-action-icon" src="${b.img || "icons/svg/mystery-man.svg"}" alt="">
        <span class="mc-action-text">
          <span class="mc-action-name">${foundry.utils.escapeHTML(b.name)}</span>
          <span class="mc-action-sub">Beast · CR ${this.#wildShapeCR(b.cr)}</span>
        </span>
      </button>`).join("");
    const body = ws?.loading ? `<div class="mc-ws-loading">Loading shapes…</div>`
      : beasts.length ? `<div class="mc-search-group mc-actions">${rows}</div>`
      : `<div class="mc-placeholder">No beast shapes here — make sure the DM's screen has reloaded since the update.</div>`;
    return `<div class="mc-ws-head">
        <button class="mc-ws-back" data-action="wildshape-close" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
        <span class="mc-section-label">Choose a shape</span>
        ${this.#searchToggleHTML()}
      </div>
      ${this.#searchDrawerHTML()}${body}`;
  }
  async #openWildShape() {
    const actor = this.actor;
    const lvl = Object.values(actor?.classes ?? {}).find(c => /druid/i.test(c.name))?.system?.levels
      ?? actor?.system?.details?.level ?? 1;
    const maxCR = Math.max(1, Math.floor(lvl / 3)); // generous Moon-Druid cap; the DM approves anything beyond
    this.#wildShape = { open: true, beasts: null, loading: true };
    this.#searchOpen = false; this.#searchQuery = "";
    this.render();
    try {
      const res = await rpc.wildShapeList({ maxCR });
      if (!this.#wildShape?.open) return;
      this.#wildShape.beasts = res?.ok ? (res.beasts ?? []) : [];
      this.#wildShape.loading = false;
      if (!res?.ok) ui.notifications.warn(`Wild Shape: ${res?.reason ?? "couldn't load shapes"}`);
    } catch (e) {
      if (this.#wildShape) { this.#wildShape.beasts = []; this.#wildShape.loading = false; }
      ui.notifications.warn("Wild Shape: the DM's screen needs to reload since the last update to enable this.");
    }
    this.render();
  }
  #closeWildShape() { this.#wildShape = null; this.#searchOpen = false; this.#searchQuery = ""; this.render(); }
  async #doWildShape(beastUuid) {
    const actor = this.actor;
    const feat = this.#wildShapeFeat(actor);
    const u = feat?.system?.uses;
    if (u && (u.max ?? 0) > 0 && ((u.max ?? 0) - (u.spent ?? 0)) <= 0) {
      return ui.notifications.warn(`${actor?.name ?? "You"} has no Wild Shape uses left — rest to recover.`);
    }
    let res;
    try { res = await rpc.wildShapeInto({ beastUuid, forActorUuid: actor?.uuid, featUuid: feat?.uuid }); }
    catch (e) { return ui.notifications.warn("Wild Shape: the DM's screen needs to reload since the last update."); }
    if (res?.ok) { this.#closeWildShape(); ui.notifications.info(`Wild-shaped into ${res.name}.`); }
    else ui.notifications.warn(`Wild Shape: ${res?.reason ?? "couldn't change shape"}`);
  }
  async #revertWildShape() {
    let res;
    try { res = await rpc.wildShapeRevert({ forActorUuid: this.actor?.uuid, forTokenId: this.originTokenId }); }
    catch (e) { return ui.notifications.warn("Wild Shape: the DM's screen needs to reload to revert."); }
    if (!res?.ok) ui.notifications.warn(`Wild Shape: ${res?.reason ?? "couldn't revert"}`);
  }

  // Active-scene tokens the user owns (PC + summons/familiars/wild shape).
  #ownedTokens() {
    // Never treat a party/group token as a controllable subject — while packed
    // (Party Mode, §15) the group token is the only owned token on-scene, and the
    // shell must stay bound to a real character, not the group.
    return (game.scenes?.active?.tokens ?? []).filter(t => t.actor?.isOwner && t.actor.type !== "group");
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
      // Only INCOMPLETE (char-gen) PCs belong off-map — so a player can build a blank
      // PC before the DM drops a token. Do NOT list every owned-but-off-map PC: the
      // earlier broad `!isGM` form cluttered players who own several PCs with characters
      // that aren't in play (DM-reported 2026-06-23). The lone exception is the pinned
      // subject — a JUST-FINISHED tokenless PC stays reachable until its token drops.
      if (this.#isCharGenPC(a) || a.id === this.#subjectActorId) {
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
    // Follow (DM 2026-07-08): with 2+ owned tokens, a paw toggle beside the
    // switcher — while on, the player's OTHER owned tokens repeat every pad move
    // (familiar trails the PC). v1 all-or-none; the executor reads the user flag.
    const following = !!game.user.getFlag("mobile-command", "followAll");
    // "Active character" star (DM 2026-07-09: playing a temp PC while the main is
    // away). You can CONTROL any owned token via the switcher regardless — the star
    // only sets which PC is your ASSIGNED character (Foundry's one-per-user slot):
    // the default binding + where midi sends your save/reaction popups. Filled =
    // this is your active one; outline = tap to make it active. Players may set
    // their own (Foundry allows it); GM uses User Configuration instead.
    const cur = subs[i]?.actorId ? game.actors.get(subs[i].actorId) : null;
    const canStar = !game.user.isGM && !!subs[i]?.tokenId && cur?.type === "character";
    const isMain = cur && game.user.character?.id === cur.id;
    const star = canStar ? `<button class="mc-tokensw-btn mc-tokensw-star ${isMain ? "mc-on" : ""}" data-action="set-active-pc" data-actor-id="${cur.id}"
        title="${isMain ? "Your active character — save & reaction popups come here" : "Play as this one — make it your active character (popups route here)"}"
        aria-label="Set active character"><i class="fas fa-star"></i></button>` : "";
    return `<div class="mc-tokensw">
      <button class="mc-tokensw-btn mc-follow ${following ? "mc-follow-on" : ""}" data-action="follow-toggle"
        title="${following ? "Following: your other tokens copy this one's moves" : "Follow: have your other tokens copy this one's moves"}"
        aria-label="Toggle follow"><i class="fas fa-paw"></i></button>
      <button class="mc-tokensw-btn" data-action="token-prev" aria-label="Previous token"><i class="fas fa-chevron-left"></i></button>
      <span class="mc-tokensw-name">${foundry.utils.escapeHTML(label)} <span class="mc-tokensw-count">${i + 1}/${subs.length}</span></span>
      <button class="mc-tokensw-btn" data-action="token-next" aria-label="Next token"><i class="fas fa-chevron-right"></i></button>
      ${star}
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
    return `<div class="mc-section-label">Rest</div>
    <div class="mc-rests">
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
      return `<div class="mc-spell-section mc-search-group"><div class="mc-actions-sub mc-spell-sub">${label}${countBadge}${headPips}</div><div class="mc-spells">${rows}</div></div>`;
    }).join("");

    // Post-creation learning (DM 2026-07-09): dnd5e's level-up grants no spell
    // picks for list casters, so the spellbook offers the class-list picker any
    // time — counters show known vs the class cap; warnings, not walls.
    const learnBtn = this.#charGenSpellInfo(actor)
      ? `<button class="mc-learn-spells" data-action="learn-spells"><i class="fas fa-book-medical"></i> Learn spells (class list)</button>`
      : "";
    return `<div class="mc-actions-head"><span class="mc-section-label">Spells</span>${this.#searchToggleHTML()}</div>
      ${this.#searchDrawerHTML()}${cards}${slotsRow}${sections}${learnBtn}`;
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
    return `<div class="mc-spell ${canPrepare && !isPrepared ? "mc-unprepared" : ""}" data-search-name="${foundry.utils.escapeHTML(sp.name.toLowerCase())}">
      ${open}
        <img class="mc-spell-icon" src="${img}" alt="">
        <span class="mc-spell-name">${foundry.utils.escapeHTML(sp.name)}</span>
      ${close}
      ${prepBtn}
    </div>`;
  }

  // Generic live search shared by Spells / Equipment / Actions. Filters by name via
  // DOM toggling (no re-render → the box keeps focus mid-type): any [data-search-name]
  // row that doesn't match is hidden, and any .mc-search-group with no visible row is
  // hidden too. Re-applied from _replaceHTML so it survives actor-driven re-renders.
  #applySearch(q) {
    const root = this.element;
    if (!root) return;
    const query = String(q ?? "").trim().toLowerCase();
    for (const row of root.querySelectorAll("[data-search-name]")) {
      row.classList.toggle("mc-hidden", !!query && !(row.dataset.searchName ?? "").includes(query));
    }
    for (const group of root.querySelectorAll(".mc-search-group")) {
      const anyVisible = [...group.querySelectorAll("[data-search-name]")].some(r => !r.classList.contains("mc-hidden"));
      group.classList.toggle("mc-hidden", !!query && !anyVisible);
    }
  }

  // Magnifying-glass toggle (sits in a tab header) + the drawer it opens. Used by every
  // searchable tab so the search is tucked away until wanted (DM 2026-06-23).
  #searchToggleHTML() {
    return `<button class="mc-search-toggle ${this.#searchOpen ? "mc-on" : ""}" data-action="search-toggle" aria-label="Search" title="Search"><i class="fas fa-magnifying-glass"></i></button>`;
  }
  #searchDrawerHTML() {
    if (!this.#searchOpen) return "";
    return `<div class="mc-search-drawer"><input class="mc-search-input" type="search" placeholder="Search…" value="${foundry.utils.escapeHTML(this.#searchQuery)}" aria-label="Search"></div>`;
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
      return `<div class="mc-search-group"><div class="mc-actions-sub">${g.label}</div><div class="mc-inv">${this.#inventoryItemsHTML(items)}</div></div>`;
    }).join("");
    return `<div class="mc-actions-head mc-eq-head"><span class="mc-section-label">Equipment</span>${this.#carriedWeightHTML(actor)}${this.#searchToggleHTML()}</div>
      ${this.#searchDrawerHTML()}${currency}${enc}${sections}`;
  }

  // Carried weight (current / capacity) for the Equipment header — always shown, since dnd5e
  // computes value/max even when the encumbrance variant is "none" (the full bar below only
  // appears when the variant is on). So "those who care" get the number regardless, filling the
  // header row next to the search icon. DM 2026-06-27.
  #carriedWeightHTML(actor) {
    const enc = actor.system?.attributes?.encumbrance;
    if (enc?.value == null || !enc?.max) return "";
    let unit = "lb"; try { unit = game.settings.get("dnd5e", "metricWeightUnits") ? "kg" : "lb"; } catch (e) { /* default lb */ }
    const r = (n) => Math.round((n ?? 0) * 10) / 10;
    return `<span class="mc-eq-weight" title="Carried weight"><i class="fas fa-weight-hanging"></i> ${r(enc.value)}/${r(enc.max)} ${unit}</span>`;
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

  // Shared coin icon: dnd5e ships these (systems/dnd5e/icons/currency/*.webp) and Item
  // Piles just reuses them, so they're available with or without IP. Prefer the system's
  // configured icon; fall back to the file path (DM 2026-07-10).
  #coinIconSrc(k) {
    const files = { pp: "platinum", gp: "gold", ep: "electrum", sp: "silver", cp: "copper" };
    return CONFIG.DND5E?.currencies?.[k]?.icon || `systems/dnd5e/icons/currency/${files[k] ?? "gold"}.webp`;
  }

  // ONE money element — looks the same editable or not (DM 2026-07-10 goal). All
  // denominations, the dnd5e coin icons, comma-formatted amounts. Each coin HUGS its
  // own number (no equal-width split) so populated coins get the room, and a coin whose
  // amount is 0 collapses to just its icon (DM 2026-07-10). Editable = tap-to-edit input
  // (inventory: tap an empty coin's icon → the input opens; commit on blur → currency.<k>);
  // read-only = static spans (store: an empty coin is inert, a tap does nothing).
  #currencyRowHTML(actor, { editable = false } = {}) {
    const cur = actor?.system?.currency ?? {};
    const order = Object.keys(CONFIG.DND5E?.currencies ?? { pp: 1, gp: 1, ep: 1, sp: 1, cp: 1 });
    const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("en-US");
    const coins = order.map(k => {
      const n = Math.max(0, Math.floor(Number(cur[k]) || 0));
      const empty = n === 0;
      const text = fmt(n);
      const cls = `mc-coin mc-coin-${k}${empty ? " mc-coin-empty" : ""}`;
      const icon = `<img class="mc-coin-icon" src="${this.#coinIconSrc(k)}" alt="${k}" title="${k.toUpperCase()}">`;
      if (editable) {
        // Populated coins get an inline width that hugs their digits; empty coins carry no
        // width (CSS collapses the input to 0) until the label is tapped and focus opens it.
        const w = empty ? "" : ` style="width:${(text.length + 0.5).toFixed(1)}ch"`;
        const val = empty ? "" : text;
        return `<label class="${cls}">${icon}<input class="mc-coin-input" type="text" inputmode="numeric" data-coin="${k}" value="${val}" placeholder="0" aria-label="${k}"${w}></label>`;
      }
      // Read-only: no tabindex (a store tap does nothing); empty = icon only.
      const amt = empty ? "" : `<span class="mc-coin-amount">${text}</span>`;
      return `<span class="${cls}">${icon}${amt}</span>`;
    }).join("");
    return `<div class="mc-currency">${coins}</div>`;
  }

  // Size a coin input to hug its digits (empty + unfocused → 0 width, i.e. icon only).
  #sizeCoinInput(inp) {
    if (!inp?.classList?.contains?.("mc-coin-input")) return;
    const raw = String(inp.value).replace(/[^0-9]/g, "");
    const focused = document.activeElement === inp;
    if (!raw && !focused) { inp.style.width = "0px"; return; }
    const shown = raw ? Number(raw).toLocaleString("en-US") : "0";
    inp.style.width = (shown.length + 0.5).toFixed(1) + "ch";
  }

  #currencyHTML(actor) { return actor?.system?.currency ? this.#currencyRowHTML(actor, { editable: true }) : ""; }

  // The store's currency counter (buyer wallet) — the SAME row, read-only, in a footer bar.
  #merchantWalletHTML(actor) { return `<div class="mc-mwallet">${this.#currencyRowHTML(actor, { editable: false })}</div>`; }

  // Inject/refresh our wallet into a merchant sheet element. Idempotent (removes any prior),
  // so it can run on each merchant render and on the buyer's currency change.
  injectMerchantWallet(el) {
    try {
      const actor = this.actor;
      if (!el || !actor) return;
      // IP's own held-only wallet lives in `.merchant-bottom-row` (alongside the
      // redundant "Shopping as X" line) — that whole row is hidden in CSS. Here we
      // just append our all-denomination counter built from the PC's system.currency.
      el.querySelector(".mc-mwallet")?.remove();
      el.insertAdjacentHTML("beforeend", this.#merchantWalletHTML(actor));
    } catch (e) { /* best effort */ }
  }

  #inventoryRowHTML(item) {
    const sys = item.system ?? {};
    const searchAttr = `data-search-name="${foundry.utils.escapeHTML(item.name.toLowerCase())}"`;
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
      return `<div class="mc-inv-row mc-inv-container ${equipped ? "mc-equipped" : ""}" ${searchAttr}>
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
    return `<div class="mc-inv-row ${equipped ? "mc-equipped" : ""}" ${searchAttr}>
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
      <div class="mc-detail-sec">
        <div class="mc-section-label">Theme</div>
        <div class="mc-theme-row">${this.#themeOptionsHTML()}</div>
      </div>
      ${this.#fullscreenBtnHTML()}
      <button class="mc-ob-reopen" data-action="onboard-open"><i class="fas fa-circle-question"></i> Show the welcome tips</button>
      <button class="mc-leave" data-action="exit"><i class="fas fa-right-from-bracket"></i> Leave Mobile Command</button>
      <button class="mc-logout" data-action="logout"><i class="fas fa-power-off"></i> Log out</button>`;
  }

  // Full screen (playtest 2026-07-05: testers played with the browser chrome eating
  // a third of the screen and no idea how to hide it). Android/desktop Chrome has
  // the real Fullscreen API. iPhone Safari has NONE — there the honest path is
  // "Add to Home Screen" (standalone launch = chromeless), so the button becomes a
  // how-to hint. Already-standalone → the button congratulates and does nothing.
  #fullscreenBtnHTML() {
    if (navigator.standalone === true) {
      return `<button class="mc-fullscreen" disabled><i class="fas fa-expand"></i> Full screen (installed app) ✓</button>`;
    }
    const fsOn = !!document.fullscreenElement;
    const label = document.fullscreenEnabled
      ? (fsOn ? "Exit full screen" : "Go full screen")
      : "Full screen — how to";
    return `<button class="mc-fullscreen" data-action="fullscreen"><i class="fas ${fsOn ? "fa-compress" : "fa-expand"}"></i> ${label}</button>`;
  }

  async #toggleFullscreen() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); }
      else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else {
        // iPhone Safari: no Fullscreen API at all — Add to Home Screen IS fullscreen.
        return ui.notifications.info("iPhone: tap Share → “Add to Home Screen”, then open Mobile Command from that icon — it launches full screen.", { permanent: true });
      }
    } catch (e) {
      ui.notifications.warn("Couldn't switch full screen — your browser may block it.");
    }
    this.render();
  }
  // Colour pick (task #18) — a full-screen overlay the DM triggers (Players tab →
  // palette) so a player picks their own colour; there's no standing colour UI, so
  // players can only change it when the DM initiates. Colour drives rings/banners/
  // target pips/journal tint.
  #colorPickHTML() {
    const cur = (game.user.color?.css ?? game.user.color ?? "").toLowerCase();
    const sw = MC_COLOR_PALETTE.map(c => `<button class="mc-color-sw ${cur === c.toLowerCase() ? "mc-on" : ""}" data-action="my-color" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join("");
    return `<div class="mc-colorpick">
      <div class="mc-colorpick-card">
        <div class="mc-colorpick-title">Pick your colour</div>
        <div class="mc-color-grid">${sw}</div>
        <button class="mc-colorpick-done" data-action="color-pick-done">Done</button>
      </div>
    </div>`;
  }

  // Theme picker (Details). Choice is per-device (localStorage), applied as a body
  // class that re-tints the shell's CSS vars; "tavern" is the default (no class).
  #currentTheme() {
    try { return window.localStorage.getItem("mc-theme") || "tavern"; } catch (e) { return "tavern"; }
  }
  #applyTheme() {
    const t = this.#currentTheme();
    for (const c of [...document.body.classList]) if (c.startsWith("mc-theme-")) document.body.classList.remove(c);
    if (t && t !== "tavern") document.body.classList.add(`mc-theme-${t}`);
  }
  // Tint the dynamic ring of EVERY token this player owns on the active scene with
  // their own Foundry color, so they can spot all of theirs (PC + wild-shape + summons)
  // on a busy shared map — not just whichever one happens to be selected. The player
  // owns these tokens, so the phone sets them directly; idempotent — only writes when a
  // token's ring color isn't already theirs, so it's a no-op after the first pass.
  #applyMyTokenRing() {
    if (game.user.isGM) return; // player-color rings are a player thing
    // A phone runs in No-Canvas mode (D2), so canvas.ready is false. Writing token
    // ring visuals from here is (a) pointless — this client draws no canvas — and
    // (b) harmful: every render's tok.update() fires updateToken/refresh hooks that
    // canvas-assuming modules (action-pack-enhanced, item-piles) handle by reading
    // canvas.tokens.controlled, which is undefined without a canvas → a thrown-error
    // storm that HANGS the tab (worst for a player who owns several PCs — each token
    // multiplies the writes). Ring colour is applied on the DM/executor + TV clients
    // (applyPcVisuals / the display overlay), where the canvas actually exists.
    // 2026-07-04: this was crashing Player-1's phone (owns all 4 PCs).
    if (!canvas?.ready) return;
    const want = game.user.color?.css;
    if (!want) return;
    // Only the player's own CHARACTER tokens get the colour — their PC, and a
    // wild-shape form (which keeps the character actor). NOT summons, NPCs, or Item
    // Pile stores/loot the player happens to own; strip my colour back off those.
    // A coloured BAND only (no background fill / no subject shrink) so the art fills
    // the ring cleanly — a prominent ring wants ring-friendly art (a generated portrait).
    for (const tok of (game.scenes?.active?.tokens ?? [])) {
      if (!tok.isOwner) continue;
      const c = tok.ring?.colors || {};
      const haveRing = c.ring?.css ?? c.ring ?? null;
      const haveBg = c.background?.css ?? c.background ?? null;
      const haveScale = tok.ring?.subject?.scale;
      let isPile = false; try { isPile = !!game.itempiles?.API?.isValidItemPile?.(tok); } catch (e) { /* not installed */ }
      const isMine = tok.actor?.type === "character" && !isPile;
      if (isMine) {
        if (haveRing === want && haveBg == null && haveScale === 1) continue; // already mine — no write
        tok.update({ "ring.enabled": true, "ring.colors.ring": want, "ring.colors.background": null, "ring.subject.scale": 1 }).catch(() => {});
      } else if (haveRing === want) { // a summon/store/NPC I coloured earlier — revert just MY colour, leave the DM's
        tok.update({ "ring.colors.ring": null, "ring.colors.background": null, "ring.subject.scale": 1 }).catch(() => {});
      }
    }
  }
  #themeOptionsHTML() {
    const cur = this.#currentTheme();
    const themes = [["tavern", "Tavern", "#c8a44d"], ["slate", "Slate", "#79b8e0"], ["ember", "Ember", "#e2924a"], ["arcane", "Arcane", "#b483e0"]];
    return themes.map(([id, label, sw]) =>
      `<button class="mc-theme-opt ${cur === id ? "mc-on" : ""}" data-action="set-theme" data-theme="${id}"><span class="mc-theme-sw" style="background:${sw}"></span>${label}</button>`).join("");
  }

  // Move pad (§7.4): D-pad steps the player's own token via the move.request
  // RPC (executor wall-validates and applies). Out-of-combat group-token
  // binding is a later refinement; this moves the controlled actor's token.
  #moveHTML() {
    // Packed + traveling: the own token is off-canvas, so the PC sheet's Explore
    // pad drives the PARTY token instead ("move in both", DM 2026-07-03).
    if (!this.originTokenId) {
      const party = this.#partyGroup();
      return party ? this.#partyPadHTML(party) : "";
    }
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
    // D-pad centre = the USE hand (DM 2026-07-04): stand next to a door/pile/
    // lever and tap — one hit operates directly, several list under the pad.
    // Replaces the old "Check what's nearby" button further down the tab.
    // Icon: fa-hand-fist — the SAME glyph as the Actions tab (DM 2026-07-04: "give
    // Use the Actions icon, it makes sense they'd share one, sort of"). Use is the
    // out-of-combat sibling of Actions, so a shared hand reads right; the Check-colour
    // fill (CSS) keeps it distinct from the arrow keys and from the Actions tab.
    const use = `<button class="mc-dpad-btn mc-dpad-use" data-action="use-nearby" ${this.#lootBusy ? "disabled" : ""} aria-label="Use" title="Use">
      <i class="fas ${this.#lootBusy ? "fa-hourglass-half" : "fa-hand-fist"}"></i>
    </button>`;
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
        ${cell(-1, 0)}${use}${cell(1, 0)}
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
        <button class="mc-cond-close" data-action="level-up-back" aria-label="Back"><i class="fas fa-xmark"></i></button>
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

  // Local action feedback (player-pilot idea, DM-approved 2026-07-02): the acting
  // player's own taps sound + buzz on THEIR phone only (2nd arg false = local, not
  // broadcast). v1 uses core sounds (CONFIG.sounds — nothing to bundle); swapping in
  // real weapon/damage SFX packs is a later asset decision. iOS: audio is unlocked
  // by the very tap that triggers this (§6); vibrate is Android-only (no-op on iOS).
  #sfx(kind) {
    if (!isPhoneClient()) return;
    try {
      const src = { roll: CONFIG.sounds?.dice, prompt: CONFIG.sounds?.notification }[kind];
      if (src) foundry.audio.AudioHelper.play({ src, volume: 0.8, autoplay: true, loop: false }, false);
    } catch (e) { /* audio context may still be locked */ }
    try { navigator.vibrate?.(kind === "prompt" ? [120, 60, 120] : 30); } catch (e) { /* unsupported */ }
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
        if (!["attack", "save", "damage", "utility", "heal", "transform"].includes(a.type)) continue;
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
    // Favorite-mode removed (DM 2026-07-03) — long-press → detail card ★ curates
    // favorites better than a modal bookmark mode ever did.
    const editing = false;
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
    // Within each economy group, list the character's OWN actions (features, class
    // abilities, spells) first, then the item-derived ones — those duplicate the
    // Equipment tab, so they go under a "From items" divider (DM 2026-06-23). A
    // physical item has `quantity`; features/spells don't.
    const isItemAction = (a) => "quantity" in (a.item?.system ?? {});
    const rowsFor = (key) => {
      const list = bucket[key];
      const own = list.filter(a => !isItemAction(a));
      const gear = list.filter(a => isItemAction(a));
      const render = (arr) => arr.map(a => this.#actionRowHTML(a, actor, editing)).join("");
      if (!own.length || !gear.length) return render(list); // only one kind → no divider
      return render(own) + `<div class="mc-action-itemhead">From items</div>` + render(gear);
    };
    // Accordion: each group header is a drawer the user can open/close; using an
    // action auto-collapses its drawer (still reopenable). One group → no header.
    const searching = this.#searchOpen && !!this.#searchQuery.trim(); // a search opens every group
    const body = shown.length <= 1
      ? `<div class="mc-search-group"><div class="mc-actions">${rowsFor(shown[0].key)}</div></div>`
      : shown.map(g => {
          const collapsed = this.#collapsedActionGroups.has(g.key) && !searching;
          const header = `<button class="mc-actions-sub mc-econ-${g.key} mc-accordion ${collapsed ? "mc-collapsed" : ""}" data-action="agroup" data-group="${g.key}">
            <span>${g.label}</span><i class="fas fa-chevron-${collapsed ? "right" : "down"}"></i></button>`;
          return `<div class="mc-search-group">${header}${collapsed ? "" : `<div class="mc-actions">${rowsFor(g.key)}</div>`}</div>`;
        }).join("");
    return `<div class="mc-actions-head">
        <span class="mc-section-label">Actions — tap to use</span>
        ${this.#searchToggleHTML()}
      </div>
      ${this.#wildShapeBarHTML(actor)}
      ${this.#searchDrawerHTML()}
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
    // Every economy group carries a badge so a row is never left blank (visual consistency,
    // DM 2026-07-11): timed/rest activations now read "OTR" (light gray) like the others.
    const labels = { action: "ACT", bonus: "BA", reaction: "RE", free: "FREE", other: "OTR" };
    if (!labels[g]) return null;
    // Free / other have no economy cost → always lit; the rest dim once used (in combat).
    const on = (g === "free" || g === "other") ? true : (!econ.inCombat || econ[g]);
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
    const searchName = foundry.utils.escapeHTML(`${a.item.name} ${a.name ?? ""}`.toLowerCase());
    return `<button class="mc-action" data-action="${action}" ${data} data-search-name="${searchName}">
      <img class="mc-action-icon" src="${icon}" alt="">
      <span class="mc-action-text">
        <span class="mc-action-name">${foundry.utils.escapeHTML(a.item.name)}</span>
        <span class="mc-action-sub">${foundry.utils.escapeHTML(sub)}</span>
      </span>
      ${right}
    </button>`;
  }

  // Total target INSTANCES (a row can hold several — Magic Missile darts).
  #targetTotal(s) {
    let n = 0;
    for (const u of s.selected) n += s.counts?.[u] ?? 1;
    return n;
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
        // Player-controlled tokens (PCs + player-owned summons) read as allies even if
        // their token disposition is hostile/neutral (DM 2026-06-28). Else by disposition.
        const [cls, label] = c.pcOwned ? ["ally", "Ally"]
          : c.disposition < 0 ? ["foe", "Foe"]
          : c.disposition > 0 ? ["ally", "Ally"] : ["neutral", "Neutral"];
        // B8 in-range hint: flag a target past the activity's reach (still tappable).
        const far = s.rangeFt != null && Number(c.distanceFt) > s.rangeFt + 0.5;
        // Multi-instance stepper (Magic Missile darts): a SELECTED row on a count>1
        // activity grows "− [n] +" so several instances can land on one target.
        const n = s.counts?.[c.uuid] ?? 1;
        const stepper = (on && s.maxTargets > 1)
          ? `<span class="mc-tstep-wrap">
              <span class="mc-tstep" role="button" data-action="target-dec" data-uuid="${c.uuid}" aria-label="One fewer">−</span>
              <span class="mc-tstep-n">${n}</span>
              <span class="mc-tstep ${this.#targetTotal(s) >= s.maxTargets ? "mc-tstep-max" : ""}" role="button" data-action="target-inc" data-uuid="${c.uuid}" aria-label="One more">+</span>
            </span>`
          : "";
        return `<button class="mc-target ${on ? "mc-target-on" : ""} ${far ? "mc-target-far" : ""}" data-action="target-toggle" data-uuid="${c.uuid}">
          <span class="mc-target-name">${foundry.utils.escapeHTML(c.name)}</span>
          <span class="mc-target-right">
            ${stepper}
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
    const count = s.selfTarget ? "" : `<span class="mc-target-count">${this.#targetTotal(s)}/${s.maxTargets}</span>`;
    const canFire = s.selfTarget || s.selected.size > 0;
    const assignedBanner = s.assignedByDM
      ? `<div class="mc-assigned"><span><i class="fas fa-crosshairs"></i> Targets set by ${foundry.utils.escapeHTML(s.assignedByDM)} (${s.selected.size})</span>
          <button class="mc-assigned-change" data-action="assigned-change">change</button></div>`
      : "";
    // Out-of-resources warning (the empty-revolver case): clear, persistent, and it does
    // NOT block — firing below just won't consume (skipConsume). The player's call.
    const depletedBanner = s.depleted
      ? `<div class="mc-depleted"><i class="fas fa-triangle-exclamation"></i> Out of charges/ammo — using won't spend any, and it may not behave normally.</div>`
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
      ${depletedBanner}
      ${assignedBanner}
      ${slotRow}
      ${s.hasAttack ? `<div class="mc-adv-row">${advBtn("advantage", "Advantage")}${advBtn("normal", "Normal")}${advBtn("disadvantage", "Disadvantage")}</div>` : ""}
      ${recBanner}
      <div class="mc-targets">${body}${selfRow}</div>
      <button class="mc-fire ${s.depleted ? "mc-fire-warn" : ""} ${canFire ? "" : "mc-disabled"}" data-action="fire" ${canFire ? "" : "disabled"}>
        ${s.busy ? "Using…" : (s.depleted ? "Use anyway" : "Use")}
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
    // Player-placed AoE (Round 33): aim the template yourself on the TV via the
    // executor. Falls back to the DM-place announce if a placement session can't
    // start (no canvas on the DM screen, etc.).
    if (activity.target?.template?.type) return this.#startPlacement(activity, "aoe");
    // Teleport spells (misty step / dimension door / thunder step …): no template,
    // but the caster MOVES — aim the destination the same way.
    if (this.#isTeleportSpell(activity)) return this.#startPlacement(activity, "teleport");
    // Summons (#12): the cast IS the placement and both need the canvas, so the DM
    // still drops the token — but the player picks the choices FIRST (slot level +
    // which creature profile), and only the placement hands off (DM 2026-06-23).
    if (activity.type === "summon") return this.#openSummonConfig(activity);
    // Wild Shape's only activity is a "transform" — let it ride the normal Actions
    // list (so it groups + long-presses like any item) but route the tap to the beast
    // browser instead of running the bare transform.
    if (activity.type === "transform" && /wild\s*shape/i.test(activity.item?.name ?? "")) return this.#openWildShape();
    // GENERIC out-of-RESOURCES handling (not ammo-specific): if this activity spends a
    // limited resource (item/activity uses) that's depleted, midi can't auto-consume on
    // the executor and would FORCE a "Consume?" dialog THERE the phone can't reach → hang.
    // Rather than hard-block, flag it: the action screen shows a clear warning and the fire
    // skips consumption (skipConsume) so midi never opens that dialog — the player can use
    // it anyway and it's on them (DM 2026-06-25: an empty revolver shouldn't read as a bug).
    const depleted = (activity.consumption?.targets ?? []).some((t) => {
      const need = Number(t.value) || 1;
      const uses = t.type === "itemUses" ? activity.item?.system?.uses
        : t.type === "activityUses" ? activity.uses : null;
      return uses && (uses.max ?? 0) > 0 && (uses.value ?? 0) < need;
    });
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
    // Upcast target scaling (DM 2026-07-08): dnd5e marks scalable target counts
    // with affects.scalar (Magic Missile: count 3, scalar) — the convention is one
    // more per slot level above base, so the stepper cap must follow the picked slot.
    const baseSpellLevel = activity.item?.system?.level ?? 0;
    const targetsScale = !!affects.scalar && slotOptions.length > 0;
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
      targetsScale, baseSpellLevel, baseMaxTargets: maxTargets, // upcast grows the target cap live
      hasAttack: activity.type === "attack",
      depleted, // out of item/activity uses → warn + fire WITHOUT consuming (skipConsume), no executor hang

      // Whether this activity has any damage to roll — the safeguard against the phone
      // showing "Roll damage" for an activity midi never parks a damage step for (e.g.
      // Reload: a utility activity with no damage). DM/Sqyre 2026-06-23.
      hasDamage: (activity.damage?.parts?.length ?? 0) > 0,
      // Auto-resolve on the executor for anything that ISN'T a player-rolled
      // attack/damage/save/heal (cast/utility/summon/check/enchant/…): those have
      // no damage to park OR spawn an untrackable linked workflow (cast), so the
      // two-tap scan can't follow them — running to completion on the executor
      // applies the effect + consumes resources instead of orphaning a roll card.
      autoResolve: !["attack", "damage", "save", "heal"].includes(activity.type),
      group: this.#econGroup(activity),
      candidates: selfTarget ? [] : null, selected: new Set(assigned), counts: {}, adv: "normal",
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
  // Standard teleport spells — no template, but the caster relocates. dnd5e doesn't
  // automate the move, so we offer aim-a-destination for the common ones.
  #applyPlacementReadout(r) {
    if (!this.#placement || !r?.ok) return;
    this.#placement.distFt = r.distFt ?? this.#placement.distFt;
    this.#placement.inRange = r.inRange ?? this.#placement.inRange;
    if (r.direction != null) this.#placement.direction = r.direction;
    if (this.rendered) this.render();
  }
  #isTeleportSpell(activity) {
    const n = (activity.item?.name ?? "");
    return /\b(teleport|misty step|dimension door|thunder step|word of recall|far step|tree stride|steel wind strike|transposition|transport via)\b/i.test(n);
  }

  // Round 33: open a placement session. The executor drops a live preview on the TV;
  // the phone D-pad nudges/rotates it; Confirm resolves. Falls back to the DM-place
  // announce for AoE if the session can't start.
  async #startPlacement(activity, mode) {
    const casterTokenUuid = game.scenes.active?.tokens.get(this.originTokenId)?.uuid ?? null;
    if (!casterTokenUuid) {
      if (mode === "aoe") return this.#announceCast(activity, "aoe");
      return ui.notifications.warn("No token on the map to cast from.");
    }
    this.#abandonAction();
    let res;
    try { res = await rpc.placementStart({ activityUuid: activity.uuid, casterTokenUuid, mode, requesterId: game.user.id }); }
    catch (e) { console.warn("mobile-command | placementStart", e); res = { ok: false }; }
    if (!res?.ok) {
      if (mode === "aoe") return this.#announceCast(activity, "aoe"); // graceful fallback
      return ui.notifications.warn(`Couldn't aim: ${res?.reason ?? "the DM screen isn't ready"}`);
    }
    this.#placement = { mode, kind: res.kind, spellName: res.spellName ?? activity.item?.name ?? "spell",
      rangeFt: res.rangeFt, distFt: 0, inRange: true, direction: 0, activityUuid: activity.uuid, busy: false };
    this.#sfx("tap");
    this.render();
  }
  #placementHTML() {
    const p = this.#placement; if (!p) return "";
    const esc = foundry.utils.escapeHTML;
    const canNudge = p.kind !== "self-aoe";
    const rot = p.kind === "self-aoe" || p.mode === "aoe"; // cones/lines rotate; circles can too (no harm)
    const arrow = (dx, dy, deg) => `<button class="mc-place-btn" data-action="place-nudge" data-dx="${dx}" data-dy="${dy}" ${canNudge ? "" : "disabled"}>
      <i class="fas fa-arrow-up" style="transform:rotate(${deg}deg)"></i></button>`;
    const blank = `<span class="mc-place-blank"></span>`;
    const pad = canNudge ? `<div class="mc-place-pad">
      ${blank}${arrow(0, -1, 0)}${blank}
      ${arrow(-1, 0, 270)}<span class="mc-place-mid"><i class="fas ${p.mode === "teleport" ? "fa-person-walking-arrow-right" : "fa-crosshairs"}"></i></span>${arrow(1, 0, 90)}
      ${blank}${arrow(0, 1, 180)}${blank}
    </div>` : `<div class="mc-place-conenote"><i class="fas fa-fire"></i> Aim with the rotate buttons</div>`;
    const rotRow = rot ? `<div class="mc-place-rot">
      <button class="mc-place-btn" data-action="place-rotate" data-deg="-15" title="Rotate left"><i class="fas fa-rotate-left"></i></button>
      <span class="mc-place-dir">${Math.round(p.direction)}°</span>
      <button class="mc-place-btn" data-action="place-rotate" data-deg="15" title="Rotate right"><i class="fas fa-rotate-right"></i></button>
    </div>` : "";
    const range = p.rangeFt > 0
      ? `<div class="mc-place-range ${p.inRange ? "" : "mc-place-far"}">${p.distFt} ft ${p.inRange ? "" : "— TOO FAR"} <span class="mc-place-max">/ ${p.rangeFt} ft</span></div>`
      : `<div class="mc-place-range">from you</div>`;
    return `<div class="mc-paused mc-place-overlay"><div class="mc-paused-card mc-place-card">
      <div class="mc-place-title"><i class="fas fa-wand-magic-sparkles"></i> Aim ${esc(p.spellName)}</div>
      <div class="mc-place-sub">Watch the TV — move it into place, then Cast.</div>
      ${range}${pad}${rotRow}
      <div class="mc-place-actions">
        <button class="mc-place-cancel" data-action="place-cancel"><i class="fas fa-xmark"></i> Cancel</button>
        <button class="mc-place-confirm ${p.inRange ? "" : "mc-warn"}" data-action="place-confirm"><i class="fas fa-check"></i> ${p.mode === "teleport" ? "Teleport" : "Cast"}</button>
      </div>
    </div></div>`;
  }

  async #announceCast(activity, kind = "aoe", extra = {}) {
    const name = activity.item?.name ?? (kind === "summon" ? "summon" : "spell");
    const casterTokenUuid = game.scenes.active?.tokens.get(this.originTokenId)?.uuid ?? null;
    let res;
    try {
      res = await rpc.announceCast({
        activityUuid: activity.uuid,
        casterName: this.actor?.name,
        spellName: name,
        kind,
        casterTokenUuid,
        slotLevel: extra.slotLevel ?? null,  // the player's upcast choice
        profileId: extra.profileId ?? null   // the player's creature choice
      });
    } catch (e) {
      console.error("mobile-command | announceCast failed", { name, kind, error: e });
      return ui.notifications.warn(`${name}: couldn't reach the DM (${e?.message ?? "error"}).`);
    }
    const verb = kind === "summon" ? "summon" : "place";
    if (res?.ok) ui.notifications.info(`Asked the DM to ${verb} ${name}.`);
    else ui.notifications.warn(`${name}: ${res?.reason ?? "could not reach the DM"}`);
  }

  // Summon options the player picks BEFORE the DM places (slot level + creature
  // profile). The cast/placement still runs on the DM's canvas, but pre-configured —
  // so the DM only drops the token instead of also making the player's decisions.
  async #openSummonConfig(activity) {
    const slotOptions = this.#spellSlotOptions(activity);
    // Resolve each profile's LINKED STATBLOCK so the options render as normal item
    // rows (icon + name) and long-press can show the creature's stats — names are
    // often blank (e.g. Summon Beast's Air/Land/Water spirits live in the linked NPC).
    const profiles = await Promise.all((activity.profiles ?? []).map(async (p) => {
      let name = p.name, img = null, cr = p.cr, type = "";
      if (p.uuid) {
        try { const npc = await fromUuid(p.uuid); if (npc) { name = name || npc.name; img = npc.img; if (cr == null || cr === "") cr = npc.system?.details?.cr; type = npc.system?.details?.type?.value ?? ""; } } catch (e) { /* keep fallbacks */ }
      }
      return { id: p._id, name: name || "Creature", img, uuid: p.uuid, cr, type };
    }));
    this.#summonConfig = {
      uuid: activity.uuid, name: activity.item?.name ?? "summon",
      slotOptions, slotId: slotOptions[0]?.id ?? null, profiles
    };
    this.render();
  }
  #summonConfigHTML() {
    const sc = this.#summonConfig;
    const slotRow = sc.slotOptions.length > 1 ? `
      <div class="mc-section-label">Cast at level</div>
      <div class="mc-sm-row">${sc.slotOptions.map(o => `
        <button class="mc-sm-chip ${o.id === sc.slotId ? "mc-on" : ""}" data-action="summon-slot" data-slot="${o.id}">${ordinal(o.level)} <span class="mc-sm-sub">${o.value} left</span></button>`).join("")}</div>` : "";
    const creatureSub = (p) => {
      const bits = [p.type ? p.type.replace(/^\w/, c => c.toUpperCase()) : "", (p.cr ?? "") !== "" ? `CR ${this.#wildShapeCR(p.cr)}` : ""].filter(Boolean);
      return bits.length ? bits.join(" · ") : "Tap to summon · hold for details";
    };
    const body = sc.profiles.length ? `
      <div class="mc-section-label">Choose a creature</div>
      <div class="mc-actions">${sc.profiles.map(p => `
        <button class="mc-action" data-action="summon-pick" data-profile="${p.id}" data-uuid="${p.uuid ?? ""}">
          <img class="mc-action-icon" src="${p.img || "icons/svg/mystery-man.svg"}" alt="">
          <span class="mc-action-text">
            <span class="mc-action-name">${foundry.utils.escapeHTML(p.name)}</span>
            <span class="mc-action-sub">${creatureSub(p)}</span>
          </span>
        </button>`).join("")}</div>`
      : `<button class="mc-ws-bar mc-ws-open" data-action="summon-pick" data-profile=""><i class="fas fa-paw"></i> Ask the DM to place it</button>`;
    return `<div class="mc-ws-head">
        <button class="mc-ws-back" data-action="summon-cancel" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
        <span class="mc-section-label">Summon — ${foundry.utils.escapeHTML(sc.name)}</span>
      </div>
      ${slotRow}${body}`;
  }
  async #doSummonPick(profileId) {
    const sc = this.#summonConfig;
    if (!sc) return;
    const activity = await fromUuid(sc.uuid);
    const extra = { slotLevel: sc.slotId, profileId: profileId || null };
    this.#summonConfig = null; this.render();
    if (activity) await this.#announceCast(activity, "summon", extra);
  }

  // Idea #2 (slice 2b) — the portrait generator screen. The body/portrait toggle drives
  // the framing layer; the free-text box adds the player's own description; the live
  // preview shows the assembled prompt to copy into an image generator. Upload comes next.
  // The actor a portrait is being generated FOR — the group actor for a group
  // portrait (task #12), else the current subject.
  #portraitActor() { return game.actors.get(this.#portraitGen?.actorId) ?? this.actor; }
  #portraitGenHTML() {
    const pg = this.#portraitGen;
    const actor = this.#portraitActor();
    let dmStyle = ""; try { dmStyle = game.settings.get(MODULE_ID, "portraitStyle") || ""; } catch (e) { /* old worlds may lack the setting */ }
    const prompt = buildPortraitPrompt(actor, { freeText: pg.freeText, dmStyle, mode: pg.mode });
    const seg = (m, label, icon) => `<button class="mc-pg-seg ${pg.mode === m ? "mc-on" : ""}" data-action="portrait-mode" data-mode="${m}"><i class="fas ${icon}"></i> ${label}</button>`;
    return `<div class="mc-ws-head">
        <button class="mc-ws-back" data-action="portrait-back" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
        <span class="mc-section-label">Portrait — ${foundry.utils.escapeHTML(actor.name)}</span>
      </div>
      <div class="mc-pg">
        <div class="mc-pg-label">Composition</div>
        <div class="mc-pg-segs">${seg("portrait", "Portrait", "fa-user")}${seg("body", "Full body", "fa-person")}</div>
        <div class="mc-pg-label">Describe your character <span class="mc-pg-hint">gender, build, hair, gear, colours…</span></div>
        <textarea class="mc-pg-input" rows="3" placeholder="e.g. a stern human woman, long silver braid, weathered green cloak, twin daggers">${foundry.utils.escapeHTML(pg.freeText)}</textarea>
        <div class="mc-pg-label">Prompt <span class="mc-pg-hint">paste into your image generator</span></div>
        <textarea class="mc-pg-preview" data-pg-preview readonly rows="6">${foundry.utils.escapeHTML(prompt)}</textarea>
        <button class="mc-pg-copy" data-action="portrait-copy"><i class="fas fa-copy"></i> Copy prompt</button>
        <a class="mc-pg-gemini" href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i> Open Gemini &amp; paste</a>
        <div class="mc-pg-label">Then upload the image you generated</div>
        <input type="file" accept="image/*" class="mc-pg-file" hidden>
        <button class="mc-pg-upload" data-action="portrait-upload"><i class="fas fa-arrow-up-from-bracket"></i> Upload image</button>
        <div class="mc-pg-note"><i class="fas fa-circle-info"></i> The full image becomes your portrait; a cropped disc becomes your ring token.</div>
      </div>`;
  }
  // Copy that also works on a phone on the LAN over plain HTTP. Two traps:
  //   1. navigator.clipboard needs a SECURE context; on an iPhone hitting the LAN IP it is
  //      often PRESENT but rejects — and awaiting it (even just to catch the rejection) burns
  //      the tap's user gesture, after which execCommand fails too. So run the synchronous
  //      execCommand path FIRST, in the gesture, with NOTHING awaited before it; the async
  //      API is only a fallback for the rare desktop context that disabled execCommand.
  //   2. The actual "copies nothing" bug: selectNodeContents on a <textarea> (or a plain div)
  //      selects 0 chars, so execCommand copied an empty selection. A contentEditable div with
  //      the text in textContent selects correctly. (Never iOS- or HTTP-specific.)
  // Returns { ok, diag }; the diag is logged on failure so a phone we can't devtools into is legible.
  async #copyToClipboard(text) {
    const secure = window.isSecureContext;
    const hasApi = !!navigator.clipboard?.writeText;
    const value = text ?? "";
    let execOk = false, execErr = "";
    try {
      // Copy from a contentEditable DIV with the text in textContent + a DOM Range.
      // selectNodeContents on a <textarea> (its value is NOT its child nodes) or on a plain
      // div selects NOTHING — verified 0 chars — which is exactly why it "copied nothing".
      // A contentEditable div captures the full multi-line text (verified 60/60 + newlines).
      const el = document.createElement("div");
      el.textContent = value;
      el.contentEditable = "true";
      el.setAttribute("inputmode", "none"); // keep the iOS keyboard from popping
      el.style.cssText = "position:fixed;left:-9999px;top:0;white-space:pre-wrap;font-size:16px;-webkit-user-select:text;user-select:text;";
      document.body.appendChild(el);
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      execOk = document.execCommand("copy");
      sel.removeAllRanges();
      el.remove();
    } catch (e) { execErr = String(e?.name || e).slice(0, 18); }
    let diag = `sec=${secure ? 1 : 0} api=${hasApi ? 1 : 0} len=${value.length} exec=${execOk ? 1 : 0}${execErr ? " e=" + execErr : ""}`;
    if (execOk) return { ok: true, diag };
    // Only here (execCommand couldn't run) do we await the async API — gesture already spent.
    if (hasApi) {
      try { await navigator.clipboard.writeText(value); return { ok: true, diag: diag + " async=1" }; }
      catch (e) { diag += " async=0"; }
    }
    return { ok: false, diag };
  }

  async #copyPortraitPrompt() {
    if (!this.#portraitGen) return;
    const actor = this.#portraitActor();
    let dmStyle = ""; try { dmStyle = game.settings.get(MODULE_ID, "portraitStyle") || ""; } catch (e) { /* */ }
    const live = this.element?.querySelector(".mc-pg-input")?.value; // newest text even if input didn't fire
    const box = this.element?.querySelector(".mc-pg-preview"); // the live preview textarea = exactly what's shown
    const text = box?.value ?? buildPortraitPrompt(actor, { freeText: live ?? this.#portraitGen.freeText, dmStyle, mode: this.#portraitGen.mode });
    const { ok, diag } = await this.#copyToClipboard(text);
    if (!ok) console.warn(`${MODULE_ID} | portrait prompt copy failed — ${diag}`); // diag kept in the console for next time
    const b = this.element?.querySelector(".mc-pg-copy");
    if (b) {
      b.innerHTML = ok ? '<i class="fas fa-check"></i> Copied' : '<i class="fas fa-triangle-exclamation"></i> Long-press the prompt to copy';
      setTimeout(() => { const b2 = this.element?.querySelector(".mc-pg-copy"); if (b2) b2.innerHTML = '<i class="fas fa-copy"></i> Copy prompt'; }, ok ? 1600 : 2800);
    }
  }
  // Two images from the one upload: a disc-cropped 512px token (sharp, ring-framed) and the
  // FULL uncropped image (≤768px) for the character portrait. Hand both to the executor — the
  // player can't write files themselves (FILES_UPLOAD is GM-only). DM request 2026-06-26.
  async #uploadPortraitFile(file) {
    if (!file || !this.#portraitGen) return;
    const actor = this.#portraitActor(); if (!actor) return;
    const btn = this.element?.querySelector(".mc-pg-upload");
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…';
    const [tokenUrl, portraitUrl] = await Promise.all([
      this.#resizeImage(file, 512), // disc-masked + inset → the token texture
      this.#resizePlain(file, 768)  // full, uncropped → the actor portrait
    ]);
    if (!tokenUrl) { if (btn) btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Could not read that image'; return; }
    const res = await rpc.portraitUpload({ actorId: actor.id, tokenUrl, portraitUrl: portraitUrl || tokenUrl }).catch(e => ({ ok: false, reason: String(e?.message ?? e) }));
    if (res?.ok) {
      this.#portraitGen = null; // done → back to the sheet, now showing the new portrait
      this.render();
      ui.notifications?.info?.("Set — full image as your portrait, cropped disc as your token.");
    } else if (btn) {
      btn.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${foundry.utils.escapeHTML(res?.reason ?? "Upload failed — has the DM's screen reloaded?")}`;
    }
  }
  // Center-square-crop the chosen image to `size` and apply a standard full-size
  // circular mask, so the token is a clean disc that fills the ring (the colour band
  // frames it). Output keeps alpha for the transparent corners — webp, else PNG; never
  // JPEG, which has no alpha and would fill the corners with a solid block.
  #resizeImage(file, size = 512) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        // Mask to a disc INSIDE the ring band so the colour ring shows around the
        // character. The art must sit INSIDE the ring's inner rim, not its outer rim.
        // radius 0.34 → opaqueFrac 0.68 → ~32% margin. Tune here.
        const r = size * 0.34;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const side = Math.min(img.width, img.height) || 1; // center square crop
        const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
        // Inset the art to 80% (≈20% smaller), centred, so the character sits well inside the
        // disc instead of pressing against the ring — AI portraits crop tight to the frame.
        // DM request 2026-06-26. 0.8·size (410) still fully covers the 0.34r disc (348), no gap.
        const fill = 0.8, off = (size * (1 - fill)) / 2;
        ctx.drawImage(img, sx, sy, side, side, off, off, size * fill, size * fill);
        let out = null; try { out = canvas.toDataURL("image/webp", 0.92); } catch (e) { /* webp unsupported */ }
        if (!out || !out.startsWith("data:image/webp")) out = canvas.toDataURL("image/png"); // PNG keeps the transparent corners
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  // The FULL image for the character portrait: scaled to fit `maxDim` on the longest side
  // (never upscaled), NO square crop and NO disc mask — so the sheet shows the whole art, not
  // the token disc. webp, else JPEG (small upload; the full portrait rarely needs alpha).
  #resizePlain(file, maxDim = 768) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        let out = null; try { out = canvas.toDataURL("image/webp", 0.92); } catch (e) { /* webp unsupported */ }
        if (!out || !out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", 0.92);
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  // Save/reaction prompt: the executor relayed a midi save request for one of
  // this user's actors. Store it, show the cue, and auto-clear when midi's
  // timeout would have lapsed (so a stale prompt doesn't linger after the
  // auto-roll). A new request replaces the old.
  // DM roll-request (task #19): the DM's Rolls tool asked THIS player for a check
  // or save — show a tappable card that rolls it natively (chat + on-screen dice).
  noteRollRequest(payload) {
    this.#rollRequest = payload || null;
    if (payload) this.#sfx("prompt");
    if (this.rendered) this.render();
  }
  openColorPick() { this.#colorPickOpen = true; this.#sfx("prompt"); if (this.rendered) this.render(); }
  #rollRequestHTML() {
    const p = this.#rollRequest;
    if (!p) return "";
    const a = p.actorUuid ? fromUuidSync(p.actorUuid) : this.actor;
    if (!a?.testUserPermission(game.user, "OWNER")) return "";
    const verb = p.rollType === "check" ? "check" : "save";
    return `<div class="mc-gc-bar">
      <button class="mc-gc-roll" data-action="roll-request"><i class="fas fa-dice-d20"></i> Roll ${foundry.utils.escapeHTML(p.label ?? p.ability)} ${verb}</button>
      <button class="mc-gc-x" data-action="roll-request-x" aria-label="Dismiss">✕</button>
    </div>`;
  }

  noteSavePrompt(payload) {
    clearTimeout(this.#savePromptTimer);
    // Log the required save as a bottom event chip (the save-prompt card is the popup).
    if (payload && this.#savePrompt?.actorUuid !== payload.actorUuid) {
      const abil = payload.abilities?.[0];
      const label = CONFIG.DND5E?.abilities?.[abil]?.label ?? (abil ? abil.toUpperCase() : "");
      this.#pushEvent({ kind: "save", text: `${payload.dc ? `DC ${payload.dc} ` : ""}${label} save`.trim() });
    }
    this.#savePrompt = payload || null;
    if (payload) this.#sfx("prompt"); // off-turn attention cue (§6: player is looking at the TV)
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
    const combatant = game.combat?.combatant;
    const cur = combatant?.actor?.id ?? null;
    if (cur === this.#lastCombatantId) return;
    this.#lastCombatantId = cur;
    this.#moveBudget = null; // the executor resets a token's ft when its turn begins → clear the stale readout
    // Auto-follow the turn: when the new active combatant is a token THIS player owns
    // (a PC, summon, familiar, wild-shape beast…), switch the controller to it so the
    // phone is already on the right creature when its turn starts — no manual cycling
    // (DM request 2026-06-25, esp. for summons/familiars). Phone clients only; only to an
    // owned token on the active scene; never mid-action (don't yank a parked two-tap).
    const tok = combatant?.token;
    if (tok && !game.user.isGM && !isDisplayClient() && !this.#actionState
        && tok.isOwner && tok.parent?.id === game.scenes?.active?.id && this.#subjectId !== tok.id) {
      this.#subjectId = tok.id;
      this.#subjectActorId = null;
    }
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
    this.#sfx("roll");
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
      // Multi-instance targets ride as DUPLICATE uuids (Magic Missile: [A, A, B] =
      // two darts on A, one on B). The executor targets the unique set and applies
      // per-instance damage for the extras.
      const expanded = s.selfTarget ? [] : Array.from(s.selected).flatMap(u => Array(Math.max(1, s.counts?.[u] ?? 1)).fill(u));
      res = await this.#withTimeout(rpc.useActivityStart({
        activityUuid: s.uuid,
        targetUuids: expanded,
        midiOptions,
        spellSlot: s.slot ?? null, // upcast: cast at the chosen slot level
        skipConsume: !!s.depleted   // out of charges: fire WITHOUT consuming so midi never opens the executor "Consume?" dialog
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
    if (!res.needsDamage || !s.hasDamage) {
      // Resolved without a damage step: a miss, nothing to roll, OR — the safeguard —
      // the executor reported a damage step for an activity that has NO damage to roll
      // (e.g. Reload). Never prompt "Roll damage" when midi has nothing to ask for; if
      // a workflow was parked anyway, cancel it so it doesn't orphan on the executor.
      if (res.needsDamage && res.requestId) { try { await rpc.useActivityCancel({ requestId: res.requestId }); } catch (e) {} }
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
    this.#wildShape = null;    // close the beast browser / summon picker too — otherwise
    this.#summonConfig = null; // they override the tab content and a tab tap looks stuck
    this.#portraitGen = null;  // close the portrait generator too
  }

  // B9 live target preview: reflect the current selection on the executor's
  // canvas/TV as the player taps (empty list clears it).
  #pushPreview() {
    rpc.previewTargets({ tokenUuids: this.#actionState ? Array.from(this.#actionState.selected) : [] });
  }
  #clearPreview() {
    rpc.previewTargets({ tokenUuids: [] });
  }

  // §14: AC5E's adv/dis recommendation + the named reasons (WHY). The executor runs a
  // throwaway, HIDDEN pre-roll so AC5E annotates (it can't be read without rolling),
  // and returns {mode, reasons}. The pre-roll is suppressed there (blind + DSN off +
  // card deleted); players never see it (phones hide chat, no canvas). Pre-selects the
  // recommended button (player can still override) and lists the causes.
  async #refreshAttackPreview() {
    const s = this.#actionState;
    if (!s || !s.hasAttack) { if (s) s.recommendation = null; return; }
    const targetTokenUuids = Array.from(s.selected);
    if (!targetTokenUuids.length) { s.recommendation = null; return; }
    const token = s.uuid; // detect navigation / target change mid-flight
    s.recPending = true;
    let res;
    try { res = await rpc.attackPreview({ attackerTokenId: this.originTokenId, activityUuid: s.uuid, targetTokenUuids }); }
    catch (e) { res = null; }
    if (this.#actionState !== s || s.uuid !== token) return;
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
    this.#sfx("roll");
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
  // ApplicationV2's reserved "tab" action fires _onClickTab → changeTab(tab, group) on our
  // own data-action="tab" nav buttons, but they carry no data-group (we drive tabs ourselves
  // via #tab). The native call then rejects with "must pass both the tab and tab group
  // identifier" — an unhandled rejection on EVERY tab switch. Swallow the groupless no-op call.
  // DM live-test 2026-06-27.
  changeTab(tab, group, options) {
    if (!tab || !group) return;
    return super.changeTab(tab, group, options);
  }

  #onClick = (ev) => {
    if (this.#suppressClick) { this.#suppressClick = false; return; } // swallow the tap after a long-press
    const el = ev.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const actor = this.actor;
    switch (action) {
      case "exit": return this.#confirmExit();
      case "fullscreen": return this.#toggleFullscreen();
      case "onboard-done":
        try { window.localStorage.setItem("mc-onboarded", "1"); } catch (e) { /* private mode */ }
        this.#onboardOpen = false; return this.render();
      case "onboard-open":
        this.#onboardOpen = true; return this.render();
      case "logout": return game.logOut?.(); // temp: switching Foundry users on a phone is painful
      case "set-theme":
        try { window.localStorage.setItem("mc-theme", el.dataset.theme); } catch (e) { /* private mode */ }
        this.#applyTheme(); return this.render();
      case "my-color":
        return game.user.update({ color: el.dataset.color }).then(() => this.render());
      case "color-pick-done":
        this.#colorPickOpen = false; return this.render();
      case "tab":
        this.#tab = el.dataset.tab;
        this.#searchOpen = false; this.#searchQuery = ""; // each tab's search starts closed/clear
        this.#bioOpen = false; this.#bioEditing = false;  // leave the biography overlay
        this.#abandonAction(); // leave the picker clean; cancel any held workflow
        return this.render();
      case "search-toggle":
        this.#searchOpen = !this.#searchOpen;
        if (!this.#searchOpen) this.#searchQuery = "";
        this.render();
        if (this.#searchOpen) setTimeout(() => this.element?.querySelector(".mc-search-input")?.focus(), 0);
        return;
      case "action-pick":
        return this.#pickAction(el.dataset.uuid);
      case "fav-toggle":
        return this.#toggleFavorite(el.dataset.favid);
      case "fav-act": {
        // A favorite carries only ONE activity (the "midi action"), so a multi-activity
        // item (e.g. a revolver: Attack + Reload) was unreachable except its favorited
        // activity. If the item has other usable activities, open its activity picker
        // (like the Equipment tab) so all of them — incl. Reload — are reachable.
        const favAct = fromUuidSync(el.dataset.uuid, { relative: this.actor });
        const favItem = favAct?.item;
        if (favItem && this.#itemUsableActivities(favItem).length > 1) {
          this.#tab = "equipment"; this.#itemPickerId = favItem.id; return this.render();
        }
        return this.#pickAction(el.dataset.uuid);
      }
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
      case "slot-pick": { // upcast: choose the spell-slot level to cast at
        const s = this.#actionState;
        if (!s) return;
        s.slot = el.dataset.slot;
        if (s.targetsScale) {
          // scalar target counts follow the slot: +1 per level above base (Magic
          // Missile darts). Re-picking a LOWER slot can strand instances — trim
          // extra instances first, then whole targets, until back under the cap.
          const lvl = s.slotOptions.find(o => o.id === s.slot)?.level ?? s.baseSpellLevel;
          s.maxTargets = s.baseMaxTargets + Math.max(0, lvl - s.baseSpellLevel);
          while (this.#targetTotal(s) > s.maxTargets) {
            const over = [...s.selected].find(u => (s.counts[u] ?? 1) > 1);
            if (over) s.counts[over] = (s.counts[over] ?? 1) - 1;
            else {
              const last = [...s.selected].pop();
              if (last === undefined) break;
              s.selected.delete(last); delete s.counts[last];
            }
          }
        }
        return this.render();
      }
      case "target-toggle": {
        const s = this.#actionState;
        if (!s) return;
        const uuid = el.dataset.uuid;
        if (s.selected.has(uuid)) { s.selected.delete(uuid); delete s.counts[uuid]; }
        else if (this.#targetTotal(s) < s.maxTargets) { s.selected.add(uuid); s.counts[uuid] = 1; }
        else if (s.maxTargets === 1) { s.selected.clear(); s.counts = {}; s.selected.add(uuid); s.counts[uuid] = 1; } // single-target: tap to swap
        this.#pushPreview(); // B9: commit the target to the canvas/TV on tap
        this.#refreshAttackPreview(); // §14: ask the executor for AC5E's recommendation
        return this.render();
      }
      // Multi-instance targets (Magic Missile darts — DM 2026-07-05: "a − [1] + at
      // the end of the target after selecting"): bump/drop instances on a selected
      // row; total instances across rows caps at the activity's target count.
      case "target-inc": {
        const s = this.#actionState;
        if (!s?.selected.has(el.dataset.uuid)) return;
        if (this.#targetTotal(s) < s.maxTargets) s.counts[el.dataset.uuid] = (s.counts[el.dataset.uuid] ?? 1) + 1;
        return this.render();
      }
      case "target-dec": {
        const s = this.#actionState;
        const uuid = el.dataset.uuid;
        if (!s?.selected.has(uuid)) return;
        const n = (s.counts[uuid] ?? 1) - 1;
        if (n <= 0) { s.selected.delete(uuid); delete s.counts[uuid]; this.#pushPreview(); }
        else s.counts[uuid] = n;
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
          if (this.#charGen.learn) { this.#charGen = null; this.#charGenSpellOptions = null; } // post-creation Learn spells → back to the sheet
          else if (this.#charGen.equip?.catOpen != null) { this.#charGen.equip.catOpen = null; this.#charGen.equip.catOptions = null; }
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
      case "char-gen-redo":
        return this.#charGenRedo(el.dataset.itemId);
      case "char-gen-spells":
        return this.#charGenSpells();
      case "learn-spells": {
        // Post-creation spell learning (DM 2026-07-09: "what happens on level up?"
        // — dnd5e's advancement grants NO spell picks for list casters, so leveled
        // PCs had no phone path to new spells). Reuses the char-gen picker in
        // "learn" mode: apply/back exit to the sheet, never the build workspace.
        if (!this.actor) return;
        this.#charGen = { actorId: this.actor.id, learn: true };
        return this.#charGenSpells();
      }
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
      case "cond-open":
        return this.#showEffectDetails(el.dataset.effectId);
      case "cond-edit":
        this.#condEditing = !this.#condEditing; return this.render();
      case "toggle-levels":
        this.#showLevels = !this.#showLevels; this.#levelUp = null; return this.render();
      case "level-up-open": return this.#openLevelUp();
      case "level-up-back": return this.#closeLevelUp();
      case "level-up-class": return this.#doLevelUp(el.dataset.classId);
      case "level-up-add": return this.#openMulticlass();
      case "level-up-pick": return this.#addMulticlass(el.dataset.uuid);
      case "party-cell": return this.#partyPlace(Number(el.dataset.r), Number(el.dataset.c));
      case "roll-request": {
        const p = this.#rollRequest; this.#rollRequest = null; this.render();
        const a = p?.actorUuid ? fromUuidSync(p.actorUuid) : actor;
        if (p && a) p.rollType === "check" ? a.rollAbilityCheck({ ability: p.ability }) : a.rollSavingThrow({ ability: p.ability });
        return;
      }
      case "roll-request-x": this.#rollRequest = null; return this.render();
      case "aoo-attack": {
        const p = this.#aooPrompt;
        if (!p) return;
        clearTimeout(this.#aooTimer);
        this.#aooPrompt = null;
        // Pre-target the escaping enemy via the assigned-targets path — the picker
        // opens with them selected; Use → the normal attack → damage two-tap.
        this.#assignedTargets = [p.targetUuid];
        this.#assignedBy = "Opportunity";
        return this.#pickAction(p.activityUuid);
      }
      case "aoo-dismiss":
        clearTimeout(this.#aooTimer);
        this.#aooPrompt = null; return this.render();
      case "party-move": return this.#partyMove(Number(el.dataset.dx), Number(el.dataset.dy));
      case "party-stage": return this.#partyStage(el.dataset.stage);
      case "ptab":
        this.#partyTab = el.dataset.ptab; return this.render();
      case "party-check":
        return actor?.rollSkill({ skill: el.dataset.skill }); // same as any skill roll
      case "party-view-toggle":
        this.#partyView = el.dataset.on === "1"; return this.render();
      case "party-done": return this.#partyToggleLock();
      case "party-forward": return this.#partyForward(Number(el.dataset.dir));
      case "party-disperse": return this.#partyDisperse();
      case "token-prev": return this.#cycleSubject(-1);
      case "token-next": return this.#cycleSubject(1);
      case "paused-dismiss":
        this.#pausedDismissed = el.dataset.key; return this.render();
      case "night-dismiss":
        this.#nightDismissed = el.dataset.key; return this.render();
      case "night-reopen":
        this.#nightDismissed = null; return this.render();
      case "place-nudge": {
        const p = this.#placement; if (!p || p.busy) return;
        p.busy = true;
        rpc.placementNudge({ dx: Number(el.dataset.dx), dy: Number(el.dataset.dy) })
          .then(r => this.#applyPlacementReadout(r)).catch(e => console.warn("mobile-command | nudge", e))
          .finally(() => { if (this.#placement) this.#placement.busy = false; });
        return;
      }
      case "place-rotate": {
        const p = this.#placement; if (!p || p.busy) return;
        p.busy = true;
        rpc.placementRotate({ deg: Number(el.dataset.deg) })
          .then(r => this.#applyPlacementReadout(r)).catch(e => console.warn("mobile-command | rotate", e))
          .finally(() => { if (this.#placement) this.#placement.busy = false; });
        return;
      }
      case "place-cancel": {
        this.#placement = null; this.render();
        rpc.placementCancel().catch(e => console.warn("mobile-command | place-cancel", e));
        return;
      }
      case "place-confirm": {
        const p = this.#placement; if (!p || p.busy) return;
        p.busy = true; this.render();
        rpc.placementConfirm()
          .then(r => {
            this.#placement = null; this.render();
            if (r?.ok) { this.#sfx("damage"); ui.notifications.info(p.mode === "teleport" ? "Teleported." : r.dmResolves ? `${p.spellName} aimed — the DM will resolve it (${r.targets ?? 0} in the area).` : `${p.spellName} cast${r.targets ? ` — ${r.targets} in the area` : ""}.`); }
            else ui.notifications.warn(r?.reason ?? "Couldn't finish the cast.");
          })
          .catch(e => { console.warn("mobile-command | place-confirm", e); this.#placement = null; this.render(); ui.notifications.warn("The DM screen didn't respond."); });
        return;
      }
      case "set-active-pc": {
        const id = el.dataset.actorId;
        if (game.user.character?.id === id) return; // already active
        game.user.update({ character: id })
          .then(() => { ui.notifications.info(`${game.actors.get(id)?.name ?? "This PC"} is now your active character — your popups come here.`); if (this.rendered) this.render(); })
          .catch(e => { console.warn("mobile-command | set active pc", e); ui.notifications.warn("Couldn't switch — ask the DM to assign it in User Configuration."); });
        return;
      }
      case "scroll-scribe":
        rpc.scribeRequest({ actorId: this.actor?.id, itemId: el.dataset.itemId, requesterId: game.user.id })
          .then(res => {
            if (res?.ok === false) ui.notifications.warn(res.reason ?? "The request couldn't be sent.");
            else ui.notifications.info("Sent to the DM — you'll hear back.");
          })
          .catch(e => { console.warn("mobile-command | scribeRequest", e); ui.notifications.warn("The DM's client isn't reachable."); });
        return;
      case "night-toggle": {
        const me = game.user.character ?? this.actor;
        rpc.nightToggle({ groupId: el.dataset.group, actorId: me?.id, watch: Number(el.dataset.watch), requesterId: game.user.id })
          .then(res => { if (res?.ok === false) ui.notifications.warn(res.reason ?? "Couldn't set that watch."); })
          .catch(e => console.warn("mobile-command | nightToggle", e));
        return; // the group flag update re-renders every member phone
      }
      case "follow-toggle": {
        // #onClick is NOT async — no await here (a bare await was the v0.1.68-style
        // SyntaxError all over again; the syntax gate caught it pre-ship).
        const on = !game.user.getFlag("mobile-command", "followAll");
        game.user.setFlag("mobile-command", "followAll", on)
          .then(() => { if (this.rendered) this.render(); })
          .catch(e => console.warn("mobile-command | follow flag", e));
        ui.notifications.info(on ? "Your other tokens will follow your moves." : "Follow off.");
        return;
      }
      case "pick-offscene": // from the no-token screen: peek at / build an owned character
        this.#subjectActorId = el.dataset.actorId; this.#subjectId = null; return this.render();
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
      case "use-nearby":
        return this.#useNearby();
      case "loot-open":
        return this.#openLoot(el.dataset.uuid);
      case "door-toggle":
        return this.#operateInteractable("door", el.dataset.id);
      case "tile-trigger":
        return this.#operateInteractable("tile", el.dataset.id);
      case "journal-post":
        return this.#postJournalNote();
      case "bio-close":
        this.#bioOpen = false; this.#bioEditing = false; return this.render();
      case "bio-edit":
        this.#bioEditing = true;
        this.#bioDraft = this.#htmlToText(this.actor?.system?.details?.biography?.value || this.actor?.system?.details?.biography?.public || "");
        return this.render();
      case "bio-cancel":
        this.#bioEditing = false; return this.render();
      case "bio-save":
        return this.#saveBio();
      case "wildshape-open":
        return this.#openWildShape();
      case "wildshape-close":
        return this.#closeWildShape();
      case "wildshape-pick":
        return this.#doWildShape(el.dataset.uuid);
      case "wildshape-revert":
        return this.#revertWildShape();
      case "summon-slot":
        if (this.#summonConfig) this.#summonConfig.slotId = el.dataset.slot;
        return this.render();
      case "summon-cancel":
        this.#summonConfig = null; return this.render();
      case "summon-pick":
        return this.#doSummonPick(el.dataset.profile);
      case "portrait-open": // from the image popup: open the portrait generator for this actor
        this.#imagePopup = null;
        this.#portraitGen = { actorId: actor?.id, mode: "portrait", freeText: "" };
        return this.render();
      case "group-portrait": // party view: portrait for the GROUP actor (task #12)
        this.#portraitGen = { actorId: el.dataset.groupId, mode: "body", freeText: "" };
        return this.render();
      case "portrait-mode":
        if (this.#portraitGen) this.#portraitGen.mode = el.dataset.mode;
        return this.render();
      case "portrait-copy":
        return this.#copyPortraitPrompt();
      case "portrait-back":
        this.#portraitGen = null; return this.render();
      case "portrait-upload": // open the file picker; #onChange handles the chosen file
        this.element?.querySelector(".mc-pg-file")?.click(); return;
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
      case "reaction-pick":
        return this.#useReaction(el.dataset.uuid, el.dataset.self === "1");
      case "reaction-dismiss":
        clearTimeout(this.#reactionTimer);
        this.#reactionPrompt = null; return this.render();
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
    // A rest updates the actor; if it isn't ours to update (ownership changed under the shell —
    // the DM was toggling permissions), bail with a clean note instead of letting Foundry throw
    // a raw "lacks permission to update Actor" error. The shell only navigates to owned actors,
    // so this is the safety net for an ownership that drops mid-session. DM 2026-06-27.
    if (!actor.isOwner) { ui.notifications?.warn?.(`You don't have permission to rest ${actor.name}.`); return; }
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
    if (!res?.ok) this.#moveBudget = { text: res?.ok === false ? "Blocked" : (res?.reason ?? "Blocked"), cls: "mc-move-note mc-move-red" };
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
      ["input", this.#onInput], // keep the journal draft across re-renders without re-rendering
      ["focusin", this.#onFocusIn], // select a coin's value on focus → typing replaces it
      ["focusout", this.#onFocusOut] // re-collapse an empty coin's input on blur
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
      // A creature statblock (Wild Shape beast / summon profile) → an informative
      // creature card, not the empty item card (NPCs keep their text elsewhere).
      if (doc?.documentName === "Actor") return this.#showActorDetails(doc);
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
    // §17.1 scribe-from-scroll (DM-GATED, signed off 2026-07-08): a wizard holding
    // a spell scroll may ASK to copy it into their spellbook — the button sends a
    // request; the DM's panel chip approves (spell added unprepared + scroll
    // consumed + suggested cost posted) or declines (nothing changes). Offered
    // when: the scroll is owned by this actor, the actor has a wizard class, the
    // scroll's cast activity resolves to a leveled spell the book doesn't know.
    let scribe = null;
    try {
      const owned = item.parent === this.actor;
      const isScroll = item.type === "consumable" && (sys.type?.value === "scroll");
      const isWizard = this.actor?.items.some(i => i.type === "class" && (i.system?.identifier === "wizard" || /^wizard$/i.test(i.name)));
      if (owned && isScroll && isWizard) {
        const castAct = [...(sys.activities ?? [])].find(a => a.type === "cast" && a.spell?.uuid);
        const spell = castAct ? await fromUuid(castAct.spell.uuid).catch(() => null) : null;
        if (spell?.type === "spell" && (spell.system?.level ?? 0) > 0
          && !this.actor.items.some(i => i.type === "spell" && i.name === spell.name)) {
          scribe = { itemId: item.id, spellName: spell.name, level: spell.system.level };
        }
      }
    } catch (e) { /* no scribe button on any resolution hiccup */ }
    this.#detailCard = { name: item.name, img: item.img || "icons/svg/item-bag.svg", subtitle: this.#itemSubtitle(item), meta: this.#itemMeta(item), desc, favType, favId, isFav, itemId: item.id, spellPickUuid, scribe };
    this.render();
  }

  // Informative creature card (long-press a Wild Shape beast / summon profile). NPCs
  // keep their text in details.biography (not system.description), and the useful info
  // for "which shape?" is the statline — so show size/type/CR, AC/HP/speed, the six
  // abilities, then any biography.
  async #showActorDetails(actor) {
    const sys = actor.system ?? {};
    const det = sys.details ?? {};
    const cr = det.cr;
    const type = det.type?.value ? det.type.value.replace(/^\w/, c => c.toUpperCase()) : "";
    const sizeCfg = CONFIG.DND5E?.actorSizes?.[sys.traits?.size];
    const size = (typeof sizeCfg === "string" ? sizeCfg : sizeCfg?.label) ?? "";
    const subtitle = [size, type, (cr != null && cr !== "") ? `CR ${this.#wildShapeCR(cr)}` : ""].filter(Boolean).join(" · ");
    const ac = sys.attributes?.ac?.value;
    const hp = sys.attributes?.hp?.max;
    const mv = sys.attributes?.movement ?? {};
    const speed = ["walk", "fly", "swim", "climb", "burrow"].filter(k => typeof mv[k] === "number" && mv[k] > 0)
      .map(k => k === "walk" ? `${mv[k]} ft` : `${k} ${mv[k]} ft`).join(", ");
    const meta = [ac != null ? `AC ${ac}` : "", hp != null ? `HP ${hp}` : "", speed ? `Speed ${speed}` : ""].filter(Boolean).join(" · ");
    const abilRow = ["str", "dex", "con", "int", "wis", "cha"].map(k => {
      const a = sys.abilities?.[k] ?? {};
      return `<div class="mc-abl"><span class="mc-abl-k">${k.toUpperCase()}</span><span class="mc-abl-v">${a.value ?? "—"}</span><span class="mc-abl-m">${a.mod != null ? signed(a.mod) : ""}</span></div>`;
    }).join("");
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    const enrich = async (html) => { if (!html) return ""; try { return await TE.enrichHTML(html, { relativeTo: actor, secrets: false }); } catch (e) { return html; } };
    // The creature's traits & actions (its "abilities") — Bite, Multiattack, Pack
    // Tactics… so the player can judge what the form/summon can actually DO.
    const abilityItems = actor.items.filter(i => ["feat", "weapon"].includes(i.type));
    const abilityHtml = (await Promise.all(abilityItems.map(async (i) => {
      const dmg = i.labels?.damage ? ` <span class="mc-npc-ab-dmg">${foundry.utils.escapeHTML(i.labels.damage)}</span>` : "";
      const body = await enrich(i.system?.description?.value || "");
      return `<div class="mc-npc-ab"><div class="mc-npc-ab-name">${foundry.utils.escapeHTML(i.name)}${dmg}</div>${body ? `<div class="mc-npc-ab-body">${body}</div>` : ""}</div>`;
    }))).join("");
    const bio = await enrich(det.biography?.value || "");
    const desc = `<div class="mc-abl-row">${abilRow}</div>`
      + (abilityHtml ? `<div class="mc-section-label">Traits & Actions</div>${abilityHtml}` : "")
      + (bio ? `<div class="mc-check-desc">${bio}</div>` : "");
    this.#detailStack = [];
    this.#detailCard = { name: actor.name, img: actor.img || "icons/svg/mystery-man.svg", subtitle, meta, desc, favType: null, favId: null, isFav: false, kind: "actor" };
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
    const actor = this.actor;
    const ac = actor?.system?.attributes?.ac ?? {};
    const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
    const rows = [];
    // Mirror dnd5e's prepareArmorClass semantics (playtest 2026-07-05: Mage Armor
    // was invisible here — the old card assumed the "default" calc, and dnd5e even
    // NULLS ac.label when no armor is equipped):
    //  - flat: value IS ac.flat, nothing else applies
    //  - default: armor item (ac.armor) + capped Dex, then shield/bonus/cover
    //  - any other calc (mage/natural/custom/…): ac.base is the formula result and
    //    already owns its own Dex — show it under the calc's name, no Dex row.
    const calcLabel = CONFIG.DND5E?.armorClasses?.[ac.calc]?.label;
    if (ac.calc === "flat") {
      rows.push([calcLabel || "Flat", `${ac.flat ?? ac.value ?? 10}`]);
    } else if (ac.calc === "default") {
      rows.push([ac.equippedArmor?.name || "Unarmored", `${ac.armor ?? 10}`]);
      if (ac.dex) rows.push(["Dexterity", sign(ac.dex)]);
    } else {
      rows.push([calcLabel || "Formula", `${ac.base ?? ac.value ?? 10}`]);
    }
    if (ac.calc !== "flat") {
      if (ac.shield) rows.push(["Shield", sign(ac.shield)]);
      if (ac.bonus) rows.push(["Bonus", sign(ac.bonus)]);
      if (ac.cover) rows.push(["Cover", sign(ac.cover)]);
    }
    const list = rows.map(([l, v]) =>
      `<div class="mc-ac-row"><span class="mc-ac-k">${foundry.utils.escapeHTML(String(l))}</span><span class="mc-ac-v">${v}</span></div>`).join("");
    // Name the ACTIVE EFFECTS behind the numbers (Mage Armor's calc swap, Shield's
    // +5 bonus…) so the player sees WHY, not just the sum.
    const acEffects = (actor?.appliedEffects ?? []).filter(e =>
      e.changes?.some(c => c.key?.includes("attributes.ac")));
    const fxList = acEffects.length
      ? `<div class="mc-ac-fx"><span class="mc-ac-fx-label">From effects:</span> ${acEffects.map(e => foundry.utils.escapeHTML(e.name)).join(", ")}</div>`
      : "";
    const desc = `<div class="mc-ac-breakdown">${list}
      <div class="mc-ac-row mc-ac-total"><span class="mc-ac-k">Total</span><span class="mc-ac-v">${ac.value ?? "—"}</span></div>${fxList}</div>`;
    this.#detailCard = { name: "Armor Class", glyph: "fa-shield-halved", subtitle: ac.label || calcLabel || "", desc, favId: null, isFav: false, kind: "ac" };
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
    // Resolve from appliedEffects too, not just actor.effects — the chips now include effects
    // TRANSFERRED from items (Rage etc.), which aren't in actor.effects.
    const e = this.actor?.effects?.get(effectId) ?? this.actor?.appliedEffects?.find((x) => x.id === effectId);
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
    // Only offer Remove for effects ACTUALLY on the actor — a transferred effect (parent is its
    // source item) can't be removed from here; you'd toggle the feature itself.
    const removable = e.parent === this.actor || e.parent?.documentName === "Actor";
    this.#detailCard = { name: e.name, img: e.img || "icons/svg/aura.svg", subtitle: "Condition", desc, favId: null, isFav: false, removeEffectId: removable ? e.id : null };
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
    // Header shows the SELECTED travel type (Walk/Fly/Swim/…) rather than a static
    // "Movement"; move-mode re-runs this, so it updates as you pick (DM 2026-06-23).
    const active = this.#activeMoveMode(a);
    this.#detailCard = { name: "Travel", glyph: "fa-person-running", subtitle: active ? this.#moveModeLabel(active) : "Movement", desc: this.#travelChipsHTML(a), favId: null, isFav: false, kind: "travel" };
    this.render();
  }
  // Biography editor (long-press the portrait/name; tap the portrait still opens the
  // image). Opens the read+search view; the player can Edit and save plain text back
  // to the PC's own biography field — same rhythm as the party journal (DM 2026-07-04).
  #showBioDetails() {
    if (!this.actor) return;
    this.#detailStack = [];
    this.#detailCard = null;
    this.#bioOpen = true; this.#bioEditing = false; this.#bioFilter = "";
    this.render();
  }

  // Strip Foundry's stored bio HTML to plain text (block tags → line breaks) — the
  // editor is formatting-free (DM 2026-07-04: "no need for formatting").
  #htmlToText(html) {
    if (!html) return "";
    return String(html)
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#3?9;/gi, "'")
      .replace(/\n{3,}/g, "\n\n").trim();
  }

  // Biography view: read-with-search by default, an editable plain-text textarea in
  // edit mode. Reuses the journal's frame (filter row + list + composer footer).
  #bioHTML(actor) {
    const bio = actor?.system?.details?.biography ?? {};
    const plain = this.#htmlToText(bio.value || bio.public || "");
    const canEdit = !!actor?.isOwner;
    const paras = plain.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    const readBody = paras.length
      ? paras.map(p => `<p class="mc-bio-para">${foundry.utils.escapeHTML(p).replace(/\n/g, "<br>")}</p>`).join("")
      : `<div class="mc-jn-empty">${canEdit ? "No biography yet — tap Edit to write one." : "No biography."}</div>`;
    const body = this.#bioEditing
      ? `<textarea class="mc-bio-edit" rows="10" placeholder="Write ${foundry.utils.escapeHTML((actor?.name ?? "your character") + "'s")} story…" ${this.#bioBusy ? "disabled" : ""}>${foundry.utils.escapeHTML(this.#bioDraft)}</textarea>`
      : `<div class="mc-bio-read">${readBody}</div>`;
    const foot = this.#bioEditing
      ? `<div class="mc-bio-foot">
          <button class="mc-jn-post" data-action="bio-save" ${this.#bioBusy ? "disabled" : ""}>${this.#bioBusy ? "Saving…" : "Save biography"}</button>
          <button class="mc-bio-cancel" data-action="bio-cancel" ${this.#bioBusy ? "disabled" : ""}>Cancel</button>
        </div>`
      : (canEdit ? `<button class="mc-jn-post" data-action="bio-edit"><i class="fas fa-feather"></i> Edit biography</button>` : "");
    return `<div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="bio-close" aria-label="Close"><i class="fas fa-xmark"></i></button>
        <span class="mc-picker-title">${foundry.utils.escapeHTML(actor?.name ?? "Biography")}</span>
      </div>
      <section class="mc-journal mc-bio-view">
        ${this.#bioEditing ? "" : `<div class="mc-jn-filterrow"><i class="fas fa-magnifying-glass"></i><input class="mc-bio-filter" type="search" placeholder="Search the biography…" value="${foundry.utils.escapeHTML(this.#bioFilter)}"></div>`}
        <div class="mc-jn-list">${body}</div>
        ${foot ? `<div class="mc-jn-compose">${foot}</div>` : ""}
      </section>`;
  }

  async #saveBio() {
    if (this.#bioBusy) return;
    const actor = this.actor; if (!actor) return;
    const live = this.element?.querySelector(".mc-bio-edit")?.value;
    const text = String(live ?? this.#bioDraft);
    this.#bioBusy = true; this.render();
    try {
      // Plain text → simple <p> paragraphs (blank line splits; single newlines → <br>).
      // No rich formatting, but it still renders sanely on Foundry's own sheet.
      const html = text.trim()
        ? text.trim().split(/\n{2,}/).map(par => `<p>${foundry.utils.escapeHTML(par.trim()).replace(/\n/g, "<br>")}</p>`).join("")
        : "";
      await actor.update({ "system.details.biography.value": html });
      this.#bioEditing = false;
    } catch (e) {
      console.error("mobile-command | bio save failed", e);
      ui.notifications.warn("Biography: couldn't save (do you own this character?).");
    } finally {
      this.#bioBusy = false; this.render();
    }
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
    // The character card's title is an editable rename field (tap name → edit → Enter
    // renames the actor + token + prototype in one go, DM 2026-06-28). Other cards stay
    // as a static title.
    const titleHTML = d.kind === "character"
      ? `<input class="mc-picker-title mc-name-input" type="text" data-bio="name" value="${foundry.utils.escapeHTML(d.name)}" aria-label="Character name" autocomplete="off" enterkeyhint="done" spellcheck="false">`
      : `<span class="mc-picker-title">${foundry.utils.escapeHTML(d.name)}</span>`;
    return `<div class="mc-picker-head">
        <button class="mc-back mc-picker-x" data-action="detail-close" aria-label="Close"><i class="fas fa-xmark"></i></button>
        ${titleHTML}
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
        ${d.scribe ? `<button class="mc-spellpickbtn" data-action="scroll-scribe" data-item-id="${d.scribe.itemId}">
          <i class="fas fa-feather-pointed"></i> Ask the DM: scribe ${foundry.utils.escapeHTML(d.scribe.spellName)} into spellbook</button>` : ""}
        ${d.removeEffectId ? `<button class="mc-detail-remove" data-action="effect-remove" data-effect-id="${d.removeEffectId}"><i class="fas fa-circle-xmark"></i> Remove condition</button>` : ""}
      </div>`;
  }

  // Keyboard convenience for the stat editor (where a return key exists):
  // Enter = Set absolute; Escape = cancel. The −/+/Set buttons are the
  // primary, keyboard-independent path.
  #onKeydown = (ev) => {
    if (ev.target.matches?.(".mc-name-input")) {
      if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); }      // commit → #onChange
      else if (ev.key === "Escape") { this.#closeDetail(); this.render(); }   // cancel rename
      return;
    }
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
  // Live keystrokes in the party-journal composer → stash the draft so the shell's
  // frequent re-renders (HP/condition changes) don't wipe what the player is typing.
  // No re-render here — that would steal focus mid-word.
  #onInput = (ev) => {
    const t = ev.target;
    if (t instanceof HTMLTextAreaElement && t.classList.contains("mc-jn-input")) {
      this.#journalDraft = t.value;
    } else if (t instanceof HTMLTextAreaElement && t.classList.contains("mc-bio-edit")) {
      this.#bioDraft = t.value; // keep the bio draft across re-renders (no focus steal)
    } else if (t instanceof HTMLInputElement && t.classList.contains("mc-bio-filter")) {
      // Biography search — DOM show/hide of paragraphs (no re-render, keeps focus).
      this.#bioFilter = t.value;
      const q = t.value.trim().toLowerCase();
      this.element?.querySelectorAll(".mc-bio-para").forEach(n => {
        n.style.display = !q || n.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    } else if (t instanceof HTMLInputElement && t.classList.contains("mc-jn-filter")) {
      // Journal note filter — pure DOM show/hide (no re-render, keeps focus).
      this.#journalFilter = t.value;
      const q = t.value.trim().toLowerCase();
      this.element?.querySelectorAll(".mc-jn-note").forEach(n => {
        n.style.display = !q || n.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    } else if (t instanceof HTMLInputElement && t.classList.contains("mc-search-input")) {
      this.#searchQuery = t.value; // live search filter — DOM toggle, no re-render
      this.#applySearch(t.value);
    } else if (t instanceof HTMLTextAreaElement && t.classList.contains("mc-pg-input") && this.#portraitGen) {
      this.#portraitGen.freeText = t.value; // live prompt preview — DOM update, no re-render (keep focus)
      let dmStyle = ""; try { dmStyle = game.settings.get(MODULE_ID, "portraitStyle") || ""; } catch (e) { /* */ }
      const preview = this.element?.querySelector("[data-pg-preview]");
      const actor = this.#portraitActor();
      if (preview && actor) preview.value = buildPortraitPrompt(actor, { freeText: t.value, dmStyle, mode: this.#portraitGen.mode });
    } else if (t instanceof HTMLInputElement && t.classList.contains("mc-coin-input")) {
      this.#sizeCoinInput(t); // grow/shrink the field to hug the digits as they type
    }
  };

  #onChange = (ev) => {
    const inp = ev.target;
    if (inp?.classList?.contains?.("mc-pg-file")) { // chosen generated image → resize + executor upload
      const file = inp.files?.[0];
      if (file) this.#uploadPortraitFile(file);
      return;
    }
    // Char-gen name/biography box: commit the field to the actor on blur. data-bio is
    // the actor path ("name" → the document name, else a system.details.* path).
    if (inp?.dataset?.bio) {
      const path = inp.dataset.bio;
      const val = inp.value;
      if (path === "name") {
        const name = val || "Unnamed Character";
        // Set the actor AND the prototype token name (the token name is copied at
        // placement, so it won't follow the actor otherwise) — DM 2026-06-28: PCs were
        // all left as the generic "Player Character" token name, breaking POV/targeting.
        this.actor?.update({ name, "prototypeToken.name": name });
        // Rename already-placed tokens for this actor too (best-effort; works on the
        // canvasless phone by walking scene token docs — owned linked tokens only).
        try {
          for (const scene of game.scenes ?? []) {
            for (const td of scene.tokens ?? []) {
              if (td.actorId === this.actor?.id && td.name !== name) td.update({ name }).catch(() => {});
            }
          }
        } catch (e) { /* best-effort */ }
        // Keep the open rename card's title in sync (optimistic; the updateActor hook
        // re-renders with the saved value) so a re-render doesn't flash the old name.
        if (this.#detailCard?.kind === "character") this.#detailCard.name = name;
      } else {
        this.actor?.update({ [path]: val });
      }
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
    // Strip commas / any non-digits (the field is type=text so it can show "12,345").
    const v = Math.max(0, Math.floor(Number(String(inp.value).replace(/[^0-9]/g, "")) || 0));
    if (k) this.actor?.update({ [`system.currency.${k}`]: v });
  };
  // Select a coin's current amount on focus so typing replaces it (no manual clear), and
  // open an empty coin's collapsed input so there's room to type.
  #onFocusIn = (ev) => {
    if (ev.target?.classList?.contains?.("mc-coin-input")) { ev.target.select?.(); this.#sizeCoinInput(ev.target); }
  };
  // Re-collapse an empty coin's input when it loses focus (a no-op blur won't re-render).
  #onFocusOut = (ev) => {
    if (ev.target?.classList?.contains?.("mc-coin-input")) this.#sizeCoinInput(ev.target);
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

  // Combat events (DM 2026-07-11): incoming damage + required saves surface as passive
  // chips at the bottom ("12 damage from Goblin", "DC 15 Dexterity save"), newest-first.
  // Damage also fires a transient popup (the save has its own prompt card). Cleared when
  // combat ends and on close. Detection lives in registerShellHooks (preUpdate/updateActor).
  #pushEvent(evt) {
    this.#combatEvents.unshift({ id: foundry.utils.randomID(), ...evt });
    if (this.#combatEvents.length > COMBAT_EVENT_MAX) this.#combatEvents.length = COMBAT_EVENT_MAX;
    this.#refreshEvents();
  }
  noteDamage(amount, source) {
    const text = source ? `${amount} damage from ${source}` : `${amount} damage`;
    this.#pushEvent({ kind: "damage", text });
    this.#showToast({ total: amount, label: source ? `Damage from ${source}` : "Damage taken", formula: "", outcome: "", kind: "damage" });
  }
  clearCombatEvents() {
    if (!this.#combatEvents.length) return;
    this.#combatEvents = [];
    this.#refreshEvents();
  }
  #eventStripHTML() {
    return `<div class="mc-event-strip"${this.#combatEvents.length ? "" : " hidden"}>${this.#eventChips()}</div>`;
  }
  #eventChips() {
    return this.#combatEvents.map((e, i) => `
      <span class="mc-event-chip mc-event-${e.kind} ${i === 0 ? "mc-latest" : ""}">${foundry.utils.escapeHTML(e.text)}</span>`).join("");
  }
  #refreshEvents() {
    const strip = this.element?.querySelector(".mc-event-strip");
    if (!strip) return;
    strip.innerHTML = this.#eventChips();
    strip.hidden = this.#combatEvents.length === 0;
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
    toast.classList.remove("nat20", "nat1", "mc-toast-damage", "mc-toast-save");
    if (entry.outcome) toast.classList.add(entry.outcome);
    if (entry.kind === "damage") toast.classList.add("mc-toast-damage");
    else if (entry.kind === "save") toast.classList.add("mc-toast-save");
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
    clearTimeout(this.#reactionTimer);
    this.#reactionPrompt = null;
    this.#toastEl = null;
    this.#recentRolls = [];
    this.#combatEvents = [];
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
  // V2 apps expose a raw DOM element; legacy V1 dialogs (some midi/dnd5e reaction &
  // config prompts still are) expose a jQuery wrapper — unwrap both, else a V1 prompt
  // stays hidden under the shell and the player never sees it (e.g. a reaction times
  // out unanswered). DM/Sqyre 2026-06-22.
  const el = app.element instanceof HTMLElement ? app.element : (app.element?.[0] ?? null);
  if (!(el instanceof HTMLElement)) return;
  // DM "Show Players" image: the mod mirrors it into its OWN full-screen overlay
  // (#sharedImage), so Foundry's native ImagePopout is a redundant SECOND popup stacked over
  // it on a phone (DM-reported two-over-each-other, 2026-06-26). If the overlay is already up
  // (the shareImage socket fired) just kill the native one; otherwise (a directly-opened
  // popout) route its image INTO the overlay first so the player still sees it. Then close it.
  if (app.constructor?.name === "ImagePopout") {
    if (!document.querySelector(".mc-imgpop-shared")) {
      try {
        const img = el.querySelector("img")?.getAttribute("src") || app.object;
        const title = app.options?.window?.title ?? app.title ?? "";
        if (img) shellInstance.showSharedImage(img, typeof title === "string" ? title : "");
      } catch (e) { /* best effort */ }
    }
    el.style.display = "none"; // hide instantly so the duplicate doesn't flash
    setTimeout(() => { try { app.close(); } catch (e) {} }, 0);
    return;
  }
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
  // (Journal close X is handled by the dedicated ensureJournalClose hook, which runs even
  // when this lift early-returns for a frameless reference journal — DM 2026-07-11.)
  // TyphonJS apps (Item Piles loot/merchant/trade) are draggable/resizable by their
  // header — on a phone that just knocks the pinned bottom-sheet out of place (DM
  // 2026-07-10: "I can drag the popup up and down"). `reactive.draggable/resizable`
  // are live property stores, so flipping them off here removes the drag behavior;
  // non-TJS dialogs have no `.reactive` and are skipped. The CSS also resets any
  // transform a prior drag left behind so the sheet snaps back to the bottom.
  try {
    if (app.reactive) { app.reactive.draggable = false; app.reactive.resizable = false; }
  } catch (e) { /* not a TJS app */ }
  const AppV2 = foundry.applications.api.ApplicationV2;
  AppV2._maxZ = Math.max(AppV2._maxZ + 1, SHELL_Z + 2);
  el.style.zIndex = String(AppV2._maxZ);
  // AppV2 re-applies its CACHED position.zIndex after render/position updates —
  // which silently dropped the dialog back to the backdrop's level (the z-TIE
  // behind "the popup itself is blurred", DM 2026-07-07). Write our z into the
  // position object too, so core re-applies OUR value instead of the stale one.
  try { if (app.position && "zIndex" in app.position) app.position.zIndex = AppV2._maxZ; } catch (e) { /* V1 app */ }
  // Step lock (playtest 2026-07-05): while ANY lifted dialog is open, a backdrop
  // blocks the shell underneath — players were tapping onward mid-advancement
  // ("the fact you can keep going after one opens is horrible").
  liftedApps.set(app.id ?? app.appId ?? app, { app, el });
  syncShellBackdrop();
  // Core may finish its own position pass a tick later — re-sync so the backdrop
  // re-reads the dialogs' SETTLED z values.
  setTimeout(syncShellBackdrop, 150);
}

// --- lifted-dialog step lock ------------------------------------------------
// Self-validating (DM 2026-07-07: the backdrop blurred the POPUP TOO and once
// leaked over the User Config, locking the client). The old version trusted a
// single "newest dialog z − 1" and a close-hook to clean up — a re-render that
// bumped z, or a close that never fired our hook, left the backdrop above the
// dialog or orphaned. Now: track {app, el}, PRUNE anything no longer rendered,
// and place the backdrop at (LOWEST live dialog z) − 1 so no dialog is ever
// behind it. Clicking the backdrop re-validates — a leaked one dies on tap.
const liftedApps = new Map();
function syncShellBackdrop() {
  for (const [key, v] of liftedApps) {
    const alive = v.el?.isConnected && v.app?.rendered !== false;
    if (!alive) liftedApps.delete(key);
  }
  const bdExisting = document.getElementById("mc-shell-backdrop");
  if (liftedApps.size === 0) { bdExisting?.remove(); return; }
  const zs = [...liftedApps.values()].map(v => Number(v.el?.style?.zIndex)).filter(Number.isFinite);
  const z = (zs.length ? Math.min(...zs) : SHELL_Z + 2) - 1;
  let bd = bdExisting;
  if (!bd) {
    bd = document.createElement("div");
    bd.id = "mc-shell-backdrop";
    bd.addEventListener("pointerdown", () => syncShellBackdrop()); // leaked? one tap clears it
    document.body.appendChild(bd);
  }
  bd.style.zIndex = String(z);
}
function releaseShellBackdrop(app) {
  liftedApps.delete(app?.id ?? app?.appId ?? app);
  syncShellBackdrop();
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
  // Keep framed dialogs/prompts above the full-screen shell — V2 AND legacy V1
  // (renderApplication) so no prompt (reactions, config) hides under the shell.
  Hooks.on("renderApplicationV2", liftDialogAboveShell);
  Hooks.on("renderApplication", liftDialogAboveShell);
  // Guaranteed close X for journal sheets on a phone (DM 2026-07-11): the SRD class/subclass
  // reference journal renders no visible close and traps the player. This runs on EVERY app
  // render (independent of liftDialogAboveShell, which early-returns for a frameless journal
  // before it could inject) — detects journals, self-styles the button, idempotent.
  const ensureJournalClose = (app) => {
    try {
      if (!document.body.classList.contains("mc-phone")) return;
      const el = app?.element instanceof HTMLElement ? app.element : app?.element?.[0];
      if (!(el instanceof HTMLElement)) return;
      const docName = app.document?.documentName ?? app.object?.documentName ?? "";
      const isJournal = /^JournalEntry/.test(docName) || /Journal/.test(app.constructor?.name ?? "")
        || el.classList.contains("journal-sheet") || el.classList.contains("journal-entry")
        || el.classList.contains("journal-entry-page") || !!el.querySelector(".journal-entry-content, .journal-sheet, .pages");
      if (!isJournal) return;
      if (el.querySelector(":scope > .mc-journal-close")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mc-journal-close";
      btn.setAttribute("aria-label", "Close");
      btn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      btn.addEventListener("click", (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        try { app.close(); } catch (e) { try { el.remove(); } catch (_) { /* gone */ } }
      });
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
      el.appendChild(btn);
    } catch (e) { /* best effort */ }
  };
  Hooks.on("renderApplicationV2", ensureJournalClose);
  Hooks.on("renderApplication", ensureJournalClose);
  // Merchant wallet: swap IP's held-only currency bar for our all-denomination counter
  // (dnd5e coin icons) on render, and refresh it when the buyer's currency changes.
  Hooks.on("renderApplication", (app) => {
    const el = app?.element instanceof HTMLElement ? app.element : app?.element?.[0];
    if (el?.classList?.contains?.("item-piles-merchant-sheet")) setTimeout(() => shellInstance?.injectMerchantWallet(el), 120);
  });
  Hooks.on("updateActor", (actor, changes) => {
    if (actor !== shellInstance?.actor || !foundry.utils.hasProperty(changes, "system.currency")) return;
    for (const m of document.querySelectorAll(".item-piles-merchant-sheet")) shellInstance.injectMerchantWallet(m);
  });
  // Party journal: re-render so a freshly-posted note shows up — for the poster AND
  // for everyone else watching the Journal tab live. Cheap + rare; harmless off-tab.
  Hooks.on("createJournalEntryPage", (page) => {
    if (page?.parent?.getFlag?.(MODULE_ID, "partyJournal")) shellInstance?.render();
  });
  // Keep the fullscreen button's label honest when the browser flips state
  // (its own gesture, Esc, the rotate-out-of-fullscreen Android quirk…).
  document.addEventListener("fullscreenchange", () => { if (shellInstance?.rendered) shellInstance.render(); });
  // Step lock teardown: drop the backdrop when the last lifted dialog closes
  // (V2 and legacy V1 apps both lift, so both close paths release).
  Hooks.on("closeApplicationV2", releaseShellBackdrop);
  Hooks.on("closeApplication", releaseShellBackdrop);
  // Wild Shape: the executor swaps the controlled token's actor (and back on revert) —
  // re-render so the phone follows into/out of the beast form. Gated to actor-identity
  // changes (not movement) on the token we control.
  Hooks.on("updateToken", (tok, changes = {}) => {
    if (!shellInstance?.rendered || tok.id !== shellInstance.originTokenId) return;
    if ("actorId" in changes || "delta" in changes || "actorData" in changes) shellInstance.render();
  });
  // Match the controlled actor by id, not object identity: a GM-initiated change
  // can hand us a different document instance (e.g. a synthetic/token actor) than
  // the one our getter returns, and a `===` check would silently drop the render
  // (DM-reported: items a DM added didn't appear until a full page reload).
  const controlsActor = (a) => {
    const mine = shellInstance?.actor;
    return !!mine && !!a && a.id === mine.id;
  };
  // Party Mode (DESIGN §15): the shared marching-order state lives on the GROUP
  // actor's flags. Re-render when a group this player belongs to changes, so the
  // 3×3 editor appears on pack, updates live as cells move, and closes on deploy.
  const inMyParty = (a) => a?.type === "group" &&
    (a.system?.members ?? []).some(m => m.actor?.testUserPermission?.(game.user, "OWNER"));
  Hooks.on("updateActor", (actor) => {
    if (!shellInstance?.rendered) return;
    if (inMyParty(actor)) shellInstance.maybeFollowRelease(actor);
    if (controlsActor(actor) || inMyParty(actor)) shellInstance.render();
  });
  // Combat feedback (DM 2026-07-11): surface incoming damage on the controlled PC as a
  // bottom event chip + transient popup. preUpdate still holds the pre-update HP; the delta
  // (incl. temp HP) is the damage. Skips the player's OWN HP edits (userId === self) so
  // tapping the HP editor doesn't read as damage. Runs on the phone (it owns the actor).
  const hpBefore = new Map();
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (!shellInstance || !foundry.utils.hasProperty(changes, "system.attributes.hp")) return;
    const h = actor.system?.attributes?.hp;
    hpBefore.set(actor.id, { hp: h?.value ?? 0, temp: h?.temp ?? 0 });
  });
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    const before = hpBefore.get(actor.id);
    if (before === undefined) return;
    hpBefore.delete(actor.id);
    if (!shellInstance?.rendered || userId === game.user.id) return; // my own edit ≠ incoming damage
    if (!controlsActor(actor)) return;
    const inCombat = !!game.combat?.started && game.combat.combatants.some(c => c.actor?.id === actor.id);
    if (!inCombat) return;
    const h = actor.system?.attributes?.hp;
    const dmg = (before.hp - (h?.value ?? 0)) + (before.temp - (h?.temp ?? 0));
    if (dmg <= 0) return; // healing / temp gain
    // Attacker = the current NPC combatant (their turn), when there is one.
    const c = game.combat?.combatant;
    const src = (c && c.actor && c.actor.id !== actor.id && c.actor.type !== "character") ? c.name : "";
    shellInstance.noteDamage(dmg, src);
  });
  Hooks.on("deleteCombat", () => shellInstance?.clearCombatEvents()); // combat over → clear the event chips
  // Pack deletes member tokens / creates the party token; deploy reverses it —
  // either way our subject changes, so rebind and repaint.
  const onPartyToken = (tok) => {
    if (shellInstance?.rendered &&
      (tok?.actor?.testUserPermission?.(game.user, "OWNER") || tok?.actor?.type === "group")) shellInstance.render();
  };
  Hooks.on("createToken", onPartyToken);
  Hooks.on("deleteToken", onPartyToken);
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
    // "Did I actually get it?" (playtest 2026-07-05: Item Piles purchases landed
    // silently — "לא נראה שזה קנה לך"). Any item arriving on the controlled actor
    // gets a visible confirmation, EXCEPT during char-gen (grants would spam a
    // dozen toasts). Covers shop buys, loot takes, and DM-given items alike.
    if (shellInstance?.rendered && controlsActor(item?.parent) && !item.parent.getFlag(MODULE_ID, "charGen")) {
      const qty = item.system?.quantity > 1 ? ` ×${item.system.quantity}` : "";
      ui.notifications.info(`${item.name}${qty} added to ${item.parent.name}'s inventory.`);
    }
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
  // Colour pick (task #18): the DM triggered a colour pick for THIS player → show
  // the full-screen picker overlay. Colour changes persist on the User doc (across
  // sessions), so a pick is a one-time thing the DM initiates from the Players tab.
  Hooks.on("mobile-command.colorPick", () => { if (shellInstance) { shellInstance.openColorPick(); } });
  Hooks.on("mobile-command.savePrompt", (payload) => shellInstance?.noteSavePrompt(payload));
  Hooks.on("mobile-command.reactionPrompt", (payload) => shellInstance?.noteReactionPrompt(payload));
  Hooks.on("mobile-command.rollRequest", (payload) => shellInstance?.noteRollRequest(payload));
  Hooks.on("mobile-command.aooPrompt", (payload) => shellInstance?.noteAoOPrompt(payload));
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
