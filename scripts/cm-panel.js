import { MODULE_ID } from "./preset.js";
import { isOnlineTable } from "./settings.js";
import { scenePcs, pcUser, pcColor, pcSeatRot } from "./roster.js";
import { fxIsOn, fxIsOnFor, FX_DEFS } from "./effects.js";
import { FATE_THREADS, FATE_STEPS } from "./fateweaving.js"; // §34 Fateweaving tracker
import { CURSES, curseTableUuid } from "./cm-curses.js"; // §33 Chaotic Curses
import {
  cmLive, seanceDie, seanceSitters, toggleSeanceSitter, toggleSeanceBoard, seanceQuestion, seanceBite, seanceSay,
  curseState, curseCandidates, bargainRequests, bargainModeOn, setCurseTarget, setCurseMinutes, rollStagedCurse,
  pickStagedCurse, cancelStagedCurse, acceptStagedCurse, strikeBargain, declineBargain, toggleBargainMode, liftCurse,
  setFateThread, fateTouch, adjustTwists, spendTwist, refundTwist, armedTwists, disarmTwist,
  druskNextHour, toggleDruskMap, tarotForced, setTarotForced, tarotTaken, dealTarotTo, takeTarotBack,
  trainState, introActorId, toggleStationMist, toggleFiddle, toggleEngine, trainWhistle, trainBrakes, setTrainIn,
  trainArriveFor, toggleIntro, toggleTicket, boardingUsers, allTicketsOut, setAllTickets, stageFirstBoarding,
  wireDoors, setRide,
} from "./cm-live.js";
import { trainScenes, trainChains, trainMistOn } from "./cm-train.js"; // §37 the Ghostlight ride · §36.2 the first boarding
import { actorCard, ARCANA, hasBookArt } from "./tarot.js"; // §42 the Fated Tarot
import { DRUSK_HOURS, currentHour, isDruskScene, druskSceneIds } from "./druskenvald.js"; // §43 the clock
import { entranceList, entranceShadowed } from "./entrances.js"; // §40.6 the themed entrances

/**
 * ── THE CROOKED MOON TAB OF THE DM PANEL (§35) — a content pack's panelTab (§54) ─────────────
 *
 * Lifted out of dm-panel.js on 2026-09-22, unchanged in behaviour: the same drawers, the same
 * data-* handlers, the same verbs in cm-live.js. What changed is the seam — the panel no longer
 * imports any of this; it asks the pack registry for tabs and lends this file its own helpers
 * through `ctx` (render, drawer, backPicker, panelEl). The DM-local state that used to be panel
 * variables (the séance draft, the open arrival script) lives here now.
 */

let ctx = null; // { render, drawer, backPicker, panelEl } — lent by dm-panel.js when the tab mounts
const render = () => ctx?.render();
const dtDrawer = (...a) => ctx.drawer(...a);
const backPickerHTML = (...a) => ctx.backPicker(...a);
const done = () => { render(); return true; }; // a handled click: repaint, and tell the panel so

let seanceDraft = ""; // §30: the phrase the planchette will spell, kept across re-renders

// §30 the séance drawer: board toggle, who's at the board, the phrase, and the module's
// danger mechanic (§30.1): d10 per question; on a 1 the board bites — escalating psychic
// damage (1d4→1d6→1d8→1d10→1d12) to every participant, with the glitch on the TV and
// their phones growing with the die. The dice, the sitters and the escalation live in cm-live.js.
function seanceBody() {
  const esc = foundry.utils.escapeHTML;
  const on = fxIsOn("seance");
  const { armed: seanceArmed, lastD10: seanceLastD10 } = cmLive().seance;
  // The sitters: player-owned CHARACTERS only — pets/summons don't hold the planchette.
  // Scene-scoped via scenePcs() (DM 2026-07-27, UI-BIBLE §6.6); a sitter who left the map is dropped.
  const pcs = scenePcs();
  const sitters = new Set(seanceSitters().map(a => a.id));
  const rows = pcs.map(a => {
    const inParty = sitters.has(a.id);
    return `<button class="mc-seance-pc ${inParty ? "mc-on" : ""}" data-seance-pc="${a.id}" title="${inParty ? `${esc(a.name)} is at the board` : `Seat ${esc(a.name)} at the board`}">
      <i class="fas fa-circle-user" style="color:${pcColor(a)}"></i><span>${esc(a.name)}</span>
      ${inParty ? `<i class="fas fa-check mc-seance-pc-check"></i>` : ""}
    </button>`;
  }).join("");
  // The d10 is the ritual; the skull is ALWAYS live — the DM can cheat (DM 2026-07-27: ~30
  // civil questions in a row and nobody got zapped; never lock the payoff behind the roll).
  const canBite = on && sitters.size;
  const rollBtn = `<button class="mc-fx-btn mc-fx-voicebtn" data-seance-d10 title="Roll the question d10 — on a 1 the board bites" ${canBite && !seanceArmed ? "" : "disabled"}><i class="fas fa-dice-d10"></i></button>
    <button class="mc-fx-btn mc-fx-voicebtn ${seanceArmed ? "mc-seance-dmg" : ""}" data-seance-dmg title="${seanceArmed ? `The board bites — 1d${seanceDie()} psychic to everyone at it` : `Bite anyway — 1d${seanceDie()} psychic, no roll needed`}" ${canBite ? "" : "disabled"}><i class="fas fa-skull"></i></button>`;
  const status = seanceArmed
    ? `<div class="mc-seance-status mc-bad">d10: 1 — the board bites. Roll 1d${seanceDie()} psychic.</div>`
    : seanceLastD10 != null
      ? `<div class="mc-seance-status">d10: ${seanceLastD10} — the spirits stay civil.</div>`
      : "";
  return `
    <button class="mc-fx-btn ${on ? "mc-on" : ""}" data-fx="seance" title="${FX_DEFS.seance.hint}" style="width:100%"><i class="fas ${FX_DEFS.seance.icon}"></i><span>Spirit Board</span></button>
    <div class="mc-seance-party">${rows || `<div class="mc-dmp-empty">No player characters.</div>`}</div>
    <div class="mc-fx-voicerow">
      <input type="text" class="mc-fx-voice" data-seance-text maxlength="120" placeholder="What the spirits say… (YES, NO, HELLO, GOODBYE land whole)" value="${esc(seanceDraft)}" ${on ? "" : "disabled"}>
      <button class="mc-fx-btn mc-fx-voicebtn" data-seance-send title="The planchette spells it out (Enter works too)" ${on ? "" : "disabled"}><i class="fas fa-hand-point-up"></i></button>
      ${rollBtn}
    </div>
    ${status}`;
}

// §30 shared by the Send button and Enter in the input.
function seanceSend() {
  if (!seanceSay(seanceDraft)) { ui.notifications.warn("Write what the spirits say — letters and numbers only."); return; }
  seanceDraft = "";
  render();
}

// --- §43 The Druskenvald clock: eternal night, told in six named hours ----------------------
// The panel's job is small on purpose: say which hour it is in words the DM can read aloud, mark
// which scenes are under the eternal night, and let the DM push the hour on when the story wants
// it. The darkness itself is §41's loop with a second curve — nothing here writes a scene.
function druskBody() {
  const esc = foundry.utils.escapeHTML;
  const here = currentHour();
  const scene = canvas?.scene;
  const marked = isDruskScene(scene);
  const ids = druskSceneIds();
  const names = ids.map(id => game.scenes.get(id)?.name).filter(Boolean);
  const dial = DRUSK_HOURS.map(h => `
    <span class="mc-drusk-pip ${h.key === here.key ? "mc-on" : ""}" title="${esc(h.name)}"
      style="--pip:${h.sky}"></span>`).join("");
  return `
    <div class="mc-drusk-now">
      <span class="mc-drusk-nowname">${esc(here.name)}</span>
      <span class="mc-drusk-dial">${dial}</span>
    </div>
    <button class="mc-dmp-pf-fix mc-dmp-story-random" data-drusk-next
      title="Push the clock to the start of the next named hour">
      <i class="fas fa-forward"></i> Next Hour</button>
    <button class="mc-dmp-pf-fix ${marked ? "mc-on" : ""}" data-drusk-mark
      title="${scene ? (marked ? `“${esc(scene.name)}” is under the eternal night — tap to release it` : `Put “${esc(scene.name)}” under the eternal night`) : "No scene"}"
      ${scene ? "" : "disabled"}>
      <i class="fas fa-moon"></i> ${marked ? "This Map Is Druskenvald" : "Mark This Map"}
    </button>
    <div class="mc-dmp-story-status">${names.length
      ? `Eternal night on: ${esc(names.join(", "))}`
      : "No maps marked — everywhere still has a sun."}</div>`;
}

// --- §42 The Fated Tarot: one card, into one character's hand ------------------------------
// ONE AT A TIME (DM 2026-08-11). The DM picks a character and deals; that card fills THAT
// player's phone face down, and they turn it over themselves. Nothing goes to the shared screen —
// the phone is the card (§36's ticket, which was always the better model than a spread with a
// remote-controlled highlight).
//
// THE CHEAT IS THE DROPDOWN BESIDE THE NAME, and it is just an argument to the deal — there is no
// "forced card" state to keep in sync with anything, and nothing to clean up if the DM changes
// their mind. "— let the cards decide —" rolls from what nobody holds; naming an arcana deals
// exactly that (UI-BIBLE §8.1: the draw is the ritual, the DM is the authority).
// (The cheat — actorId → the arcana chosen for their next draw — lives in cmLiveState since
//  2026-09-18: tarotForced / setTarotForced in cm-live.js, so the deck can set it too.)
function tarotBody() {
  const esc = foundry.utils.escapeHTML;
  const pcs = scenePcs();
  if (!pcs.length) return `<div class="mc-dmp-empty">No player characters in this scene.</div>`;
  const taken = tarotTaken();
  const rows = pcs.map(a => {
    const card = actorCard(a);
    const chosen = tarotForced(a.id) ?? "";
    // THE CARD'S NAME IS NOT SHOWN HERE (DM 2026-08-11: "remove the card name, there's no real
    // reason for the DM to know beforehand now"). It was a leftover from the spread, where the
    // DM's foreknowledge was the point — they were laying five out and steering someone toward
    // one. Now the deal goes straight into a hand, so the panel only needs to say WHETHER they're
    // holding one; what it is belongs to the player until they turn it over.
    const holds = !!card;
    // Arcana someone else holds are struck from the list — the book's no-duplicates rule, made
    // visible rather than enforced silently at deal time.
    const opts = ARCANA.map(c => {
      const gone = taken.has(c.key) && card?.key !== c.key;
      return `<option value="${c.key}" ${c.key === chosen ? "selected" : ""} ${gone ? "disabled" : ""}>${esc(c.name)}${gone ? " ·held" : ""}</option>`;
    }).join("");
    // TWO LINES, because one doesn't fit. The panel is ~320px and a name, a dropdown, a Deal and
    // a ✕ on one row pushed the button past the drawer's edge (DM 2026-08-11, screenshot). Name
    // and its ✕ on top, the controls beneath — each line then has room to be itself.
    return `<div class="mc-tarot-row">
      <div class="mc-tarot-line">
        <span class="mc-tarot-who"><i class="fas fa-circle-user" style="color:${pcColor(a)}"></i>${esc(a.name)}</span>
        ${holds ? `<span class="mc-tarot-hold" title="They're holding a card — what it is, is theirs">holding</span>` : ""}
        ${holds ? `<button class="mc-dt-icon-only mc-boss-del" data-tarot-clear="${a.id}" title="Take ${esc(a.name)}'s card back — it returns to the deck"><i class="fas fa-xmark"></i></button>` : ""}
      </div>
      <div class="mc-tarot-line">
        <select class="mc-tarot-force" data-tarot-pick="${a.id}" title="Decide what they draw, or let the cards choose">
          <option value="">— let the cards decide —</option>${opts}
        </select>
        <button class="mc-dmp-mini mc-boss-play" data-tarot-deal="${a.id}"
          title="${holds ? `Deal ${esc(a.name)} another card — their current one goes back` : `Put a card in ${esc(a.name)}'s hand, face down`}">
          <i class="fas fa-hand-sparkles"></i> ${holds ? "Again" : "Deal"}</button>
      </div>
    </div>`;
  }).join("");
  // The tools can be switched on without the book (the setting is a default, not a lock), and
  // then every plate 404s to a blank card. Say so here rather than let it look broken on a phone.
  const noArt = hasBookArt() ? "" : `<div class="mc-dmp-story-status mc-bad">The Crooked Moon isn't installed — the cards have no faces to show.</div>`;
  return `${rows}
    <div class="mc-dmp-story-status">${22 - taken.size} of 22 arcana still in the deck</div>
    ${noArt}
    ${backPickerHTML("tarotBackImage", "Tarot back")}`;
}

// §26.6 Player drawer: pick the victim, then per-phone toggles/shots. Same roster row shape as

// V1 resident: the séance board (moved in from Effects). Twists/curses/fateweaving follow.
function cmToolsOn() {
  try { return !!game.settings.get(MODULE_ID, "crookedMoonTools"); } catch (e) { return false; }
}
function crookedTabHTML() {
  // All five start CLOSED (DM 2026-08-02). Five open drawers made the tab a wall of controls you
  // had to scroll past to reach the one you wanted; opening the one you're using is one tap, and
  // the choice sticks for the session (dtDrawers remembers per key).
  return `<div class="mc-dmp-tabfill"><div class="mc-dmp-tabmid">
    ${dtDrawer("cmIntros", "Intros", "", entrancesBody(), true)}
    ${dtDrawer("cmCurses", "Chaotic curses", "", curseBody(), true)}
    ${dtDrawer("cmFate", "Fateweaving", "", fateBody(), true)}
    ${dtDrawer("cmTwists", "Twists of fate", "", twistsBody(), true)}
    ${dtDrawer("cmClock", "Druskenvald clock", "", druskBody(), true)}
    ${dtDrawer("cmTarot", "Fated tarot", "", tarotBody(), true)}
    ${dtDrawer("cmBoard", "All aboard", "", allAboardBody(), true)}
    ${dtDrawer("cmRide", "The Ghostlight ride", "", trainRideBody(), true)}
    ${dtDrawer("fxSeance", "Séance", "", seanceBody(), true)}
  </div></div>`;
}

// §40.6 Intros: the book's NPCs, each with a themed entrance banner, in campaign order under their chapter.
// One tap plays it on the table's screen (a foe's pauses the game first, like the boss intro; a friend's doesn't).
// The line under each name is what the players will read, so the DM can check it gives nothing away.
function entrancesBody() {
  const esc = foundry.utils.escapeHTML;
  const list = entranceList();
  if (!list.length) return `<div class="mc-dmp-empty">No intros for this campaign yet.</div>`;
  let chapter = null;
  const rows = list.map(e => {
    const head = e.chapter !== chapter ? `<div class="mc-entr-ch">Chapter ${e.chapter}</div>` : "";
    chapter = e.chapter;
    const who = e.name1 ? `${esc(e.name1)} <i class="fas fa-arrow-right mc-entr-into"></i> ${esc(e.name)}` : esc(e.name);
    const line = [e.name1 ? e.sub1 : "", e.sub].filter(Boolean).map(x => esc(x)).join(" → ");
    // An alternate known form: the banner opens on whichever of them stands on the map (entrances.js resolveForm).
    const alt = e.alts?.length ? `<small>Opens on ${esc([e.name1, ...e.alts.map(a => a.name)].join(" or "))} — whoever is on the map</small>` : "";
    return `${head}<div class="mc-entr-row">
      <img class="mc-entr-thumb" src="${esc(encodeURI(e.portrait))}" alt="">
      <span class="mc-entr-name">${who}${line ? `<small>${line}</small>` : ""}${alt}</span>
      ${e.pause ? `<i class="fas fa-pause mc-entr-pause" title="Pauses the game first"></i>` : ""}
      ${e.reveal ? `<button class="mc-dt-icon-only mc-entr-shadow ${entranceShadowed(e.key) ? "mc-on" : ""}" data-entrance-shadow="${esc(e.key)}"
        title="${entranceShadowed(e.key) ? "In shadow until the intro — click to bring it out now" : "Put it in shadow on this scene; the intro reveals it"}"><i class="fas fa-moon"></i></button>` : ""}
      <button class="mc-dmp-mini mc-entr-play" data-entrance-play="${esc(e.key)}" title="Play it on the table's screen"><i class="fas fa-play"></i> Play</button>
    </div>`;
  }).join("");
  return `<div class="mc-entr-list">${rows}</div>
    <div class="mc-fx-voicerow"><button class="mc-fx-btn" data-entrance-stop style="flex:1" title="Cut the running intro short"><i class="fas fa-stop"></i><span>Stop Intro</span></button></div>`;
}

// §33 Chaotic Curses: pick a victim, roll (or hand-pick) a curse, Accept to land it. Curses
// lift THEMSELVES after their real-world minutes; every active one is listed with its clock
// and a ✕ — the DM can always end misfortune early (§8.1 in both directions).
// The target, the minutes (10/20/30 — the book's 15–30 band) and the staged { n, name, text, builtin }
// awaiting Accept live in cmLiveState since 2026-09-18 (cm-live.js curseState), shared with the deck.
function curseBody() {
  const esc = foundry.utils.escapeHTML;
  // §33 bargain mode: open reroll requests. ALL flagged PCs, not just this scene's — a
  // request from elsewhere must not vanish; they are unioned into the picker too, or the
  // scene-scoped fallback would silently retarget a struck bargain at pcs[0].
  const bargains = bargainRequests();
  const pcs = curseCandidates();
  const { target: curseTarget, mins: curseMins, pick: cursePick } = curseState();
  const targets = pcs.map(a => `<button class="mc-seance-pc ${curseTarget === a.id ? "mc-on" : ""}" data-curse-target="${a.id}"
      title="The next curse lands on ${esc(a.name)}">
      <i class="fas fa-circle-user" style="color:${pcColor(a)}"></i><span>${esc(a.name)}</span>
      ${curseTarget === a.id ? `<i class="fas fa-hand-sparkles mc-seance-pc-check"></i>` : ""}
    </button>`).join("");
  const mins = [10, 20, 30].map(m =>
    `<button class="mc-curse-min ${curseMins === m ? "mc-on" : ""}" data-curse-mins="${m}">${m}m</button>`).join("");
  const custom = !!curseTableUuid();
  const pickOpts = custom ? "" : `<select class="mc-fate-select" data-curse-pickn title="Pick a curse instead of rolling">
      <option value="">Pick instead…</option>
      ${CURSES.map((c, i) => `<option value="${i + 1}">${i + 1} — ${esc(c.name)}</option>`).join("")}
    </select>`;
  const card = cursePick ? `<div class="mc-twist-req mc-curse-card">
      <div class="mc-twist-reqtext"><b>${cursePick.n ? `${cursePick.n} — ` : ""}${esc(cursePick.name)}</b><br>${esc(cursePick.text)}</div>
      <button class="mc-cmb-ticket mc-on" data-curse-accept title="Accept — it lands on the chosen character for ${curseMins} real minutes"><i class="fas fa-check"></i></button>
      <button class="mc-cmb-ticket" data-curse-roll title="Roll again"><i class="fas fa-dice"></i></button>
      <button class="mc-cmb-ticket" data-curse-cancel title="Never mind"><i class="fas fa-xmark"></i></button>
    </div>` : "";
  const active = pcs.flatMap(a => actorCurses(a).map(e => {
    const left = Math.max(0, Math.ceil(((e.flags[MODULE_ID].expiresAt ?? 0) - Date.now()) / 60000));
    return `<div class="mc-cmb-row mc-curse-live">
      <div class="mc-seance-pc mc-twist-pcrow"><i class="fas fa-eye"></i><span>${esc(a.name)} — ${esc(e.name)}</span></div>
      <span class="mc-twist-n mc-on">${left}m</span>
      <button class="mc-cmb-ticket" data-curse-x="${a.id}:${e.id}" title="Lift it early"><i class="fas fa-xmark"></i></button>
    </div>`;
  })).join("");
  // §33 bargain mode: a player is offering to buy a reroll. Strike = stage a curse roll on
  // them (the Accept is the permission); ✕ = the Moon declines. The toggle below arms the
  // player-side ask card.
  const bargainOn = bargainModeOn();
  const requests = bargains.map(a => `<div class="mc-cmb-row mc-bargain-req">
      <div class="mc-seance-pc mc-twist-pcrow"><i class="fas fa-scale-unbalanced"></i>
        <span><b>${esc(a.name)}</b> asks to reroll — at a curse's price</span></div>
      <button class="mc-cmb-ticket mc-on" data-bargain-strike="${a.id}" title="Strike the bargain — roll the curse it costs"><i class="fas fa-dice"></i></button>
      <button class="mc-cmb-ticket" data-bargain-decline="${a.id}" title="Decline — the roll stands"><i class="fas fa-xmark"></i></button>
    </div>`).join("");
  return `
    ${requests}
    <div class="mc-seance-party">${targets || `<div class="mc-dmp-empty">No player characters.</div>`}</div>
    <div class="mc-fx-voicerow">
      <button class="mc-fx-btn" data-curse-roll style="flex:1" ${curseTarget ? "" : "disabled"}
        title="${custom ? "Roll on the configured curse table" : "Roll the d100 of small misfortunes"}">
        <i class="fas fa-dice"></i><span>Roll Curse</span></button>
      <div class="mc-curse-mins">${mins}</div>
    </div>
    ${pickOpts}
    ${card}
    ${active ? `<div class="mc-curse-list">${active}</div>` : ""}
    <div class="mc-fx-voicerow mc-bargain-row">
      <button class="mc-curse-min ${bargainOn ? "mc-on" : ""}" data-bargain-toggle
        title="Bargain mode: players may ask to reroll a bad roll — the price is a curse roll, and your Accept is the permission">
        <i class="fas fa-scale-unbalanced"></i> Bargains ${bargainOn ? "on" : "off"}</button>
    </div>
    <p class="mc-dmp-set-note">Good moments to reach for one: a natural 1 · combat's end · a long
      rest · touching something best left alone. Curses lift themselves when their time is up.</p>`;
}

// §34 Fateweaving: assign each PC a Thread of Fate, then tap the six touchpoint dots as the
// story reaches them. Advancing a dot applies its book reward (inspiration / Bless / a twist)
// or whispers a sheet-level reminder (+2 ability, feat). Tapping the reached dot retracts it
// (bookkeeping only — rewards are never clawed back automatically).
function fateBody() {
  const esc = foundry.utils.escapeHTML;
  const rows = scenePcs().map(a => {
    const ft = a.getFlag(MODULE_ID, "fateThread");
    const t = ft?.key ? FATE_THREADS[ft.key] : null;
    const reached = Math.min(Number(ft?.reached ?? 0), 6);
    const opts = [`<option value="">— no thread —</option>`,
      ...Object.entries(FATE_THREADS).map(([k, v]) => `<option value="${k}" ${ft?.key === k ? "selected" : ""}>${esc(v.name)}</option>`)].join("");
    const dots = t ? `<div class="mc-fate-dots">${FATE_STEPS.map((s, i) => {
      const n = i + 1, on = n <= reached;
      return `<button class="mc-fate-dot ${on ? "mc-on" : ""}" data-fate-dot="${a.id}:${n}"
        title="${esc(s.name)} — ${esc(s.reward)}${on ? " (reached — tap to retract)" : ""}">${n}</button>`;
    }).join("")}</div>` : "";
    return `<div class="mc-cmb-row">
      <div class="mc-seance-pc mc-twist-pcrow"><i class="fas fa-circle-user" style="color:${pcColor(a)}"></i><span>${esc(a.name)}</span></div>
      <select class="mc-fate-select" data-fate-thread="${a.id}" title="${t ? esc(t.goal) : "Assign a Thread of Fate"}">${opts}</select>
    </div>${dots}`;
  }).join("");
  return `<div class="mc-seance-party">${rows || `<div class="mc-dmp-empty">No player characters.</div>`}</div>`;
}

// §31 Twists of Fate: per-PC counters (grant/revoke) + the pending-spend chips. A twist is a
// held token — once per turn the holder declares any visible creature's d20 a natural 1 or 20.
// The player's phone writes twistPending on their actor; ONLY a spend here takes the token
// (and posts the public fate card — the whole table should see fate snap). Keep = refund.
//
// v3 (DM 2026-09-05, replacing v2's auto-apply): "I'm not convinced a mechanism to change the
// roll is a good call — I think I might just want a popup for the DM letting them know a player
// is using a twist and let the DM change it; there's just too many options for rolls." So the
// spend is a POPUP on the DM's screen the moment the phone asks, with two answers — Spend it
// (the DM sets the die by hand on that roll) or Keep it — and the same pair on the Crooked Moon
// tab's chip for a popup that was closed. The whose-die picker and the armed-flag machinery
// (twists.js) are no longer reachable from the panel; the hooks stay so a leftover armed flag
// still resolves, and the disarm chip still shows one.
const twistDialogs = new Map(); // actor id → the open DialogV2 for that request
// (spendTwist / refundTwist / armedTwists live in cm-live.js since 2026-09-18 — the deck's Spend and
//  Keep keys call the same two functions this popup does.)

// The popup. One per request; a repeat (the phone rewriting the same flag) replaces it, and a
// withdrawal from the phone closes it (see the updateActor watcher in registerDMPanel).
function twistPopup(a, p) {
  if (!ctx?.panelEl || !game.user?.isGM || !a || !p) return;
  try { twistDialogs.get(a.id)?.close(); } catch (e) { /* already gone */ }
  const esc = foundry.utils.escapeHTML;
  const face = p.die === 1 ? "1" : "20";
  const have = Number(a.getFlag(MODULE_ID, "twists") ?? 0);
  const dlg = new foundry.applications.api.DialogV2({
    window: { title: "Twist of Fate", icon: "fas fa-shuffle" },
    content: `<p><b>${esc(a.name)}</b> is twisting fate: they want the next d20 to land on a <b>natural ${face}</b>${p.note ? ` — <em>${esc(p.note)}</em>` : ""}.</p>
      <p>Spend it and set that die yourself when the roll comes — or keep it, and nothing happens.</p>
      <p style="opacity:.75">${have > 0 ? `${have} twist${have === 1 ? "" : "s"} in hand, ${Math.max(0, have - 1)} after this.` : "They have no twists left — spending will simply post the card."}</p>`,
    buttons: [ // bible §4.1.1: right is forward — DialogV2 renders array order L→R
      { action: "keep", label: "Keep it", icon: "fas fa-xmark", callback: () => refundTwist(a) },
      { action: "spend", label: "Spend it", icon: "fas fa-check", default: true, callback: () => spendTwist(a) }
    ]
  });
  twistDialogs.set(a.id, dlg);
  dlg.render({ force: true });
}

function twistsBody() {
  const esc = foundry.utils.escapeHTML;
  const pcs = scenePcs();
  const rows = pcs.map(a => {
    const n = Number(a.getFlag(MODULE_ID, "twists") ?? 0);
    return `<div class="mc-cmb-row">
      <div class="mc-seance-pc mc-twist-pcrow"><i class="fas fa-circle-user" style="color:${pcColor(a)}"></i><span>${esc(a.name)}</span></div>
      <button class="mc-cmb-ticket" data-twist-adj="${a.id}:-1" ${n > 0 ? "" : "disabled"} title="Take a twist back">−</button>
      <span class="mc-twist-n ${n ? "mc-on" : ""}">${n}</span>
      <button class="mc-cmb-ticket" data-twist-adj="${a.id}:1" title="Grant ${esc(a.name)} a Twist of Fate">+</button>
    </div>`;
  }).join("");
  const pending = pcs.filter(a => a.getFlag(MODULE_ID, "twistPending"));
  const chips = pending.map(a => {
    const p = a.getFlag(MODULE_ID, "twistPending");
    const face = p.die === 1 ? "1" : "20";
    const head = `<div class="mc-twist-reqtext"><i class="fas fa-shuffle"></i> <b>${esc(a.name)}</b> twists fate —
        natural <b>${face}</b>${p.note ? ` · <i>${esc(p.note)}</i>` : ""}</div>`;
    return `<div class="mc-twist-req">${head}
      <button class="mc-cmb-ticket mc-on" data-twist-spend="${a.id}" title="Spend it — you set the die yourself on that roll"><i class="fas fa-check"></i></button>
      <button class="mc-cmb-ticket" data-twist-dismiss="${a.id}" title="Keep it — the twist stays in hand, nothing happens"><i class="fas fa-xmark"></i></button>
    </div>`;
  }).join("");
  const armed = armedTwists().map(x => `<div class="mc-twist-req mc-twist-armed">
      <div class="mc-twist-reqtext"><i class="fas fa-bolt"></i> <b>${esc(x.name)}</b> — the next d20 lands a
        <b>natural ${x.arm.die === 1 ? "1" : "20"}</b>${x.arm.by ? ` · <i>${esc(x.arm.by)}'s twist</i>` : ""}</div>
      <button class="mc-cmb-ticket" data-twist-disarm="${x.uuid}" title="Disarm — apply the die by hand instead"><i class="fas fa-xmark"></i></button>
    </div>`).join("");
  return `${chips}${armed}<div class="mc-seance-party">${rows || `<div class="mc-dmp-empty">No player characters.</div>`}</div>`;
}

// (scenePcs / pcUser / pcColor / pcSeatRot — the PC roster, scene-scoped per UI-BIBLE §6.6 — live
//  in roster.js since 2026-09-18, shared with the deck's action list.)

// §37 The Ghostlight ride: wire the car-to-car doors (once per world) and set the Shroud
// rushing past the windows. Works on the book's 10.x car scenes, both art sets.
function trainRideBody() {
  const cars = trainScenes();
  const wired = cars.filter(s => s.regions.some(r => r.flags[MODULE_ID]?.trainLand)).length;
  const riding = trainMistOn();
  return `
    <button class="mc-fx-btn ${riding ? "mc-on" : ""}" data-cm-mist="${riding ? "off" : "on"}" style="width:100%" ${cars.length ? "" : "disabled"}
      title="${riding ? "Bring the train to rest — the Shroud outside the windows goes still" : "The train runs — the Shroud rushes past every window"}">
      <i class="fas fa-train"></i><span>${riding ? "The train is running" : "Start the ride"}</span></button>
    <div class="mc-fx-voicerow">
      <button class="mc-fx-btn" data-cm-wire style="flex:1" ${cars.length ? "" : "disabled"}
        title="Create the car-to-car door teleports on every 10.x car scene (safe to run again — it re-checks, never duplicates)">
        <i class="fas fa-link"></i><span>${wired ? `Doors wired — ${wired} cars` : "Wire the doors"}</span></button>
    </div>
    <p class="mc-dmp-set-note">${cars.length
    ? "Walking into the vestibule at a car's end carries you to the next car — rear door of 10.1 and the Tender's far end stay sealed, as the book has them. The table follows once the whole party crosses."
    : "No 10.x car scenes in this world — import the Ghostlight Express scenes from the Crooked Moon module first."}</p>`;
}

// §36 All aboard: station on the TV, one PC introduced at a time, a life-size ticket on each
// player's phone, punched by the DM as they board. Tickets survive reloads (fxActive state).
// §36.1 The arrival (DM 2026-08-19). The station used to be a backdrop you switched on with the
// train already parked in the corner; the book's beat is that the fog comes first and the train
// EMERGES from it while the DM narrates. So the drawer is now a small stage desk: raise the fog,
// pick whose arrival this is, bring the train in aimed at their seat, and fire the three cues by
// hand as the sentences land.
//
// The story itself is the DM's, deliberately — his call: "purely the DM's job, you could open the
// sheet to make it easier for the DM, but the story is theirs and the player's". So we store and
// show it, put the character's own material next to the box so he is not hunting through sheets
// mid-sentence, and never write a word of it.
// Whether the DM has the distant-engine bed and the fiddle bed running: "did I ask for it", since
// the cues fire at every client. Separate because they end differently — the grinding stop kills
// the engine and leaves the fiddler playing (§36.1.8). Kept in cmLiveState since 2026-09-18
// (cmLive().engine / .fiddle) so the deck's keys and these buttons agree, across a reload too.
let cmStoryFor = null;   // actorId whose arrival script is open (DM-local)
let cmStoryDraft = null; // the text being edited, so a background repaint can't eat it

function boardingStory(actor) {
  try { return String(actor?.getFlag(MODULE_ID, "boardingStory") ?? ""); } catch (e) { return ""; }
}
// (Which way the Ghostlight faces for a character — pcSeatRot — is in roster.js; trainState in cm-live.js.)

// The character's own material, one line, so the DM can write their arrival without leaving the
// panel: species, class(es), background. Everything here is already on their sheet — the point is
// only that it is HERE, next to the box he is typing into.
function pcMaterial(a) {
  const sys = a.system ?? {};
  const bits = [];
  const species = a.items?.find(i => i.type === "race")?.name;
  if (species) bits.push(species);
  const classes = (a.items ?? []).filter(i => i.type === "class").map(i => `${i.name} ${i.system?.levels ?? ""}`.trim());
  if (classes.length) bits.push(classes.join(" / "));
  const bg = a.items?.find(i => i.type === "background")?.name;
  if (bg) bits.push(bg);
  const home = sys.details?.origin || sys.details?.faith;
  if (home) bits.push(home);
  return bits.join(" · ");
}

function cmStoryPane(a) {
  const esc = foundry.utils.escapeHTML;
  const text = cmStoryDraft ?? boardingStory(a);
  const mat = pcMaterial(a);
  const rot = pcSeatRot(a);
  const seated = rot !== 0 || !isOnlineTable();
  return `<div class="mc-cmb-story">
    <div class="mc-cmb-story-head">
      <span>${esc(a.name)}</span>
      <button class="mc-cmb-sheet" data-cm-sheet="${a.id}" title="Open the character sheet"><i class="fas fa-address-card"></i></button>
    </div>
    ${mat ? `<div class="mc-cmb-material">${esc(mat)}</div>` : ""}
    <textarea class="mc-cmb-script" data-cm-story-text rows="7"
      placeholder="Their arrival, in your words. Write it once, read it at the table.">${esc(text)}</textarea>
    <div class="mc-cmb-story-acts">
      <button class="mc-fx-btn" data-cm-story-save="${a.id}"><i class="fas fa-floppy-disk"></i><span>Save</span></button>
      <button class="mc-fx-btn" data-cm-arrive="${a.id}" title="${seated ? "The train pulls in facing their seat" : "Nobody is seated — the train arrives facing you"}">
        <i class="fas fa-train"></i><span>Arrive for them</span>
      </button>
    </div>
  </div>`;
}

function allAboardBody() {
  const esc = foundry.utils.escapeHTML;
  const stationOn = fxIsOn("cmStation");
  const introId = introActorId();
  const train = trainState();
  const { engine: cmSoundOn, fiddle: cmFiddleOn } = cmLive();
  const pcs = scenePcs();
  const rows = pcs.map(a => {
    const u = pcUser(a);
    const hasTicket = u ? fxIsOnFor("cmTicket", u.id) : false;
    const isIntro = introId === a.id;
    const isStory = cmStoryFor === a.id;
    const hasStory = !!boardingStory(a);
    return `<div class="mc-cmb-row">
      <button class="mc-seance-pc ${isIntro ? "mc-on" : ""}" data-cm-intro="${a.id}"
        title="${isIntro ? `Take ${esc(a.name)}'s card off the display` : `Introduce ${esc(a.name)} — their card on the display`}">
        <i class="fas fa-circle-user" style="color:${pcColor(a)}"></i><span>${esc(a.name)}</span>
        ${isIntro ? `<i class="fas fa-masks-theater mc-seance-pc-check"></i>` : ""}
      </button>
      <button class="mc-cmb-ticket ${isStory ? "mc-on" : ""}" data-cm-story="${a.id}"
        title="${isStory ? "Close the arrival" : hasStory ? `${esc(a.name)}'s arrival` : `Write ${esc(a.name)}'s arrival`}">
        <i class="fas ${hasStory ? "fa-book-open" : "fa-feather"}"></i>
      </button>
      <button class="mc-cmb-ticket ${hasTicket ? "mc-on" : ""}" data-cm-ticket="${u?.id ?? ""}" ${u ? "" : "disabled"}
        title="${!u ? `${esc(a.name)} has no player` : hasTicket ? `${esc(a.name)} boards — punch their ticket` : `Hand ${esc(a.name)} their ticket`}">
        <i class="fas fa-ticket"></i>
      </button>
    </div>${isStory ? cmStoryPane(a) : ""}`;
  }).join("");
  const users = boardingUsers();
  const allHave = allTicketsOut();
  // The order is the ORDER OF THE SCENE (DM 2026-08-19), so the drawer reads top to bottom the way
  // the book plays it: raise the mist · the fiddle pierces it · the distant engine · the whistle ·
  // bring it in · stop. Buttons in the sequence you perform them beats grouped-by-what-they-are.
  return `
    <button class="mc-fx-btn" data-cm-stage="1" style="width:100%"
      title="One tap before the narration: fog on the shared screen, the entry car set active behind it, and a party mark only you can see">
      <i class="fas fa-clapperboard"></i><span>Set the stage</span>
    </button>
    <button class="mc-fx-btn ${stationOn ? "mc-on" : ""}" data-fx="cmStation" style="width:100%"
      title="${stationOn ? "Let the fog fade away" : "The fog rises on the shared screen"}">
      <i class="fas fa-smog"></i><span>${stationOn ? "Stop mist" : "Start mist"}</span>
    </button>
    <button class="mc-fx-btn ${cmFiddleOn ? "mc-on" : ""}" data-cm-cue="fiddle" style="width:100%"
      title="${cmFiddleOn ? "The fiddler falls silent" : "A lone fiddle pierces through the fog — the book's first beat; leave it playing"}">
      <i class="fas fa-music"></i><span>${cmFiddleOn ? "Stop fiddle" : "Start fiddle"}</span>
    </button>
    <button class="mc-fx-btn ${cmSoundOn ? "mc-on" : ""}" data-cm-cue="approach" style="width:100%"
      title="${cmSoundOn ? "Fade the engine out" : "A distant engine, fading in — leave it running under the narration"}">
      <i class="fas fa-volume-low"></i><span>${cmSoundOn ? "Stop sound" : "Start sound"}</span>
    </button>
    <button class="mc-fx-btn" data-cm-cue="whistle" style="width:100%" title="${FX_DEFS.cmWhistle.hint}">
      <i class="fas fa-bullhorn"></i><span>Whistle</span>
    </button>
    <button class="mc-fx-btn ${train?.in ? "mc-on" : ""}" data-cm-train="${train?.in ? "off" : "on"}" style="width:100%"
      title="${train?.in ? "Back into the fog" : "It emerges from the gloom, aimed at whoever you last chose"}">
      <i class="fas fa-train"></i><span>${train?.in ? "Take it away" : "Bring in the train"}</span>
    </button>
    <button class="mc-fx-btn" data-cm-cue="stop" style="width:100%" title="Brakes — it squeals, sighs, and halts">
      <i class="fas fa-hand"></i><span>Stop</span>
    </button>
    <div class="mc-seance-party">${rows || `<div class="mc-dmp-empty">No player characters.</div>`}</div>
    <div class="mc-fx-voicerow">
      <button class="mc-fx-btn" data-cm-tickets-all="${allHave ? "off" : "on"}" style="flex:1" ${users.length ? "" : "disabled"}
        title="${allHave ? "Everyone boards — punch every ticket" : "Hand every player their ticket"}">
        <i class="fas fa-ticket"></i><span>${allHave ? "Punch All" : "All Tickets"}</span>
      </button>
    </div>`;
}

// (§36.2 stageFirstBoarding — the one-tap stage for the first boarding — lives in cm-live.js since
// 2026-09-18, so the deck's Set the stage key runs the very same beat.)

/* ── the pack contract: click / input / keydown, all returning true when handled ───────────── */

export async function onClick(ev) {
  // §33 Chaotic Curses: target pick / duration / roll / accept / lift.
  // (Every verb below is in cm-live.js — the deck's Crooked Moon keys call the same functions.)
  const cT = ev.target.closest("[data-curse-target]");
  if (cT) { await setCurseTarget(cT.dataset.curseTarget); return done(); }
  const cM = ev.target.closest("[data-curse-mins]");
  if (cM) { await setCurseMinutes(cM.dataset.curseMins); return done(); }
  if (ev.target.closest("[data-curse-roll]")) { await rollStagedCurse(); return done(); }
  if (ev.target.closest("[data-curse-cancel]")) { await cancelStagedCurse(); return done(); }
  // §33 bargain mode: the Accept IS the reroll permission — the open request resolves in the same
  // write, and the phone's ask card reads bargainResult and tells the player to roll.
  if (ev.target.closest("[data-curse-accept]")) { await acceptStagedCurse(); return done(); }
  // §33 bargain mode: strike (stage a curse roll on the requester) / decline / the toggle.
  const bStrike = ev.target.closest("[data-bargain-strike]");
  if (bStrike) { await strikeBargain(bStrike.dataset.bargainStrike); return done(); }
  const bDecline = ev.target.closest("[data-bargain-decline]");
  if (bDecline) { await declineBargain(bDecline.dataset.bargainDecline); return done(); }
  if (ev.target.closest("[data-bargain-toggle]")) { await toggleBargainMode(); return done(); }
  const cX = ev.target.closest("[data-curse-x]");
  if (cX) {
    const [aid, eid] = cX.dataset.curseX.split(":");
    await liftCurse(aid, eid);
    return done();
  }
  // §34 Fateweaving: touchpoint dots. Advance applies each newly crossed step's reward;
  // retract is bookkeeping only (rewards stay — the DM claws back by hand if ever needed).
  const fDot = ev.target.closest("[data-fate-dot]");
  if (fDot) {
    const [aid, nStr] = fDot.dataset.fateDot.split(":");
    await fateTouch(aid, Number(nStr));
    return done();
  }
  // §31 Twists of Fate: grant/revoke counters; Apply spends a pending twist and posts the
  // PUBLIC fate card; Dismiss refunds (pending cleared, token kept).
  const tAdj = ev.target.closest("[data-twist-adj]");
  if (tAdj) {
    const [aid, d] = tAdj.dataset.twistAdj.split(":");
    await adjustTwists(aid, Number(d));
    return done();
  }
  // v3: the chip mirrors the popup — Spend it (the DM sets the die by hand) or Keep it.
  const tSpend = ev.target.closest("[data-twist-spend]");
  if (tSpend) {
    await spendTwist(game.actors.get(tSpend.dataset.twistSpend));
    return done();
  }
  const tDisarm = ev.target.closest("[data-twist-disarm]");
  if (tDisarm) { await disarmTwist(tDisarm.dataset.twistDisarm); return done(); }
  const tDismiss = ev.target.closest("[data-twist-dismiss]");
  if (tDismiss) {
    await refundTwist(game.actors.get(tDismiss.dataset.twistDismiss));
    return done();
  }
  // §36 All aboard: introduce one PC on the display (tapping again takes the card down;
  // introducing also raises the station — one tap, not two).
  // §36.1 the stage: bring the train in / take it away. The aim it arrives at is whatever the last
  // "Arrive for them" set, so raising it from here after choosing someone keeps facing them.
  const cmTrain = ev.target.closest("[data-cm-train]");
  if (cmTrain) { await setTrainIn(cmTrain.dataset.cmTrain === "on"); return done(); }
  // §36.2 the first boarding (DM 2026-08-28): one tap sets the session-one stage.
  if (ev.target.closest("[data-cm-stage]")) { await stageFirstBoarding(); return done(); }
  // §36.1 the three cues, fired by hand as the sentences land. Approach TOGGLES — it is a bed the
  // DM leaves running under the narration, not a stab.
  const cmCue = ev.target.closest("[data-cm-cue]");
  if (cmCue) {
    const cue = cmCue.dataset.cmCue;
    if (cue === "whistle") { trainWhistle(); return true; }
    // The stop ducks the ENGINE only — the fiddle plays on (the Vagrant steps out fiddle in hand).
    if (cue === "stop") await trainBrakes();
    else if (cue === "fiddle") await toggleFiddle();
    else await toggleEngine();
    return done();
  }
  // §36.1 open / close one character's arrival script.
  const cmStory = ev.target.closest("[data-cm-story]");
  if (cmStory) {
    const id = cmStory.dataset.cmStory;
    cmStoryFor = cmStoryFor === id ? null : id;
    cmStoryDraft = null;
    return done();
  }
  const cmSheet = ev.target.closest("[data-cm-sheet]");
  if (cmSheet) { game.actors.get(cmSheet.dataset.cmSheet)?.sheet?.render(true); return true; }
  const cmSave = ev.target.closest("[data-cm-story-save]");
  if (cmSave) {
    const a = game.actors.get(cmSave.dataset.cmStorySave);
    // Read the live field, not the stashed draft: a save must never lose the last word typed
    // because a repaint happened to land between the keystroke and the tap.
    const live = ctx?.panelEl?.querySelector("[data-cm-story-text]")?.value;
    if (a) await a.setFlag(MODULE_ID, "boardingStory", String(live ?? cmStoryDraft ?? ""));
    cmStoryDraft = null;
    ui.notifications.info(`${a?.name ?? "Arrival"} saved.`);
    return done();
  }
  // "Arrive for them": raise the station, aim at their seat, and bring it in — one tap for the beat
  // the DM is actually performing, instead of three.
  const cmArrive = ev.target.closest("[data-cm-arrive]");
  if (cmArrive) { await trainArriveFor(cmArrive.dataset.cmArrive); return done(); }
  const cmIntro = ev.target.closest("[data-cm-intro]");
  if (cmIntro) { await toggleIntro(cmIntro.dataset.cmIntro); return done(); }
  // §36 one ticket: give, or punch it (boarding).
  const cmTicket = ev.target.closest("[data-cm-ticket]");
  if (cmTicket) { await toggleTicket(cmTicket.dataset.cmTicket); return done(); }
  // §36 every ticket at once — hand them out at the top of the scene, or punch the stragglers.
  const cmAll = ev.target.closest("[data-cm-tickets-all]");
  if (cmAll) { await setAllTickets(cmAll.dataset.cmTicketsAll === "on"); return done(); }
  // §37 the ride: wire every car door (idempotent), toggle the rushing Shroud.
  if (ev.target.closest("[data-cm-wire]")) { await wireDoors(); return done(); }
  const cmMist = ev.target.closest("[data-cm-mist]");
  if (cmMist) { await setRide(cmMist.dataset.cmMist === "on"); return done(); }
  // §30 séance: broadcast the phrase; the TV's planchette does the talking.
  if (ev.target.closest("[data-seance-send]")) { seanceSend(); return true; }
  const spc = ev.target.closest("[data-seance-pc]");
  if (spc) { await toggleSeanceSitter(spc.dataset.seancePc); return done(); }
  // §30.1 the question d10: on a 1 the board bites and the damage roll goes live.
  if (ev.target.closest("[data-seance-d10]")) { await seanceQuestion(); return done(); }
  // §30.1 the bite: escalating psychic damage to every sitter; the glitch (TV + their
  // phones) grows with the die — very weak the first time, ugly by 1d12.
  if (ev.target.closest("[data-seance-dmg]")) { await seanceBite(); return done(); }
  // §30.1 / §36: the two effects toggles this tab owns. A fresh séance resets the escalation
  // (toggleSeanceBoard); closing the station takes the intro card down with it (toggleStationMist).
  const fxBtn = ev.target.closest("[data-fx]");
  if (fxBtn?.dataset.fx === "seance") { await toggleSeanceBoard(); return done(); }
  if (fxBtn?.dataset.fx === "cmStation") { await toggleStationMist(); return done(); }
  // §43 Druskenvald clock: push the hour on, or put this map under the eternal night.
  if (ev.target.closest("[data-drusk-next]")) { await druskNextHour(); return done(); }
  // Re-lights the map immediately on the new curve rather than waiting for the clock to move.
  if (ev.target.closest("[data-drusk-mark]")) { if (await toggleDruskMap()) render(); return true; }

  // §42 Fated tarot: deal one into a character's hand (the cheat was for THAT draw, so it clears),
  // or take it back.
  const tDeal = ev.target.closest("[data-tarot-deal]");
  if (tDeal) { await dealTarotTo(tDeal.dataset.tarotDeal); return done(); }
  const tClear = ev.target.closest("[data-tarot-clear]");
  if (tClear) { await takeTarotBack(tClear.dataset.tarotClear); return done(); }
  return false;
}

export function onChange(ev) {
  // §42 which arcana the DM has decided this character will draw next (the cheat).
  if (ev.target.matches?.("[data-tarot-pick]")) {
    setTarotForced(ev.target.dataset.tarotPick, ev.target.value || null).then(() => render());
    return true;
  }
  // §33: the hand-pick dropdown — choosing an entry stages it like a roll would.
  if (ev.target.matches?.("[data-curse-pickn]")) {
    const n = Number(ev.target.value);
    if (n) pickStagedCurse(n).then(() => render());
    return true;
  }
  return false;
}

/** The `input` events this tab keeps drafts from, so the panel's frequent repaints never eat mid-sentence typing. */
export function onInput(ev) {
  // §30: the séance phrase.
  if (ev.target?.matches?.("[data-seance-text]")) { seanceDraft = ev.target.value; return true; }
  // §36.1: the arrival script the DM is writing.
  if (ev.target?.matches?.("[data-cm-story-text]")) { cmStoryDraft = ev.target.value; return true; }
  return false;
}

export function onKeydown(ev) {
  // §30: Enter in the séance input = Send (DM 2026-07-27, "an enter would be nice").
  if (ev.key === "Enter" && ev.target?.matches?.("[data-seance-text]")) { ev.preventDefault(); seanceSend(); return true; }
  return false;
}

/** Panel-side hooks that only make sense with a DM panel on screen: the §31 v3 twist popup. */
export function onRegister(c) {
  ctx = c;
  // §31 v3: a phone asking to twist fate pops the DM's dialog at once — no tab to be on. A
  // withdrawal (or a spend/keep from anywhere) clears the flag, which closes the dialog.
  Hooks.on("updateActor", (a, ch) => {
    const f = ch?.flags?.[MODULE_ID];
    if (!f || a?.type !== "character") return;
    if (f.twistPending && typeof f.twistPending === "object") twistPopup(a, f.twistPending);
    else if ("-=twistPending" in f || ("twistPending" in f && !f.twistPending)) {
      try { twistDialogs.get(a.id)?.close(); } catch (e) { /* already gone */ }
      twistDialogs.delete(a.id);
    }
  });
  Hooks.on("closeDialogV2", (app) => { for (const [id, d] of twistDialogs) if (d === app) twistDialogs.delete(id); });
}

/** The pack's `active()`: the world gate (§35). Exported for the pack definition and the Settings tab. */
export { cmToolsOn };

/** The panelTab contribution (§54). `id` stays "crooked" so every selector, drawer key and dockTab test is unchanged. */
export const crookedPanelTab = {
  id: "crooked",
  icon: "mc-icon-cmoon",
  title: "The Crooked Moon",
  label: "The Crooked Moon — campaign tools",
  body: crookedTabHTML,
  onClick, onChange, onInput, onKeydown, onRegister,
  // What repaints the open tab: the séance/curse/boarding state and the bargain toggle (settings),
  // a phone's twist spend or withdraw (actor flags), an armed twist consumed on an unlinked token (token delta flags).
  rerender: { settings: ["fxActive", "cmLiveState", "bargainMode"], actorFlags: true, tokenFlags: true }
};
