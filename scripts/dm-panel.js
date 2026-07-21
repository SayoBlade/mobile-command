import { api, listPendingCasts, placeCast, dismissCast, partyDeployPreview, scribeResultToUser, presenceState } from "./rpc.js";
import { fireAoO } from "./aoo.js";
import { MODULE_ID } from "./preset.js";
import * as DT from "./downtime.js"; // §17.7 downtime v2 model/engine helpers
import { runPreflight, runPreflightFix, lastResults as preflightResults, lastRunAt as preflightRunAt, preflightFailCount } from "./preflight.js";
import { clockLabel, isNight, readClock, hasSimpleCalendar } from "./gametime.js";
import { runDmWizard } from "./dm-wizard.js";
import { isOverworldScene, isExecutor, gridFeetPerCell } from "./settings.js";

// DM-role panel (§11) — a small docked panel on the DM/executor client (GM,
// canvas present). It wakes for two jobs:
//   1. DM-assign: when the DM holds ≥1 target, hand them to a player's phone via
//      api.assignTargets (current combatant highlighted; DM targets clear after).
//   2. AoE push: when a phone announces an area spell, show a "Player — Spell"
//      row with a Place button that drops the template (placeCast) on this client.

let panelEl = null;

// Right-side tab dock (DM 2026-07-03, future-proofed for more tools). Icon-only
// tabs stick out the panel's right edge; a tab opens a same-height flyout box to
// its right (X or re-click closes). First tool = Rolls.
let dockTab = null;          // null | "rolls" | "party" | "tokens"
let dockWasPacked = false;   // auto-open the party tab on pack, close on disperse
let tokensPlayer = "";       // owned-tokens: which player's tokens are shown
let dmReactions = [];        // reaction widget: live chips {id, kind:"aoo"|"window", label, weapon, activityUuid?, targetUuid?, expiresAt}
const rollTool = { type: "save", ability: "dex", selected: null, targetsOpen: false };

// Candidate roll targets: packed-group members (grouped) ∪ player-owned character
// tokens on canvas (loose). Preselect the grouped ones if any, else all.
function rollTargets() {
  const out = new Map();
  for (const g of game.actors.filter(a => a.type === "group" && a.getFlag(MODULE_ID, "packed")))
    for (const m of (g.system?.members ?? [])) if (m.actor) out.set(m.actor.id, { actor: m.actor, grouped: true });
  for (const t of canvas.tokens?.placeables ?? []) {
    const a = t.actor;
    if (a?.type === "character" && a.hasPlayerOwner && !out.has(a.id)) out.set(a.id, { actor: a, grouped: false });
  }
  const arr = [...out.values()];
  const anyGrouped = arr.some(c => c.grouped);
  for (const c of arr) c.preselect = anyGrouped ? c.grouped : true;
  return arr;
}

// The token we measure distances FROM (DM 2026-07-11): the DM's selected token, else the
// active combatant's — so during an NPC's turn the player list shows range from the attacker.
function dmAnchorToken() {
  return canvas.tokens?.controlled?.[0] ?? game.combat?.combatant?.token?.object ?? null;
}
function tokenForActor(actor) {
  return canvas.tokens?.placeables.find(t => t.actor?.id === actor?.id) ?? null;
}
function gridDist(from, to) {
  try {
    if (!from || !to || from === to) return null;
    return canvas.grid.measurePath([from.center, to.center])?.distance ?? null;
  } catch (e) { return null; }
}
// The anchor token's longest attack range — max over its equipped weapons of (melee reach,
// ranged long/normal). A simple in-range hint for the DM's attack targeting (no LoS/cover).
// Null = the anchor has no weapons (→ show distance only). DM 2026-07-12.
function anchorRange(anchor) {
  const actor = anchor?.actor;
  if (!actor) return null;
  let max = 0;
  for (const it of actor.items ?? []) {
    if (it.type !== "weapon" || it.system?.equipped === false) continue; // NPCs often omit `equipped`
    const r = it.system?.range ?? {};
    const melee = Number(r.reach) || 5;
    const ranged = Number(r.long) || Number(r.value) || 0;
    max = Math.max(max, melee, ranged);
  }
  return max || null;
}

// The DM's own theme. The panel's palette lives on <body> (UI-BIBLE §11.1), so setting
// body.mc-theme-* on the GM client re-tints the whole widget — no shell needed. Stored under its
// OWN key so a GM who also carries a phone doesn't cross the two.
const DM_THEMES = [
  // Mirror of the shell's list — the swatch art (--mc-sw-ico) is global CSS, so it just works.
  ["tavern","Tavern","#c8a44d"],["gothic","Gothic","#a34049"],["frost","Frost","#8fd3f4"],
  ["flame","Flame","#f0a52e"],["tide","Tide","#45c4b0"],["artificer","Artificer","#c98b3c"],
  ["barbarian","Barbarian","#c8873f"],["bard","Bard","#d76ba8"],["cleric","Cleric","#e0d3a0"],
  ["druid","Druid","#6fbf73"],["fighter","Fighter","#93a3b8"],["monk","Monk","#52c2a5"],
  ["paladin","Paladin","#7f9fe0"],["ranger","Ranger","#9fbf5f"],["rogue","Rogue","#9b8fb5"],
  ["sorcerer","Sorcerer","#e2703a"],["warlock","Warlock","#9a5fd0"],["wizard","Wizard","#7f8fe0"],
];
function dmTheme() {
  return "artificer"; // DM themes removed for now (DM 2026-07-18) — the widget is fixed to Artificer.
}
function applyDmTheme() {
  // Only touch the body class on a client that has NO phone shell — otherwise the shell owns it and
  // we'd fight it every render. A GM desktop (the DM panel's home) has no shell, so this is safe.
  if (document.getElementById("mobile-command-shell")) return;
  const t = dmTheme();
  for (const c of [...document.body.classList]) if (c.startsWith("mc-theme-")) document.body.classList.remove(c);
  if (t && t !== "tavern") document.body.classList.add(`mc-theme-${t}`);
}
function settingsHTML() {
  const cur = dmTheme();
  const swatches = DM_THEMES.map(([id, label, sw]) =>
    `<button class="mc-theme-opt ${cur === id ? "mc-on" : ""}" data-dm-theme="${id}" data-theme="${id}" title="${label}" aria-label="${label}" aria-pressed="${cur === id}"><span class="mc-theme-sw" style="background-color:${sw}"></span></button>`).join("");
  return `<div class="mc-dmp-settings">
    <div class="mc-dmp-set-sec">Widget theme</div>
    <div class="mc-theme-row">${swatches}</div>
    <p class="mc-dmp-set-note">Themes your DM widget only — each player themes their own phone.</p>
  </div>`;
}

function tabRailHTML() {
  const tab = (id, icon, title, show = true, badge = 0) => show ? `<button class="mc-dmp-tab ${dockTab === id ? "mc-on" : ""}" data-dock="${id}" title="${title}" aria-label="${title}"><i class="fas ${icon}"></i>${badge ? `<span class="mc-dmp-tab-badge">${badge}</span>` : ""}</button>` : "";
  // When a flyout is open the rail rides its right edge (mc-open); else the panel's.
  return `<div class="mc-dmp-tabrail ${dockTab ? "mc-open" : ""}">
    ${tab("party", "fa-border-all", "Party order", !!packedGroup())}
    ${tab("rolls", "fa-dice-d20", "Request rolls", true, (game.user.targets?.size ?? 0) || 0)}
    ${tab("tokens", "fa-users", "Players")}
    ${tab("rest", "fa-campground", "Rest", true, (isResting() || downtimeOpen()) ? "•" : 0)}
    ${tab("travel", "fa-route", "Travel")}
    ${tab("preflight", "fa-clipboard-check", "System health", true, preflightFailCount())}
  </div>`;
}

let dtGearFor = null; // §17.7: actorId whose per-character gear panel is expanded (DM-local)
let dtAddFor = null; // actorId whose DM-side "add a task" inline form is open
let dtRuleFor = null; // id whose Rule-authoring form is open (an activity id, or a template id)
let dtRuleActor = null; // that activity's actorId (null when editing a template)
let dtRuleIsTemplate = false; // the open form is authoring a catalog template, not a PC's instance
let dtRuleDraft = null; // the working Rule being authored (see downtime.js)
let dtRuleVisible = false; // whether Activate will show the Rule to the player (instances only)
let dtRuleNote = ""; // the template's DM-only note being authored
let dtNewTmplOpen = false; // the catalog "+ New activity" name field is open
let dtGiveFor = null; // actorId whose "give a task" template picker is open
// §19 Rest: the pre-start setup draft (DM-local — nothing persists until Start Rest). The rest TYPE
// is one of short / long / downtime (DM 2026-07-17: "Short and Long sound like the rests they are;
// Downtime is its own thing"). Short → short rest; Long & Downtime → long rest; Downtime also runs
// the activity phase. Watches is an independent add-on. Defaults to a long rest with watches.
let restDraft = { type: "long", watches: true };
// Watches per rest type (DM 2026-07-17): a short rest is ONE watch; a long rest up to three;
// downtime is a safe hub — no watches at all.
function watchCount(size) { return size === "short" ? 1 : 3; }
function restPlan(d) {
  const size = d.type === "short" ? "short" : "long";
  const downtime = d.type === "downtime";
  return { size, downtime, watches: downtime ? false : !!d.watches }; // DT never stands watch
}
function downtimeState() { try { return DT.normalizeState(game.settings.get(MODULE_ID, "downtimeState")); } catch (e) { return DT.normalizeState({}); } }
function downtimeOpen() { return !!downtimeState().window?.open; }

// Downtime tab (§17.7 redesign): the DM calls downtime (short = a slice, long = a day+); each PC
// picks or names an Activity on their phone, the DM attaches a Rule and pushes rolls as the scene
// reaches them. This slice: window control, the per-PC list (in-scene characters only), the
// per-character gear settings, and a read view of each PC's Activities. The Rule-authoring form,
// push-rolls, and per-Activity edits arrive with the player create-flow in the next slice.
function dtProgressBar(act) {
  if (!act.rule || !act.progress) return "";
  const s = DT.progressSummary(act.rule, act.progress);
  const bar = s.ratio != null
    ? `<div class="mc-dt-bar"><span style="width:${Math.round(s.ratio * 100)}%"></span></div>` : "";
  return `<div class="mc-dt-prog"><span class="mc-dt-prog-head">${foundry.utils.escapeHTML(s.headline)}</span>${bar}</div>`;
}
// The player colour for a PC (their user's colour), for tinting the roster — falls back to gold.
function pcColor(a) {
  const u = game.users.find(u => !u.isGM && u.character?.id === a?.id) ?? game.users.find(u => !u.isGM && a?.testUserPermission?.(u, "OWNER"));
  return u?.color?.css ?? "#c8a44d";
}
// Collapsible "drawer" so the tall downtime window can be tidied (DM 2026-07-14: "drawers like a
// multi-open accordion"). Multi-open — each section toggles independently. `headerExtra` (e.g. the
// catalog's "+ New") sits beside the toggle and is NOT part of the toggle button.
let dtDrawers = { roster: true, catalog: true };
function dtDrawer(key, title, headerExtra, body) {
  const open = dtDrawers[key] !== false;
  // Title left, chevron right (DM 2026-07-16) — a leading chevron read as centred/odd.
  return `<div class="mc-dt-drawer ${open ? "mc-open" : ""}">
    <div class="mc-dt-drawer-head">
      <button class="mc-dt-drawer-toggle" data-dt-drawer="${key}"><span>${title}</span><i class="fas fa-chevron-${open ? "down" : "right"}"></i></button>
      ${headerExtra || ""}
    </div>
    ${open ? `<div class="mc-dt-drawer-body">${body}</div>` : ""}
  </div>`;
}
function catalogNewBtn() {
  return `<button class="mc-dt-newbtn ${dtNewTmplOpen ? "mc-on" : ""}" data-dt-tmpl-new><i class="fas fa-plus"></i> New</button>`;
}
// The DM-authored catalog: named activities + rules + DM-only notes. Players pick from these.
function catalogHTML(st) {
  const esc = foundry.utils.escapeHTML;
  const templates = DT.listTemplates(st);
  const rows = templates.map(t => {
    const editing = dtRuleIsTemplate && dtRuleFor === t.id;
    const hasRule = !!t.rule;
    let body;
    if (editing) body = ruleFormHTML(null, t);
    else if (hasRule) body = `<div class="mc-dt-act-rule">${esc(DT.describeRule(t.rule))}</div>
      ${t.note ? `<div class="mc-dt-note"><i class="fas fa-note-sticky"></i> ${esc(t.note)}</div>` : ""}
      <div class="mc-dt-act-editrow"><button class="mc-dt-act-edit" data-dt-tmpl-edit="${t.id}"><i class="fas fa-pen"></i> Edit</button></div>`;
    else body = `<button class="mc-dt-setrule" data-dt-tmpl-edit="${t.id}"><i class="fas fa-wand-magic-sparkles"></i> Set Rule</button>`;
    // Offered ↔ shelved (DM 2026-07-18): shelved activities stay authored but leave
    // the players' pickers; Give Task still lists them (a DM hand-out overrides).
    const offered = DT.isOffered(t);
    return `<div class="mc-dt-tmpl ${!hasRule ? "mc-norule" : ""} ${offered ? "" : "mc-shelved"}">
      <div class="mc-dt-act-top">
        <span class="mc-dt-act-name">${esc(t.name)}</span>
        <button class="mc-dt-act-offer ${offered ? "mc-on" : ""}" data-dt-tmpl-offer="${t.id}" data-on="${offered ? "0" : "1"}"
          title="${offered ? "On offer — players can pick this; tap to shelve it for now" : "Shelved — players don't see this; tap to offer it"}">
          <i class="fas ${offered ? "fa-square-check" : "fa-square"}"></i></button>
        <button class="mc-dt-act-rm" data-dt-tmpl-rm="${t.id}" title="Delete this activity">✕</button>
      </div>
      ${body}
    </div>`;
  }).join("");
  const adder = dtNewTmplOpen
    ? `<div class="mc-dt-tmplform">
        <input class="mc-dt-tmplname" type="text" placeholder="Activity name — e.g. Learning a Sword" maxlength="80">
        <div class="mc-dt-addbtns"><button class="mc-dt-add-cancel" data-dt-tmpl-cancel>Cancel</button><button class="mc-dt-add-save" data-dt-tmpl-save>Add</button></div>
      </div>`
    : "";
  const seed = !templates.length && !dtNewTmplOpen ? `<button class="mc-dt-seedbtn" data-dt-seed><i class="fas fa-wand-sparkles"></i> Add a few examples</button>` : "";
  return `${adder}${rows}${seed}`; // body only — the "Activities" header + "New" live in the drawer
}
// `embedded` = rendered inside the Rest envelope (§19): the Rest owns opening/closing the window and
// the single end-of-rest, so its own setup head and party-rest row are suppressed to avoid two
// entries and two endings.
function downtimeHTML(embedded = false) {
  const esc = foundry.utils.escapeHTML;
  const st = downtimeState();
  const win = st.window;
  const head = embedded ? "" : (win?.open
    ? `<div class="mc-dt-openhead"><button class="mc-dt-close-btn" data-dt-end title="Close the downtime window — this does NOT advance time"><i class="fas fa-xmark"></i> Close</button></div>`
    : `<div class="mc-dt-setup">
        <div class="mc-dt-sizes">
          <button class="mc-dt-openbtn" data-dt-open="short"><i class="fas fa-hourglass-half"></i> Short DT</button>
          <button class="mc-dt-openbtn" data-dt-open="long"><i class="fas fa-hourglass-start"></i> Long DT</button>
        </div>
        <p class="mc-dt-sizehint">Short — a watch or an evening<br>Long — a day or more in a hub</p></div>`);

  // The roster. Embedded in a Rest → the REST'S PARTY (group members): a resting party is usually
  // camped OFF the active scene, so the in-scene filter would hide everyone and their picks would
  // never register (DM 2026-07-17: "chose an activity as a PC and still got 'nobody has chosen'").
  // Standalone (legacy) → only characters IN the scene (DM 2026-07-13: "hide out-of-scene PCs").
  const players = (embedded
    ? nightMembers(restGroup()).filter(a => a.hasPlayerOwner)
    : game.actors.filter(a => a.type === "character" && a.hasPlayerOwner && inSceneActorIds().has(a.id)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const started = DT.isStarted(st);
  const rows = players.map((a) => {
    const act = DT.selectedActivity(st, a.id); // ONE activity per PC per downtime
    const gear = DT.getActorSettings(st, a.id);
    let actsHTML;
    if (!act) {
      actsHTML = `<div class="mc-dt-empty">${win?.open ? `Hasn't chosen yet…` : "Nothing selected."}</div>`;
    } else {
      const editing = dtRuleFor === act.id && !dtRuleIsTemplate;
      const hasRule = !!act.rule;
      const live = hasRule && act.status !== "complete";
      // ± stays available even once COMPLETE so a tick that finished it too early can be undone
      // (DM 2026-07-16: "if the DM clicks + let them hit − to un-complete").
      const adj = hasRule
        ? `<div class="mc-dt-adj">
            <button data-dt-adjust="-1" data-actor="${a.id}" data-id="${act.id}" title="${act.status === "complete" ? "Undo — reopen this activity" : "Set back"}">−</button>
            <button data-dt-adjust="1" data-actor="${a.id}" data-id="${act.id}" title="Nudge forward">+</button>
          </div>` : "";
      // Rolls only once you've started activities: push one (roll rules) or tick it (no-roll).
      const push = live && started
        ? (DT.needsRoll(act.rule)
          ? `<button class="mc-dt-push ${act.pending ? "mc-waiting" : ""}" data-dt-push="${act.id}" data-actor="${a.id}" data-on="${act.pending ? "0" : "1"}"><i class="fas fa-dice-d20"></i> ${act.pending ? "Waiting…" : "Push"}</button>`
          : `<button class="mc-dt-push" data-dt-tick="${act.id}" data-actor="${a.id}"><i class="fas fa-plus"></i> Tick +${Number(act.rule.perTick) || 1}</button>`)
        : "";
      // Cost: both sides see it; only the DM is told when the PC can't cover it. Nothing is deducted.
      const cc = hasRule ? DT.costCheck(act.rule, a.system?.currency) : null;
      const costHTML = cc
        ? `<div class="mc-dt-cost ${cc.canAfford ? "" : "mc-short"}"><i class="fas fa-coins"></i> ${esc(cc.costText)}${cc.canAfford ? "" : ` — ${esc(a.name)} is missing ${esc(cc.shortText)}`}</div>`
        : "";
      let bodyHTML;
      if (editing) bodyHTML = ruleFormHTML(a.id, act);
      else if (hasRule) bodyHTML = `
        <div class="mc-dt-act-rule">${esc(DT.describeRule(act.rule))}${act.visible ? ' <i class="fas fa-eye mc-dt-eye" title="The player can see this rule"></i>' : ""}</div>
        ${costHTML}
        <div class="mc-dt-act-progline">${dtProgressBar(act)}</div>
        <div class="mc-dt-act-ctl">${push}${adj}<button class="mc-dt-act-edit mc-dt-icon-only" data-dt-editrule="${act.id}" data-actor="${a.id}" title="Edit the rule"><i class="fas fa-pen"></i></button></div>`;
      else bodyHTML = `<button class="mc-dt-setrule" data-dt-editrule="${act.id}" data-actor="${a.id}"><i class="fas fa-wand-magic-sparkles"></i> Set Rule</button>`;
      // NB: never use the bare "mc-hidden"/"mc-shown" names here — ".mc-hidden" is the shell's
      // search-filter utility (display:none !important), which silently hid EVERY activity card on
      // the DM panel, since visible:false is the default (DM 2026-07-14: "nothing to do").
      actsHTML = `<div class="mc-dt-act ${act.status === "complete" ? "mc-done" : ""} ${act.visible ? "mc-dt-shown" : "mc-dt-veiled"} ${!hasRule ? "mc-norule" : ""}">
        <div class="mc-dt-act-top"><span class="mc-dt-act-name">${esc(act.name)}</span></div>
        ${act.note ? `<div class="mc-dt-note"><i class="fas fa-note-sticky"></i> ${esc(act.note)}</div>` : ""}
        ${bodyHTML}
      </div>`;
    }
    const gearOpen = dtGearFor === a.id;
    const gearHTML = gearOpen ? `<div class="mc-dt-gearpanel">
        <div class="mc-dt-gearrow"><span>Extra activities per beat</span>
          <span class="mc-dt-step-grp">
            <button class="mc-dt-step" data-dt-gear="bonus" data-actor="${a.id}" data-delta="-1">−</button>
            <span class="mc-dt-dayn">+${gear.bonusActivities}</span>
            <button class="mc-dt-step" data-dt-gear="bonus" data-actor="${a.id}" data-delta="1">+</button>
          </span></div>
        <div class="mc-dt-gearrow"><span>Show rules to this player by default</span>
          <button class="mc-dt-toggle ${gear.showMechanicsByDefault ? "mc-on" : ""}" data-dt-gear="crunch" data-actor="${a.id}">${gear.showMechanicsByDefault ? "On" : "Off"}</button></div>
        <p class="mc-dt-gearhint">For a character who barely sleeps (a race trait or an undocumented ability), let them run more than one activity a night.</p>
      </div>` : "";
    // The DM can hand a PC a task straight from the catalog (no need to wait for the player).
    const giving = dtGiveFor === a.id;
    const giveList = giving
      ? (DT.listTemplates(st).map(t => `<button class="mc-dt-givepick" data-dt-give-pick="${t.id}" data-actor="${a.id}">${esc(t.name)}</button>`).join("")
        || `<div class="mc-dt-empty">No activities yet — add one under “Activities” above.</div>`)
      : "";
    const adder = giving
      ? `<div class="mc-dt-givebox"><div class="mc-dt-give-head">Give a task to ${esc(a.name)}:</div>${giveList}
          <button class="mc-dt-add-cancel" data-dt-give="${a.id}">Close</button></div>`
      : `<button class="mc-dt-addtask" data-dt-give="${a.id}"><i class="fas fa-hand-holding-hand"></i> Give Task</button>`;
    const color = pcColor(a);
    // Name stays INK; only the token icon + the card's rail carry the player colour — matching the
    // Request-rolls list, since some player colours are unreadable on this background (DM 2026-07-16).
    return `<div class="mc-dt-player mc-here" style="border-left-color:${color}">
      <div class="mc-dt-player-head">
        <i class="fas fa-circle-user mc-dt-usericon" style="color:${color}"></i>
        <span class="mc-dt-name">${esc(a.name)}</span>
        <button class="mc-dt-gearbtn ${gearOpen ? "mc-on" : ""}" data-dt-geartoggle="${a.id}" title="Per-character settings"><i class="fas fa-gear"></i></button>
      </div>
      ${gearHTML}
      ${actsHTML}
      ${started ? "" : adder}
    </div>`;
  }).join("") || `<div class="mc-dmp-empty">No player characters in the scene.</div>`;

  // Party-rest utility. Labelled + tucked below the roster so its Short/Long doesn't read as
  // paired with the downtime duration above (DM 2026-07-13: "short activity goes with short rest").
  const restRow = (win?.open && !embedded) ? `<div class="mc-dt-restgroup">
    <span class="mc-dt-restlabel">Rest the whole party</span>
    <div class="mc-dt-restrow">
      <button class="mc-dt-rest" data-dt-rest="short"><i class="fas fa-mug-hot"></i> Short</button>
      <button class="mc-dt-rest" data-dt-rest="long"><i class="fas fa-campground"></i> Long</button>
    </div>
  </div>` : "";
  // The DM commits, not the players: everyone's choice lands here live, you talk it over, then you
  // Start — which pushes the first rolls (DM 2026-07-14: "DM locks in… players get the prompts").
  const anySel = players.some(a => DT.selectedActivityId(st, a.id));
  const startBar = win?.open
    ? (started
      ? `<div class="mc-dt-startbar"><span><i class="fas fa-play"></i> Activities under way</span>
          <button class="mc-dt-reopen" data-dt-start="0" title="Let players change their pick again">Reopen choices</button></div>`
      : `<button class="mc-dt-startbtn" data-dt-start="1" ${anySel ? "" : "disabled"} title="${anySel ? "Lock in the picks and push the first rolls" : "Waiting — nobody's chosen an activity yet"}">
          <i class="fas fa-play"></i> Start Activities</button>`)
    : "";
  // Two accordion drawers: the live roster on top, the authoring catalog below.
  const rosterDrawer = win?.open ? dtDrawer("roster", "Who's doing what", "", `<div class="mc-dt-players">${rows}</div>${startBar}`) : "";
  const catalogDrawer = dtDrawer("catalog", "Activities", catalogNewBtn(), catalogHTML(st));
  return `<div class="mc-dt-panel">${head}${rosterDrawer}${catalogDrawer}${restRow}</div>`;
}

// Rest every player character at once (the DM's montage rest). Dialog-suppressed so it doesn't
// pop a rest dialog per PC on the DM client; a long rest fully restores, a short rest recovers
// short-rest resources.
// Actor ids with a token on the currently-viewed scene (the "in the scene" party).
function inSceneActorIds() {
  return new Set((canvas?.tokens?.placeables ?? []).map(t => t.actor?.id).filter(Boolean));
}
async function restParty(kind) {
  const here = inSceneActorIds();
  const pcs = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner && here.has(a.id));
  let n = 0;
  for (const a of pcs) {
    try { await (kind === "long" ? a.longRest({ dialog: false }) : a.shortRest({ dialog: false })); n++; }
    catch (e) { console.warn(`${MODULE_ID} | party rest failed for ${a.name}`, e); }
  }
  const advanced = kind === "long" ? await advanceRestGoals(new Set(pcs.map(a => a.id))) : 0;
  ui.notifications?.info(`${kind === "long" ? "Long" : "Short"} rest — ${n} character${n === 1 ? "" : "s"} rested${advanced ? `, ${advanced} nightly goal${advanced === 1 ? "" : "s"} advanced` : ""}.`);
}

// Long-rest reminder woven into the montage: a long rest advances every "per rest" downtime
// goal at once (a no-roll tally like nightly pushups ticks; a roll-gated one gets pushed to the
// player). One read-modify-write over the shared state. Runs on the executor (a GM).
async function advanceRestGoals(restedIds = null) {
  let state = DT.normalizeState(game.settings.get(MODULE_ID, "downtimeState"));
  // The actors that actually rested. MUST be passed by the §19 Rest flow: it rests the GROUP
  // (camped off the active scene), so the old inSceneActorIds() default advanced nobody — a proper
  // rest silently never ticked "per rest" goals like Nightly pushups (bug, DM 2026-07-22). The
  // legacy in-scene montage falls back to the scene set.
  const here = restedIds ?? inSceneActorIds();
  let touched = 0;
  for (const [actorId, acts] of Object.entries(state.activities)) {
    if (!here.has(actorId)) continue; // only the party that actually rested
    for (const act of acts) {
      if (act.status === "complete" || !act.rule || act.rule.tickSource !== "rest") continue;
      state = DT.needsRoll(act.rule) ? DT.setPending(state, actorId, act.id, true) : DT.applyAttemptTo(state, actorId, act.id, null);
      touched++;
    }
  }
  if (touched) await game.settings.set(MODULE_ID, "downtimeState", state);
  return touched;
}

// ── §17.7 Rule authoring form (the DM builds the "formula") ──────────────────
function abilLabel(k) { return CONFIG.DND5E?.abilities?.[k]?.label || String(k || "").toUpperCase(); }
function skillLabel(k) { return CONFIG.DND5E?.skills?.[k]?.label || String(k || "").toUpperCase(); }
function abilityOptions(sel) {
  return Object.keys(CONFIG.DND5E?.abilities ?? {}).map(k => `<option value="${k}" ${k === sel ? "selected" : ""}>${foundry.utils.escapeHTML(abilLabel(k))}</option>`).join("");
}
function skillOptions(sel) {
  return Object.keys(CONFIG.DND5E?.skills ?? {}).map(k => `<option value="${k}" ${k === sel ? "selected" : ""}>${foundry.utils.escapeHTML(skillLabel(k))}</option>`).join("");
}
function tickOptions(sel) {
  return [["attempt", "each attempt"], ["day", "day"], ["rest", "long rest"], ["slice", "short slice"]]
    .map(([k, l]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${l}</option>`).join("");
}
function optList(pairs, sel) { return pairs.map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${l}</option>`).join(""); }
// Scribe picker: the PC's actual spells, low level first (the source a scroll is scribed from).
function actorSpellOptions(actor, sel) {
  let spells = [];
  try { spells = (actor?.items ?? []).filter(i => i.type === "spell").sort((a, b) => (a.system?.level ?? 0) - (b.system?.level ?? 0) || a.name.localeCompare(b.name)); } catch (e) { /* */ }
  const opts = spells.map(s => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${foundry.utils.escapeHTML(s.name)} (${(s.system?.level ?? 0) === 0 ? "cantrip" : "lvl " + s.system.level})</option>`).join("");
  return `<option value="">— pick a spell —</option>${opts}`;
}
// Craft picker: the PC's tool proficiencies, highest check bonus first (DM 2026-07-13).
function toolLabel(key) {
  try { return CONFIG.DND5E?.tools?.[key]?.label || globalThis.dnd5e?.documents?.Trait?.keyLabel?.(key, { trait: "tool" }) || key; }
  catch (e) { return key; }
}
function toolBonus(actor, t) {
  try {
    if (Number.isFinite(t?.total)) return Math.round(t.total);
    const pb = actor.system?.attributes?.prof ?? 0;
    const mult = t?.value ?? t?.prof?.multiplier ?? 0;
    const mod = actor.system?.abilities?.[t?.ability]?.mod ?? 0;
    return Math.round(mult * pb + mod);
  } catch (e) { return 0; }
}
function actorToolOptions(actor, sel) {
  let entries = [];
  try { entries = Object.entries(actor?.system?.tools ?? {}).map(([k, t]) => ({ key: k, bonus: toolBonus(actor, t), label: toolLabel(k) })).sort((a, b) => b.bonus - a.bonus || a.label.localeCompare(b.label)); } catch (e) { /* */ }
  const opts = entries.map(e => `<option value="${e.key}" ${e.key === sel ? "selected" : ""}>${foundry.utils.escapeHTML(e.label)}${e.bonus ? ` (+${e.bonus})` : ""}</option>`).join("");
  return entries.length ? `<option value="">— pick a tool —</option>${opts}` : `<option value="">— no tool proficiencies —</option>`;
}
function rollSpec(o) { return { ability: null, skill: null, save: null, tool: null, formula: null, label: null, ...o }; }
function rollKindOf(roll) {
  if (!roll) return "ability";
  if (roll.formula) return "custom";
  if (roll.save) return "save";
  if (roll.skill) return "skill";
  return "ability";
}
function rollFlavorEmpty(roll) { return !roll || (!roll.ability && !roll.skill && !roll.save && !roll.formula); }
// A roll-needing Rule with no flavour set yet (fresh default, or carried over from a no-roll tally)
// gets a sensible default so the picker + describeRule aren't blank.
function seedRollIfNeeded() { if (dtRuleDraft && DT.needsRoll(dtRuleDraft) && rollFlavorEmpty(dtRuleDraft.roll)) setRollKind("ability"); }
// Reset the draft's roll spec to a fresh flavour of the chosen kind (with a UI-resolved label).
function setRollKind(kind) {
  const r = dtRuleDraft; if (!r) return;
  if (kind === "save") r.roll = rollSpec({ save: "con", label: abilLabel("con") });
  else if (kind === "skill") r.roll = rollSpec({ skill: "acr", label: skillLabel("acr") });
  else if (kind === "custom") r.roll = rollSpec({ formula: "1d20" });
  else r.roll = rollSpec({ ability: "dex", label: abilLabel("dex") });
}

function ruleFormHTML(actorId, act) {
  const esc = foundry.utils.escapeHTML;
  const r = dtRuleDraft || DT.defaultRule();
  const kind = rollKindOf(r.roll);
  const actor = game.actors.get(actorId);
  // Scribe/craft draw from the sheet: pick a real spell (auto-fills days/gp) or a real tool.
  let seeder = "";
  if (r.kind === "scribe") {
    let note = "";
    try { const sp = r._spellId && actor?.items?.get(r._spellId); if (sp) { const sug = DT.scribeScrollSuggest(sp.system?.level ?? 0); note = `<div class="mc-rf-note">≈ ${sug.days} day${sug.days === 1 ? "" : "s"} · ${sug.gp} gp materials (your call whether to charge it)</div>`; } } catch (e) { /* */ }
    seeder = `<label class="mc-rf-row">Spell <select data-rule="scribespell">${actorSpellOptions(actor, r._spellId)}</select></label>${note}`;
  } else if (r.kind === "craft") {
    seeder = `<label class="mc-rf-row">Tool <select data-rule="crafttool">${actorToolOptions(actor, r.roll?.tool)}</select></label>`;
  } else if (r.kind === "learn") {
    // A template is generic, so the DM picks the SCROLL'S LEVEL — time/gp scale off it (PHB).
    const lvl = Number(r._level) || 1;
    const s = DT.learnSpellSuggest(lvl);
    seeder = `<label class="mc-rf-row">Spell level <select data-rule="learnlevel">${optList([1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [String(n), `level ${n}`]), String(lvl))}</select></label>
      <div class="mc-rf-note">≈ ${s.hours} hour${s.hours === 1 ? "" : "s"} · ${s.gp} gp · the scroll is consumed</div>`;
  }
  const needsRoll = r.type === "roll" || (r.type === "cumulative" && r.gainMode !== "fixed") || (r.type === "tally" && r.requireRoll);
  const rollPicker = needsRoll ? `
    <label class="mc-rf-row">Roll <select data-rule="rollkind">
      <option value="ability" ${kind === "ability" ? "selected" : ""}>Ability check</option>
      <option value="save" ${kind === "save" ? "selected" : ""}>Saving throw</option>
      <option value="skill" ${kind === "skill" ? "selected" : ""}>Skill</option>
      <option value="custom" ${kind === "custom" ? "selected" : ""}>Custom dice</option>
    </select></label>
    ${kind === "ability" ? `<label class="mc-rf-row">Ability <select data-rule="rollability">${abilityOptions(r.roll?.ability || "dex")}</select></label>` : ""}
    ${kind === "save" ? `<label class="mc-rf-row">Save <select data-rule="rollability">${abilityOptions(r.roll?.save || "con")}</select></label>` : ""}
    ${kind === "skill" ? `<label class="mc-rf-row">Skill <select data-rule="rollskill">${skillOptions(r.roll?.skill || "acr")}</select></label>` : ""}
    ${kind === "custom" ? `<label class="mc-rf-row">Dice <input type="text" data-rule="rollformula" value="${esc(r.roll?.formula || "1d20")}" placeholder="1d20+5"></label>` : ""}` : "";

  // PROGRESS group — how a tally/cumulative fills toward its target. (A "just a roll" has none.)
  let progress = "";
  if (r.type === "tally") progress = `
    <div class="mc-rf-2up">
      <label class="mc-rf-row">Target <input type="number" data-rule="target" value="${r.target}"></label>
      <label class="mc-rf-row">Adds <input type="number" data-rule="pertick" value="${r.perTick}"></label>
    </div>
    <label class="mc-rf-row">Each <select data-rule="tick">${tickOptions(r.tickSource)}</select></label>
    <button class="mc-rf-toggle ${r.requireRoll ? "mc-on" : ""}" data-rule-toggle="requireroll">${r.requireRoll ? "Needs a successful roll" : "No roll — just ticks"}</button>`;
  else if (r.type === "cumulative") progress = `
    <label class="mc-rf-row">Target <input type="number" data-rule="target" value="${r.target}"></label>
    <div class="mc-rf-2up">
      <label class="mc-rf-row">Each adds <select data-rule="gainmode">
        <option value="total" ${r.gainMode === "total" ? "selected" : ""}>the roll total</option>
        <option value="margin" ${r.gainMode === "margin" ? "selected" : ""}>the margin over DC</option>
        <option value="fixed" ${r.gainMode === "fixed" ? "selected" : ""}>a fixed amount</option>
      </select></label>
      <label class="mc-rf-row">Min <input type="number" data-rule="mingain" value="${r.minGain}"></label>
    </div>
    ${r.gainMode === "fixed" ? `<label class="mc-rf-row">Amount <input type="number" data-rule="pertick" value="${r.perTick}"></label>` : ""}`;

  // The roll-target fields sit WITH the roll: a "just a roll" gets DC + descending options; a
  // margin/roll-gated rule just needs its DC.
  let rollDC = "";
  if (r.type === "roll") rollDC = `
    <div class="mc-rf-2up">
      <label class="mc-rf-row">DC <input type="number" data-rule="dc" value="${r.dc}"></label>
      <label class="mc-rf-row" title="Negative lowers the DC each attempt, e.g. -2">−DC / miss <input type="number" data-rule="autoshift" value="${r.autoShift}"></label>
    </div>
    ${Number(r.autoShift) ? `<label class="mc-rf-row">Stop at DC <input type="number" data-rule="floor" value="${r.autoShiftFloor ?? ""}" placeholder="none"></label>` : ""}`;
  else if (r.gainMode === "margin" || r.requireRoll) rollDC = `<label class="mc-rf-row">DC <input type="number" data-rule="dc" value="${r.dc}"></label>`;

  // Per-rule nat-20 / nat-1 choice — only when the Rule rolls (options differ by type).
  const n20opts = r.type === "roll"
    ? [["none", "—"], ["succeed", "auto-succeed"], ["double", "double the DC step"]]
    : [["none", "—"], ["double", "double the gain"]];
  const n1opts = r.type === "roll"
    ? [["none", "—"], ["fail", "auto-miss"], ["zero", "no DC step"]]
    : [["none", "—"], ["zero", "no gain"]];
  const luck = needsRoll ? `<div class="mc-rf-2up">
    <label class="mc-rf-row">Nat 20 <select data-rule="nat20">${optList(n20opts, r.nat20 ?? "none")}</select></label>
    <label class="mc-rf-row">Nat 1 <select data-rule="nat1">${optList(n1opts, r.nat1 ?? "none")}</select></label></div>` : "";

  const progressSec = progress ? `<div class="mc-rf-sec"><div class="mc-rf-seclabel">Progress</div>${progress}</div>` : "";
  const rollSec = needsRoll ? `<div class="mc-rf-sec"><div class="mc-rf-seclabel">The roll</div>${rollPicker}${rollDC}${luck}</div>` : "";

  return `<div class="mc-rf">
    <div class="mc-rf-presets"><span>Preset</span>
      <button class="mc-rf-preset ${r.kind === "freestyle" ? "mc-on" : ""}" data-rule-preset="freestyle">Freestyle</button>
      <button class="mc-rf-preset ${r.kind === "scribe" ? "mc-on" : ""}" data-rule-preset="scribe">Scribe</button>
      <button class="mc-rf-preset ${r.kind === "craft" ? "mc-on" : ""}" data-rule-preset="craft">Craft</button>
      <button class="mc-rf-preset ${r.kind === "learn" ? "mc-on" : ""}" data-rule-preset="learn">Learn</button>
    </div>
    <label class="mc-rf-row mc-rf-kind">This is <select data-rule="type">
      <option value="roll" ${r.type === "roll" ? "selected" : ""}>a single roll</option>
      <option value="tally" ${r.type === "tally" ? "selected" : ""}>a tally to a target</option>
      <option value="cumulative" ${r.type === "cumulative" ? "selected" : ""}>cumulative points</option>
    </select></label>
    ${seeder}
    ${progressSec}
    ${rollSec}
    <div class="mc-rf-sec">
      <label class="mc-rf-row">Reward <input type="text" data-rule="reward" value="${esc(r.reward || "")}" placeholder="e.g. +1 STR, Scroll of Fireball"></label>
      <label class="mc-rf-row" title="Both you and the player see this; you're warned if they can't cover it. Nothing is deducted automatically.">Cost (gp) <input type="number" data-rule="cost" value="${Number(r.cost) || 0}" min="0"></label>
      ${dtRuleIsTemplate
        ? `<label class="mc-rf-notewrap">DM-only note<textarea class="mc-rf-notebox" data-rule="note" placeholder="Private — balancing, gold/time, reminders (players never see this)">${esc(dtRuleNote)}</textarea></label>`
        : `<button class="mc-rf-toggle ${dtRuleVisible ? "mc-on" : ""}" data-rule-toggle="visible">${dtRuleVisible ? "Player sees the rule" : "Rule hidden from the player"}</button>`}
    </div>
    <div class="mc-rf-preview"><i class="fas fa-flask"></i> ${esc(DT.describeRule(r))}</div>
    <div class="mc-rf-actions">
      <button class="mc-rf-cancel" data-rule-cancel>Cancel</button>
      <button class="mc-rf-activate" data-rule-activate>${dtRuleIsTemplate ? "Save" : "Activate"}</button>
    </div>
  </div>`;
}

// Apply one authoring-form field into the working draft. Only layout-changing selects re-render
// (text/number inputs update silently on blur so a following Activate click isn't swallowed).
function applyRuleField(field, value) {
  const r = dtRuleDraft; if (!r) return;
  let reRender = false;
  switch (field) {
    case "type": { const nr = DT.defaultRule(value, r.kind); nr.reward = r.reward; nr.roll = r.roll; dtRuleDraft = nr; seedRollIfNeeded(); reRender = true; break; }
    case "rollkind": setRollKind(value); reRender = true; break;
    case "rollability": r.roll = rollKindOf(r.roll) === "save" ? rollSpec({ save: value, label: abilLabel(value) }) : rollSpec({ ability: value, label: abilLabel(value) }); break;
    case "rollskill": r.roll = rollSpec({ skill: value, label: skillLabel(value) }); break;
    case "rollformula": r.roll = rollSpec({ formula: value }); break;
    case "dc": r.dc = Number(value) || 0; break;
    case "autoshift": r.autoShift = Number(value) || 0; break;
    case "floor": r.autoShiftFloor = value === "" ? null : Number(value); break;
    case "target": r.target = Number(value) || 0; break;
    case "tick": r.tickSource = value; break;
    case "pertick": r.perTick = Number(value) || 0; break;
    case "mingain": r.minGain = Number(value) || 0; break;
    case "gainmode": r.gainMode = value; seedRollIfNeeded(); reRender = true; break;
    case "nat20": r.nat20 = value; reRender = true; break;
    case "nat1": r.nat1 = value; reRender = true; break;
    case "reward": r.reward = value; break;
    case "note": dtRuleNote = value; break;
    case "scribespell": {
      const sp = value && game.actors.get(dtRuleActor)?.items?.get(value);
      if (sp) { const sug = DT.scribeScrollSuggest(sp.system?.level ?? 0, sp.name); dtRuleDraft = sug.rule; dtRuleDraft._spellId = value; }
      reRender = true; break;
    }
    case "crafttool": { if (value) { r.roll = rollSpec({ tool: value, label: toolLabel(value) }); r.kind = "craft"; } reRender = true; break; }
    // Level drives the target (2h ≈ one short slice per level) + the derived hours/gp note.
    case "learnlevel": { const lvl = Math.max(1, Math.min(9, Number(value) || 1)); r._level = lvl; r.target = lvl; r.cost = 50 * lvl; reRender = true; break; }
    case "cost": r.cost = Math.max(0, Number(value) || 0); break;
  }
  if (reRender) render();
}

// Preset chips seed sensible defaults. Scribe/craft use the pure suggesters (a per-day tally);
// the real owned-scroll / tool-proficiency pickers that set the exact target land in the next
// slice — for now the DM edits the seeded target. Freestyle just clears the preset tag.
function applyRulePreset(kind) {
  const cur = dtRuleDraft || DT.defaultRule();
  if (kind === "scribe") { const nr = DT.defaultRule("tally", "scribe"); nr.tickSource = "day"; nr.requireRoll = false; nr.reward = cur.reward || "The finished scroll"; dtRuleDraft = nr; }
  else if (kind === "craft") { const nr = DT.defaultRule("tally", "craft"); nr.tickSource = "day"; nr.requireRoll = false; nr.reward = cur.reward || "The finished item"; dtRuleDraft = nr; }
  else if (kind === "learn") { const nr = DT.learnSpellSuggest(cur._level || 1).rule; if (cur.reward) nr.reward = cur.reward; dtRuleDraft = nr; }
  else { cur.kind = "freestyle"; dtRuleDraft = cur; }
}

// Preflight tab (§16): one row per check — status dot, label, detail, and the
// check's own one-tap fix where a safe remedy exists. Never auto-fixes.
function preflightHTML() {
  const results = preflightResults;
  if (!results) return `<div class="mc-dmp-empty">Not run yet.</div>
    <button class="mc-dmp-preflight-run" data-preflight-run><i class="fas fa-rotate"></i> Run Checks</button>`;
  const esc = foundry.utils.escapeHTML;
  const icon = { ok: "fa-circle-check", warn: "fa-triangle-exclamation", fail: "fa-circle-xmark" };
  const rows = results.map(c => `<div class="mc-dmp-pf mc-dmp-pf-${c.status}">
      <i class="fas ${icon[c.status] ?? "fa-circle-question"} mc-dmp-pf-ico"></i>
      <div class="mc-dmp-pf-text"><b>${esc(c.label)}</b><span>${esc(c.detail ?? "")}</span></div>
      ${c.fix ? `<button class="mc-dmp-pf-fix" data-preflight-fix="${c.id}">${esc(c.fix.label)}</button>` : ""}
    </div>`).join("");
  const stamp = preflightRunAt ? preflightRunAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return `${rows}
    <button class="mc-dmp-preflight-run" data-preflight-run><i class="fas fa-rotate"></i> Run again${stamp ? ` <span class="mc-dmp-pf-stamp">(last ${stamp})</span>` : ""}</button>
    <button class="mc-dmp-preflight-run" data-dm-wizard><i class="fas fa-hat-wizard"></i> Setup Wizard</button>`;
}

function rollsToolHTML() {
  const esc = foundry.utils.escapeHTML;
  const cands = rollTargets();
  if (rollTool.selected == null) rollTool.selected = new Set(cands.filter(c => c.preselect).map(c => c.actor.id));
  const abilOpts = Object.entries(CONFIG.DND5E?.abilities ?? {}).map(([k, v]) =>
    `<option value="${k}" ${rollTool.ability === k ? "selected" : ""}>${esc((v.abbreviation ?? k).toUpperCase())}</option>`).join("");
  // Player-token button list (DM 2026-07-11): each row is a player-controlled token with a
  // user icon in the player's colour + the distance from the DM's selected/attacking token,
  // sorted closest-first. Tapping TARGETS that token on the canvas (so the DM can attack it
  // without hover+T) AND toggles it into the roll — one control for "who rolls" + targeting.
  const anchor = dmAnchorToken();
  const units = canvas.scene?.grid?.units || "ft";
  const reach = anchorRange(anchor); // the anchor's longest weapon range, for the in-range hint
  const enriched = cands.map(c => {
    const tok = tokenForActor(c.actor);
    const dist = (anchor && tok) ? gridDist(anchor, tok) : null;
    return { ...c, tok, dist };
  }).sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity) || a.actor.name.localeCompare(b.actor.name));
  const selCount = enriched.filter(c => rollTool.selected.has(c.actor.id)).length;
  const rows = enriched.map(c => {
    const on = rollTool.selected.has(c.actor.id);
    const targeted = !!c.tok?.targeted?.has?.(game.user);
    // In range = within the anchor's longest weapon range (null when unknown → neutral).
    const inRange = (c.dist != null && reach != null) ? c.dist <= reach : null;
    const distCls = inRange === true ? " mc-in" : inRange === false ? " mc-out" : "";
    const dist = c.dist == null ? "" : `<span class="mc-rt-dist${distCls}">${Math.round(c.dist)} ${esc(units)}</span>`;
    // A <button> row: colour-coded user icon, name, distance (green in range / red out), tick.
    const assigned = rollAssign[c.actor.id] ?? [];
    const picking = rtAssignFor === c.actor.id;
    // The box exists ONLY while picking (live test 2026-07-18: the closed-state
    // summary read as a picker that "didn't close", and one per assigned PC read
    // as stacked pickers). A standing assignment collapses to a count badge on
    // the crosshair; the names live in its tooltip.
    const names = assigned.map(t => `<span class="mc-dmp-rt-tgt">${esc(t.name)}</span>`).join("");
    const tgtBox = picking
      ? `<div class="mc-dmp-rt-tgts mc-picking">
          <span class="mc-dmp-rt-tgts-lbl">Targets for ${esc(c.actor.name)}</span>
          <div class="mc-dmp-rt-tgts-names">${assigned.length ? names : `<span class="mc-dmp-rt-tgt-empty">Target on the map to add — tap the crosshair again when done.</span>`}</div>
        </div>`
      : "";
    const asnTitle = picking ? "Done — close the target picker"
      : assigned.length ? `${assigned.length} target${assigned.length > 1 ? "s" : ""} on ${esc(c.actor.name)}'s phone (${esc(assigned.map(t => t.name).join(", "))}) — tap to edit`
      : `Pick targets for ${esc(c.actor.name)}`;
    return `<div class="mc-dmp-rt-item">
      <div class="mc-dmp-rt-row${on ? " mc-on" : ""}${targeted ? " mc-targeted" : ""}">
        <button class="mc-dmp-rt-main" data-rt-target="${c.actor.id}" title="Tap: target ${esc(c.actor.name)} + toggle for the roll${reach != null && c.dist != null ? ` (${inRange ? "in" : "out of"} range)` : ""}">
          <i class="fas fa-circle-user mc-rt-usericon" style="color:${ownerColor(c.actor) ?? '#c8a44d'}"></i>
          <span class="mc-rt-name">${esc(c.actor.name)}</span>
          ${dist}
        </button>
        <button class="mc-dmp-rt-assign${picking ? " mc-on" : ""}" data-rt-assign="${c.actor.id}" title="${asnTitle}" aria-pressed="${picking}"><i class="fas fa-crosshairs"></i>${!picking && assigned.length ? `<span class="mc-dmp-rt-badge">${assigned.length}</span>` : ""}</button>
      </div>
      ${tgtBox}
    </div>`;
  }).join("");
  return `
    <div class="mc-dmp-rt-top">
      <select class="mc-rt-type" data-rt="type"><option value="save" ${rollTool.type === "save" ? "selected" : ""}>Save</option><option value="check" ${rollTool.type === "check" ? "selected" : ""}>Check</option></select>
      <select class="mc-rt-abil" data-rt="ability">${abilOpts}</select>
    </div>
    <div class="mc-dmp-rt-scroll">${rows || `<div class="mc-dmp-empty">No player tokens.</div>`}</div>
    <div class="mc-dmp-rt-foot"><button class="mc-dmp-rt-send" data-rt-send${selCount ? "" : " disabled"}><i class="fas fa-paper-plane"></i> Request ${rollTool.type} from ${selCount}</button></div>`;
}

// Owned tokens (task #18): each non-GM, non-TV player's owned actors as draggable
// thumbnails. Drag → the canvas spawns a token natively (we set Actor drag data);
// double-click → open the sheet. For familiars, summons, wildshape forms, pets,
// extra PCs — quick out-of-combat placement.
// Compact for the common case (4–6 players × 1–2 tokens): pick a player from a
// dropdown, see their tokens in a 2-row grid that scrolls HORIZONTALLY, sorted
// highest-level first. No tall stacked sections; horizontal scroll handles a
// heavy player. (DM 2026-07-03.)
function tokLevel(a) { return a.system?.details?.level ?? a.system?.details?.cr ?? 0; }
/** The party's own sheet, one tap from the Players tab (DM 2026-07-17). It's where dnd5e keeps the
 *  things only the GROUP has — travel paces, the member list, party currency — and nothing else in
 *  the app opens it, so the DM was hunting for it in the sidebar. */
function groupSheetBtn() {
  const g = packedGroup() ?? candidateGroup();
  if (!g) return "";
  return `<button class="mc-dmp-groupsheet" data-group-sheet="${g.id}"
    title="Open ${foundry.utils.escapeHTML(g.name)} — travel pace, members, party currency">
    <i class="fas fa-people-group"></i> Group</button>`;
}

function ownedTokensHTML() {
  const esc = foundry.utils.escapeHTML;
  let tvId = ""; try { tvId = game.settings.get(MODULE_ID, "displayOwnerUser") || ""; } catch (e) { /* */ }
  const players = game.users.filter(u => !u.isGM && u.id !== tvId);
  if (!players.length) return `<div class="mc-dmp-empty">No players.</div>`;
  if (!tokensPlayer || !players.some(u => u.id === tokensPlayer)) tokensPlayer = players[0].id;
  const u = game.users.get(tokensPlayer);
  const opts = players.map(p => `<option value="${p.id}" ${p.id === tokensPlayer ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  const owned = game.actors.filter(a => a.type !== "group" && a.testUserPermission(u, "OWNER"))
    .sort((a, b) => tokLevel(b) - tokLevel(a) || a.name.localeCompare(b.name)); // highest level first
  const items = owned.map(a => `<div class="mc-dmp-tok" draggable="true" data-drag-actor="${a.uuid}" data-sheet-actor="${a.id}" title="${esc(a.name)}${tokLevel(a) ? ` · lvl ${tokLevel(a)}` : ""} — drag to the map · double-click for sheet">
    <img src="${esc(a.prototypeToken?.texture?.src || a.img || "icons/svg/mystery-man.svg")}" alt="">
    <span>${esc(a.name)}</span>
  </div>`).join("");
  return `
    <div class="mc-dmp-tok-top">
      <i class="fas fa-circle-user mc-nt-ico mc-dmp-tok-who" style="color:${u.color?.css ?? "#c8a44d"}"></i>
      <select class="mc-dmp-tok-player" data-tok-player>${opts}</select>
      <button class="mc-dmp-tok-palette" data-color-pick="${u.id}" title="Let ${esc(u.name)} pick their colour on their phone"><i class="fas fa-palette"></i></button>
    </div>
    <div class="mc-dmp-tok-grid">${items || `<div class="mc-dmp-empty">No tokens for this player.</div>`}</div>
    ${groupSheetBtn()}`;
}

// §18 travel T1.5: pick the overworld; the CTA packs the party, shows the DM the
// map, and arms a one-shot canvas click — the click is the landing spot (DM
// 2026-07-17: "the DM is transferred to the new map first and selects the
// location"). Pace, routes, and the journey loop arrive in later slices (T2+).
let travelDisarm = null; // active placement-mode cleanup, or null

function disarmTravelDrop() { try { travelDisarm?.(); } catch (e) { /* listener already gone */ } travelDisarm = null; }

function armTravelDrop() {
  disarmTravelDrop();
  const board = document.getElementById("board");
  if (!board) { ui.notifications.warn("No canvas to click on."); return; }
  const onDown = async (ev) => {
    if (ev.button !== 0) return; // right/middle-drag pans the map — don't cancel placement (DM 2026-07-19)
    disarmTravelDrop();
    ev.preventDefault();
    ev.stopPropagation(); // capture phase: the click places the party, core never sees it
    const res = await api.travelDrop({ x: canvas.mousePosition.x, y: canvas.mousePosition.y });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? "Couldn't place the party.");
  };
  const onKey = (ev) => { if (ev.key === "Escape") { disarmTravelDrop(); ui.notifications.info("Travel placement cancelled."); } };
  board.addEventListener("pointerdown", onDown, true);
  window.addEventListener("keydown", onKey, true);
  travelDisarm = () => { board.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey, true); };
  ui.notifications.info("Click the map where the party arrives — right-click-drag pans, Esc cancels.");
}

// §18 T2: DM draws a freeform route the players see (a Drawing), and the panel reads out
// length → distance (scene grid) → time at the current pace — DM-only. Anchored at the party
// token so you draw FROM it without selecting it (DM 2026-07-18). Foundry Drawings have no dash
// style, so the line is solid gold. GM client writes the Drawing directly (no RPC needed).

// Scene distance → MILES (the pace unit). A battle-scaled map in feet must NOT be read as miles
// (DM 2026-07-18: "761ft took 31.7 days" — feet were treated as miles). Unknown units pass through.
function travelToMiles(dist, units) {
  const u = String(units).toLowerCase();
  if (/mile|(^|[^k])mi\b/.test(u)) return dist;
  if (/feet|foot|ft|'/.test(u)) return dist / 5280;
  if (/km|kilomet/.test(u)) return dist / 1.60934;
  if (/meter|metre|(^|[^k])m\b/.test(u)) return dist / 1609.34;
  if (/yard|yd/.test(u)) return dist / 1760;
  if (/league/.test(u)) return dist * 3;
  return dist;
}
function fmtTravelTime(hours) {
  if (!(hours > 0)) return "~0";
  if (hours < 1) return `~${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `~${Math.round(hours)} h`;
  return `~${(hours / 8).toFixed(1)} days`; // a travel day = 8h on the road
}

let travelRouteDisarm = null;
let travelRouteInfo = null; // {dist, units, hours} — DM-only readout of the last route
let travelRoutePts = null;  // scene-coord polyline the journey walks
let travelJourneyActive = false, travelJourneyStop = false;
const travelSleep = (ms) => new Promise(r => setTimeout(r, ms));
// A drawn route can be orphaned if the party teleports/switches off the overworld mid-travel (DM
// 2026-07-19: "passed a marker that teleported me to a battle map, now there's a leftover dashed line").
// Routes are flag-tagged, so we wipe them from every scene — the Clear button, arrival, drawing a new
// route, and the on-scene-switch cleanup all route through here. `exceptSceneId` spares the scene the
// DM is currently on, so a route being actively drawn/travelled isn't nuked by a same-scene refresh.
async function deleteTravelRouteDrawings(exceptSceneId = null) {
  let n = 0;
  for (const scene of game.scenes) {
    if (exceptSceneId && scene.id === exceptSceneId) continue;
    try {
      const ids = scene.drawings.filter(d => d.getFlag(MODULE_ID, "travelRoute")).map(d => d.id);
      if (ids.length) { await scene.deleteEmbeddedDocuments("Drawing", ids); n += ids.length; }
    } catch (e) { console.warn(`${MODULE_ID} | couldn't clear a travel route on "${scene.name}"`, e); }
  }
  return n;
}
function resetTravelRoute() { travelRouteInfo = null; travelRoutePts = null; }
// Time-of-day → darkness: sinusoidal, 0 at noon, 1 at midnight (dawn/dusk ≈ 0.5).
function darknessForHour(h) { return Math.max(0, 0.35 + 0.35 * Math.cos((Number(h) || 0) / 24 * 2 * Math.PI)); } // 0 at noon → ~0.7 at midnight (dim, not pitch-black on a fully-visible map)
function travelCumLen(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)); return c; }
function travelPointAt(pts, cum, target) {
  const total = cum[cum.length - 1];
  if (target <= 0) return pts[0];
  if (target >= total) return pts[pts.length - 1];
  let i = 1; while (i < cum.length && cum[i] < target) i++;
  const f = (target - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
  return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
}
async function moveGroupTo(gt, pt, durMs) {
  const g = gt.parent.grid.size;
  const x = Math.round(pt.x - (gt.width || 1) * g / 2), y = Math.round(pt.y - (gt.height || 1) * g / 2);
  await gt.update({ x, y }, { animate: true, animation: { duration: Math.max(200, Math.round(durMs)) } });
}
function stopTravelJourney() { travelJourneyStop = true; }
// §18 travel (DM 2026-07-19): auto-detected overworlds (grid ≥ threshold ft/cell) set themselves up
// for travel the first time you open them — whole map visible (no sight circle), Global Illumination
// off, darkness unlocked, and darkness synced to the clock. One-shot per scene (a flag guards it) so
// a map you later customise is never re-stomped. Executor GM only (one writer). This is the "automate
// the behavior" the DM asked for — no per-scene designation, no manual Preflight fix.
async function maybeAutoLightOverworld(scene) {
  try {
    if (!scene || !game.user.isGM || !isExecutor()) return;
    if (!game.settings.get(MODULE_ID, "travelAutoLight")) return;
    if (!isOverworldScene(scene) || scene.getFlag(MODULE_ID, "travelAutoLit")) return;
    const env = scene.environment ?? {};
    const patch = { [`flags.${MODULE_ID}.travelAutoLit`]: true };
    if (scene.tokenVision) patch.tokenVision = false;                                 // whole map visible, no sight-range circle
    if (env.globalLight?.enabled) patch["environment.globalLight.enabled"] = false;   // let darkness tint the map
    if (env.darknessLock) patch["environment.darknessLock"] = false;                  // the travel loop drives darkness
    if (game.settings.get(MODULE_ID, "travelDaylight")) {                             // open at the right time of day
      const c = readClock();
      patch["environment.darknessLevel"] = darknessForHour((Number(c.hour) || 0) + (Number(c.minute) || 0) / 60);
    }
    await scene.update(patch, { animateDarkness: 800 });
    console.log(`${MODULE_ID} | auto-lit overworld "${scene.name}" (${Math.round(gridFeetPerCell(scene))} ft/cell) — whole map visible, darkness follows the clock`);
    ui.notifications.info(`Travel map ready: “${scene.name}” — whole map stays visible and dims with the clock.`);
  } catch (e) { console.warn(`${MODULE_ID} | auto-light overworld failed`, e); }
}
// §18 T3: tick the token along the route while game-time advances (1 game-hour/tick) and the
// daylight sweeps to match (DESIGN §18.1). Auto-pauses so no one moves; arrival unpauses; Stop
// halts and STAYS paused (probably an encounter). Cinematic rate ≈ 1 real s per game-hour, clamped.
async function runTravelJourney(group) {
  const scene = canvas.scene;
  const gt = scene?.tokens.find(t => t.actorId === group.id);
  const pts = travelRoutePts;
  if (!gt || !pts || pts.length < 2 || !travelRouteInfo) { ui.notifications.warn("Draw a route first."); return; }
  if (travelJourneyActive) return;
  const totalHours = Math.max(1, Math.round(travelRouteInfo.miles * 8 / travelMilesPerDay(group)));
  const cum = travelCumLen(pts), total = cum[cum.length - 1];
  // Follow the DRAWN line: resample to closely-spaced waypoints (a single-jump animation goes
  // straight and would chord across the curves — DM 2026-07-18 "takes the shortest path"). Cap
  // the count so a huge route doesn't spam DB writes.
  const steps = Math.max(2, Math.min(80, Math.round(total / (scene.grid.size * 0.6)) || 2));
  const totalReal = Math.min(40000, Math.max(4000, totalHours * 1000)); // whole-journey ms, clamped
  const segReal = totalReal / steps;                 // ms per waypoint
  const segSecs = (totalHours * 3600) / steps;       // game-seconds per waypoint
  const env = scene.environment ?? {};
  const darknessOn = game.settings.get(MODULE_ID, "travelDaylight") && !env.globalLight?.enabled && !env.darknessLock;
  const wePaused = !game.paused;
  if (wePaused) game.togglePause(true);
  travelJourneyActive = true; travelJourneyStop = false; render();
  try {
    let lastDark = null;
    for (let s = 1; s <= steps; s++) {
      if (travelJourneyStop) break;
      await moveGroupTo(gt, travelPointAt(pts, cum, (s / steps) * total), segReal); // next point ON the line
      await game.time.advance(Math.round(segSecs));
      if (darknessOn) {
        const c = readClock();
        const d = darknessForHour((Number(c.hour) || 0) + (Number(c.minute) || 0) / 60);
        if (lastDark === null || Math.abs(d - lastDark) > 0.03) { // throttle scene writes
          lastDark = d;
          try { await scene.update({ "environment.darknessLevel": d }, { animateDarkness: Math.round(segReal) }); } catch (e) { /* darkness is best-effort */ }
        }
      }
      await travelSleep(segReal);
    }
  } catch (e) { console.error(`${MODULE_ID} | journey failed`, e); }
  const arrived = !travelJourneyStop;
  travelJourneyActive = false; travelJourneyStop = false;
  if (arrived) {
    const end = pts[pts.length - 1], g = scene.grid.size;
    await scene.setFlag(MODULE_ID, "travelPos", { x: Math.round(end.x - (gt.width || 1) * g / 2), y: Math.round(end.y - (gt.height || 1) * g / 2) });
    await deleteTravelRouteDrawings();
    resetTravelRoute();
    if (wePaused) game.togglePause(false); // arrival unpauses (only if the journey paused)
    ui.notifications.info("The party arrives.");
  } else ui.notifications.info("Journey stopped — the game stays paused.");
  // No snap-back to the travel scene: if the party crossed a teleporter mid-journey, following it to the
  // new scene is CORRECT — transporting is a feature (DM 2026-07-19). Line cleanup (deleteTravelRouteDrawings
  // on arrival + the on-scene-switch canvasReady sweep) keeps stray routes from lingering either way.
  render();
}
function disarmTravelRoute() { try { travelRouteDisarm?.(); } catch (e) { /* gone */ } travelRouteDisarm = null; }
function armTravelRoute() {
  disarmTravelRoute();
  const board = document.getElementById("board");
  const group = packedGroup();
  if (!board || !group || !canvas?.ready) { ui.notifications.warn("Form up on the overworld first."); return; }
  const gtok = canvas.tokens?.placeables.find(t => t.actor?.id === group.id);
  const anchor = gtok?.center ?? null; // start the line at the token, no selection needed
  // Belt-and-suspenders: even if a pointer event leaks past the window capture, tokens can't be
  // dragged while drawing (DM 2026-07-18, re-reported). Restored on disarm.
  if (canvas.tokens) canvas.tokens.interactiveChildren = false;
  const coord = (ev) => canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
  let drawing = false, pts = [];
  const push = (p) => { const l = pts[pts.length - 1]; if (!l || Math.hypot(p.x - l.x, p.y - l.y) > 12) pts.push(p); };
  // Capture on WINDOW (capture phase) so we preempt Foundry's own canvas listeners — no marquee,
  // no token drag while drawing (DM 2026-07-18). Only engage over the map, not the panel.
  const eat = (ev) => { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); };
  const down = (ev) => {
    if (ev.button !== 0 || !(ev.target === board || board.contains(ev.target))) return; // right/middle pass through → the map pans (DM 2026-07-19)
    eat(ev);
    drawing = true; pts = [];
    if (anchor) pts.push({ x: anchor.x, y: anchor.y });
    push(coord(ev));
  };
  const move = (ev) => { if (!drawing) return; eat(ev); push(coord(ev)); };
  const up = async (ev) => { if (!drawing) return; eat(ev); drawing = false; push(coord(ev)); disarmTravelRoute(); await finishTravelRoute(group, pts); };
  const key = (ev) => { if (ev.key === "Escape") { disarmTravelRoute(); ui.notifications.info("Route cancelled."); } };
  window.addEventListener("pointerdown", down, true);
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("keydown", key, true);
  travelRouteDisarm = () => {
    for (const [t, f] of [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["keydown", key]])
      window.removeEventListener(t, f, true);
    if (canvas.tokens) canvas.tokens.interactiveChildren = true; // restore token dragging
  };
  ui.notifications.info("Draw the route from the party — left-drag to draw; right-click-drag pans, Esc cancels.");
}
// §18 T2 (DM 2026-07-19): the route is DASHED, thick, and WHITE — the orange-red read as invisible
// on the map (DM: "red line isn't working, lets try white"). Foundry Drawings have no native dash, so
// we emit one short polyline Drawing per dash, each sampled off the smooth path so it follows the
// curve. All carry the travelRoute flag → Clear / arrival delete them together. Dash count is capped
// so a long route can't spam the DB (dash/gap scale up past the cap).
const ROUTE_COLOR = "#ffffff", ROUTE_WIDTH = 8, ROUTE_ALPHA = 0.95, ROUTE_MAX_DASHES = 140;
// One polyline Drawing from a list of scene-space points. Rounded, min-anchored, thick white stroke.
// Foundry's polygon needs ≥3 vertices, so a 2-point dash gets its midpoint injected before we build.
function routeDrawingFrom(seg) {
  if (seg.length === 2) seg = [seg[0], { x: (seg[0].x + seg[1].x) / 2, y: (seg[0].y + seg[1].y) / 2 }, seg[1]];
  const xs = seg.map(p => p.x), ys = seg.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return {
    x: Math.round(minX), y: Math.round(minY),
    shape: { type: "p", width: Math.round(Math.max(...xs) - minX) || 1, height: Math.round(Math.max(...ys) - minY) || 1, points: seg.flatMap(p => [Math.round(p.x - minX), Math.round(p.y - minY)]) },
    bezierFactor: 0.2, strokeWidth: ROUTE_WIDTH, strokeColor: ROUTE_COLOR, strokeAlpha: ROUTE_ALPHA, fillType: 0,
    flags: { [MODULE_ID]: { travelRoute: true } }
  };
}
function routeDashDrawings(scene, pts) {
  const cum = travelCumLen(pts), total = cum[cum.length - 1];
  const cell = scene.grid?.size || 100;
  let dash = cell * 0.5, gap = cell * 0.45, period = dash + gap;
  if (total / period > ROUTE_MAX_DASHES) { const k = (total / period) / ROUTE_MAX_DASHES; dash *= k; gap *= k; period = dash + gap; }
  const sample = Math.max(6, cell * 0.12); // resolution WITHIN a dash so it curves with the path
  const out = [];
  for (let d0 = 0; d0 < total; d0 += period) {
    const d1 = Math.min(total, d0 + dash);
    if (d1 - d0 < 1) continue;                // skip a zero-length tail dash
    const seg = [];
    for (let s = d0; s < d1; s += sample) seg.push(travelPointAt(pts, cum, s));
    seg.push(travelPointAt(pts, cum, d1));
    if (seg.length < 2) continue;
    out.push(routeDrawingFrom(seg));
  }
  return out;
}
async function finishTravelRoute(group, pts) {
  const scene = canvas.scene;
  if (!scene || pts.length < 2) { ui.notifications.warn("Route too short."); return; }
  let px = 0;
  for (let i = 1; i < pts.length; i++) px += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const grid = scene.grid;
  const dist = px / grid.size * (grid.distance || 1);   // in the scene's own units
  const units = (grid.units || "").trim();
  const miles = travelToMiles(dist, units);
  const mpd = travelMilesPerDay(group);
  travelRouteInfo = { miles }; // time is derived live from the current pace (not frozen at draw)
  travelRoutePts = pts.slice(); // §18 T3: the journey walks the token along these
  // Replace any prior route, then draw the new one (dashed, thick, white) for everyone. If Foundry
  // rejects the dash batch for any reason, fall back to the proven single solid polyline so a line
  // ALWAYS appears (DM 2026-07-19: "red line isn't working" — never leave the route invisible).
  await deleteTravelRouteDrawings(); // wipe any prior route (incl. a stray one left on another scene)
  const dashes = routeDashDrawings(scene, pts);
  try {
    if (!dashes.length) throw new Error("no dashes built");
    await scene.createEmbeddedDocuments("Drawing", dashes);
  } catch (e) {
    console.warn(`${MODULE_ID} | dashed route failed (${e.message}) — drawing a solid line instead`);
    try { await scene.createEmbeddedDocuments("Drawing", [routeDrawingFrom(pts.slice())]); }
    catch (e2) { console.error(`${MODULE_ID} | route draw failed`, e2); ui.notifications.warn(`Couldn't draw the route: ${e2.message}`); }
  }
  render();
}

// §18 T2: travel pace — data, not a stat (DESIGN §18.1). fast/normal/slow map to the D&D
// overland speeds; the mi/day feeds the route's time estimate (next slice). Stored as a flag
// on the group so it travels with the party.
const TRAVEL_PACES = [["slow", "Slow", 18], ["normal", "Normal", 24], ["fast", "Fast", 30]];
const KPH_PER_MPH = 1.60934;
function travelCustomPaces() { try { const a = game.settings.get(MODULE_ID, "travelCustomPaces"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function travelPaceOf(group) { return group?.getFlag(MODULE_ID, "travelPace") ?? "normal"; }
function travelMilesPerDay(group) {
  const p = travelPaceOf(group);
  const b = TRAVEL_PACES.find(x => x[0] === p);
  if (b) return b[2];
  const c = travelCustomPaces().find(x => x.id === p); // custom transport: MPH → mi/day over an 8h day
  if (c) return (Number(c.mph) || 3) * 8;
  return 24;
}
function travelPaceLabel(group) {
  const p = travelPaceOf(group);
  const b = TRAVEL_PACES.find(x => x[0] === p);
  if (b) return b[1].toLowerCase();
  return travelCustomPaces().find(x => x.id === p)?.name ?? "normal";
}

// §18 travel tab: two accordions (DM 2026-07-18) — reuses the downtime drawer chrome.
let travelDrawers = { switch: true, go: true };
function travelDrawer(key, title, body) {
  const open = travelDrawers[key] !== false;
  return `<div class="mc-dt-drawer ${open ? "mc-open" : ""}">
    <div class="mc-dt-drawer-head">
      <button class="mc-dt-drawer-toggle" data-travel-drawer="${key}"><span>${foundry.utils.escapeHTML(title)}</span><i class="fas fa-chevron-${open ? "down" : "right"}"></i></button>
    </div>
    ${open ? `<div class="mc-dt-drawer-body">${body}</div>` : ""}
  </div>`;
}
// §18 travel: custom-pace editor popup (DM 2026-07-18) — list each custom transport with a trash,
// plus a create form (name + MPH/KPH; the other auto-fills via onInput).
let travelPaceEditorOpen = false;
function travelPaceEditorHTML(customs) {
  const esc = foundry.utils.escapeHTML;
  const rows = customs.length
    ? customs.map(c => `<div class="mc-dmp-pace-poprow">
        <span>${esc(c.name)} — ${c.mph} MPH / ${(Number(c.mph) * KPH_PER_MPH).toFixed(1)} KPH</span>
        <button class="mc-dmp-pace-del" data-travel-delpace="${c.id}" title="Delete ${esc(c.name)}"><i class="fas fa-trash"></i></button>
      </div>`).join("")
    : `<div class="mc-dmp-travel-hint">No custom transports yet.</div>`;
  return `<div class="mc-dmp-pace-pop">
    <div class="mc-dmp-pace-poplist">${rows}</div>
    <div class="mc-dmp-pace-form">
      <input type="text" data-pace-name placeholder="Name — e.g. Camel" maxlength="30">
      <div class="mc-dmp-pace-speeds">
        <input type="number" data-pace-mph placeholder="MPH" min="0" step="0.1" inputmode="decimal">
        <input type="number" data-pace-kph placeholder="KPH" min="0" step="0.1" inputmode="decimal">
      </div>
      <button class="mc-dmp-party-deploy mc-dmp-pace-add" data-travel-paceadd><i class="fas fa-plus"></i> Add transport</button>
    </div>
  </div>`;
}
function travelHTML() {
  const esc = foundry.utils.escapeHTML;
  const chosenId = game.settings.get(MODULE_ID, "travelOverworldSceneId");
  const scenes = game.scenes.contents.slice().sort((a, b) => a.name.localeCompare(b.name));
  const over = game.scenes.get(chosenId);
  const packed = packedGroup(), cand = candidateGroup();
  const group = packed ?? cand;
  const onOver = !!over && game.scenes.active?.id === over.id;
  const state = !over ? "Choose which scene to switch to."
    : onOver && packed ? "Click the map to place the group."
    : packed ? "Formed up — you'll click their landing spot."
    : cand ? "Click the map to place the group and pull the party over."
    : "No party group with members — set one up first.";
  const ready = !!over && !!(packed || cand);
  const pace = travelPaceOf(group);

  // Accordion 1 — Switch scene to…: pick a scene + Switch (pack, preview, click-to-place, activate).
  const switchBody = `<select id="mc-travel-scene" data-travel-scene>
      <option value="">— choose a scene —</option>
      ${scenes.map(s => `<option value="${s.id}" ${s.id === chosenId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
    </select>
    <p class="mc-dmp-travel-hint">${esc(state)}</p>
    <button class="mc-dmp-party-deploy mc-dmp-travel-go" data-travel-begin ${ready ? "" : "disabled"}
      title="Form up if needed and preview the scene — then click the map where the party arrives; everyone follows with the transition">
      <i class="fas fa-right-to-bracket"></i> Switch</button>`;

  // Accordion 2 — Travel to…: pace (built-ins + custom transports) + freeform route.
  const customs = travelCustomPaces();
  const onCustom = customs.some(c => c.id === pace);
  const paceRow = `<div class="mc-dmp-travel-pacehead">
      <label class="mc-dmp-travel-lbl">Pace</label>
      <button class="mc-dmp-travel-addpace ${travelPaceEditorOpen ? "mc-on" : ""}" data-travel-addpace title="Add or edit custom transports"><i class="fas fa-plus"></i></button>
    </div>
    <div class="mc-dmp-travel-segs">
      ${TRAVEL_PACES.map(([k, l, mpd]) => `<button class="mc-dmp-travel-seg ${pace === k ? "mc-on" : ""}" data-travel-pace="${k}" title="${mpd} miles/day">${l}</button>`).join("")}
    </div>
    <select class="mc-dmp-travel-custom ${onCustom ? "mc-on" : ""}" data-travel-custompace>
      <option value="">— custom transport —</option>
      ${customs.map(c => `<option value="${c.id}" ${pace === c.id ? "selected" : ""}>${esc(c.name)} · ${c.mph} mph</option>`).join("")}
    </select>
    ${travelPaceEditorOpen ? travelPaceEditorHTML(customs) : ""}`;
  const ri = travelRouteInfo;
  let readout = "";
  if (ri) {
    const ft = Math.round(ri.miles * 5280).toLocaleString();
    const mi = ri.miles.toFixed(1), km = (ri.miles * KPH_PER_MPH).toFixed(1);
    const hrs = ri.miles * 8 / travelMilesPerDay(group); // live — recomputes when the pace changes
    readout = `<p class="mc-dmp-travel-hint">${ft} ft / ${mi} miles / ${km} km<br>${fmtTravelTime(hrs)} at ${esc(travelPaceLabel(group))} speed</p>`;
  }
  const routeCtl = ri
    ? (travelJourneyActive
      ? `<button class="mc-dmp-party-deploy mc-dmp-travel-stop" data-travel-stop><i class="fas fa-stop"></i> Stop</button>`
      : `<div class="mc-dmp-travel-row">
          <button class="mc-dmp-travel-seg" data-travel-route-clear title="Erase the route"><i class="fas fa-eraser"></i> Clear</button>
          <button class="mc-dmp-party-deploy" data-travel-go title="Walk the party along the route as the clock advances"><i class="fas fa-person-walking"></i> Start</button>
        </div>`)
    : "";
  const goBody = !group ? `<p class="mc-dmp-travel-hint">No party group — set one up first.</p>`
    : (packed && onOver)
      ? `${paceRow}
         <label class="mc-dmp-travel-lbl">Route</label>
         <button class="mc-dmp-travel-seg" data-travel-route ${travelJourneyActive ? "disabled" : ""}><i class="fas fa-pen-nib"></i> Draw from party</button>
         ${readout}${routeCtl}`
      : `${paceRow}<p class="mc-dmp-travel-hint">Switch to the overworld, then draw a route.</p>`;

  return `<div class="mc-dmp-travel">
    ${travelDrawer("switch", "Switch scene to…", switchBody)}
    ${travelDrawer("go", "Travel to…", goBody)}
  </div>`;
}

function flyoutHTML() {
  let title = "", body = "";
  if (dockTab === "rolls") { title = "Request rolls"; body = rollsToolHTML(); }
  else if (dockTab === "travel") { title = "Travel"; body = travelHTML(); }
  else if (dockTab === "tokens") { title = "Players"; body = ownedTokensHTML(); }
  else if (dockTab === "rest") { title = "Rest"; body = restHTML(); }
  else if (dockTab === "preflight") { title = "System health"; body = preflightHTML(); }
  else if (dockTab === "party") {
    const g = packedGroup();
    const f = g?.getFlag(MODULE_ID, "formation") ?? {};
    const arr = ["↑", "→", "↓", "←", "↖", "↗", "↘", "↙"]; // display only
    title = `${(f.stage ?? "arrange") === "arrange" ? "Marching order" : "Traveling"} <i class="fas fa-arrow-up" style="display:inline-block;transform:rotate(${(f.forward ?? 0) * 45}deg)"></i>`;
    body = partyTabHTML();
  }
  // BOTH edges drag (DM 2026-07-17). Each grabber knows which edge it is: the bottom one grows the
  // box downward, the top one moves the box up and grows it — so the far edge stays put, which is
  // what makes a resize feel like a resize rather than a jump.
  const grabTop = `<div class="mc-dmp-fly-resize mc-fly-grab-top" data-fly-resize="top" title="Drag to resize"><i class="fas fa-grip-lines"></i></div>`;
  const grabBot = `<div class="mc-dmp-fly-resize mc-fly-grab-bot" data-fly-resize="bottom" title="Drag to resize"><i class="fas fa-grip-lines"></i></div>`;
  const head = `<div class="mc-dmp-fly-head" title="Drag to move"><span>${title}</span><button class="mc-dmp-fly-x" data-dock-close aria-label="Close">✕</button></div>`;
  // No inline min-height: the floor is CSS `min-height:100%` = the main window's height, so the
  // second screen can never be dragged shorter than the primary (DM 2026-07-17). An inline
  // min-height here is what defeated that — it always beat the stylesheet.
  const h = Math.max(flyMaxH, flyMinH());
  // top is explicit so BOTH edges can be dragged; it only falls back to the flyUp default when the
  // DM hasn't positioned it himself.
  // Default: the two windows start at the SAME top, so their titles line up (DM 2026-07-17). The
  // old default (flyUp ? panelH - h : 0) hung the flyout above the panel whenever it was taller —
  // 39px above, here — which is exactly why the titles didn't agree. If the flyout runs off the
  // bottom, clampPos shifts the panel; that's its job, and it beats starting misaligned.
  const top = Math.round(flyTop ?? 0);
  return `<div class="mc-dmp-flyout mc-fly-${dockTab}" style="top:${top}px;bottom:auto;height:${h}px">
    ${grabTop}${head}
    <div class="mc-dmp-fly-body">${body}</div>
    ${grabBot}
  </div>`;
}

async function sendRolls() {
  const ids = [...(rollTool.selected ?? [])];
  if (!ids.length) { ui.notifications.warn("Pick at least one target."); return; }
  const res = await api.requestRolls({ rollType: rollTool.type, ability: rollTool.ability, actorIds: ids });
  if (res?.ok === false) { ui.notifications.warn(res.reason ?? "Couldn't request rolls."); return; }
  const ab = CONFIG.DND5E?.abilities?.[rollTool.ability]?.label ?? rollTool.ability;
  ui.notifications.info(`Requested ${ab} ${rollTool.type} from ${res.sent} player${res.sent === 1 ? "" : "s"}${res.auto ? ` (auto-rolled ${res.auto})` : ""}.`);
}

/** Active player users (non-GM). Don't require a formally assigned character —
 * the phone resolves an owned character if none is assigned, and requiring it
 * made the panel show "no players" for unassigned (but connected) users. */
function activePlayers() {
  let tvId = ""; try { tvId = game.settings.get(MODULE_ID, "displayOwnerUser") || ""; } catch (e) { /* */ }
  return game.users.filter(u => u.active && !u.isGM && u.id !== tvId);
}

/** Best label for a player: their assigned character, else their SOLE owned
 *  character, else the user's name. The old "first owned" fallback picked an
 *  ARBITRARY character for a user who owns several (a test/DM account owning the whole
 *  party), so the presence row showed a character that isn't even in the scene —
 *  "Aslan"/"Multi" for users Player 1/Player 2 (DM 2026-06-22). Only collapse to a
 *  character name when it's unambiguous (exactly one owned). */
function playerLabel(u) {
  // Name the CHARACTER this user is playing, not the user: the active combatant if it's
  // their turn (so the target-assign list names the PC that will actually act), then their
  // assigned character, then their single owned PC, else the user name as a last resort.
  const cbActor = game.combat?.combatant?.actor;
  if (cbActor && currentTurnUserId() === u.id) return cbActor.name;
  if (u.character) return u.character.name;
  const owned = game.actors.filter(a => a.type === "character" && a.testUserPermission(u, "OWNER"));
  return owned.length === 1 ? owned[0].name : u.name;
}

/** The user tied to the current combatant — assigned character, else an owner. */
function currentTurnUserId() {
  const actor = game.combat?.combatant?.actor;
  if (!actor) return null;
  return game.users.find(u => !u.isGM && u.character?.id === actor.id)?.id
    ?? game.users.find(u => !u.isGM && actor.testUserPermission(u, "OWNER"))?.id
    ?? null;
}

function ensureEl() {
  if (panelEl) return panelEl;
  panelEl = document.createElement("div");
  panelEl.id = "mc-dm-panel";
  panelEl.addEventListener("click", onClick);
  panelEl.addEventListener("change", onChange); // Rolls-tool dropdowns + token player
  panelEl.addEventListener("input", onInput);   // live MPH↔KPH auto-fill in the custom-pace form
  panelEl.addEventListener("dragstart", onTokenDragStart); // Owned-tokens → canvas
  panelEl.addEventListener("dblclick", onTokenDblClick);   // Owned-tokens → sheet
  panelEl.addEventListener("pointerdown", onPointerDown); // drag from the grip handle
  // Outside-click closes any open transient dropdown (DM 2026-07-09: "clicking
  // outside the dropdown should close it"). The selection is already live in
  // rollTool.selected as each row is tapped, so closing just tidies the overlay
  // — nothing to save on the way out. Capture phase + a "is it inside the
  // dropdown?" guard so a click ON the toggle/rows still works normally.
  document.addEventListener("pointerdown", onOutsidePointerDown, true);
  document.body.appendChild(panelEl);
  applySavedPos(panelEl);
  return panelEl;
}

// Draggable so it doesn't cover other widgets (DM 2026-06-19). Position is saved
// per-browser in localStorage and re-applied on load.
const POS_KEY = "mc-dm-panel-pos";
// §17.7/UX: the flyout ("second screen") is a right-side panel whose height forces clampPos to
// shove the whole floating panel up — so opening a tall tab hides the primary and needs a
// re-drag (DM 2026-07-13). Cap the flyout height (drag the bottom grabber to set it); the body
// scrolls inside, so no tab ever grows past this and jostles the panel. Persisted per client.
const FLY_TOP_KEY = "mc-dm-panel-flyTop";
const FLY_KEY = "mc-dm-panel-flyH";
// The MAIN window sets the floor for the second screen: a flyout shorter than the panel it hangs
// off reads as broken (DM 2026-07-17: "i can still drag the secondary window under the primary").
// CSS `min-height:100%` is the live enforcement; this measures the same height for the drag clamp
// and the persisted value. Falls back to a sane floor before the panel is on screen.
const FLY_MIN_FALLBACK = 150; // enough for a tab's main flow buttons (e.g. the two rest buttons)
function flyMinH() {
  const h = Math.round(panelEl?.getBoundingClientRect().height ?? 0);
  return Math.min(Math.max(h || FLY_MIN_FALLBACK, FLY_MIN_FALLBACK), window.innerHeight - 24);
}
let flyMaxH = (() => { try { return parseInt(window.localStorage.getItem(FLY_KEY), 10) || 360; } catch (e) { return 360; } })();
let flyUp = false; // default anchor: grow from the panel's bottom when the panel sits low
// The flyout's own top offset, in px from the panel's padding box. null = derive from flyUp.
// Needed because a box anchored at top:0 can only ever grow DOWNWARD: to drag the TOP edge up we
// must move the box AND resize it (DM 2026-07-17: "Now i can only drag the height of the secondary
// window down, cant we have both!?").
let flyTop = (() => { try { const v = window.localStorage.getItem(FLY_TOP_KEY); return v == null ? null : Number(v); } catch (e) { return null; } })();
function applySavedPos(el) {
  try {
    const pos = JSON.parse(window.localStorage.getItem(POS_KEY) || "null");
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
      el.style.bottom = "auto";
    }
  } catch (e) { /* ignore bad stored value */ }
}
// Keep the whole panel on-screen. Sections come and go (party grid, casts,
// targets), so a position saved when the panel was short can push the tail —
// and its buttons — below the viewport (DM 2026-07-02: "Form up" at y=1214 on a
// smaller screen). Clamp after every render and on window resize.
// Collapsing/expanding an in-panel drawer changes the panel's height; with the
// default bottom-anchored position that shifts every control ABOVE the drawer
// (DM 2026-07-18: "minimizing the archive drawer causes position changes"). Pin
// the current top edge first so height changes grow/shrink DOWNWARD, under the
// pointer — clampPos still rescues any overflow.
function pinPanelTop() {
  if (!panelEl) return;
  const r = panelEl.getBoundingClientRect();
  if (!r.height) return;
  panelEl.style.top = `${Math.round(r.top)}px`;
  panelEl.style.bottom = "auto";
}
function clampPos(el) {
  // Clamp the COMBINED box — the tab rail and flyout are absolutely-positioned
  // children that stick out to the right/below and don't count in the panel's own
  // rect, so an open flyout could run off-screen unreachably. Measure all three and
  // shift the panel so the whole thing stays on screen (DM 2026-07-03).
  const elR = el.getBoundingClientRect();
  if (!elR.height) return; // hidden
  const rects = [elR, el.querySelector(".mc-dmp-tabrail"), el.querySelector(".mc-dmp-flyout")]
    .filter(Boolean).map(p => p.getBoundingClientRect ? p.getBoundingClientRect() : p).filter(r => r.height);
  const bottom = Math.max(...rects.map(r => r.bottom));
  const right = Math.max(...rects.map(r => r.right));
  const top = Math.min(...rects.map(r => r.top));
  const overBottom = bottom - (window.innerHeight - 8);
  if (overBottom > 0) { el.style.top = `${Math.max(8, elR.top - overBottom)}px`; el.style.bottom = "auto"; }
  // An upward-growing flyout can run off the TOP — shift the panel down to keep it on screen.
  const overTop = 8 - top;
  if (overTop > 0) { el.style.top = `${elR.top + overTop}px`; el.style.bottom = "auto"; }
  const overRight = right - (window.innerWidth - 8);
  if (overRight > 0) el.style.left = `${Math.max(8, elR.left - overRight)}px`;
}

// Outside-click closes open transient dropdowns. Each entry: the state flag that
// makes a dropdown visible + the selector for the region a click may land in
// without closing it (the toggle button and the list itself). Extend as more
// dropdowns appear ("and all others" — DM 2026-07-09).
const OUTSIDE_DISMISS = [
  { open: () => rollTool.targetsOpen, within: ".mc-rt-multi", close: () => { rollTool.targetsOpen = false; } }
];
function onOutsidePointerDown(ev) {
  let changed = false;
  for (const d of OUTSIDE_DISMISS) {
    if (d.open() && !ev.target.closest(d.within)) { d.close(); changed = true; }
  }
  if (changed) render();
}

// Drag the flyout's bottom grabber to set its max height. Live-updates the element during the
// drag (no re-render, so it's smooth), clamps to [flyMinH(), viewport], persists on release, then
// re-clamps the panel so the new size stays on screen.
function startFlyResize(ev) {
  ev.preventDefault(); ev.stopPropagation();
  const fly = panelEl?.querySelector(".mc-dmp-flyout");
  if (!fly) return;
  const edge = ev.target.closest("[data-fly-resize]")?.dataset.flyResize === "top" ? "top" : "bottom";
  const startY = ev.clientY;
  const r = fly.getBoundingClientRect();
  const pr = panelEl.getBoundingClientRect();
  const startH = r.height;
  const startTop = r.top - pr.top;       // the flyout's offset inside the panel
  const floor = flyMinH();               // the primary's height — measured once; can't move mid-drag
  const ceiling = window.innerHeight - 24;
  const SNAP = 10; // px — snap the dragged edge to the primary window's matching edge when close
  const move = (e) => {
    const dy = e.clientY - startY;
    if (edge === "bottom") {
      // drag down = taller; the top edge stays where it is
      let h = Math.round(Math.max(floor, Math.min(ceiling, startH + dy)));
      const top = Math.round(startTop);
      // snap the BOTTOM edge to the primary's bottom (top + h ≈ floor)
      if (Math.abs((top + h) - floor) <= SNAP) h = Math.max(floor, floor - top);
      flyMaxH = h; flyTop = top;
    } else {
      // drag up = taller, growing UPWARD: the BOTTOM edge stays put, so top and height move together
      let h = Math.round(Math.max(floor, Math.min(ceiling, startH - dy)));
      let top = Math.round(startTop + (startH - h));
      // snap the TOP edge to the primary's top (0), keeping the bottom put
      if (Math.abs(top) <= SNAP) { const bottom = startTop + startH; top = 0; h = Math.max(floor, bottom - top); }
      flyMaxH = h; flyTop = top;
    }
    fly.style.height = `${flyMaxH}px`;
    fly.style.top = `${flyTop}px`;
    fly.style.bottom = "auto";
  };
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    try {
      window.localStorage.setItem(FLY_KEY, String(flyMaxH));
      window.localStorage.setItem(FLY_TOP_KEY, String(flyTop));
    } catch (e) { /* ignore */ }
    clampPos(panelEl);
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

function onPointerDown(ev) {
  if (ev.target.closest("[data-fly-resize]")) return startFlyResize(ev); // resize the flyout height
  if (ev.target.closest("button, select, input")) return; // controls act, don't drag
  if (!ev.target.closest(".mc-dmp-drag, .mc-dmp-fly-head")) return; // only the window title bars drag —
  // NOT `.mc-dmp-head`, which is an internal section title (dragging the window from a content header
  // surprised the DM 2026-07-17).
  ev.preventDefault();
  const rect = panelEl.getBoundingClientRect();
  const offX = ev.clientX - rect.left, offY = ev.clientY - rect.top;
  const move = (e) => {
    const left = Math.max(0, Math.min(window.innerWidth - 44, e.clientX - offX));
    const top = Math.max(0, Math.min(window.innerHeight - 24, e.clientY - offY));
    panelEl.style.left = `${left}px`;
    panelEl.style.top = `${top}px`;
    panelEl.style.bottom = "auto";
  };
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    try { window.localStorage.setItem(POS_KEY, JSON.stringify({ left: parseInt(panelEl.style.left, 10), top: parseInt(panelEl.style.top, 10) })); } catch (e) {}
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

/** Always-on camera bar: focus the table display on the party + a manual-drive
 * toggle (the DM's pan/zoom mirrors to the display). Both also have keybindings
 * (P / M) for a Stream Deck. The manual button lights up while active. */
function cameraBarHTML() {
  const manualOn = globalThis.MobileCommand?.tvManualActive?.() ? "mc-active" : "";
  return `<div class="mc-dmp-cam">
    <button class="mc-dmp-cam-btn" data-cam="focus" title="Focus the display on the party (P)" aria-label="Focus on party"><i class="fas fa-bullseye"></i></button>
    <button class="mc-dmp-cam-btn ${manualOn}" data-cam="manual" title="Manual TV control: your pan/zoom drives the display (M)" aria-label="Manual TV control"><i class="fas fa-arrows-up-down-left-right"></i></button>
    <button class="mc-dmp-cam-btn" data-cam="fit" title="Fit the whole scene on the display" aria-label="Fit whole scene"><i class="fas fa-expand"></i></button>
    <button class="mc-dmp-cam-btn" data-cam="zoom-out" title="Zoom the display out" aria-label="Zoom display out"><i class="fas fa-magnifying-glass-minus"></i></button>
    <button class="mc-dmp-cam-btn" data-cam="zoom-in" title="Zoom the display in" aria-label="Zoom display in"><i class="fas fa-magnifying-glass-plus"></i></button>
  </div>`;
}

/** Top status row: a per-player presence light — green = present (on the active scene OR a canvasless
 *  phone), amber = a desktop client viewing a DIFFERENT scene, gray = offline. */
// Compact "away for" readout: 45s, 2m, 1h12m.
function fmtAway(secs) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

/** UI-BIBLE §3 — `(token icon) Name`, everywhere a creature is named.
 *  PC  → fa-circle-user in THAT PLAYER's colour.
 *  NPC → fa-dragon in the DM's colour (an NPC has no player, so it carries the DM's).
 *  The NAME is always ink, never tinted: many player colours are unreadable on our dark panels
 *  (a real one in the test world is #0001bf). The icon says whose it is; the text stays readable.
 *  One helper so the roster, request-rolls, downtime and the selected-token title can't drift. */
function ownerUser(actor) {
  return game.users.find(u => !u.isGM && u.character?.id === actor?.id)
      ?? game.users.find(u => !u.isGM && actor?.testUserPermission?.(u, "OWNER")) ?? null;
}
function ownerColor(actor) { return ownerUser(actor)?.color?.css ?? null; }
// Per-PC target assignment shown inline in the rolls tab (DM 2026-07-17): actorId -> [{uuid, name}].
// DM-local; the actual send goes to the player's phone via api.assignTargets.
let rollAssign = {};
// §rolls target picker (DM 2026-07-17 rework): tapping a PC's crosshair opens an ASSIGN MODE for
// THAT PC. While it's open, whatever the DM targets on the map becomes that PC's suggested
// target(s) — live, multi-select. Tapping the same crosshair closes it; tapping another switches;
// leaving the tab closes it. `rtAssignFor` = the actorId being assigned, or null.
let rtAssignFor = null;
function dmTargetList() {
  return Array.from(game.user.targets ?? []).map(t => ({ uuid: t.document?.uuid, name: t.document?.name ?? "?" })).filter(t => t.uuid);
}
// Open (or switch to) the picker for a PC. Preload the map with whatever's already assigned so the
// DM edits from the current set rather than a blank slate.
async function openRtAssign(actorId) {
  rtAssignFor = actorId;
  const ids = (rollAssign[actorId] ?? []).map(t => fromUuidSync?.(t.uuid)?.id).filter(Boolean);
  canvas.tokens?.setTargets(ids, { mode: "replace" }); // fires targetToken → syncRtAssign keeps it in step
}
// Close the picker. The assignment is already on the player (pushed live); clear the DM's own
// reticles so the player's targets own the table-visible confirmation (§11).
function closeRtAssign() {
  if (rtAssignFor == null) return;
  rtAssignFor = null;
  canvas.tokens?.setTargets([], { mode: "replace" });
}
// Live sync while the picker is open: the DM's current map targets → this PC's suggestion, pushed to
// the player's phone. Called from the targetToken hook.
function syncRtAssign() {
  if (rtAssignFor == null) return;
  const actor = game.actors.get(rtAssignFor);
  const u = ownerUser(actor);
  rollAssign[rtAssignFor] = dmTargetList();
  if (u) api.assignTargets(u.id, rollAssign[rtAssignFor].map(t => t.uuid));
}
function nameTag(actor, name) {
  const esc = foundry.utils.escapeHTML;
  const col = ownerColor(actor);
  const icon = col ? "fa-circle-user" : "fa-dragon";
  const colour = col ?? (game.user?.color?.css ?? "#c8a44d");
  return `<i class="fas ${icon} mc-nt-ico" style="color:${colour}"></i>`
       + `<span class="mc-nt-name">${esc(name ?? actor?.name ?? "")}</span>`;
}

function statusHTML() {
  const esc = foundry.utils.escapeHTML;
  // Pause + Show removed from this window (DM 2026-07-16). Both already live in Foundry's own UI,
  // and the panel is the DM's PHONE-FACING controls — anything the desktop already does well
  // doesn't earn a seat here. The pause GUARD (which freezes player actions) is untouched: that's
  // enforcement in rpc.js, not this button.
  const activeScene = game.scenes?.active?.id;
  const players = game.users.filter(u => !u.isGM);
  // Away-timer threshold (§7.8): seconds a phone may stay backgrounded before its dot goes red.
  let awayThreshold = 90;
  try { awayThreshold = Number(game.settings.get(MODULE_ID, "awayThresholdSeconds")); } catch (e) { /* default */ }
  if (!Number.isFinite(awayThreshold) || awayThreshold < 0) awayThreshold = 90;
  const chips = players.map(u => {
    // A phone client is canvasless (D2) so its viewedScene is null — that's "present
    // at the table via the shell", NOT "off on another scene". Only an active client
    // viewing a *real, different* scene is amber. Without this, every phone player
    // (the module's whole point) showed amber/"not in the scene" (DM 2026-06-22).
    let cls, state;
    if (!u.active) { cls = "mc-off"; state = "Offline"; }
    else if (u.viewedScene === activeScene) { cls = "mc-on"; state = "on the active scene"; }
    else if (u.viewedScene == null) { cls = "mc-on"; state = "connected (phone)"; }
    else { cls = "mc-amber"; state = "connected — on a different scene"; }
    // Red escalation: a CONNECTED player whose app has been backgrounded ≥ the threshold.
    const pres = presenceState.get(u.id);
    if (u.active && pres?.hidden) {
      const secs = Math.max(0, Math.floor((Date.now() - pres.since) / 1000));
      if (secs >= awayThreshold) { cls = "mc-red"; state = `away ${fmtAway(secs)}`; }
    }
    return `<span class="mc-dmp-pres ${cls}" title="${esc(playerLabel(u))} — ${state}"><i class="fas fa-circle"></i> ${esc(playerLabel(u))}</span>`;
  }).join("") || `<span class="mc-dmp-pres mc-off">No players</span>`;
  // Clock chip: the world time, read through the SC-optional adapter. Tap to set the campaign's
  // start time-of-day (our own clock only — when SC drives, it's read-only and shows a lock).
  const night = isNight();
  const sc = hasSimpleCalendar();
  const clock = `<div class="mc-dmp-clockgroup">
    ${sc ? "" : `<button class="mc-dmp-clock-step" data-dm-clock-nudge="-600" title="10 minutes earlier"><i class="fas fa-minus"></i></button>`}
    <button class="mc-dmp-clock ${night ? "mc-night" : ""}" data-dm-clock title="${sc ? "Simple Calendar is keeping time" : "Tap to set the game time"}">
      <i class="fas fa-${night ? "moon" : "sun"}"></i> ${esc(clockLabel())}${sc ? ` <i class="fas fa-lock mc-dmp-clock-sc"></i>` : ""}</button>
    ${sc ? "" : `<button class="mc-dmp-clock-step" data-dm-clock-nudge="600" title="10 minutes later"><i class="fas fa-plus"></i></button>`}
  </div>`;
  return `<div class="mc-dmp-status">${clock}<div class="mc-dmp-pres-row">${chips}</div></div>`;
}

/** Combat control strip — run the encounter from the panel. Pre-start: Roll all +
 *  Start. Started: previous / roll remaining NPCs / end / next, with a round +
 *  current-turn readout. All are stable core Combat methods. */
function combatHTML() {
  const c = game.combat;
  if (!c) return "";
  const esc = foundry.utils.escapeHTML;
  let btns;
  if (!c.started) {
    btns = `<button data-combat="rollAll" title="Roll initiative for everyone"><i class="fas fa-dice-d20"></i> Roll All</button>
      <button data-combat="start" title="Begin combat"><i class="fas fa-play"></i> Start</button>`;
  } else {
    btns = `<button data-combat="prev" title="Previous turn"><i class="fas fa-backward-step"></i></button>
      <button data-combat="rollNPC" title="Roll remaining NPC initiative"><i class="fas fa-dice-d20"></i></button>
      <button data-combat="end" title="End combat"><i class="fas fa-flag-checkered"></i></button>
      <button data-combat="next" title="Next turn"><i class="fas fa-forward-step"></i></button>`;
  }
  const label = c.started ? `R${c.round} · ${esc(c.combatant?.name ?? "—")}` : "Not started";
  return `<div class="mc-dmp-combat">
      <div class="mc-dmp-turn"><i class="fas fa-khanda"></i> ${label}</div>
      <div class="mc-dmp-combatbtns">${btns}</div>
    </div>`;
}

/** Controlled (selected) tokens that have an actor — the quick-HP targets. */
function controlledWithActors() {
  // Group actors have no meaningful HP — selecting the party token must not
  // offer Damage/Heal (DM 2026-07-03: "group damage/heal doesn't make sense").
  return (canvas.tokens?.controlled ?? []).filter((t) => t.actor && t.actor.type !== "group");
}

/** Apply an HP delta to an actor (negative = damage, positive = heal). Damage eats
 *  temp HP first; both clamp to [0, max]. Direct update — robust across dnd5e versions. */
async function applyHpDelta(actor, delta) {
  const hp = actor.system?.attributes?.hp;
  if (!hp) return;
  if (delta < 0) {
    let dmg = -delta;
    const temp = hp.temp || 0;
    const fromTemp = Math.min(temp, dmg);
    dmg -= fromTemp;
    await actor.update({ "system.attributes.hp.temp": temp - fromTemp, "system.attributes.hp.value": Math.max(0, (hp.value ?? 0) - dmg) });
  } else {
    await actor.update({ "system.attributes.hp.value": Math.min(hp.max ?? 0, (hp.value ?? 0) + delta) });
  }
}

/** Quick HP: Damage / Heal the selected token(s) without opening a sheet. */
function quickHpHTML() {
  const toks = controlledWithActors();
  // ALWAYS render the block, even with nothing selected (DM 2026-07-17): the panel's height is
  // then the same whether or not a token is picked, so it never jumps under the DM's hand — and
  // Form up / Start the night stay exactly where the muscle memory left them.
  // The empty state reserves the REAL row — the same three controls, rendered invisible — with the
  // note laid over them. So the two states are identical in height by CONSTRUCTION, whatever those
  // buttons measure on a given client.
  //
  // v0.1.194 matched them with a hardcoded --mc-hp-row-h: 34px, which is what MY buttons happen to
  // measure. The DM still saw the panel jump (2026-07-17, "a big bug in my eyes") and he was right:
  // at a different UI scale or font the row is not 34 and the floor misses. Never pin two things
  // to a number when you can pin them to each other.
  if (!toks.length) {
    return `<div class="mc-dmp-hp mc-dmp-hp-empty">
      <div class="mc-dmp-hp-head"><i class="fas fa-hand-pointer"></i> No token selected</div>
      <div class="mc-dmp-hp-slot">
        <div class="mc-dmp-hp-row" aria-hidden="true">
          <button class="mc-dmp-hp-btn mc-dmp-dmg" disabled tabindex="-1">− Damage</button>
          <input class="mc-dmp-hp-input" type="number" disabled tabindex="-1">
          <button class="mc-dmp-hp-btn mc-dmp-heal" disabled tabindex="-1">Heal +</button>
        </div>
        <div class="mc-dmp-note">Select a token for more</div>
      </div>
    </div>`;
  }
  const esc = foundry.utils.escapeHTML;
  // §3: `(token icon) Name` — the icon carries identity, the name stays ink.
  const label = toks.length === 1
    ? nameTag(toks[0].actor, toks[0].name)
    : `<i class="fas fa-users mc-nt-ico"></i><span class="mc-nt-name">${toks.length} tokens</span>`;
  // Show the selected token's current HP (value/max) as a faint placeholder in the amount field — it
  // disappears the moment the DM types a number (DM 2026-07-19). Single token only; a mixed selection
  // has no one number to show.
  const hp = toks.length === 1 ? toks[0].actor?.system?.attributes?.hp : null;
  const hpHint = hp && hp.max != null ? `${hp.value ?? 0}/${hp.max}` : "";
  return `<div class="mc-dmp-hp">
      <div class="mc-dmp-hp-head">${label}</div>
      <div class="mc-dmp-hp-row">
        <button class="mc-dmp-hp-btn mc-dmp-dmg" data-hp="damage" title="Damage the selected token(s)">− Damage</button>
        <input class="mc-dmp-hp-input" type="number" min="0" step="1" inputmode="numeric" placeholder="${esc(hpHint)}" aria-label="HP amount (current ${esc(hpHint || "HP")})">
        <button class="mc-dmp-hp-btn mc-dmp-heal" data-hp="heal" title="Heal the selected token(s)">Heal +</button>
      </div>
    </div>`;
}

/** AoE-push / summon section: a Place (or Summon) button per pending cast. */
function pendingHTML(pending) {
  const esc = foundry.utils.escapeHTML;
  const rows = pending.map(pc => `
    <div class="mc-dmp-cast" data-cast="${pc.id}">
      <span class="mc-dmp-cast-info"><b>${esc(pc.casterName)}</b> — ${esc(pc.spellName)}</span>
      <button class="mc-dmp-place" data-place="${pc.id}">${pc.kind === "summon" ? "Summon" : "Place"}</button>
      <button class="mc-dmp-cast-x" data-dismiss="${pc.id}" aria-label="Dismiss">✕</button>
    </div>`).join("");
  const head = pending.every(p => p.kind === "summon") ? "Place summon" : "Place spell";
  return `
    <div class="mc-dmp-head"><span>${head}${pending.length === 1 ? "" : "s"}</span></div>
    <div class="mc-dmp-casts">${rows}</div>`;
}

// --- Party Mode (DESIGN §15): the DM's live view of the marching-order grid ----
// Mirrors the phones' 3×3 while a group is packed. Red cell = that spot is
// problematic at the CURRENT group-token position + facing (wall/occupied/stacked,
// computed locally — this client has the canvas). The DM can move anyone:
// click a member to pick them up, click a cell to set them down. Disperse warns
// on problems and arms into "Disperse anyway" (warnings-not-walls, §11).
let partySel = null;    // actorId the DM picked up
let partyForce = false; // "Disperse anyway" armed after a nofit

function packedGroup() {
  return game.actors.find(a => a.type === "group" && a.getFlag(MODULE_ID, "packed")) ?? null;
}

/** An unpacked group with members — the "Form up" candidate. Clustering isn't
 *  pre-checked here; partyPack validates and returns a clear reason on click. */
function candidateGroup() {
  return game.actors.find(a => a.type === "group" && !a.getFlag(MODULE_ID, "packed")
    && (a.system?.members ?? []).some(m => m.actor)) ?? null;
}

/** Unique player-owned actors with a friendly token on the active scene — the
 *  natural party members for the one-tap populate/rebuild. Includes summons and
 *  pets (any player-owned FRIENDLY token, not just type "character") so a druid's
 *  24-hour beast can travel with the pack (DM 2026-07-07); Item Piles stores and
 *  group actors are excluded. */
function scenePartyActors() {
  const seen = new Set(), out = [];
  for (const t of game.scenes?.active?.tokens ?? []) {
    const a = t.actor;
    if (!a || a.type === "group" || seen.has(a.id)) continue;
    if (!a.hasPlayerOwner) continue;
    if (t.disposition !== CONST.TOKEN_DISPOSITIONS.FRIENDLY) continue;
    if (a.flags?.["item-piles"]) continue;
    seen.add(a.id); out.push(a);
  }
  return out;
}

// MAIN area (DM 2026-07-03): only Form up / Disperse live here — stable width.
// The marching-order grid + rotate + lock-in + release/combine moved to the
// "Party order" dock tab (auto-opens on pack, closes on disperse).
// Reaction widget (DM 2026-07-07): non-modal chips instead of dialogs/toasts.
// "aoo" chips are ACTIONABLE (an NPC could take an opportunity attack — ⚔ fires
// it, ✕ declines); "window" chips are passive awareness that a PLAYER is deciding
// a reaction on their phone. Every chip expires with its reaction window.
function reactionsHTML() {
  const now = Date.now();
  dmReactions = dmReactions.filter(r => r.expiresAt > now);
  if (!dmReactions.length) return "";
  const chips = dmReactions.map(r => r.kind === "aoo"
    ? `<div class="mc-dmp-react mc-dmp-react-aoo">
        <span class="mc-dmp-react-txt"><i class="fas fa-bolt"></i> ${foundry.utils.escapeHTML(r.label)}</span>
        <button data-dmreact-fire="${r.id}" title="Take the opportunity attack (${foundry.utils.escapeHTML(r.weapon)})"><i class="fas fa-hand-fist"></i></button>
        <button data-dmreact-x="${r.id}" title="Let them go"><i class="fas fa-xmark"></i></button>
      </div>`
    : r.kind === "scribe"
    ? `<div class="mc-dmp-react mc-dmp-react-scribe">
        <span class="mc-dmp-react-txt"><i class="fas fa-feather-pointed"></i> ${foundry.utils.escapeHTML(r.label)}<br><em>suggested: ${foundry.utils.escapeHTML(r.cost)}</em></span>
        <button data-dmscribe-ok="${r.id}" title="Approve — the spell lands unprepared, the scroll is spent (cost is yours to collect)"><i class="fas fa-check"></i></button>
        <button data-dmscribe-x="${r.id}" title="Decline — nothing changes"><i class="fas fa-xmark"></i></button>
      </div>`
    : r.kind === "summon"
    ? `<div class="mc-dmp-react mc-dmp-react-summon">
        <span class="mc-dmp-react-txt"><i class="fas fa-ghost"></i> ${foundry.utils.escapeHTML(r.label)}</span>
        <button data-dmsummon-ok="${r.id}" title="Grant control — the summon appears in their phone's token switcher"><i class="fas fa-check"></i></button>
        <button data-dmsummon-x="${r.id}" title="Keep it DM-driven"><i class="fas fa-xmark"></i></button>
      </div>`
    : r.kind === "trade"
    ? `<div class="mc-dmp-react mc-dmp-react-trade">
        <span class="mc-dmp-react-txt"><i class="fas fa-hand-holding-heart"></i> ${foundry.utils.escapeHTML(r.label)}<br><em>receiver offline — accept for them?</em></span>
        <button data-dmtrade-ok="${r.id}" title="Accept — hand the items over"><i class="fas fa-check"></i></button>
        <button data-dmtrade-x="${r.id}" title="Decline"><i class="fas fa-xmark"></i></button>
      </div>`
    : `<div class="mc-dmp-react mc-dmp-react-win">
        <span class="mc-dmp-react-txt"><i class="fas fa-hourglass-half"></i> ${foundry.utils.escapeHTML(r.label)}${r.weapon ? ` — ${foundry.utils.escapeHTML(r.weapon)}` : ""}</span>
      </div>`);
  return `<div class="mc-dmp-reactions">${chips.join("")}</div>`;
}

// §17.3 split-party awareness: PCs whose only token sits on a NON-active scene
// (ran ahead through a teleporter / left behind). Their phones show the paused
// overlay; the DM gets one chip per scene with a one-tap Activate — the ONLY
// automatic thing here is the awareness (DM 2026-07-08: the DM alone moves the
// active scene).
function splitPartyHTML() {
  const active = game.scenes.active;
  if (!active) return "";
  // Scope to the CURRENT party — group members + users' assigned characters —
  // not every player-owned PC in the world (first live run surfaced years of
  // demo PCs stranded on retired scenes as permanent chips).
  const party = new Set();
  for (const g of game.actors.filter(a => a.type === "group"))
    for (const m of (g.system?.members ?? [])) if (m.actor) party.add(m.actor.id);
  for (const u of game.users) if (!u.isGM && u.character) party.add(u.character.id);
  const onActive = new Set([...active.tokens].map(t => t.actorId).filter(Boolean));
  const byScene = new Map();
  for (const scene of game.scenes) {
    if (scene === active) continue;
    for (const t of scene.tokens) {
      const a = t.actor;
      if (!a || a.type !== "character" || !party.has(a.id) || onActive.has(a.id)) continue;
      if (!byScene.has(scene.id)) byScene.set(scene.id, { scene, names: new Set() });
      byScene.get(scene.id).names.add(a.name);
    }
  }
  if (!byScene.size) return "";
  const esc = foundry.utils.escapeHTML;
  const chips = [...byScene.values()].map(({ scene, names }) => `<div class="mc-dmp-react mc-dmp-split">
      <span class="mc-dmp-react-txt"><i class="fas fa-person-hiking"></i> ${names.size} PC${names.size > 1 ? "s" : ""} on ${esc(scene.name)} (${esc([...names].map(n => n.split(" ")[0]).join(", "))})</span>
      <button data-activate-scene="${scene.id}" title="Activate ${esc(scene.name)} — the split PCs play, everyone else's phone pauses"><i class="fas fa-tv"></i></button>
    </div>`);
  return `<div class="mc-dmp-reactions">${chips.join("")}</div>`;
}

function partyMainHTML() {
  const group = packedGroup();
  if (!group) {
    partySel = null; partyForce = false;
    const cand = candidateGroup();
    if (cand) {
      // Stale-membership guard (playtest 2026-07-05: the group still held the OLD
      // test party — "איפה הגרוק שלי"): if the scene's PCs aren't all members,
      // offer a rebuild next to Form up instead of letting pack fail cryptically.
      const scenePCs = scenePartyActors();
      const memberIds = new Set((cand.system?.members ?? []).map(m => m.actor?.id).filter(Boolean));
      // Stale in EITHER direction: a party-worthy token isn't a member (new PC,
      // fresh summon), or a member has no token here (unsummoned beast, old party).
      const sceneActorIds = new Set((game.scenes.active?.tokens ?? []).map(t => t.actor?.id).filter(Boolean));
      const memberGone = (cand.system?.members ?? []).some(m => m.actor && !sceneActorIds.has(m.actor.id));
      const stale = (scenePCs.length > 0 && scenePCs.some(a => !memberIds.has(a.id))) || memberGone;
      const rebuild = stale ? `<button class="mc-dmp-party-rebuild" data-party="rebuild" data-group="${cand.id}"
        title="${foundry.utils.escapeHTML(cand.name)}'s members don't match this scene — rebuild from the ${scenePCs.length} party tokens here">
        <i class="fas fa-arrows-rotate"></i></button>` : "";
      const roster = `<button class="mc-dmp-party-rebuild" data-party="roster" data-group="${cand.id}"
        title="Choose who's in ${foundry.utils.escapeHTML(cand.name)} — pick members from a checklist">
        <i class="fas fa-list-check"></i></button>`;
      return `<div class="mc-dmp-party-btns">
      <button class="mc-dmp-party-deploy" data-party="pack" data-group="${cand.id}" title="Collapse the clustered party into the ${foundry.utils.escapeHTML(cand.name)} token">
        <i class="fas fa-people-group"></i> Form Up</button>${rebuild}${roster}</div>`;
    }
    // No usable group → say WHY instead of rendering nothing (playtest 2026-07-05:
    // an empty group meant no Form up, no hint, and a very confused DM). One tap
    // adds the scene's player-owned PCs as members (or creates the group first).
    const scenePCs = scenePartyActors();
    if (!scenePCs.length) return ""; // nothing sensible to offer yet
    const emptyGroup = game.actors.find(a => a.type === "group" && !(a.system?.members ?? []).some(m => m.actor));
    return `<div class="mc-dmp-party-btns">
      <button class="mc-dmp-party-deploy mc-dmp-party-setup" data-party="populate" ${emptyGroup ? `data-group="${emptyGroup.id}"` : ""}
        title="${emptyGroup ? `Add them to ${foundry.utils.escapeHTML(emptyGroup.name)} (it has no members yet)` : "Create a group actor with these PCs as members"}">
        <i class="fas fa-user-plus"></i> ${emptyGroup ? `Add ${scenePCs.length} PCs to ${foundry.utils.escapeHTML(emptyGroup.name)}` : `Create party (${scenePCs.length} PCs)`}</button>
      <button class="mc-dmp-party-rebuild" data-party="roster" ${emptyGroup ? `data-group="${emptyGroup.id}"` : ""}
        title="Choose members from a checklist instead of taking everyone">
        <i class="fas fa-list-check"></i></button></div>`;
  }
  const arranging = ((group.getFlag(MODULE_ID, "formation") ?? {}).stage ?? "arrange") === "arrange";
  if (arranging) return `<button class="mc-dmp-party-mini" data-dock="party"><i class="fas fa-border-all"></i> Arrange &amp; lock in</button>`;
  return `<div class="mc-dmp-party-btns">
    <button class="mc-dmp-party-deploy ${partyForce ? "mc-warn" : ""} ${game.combat?.combatants.some(cb => cb.actorId === group.id) ? "mc-nudge" : ""}" data-party="deploy">
      <i class="fas ${partyForce ? "fa-triangle-exclamation" : "fa-people-arrows"}"></i> ${partyForce ? "Disperse anyway" : "Disperse"}</button></div>`;
}

// §17.4 guard duty (DM-initiated, signed off 2026-07-08). Night state lives on
// the group actor's `night` flag: { stage: "assign"|"watch", watch: 1..3,
// watches: {1:[actorIds],2:[],3:[]} }. Zzz = the core "sleep" status as a pure
// visual marker (no mechanics until an encounter); conditions only on the
// encounter-start OFFER. No race logic — the DM taps individuals awake.
function nightGroup() {
  return game.actors.find(a => a.type === "group" && a.getFlag(MODULE_ID, "night"))
    ?? game.actors.find(a => a.type === "group" && (a.system?.members ?? []).some(m => m.actor));
}

function nightMembers(group) {
  return (group?.system?.members ?? []).map(m => m.actor).filter(a => a && a.type === "character");
}

// Watch-eligible members: every party member that can keep a watch — the PCs AND player-owned
// pets/summons (a druid's owl, a familiar, a beast companion). A pet was silently dropped from the
// watch grid because nightMembers() keeps only type "character" (DM 2026-07-22: "I don't think pets
// can take watch shifts — that's a bug"), even though scenePartyActors() deliberately folds those
// same pets INTO the travelling group (DM 2026-07-07). This is the superset used for WATCHES and
// the sleep/wake markers only; nightMembers() stays character-only for the dnd5e rest and the
// downtime roster, because a summon neither takes a long rest nor learns a language.
function watchMembers(group) {
  return (group?.system?.members ?? []).map(m => m.actor)
    .filter(a => a && a.type !== "group" && (a.type === "character" || a.hasPlayerOwner));
}

// ── §19 Rest — one lifecycle folding Downtime + Watches (DESIGN.md §19) ──────────
// The Rest is the single entry (a setup card) and the single ending. It DRIVES the two existing
// mechanisms instead of replacing them: the downtime window (a world setting) and the watch board
// (the group's `night` flag). The envelope itself lives on the party group's `rest` flag —
// { size:"short"|"long", phases:{downtime,watches}, startedAt }. No flag = not resting.
function restGroup() {
  return game.actors.find(a => a.type === "group" && a.getFlag(MODULE_ID, "rest"))
    ?? nightGroup();
}
function restState() { return restGroup()?.getFlag(MODULE_ID, "rest") ?? null; }
function isResting() { return !!restState(); }

function restSetupCard(group) {
  const canRest = nightMembers(group).length > 0;
  const d = restDraft, plan = restPlan(d);
  const seg = (val, label) => `<button class="mc-rest-seg ${d.type === val ? "mc-on" : ""}" data-rest-type="${val}">${label}</button>`;
  const restWord = plan.size === "long" ? "long rest" : "short rest";
  const canWatch = !plan.downtime;
  const lead = plan.downtime ? "Downtime"
    : plan.watches ? (plan.size === "short" ? "One watch" : "Watches")
    : "";
  const hint = lead ? `${lead}, then a ${restWord}.` : `A ${restWord}, applied right away.`;
  // Downtime has no watches (a safe hub) — the toggle is disabled and reads why.
  const watchBtn = `<button class="mc-rest-chk mc-rest-watchtoggle ${plan.watches ? "mc-on" : ""}" data-rest-watches ${canWatch ? "" : "disabled"} title="${canWatch ? "" : "Downtime is a safe hub — no watches"}">
      <i class="fas ${plan.watches ? "fa-square-check" : "fa-square"}"></i> <i class="fas fa-moon"></i> ${canWatch ? (plan.size === "short" ? "One watch" : "Set watches") : "No watches"}</button>`;
  return `<div class="mc-rest-setup">
    <div class="mc-rest-segs mc-rest-types">${seg("short", "Short")}${seg("long", "Long")}${seg("downtime", "Downtime")}</div>
    ${watchBtn}
    <button class="mc-dmp-party-deploy mc-rest-go" data-rest-start ${canRest ? "" : "disabled"}><i class="fas fa-campground"></i> Start Rest</button>
    <p class="mc-rest-hint">${canRest ? hint : "No party group with members — set one up first."}</p>
  </div>`;
}

// The rest runs in stages (§19.3): assign watches → clock starts → downtime → watch phase →
// morning. Stages for a phase that's off are skipped. Watch data lives on the `night` flag.
function watchSlots(night) { return Array.from({ length: night?.count ?? 3 }, (_, i) => i + 1); }
function filledWatches(night) { return watchSlots(night).filter(w => (night?.watches?.[w] ?? []).length); }
function watchSeconds(size, night) {
  const total = (size === "long" ? 8 : 1) * 3600;
  return Math.round(total / (filledWatches(night).length || 1));
}
function fmtDur(sec) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}
const firstName = id => game.actors.get(id)?.name?.split(" ")[0] ?? "?";

// The per-PC × three-watch grid. Tap a chip to toggle that PC on/off that watch; mid-watch edits
// re-apply who's asleep (the existing data-night handlers). Shared by the assign and watch stages.
function watchEditor(group, night) {
  const esc = foundry.utils.escapeHTML;
  if (!night) return "";
  // A labelled header row so the bare 1/2/3 chips read as watch slots (DM 2026-07-17: "I don't
  // understand how watches are set"). Each column = a watch; each row = a PC; a lit chip = that PC
  // stands that watch.
  const slots = watchSlots(night);
  const ord = ["1st", "2nd", "3rd"];
  // Identity per the bible §3: `(token icon in player colour) Name(ink)`. A bare name with no icon
  // got skipped entirely (DM 2026-07-17 — the whole reason watches read as unreadable).
  const idIcon = a => `<i class="fas fa-circle-user mc-dmp-nw-id" style="color:${pcColor(a)}"></i>`;
  const head = `<div class="mc-dmp-nw-row mc-dmp-nw-head"><span></span><span class="mc-dmp-nw-chips">
    ${slots.map(w => `<span class="mc-dmp-nw-h">${ord[w - 1]}</span>`).join("")}</span></div>`;
  const rows = watchMembers(group).map(a => {
    const chips = slots.map(w => `<button class="mc-dmp-nw ${(night.watches?.[w] ?? []).includes(a.id) ? "mc-on" : ""}"
        data-night="dm-toggle" data-group="${group.id}" data-actor="${a.id}" data-watch="${w}" title="Put ${esc(a.name.split(" ")[0])} on ${ord[w - 1]} watch">${w}</button>`).join("");
    return `<div class="mc-dmp-nw-row"><span class="mc-dmp-nw-who" title="${esc(a.name)}">${idIcon(a)}<span class="mc-dmp-nw-name">${esc(a.name.split(" ")[0])}</span></span><span class="mc-dmp-nw-chips">${chips}</span></div>`;
  }).join("");
  // Header stays put; the PC rows scroll (DM 2026-07-18: "~4-5 above the fold with a scroll for more").
  return `<div class="mc-dmp-night-edit">${head}<div class="mc-dmp-nw-scroll">${rows}</div></div>`;
}

function restHTML() {
  const esc = foundry.utils.escapeHTML;
  const group = restGroup();
  if (!group) return `<div class="mc-dt-panel"><p class="mc-rest-hint">No party group with members — set one up first.</p></div>`;
  const rest = group.getFlag(MODULE_ID, "rest");
  if (!rest) {
    // Not resting: the setup card, with the authoring catalog still reachable below it.
    return `<div class="mc-dt-panel">${restSetupCard(group)}${dtDrawer("catalog", "Activities", catalogNewBtn(), catalogHTML(downtimeState()))}</div>`;
  }
  const night = group.getFlag(MODULE_ID, "night");
  const filled = night ? filledWatches(night) : [];
  const stageLabel = {
    assign: "Assign watches",
    downtime: "Downtime",
    watches: night ? `Watch ${filled.indexOf(night.watch) + 1} of ${filled.length}` : "Watch",
    morning: "Morning",
  }[rest.stage] ?? "Rest";
  const header = `<div class="mc-rest-head">
    <span class="mc-rest-badge"><i class="fas fa-campground"></i> ${rest.size === "long" ? "Long" : "Short"} · ${esc(stageLabel)}</span>
    <span class="mc-rest-time"><i class="fas fa-${isNight() ? "moon" : "sun"}"></i> ${esc(readClock().time)}</span>
  </div>`;

  let body = "", advance = "", extra = "";
  if (rest.stage === "assign") {
    const one = (night?.count ?? 3) === 1;
    body = `<div class="mc-dmp-night-box"><div class="mc-dmp-head"><i class="fas fa-moon"></i> Set the watch${one ? "" : "es"}</div>
      ${watchEditor(group, night)}</div>`;
    advance = `<button class="mc-dmp-party-deploy mc-rest-adv" data-rest-advance><i class="fas fa-play"></i> Begin Rest</button>`;
  } else if (rest.stage === "downtime") {
    body = downtimeHTML(true);
    advance = rest.phases?.watches
      ? `<button class="mc-dmp-party-deploy mc-rest-adv" data-rest-advance><i class="fas fa-forward"></i> To Watches</button>`
      : `<button class="mc-dmp-party-deploy mc-rest-end" data-rest-end title="Apply the rest to the party"><i class="fas fa-check"></i> Finish</button>`;
  } else if (rest.stage === "watches") {
    const w = night?.watch;
    const duty = (night?.watches?.[w] ?? []).map(firstName).join(", ") || "nobody";
    const steps = filled.map(n => `<button class="mc-dmp-night-step ${w === n ? "mc-on" : ""}" data-night="watch" data-watch="${n}" data-group="${group.id}"
        title="${(night.watches?.[n] ?? []).map(firstName).join(", ") || "nobody"} on duty">${filled.indexOf(n) + 1}</button>`).join("");
    const secs = watchSeconds(rest.size, night);
    // No Event/Encounter buttons: they only set a badge and did nothing (DM 2026-07-17). If something
    // happens the DM just runs it — the off-watch PCs are already asleep — then Pass Watch to move on.
    // Duration reads as a label after the chips, not baked into the button (bible §7).
    body = `<div class="mc-dmp-night-box"><div class="mc-dmp-head"><i class="fas fa-moon"></i> Current watch — ${esc(duty)}</div>
      ${watchEditor(group, night)}
      <div class="mc-rest-watchbar"><span class="mc-dmp-party-btns mc-rest-steps">${steps}</span><span class="mc-rest-dur">${fmtDur(secs)}</span></div>
      <button class="mc-dmp-party-deploy mc-rest-pass" data-rest-pass title="Nothing more this watch — advance the clock and move on"><i class="fas fa-hourglass-half"></i> Pass Watch</button>
    </div>`;
    extra = `<button class="mc-dmp-party-deploy mc-rest-end" data-rest-end title="Finish now — apply the rest to the party"><i class="fas fa-check"></i> Finish</button>`;
  } else { // morning
    body = `<div class="mc-dmp-night-box"><div class="mc-dmp-head"><i class="fas fa-sun"></i> Morning</div>
      <p class="mc-rest-hint">The watch is over. End the rest to apply the ${rest.size === "long" ? "long" : "short"} rest to the party.</p></div>`;
    advance = `<button class="mc-dmp-party-deploy mc-rest-end" data-rest-end><i class="fas fa-check"></i> Finish</button>`;
  }
  // A LABELLED cancel, not a lone X — an icon-only exit gets missed (bible §4; DM 2026-07-17
  // "no way to cancel the rest once it's started"). Tertiary, sits under the primary action.
  const foot = `<div class="mc-rest-endbar">${advance}${extra}</div>
    <button class="mc-rest-cancel" data-rest-cancel title="Call off the rest — nothing is applied"><i class="fas fa-xmark"></i> Cancel rest</button>`;
  return `<div class="mc-dt-panel mc-rest-active">${header}${body}${foot}</div>`;
}

// Apply a dnd5e rest to the party (the group's members — the party is usually camped off the
// active map, so this is NOT the in-scene set). The ONE place a rest lands (§19).
async function applyPartyRest(group, size) {
  const rested = nightMembers(group);
  let n = 0;
  for (const a of rested) {
    try { await (size === "long" ? a.longRest({ dialog: false }) : a.shortRest({ dialog: false })); n++; }
    catch (e) { console.warn(`${MODULE_ID} | rest failed for ${a.name}`, e); }
  }
  // Pass the party that rested — they're camped off-scene, so the in-scene default would tick nothing.
  if (size === "long") await advanceRestGoals(new Set(rested.map(a => a.id)));
  ui.notifications?.info(`${size === "long" ? "Long" : "Short"} rest — ${n} character${n === 1 ? "" : "s"} rested.`);
}
// Begin a rest from the setup draft. Neither phase → a plain dnd5e rest applied now (no ceremony).
async function startRest() {
  const group = restGroup();
  if (!group) return;
  const { size, downtime, watches } = restPlan(restDraft);
  if (!downtime && !watches) { await applyPartyRest(group, size); return render(); }
  const stage = watches ? "assign" : "downtime";
  await group.setFlag(MODULE_ID, "rest", { id: foundry.utils.randomID(), size, phases: { downtime, watches }, stage, startedAt: game.time?.worldTime ?? 0 });
  if (watches) {
    // Fresh session id re-arms every phone's board (2026-07-09: a dismissed board stayed hidden).
    // `count` carries the type's watch count (short=1, long=3) so both the DM grid and the phones
    // show only the slots this rest actually has.
    await group.setFlag(MODULE_ID, "night", { id: foundry.utils.randomID(), stage: "assign", watch: 0, count: watchCount(size), watches: { 1: [], 2: [], 3: [] } });
  } else {
    await api.downtime({ op: "openWindow", size }); // downtime-only → its window opens straight away
  }
  render();
}
// Start the running watch phase: sleep everyone not on the first filled watch. Returns false if
// nobody is on any watch (the DM ticked Watches but assigned no one) — the caller skips the phase.
async function beginWatchRun(group) {
  const night = foundry.utils.deepClone(group.getFlag(MODULE_ID, "night"));
  const filled = filledWatches(night);
  if (!filled.length) return false;
  night.stage = "watch"; night.watch = filled[0];
  await group.setFlag(MODULE_ID, "night", night);
  await applyWatchSleep(group);
  return true;
}
// Move the rest to its next stage, opening/closing the mechanisms each stage owns.
async function advanceRest() {
  const group = restGroup();
  const rest = group?.getFlag(MODULE_ID, "rest");
  if (!rest) return;
  const setStage = (s) => group.setFlag(MODULE_ID, "rest", { ...rest, stage: s });
  if (rest.stage === "assign") {
    // Clock starts. Downtime first (if on), else straight to the watch run.
    if (rest.phases?.downtime) { await api.downtime({ op: "openWindow", size: rest.size }); await setStage("downtime"); }
    else { await (await beginWatchRun(group) ? setStage("watches") : setStage("morning")); }
  } else if (rest.stage === "downtime") {
    if (downtimeOpen()) await api.downtime({ op: "closeWindow" });
    if (rest.phases?.watches && await beginWatchRun(group)) await setStage("watches");
    else await setStage("morning");
  } else if (rest.stage === "watches") {
    // "To Morning" — skip the remaining watches. Move the stage FIRST so the re-render that the
    // night-flag unset triggers already sees "morning" (never stage=watches with no night flag).
    await setStage("morning");
    if (group.getFlag(MODULE_ID, "night")) { await clearNightSleep(group); await group.unsetFlag(MODULE_ID, "night"); }
  }
  render();
}
// Pass the current watch: advance the real world clock by its share of the rest, then step to the
// next filled watch — or to morning after the last one. Time-based effects listen to worldTime, so
// this really passes time (§19.5-2).
async function passWatch() {
  const group = restGroup();
  const rest = group?.getFlag(MODULE_ID, "rest");
  const night = group?.getFlag(MODULE_ID, "night");
  if (!rest || !night) return;
  const secs = watchSeconds(rest.size, night);
  if (game.user?.isGM) await game.time.advance(secs);
  const filled = filledWatches(night);
  const next = filled[filled.indexOf(night.watch) + 1];
  if (next != null) {
    await group.setFlag(MODULE_ID, "night", { ...night, watch: next });
    await applyWatchSleep(group);
    ui.notifications?.info(`${fmtDur(secs)} passes — ${filled.indexOf(next) + 1}${["st", "nd", "rd"][filled.indexOf(next)] ?? "th"} watch.`);
  } else {
    // Last watch passed → morning. Stage first, then tear down the night flag (see advanceRest).
    await group.setFlag(MODULE_ID, "rest", { ...rest, stage: "morning" });
    await clearNightSleep(group);
    await group.unsetFlag(MODULE_ID, "night");
    ui.notifications?.info(`${fmtDur(secs)} passes — the watch is over.`);
  }
  render();
}
// End (or call off) the rest. This is the ONE place a dnd5e rest applies (§19). Tears down both
// mechanisms either way; only `apply` lands the actual rest.
async function endRest(apply) {
  const group = restGroup();
  if (!group) return;
  const rest = group.getFlag(MODULE_ID, "rest");
  if (group.getFlag(MODULE_ID, "night")) { await clearNightSleep(group); await group.unsetFlag(MODULE_ID, "night"); }
  if (downtimeOpen()) await api.downtime({ op: "closeWindow" });
  await group.unsetFlag(MODULE_ID, "rest");
  if (apply && rest) await applyPartyRest(group, rest.size);
  render();
}

// dnd5e's Sleeping condition drags Unconscious + its Incapacitated/Prone riders,
// and the night ambush adds Surprised. dnd5e SHOULD cascade-remove the riders
// when Sleeping is toggled off, but it doesn't reliably (DM 2026-07-09: "after
// the long rest the PCs are still Prone"), so waking explicitly strips the whole
// cluster.
const SLEEP_CLUSTER = ["sleeping", "unconscious", "incapacitated", "prone", "surprised"];
async function wakeActor(a) {
  // Toggle each cluster status off through dnd5e's own status API (NOT a raw effect delete — that
  // bypasses the linkage and leaves "prone" re-derived from unconscious, DM 2026-07-09). Removing
  // "sleeping" cascade-removes some riders, so a later toggle can hit an already-gone effect and
  // the DB logs a harmless "ActiveEffect … does not exist" — swallowed per status so a cosmetic
  // marker never aborts a rest stage transition (DM 2026-07-17).
  for (const s of SLEEP_CLUSTER) {
    if (!a.statuses.has(s)) continue;
    try { await a.toggleStatusEffect(s, { active: false }); }
    catch (e) { console.warn(`${MODULE_ID} | wake: couldn't clear ${s} on ${a.name}`, e); }
  }
}

// dnd5e's sleep cluster uses FIXED effect ids and an unreliable rider cascade, so rapid sleep/wake
// across watch changes trips "already exists"/"does not exist" DB errors that surface as red banners
// (DM 2026-07-17, passing a watch). We (a) always wake to a clean state before re-sleeping so a
// stale rider can't collide with the cascade's fresh create, and (b) drop exactly those two DB
// messages while our sleep ops run — every other notification passes through untouched.
async function withQuietSleepNoise(fn) {
  const n = ui?.notifications;
  const orig = n?.notify?.bind(n);
  const drop = /ActiveEffect .* does not exist|already exists within the parent collection/i;
  if (orig) n.notify = (m, ...r) => (typeof m === "string" && drop.test(m)) ? undefined : orig(m, ...r);
  try { return await fn(); }
  finally { if (orig) setTimeout(() => { n.notify = orig; }, 500); } // cover the cascade's async tail
}

// On-duty PCs wake, everyone else sleeps (marker only — the DM taps any chip off
// to wake someone, and non-sleeper races are exactly that manual toggle).
async function applyWatchSleep(group) {
  const night = group.getFlag(MODULE_ID, "night");
  const onDuty = new Set(night?.watches?.[night.watch] ?? []);
  await withQuietSleepNoise(async () => {
    for (const a of watchMembers(group)) { // pets sleep/wake with the party too — they can stand watch
      const shouldSleep = !onDuty.has(a.id);
      try {
        // Clean any leftover riders first, THEN add sleeping fresh → the cascade's create can't clash.
        if (shouldSleep && !a.statuses.has("sleeping")) { await wakeActor(a); await a.toggleStatusEffect("sleeping", { active: true }); }
        else if (!shouldSleep && a.statuses.has("sleeping")) await wakeActor(a);
      } catch (e) { console.warn(`${MODULE_ID} | watch sleep toggle failed for ${a.name}`, e); }
    }
  });
}

async function clearNightSleep(group) {
  await withQuietSleepNoise(async () => { for (const a of watchMembers(group)) await wakeActor(a); }); // wake pets too
}

async function nightLongRestPrompt(group) {
  const yes = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Morning" },
    content: `<p>Night passes — grant the party a <b>long rest</b>?</p>`
  }).catch(() => false);
  if (!yes) return;
  const rested = nightMembers(group);
  for (const a of rested) {
    try { await a.longRest({ dialog: false, chat: false }); } catch (e) { console.warn(`${MODULE_ID} | rest failed for ${a.name}`, e); }
  }
  const advanced = await advanceRestGoals(new Set(rested.map(a => a.id))); // tick per-rest goals here too
  ui.notifications.info(`${group.name}: long rest granted${advanced ? `, ${advanced} nightly goal${advanced === 1 ? "" : "s"} advanced` : ""}.`);
}

async function onNightClick(ev) {
  const btn = ev.target.closest("[data-night]");
  if (!btn) return false;
  const group = game.actors.get(btn.dataset.group);
  if (!group) return true;
  const D = foundry.applications.api.DialogV2;
  try {
    switch (btn.dataset.night) {
      case "start": {
        const res = await D.wait({
          window: { title: "Start the night" },
          content: `<p>Send the <b>watch board</b> to the phones (three watches, players place themselves) — or skip guard duty and go straight to the morning?</p>`,
          buttons: [ // bible §4.1.1: right is forward — DialogV2 renders array order L→R
            { action: "cancel", label: "Cancel" },
            { action: "skip", label: "Skip guard duty", icon: "fas fa-forward" },
            { action: "board", label: "Watch board", icon: "fas fa-moon", default: true }
          ]
        }).catch(() => null);
        // A fresh session id per night re-arms every phone's "browse my sheet"
        // dismissal (2026-07-09: a dismissed board stayed hidden across a restart).
        if (res === "board") await group.setFlag(MODULE_ID, "night", { id: foundry.utils.randomID(), stage: "assign", watch: 0, watches: { 1: [], 2: [], 3: [] } });
        else if (res === "skip") await nightLongRestPrompt(group);
        break;
      }
      case "dm-toggle": {
        const night = foundry.utils.deepClone(group.getFlag(MODULE_ID, "night"));
        if (!night) break;
        const w = Number(btn.dataset.watch);
        const row = new Set(night.watches?.[w] ?? []);
        if (row.has(btn.dataset.actor)) row.delete(btn.dataset.actor); else row.add(btn.dataset.actor);
        night.watches = { ...(night.watches ?? {}), [w]: [...row] };
        await group.setFlag(MODULE_ID, "night", night);
        if (night.stage === "watch") await applyWatchSleep(group); // mid-night edit → re-sleep
        break;
      }
      case "lock": {
        const night = foundry.utils.deepClone(group.getFlag(MODULE_ID, "night"));
        night.stage = "watch"; night.watch = 1;
        await group.setFlag(MODULE_ID, "night", night);
        await applyWatchSleep(group);
        break;
      }
      case "watch": {
        const night = foundry.utils.deepClone(group.getFlag(MODULE_ID, "night"));
        night.watch = Number(btn.dataset.watch);
        await group.setFlag(MODULE_ID, "night", night);
        await applyWatchSleep(group);
        break;
      }
      case "cancel":
        await group.unsetFlag(MODULE_ID, "night");
        await clearNightSleep(group);
        break;
      case "end":
        await clearNightSleep(group);
        await group.unsetFlag(MODULE_ID, "night");
        await nightLongRestPrompt(group);
        break;
    }
  } catch (e) {
    console.error(`${MODULE_ID} | night action failed`, e);
    ui.notifications.warn(`Night action failed: ${e.message}`);
  }
  render();
  return true;
}

// §17.1 the approve itself (GM client): copy the spell in unprepared, consume
// the scroll (the DM-approved game mechanic), post the suggested cost — never
// deduct (DM 2026-07-08) — and tell the player.
async function approveScribe(entry) {
  const actor = game.actors.get(entry.actorId);
  const spell = await fromUuid(entry.spellUuid);
  if (!actor || !spell) throw new Error("the actor or spell is gone");
  const scroll = actor.items.get(entry.itemId);
  const data = spell.toObject();
  foundry.utils.setProperty(data, "system.preparation.mode", "prepared");
  foundry.utils.setProperty(data, "system.preparation.prepared", false);
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  if (created?.system?.preparation?.prepared) await created.update({ "system.preparation.prepared": false });
  if (scroll) {
    const q = scroll.system?.quantity ?? 1;
    if (q > 1) await scroll.update({ "system.quantity": q - 1 });
    else await scroll.delete();
  }
  await ChatMessage.create({
    speaker: { alias: "Scribing" },
    content: `<p><b>${foundry.utils.escapeHTML(actor.name)}</b> copies <b>${foundry.utils.escapeHTML(spell.name)}</b> into their spellbook. The scroll crumbles.</p>
      <p><em>Suggested cost: ${foundry.utils.escapeHTML(entry.cost)} — DM adjudicates.</em></p>`
  });
  scribeResultToUser(entry.userId, { ok: true, spellName: spell.name });
}

// Encounter during the night: OFFER the ambush mechanics (never auto). dnd5e's
// Sleeping condition ALREADY carries the full 2024 sleep rules (unconscious +
// prone/incapacitated riders — found live 2026-07-08), so the sleepers are
// mechanically down from the moment the watch marks them; the only additive
// piece at combat start is SURPRISED = initiative at disadvantage (2024).
// Waking someone = the DM (or damage/an ally's action) removes Sleeping — the
// riders leave with it.
function registerNightEncounterOffer() {
  Hooks.on("combatStart", async () => {
    if (!game.user.isGM) return;
    const group = game.actors.find(a => a.type === "group" && a.getFlag(MODULE_ID, "night")?.stage === "watch");
    if (!group) return;
    const sleepers = watchMembers(group).filter(a => a.statuses.has("sleeping")); // pets asleep on watch are ambushed too
    if (!sleepers.length) return;
    if (!CONFIG.statusEffects.some(s => s.id === "surprised")) return;
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Night ambush" },
      content: `<p>${sleepers.length} ${sleepers.length > 1 ? "sleepers are" : "sleeper is"} asleep (${foundry.utils.escapeHTML(sleepers.map(a => a.name.split(" ")[0]).join(", "))}) — already Unconscious from the Sleeping condition.</p>
        <p>Also mark them <b>Surprised</b> (initiative at disadvantage)?</p>`
    }).catch(() => false);
    if (!yes) return;
    for (const a of sleepers) {
      if (!a.statuses.has("surprised")) await a.toggleStatusEffect("surprised", { active: true });
    }
  });
}

// The "Party order" dock tab body — the grid + rotate + lock-in/rearrange +
// release/combine (no Form up / Disperse — those stay in the main area).
function partyTabHTML() {
  const group = packedGroup();
  if (!group) return `<div class="mc-dmp-empty">Party dispersed.</div>`;
  const esc = foundry.utils.escapeHTML;
  const formation = group.getFlag(MODULE_ID, "formation") ?? { cells: {}, forward: 0, locked: [] };
  const preview = partyDeployPreview(group.id) ?? [];
  const badByCell = new Map(preview.filter(p => p.why).map(p => [`${p.r},${p.c}`, p.why]));
  const members = (group.system?.members ?? []).map(m => m.actor).filter(Boolean);
  const locked = new Set(formation.locked ?? []);
  const arrows = ["↑", "→", "↓", "←"];
  const keyOf = a => { const cl = formation.cells?.[a.id]; return cl ? `${cl.r},${cl.c}` : null; };
  const released = new Set(formation.released ?? []);
  const colorFor = (a) => { const u = game.users.find(u => !u.isGM && u.character?.id === a?.id) ?? game.users.find(u => !u.isGM && a?.testUserPermission?.(u, "OWNER")); return u?.color?.css ?? null; };
  const rows = [0, 1, 2].map(r => `<div class="mc-dmp-party-row">${[0, 1, 2].map(c => {
    const occ = members.filter(a => keyOf(a) === `${r},${c}`);
    const p = occ[0];
    const bad = badByCell.get(`${r},${c}`);
    const col = p ? colorFor(p) : null; // outline the token in its player's color
    const img = p ? (p.prototypeToken?.texture?.src || p.img || "icons/svg/mystery-man.svg") : "";
    const cls = ["mc-dmp-party-cell", p && "mc-full", bad && "mc-bad", partySel && p?.id === partySel && "mc-sel", occ.length > 1 && "mc-stack", p && released.has(p.id) && "mc-away"].filter(Boolean).join(" ");
    // Empty squares aren't selectable — inert unless a token is picked up (then a drop target).
    const inert = !p && !partySel;
    return `<button class="${cls}" data-party-cell="${r},${c}"${inert ? " disabled" : ""}${col ? ` style="border-color:${col}"` : ""} title="${esc(bad ? `${p?.name ?? "This spot"}: ${bad}` : (p?.name ?? ""))}">
      ${p ? `<img src="${esc(img)}" alt="">` : ""}
      ${occ.length > 1 ? `<span class="mc-dmp-party-badge">${occ.length}</span>` : p && released.has(p.id) ? `<span class="mc-dmp-party-lock"><i class="fas fa-binoculars"></i></span>` : p && locked.has(p.id) ? `<span class="mc-dmp-party-lock"><i class="fas fa-lock"></i></span>` : ""}
    </button>`;
  }).join("")}</div>`).join("");
  const arranging = (formation.stage ?? "arrange") === "arrange";
  return `
    <div class="mc-dmp-party">${rows}</div>
    <div class="mc-dmp-party-hint">${partySel ? `Moving ${esc(members.find(a => a.id === partySel)?.name ?? "…")} — tap a square` : "&nbsp;"}</div>
    ${partySel && !arranging ? `<div class="mc-dmp-party-btns">
      ${released.has(partySel)
        ? `<button data-party="combine" title="Reabsorb the scout (must be within 1 square of the party)"><i class="fas fa-people-arrows"></i> Combine ${esc(members.find(a => a.id === partySel)?.name?.split(" ")[0] ?? "")}</button>`
        : `<button data-party="release" title="Send them scouting — their token appears next to the party"><i class="fas fa-binoculars"></i> Release ${esc(members.find(a => a.id === partySel)?.name?.split(" ")[0] ?? "")}</button>`}
    </div>` : ""}
    <div class="mc-dmp-party-btns">
      <button data-party="rotl" title="Rotate facing left"><i class="fas fa-rotate-left"></i></button>
      <button class="${arranging ? "mc-dmp-party-deploy" : ""}" data-party="stage" data-stage="${arranging ? "travel" : "arrange"}" title="${arranging ? "Lock the order — players get the travel pad" : "Reopen the grid for arranging"}">
        <i class="fas ${arranging ? "fa-lock" : "fa-pen-to-square"}"></i> ${arranging ? "Lock in" : "Rearrange"}</button>
      <button data-party="rotr" title="Rotate facing right"><i class="fas fa-rotate-right"></i></button>
    </div>`;
}

async function onPartyClick(ev) {
  const actBtn = ev.target.closest("[data-party]");
  if (actBtn?.dataset.party === "pack") {
    const res = await api.partyPack({ groupId: actBtn.dataset.group });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? "Couldn't form up.");
    return true; // pack's token churn re-renders the panel
  }
  // Rebuild a STALE group's membership from the scene's PCs (confirm-gated — it
  // replaces the member list, e.g. the old test party the DM forgot about).
  if (actBtn?.dataset.party === "rebuild") {
    try {
      const g = game.actors.get(actBtn.dataset.group);
      const pcs = scenePartyActors();
      if (!g || !pcs.length) return true;
      const yes = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Rebuild party" },
        content: `<p>Replace <b>${foundry.utils.escapeHTML(g.name)}</b>'s members with this scene's ${pcs.length} player characters?<br><em>${pcs.map(a => foundry.utils.escapeHTML(a.name.split(" ")[0])).join(", ")}</em></p>`
      }).catch(() => false);
      if (!yes) return true;
      await g.update({ "system.members": pcs.map(a => ({ actor: a.id })) });
      ui.notifications.info(`${g.name}: members rebuilt — Form up is ready.`);
    } catch (e) {
      console.error(`${MODULE_ID} | party rebuild failed`, e);
      ui.notifications.warn(`Couldn't rebuild the party: ${e.message}`);
    }
    render();
    return true;
  }
  // Checklist party setup (DM 2026-07-08: "a quick flow and a slow one with a
  // checklist of who to add") — same writes as populate/rebuild, but the DM picks
  // members one by one. Scene PCs come pre-checked; existing members with no token
  // on this scene are listed UNchecked, so dropping them is a visible choice
  // (the quick rebuild would drop them silently).
  if (actBtn?.dataset.party === "roster") {
    try {
      const g = actBtn.dataset.group ? game.actors.get(actBtn.dataset.group) : null;
      const pcs = scenePartyActors();
      const memberIds = new Set((g?.system?.members ?? []).map(m => m.actor?.id).filter(Boolean));
      const offScene = (g?.system?.members ?? []).map(m => m.actor)
        .filter(a => a && !pcs.some(p => p.id === a.id));
      // Near-miss reason rows tried and DROPPED (DM 2026-07-08: "could get long in
      // scenes with many friendly NPCs") — the two rules a missing token fails are
      // documented instead: explicit player OWNER permission + token disposition
      // Friendly.
      if (!pcs.length && !offScene.length) return true;
      const esc = foundry.utils.escapeHTML;
      const row = (a, checked, note) => `<label class="mc-dmp-roster-row">
        <input type="checkbox" name="member" value="${a.id}" ${checked ? "checked" : ""}>
        <img src="${esc(a.img)}" alt=""><span>${esc(a.name)}</span>${note ? `<em>${note}</em>` : ""}</label>`;
      const picked = await foundry.applications.api.DialogV2.wait({
        window: { title: g ? `${g.name} — choose members` : "Create party — choose members" },
        content: `<div class="mc-dmp-roster">
          ${pcs.map(a => row(a, memberIds.size ? memberIds.has(a.id) : true)).join("")}
          ${offScene.map(a => row(a, false, "not on this scene")).join("")}</div>`,
        buttons: [ // bible §4.1.1: right is forward — DialogV2 renders array order L→R
          { action: "cancel", label: "Cancel" },
          { action: "ok", label: "Set members", icon: "fas fa-users", default: true,
            callback: (_ev, button) => [...button.form.querySelectorAll('input[name="member"]:checked')].map(i => i.value) }
        ]
      }).catch(() => null);
      if (!Array.isArray(picked)) return true; // cancelled / closed
      let group = g;
      group ??= await Actor.implementation.create({ name: "The Party", type: "group" });
      await group.update({ "system.members": picked.map(id => ({ actor: id })) });
      const names = picked.map(id => game.actors.get(id)?.name?.split(" ")[0]).filter(Boolean);
      ui.notifications.info(`${group.name}: ${names.length ? names.join(", ") : "no members"} — ${names.length ? "Form up is ready." : "the group is empty."}`);
    } catch (e) {
      console.error(`${MODULE_ID} | party roster failed`, e);
      ui.notifications.warn(`Couldn't set the party members: ${e.message}`);
    }
    render();
    return true;
  }
  // One-tap party setup (playtest 2026-07-05): fill an empty group with the scene's
  // PCs — or create the group first. GM client → direct document writes.
  if (actBtn?.dataset.party === "populate") {
    try {
      const pcs = scenePartyActors();
      if (!pcs.length) return true;
      let g = actBtn.dataset.group ? game.actors.get(actBtn.dataset.group) : null;
      g ??= await Actor.implementation.create({ name: "The Party", type: "group" });
      for (const a of pcs) await g.system.addMember(a); // idempotent per dnd5e (skips existing)
      ui.notifications.info(`${g.name}: ${pcs.map(a => a.name.split(" ")[0]).join(", ")} added — Form up is ready.`);
    } catch (e) {
      console.error(`${MODULE_ID} | party populate failed`, e);
      ui.notifications.warn(`Couldn't set up the party: ${e.message}`);
    }
    render();
    return true;
  }
  const group = packedGroup();
  if (!group) return false;
  const cellBtn = ev.target.closest("[data-party-cell]");
  if (cellBtn) {
    const [r, c] = cellBtn.dataset.partyCell.split(",").map(Number);
    const formation = group.getFlag(MODULE_ID, "formation") ?? { cells: {} };
    const members = (group.system?.members ?? []).map(m => m.actor).filter(Boolean);
    const occ = members.find(a => { const cl = formation.cells?.[a.id]; return cl && cl.r === r && cl.c === c; });
    if (!partySel) {
      if (occ) { partySel = occ.id; render(); }
      return true;
    }
    if (occ?.id === partySel) { partySel = null; render(); return true; } // tap self = put down
    if (occ && occ.id !== partySel) {
      // Target holds another token → SWAP their cells (not stack; DM 2026-07-03).
      const selCell = formation.cells?.[partySel];
      if (selCell) await api.partySetCell({ groupId: group.id, actorId: occ.id, r: selCell.r, c: selCell.c });
    }
    const res = await api.partySetCell({ groupId: group.id, actorId: partySel, r, c });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? "Couldn't move them.");
    partySel = null; partyForce = false; // layout changed → re-judge before forcing
    return true; // updateActor re-renders
  }
  const act = ev.target.closest("[data-party]")?.dataset.party;
  if (!act) return false;
  if (act === "rotl" || act === "rotr") {
    const cur = group.getFlag(MODULE_ID, "formation")?.forward ?? 0;
    partyForce = false; // facing changed → re-judge
    await api.partySetForward({ groupId: group.id, forward: cur + (act === "rotr" ? 1 : -1) });
    return true;
  }
  if (act === "release" || act === "combine") {
    if (!partySel) return true;
    const res = act === "release"
      ? await api.partyRelease({ groupId: group.id, actorId: partySel })
      : await api.partyCombine({ groupId: group.id, actorId: partySel });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? `Couldn't ${act}.`);
    else partySel = null;
    return true; // flag change re-renders
  }
  if (act === "stage") {
    const stage = ev.target.closest("[data-party]")?.dataset.stage;
    const res = await api.partyStage({ groupId: group.id, stage });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? "Couldn't switch stage.");
    return true; // updateActor re-renders
  }
  if (act === "deploy") {
    const res = await api.partyDeploy({ groupId: group.id, force: partyForce });
    if (res?.ok === false && res.reason === "nofit") {
      partyForce = !res.blocked?.some(b => b.offMap); // arm unless it's the off-map hard stop
      ui.notifications.warn(res.detail ?? "The formation doesn't fit here.");
      render();
    } else if (res?.ok === false) {
      ui.notifications.warn(res.reason ?? "Couldn't disperse.");
    } else {
      partySel = null; partyForce = false;
      if (res?.warned?.length) ui.notifications.info(`Dispersed with warnings: ${res.warned.map(w => `${w.name} (${w.why})`).join(", ")} — nudge them as needed.`);
    }
    return true;
  }
  return false;
}

/** DM-assign section: target chips + a send button per active player. */
function assignHTML(targets) {
  const chips = targets.map(t =>
    `<span class="mc-dmp-chip">${foundry.utils.escapeHTML(t.document?.name ?? "?")}</span>`).join("");
  const cur = currentTurnUserId();
  const players = activePlayers();
  const buttons = players.length
    ? players.map(u => `<button class="mc-dmp-send ${u.id === cur ? "mc-current" : ""}" data-user="${u.id}">
        ${foundry.utils.escapeHTML(playerLabel(u))}${u.id === cur ? " · turn" : ""}</button>`).join("")
    : `<div class="mc-dmp-empty">No players connected</div>`;
  return `
    <div class="mc-dmp-head">
      <span>Assign ${targets.length} target${targets.length === 1 ? "" : "s"}</span>
      <button class="mc-dmp-clear" data-action="clear" aria-label="Clear targets">✕</button>
    </div>
    <div class="mc-dmp-chips">${chips}</div>
    <div class="mc-dmp-players">${buttons}</div>`;
}

function render() {
  const el = ensureEl();
  applyDmTheme(); // keep the DM's chosen widget theme live
  // Don't rebuild the panel while the DM is typing in a downtime TEXT field — background hooks
  // (presence 5s, combat, targeting) re-render often and would wipe the half-typed value (DM
  // 2026-07-13: "the task disappears"). Only text/number inputs need this; SELECTs must NOT be
  // guarded, or the rule form's own Kind/Roll dropdowns can't drive a re-render ("can't set rules").
  const ae = document.activeElement;
  if (ae && el.contains(ae) && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA") && /^(text|number|search|textarea|)$/.test(ae.type || "textarea")
      && (ae.closest(".mc-dt-addform") || ae.closest(".mc-dt-tmplform") || ae.closest(".mc-rf"))) return;
  const targets = Array.from(game.user.targets ?? []);
  const pending = listPendingCasts();
  // The camera bar is always present (the DM needs TV control out of combat, with
  // no targets); targeting/cast sections grow the panel when relevant.
  // IDENTICAL to the flyout's top (DM 2026-07-18): the same grab row + title header, same classes,
  // height, colours and drag behaviour — the ONLY difference is the grab row carries no grip-lines
  // icon (and no X). The grab row's height makes this title line up with the flyout's.
  // It renders OUTSIDE .mc-dmp-scroll (like the bottom rail): inside, the scroll container
  // clipped its negative-margin bleed at the panel's 10px padding, leaving a gray inset frame
  // around the title (DM 2026-07-18: "the gray padding on the top and sides is driving me crazy").
  const grip = `<div class="mc-dmp-tophead mc-dmp-drag" title="Drag to move">
    <div class="mc-dmp-fly-resize mc-fly-grab-top" aria-hidden="true"></div>
    <div class="mc-dmp-fly-head"><span>Mobile Command</span></div>
  </div>`;
  // Party order lives in its own dock tab (auto-open on pack, close on disperse) —
  // the main area keeps only Form up / Disperse so its width never jumps.
  const packedNow = !!packedGroup();
  if (packedNow && !dockWasPacked) dockTab = "party";
  else if (!packedNow && dockWasPacked && dockTab === "party") dockTab = null;
  dockWasPacked = packedNow;
  // Form up is PINNED to the bottom (mc-dmp-foot + margin-top:auto): the one the DM reaches for
  // without looking, so it must not slide when a section above grows (DM 2026-07-17). Everything
  // conditional sits above it. Rest moved to its own tab (§19), out of the primary.
  const main = `<div class="mc-dmp-col">`
    + statusHTML() + cameraBarHTML() + reactionsHTML() + splitPartyHTML() + combatHTML() + quickHpHTML()
    + (pending.length ? pendingHTML(pending) : "")
    + `<div class="mc-dmp-foot">` + partyMainHTML() + `</div>`
    + `</div>`;
  // Grow the flyout UP (anchored to the panel's bottom) when the panel sits in the lower half of
  // the screen, so a bottom-docked panel's second window opens into visible space instead of off
  // the bottom edge (DM 2026-07-13).
  const pTop = el.getBoundingClientRect().top || parseInt(el.style.top, 10) || 0;
  flyUp = pTop > window.innerHeight * 0.5;
  // Preserve scroll across the innerHTML rebuild — background hooks re-render often, and losing
  // the flyout/main scroll to the top mid-interaction is maddening (DM 2026-07-13: "the scroll bar
  // jumps to the top").
  const flyTop = el.querySelector(".mc-dmp-fly-body")?.scrollTop ?? 0;
  const mainTop = el.querySelector(".mc-dmp-scroll")?.scrollTop ?? 0;
  // Main content scrolls inside; the tab rail + flyout stick out the right edge.
  el.innerHTML = `${grip}<div class="mc-dmp-scroll">${main}</div><div class="mc-dmp-rail"></div>${tabRailHTML()}${dockTab ? flyoutHTML() : ""}`;
  const fb = el.querySelector(".mc-dmp-fly-body"); if (fb && flyTop) fb.scrollTop = flyTop;
  const ms = el.querySelector(".mc-dmp-scroll"); if (ms && mainTop) ms.scrollTop = mainTop;
  el.classList.add("mc-show");
  clampPos(el);
}

// Owned-tokens grid: set Foundry Actor drag data so a drop on the canvas spawns a
// token natively (no custom drop handler needed — the DM client has the canvas).
function onTokenDragStart(ev) {
  const item = ev.target.closest("[data-drag-actor]");
  if (!item) return;
  const a = fromUuidSync(item.dataset.dragActor);
  if (!a) return;
  try { ev.dataTransfer.setData("text/plain", JSON.stringify(a.toDragData())); ev.dataTransfer.effectAllowed = "copy"; } catch (e) { /* */ }
}
function onTokenDblClick(ev) {
  const item = ev.target.closest("[data-sheet-actor]");
  if (!item) return;
  game.actors.get(item.dataset.sheetActor)?.sheet?.render(true);
}

// §18: live MPH↔KPH auto-fill in the custom-pace form — updates the paired field directly (no
// re-render, so focus/typing isn't disturbed).
function onInput(ev) {
  const mph = ev.target.closest("[data-pace-mph]");
  if (mph) { const k = panelEl?.querySelector("[data-pace-kph]"); if (k) k.value = mph.value ? (Number(mph.value) * KPH_PER_MPH).toFixed(1) : ""; return; }
  const kph = ev.target.closest("[data-pace-kph]");
  if (kph) { const m = panelEl?.querySelector("[data-pace-mph]"); if (m) m.value = kph.value ? (Number(kph.value) / KPH_PER_MPH).toFixed(1) : ""; return; }
}
function onChange(ev) {
  const rf = ev.target.closest("[data-rule]");
  if (rf) return applyRuleField(rf.dataset.rule, rf.value); // §17.7 Rule-authoring form field
  const trav = ev.target.closest("[data-travel-scene]");
  if (trav) { game.settings.set(MODULE_ID, "travelOverworldSceneId", trav.value).then(() => render()); return; } // §18 T1
  const custPace = ev.target.closest("[data-travel-custompace]"); // §18: pick a custom transport pace
  if (custPace) { const g = packedGroup() ?? candidateGroup(); if (g) g.setFlag(MODULE_ID, "travelPace", custPace.value || "normal").then(() => render()); else render(); return; }
  const player = ev.target.closest("[data-tok-player]");
  if (player) { tokensPlayer = player.value; return render(); } // owned-tokens player switch
  const sel = ev.target.closest("[data-rt]");
  if (!sel) return;
  if (sel.dataset.rt === "type") rollTool.type = sel.value;
  else if (sel.dataset.rt === "ability") rollTool.ability = sel.value;
  // value persists in the DOM + state; no re-render (keeps the target list scroll)
}

async function onClick(ev) {
  // Reaction widget: fire the NPC opportunity attack, or let them go.
  const rFire = ev.target.closest("[data-dmreact-fire]");
  if (rFire) {
    const entry = dmReactions.find(r => r.id === rFire.dataset.dmreactFire);
    dmReactions = dmReactions.filter(r => r.id !== rFire.dataset.dmreactFire);
    render();
    if (entry) {
      try { await fireAoO(entry.activityUuid, entry.targetUuid); }
      catch (e) { console.error(`${MODULE_ID} | reaction-widget AoO failed`, e); ui.notifications.warn("Couldn't fire the opportunity attack — see console."); }
    }
    return;
  }
  const rX = ev.target.closest("[data-dmreact-x]");
  if (rX) { dmReactions = dmReactions.filter(r => r.id !== rX.dataset.dmreactX); return render(); }
  // §17.1 scribe request: ✓ = spell into the book (unprepared) + scroll consumed
  // + suggested-cost chat card; ✕ = nothing changes. Either way the player hears.
  const sOk = ev.target.closest("[data-dmscribe-ok]");
  if (sOk) {
    const entry = dmReactions.find(r => r.id === sOk.dataset.dmscribeOk);
    dmReactions = dmReactions.filter(r => r.id !== sOk.dataset.dmscribeOk);
    render();
    if (entry) {
      try { await approveScribe(entry); }
      catch (e) { console.error(`${MODULE_ID} | scribe approve failed`, e); ui.notifications.warn(`Scribe failed: ${e.message}`); }
    }
    return;
  }
  const sNo = ev.target.closest("[data-dmscribe-x]");
  if (sNo) {
    const entry = dmReactions.find(r => r.id === sNo.dataset.dmscribeX);
    dmReactions = dmReactions.filter(r => r.id !== sNo.dataset.dmscribeX);
    render();
    if (entry) scribeResultToUser(entry.userId, { ok: false, spellName: entry.label });
    return;
  }
  // §20 T-p2p: receiver offline → the DM accepts/declines the give on their behalf.
  const trOk = ev.target.closest("[data-dmtrade-ok]");
  if (trOk) {
    const entry = dmReactions.find(r => r.id === trOk.dataset.dmtradeOk);
    dmReactions = dmReactions.filter(r => r.id !== trOk.dataset.dmtradeOk);
    render();
    if (entry) api.transferRespond({ offerId: entry.offerId, accept: true }).then(res => { if (res?.ok === false) ui.notifications.warn(res.reason ?? "Transfer failed."); });
    return;
  }
  const trNo = ev.target.closest("[data-dmtrade-x]");
  if (trNo) {
    const entry = dmReactions.find(r => r.id === trNo.dataset.dmtradeX);
    dmReactions = dmReactions.filter(r => r.id !== trNo.dataset.dmtradeX);
    render();
    if (entry) api.transferRespond({ offerId: entry.offerId, accept: false });
    return;
  }
  // Summon control (2026-07-09): ✓ grants the summoner's player OWNER on the
  // summoned world actor — their phone's switcher picks it up on the ownership
  // change; ✕ keeps the summon DM-driven.
  const smOk = ev.target.closest("[data-dmsummon-ok]");
  if (smOk) {
    const entry = dmReactions.find(r => r.id === smOk.dataset.dmsummonOk);
    dmReactions = dmReactions.filter(r => r.id !== smOk.dataset.dmsummonOk);
    render();
    if (entry) {
      try {
        await game.actors.get(entry.actorId)?.update({ [`ownership.${entry.userId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
        ui.notifications.info(`${game.users.get(entry.userId)?.name ?? "The player"} now controls ${game.actors.get(entry.actorId)?.name ?? "the summon"}.`);
      } catch (e) { console.error(`${MODULE_ID} | summon grant failed`, e); ui.notifications.warn(`Couldn't grant control: ${e.message}`); }
    }
    return;
  }
  const smNo = ev.target.closest("[data-dmsummon-x]");
  if (smNo) { dmReactions = dmReactions.filter(r => r.id !== smNo.dataset.dmsummonX); return render(); }
  // Right-side dock: tab toggle, close, target checkbox, send.
  const dockBtn = ev.target.closest("[data-dock]");
  if (dockBtn) { closeRtAssign(); dockTab = dockTab === dockBtn.dataset.dock ? null : dockBtn.dataset.dock; return render(); }
  if (ev.target.closest("[data-dock-close]")) { closeRtAssign(); dockTab = null; return render(); }
  if (ev.target.closest("[data-travel-route]")) { armTravelRoute(); return; } // §18 T2: draw the route
  if (ev.target.closest("[data-travel-route-clear]")) {
    await deleteTravelRouteDrawings(); // all scenes — clears a stray route even from a battle map
    resetTravelRoute(); return render();
  }
  if (ev.target.closest("[data-travel-go]")) { const g = packedGroup(); if (g) await runTravelJourney(g); return; } // §18 T3
  if (ev.target.closest("[data-travel-stop]")) { stopTravelJourney(); return; }
  const travDrawer = ev.target.closest("[data-travel-drawer]");
  if (travDrawer) { const k = travDrawer.dataset.travelDrawer; travelDrawers[k] = travelDrawers[k] === false; return render(); }
  const paceBtn = ev.target.closest("[data-travel-pace]"); // §18 T2: set the group's travel pace
  if (paceBtn) {
    const g = packedGroup() ?? candidateGroup();
    if (g) await g.setFlag(MODULE_ID, "travelPace", paceBtn.dataset.travelPace);
    return render();
  }
  if (ev.target.closest("[data-travel-addpace]")) { travelPaceEditorOpen = !travelPaceEditorOpen; return render(); } // §18 custom paces
  const delPace = ev.target.closest("[data-travel-delpace]");
  if (delPace) {
    const id = delPace.dataset.travelDelpace;
    await game.settings.set(MODULE_ID, "travelCustomPaces", travelCustomPaces().filter(c => c.id !== id));
    const g = packedGroup() ?? candidateGroup();
    if (g && travelPaceOf(g) === id) await g.setFlag(MODULE_ID, "travelPace", "normal"); // deleted the selected one
    return render();
  }
  if (ev.target.closest("[data-travel-paceadd]")) {
    const name = (panelEl.querySelector("[data-pace-name]")?.value || "").trim();
    const mph = Number(panelEl.querySelector("[data-pace-mph]")?.value);
    if (!name || !(mph > 0)) { ui.notifications.warn("Enter a name and a speed (MPH or KPH)."); return; }
    const list = travelCustomPaces().slice();
    list.push({ id: foundry.utils.randomID(), name: name.slice(0, 30), mph: Math.round(mph * 10) / 10 });
    await game.settings.set(MODULE_ID, "travelCustomPaces", list);
    travelPaceEditorOpen = false;
    return render();
  }
  if (ev.target.closest("[data-travel-begin]")) { // §18 T1.5: pack, preview the map, arm the landing click
    const res = await api.travelPrepare({});
    if (res?.ok === false) { ui.notifications.warn(res.reason ?? "Couldn't prepare travel."); return render(); }
    const over = game.scenes.get(res.sceneId);
    if (over && canvas.scene?.id !== over.id) await over.view(); // DM goes first — view, not activate
    armTravelDrop();
    return render();
  }
  if (ev.target.closest("[data-rt-forbtn]")) { rollTool.targetsOpen = !rollTool.targetsOpen; return render(); }
  const cp = ev.target.closest("[data-color-pick]");
  if (cp) { // DM initiates: push the colour picker to that player's phone
    const uid = cp.dataset.colorPick;
    const res = await api.requestColorPick({ userId: uid });
    if (res?.ok === false) ui.notifications.warn(res.reason ?? "Couldn't reach that player.");
    else ui.notifications.info(`Asked ${game.users.get(uid)?.name ?? "the player"} to pick a colour.`);
    return;
  }
  const rtT = ev.target.closest("[data-rt-target]");
  if (rtT) {
    const id = rtT.dataset.rtTarget;
    const nowOn = !rollTool.selected?.has(id);
    if (nowOn) rollTool.selected?.add(id); else rollTool.selected?.delete(id);
    // Also target the token on the canvas — visual confirmation + the DM's attack target.
    const tok = canvas.tokens?.placeables.find(t => t.actor?.id === id);
    if (tok) tok.setTarget(nowOn, { releaseOthers: false }); // → targetToken hook re-renders the list
    else render(); // off-canvas actor (packed group member) → reflect the selection
    return;
  }
  if (ev.target.closest("[data-rt-send]")) return sendRolls();
  { // §19 Rest — setup draft + the single ending. Watch/downtime buttons within fall through to
    // their own handlers (onNightClick / the downtime block below).
    const rType = ev.target.closest("[data-rest-type]");
    if (rType) { restDraft.type = rType.dataset.restType; return render(); }
    if (ev.target.closest("[data-rest-watches]")) { restDraft.watches = !restDraft.watches; return render(); }
    if (ev.target.closest("[data-rest-start]")) return startRest();
    if (ev.target.closest("[data-rest-advance]")) return advanceRest();
    if (ev.target.closest("[data-rest-pass]")) return passWatch();
    if (ev.target.closest("[data-rest-end]")) return endRest(true);
    if (ev.target.closest("[data-rest-cancel]")) return endRest(false);
  }
  { // §17.7 downtime v2 — all writes route through the executor op dispatcher (api.downtime).
    const openBtn = ev.target.closest("[data-dt-open]");
    if (openBtn) { await api.downtime({ op: "openWindow", size: openBtn.dataset.dtOpen }); return; }
    if (ev.target.closest("[data-dt-end]")) { await api.downtime({ op: "closeWindow" }); return; }
    const gearToggle = ev.target.closest("[data-dt-geartoggle]");
    if (gearToggle) { dtGearFor = dtGearFor === gearToggle.dataset.dtGeartoggle ? null : gearToggle.dataset.dtGeartoggle; return render(); }
    const gear = ev.target.closest("[data-dt-gear]");
    if (gear) {
      const actorId = gear.dataset.actor;
      const cur = DT.getActorSettings(downtimeState(), actorId);
      if (gear.dataset.dtGear === "bonus") await api.downtime({ op: "setActorSetting", actorId, key: "bonusActivities", value: Math.max(0, cur.bonusActivities + Number(gear.dataset.delta)) });
      else if (gear.dataset.dtGear === "crunch") await api.downtime({ op: "setActorSetting", actorId, key: "showMechanicsByDefault", value: !cur.showMechanicsByDefault });
      return;
    }
    const rm = ev.target.closest("[data-dt-remove]");
    if (rm) { await api.downtime({ op: "removeActivity", actorId: rm.dataset.actor, id: rm.dataset.dtRemove }); return; }
    // DM-side add-a-task.
    const addOpen = ev.target.closest("[data-dt-add-open]");
    if (addOpen) { dtAddFor = dtAddFor === addOpen.dataset.dtAddOpen ? null : addOpen.dataset.dtAddOpen; render(); setTimeout(() => panelEl?.querySelector(".mc-dt-addname")?.focus(), 0); return; }
    if (ev.target.closest("[data-dt-add-cancel]")) { dtAddFor = null; return render(); }
    const addSave = ev.target.closest("[data-dt-add-save]");
    if (addSave) {
      const root = addSave.closest(".mc-dt-addform");
      const name = (root?.querySelector(".mc-dt-addname")?.value || "").trim();
      const plan = (root?.querySelector(".mc-dt-addplan")?.value || "").trim();
      dtAddFor = null;
      if (name) await api.downtime({ op: "upsertActivity", actorId: addSave.dataset.actor, activity: DT.newActivity(name, plan, game.user.id) });
      else render();
      return;
    }
    const rest = ev.target.closest("[data-dt-rest]");
    if (rest) { await restParty(rest.dataset.dtRest); return; }
    // Progress nudge (the DM adjusts anytime): −/+ moves the count (or the roll DC).
    const adj = ev.target.closest("[data-dt-adjust]");
    if (adj) { await api.downtime({ op: "adjustProgress", actorId: adj.dataset.actor, id: adj.dataset.id, delta: Number(adj.dataset.dtAdjust) }); return; }
    const push = ev.target.closest("[data-dt-push]");
    if (push) { await api.downtime({ op: "pushRoll", actorId: push.dataset.actor, id: push.dataset.dtPush, on: push.dataset.on === "1" }); return; }
    const tick = ev.target.closest("[data-dt-tick]");
    if (tick) { await api.downtime({ op: "applyAttempt", actorId: tick.dataset.actor, id: tick.dataset.dtTick, outcome: null }); return; }
    // Open/close the Rule-authoring form for an Activity instance.
    const edit = ev.target.closest("[data-dt-editrule]");
    if (edit) {
      const id = edit.dataset.dtEditrule;
      if (dtRuleFor === id && !dtRuleIsTemplate) { dtRuleFor = null; dtRuleDraft = null; return render(); }
      const st = downtimeState();
      const act = DT.listActivities(st, edit.dataset.actor).find(a => a.id === id);
      dtRuleFor = id; dtRuleActor = edit.dataset.actor; dtRuleIsTemplate = false;
      dtRuleDraft = act?.rule ? foundry.utils.deepClone(act.rule) : DT.defaultRule("roll", "freestyle");
      dtRuleVisible = act?.visible ?? DT.getActorSettings(st, edit.dataset.actor).showMechanicsByDefault;
      seedRollIfNeeded();
      return render();
    }
    // ── Catalog (templates) ────────────────────────────────────────────────
    if (ev.target.closest("[data-dt-tmpl-new]")) { dtNewTmplOpen = !dtNewTmplOpen; if (dtNewTmplOpen) dtDrawers.catalog = true; render(); setTimeout(() => panelEl?.querySelector(".mc-dt-tmplname")?.focus(), 0); return; }
    if (ev.target.closest("[data-dt-tmpl-cancel]")) { dtNewTmplOpen = false; return render(); }
    const tsave = ev.target.closest("[data-dt-tmpl-save]");
    if (tsave) {
      const name = (tsave.closest(".mc-dt-tmplform")?.querySelector(".mc-dt-tmplname")?.value || "").trim();
      dtNewTmplOpen = false;
      if (name) await api.downtime({ op: "upsertTemplate", template: DT.newTemplate(name, game.user.id) });
      else render();
      return;
    }
    const tedit = ev.target.closest("[data-dt-tmpl-edit]");
    if (tedit) {
      const id = tedit.dataset.dtTmplEdit;
      if (dtRuleFor === id && dtRuleIsTemplate) { dtRuleFor = null; dtRuleDraft = null; dtRuleIsTemplate = false; return render(); }
      const t = DT.listTemplates(downtimeState()).find(x => x.id === id);
      dtRuleFor = id; dtRuleActor = null; dtRuleIsTemplate = true;
      dtRuleDraft = t?.rule ? foundry.utils.deepClone(t.rule) : DT.defaultRule("roll", "freestyle");
      dtRuleNote = t?.note || "";
      seedRollIfNeeded();
      return render();
    }
    const toffer = ev.target.closest("[data-dt-tmpl-offer]");
    if (toffer) { await api.downtime({ op: "setTemplateOffered", id: toffer.dataset.dtTmplOffer, on: toffer.dataset.on === "1" }); return; }
    const trm = ev.target.closest("[data-dt-tmpl-rm]");
    if (trm) { await api.downtime({ op: "removeTemplate", id: trm.dataset.dtTmplRm }); return; }
    if (ev.target.closest("[data-dt-seed]")) { await api.downtime({ op: "seedTemplates" }); return; }
    // Give a task: assign a template to a PC directly.
    const give = ev.target.closest("[data-dt-give]");
    if (give) { dtGiveFor = dtGiveFor === give.dataset.dtGive ? null : give.dataset.dtGive; return render(); }
    // "Give a task" sets that PC's ONE selection (same op the player's dropdown uses).
    const gpick = ev.target.closest("[data-dt-give-pick]");
    if (gpick) { dtGiveFor = null; await api.downtime({ op: "selectActivity", actorId: gpick.dataset.actor, templateId: gpick.dataset.dtGivePick }); return; }
    const start = ev.target.closest("[data-dt-start]");
    if (start) {
      const on = start.dataset.dtStart === "1";
      if (on) dtDrawers.catalog = false; // authoring's done — get the catalog out of the way (DM 2026-07-16)
      await api.downtime({ op: "startActivities", on });
      return;
    }
    const drawer = ev.target.closest("[data-dt-drawer]");
    if (drawer) { pinPanelTop(); const k = drawer.dataset.dtDrawer; dtDrawers[k] = dtDrawers[k] === false; return render(); }
    // ── Authoring-form controls (activity OR template) ──────────────────────
    if (dtRuleDraft) {
      const preset = ev.target.closest("[data-rule-preset]");
      if (preset) { applyRulePreset(preset.dataset.rulePreset); return render(); }
      const tog = ev.target.closest("[data-rule-toggle]");
      if (tog) {
        const k = tog.dataset.ruleToggle;
        if (k === "visible") dtRuleVisible = !dtRuleVisible;
        else if (k === "requireroll") { dtRuleDraft.requireRoll = !dtRuleDraft.requireRoll; seedRollIfNeeded(); }
        return render();
      }
      if (ev.target.closest("[data-rule-cancel]")) { dtRuleFor = null; dtRuleDraft = null; dtRuleIsTemplate = false; return render(); }
      if (ev.target.closest("[data-rule-activate]")) {
        const actorId = dtRuleActor, id = dtRuleFor, rule = dtRuleDraft, visible = dtRuleVisible, isT = dtRuleIsTemplate, note = dtRuleNote;
        dtRuleFor = null; dtRuleDraft = null; dtRuleIsTemplate = false; render();
        if (isT) { await api.downtime({ op: "setTemplateRule", id, rule }); await api.downtime({ op: "setTemplateNote", id, note }); }
        else { await api.downtime({ op: "setRule", actorId, id, rule }); await api.downtime({ op: "setVisible", actorId, id, visible }); }
        return;
      }
    }
  }
  // ±10 minutes: real time PASSES (advances worldTime — effects/other modules listen). GM-only.
  const nudge = ev.target.closest("[data-dm-clock-nudge]");
  if (nudge) {
    if (game.user.isGM) await game.time.advance(Number(nudge.dataset.dmClockNudge)); // updateWorldTime re-renders
    return;
  }
  const clockBtn = ev.target.closest("[data-dm-clock]");
  if (clockBtn) {
    if (hasSimpleCalendar()) { ui.notifications.info("Simple Calendar is keeping the time — set it there."); return; }
    const c = readClock();
    // Day / Hour / Minute steppers. SET (re-anchors clockStart so no time "passes" and no effects
    // fire) vs the chip's ±10 which PASSES time. − / + bump each field; wrap hour/minute, floor day.
    const row = (key, label, val, max, base = 0) => `<div class="mc-dmp-tset-row">
      <span class="mc-dmp-tset-lbl">${label}</span>
      <button type="button" class="mc-dmp-tset-b" data-step="${key}" data-d="-1"><i class="fas fa-minus"></i></button>
      <input class="mc-dmp-tset-in" name="${key}" value="${val}" data-max="${max}" data-base="${base}" inputmode="numeric" readonly>
      <button type="button" class="mc-dmp-tset-b" data-step="${key}" data-d="1"><i class="fas fa-plus"></i></button>
    </div>`;
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: "Set the time" },
      content: `<div class="mc-dmp-tset">
        ${row("day", "Day", c.day, 0)}
        ${row("hour", "Hour", c.hour === 0 ? 24 : c.hour, 24, 1)}
        ${row("minute", "Minute", c.minute, 60)}
      </div>`,
      buttons: [ // bible §4.1.1: right is forward — DialogV2 renders array order L→R
        { action: "cancel", label: "Cancel" },
        { action: "set", label: "Set", default: true, callback: (_e, btn) => ({
            day: Number(btn.form.elements.day.value), hour: Number(btn.form.elements.hour.value), minute: Number(btn.form.elements.minute.value) }) }
      ],
      render: (_e, dialog) => {
        dialog.element.querySelectorAll("[data-step]").forEach(b => b.addEventListener("click", (e) => {
          e.preventDefault();
          const inp = dialog.element.querySelector(`input[name="${b.dataset.step}"]`);
          const max = Number(inp.dataset.max);
          const base = Number(inp.dataset.base) || 0;
          let v = Number(inp.value) + Number(b.dataset.d);
          if (max > 0) v = ((v - base) % max + max) % max + base;   // wrap hour 1-24 / minute 0-59
          else v = Math.max(1, v);                                  // day floors at 1
          inp.value = v;
        }));
      }
    }).catch(() => null);
    if (result && typeof result === "object") {
      const target = (result.day - 1) * 86400 + (result.hour % 24) * 3600 + result.minute * 60; // 24 → midnight
      await game.settings.set(MODULE_ID, "clockStart", target - game.time.worldTime); // re-anchor
      render();
    }
    return;
  }
  const dth = ev.target.closest("[data-dm-theme]");
  if (dth) {
    try { window.localStorage.setItem("mc-dm-theme", dth.dataset.dmTheme); } catch (e) { /* private mode */ }
    applyDmTheme();
    return render();
  }
  const gs = ev.target.closest("[data-group-sheet]");
  if (gs) { game.actors.get(gs.dataset.groupSheet)?.sheet?.render(true); return; }
  if (ev.target.closest("[data-preflight-run]")) {
    await runPreflight();
    return render();
  }
  if (ev.target.closest("[data-dm-wizard]")) {
    runDmWizard().then(() => render()).catch(e => console.error(`${MODULE_ID} | wizard failed`, e));
    return;
  }
  const actScene = ev.target.closest("[data-activate-scene]");
  if (actScene) {
    const scene = game.scenes.get(actScene.dataset.activateScene);
    if (scene) await scene.activate();
    return render();
  }
  const pfFix = ev.target.closest("[data-preflight-fix]");
  if (pfFix) {
    pfFix.disabled = true;
    try { await runPreflightFix(pfFix.dataset.preflightFix); }
    catch (e) { console.error(`${MODULE_ID} | preflight fix failed`, e); ui.notifications.warn(`Fix failed: ${e.message}`); }
    return render();
  }
  if (await onNightClick(ev)) return;
  if (await onPartyClick(ev)) return;
  const cam = ev.target.closest("[data-cam]");
  if (cam) {
    if (cam.dataset.cam === "focus") globalThis.MobileCommand?.focusParty?.();
    else if (cam.dataset.cam === "fit") globalThis.MobileCommand?.tvFitScene?.();
    else if (cam.dataset.cam === "manual") globalThis.MobileCommand?.toggleTvManual?.();
    else if (cam.dataset.cam === "zoom-in") globalThis.MobileCommand?.tvZoom?.(1.25);
    else if (cam.dataset.cam === "zoom-out") globalThis.MobileCommand?.tvZoom?.(1 / 1.25);
    return render();
  }
  const hpBtn = ev.target.closest("[data-hp]");
  if (hpBtn) {
    const input = panelEl.querySelector(".mc-dmp-hp-input");
    const amt = Math.max(0, Math.floor(Number(input?.value) || 0));
    const toks = controlledWithActors();
    if (!amt) { ui.notifications.warn("Enter an HP amount first."); return; }
    if (!toks.length) { ui.notifications.warn("Select a token first."); return; }
    const dmg = hpBtn.dataset.hp === "damage";
    for (const t of toks) await applyHpDelta(t.actor, dmg ? -amt : amt);
    ui.notifications.info(`${dmg ? "Damaged" : "Healed"} ${amt} → ${toks.length} token${toks.length === 1 ? "" : "s"}.`);
    if (input) input.value = "";
    return render();
  }
  const combat = ev.target.closest("[data-combat]");
  if (combat) {
    const c = game.combat;
    if (c) {
      const act = combat.dataset.combat;
      try {
        if (act === "next") await c.nextTurn();
        else if (act === "prev") await c.previousTurn();
        else if (act === "rollNPC") await c.rollNPC();
        else if (act === "rollAll") await c.rollAll();
        else if (act === "start") await c.startCombat();
        else if (act === "end") await c.endCombat(); // core shows its own confirm
      } catch (e) { ui.notifications.warn(`Combat: ${e.message}`); }
    }
    return render();
  }
  const place = ev.target.closest("[data-place]");
  if (place) {
    const res = await placeCast(place.dataset.place);
    if (res && !res.ok) ui.notifications.warn(`Place: ${res.reason}`);
    return render();
  }
  if (ev.target.closest("[data-dismiss]")) {
    dismissCast(ev.target.closest("[data-dismiss]").dataset.dismiss);
    return render();
  }
  if (ev.target.closest('[data-action="clear"]')) {
    return canvas.tokens?.setTargets([], { mode: "replace" });
  }
  const asn = ev.target.closest("[data-rt-assign]");
  if (asn) {
    const actorId = asn.dataset.rtAssign;
    if (!ownerUser(game.actors.get(actorId))) { ui.notifications.warn("No player owns that character."); return; }
    // Same crosshair → close; a different one → switch (open closes any current picker first).
    if (rtAssignFor === actorId) closeRtAssign();
    else await openRtAssign(actorId);
    return render();
  }
  const btn = ev.target.closest("[data-user]");
  if (!btn) return;
  const uuids = Array.from(game.user.targets).map(t => t.document?.uuid).filter(Boolean);
  if (!uuids.length) return;
  await api.assignTargets(btn.dataset.user, uuids);
  const u = game.users.get(btn.dataset.user);
  ui.notifications.info(`Assigned ${uuids.length} target(s) to ${u ? playerLabel(u) : "player"}`);
  // Clear the DM's own targets after the handoff so the player's reticle owns the
  // table-visible confirmation (§11). v14: setTargets replaces (User#updateTokenTargets is gone).
  canvas.tokens?.setTargets([], { mode: "replace" });
}

/** DM/executor client only — the TV is player-role, phones have no canvas targets. */
export function registerDMPanel() {
  if (!game.user.isGM) return;
  // Preflight auto-run (§16): one pass shortly after the canvas settles so the
  // tab badge shows real fails without the DM opening it. Never auto-fixes.
  setTimeout(() => { runPreflight().then(() => render()).catch(e => console.warn(`${MODULE_ID} | preflight auto-run failed`, e)); }, 4000);
  // §18 travel: auto-set up a detected overworld the first time it's opened (whole map visible, dims
  // with the clock). Runs on every canvas load — the flag guard makes it one-shot per scene.
  Hooks.on("canvasReady", () => { maybeAutoLightOverworld(canvas?.scene); });
  maybeAutoLightOverworld(canvas?.scene); // the scene already up when the panel initialises
  registerNightEncounterOffer(); // §17.4: ambush during a watch → offer Unconscious+Surprised
  Hooks.on("targetToken", () => { syncRtAssign(); render(); });   // live target picker + count badge
  Hooks.on("controlToken", () => render());                        // quick-HP: selection changed
  // Keep the rolls-tab distances fresh as tokens move (only while that flyout is open).
  Hooks.on("updateToken", (_t, ch) => { if (dockTab === "rolls" && ("x" in ch || "y" in ch)) render(); });
  Hooks.on("updateCombat", () => render());
  Hooks.on("deleteCombat", () => render());                        // combat ended → drop the strip
  Hooks.on("combatStart", () => render());
  Hooks.on("updateScene", (_s, ch) => { if ("active" in ch) render(); }); // split-party chips follow activation
  Hooks.on("userConnected", () => render());                       // presence: connect/disconnect
  Hooks.on("updateUser", () => render());                          // presence: a player changed scene (viewedScene)
  Hooks.on("updateWorldTime", () => render());                     // the clock chip follows the world time
  Hooks.on("mobile-command.presence", () => render());             // away-timer: a phone reported fg/bg
  Hooks.on("updateSetting", (s) => { if (s?.key === `${MODULE_ID}.downtimeState`) render(); }); // §17.7: activities/window changed
  // Away-timer tick: the red escalation crosses the threshold with no event to fire it, so
  // while any player is backgrounded, re-render every 5s to update "away Ns" and flip to red.
  // Idle (nobody backgrounded) → no timer runs.
  let awayTimer = null;
  const awayTick = () => {
    const anyHidden = [...presenceState.values()].some(p => p?.hidden);
    if (anyHidden && !awayTimer) awayTimer = setInterval(() => { render(); awayTick(); }, 5000);
    else if (!anyHidden && awayTimer) { clearInterval(awayTimer); awayTimer = null; }
  };
  Hooks.on("mobile-command.presence", awayTick);
  Hooks.on("mobile-command.dmReaction", (entry) => {               // reaction widget chips (aoo.js + rpc.js)
    // A multi-token summon (pack of wolves) creates one token per creature —
    // one chip per (summoned actor, player) is enough; the grant covers them all.
    if (entry.kind === "summon" && dmReactions.some(r => r.kind === "summon" && r.actorId === entry.actorId && r.userId === entry.userId)) return;
    dmReactions.push(entry);
    render();
    setTimeout(() => { // expire with the reaction window; filter also runs at render
      dmReactions = dmReactions.filter(r => r.id !== entry.id);
      render();
    }, Math.max(1000, entry.expiresAt - Date.now()));
  });
  Hooks.on("mobile-command.pendingCast", () => render());          // a phone announced an AoE cast
  Hooks.on("mobile-command.pendingCastResolved", () => render());  // placed or dismissed
  Hooks.on("mobile-command.tvManualChanged", () => render());      // keep the manual button in sync (keybinding toggles too)
  // Party Mode: repaint when the marching order changes (group flags), on
  // pack/unpack (token churn), and when the group token itself moves (the
  // blocked-cell preview depends on its position).
  Hooks.on("updateActor", (a, ch) => {
    if (a?.type === "group") return render();
    // Keep the quick-HP hint (value/max placeholder) fresh when a SELECTED token's HP changes elsewhere.
    if (foundry.utils.hasProperty(ch ?? {}, "system.attributes.hp") && controlledWithActors().some(t => t.actor?.id === a?.id)) render();
  });
  // Player-owned tokens count too: the Create party / rebuild buttons key off the
  // scene's PC tokens, so placing or removing one must refresh the party section
  // (2026-07-08: placed two fresh PCs and the button never appeared).
  Hooks.on("createToken", (t) => { if (t?.actor?.type === "group" || t?.actor?.hasPlayerOwner || packedGroup()) render(); });
  // Every scene switch wipes any travel route left on the scenes you're NOT on (DM 2026-07-19: "every
  // time you switch scenes, run the cleanup"). Sparing the current scene keeps a route you're actively
  // drawing/travelling; a normal journey never fires canvasReady, so it's untouched mid-walk. Active GM
  // only (one writer). If the clear leaves nothing on the current scene, drop the stale route state too.
  Hooks.on("canvasReady", () => {
    if (game.users.activeGM?.id !== game.user.id) return;
    deleteTravelRouteDrawings(canvas.scene?.id).then(n => {
      if (n && !canvas.scene?.drawings.some(d => d.getFlag(MODULE_ID, "travelRoute"))) { resetTravelRoute(); render(); }
    }).catch(() => {});
  });
  Hooks.on("deleteToken", (t) => { if (t?.actor?.type === "group" || t?.actor?.hasPlayerOwner || packedGroup()) render(); });
  Hooks.on("updateToken", (t, ch) => { if (t?.actor?.type === "group" && ("x" in ch || "y" in ch)) render(); });
  // Combat nudge: adding/removing the packed group in the tracker toggles the
  // Disperse pulse (decision §15.2#6 — nudge, never force).
  Hooks.on("createCombatant", (cb) => { if (cb?.actor?.type === "group") render(); });
  Hooks.on("deleteCombatant", (cb) => { if (cb?.actor?.type === "group") render(); });
  window.addEventListener("resize", () => { if (panelEl) clampPos(panelEl); });
  render();
}
