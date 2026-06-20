# STATUS — continue here (updated 2026-06-20, overnight)

## 🌙 Overnight build + live test (2026-06-20) — Spell upcasting + bug confirmations

Tested live on the **local clean world** (`localhost:30000` "Offline test", Restored Keep) driving the **Player 1** browser; Gamemaster was connected as executor. The local Foundry runs this repo via symlink, so player-side code was live on reload.

### ✅ Built: Spell upcasting (slot-level picker)
Leveled spells now show a **"Cast at"** row of slot chips (badge = slots left) in the action picker — base level up through your highest slot tier, default = lowest available. **Player-side verified:** Clumpy Mcruge → Chromatic Orb showed **L1×3 · L2×2 · L3×3 · L4×1**, defaulting to L1. The chosen slot rides through `useActivityStart` → `handleItemUseStart` which adds `{spell:{slot}}` to the dnd5e usage config (midi forwards `usage` to `activity.use`, confirmed in midi source).

### ✅ Confirmed: public-roll default works
On reload, `core.rollMode` = `publicroll` for the player. Good.

### 🔴 Confirmed root cause: the −100 attack
Live: Clumpy's Chromatic Orb attack showed **−100 on the phone**, but **chat shows the real roll: d20=7 → total 14**. So `wf.attackTotal` is the bogus field and `wf.attackRoll.total` (=14, = chat) is correct — exactly what the fix now reports.

### ⚠️ CRITICAL: the executor (DM) client must RELOAD to get `rpc.js` changes
The −100 and the upcast both **misbehaved in the live test** (cast deducted an **L1** slot, total showed −100) **because the Gamemaster/executor client was still on old `rpc.js`** — the player reload doesn't update the executor. **All executor-side fixes from the last day** (−100 total, upcast slot, damage/announce/attackPreview diagnostics, save relay) only activate once the **DM/executor client reloads**.

### ▶️ Do this in the morning (5 min)
1. **Reload the DM/executor (Gamemaster) client** and one phone.
2. **Upcast re-test:** as a caster with multiple slot levels, open a leveled spell → tap a higher "Cast at" chip → fire. **Expect:** that level's slot deducts (not L1) and damage scales. *(Plumbing is high-confidence but this deduction is the one thing not yet live-verified — it needs the DM reload.)*
3. **−100 re-test:** any weapon/spell attack → the phone total should match the chat roll (no more −100).
4. Glance at: init "Roll initiative" prompt when added to combat; move-pad green/yellow/red; combat-start buzz/sound; dice-tray d20 glyphs; header (inspiration on name row, dice on stats row).

*(Test left the world clean: parked workflow cancelled, the test L1 slot refunded.)*

---

# STATUS — continue here (updated 2026-06-19)

## 🖥️ TV clean-canvas + ⚙️ settings safety (2026-06-19) — UNVERIFIED, reload to load

**TV / shared display = canvas only.** Set the client's role to **Display** (Details → Leave → "This is the TV", or the module's Role setting) → it auto-hides ALL Foundry UI (sidebar, hotbar, controls, nav, players, logo, popups, menus, notifications, tooltips), leaving just the canvas. **Escape hatch:** press the **`` ` ``** (backquote) keybinding on that client to toggle the UI back (to reach settings/exit). Runtime-only — disabling the module self-reverts it. *(The hide targets the common Foundry UI ids; if any chrome leaks on your exact build, press `` ` `` and tell me which element so I can add it.)*

**Does disabling the module revert my settings? — NO, Foundry doesn't do that automatically.** mobile-command only changes midi-qol/dnd5e settings when you click **Apply preset**. As of now it **snapshots your original values** on the first apply, and you revert with either:
- the **"Revert to backup"** button in *Configure Settings → Mobile Command* (a menu button), or
- `MobileCommand.enforcer.revert()` in the console / a macro.
**Run Revert BEFORE disabling the module** to restore your pre-mobile-command midi/dnd5e settings. (The per-client `noCanvas` and the clean-display are runtime-only and revert by themselves.)

## ⚔️ GAME-DAY READINESS (asked 2026-06-19, game ~2026-06-20)

**Verdict: yes for a useful SUBSET, with the desktop as backup + a dry-run first. Not yet reliable for the fully-automated combat flow.** The DM streams Foundry on TV (Discord), players watch the stream + drive their phones.

**Use it for (solid, phone-verified):** each player viewing their sheet, editing their own HP/temp, adding/removing/looking-up conditions, browsing Actions/Spells/Equipment/Details, long-press detail cards (item/spell/skill/condition/bio), the **two-tap attack→damage** loop (verified MM + Greatsword), casting, **rests** (+ new benefits card), the move pad, favorites. This is where it shines.

**Be cautious with (unverified / multi-client):**
- **Saves/reactions reaching a player's phone** — the relay's *first* live test FAILED (prompt didn't appear; suspected the target's owner wasn't `active` from the executor's view → midi routed to the GM). **Biggest risk.** Plan: if a player must save, be ready to roll it on the DM screen or have them tap their own save from the sheet. Re-test this first (cast an AoE on a player).
- **attackPreview** (adv/dis banner) & **setMovementAction** (travel type → token) — NEW, executor side never reloaded. They **degrade gracefully** (manual adv/dis buttons + move pad still work), so not blockers — but reload the GM client to enable them, and if they misbehave they fall back to manual.
- **AoE template push** (announce → DM place) — verified once (2026-06-16) but exercise it in the dry-run.

**Setup before the session:**
1. **Reload the GM/executor desktop client AND every phone** (loads this session's code + registers the new `attackPreview`/`setMovementAction` RPCs).
2. **Per-player users:** the party is on "Player 1" — for a real multi-player game each player needs their own Foundry **user that OWNS their PC**, so their phone shows their character. (One device can cycle owned tokens via the switcher, but that's for solo testing.)
3. Apply the **midi-qol D4 preset** via the enforcer if not already.
4. **This session's UI changes were built WITHOUT live verification** (browser unavailable) — spot-check on reload: items open on long-press (incl. armor/gear/ammo), the new defense categories render, name-tap → bio, spell-level counts, the attack banner shows reasons only.

**Dry-run checklist (5 min, one phone):** open sheet → edit HP → add+remove a condition → long-press an item/spell (popup opens) → do a weapon attack (two-tap) → cast a spell → take a long rest (benefits card) → cast an AoE save on that token and watch whether the save prompt reaches the phone.



## 2026-06-19 (later) — attack adv/dis recommendation (§14 spike resolved + built)

DM picked this as the next big chunk. Spike resolved: the recommendation can't be computed on the phone (no canvas/targets — AC5E bails; statusEffectsTables has no mode), so the **executor asks AC5E directly** (fire `activity.rollAttack` with the target → AC5E annotates the roll config via `preRollAttackV2` → capture + abort) and relays `{mode, reasons}` to the phone. Phone shows a "Disadvantage suggested: Poisoned; …" banner + a star on the recommended adv/dis button (pre-selected, overridable). Built (`45b0d4b`). **Phone half verified** (mock); **executor half needs the DM's GM client reloaded** (new `attackPreview` RPC) — test item 0d.

## 2026-06-19 (batch) — status of the DM's pre-game request list

**⚠️ NONE of this was live-verified** — two browsers were connected with none selected (the selection must be made by the DM, who was asleep), so I couldn't drive the client to test the 4 new PCs or anything else. **All built from source; reload every client and spot-check before the game.** When the DM is back + picks a browser, CC can verify the batch + test the 4 PCs.

**Shipped (UNVERIFIED — reload + eyeball):**
- ✅ Item popups open for ALL items (blocker: armor/ammo/gear/other/player-made had no long-press target).
- ✅ Defense categories: Resistances / Damage Immunities / Condition Immunities / Vulnerabilities / Damage Modification (dr/di/ci/dv/dm).
- ✅ Bio on **name tap** (long-press name still = summary; long-press portrait also = bio).
- ✅ Attack banner: dropped the "X suggested" header (reasons only).
- ✅ Spellbook: learned/prepared count per level header.
- ✅ **Popup action footer** (`db384aa`): spell → Cast/Learn, skill/tool → Roll, item → Use/Equip/Attune, physical → quantity ±/Drop (2-tap). Additive (degrades to row-taps); also makes non-tappable items (armor, Aslan's flametooth) usable from the popup.

**Deferred (need live verification and/or are big — do together, NOT rushed before the game):**
- **Spells divided by caster type** + active-caster filtering + **multiple spell-point pools**. Large spellbook restructure (per-class cards already exist; the list is still by level).
- **Scroll-to-top on expand/collapse** (containers, action groups, …) — re-render scroll preservation; hard to get right blind.
- **Travel types as toggles in the profile** + **click Speed in Explore → travel picker popup**.
- **Visual tweaks** (couldn't judge unseen): Prof/Init more presence in the character card; abilities name+number aligned to bottom; extra left padding for x/y-only rows (favorites).
- **flametooth/sparkblade/Tarr(vial)/rations "no options"** — needs live inspection (likely `canUse:false`/unequipped/no-activity); they at least open on long-press now.

## 2026-06-19 — travel-type selector + condition Remove

Both verified live (phone side), pushed.

- **Travel type** (`edf19f9`) — the character card's Speed now shows the active mode ("Walk 30 ft") and taps to a picker of the actor's modes (walk/fly/swim/climb/burrow); selecting sets it + the token's real `movementAction`. **Executor side needs the DM's GM client reloaded** to register the new `setMovementAction` RPC — see test item below.
- **Remove condition** (`d1a6600`) — every condition card has a "Remove condition" button (status → toggle off, other effects → delete), including standard conditions that open their PHB rules page.

## 2026-06-18 (latest) — long-press round 2: bug fix + condition chips + Details tab

DM tested round 1 ("incredible so far"), reported a bug + two asks. All done, verified live, pushed.

- **Bug: dead first tap on a drilled-in card's X** (`87508af`) — first X did nothing, second closed both. A long-press left `#suppressClick` stuck (its trailing click was lost to the re-render) and it ate the next real tap. Fixed (reset on every pointerdown) + added a **back-stack**: X now steps spell→item→sheet.
- **Every condition chip long-pressable** (`87508af`) — round 1 only handled standard-5e conditions with a rules reference; now any chip (Hiding, Blessed, …) opens its best detail (reference → own description → change summary), in-shell.
- **Details tab fully covered** (`296cd54`) — long-press Feats/Race/Background → description; Skills/Tools → ability/proficiency/modifier/passive (tap still rolls).

## 2026-06-18 (later) — long-press detail suite shipped (AC / character / conditions)

Autonomous run on top of the verified combat-loop fix. All built **and verified live** by CC driving the Player-1 client (via the Chrome plugin), exercised through the `contextmenu` path (= the desktop long-press equivalent). Pushed.

- **In-shell content links** (`3763ffd`) — `@UUID` links in a detail card (a spell inside an item, a condition in rules text) now open in the shell's own card, never a native Foundry window. Kills the journal-lockup that needed a restart.
- **Long-press AC** (`9b8f9ef`) — AC breakdown card (equipped-armor/base + dex/shield/bonus/cover → total).
- **Long-press the name** (`54c8e4d`) — character summary (level/race/class + ability grid + prof/speed/init).
- **Long-press a condition chip** (`9de3121`) — its rules in-shell.

**DM test items added below** (real-device touch-hold timing is the one thing CC's `contextmenu` path didn't exercise). Next candidates if continuing: long-press portrait↔token image popup (or confirm tap-on-portrait is enough), favorite/unfavorite as a long-press context action, drill-into-subcategories.

## 2026-06-18 — combat loop is the open blocker; two quick fixes shipped

DM live-tested and dumped 5 observations (logged in DESIGN §13, 2026-06-18 batch). Status:

- **#1 combat loop (BLOCKER) — ✅ FIXED & VERIFIED LIVE (2026-06-18).** Root cause: `findParkedWorkflow` scanned `Object.values(MidiQOL.Workflow.workflows)`, but that's a **Map** in midi 14 → `Object.values()` is always `[]`, so the scan never found the (correctly) parked workflow and the two-tap failed for weapon AND spell. Fixed to iterate the Map's values + deref WeakRefs (commit `cda2659`; diagnostics removed in `3e9a407`). Verified: MM cast → phone shows "Roll damage" → tap rolls + applies force damage + consumes the slot. NOTE the earlier "thrown-weapon/no-slots" theories were wrong. Follow-up: MM fires 1 dart per distinct target selected (can't stack 3 on one enemy yet) — decide later, may match Foundry.
- **#2 native dialog on the phone (DM's desired flow):** still **blocked** (no-canvas Workflow crash / midi has no attacker-roll routing; §14, 2026-06-18). Near-term plan: compute proficiency + adv/dis on the phone and recommend the right button instead of the literal native dialog. Now unblocked to pursue since #1 is fixed.
- **#3 DM-added items not appearing till reload — ✅ fixed (untested):** id-based actor match + a temporary createItem console diagnostic.
- **#4 equipment items — ✅ confirmed good by DM.**
- **#5 action economy out of combat — ✅ fixed (untested):** no cost badges + no drawer auto-close out of combat.

**Next session:** verify #3 (DM adds an item → appears live; check console `createItem … matched:true`) and #5 (out of combat: no ACT/BA/RE badges, drawers stay open after use), then resolve #1 with the data point above.

## ⚠️ PENDING LIVE TESTS — DM to verify next session (reload ALL clients first)

Built but unverified, in rough priority. Test one at a time, stop on first failure, note what you saw + the DM/phone console lines.

0. **Long-press detail suite on a real phone** (2026-06-18, round 2) — CC verified the logic via simulated touch-hold (real `PointerEvent` sequences); confirm the actual finger-hold (~500ms) feels right on iOS. Check each: (a) long-press an Actions/Spells/Equipment row → description card; (b) long-press the **AC** → breakdown; (c) long-press the **name** → character summary; (d) long-press a **condition chip** (incl. non-standard ones like Hiding) → its card; (e) on the **Details tab**, long-press a Feat / Race / Background → description, and a Skill / Tool → ability/proficiency/modifier/passive (and confirm a normal **tap on a skill still rolls** it); (f) **the close bug**: open an item → tap a spell/condition **link** inside it → the **first** X tap steps back to the item card, a second X closes to the sheet (no dead taps, no native window, no lockup); (g) a normal tap on any long-pressable row still does its normal action (no accidental double-fire).
0b. **Travel-type → token movementAction (NEEDS DM GM-CLIENT RELOAD)** (2026-06-19) — rpc.js gained `setMovementAction`; the executor must reload to register it. After reloading the GM client: on the phone, long-press the name → tap the **Speed** chip → pick a mode (use a creature with multiple speeds, or temporarily give the PC a fly speed) → confirm (a) the phone card shows the picked mode + speed, and (b) the **token's movement action changes on the DM/TV** (the drag-ruler/measure uses that mode). If the player picks before the DM reloads, expect a harmless "no registered function" console error on the DM client (swallowed on the phone).
0c. **Remove condition** (2026-06-19) — apply a condition (e.g. Prone, or a DFreds CE one), long-press its chip → "Remove condition" → it clears off the character and the card closes. Try a standard condition (opens PHB rules + Remove) and a non-standard one.
0d. **Attack adv/dis recommendation (NEEDS DM GM-CLIENT RELOAD)** (2026-06-19) — rpc.js gained `attackPreview`; the executor must reload to register it. Then on the phone: give the attacker a disadvantage source (e.g. Poisoned) and/or pick a target behind cover, tap a weapon **attack**, select the target → expect a "**Disadvantage suggested: …**" banner + a star on (and pre-selection of) the Disadvantage button, matching what AC5E would show on the DM's native dialog. **Watch the DM console** for the captured `raw` (first runs are instrumented) and confirm **no orphaned attack roll/chat card appears on the DM** (the preview must abort cleanly). If the banner never shows, the `raw`/`unevaluated` field says why (hook didn't fire / AC5E didn't annotate / abort issue).
1. **Save/reaction prompt on the phone** — ✅ confirmed reaching the phone (2026-06-17). Re-verify the polish: the prompt now **closes once the save rolls** (however rolled), and after an AoE the **caster is deselected** on the DM so monster saves roll faster. Watch: does the saving token still get left selected on the DM after the player rolls? (If so it's midi selecting it, not placeCast — report it.)
2. **Magic Missile** — fix v2 (2026-06-18). `findParkedWorkflow` now gates on `wf.suspended` (midi keeps `currentAction` at WaitForDamageRoll and just sets `suspended`, midi-qol.js:25981) + matches by item uuid. **BUT the live test was run with the Wizard out of 1st-level slots** ("no available spell slots" in the damage dialog) — with forced consumption that pops a config dialog on the DM and never cleanly parks, masking the fix. **Verify: long-rest the Wizard (restore slots) FIRST, then cast MM** → phone shows "Roll damage" → tap rolls all darts. Re-check a weapon attack still two-taps. **Side note (forced consumption):** casting a spell/item with no resource now surfaces a consume dialog on the DM (a consequence of enforcing resources, §6.2) — could be surfaced to the phone as "no slots" instead if the DM prefers.
3. **Resource consumption** (just fixed). Use the **Staff of Healing** → its charges drop per activity, no DM dialog; cast a **slot spell** → slot deducts; use at **0 charges** → midi's consume dialog appears on the DM (no free spell).
4. **Heals.** **Aid** → resolves on one tap, no DM dialog (`heal {flat:true}`); **Mass Healing Word / Cure Wounds** → phone shows the roll step (`flat:false`, `parked:true`), player rolls, no DM dialog.
5. **Equipment tab + containers + toggle layout.** Items grouped by type; **attune toggle (sun) on the LEFT, equip toggle (shield) on the RIGHT**, columns aligned across rows + the container header. Toggles persist; tapping a usable item uses + consumes; currency row shows. **Containers** expand in place ("N items" + chevron), contents nested, not duplicated at top level.
6. **Actions accordion drawers** (NEW). Each Action/Bonus/Reaction/Free header opens/closes on tap; **using an action auto-closes its drawer** (still reopenable).
7. **HP/Temp tap target.** Tapping anywhere on the "HP"/"Temp" label *or* number opens the editor (temp's 0 is now easy to hit).
8. **TV shared vision out of combat.** In combat → follows the turn; **End Combat → vision opens to the whole party**.
9. **"This is the TV" button** (Details → Leave popup → "This is the TV") → reloads into Display mode (canvas, no shell). TV no longer shows the Action Pack HUD on turn changes.
10. **Older untested:** UI rounds 3–7; Details skills/tools; rests; Turn HUD/End turn; bottom-sheet dialog restyle; the owned-token switcher label (`actor name i/n`).

# (history below — updated 2026-06-14)

Entry point for picking the project back up (incl. a fresh conversation).

## Where we are

- **DESIGN.md is the source of truth** (architecture D1–D7, topology §2 + §2.1, the D4 settings preset, the RPC contract §5, spike findings §8, the UI rounds §12, and the **consolidated open backlog §13**). Read it first.
- **Phases:** Phase 1 (plumbing) ✅, Phase 2 (sheet + HP) ✅, Phase 3 combat loop ✅ (Route B two-tap item use, live targeting, move pad, Turn HUD). Plus 7 rounds of L&F/feature polish (§12).
- **Spikes 2 & 3 passed** (Route A dead → Route B; two-tap player-rolls via held workflow). Spikes 4 (sense/latency), 5 (full iOS), 6 (TV reticles) still owed.
- The module is junction-linked into `%LOCALAPPDATA%\FoundryVTT\Data\modules\mobile-command`; edits are JS/CSS so a **hard reload (Ctrl+Shift+R)** of the client loads them (manifest changes need a full Foundry app restart). Test world: **"Offline test"** (Restored Keep). Phone client = a non-GM browser logged in as a player; the module forces `core.noCanvas` for phone clients.

## How to test the combat loop (two clients)

DM/app = the executor (GM, on the active scene, unpaused). One browser window = a player (Fighter/Wizard owner). Actions tab → pick an action → pick target(s) (reticle commits on the DM) → Use → Roll damage. Saves/reactions fan to the target owner's phone. Rests/rolls open dialogs that render as full-height bottom-sheets on the phone.

## What's been confirmed working (DM-tested)

Shell + sheet, HP/temp tap-edit (±/Set), AC, inspiration, the two-tap attack→damage loop, live target preview, move pad, the dark-fantasy L&F. DM quote: "looks and acts GREAT, huge improvement."

## Untested by CC (no live client here) — verify on reload

UI rounds 3–7 broadly; Details skills/tools list; rests; Turn HUD/End turn; the bottom-sheet dialog restyle (rest/attack/reactions); reactions actually fanning to the phone.

## What to do next

**AoE push (§11) — ✅ VERIFIED LIVE 2026-06-16** ("everything worked as expected"): phone announces → DM panel "Place" → template → auto-target → damage → saves → template auto-clears. Also live: the owned-token switcher and the "This is the TV" display-role button + TV combat-HUD suppression.

**Save/reaction prompt surface — ✅ BUILT (Round 17, 2026-06-16, UNTESTED).** The executor relays midi's `preTargetSave` to the target's phone (`registerSaveRelay` in rpc.js); the phone shows a tappable "⚡ <spell> — Roll DEX (DC X)" card (`#savePromptHTML`/`noteSavePrompt`) that fires the native (Restyled) save roll midi intercepts (Spike 3). Auto-clears after `playerSaveTimeout`. Fixes the gap the DM hit live (the whispered save card is hidden behind the shell). **Verify:** the card appears when an AoE/single-target save hits a phone player, the tap rolls + midi counts it (no double-roll), and the auto-clear timing. Ability saves only for now (reactions are the next use of the same relay).

**Module eval (Round 17):** Bugbear's Scripts (`thatlonelybugbear/bugs`) — recommended **not** adding (Foundry-14 unverified, redundant with automated-conditions-5e, orthogonal to the phone use case). See §12 Round 17.

**Next:** long-press detail suite, real inventory/Equipment, TV reticles (§6/§7.3), or extend the save relay to reactions. Pacing: focused increment → DM tests live → iterate → commit.

## House rules (from CLAUDE.md)

Pinned stack: Foundry 14.363 · dnd5e 5.3.3 · midi-qol 14.0.8. Tests = numbered expected results, one at a time, stop on first failure. Write only in the test world; never delete. New findings → DESIGN.md, dated.
