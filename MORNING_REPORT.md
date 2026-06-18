# STATUS — continue here (updated 2026-06-18)

## 2026-06-18 — combat loop is the open blocker; two quick fixes shipped

DM live-tested and dumped 5 observations (logged in DESIGN §13, 2026-06-18 batch). Status:

- **#1 combat loop (BLOCKER, NOT yet fixed):** weapon → attack-roll popup on the DM; MM → damage/refund box on the DM; nothing reaches the phone. Diagnosed (§14, 2026-06-18): (a) midi force-shows the attack dialog for **thrown/ammo** weapons regardless of fast-forward — likely what the DM hit; test a plain melee weapon (longsword) vs. a dagger to confirm. (b) MM's forced consumption pops the consume/refund box **when out of slots** — long-rest the Wizard FIRST or it's the same masking as before. **Need one data point:** which weapon + the `mobile-command | use start {…parked…}` console line.
- **#2 native dialog on the phone (DM's desired flow):** investigated — **blocked** (no-canvas Workflow crash / midi has no attacker-roll routing; §14, 2026-06-18). Near-term plan: compute proficiency + adv/dis on the phone and recommend the right button instead of the literal native dialog. Decide after #1.
- **#3 DM-added items not appearing till reload — ✅ fixed (untested):** id-based actor match + a temporary createItem console diagnostic.
- **#4 equipment items — ✅ confirmed good by DM.**
- **#5 action economy out of combat — ✅ fixed (untested):** no cost badges + no drawer auto-close out of combat.

**Next session:** verify #3 (DM adds an item → appears live; check console `createItem … matched:true`) and #5 (out of combat: no ACT/BA/RE badges, drawers stay open after use), then resolve #1 with the data point above.

## ⚠️ PENDING LIVE TESTS — DM to verify next session (reload ALL clients first)

Built but unverified, in rough priority. Test one at a time, stop on first failure, note what you saw + the DM/phone console lines.

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
