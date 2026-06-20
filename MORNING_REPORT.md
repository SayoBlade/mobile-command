# STATUS — continue here (updated 2026-06-21, overnight autonomous session)

## ⚠️ DO THIS FIRST (2026-06-21): reload the GM client + test ONE attack
**v0.1.4 shipped a regression that breaks ALL attacks** — the phone shows "—" after an ~8s "Rolling…" hang (caught live overnight). **v0.1.5 reverts it.** It's executor-side, so: **hard-reload the Gamemaster (executor) browser, then fire one weapon attack** — the phone total should show immediately and match chat. (CC couldn't verify this overnight — the GM browser has no Claude extension, so it can't be driven/reloaded by CC. This is a revert to the 8/8-live-verified version, so confidence is high, but confirm first.)

## Where we are
- **Released v0.1.5** — public GitHub Releases. v0.1.5 = **fix the v0.1.4 attack-total regression** + **save-prompt phone-side fallback** + **in-range target badge (B8)** (overnight 2026-06-21; details below). v0.1.4 = attack-total guard/scene-switch/turn-cycle + char-gen array/roll + TV margin-follow. Manifest: `https://github.com/SayoBlade/mobile-command/releases/latest/download/module.json`. **Sqyre runs the release; the local Foundry runs the symlink** (live on reload).
- **Char-gen MVP shipped (v0.1.3):** a blank PC (no class) shows a **"Create Character"** gate → workspace picks **Species/Background/Class** from compendiums → dnd5e's **real advancement popups** (proven to lift onto the phone, `mc-phone-dialog`) → **point-buy ability panel** (27-pt) → Finish. DM drops the blank PC + grants Owner (players can't create actors); snags → DM client.
- Also in v0.1.3 (this generation): spell upcasting picker, public-roll default, initiative prompt + Init button, move-pad green/yellow/red distance budget, combat-start vibrate/sound, dice tray, smooth TV-camera pans, iOS double-tap-zoom fix, silent-failure diagnostics across damage/spell/announce/attack-preview.

## Open / next
- **Char-gen layers:** DM "Player X started" + **compendium-approval handshake**; **phone-fit CSS** for the dense (~563px) advancement dialog; ~~standard-array/roll abilities~~ ✅ built (test below); AoE/template spell upcast (carry slot through `#announceCast`).
- **−100 attack bug — ✅ ROOT-CAUSED & GUARDED LIVE (2026-06-20):** see the dated entry below. Favorites and the Actions tab are the SAME code path (proven: identical activity uuid → `useActivityStart`); the −100 was the **executor serving midi's `minAttackTotal=-100` placeholder** (pre-roll), i.e. a stale/pre-fix executor. Captured 8 live favorites greatsword attacks post-fix: totals 10/27/15/23/28/13/22/18, **zero −100**. Added a guard on BOTH sides so the sentinel can never display again (phone shows "—").
- **Parked live confirms (need the DM/executor client reloaded + world UNPAUSED):** upcast slot-deducts-at-chosen-level. Bench = local `http://localhost:30000` "Offline test", Player 1 + Gamemaster executor.
- **Sqyre:** v0.1.2 install got stuck in the queue ("verifying disk space" — Sqyre-side, package verified good); clear the pending job + reinstall the latest via the manifest URL.

---

## 🌙 Overnight autonomous session (2026-06-21) — regression fix + 2 verified features

DM left the Player-1 browser open ("get a few features in, I'll review in the morning"). CC drove the **Player-1** client live; the **GM/executor** browser has no Claude extension, so CC **could not drive or reload it** — meaning executor-side (rpc.js) changes are **built but unverified** (need a GM reload). All phone-side work was verified live.

### 🔴 CAUGHT: v0.1.4 attack regression → reverted (rpc.js)
Live-testing the shipped v0.1.4 attack flow, every greatsword attack hung ~8s on "Rolling…" then showed **"—"** (executor returned null). Cause: the **pre-push tightening** I made right before shipping v0.1.4 changed `findParkedWorkflow`'s readiness gate to require `wf.attackRoll.total`, but in this Route-B flow midi populates **`wf.attackTotal`** (the scalar) — the gate never passed, the workflow waited the full 8s timeout, returned null. (The version the DM confirmed "working" was BEFORE this tightening.) **Reverted** `findParkedWorkflow` to the simple, 8/8-live-verified matching (return as soon as `awaitingDamage`) + `resolveAttackTotal` polls `attackRoll.total ?? attackTotal` (−100→null) up to 3s for cold-start. **Executor-side → unverified overnight; reload the GM + test (see top).**

### ✅ Save-prompt phone-side fallback (shell.js) — VERIFIED LIVE
Addresses the Gelatinous-Cube-Engulf "I wasn't prompted" issue. The executor relay only fires if the GM runs current code; when stale, no prompt reaches the phone. midi ALSO whispers a plain save-request card to the player (`requestPCSave`: `{content, whisper}`, no flags/rolls). The shell hides chat, so the new `maybeSavePromptFromCard` (in the `createChatMessage` hook) catches that card and surfaces the same tappable prompt — relay-independent. Parses owned-actor name + ability label + DC + flavor; **saving throws only**; **de-dupes** with the relay. **Verified:** a simulated whispered card → "Saving throw / Test Engulf / Roll Dexterity DC 13"; an Ability-Check card correctly ignored.

### ✅ In-range target badge (B8) (shell.js + shell.css) — VERIFIED LIVE
The target picker now flags targets past the activity's reach: the row dims and the distance turns red (still tappable — warnings, not walls). Reach read from `activity.range` (max of reach/value/long, scene units; no reimplementation). **Verified:** Greatsword (reach 5 ft) → Gelatinous Cube at 5 ft normal; two Spear Barricades at 20 ft flagged out-of-range.

### Backlog note — §13 is stale (as of 2026-06-14)
While picking features, found several "TODO" items already shipped: **scroll preservation on expand/collapse** (done 2026-06-19, `_replaceHTML` view-key) and **currency tap-to-edit** (done 2026-06-18, `#currencyHTML`/`#onChange`). Don't re-derive these. **Swipe-between-tabs (B2)** is genuinely not done (skipped overnight — gesture-conflict risk + needs real-device feel).

### Test artifacts left in the world
Two whispered test chat messages to Player 1 (simulated save/check cards) — harmless; not deleted (conduct: never delete). A transient save-prompt may linger ≤60s then auto-clear.

---

## 📺 TV margin-follow — BUILT (2026-06-20, needs TV verification)

**DM request:** the TV should always keep **3 grid squares between the PCs and the screen edge** (unless it's the very edge of the map) so a token never has to leave the screen before the camera updates.

**Built (`main.js`, `tvEdgeFollow` + `updateToken` hook):** a **deadzone camera follow** on the Display client. When a player-character token moves to within `TV_EDGE_MARGIN_SQUARES` (=3) grid squares of the viewport edge, the camera pans the **minimum** needed to restore the 3-square margin (smooth `animatePan`, 250ms, `tvEase`). **Clamped to the scene rect** so it never overscrolls past the map — at the map boundary the token is simply allowed nearer the screen edge ("the very edge" exception). Degenerate-zoom guard (viewport < 6 squares wide → just centre the token). **Display-only and yields to manual TV control** (`tvManual`); inert on phones/DM (returns before any canvas access).

**Verified:** deadzone + scene-clamp math checked with concrete values (near-edge → 3-sq margin restored; inside deadzone → no pan; scene smaller than viewport → centre); `main.js` loads clean on reload (module ready, shell renders). **NOT verified on a real TV** (CC is on the phone client, no canvas) — DM to confirm on the Display client: move a PC toward each edge → camera follows keeping ~3 squares; at the map edge it stops and lets the token approach the screen edge; manual TV mode still overrides.

---

## 🔧 Turn-cycle: action drawers stay closed + ACT/BA/RE — FIXED (2026-06-20)

**DM report:** in combat, after using ACT/BA and ending the turn, when the player's turn comes around again the **action drawers stay collapsed** and the **ACT/BA/RE strip doesn't reset to available**.

**Findings:**
- **Drawers = shell bug.** `#collapsedActionGroups` is added to when an action auto-closes its drawer in combat ([shell.js](scripts/shell.js):~1981) and was **only ever cleared by a manual tap** — never on a new turn, so it carried last turn's closed state forward. **Fixed:** `noteCombatTurn()` (new) tracks the active combatant and **reopens the drawers when it becomes this actor's turn again (or combat ends)**; wired into the `onCombat` hook.
- **ACT/BA/RE = midi's flags, and midi resets them GM-side on turn start.** Source: midi-qol.js:15754 — with **times-up NOT installed** (it isn't here), midi itself calls `removeActionBonusReaction` per turn-transition (gated to the preferred active GM); it does **not** depend on times-up. Live proof: on Belnor's turn his flags are `{action:false}` and the shell strip shows ACT/BA/RE all lit. The shell re-renders on the flag change (updateActor / create+deleteActiveEffect) and now also on turn-start. **So if the strip ever sticks while the drawers reopen, it's the GM/executor not processing the reset (stale-executor, cf. the −100) — reload the GM client.**

**Verified live (CC-driven Player 1):** new code loads clean; on Belnor's turn the strip reads ACT/BA/RE available and all drawers open. Full turn-cycle (use → collapse → end → cycle back → reopen) not driven live (would disturb the DM's active combat) — logic-verified, DM confirms on reload.

---

## 🔧 Scene-switch "token not found: null" — FIXED & VERIFIED LIVE (2026-06-20)

**DM report:** after switching scenes, the phone was stuck on a PC not in the new scene, couldn't switch to the in-scene PC, and attacks failed with **"token not found: null."**

**Root cause:** the shell had **no scene-change hook**, and `get actor()` ([shell.js](scripts/shell.js)) fell back to `game.user.character` (or the first owned character) when the subject token wasn't on the active scene — a PC with **no token on the new scene** → `originTokenId` resolves to **null** → spatial RPCs (listTargets/attack/move) fail. The token switcher only lists *in-scene* owned tokens and hides below 2, so a lone in-scene PC gave no switch button either.

**Fix (3 parts):**
1. `get actor()` now **prefers an owned token on the active scene** (assigned character if it's on-scene, else any owned in-scene token) before falling back to the assigned/first-owned character.
2. New `syncSubject()` clears a `#subjectId` that's no longer on the active scene; called at the top of `#buildHTML` (self-heals every render).
3. New **`updateScene`** hook: on `active` change, `syncSubject()` + re-render so the phone rebinds immediately when the GM switches scenes.

**Verified live (CC-driven Player 1):** switched world to **"Caves of Chaos"** (Belnor the only owned token there) → after reload the shell **auto-bound to Belnor** (previously defaulted to off-scene Aslan Fang), and `listTargets({forTokenId: <Belnor token>})` returned **ok:true** (no "token not found"). **DM: reload your phone to pick it up.**

---

## 🔬 −100 attack bug — root-caused live (2026-06-20, CC-driven Player 1 + capture hooks)

DM reported the −100 still hitting Belnor's Greatsword **from the Favorites button** (not the Actions tab) — "as most players will." Drove a second Player-1 connection (Chrome plugin) and instrumented `api.useActivityStart` to capture sent config vs returned result.

**Findings:**
1. **Same code path.** The Greatsword favorite resolves to the *identical* attack activity uuid (`…Item.n39e8Qxl9NfjYXQm.Activity.zi3BW6RGO2ugOyXu`) the Actions tab uses; both `fav-act` and `action-pick` → `#pickAction` → `#fireAction` → `useActivityStart`. Favorites-vs-action was a red herring.
2. **Source of −100.** midi's `Workflow` constructor sets `attackTotal = minAttackTotal = -100` (midi-qol.js:25470/24342) and only overwrites it after the attack roll is processed (30009). The executor returns −100 when it reads the workflow before that — i.e. a **stale/pre-fix executor** (`rpc.js` change needs the GM client reloaded; the player reload doesn't update it).
3. **Confirmed fixed live.** Captured 8 consecutive favorites Greatsword attacks: totals **10, 27, 15, 23, 28, 13, 22, 18 — zero −100** (incl. a miss at 10). The fixed `rpc.js` (prefers `wf.attackRoll.total`) is active on the current executor.

**Hardening (so the sentinel can NEVER show again, regardless of executor reload state):**
- **Phone** (`shell.js` `#fireAction`): `s.attackTotal = res.attackTotal === -100 ? null : res.attackTotal` → the result card shows "—" (with the Hit/Attack label + Roll-damage step) instead of −100. The phone always reloads, so this protects even against a stale executor.
- **Executor** (`rpc.js` handleItemUseStart): maps the −100 sentinel → null before returning.

**Follow-up (2026-06-20, DM saw "—" with 17 on the DM):** the guard worked (no −100) but the phone showed "—" instead of the real total — a **timing race**: `findParkedWorkflow` returns the workflow the instant it suspends at WaitForDamageRoll, and on rare timing the d20 isn't attached yet (`wf.attackRoll` null, `wf.attackTotal` still −100). Chat shows 17 because the roll completes a tick later. **Fix v1:** `resolveAttackTotal(wf)` polled up to 1.5s. **Then DM: "first roll got a −"** → cold-start (first attack of a session, midi/AC5E warming) exceeds 1.5s. **Fix v2 (current):** `findParkedWorkflow` gained `requireAttackReady` (passed for attacks) — it now **holds the parked attack workflow until the d20 has attached**, reusing the existing 8s poll budget, and returns the wf anyway at timeout so the two-tap never breaks. So the total is ready by the time the phone is told `needsDamage`. **rpc.js change → MUST reload the GM/executor client** (all three −100 iterations are executor-side; a phone reload does nothing). rpc.js parses clean; cold-start race not reproduced live (need the GM console, which CC can't reach — GM browser didn't respond to the connect prompt).

**Reload the phone to get the guard; reload the GM client to get the executor-side cleanup (and the real total).**

---

## 🔨 Build (2026-06-20) — char-gen ability-score methods (BUILT, UNTESTED)

Added **Standard array** and **Roll (4d6 drop lowest)** alongside Point buy in the char-gen ability panel. A segmented picker at the top of the Ability-scores screen switches method. Point-buy is unchanged. Array/roll show a value **pool** and you **tap each ability to cycle** it through the still-free values (then back to "—"); spent values dim in the pool strip. **Apply is disabled until all six are assigned.** Roll generates locally (no chat post) with a **Reroll all** link. (`shell.js` `#abilityPanelHTML`/`#assignBodyHTML`; `styles/shell.css` `.mc-abil-*`.) No live client here → verify on the phone:

**Test (one at a time, stop on first failure). On a blank PC → Create Character → Ability scores:**
1. The panel shows three buttons — **Point buy · Standard array · Roll** — with Point buy active and the existing ± point-buy rows below it.
2. Tap **Standard array** → a pool strip **15 14 13 12 10 8** appears, each ability reads **"—"**, and **Apply scores is disabled** (dimmed).
3. Tap **STR** repeatedly → its value **cycles 15 → 14 → 13 → … → 8 → —** and each value you land on **dims in the pool strip**; the "N left" count drops as you assign.
4. Assign a value to **STR** (say 15), then tap **DEX** → DEX **cannot** land on 15 (it's taken) — it cycles through only the remaining values.
5. Assign all six distinct values → **Apply scores enables**; tap it → the sheet shows those scores on the abilities and a "Ability scores set." notice; reopening the panel keeps the method.
6. Tap **Roll** → a **"Roll 4d6 ×6"** button (Apply disabled). Tap it → six rolled scores (each 3–18) appear in the pool, sorted high→low, all abilities "—".
7. Assign all six → **Apply enables**; **Reroll all** generates a fresh six and clears the assignment.
8. Switch **Roll → Standard array → Roll**: the array shows 15/14/13/12/10/8; returning to Roll **restores your last rolled six** (not the array), assignment cleared.
9. **Back arrow** returns to the Species/Background/Class step list with no error; **Finish** still works.

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
