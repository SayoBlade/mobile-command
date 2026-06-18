# STATUS — continue here (updated 2026-06-19)

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
