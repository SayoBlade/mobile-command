// Headless check of deck mode's policy (DECK-MODE.md): what the DM panel hides when he has a deck.
// No world, no server, no locks — just the setting and the two lists.
//
//   node tools/test-deck-mode.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).

/* ── the smallest fake Foundry this file needs: one setting ──────────────────────────────────── */
const store = new Map();
globalThis.game = {
  settings: {
    register: (mod, key, def) => store.set(`${mod}.${key}`, def.default),
    get: (mod, key) => {
      const k = `${mod}.${key}`;
      if (!store.has(k)) throw new Error(`not registered: ${k}`);
      return store.get(k);
    },
    set: (mod, key, v) => store.set(`${mod}.${key}`, v),
  },
};

const M = await import("../scripts/deck-mode.js");
const MOD = "mobile-command";
const setSurface = (v) => store.set(`${MOD}.${M.SURFACE_SETTING}`, v);

/* ── the runner ───────────────────────────────────────────────────────────────────────────────── */
let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}

/* ── 1. unregistered is PANEL, not a throw ──────────────────────────────────────────────────── */
check("an unregistered setting reads as panel mode", M.surface() === M.SURFACE_PANEL, M.surface());
check("so nothing is hidden before the setting exists",
  M.hiddenInDeckMode("display.fit", { actionId: null }) === false);

/* ── 2. registering defaults to PANEL ───────────────────────────────────────────────────────── */
M.registerDeckModeSetting();
check("the setting defaults to panel", M.surface() === M.SURFACE_PANEL, M.surface());
check("deckMode() is false by default", M.deckMode() === false);

/* ── 3. panel mode hides nothing, however the control is classified ─────────────────────────── */
check("panel mode keeps a registry-published control",
  M.hiddenInDeckMode("fx.rain", { actionId: "fx.rain" }) === false);
check("panel mode keeps a DC-native control",
  M.hiddenInDeckMode("display.fit") === false);

/* ── 4. deck mode: rule 1, the registry is the duplication ──────────────────────────────────── */
setSurface(M.SURFACE_DECK);
check("deckMode() is true once set", M.deckMode() === true);
check("a published action is hidden in deck mode",
  M.hiddenInDeckMode("fx.rain", { actionId: "fx.rain" }) === true);
check("an action nobody listed is STILL hidden — derived, not enumerated",
  M.hiddenInDeckMode("fx.somethingAddedNextMonth", { actionId: "fx.somethingAddedNextMonth" }) === true);

/* ── 5. deck mode: rule 2, pins beat the registry ───────────────────────────────────────────── */
check("the seance phrase is pinned and stays on the panel",
  M.hiddenInDeckMode("cm.seanceSay", { actionId: "cm.seanceSay" }) === false);
check("pick-a-curse is pinned and stays on the panel",
  M.hiddenInDeckMode("cm.curseHand", { actionId: "cm.curseHand" }) === false);

/* ── 6. deck mode: rule 3, unlisted and unpublished is KEPT ─────────────────────────────────── */
check("a control with no action and no entry is kept — fails safe",
  M.hiddenInDeckMode("rest.startRest") === false);
check("the rest flow is kept", M.hiddenInDeckMode("rest.passWatch") === false);
check("damage by amount is kept", M.hiddenInDeckMode("floor.damage") === false);
check("the sound mix is kept", M.hiddenInDeckMode("sound.musicLevel") === false);

/* ── 7. HIS RULING 2026-10-14: "keep combat as is" — nothing is hidden by name at all ────────── */
check("COMBAT stays whole — 'keep combat as is'",
  M.hiddenInDeckMode("combat.nextTurn") === false
  && M.hiddenInDeckMode("combat.start") === false
  && M.hiddenInDeckMode("combat.endCombat") === false
  && M.hiddenInDeckMode("combat.rollNpcs") === false
  && M.hiddenInDeckMode("combat.battleMusic") === false);
check("the hide-by-name list is now empty, so only published actions are hidden",
  M.HIDE_NATIVE.size === 0);

/* ── 7b. HIS RULINGS 2026-10-13 — camera and the Party tab stay ─────────────────────────────── */
check("CAMERA stays — 'keep camera controls'",
  M.hiddenInDeckMode("display.fit") === false
  && M.hiddenInDeckMode("display.follow") === false
  && M.hiddenInDeckMode("display.zoomIn") === false
  && M.hiddenInDeckMode("floor.focusParty") === false
  && M.hiddenInDeckMode("floor.manualTv") === false);
check("FORM UP stays — the whole Party tab stays", M.hiddenInDeckMode("party.formUp") === false);
check("party ORDER stays, and is protected by the tier rule, not just the list",
  M.hiddenInDeckMode("party.order") === false && M.tierKeepsOnPanel("party.order") === true);
check("the stash and the downtime board stay for the same reason",
  M.tierKeepsOnPanel("stash.putIn") === true && M.tierKeepsOnPanel("downtime.board") === true);
check("a tier-backed control stays even if someone publishes an action for it",
  M.hiddenInDeckMode("party.order", { actionId: "party.order" }) === false);
check("an unrelated control is not tier-backed", M.tierKeepsOnPanel("fx.rain") === false);

/* ── 8. the two capability traps I checked for, which MUST stay visible ─────────────────────── */
check("PREVIOUS TURN is not in HIDE_NATIVE — he retired the deck key, so the panel is its route",
  M.hiddenInDeckMode("combat.prevTurn") === false);
check("CREATE PARTY is not in HIDE_NATIVE — DC's New party key only says 'make one'",
  M.hiddenInDeckMode("party.createParty") === false);
check("ADD PCS is not in HIDE_NATIVE — DC's Add to party only opens the sheet",
  M.hiddenInDeckMode("party.addPcs") === false);

/* ── 9. why a control went away ─────────────────────────────────────────────────────────────── */
check("a published control explains itself by action id",
  String(M.hiddenBecause("fx.rain", { actionId: "fx.rain" })).includes("fx.rain"));
check("nothing is hidden by name, so nothing has a name-based reason",
  M.hiddenBecause("combat.nextTurn") === null);
check("a kept control has no reason to give", M.hiddenBecause("rest.startRest") === null);

/* ── 10. an all-hidden drawer disappears; a mixed one does not ──────────────────────────────── */
check("a drawer of published actions is hidden whole",
  M.drawerHidden([{ id: "fx.rain", actionId: "fx.rain" }, { id: "fx.snow", actionId: "fx.snow" }]) === true);
check("a drawer with one kept control stays",
  M.drawerHidden([{ id: "fx.rain", actionId: "fx.rain" }, { id: "fx.vol", actionId: null }]) === false);
check("an empty drawer is not 'all hidden'", M.drawerHidden([]) === false);

/* ── 11. and none of it applies back in panel mode ──────────────────────────────────────────── */
setSurface(M.SURFACE_PANEL);
check("flipping back to panel restores everything",
  M.hiddenInDeckMode("display.fit") === false
  && M.hiddenInDeckMode("fx.rain", { actionId: "fx.rain" }) === false
  && M.drawerHidden([{ id: "fx.rain", actionId: "fx.rain" }]) === false);

console.log(`\nAll ${n} checks passed.`);
