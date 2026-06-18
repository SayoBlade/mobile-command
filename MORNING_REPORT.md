# STATUS — continue here (updated 2026-06-17)

## ⚠️ PENDING LIVE TESTS — DM to verify next session (reload ALL clients first)

Built but unverified, in rough priority. Test one at a time, stop on first failure, note what you saw + the DM/phone console lines.

1. **Save/reaction prompt on the phone** — ✅ confirmed reaching the phone (2026-06-17). Re-verify the polish: the prompt now **closes once the save rolls** (however rolled), and after an AoE the **caster is deselected** on the DM so monster saves roll faster. Watch: does the saving token still get left selected on the DM after the player rolls? (If so it's midi selecting it, not placeCast — report it.)
2. **Magic Missile** — ✅ root-caused + fixed (2026-06-18). midi suspends the no-roll damage workflow (`WorkflowState_Suspend`), which a no-attack spell hits before our poller could see `WaitForDamageRoll`, so the phone showed no "Roll damage" step and midi's in-chat DAMAGE card was the fallback. `findParkedWorkflow` now also accepts the suspended-awaiting-damage state. **Verify:** cast MM from the phone → it shows the "Roll damage" step → tap rolls all darts (no chat DAMAGE card needed). Re-check a normal weapon attack still two-taps fine.
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
