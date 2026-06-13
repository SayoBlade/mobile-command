# Phone Controller for FoundryVTT — Design Document

**Status:** Pre-spike draft · **Last updated:** 2026-06-11
**Primary use case:** In-person play. DM at a laptop, one shared "players" screen (TV) showing all player POVs, each player controlling their character from their phone. Online play (screen for map, phone for control) is a secondary, lower-priority use case.

**PINNED VERSION TRIPLE (freeze point — confirmed against live world 2026-06-11):** Foundry **14.363** · dnd5e system **5.3.3** · midi-qol **14.0.8**. Current-generation: dnd5e 5.x means the Activities system is fully in play, so the adapter layer (D6) is load-bearing from line one. Documentation predating this generation is unreliable — CC must check installed module source over training data.

**Live-world verification already done (2026-06-11):** `MidiQOL.canSense(token, target)` confirmed present and returning correct per-character, selection-independent results in the actual world — this is the core of Spike 4's visibility computation, passed early. Restored Keep v14 demo serves as the test world; 4 PCs + hostiles + walls + Levels floors already set up.

---

## 1. Goals and non-goals

**Goals (MVP):** A player at the table can, from their phone: see and manage their character (HP, conditions, resources, equipment), roll anything (attacks, spells, checks, saves, tool checks), target enemies/allies/self before activating midi-automated actions, respond to save and reaction prompts, move their token in combat and the group token out of combat, take short/long rests, prepare spells, write to a shared party journal, and end their turn — without ever touching the laptop.

**Explicitly out of scope for MVP** (handled by the DM or deferred):

| Deferred item | MVP handling | Planned for |
|---|---|---|
| AoE template placement | DM places templates | v2 (own design effort) |
| Item transfers between players | DM moves items | v2 |
| Handouts pushed to phones | Players look at the TV | v2 |
| Physical dice / manual roll entry | Digital rolls only | v2 (adoption driver) |
| Map ping/marker from phone | Players point at the literal screen | v2 |
| Advanced movement (path drawing, tap-to-move) | Arrow pad only | v2 |
| List-style target picker with portraits | Cycle widget only | v2 (online play) |
| Adventure-log metadata/structure | Plain shared journal | v2 |
| Rich journal editing from phone | Append-only composer | v2 (ProseMirror collab editing exists in core) |
| Environment interaction (doors, levers, loot) | DM handles | not planned |

**v2 hardware idea — Stream Deck DM console:** physical buttons on the DM side for the highest-frequency GM actions: Undo last workflow, Assign targets to current player, Next turn, Pause. Pairs naturally with the DM-assign panel (§11). Tactile console suits running this at a physical table.

---

## 2. Table topology

| Device | Foundry user | Role | Permissions |
|---|---|---|---|
| Server box | — | Foundry server (document store + websocket relay) | — |
| Server box (headless browser) | **Service** | Spatial computation + midi GM-side operations | **GM role** |
| Server box (visible browser) | **Table** | Shared player screen via Monk's Common Display | Player role, Observer on all PCs |
| DM laptop | **DM** | The DM's working interface; can't break table infra by being used | GM role |
| Each phone | One user per player | Controller client (no canvas) | Owner of own actor(s) |

**Key invariant:** compute needs privilege; the display needs the absence of it. The TV user must stay unprivileged or the big screen leaks hidden tokens, GM pins, and fog differences. The Service user must be GM-role to move arbitrary tokens, see hidden tokens for correct visibility math, and satisfy midi's "connected GM client" requirement. These cannot be the same user, hence the headless third client.

**Service client bonuses:**
- midi redundancy — automation no longer dies if the DM's tab reloads.
- Determinism — no human input can contaminate computation state.

**Service client operational requirements:**
- Must always have the **active scene rendered** (walls/vision exist only for the drawn scene). Hook scene activation → auto-navigate.
- Same module set enabled as everyone else.
- Kept alive by the same process manager as the server (headless Chromium or a pinned tab).
- Will silently receive GM whispers etc. — harmless, but don't be confused by read receipts.

### §2.1 ✅ DECIDED topology revision (proposed & accepted 2026-06-12): two-client DM side

**Driver:** DM finds three DM-side clients too much operational load; wants exactly **DM Screen + TV**.

**Options examined (against installed source):**

- **❌ TV as Assistant GM (or any privileged role) absorbing Service.** `User.isGM` is true from ASSISTANT up, so midi/socketlib would accept it — but the §2 invariant exists precisely here: a privileged client *renders* privileged data, and the TV renders to the table. Leak surface enumerated: hidden tokens (GMs see them at half-alpha), secret-door controls, hidden map notes/pins, GM-preview tiles/drawings, full-map fog whenever no token is controlled, the combat tracker with hidden combatants and NPC HP (MCD's `show-combat` renders it big), midi's own whispered hit/save cards (`autoCheckSaves: "whisper"` renders on GM clients), and 3D dice for blind GM rolls. Suppressing all of that is a blacklist arms race across core + every module; one miss = a table leak. **Rejected.**
- **Enemy-FOV question answered:** with the TV at *player* role this cannot happen — the TV physically lacks enemy vision data. And Monk's Common Display already guards the focus path: its display-token filter is `!token.hidden && (!just-friendly || disposition > 0)` (monks-common-display.js:654), with **`just-friendly` defaulting to true** — hostile combatants are never focus/control candidates on the display. Keep that setting on; on enemy turns the TV simply keeps showing merged friendly vision.
- **✅ RECOMMENDED: fold Service duties into the DM Screen client** (GM, always present during play), keep TV unprivileged exactly as designed. Implementation: in D7, "service" stops being a dedicated user and becomes a **capability flag** our module attaches to a GM client — default deployment runs it on the `dm` role client; tables that want isolation/redundancy can still attach it to a dedicated headless user later (nothing in the RPC contract changes — phones address "the service capability," resolved to a user id at runtime).

**What the two-client topology costs (accepted trade-offs, recorded honestly):**
1. **midi redundancy is gone** — a DM-tab reload kills in-flight workflows (orphans cleaned per Spike 2 finding (c); `undoWorkflow` covers take-backs). Acceptable: the table can't run without the DM anyway.
2. **Active-scene constraint (clarified 2026-06-12):** while the DM client views a non-active scene, the naive casualties are **(a) Route B item use itself** (midi resolves tokens via placeables of the *viewed* scene — same root cause as the Spike 2 failure; equally true of the old dedicated-Service design, which is why §2 pinned it to the active scene), **(b)** sense/LOS candidate filtering, **(c)** wall-validated movement. Distance math survives (grid measurement works off scene documents), as does everything document-level (plain rolls, HP, sheets, rests, journal). In-combat impact: none (DM is on the active scene running it).

   **DECIDED (2026-06-12, DM): pause-based freeze.** The DM client auto-pauses the game when it leaves the active scene (DM preference: an auto-pause there makes sense regardless); phones freeze to the pre-pause state. This replaces the queue+nudge and document-math-collision mitigations entirely — frozen phones issue no moves or actions, so nothing needs degraded answers. Implementation rules:
   - **Freeze scope:** pause gates *new* actions and movement (action/confirm/move buttons disabled, "Paused — DM is setting up" on phones). Sheet reading, inventory browsing, and journal writing stay live (not game-state).
   - **In-flight workflows complete:** a save/reaction prompt already on a phone when pause hits stays answerable — pause gates initiation, never mid-workflow responses (eating a pending prompt would orphan the workflow).
   - **Auto-resume bookkeeping:** the module tracks whether *it* initiated the pause (off-scene) vs. the DM pausing manually; auto-unpause on return to the active scene only for module-initiated pauses.
   - Core Foundry already blocks player token movement while paused — phone behavior is consistent with table expectations, and the native PAUSED banner broadcasts the state to TV and all clients for free.
3. **Dialog risk inverts (improves):** Route B workflows execute on a *watched* screen — an unexpected dialog pops in front of the DM instead of stalling invisibly. §6 watchdog downgrades from mandatory headless guard to a notifier + stuck-workflow timer (midi's `completeActivityUse` already has a 90 s timeout).
4. **Determinism:** acceptable — D3's per-pair `canSense` is selection-independent and Route B passes `ignoreUserTargets`; the DM's own clicking can't contaminate results.
5. **Q3 dissolves:** single GM client = no "which GM" addressing ambiguity, no `preferredGM` tuning.

**Required regardless of topology (sharp edge found in midi source):** every real player user must have their **character assigned** (user config). midi's prompt routing (`playerForActor`, midi-qol.js:18040) prefers the active user whose *assigned character* is the actor before falling back to "any active owner" — this is what keeps save prompts off the TV even though the TV user holds Owner on all PCs (which Monk's Common Display needs for merged-vision token control).

---

## 3. Architecture decisions (with rationale)

### D1 — Phones are full Foundry clients, not a thin custom webapp
If the phone *is* the player's logged-in client, midi save dialogs, reaction prompts, and roll dialogs already route to the correct device for free. A thin client would force reimplementing every dialog midi/DAE ever throws — an endless treadmill. The module is therefore a **UI replacement layer**, not a remote-control protocol.

### D2 — Phones run with the canvas disabled (core "no canvas" mode)
Foundry's server does almost no game logic: vision, fog, collision, measurement, and targeting are all computed client-side. Rather than each phone running a hidden, stripped canvas (memory ceilings on iOS, battery, texture loading), we relocate the canvas **once** to the headless Service client on plugged-in hardware. Phones are pure DOM: instant load, no iOS memory ceiling, graceful background/reconnect.

### D3 — The Service client answers all spatial questions (RPC over socketlib)
See §5 for the contract. Visibility must be computed **per token pair** ("can A sense B", evaluated from A's detection modes) — never via selection-dependent client-vision APIs, so that nothing anyone selects on any client can change an answer.

### D4 — midi-qol preset: "automate the bookkeeping, keep the dice in players' hands"
**(This corrects the earlier "full automation" assumption — the DM's confirmed preference.)** Rolls stay manual (attack = one click, damage = a second click, saves rolled by the *target's own player* via a prompt on their client). Bookkeeping is automated (hit/miss check, damage application, save evaluation, effect expiry, slot/resource spend). Action economy is *tracked but not enforced* so a redo is never refused. Undo Workflow is **on** as a take-back safety net. Ammo/consumption and encumbrance are off (no one is ever blocked for "out of arrows" or carry weight; v2 may re-enable in settings).

Rationale: every roll becomes a deliberate player button-press — exactly what a phone is good at — and unfinished workflows are the cheapest possible take-back (a cast isn't "spent" until the player clicks through it), which protects against the "I want to un-cast that" problem better than undo alone. This is "warnings, not walls" (§11) extended to the action economy. The combat loop is: *pick target → tap action → tap attack → tap damage → automation applies → any save pops on the defender's phone.*

**Confirmed settings block (written & verified in the live world 2026-06-11; this is the canonical preset the Settings Enforcer ships and polices):**

| midi `ConfigSettings` key | Value | Meaning |
|---|---|---|
| `autoRollAttack` / `gmAutoAttack` | `false` | Player/GM clicks to roll attacks |
| `autoRollDamage` / `gmAutoDamage` | `"none"` | Click to roll damage (the satisfying 2nd click) |
| `autoCheckHit` | `"all"` | midi compares roll vs AC, marks hit/miss |
| `autoApplyDamage` | `"yesCard"` | Applies rolled damage to targets automatically, still shows card |
| `autoCheckSaves` | `"whisper"` | midi evaluates saves and shows results |
| `playerRollSaves` | `"chat"` | Target's player gets a whispered save request; **they roll from their own sheet/UI and midi intercepts the matching save roll** (✅ verified live 2026-06-12, Spike 3). ⚠️ The old value `"letme"` is dead in midi 14 (LMRTFY era) — it silently auto-rolls on the player's client with zero interaction. Valid values: none/nonePublic/noneDialog*/chat/mtb/ftb/rer |
| `playerSaveTimeout` | `60` | Seconds before an unanswered save request auto-rolls (raised from default 20 during Spike 3; final value is Q4, tune at the table) |
| `autoTarget` | `"none"` | We do our own targeting; DM places templates |
| `rangeTarget` | `"none"` | Never auto-target by range; does NOT control range enforcement |
| `optionalRules.checkRange` | `"none"` | **The actual attack-blocking range check** (midi UI: Mechanics tab → range checking; valid values `none`/`longfail`/`longdisadv`). midi 14.0.8 default is `"longFail"` = block beyond long range. ✅ Applied & verified in live world 2026-06-12 (console write; out-of-reach attack now rolls) |
| `optionalRules.wallsBlockRange` | `"none"` | **Wall/total-cover attack block** (midi UI: Mechanics tab → "Walls block ranged attacks" — despite the name it runs for melee too). Produces the *"target is blocked by a wall"* failure, distance-independent. Required `none` for no-canvas clients per §11. ✅ Applied & verified 2026-06-12 (was `"center"`) |
| `doReactions` / `gmDoReactions` | `"all"` | Prompt for reactions, don't auto-pick |
| `enforceReactions` / `enforceBonusActions` | `"none"` | Track economy, don't hard-block (allows redo) |
| `undoWorkflow` | `true` | GM take-back of automated bookkeeping |
| `consumeResource` / `gmConsumeResource` | `"none"` (both) | Don't block on ammo/consumption. midi 14 values are strings (`none`/`spell`/`item`/`both`); old booleans are migrated to `"none"` on load (✅ corrected 2026-06-12 via the Enforcer's first live run) |

System-side: `dnd5e.encumbrance` = `"none"` (already off in the test world). **`dnd5e.movementAutomation` = `"noBlocking"`** (UI: "Movement Automation" → **Partial**; world setting, dnd5e 5.3 default is `"full"` = *tokens block movement through enemy spaces*. Live world had `"full"` — DM hit this 2026-06-12: enemy tokens hard-blocked PC drags. `"noBlocking"` keeps difficult-terrain automation and drops the blocking; `"none"` turns movement automation off entirely. Warnings-not-walls (§11) and the Service-validated move path (§7.4) both want blocking off — and our `move.request` would otherwise fight the system's own enforcement).

**Preset candidate (verify exact setting name during build):** midi's target-confirmation behavior — prompt when an attack fires with no targets selected, rather than rolling into the void. Must *prompt*, never hard-block (self-buffs/utility/DM-placed AoEs legitimately have zero targets). Mostly a desktop/DM backstop; phone flow always targets before firing.

**Undo honesty:** reliable for the mechanical bookkeeping midi itself did (damage, resources, conditions). Less magical for one-step-removed consequences (an ally already reacted, a triggered downstream effect). For a clean instant "oops" it does what's wanted; for "un-cast after three responses happened" it's a partial rewind. At a physical table mistakes are usually caught instantly → mostly the good case. Candidate tweaks if playtest dislikes them: `autoApplyDamage` flavor (silent vs. card), save-prompt timeout.

### D5 — Item-use execution: Route A preferred, Route B fallback (spike decides)
- **Route A:** the phone triggers the midi workflow programmatically with **explicit target UUIDs** (instead of canvas-derived user targets, which cannot exist on a no-canvas client). midi's own canvas-touching extras (range check, cover check) disabled in settings. Workflow runs on the phone; dialogs render there.
- **Route B:** the phone collects all choices up front (our own big-button Adv/Normal/Dis + situational bonus screen), sends one fully-resolved request; the **Service client** runs the fast-forwarded workflow. Save/reaction prompts still reach target owners' phones (standard midi behavior for GM-initiated attacks). Requires the **dialog watchdog** (§6) because an unexpected dialog on a headless client stalls silently.

### D6 — Pin versions and freeze; isolate system churn behind an adapter
The dnd5e system churns hard (the Activities rework changed item usage and where target/range data lives) and midi tracks it with lag. Pick one known-good Foundry/dnd5e/midi triple in Spike 0, version-gate the module, and confine system-version knowledge to one adapter file: `getActivation(item)`, `getTargetSpec(item)`, `getRange(item)`, `useItem(item, options)`.

### D7 — One module, role-switched per user
A per-user setting selects behavior: `phone` / `service` / `display` / `dm`. The display role is mostly inert (Monk's Common Display does the TV); the dm role adds the assign-targets button and status surfaces.

---

## 4. Required modules

| Module | Why | Notes |
|---|---|---|
| midi-qol | Automation engine; save/reaction routing; sense-checking helpers | Full-automation preset shipped by us |
| DAE (Dynamic Active Effects) | midi hard dependency; effect application; also carries the special-duration features formerly in Times Up | **Do NOT install Times Up** — it is end-of-life (last release verified for Foundry v12 only); core Foundry handles effect expiry natively now and the leftovers were migrated into DAE |
| socketlib | RPC to the Service client (`executeAsUser` targeting Service specifically, not "any GM") | |
| libWrapper | Safe wrapping (dialog interception at minimum) | |
| Monk's Common Display | The TV: merged player POVs, hidden UI | Runs only on Table user |
| Elevation Ruler *(optional)* | Per-turn movement-spent tracking for the "15/30 ft" display | Fallback: speed display only |
| Carousel-style initiative tracker | Turn order on the TV (replaces persistent "up next" text on phones) | Pick whichever is maintained for the pinned version in Spike 0; TV-only, can't break phones |
| Condition/status automation | Per pinned dnd5e version (native conditions vs. Convenient Effects era) | Decide in Spike 0 |

---

## 5. Service RPC contract

All calls via socketlib, addressed to the Service user by ID. Phones never trust their own spatial math (they have none).

| Endpoint | Direction | Payload | Returns | Notes |
|---|---|---|---|---|
| `targets.push` | Service → phones (broadcast) | `{forTokenId, candidates: [{tokenId, name, disposition, distanceFt, inRange?, displayName}]}` | — | **Push model.** Recomputed on turn start and on any token position change in the active scene. `name` respects the token's display-name setting (no leaking "Doppelganger" when the token shows "Villager"). Hidden/unsensed tokens never included — built from per-pair sense checks. |
| `move.request` | Phone → Service | `{tokenId, dxGrid, dyGrid}` | `{ok, x, y} \| {ok:false, reason}` | Service collision-checks against walls and applies the update. Centralized movement validation (strictly more robust than vanilla's trust-the-mover). |
| `measure` | Phone → Service | `{originTokenId, targetTokenId}` | `{distanceFt}` | For ad-hoc range badges outside the pushed cache. |
| `item.use` | Phone → Service | `{actorId, itemId, targetUuids, rollConfig: {advMode, situationalBonus, slotLevel?}}` | `{ok} \| {ok:false, stage, reason}` | **Route B only.** Fully fast-forwarded. Errors must surface back to the phone (§6 watchdog). |
| `targets.assign` | DM → phone | `{userId, tokenIds}` | ack | DM targets tokens normally, taps "assign to [player]"; the phone applies them locally for its user and shows "Targets set by DM: …". Needed because targeting is per-user state no other client can write. |
| `service.heartbeat` | Service → all | `{ts, sceneId}` | — | Phones show a "table brain connected" indicator; DM gets a loud warning on loss. |

**TV reticle trick:** while cycling, the phone emits Foundry's user-activity broadcast carrying the candidate token IDs. The TV client resolves the IDs on *its* canvas and renders the player-colored reticle. The phone never resolves anything locally. (Verify in Spike 6.)

---

## 6. Popup taxonomy and handling

| Class | Where it appears | Risk | Handling |
|---|---|---|---|
| Roll-config dialogs (adv/dis, bonus) | Route A: phone. Route B: never (pre-resolved by our own screen) | Low | Restyle (bottom-sheet, huge buttons) |
| Save prompts to targets | Target owner's phone, both routes | Low (most-traveled midi path) | Restyle; **generous midi timeout** before auto-roll fallback; loud cue |
| Reaction prompts | Owner's phone, off-turn | Medium (player is looking at the TV; **iOS has no vibration API**) | Full-screen takeover + sound (audio unlocks after first tap of session); optionally flash "waiting on <player>" on the TV |
| Unanticipated dialogs (any module) | Route A: phone (ugly but visible). **Route B: headless Service client — invisible, workflow stalls silently** | **High (Route B)** | Generic fallback restyle on phones (enlarge any dialog's buttons). **Dialog watchdog on Service:** detect any Application render on the headless client; auto-resolve with defaults where safe, else surface "workflow stuck on: [dialog title]" to the DM. The watchdog is mandatory if Route B ships. |

This table is the strongest argument for preferring Route A if Spike 2 allows it.

---

## 7. UI specification

Two modes, switched automatically: **Combat Mode** when a combat is active and the user has a combatant; **Explore Mode** otherwise. Two subject references are kept separate from day one: the *movement subject* (group token out of combat; own token in combat) and the *roll/sheet subject* (always the chosen actor) — the Tokens switcher manipulates exactly these.

### 7.1 Controller Shell
Full-screen mobile UI replacing Foundry's interface for `phone`-role users. Bottom tab bar: **Rolls/Actions · Sheet · Journal**, plus a contextual **Tokens** tab that appears only when the user owns more than one token in the active scene (auto-covers Wild Shape, familiars, summons, DM-granted NPCs).

### 7.2 Touch Sheet
- **Favorites is the landing tab** in both modes. Backed by the dnd5e system's favorites data on the actor (syncs across devices for free — curate from a laptop, phone renders the same list); module flags cover any entry type the pinned system version can't favorite natively. *(Verify supported entry types in Spike 0.)*
- **Roll surface is organized by ability, matching the system:** one six-ability grid; tapping an ability offers **Check / Save**; skills nest under their governing ability. A **favorites strip** on top preserves one-tap access for the common cases (Perception, Stealth, Insight…).
- **Tools row** populated from the actor's tool proficiencies — lockpicking is a thieves'-tools check, not a skill; tools are the most commonly buried roll surface.
- HP strip: big +/- steppers, delta entry (system fields already accept "-5" syntax), separate temp HP.
- Conditions/active-effects chips, glanceable ("Bless · concentrating", "Prone"). Condition icons over tokens on the TV prompt players to check the sheet.
- Inventory: big equip/attune toggles; consumables route through item use (potion = use item; targeting handles administering to an ally, defaulting to Self for self-target items).
- Spell prep: a dedicated tab with per-spell prepare toggles and an "X/Y prepared" counter — never the full sheet in prep mode.
- Rest: call the system's short/long rest; the existing dialogs (including hit-dice spending) get the restyle treatment. No custom flow.
- **v2:** long-press on anything = detail card + contextual menu (favorite/unfavorite at top). MVP: tap-and-hold shows description only.

### 7.3 Target Cycler
- Prev / next / confirm + one-line readout: name, distance, in-range badge, disposition tag. The TV reticle is the real visual feedback ("reticle follows your cycling on the table screen").
- Candidate list comes from the Service push cache, **sorted by distance**; cycle start heuristic: attacks start at nearest hostile, healing/buffs at nearest friendly/self. **Sort, don't filter** (charmed allies, disguised enemies stay reachable).
- Multi-target: "Add target" + counter ("1 of 2") + selected chips with remove. Count enforced from item data via the adapter.
- Self-target items skip the cycler (preselect Self).
- "Ask the DM to assign" button → `targets.assign` flow.
- The data core (candidates, distances, count enforcement) is shared with the v2 list-style picker for online play — the cycler is the MVP skin.

### 7.4 Move Pad & Turn HUD
- D-pad grid steps through `move.request`; token animation off (instant snap, feels responsive).
- "Moved X / Y ft" from Elevation Ruler when present.
- Turn banner with **action economy pips** (Action / Bonus / Reaction); **End turn** = core `nextTurn` (combatant owner may advance their own turn).
- "You're up next" = sound + banner only (the persistent up-next text lives on the TV carousel). At 0 HP the screen collapses to a giant **Death save** button.
- Out of combat, the pad binds to the **group token** (owned by all players; first-come-first-served is fine socially at a physical table). Evaluate the dnd5e **Group actor** for pack/unpack before writing custom macros.

### 7.5 Pre-roll screen (Route B; optional nicety in Route A)
One question, huge buttons: **Advantage / Normal / Disadvantage**, situational bonus field, slot picker where relevant. Replaces system roll dialogs entirely under Route B.

### 7.6 Prompt Restyler
Render-hooks on Dialog/DialogV2 (and midi's dialogs) → bottom-sheet conversion, thumb-sized buttons. Generic fallback for unknown dialogs: enlarge buttons, never block.

### 7.7 Journal Composer
Module auto-creates the shared journal on world setup and grants players **Owner** (Observer can't edit). MVP is the **append composer**: plain textarea + "Add note" → appended paragraph stamped with author and date. Chronological log for free; phone keyboard (and voice-to-text) just works; typo fixes happen from a laptop since it's a normal journal underneath. v2: restyled ProseMirror editing (core collab editing already prevents clobbering).

### 7.8 Connection Guard
Screen Wake Lock during combat; silent reconnect + state resync on `visibilitychange` (iOS backgrounding); Service heartbeat indicator; session-start tap doubles as the audio unlock. Nice-to-have: DM "show join QR" for session start.

**Presence reporting (free byproduct):** the same `visibilitychange` listener reports app foreground/background to the DM panel. Three states per player: green = app open and on-screen; amber = phone on but app backgrounded; gray = disconnected. Note: "backgrounded" cannot distinguish app-switching from a locked/face-down phone — socially self-resolving (a face-down phone looks innocent and is). Optional setting (default off): show presence dots on the TV next to character names.

### 7.9 Settings Enforcer
Ships the recommended midi/dnd5e settings preset; validates on world ready; loud warning + one-click apply on drift. The UX depends on these settings — treat config as product.

---

## 8. Spike plan (run in order; each ≤ half a day)

| # | Spike | Pass criteria | On fail |
|---|---|---|---|
| 0 | **Pin the stack.** Choose Foundry/dnd5e/midi triple; world + 4 users; install module stack; midi full automation; pick carousel tracker + condition automation; verify favorites entry types | Plain desktop attack flows end-to-end: attack → damage applied → save prompt on player client | Iterate version triple until baseline passes |
| 1 | *(folded into 0)* | | |
| 2 | **Route A.** No-canvas Player client (desktop browser is fine) triggers a midi workflow programmatically with explicit target UUIDs | Damage lands; target's client gets the save prompt; zero canvas exceptions | → Spike 3 |

**Spike 2 partial findings (live-world, 2026-06-11):** (a) `MidiQOL.completeItemUse` **no longer accepts `targetUuids`** in midi 14 / dnd5e 5.x — it silently ignores them (workflow fires target-less). The activity is the unit of action now: **`MidiQOL.completeActivityUse(activity, config, { targetUuids: [...] })` is the correct call** — its source contains the targetUuids handling. (b) Workflows are **client-local**: a card's roll buttons clicked from a different client than the workflow's creator may roll without the creator-side targets. Implication for the phone design: the phone that fires the workflow must be the client that clicks its rolls (which is the natural flow anyway) — but this is a sharp edge for any DM-assist/cross-client path. (c) Failed/abandoned workflows accumulate as orphans on the creating client — supports the watchdog requirement.

**✅ Spike 2, in-canvas half: PASSED (2026-06-12).** `completeActivityUse` with code-supplied `targetUuids` → manual attack click rolled against the Giant Spider, hit auto-checked vs AC, damage rolled, **auto-applied 13 (26→13)** with the compact GM notification. The phone design's core mechanism is proven in-world. **Remaining: the identical call from a no-canvas client** — first CC task.

**Spike 2, no-canvas half — PREPARED, not yet run (2026-06-12, overnight).** Full test package in [SPIKE2_NO_CANVAS_TEST.md](SPIKE2_NO_CANVAS_TEST.md) (snippet, no-canvas client setup, 8 numbered expected results). Two findings from source verification while preparing it:
- **Call-shape correction:** in midi-qol 14.0.8 the signature is `completeActivityUse(activityOrUuid, usage, dialog, message)` and `targetUuids` rides in **`usage.midiOptions.targetUuids`** (the *second* argument) — the earlier note's third-argument `{ targetUuids }` slot is actually `dialog`. (The in-canvas pass evidently still targeted correctly; on the in-canvas client the user-target fallback can mask a misplaced option — the no-canvas run must use the corrected shape.)
- **Pre-analysis risk (R1, sharpened):** midi's `getToken()` (midi-qol.js:20003) resolves token UUIDs via `TokenDocument.object` — a **canvas placeable, `null` on a no-canvas client**. `completeActivityUse` builds its target set exclusively through `getToken` (midi-qol.js:15738–15745). Predicted no-canvas failure mode is therefore **silent target loss** (workflow fires target-less), not an exception. The test's result 5 is the decision point; if it fails as predicted, Route A needs either Route B or a libWrapper fallback patch of `getToken` (TokenDocument when `.object` is null) — weigh against D6 before patching midi internals.

**No-canvas setting (verified in Foundry 14 core):** core client setting `core.noCanvas`, UI label “Disable Game Canvas”.

**❌ Spike 2, no-canvas half: FAILED (2026-06-12, live run, player 1 no-canvas client).** Failed at expected result **3** (canvas exception) — the *harder* failure mode, worse than the predicted silent target loss at result 5. All preconditions passed (noCanvas true, isOwner true, activity + target UUIDs resolved from documents); the exception fired inside `completeActivityUse` **before any chat card appeared**:

```
Uncaught (in promise) Error: You must provide an embedded Document instance as the input for a PlaceableObject
    at new PlaceableObject (foundry.mjs:54263)
    at new Token (foundry.mjs:170213)
    at new Token5e (token.mjs:4)
    at getOrCreateTokenForActor (utils.ts:121)
    at new Workflow (Workflow.ts:1642)
    at MidiAttackActivity3.use (MidiActivityMixin.ts:670)
    at MidiAttackActivity3.use (AttackActivity.ts:319)
    at Object.completeActivityUse (utils.ts:2351)
```

**Analysis:** the canvas dependency is in **Workflow construction itself**, not target resolution. midi's `Workflow` constructor calls `getOrCreateTokenForActor` for the **attacker** — on a no-canvas client `actor.getActiveTokens()` finds no Token placeables (the Fighter's TokenDocument *is* embedded in the scene, but no placeable exists), so midi falls back to constructing a synthetic `Token` from a non-embedded document, which Foundry 14's `PlaceableObject` constructor rejects. The workflow dies before targets, rolls, or cards. No damage was applied (spider HP unchanged); nothing persisted.

**Verdict: Route A is dead on no-canvas clients (R1 resolved, negative).** The earlier libWrapper-patch idea (fall back to TokenDocument in `getToken`) is no longer attractive — the placeable assumption sits at the Workflow core and pervades distance/cover/reaction code paths; patching it would mean maintaining a fork of midi's internals against version churn (violates D6). **Per the spike plan: proceed to Spike 3 / Route B** — the Service client (GM-role, canvas rendered) executes `completeActivityUse` on the player's behalf with pre-resolved choices; save/reaction prompts still fan out to owners' phones as standard midi behavior; the dialog watchdog (§6) becomes mandatory.

**Route B ripple effects (recorded 2026-06-12, on Spike 2 failure):**
- **D5 resolved → Route B.** Scope of the failure: only **midi workflows** are canvas-bound. Plain system rolls (ability checks/saves/skills/tools, death saves), HP/document updates, rests, journal — all document-level, expected fine on phones; **verify a plain check roll no-canvas as a 2-minute pre-test before Spike 3** (cheap, kills R-risk early).
- **D1 stands.** Phones must remain full Foundry clients — that's what makes midi's save/reaction prompts route to them even when the Service client owns the workflow (standard midi behavior for GM-initiated use, `playerRollSaves: "letme"`).
- **§7.5 pre-roll screen: optional → mandatory.** All roll choices (adv/dis, situational bonus, slot level) must be collected on the phone *before* the RPC; the Service workflow runs fully fast-forwarded — any midi dialog rendering on the headless Service is a stall.
- **§6 dialog watchdog: mandatory** (was Route-B-conditional).
- **⚠️ Open tension with D4 ("dice in players' hands"):** the two-click cadence (attack → damage) assumed the workflow ran on the player's client. Under Route B the workflow's roll buttons live on the Service client; Spike 2's partial finding (b) showed cross-client card clicks are a sharp edge. Likely resolution: the *deliberate tap* moves into our phone UI (pre-roll confirm = the roll moment), workflow executes fully fast-forwarded on Service; the "unfinished workflow as cheapest take-back" property is lost, so `undoWorkflow` carries the full take-back load. **Q5 (DM decision, Spike 3):** accept one-tap-resolved, or design a two-RPC cadence (attack result shown on phone → second tap fires damage)?
- **Service criticality rises:** it's now in the critical path of every automated action, not just spatial queries. §7.8 heartbeat/loud-failure UX and the process-manager requirement (§2) are load-bearing from Phase 1.
- **Targeting unaffected:** phones send target UUIDs; UUID→placeable resolution happens on the Service client, which has the canvas.

**Range-check finding:** an out-of-reach attack (10 ft with a 5-ft weapon) was **blocked** by midi despite the preset — `rangeTarget: "none"` controls auto-targeting, NOT enforcement; the actual attack-blocking range check lives under a different key (locate via `ConfigSettings` keys matching /range/i, or midi settings UI Workflow tab). **DECIDED (2026-06-12): DM chose warning-not-block.** midi has no warn-only mode (its model couples long-range disadvantage with beyond-range blocking), so the range check is set to **none**; range awareness comes from the phone's advisory in-range badge + DM rulings via the adv/dis buttons.

**Range-check key IDENTIFIED (2026-06-12, from installed midi-qol 14.0.8 source + live world DB):** the key is **`ConfigSettings.optionalRules.checkRange`** (midi settings UI: **Mechanics** tab), valid values `"none" | "longfail" | "longdisadv"`, module default `"longFail"`. Three traps discovered:
1. **It lives under `optionalRules` but is NOT disabled by `optionalRulesEnabled: false`.** Enforcement calls `checkMechanic()`, which reads `optionalRules[key]` directly and ignores `optionalRulesEnabled` (only the GM session toggle `toggleOptionalRules` suppresses it). This is why attacks were blocked even though optional rules appeared "off". The Settings Enforcer must therefore police `optionalRules.*` mechanics keys individually — "optional rules disabled" is NOT a safe blanket.
2. **The live world (offline-test) still holds `checkRange: "longFail"`** as of 2026-06-12 ~01:45 — the DM's `none` did not persist (likely the midi config panel was closed without *Save Changes*; midi's startup migrations were ruled out — they never rewrite `"none"`). Re-apply via midi settings → Mechanics → range checking → none → **Save Changes**, then re-run the out-of-reach attack to confirm it rolls.
3. There is no top-level `checkRange` key — searching ConfigSettings keys for /range/i finds only `rangeTarget`, `useTemplateRangedTargeting`, and two sound keys. The enforcement key is nested.

**Reinterpretation (2026-06-12 morning, DM re-test):** the live block message is *"target is blocked by a wall"*, distance-independent — that is the **wall/total-cover check** (`optionalRules.wallsBlockRange`, live `"center"`), a separate branch inside midi's `checkRangeFunction` that fires *before* the distance comparison. So the observed blocking may have been the wall check all along, not (only) the distance check. Source note: every enforcement call site is gated on `checkMechanic("checkRange") !== "none"` (midi-qol.js:8476–8484, 6387, 26090), so `checkRange: "none"` alone *should* disable both — if blocking is still observed with checkRange saved as `none`, that gating analysis is wrong in some path; capture the exact toast text and stop. Preset sets **both** `checkRange` and `wallsBlockRange` to `"none"` (§11 requires LOS enforcement off anyway — a no-canvas client can't evaluate walls).

**Movement blocking finding (2026-06-12, DM report):** enemy tokens hard-blocked PC token drags. Cause: **`dnd5e.movementAutomation`** (world setting, "Movement Automation", dnd5e 5.3 default `"full"` = automation *including token blocking*). Fix: set to `"noBlocking"` ("Partial" — difficult terrain only). Now in the system-side preset line above. This is core-system enforcement, not midi — it would also have constrained §7.4 `move.request` updates.

**✅ All three fixes applied & verified in the live world (2026-06-12, console write by DM):** `checkRange: none`, `wallsBlockRange: none`, `movementAutomation: noBlocking`. Both numbered re-tests passed: (1) the 10-ft attack with a 5-ft weapon rolls with no warning toast; (2) a PC token drags through an enemy-occupied square without snap-back. The "blocked by a wall" / movement-block behaviors are resolved. Settings Enforcer must ship and police all three.

**Verified (2026-06-12, live DB diff):** all 17 keys in the D4 table above match the live world's `midi-qol.ConfigSettings` exactly — no drift besides the missing `checkRange` fix.

**Target-confirmation preset candidate — exact name confirmed (2026-06-12, module source):** the setting is `midi-qol.TargetConfirmation` (an Object; UI under Workflow → Target Confirmation). **It is registered `scope: "client"`** — a world-level Settings Enforcer cannot set it for everyone; the phone module must write it on each phone client (and the Service client) at startup.

**DM preference (confirmed):** keep the compact GM damage notification ("-13, 26→13") — automation must show its work to the DM.
| 3 | **Route B.** Service client executes item use on the player's behalf, adv/dis passed in config | Prompts fan out to target owners; a deliberately-injected dialog is caught by a prototype watchdog and reported | → hidden-canvas fallback plan (known to work, costs phone perf) |

**✅ Spike 3: PASSED (2026-06-12, live, two-client topology).** Full record in [SPIKE3_ROUTE_B_TEST.md](SPIKE3_ROUTE_B_TEST.md). What was proven end-to-end:
- **Relay (Test A):** `MidiQOL.completeActivityUse(activityUuid, { midiOptions: { asUser: <executor user id>, targetUuids, ... } })` from a **no-canvas player client** executes the workflow on the executor (DM Screen) with explicit targets, fully fast-forwarded, damage auto-applied. The triggering client never constructs a Workflow (midi-qol.js:15823 / handler :22285) — the §5 `item.use` RPC reduces to a thin validation wrapper over midi's own transport.
- **Save fan-out (Test B):** executor-created workflow → save request whispered to the target's owner → **workflow holds** → owner rolls the save *from their sheet on a no-canvas client* (roll dialog renders fine there) → midi intercepts the roll, evaluates vs DC, applies half/full damage at the instant the die lands. **This is the load-bearing proof for D1.**
- **Watchdog (Test C):** a single `renderApplicationV2` hook + whispered ChatMessage catches and reports every application render cross-client (proven by accidental live deployment on the player client).
- **Sharp edges found (all corrected/recorded):** `_completeActivityUse` returns `true` even on early abort (RPC needs its own completion signal + must surface refusal reasons — the silent failure was a 0-slot cast refusal); midi **ignores explicit targets for area activities** (`activityHasAreaTarget` guard, midi-qol.js:8232 — AoE stays in the DM-template flow; RPC must reject AoE on the explicit-target path); dnd5e chat-card save buttons **require controlled tokens** — dead on phones, Prompt Restyler must own save UX; core nags "requires 1024×768" on phone-sized windows — shell must suppress (Spike 5); `consume: false` is the right spike tool but real flow keeps consumption on and surfaces refusals.
- **Q5 path validated implicitly:** the save flow already proves the pattern "phone rolls via its own UI → midi intercepts into the held workflow" — the damage tap can work the same way.
| 4 | **Service viability.** Headless GM client: renders active scene; per-pair sense checks; wall-blocked move rejected; RPC round-trip measured **on the actual hotspot/LAN** | Visibility answers unchanged while tokens are randomly selected on the DM client; move validation correct; latency acceptable for arrow-feel (<~150 ms) | Investigate alternative visibility computation before abandoning |
| 5 | **Real phones.** iOS Safari + Android Chrome as no-canvas users | Login OK; dialogs tappable; after 2-min lock the client resyncs (not zombies); wake lock acquired; audio cue plays post-first-tap | Catalog per-platform workarounds |
| 6 | **TV reticles.** Activity broadcast with target IDs from a no-canvas client | Player-colored reticle appears on the TV canvas | Fallback: Service draws reticles on behalf of the player |

Spike 4's endpoints are needed in **all** outcomes — build the Service endpoints first; nothing there is wasted work.

## 9. Build phases

1. **Plumbing:** Service endpoints + Settings Enforcer. No UI; test with macros. *(Skeleton shipped 2026-06-12: module scaffold in this repo, junction-linked into `Data/modules/mobile-command`. Settings Enforcer with the full verified preset incl. nested `optionalRules.*` keys; socketlib RPC — `itemUse` wrapper with AoE guard + refusal surfacing, `moveRequest` with wall collision, `measure`, `targetsList` via per-pair `canSense`, `targetsAssign` into module state (phones can't hold user targets), `heartbeat`; §2.1 pause guard; phone-role window-size-nag suppression. Smoke tests 1–8 in README.md.)*

   **Phase 1 live smoke-test results (2026-06-12, two-client topology, no-canvas player client):** ✅ **tests 1–8 ALL PASS** — enforcer drift detection/apply, heartbeat over socketlib, item-use round trip, refusal surfacing, AoE guard, wall-validated move (apply + reject), Levels-aware candidate list, and the pause guard (auto-pause on leaving the active scene + auto-resume on return, refusing phone actions while paused). Phase 1 plumbing validated end-to-end. Findings/fixes during testing: (a) socketlib needs `"socket": true` in the manifest AND a full **Foundry app restart** (not world relaunch, not F5) to register — server caches manifests at process start; (b) heartbeat uses `executeForOthers`, so the executor never sees its own beat (it's null on the DM by design — check on a player client); (c) `consume` in the dnd5e usage config must be `false` or **omitted** — a boolean `true` throws (`config.consume ??= {}` leaves the `true`, then `.action=` fails); RPC now omits it for normal consumption. Refusal surfacing confirmed: out-of-slots cast returns `{ok:false, stage:"use", reason:"You have no available 1st Level spell slots…"}`. **Bonus: `targetsList` is Levels/elevation-aware** — a Rogue one floor up (10 ft straight-line) is correctly excluded via `canSense`, alongside wall-LOS exclusion of an adjacent-but-walled Cleric. Confirms the candidate cache will respect floors for free (relevant to R5 / Spike 4).
2. **Shell + Touch Sheet (read-only first):** Favorites landing, ability-grid roll surface (check/save), tools row, HP strip, conditions. Already table-usable.
3. **Combat loop:** Turn HUD, move pad → `move.request`, Target Cycler → candidate cache + reticle broadcast, item use via the winning Route.
4. **Load-bearing polish:** restyled save/reaction prompts, pre-roll screen (if Route B), journal composer, Connection Guard, dialog watchdog (if Route B).
5. **A real session** on the real hotspot, with a written list of every moment someone had to ask the DM to do something from the laptop. That list is the v1.1 backlog.

---

## 10. Risks & open questions

- **R1 — midi on no-canvas clients (Route A) is unverified.** The whole architecture's cheapest path hangs on Spike 2.
- **R2 — Route B headless stalls.** Mitigated by the dialog watchdog; watchdog "safe defaults" list needs curation per dialog type.
- **R3 — Version churn.** Mitigated by pinning + adapter (D6); migrations remain real work.
- **R4 — Hotspot latency** could make arrow movement feel mushy; measured in Spike 4. Mitigation if needed: optimistic local step + reconcile on Service response.
- **R5 — Hidden-token data exposure.** Verify in Spike 4 whether player-role clients receive hidden token documents in scene data; the no-canvas phone never renders anything, and the candidate list is Service-filtered, but the journal of what data reaches phones should be checked once.
- **Q1 —** Does the pinned dnd5e version's Group actor cover pack/unpack, or do we script it?
- **Q2 —** Which favorites entry types does the pinned system support natively (items only, or skills/tools/slots too)?
- **Q3 —** socketlib `executeAsUser` vs. custom socket: confirm addressing the Service user specifically (not "first GM") works under two GM-role users.
- **Q4 —** Reaction prompt timeout value that feels right at a real table (set in midi, tuned in Phase 5).
- **Q5 — Route B roll cadence. DM verdict after Spike 3 Test A (2026-06-12): two-tap cadence is a requirement** ("my only complaint is that the player didn't get to roll damage"). Design direction: the *workflow* stays on the executor, but the *damage tap* stays on the phone — fire the attack phase normally (fast-forward attack only, `autoRollDamage: "none"`), then the phone's "Roll damage" tap sends a second RPC that triggers the pending workflow's damage roll on the executor (e.g. `workflow.activity.rollDamage(...)`/button-click equivalent — verify mechanism). Player sees the hit result, presses the damage button, watches the dice — identical feel to rolling locally; only the compute location differs. Two leads to verify: (a) midi's 90 s workflow timeout — a paused-awaiting-damage workflow must not get reaped while a player decides; (b) `midiOptions.rollAs` (a User reference, relayed by uuid — midi-qol.js:15816) may attribute rolls/cards to the player instead of the GM — test it, it could make the executor invisible in chat. Note R1 is resolved-negative: midi workflows cannot run on no-canvas clients at all.

---

## 11. Edge-case philosophy: warnings, not walls

D&D's actual rules engine is the DM. Every automatic gate in this module advises but never forbids:

- **Visibility filtering** (candidate list) → bypassed by `targets.assign`. The DM can assign ANY token, including hidden/invisible/out-of-LOS ones the player's list would never show. Assigned targets the player cannot sense display as "Hidden target — set by DM" (no name leak).
- **Range/in-range badges** → advisory only. The confirm button NEVER disables based on range, sight, or walls. (midi's own range/LOS/cover enforcement is disabled in the settings preset — required anyway for no-canvas clients.)
- **Wall-validated movement** → constrains phone-initiated moves only. DM drags on the laptop are never blocked.
- **Adv/dis/bonus screen** → this is where table rulings get their mechanical teeth ("attack the invisible one at disadvantage").
- **Ultimate fallback** → the DM performs the whole action from the laptop (a normal Foundry client); phones reflect outcomes automatically since it is all the same actor data.

**Universal edge-case flow:** (1) ruling happens out loud → (2) unusual targets: DM-assign → (3) ruling's modifier: player picks adv/dis/bonus → (4) tap the action, automation routes saves/damage normally → (5) weirder still: DM does it from the laptop.

**DM-assign UX (dm-role client):** DM targets with native Foundry targeting (hover + T, shift+T for multiples). A small docked panel wakes when the DM holds ≥1 target: target chips, a Clear button, one button per connected player with the **current combatant as the highlighted primary** ("Send to <name> · current turn"); disconnected players shown grayed out. Hotkey: "assign current targets to current combatant" (hover → T → hotkey). On send: DM's own targets clear (no lingering DM reticle on the TV; the player's reticle color takes over as table-visible confirmation). Player phone: soft cue + "Targets set by DM" (hidden creatures displayed namelessly); tapping an action **skips the cycler** with assigned targets pre-loaded, straight to adv/dis, with a "change targets" link back into the cycler. **Assigned targets auto-expire at the end of that player's turn** (stale assignments are a misfire hazard).

**AoE spells (MVP flow):** player declares verbally and points at the TV; DM places the template on the laptop; midi auto-targets tokens under the template; DM completes the cast from the player's sheet (laptop). Slot deducts on the player's actor (phone sheet updates automatically); saves route to owners' phones as usual, including allies caught in the blast. **v2:** template handoff — DM places, caught targets are assigned back to the caster's phone for slot choice + confirm; deferred because the workflow must then skip placing a second template (fiddly).
