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

**~~Required regardless of topology~~ — RETIRED 2026-07-21.** This used to read: *every real player user must have their character assigned (user config)*, because midi's `playerForActor` prefers the active user whose assigned character is the actor before falling back to "any active owner" — the only thing keeping save prompts off the TV while the TV held **Owner** on all PCs.

That requirement was unsatisfiable and has been removed. Foundry gives each user **exactly one** `user.character` slot, so a player running a familiar, a summon, or a second PC could never assign them all; the preflight check that enforced it reported a permanent, unfixable failure (DM's live world: 5 friendly player-owned tokens, 2 player accounts). **The real defect was the TV holding Owner**, not the missing assignment.

**Resolution — the display account sits at OBSERVER, never OWNER** (`DISPLAY_LEVEL`, settings.js). Two facts read from installed source, both verified 2026-07-21:

- **Foundry 14 builds vision from Observer.** `Token#_isVisionSource` (client/canvas/placeables/token.mjs): `const canObserve = this.actor?.testUserPermission(game.user, "OBSERVER")`. Owner was never required for the shared screen's merged vision — the earlier note above (and the Monk's Common Display rationale) overstated what the TV needs.
  - **…but only while the client controls NOTHING.** That method's last line is `return !this.layer.controlled.some(t => !t.document.hidden && t.hasSight)` — one controlled token suppresses every merely-observed one. **Measured 2026-07-21** on a vision-on scene (Restored Keep), signed in as a non-GM holding OBSERVER on Belnor and OWNER on the Evoker: with the owned token controlled, Belnor's `_isVisionSource()` was `false` and there was **1** live vision source; after `releaseAll()`, `true` and **2**. Controls behaved as expected either way (OWNER → source, NONE → not).
  - Consequence: `refreshCombatVision` **must release, never control**. Dropping the old `control()` call was not a cleanup — merged party vision on the TV depends on it. Commented at the call site so nobody restores it.
  - Note for future vision testing: **Cave A has Token Vision OFF**, so `_isVisionSource` short-circuits on line 1 and the scene can prove nothing about ownership levels. Use Restored Keep or Cave F.
- **midi's router matches Owner by strict equality.** `playerForActor` (midi-qol.js:18174) has four fallback branches; every ownership branch tests `ownership[p.id] === OWNERSHIP_LEVELS.OWNER`. An Observer display account is therefore **ineligible** to receive a save/reaction prompt — not deprioritised, invisible. No wrapper, no patch of midi.

Consequences: prompt routing follows ownership to the real player's phone for PCs, familiars, summons and extra PCs alike; the phone's "active character" star is gone (shell.js); the assignment preflight check is replaced by `checkPromptRouting`, which fails only when a player-owned token has **no connected non-display owner** — the one condition a DM can act on. `checkDisplayAccount` now also flags (and offers to fix) a display account still holding Owner.

Two things still route on `user.character`, so the display account must **not** have one assigned: midi's branch 1 matches an assigned character *ignoring ownership entirely*. The wizard and preflight both say so.

Startup migration: `syncDisplayObserver` (executor-only, idempotent) levels the display account to exactly Observer on every PC, and levels **down** anything else it holds above Observer — summons granted Owner by the old `registerSummonOwnership` path (e.g. Unseen Servant, Sphinx of Wonder) included. Note for testing: downgrading ownership by hand in a running world is undone within seconds by the old build's `updateActor` auto-own hook — the world fix only sticks once the new code is loaded.

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
| `autoTarget` | `"wallsBlockIgnoreDefeated"` | AoE auto-targeting on template placement. **Changed from `"none"` 2026-06-16:** the AoE-push flow (§11) has the DM place the template on the executor, and `"none"` selected no tokens under it → the workflow stalled with nothing to resolve (DM-reported: "set up the template… nothing happened after"). Safe to enable: the `refreshMeasuredTemplate` auto-target only fires for the *placing* user (midi-qol.js:13653) and **phones never create templates**, so this affects ONLY DM-placed templates. `wallsBlock*` respects walls (the executor has a real canvas) and ignores already-defeated tokens. Single-target Route B is unaffected (no template → never fires). |
| `autoRemoveInstantaneousTemplate` | `true` | **Added 2026-06-16.** Auto-delete a spell's measured template after the workflow, but **only for instantaneous-duration spells** (midi checks `activity.duration.units === "inst"`, midi-qol.js:26846). In the AoE-push flow the template only renders on the TV *after* the DM commits placement — by then the spell's own effect/damage is the visual, so the template is redundant and would otherwise linger until manually deleted (DM-reported). Persistent-area spells (Wall of Fire, Spike Growth) keep their template. midi waits ~5s before deleting so any cast animation plays. |
| `rangeTarget` | `"none"` | Never auto-target by range; does NOT control range enforcement |
| `optionalRules.checkRange` | `"none"` | **The actual attack-blocking range check** (midi UI: Mechanics tab → range checking; valid values `none`/`longfail`/`longdisadv`). midi 14.0.8 default is `"longFail"` = block beyond long range. ✅ Applied & verified in live world 2026-06-12 (console write; out-of-reach attack now rolls) |
| `optionalRules.wallsBlockRange` | `"none"` | **Wall/total-cover attack block** (midi UI: Mechanics tab → "Walls block ranged attacks" — despite the name it runs for melee too). Produces the *"target is blocked by a wall"* failure, distance-independent. Required `none` for no-canvas clients per §11. ✅ Applied & verified 2026-06-12 (was `"center"`) |
| `doReactions` / `gmDoReactions` | `"all"` | Prompt for reactions, don't auto-pick |
| `enforceReactions` / `enforceBonusActions` | `"displayOnly"` | **Record** bonus/reaction usage (for the phone's ACT/BA/RE indicator) but don't hard-block re-use. **Corrected 2026-06-15:** the prior `"none"` recorded *nothing* — `setReactionUsed`/`setBonusActionUsed` bail unless the value is `"all"`/`"displayOnly"` (midi-qol.js:18665/18697); `"displayOnly"` records without enforcing (warnings-not-walls). ACT is recorded regardless of this setting. Changing it drifts the live world → Settings Enforcer will prompt the DM to apply. |
| `undoWorkflow` | `true` | GM take-back of automated bookkeeping |
| `consumeResource` / `gmConsumeResource` | `"none"` (both) | **Global stays lenient** (DM's own manual play never auto-consumes/blocks). midi 14 values are strings (`none`/`spell`/`item`/`both`). **BUT phone-initiated Route-B uses force `workflowOptions.autoConsumeResource:"both"` per-workflow** (midi-qol.js:16881) so slots/charges/item-uses DO deduct — see §6.2. With the global `"none"` + our `configure:false`, midi's `checkAutoConsume` (7771) bailed → nothing was consumed (the "free spell" hole, DM-reported via Staff of Healing 2026-06-16). The per-workflow override fixes it without changing the global. Insufficient resources → midi forces its config dialog on the executor (DM resolves). |
| `confirmAmmunition` / `gmConfirmAmmunition` | `false` (both) | **Added 2026-06-21.** An ammo-consuming weapon (revolver/bow) pops midi's "use this ammunition?" dialog when the ammo is auto-selected: `confirmAmmunition` getter (midi-qol.js:9764-65) returns `confirm:true` and `rollAttack` then **forces `dialog.configure=true`** (:9489-91), defeating our `{configure:false}`. The dialog renders on the headless executor (a GM client → `gmConfirmAmmunition` is the live flag), the player can't answer, and the attack **times out** (DM-reported revolver/bullets 2026-06-21). midi defaults both `false`, but a world can flip them — the preset must guarantee off. (The separate "ammo required but none on the sheet" path at :9761-63 still warns regardless of this setting — that's a weapon-data fix, not this dialog.) |

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

**Target token image — realistic, cheap (CC finding 2026-06-14, answering DM Q).** The executor already holds each candidate's `TokenDocument` in `handleTargetsList` ([rpc.js](scripts/rpc.js)), so adding `img` to the `candidates[]` payload is a one-line change — use `token.document.texture.src` (token art) or `actor.img` (portrait). The phone just renders the URL; it resolves nothing locally (same as everything else). **One guard:** gate the image by the same display-name rule as `name` — a token whose name/identity is hidden (`token.document.displayName` vs `CONST.TOKEN_DISPLAY_MODES`, and the existing "no leaking Doppelganger" TODO) must fall back to a generic silhouette (`icons/svg/mystery-man.svg`), never a recognizable portrait. With that guard it's a safe upgrade; do it alongside the display-name fix the candidate payload already owes.

---

## 6. Popup taxonomy and handling

| Class | Where it appears | Risk | Handling |
|---|---|---|---|
| Roll-config dialogs (adv/dis, bonus) | Route A: phone. Route B: never (pre-resolved by our own screen) | Low | Restyle (bottom-sheet, huge buttons) |
| Save prompts to targets | Target owner's phone, both routes | Low (most-traveled midi path) | Restyle; **generous midi timeout** before auto-roll fallback; loud cue |
| Reaction prompts | Owner's phone, off-turn | Medium (player is looking at the TV; **iOS has no vibration API**) | Full-screen takeover + sound (audio unlocks after first tap of session); optionally flash "waiting on <player>" on the TV |
| Unanticipated dialogs (any module) | Route A: phone (ugly but visible). **Route B: headless Service client — invisible, workflow stalls silently** | **High (Route B)** | Generic fallback restyle on phones (enlarge any dialog's buttons). **Dialog watchdog on Service:** detect any Application render on the headless client; auto-resolve with defaults where safe, else surface "workflow stuck on: [dialog title]" to the DM. The watchdog is mandatory if Route B ships. |

This table is the strongest argument for preferring Route A if Spike 2 allows it.

### §6.1 — Route-B popup routing (consolidated live, 2026-06-16; answers "how do we handle all these popups?")

Route A is dead (Spike 2), so **every workflow runs on the executor** and any dialog/roll it spawns appears *there*, not on the caster's phone. We don't try to teleport arbitrary Applications to the phone — instead we classify each popup by **whose decision/roll it is** and route accordingly:

1. **The acting player's own roll** — attack, damage, **and healing** (midi treats healing as "damage" of type `healing`). Kept on the phone via the **two-tap**: tap-to-use parks the workflow at `WaitForDamageRoll` (`autoRollDamage:"none"`), the phone's second tap rolls it. *A heal should therefore surface its roll as the phone's second tap; if it doesn't, that activity isn't entering the two-tap path — inspect its activity type/structure (the Aid investigation, below).* Adv/dis is pre-collected on the phone (§14).
2. **Another actor's save/check** (AoE/attack targets) — midi whispers it to the owner; we **relay it to that phone** as a tappable prompt (built Round 17, §13) that fires the native (Restyled) roll midi intercepts.
3. **Reaction prompts** — the same relay mechanism as saves; the next use of the `preTargetSave`-style relay. **CONFIRMED-MISSING BUG, DM 2026-07-11:** a player's controlled token was attacked, midi's native reaction dialog appeared (the module only *restyles* it via `liftDialogAboveShell` — no button rebinding, no executor call), the player tapped **Hellish Rebuke**, and NOTHING ran — no slot spent, no damage roll, no attacker Dex save, no chat, no DM chip. Root cause (traced 2026-07-11): there is **no module reaction-execution path at all.** Saves have `registerSaveRelay` (`rpc.js`, on `midi-qol.preTargetSave`) + a `maybeSavePromptFromCard` chat fallback; reactions have **neither**, so they rely entirely on midi's native remote dialog completing on a **canvasless phone** client — which it can't. `aoo.js` only handles melee-weapon opportunity attacks + Sentinel (movement-triggered), never spell reactions, and there's no "you were damaged/attacked → offer your reactions" watcher. **FIX (to build with the DM available to test):** a reaction relay mirroring saves — hook midi's reaction event, whisper/relay the available reactions to the owner's phone as a tappable chooser, and on tap call an executor handler like `handleItemUse`/`handleItemUseStart` (`rpc.js`) with the triggering attacker pre-set as the target and the spell slot passed through (as `#fireAction`'s `spellSlot` already does). Needs live midi testing — do NOT ship blind. **BUILT 2026-07-11 (v0.1.117) — NEEDS LIVE TESTING.** Researched against installed midi-qol 14.0.9: the reaction dialog is dispatched to the owner via `socketlibSocket.executeAsUser("chooseReactions", …)` then rendered by `ReactionDialog` on that (canvasless) client — dead on the phone. Impl: `rpc.js registerReactionRelay()` hooks `midi-qol.ReactionFilter` (fires in `doReactions` on the executor BEFORE the socket hop), resolves the owner via `MidiQOL.playerForActor`, relays `{reactorUuid, attackerTokenUuid, reactions:[{uuid,name,itemName,img,selfTarget}], triggerType, ttlMs}` to the phone via `socket.executeAsUser("reactionPrompt", ownerId, …)`, and **returns false to suppress midi's native dialog**. Phone (`shell.js`): `noteReactionPrompt`/`#reactionPromptHTML` render a violet tappable chooser; `#useReaction` fires the chosen activity through the existing `rpc.useActivity`→`handleItemUse` path with `targetUuids:[attackerToken]` (unless `selfTarget`) + `midiOptions.isReaction:true` — so the slot spends, damage rolls, and the reaction's Dex/etc. save fans to the attacker. **KNOWN CAVEATS to verify:** (a) ~~fires reactions at BASE spell level (no upcast UI yet)~~ — **RESOLVED 2026-07-12:** `#useReaction` routes through `#pickAction`, which already shows the upcast slot row (`#spellSlotOptions` → `spellSlot` → executor `usage.spell.slot`), so reactions get the same upcast picker as a normal cast (pact-aware); (b) POST-HOC reactions (Hellish Rebuke, damage/hit responses) work — **reaction economy now consumed 2026-07-12:** `#useReaction` sets `#reactionFiring` → `#pickAction`/`#fireAction` pass `midiOptions.isReaction:true`; (c) confirmed working live (DM: "hellish rebuke worked better than expected, so did another reaction"). **PRE-ATTACK reactions (Shield) — ARCHITECTURAL HARD-CASE, 2026-07-12:** Shield-type reactions must be run BY midi so it re-evaluates the triggering attack's hit against the new AC (midi special-cases this in its own reaction phase). Our relay executes the reaction as a SEPARATE `completeActivityUse` on the executor — the +5 AC applies but midi never re-checks the already-decided hit, so the Shield is wasted. Making midi re-check requires midi's OWN reaction flow to run it, but that flow renders/executes on the owner's client (the canvasless phone) where it dies — the core mismatch. Not cleanly solvable without putting a canvas on the phone (against D1/D2) or reimplementing midi's Shield re-eval (fragile). **Decision: leave attack-modifying reactions (Shield, Silvery Barbs, Cutting Words on the roll) to the DM on the executor — warnings-not-walls (§11).** Post-hoc reactions are the supported set.
4. **A choice the acting player should make** — upcast slot level, "choose one of N effects/targets". **Pre-collect on the phone before firing** (the §7.5 pre-roll screen) when the choice is known up front; otherwise it pops on the executor and the **DM picks** (universal fallback, §11).
5. **Spatial** — template/summon placement → **DM** (AoE push, §11).
6. **Unanticipated module dialogs** — DM handles on the executor; a watchdog/notifier is the §6 v2. We add a relay only per high-traffic, known popup type (saves done; reactions next) — the long tail stays DM-side by design (warnings-not-walls).

**Rule of thumb:** *a roll or choice that is the acting player's → route to the phone (two-tap · native-roll-intercept · pre-collect); everything else → the DM decides on the executor.* Visual consistency: anything we surface on the phone (the save prompt, etc.) is styled to match the Prompt Restyler's bottom-sheet so popups don't read as foreign (DM feedback 2026-06-16).

**✅ Aid — diagnosed + fixed (2026-06-16, untested).** Dump showed one `heal` activity with a **flat** amount (`healing.number:null, denomination:null, bonus:"5"`, scaling "5") + 8 effects (per-level +max-HP). Root cause: `handleItemUseStart` fires every non-attack down the two-tap path (park at `WaitForDamageRoll`, `autoRollDamage:"none"`), but a **flat heal has no damage roll to park on**, so the workflow slips past and midi leaks the heal-roll config dialog onto the **executor**. Fix: in `handleItemUseStart`, detect a flat heal and resolve it on the **single Use tap**, fast-forwarded (`autoRollDamage:"always", fastForwardDamage:true`) like the AoE — no executor dialog; amount lands in the phone roll strip. **Dice heals keep the two-tap** so the player still rolls.

**⚠️ Flat-detection gotcha (2026-06-16, v2): test the formula, not the fields.** The first cut checked only `healing.number`/`denomination`, but heals can store dice in the **`bonus`/`custom` formula string** (system/importer-dependent) — **Mass Healing Word** keeps `1d4 + @mod` in `bonus`, so the field-only check wrongly fast-forwarded (auto-rolled) it. Now: assemble `number d denomination` + custom formula + bonus and test for a die (`/\d*d\d+/`); only a die-free formula (Aid's "5") is flat. **Open / needs the console logs:** added `mobile-command | heal {name, formula, flat}` and `dice heal parked for two-tap?` — the next test must confirm (a) a dice heal logs `flat:false` and `parked:true` (player rolls on the phone, no DM dialog), and (b) Aid logs `flat:true` and resolves with no DM popup (the "Aid popup on DM" report may have been an unreloaded executor — re-test after reloading the GM client).

### §6.2 — Item/spell use-case map & resource strategy (2026-06-16)

**Resource consumption — fixed, and a stated priority shift.** D4 originally leaned "don't consume" (never block on ammo). The DM now ranks **counting resources** above never-blocking, because split item activities were granting **free spells** (Staff of Healing: each spell-activity fired without spending a charge). Root cause: global `consumeResource:"none"` **plus** our Route-B `configure:false` firing means midi's `shouldAutoConsume` (midi-qol.js:7750) and `checkAutoConsume` (7771) both bail → **nothing is deducted** (slots *or* item charges; the AoE only deducted because its native placement dialog consumed). Fix: **force `workflowOptions.autoConsumeResource:"both"` on every phone-initiated use** (`handleItemUse`, `handleItemUseStart` incl. the flat-heal branch). midi reads it **per-workflow** (midi-qol.js:16881), so it overrides the lenient global — the DM's own manual play stays unblocked, but phone uses always deduct. Insufficient resources → midi forces its config dialog on the **executor** (DM resolves): a soft stop, not a phone wall, which also closes the "free spell at 0 charges" gap. (`consumeResource` must be `"both"` not `"item"` — a non-spell item like the Staff is `isSpell:false`, but spells are `isSpell:true`, and only `"both"` covers both.)

**Multi-activity items (Staff of Healing, wands, etc.):** with consumption fixed, **keep the split** — each activity is a direct one-tap phone action and deducts the item's charges per its own consumption target. This is *better* than the DM's idea of "hide the activities, show the item popup": under Route B that popup would open on the **DM**, not the phone, and lose the player the direct pick. Split + per-activity consumption is the win; the "free spell" worry is removed by consumption itself.

**Use-case map** — priority ladder **works-at-all ▸ resources counted ▸ player acts + rolls own dice**:

| Use case | Resource | Roll | Phone handling |
|---|---|---|---|
| Weapon / cantrip attack | — | attack + damage | Two-tap (player rolls both); adv/dis pre-collected (§14) |
| Leveled spell — attack/save | slot | damage; target save | Two-tap; slot consumed; target's save **relayed** to their phone (§6.1) |
| Flat heal (Aid) | slot | none | Single tap, fast-forward; slot consumed |
| Dice heal (Cure / Mass Healing Word) | slot | healing | Two-tap (player rolls the heal); slot consumed |
| AoE spell | slot | target saves | DM places template (announce→Place); slot consumed; saves relayed; template auto-clears |
| Multi-activity item (Staff of Healing) | item charges | per activity | Each activity = direct phone action; charges auto-consumed per use |
| Consumable (potion / scroll) | item qty/uses | heal/effect | Single tap; quantity/use consumed |
| Limited feature (Rage, Action Surge, Second Wind) | item uses | varies | Phone action; uses consumed; ACT/BA/RE strip reflects |
| Feature/spell with a **choice** dialog (upcast, Choose Effects, War Bond) | varies | varies | Choice known up front → pre-collect (§7.5); else the **DM** picks; the actor/item-data half reflects automatically |
| Summon / spatial effect | — | — | **DM** places (like AoE) |
| Anything unanticipated | — | — | **DM** does it on the executor (the works-at-all floor) |

**Reading the ladder:** each row first guarantees it *can happen* (DM fallback if nothing else), then *counts the resource* (now forced in Route B), then maximizes *player agency + dice in the player's hands* (two-tap · native-roll-intercept · relay · pre-collect). We add a dedicated phone lane per high-traffic case; the long tail stays DM-side by design (warnings-not-walls, §11).

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

**Design-language unification of foreign popups (2026-07-10).** Every app lifted over the shell (`.mc-phone-dialog`) is skinned to read as one app, not a foreign window. Rules, most-general first:
- **Token mirror + theme.** Lifted dialogs are body-children (siblings of `#mobile-command-shell`), so they inherit none of its `--mc-*` tokens — redeclare the palette on `.mc-phone-dialog` and re-tint it per `body.mc-theme-*`, *without* the shell's radial background. Everything downstream uses tokens, so it re-themes for free.
- **Shared chrome skin.** One layer maps the tokens onto the classes every Foundry app shares: `.window-header` (panel-2 bar), `.window-title` (gold, **Signika** — not the module's own font), `.window-content` (panel bg + the single scroller: `flex:1; min-height:0; overflow-y:auto`), form fields (dark inset), buttons (neutral; submit/primary = Save-blue; dnd5e roll adv/dis = green/red).
- **Strip GM/dev chrome from ALL popups.** Hide the `⋮` header-controls menu (`[data-action=toggleControls]`), copy-UUID (`[data-action=copyUuid]` / `.fa-passport`), copy-document-id. Players never need them on a phone.
- **Document sheets pin to full height** (`.mc-phone-dialog.sheet { height:88dvh }`) so switching tabs doesn't resize the sheet and shuffle the tab bar. Non-sheet dialogs size to content.
- **"Keep all items looking like items."** A module's item rows should mirror the shell's own `.mc-action` card (bg `#20222b`, `1px #313542`, radius 10, soft shadow, 46px rounded icon, 15px/600 ink name, Save-blue primary button). Applied to Item Piles item + currency rows.
- **Footer button rows:** equal height (`align-items:stretch` → bottoms a uniform distance from the screen edge), equal width + even spacing (`flex:1` each), icons vertically centered even with a two-line label (button is a centered flexbox), and iOS home-bar clearance (`env(safe-area-inset-bottom)`, once — don't stack it with the scroll container's padding).
- **ONE money element (`.mc-currency`/`.mc-coin`, DM 2026-07-10).** Built from the PC's `system.currency` (all denominations, dnd5e coin icons via `CONFIG.DND5E.currencies[k].icon` — reused by Item Piles, so no IP dependency), so it looks identical whether editable (inventory: tap-to-edit `<input>`, commits on blur → `system.currency.<k>`) or read-only (store wallet footer: static `<span>`). Comma-formatted. Each coin **hugs its own number** (`flex:0 1 auto`, width set inline in `ch` to the digit count, updated live in `#onInput`; row `flex-wrap:wrap` so it never scrolls horizontally) so populated coins get the room. A coin whose amount is **0 collapses to just its icon** (`.mc-coin-empty` → input `width:0`); in the inventory a tap focuses the label's input, which eases open (JS `#sizeCoinInput` on focusin/focusout, `transition:width`), in the store it's inert (no tabindex, no input). IP's own held-only wallet — which collapsed to PP when the buyer held 0 of a coin — plus the redundant "Shopping as X" line both live in `.merchant-bottom-row`, hidden in CSS; our `.mc-mwallet` footer replaces it.
- **Universal exit — every lifted popup gets ONE guaranteed close X (RULE, DM 2026-07-10; REVERTED 2026-07-11).** `liftDialogAboveShell` injects a `.mc-dialog-close` button (top-right, wired to `app.close()`, `el.remove()` fallback) on every `.mc-phone-dialog`, and CSS hides each app's native header close so there's exactly one, always in the same place. Trigger: a `JournalEntrySheet` reached from the level-up **subclass detail link** rendered with no close of its own and trapped the player ("we still need an exit strategy for all popups"). **REVERTED with v0.1.108/109 (rolled back to v0.1.107) — DM 2026-07-11: on the advancement manager the popup titles overlaid ("Hit Points" over "Warlock · Level 3 · Step N"), the sheet still moved, and "even getting stuck beats this." OPEN: (a) confirm whether the overlap is this change or dnd5e's own advancement-flow header on a 380px phone — the manager template only embeds the flow via `<template>`, so the title is dnd5e's; test at v0.1.107 to be sure. (b) The trapped-journal problem is REAL and still unsolved — redo the exit affordance more surgically (e.g. inject ONLY when no native close exists; don't hide native closes; don't append to apps whose header layout it disturbs).**
- **TJS (svelte) apps** (Item Piles) are the fragile case: hashed scoped classes need `!important`; disable their header **drag/resize** on lift (`app.reactive.draggable=false`) so the bottom-sheet stays pinned; kill `-webkit-user-drag` + long-press callout on rows; their content is a `<main>`/`.item-piles-*` tree, not `.window-content`, so per-module patches live alongside the shared skin. TJS windows also miss the modal step-lock **backdrop blur** (z-index desync) — open follow-up.
- **Auto-loot: dead NPC → item pile on death (feature idea — DM 2026-07-10, FOR LATER).** When an NPC token drops to 0 HP (or gains the Defeated status), automatically convert it into an Item Piles **loot pile** so players can loot it from the phone with the flow we already built. Feasible via `game.itempiles.API.turnTokensIntoItemPiles(tokens)` on the **executor**, triggered by a death hook (`updateActor` hp→0 / `dnd5e` defeated / `updateCombatant`). Gate: NPCs only (not PCs/downed players), DM-configurable on/off, and skip tokens the DM marks "no loot"; guard against double-conversion. Only where Item Piles is installed. Pairs with the loot UI (§7). **BUILT 2026-07-10, reverted 2026-07-11 (bundled), RE-ADDED 2026-07-11 standalone in v0.1.114** (`rpc.js registerAutoLoot`/`maybeAutoLoot`): setting `autoLootNpcs` (world, default OFF); executor-gated hooks on `updateActor` (hp→0) + `updateCombatant` (defeated); resolves the placed token, requires `actor.type==="npc"` and **unlinked** (a linked convert would nuke every token of that actor — IP `_turnTokensIntoItemPiles` writes the pile flag to the base actor), skips `flags.mobile-command.noLoot` and already-`isValidItemPile` tokens, and an in-flight Set guards double-fire. Calls `game.itempiles.API.turnTokensIntoItemPiles(tokenDoc, {pileSettings:{type:"pile",deleteWhenEmpty:false}, tokenSettings:{name, texture}})` — we override name+texture so the corpse keeps its look instead of IP's treasure-bag icon. IP v3.3.2 API confirmed against installed source. No DM UI yet for the `noLoot` flag (set it manually / future).
- **Player-created flavor items (feature idea — DM 2026-07-10, FOR LATER).** Let a player **create and name a blank item** from the phone, no mechanics required. Scenario: player "I want to pick up a few shards of the broken crystal" → DM "sure, add a few shards" → player makes an item named "Crystal Shards" in their inventory; later they (or the DM) can add a use/image/description/quantity if it turns out to matter. Deliberate create flow (a "+ New item" affordance in the Inventory tab → name → done), NOT the full dnd5e item-editor. Note: players CAN normally edit items they own (that's why the store's Sell-tab item sheets were editable) — we're stripping that edit chrome on the phone for polish, so this gives back the *one* create/name capability that's actually wanted, on purpose. Pairs with the item-sheet edit-control strip. **BUILT 2026-07-10, revised then REVERTED 2026-07-11** (rolled back to v0.1.107; the popup fought the keyboard AND the inline retry "STILL moved" per DM — redo with more care, keep the inline-not-popup rule) (`shell.js #newItemBtnHTML`/`#newItemInputHTML`/`#addFlavorItem`): a `+` button in the Equipment header (owner-only; in both the populated and empty-inventory branches) toggles an **inline** name field → `actor.createEmbeddedDocuments("Item", [{name, type:"loot", system:{quantity:1}}])`. The `createItem` hook re-renders + toasts, so no full item editor is opened. Loot type = has a quantity, no mechanics. **The first cut used a `DialogV2` popup — DON'T: a bottom-sheet `.mc-phone-dialog` fights the mobile keyboard (opens under it, then jumps over it on focus; the sticky-footer shadow reads as false-scroll). Use an inline field in the shell (mirrors the character-name rename): commit on Enter/blur, cancel on Escape/empty, `#newItemOpen` state reset on tab-change.** General rule: any phone input belongs inline in the shell, not in a lifted popup.
- **No jarring layout shifts (GOAL, DM 2026-07-10).** When a control appears/disappears (e.g. the advancement HP step: ticking "Take Average" removes the Roll input + die button, and the row/popup reflows), the surrounding layout should stay put — reserve the space (`visibility:hidden`/min-width, not `display:none`; fixed control heights via `--mc-control-h`; pin tabbed sheets to a fixed height so tab switches don't resize — cf. the merchant). Applies broadly; fix specific instances as the DM reports them. Tabbed popups already fixed via full-height; the advancement HP row is a known open instance. **HP row BUILT 2026-07-10, REVERTED 2026-07-11** (rolled back with the v0.1.108 batch; the min-height itself worked in testing — the advancement popup's broken TITLE overlay is the real open issue, likely dnd5e's own flow header on a narrow phone; redo the min-height + tackle the title separately): dnd5e 5.3's HP advancement flow is the ApplicationV2 rewrite — ticking "Take Average" doesn't hide the roll input+dice button, it **removes them from the DOM** on re-render (the template gates them on a `manual` flag; AppV2 replaces the part's innerHTML), so `visibility:hidden` can't reserve space. Fix = `min-height:48px` on the always-present `.advancement.flow .breakdown.split-group` row so the "Take Average" toggle below it doesn't jump when the controls swap for the static average number. (Selectors confirmed against installed dnd5e `templates/advancement/hit-points-flow.hbs`.)

### 7.7 Journal Composer
Module auto-creates the shared journal on world setup and grants players **Owner** (Observer can't edit). MVP is the **append composer**: plain textarea + "Add note" → appended paragraph stamped with author and date. Chronological log for free; phone keyboard (and voice-to-text) just works; typo fixes happen from a laptop since it's a normal journal underneath. v2: restyled ProseMirror editing (core collab editing already prevents clobbering).

### 7.8 Connection Guard
Screen Wake Lock during combat; silent reconnect + state resync on `visibilitychange` (iOS backgrounding); Service heartbeat indicator; session-start tap doubles as the audio unlock. Nice-to-have: DM "show join QR" for session start.

**Presence reporting (free byproduct):** the same `visibilitychange` listener reports app foreground/background to the DM panel. Three states per player: green = app open and on-screen; amber = phone on but app backgrounded; gray = disconnected. Note: "backgrounded" cannot distinguish app-switching from a locked/face-down phone — socially self-resolving (a face-down phone looks innocent and is). Optional setting (default off): show presence dots on the TV next to character names.

**"Request rolls" — fold in a sibling action (feature idea — DM 2026-07-10, FOR LATER, not built):** the rolls flyout will probably **combine another DM prompt** alongside Request rolls so the tab reads as one coherent "ask the players for something" surface (rather than rolls-only). What that sibling is is undecided — candidates: request a *choice/decision*, a *free-text answer*, or an *ability/skill contest*. Revisit when the second action is scoped; may warrant renaming the tab. Pairs with the DM roll-request dock (§13 Round 12).

**Away-timer escalation (feature idea — DM 2026-07-10, FOR LATER, not built):** a module setting *"let me know if a player is away for more than [N] seconds"* — default **90**, and **0 is a valid value** (escalate immediately). When a player stays backgrounded/away longer than N seconds, flip their online indicator from its idle colour (black) to **red** — a stronger "away too long" state layered on the amber "backgrounded". Reuses the existing `visibilitychange` timing; the per-player timer starts on background and resets on foreground. Threshold is DM-configurable in settings. Pairs with the presence dots above. **BUILT 2026-07-10, reverted 2026-07-11 (bundled), RE-ADDED 2026-07-12 standalone in v0.1.128:** setting `awayThresholdSeconds` (world, default 90, 0 valid = immediate). Transport (`rpc.js`): each phone's `visibilitychange` calls `reportPresence(hidden)` → `socket.executeForOthers("presence", {userId, hidden})`; the receiver stamps `since` with its OWN clock when the hidden state flips (skew-free) into the exported `presenceState` Map. DM panel (`dm-panel.js statusHTML`): a CONNECTED player whose app has been hidden ≥ threshold gets a red pulsing dot + "away Ns" (layers over green/amber; offline stays gray). A 5s `setInterval` re-renders while anyone is hidden (the threshold crossing fires no event), self-clearing when all foreground; also re-renders on the `mobile-command.presence` hook, and clears a user's state on disconnect.

**Dead-NPC marking (DM 2026-07-12) — decoupled from auto-loot.** Live test: a killed NPC left a blood splatter visible on the DM but NOT the shared TV, and its token was hidden with no marker on the TV. Two root causes: (1) blood-splatter modules (Blood 'n Guts et al.) draw on the *processing client's* canvas only — a per-client effect that doesn't broadcast, so it's not a reliable cross-screen death signal and is out of scope; (2) all dead-marking was bundled inside `maybeAutoLoot`, gated behind the `autoLootNpcs` opt-in + Item Piles — so with auto-loot off (or no Item Piles) a dying NPC got NO marker, and whatever hid the token won. **Fix (v0.1.137):** extracted `applyDeadMarker(tokenDoc)` (shared) — a **skull OVERLAY** (a token/actor status → renders on *every* client incl. the TV, unlike a splatter), **force `hidden:false`** (a hidden corpse is invisible to the TV's display user, so the skull wouldn't show; a diagnostic logs when a corpse arrived hidden so a still-hidden report proves a later automation re-hides it), and **remove from combat**. New standalone `markNpcDead(actor)` + a `handleNpcDeath(actor)` router: auto-loot (opt-in) converts to a pile AND marks; if it's off — or the NPC isn't pileable (linked boss / no-loot flag / IP absent) — the plain visible skull still lands via `markNpcDead`. New world setting `markDeadNpcs` (default ON). The dead status also keeps the corpse out of the attack picker (`isDeadCorpse`).

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
2. **Shell + Touch Sheet (read-only first):** Favorites landing, ability-grid roll surface (check/save), tools row, HP strip, conditions. Already table-usable. *(In progress 2026-06-13: ControllerShell shipped — full-screen frameless ApplicationV2 for phone clients, read-only sheet [portrait/HP, condition chips, six-ability grid with Check/Save, common-skills strip], Actions/Journal tabs stubbed. Rolls use dnd5e document methods; render verified on desktop. **iOS finding (D2 confirmed on real hardware):** loading the canvas crashes iPhone Safari on world entry — so the module force-writes `core.noCanvas` in the `setup` hook (before the canvas draws) to match the client role. **Gotcha + guard (2026-06-13):** `core.noCanvas` is **per-browser localStorage, not per-user** — so logging a browser into a phone account (no-canvas) and then switching the *same browser* to the DM stranded the DM without a canvas (the leftover `true` persisted). The setup hook now **reconciles both directions on every load** — phone role → `noCanvas=true`, any other role (DM/TV) → `noCanvas=false` — so a browser self-corrects whenever it loads a world as a given role (a role switch always reloads the page, re-running `setup`). Net: phones are always canvasless, DM/TV always have a canvas, regardless of what the browser was last used for. Favorites-data integration, tools row, and HP steppers (write) are the next sub-steps.)*
   **Finding (2026-06-13): the full-screen shell hides Foundry's native chat**, so a phone player can't see their own roll result (the roll posts fine — verified via the DM's chat). The shell needs an in-shell **roll-result surface** (a toast on the player's own rolls, and/or a compact recent-rolls strip) — render-hook on `createChatMessage` filtered to this user's rolls. Near-term Phase 2/4 item; pairs with the Prompt Restyler (§7.6) which restyles the roll *dialog* but not its *output*.
   **Built (commit `e6c906e`, refined in `8451154`):** roll-result surface shipped in `shell.js`. A `createChatMessage` hook (`registerShellHooks`) routes roll messages to the open shell, filtered to *this user's rolls* — `message.author?.id === game.user.id` **OR** `message.speaker?.actor ===` the controlled actor's id, and only messages with `rolls.length`. Two read-only surfaces, styled in `shell.css` to the dark/thumb-first palette: (1) a **transient toast** over the sheet — big total + flavor label + formula, auto-dismiss ~4.5 s, tap to dismiss, natural-20/natural-1 highlighting (read from the kept d20's active result, no dnd5e internals); (2) a persistent **recent-rolls strip** above the tab bar (last 6, newest-first pills, horizontally scrollable). The toast is an overlay node detached/re-appended across full re-renders (so an HP/condition update doesn't wipe an in-flight toast); the strip lives in the flex flow (rebuilt from `#recentRolls` on re-render, updated in place per roll) so it never overlaps the sheet. Timer cleared + history reset on `_onClose`. Now load-bearing for Phase 3 (item-use results echo here). **Not yet exercised in the live world** — verified by code review only; needs the numbered live test (own check/save/skill → toast + pill; another player's roll → nothing; nat-20 highlight).
3. **Combat loop:** Turn HUD, move pad → `move.request`, Target Cycler → candidate cache + reticle broadcast, item use via the winning Route. *(In progress 2026-06-13 — Step 1: Actions tab lists the actor's usable offensive activities [attack/save/damage, AoE excluded], tapping opens a target picker fed by the `listTargets` RPC [tap-to-select up to the activity's target count, adv/normal/dis], and Fire calls `useActivity` (Route B) **fully resolved** for now. Results echo via the roll-result surface; refusals surface as toasts. **✅ Step 2 DONE (2026-06-13, verified live):** the Q5 two-tap cadence works — tap **Use** fires the attack (executor parks the workflow at WaitForDamageRoll via the held-workflow mechanism, RPCs `itemUseStart`/`itemUseDamage`/`itemUseCancel`), the phone shows the attack result, and a deliberate **Roll damage** tap triggers the held workflow's damage. Verified: Greatsword → Gnoll, attack rolled 20/hit as a separate step. UI hardened with timeout/try-catch so a hung RPC can't strand the shell on "Rolling…". Target UI is a tappable list for now; the prev/next Cycler is the later MVP skin. **Move pad + Turn HUD built 2026-06-13 (untested, see §12 overnight-build note + MORNING_REPORT.md):** Move tab D-pad → `move.request`; Turn HUD banner with owner-gated End turn → `endTurn` RPC.)*

**B9 — ✅ DONE (interim DM-side preview, verified live 2026-06-13). Target commits on the player's tap, not at attack time.** Was: candidate selection was local highlight state on the phone; the real Foundry target was only set when the workflow fired with `targetUuids`. Now: on target-toggle the phone calls `previewTargets`, and the executor reflects the selection on the active-scene canvas via `canvas.tokens.setTargets(ids, {mode:"replace"})` (v14 API; `User#updateTokenTargets` is gone). Shows in the DM's targeting color for now; the **player-colored TV reticle** (§5 broadcast trick) supersedes it once the TV client is up. The DM wants the target to **switch live as the player taps** — which is precisely §5's `targets.push`/reticle-broadcast and §7.3's "TV reticle follows your cycling." Implementation: on target-toggle, push the selection to the executor so it reflects on the active-scene canvas / TV, ideally as a **player-colored reticle** via the TV client (§5 user-activity broadcast trick) rather than polluting the DM's own targets. Needs the TV (Monk's Common Display) client to test the colored-reticle path; an interim DM-side preview is possible but should not hijack the DM's targeting. This is the next combat-loop increment after Step 2.
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
  - **✅ Assign flow VERIFIED end-to-end live (2026-06-16):** DM targets → assign panel → phone shows "Targets set by DM" pre-filled → fires at the token. **Sharp edge found + resolved (DM workaround, no code):** midi's `isValidTarget` (midi-qol.js:19842) hard-rejects tokens with `document.hidden` (the eye-toggle "Hide") or `isSecret` — a workflow given such a target fires **target-less**. It does **NOT** reject the **Invisible *condition***. **So the documented DM practice for "let a player attack an enemy they can't see" is: apply the Invisible condition, NOT the Hide toggle.** The assigned attack then lands, and the players' vision still can't render it on the TV. This **supersedes** the earlier idea of having the executor un-hide the token before firing (that would briefly flash it on the TV — strictly worse). `checkRange`/`wallsBlockRange` already `none`, so distance/LOS don't block assigned targets. **Remaining polish (optional):** show assigned target *names* (display-name-mode aware) instead of just a count.
- **Range/in-range badges** → advisory only. The confirm button NEVER disables based on range, sight, or walls. (midi's own range/LOS/cover enforcement is disabled in the settings preset — required anyway for no-canvas clients.)
- **Wall-validated movement** → constrains phone-initiated moves only. DM drags on the laptop are never blocked.
- **Adv/dis/bonus screen** → this is where table rulings get their mechanical teeth ("attack the invisible one at disadvantage").
- **Ultimate fallback** → the DM performs the whole action from the laptop (a normal Foundry client); phones reflect outcomes automatically since it is all the same actor data.

**Universal edge-case flow:** (1) ruling happens out loud → (2) unusual targets: DM-assign → (3) ruling's modifier: player picks adv/dis/bonus → (4) tap the action, automation routes saves/damage normally → (5) weirder still: DM does it from the laptop.

**DM-assign UX (dm-role client):** DM targets with native Foundry targeting (hover + T, shift+T for multiples). A small docked panel wakes when the DM holds ≥1 target: target chips, a Clear button, one button per connected player with the **current combatant as the highlighted primary** ("Send to <name> · current turn"); disconnected players shown grayed out. Hotkey: "assign current targets to current combatant" (hover → T → hotkey). On send: DM's own targets clear (no lingering DM reticle on the TV; the player's reticle color takes over as table-visible confirmation). Player phone: soft cue + "Targets set by DM" (hidden creatures displayed namelessly); tapping an action **skips the cycler** with assigned targets pre-loaded, straight to adv/dis, with a "change targets" link back into the cycler. **Assigned targets auto-expire at the end of that player's turn** (stale assignments are a misfire hazard).

**AoE spells (MVP flow):** player declares verbally and points at the TV; DM places the template on the laptop; midi auto-targets tokens under the template; DM completes the cast from the player's sheet (laptop). Slot deducts on the player's actor (phone sheet updates automatically); saves route to owners' phones as usual, including allies caught in the blast. **v2:** template handoff — DM places, caught targets are assigned back to the caster's phone for slot choice + confirm; deferred because the workflow must then skip placing a second template (fiddly).

**AoE push — ✅ BUILT & VERIFIED LIVE (2026-06-16): "everything worked as expected."** Announce→DM Place→template→auto-target→damage→saves→template auto-clears, in and out of combat. phone announces, DM places with one click.
- **Phone:** `#pickAction` branches any activity with `target.template.type` to `#announceCast` (no picker) → `api.announceCast({activityUuid, casterName, spellName, casterTokenUuid})` → toast "Asked the DM to place X." AoE activities are **no longer filtered out of the Actions tab** (`#usableActivities` exclusion removed) — they now show there too and route to announce, alongside the Spells tab and favorites (all three go through `#pickAction`).
- **Executor RPC ([rpc.js](scripts/rpc.js)):** `handleAnnounceCast` (owner-checked) records the cast in an executor-only `pendingCasts` map and fires `mobile-command.pendingCast`. `placeCast(id)` (exported, called directly by the DM panel since both run on the executor): refuses if paused / off active scene, `token.control()` + `canvas.animatePan` to the caster, then `activity.use()` with **`midiOptions: { autoRollAttack, fastForwardAttack, autoRollDamage:"always", fastForwardDamage }`** — native cast so the **caster's** slot deducts and saves fan to targets' phones; the template attaches to the DM's cursor. `dismissCast(id)`/`listPendingCasts()` round it out.
- **DM panel ([dm-panel.js](scripts/dm-panel.js)):** now wakes on held targets **or** pending casts; renders a "Place spell(s)" section above the assign section — one `Player — Spell` row each with **Place** + a ✕ dismiss. Hooks: `mobile-command.pendingCast` / `pendingCastResolved` re-render.
- **🔬 Live test 1 (2026-06-16):** announce → DM prompted → DM placed the template → it showed on the TV → **then nothing happened (no targets / no damage / no saves).** Root cause was **not** combat (a spell isn't combat-gated): the preset had **`autoTarget:"none"`** so the placed template selected no tokens (midi-qol.js:13655–13656 returns early on `"none"`), and **`autoRollDamage:"none"`** so even a targeted workflow parked at WaitForDamageRoll with no phone follow-up. **Fixes (this session, re-test owed):** (1) preset **`autoTarget` → `"wallsBlockIgnoreDefeated"`** — only affects DM-placed templates since phones make none (§D4); **the DM must re-apply the preset via the enforcer.** (2) `placeCast` passes the damage fast-forward midiOptions above (per-cast; the global `autoRollDamage:"none"` stays for the two-tap flow). midi honors `usage.midiOptions` on native `use` (midi-qol.js:7597).
- **Out of combat:** the AoE cast is not combat-gated and should resolve the same once targeting/damage are fixed. *(Still combat-only, by design: the Turn HUD, the ACT/BA/RE economy strip, and the DM panel's "· turn" highlight.)*
- **Impl notes still open:** (a) `activity.use()` uses default dialog config — an upcast dialog (if any) shows on the DM screen; phone upcast is §7.5-deferred (base level otherwise). (b) pending casts have **no auto-expiry** (DM dismisses with ✕). (c) Place is blocked while paused (consistent with the other executor RPCs).

**Agreed design (2026-06-16):**
1. Player taps an area spell on the phone → phone sends an **`announceCast`** RPC to the executor (instead of the current refusal) with `{activityUuid, casterName, spellName, casterTokenUuid}`; phone shows "Asked the DM to place it."
2. DM panel ([dm-panel.js](scripts/dm-panel.js)) shows a **pending-cast entry** ("Player X — Burning Hands") with a **Place** button.
3. **Place** → on the executor: `control()` + pan to the caster token, then `activity.use()` for the player's spell activity → dnd5e attaches the template to the DM's cursor; the **caster's** slot deducts (their phone updates), saves fan to targets' phones.
4. DM places it (player guides verbally off the scene/tokens visible on the TV) → midi auto-targets + resolves.
- **Two confirmed constraints (don't design around them):** (a) the live aiming **preview is NOT broadcast** to the TV — Foundry only sends a template once *placed* (a placed template *can* be dragged and that does update the TV); (b) **placement is the commit** — midi auto-targets at the click, so there's no native "place → adjust → re-target" pause (mis-place → `undoWorkflow` and re-place). So the realistic loop is verbal-guidance + place + (undo/redrag if off), not a live-preview correction.
- **Template lifetime (DM feedback, 2026-06-16):** because the template only appears on the TV *after* the commit, it's redundant with the spell's own effect/damage as cast confirmation, and it used to linger until the DM deleted it. **Resolved via the preset** (`autoRemoveInstantaneousTemplate: true`, §D4): instantaneous AoEs auto-remove their template ~5s after the cast (after any animation); persistent-area spells keep theirs. **DM must re-apply the preset via the enforcer.**
- **Player say in placement — LOGGED, nice-to-have (not a must, DM 2026-06-16):** given constraint (a), the player can't see the DM's aim before commit, so they guide verbally. A clearer player voice in placement (e.g. the caster's phone showing a rough origin/direction picker, or the DM's in-progress aim mirrored to the caster) would be nicer but is explicitly low priority. Bounded by the no-preview-broadcast constraint; revisit with the TV-reticle work (Spike 6 / §7.3).

**Compound actions — summon + item buff, e.g. the Fighter's "War Bond" (DM Q, answered 2026-06-14):** a feature that both *summons a token* and *enhances an item* is two effects in one. Split them by **what the effect authors**, the same rule that sends AoE to the DM:
- **Spatial authoring → DM-handled.** Summoning places a token on the scene; a no-canvas phone can't place tokens, and dnd5e/midi summon prompts render on the executor, not the phone. So the **DM places the summon** (like the AoE template), or the dnd5e **Summon activity** runs on the executor and creates the token there. The phone may *initiate* (fire the activity); placement/confirm stays DM-side. Today `#usableActivities` already excludes `target.template` AoE — Summon activities should get the same treatment (route to DM, don't try to resolve on the phone).
- **Actor/item data → Route B, reflects automatically.** The item-enhancement half (an active effect on the weapon, a slot/charge spend) is document-level: it applies to the actor's own items and shows up on the phone sheet with no extra work, exactly like HP/conditions.
- **Rule of thumb:** activity effect is *spatial* (place template / place token) → DM; activity effect is *actor or item data* (attack, save, damage, heal, buff, resource spend) → Route B + auto-reflect. One feature can be both — phone does the data half, DM does the spatial half, narrated out loud (the universal flow above). **v2:** detect Summon activities and show a "DM is placing your summon" cue on the phone, mirroring the AoE handoff.

---

## 12. UI backlog — real-device feedback (do not action until UI-design phase)

Captured 2026-06-13 from live iOS Safari testing of the Phase 2 shell (read-only sheet, Fighter). Logged, not yet implemented; the read-only sheet is functionally verified. The L&F overhaul (B5) is the umbrella that several of these fold into.

**⏳ Overnight build status (2026-06-13, BUILT BUT UNTESTED — verify per MORNING_REPORT.md):** L&F pass (B5) applied as a dark-fantasy "character sheet" theme (Modesto Condensed display font, gold/crimson accents) layered over the existing DOM so functionality is preserved. Folded in: **B1** (tab bar enlarged + `env(safe-area-inset-*)` via a `viewport-fit=cover` meta the module now sets on phones), **B3** (inspiration star toggle in the header), **B4** (AC in the header), **B7** (HP & temp are tap-to-edit, absolute or relative `±` — the −/+ steppers + Damage/Heal row are removed). Also built the Phase 3 **Move pad** (Move tab, 3×3 D-pad → `move.request`) and **Turn HUD** (banner when combat is active; End turn → new `endTurn` RPC, executor-side `nextTurn`, owner-gated). **Deferred:** B2 (swipe between tabs), B8 (in-range badge — still needs the activity's range passed into `listTargets`), action-economy pips on the HUD, and out-of-combat group-token binding for the move pad (currently moves the controlled actor's own token). All of this is UNVERIFIED — built without a live client; the morning report lists the exact tests.

**⏳ Round 2 (2026-06-14, from DM feedback on the first build — also UNTESTED):** Move pad **moved into the renamed "Explore" tab** (was "Sheet"; the dedicated Move tab is gone) and the **D-pad enlarged + tightened**. **HP/Temp editor reworked for iOS** — the iOS numeric keypad has no +/− or reliable return, so tapping HP/Temp now opens a roomy row with on-screen **− / + / Set** buttons (− and + apply the typed amount as a delta; Set is absolute); inputs enlarged. **Actions broadened** beyond weapons/offensive spells to include **features** (Action Surge=utility, Second Wind=heal) and any non-AoE activity; no-target features skip the target picker. **Each action row now shows the item/feature icon** (`item.img`). **Still deferred (logged, not built):** inventory use (lamp/equip toggles, potions) as a Sheet/inventory surface; long-press detail card + context menu (§7.2 v2); swipe between tabs (B2); in-range badge (B8); action-economy pips on the Turn HUD; out-of-combat group-token movement; **grouping the Actions list by activation type (Action / Bonus / Reaction)** — DM-requested 2026-06-14, group via `activity.activation.type` with section headers.

**Round 61 (2026-06-30, char-gen live QA + spell-slot fix — v0.1.64):** Full live walk of the phone char-gen → level-up → subclass flow (joined as Player 1 via Claude-in-Chrome; Foundry MCP bridge also back for inspection). Built **Aasimar Bard 3 / College of Lore** and **Aasimar Druid 3 / Circle of the Moon** end-to-end on the phone. **VERIFIED WORKING:** the dnd5e Advancement dialogs lift onto the phone correctly (class/species/background each run their full multi-step advancement; the `<select>` trait pickers are native popups that must be driven via the DOM, not coordinate clicks); ability point-buy; the bard/druid **spell picker** (cantrip/spell counters, school filter, "Learned N spells"); **Finish**; the **Level up** panel (`#doLevelUp` → `AdvancementManager.forLevelChange`); **subclass at L3** via the dnd5e Compendium Browser (select the row's right-edge **checkbox**, not the row — the row opens the item sheet); the **skills list + roll** (Details tab → roll-config dialog → chat, mods correct incl. Jack-of-All-Trades/expertise/bonus profs); a **leveled spell cast** (Heroism: L1 slot consumed, Concentration applied, spell card to chat, Temp HP + Bravery effect on later turn); **Long Rest** ("Recovered: +4 L1, +2 L2 slots"); and **class/background equipment** (each is a fixed-item grant behind an "Add equipment" button — adds 6/4 items that **persist** on the actor, 10 total on the Druid). Ability point-buy ↔ background ASI interaction (point-buy shows base, background adds on top → Cha/Wis end +2/+1 above the dialled value) **confirmed EXPECTED by the DM** (not a bug).
- **🔴→✅ FIX: fresh caster had 0 usable spell slots.** After a build or level-up, dnd5e raises the spell-slot **max** but leaves **value at 0** — a freshly built/levelled caster shows 0 slots until a long rest (live: Bard L3 `spell1` 0/4, `spell2` 0/2). Fix ([main.js](scripts/main.js) `ready`): hook **`dnd5e.advancementManagerComplete`** (fires with the manager after the class/level change applies; `manager.actor` is the real actor with the new max) → top each `system.spells.*` slot **up to its max** (fill up only, never reduce, so a mid-session level-up can't wipe spent slots). Owner-gated; runs on whichever client ran the advancement (the player on their phone, who owns the PC). One hook covers BOTH char-gen L1 (the class advancement completes) and every level-up. **VERIFIED LIVE:** Druid `spell1` 2/2 right after the L1 class add, and **4/4 + 2/2 at L3** after two level-ups, no rest. (Player client must reload to pick up the new hook.)
- **🔴 OPEN — weapon attack stalls.** Greataxe → target → Use hangs on the shell's "Checking adv/dis…" with no attack roll posted (spell cast + skill rolls DID post). The midi-qol **attack** workflow handed to the GM-side executor (rpc.js) stalled; also attempted off the attacker's combat turn. Needs a clean retry on the attacker's own turn with the executor/GM client fresh.
- **🟡 OPEN — manual gear-adds vanished (DM).** DM reports magic items they added to the 4 blank PCs "didn't make it to any of the PCs, saw the popup." The char-gen equipment path is proven to persist (above); the module has NO auto item-stripping (only the explicit 2-tap "Drop" in inventory + chat-message cleanup). On the DM's re-add the items DID stick (Bard got Blade of Forlorn Hope, Shisui rapier, Cloak of Invisibility, Armor of Invulnerability, etc.), so the failure was transient/in the add path, not the module. Root cause of the original failure still TBD — watch a live add to diagnose.

**Round 61 cont. (2026-06-30 session 2 — rename, magic items, homebrew build, portrait):**
- **In-app rename VERIFIED on 3 PCs.** Tap the header name → summary-card title is the editable `mc-name-input`; setting it renames actor + `prototypeToken.name` together. Renamed the built PCs to Aurelio Brightsong (Bard), Selene Moonshadow (Druid), Ember Vexscale (Bender) — all confirmed on actor + token.
- **Magic items on the Bard (equip/charge UI works; an activity-effect gap).** Equipment tab shows magic items with charges (Shisui rapier 8/8, Cloak 3/3, Armor 1/1) + equip/attune toggles; the attune-icon toggles `equipped`; weapons appear in Actions with all their activities (rapier: Midi Attack / Jet / Torrent). **🔴 Cloak of Invisibility "Raise Hood" (utility activity w/ a transfer effect "Hood Up: Invisible") consumed a charge (3/3→2/3) but did NOT apply the effect or post a chat card** — utility-item-activity effects aren't landing via the phone path (spells DO apply effects + post cards, so it's specific to item utility activities). Worth a focused look.
- **🔴 Weapon attack — still doesn't complete for the player.** Retried the Greataxe (Barb, in combat with targets): this time it got PAST "Checking adv/dis…" to "Rolling…" then the flow closed, but **no attack roll/card posted to the player's chat and no visible damage** (`MidiQOL.Workflow.workflows` empty afterward). The midi attack workflow handed to the GM-side executor isn't broadcasting its result back to the phone. Same executor-dependent path as the prior stall — needs GM-side debugging (executor rpc + result relay).
- **Homebrew build VERIFIED end-to-end.** Built a fully non-official PC on the phone — **Ashborn** (The Crooked Moon) / **Abducted by the Unseen** (homebrew bg, single-step, no ASI) / **Bender** (Ryoko's Yokai Realms, Fire affinity) → Lvl 1. All three homebrew advancement flows lifted onto the phone correctly (Bender: HP, Spellcasting+Elemental Strikes, affinity ItemChoice, cantrip count; Ashborn: size/language/traits/free cantrip). **🟡 The Bender's spell picker is EMPTY** (the class has no standard spell list to populate) — so the 2nd cantrip can't be chosen there; **Finish is NOT blocked** by the incomplete cantrip, so it's non-fatal, but a homebrew caster with a real spell list elsewhere would hit the same empty picker. Point-buy started clean at all-10s/15 pts here (no background ASI) — confirms the earlier 12-pts/Wis-Cha-preboosted state was purely the Acolyte ASI.
- **Portrait generator VERIFIED.** Tap portrait → "Generate portrait" opens a prompt-builder: Portrait/Full-body composition toggle (re-frames the prompt), free-text "describe your character" field (appended to the prompt), Subject auto-derived from race+class ("a Ashborn Bender"), token-readability + art-direction boilerplate, **Copy prompt → "✓ Copied"** (iOS-safe copy holds), and an "Open Gemini & paste" handoff. It builds a prompt for an external generator (no direct image API). **Minor:** article grammar — "a Ashborn" should be "an Ashborn".

**Round 61 cont. (2026-07-01 — token-sight-on-finish fix + 4th PC + Bender spell-list trace — v0.1.65):**
- **🔴→✅ FIX: new PCs invisible on the TV/DM canvas (DM report).** A freshly built PC's PLACED token kept `sight.range 0 / visionMode basic` — the token was dropped while the PC was still blank, so its darkvision never reached the token; in a dark scene (globalLight off) basic vision reveals nothing, so the PC looked blind on the shared screen even though the actor has darkvision. `main.js syncPartyTokenSight` can't fix this from the phone — it needs a **ready canvas** (`if(!canvas?.ready) return 0` — the phone has none) and is **GM-gated** (returned 0). New: **`#syncFinishedTokenSight(actor)`** in [shell.js](scripts/shell.js), called from `#finishCharGen` — pushes the actor's senses onto its placed **and** prototype token(s), **canvas-free** (uses `game.scenes.*.tokens` docs, not `canvas.tokens.placeables`) and **owner-runnable** (the player owns their own PC/token, no GM needed). Mirrors the object-form `detectionModes` logic (Round 60). **VERIFIED LIVE:** PC5 (Bugbear, darkvision 60) → token `range 60 / darkvision / saturation -1` the instant Finish ran, prototype token too; the 3 pre-fix PCs (Aurelio/Selene/Ember) fixed directly via the same computation from the player client. So all four PCs now reveal the dark map on DM + TV.
- **4th PC built + VERIFIED.** Grukk Battleborn — **Bugbear (MCDM) Fighter 3 / Champion**, built + levelled to 3 on the phone. New coverage: the **class-equipment A/B CHOICE** flow (Fighter: Chain Mail+Greatsword+Flail vs Studded+Scimitar+Longbow — radio choose-one, "Added 5 items"); Weapon Mastery (3 weapons) + Fighting Style (ItemChoice) + the L3 fighting-style-swap ("No Replacement") + the background feat's OWN sub-advancement (Crafter → 3 Artisan's Tools). Skill roll works (Athletics +5, "NATURAL 1" badge). Renamed via the in-app field. The four PCs: Aurelio Brightsong (Bard/Lore), Selene Moonshadow (Druid/Moon), Ember Vexscale (Bender/Fire, L1), Grukk Battleborn (Fighter/Champion).
- **Bender spell-list — root cause (DM Q "how do we get the Bender spell list?").** The picker resolves via `dnd5e.registry.spellLists.forType("class", identifier)` ([shell.js:762](scripts/shell.js:762)). Bender's identifier is `bender`, artificer/Wis progression. Ryoko's Guide **does** ship the lists — 4 journal spell-list pages **Bender (Air/Earth/Fire/Water)** (id `bender`, 37–49 spells; Ember/Fire → Bender (Fire), 42) — but Ryoko never **registers** them, so `forType` returns **null** → empty picker (dnd5e-wide, not just ours; `apothecary`/Drakkenheim registers fine, `bender`+`tamer`/Ryoko don't). **Fix options (not yet built, awaiting DM):** (A) mod-side fallback — when `forType` is null, read compendium spell-list pages by matching `system.identifier`, preferring the page that matches the character's chosen affinity (Fire→Bender (Fire)); (B) content-side — register/import Ryoko's list.

**⏳ Round 60 (2026-06-27, TV camera overhaul — feet-based framing, whole-party follow, combat spotlight — DM request):** A batch of linked camera changes ([main.js](scripts/main.js)), display-client only, all yielding to manual TV control. Constants in scene feet: `TV_PARTY_BUFFER_FT = 40`, `TV_MIN_RADIUS_FT = 35` (60→45→35, lowered across live viewing — "too zoomed out", DM 2026-06-27), `TV_COMBAT_RADIUS_FT = 60` + `TV_COMBAT_OUT_FACTOR = 0.6` + `TV_COMBAT_OUT_MS = 600`/`TV_COMBAT_IN_MS = 900` (the per-turn active-token spotlight; see the combat item below — the "whole party" detour was a misread, reverted).
- **Party framing in scene feet.** The auto party-fit (in `tvPartyScale`, used by the follow) pads **40 ft per edge PC** (was a fixed `grid.size*2`) and floors at a **35 ft radius / 70 ft across** (`Math.max(bbox+pad, minDim)` per axis), so a clustered party still shows context while a spread party gets 40 ft of breathing room. ft→px via the scene grid (`grid.distance` ft/square, `grid.size` px). The old `1.2` over-zoom cap is dropped — the `minDim` floor enforces the minimum zoom directly. (NB: the Focus button itself is later changed to pure-pan — see the locked-zoom item below; this floor now lives in the follow/`tvPartyScale`.)
- **Out-of-combat follow now frames the WHOLE party, not just the moving token (DM 2026-06-27).** The old `tvEdgeFollow` only kept the single moving PC ≥3 squares off the edge. Replaced by `tvPartyFollow`: on every PC `updateToken` step it recomputes the party bounding box (the moved token from the update doc, the rest from their docs) and corrects the camera so the box + a **40 ft buffer** stays in view at all times — pans the minimum to bring party+buffer back inside, and **zooms out** when it no longer fits. It zooms back **in** only past a 15 % deadzone (`TV_ZOOM_IN_SLACK`) so a regrouping party settles without hunting, converging on the auto-fit frame (floored at the 35 ft radius). Scene-clamped so it never overscrolls the map edge.
- **LIVE FINDING + fix — monks-common-display was overriding the camera (DM 2026-06-27).** Live test: the TV stayed ~15 ft on a single token, never the 60 ft group. Root cause traced in installed MCD 14.x source: MCD ALSO drives the display camera. On the display client (`playerdata.display`) its **screen-toggle** feature re-frames on every `updateToken` (`changeScreen` → frames `getTokens(screenValue)`, padded by `focus-padding` squares, default 10; a single token when `screenValue` is "combat"/a token id) and wins the `animatePan` race against `tvPartyFollow`. MCD's camera (`changeScreen`/`sceneView`/`canvasPan`) is **separate from** its vision (`controlToken`/`changeFocus`, the **focus-toggle** path — `control()` doesn't pan). Fix: `suppressMcdCamera()` — on **our** display client only, dynamic-import MCD's ESM and no-op those three camera methods, leaving token control (vision/LOS) intact. Gated on `isDisplayClient()` so the camera is always owned by exactly one module, never zero; runtime-only (a reload restores MCD). So the prior "MCD owns combat vision, we own framing" split now holds in practice. **Live-verify pending:** confirm the TV honours the 35 ft party / 60 ft combat framing with MCD installed, and that turn-by-turn vision still follows.
- **DM-locked zoom overrides the auto radius (DM 2026-06-27).** New control model so the DM dials the TV zoom live instead of us re-tuning `TV_MIN_RADIUS_FT`. State `tvLockedScale` (display side, null = auto). The **zoom buttons** (Round 27) now *set* `tvLockedScale` to the resulting scale — "zoom directs how zoomed in the TV". The **Focus/Center** button (`framePartyTokens`) is now **pure pan** — it pans to the party centroid and keeps the current zoom untouched ("centre only centres"); it never re-zooms or changes the lock. (The zoom is owned by the zoom buttons + the follow.) Shared `tvPartyScale(extentW,extentH,buffer,minDim,screenW,screenH)`: locked → hold `tvLockedScale` but never tighter than the party + buffer fits (so a **split party still zooms out to stay in view** — "correct for the party if they split up"); unlocked → auto-fit floored at `TV_MIN_RADIUS_FT`. Used by both `framePartyTokens` and `tvPartyFollow` (the follow keeps its anti-hunt deadzone only in the unlocked branch; locked is stable). Lock persists until reload (no reset control yet). `setTvLockedScale(scale)` sets `tvLockedScale` in and out of combat — the combat turn pulse settles back to this same party framing, so the DM's zoom carries through. (History: an earlier attempt to *persist a separate combat zoom* across turns re-applied a stale full-map zoom every turn — reverted; the active-token spotlight was then dropped entirely in favour of the whole-party pulse, DM 2026-06-27.)
- **Combat POV vision on the TV — opt-in (DM 2026-06-27, hardened live).** New setting `combatPovVision` (world, default **off**): in combat the shared display shows only the **active combatant's own vision** so senses/light matter — a PC with no darkvision is blind in a dark room without a light source. **Forced at the vision-source level**, not via control(): the `_isVisionSource` patch (in `setupDMOmniscientVision`) returns, on the display while the feature is on and it's a **PC's** turn, `false` for every token except the active combatant (and the active token's own sight check) — i.e. as if the display owned only that one token. An **NPC** turn falls through to shared party vision (DM's choice — avoids leaking enemy POV). First pass used `token.control({releaseOthers:true})`, but that's undone by control/release races — **monks-common-display's focus toggle releases what we control**, snapping vision back to shared ("still shared vision" live). The patch can't be raced. `refreshCombatVision()` (turn change / `combatStart` / setting onChange) re-evaluates vision so the patch re-runs for the new active token. **Live: the patch correctly restricts the eligible sources (`visionSources=[activePC]` per the diagnostic) but Foundry didn't RE-RENDER the fog from it on a bare `perception.update`** — so it now also `control()`s the active PC (the canonical native vision-refresh path; the patch backstops the restriction if MCD's focus releases it) and force-calls `canvas.effects.initializeVisionSources()`. Off / NPC / no-combat → `releaseAll()` + patch falls through → shared vision. Combat end → `deleteCombat` release (shell.js:4914) + `started` now false → shared. Exposed as `MobileCommand.refreshCombatVision`. **VERIFIED LIVE (DM 2026-06-27):** the temporary diagnostic confirmed `RENDERED=[activePC]` per PC turn in a dark scene (Cave F) — the TV genuinely shows each token's own LOS (no-darkvision PC goes black beyond carried light; darkvision PC sees the room). Diagnostic since removed. **Prerequisites:** (1) **dark scene** (no global illumination — `globalLight=false`); (2) each PC's **token sight synced from senses** — Round 59 finding; live, "some work some don't" was exactly this (Badger's actor has darkvision 30 but its token sight was *disabled*; "Player Character" genuinely `actorDarkvision=0`). The setting is **off by default**.
- **Combat-POV refinements (DM 2026-06-28, live):** (a) **player-owned summons count** — the POV/control/sync checks broadened from `hasPlayerOwner && type==="character"` to just `hasPlayerOwner`, so a player-summoned NPC (e.g. Badger) gets its own POV on its turn ("ally turn"); unowned monsters still fall through to shared. Camera party-framing stays PC-only (a summon shouldn't drag the party cam). The red "foe" ring is the token's `disposition` (summon data) — not changed here. (b) **sync auto-runs on `combatStart` on the PRIMARY GM** (`game.users.activeGM`) when the feature is on — a non-GM executor silently skipped tokens it didn't own, which is why darkvision wasn't applying. (c) sync guards `visionMode` against `CONFIG.Canvas.visionModes` so darkvision still gets its range if the mode id differs. **Open (live):** Gunner (actor darkvision 60) still saw color / couldn't target in dark before the auto-sync ran on a GM — needs re-test after a GM-side sync; if still wrong, the `sight-sync` log's `mode`/`visionModes`/`range` pin it.
- **Targeting ally for player-owned tokens (DM 2026-06-28).** The phone target picker classified ally/foe purely by token `disposition` (shell.js ~2878). A player-summoned NPC (hostile disposition) read as "Foe". Now `listTargets` (rpc.js) sends `pcOwned: !!token.actor?.hasPlayerOwner` and the shell labels any player-controlled token **Ally** regardless of disposition. (rpc.js change needs the executor reloaded; shell.js needs the player reloaded.)
- **Char-gen names the token (DM 2026-06-28 — root cause of much confusion).** PCs were all left with the generic token name "Player Character" (the PC/actor name never propagated to the token), so multiple PCs shared a token name — making every vision/targeting diagnostic ambiguous and hard to attribute. The char-gen name field (`#onChange`, `data-bio="name"`) now also sets `prototypeToken.name` and renames any already-placed token docs for the actor (best-effort, walks `game.scenes` so it works on the canvasless phone). **Token sight on this build: `detectionModes` reads back as an object keyed by id (e.g. `{lightPerception, basicSight}`), not an array — the sync's array write still applies (basicSight range matched the computed darkvision). Darkvision applied correctly (Fighter L1/Badger/a "Player Character" all `visionMode:darkvision` + ranged basicSight); darkvision renders in COLOR because `sight.saturation:0` (the mode isn't desaturating) — fixable by forcing `saturation:-1`, deferred (low priority).**
- **Sense sync VERIFIED (DM 2026-06-28).** Once run on a GM client, `syncPartyTokenSight` correctly applies every sense — live log showed Fighter L1 darkvision 60 + `feelTremor:20` (tremorsense) + `blindsight:25`, plus separate PCs with `feelTremor:30` and `blindsight:30`, "synced 5 (0 skipped)". The entire multi-round failure was that the sync was being run/auto-fired on a **non-GM** client, which silently skips tokens it can't update — hence darkvision/tremorsense never landed. Auto-sync now gates to the primary GM; manual `MobileCommand.syncPartyTokenSight()` must be run on a GM. **Token rename to actor name is in the same update — but only helps if the ACTOR is named (not generic); if actors are themselves "Player Character", the char-gen name field must be used to set the actor name.**
- **ROOT CAUSE — `detectionModes` is an object, not an array (DM 2026-06-28).** Tremorsense/blindsight never persisted (live: a token's `detectionModes` read back `{lightPerception, basicSight:0}` with no `feelTremor`, even though the sync logged `feelTremor:30`). In this build (Foundry 14.364) `TokenDocument.detectionModes` is a **record keyed by id** (`{feelTremor:{enabled,range}}`), so the sync's **array** write was silently dropped — only `basicSight` survived because it auto-derives from `sight.range` (which is why darkvision worked but the special senses didn't). Fix: `syncPartyTokenSight` now builds `detectionModes` as a **keyed object** with `{enabled,range}` values (no inner `id`, matching the stored shape). Also: greyscale via `sight.saturation:-1` for darkvision tokens (the mode alone rendered in colour); token rename to actor name in the same update (prototype-vs-placed: the sync does placed tokens, char-gen + `actor.prototypeToken.name` do the template). **VERIFIED LIVE WORKING (DM 2026-06-28)** — after the object-format write + GM-side re-sync, tremorsense reveals creatures in range; darkvision/blindsight/greyscale/combat-spotlight camera/POV vision/rename all confirmed at the table. The whole multi-round saga's lessons: sense sync must run on a **GM** (player clients silently skip), `detectionModes` is an **object record** not an array on Foundry 14.364, and generic "Player Character" token names made every diagnostic ambiguous.
- **In-app rename (DM 2026-06-28).** Tap the character name → the summary card's title is an editable input (`mc-name-input`, `data-bio="name"`); Enter renames the actor + `prototypeToken.name` + placed tokens in one go (Escape cancels). Works from the player's phone for their own character (they own the actor/token). Verified working.
- **Detection-mode id fallback (DM 2026-06-28, in progress).** Darkvision RANGE confirmed working live (Gunner sees in the dark), but greyscale tint + tremorsense/blindsight weren't — the detection-mode ids differ by build (Foundry 14.364). `syncPartyTokenSight` now picks the first existing id from candidates (`feelTremor`/`tremorsense`, `blindsight`/`seeAll`, …) and de-dupes. **Need the live `CONFIG.Canvas.detectionModes`/`visionModes` keys to finalise** — the sync's per-token log prints on the GM client (where it runs), so it must be read there, or via a one-liner on any client. Tremorsense reveals *creatures* in range, not terrain.
- **One-click token-sight sync from senses (DM 2026-06-27, onboarding #11 down-payment).** `MobileCommand.syncPartyTokenSight()` — for every PC token, reads `actor.system.attributes.senses.ranges.{darkvision,tremorsense,blindsight,truesight}` (installed dnd5e path) and sets `sight.enabled/range/visionMode` (darkvision → ranged darkvision mode; else basic = lit-areas-only) plus `detectionModes` (`lightPerception` always; `basicSight` ranged to darkvision; `feelTremor`/`blindsight`/`seeAll` for the special senses, each guarded by `CONFIG.Canvas.detectionModes`). Fixes the uneven token config that made combat-POV work for some tokens and not others. Run by a client that can update the tokens (GM, or the display via auto-own; per-token failures are skipped + counted). **Tremorsense/blindsight via detection modes is best-effort — live-verify the radius detection.** Not auto-run (modifies tokens); exposed for a console call / future settings button.
- **Combat turn = active-token spotlight, zoom-out→zoom-in (DM 2026-06-27; "whole party" was a misread of the DM, reverted).** The DM's "centered on all the party" was describing a *bug* (the spotlight ending party-centred on a small/clamped scene), not a request — confirmed by "still no zoom on one player". So combat spotlights the **active token**: `tvPartyFollow` is gated off in combat; the `updateToken` route branches on `game.combat?.started` → `tvCombatFollow` (centre the active token at the spotlight zoom as it moves) vs `tvPartyFollow`. On each turn change / `combatStart`, `tvCombatTurnPulse` plays a **token-centred zoom-out→zoom-in**: phase 1 pulls back to `TV_COMBAT_OUT_FACTOR` (0.6×) of the spotlight scale over `TV_COMBAT_OUT_MS`, phase 2 pushes in to the `TV_COMBAT_RADIUS_FT` (60 ft) spotlight over `TV_COMBAT_IN_MS` (~1.5 s). Both phases centred on the active token via `tokenFrame(tokenDoc, radiusFt)` (token centre + radius scale, scene-clamped). `_tvCineSeq` guard supersedes an in-flight pulse on rapid next-turn. Vision (the POV feature) tracks the same active token. Yields to manual TV.

**Live-verify pending:** needs a display-role client — confirm (a) out of combat: the follow keeps the whole party + 40 ft buffer framed (floored at 35 ft when clustered; zoom out as they spread, in as they regroup), and Focus pure-pans (recentre, no zoom change); (b) in combat: each turn plays a whole-party zoom-out→zoom-in pulse (~1.5 s) centred on the party at the party framing (NOT the active token), keeps the party framed as tokens move, and (with `combatPovVision` on) restricts vision to the active PC's POV / shared on NPC turns.

**⏳ Round 59 (2026-06-26/27, v0.1.61 — Player-2/Testonius live test + DM batch):** Large batch from live testing as Player 2 (Testonius the Barbarian) plus DM requests.
- **Show-Players: one popup, no name (DM).** Foundry's native ImagePopout was stacking over the mod's own full-screen overlay on phones — the dialog-lift now suppresses ImagePopout (routes its image into the overlay). The overlay/emit also drop the token name (a shared image's name can spoil it — a potion labelled "Poison…"). (shell.js, dm-panel.js.)
- **Item-pile names off the TV (DM).** `setupDisplayItemPileNames()` hides item-pile token nameplates on display clients (loot/merchant names = spoiler/clutter). (main.js.)
- **DM omniscient vision on shared screens (DM, ✓ VERIFIED 2026-06-27).** World setting `dmOmniscientVision` (default ON). `setupDMOmniscientVision()` patches `Token.prototype._isVisionSource` to return false for GM-controlled tokens on the DM's OWN (non-display) client → the canvas falls back to the GM's see-everything default, so selecting a PC keeps the whole map instead of collapsing to that PC's POV. Per-client; players + the TV/display keep their (shared) vision. DM confirmed it works. (settings.js, main.js.)
- **iOS "Copy prompt" — REAL fix (DM, multi-round).** Not iOS/HTTP at all: `selectNodeContents()` on a `<textarea>` selects 0 chars (a textarea's value isn't its child nodes) → execCommand copied an empty selection; the PC only worked via the secure `navigator.clipboard`. Now copies from a **contentEditable div** (verified full multi-line capture), execCommand first in the gesture. Lesson saved to memory: instrument the failing mechanism before blaming a platform. (shell.js.)
- **Portrait: 20% inset + split portrait/token (DM).** Token disc draws the art at 80% centred (breathing room inside the ring); the upload now makes TWO images — full uncropped → actor portrait, disc-cropped → token texture (rpc saves both; back-compat for old single-image clients). (shell.js, rpc.js.)
- **Journal coloured by poster (DM).** Each note's header + a left accent use the poster's player colour (character author → owning player → `user.color`, live lookup so old notes colour too). (shell.js, shell.css.)
- **Conditions: show everything Foundry shows (DM, two rounds).** Broadened from `temporaryEffects` → all active `actor.effects` (passive Monstrosity), then → **`actor.appliedEffects`** so item-TRANSFERRED effects appear (Rage / Unarmored Defense / Danger Sense live on the feature item, not `actor.effects`, and were silently dropped). Tap-detail resolves from appliedEffects; Remove gated to actor-owned effects. (shell.js.)
- **Auto-own new PCs for the display/TV account (DM).** World setting `displayOwnerUser` (player dropdown injected at renderSettingsConfig; `init` is too early for `game.users`). `createActor`+`updateActor` hooks (executor) grant that account OWNER on any player-owned character; setting it retro-grants existing PCs (`retroGrantOwnership`). Scoped to `hasPlayerOwner` (not templates/NPCs). (settings.js, main.js.)
- **Carried weight in the Equipment header (DM).** `#carriedWeightHTML` shows current/max (icon X/Y) always — dnd5e computes value/max even when the encumbrance variant is "none" — filling the header row by the search icon. (shell.js, shell.css.)
- **changeTab unhandled rejection — FIXED (live).** ApplicationV2's reserved `tab` action fired `_onClickTab → changeTab` on the mod's own `data-action="tab"` nav buttons (no `data-group`; the mod drives tabs via `#tab`) → an unhandled rejection on every tab switch. A `changeTab` override swallows the groupless no-op call. (shell.js.)
- **Resolution-warning console copy filtered (DM).** The visible toast was already suppressed; Foundry also `console.error`s the same warning separately — now filtered (resolution message only) so it stops cluttering the console during testing. (main.js.)
- **FINDINGS — Foundry-side, NOT MC (left as-is per DM):**
  - **automated-conditions-5e errors on canvasless phone rolls** — every check/save/skill rolled ON the phone throws `dnd5e.preRollAbilityCheck: reading 'get'` (AC5E reaches for the canvas/token; phones are canvasless). The roll still completes + is correct; only AC5E's auto-adv/disadv is skipped on phone-side rolls. Attacks are unaffected (executor-routed, has a canvas). MC uses the standard dnd5e roll API. DM chose to leave it.
  - **Stack drift: midi-qol is 14.0.9 live** (CLAUDE/DESIGN pin 14.0.8); automated-conditions-5e 14.533.6.1 present. ⚠ reconcile the pin.
  - **Volatile Serum → Ferocity "broken" = homebrew item data, not MC.** The Ferocity active effect has zero changes (does nothing); using it trips a dnd5e/midi `new PlaceableObject` error — package stacks list only dnd5e 5.3.3 + midi-qol 14.0.9, no mobile-command. MC's executor path runs clean.
- v0.1.61.
- **Post-v0.1.61 follow-ups (same live session, 2026-06-27, → v0.1.62):**
  - **Rest-permission guard (shell.js `#doRest`).** Bails with a clean "You don't have permission to rest <name>" toast instead of Foundry's raw "lacks permission to update Actor" error, for when an actor's ownership drops under the shell mid-session (the DM was toggling permissions; Player 2's shell was transiently on Gunner, a Player-1 PC). The shell only navigates to owned actors, so this is the race safety net.
  - **`displayOwnerUser` label nbsp (settings.js).** Non-breaking space inside "(display/TV account)" so the setting name wraps before the parenthetical, not mid-phrase.
  - **⚠ KEY FINDING — the TV needs token SIGHT, not just ownership.** Auto-own granting the TV `OWNER` is necessary but NOT sufficient: a PC token at `sight.range: 0` reveals nothing in a dark scene even when the TV owns it. Several PCs had `sight.range: 0` while the actor carried 60 ft `senses.darkvision` — the token sight was never synced from the actor's senses (a Foundry/dnd5e gap, not MC). The effective `basicSight` range DERIVES from `sight.range` (these tokens' `detectionModes` source is empty `{}`), so the fix is simply: per PC token, set `sight.range` = max sense range + `sight.visionMode: "darkvision"`. Verified live on Testonius (effective basicSight followed `sight.range` to 60; a player CAN update their own token's sight). A GM macro syncs the whole party — provided to the DM. This is why "the TV doesn't show LOS" recurred: a dark scene exposed the missing darkvision, never an ownership failure. The onboarding flow (#11) should sync this in one click.
- v0.1.62.

**⏳ Round 58 (2026-06-25, attack-total bulletproofing + out-of-resources warn + auto-follow turn):**
- **Stale attack total ("only shows 9s") — bulletproofed (executor; needs GM reload).** `findParkedWorkflow` could return a STUCK older parked workflow (a prior attack whose damage was never rolled) for a *new* attack — especially on a MISS, where the new workflow doesn't park on damage so the finder fell back to the stuck one. Rewrote it to **snapshot midi's workflow ids BEFORE firing** (`preWfIds` in `handleItemUseStart`, passed to `findParkedWorkflow`) and only accept a **fresh** id (not in the snapshot) → it can't return a stuck older one. Replaces the prior "newest matching" heuristic.
- **Out-of-resources: warn, don't block (DM request).** An empty revolver (depleted item uses) used to hard-block with a transient toast (the block guarded against midi's executor-side "Consume?" dialog hanging the phone). Now `#pickAction` flags `depleted` instead of blocking; the action screen shows a clear **amber warning banner** (`.mc-depleted`) + the fire button reads **"Use anyway"** (`.mc-fire-warn`); firing passes `skipConsume` → the executor disables consumption (`spellCfg.consume={resources:false,spellSlot:false,action:false}` + `autoConsumeResource:"none"`) so midi never opens that dialog. "It's on them." (shell.js + rpc.js + shell.css.) **Override path needs the GM reloaded + a live check** (the consume-skip dodging the dialog is the unverified bit).
- **Auto-follow the turn (DM request — summons/familiars).** `noteCombatTurn` now switches the controller `#subjectId` to the active combatant's token when it's one THIS player owns (PC, summon, familiar, wild-shape beast) — phone clients only, active scene only, never mid-action (won't yank a parked two-tap). No more manually cycling to your summon when its turn comes up. Player-side (no executor).
- **Hide the GM's cursor, keep pings (DM request).** New world setting `hideGMCursor` (default ON). `setupGMCursorHiding()` (main.js, at ready) patches `ControlsLayer.prototype.updateCursor` to pass a NULL position for GM users — reusing Foundry's own hide-on-null teardown, no reimpl — plus `drawCursor` to skip GM cursors at initial draw. Pings live on separate methods (handlePing/drawPing), untouched, so the GM still points by pinging. Reads the setting live (toggle takes effect on the GM's next move). The GM's own client is unaffected (never renders its own broadcast cursor). Applies on each canvas client's reload; an unconditional console one-liner applies it to a running display without a reload.
- **Reactions / Fighter's Shield — RESOLVED: it WORKS; the "bug" was an observation artifact (2026-06-25).** Traced midi's reaction path end-to-end (midi-qol.js): `doReactions:"all"` → `doReactions()` pre-checks pass (playerFor=Player 1 active, not incapacitated) → the activity filter (17863+) passes Shield (reaction activation, prepared, L1 slot free, reaction unused, empty `reactionCondition` → defaults to `reaction === "isHit"`) → `requestReactions(Player 1)` → a **ReactionDialog renders on the DEFENDER's player's phone**, and the dialog-lift surfaces it. A captured-live check (CC armed a `renderApplicationV2` probe on the phone) confirms it: `lifted:true` (mc-phone-dialog, z>9999), `onScreen:true`, a clean **bottom-sheet** (rect y1115–1271 in a 1271-tall window, full width), body "Fighter L1 is hit by Revolver and can use a reaction — Attack Roll Total 21", with a **"Shield: Midi Use"** button. Why it read as broken: it appears on the DEFENDER's player's phone (correct!), NOT the GM screen — during tests the DM watched the GM screen and CC read logs, so nobody watched the right device, and midi's `reactionTimeout` (10s) auto-passed it unseen. **Real-world gotcha:** the prompt is passive + 10s, so a player not looking at their phone misses it. **Candidate polish (offered):** vibrate + sound when a reaction prompt lifts (and/or a persistent cue like the save relay) so it's not missed. The `gmDoReactions`/`enforceReactions:"displayOnly"`/`doReactions:"all"` config is all correct — no change needed.
- **Enforcer → apply-once, not police (DM 2026-06-25 philosophy call).** `checkAndPrompt` no longer shows a per-load drift dialog. New model: on FIRST activation (no backup yet) the mod applies its preset outright (one info toast; originals snapshotted for Revert); after that it NEVER touches the DM's settings — they may change anything, even things that break the phone UX (warnings-not-walls), and restore via "Reactivate Mobile Command" / "Remove & revert". This intentionally reverses the old "never write without an explicit click" stance — the DM asked for change-don't-police. Two settings ADDED to the preset (§D4) at the same time: `autoItemEffects:"applyRemove"` (phone-cast buff/condition spells actually LAND without DM hand-application) and `savesBeforeDamage:true` (targets save on their phones first, then the caster rolls). On an already-activated world those two need a one-time `MobileCommand.enforcer.apply()` (auto-apply only fires on first activation); the same call re-syncs the live `gmConsumeResource` drift ("both"→preset "none").
- **Harness note:** firing an attack into a wedged executor froze the renderer (CDP timeouts); the stuck workflow then blocks subsequent player RPCs (listTargets, etc.). A GM reload clears it. v0.1.56 (pending commit).

**🔮 Future versions — discussed feature ideas (as of 2026-06-25; the curated "what's next" list):**
1. **AI portraits — finish the flow (idea #2).** Foundation built (prompt builder + `portraitStyle` setting + generator screen + circular-mask upload via the executor to `mc-portraits/`). Future polish: regenerate, a small gallery/history, art-direction presets, body↔portrait re-crop.
2. **Familiar/summon "follow-leader" movement** — summons/familiars trail the PC's moves (pairs with the new auto-follow-turn). Likely a module integration, not custom.
3. **Resources section + tap-to-spend/restore** — a dedicated Resources surface beyond the per-row `value/max` badge; cover legacy `system.resources`.
4. **Theme picker** — selectable shell themes (DM wants this).
5. **Spellbook module support** (later version).
6. **Swipe between tabs** (nice-to-have, B2).
7. **Out-of-combat group-token movement** for the move pad (currently moves only the controlled token).
8. **Currency editing** (tap-to-edit) + item transfer between containers + capacity/weight readout.
9. **"Metallic glimmer" scroll effect** — cosmetic polish.
10. **Monetization + feedback loop** — one-time low price (no subscription) + a GitHub-issues triage loop; revisit when the DM is ready.
11. **Onboarding / first-run setup flow (DM 2026-06-27).** A guided shared-table setup — pick the display/TV account (auto-own), confirm the omniscient-vision + hide-GM-cursor toggles, and **auto-sync PC token sight from the actor's senses** (a token at `sight.range:0` despite 60 ft darkvision is blind on the TV — see Round 59) — so the DM isn't hunting through Settings. Surfaced because the TV-vision setup (account → retro-grant → connected players → token sight range) was non-obvious. Design at the UI phase.

**⏳ Round 57 (2026-06-24, player-colour rings + no-token mode + image-gen foundation):** A batch from live Player-1/Player-2 testing.
- **Player-colour token rings (idea #1):** `#applyMyTokenRing` (called each render) sets the dynamic ring on EVERY token the player owns on the active scene to their `game.user.color` — `ring.colors.ring` + `ring.colors.background` + `ring.subject.scale = 0.8` (band thickness is fixed by the "coreSteel" style, so shrinking the subject opens a colour-filled gap that reads when zoomed out). Idempotent (skips when ring+bg+scale already match), player-side (owners update their own tokens — no executor), GM/Display excluded. The shell also exposes the user colour as `--mc-user` and rings the header portrait with it (box-shadow). `0.8` is the thickness tuning knob.
- **Subject resolution fix + "no token on this scene" mode:** `get actor()`'s no-on-scene-token fallback returned the first owned character — which stranded Player 2 on "Multi" (a complete off-scene multiclass actor the switcher doesn't list). Now, for a player, it returns the first **blank/in-build PC** (`#isCharGenPC`) else **null**; null renders `#noTokenHTML` — a clear "No token on this scene" screen (player-colour badge + scene name) with a tappable list of owned characters (Build/View → `pick-offscene` sets `#subjectActorId`). GM/Display keep the old read-only fallback. Verified: Player 2 now opens on the blank "Player Character" (Create Character), not Multi.
- **Data finding (DM to fix):** Player 2's on-map token *named* "Player Character" is `actorLink:true` to the **Multi** actor (a renamed token); the real blank "Player Character" actor is tokenless. The shell shows the linked actor's name, hence "Multi" + walk 0. Fix = drop a token from the blank actor; rename/remove the Multi one.
- **Image-gen foundation (idea #2, slice 2a):** `buildPortraitPrompt(actor, {freeText, dmStyle, mode})` (exported, pure) assembles a layered AI prompt — (1) fixed framing+style that survives the circular ring crop [portrait = centred head-and-shoulders w/ headroom+margins; body = full figure, head high & clear of top, feet low], (2) DM campaign style, (3) auto race+class(+subclass)+ a standout HIGH ability → a visual cue (≥16; lows skipped), (4) player free-text last. New world setting `portraitStyle` = "Campaign visual style (AI portraits)". One image + the ring makes the token (no separate token image). **Next (2b):** generator screen (body/portrait toggle + description box + Copy prompt; entry from a char-gen step for new PCs and the header portrait for existing) + executor-routed upload to a non-module `mc-portraits/` dir.
- **Dev-loop finding:** `Data\modules\mobile-command` had become a stale plain COPY (not the symlink), so edits weren't served (stale verifications all morning). Restored as a **Junction → repo**; edits auto-load again. v0.1.55.

**⏳ Round 56 (2026-06-23, travel popup header = selected mode):** DM: the movement popup's "Movement" header should name the selected travel type. `#showTravelPicker` now sets `subtitle` to `#moveModeLabel(#activeMoveMode())` (Walk/Fly/Swim/…), falling back to "Movement" if none; since `move-mode` re-runs `#showTravelPicker`, it updates as you pick. Verified: the popup header reads "Walk" for the Druid. v0.1.54.

**⏳ Round 55 (2026-06-23, money-only loot piles hidden — DM bug):** A pile holding only currency (no items) couldn't be opened. Cause: `handleListLoot` skipped piles where `API.isItemPileEmpty(t)` is true, and Item Piles' "empty" only counts ITEMS — so a money-only pile read as empty and was never listed. Fix: compute `items = getActorItems` and `money = getActorCurrencies(...).filter(qty>0)` and skip only when BOTH are empty; also return a `money` label (`"50 gp, 3 sp"`) and show it in the row (money-only piles now read e.g. "50 gp · 5 ft", and the chest icon falls back to coins). Verified phone-side: parses, loot section renders with no regression (the stale-GM 0-item pile now shows just its distance instead of a misleading "0 items"). The money-only pile becoming listable/openable needs the GM reloaded (new scan) — DM to confirm. v0.1.53.

**⏳ Round 54 (2026-06-23, phone-side smoke test + a real bug):** Drove a full phone-side pass as Player 1 — every tab on Belnor (full caster) and the Druid, plus search drawers, long-press detail cards, Wild Shape (in-group row → browser), the summon picker (3 named creatures), and the creature card (with Traits & Actions). **Zero JS errors; no tab rendered empty.** Found one real bug: opening the **Wild Shape browser or summon picker and then tapping another tab left you stuck** on that sub-screen — `#abandonAction()` (run on every tab switch) cleared the action picker / detail card / item picker but not `#wildShape` / `#summonConfig`, and those override the tab content in `#tabContent`. Fix: `#abandonAction` now also nulls `#wildShape` and `#summonConfig`. Verified: open WS browser / summon picker → tap another tab → it closes and the tab shows; the sheet tab's token switcher + nearby finder are reachable again. (Executor-only paths — actual transform, door scan, loot window — remain the DM's to test with a reloaded GM.) v0.1.52.

**⏳ Round 53 (2026-06-23, nearby interactables — doors + active tiles):** The second half of the DM's proximity ask (D). The loot "Check what's nearby" finder now also surfaces **doors** and **active-tile interactables** the player stands next to, and operates them (a phone can't touch the canvas; the executor does it). rpc.js: `handleListInteractables` (scan `canvas.walls` for `door===DOOR` — **secret doors excluded** — within ~1 grid square via point-to-segment distance; scan monks-active-tiles tiles with a click/dblclick/manual trigger via point-to-rect, gated on the module being active) + `handleOperateInteractable` (door → toggle `ds` open↔closed, refuse `LOCKED`; tile → `TileDocument#trigger({tokens, method:"click", pt})`). Shell: the finder renders door rows ("Open/Close door", lock icon when locked) + interactable rows (`#operateInteractable` re-scans after acting so the door state updates); button relabeled "🔍 Check what's nearby". Verified phone-side: button renders, the proximity-gated loot scan returned a real adjacent pile ("Acid · 5 ft"), graceful when the executor lacks the handler. **The door scan/toggle + tile trigger need the GM reloaded** (and a canvas) — the DM's to confirm in a test game. v0.1.51.

**⏳ Round 52 (2026-06-23, creature card — add the NPC's abilities):** DM: "add NPC abilities to the long-click card." `#showActorDetails` now lists the creature's **Traits & Actions** — its `feat`/`weapon` items, each as **name (+ damage label) + enriched description** (`Promise.all` of `enrichHTML`), under a section header between the ability scores and the biography. Verified live: long-pressing Summon Beast's Bestial Air Spirit shows Flyby / Multiattack / Rend (with "1d8 + 4 Piercing"). Also cleaned the speed line to real movement modes only. v0.1.50.

**⏳ Round 51 (2026-06-23, Wild Shape + summons act like regular items — DM feedback):** Three connected asks ("why isn't Wild Shape in a group / no long-press", "summon options are non-standard", "the shapes have no details").
- **Wild Shape is now a normal Actions row.** Its only activity is type `transform` (activation `bonus`), which `#usableActivities` excluded — added `transform` to the allowlist so the feat flows into the **Bonus actions** group as a regular `.mc-action` row (icon + name + uses badge, long-press detail via its `data-uuid`). `#pickAction` intercepts a Wild-Shape `transform` tap → the beast browser. Dropped the bespoke entry bar (only the Revert banner remains). Verified: row sits in "Bonus actions", has `data-uuid`, tap opens the browser.
- **Creature detail card (`#showActorDetails`).** Long-pressing a beast/summon resolved to an NPC actor, but `#showDetails` reads `system.description` (item-shaped) → empty. Long-press now routes any resolved **Actor** to an informative card: size · type · CR, AC · HP · speed (real movement modes only), the six abilities (`.mc-abl-row`), and the biography. Verified live: Bestial Air Spirit shows Small · Beast, AC 11/HP 20, STR 18(+4)…, full description.
- **Summon picker restyled.** Profiles now render as normal **iconed rows** (`.mc-action`, the linked statblock's icon + name + "type · CR") that **tap to summon** and **long-press for the creature card** — resolving each profile's linked NPC for icon/CR/type. The chip+confirm UI is gone; slot upcast stays as chips above. Verified: Summon Beast → 3 iconed spirits, tap routes, long-press shows the stat card. v0.1.49.

**⏳ Round 50 (2026-06-23, Wild Shape polish + summon-options picker — DM feedback):**
- **Wild Shape looked off + "DM not connected" (it was).** The entry + beast rows used bespoke `.mc-ws-*` chrome; now they render as normal `.mc-action` iconed rows (the entry shows the feat's own icon + "Wild Shape · n/m uses"; beasts show the statblock icon + "Beast · CR x"). The "couldn't reach the DM client" toast was misleading — the call only *throws* when the executor lacks the handler, i.e. the **GM screen is on pre-v0.1.46 code**. Messages now say "the DM's screen needs to reload since the last update" and the transform/revert calls are wrapped in try/catch. Verified: entry renders as an iconed row ("Wild Shape · 2/2 uses").
- **Summons now let the player pick BEFORE the DM places** (answering "why hand off so early?"). The cast IS the placement and both need the canvas, so the DM still drops the token — but tapping a summon now opens a config picker: **slot level** (reusing `#spellSlotOptions`, shown only when >1 option) + **which creature profile** (from `activity.profiles`, resolving the linked statblock's name when the profile name is blank — e.g. Summon Beast → Bestial Air/Land/Water Spirit). The choices ride in `announceCast` → stored on the pendingCast → `placeCast` runs `activity.use({ spell:{slot}, create:{summons:true}, summons:{profile} }, { configure:false })` so the DM only does the placement click. Verified live on the Druid's Summon Beast: picker opens from Spells, 3 named profiles, selection toggles, confirm routes the announce. The DM-side application of the choices needs the GM reloaded to v0.1.48. v0.1.48.

**⏳ Round 49 (2026-06-23, loot finder gated to 5 ft):** Part of the DM's interactables ask (D): `handleListLoot` now only returns piles/shops the player is **adjacent to** (`distance ≤ 5 ft` via `canvas.grid.measurePath`; falls through if the player's token can't be placed). The bigger half of D — detecting **doors and other interactables** (levers/active-tiles) within 5 ft and operating them — is the next focused build (executor-side wall/door scan + `ds`-state toggle; players can't update walls so it routes through the executor; levers are module-specific via monks-active-tiles). v0.1.47.

**⏳ Round 48 (2026-06-23, Wild Shape — Druid shape-change via the executor):** The DM connected a test Druid ("druid", lvl 7, on-scene). Investigation settled the design: a Player can't transform (dnd5e `allowPolymorphing` is off + actor-creation is GM-only — `canCreateActor:false`), so the **executor drives dnd5e's real transform**. API confirmed from source: `Actor#transformInto(source, settings, {renderSheet})`, revert is `Actor#revertOriginalForm()`, detection is the `isPolymorphed` getter, and the settings are `new dnd5e.dataModels.settings.TransformationSetting(CONFIG.DND5E.transformation.presets.wildshape.settings)` (verified to keep bio/class/feats/hp/mental, merge saves/skills, Moon AC/HP formulas). New rpc.js handlers: `wildShapeList` (beasts from `dnd5e.monsters`, type=beast, `cr ≤ maxCR`, sorted by CR — 98 total) + `wildShapeInto` (transform + spend a Wild Shape use) + `wildShapeRevert`. Shell: a **"Wild Shape n/m" entry** on the Actions tab (matched by feat name `/wild\s*shape/i`), a beast **browser** (reuses the search drawer, shows CR; default cap `max(1, floor(druidLevel/3))` — generous Moon default, DM approves beyond), a **"Revert to your true form"** banner when `isPolymorphed`, and an `updateToken` hook so the phone follows the token's actor swap. Verified locally: phone UI (entry shows "2/2" on the Druid, browser opens, list call fails gracefully against a stale executor — no hang) + the executor logic read-checked (beast filter, settings construction, method names). **The actual transform/revert is the DM's to confirm on Sqyre** — the local GM client has stale rpc.js (can't be reloaded from here) and a Player can't run the transform. v0.1.46.
- **(A) Actions split.** Within each economy group (Action/BA/Reaction/Free) the character's OWN actions (features, class abilities, spells) now list first, then a **"From items" divider** and the item-derived actions — those duplicate the Equipment tab, so they read as secondary. Discriminator: a physical item has `system.quantity`; features/spells don't. Divider only shows when a group has both. Verified on Belnor (3 groups split).
- **(B) Search drawer.** Replaced v0.1.44's always-on spell input with a **magnifying-glass toggle** in each tab header (Spells/Equipment/Actions) that opens a search drawer. Generalized `#filterSpells` → `#applySearch`: hides any `[data-search-name]` row not matching + any `.mc-search-group` with no visible row, via DOM toggle on `input` (no re-render → keeps focus). All three tabs' rows carry `data-search-name`; groups are `.mc-search-group`-wrapped; the Actions accordion **force-expands** every group while a query is active. Search resets on tab switch. Verified on Belnor across all three: toggle present, "fire"→Fireball / "sword"→Greatsword / "magic"→Magic Missile, empty groups hidden, focus kept, full restore on clear. v0.1.45.

**⏳ Round 46 (2026-06-23, Spells tab — live search for big spellbooks):** Scrolling a high-level caster's spellbook on a phone is slow; the in-play Spells tab had no filter (only char-gen did). Added a **live name search** that appears once the (non-cached) spellbook exceeds 6 spells. Each `.mc-spell` row carries `data-spell-name`; each level is wrapped in `.mc-spell-section`; `#filterSpells(q)` toggles `.mc-hidden` on non-matching rows and on any section left empty. It filters via **DOM toggling on `input` (no re-render → the box keeps focus mid-type)**, persists `#spellQuery`, and is re-applied from `_replaceHTML` after actor-driven re-renders. Verified locally on Belnor's real rendered rows: all rows carry the attribute, "blade" narrowed to "blade ward" with the 2 empty sections hidden, clearing restored all 6, and the box correctly stays hidden under the 6-spell threshold (no on-scene caster >6 was reachable to exercise the live box itself, but the algorithm/attrs/negative are confirmed and the input wiring is trivial). v0.1.44.

**⏳ Journal v2 — multi-page, with images + pinch (DM 2026-07-25, BUILT, verified as a player):** The
flat note list became a **cover → page → entries** book (DM's spec). Model: the same `partyJournal`
JournalEntry (default:OWNER), but a user-facing **page** is a `JournalEntryPage` flagged `mcPage`, and
its **entries** live in a `flags.mobile-command.entries` array (`[{id, text, img, by:{id,name,color},
ts}]`); the entries are mirrored into the page's own `text.content` so Foundry's journal sheet reads too.
- **Cover** — a titled list of page cards (entry count + last-touched, tinted by the last editor's
  colour, image-badge if any entry has a picture) + a "new page" composer. **Page** — back button,
  **editable title**, the entries (text ± one image, each tinted by its last editor), and a composer.
- **Images.** An entry can carry one image. The path in: the DM's "Show Players" image now has an **Add
  to journal** button → stashes the src as a pending attachment, jumps to the cover ("pick a page"),
  and the chosen page's composer shows the preview → save writes an image entry. Tapping any entry image
  opens the **fullscreen pinch viewer** (the Phase-1 `.mc-imgpop-img` controller — pinch/drag/wheel).
- **Permissions (DM's rule).** Any player adds pages and adds/edits entries — an edit **re-colours the
  entry to that editor** (`by` = current user's name+colour). Only the **GM** removes an entry in-app;
  **page deletion is DM-only, via Foundry's own journal UI** (no in-app page delete). Writes are DIRECT
  (players own the entry); only first-time entry creation calls the new `partyJournalEnsure` executor RPC.
- **Legacy flat notes** (pre-2026-07-25, no `mcPage`) are **left untouched** (never deleted) but not
  shown by the new UI — no auto-migration (test-world call; revisit if the DM wants the old log carried in).
- **Verified live as Player 1:** create page → opens; add text entry (shows actor name + time + player
  colour); rename page; edit entry; Show-Players image → Add to journal → cover banner → pick page →
  pending preview → image entry saved; tap image → fullscreen → pinch scale(2.5); Foundry persistence
  (entries flag + text mirror) confirmed; no console errors. **Unverified:** two-client live (one player
  edits another's entry → colour flips) — needs a second client; the logic is symmetric.

**⏳ Round 45 (2026-06-23, party journal — players write DIRECTLY via entry ownership):** DM asked whether a player-owned "Party" *folder* lets players create journals, and whether the module can own the setup. Verified the Foundry 14 permission model in-world: (1) creating a top-level `JournalEntry` is **role-gated** (`game.permissions.JOURNAL_CREATE` = roles [Trusted=2, Assistant=3, GM=4]); a plain **Player (role 1) can't** create entries, and **folder ownership does not change that**. (2) BUT a player who **OWNS an entry can append pages to it directly** — confirmed by probe (Player 1 created a `JournalEntryPage` on an entry it owns; embedded-create is governed by parent OWNER, not the world permission). So the right lever is **entry ownership, not the folder**. Change: the executor now creates the Party Journal entry with **`ownership.default = OWNER`** (was OBSERVER) and drops it into an existing "Party" folder if the DM made one. The phone's `#postJournalNote` now appends the page **directly** (`#addJournalPageDirect`) when it owns the entry — no GM round-trip, works even if the executor is briefly offline — and only falls back to `rpc.partyJournalAdd` to CREATE the entry the first time. So: the DM's "Party" folder isn't what enables writing (it's tidy + grants read), the module owns the setup, and players author straight from their phones. v0.1.43.

**⏳ Round 44 (2026-06-23, overnight — shared party journal, an MVP goal):** The Journal tab was a Phase-4 placeholder; now it's real, delivering the stated goal "write to a shared party journal". `#journalHTML` reads a module-owned "Party Journal" `JournalEntry` (flagged `flags.mobile-command.partyJournal`) and lists its pages newest-first by a `ts` flag, plus a composer. Players OBSERVE the entry and read it directly, but can't author on it — confirmed locally (Player 1: "lacks permission to create JournalEntry") — so `#postJournalNote` routes to executor `handlePartyJournalAdd`, which find-or-creates the entry (default OBSERVER so all players read) and appends a timestamped, HTML-escaped text page. `#onInput` stashes the composer draft across the shell's frequent re-renders (no re-render → no focus theft); a `createJournalEntryPage` hook re-renders for live updates (incl. other players' notes). Verified locally: tab renders (composer + empty state), input works, Post routes and fails gracefully with the draft preserved when no executor is connected; the executor-side create needs a GM-connected world (Sqyre). **Wild Shape was investigated and deliberately deferred** (see MORNING_REPORT): dnd5e 5.3.3 has `transformInto` + Wild Shape presets, but it *modifies actors*, needs GM perms, and the shape-source + CR-rules + revert flow are unverifiable/under-specified — too risky to automate unsupervised; wants a design pass with the DM. v0.1.42.

**⏳ Round 43 (2026-06-23, DM batch — off-map PCs, NPC hit dice, animated theme bgs):** Three reports (loot confirmed working by the DM):
- **Off-map PCs cluttering the switcher.** `#subjects()` listed *every* owned-but-off-map character for a player (the broad `!game.user.isGM` form). Now off-map PCs appear only if **incomplete** (`#isCharGenPC`) OR the pinned just-finished subject — so a player who owns several PCs sees only in-play tokens + blanks-to-build, not their whole roster.
- **Owned NPC summons show 1/1 hit die.** Diagnosed, NOT a shell bug: the shell reads `actor.system.attributes.hd` and a real NPC (Andrella, CR 4) returns 10/10 through it. So a summon's 1/1 is its own statblock data (summoned actors often get HD unset/1), not mobile-command. Asked the DM to confirm on the summon's Foundry sheet; will fix the shell instantly if Foundry shows a different value than the phone. No code change.
- **Animated theme backgrounds** (DM request, perf-gated). Non-default themes only: a single `::after` overlay animating ONLY transform (slate **snow**) or opacity (ember **glow**, arcane **motes**) — GPU-composited, no JS/particles, one tiled gradient; content lifted to z-index:1; wrapped in `@media (prefers-reduced-motion: no-preference)`. Default theme stays flat. Verified locally: CSS loads, overlay renders subtly with content readable above it, and motion correctly suppresses under reduced-motion (which the automation browser had on). v0.1.41.

**⏳ Round 42 (2026-06-23, Item Piles merchants/shops — same plumbing as loot):** The open path (`renderItemPileInterface`) is type-agnostic — it opens whatever the pile is (loot / merchant / vault) — so supporting **shops** is just no longer excluding them. `handleListLoot` now includes piles where `isItemPileMerchant || isItemPileLootable` (was loot-only + an explicit merchant skip): merchants tagged `kind:"merchant"`, closed shops skipped (`isItemPileClosed`), and a merchant is listed even when "empty" of stock (you can still sell to it) whereas empty loot is hidden. Shell `#lootHTML` renders merchant rows distinctly (🛒 + "Shop" + gold accent); the button is now "🎒 Check for loot & shops nearby". Tapping a shop opens Item Piles' real **merchant buy/sell** window on the phone (prices/currency/sell-tab all Item Piles; purchase GM-brokered like a take). Verified locally: parses, button text updates, no errors (no merchant in the local world → scan + merchant-window render are Sqyre's to confirm). v0.1.40.

**⏳ Round 41 (2026-06-22, display override — diagnosis + GM-account warning, NOT a vision reimpl):** DM's "how is a player seeing DM data?" → it isn't: the TV was logged into the **GM account** ("Michael [GM]"), and Foundry shows GMs everything (through walls, hidden tokens, no fog). `isDisplayClient()` is just mobile-command's `role==="display"` setting — independent of the login. The clean fix is **account-based**, not a code vision-override: log the screen into a **non-GM player account that owns the party** → it renders the *combined party vision* (fog + hidden tokens). For finer control (combined/selected POV, follow), **monks-common-display v14.01 is installed** and is the purpose-built tool (it switches the canvas to "view as" a player); reimplementing that in mobile-command would duplicate it and be fragile, so we don't. What we DID add (main.js): `warnDisplayGM()` — when `isDisplayClient() && game.user.isGM`, a persistent dismissible amber banner + console.warn explaining the GM-vision problem and the fix, so the silent mistake the DM hit becomes obvious. Verified locally: module loads clean; banner self-gates off on non-GM/non-display clients. v0.1.39.

**⏳ Round 40 (2026-06-22, Item Piles loot — nearby-pile list + open on the phone):** A phone has no canvas, so a player can't double-click an Item Pile to loot it. Rather than reimplement Item Piles' loot UI, we drive its OWN: the executor (canvas + Item Piles `game.itempiles.API` v3.3.2) lists nearby lootable piles, and tapping one calls `API.renderItemPileInterface(pile, { userIds:[player], inspectingTarget: playerActor })` — Item Piles renders its real loot window **on the player's phone**, which the existing dialog-lift surfaces. All take/currency/transfer logic stays in Item Piles. New: rpc.js `handleListLoot` (scan `canvas.tokens` for `isValidItemPile && isItemPileLootable && !isItemPileEmpty`, skip merchants, return `{uuid,name,img,itemCount,distance}`) + `handleOpenLoot` (renderItemPileInterface targeted at the requesting user); both self-gate on `isExecutor` only (looting is fine while paused). Shell: a **"🎒 Check for loot nearby"** section in the Explore tab (`#lootHTML`/`#refreshLoot`/`#openLoot`, `#nearbyLoot` state). Verified locally: parses, the button renders, a tap degrades gracefully to "No loot nearby" with no errors (the local world has no piles + Player 1 has no canvas — the scan, remote render, and lift are Sqyre's to confirm: needs a pile in the scene + the GM/executor on it). v0.1.38.

**⏳ Round 39 (2026-06-22, dialog watchdog — executor-side stranded-prompt alerts):** Reactions/saves/config prompts that open on the *phone* are handled by `liftDialogAboveShell`, but a prompt that opens on the **executor** (the DM screen) — a forced consumption/ammunition/roll-config dialog midi couldn't fast-forward — is unreachable from the phone and hangs the player silently (the empty-revolver "Consume Item Use?" pop-up). New executor watchdog (rpc.js): `markPhoneAction(name, requesterId)` arms an 8 s window at the top of `handleItemUse`/`handleItemUseStart`; `registerDialogWatchdog()` hooks `renderApplicationV2`+`renderApplication` and, if a blocking prompt (DialogV2 / legacy Dialog / dnd5e config-usage-consume-ammo by class-name) renders inside that window, it (1) logs + raises a **permanent DM notification** naming the action and the prompt, and (2) `executeAsUser("watchdogPing", requesterId)` so the **player's phone shows "waiting on the DM"** instead of a frozen UI. Alert-only (no auto-click — too risky to guess the button). Wired on ready in main.js next to `registerSaveRelay`. Verified locally: module loads clean, the prompt predicate matches a real `DialogV2`, and it self-gates off on non-executor clients (full executor flow is Sqyre's to confirm — reload the GM/executor tab). v0.1.37.

**⏳ Round 38 (2026-06-22, DM presence widget — wrong names + phones shown absent):** DM report: "aslan and multi appear in the widget (aslan is even marked as connected!), but they are not in the scene." Two bugs in the DM-panel presence row (`dm-panel.js`, `statusHTML`), both confirmed live against the local world:
- **Misleading labels.** `playerLabel` fell back to the *first owned character* for a user with no assigned PC — but the test/utility accounts own the whole party, so Player 1 (owns 9) rendered as "Aslan Fang", Player 2 (owns 2) as "Multi", even the TV (owns 4) as "Belnor Brightshield". Fix: only collapse to a character name when it's the user's assigned PC or their **sole** owned one; otherwise show the **username**. Now: Player 1 / Player 2 / TV.
- **Phone players shown as absent.** Green/amber keyed on `viewedScene === activeScene`, but a phone is canvasless (D2) so its `viewedScene` is `null` → every actively-playing phone (the module's whole point) showed **amber "on a different scene"** = looked not-in-the-scene. Fix: an active client with `viewedScene == null` is a present phone → green ("connected (phone)"); amber is now reserved for a desktop on a genuinely different scene. Verified by replaying the new logic: Player 1 → green "connected (phone)", Player 2 → gray "Offline", TV → green "on the active scene". (Couldn't reliably hide the TV/display account — the `role` setting is client-scoped, unreadable by the GM; left for later.) v0.1.36.

**⏳ Round 37 (2026-06-22, reactions — V1 dialog lift coverage):** Investigating "reactions aren't routed to phones" revealed they mostly already are: midi requests a reaction by `socketlibSocket.executeAsUser("chooseReactions", player.id, …)` on the *player's own* client (the phone), which opens midi's reaction **dialog** there — and `liftDialogAboveShell` already restyles+lifts dialogs over the shell (its comment even names "reactions"). The gap: that hook was only on `renderApplicationV2` AND bailed unless `app.element instanceof HTMLElement`, so any **legacy V1 dialog** (jQuery `.element`) stayed hidden under the shell and timed out unanswered. Fix (shell.js): unwrap V1's jQuery element (`app.element?.[0]`) and also `Hooks.on("renderApplication", liftDialogAboveShell)`. Verified locally: a V1 `Dialog` now gets `.mc-phone-dialog` and z=10002 (above the shell). So reactions are now **verify, not build** — confirm a reaction pops as a bottom-sheet on the phone in a live game. v0.1.35.
- **Test-rig note (DM):** Foundry is one session per user, so a single player account can't be BOTH the phone and the TV. To test phone features (reactions/saves/actions) you need the **GM connected as the executor** + a **non-GM player account on the phone** (the relays target non-GM owners). The TV is a *separate* non-GM account, and isn't needed to test reactions.

**⏳ Round 36 (2026-06-23, revolver/reload stuck — three connected fixes, DM/Sqyre):** A player out of bullets got stuck: an empty revolver (its **item uses** — a resource, not ammunition) forced a "Consume Item Use? (0 available)" dialog **on the executor** that the phone can't reach → hang. Three fixes (shell.js):
- **Generic out-of-RESOURCES guard** (`#pickAction`): before firing, if the activity spends a depleted limited resource (itemUses / activityUses < needed), warn "out of resources — recover it before using" and don't fire. Deliberately resource-generic, NOT ammo-specific (DM: "it's resources not ammo").
- **"Roll damage" safeguard** (`#fireAction`): only show the damage step when the activity actually has damage (`hasDamage = activity.damage.parts.length > 0`). Reload (a utility activity, no damage) was wrongly prompting "Roll damage"; now it can't, and if the executor parked a workflow anyway it's cancelled (no orphan).
- **Favorites are multi-activity-aware** (`fav-act`): a favorite carries only ONE activity (the "midi action"), so a multi-activity item (revolver = Attack + Reload) had Reload unreachable from its favorite. Now tapping a favorite whose item has >1 usable activity opens that item's activity picker (jumps to Equipment) — Reload reachable. (DM insight: "the favorite isn't replicating the equipment item, just the midi action — explains a few bugs.") Verified: parses, normal attack flow intact; revolver-specific cases are Sqyre's to confirm. v0.1.34.

**⏳ Round 35 (2026-06-23, TV: show GAME PAUSED + the "GM view on the TV" diagnosis — DM photos):** (1) **Pause on the TV — FIXED (CSS):** the clean-display rule (`body.mc-clean`) hid `#pause` along with all other Foundry UI, so the shared display never showed GAME PAUSED. Dropped `#pause` from the hide list (kept like `#board`) so players at the table see when the DM pauses. (2) **"GM view on the TV" (see-through walls, diagonally-striped hidden tokens, lit dark areas, journal note pins) — NOT a code bug:** it's because the TV browser is logged into a **GM account** (the DM's photo shows `Michael [GM]`). Foundry always shows GMs everything; `mc-clean`/`mc-display` only hides the UI chrome, it does NOT change vision. **Fix is account-side:** run the TV as a dedicated **non-GM user** (a trusted-player "TV"/"Display" account with Observer on the PCs → it shows the party's combined vision: fog of war, walls block, hidden tokens hidden, GM-only note pins gone). The local test world already does this (a dedicated "TV" user + monks-common-display for combined vision). Possible future code option: a mobile-command "display vision override" so a GM-account TV can still render player vision — deferred. v0.1.33.

**⏳ Round 34 (2026-06-23, attack adv/dis hint RE-ENABLED with a hidden pre-roll — DM: "it's one of the most important features, worth the double-roll"):** Investigation conclusions: (a) reimplementing the rules is hopeless (Lucky + cursed prone target + feat + potion); (b) dnd5e's BASE `rollAttack` aborts cleanly (no dice/chat/error) but AC5E does NOT compute through it — AC5E's attack eval is wired to **midi's** roll specifically (`ac5e.evaluationData` only gathers context, not the verdict; the `preRollAttack` hook reads a full dnd5e config + AC5E's private deps — not callable standalone); (c) so AC5E's answer **requires midi to roll** → that roll is the visible double-roll. **Decision (DM): hide the pre-roll** rather than drop the feature. `handleAttackPreview` (rpc.js) now: targets the chosen tokens (v14 `token.setTarget`, the old `updateTokenTargets` was removed — that was also a live bug), runs the midi pre-roll WITHOUT aborting (the abort never worked), and suppresses it — `Hooks.on("diceSoNiceRollStart", ()=>false)` kills the 3D dice, `rollMode: BLIND` keeps the card GM-only, and any throwaway chat message is deleted in `finally` (targets restored there too). **Players never see it** (phones hide chat + have no canvas/DSN/AA); the TV is the only place a residual could flash. Captures AC5E's `{advantageMode, subject/opponent advantage|disadvantage}` → `{mode, reasons[]}`; the phone pre-selects the recommended button and **lists the named causes** (`.mc-rec-reasons`) — the transparency Foundry lacks ("Advantage — Target Prone; Disadvantage — Poisoned"). **Experimental + DM-accepted:** worst case degrades to the old visible double-roll. **Can't fully verify locally** — a bare pre-roll does nothing on midi 14.0.8 here vs a real roll on the DM's 14.0.9; phone side verified graceful (no errors, buttons intact, hint absent without an executor). Real check = Sqyre. v0.1.32.

  - **⏳ 2026-07-17 (v0.1.233) — the hidden pre-roll HUNG on an unseen target; both paths fixed.** DM-reported: aiming a DM-assigned attack at an NPC the PC can't see popped midi's **Attack-Roll dialog on the executor**, and clicking Normal did nothing. Repro'd live (AC5E 14.533.9, midi 14.0.11, `visibilityChecks:true`): AC5E turns *unseen attacker/target* into an **optin** entry and its `forceDialogConfigureForOptins` **overrides our `configure:false`**, forcing the dialog. `handleAttackPreview`'s throwaway then `await`ed a roll stuck behind that dialog → **4 s hang, no pre-roll returned** ("clicking Normal did nothing" = the throwaway's discarded result). Fix, verified live on BOTH the preview and the real fire: a `dnd5e.preRollAttackV2` listener that runs AFTER AC5E and **sets `dialog.configure`/`config.dialog.configure` back to false** — undoing AC5E's force, keeping its computed `advantageMode`. Chose this over `return false` deliberately: Rounds 31/34 proved the abort is ignored on a midi-wrapped roll (phantom die). Applied in `handleAttackPreview` (throwaway now completes silently — verified 39 ms, 0 stray messages, mode `normal` = adv+dis cancel) and via `suppressAc5eAttackDialog()` around `completeActivityUse` in `handleItemUseStart` + `handleItemUse` (fire shows **no dialog**, real attack total resolves). Executor-reload gated.

**⏳ Round 33 (2026-06-22, DM-panel quick HP — autonomous):** Added a **Damage / Heal** control to the DM panel ([dm-panel.js](scripts/dm-panel.js)) that appears whenever the DM has token(s) selected — an amount field flanked by a red Damage and green Heal button, applied to every controlled token's actor (`applyHpDelta`: damage eats temp HP first, both clamp to [0,max]; a direct `actor.update` rather than a version-fragile `applyDamage`). Re-renders on `controlToken`. Lets the DM whittle NPC HP without opening a sheet. Verified live as Gamemaster: select Gelatinous Cube → Damage 10 (36→26) → Heal 10 (→36 restored). v0.1.31.

**⏳ Round 32 (2026-06-22, theme picker — DM-requested "theme picker", §7.2/§12 deferred item):** Added an **Appearance → Theme** picker at the bottom of the Details tab (above Leave / Log out). Four dark variants — **Tavern** (default gold), **Slate** (steel-blue), **Ember** (warm orange), **Arcane** (violet) — each a `body.mc-theme-<id> #mobile-command-shell { … }` block that re-tints the shell's CSS vars (`--mc-gold` accent, `--mc-panel/-2`, `--mc-edge`, `--mc-primary*`) and the background gradient; text (`--mc-ink`) and the semantic HP-green/damage-red stay put. Choice is **per-device** (`localStorage["mc-theme"]`), applied as a body class in `_replaceHTML` each render (`#applyTheme`) and on `set-theme`. No light theme yet (the shell has scattered hardcoded darks — a clean light pass is a bigger job). Verified live: each theme swaps `--mc-gold` + the accent across the Lvl button / skill dots / star (Slate screenshot), persists, and reverts to Tavern. v0.1.30.

**⏳ Round 31 (2026-06-22, attack rolled TWICE — §14 attack-preview disabled, DM/Sqyre live):** Every attack from the phone rolled two dice, with an AutoAnimations error each time (`getTokenFromItem` → `null.id` in `criticalCheck`, during `MidiAttackActivity.rollAttack`). **Root cause: the §14 attack adv/dis hint.** `#refreshAttackPreview` (shell.js) called `rpc.attackPreview` on every targeted attack, and `handleAttackPreview` (rpc.js) read AC5E by calling `activity.rollAttack({}, {configure:false}, {create:false})` and returning `false` from a one-shot `dnd5e.preRollAttackV2` listener to abort it. That abort works for a bare dnd5e activity but **NOT for a MIDI-wrapped one** — midi's rollAttack ignores the hook's false return and rolls a REAL attack (the phantom second die), and AutoAnimations hooks that phantom roll and throws on its missing token. §14 explicitly flagged this clean-abort as *unverified without a GM client* — the live test disproves it. **Fix: disabled the preview on BOTH sides** — `#refreshAttackPreview` no longer calls the RPC (just clears `s.recommendation`), and `handleAttackPreview` returns `{mode:"normal"}` immediately without rolling (defends against a not-yet-updated phone). The phone's own adv/dis buttons still let the player choose; checks/saves keep AC5E's recommendation via the native dialog. **§14 attack hint needs a NON-rolling AC5E read (path #2/#3) before re-enabling.** Verified the attack target picker still renders + targets select with no errors (preview gone). v0.1.29. (The "−"/double-roll were related as the DM suspected — both touched the attack-resolution path; the "−" was the stale-executor −100 placeholder, fixed earlier; this was the extra die.)

**⏳ Round 30 (2026-06-22, autonomous batch — "Show Players" on phones + favorite skills/tools):**
- **"Show Players" images reach the phone.** The shell hides native windows (`body.mc-clean .application:not(#mobile-command-shell)`), so Foundry's `ImagePopout` from a DM "Show Players" never appeared on a phone. shell.js now listens to the core `shareImage` socket and mirrors it into a full-screen overlay (`#sharedImage` + `#sharedImageHTML`, `showSharedImage()`, action `shared-img-close`; respects an explicit `users` allowlist). The DM panel ([dm-panel.js](scripts/dm-panel.js)) also gained a **Show players** button (image icon by the pause toggle) that shares the **selected token's** art via `game.socket.emit("shareImage", …)`. Verified live (Player 1): `showSharedImage` renders the overlay (image + title + ✕). **DM-button → phone reception is the standard socket path; verify with a real two-client share.**
- **Favorite skills & tools from the phone.** `#favoriteRow` already RENDERED `type:"skill"|"tool"|"item"` favorites, but only activities could be ADDED. `#showCheckDetails` now sets `favType`/`favId`/`isFav` (skill/tool key) so the long-press check card shows the ★ toggle — reusing the existing `detail-fav` handler (`addFavorite({type, id:key})`). Items were already favoritable (the item detail card sets `favType:"item"`, `favId:rel` when no activity). So favorites are now complete: activities + items + skills + tools. Verified live: long-press Acrobatics → ★ → "Acrobatics +1" appears in the favorites container; removed cleanly. v0.1.28.

**⏳ Round 29 (2026-06-22, DM-panel maturing — DM request "mature the DM side widget"):** Grew the executor-side `#mc-dm-panel` ([dm-panel.js](scripts/dm-panel.js)) from camera/assign/cast-only into a small DM console. Added three sections, all built on stable core APIs and verified live by logging the LOCAL world in as Gamemaster (CC normally drives Player 1):
- **Pause toggle** (`data-action="pause"` → `game.togglePause(!game.paused,{broadcast:true})`) — the pause-guard freezes player actions, so this is high-frequency; button lights gold when paused. Re-renders on the `pauseGame` hook.
- **Presence lights** — a chip per non-GM user (label = assigned/owned character, else user name) with a status dot: **green** = active & viewing the active scene, **amber** = connected but on a different scene (won't see the camera/combat), **gray** = offline (`u.active` + `u.viewedScene === scenes.active.id`). Re-renders on `userConnected`/`updateUser`.
- **Combat control strip** (only when `game.combat` exists) — pre-start: Roll all + Start (`rollAll`/`startCombat`); started: ◀ prev / 🎲 roll remaining NPCs / 🏁 end / ▶ next (`previousTurn`/`rollNPC`/`endCombat`(core's own confirm)/`nextTurn`), with a "R{round} · {current combatant}" readout. Re-renders on `updateCombat`/`deleteCombat`/`combatStart`.
Verified live as GM: all three render; pause toggles + lights; next/prev advance/rewind the turn (R4→R5→R4). The rest use the same stable `Combat` methods. **Deferred:** "Show players" image push (needs a phone-side full-screen overlay since the shell hides native windows — pairs with the existing `#imagePopup`); undo-last-workflow. v0.1.27.

**⏳ Round 28 (2026-06-21, revolver/ammo dialog stalls mobile — DM report):** Attacking with an ammo-consuming revolver popped a midi "use the resource?" dialog **on the executor (DM) but not mobile → timeout**. Root cause traced in installed midi 14.0.8 source: the `confirmAmmunition` getter (midi-qol.js:9764-65) returns `confirm:true` for an auto-selected ammo when `gmConfirmAmmunition` is set (the executor is a GM, so the *gm* flag governs), and `MidiActivity.rollAttack` then **forces `dialog.configure=true`** (:9489-91) — overriding the `{configure:false}` we pass in `handleItemUseStart`. The forced dialog renders on the headless executor, the player can't answer, and the parked workflow times out. **Fix:** add `confirmAmmunition:false` + `gmConfirmAmmunition:false` to the D4 preset (preset.js / §D4 table) so the Settings Enforcer guarantees them off (same shape as `consumeResource`/`gmConsumeResource`). midi's defaults are already false, so the Sqyre world must have one flipped on. **Not reproducible on the clean local world (no firearm exists there) → verify on Sqyre with the revolver after the DM re-applies the preset.** v0.1.26. (Distinct "ammo required but none on the sheet" path at :9761-63 still warns regardless — weapon-data issue, out of scope.)

**⏳ Round 27 (2026-06-21, TV zoom control — DM request):** Added **zoom-in / zoom-out** buttons to the DM panel's always-on camera bar (`dm-panel.js`, `cameraBarHTML` → `data-cam="zoom-in"/"zoom-out"`, FA `magnifying-glass-plus/minus`), beside Focus + Manual. They call `MobileCommand.tvZoom(factor)` (1.25 / 0.8). New `tvZoom(factor)` in `main.js` broadcasts `{cmd:"zoom",factor}` over the existing TV socket; the display client's `onTvControl` zooms around its **current centre** (`canvas.animatePan` keeping pivot, new scale clamped to min/maxZoom). **Not gated on manual mode** — a direct nudge of the TV's zoom without taking over its pan; `game.socket.emit` doesn't echo to the sender, so a display never double-applies. Exposed on `globalThis.MobileCommand.tvZoom` so a Stream Deck macro can call it (matching the P/M keybinding pattern; no default key bound to avoid hijacking the DM's own canvas zoom). v0.1.25. **Live-verify pending:** needs a display-role client connected to see the TV actually zoom (function loads + broadcasts cleanly on the player client).

**⏳ Round 26 (2026-06-21, combat-identity bug batch — DM report):** Three issues from one report.
- **Duplicate NPC initiative + End-turn regression (FIXED, shell.js).** Selecting one NPC and rolling rolled *every* token of that NPC. Root cause: `#initPromptHTML` + `#rollInitiative` matched combatants by `actor.id`, and unlinked NPC tokens share one base actor — so the GM's one selection matched all its combatants. New `#myCombatants()` is the single source of truth, used by initiative, the init prompt, and the Turn HUD. **Caveat learned live:** a first pass scoped purely by token (`c.tokenId === originTokenId`) — but PC combatants here are **actor-linked with `tokenId: null`** (Belnor's combatant had no token), so that compare excluded the player → **End turn stuck disabled + initiative re-spawned a dupe** (DM-reported same day). Final rule: a **token-linked** combatant matches only its own token (precise for multi-token NPCs); an **actor-linked** one (null tokenId) matches by actor. `#turnHudHTML` "Your turn"/End-turn now asks "is the current combatant one of `#myCombatants()`" (was actor-id → lit for every token of a multi-token NPC; then the null-token regression). Verified live by replaying the filter against the encounter: End turn disabled on the Cube's turn, enabled on Belnor's.
- **Attack shows "—" on phone, "14" in DM chat (NOT a code bug — executor reload).** The phone already guards midi's −100 placeholder → "—" (shell.js:2709). `resolveAttackTotal` (rpc.js, Round 22) prefers `wf.attackRoll.total` (= the chat 14), but **rpc.js handlers run on the executor and only update after the DM/Gamemaster client reloads** ([[executor-reload-for-rpc]]). A stale executor returns −100 → phone renders "—". Remedy: reload the GM tab (and after shipping, reload it for the release). No code change.
- **Movement counter vanished / too small (FIXED, shell.js + shell.css).** The ft readout lived only in transient DOM (`#move` set `data-role="move-note"` directly), so the frequent combat re-renders (`updateCombat`/`updateCombatant` → `render()`) wiped it — "worked for a little while then gone". Now persisted in `#moveBudget {text,cls}`, rendered by `#moveHTML`, cleared on turn change (`noteCombatTurn`) and subject switch (`#cycleSubject`). Per DM: moved the readout **above the D-pad (over the Up key)** and enlarged it (13px→19px, weight 800) so the thumb no longer hides it. (Live-drag movement reflecting on the phone was considered, deferred — "good enough for now".) v0.1.24.

**⏳ Round 25 (2026-06-21, char-gen escape hatch — switcher in the build header):** Bug found live (Player 1 cycling the §7.1 subject switcher): a blank/char-gen PC routed to a **switcher-less view**, dead-ending the cycle with no way back to the player's real characters. The start screen (`#charGenStartHTML`) already carried `#tokenSwitcherHTML()`, but the **build workspace** (`#charGenHTML` → `#charGenHeaderHTML`, shown once a blank PC is flagged `flags.mobile-command.charGen` mid-build) did not — and the pickers (`#charGenPickerHTML`/`#spellPickerHTML`/`#equipPickerHTML`/`#abilityPanelHTML`) only have a Back button to that workspace. Fix (shell.js): moved `#tokenSwitcherHTML()` **into `#charGenHeaderHTML`** (the header shared by start + workspace) and dropped the now-redundant explicit call in `#charGenStartHTML`. So every char-gen hub view shows Prev/Next, and any picker is one Back tap from it — a player is never trapped on a char-gen PC. `#cycleSubject` already `#abandonAction()`s and leaves `#charGen` seated (resumable), and switching to a non-matching actor falls through to the normal sheet, so the build state survives the round-trip. Reuses the existing `.mc-tokensw` markup/CSS (no style changes). v0.1.23. **Verify live:** Player 1 cycles onto a flagged blank PC's workspace → switcher present → Next returns to a real PC.

**⏳ Round 24 (2026-06-20, char-gen ability-score methods — BUILT, UNTESTED):** The char-gen ability panel (`#abilityPanelHTML`, shell.js) gained a method picker — **Point buy** (existing 27-pt ±), **Standard array** (`[15,14,13,12,10,8]`), and **Roll** (4d6-drop-lowest ×6, `#roll4d6dl`). Array/roll use an assign model: a fixed value **pool** (`#charGen.pool`; rolled values cached in `#charGen.rolled` so toggling array↔roll doesn't bleed) mapped one-per-ability via `#charGen.assign` (ability → **pool index**, not value, so duplicate rolled scores stay distinct). Each ability row is a **tap-to-cycle** button (advances through the still-free pool slots, then "unassigned"); the pool strip dims/strikes spent values; **Apply is disabled until all six are assigned** (point-buy applies any partial spend, unchanged). Roll generates locally (no chat post; DM is at the table). New actions: `abil-method`, `abil-roll`, `abil-assign`. CSS: `.mc-abil-method/-seg/-pool/-chip/-slot/-assignrow/-rollintro/-roll/-reroll` (44px+ targets). **No live client here → untested; verify per MORNING_REPORT.** Remaining char-gen layers unchanged (handshake, phone-fit advancement CSS, AoE upcast).

**⏳ Round 23 (2026-06-20, character-creation MVP + public release):**
- **Char-gen MVP built (shell.js).** Blank PC (no class) → "Create Character" gate → workspace picks Species/Background/Class from compendiums (`#charGenPick` scans Item packs by subtype — 57 species / 51 backgrounds / 37 classes locally) → `AdvancementManager.forNewItem(actor, itemData).render(true)` → **dnd5e's real advancement popups**. **KEYSTONE PROVEN LIVE:** the Fighter advancement manager opened on the phone, lifted by `liftDialogAboveShell` (`mc-phone-dialog`, z-index 10001 > shell 9999) — so we reuse the genuine creation popups with zero new dialog code. Added a **point-buy ability panel** (27-pt, canonical 5e cost table). Players can't create actors (confirmed) → DM drops the blank PC + grants Owner; snags handled DM-side.
- **Pending char-gen layers:** DM "Player X started" notification + ~~compendium-approval **handshake** (DM checkboxes scope the allowed sources)~~ — **RESOLVED 2026-06-21 by mirroring dnd5e's own setting** (don't reinvent, per copy-Foundry-flows): the char-gen picker (Species/Background/Class scan, equipment-category scan, and the spell list) now respects `game.settings.get("dnd5e","packSourceConfiguration")`, the world setting behind **Settings → dnd5e → "Compendium Browser / Sources"**. dnd5e's `collateSources()` includes a pack when `setting[collection] !== false`, so a pack the DM unticks there is stored as `false` = excluded; mobile-command uses the identical rule via `#packSourceAllowed(collection)`. So the DM curates player-facing sources in the SAME menu they already use for the compendium browser. (Live: a world with all dnd5e SRD/2024 packs excluded → Class picker 37→13, SRD gone, only un-excluded module packs remain.) **phone-fit CSS** for the dense advancement dialog (renders ~563px wide — needs narrow-screen constraint); ~~standard-array/roll abilities~~ (built Round 24); AoE/template spell upcast (carry the slot through `#announceCast` → `placeCast`).
- **Public release pipeline.** Repo made **public**; distributed via **GitHub Releases** (manifest = `releases/latest/download/module.json`). Cut **v0.1.1 → v0.1.2 → v0.1.3** (v0.1.3 = full char-gen MVP). Sqyre install stuck once in "Pending — verifying disk space" (Sqyre queue, not the package — release verified 200/valid); fix = Remove the pending job + reinstall via the manifest URL. **Sqyre runs the release; local Foundry runs the symlink.**

**⏳ Round 22 (2026-06-20, spell upcasting + live-test findings):**
- **Spell upcasting built (§7.5).** Leveled spells show a "Cast at" slot-chip row in the picker (`#spellSlotOptions` mirrors dnd5e's `system.spells` filtering: tiers ≥ base level with charges; default lowest). Chosen slot → `#actionState.slot` → `useActivityStart` → `handleItemUseStart` adds `{spell:{slot}}` to the dnd5e usage config; midi forwards `usage` to `activity.use` (confirmed in midi-qol.js:7578/7697). **Player-side verified live** (Clumpy → Chromatic Orb → L1×3/L2×2/L3×3/L4×1, default L1). AoE/template spells still route to the DM-place flow and do **not** carry the slot yet — follow-up.
- **−100 attack total — root cause CONFIRMED.** Live: phone showed −100 while chat showed the real roll (d20=7 → **14**). So `wf.attackTotal` is bogus and `wf.attackRoll.total` (=chat) is correct; the fix now reports `attackRoll.total`. 
- **Executor-reload requirement (key gotcha).** `rpc.js` handlers run on the **executor/DM client**; a **player** reload does NOT update them. In the live test the −100 and the upcast both misbehaved (cast deducted L1; total −100) purely because the Gamemaster/executor tab was still on old `rpc.js`. All executor-side fixes (−100, upcast slot, damage/announce/attackPreview diagnostics, save relay) activate only after the **DM client reloads** (and on Sqyre, after a release). Re-test upcast slot-deduction + −100 after that reload — the one remaining unverified step.
- **Test bench:** local `localhost:30000` "Offline test" (Restored Keep), passwordless Player 1/2 + Gamemaster, module live via symlink — the clean bench (vs the corrupted Sqyre campaign).

**⏳ Round 21 (2026-06-19, TV 3D dice + clarity polish):**
- **Dice So Nice on the TV — confirmed by design + hardened (DM priority).** Requirement: every **public** roll (player + DM) animates on the shared TV via Dice So Nice; private/blind/hidden rolls must **not**. Checked against the installed **DSN 6.2.8** source + our clean-canvas/role model — holds with **no functional code change**: (1) DSN appends `#dice-box-canvas` to `<body>` (z-index "over"/"auto") or after `#board` ("under") — none match the `body.mc-clean` hide list, so the dice survive clean mode; (2) the TV never opens the phone shell (`maybeAutoOpenShell` is phone-only) so nothing covers them; (3) DSN honors message visibility (`.visible`/`.whisper`/`.blind`), and because the **TV logs in as a player** (the §1/§2.3 unprivileged-display invariant) Foundry filters GM blind/private rolls before they reach the TV — they never animate there. Added a defensive CSS pin (`body.mc-clean #dice-box-canvas`) so a future hide rule can't strand the dice. **The real gap is config, not code:** DSN must be enabled in the world *and* on the TV browser (per-client setting), and for robust layering set DSN → Canvas Z-Index = "Over the interface" on the TV. Players can't change roll mode from the phone, so all player rolls are public by construction. **Untested live (no driveable client this session).**
- **User-facing "executor" → "DM"** in notifications, RPC refusal reasons, and settings labels/hints (internal identifiers `isExecutor`/`resolveExecutorId`/`executorUser`/`toExecutor` keep the precise term). DM: "technically more correct but it's not clear."
- **Revert warning → full-width block.** The dominant red "Remove & revert before disabling" banner was rendering as a squished one-word-per-line column (`display:flex` on inline children inside a narrow settings cell); now `display:block` spanning the grid, prepended to the module's own settings section.

**⏳ Round 20 (2026-06-17/18, inventory polish + touch targets — iterative DM feedback):**
- **Inventory rows fixed.** Root cause of the "uncentered / getting worse" rows: `.mc-inv-main` was a `<button>` for usable/container rows but a `<div>` for the rest, and iOS Safari mis-centers flex content inside a `<button>` (top-aligns). Made the main a `<div>` everywhere (clicks route via delegation). Both toggle slots (attune + equip) are reserved placeholders so each forms a clean column; row has a uniform `min-height:56px` (now safe — the div centers, no buffer). Renamed the "Equipment" item group → "Armor & Gear" (was stuttering with the tab banner). Nested container contents are an inset, faintly-backed block so they read as inside the pack.
- **Touch targets (standing rule).** DM: "make anything interactive touch-friendly." Accordion group headers → `min-height:48px` + larger text/chevron. (HP/Temp already whole-stat buttons; inventory toggles fill the row height.) Saved as a memory so it's applied going forward.

**⏳ Round 19 (2026-06-17, from live DM testing — fixes + instrumentation):**
- **Inventory toggles (corrected layout):** attune + equip ride **together on the right, attune just left of equip** (the first cut put attune on the far left — misread; the DM meant left *of the equip button*). **No background** on the toggles ("busy enough there") — just centered icons (`display:flex` centering fixed the "uncentered buttons"). Equip is always rendered (transparent placeholder when N/A) so the equip column aligns across rows incl. container headers; attune shows only when relevant.
- **Actions groups are accordion drawers.** Each Action/Bonus/Reaction/Free/Other header is a clear tappable **bar** (panel bg + econ-coloured left accent stripe + chevron — the first cut was too subtle to read as clickable); **collapsed dims to 0.5**. Toggles open/closed (`#collapsedActionGroups`, `data-action="agroup"`); **using an action auto-collapses its drawer** (in `#fireAction` on a successful start; the activity's `#econGroup` is stored on `#actionState`), still reopenable. No auto-reopen on turn change yet (logged).
- **Save prompt now closes on the roll however it's rolled** — `noteRoll` clears `#savePrompt` when a `flags.dnd5e.roll.type === "save"` message from this user lands (covers our card, the native card, or a sheet roll), not only when our card's button is tapped (DM: popup didn't close).
- **AoE: release the caster after placing.** `placeCast` now `canvas.tokens.releaseAll()` after `activity.use()`, so the DM isn't left with the caster PC selected while rolling the monsters' saves (DM: "pc's token remained selected, making rolling for monsters longer").
- **Magic Missile didn't roll damage — instrumented.** Broadened the two-tap log to `use start {name, type, hasAttack, parked}` for every fire. MM is a no-attack damage spell that *should* park at WaitForDamageRoll for the two-tap; if `parked:false` it resolved without a roll step (same class as the flat-heal park gap). **Needs the console line from a live MM cast to fix.**

**⏳ Round 18 (2026-06-17):**
- **Equipment / Inventory tab — built (untested).** A 6th tab (suitcase icon, order Actions/Details/Explore/Spells/Equipment/Journal). Physical inventory grouped by type with equip/attune toggles + one-tap use of items with a usable activity + a read-only currency row. Verified the dnd5e 5.3.3 field names against the system source (`system.equipped`/`attunement`/`attuned`/`quantity`, `actor.system.currency`, `CONFIG.DND5E.currencies`). Detail in §13 (Inventory line). Built without a live client — DM verifies.
- **Container contents (Equipment depth).** Items inside a container (`system.container` = the container's id) no longer clutter the top-level list — top level shows only un-contained items, and a **container row expands in place** (chevron + "N items") to show its contents nested (recursive for nested containers; `#openContainers` tracks expanded ids, `#inventoryItemsHTML` recurses). Verified the container model against dnd5e source (`ContainerData.get contents`, `system.container` link). **Next inventory polish:** currency editing (tap-to-edit like HP), item transfer, container capacity/weight readout.
- **HP/Temp tap target enlarged.** The whole stat (label + number) is now one tappable button, not just the digit — temp is usually 0 and far too small to hit on touch (DM 2026-06-17). `mc-stat-tap` button reset + roomy padding; editing highlight moved to the button.

**⏳ Round 17 (2026-06-16):**
- **Save / reaction prompt surface — built (untested).** Executor relays midi's `preTargetSave` to the target's phone; the phone shows a tappable "⚡ <spell> — Roll DEX (DC X)" card that fires the native (Restyled) save roll midi intercepts. Closes the gap the DM hit live (the whispered save card is hidden behind the shell). Full detail + the why-not-parse-the-chat-card rationale in §13 (top item).
- **Module eval — Bugbear's Scripts (BUGS, `thatlonelybugbear/bugs`) — recommend NOT adding now.** It adds MidiQOL adv/dis flags to status effects + auto-applies condition effects (blinded/prone/etc.) via midi Choose Effects. Reasons against: (1) **Foundry-14 unverified** — latest release v13.5330.1 (28 May) is the Foundry-**13** line (verified core 13.351, no 14 release), and the project is pinned to **14.363**; automation libs lagging a major version is the recurring caution (cf. Gambit's Premades). dnd5e match is exact (5.3.3). (2) **Redundant** with the already-installed **automated-conditions-5e**, which already does condition→adv/dis — risk of double-application/conflict. (3) **Orthogonal** to the mobile-command problem (it's table-wide condition automation, not phone/Route-B/DM-side). Revisit only if a Foundry-14 release ships AND a gap AC5E doesn't cover appears.

**⏳ Round 16 (2026-06-16):**
- **Owned-token switcher (§7.1) — label improved + verification pushed up (DM has 2 tokens for one player, needed switching now).** Built in Round 15 but never tested. The Prev/Next control lives at the **top of the Explore tab** and only shows when the user owns **>1 token on the active scene** (`#ownedTokens`). Label shows the **actor (sheet) name + position (`i/n`)** — the actor name is the one players recognize (DM preference 2026-06-16; e.g. "Multi", not the token's "Player Character"), and the `i/n` counter still makes a switch obvious even when two tokens share an actor. **Verified working live 2026-06-16** (the earlier "not showing" was a disconnected/wrong-account client, not a bug). Switching is tracked by token id (`#subjectId`); `actor`/`originTokenId` resolve through it so the sheet, rolls, actions, spells, and move pad all follow the selected token. **If the switcher doesn't appear, the usual cause is the tokens not being on the *active* (GM-activated) scene** — `#ownedTokens` is active-scene-scoped because the move/action RPCs operate there.
- **"This is the TV" button** added to the Leave-Mobile-Command confirm popup (`#confirmExit` → DialogV2 with Leave / This is the TV / Cancel). The TV button sets this client's per-client `role` to `display` (D7) and reloads — so D2's setup-time canvas check re-evaluates this browser as a non-phone client (canvas on, shell suppressed), giving the shared-table map view in one tap instead of hand-editing Module Settings. (Reminder: a Display client still renders the map with *that player account's* vision — a dedicated full-sight TV user is a separate setup choice; ties into the unbuilt Spike 6 / §7.3 reticle work.)
- **TV combat-HUD leak FIXED.** DM-reported: advancing the turn popped the Action Pack "<name>'s Turn" HUD **on the TV**. The combat-HUD suppression only ran on phone clients (gated on the shell being rendered); a Display client has no shell, so the HUD leaked. `liftDialogAboveShell` now also suppresses combat HUDs on Display clients (`isDisplayClient()` + a shared `killCombatHUD` helper). The HUD regex/close logic is unchanged.
- **AoE push — built + first live test:** built the agreed §11 AoE-push flow end-to-end (phone `#announceCast` → `api.announceCast` → DM-panel "Place spell(s)" section → `placeCast`). **Live test 1 (2026-06-16):** announce→prompt→place worked and the template showed on the TV, but the cast didn't resolve — root cause was the preset (`autoTarget:"none"` + `autoRollDamage:"none"`), **not** combat. Fixed by preset `autoTarget → "wallsBlockIgnoreDefeated"` (DM must re-apply via enforcer) + per-cast damage fast-forward in `placeCast`. Full detail, including the out-of-combat note, lives in §11.

**⏳ Round 15 (2026-06-15, token switcher + action-row alignment):**
- **Owned-token switcher (§7.1) — built.** Prev/Next buttons at the top of Explore cycle the controlled subject among the active-scene tokens the user owns (`#ownedTokens` = scene tokens where `t.actor.isOwner`), shown only when there's >1. Subject is tracked by **token id** (`#subjectId`) so it works for unlinked summons/familiars/wild-shape, not just linked PCs; `actor` and `originTokenId` getters resolve through it (so sheet, rolls, actions, and the move pad all follow the selected token). **Untested.**
- **Action-row bookmark slot** is now always reserved (hidden placeholder when not favorited/not editing) so the resource usage-dots align across rows.
- **"Follow leader" — LOGGED for a later version** (familiars/summons trailing the PC's movement). Likely delegate to an existing module rather than build; pairs with the token switcher (§7.1 movement-subject vs roll-subject split).

**⏳ Round 14 (2026-06-15, spell/header polish + DM-assign loop CLOSED):**
- **Spells:** class header on the spellcasting cards flattened (was a dominant burgundy gradient → flat muted bar); **per-class "primary caster" magic-wand button** sets `system.attributes.spellcasting` to that class's ability — the primary card highlights (gold frame) and shows "Primary".
- **Header:** name vertically centered with the Lvl button; **tapping the portrait opens a full-screen image popup** with a Portrait↔Token toggle + X close (`#imagePopup` state).
- **DM-assign loop closed (phone side).** The shell now consumes the `mobile-command.assignTargets` relay: `noteAssignedTargets()` stores the uuids + notifies; `#pickAction` **pre-loads them into the picker** (selected, capped to the activity's target count, pushed to the TV preview), and the picker shows a **"Targets set by DM (N)" banner with a "change"** link (clears the assignment → normal cycler). Assignments **expire at the end of the player's turn** (`expireAssignedIfNotMyTurn` on `updateCombat`). With the Round-13 DM panel, the assign flow is now end-to-end (DM holds targets → sends to a player → their phone fires at them). **Untested (two-client).** **Still TODO:** show assigned *names* respecting display-name mode (hidden ones nameless) — currently count-only to avoid a name leak.

**⏳ Round 13 (2026-06-15, DM side — STARTED):**
- **Per-class spellcasting cards** added to the Spells tab (Ability mod / spell Attack / save DC / Prepared x/y) from `actor.spellcastingClasses` (computed `spellcasting.{ability,attack,save,preparation}`, [dnd5e.mjs:10725-10731](DESIGN.md)) — multiclass and homebrew casters (the "Bender") handled for free; over-prepared turns red. Replaced the single summed prepared line.
- **DM side kicked off — the assign-targets panel (§11).** New [dm-panel.js](scripts/dm-panel.js): a docked panel on **GM clients only** that wakes when the DM holds ≥1 target. Shows target chips, a Clear (✕), and one **"send" button per active player with a character** (current combatant highlighted "· turn"); on send it calls the existing `api.assignTargets(userId, uuids)` RPC and clears the DM's own targets (`canvas.tokens.setTargets([], {mode:"replace"})` — v14). The RPC backbone already existed (`handleAssignTargets` stores `remoteState.assignedTargetUuids` + fires the `mobile-command.assignTargets` hook); this adds the missing DM UI. **Untested (needs the two-client DM+phone setup).**
- **Immediate next (closes the loop):** **phone-side consumption** — the shell should pre-load `remoteState.assignedTargetUuids` into the target picker (pre-selected, "Targets set by DM", hidden targets shown namelessly, skip straight to adv/dis), and **auto-expire at end of the player's turn** (§11). Without this, the DM can send but the phone doesn't yet use it.
- **DM-side roadmap after that:** presence panel (§7.8 green/amber/gray), Service-health alarm, dialog-watchdog notifier (§6), AoE/template push (the Burning Hands prompt), show-player image popup.

**⏳ Round 12 (2026-06-15, Details/header tweaks — from DM feedback):**
- **Resistances / Vulnerabilities redesign.** Replaced the "Defenses" header + per-category label rows with a single **"Resistances / Vulnerabilities"** header and **colour-coded chips**: green = resistance, **solid green = immunity**, red = vulnerability (`system.traits.dr/di/dv` → `CONFIG.DND5E.damageTypes`). Colour replaces the labels ("lost the subheaders"). *(Completed an uncommitted chip-refactor that had no CSS — chips were unstyled until now.)*
- **Temporary "Log out" button** under "Leave Mobile Command" (Details) → `game.logOut()` (returns to the join screen). Rationale: switching Foundry users on a phone is painful; this is a stopgap utility (neutral styling, no confirm — intentional for fast switching).
- **Lvl button moved before the name** — its right edge now sits at the name's start (`[Lvl 5] Name`), name wrapped in `.mc-name-text` with ellipsis. (Strict "grow-left" for longer numbers is bounded by the portrait to the left, so a wider number nudges the name ~1 char; negligible for level 1–20.)

**⏳ Round 11 (2026-06-15, spell/UX polish — from live DM testing):**
- **Casting no longer jumps tabs.** The target picker now overlays the *current* tab (`#actionState` check hoisted into `#tabContent`), so casting from Spells (or using a favorite from Explore) stays put; `fav-act` no longer forces `#tab = "actions"`.
- **Cantrips** no longer show a prepared toggle (always-prepared in 5e; `canPrepare` now also requires `level > 0`). **Prepared count turns red** when over the limit (`pv > pm`).
- **Lvl badge → tappable button** opening a **class/subclass/level + XP-bar panel** (DM: "no reason to hide it" behind a long-press). Shows each class as "Class / Subclass N" + an XP progress bar (x/y). Per the earlier ask, the duplicated **class/subclass/level/XP rows were removed from Details** (Details keeps race/background/senses/proficiencies/defenses/feats). Long-press is now unnecessary for this.
- **Header polish:** portrait ~20% bigger (52→62px), name top-aligned to the image top, Lvl button restyled bigger + slightly bluish + drop shadow.
- **AoE templates (Burning Hands, DM Q):** current behavior is **advisory-only** (§11 MVP — phone says "DM places the template," no push yet). A **DM-push notification** ("X casts Burning Hands — place the cone") is the planned next step (offered, not built; needs the DM client to test); v2 hands caught targets back to the caster's phone.
- **Action Pack flash:** DM confirms **zero flash** after the synchronous `display:none` fix. Resolved.

**⏳ Round 10 (2026-06-15, spell management + details — from DM feedback):**
- **Prepare-toggle bug FIXED.** The book toggle wrote `system.prepared` but the UI never refreshed — the shell only re-rendered on **actor** changes; spell prepared (and item `uses`, and item-favorites) live on the **item**. Added `updateItem`/`createItem`/`deleteItem` hooks (re-render when an owned item changes). This also makes use-counters and learned/removed spells live.
- **`spell-book` module evaluated (DM ask).** It's **v14-verified (compat min 14, verified 14.363 — exact stack match)**; "view, prepare, customize spell lists," relations to tidy5e-sheet/chris-premades/dnd5e. **Recommendation: don't integrate its UI** (same problem as Action Pack — it's a desktop Application that won't fit the phone shell), but it's **data-layer compatible for free**: it reads/writes the same `system.prepared` / `system.spells` fields our phone uses, so the player can do heavy setup (learning, list customization, multiclass config) in spell-book on a PC and the phone reflects it; in-game prep/cast happens on the phone. No code integration needed now. Deeper read of its computed prepared-limits (esp. for non-default casters) is a possible later enhancement *if* it exposes an API (none found in a quick scan).
- **Multiclass / non-default casters:** slots use `actor.system.spells` (dnd5e already merges multiclass slots; pact separate) so they display correctly; prepared count sums each class's `spellcasting.preparation.{value,max}`. **Spell-point casters (homebrew "bender" etc.) are out of the slot model** — their points aren't in `system.spells`; if stored in `system.resources`/item `uses` they'd surface via resource counters, otherwise they need a per-class adapter (D6) — logged, not handled.
- **`[Lvl X]` added next to the name** (total level, multiclass-summed). **Deferred to long-press infra:** a name tooltip with full class/subclass/level breakdown ("Fighter / Warmaster 5") + an **XP progress bar (x/y)**; when that lands, **remove the duplicated class/subclass/level/XP rows from Details**.
- **Defenses added to Details** (above feats): damage **Resistances / Vulnerabilities / Immunities** (`system.traits.dr/dv/di` → `CONFIG.DND5E.damageTypes` labels).
- **Targeting Use button is now sticky** to the bottom of the scroll area (long target lists no longer push it off-screen).
- **Learn-spells-from-phone:** logged, low priority (DM: fine to do on a PC).
- **Gambit's Premades (AoO lead, DM item 1):** NOT installed (nor chris-premades). It's a MidiQOL **automation library** (pre-built reactions — Shield/Hellish Rebuke/Silvery Barbs/opportunity attacks — plus feature/monster automations, auras, summons), built on chris-premades. **Potential project contributions:** auto-prompted **reactions + OAs** (would fill the OA-on-movement gap and enrich the phone reaction flow), and automated complex feature effects we'd otherwise hand-build or leave to the DM. **DM decision: may delay OAs until it's v14-ready** (verify compat first — chris-premades-stack modules often lag major versions). **Equipment direction (DM):** leaning toward an Equipment tab with **two sub-tabs (Items / Spells)** — revisit when Equipment is built.
- **Action Pack flash:** the synchronous `display:none`-on-render fix shipped (Round 9 commit `27f5fa3`); DM reported it lingered *before* that — needs a re-test. If it still flashes, a persistent `body.mc-phone` CSS hide (needs Action Pack's element selector) or reverting the suppression are the fallbacks.

**⏳ Round 9 (2026-06-15, from live combat testing — untested fixes):**
- **Third-party combat HUD leaks onto the phone.** Confirmed (module scan) as **`action-pack-enhanced` (Action Pack Enhanced)** — the action/bonus/reaction "<name>'s Turn" popup in the DM screenshot; our Prompt Restyler turned it into a bottom-sheet, and the player was acting through *it* (bypassing Route B → no phone damage tap). **Fix:** `liftDialogAboveShell` closes apps matching `/argon|enhancedcombat|combat-?hud|action-?pack|combat-guidance/` on phone clients only (DM client's shell isn't rendered, so its HUD is untouched), and logs every app rendered over the shell for ID. Also suppresses `combat-guidance` (a bonus-action suggester that overlaps our indicator). The first regex (`combat-?hud` only) **missed Action Pack** — corrected.
- **War Bond / any feature with its own choice dialog (DM Q):** under Route B the dialog opens on the **DM's watched screen** — the **DM picks the option**; the rest flows to the phone. Relaying arbitrary feature dialogs to the phone is the §6 unanticipated-dialog problem (v2), not worth special-casing per feat.
- **Opportunity attacks are NOT auto-prompted by midi** (movement detection isn't a midi feature; needs a module or manual play). midi only *charges* the reaction once an off-turn attack is rolled (`recordAOO`, midi-qol.js:8382). **Added `recordAOO: "all"`** to the preset so manual OAs spend the reaction (RE indicator). True auto-detection = future Service-side movement watcher.
- **Turn HUD went stale after a background+turn-change** (iOS suspends tabs). Added a **`visibilitychange` re-render during combat** (partial §7.8). Full state re-fetch on socket reconnect is the larger Connection Guard item.
- **Exhaustion stepper built** — leveled 0–6 −/+ in the condition palette (`system.attributes.exhaustion`), replacing the on/off toggle. **Free favorite cost badges** added (FREE, amber).
- **`enforce*Actions: "displayOnly"` confirmed live** (console diff) — the action-economy indicator's flag-read/render path is verified working (manual `setFlag` dims ACT); remaining question is whether our two-tap Route-B workflow reaches midi's `Cleanup`/`setActionUsed` on the player's turn (chase next: full attack on-turn → check `flags.midi-qol.actions`).
- **Opportunity-attack mod scan (DM ask):** no installed module mentions "opportunity"; closest are `combat-guidance` (your-turn bonus/action suggester, 2024 rules) and `monks-combat-details` (turn notification) — **neither auto-prompts OAs on enemy movement**. Confirms auto-OA isn't available from current mods; it'd be a custom Service-side movement watcher (future). `recordAOO: "all"` (added) makes a *manual* OA spend the reaction.
- **✅ Spells tab BUILT (big autonomous build, 2026-06-15, untested).** Replaces the Equipment placeholder tab (Equipment returns later; ~5-tab limit). Backed entirely by document data (no canvas): **slot counters** per level + pact (`actor.system.spells.spellN.{value,max}`), a **prepared count** (`value/max` summed across spellcasting classes' `system.spellcasting.preparation`), and the **spellbook grouped by level** (Cantrips → 9th) with per-spell **prepared toggles** (`item.update({"system.prepared": 0↔1})` — note dnd5e 5.3.3 uses `system.prepared` as a *number* + `system.method`, with `system.preparation` a computed `{mode,prepared}`; toggle only shown when `mode === "prepared"`). **Casting** routes a spell's first activity into the Actions picker (Route B); AoE spells get the RPC's "use the DM template flow" refusal. **Follow-ups:** slot-level **upcast** selection (needs the §7.5 pre-roll choice on the phone — currently casts at base level), ritual tagging, spell-school/components display, and the Equipment tab's eventual home alongside Spells.
- **DM-confirmed tweaks (2026-06-15):** counters switched to dnd5e-style **pips** (gold dots, filled = remaining, text fallback >8) shared by spell slots, **leveled section headers** (each shows its slot pips), and the resource use-counters. Combat-HUD suppression now hides the app synchronously so it no longer flashes. **Equipment plan:** it returns as a **6th icon tab** when built (Actions/Details/Explore/Spells/Equipment/Journal — 6 icons fit a phone bar; the "~5 max" was a label-era guideline) — Spells just reused the empty placeholder slot, nothing lost. **AoO automation lead:** DM names **Gambit's Premades** as the module they had in mind for OA prompts, but suspects it's not Foundry-v14-compatible — verify compat before relying on it; otherwise auto-OA stays a custom Service-side movement watcher.
- **Lucky / feature reroll prompts (DM Q 2026-06-15):** using a feature like Lucky shows the phone's "Rolling…" placeholder while the executor resolves; any interactive reroll dialog the feature spawns currently lands on the **DM's watched screen** (Route B). Mirroring those to the phone is the §6 unanticipated-dialog goal (v2) — pre-collect on the phone or relay the DM dialog; not yet built.

**⏳ Round 8 (2026-06-14, untested): primary-blue buttons, visible shadow, Explore reflow + favorites, burgundy titles.** Built from DM L&F feedback:
- **"Save" blue is now the primary button color** — applied to the **Use** button (target picker), the **Short/Long Rest** buttons, and the **orthogonal D-pad arrows** (up/down/left/right; diagonals stay neutral). Check / adv-dis / target buttons deliberately unchanged ("don't switch things unless asked to").
- **Drop shadow made visible** — round 7's `0 1.5px 2px / 45%` was invisible on the near-black ground; now `0 3px 6px / 60%` + a faint inset top highlight. **Speed/Prof cells given a fixed equal height** so they line up with Init/Hit Dice; the shadow sits outside the box, so gray (no-shadow) and tappable (shadow) cells match.
- **Explore tab reflowed** — a **movement row**: **Init / Hit Dice left of the D-pad, Speed / Prof right** (D-pad shrinks to 52 px cells to fit a narrow phone), then the **favorites container**, then the ability Check/Save grid, then rests. The old hardcoded 3-skill strip (Perception/Stealth/Insight) is **removed** — favorites now serves that one-tap role.
- **Favorites container (§7.2) shipped, backed by dnd5e `system.favorites`.** Resolves each favorite for display (`fromUuidSync(id,{relative:actor})` for item/activity/effect; computed bonus for skill/tool; slot trackers skipped). Tap routes by type: activity/item → opens the Actions picker; skill/tool → native roll. Grows downward ("expands as needed").
- **Actions favorites toggle (DM request)** — a **bookmark button at the right of the Actions title bar** flips the list into favorite-edit mode; each row then toggles its activity favorite (`system.addFavorite`/`removeFavorite`, type `"activity"`, id = `<item relUUID>.Activity.<id>`, verified against dnd5e 5.3.3 source). Favorited rows show a gold bookmark; the `updateActor` hook re-renders so the Explore container reflects changes immediately.
- **Section titles are now a burgundy banner** (`#782e22`, the dnd5e character-sheet header color) instead of small gold caps.
   **Verify live:** favorite add/remove from Actions ↔ Explore container; activity favorite opens the picker; skill favorite rolls; Use/rests/orthogonal arrows blue and diagonals neutral; shadow visible; Speed/Prof aligned; burgundy titles. **Favorites resolution (activity relative-UUID + display) is the highest-risk untested piece.**
   **Newly LOGGED, not built (per DM 2026-06-14):**
   - **Details identity block (class / subclass / race / background) — DM dislikes the current design; redesign later.** The plain key/value rows. Group with the §7.2 long-press detail-card work.
   - **"Metallic glimmer" scroll effect (later version)** — on scroll, a very faint (~15% opacity) diagonal white bar sweeps across content (right on scroll-down, left on scroll-up); maybe two bars over the button rows (Actions / skills / Use). Cosmetic.
   - **"Show player" image popup (not tab-bound)** — a full-screen image the DM opens on the player's phone, closable with an X, independent of any tab. Foundry already has a native "Show Players" image broadcast (`ImagePopout` via the `shareImage` socket / journal image share) — the full-screen shell currently covers it. Implementation: hook the share event (or `renderImagePopout`) and render a full-screen closable overlay on the phone. Pairs with the logged long-press portrait↔token image popup.

**⏳ Round 6 (2026-06-14, untested): Prompt Restyler + dialog/targeting polish.** Built: **Prompt Restyler MVP (§7.6)** — every dialog opened over the shell (rest, attack/roll config, reactions, our confirms) gets a `mc-phone-dialog` class and renders as a **full-width bottom-sheet up to 92vh with scrollable content**, fixing the tiny/unusable native popups (rest was impossible); the dialog's own header X closes it. **Adv/Normal/Dis** now carry green/red tints (stronger when selected). **AC** has a shield glyph. **Inspiration** button shrunk + aligned to the stats row. **"Self" is always a target option** (gray "Self" tag, bottom of the list). Targeting **Back → X** (close icon, consistent with popups). The shell's **close moved off the header to a reddish "Leave Mobile Command" button at the bottom of Details**, behind an **are-you-sure confirm** (low-priority flow; moves to a Settings tab later).
   **Newly LOGGED, not built (per DM 2026-06-14):**
   - **Long-press detail popup** (= the PC middle-click card): full-screen, closable, drill into subcategories; header shows the name truncated to 15 chars (…) and a **total-level box** (e.g. Fighter 4 / Rogue 2 = 6). Needs long-press gesture infra (groups with the other long-press work).
   - **Long-press image popup** — full-screen, switch between portrait and token image.
   - **Settings tab with themes** — later version.
   - **Containers open a popup of their contents** — with the inventory/Equipment build.
   - **Speed = 0** is an actor-data/Foundry quirk on the test Fighter (DM confirmed), not our bug — no change.

**⏳ Round 5 (2026-06-14, untested): icon tabs, Details skills list, Equipment tab.** Tab bar is now **icons only** (Font Awesome; labels kept as title/aria-label) to save room — Actions (fist) · Explore (compass) · Details (user) · Equipment (bag) · Journal (feather). **Details now leads with a full skills list** matching the dnd5e sheet: proficiency dot (empty / half / full / full-with-ring for expertise, from the 0/0.5/1/2 multiplier), governing-ability 3-letter abbrev, roll bonus, and the native roll flow on tap (`rollSkill`). **Proficiency labels resolved to full names** (CONFIG.DND5E.weaponProficiencies/armorProficiencies → "Martial Weapons"/"Light Armor"; languages/tools via a recursive CONFIG tree search, raw key as last-resort fallback). Added an **Equipment tab** (placeholder; inventory/equip is a later phase). DM confirmed rounds 1–4 tested and look/act great.

**⏳ Round 4 (2026-06-14, untested): conditions/AC/Explore stats/rests/Details tab.** Built: **condition chips now show the status icon** (`effect.img`), container wraps for many; **AC framed + gray** (reads as info, not a button); **Explore stats strip** — Initiative (tap → `rollInitiativeDialog`), Hit Dice (tap → `rollHitDie`), Speed (gray), Proficiency (gray); **Short/Long Rest buttons** at the bottom of Explore → `actor.shortRest()/longRest()` (system dialogs, lifted above the shell); new **Details tab** (read-only) — level + XP x/y, class/subclass/race/background, senses, languages + weapon/armor/tool proficiencies, and a feats/features chip list.
   **Newly LOGGED, not built (per DM 2026-06-14):**
   - **Death saves — NOT supported.** §7.4 wants the screen to collapse to a giant Death Save button at 0 HP; not implemented. Marked.
   - **Reactions popup** — midi already has `doReactions: "all"` in the preset, so off-turn reaction prompts *should* fan out to the owner's phone like saves do; needs a live test (and the dialog-lift already covers it). Verify, then restyle via the Prompt Restyler (§7.6). **Still the load-bearing untested path (2026-06-15):** the reaction *prompt* routing uses the same whisper-to-owner mechanism as saves (proven in Spike 3 Test B), so it should work, but it has NOT been exercised live — the action-economy work is the moment to test it (trigger an opportunity attack / Shield against a phone player and confirm the prompt lands as a bottom-sheet). The RE indicator and reaction grouping are built; the prompt is the piece to verify.
   - **Spellbook module support** — DM wants it in a later version. Logged.
   - **Foundry rich tooltips on Details entries** (tap a feat/race/class/proficiency → the system tooltip) and **long-press detail cards** (incl. AC formula on long-press of the AC frame) — both need the long-press/tooltip infrastructure; deferred with the §7.2 v2 long-press work. Details proficiency/language labels are best-effort raw keys until then.

**⏳ Round 3 (2026-06-14): iOS sizing pass.** Apple-HIG ~44pt minimum tap targets and spacing across buttons (Check/Save, skills, adv, targets, fire, stat ±, inspiration/exit); action rows made taller to fit the icon and be easier to press; **D-pad switched to a single Font Awesome arrow rotated per direction** (the unicode diagonals ↖↗↙↘ were emoji-fied on iOS, looking inconsistent) and made compact/centered; tab bar set to a standard ~50pt height with a cleaner gold active accent. Untested.

- **B1 — Bottom tab bar: bigger targets + safe-area inset.** Tabs (Actions/Sheet/Journal) are too small and sit flush against the screen bottom, colliding with the iOS home-swipe/minimize gesture. Fix: increase tab height/hit area and add `padding-bottom: env(safe-area-inset-bottom)` to `.mc-tabs` (and account for the safe area in the toast's `bottom`, which already uses it). Applies to the notch/Dynamic-Island top inset too (`safe-area-inset-top`) for the header.
- **B2 — Swipe between tabs** (nice-to-have, not a must). Horizontal swipe on `.mc-content` to move Actions ↔ Sheet ↔ Journal, with the tab bar reflecting the active tab. Pure UX polish.
- **B3 — Inspiration: view + add/remove.** Surface the dnd5e inspiration flag (`actor.system.attributes.inspiration`, boolean) on the sheet header; tappable to toggle (this is a *write* — group with the HP-stepper write work). Glanceable indicator when held.
- **B4 — AC display.** Show armor class in the header alongside HP (`actor.system.attributes.ac.value`). Read-only, trivial; just wasn't in the first cut.
- **B5 — Look & Feel overhaul → "feels like a D&D character sheet."** The current shell is a clean utilitarian dark theme; the DM wants it to read as an in-world D&D sheet (thematic typography, framing, texture/parchment-or-ink motifs, ability/skill presentation closer to a real sheet). This is the dedicated UI-design pass — most of B1–B4 should be folded into it rather than done piecemeal.
- **B6 — Roll dialog on mobile is still squished → Prompt Restyler owns it (§7.6).** The 2026-06-13 quick CSS nudge (`body.mc-phone .roll-configuration .dialog-buttons` margin) did NOT resolve it: on iOS the ADVANTAGE/NORMAL/DISADVANTAGE buttons overlap the dialog's **header subtitle** (actor name), i.e. it's a header/content collision, not just tight button spacing — a margin tweak is the wrong tool. On desktop it opens as a normal midi popup (fine). Correct fix is the **Prompt Restyler (§7.6)**: render-hook dnd5e/midi roll dialogs into a proper mobile bottom-sheet with thumb-sized buttons, rather than patching the native layout. The quick-fix CSS can stay (harmless) or be removed when the Restyler lands.
- **B7 — HP/temp control: tap-to-edit, not steppers (supersedes the current ±/Damage/Heal UI).** DM's preferred model (2026-06-13), mirroring the native dnd5e sheet HP field:
  - **Drop the −/+ steppers and the Damage/Heal delta row** built in commit `53b782f`.
  - Show **HP and temp HP** styled with the **same colors as the Foundry/dnd5e character sheet** (match the system's HP pips/temp coloring rather than our custom green/amber).
  - **Tapping either value turns it into a text input** (raises the mobile keyboard). On commit, accept **absolute** (`22`) **or relative** (`-10`, `+3`) input — the same relative-delta syntax the dnd5e sheet's HP field uses. Relative applies a delta; absolute sets the value. Clamp to [0, max] for current HP; temp is independent.
  - Reuse dnd5e's own relative-input parsing if exposed; otherwise parse `^[+-]` → delta, else absolute. Group with B3 (inspiration) / B4 (AC) as the header/sheet write-control cluster, ideally inside the B5 L&F pass so it matches the sheet aesthetic.
- **B8 — Target picker: in-range badge (color = reachable), disposition as a tag.** From combat-loop testing (2026-06-13): coloring the *distance* by disposition (red foe / green ally) read as reachable/unreachable, not friend/foe. Fixed immediately — distance is now neutral, disposition shows as a Foe/Ally/Neutral tag. **Reserve red/green for an actual in-range badge** (§7.3): pass the activity's range/reach into `listTargets` (or compute reach on the executor) so each candidate carries `inRange`, then color/badge by that — advisory only, never disables Fire (warnings-not-walls, §11). This is the genuine use of color the disposition coloring was accidentally impersonating.

---

## 13. Consolidated open backlog (as of 2026-06-14)

Single list so a fresh session can pick up. UI rounds 1–7 (§12) are built; details/rationale for each are in §12 and the git log. Source of truth remains this doc.

**2026-06-18 DM feedback batch (live test of the Magic Missile fix + a stream of observations):**
1. **Two-tap broken WHOLESALE — ✅ FIXED & VERIFIED LIVE (2026-06-18).** ROOT-CAUSED LIVE via the Chrome plugin (CC drove a Player-1 phone client), which overturned the earlier hypotheses (thrown-weapon / no-slots masking — both wrong). Verification after the fix: casting Magic Missile parks → the phone shows "Roll damage" → tapping it rolls force damage, applies it, and consumes the slot. Follow-up observed: with one target selected, MM fired a single dart (1d4+1) — the phone picker assigns one dart per distinct target (up to 3), so all-3-darts-on-one-enemy isn't expressible yet; decide later whether to support stacking darts (may match Foundry's own targeting; verify before changing). What was happening, for **both** a weapon (Greatsword) and Magic Missile, with a slot available:
   - The executor's `completeActivityUse` runs, the attack **fast-forwards and rolls fine** (the resulting midi card carries `attackRoll`/`d20AttackRoll`/`isHit`), the slot **consumes correctly** (1→0) — so neither fast-forward nor consumption is the problem.
   - With the D4 preset (`autoRollDamage:"none"`, confirmed live), `shouldRollDamage` is false → midi takes the **manual-damage path** (midi-qol.js 26266/26278): it posts/updates a chat card with a `data-action="rollDamage"` button on the **executor** and returns `WorkflowState_Suspend` (so `wf.suspended=true`, workflow stored, `needsDamage` stays true).
   - **But `findParkedWorkflow` returns null anyway**, so `handleItemUseStart` replies `needsDamage:false` and the phone drops straight back to the list — leaving an orphaned "Roll Damage" card on the executor's chat (this is the "damage/refund chat-box" the DM saw; MM's card also shows dnd5e's Consume/Refund buttons).
   - **ROOT CAUSE — CONFIRMED (2026-06-18):** `findParkedWorkflow` scanned `Object.values(MidiQOL.Workflow.workflows)`, but in midi 14 that collection is a **`Map`** (keyed by id, entries optionally `WeakRef`s — midi-qol.js 24336/24347). **`Object.values()` on a Map is always `[]`**, so the scan never saw any workflow and the two-tap silently failed for weapon AND spell alike (the executor correctly parked a suspended workflow with a Roll-Damage card each time — we just never found it). The empty `MidiQOL.Workflow.workflows` console dump was the same `Object.values`-on-a-Map artifact, not an empty game. **Fix (commit pending): iterate `coll.values()` and deref WeakRefs** (`coll instanceof Map ? Array.from(coll.values()) : Object.values(coll)` → `.map(w=>w instanceof WeakRef ? w.deref() : w)`). Timeout was also bumped 4s→8s and per-poll `parkScan` diagnostics added for the verification run. Live settings dump (for reference): autoRollAttack/gmAutoAttack false, autoRollDamage/gmAutoDamage "none", autoFastForward/gmAutoFastForward [], removeButtons/gmRemoveButtons "all", consumeResource/gmConsumeResource "none", playerRollSaves "chat", enforceReactions/BonusActions "displayOnly".
2. **adv/dis flow pre-empts Foundry's recommendation.** Our buttons appear before any proficiency check, so a non-proficient weapon gives no "roll at Disadvantage" hint. DM wants the native dialog pushed to the phone. **LARGELY RESOLVED by adding Automated Conditions 5e (AC5E, 2026-06-18).** Verified live: the phone rolls **checks & saves through the native dnd5e dialog**, AC5E hooks it, so the phone now shows AC5E's recommendation for those rolls automatically (Poisoned → STR check rendered `1d20dis` with the **Disadvantage button highlighted**) — no custom code. **Remaining gap = ATTACKS only** (Route B custom buttons bypass that dialog). Reproducing AC5E's attack recommendation on the phone is NOT cheap: its logic is internal, `ac5e.statusEffectsTables` entries are empty skeletons (no adv/dis mode), no public "evaluate" API (only helpers like `ac5e.checkArmor`). Attack parity needs the §14 native-roll-routing spike (roll the attack d20 on the phone like a check so AC5E colors it, then feed to the executor) — do NOT hand-reimplement the rules. **Decision: defer the attack hint; checks/saves are covered.**
3. **DM-added items didn't appear until a page reload — ✅ FIXED (2026-06-18, untested):** the create/update/deleteItem hooks matched the actor by object identity; now matched by id (`controlsActor`). Temporary `createItem` console diagnostic added to confirm the hook reaches the phone.
4. **Equipment items look good now — ✅ confirmed by DM (2026-06-18).**
5. **Action economy out of combat — ✅ FIXED (2026-06-18, untested):** per-row ACT/BA/RE cost badge dropped out of combat (strip was already combat-only); using an action no longer auto-collapses its Actions drawer out of combat.

**Long-press detail suite — ✅ BUILT & VERIFIED LIVE (2026-06-18, CC-driven Player-1 client; [shell.js](scripts/shell.js)).** Gesture infra: a ~500ms pointer-hold (aborts on >10px move → it's a scroll) + right-click/`contextmenu` (desktop & CC-test equivalent); `#suppressClick` swallows the trailing tap so the row's normal action doesn't also fire. `#detailTargetFor` resolves the pressed element to a target via `closest("[data-uuid], [data-item-id], [data-detail]")`; `#triggerDetail` dispatches. All cards render in the shell's own `#detailCard` view (full-screen, X to close), never a native Foundry window.
- **Actionable rows (v1):** long-press any item/activity/spell row → its enriched description (`TextEditor.enrichHTML`), with the ★ favorite toggle (activity vs item) in the card header.
- **In-shell content links (supersedes the inert-link stopgap):** `@UUID` links inside a card (e.g. a spell referenced by an item, a condition referenced in rules text) are intercepted **capture-phase** (`#onContentLinkCapture` beats Foundry's handler AND the bubble `#onClick`) → `#openLinkDetails(uuid)` resolves the linked item/spell/journal-page and shows it in **this** card. This closes the journal-lockup the DM hit (a condition link opened an un-closeable native window → restart). Non-content anchors (inline rolls etc.) are made inert via CSS `pointer-events:none`.
- **`data-detail` stat targets (new general hook):** the long-press target set now includes `[data-detail]`, so non-row UI can carry detail cards. Built three:
  - **AC** (`data-detail="ac"` on the header AC frame) → `#showACDetails`: a calc-agnostic AC ledger from the prepared `system.attributes.ac` — equipped-armor/base value + dex/shield/bonus/cover (signed) → bold total; subtitle = `ac.label`. Verified: heavy Chain Mail 16→16; medium Chain Shirt 13 + dex −1 → 12; multi-component base+dex+shield.
  - **Character** (`data-detail="character"` on the name) → `#showCharacterDetails`: level/race/class(+subclass) subtitle (per-class levels shown only when multiclassed), a 3×2 ability grid (mod + score, save-proficient abilities flagged gold), prof/speed/init meta + background. Verified single- & multi-class.
  - **Condition** (`data-detail="cond"` + `data-cond="<statusId>"` on real condition chips, not econ "used" chips) → `#openLinkDetails(CONFIG.DND5E.conditionTypes[id].reference, "Condition")`: the SRD/PHB rules page in-shell. Verified: applied prone → chip → "Prone" rules card, no native window; test condition removed afterward.
  Card head gained a `glyph` branch (FA icon) for stat cards that have no item image. Commits `9b8f9ef` (AC), `54c8e4d` (PC), `9de3121` (condition), building on `3763ffd` (in-shell links).

**Long-press suite — round 2 fixes + character-info coverage (✅ 2026-06-18 later, verified live; commits `87508af`, `296cd54`).** DM feedback after the first cut:
- **Dead first X-tap (bug) — fixed.** Drilling item → spell link → the first tap on the card's X did nothing; the second closed it. Cause: a long-press sets `#suppressClick` to swallow its own trailing click, but the press re-renders the row out from under the finger so that click never fires → the flag stayed **stuck** and ate the user's next real tap (the X). The capture-phase content-link handler bypasses `#onClick`, so it even survived a link tap. Fix: **reset `#suppressClick` at the start of every `pointerdown`** (a fresh interaction can't inherit a stuck swallow). Same-gesture swallow still works (the timer re-sets it *after* that gesture's pointerdown).
- **Drill-down back-stack (`#detailStack`).** Tapping a link inside a card now pushes the current card; the X **steps back** to it, then out to the sheet — instead of one dead tap then closing everything. Cleared on a fresh long-press (`#triggerDetail`) and on `#abandonAction`.
- **Every condition chip is pressable.** Round 1 only tagged standard-5e conditions that carried a dnd5e rules `reference`, so the DM's `Hiding`/`Blessed` chips did nothing. Now every effect-backed chip carries `data-effect-id` → `#showEffectDetails` shows the best available: rules reference page → the effect's **own description** → a summary of its `changes` → "No description." (the synthetic "Action used" chip has no backing effect, so it stays inert). Verified: Hiding (no ref/desc → graceful), Blessed (own description).
- **"All the stuff in the character info area" (Details tab).** Feats & Features chips, Race/Species and Background values (faint dotted-underline hint, `data-item-id`) long-press → the item's description via `#showDetails`. Skills & Tools rows long-press → `#showCheckDetails` (ability, proficiency level, total modifier, passive for skills) while **tap still rolls** (`data-action` kept). Verified live: Fighting Style / Dragonborn / Mulhorandi Tomb Raider descriptions; Perception (Wis/Proficient/+1/Passive 11), Mason's Tools (Str/+5). adv/dis stays live via AC5E at roll time — these cards are the static facts only.

**Travel-type selector + condition Remove (✅ 2026-06-19, verified live; commits `edf19f9`, `d1a6600`).**
- **Travel type on the character card.** The Speed entry now reads "Walk 30 ft" (active travel type + speed) and is tappable → an inline picker of every mode the actor actually has (`#movementModes`: walk/fly/swim/climb/burrow with speed > 0), each with its speed; tapping sets the active mode (`#moveMode`, `#activeMoveMode` falls back to walk/fastest when the actor lacks the prior pick). Selecting also sets the **token's real `movementAction`** (a Foundry 14.363 Token field, default "walk") via a new executor RPC **`setMovementAction`** (rpc.js) — the phone has no canvas, so the round-trip is required; fire-and-forget (errors swallowed) so it never blocks the UI. Phone side verified live (Belnor walk-only → "Walk 30 ft", no caret; temp fly 60 + climb 20 → picker listed all three, selecting Fly → "Fly 60 ft", picker closed; temp speeds restored). **Executor application needs the DM's GM client reloaded** to register the RPC — flagged for live test.
- **Remove condition.** Effect-backed condition cards gained a "Remove condition" button (`removeEffectId` on the card, threaded through `#openLinkDetails` so even standard conditions that open their PHB rules page get it). Removal mirrors Foundry: status conditions `toggleStatusEffect(id,{active:false})` (rider cleanup), other effects `delete()`. Verified live: Prone (reference path) removed + card closed; temp no-status effect deleted; non-standard Hiding shows the button.

**Detail-card UX tweaks (✅ 2026-06-19, verified live; commit `8f58543`).**
- **AC: tap, not long-press** (supersedes the AC long-press in the round-1 note above). The AC stat is now a `<button data-action="ac-detail">` opening `#showACDetails` on a plain tap (it has no other tap action, so a tap is more discoverable for a bare stat); the `data-detail="ac"` long-press hook + its `#triggerDetail` branch were removed. (The name card stays long-press.)
- **Condition palette long-press.** Each cell in the add/remove palette is long-pressable (`data-detail="status"`) → `#showStatusDetails(statusId)`: if the status is active on the actor it opens that effect's card (rules + Remove), else its rules page, else a minimal card. Tap still toggles; the long-press doesn't fire the toggle (suppressClick). Verified: inactive Prone → rules only (not toggled on); active Hiding → effect card + Remove (not toggled off).

**Popup polish (✅ 2026-06-19, verified live; commit `dd5548b`).**
- **Skill/tool description in the check card** — `#showCheckDetails` (now async) appends the dnd5e `reference` page (PHB skill/tool blurb, enriched) under the stat ledger; renders the ledger first, fills the blurb after the fetch. Tools without a reference just show the ledger.
- **Rest benefits card** — `#doRest(kind)` snapshots the actor (HP, hit dice, spell slots by level, item charges, exhaustion), runs `actor.shortRest()`/`longRest()`, diffs, and shows a "Recovered" card (`#restSnapshot`/`#restBenefits`). Diffs state rather than parsing dnd5e's RestResult → robust. Cancelled dialog with no change → no card. Verified: Long Rest on a damaged/spent Belnor → "+13 HP, +2 level-1 slots".
- **Detail-card image `object-position:top`** (matches `.mc-portrait`) so the name-card portrait isn't centre-cropped.
- **Hid the inert dnd5e `a.enricher-action` icon** (the "apply condition" toggle dnd5e renders beside `&reference[...]` links) inside `.mc-detail-desc` — it crowded the real content-link's tap target (e.g. "Deafened" in the legendary rapier). The content-link itself was already intercepted/working; this just removes the mis-tap hazard.

**Detail-card depth (✅ 2026-06-19, phone-only, verified live; commits `6444a7c`, `8592d37`).**
- **Mechanical stats line** (`#itemMeta`) on item/spell cards, from dnd5e's own `item.labels` (no reimplementation): spell → activation · range · duration (Conc. flagged) · components (V/S/M) · Ritual; weapon → damage+type · reach/range · properties; else activation · target · range. Shown on long-pressed items and content-link-drilled items/spells. Verified: Greatsword "2d6 Slashing · reach 5 ft · Heavy, Two-Handed"; Blade Ward "Action · Self · Conc., 1 minute · V, S".
- **Biography** (`#showBioDetails`, `data-detail="bio"` on the portrait): tap still opens the image popup, long-press opens the enriched biography card. Verified live (Belnor, 625-char bio); tap-vs-hold separation holds (suppressClick).


**Save / reaction prompt surface on the phone (§7.4/§7.6) — ✅ BUILT (Round 17, 2026-06-16, untested).** Problem: when an AoE/save hits a phone player, midi (`playerRollSaves:"chat"`) delivers the request as a **whispered chat card** with NO flags (`requestPCSave` → plain `ChatMessage.create({content, whisper})`, midi-qol.js:14749) — and the full-screen shell **hides native chat**, so the player never sees it; `playerSaveTimeout` then silently auto-rolls (DM saw this on a *native* client: "popup stopped damage, closed after a few seconds, had to go to chat"). Because the card carries no flags, parsing it is fragile. **Built instead (executor relay):** the executor hooks **`midi-qol.preTargetSave`** (fires per target on the workflow client right before the save is queued, midi-qol.js:29672) and pushes a structured request — `{actorUuid, abilities, dc, advantage, disadvantage, isConcentration, spellName, ttlMs}` — to the target's active owners via socketlib (`registerSaveRelay` in [rpc.js](scripts/rpc.js); handler `handleSavePrompt`; `remoteState.savePrompt`). The phone shows a **persistent, tappable card** above the tab bar (`#savePromptHTML`, `noteSavePrompt`) — "⚡ <spell> — Roll DEX (DC X)" — and tapping calls `actor.rollSavingThrow({ability})` on the specific target actor, which opens the native (Restyled) save dialog and **midi intercepts** (Spike 3). Auto-clears after `ttlMs` (= midi's `playerSaveTimeout`) so it doesn't linger past the auto-roll; manual ✕ too. **Scope:** ability saves only for now (skills/tools/custom rolls skipped — player rolls those manually); same relay should later carry **reaction** prompts (§12 Round 4). **Live test 1 (2026-06-16): prompt did NOT appear on the phone** — the DM rolled the save instead and the flow worked. Prime suspect: the target's owner was not `active` from the executor's view at save time (midi then routes that save to the **GM** — which matches "rolled on the DM" — and the relay's `u.active` filter skips them identically; cf. the earlier `Player 2 [active:false]` reading). Added console diagnostics — relay logs `mobile-command | save relay {actor, abilities, owners}` on the executor and `savePrompt received` on the phone — so the next run shows exactly where it breaks (hook didn't fire / owners empty / socket didn't reach phone / shell didn't render). Re-test with **both** the executor and phone reloaded and consoles open.

**UI / interaction (deferred):**
- **Favorites** — ✅ **built (Round 8):** a favorites *container* in the Explore tab, backed by dnd5e `system.favorites`, curated via the Actions bookmark toggle. **Still TODO:** make it the true *landing view* (§7.2); allow favoriting **skills/tools/items** from their own surfaces (only **activities** are togglable on the phone so far — skills/tools added from a laptop still render); reorder/drag; group with the long-press "favorite/unfavorite at top" context action.
- **Details identity block redesign** — DM dislikes the current class/subclass/race/background key-value rows (Round 8). Redesign later; group with the long-press detail-card work.
- **"Metallic glimmer" scroll effect** (later version) — faint (~15% opacity) diagonal white bar sweeping on scroll (right down / left up), maybe doubled over button rows. Cosmetic polish.
- **"Show player" image popup** (not tab-bound) — DM-opened full-screen image on the phone, X to close; hook Foundry's native "Show Players" image share (`ImagePopout` / `shareImage` socket) into a full-screen overlay above the shell. Pairs with the long-press portrait↔token popup.
- **Settings** — NOT a bottom tab (7 won't fit; ~5 max). Put behind a gear in Details; move the "Leave" button there. Later: themes (DM wants a theme picker).
- **Long-press suite** (gesture infra ✅ built 2026-06-18, see the dated note below): details card on any actionable row; **AC breakdown** (long-press the AC frame); **character summary** (long-press the name → level/race/class + ability grid); **condition rules** (long-press a condition chip → in-shell). Full-screen image popup (switch portrait ↔ token) handled instead by tap-on-portrait (DM call). Drill-into-subcategories / favorite-at-top context menu still open.
- **In-range badge** (B8) — color targets by reachable; pass the activity range into `targetsList`.
- **Group Actions by activation type** — ✅ **built (2026-06-15):** the Actions list buckets activities by `activation.type` into Action / Bonus / Reaction / **Free** (`special` or no-cost activations, e.g. Action Surge) / Other (timed/rest), with color-coded sub-headers; a single group skips the sub-header. Favorites-edit mode and the picker work per row unchanged.
- **Resource counters** (Rage, Ki, Action Surge uses, etc.) — ✅ **built (option 1, Round 9, untested):** a `value/max` use-counter badge on each Actions-tab row whose item has `item.system.uses.max > 0` (red at 0). Source is **`item.system.uses`** = `{ value (= max − spent), max, recovery[] }` ([dnd5e.mjs:11510](DESIGN.md)). **TODO:** a dedicated Resources section (option 2) and tap-to-spend/restore; legacy `system.resources.{primary,secondary,tertiary}`; favorites/spell-row badges. **3rd-party caveat:** exotic/module resources outside `uses`/`resources` are out of scope → DM-from-laptop (warnings-not-walls), with a possible D6 adapter hook later.
- **Action-economy indicator** — ✅ **built (2026-06-15):** an ACT/BA/RE availability strip atop the Actions tab (combat only), color-coded (action=blue, bonus=green, reaction=violet) to match the group sub-headers; lit = available, struck-through = used. Favorite *activity* rows show the same badge on the far right. Reads midi's `flags.midi-qol.actions` directly (no canvas/RPC), re-renders on `updateActor`. **Requires `enforce*Actions: "displayOnly"`** (preset updated; DM must apply via the enforcer) for BA/RE to record — ACT works regardless. **Untested live.** Could also mirror onto the Turn HUD later.
- **Containers** open a popup of their contents (with inventory build).
- **Out-of-combat group-token** movement for the move pad (currently moves own token).
- **"Follow leader"** (later version) — familiars/summons trailing the PC's movement; likely an existing module rather than custom. Pairs with the owned-token switcher (§7.1, built Round 15).
- **Swipe between tabs** (nice-to-have).

**Character-sheet capabilities not yet on mobile (DM asked "what else"):**
- **Death saves** — ✅ **built (2026-06-14):** at 0 HP (character, `hp.value <= 0`) the content area collapses to a death-save panel — 3 success / 3 failure pips + a big "Roll Death Save" button → `actor.rollDeathSave()` (document-level, no canvas; dnd5e tallies, stabilizes at 3 successes, nat-20 restores 1 HP). Shows "Stabilized"/"Dead" at 3/3. Overrides all tabs while down; the roll uses the native dialog (restyled). Not turn-gated (warnings-not-walls). **X-to-dismiss added (2026-06-16, DM request):** an X closes the panel so the player sees the normal sheet even at 0 HP (the DM may rule otherwise — "the rules aren't always as important as the DM's call"); a "💀 At 0 HP — death saves" chip reopens it while still down, and it re-arms automatically once healed above 0.
- **Spells** — ✅ **built (Round 9, untested):** a Spells tab (replaced the Equipment placeholder) — slot counters, prepared count, spellbook by level, prepared toggles, cast → Actions picker. **TODO:** slot-level upcast choice on the phone (§7.5), and re-home the Equipment tab now that Spells took its slot.
- **Spellbook module** support — DM wants it a later version.
- **Concentration** — ✅ **built (2026-06-14):** if the actor is concentrating, the condition palette shows a "Break concentration" button → `actor.endConcentration()`. (Can't manually *add* concentration — it comes from casting.)
- **Condition add/remove** — ✅ **built (2026-06-14):** a "+" on the conditions row opens a palette of `CONFIG.statusEffects` (tiny icon + name, active highlighted); tap toggles via the document-level `actor.toggleStatusEffect(id)` (no canvas; dnd5e applies riders). **Untested live** — verify a toggled condition behaves mechanically (midi/DAE automation) and that ownership permits the write. **Follow-up:** exhaustion is leveled, so the toggle only does on/off (0↔1) — proper level stepping is a small later add.
- **Currency** (gp/sp/…), **exhaustion** level (see condition note above), **biography/notes** editing — not present.
- **Inventory / Equipment tab** — ✅ **built (Round 18, 2026-06-17, untested):** a 6th icon tab (suitcase). Physical items (`"quantity" in system`) grouped Weapons/Equipment/Consumables/Tools/Containers/Other; each row shows icon + name + ×qty, an **equip** toggle (shield, where `"equipped" in system`) and **attune** toggle (sun, where `system.attunement` is set; amber when required-but-unattuned) → `item.update({"system.equipped"/"system.attuned"})`; tapping an item with a usable activity opens the Actions picker (potions/scrolls/wands — now consumes, per §6.2). A read-only **currency** row (pp/gp/ep/sp/cp from `actor.system.currency`) sits on top. **Container contents — ✅ done (Round 18):** contained items (`system.container`) are hidden from the top level and shown nested when their container row is expanded (recursive). **TODO:** currency editing (tap-to-edit), item transfer between containers, capacity/weight readout, equip/attune mechanical riders verified live. **Verified live (2026-06-18, CC-driven):** currency row + grouped items render; **container expand works** (Dungeoneer's Pack → 8 nested items incl. a recursive nested container, not duplicated up top). **GAP found:** the row use-finder (`#inventoryRowHTML`, picks first activity in `[attack,save,damage,utility,heal]`) **excludes `cast`-type activities**, so a multi-activity item only exposes its first non-cast activity — the Staff of Healing offers only its quarterstaff attack, NOT its Cure Wounds/Lesser Restoration/Mass Cure Wounds **casts** (the item's purpose + the charge-consumers). Needs a multi-activity picker + Route-B validation of `cast` activities (task tracked). **✅ RESOLVED & VERIFIED LIVE (2026-06-18):** tapping a multi-activity item now opens an activity picker (`#itemActivityPickerHTML`, incl. `cast`), and `cast` activities auto-resolve on the executor (`autoRollDamage:"always"`) — a `cast` spawns a workflow for the LINKED spell whose uuids don't match what the phone sent, so the parked-workflow scan can't track it; parking it would orphan the roll + spend the charge for nothing. Auto-resolve applies the effect + consumes the charge in one tap. Verified: Staff → Cure Wounds → Self rolled 14, applied, Staff uses 4→3, no orphan card. **Tradeoff:** item-cast effects auto-roll (not player-rolled — minor D4 deviation, acceptable for item casts). Preserving a player roll would need findParkedWorkflow to match the linked-spell workflow (deferred). **Global item-use (2026-06-18, DM "no per-item fixes"):** the Equipment tab now applies **NO activity-type allowlist** — `#itemUsableActivities` surfaces every `canUse`/non-automationOnly activity, so any item (summon/check/enchant/future types) is tappable (multi → picker, single → direct). Execution stays Route B on the executor (a full client runs any type); `#pickAction` flags `autoResolve = type ∉ {attack,damage,save,heal}` → those player-rolled types park for the two-tap, everything else auto-resolves to completion on the executor (no orphaned roll card / wasted charge). Template/AoE still → DM-place. Verified live: legendary rapier + staffs + Horn surface & open (were dead); cast executes end-to-end. Summon/check fire un-verified (summon would spawn uncleanable test tokens) — DM sanity-fire when convenient.

**Verification still owed (built, untested by CC — no live client):** UI rounds 3–7; the reactions popup (midi `doReactions:"all"` should fan to the owner's phone like saves — confirm live); the **AoE push** (announce → DM Place; §11 — needs two clients); Spike 4 (sense/latency on the real LAN); Spike 5 full (iOS resync/wake-lock/audio); Spike 6 (TV reticles, needs the TV client).

**Known non-bugs:** test Fighter's Speed shows 0 (actor/Foundry data quirk, not ours).

**2026-07-20 light-source items give light — MVP BUILT (native).** A phone player taps the **flame
toggle** on a torch/lantern/lamp/candle/bullseye-lantern row (Equipment tab) → their token emits light;
tap again to put it out. `#lightConfigFor` (shell.js) is a **name-based** radius lookup (torch 20/40,
lantern 30/60, bullseye 60/120 @60°, lamp 15/45, candle 5/10 ft — never bare "light", which would catch
a Light Crossbow). `handleSetTokenLight` (rpc.js, executor, owner-gated) writes `token.light` and tracks
`flags.<id>.litItem` so the toggle is stateful. Warm flame colour + torch animation.
- **Module findings (DM asked to check):** the **Torch** module (v3.3.0) ships **minified** — no
  readable API to integrate. The **Light Sources** module (foundryvtt.com/packages/light-sources, NOT
  installed) activates lights via the **Token HUD flame button**, which a canvasless phone can't reach,
  and its store page documents only a `registerSources()` hook (no activation API) — so we went
  **native** instead of depending on it. **Caveat:** if the DM later adopts the Light Sources module,
  the two would both write `token.light`; switch the phone toggle to drive that module's API then.
- **Out of scope (DM):** Torch's *drop-a-torch* / light-on-the-ground — skipped.
- **Untested; heuristic detection** — homebrew light names may miss (refine the lookup or add a flag).

---

## 14. Why the phone has its own adv/dis buttons — and the spike to remove them

**Question (DM, 2026-06-14):** midi's roll dialog already has Advantage/Normal/Disadvantage and now renders full-screen — why keep our own adv/dis buttons; can't we just use midi's popup?

**Reason it's not trivial — Route B workflow locality:**
- Checks/saves roll *on the phone* (`actor.rollAbilityCheck`; saves routed to the target's client), so midi's native dialog opens on the phone and the Prompt Restyler makes it usable. No custom adv/dis there — already native.
- Attacks/damage go through **Route B**: a no-canvas phone can't build a midi Workflow (Spike 2 PlaceableObject crash), so the Workflow runs on the **executor/DM**, and any dialog it spawns appears on the **DM's screen, not the phone**. We therefore **fast-forward the roll and pre-collect adv/dis on the phone** (our buttons). Dropping them and letting midi show its dialog would pop the prompt on the DM's laptop, unreachable by the player. The Restyler can't help — it only restyles dialogs rendered *on the phone*.

**Spike (do before removing the buttons). DM-preferred path = #1 (optimal if possible):**
1. **★ PREFERRED — route the attacker's attack/damage roll to the player's client** the way `playerRollSaves` routes saves to the defender. midi can push a roll to a specific user (saves/reactions prove it); confirm it works for the *attacker's* roll. If yes: the native dialog (adv/dis + situational bonus + crit) opens on the phone, the Restyler makes it usable, and we **delete our adv/dis buttons** — strictly better. Investigate `midiOptions` roll routing / `rollAs` / a player-roll-attack setting in midi 14 source.
2. Fallback — phone rolls the attack d20 locally (native dialog, like a check) and feeds the result into the executor's workflow (verify midi accepts a supplied/pre-rolled attack).
3. If neither works: keep the pre-collect buttons and grow them into the §7.5 pre-roll screen (add a situational-bonus field).

**Spike finding — path #1 is NOT readily available (source read, 2026-06-18, midi-qol 14.0.8).** The DM re-raised this as the desired fix ("sword > choose targets > foundry popup pushed to the app, so the proficiency/disadvantage recommendation shows"). Read of `midi-qol.js`:
- midi routes the *attacker's* roll to a client only via `usage.midiOptions.asUser` (`completeActivityUse2`, ~15748/15822: `socketlibSocket.executeAsUser("completeActivityUse", asUser.id, …)`), which runs the **entire workflow** on that client — i.e. the no-canvas phone, which is exactly the Spike-2 PlaceableObject crash. So "native attack dialog on the phone" via `asUser` is dead for the same reason Route A was.
- There is **no per-roll attack delegation** equivalent to saves. Saves are special-cased: `requestPCSave`→`socketlibSocket.executeAsUser("D20Roll", player.id, …)` (~14763) pushes only a d20 to the defender because the defender is a *different* user than the workflow owner. The attacker normally *is* the workflow owner, so midi never needed an attacker-side equivalent; `rollAs` (7235/15814/26910) only re-attributes a roll to a target/source actor for over-time & "roll other" features — it is **not** client routing.
- The attack-dialog suppression itself works as expected: `fastForwardAttack:true` is honored (`isAutoFastForward2("attack")`, 16870) → no dialog. But midi **force-shows** the attack dialog regardless of fast-forward when the activity is a **thrown weapon** (`thr` property, rollAttack 9445), needs **ammunition confirmation** (9442), or has `midiProperties.forceRollDialog:"always"` (`getEffectiveForceRollDialog`, 9033). That is the most likely cause of "weapon opens the attack-roll popup on the DM" — and it is NOT a regression (it would always have done this); a longsword (no `thr`) fast-forwards fine, a dagger/handaxe/javelin/spear/bow does not.

**Conclusion / decision:** path #1 (literal "native dialog on the phone") is blocked without first solving the Spike-2 no-canvas Workflow crash, or building a custom "executeAsUser D20Roll for the attacker, then feed the pre-rolled d20 into the parked executor workflow" hack (path #2 — feasibility of feeding a supplied attack roll into a midi workflow still unverified). The **pragmatic near-term answer is path #3 grown**: keep the phone's pre-roll buttons but **surface Foundry's recommendation on the phone** — compute proficiency + advantage/disadvantage sources for the activity on the phone and annotate/recommend the right adv/dis button (e.g. "Not proficient — roll at Disadvantage"), since that data is plain actor/item state readable without a workflow. Revisit path #2 only if the DM still wants the literal native dialog.

**Spike resolution — path #3 via AC5E's OWN evaluation on the executor (2026-06-19, DM picked this as the next chunk; source read of automated-conditions-5e 14.533.6.1 + live probing on the phone).** Decision: do NOT re-implement the adv/dis rules; **ask AC5E**, on the executor (the only client with the canvas + the target tokens AC5E needs).
- **Phone cannot evaluate an attack — proven live.** AC5E's attack path (`ac5e-hooks-roll-attack.mjs::preRollAttack`) bails at `if (invalidTargets && needsTarget !== 'source') return false;` with no target, and the phone (noCanvas) has no tokens/targets at all. A phone-side `activity.rollAttack({},{configure:false},{create:false})` ran without error and without crashing midi, but `config.options['automated-conditions-5e']` was never populated (AC5E bailed). So the recommendation must be computed where the canvas + target live: the **executor**.
- **`ac5e.statusEffectsTables` can't shortcut it.** It's populated (blinded/poisoned/prone/…) and marks which roll types a condition touches (`rules.attack` key present) but the **mode is empty (`{}`)** — the actual adv/dis lives in the evaluation logic, not the table. So no cheap phone-side lookup.
- **The capture mechanism (source-grounded).** On the executor: set the target(s), register a one-shot `dnd5e.preRollAttackV2` listener (fires *after* AC5E's, which registers at init), call `activity.rollAttack({}, {configure:false}, {create:false})`. AC5E annotates **`config.options['automated-conditions-5e']`** (`ac5e-config-logic.mjs`: reads/writes `source.options[MODULE_ID]`) with `{ advantageMode, defaultButton, subject:{advantage[],disadvantage[],fail[]}, opponent:{…}, tooltipObj }` — `defaultButton`/`advantageMode` = the recommended button, the `subject`/`opponent` arrays = the human-readable reasons. The listener captures that and returns **`false`** to abort the roll (no dice, no chat). Relay `{advantageMode, defaultButton, reasons}` to the phone; the phone highlights the matching adv/normal/dis button + lists the reasons, and Route B proceeds with whatever the player picks.
- **Unverifiable from here (needs the DM's GM client):** (a) returning `false` aborts cleanly with a real target + midi present (no orphaned workflow/chat); (b) hook order with a target. So the executor RPC ships **instrumented** (returns the raw capture on first runs) and is flagged for a DM live test, like `setMovementAction`. **Build:** `attackPreview` RPC (rpc.js, executor) + phone recommendation UI in the target picker.

**STATUS 2026-07-12 — BUILT END-TO-END, AWAITING THE DM'S LIVE VERIFICATION (the spike's actual deliverable).** Verified by code read: `rpc.js handleAttackPreview` = executor-only; it targets the chosen tokens, registers a one-shot `dnd5e.preRollAttackV2` listener, rolls the attack **blind + hidden** (DSN suppressed via `diceSoNiceRollStart`→false, card blocked via `preCreateChatMessage`→false, any residual message deleted, targets restored) — because a midi-wrapped attack ignores the plain abort and rolls a real die, so the impl HIDES rather than aborts (evolved from the original plan). It captures `options["automated-conditions-5e"]` → normalises `{mode, reasons}` (defaultButton/advantageMode + subject/opponent advantage/disadvantage/fail arrays) → returns `raw` for diagnostics. Phone (`shell.js`): `#refreshAttackPreview` calls it on target change; the target picker shows a "Checking adv/dis…" spinner, then stars the recommended adv/normal/dis button (`.mc-adv-rec`) and lists the named reasons (`.mc-rec`). AC5E-absent → `{mode:"normal", unevaluated:"ac5e-not-active"}` (no hint, by design — we don't reimplement the rules). **DM live test:** reload the DM/executor client; on a phone, tap a weapon attack → pick a target that has an adv/dis condition (e.g. attacker/target Prone, Poisoned, Restrained, or flanking if enabled) → the picker should star the correct button (e.g. Disadvantage for attacking a Prone creature at range) and list the reason. **Watch for regressions the code guards against:** a flashed d20 or a stray attack card on the **TV** (would mean a suppression path leaked), the real attack's total reading "—" (throwaway animation stalled the real roll), or the phone stuck on "Checking adv/dis…" (AC5E didn't annotate → check the executor console `attackPreview` debug line: `mode`/`raw`).

---

## 15. Party Mode / marching order (DM-idea, spec 2026-07-02)

**Concept (DM).** When the party is clustered, the DM "packs" the group's member tokens into the single **native dnd5e group token** (travel state). While packed, each player arranges the party's **marching order** on a shared **3×3 grid** on their phone (tap a cell → your token goes there; a "forward" arrow marks travel direction). When the DM "unpacks," the member tokens reappear in that 3×3 formation around where the group token stood, rotated to the DM's chosen facing (so "forward" points down the corridor). Built **native — no Crunch My Party / Group Tokens dependency** (learned from both; depends on neither). **Feature 1** = the editor + pack/unpack (this spec). **Feature 2** (deferred) = live walk-in-formation movement (overlaps Follow-the-Leader/Squadron; a separate, larger build).

### 15.1 Investigation findings — native dnd5e group actor (live, 2026-07-02; offline-test, Foundry 14.364 · dnd5e 5.3.3)
Probed the world's rebuilt group `bTNHugymMcYIqpqz` ("Group", 4 PCs: Aurelio Brightsong, Selene Moonshadow, Ember Vexscale, Grukk Battleborn) via the GM/console. **The edges are softer than feared (DM was right):**
1. **`system.members` is a plain `Array<{actor: Actor5e}>`** — clean and iterable. (Not a Map/Collection.)
2. **Group system prototype methods:** `addMember`, `removeMember`, `getMembers`, `getPlaceableMembers` (⚠️ does NOT return a plain array — `.map` threw; enumerate carefully or just use `system.members`), `getTravelPace`, `rest`, `rollSkill`. Sheet = `GroupActorSheet` with only `_onDropActor`/`_onDropItem` — **no native "deploy all members to the scene," so we place tokens ourselves** (via `TokenDocument.create`/`.delete` on the executor — exactly the calls CMP makes; no special API needed).
3. **All 4 PCs are `prototypeToken.actorLink: true`** → **delete-and-recreate member tokens on pack/unpack is lossless** (HP/effects live on the actor, not the token). This is the chosen mechanic. (Guard: if a member is unlinked, prefer hide/move over delete, or copy token state — warn.)
4. **The group token has NO vision** (`sight.enabled:false, range:0, visionMode:"basic"`). So "packed vision" is **not** automatic. **Decision (easiest, per DM):** on pack, the executor writes a sensible sight onto the group token — `sight.enabled:true`, `range = max(member sight/darkvision)`, and a darkvision detection mode — so the TV (Monk's Common Display, which merges *owned-token* vision) still sees while packed. There's already an `api.syncPartyTokenSight` on the phone client API — reuse/extend it. (Truer alternative — keep members as hidden vision-sources — is deferred.)
5. **Grid = 260px / 5 ft.** 3×3 cell offsets are `±gridSize` from the group-token cell; **group token = center**, members fill center + 8 neighbors. Facing = a 90° rotation of the 8 offsets.
6. **Quirk:** the group token's `disposition` is `-1` (hostile). On pack, set it friendly/secret so the TV/party don't read it as an enemy.
7. **All members** have darkvision 60, sight 60 (so packed range = 60).

### 15.2 Locked design decisions (DM, 2026-07-02)
1. **Pack is gated on clustering** — only offered when all member tokens fit within a 3×3 (executor grid check). **Unpack is blocked when the destination 3×3 doesn't fit** (walls / occupied cells) so PCs never appear inside a wall or on another token → **tight-corridor fallback: the DM places the tokens manually** (no auto-pathfinding; that's the Group-Tokens rabbit hole we explicitly avoid).
2. **Group token = center of the 3×3; PCs fill center + the 8 around it. The DM picks facing before unpack** (rotate-L / rotate-R, applied as a 90° transform of the offsets).
3. **Fixed 3×3, one token per cell (max 9).** No scaling — a >9-PC party around one TV isn't a case we serve.
4. **No live collision-locking during placement** (avoids latency/phone-race edge cases): anyone may tap any cell; the safeguard is only that **"Done"/deploy is disabled unless every occupied cell is unique**. Nothing breaks if players "fool" it — the DM fixes. This is warnings-not-walls (§11).
5. **Each player locks their own cell with "Done"; the DM has final authority ("Deploy")** — the group can be dispersed once the DM commits, regardless of who has/hasn't locked.
6. **Combat interaction:** entering combat does **not** force an unpack, but **adding the group to combat highlights the "Unpack/Disperse" button** as a nudge (packed initiative is nonsensical). *(Working name for the button TBD — "Disperse" / "Fall out" / "Deploy".)*

### 15.3 Mechanics
- **State store:** the formation lives in a flag on the group actor — `flags.mobile-command.formation = { cells: { "<actorId>": {r, c} }, forward: <0..3>, locked: [<actorId>...] }` (r,c ∈ 0..2). Written via the executor (players can't edit a group they only observe — same broker pattern as the party journal). Broadcast changes over socketlib so every phone + the TV stay in sync live.
- **Pack (executor):** verify cluster; snapshot each member token's scene position (optional, for a future "return to exact spots"); `delete` member tokens; ensure a group token exists at the cluster centroid (create from the group actor if absent); write packed vision + friendly disposition; set a `flags.mobile-command.packed = true` marker. Phones flip to Party Mode UI.
- **Unpack/Deploy (executor):** read `formation.cells` + `forward`; compute each member's target = `groupCell + rotate(offset(r,c), forward)`; validate every target cell is in-bounds, wall-free, and unoccupied → if any fails, **abort with "doesn't fit — place manually"**; else `delete` the group token and `create` each member token at its cell. Clear the packed marker.
- **Rotation:** offset for (r,c) relative to center (1,1) is `(dx,dy) = (c-1, r-1)` in cells. `rotate((dx,dy), k)` applies k×90° CW: `k=1 → (−dy, dx)`, etc. Multiply by `gridSize`, add to the group token's top-left. Center cell (1,1) maps to the group token's own cell for any facing.

### 15.4 RPC contract additions (§5)
| Endpoint | Direction | Payload | Returns | Notes |
|---|---|---|---|---|
| `party.pack` | DM/phone → Executor | `{groupId}` | `{ok}\|{ok:false, reason}` | Cluster-check + collapse to the group token; writes packed vision/dispo. |
| `party.setCell` | Phone → Executor | `{groupId, actorId, r, c, lock?}` | `{ok}` | Broker the formation flag write for one member; broadcast to all. |
| `party.setForward` | DM/phone → Executor | `{groupId, forward}` | `{ok}` | Set travel facing (0..3). |
| `party.deploy` | DM → Executor | `{groupId}` | `{ok}\|{ok:false, reason:"nofit"}` | Unpack into the formation+facing; abort if it doesn't fit (→ manual). |
| `party.state` | Executor → all (broadcast) | `{groupId, packed, cells, forward, locked}` | — | Push on every change so phones/TV mirror live. |

### 15.5 Build plan
- **Feature 1 (this spec) — Medium (~1–2 focused days):** phone 3×3 editor (shared, per-player Done, forward arrow, Done-gated-on-unique) + executor pack/deploy RPCs on the native group + packed-vision handling + combat-nudge highlight. Reuses existing infra: socketlib broadcast, executor token ops, flag-broker (party journal), the shell's DOM idioms.
- **Feature 2 — deferred (High):** live formation-locked travel movement (the "forward" arrow drives ongoing group movement). Overlaps Follow-the-Leader / Squadron; pairs with the §13 "Follow leader" / "out-of-combat group-token movement" backlog items.
- **Verification:** needs a multi-client live pass (≥2 phones + executor + TV) — the shared-grid sync and the deploy-into-facing are the parts to watch.

**Build status (2026-07-02).**
- ✅ **Executor RPCs built + wired** ([rpc.js](scripts/rpc.js)): `partyPack` (cluster-check → pre-fill formation from current layout → group-token vision/dispo write → delete member tokens), `partySetCell` (owner-gated flag broker), `partySetForward` (GM-only), `partyDeploy` (rotate+place with bounds/wall/occupancy validation → `nofit` abort → recreate members, delete group token). Registered + added to the `toExecutor` map + `api.party*`. **Untested end-to-end** — the token delete/recreate is destructive + canvas-bound, so it needs a supervised executor session (same "reload the GM client" caveat as every other rpc.js change).
- ✅ **Phone editor built + verified live end-to-end** ([shell.js](scripts/shell.js)/[shell.css](styles/shell.css)): `#partyGroup`/`#partyModeHTML` + the `#tabContent` overlay + `party-cell`/`party-done`/`party-forward`/`party-disperse` handlers + `updateActor`/create+deleteToken re-render hooks. **Verified on a reloaded Player-1 client against a REAL pack** (DM ran `MobileCommand.partyPack` live): the 3×3 renders with member portraits, the player's own PC is gold-highlighted, FORWARD arrow + hint + Done show, and **tapping an empty cell moved the PC via the real executor** — `partySetCell` wrote the server flag and every client re-rendered (full round-trip confirmed).
- 🐞 **Fixed during that test** (2026-07-02): while packed, member tokens are deleted, so the group token was the only owned token on-scene and `get actor()` bound the phone's subject to the **group** — breaking per-player placement (the editor keys "my PC" off the subject). Fix: `#ownedTokens()` now excludes `type==="group"`, and `get actor()` binds to the player's own **member PC** (assigned if a member, else first owned) while packed. Verified: subject resolves to a real PC, own-cell highlight + Done work. *(Multi-PC-owner test rigs can only place their primary from one phone — a real game is one PC per user.)*
- ✅ **Pack + deploy verified live by the DM (2026-07-02):** `partyPack` collapsed the real party; `partyDeploy` placed them (after moving the group token one square off a walled spot — which motivated the round below).
- ✅ **Round 2 (DM feedback 2026-07-02, built):**
  1. **Deploy never hard-blocks (warnings-not-walls).** New exported `partyDeployPreview(groupId)` (executor-local, needs canvas) computes each member's landing spot + `why` (behind a wall / occupied / stacked / off the map). `partyDeploy` now takes `force`: without it a problem returns `{ok:false, reason:"nofit", blocked[], detail:"Can't deploy while <name> is <why> — move them, or Disperse anyway"}`; with `force:true` it deploys regardless (stacking allowed; DM fixes after). **Only off-the-map stays a hard stop** (an off-scene token is unreachable).
  2. **DM-panel marching-order mirror** ([dm-panel.js](scripts/dm-panel.js)): whenever a group is packed, the DM panel shows the live 3×3 (portraits, lock badges, stack badges) with **red cells** = problematic at the current group position/facing (recomputed when the group token moves — so the DM can slide the token and watch cells clear). DM moves anyone: click member → click destination (`partySetCell`; GM may place any member). Rotate-L/R + **Disperse**, which arms into a red **"Disperse anyway"** after a `nofit` (disarmed by any layout/facing change, so a stale force can't slip through). Deploy-with-warnings toasts which members landed badly.
  3. **True-square, bigger cells** (phone + DM grids): CSS-grid tracks + `aspect-ratio:1/1` with explicit `height:auto` (core Foundry's `button` height rule was beating the ratio — cells rendered 121×28; now 121×121, verified live). Tokens 46→62px on the phone.
- ✅ **Round 3 (2026-07-02): fully button-driven.** The DM panel now shows **"Form up"** whenever an unpacked group with members exists (packing validates clustering on click and toasts the reason if scattered) — no more console macros. **Combat nudge** built per decision #6: adding the packed group to the combat tracker makes Disperse **pulse gold** (create/deleteCombatant hooks; nudge, never force).
- ✅ **Round 4 (DM feedback 2026-07-02): rotate rotates the PARTY, and the grid is now WYSIWYG.** Rotate previously only changed the abstract `forward` and applied the rotation at deploy — the grid didn't move (DM: "rotate should rotate the party in the MO grid") and, worse, the red-cell preview was keyed by *unrotated* cells so it misaligned with real landing spots whenever forward≠0. Now `partySetForward` **bakes the 90° rotation into the members' cells** ((r,c)→(c,2−r) per CW turn); deploy/preview place **cells verbatim** (grid = map-space, north-up = a true minimap of the landing). `forward` remains only as the cosmetic facing arrow. No client changes needed (grids render from the flag). `rotateOffset` deleted.
- 🐞 Also fixed (2026-07-02): DM-panel party styles used `var(--mc-*)`, but those variables are **scoped to `#mobile-command-shell`** (phone-only) — invalid on the DM client, so Form up/Disperse rendered dark-on-dark ("nearly invisible"). All `.mc-dmp-party-*` rules now use the panel's literal palette; comment added warning future panel styles. Panel also **self-clamps to the viewport** on render/resize + `max-height` scroll (saved drag position + new sections had pushed the buttons below the screen edge, y=1214). **Version bumped 0.1.66** so Foundry cache-busts every client (the DM's browser kept serving stale CSS through F5; manifest changes need a Foundry app restart to take effect).
- ✅ **DM live pass (2026-07-02): "looks great"** — Form up / grid / rotate / Disperse verified on the GM client after the 0.1.66 cache-bust.
- ✅ **Round 5 (2026-07-02): party travel from the phone.** While packed, the party screen carries its own D-pad ("Move the party") that steps the **group token** via the existing `moveRequest` (wall-validated; refusals show in the pad's readout). Executor permission extended: any **member-owner** may drive the packed group token (players don't own the group actor). TV camera predicates (`partyFrame`, `tvPartyFollow`) now treat the packed group token as "the party" so the display follows it. **Verified live end-to-end** (CC-driven Player 1: pad tap moved the real group token one square east through the executor, then back; wall/permission paths return readouts). Closes the original "move the group token out of combat" MVP goal. Note: while packed, the party screen overrides all tabs — packed = travel mode, players can't fire actions until dispersed (consistent with the combat nudge).
- ✅ **Round 5b (2026-07-02): phone action SFX + haptics (player-pilot keeper).** `#sfx(kind)` in [shell.js](scripts/shell.js) — the acting player's own taps play **locally on their phone** (never broadcast): action fire + damage tap → `CONFIG.sounds.dice`, incoming save prompt → `CONFIG.sounds.notification` + a distinct double-buzz (attention cue for eyes-on-TV moments, §6). `navigator.vibrate` is feature-detected (Android-only; silent no-op on iOS). v1 uses **core sounds only** (nothing bundled); upgrading to real weapon/damage SFX packs is an open **asset decision** (bundle a CC0 pack vs. lean on midi's own Sound Config Panel, which the DM can populate per-action without our code). Audio unlock: the triggering tap is itself the unlock gesture, so iOS plays it.
- ✅ **Round 6 (DM feedback 2026-07-02): two-stage packed mode — "Lock in".** The DM flagged the missing phase transition ("the DM doesn't have the lock-in button that returns the players to movement control"): arranging and traveling were one merged screen. Now `formation.stage: "arrange" | "travel"` (new GM-gated `partyStage` RPC; pack starts at `arrange`; missing stage on old flags defaults to `arrange`):
  - **arrange** — grid editable, per-player Done locks, NO move pad. DM row/panel shows **Lock in**.
  - **travel** (after Lock in) — header flips to "Traveling", grid becomes a **read-only formation display** (cells inert), Done hidden, and the **move pad appears** for every member-owner. DM button becomes **Rearrange** (flips back). Rotate + Disperse available in both stages; the DM can still move members from the panel grid in either.
  - This implements §15.2 #5's "DM has ultimate authority over when it's really done" as an explicit phase gate. **Verified live** (Player-1, real packed state + client-side stage mock): arrange = Done+tappable cells+no pad; travel = "Traveling"+inert cells+pad+correct hints.
  - **Round 7 (DM 2026-07-03): "Party OS" — packed mode became a tabbed UI** (was a single takeover screen). While packed the bottom bar swaps to: **Party view** (group-card member roster: portrait, HP bar+temp, HD, AC, speed, Perception/Investigation/Insight mod+passive — per the DM's group-sheet screenshot, minus faction standing & group rests), **Shared inventory** (the GROUP actor's own items = the party stash; v1 read-only browse + long-press details; transfers = the v2 item-transfer feature), **Journal** (existing party journal), **Exploration** (the marching order, move pad now ABOVE the grid, pad still travel-gated), and **My sheet** — which returns to the FULL normal PC UI (a gold Party tab flips back). Tokenless document-level play works from My sheet: checks/skills/saves/items/feats — verified live, Stealth rolled with the token off-canvas (**the "group stealth check" scenario**); attacks/targeting still need a token (warnings-not-walls). The PC sheet's Explore pad drives the PARTY token while traveling ("move in both"). DM panel's marching-order section is now an **accordion** (chevron header, remembers state per render). All verified live on Player 1 except the DM-side accordion look (GM client). **FUTURE (DM): downtime activities + guard-duty roster** — party-mode tabs are the natural home; not designed yet.
  - **Round 8 status (2026-07-03): tasks #8/#9/#10 BUILT + phone-verified live** (mocked pack; server was dispersed): new tab order Party/Order/Explore/Inventory/MySheet/Journal; order grid in its own tab; explore = travel pad (+lock-in hint in arrange); journal composers bottom; class icons outside the Lvl button + on roster rows (17px); rotate buttons flank Lock in/Rearrange; facing = rotated FA arrow (45° steps). rpc.js: `PARTY_RING`/`ringRotateCells` (outer-ring 45° rotation, forward 0..7), `registerPartyAutoFacing` (travel-stage group-token moves re-face + ring-rotate the formation — diagonals first-class), pack writes **darkvision visionMode** (+ core defaults) when members have darkvision. **DM live-checks owed (GM reload):** auto-facing walk (incl. diagonals) → Disperse deploys facing travel; packed grayscale vision; panel [rotl][stage][rotr] layout. **Still queued: #11 (scout release/combine · group-check buttons · travel-pace widget + native "—" investigation), #12 (group portrait).** Original list: layout fixes (rotr right of Rearrange; uniform FA forward arrows; tab order Party/Inventory/Explore/MySheet/Journal; class icons outside the Lvl button + on roster rows; journal composers pinned bottom; tighter pad header; order grid → its own "Party order" tab) · **auto-facing from travel movement** with 8-direction support via the 3×3 outer-ring rotation (one ring-step = 45°; diagonals become first-class facings — chosen over snap-to-cardinal) · **packed vision honesty**: pack leaves visionMode "basic" (full color) — must set darkvision mode + detection like the members actually have (DM caught color-vision upgrade while packed) · **scout release/combine** (DM releases a locked member to their own token; Combine reabsorbs within 1 square; phones must respect released state) · **group-check buttons** (Perception/Stealth/Survival, group-sheet semantics) · **Travel Pace widget** + investigate why the native group sheet shows "—" for land/water/air.
  - **Round 9 (DM 2026-07-03, BUILT + phone-verified):** pack now auto-jumps every member's phone to the **Party order tab** (verified on a real DM pack); journal = fixed frame (top **live filter** — pure DOM show/hide, keeps keyboard focus — scrolling posts, composer stuck bottom; verified on 5 real notes); tab order **Party/Order/Explore/Inventory/Journal/My-sheet** (journal 2nd-last, group↔individual toggle rightmost, both bars); class icons LEFT of the Lvl button; **favorite-mode removed from Actions** (long-press ★ curates); DM-panel "·" dropped. **TV compass** (`mountTvCompass`, main.js): fixed top-right inline-SVG compass rose on the display client, pointer-events:none above the canvas — anchors "north = top of the TV" for players seated around it (trivial DOM overlay, no canvas work; needs TV-client eyeball). **#11 BUILT:** `partyRelease`/`partyCombine` (scout spawns on first free adjacent square w/ wall check; ghosted dashed cell + 🔭 on both grids; released player's phone reverts to the normal PC UI; deploy skips scouts; Combine gated to within 1 square; DM-panel Release/Combine on a selected member, travel stage only) · **group checks** (Perception/Stealth/Survival buttons on Explore → executor relays a tappable gold bar to every phone → each rolls their OWN check via the native dialog, DM averages; bar verified via mock) · **travel-pace widget** live on Explore — and the native sheet's "—" is ANSWERED: dnd5e does NOT derive group speeds from members; the group's own land/water/air fields were unset (0) — DM fills them on the Group sheet. **DM live-checks owed:** release/combine walk, group-check end-to-end, compass on the TV.
  - **Round 10 (DM 2026-07-03): token glow tightened + setting; rings go in-house.** The 2.5ft glow SPILLED (~a square — token light radiates from the token EDGE, the body is the emitter) and rings stayed hard to read. Now: **`tokenGlow` world setting** (default **0.5 ft**, attenuation 0.1 → hugs the ring; 0 disables) applied to ALL PC tokens (not just darkvision — "clear at any time") on deploy + scout-release, AND to the **party token** on pack. **Add to the onboarding list** (first-run setup should surface it with the vision toggles). **Ring clarity decision:** build the outline/ring effect **in-house on the interface layer** (exempt from lighting + vision saturation) rather than adopting a Token-Magic-FX-style dependency — one visual feature doesn't justify a new module against the pinned-stack philosophy; same build = Spike-6 TV reticles (task #13). ORANGE BOXES solved (Round 9c): they were core's controlled-token borders from MCD controlling party tokens for vision-merge; the display client now clears all token borders on refreshToken.
  - **Round 10b (2026-07-03): glow has a hard floor → #13 BUILT.** Confirmed: a token light can never shrink below the circle circumscribing the token body (the token IS the emitter; `externalRadius` is always added) — 2.5→0.05 ft look identical because the bleed IS that circle + falloff. So the real fix shipped: **`mountTvRings` (main.js)** — a PIXI.Graphics on the **controls layer** (pings live there: renders above lighting/fog, exempt from vision-mode saturation), display client only, `tvRings` world setting (default on). Draws a **5px ring in each owner's player color** around every visible PC token + the party token, and **corner-bracket target reticles** in the targeting player's color (stacking outward for multiple targeters — this IS Spike 6's TV reticle). Redraws on canvasReady/refreshToken (tracks move animation)/create/deleteToken/targetToken. If the rings suffice, set `tokenGlow` to 0 and drop the lights. **Needs TV-client verification** (phone has no canvas): rings colored under darkvision, reticles on player targeting, no perf issues on refreshToken.
  - **Round 10c (DM 2026-07-03): ring v2 + lights retired.** DM feedback on v1: the outer identity ring read as noise, and it rendered RED for all four PCs — cause: color falls back to the first OWNER, and the test world's Player 1 owns every PC (real play: colors follow the ASSIGNED player in User Configuration). Reworked: (a) **token-glow lights fully removed** (code + `tokenGlow` setting + plans — the emitter-body bleed floor made them a dead end); (b) **targeting = core's native per-user colored pips** (default Foundry behavior, persistent while targeted, stacks per player — custom reticles deleted); (c) the overlay now paints a **band directly OVER the dnd5e dynamic ring** (radius ≈0.46·w, width ≈0.07·w) in the player's color — **PCs only, never the group token** — still on the controls layer so it survives darkvision/lighting. `tvRings` setting kept (renamed hint). Needs TV verification; band geometry may want a nudge to sit exactly on the dynamic ring.
  - **Round 17 (2026-07-03, task #18 DONE — player colours, DM-initiated).** Colours **persist natively** (Foundry stores `user.color` on the User doc, server-side → survives sessions), so no custom store/lock is needed: the picker is **DM-initiated only**, which inherently means a player can't change their colour on a whim (it stays until the DM offers another pick). Flow: the owned-tokens tab is renamed **"Players"** (fa-users); next to the player dropdown a **palette button** → `requestColorPick` RPC (GM-gated, executor) → `socket.executeAsUser("colorPick", userId)` → that player's phone shows a **full-screen picker overlay** (`#colorPickHTML`, 12-swatch `MC_COLOR_PALETTE`); a swatch calls `game.user.update({color})` (persists), Done closes. **Verified live** (hook → modal → pick changes `user.color` → Done closes). Superseded the earlier standing-picker + explicit-lock design (removed the phone Details "Your colour" section, the DM colour tab, and the `colorLocked` flag + `preUpdateUser` hook). Colour drives rings/banners/target pips/journal tint. DM-side palette+send render GM-only.
  - **Round 31 (2026-07-08, v0.1.88 — upcast target scaling + metamagic ANSWERED):** DM asked "do we support upcasting? metamagic?" (1) **Upcasting: YES, and now fully** — the "Cast at L1/L2…" slot chips already rode `spellSlot` to the executor (§7.5); the Round 24 gap (the Magic Missile dart stepper stayed at base count when upcast) is CLOSED: dnd5e marks scalable target counts with `target.affects.scalar` (MM: count 3, scalar true) → `slot-pick` now recomputes the cap live (+1 target per level above base, `targetsScale`/`baseMaxTargets` in `#actionState`), and re-picking a LOWER slot trims stranded instances (extra counts first, then whole targets). **Verified live on Test Sorcerer 3:** MM picker 0/3 at L1 → tap L2 chip → 0/4 → back to L1 → 0/3. (2) **Metamagic: rules-bookkeeping YES, spell-modification MANUAL (same as desktop dnd5e).** dnd5e 5.3.3 (2024) models each option as a feat with a **utility activity consuming sorcery points** (itemUses targeting Font of Magic; Quickened costs 2); Font of Magic holds the pool + Regain Spell Slot/Regain Sorcery Points conversion activities (`@scaling` consumption). Our executor runs ANY activity type, so these surface as normal Actions rows — **verified on the phone**: Quickened/Twinned/Regain rows all render for Test Sorcerer. The actual effect (twin a cast, bonus-action a spell) is bookkeeping the player narrates — no system automates it on v14 (CPR/Gambit's would, both v13). **Point-consumption through the executor still owed a live 2-client test** (single-tab session; DM's next test). (3) **Test Sorcerer leveled 1→3 via the phone UI** (level-up flow re-verified: HP average, Class Features grant, scale values, subclass browse→Draconic Sorcery via the CompendiumBrowser Select flow). **dnd5e quirk found:** the AdvancementManager lets Next skip an INCOMPLETE ItemChoice (Metamagic step passed with 0 of 2 chosen, no warning) — recovered via `AdvancementManager.forModifyChoices`; the char-gen ⟳ redo chip is the player-facing recovery for the same miss. Choice rows are `<dnd5e-checkbox>` custom elements (not `input[type=checkbox]`) — automation note. (4) **Char-gen over-pick: kept as designed** (warnings-not-walls — the red counter), but Add spells now **confirms when over cap** ("You picked 4 of 2 — add anyway?") since a live over-pick slipped through unnoticed (2026-07-08).
  - **Round 47 (2026-07-10, v0.1.105 — PHONE-PLACED SPELL TEMPLATES & TELEPORTS, §Round 33 built overnight):** The DM's overnight ask: let players aim their own templates/teleport destinations (fireball, stinking cloud, breath weapons, misty step…). Architecture: a **placement session** on the executor (rpc.js) — the phone can't touch the canvas, but the executor drops a live MeasuredTemplate on the TV and the phone D-pad nudges/rotates it, TV = the aim preview. Handlers: `placementStart` (creates the preview at the caster), `placementNudge`/`placementRotate` (move/rotate), `placementConfirm`, `placementCancel`. Phone overlay `#placementHTML` (D-pad + rotate + range readout + Cast/Cancel); routing in `#pickAction` (template spells → mode "aoe"; teleport spells by name → mode "teleport"; AoE falls back to the DM-place announce if a session can't start). Three kinds: **ranged-aoe** (circle nudges within range), **self-aoe** (cone/line — origin on the caster, rotate only), **teleport** (destination marker nudges). **TELEPORT: full auto, VERIFIED LIVE end-to-end** (Misty Step: aim → nudge → Confirm → caster lands exactly centred on the marker (8320,3120 for a marker at 8450,3250, half-token offset), 2nd-level slot consumed, marker cleaned). **AoE: aiming fully works** (circle + cone previews, nudge/rotate, range) — but auto-DAMAGE hit a wall: midi HARD-awaits its own template for area spells and its parked workflow isn't reachable to feed programmatically on this build (tried completeActivityUse+create.measuredTemplate:false → ignored; activity.use → same; template-strip → area spells lose their targets; processPlacedTemplates → workflow not in the collection / getWorkflow(msg) null). So AoE confirm **keeps the aimed template, pre-targets the tokens under it, and fires the cast so the card appears for the DM to resolve** (non-hanging handoff; full auto-resolve = a later midi pass). **Two environment quirks found + handled:** (1) this stack rescales a created template's `distance` by gridSize/100 (260px grid → 2.6×) — probed once per scene and compensated so a 20ft fireball draws at 20ft, VERIFIED (19.9998). (2) MeasuredTemplate x/y/direction UPDATES are blocked here (Automated Animations/Sequencer wrap them) — so nudge/rotate DELETE+RECREATE the preview (create works), and token detection uses midi's `computeTargetsFromTemplates` (raw `.object.shape` reads null). Phone→executor round-trip needs the DM's 2-client setup to eyeball; the executor mechanics + teleport are proven single-client.
  - **Round 46 (2026-07-09, v0.1.104 — summon control chip, DM-gated):** DM: "summoned an unseen servant but can't control it — can we assign the NPC as part of the summoning flow? put a DM gate in it." Root cause: summons execute on the EXECUTOR as GM (and even user-cast dnd5e summons don't grant ownership), so the spawned actor is never the player's. Fix: `registerSummonOwnership` (rpc.js, executor `createToken` watcher) — a created token whose actor carries **`flags.dnd5e.summon.origin`** (dnd5e stamps every summon) resolves origin item → summoner PC → that PC's player (assigned-character first, else an active non-GM/TV owner); if the player can't already control the summon, a **DM-gated chip** (ghost icon, 10-min window, deduped per summon-actor+player for wolf-pack multi-token summons): ✓ grants OWNER on the summoned WORLD actor (covers all its tokens; the player's switcher lists it on the ownership change and the Follow paw can trail it), ✕ keeps it DM-driven. NPC summoners / no player → no chip. **VERIFIED LIVE:** simulated a dnd5e-shaped summon (flagged shell actor + token, origin = Abzarax's real Unseen Servant spell) → chip "Abzarax summoned Unseen Servant — give Player 2 control?" → ✓ → P2 OWNER confirmed, chip cleared. Also: P2's character restored to **Abzarax** — the earlier "drift" was the DM deliberately switching PCs (Round 43's star exists for exactly this); my GM-side "restore" had undone him.
  - **Round 45 (2026-07-09, v0.1.103 — WARLOCKS + post-creation spell learning, DM report "new warlock, nothing I can cast"):** Root causes, all three found and fixed: (1) **`#charGenSpellInfo.maxLevel` only scanned `spellN` slots — a pact caster has ONLY `system.spells.pact`**, so maxLevel read 0 and the picker's leveled list came out EMPTY (the DM's warlock got no leveled spells offered at creation). Now pact slots count (`pact.level`). (2) **`#applySpells` hardcoded preparation.mode "prepared"** — uncastable on a warlock (no leveled slots); pact-progression casters' leveled spells now land mode **"pact"** (cantrips stay prepared/always). (3) **Level-up grants NO spell picks in dnd5e advancement** (list casters drag spells manually on desktop; the phone had no path at all). New **"Learn spells (class list)" button on the Spells tab** — reopens the char-gen picker in `learn` mode (known spells pre-selected, same warnings-not-walls caps + over-pick confirm); apply/Back exit to the SHEET, never the char-gen workspace. **VERIFIED LIVE on the DM's actual warlock (Abzarax):** picker now lists 37 rows incl. Hex/Armor of Agathys with his 2+2 known pre-counted; Back returns to the sheet; sorcerer flow unchanged. **The actual "can't cast" on Abzarax = pact slot 0/1** — his spells were fine (added DM-side with correct pact modes); pact magic refills on a SHORT rest which never ran. **P2 assignment "drift" explained:** Abzarax is the DM's own new PC assigned to Player 2 — mostly not a bug; a `preUpdateUser` TRACER now logs every user.character change with the originating stack in case a real drift exists (remove once confident).
  - **Round 44 (2026-07-09, v0.1.102 — Item Piles loot on a phone: scroll + off-scene recipient):** DM: "the item-pile popup can't scroll, I can't reach the lower items; the dropdown lets me pick up items as characters outside the scene — I can't see a usecase, am I missing something?" Both confirmed in the native Item Piles v3.3.2 loot window (which we render on the phone via `openLoot` → `renderItemPileInterface({userIds, inspectingTarget})`). (1) **Scroll:** the items list ships a fixed `max-height:500px` and the app isn't viewport-bounded, so on a short phone the lower items + take/close buttons fall off. Phone CSS now caps `.item-piles-app .window-content` to 88dvh with its own scroll AND `.item-piles-items-list` to 50dvh with overflow — two scroll regions, robust to the Svelte flex nesting. (2) **Off-scene recipient — a REAL Item Piles limitation, not us:** dist line 39765 builds the recipient list as `game.actors.filter(a => a.isOwner && a !== pile && a.prototypeToken.actorLink)` — every owned linked actor, NOT scene-filtered. On a phone you play ONE PC, so the answer to "what's the usecase": there isn't a good one on mobile. We already pass the player's active PC as `inspectingTarget` (the default recipient), so the phone CSS simply HIDES the recipient picker (`.item-piles-actor-container`) — loot always goes to the character you're playing; the DM's desktop keeps the full picker. **Not live-verified single-tab** (the native window renders on a separate player client via the executor — needs 2 clients); CSS selectors confirmed against the live DOM + the dist markup. Also restored a drifted P2→Abzarax assignment back to Test Sorcerer (cause unknown; watch).
  - **Round 43 (2026-07-09, v0.1.100 — "active character" star; the 2-PC rule explained):** DM pushed back on the assignment rule (temp PC while the main's in prison; playing 2 PCs when the DM allows). Reality check: **controlling 2+ PCs was NEVER blocked** — `#ownedTokens()`/`#subjects()` already list every owned token on the scene and the switcher flips between them. Foundry's `user.character` is a SINGLE slot by core design; it only picks the DEFAULT binding + where midi routes save/reaction popups. Our only rule was the char-gen self-assign "never override," so a player who already has a main never gets a temp PC auto-claiming the slot. Fix = make the slot switchable in-app: an **"active character" star** in the token switcher (shown on a real owned character subject). Filled = this PC is your assigned/primary; outline = tap to make it so (`game.user.update({character})`, which Foundry lets a player do for themselves; GM still uses User Configuration). **VERIFIED LIVE:** gave Player 1 a second owned PC, switcher showed 2, star flipped the active character Test Wizard→Test Sorcerer and back, `game.user.character` followed each tap. So the prison case = own both, switch active with the star; the DM-modified-PC case = tap the star once. World restored (extra ownership removed).
  - **Round 42 (2026-07-09, v0.1.99 — wake clears the Prone rider, DM report):** DM: "after the long rest, when players wake up, lose prone on all PCs." dnd5e's `sleeping` condition carries Unconscious + Prone + Incapacitated riders; toggling `sleeping` OFF does NOT reliably cascade-remove them (Prone lingered through the morning). Fix: `wakeActor(a)` explicitly strips the whole `SLEEP_CLUSTER` = [sleeping, unconscious, incapacitated, prone, surprised]; used by `applyWatchSleep` (waking an on-duty PC) and `clearNightSleep` (End night / cancel). **VERIFIED LIVE:** sorcerer on watch 1, wizard asleep+prone at lock → End night + long rest → wizard sleeping/prone/unconscious/incapacitated ALL false. (Also surfaced: a stale Prone from the round-40 ambush test had itself lingered — same bug, now cleaned by the cluster strip.) **Assignment answer for the DM ("why is my new PC not assigned?"):** the char-gen self-assign (shell.js:865) is deliberately player-only (`!game.user.isGM`) and never overrides an existing assignment — so a PC the DM builds, or one built by a player who already has an assigned character, or any actor made OUTSIDE phone char-gen, gets no auto-assignment. Assignment is then manual (User Configuration) or the Preflight tab's one-tap "Assign by ownership" fix — which itself needs the PC to have exactly one non-GM, non-TV OWNER with no character yet. On the local world most demo PCs read `owners:[]`, so neither path fires; the two built via phone char-gen (Test Wizard→P1, Test Sorcerer→P2) ARE assigned, confirming the feature works when a player builds their own.
  - **Round 41 (2026-07-09, v0.1.98 — outside-click closes DM-panel dropdowns):** DM: "clicking outside the dropdown for request (and all others) should close it — and save the selected items." Added a capture-phase `document` pointerdown listener (`onOutsidePointerDown`) driven by an `OUTSIDE_DISMISS` table (`{open, within, close}` per dropdown, extensible for future ones) — a click outside the open dropdown's region closes it. The roll-request who-rolls picker is the first entry; its selection was ALREADY live in `rollTool.selected` on each row-tap, so closing loses nothing — "save the selected items" is inherent. **VERIFIED LIVE:** opened the picker, 2 targets selected, clicked the panel grip (outside `.mc-rt-multi`) → dropdown closed, reopened → still 2 selected.
  - **Round 40 (2026-07-09, v0.1.97 — guard-duty fixes, DM report):** Two issues from the DM's first night run. (1) **DM can now edit the watches directly**: the DM panel's night box grows a per-member editor (each PC + three 1/2/3 chips) in BOTH stages — assign (pre-place / correct player picks) and watch (change duty mid-night; a mid-night edit re-runs `applyWatchSleep` so who's-asleep follows immediately). GM writes the flag locally; reuses the same `watches` shape as the phone `nightToggle`. (2) **🔴→✅ "browsed my sheet, couldn't get back to the board — even after the DM restarted":** the phone dismiss key was the literal `"assign"`/`"watch:N"`, so it stuck forever and a restarted night (same structure) still matched it. Fix: the night flag now carries a per-session `id` (`foundry.utils.randomID()` on Start), and the dismiss keys are `assign:${id}` / `watch:${id}:${w}` — a new/restarted night re-arms the overlay. PLUS a floating **re-open pill** (🌙 Watches / 🛌 Zzz, bottom-right) whenever the night's live but the player browsed past it, so "Browse my sheet" is a peek, not a one-way exit (`night-reopen` clears the dismissal). **VERIFIED LIVE:** DM editor toggled Test Wizard onto watch 1 (flag updated, `night.id` present); player dismiss → pill appears → tap → board returns.
  - **Round 39 (2026-07-08, v0.1.96 — SCROLL SCRIBING SHIPPED, §17.1):** The DM-gated learn-from-scroll flow, exactly per the sign-off. **Phone:** an eligible scroll's detail card (owned + wizard-classed + cast activity resolves to a leveled spell the book doesn't know) grows "Ask the DM: scribe <spell> into spellbook" → `scribeRequest` RPC (executor re-validates everything server-side) → "Sent to the DM". **DM:** a parchment-tinted reaction-widget chip, 10-MINUTE window (downtime isn't a combat reaction): "<PC> wants to scribe <spell> (L<n>) — suggested: <2n>h & <50n> gp" with ✓/✕. **✓** = spell copied in with `preparation.mode: prepared, prepared: false` (in the book, not readied), scroll CONSUMED (quantity-aware — decrements stacks), a chat card posting the suggested cost (never deducted, DM 2026-07-08), player toasted "approved". **✕** = nothing changes, player toasted "declined". **VERIFIED LIVE both paths** (real scroll made via dnd5e's own `createScrollFromSpell`: Thunderwave approved → spell unprepared + scroll gone + cost card; Feather Fall declined → book unchanged + scroll intact — that scroll DELIBERATELY LEFT on Test Wizard as the DM's phone-flow test prop). **Automation gotchas:** `createScrollFromSpell` opens a CreateScrollDialog (async-hangs headless calls until submitted), and fumbled runs strand STRAY SPELL ITEMS on the actor which then trip the "already knows it" validator — clean before retrying. Phone button render itself not eyeballed (identical machinery to verified detail-card buttons; the DM's Feather Fall prop covers it).
  - **Round 38 (2026-07-08, v0.1.95 — GUARD DUTY SHIPPED, §17.4):** The DM-initiated night flow, end-to-end. State = the group actor's `night` flag `{stage: assign|watch, watch: 1..3, watches: {1:[actorIds],2:[],3:[]}}` (updateActor propagates to every client — same channel as the formation). **DM panel:** "Start the night" (moon, renders when a membered group exists) → DialogV2 Watch board / **Skip guard duty** (straight to the morning prompt) / Cancel; assign box shows the three rows filling live + Lock in (disabled until anyone stands a watch); watch stage = ①②③ stepper + End night. **Phone:** full-screen watch board while assigning (tap rows to stand any subset — multi-duty per the sign-off; `nightToggle` RPC, owner-validated, executor-written) and a Zzz card while the current watch excludes the PC; both carry the Browse-my-sheet escape (keys self-invalidate on stage/watch change). **RULES DISCOVERY (deviation from the sign-off's "pure visual marker", flagged to the DM):** dnd5e 5.3's `sleeping` status is the FULL 2024 sleep condition — it grants `unconscious` + Prone/Incapacitated riders on application and removes them together on toggle-off. So off-duty PCs are mechanically asleep from lock-in (matching "the PCs off duty are asleep" better than a cosmetic marker), waking = one condition tap (riders leave too), and the combat-start ambush offer applies **Surprised only** (initiative disadvantage, 2024) since Unconscious is already riding. Also: the id is `sleeping`, NOT `sleep` (first live run no-op'd on the wrong id). **VERIFIED LIVE, full cycle:** Start → board → player pick via RPC (panel row updated, Lock enabled) → phone board rows with [ON] marking + dismiss → Lock in (both PCs asleep on watch 1, sorcerer woke on their watch 2) → combat start raised the "Night ambush … also mark them Surprised?" offer (applied on Yes) → End night → "Morning — grant the long rest?" → flag cleared, Sleeping+riders removed, Start button back. Not eyeballed: the watch-stage Zzz overlay on a second phone (same overlay machinery as the verified assign board).
  - **Round 37 (2026-07-08, v0.1.94 — DM FIRST-RUN WIZARD, §16 COMPLETE = milestone 1 done):** New [dm-wizard.js](scripts/dm-wizard.js): five DialogV2 steps (desktop GM client — no phone-overlay layer needed): ① TV/display account picker (writes `displayOwnerUser`; flags users who already have an assigned character) ② midi preset diff → Apply / Keep mine ③ table toggles (combatPovVision, ringPlayerColors, aooEnabled + NPC mode, partyTeleportActivates — each with a one-liner) ④ token-vision sync (runs `syncPartyTokenSight`) ⑤ party-group status — then a live **preflight run** as the closing screen. First load on a GM client offers Run / Later / Don't ask again (world setting `dmOnboarded`, hidden; "Finish later"/close mid-way leaves it unset so the offer returns); reopen = "Setup wizard" button on the Preflight tab. **VERIFIED LIVE end-to-end** (prompt → all 5 steps → preflight list → Done set the flag; TV account landed on the TV user; reopen button renders). Same session, also verified: **metamagic point-consumption** (Quickened Spell utility activity fired via the executor path consumed 2 sorcery points off Font of Magic, 3→1) and the **preflight assignment fail-path** (unassigned Test Sorcerer → fail row → "Assign 1 by ownership" fix → green + reassigned). `fireAoO` completion remains blocked on the automated client only (AC5E environmental, Round 32) — DM-client verification still owed.
  - **Round 36 (2026-07-08, v0.1.93 — §17.3 SHIPPED: split-scene paused overlay + Activate chip):** (1) **Phone paused overlay**: when the player's PC (their `user.character`, falling back to the bound actor) has no token on the ACTIVE scene but has one elsewhere → a full-screen "Waiting for the party — you're on X, the action is on Y" card with a "Browse my sheet anyway" dismissal (keyed to the exact scene PAIR, so any scene change re-arms it automatically); suppressed during char-gen and while packed (the PC rides the group token). **Branch lesson (live):** the overlay initially only rode the normal-sheet template — with no token on the active scene the shell rebinds to some off-scene actor and renders the no-token/blank-PC screens, so the traveler's phone was offering to BUILD THE SPARE BLANK instead of waiting; now computed once in `#buildHTML` and prefixed to every early-return branch. (2) **DM split-party chips** (`splitPartyHTML`, reaction-chip styling, hiking icon): one chip per non-active scene holding party PCs, with a one-tap **Activate** (`scene.activate()`); scoped to CURRENT party = group members ∪ users' assigned characters — the first live run listed years of demo PCs stranded on retired scenes, so world-wide player-owned scans are too noisy by design. Panel re-renders on `updateScene` active flips. **Verified live end-to-end:** sorc token moved to Wilderness → exactly one chip "1 PC on Wilderness (Test)" → Player 2's phone showed the overlay + dismissal worked → GM chip tap flipped the active scene to Wilderness AND the chip inverted to "1 PC on Cave A" (Test Wizard now the one behind) → restored. Nothing auto-activates (DM 2026-07-08: the DM alone moves the shared screen; packed-token auto-activate stays, setting-gated).
  - **Round 35 (2026-07-08, v0.1.92 — SESSION PREFLIGHT SHIPPED, §16 part 1):** New [preflight.js](scripts/preflight.js) checks engine + a **Preflight dock tab** on the DM panel (fa-clipboard-check, red fail-count badge on the rail icon, auto-runs 4s after ready — never auto-fixes). Eight checks, each `{status ok/warn/fail, detail, fix?}` with one-tap gold Fix buttons where a safe remedy exists: ① executor online ② TV/display account (set, connected, no assigned character — the prompt-swallowing trap) ③ midi preset drift (enforcer's `diffPreset`; fix = `applyPreset`; worded "deliberate deviations are fine") ④ PC↔player assignment (midi routing, the Shield bug; fix = assign-by-ownership only when exactly one candidate owner with no character) ⑤ PC token senses vs `actorTokenSight` (fix = sync) ⑥ party-group membership vs active scene (points at ⟳/checklist) ⑦ **teleport regions: enabled `teleportToken` behaviors with empty/unresolvable `destinations` across ALL scenes** (fix = disable) ⑧ module stack (pinned dnd5e/midi/socketlib; warns on v13-era CPR/Gambit's). **VERIFIED LIVE — and the very first auto-run caught a REAL second landmine:** the Wilderness scene had another destination-less enabled teleport region (same class as the Cave A movement-killer, Round 32); the Fix tap disabled it, the re-run went all-green and the badge cleared. §16 part 2 (first-run DM wizard) still to build; the paused-offscreen-phone overlay (§17.3) is next-batch sized.
  - **Round 34 (2026-07-08, v0.1.91 — Follow toggle + roster rows dropped + teleport semantics READ):** (1) **Follow v1 (DM feature ask):** a paw toggle beside the token switcher (renders with 2+ owned subjects; gold while on) sets user flag `followAll`; the executor's `handleMoveRequest` then repeats the mover's grid delta on the player's OTHER owned tokens on the active scene — each follower wall-checked from its OWN position and skipped silently when blocked (warnings-not-walls), no movement-budget impact, group tokens neither lead nor follow. **Verified live:** flag on → sorcerer + a P2-owned Grukk token moved together; flag off → only the mover; paw renders/toggles on the phone. v2 candidates: per-token follow picks, follow through teleports, formation offsets. **Syntax-gate save:** a bare `await` in the non-async `#onClick` produced the same misleading V8 private-field error as v0.1.68 — caught by the Electron `--check` BEFORE shipping this time; the follow-toggle case uses `.then()` instead. (2) **Roster near-miss reason rows REVERTED** (DM: "could get long in scenes with many friendly NPCs") — the two rules stay documented here instead: explicit player OWNER + token disposition Friendly. (3) **Split-party teleport — core semantics dug out (foundry.mjs 79073–79285), pre-brainstorm findings:** core teleport NEVER touches the world's ACTIVE scene — it changes per-user VIEWS only: the mover's own client views the destination (`view()`/`pullUsers`), and other users are pulled ONLY if they view the origin scene, can observe the token, AND no longer own a vision-enabled token there — so party members with their own tokens stay, and the TV account (owns every PC) is never pulled while any PC remains. The "scene changed automatically" the DM saw was almost certainly the DM'S OWN view following a token HE moved (`user.isSelf → view()`), or our own `partyTeleportActivates` for the PACKED token — ungrouped players don't move the active scene. Confirmed gap: `handleMoveRequest` resolves tokens via `game.scenes.active.tokens` → a traveler ahead on a non-active scene gets "token not found" = genuinely STUCK on the pad. Planned (Round 33 item 3 updated): ① cross-scene token resolution for phone moves; ② phone overlay "You slipped ahead to <scene> — waiting for the rest of the party" while subject token's scene ≠ active scene; ③ activation stays MANUAL/whole-party-only (DM's requirement), with the DM-panel "N PCs ahead — [Activate]" chip.
  - **Round 33 (2026-07-08, v0.1.90 — roster near-misses + two design answers):** (1) **Roster checklist shows WHY a token isn't offered** (DM: "I added a beast (friendly, player-owned) and only saw the PCs — what am I missing"): tokens on the active scene that fail exactly ONE of the two party-worthiness rules (`hasPlayerOwner`, token disposition Friendly) now render as GREYED unpickable rows naming the failing rule ("no player owner" / "token not Friendly"); failing both = ordinary monster, stays hidden. **Verified live** (friendly no-owner Dire Wolf → greyed "no player owner" row). The beast case is almost certainly one of these two: OWNER must be an explicit permission on the actor, and the PLACED TOKEN's disposition must be Friendly (NPC prototypes default Neutral/Hostile). (2) **Phone-driven template/teleport placement (DM Q — ASSESSED FEASIBLE, planned):** the phone has no canvas but the EXECUTOR does — design: a "placement session" RPC set; the executor spawns a ghost destination marker (teleports, starts at the caster) or a real MeasuredTemplate preview (cone/circle from `activity.target.template`); the phone shows a D-pad overlay (reuse the move pad) sending nudge/rotate RPCs (1 square per tap, 45° per turn-tap for cones); the TV is the live preview (eyes-on-TV, §6); range check = `activity.range` vs `measurePath` caster→marker with a red "too far" chip (warnings-not-walls; teleports hard-block on Confirm); Confirm executes (teleport = `{teleport:true}` move; AoE = finalize template → midi template-targeting → run the activity). DM-place stays the fallback. Moderate batch. (3) **Split-party teleport while UNGROUPED (DM Q — planned):** a lone PC stepping a travel link crosses to scene 2 while the ACTIVE scene stays put (activation only follows the PACKED token, Round 25). Design: ① executor move-routing must resolve a mover's token on NON-active scenes (verify/fix — likely why the traveler feels "stuck"); ② extend `registerPartyTeleportActivation`: activate the destination once ALL party-worthy PCs have arrived, not just the group token; ③ DM-panel chip "N PCs ahead on <scene>" while split (tap = activate there anyway). Interim table answer: Form up before travel links, or send PCs through one at a time — each steps the region and confirms; the TV follows when everyone (or the packed token) has crossed.
  - **Round 32 (2026-07-08, v0.1.89 — Polearm Master + Sentinel + a fire-path bug + a scene landmine):** Reaction roadmap continued per the DM's "first finish reactions". (1) **Polearm Master** ([aoo.js](scripts/aoo.js)): the watcher now also fires on ENTERING reach when the attacker has the PAM feat, re-resolving the threat under a PAM-weapon filter (`isPamWeapon`: Quarterstaff/Spear base item or Heavy+Reach properties, 2024 wording); dedup keys gained a `:enter`/`:leave` mode suffix so enter-then-leave in one turn prompts twice (correct). **VERIFIED LIVE** (GM client, throwaway combat, restored): walking Test Wizard into a PAM+Spear orc's reach → DM chip "Polearm Master: Orc Fury ⚔ Test Wizard". Bonus finding: v14 emits per-segment `preUpdateToken` updates along a path, so the start/end watcher effectively sees WAYPOINTS — mid-path triggers work better than designed. (2) **Sentinel**: new executor hook `midi-qol.AttackRollComplete` (name + `(workflow)` payload confirmed against installed midi source, 26099) → `checkSentinel`: an enemy-of-the-sentinel attacker within the sentinel's melee reach attacked a target other than the sentinel → same dispatch (phone card / DM chip / auto, title "Sentinel!"); Sentinel bearers also **ignore the mover's Disengage** in the leave-watcher (2024 Halt the Retreat; the Disengage check moved from a global bail to per-attacker). v1 skips 2014's "target also has Sentinel" clause; speed-0-on-hit is narrated. **Chip verification owed to the DM's client** — see (4). (3) **🔴→✅ REAL BUG: `fireAoO` never actually fast-forwarded.** midi reads auto-roll overrides from `workflow.workflowOptions` (`getAutoRollAttack`, midi-qol.js:16950) — our `autoRollAttack`/`fastForwardAttack`/`autoRollDamage`/`fastForwardDamage` sat at midiOptions top level, were IGNORED, and the D4 preset ("players roll") parked the fired OA forever with just a card. At the table this masqueraded as working because someone clicked the card's Roll button. All four keys now nest inside `workflowOptions` — this fixes the DM chip's ⚔, aooNpcMode "auto", AND future Sentinel fires. (4) **Automation-client limits hit:** attack workflows would not COMPLETE on the CC-driven client even after the fix — AC5E throws `toClipperPoints of undefined` in `dnd5e.preRollAttack` during D20Roll.buildConfigure (window-size independent; DSN off didn't cure it) — so Sentinel's end-to-end chip needs one real attack at the DM's table. (5) **🔴 SCENE LANDMINE (root cause of a whole session of "tokens won't move"):** Cave A had a Region with an ENABLED `teleportToken` behavior whose **destination was never set** — core's `#getTeleportationSegments` throws `testPoint of undefined` in `_preUpdate` for ANY token whose path tests against the region, and the update dies SILENTLY (no error surfaced, move just no-ops). Behavior disabled (one reversible flag) and movement instantly recovered. **Preflight-panel check queued: flag enabled teleport regions with unset destinations.** World restored: combat deleted, wolf re-hostile, PCs back at the party spot, orcs re-lair'd, test gear stripped from NPCs — **Test Wizard deliberately keeps the Sentinel feat** for the DM's reaction testing. Backlog decisions (DM, same message): homebrew spell lists = **DM picks from suggested lists** (no auto-fallback); milestone order after reactions = **DM onboarding/preflight → downtime & guard-duty → inventory transfers**; phone settings gear lives in the Details tab.
  - **Round 30 (2026-07-08, v0.1.87 — membership checklist + test party built):** (1) **Party membership "slow flow"** (DM: "a quick flow and a slow one with a checklist of who to add"): a `fa-list-check` roster button now sits beside BOTH quick paths (Form up/rebuild when a candidate group exists; Create party/populate when none) → DialogV2 checklist, one row per candidate: the active scene's party-worthy PCs (pre-checked to current membership, or all when creating fresh) plus existing members with NO token on this scene listed UNCHECKED ("not on this scene") — so dropping an off-scene member (unsummoned beast, benched PC) is an explicit choice, where quick-rebuild drops them silently. Confirm REPLACES `system.members` with exactly the checked set. Handler `data-party="roster"` (dm-panel.js), rows ≥44px. **Live-verified 4-step protocol** (GM client): button renders · both members pre-checked · uncheck→confirm leaves 1 member · stale state then shows ⟳ AND roster with the non-member unchecked; re-check→confirm restores both. (2) **Render gap fixed:** `createToken`/`deleteToken` panel re-render now also fires for player-owned tokens (was groups-only) — placing fresh PC tokens never surfaced the Create-party button until something else re-rendered. (3) **Test party rebuilt for the DM's reaction test** (the old group was erased): **Test Wizard** (High Elf/Sage, Player 1, darkvision) and **Test Sorcerer** (Human/Noble, Player 2, no darkvision) both built END-TO-END through the phone char-gen UI — class/species/background advancement, point-buy, both equipment grants (auto-equip verified again: Spear+Dagger equipped on grant), spells with **Shield prepared on both**, Finish top-up (6/6 and 8/8 HP, 2/2 slots) + self-assign (`user.character` → Player 1/Player 2, so midi routes Shield prompts to the right phone). Grouped into a fresh **"The Party"** via the panel's own Create-party button. Char-gen notes from driving it blind: the spell picker lets a 4/2 over-pick stand until manually deselected (**cap not enforced on toggle — small fix candidate**); equip rows are per-source with `char-gen-pick-back` between them; point-buy starts at all-10s.
  - **Round 28 (2026-07-07, v0.1.85 — reaction routing + DM awareness):** DM test results: AoO ✅, onboarding ✅ — but **Shield (equipped+learned) pushed no popup to the phone**. Traced midi's `playerForActor` (midi-qol.js:18103): priority 1 = *active user whose ASSIGNED CHARACTER is the actor*; only then "first active player-OWNER" — where the TV account (auto-owns every PC) can swallow the prompt, same family as the AoO routing bug. Fixes: (a) **char-gen Finish self-assigns the PC as the player's `user.character`** (players may set their own; never overrides an existing assignment) — locks midi's saves/reactions routing to the right phone permanently; EXISTING PCs need a one-time User-Config assignment (onboarding item). Also triage for the report: Shield only prompts **on a HIT**, and the spell must be **PREPARED** with a slot free — "learned" alone isn't enough. (b) **DM reaction toast** (`registerReactionNotifier`, executor): midi's `ReactionFilter` hook → auto-dismissing `ui.notifications.info` "⚡ X has a reaction window (Shield) — waiting on Player 1"; non-modal per the DM's "not too distracting", debounced 3s/actor. **Reaction roadmap kept in plan (DM): Polearm Master (trivial watcher flip) → Sentinel (ally-attacked hook) → Counterspell/Silvery Barbs (need workflow interruption — build on demand or wait for Gambit's v14).** Also answered: Sequencer effects stay ON for DM/TV (only PHONE clients disable them — the maps' effects show where the map shows); the ⟳ rebuild button only renders when an unpacked candidate group exists AND an active-scene PC is missing from its members — a correct group shows no ⟳ by design.
  - **Round 27 (2026-07-07, v0.1.84 — batch 3, built overnight for local testing):** (1) **Phones auto-disable Sequencer canvas effects** (client-scoped `sequencer.effectsEnabled` → false on phone ready; takes effect next reload) — kills the PlaceableObject error family on canvas-less clients, including the Shield-reaction error (FINDINGS B3); sounds stay on. (2) **Char-gen grants AUTO-EQUIP**: all granted weapons + the first body armor + first shield equip on grant (unless already worn) — fixes wrong AC (armor in the bag) and the AoO "no weapon" blindness at the source. (3) **DM panel: rebuild-party button** — when a candidate group exists but the scene's PCs aren't all members (the stale "איפה הגרוק שלי" trap), a ⟳ appears beside Form up: confirm-gated, replaces `system.members` with the scene's PCs. (4) **Player onboarding v1**: a one-time full-screen welcome overlay on phones (localStorage `mc-onboarded` per device) — step 1 fullscreen (live button on Android, Add-to-Home-Screen how-to on iPhone, ✓ when standalone), step 2 the three gestures (tap/hold/Use-hand), step 3 "eyes on the TV"; reopenable from Details ("Show the welcome tips"). **AoO fixes earlier the same night (v0.1.83):** prompts no longer route to the TV account (it auto-owns every PC and has no shell — the DM's solo test died there; no phone owner online → DM dialog fallback), and the reach filter falls back to carried-but-unequipped melee weapons. **Live-verified via the DM's Chrome:** wolf beside Grukk → combat → plain move away → console `AoO: Dire Wolf leaves Grukk BattleToad's reach (Flail)` + the DM dialog. All local-symlink; DM tests tomorrow.
  - **Round 26 (DM 2026-07-06, v0.1.82): IN-HOUSE OPPORTUNITY ATTACKS (the Gambit's-Premades alternative).** CPR/Gambit's are still v13-only (checked live: CPR 1.5.40 verified 13; GP 2.1.43 verified 13.351), so the long-parked "custom executor-side movement watcher" shipped: **[aoo.js](scripts/aoo.js)**. `preUpdateToken` on the EXECUTOR (all movement flows through it — pad moves + DM drags) detects leave-reach in combat: threat = attacker's **largest-reach equipped melee weapon attack activity** (activities with `range.reach`; +size pads for big tokens; `canvas.grid.measurePath` so the table's diagonal rule holds), threatened at start AND outside at end, attacker hostile + in combat + reaction unspent (`flags.midi-qol.actions.reaction`) + not incapacitated, mover not Disengaged (status/effect-name match). One prompt per attacker-mover-turn; never blocks the move (warnings-not-walls). **Player attacker** → socket card on their phone (violet reaction styling): "X is escaping Y's reach — Attack with <weapon>" → taps into the NORMAL two-tap attack flow with the mover PRE-TARGETED (assigned-targets path); **midi's `recordAOO` (already in the preset) charges the reaction on roll**. **NPC attacker** → `aooNpcMode` world setting: **Ask the DM** (DialogV2 confirm, default) / auto-roll (fully fast-forwarded completeActivityUse) / off. Master toggle `aooEnabled` (default on; combat-only regardless). **v1 limits (documented, revisit if Gambit's lands v14):** no movement interruption mid-path; no vision/cover check; melee weapons only (no unarmed-strike feature items, no Sentinel/Polearm-Master triggers); teleports skip it naturally (region teleports don't updateToken). **✅ LIVE-VALIDATED (2026-07-06, CC-driven GM client, local offline-test/Cave A):** teleported the Dire Wolf (temp friendly) adjacent to Orc Fury in a throwaway combat, moved it out of reach → the watcher fired end-to-end: console `mobile-command | AoO: Dire Wolf leaves Orc Fury's reach (Haymaker Greataxe)` + the NPC DialogV2 "Opportunity attack — …Take the opportunity attack with Haymaker Greataxe? Yes/No" on the GM screen. Detection/decision math also verified read-only (reach-weapon ID; effReach 5.5ft; fires on adjacent→away & diagonal-out; holds on within-reach shuffle & never-threatened). Test world fully restored (combat deleted, wolf disp/pos back). **Two v14 gotchas found:** (1) programmatic `token.update({x,y})` is WALL-CONSTRAINED in Foundry 14 — a scripted/dragged move clamps along a valid path, so a token may not actually cross inside-reach→outside-reach as expected (use `{teleport:true}` for exact test placement; likely why the DM's first manual test saw no popup — the move didn't genuinely leave reach). (2) `game.modules.get().version` shows a STALE cached manifest string on the LOCAL symlinked world (read 0.1.81 while the scripts were 0.1.82) — the version string only refreshes on a world RELAUNCH (Return to Setup), not a client reload; the actual scripts DO load fresh (confirmed via the `aooEnabled`/`aooNpcMode` settings existing). Sqyre release installs update the string normally. Player phone-card path still needs a real 2nd client (cookie-isolated) to eyeball.
  - **Round 25 (DM 2026-07-06, v0.1.81): ZOOM scene transitions + party travel links via core Regions.** The DM wants map-scale storytelling: world map ⇄ local scenes ("show the PC's boat during travel, zoom in for the deck scene"). Findings from core (Foundry 14 source): `CONFIG.Canvas.sceneTransitions` is an OPEN registry — entries carry their own `filterClass`; the Scene config Ambience→Transition dropdown AND core's **Teleport Token region behavior** per-teleport transition picker are both built from it; the engine (`TransitionContainer`) snapshots outgoing+incoming scenes and animates a shader `progress` uniform. So the whole "step on the town marker → confirm popup → switch scene with a zoom" flow is **native**: a Region with a Teleport Token behavior (cross-scene destination Region, `choice` = the confirmation dialog, per-teleport transition override). We ship only: (a) **`MCZoomTransitionFilter`** ([transitions.js](scripts/transitions.js)) subclassing core's `TextureTransitionFilter` — own fragment shader (zoomIn: old scene magnifies ~12× around the `anchor` uniform while the new scene resolves under the back half; zoomOut: old scene shrinks into the anchor over the new map, then dissolves) — registered as **mcZoomIn/mcZoomOut** (labels "Zoom In/Out (Mobile Command)", 1600ms default); (b) **`registerPartyTeleportActivation`**: primary-GM `createToken` hook — when the PACKED party token arrives on a non-active scene (teleport/DM drag), `scene.activate()` so the TV + phones follow and the destination's transition plays for everyone (world setting `partyTeleportActivates`, default on). **Convention (DM design): SMALL maps set scene transition = Zoom In; BIG maps (overworld) = Zoom Out** — arrival direction is then automatic everywhere, teleports can override per-gate. Needs a live TV tuning pass (zoom factor/easing are feel constants: 11.0 / smoothstep 0.45–1.0 / 0.75–1.0 in the shader). Core caveat: `TransitionContainer` is @internal — a Foundry minor could wiggle; registry+dropdown are config-level.
  - **Round 24 (2026-07-05, PLAYTEST FINDINGS batch 2 — v0.1.80).** Transcript-driven fixes (FINDINGS_2026-07-05.md is the ledger): (1) **Finish = rested**: char-gen Finish runs a silent `longRest` then a direct fill-UP of HP+slots (dnd5e's `allowRests=false` gate silently refuses a player's rest, so the fill-up guarantees the outcome; never reduces). (2) **Redo choices**: each picked source row (species/background/class) carries a ⟳ chip → `AdvancementManager.forModifyChoices` — a cancelled wizard is no longer a dead end (the "empty sheet" root cause). (3) **Multi-instance targeting** (DM design): count>1 activities grow a "− [n] +" stepper on selected target rows; duplicates ride to the executor as repeated uuids; the workflow runs on the unique set and each extra instance gets a fresh roll of the damage formula applied via `applyDamage` (resistances respected) + a GM-whispered audit line. Known limit: upcast doesn't grow the cap live. (4) **AC breakdown** now mirrors `prepareArmorClass` (flat/default/formula calcs; dnd5e nulls `ac.label` when unarmored — that's why Mage Armor vanished) + a "From effects:" line naming AC-touching effects. (5) **Merchant round 2**: left pane fully hidden on phones; any item arriving on the controlled actor toasts (suppressed during char-gen). (6) **Dialog fit**: bottom-sheets capped 88dvh, footers (form-footer/dialog-buttons) STICKY so Continue can't scroll out of reach; advancement inner heights unclamped. (7) **Shield error TRACED**: "must provide an embedded Document instance" = Foundry core PlaceableObject ctor — an animation/canvas module firing on the No-Canvas phone, NOT our pipeline → onboarding: disable Sequencer effects client-side on phones. All executor-affecting (rpc.js) → DM reload; release v0.1.80 for Sqyre.
  - **Round 23 (2026-07-05, PLAYTEST FINDINGS batch 1 — v0.1.79).** First real 2-tester session ("The Peddler's Music Box" on Sqyre) went sideways in instructive ways; fixes for the four confirmed setup/char-gen killers (transcript triage still pending): (1) **Empty group = invisible Party Mode**: the DM panel's Form up only rendered for a group WITH members, and an empty/missing group rendered NOTHING — no hint, no way in-app to add members (the DM forgot the manual sheet-drag step and was stranded). Now a no-candidate panel offers **one-tap populate**: "Add N PCs to <group>" fills an empty group with the active scene's player-owned PCs via dnd5e's own `group.system.addMember` (idempotent), or "Create party (N PCs)" creates the group first. (2) **Advancement popups didn't lock the shell** — players kept tapping the workspace under an open wizard ("horrible"). Every lifted dialog now mounts a full-screen **backdrop** one z below it (`#mc-shell-backdrop`, tracked per-app in `liftedApps`, cleared via closeApplication/V2 hooks when the last closes) — the step must be finished or closed before the shell is tappable. (3) **Grant double-fire**: `#applyEquip` awaits compendium loads BEFORE the granted-flag write, so Yaniv's triple-tap granted 3× everything; `#charGenAdd` could likewise open two advancement managers. Both now share an in-flight `#cgBusy` lock (swallow repeats, release in finally). (4) **Fullscreen** (testers played with browser chrome eating the screen): a **"Go full screen" button above Leave/Log out** (Details tab) using the Fullscreen API + a `fullscreenchange` re-render; **iPhone Safari has NO Fullscreen API**, so there the button shows the Add-to-Home-Screen how-to, and phone clients inject `apple-mobile-web-app-capable` metas so a home-screen launch is chromeless. Also queued for the future onboarding flow. **Still open from the session:** Psychic Blade (Soulknife) damage routed to the DM instead of the player — needs a live repro with the exact item before touching the executor.
  - **Round 22 (DM 2026-07-04): condition chips tap-to-open + an editable biography.** (a) Condition chips in the header now **open their rules/detail on a plain TAP** (`data-action="cond-open"` → `#showEffectDetails`), not only on long-press — the hold still works too. (b) The biography (long-press the portrait/name) became a **journal-style editor** rather than a read-only card: a search box filters the read paragraphs (DOM show/hide, like the journal note filter), an **Edit** button swaps to a plain-text textarea, and **Save** writes back to the PC's own `system.details.biography.value` (player owns their actor → direct `actor.update`, no executor). Formatting-free by design (DM: "no need for formatting"): stored HTML is stripped to text for editing via `#htmlToText`, and saved text is re-wrapped as simple `<p>`/`<br>` so it still reads on Foundry's native sheet. New state `#bioOpen/#bioEditing/#bioDraft/#bioFilter`; the draft survives the shell's frequent re-renders like the journal composer. Phone-side only. Shipped alongside the earlier v0.1.72–75 Explore polish (Use hand, edge-pinned stats, lever icon).
  - **Round 21 (DM 2026-07-04): deployed/released PCs were BLIND in the dark — senses now sync at token creation.** Live report: Ember walked away from the group and "into the darkness" with no line of sight on the TV (ownership was fine — all four PCs owned by the TV account). Root cause: `partyDeploy` and `partyRelease` build member tokens from `actor.getTokenDocument()` = the **prototype token**, whose sight is typically `range 0 / basic` — the only thing that ever pushed real dnd5e senses onto tokens was `syncPartyTokenSight`, which runs at **combat start** (with combatPovVision) or manually. Out-of-combat exploration — the exact party-mode use case — never got it. Fix (v0.1.71): the senses→sight/detection computation now lives in ONE exported helper, **`actorTokenSight(actor)` (rpc.js)** — numeric `senses.ranges` + the "Special Senses" free-text fallback, darkvision visionMode, id-keyed `detectionModes` object — applied at **token creation in deploy AND scout-release**, and reused by `syncPartyTokenSight` (main.js) and char-gen's `#syncFinishedTokenSight` (shell.js), which previously carried two more diverging copies of the same logic. Side effect: the combat sync's old `saturation:-1` (full greyscale, 2026-06-28) is superseded by the newer **DARKVISION_SAT −0.8** everywhere (DM 2026-07-03: "-0.6 too colorful; halfway to full gray"). Executor-side (rpc.js) → **needs a DM-client reload**, then re-test: disperse → walk a darkvision PC into an unlit area → their sight radius shows on the TV. Note: a PC with NO darkvision correctly stays blind in darkness — that's D&D, not a bug.
  - **Round 20 (2026-07-04): THE REAL ROOT CAUSE — v0.1.68 shipped a duplicate private method name; the whole module was DEAD in 0.1.68–0.1.69.** Round 18's select-then-place added a helper `async #partyMove(group, actorId, r, c)` — but `#partyMove(dx, dy)` **already existed** (the packed travel pad). **Duplicate private names in one class are a SyntaxError**, so `shell.js` failed to parse → `main.js`'s import chain died → **no init, no settings section, no shell, on every client** (Foundry still lists the module + loads its lang file from the manifest, so it *looks* half-alive). This — not Round 19's ring-writer theory — explains Player 1's phone "crash" (module dead → phone fell back to NATIVE Foundry with the No-Canvas localStorage flag still set from D2 → an iPhone drowning in the full Foundry UI + `action-pack-enhanced` throwing uncaught on every token control with no canvas) and the "settings/widget are gone" report. **Debugging lessons (hard-won):** (1) V8 reported the failure as `Private field '#ownedTokens' must be declared in an enclosing class` at a *use* 1800 lines away from the actual duplicate — with a duplicate private name, V8's error names an unrelated first-unresolved private, so don't chase the named symbol; (2) a browser console filtered by "mobile-command" hides the SyntaxError (its text doesn't contain the module name) — check the very TOP of the console unfiltered; (3) **Foundry's Electron doubles as Node**: `ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Foundry Virtual Tabletop 14\Foundry Virtual Tabletop.exe" --check file.mjs` (copy the .js to .mjs first) — **run this on every script before shipping; it would have caught 0.1.68 instantly.** Fix (v0.1.70): renamed the helper to `#partyGridMove`. Round 19's changes (ring paint gated on `canvas?.ready` + executor `registerPlayerColorSync`) are kept — the phone still shouldn't write token visuals from a canvas-less client — but they were NOT the outage. Note: `action-pack-enhanced` 1.2.6 genuinely throws uncaught errors on this stack (`canvas.tokens.controlled` / `classList` on token control) independent of us — a latent irritant on No-Canvas phones worth watching.
  - **Round 18 (DM 2026-07-03): a player arranges ALL their owned members (not just the active PC).** Scenario the DM hit: two players, each with a pet, group up — only the *active subject* token could be moved in the marching-order grid, the pet was stuck. Root cause: `#partyModeHTML`/`#partyPlace` keyed "mine" to the single `this.actor`. Now the phone treats **every group member the player owns** (`members.filter(testUserPermission OWNER)`) as theirs. The grid uses **select-then-place**: tap one of your tokens → it lifts (gold `mc-picked` pulse + "Moving X — tap a square" hint) → tap a destination to drop; tapping another of your own tokens **swaps**; tapping the lifted token again drops it in place. **One-tap "move" is preserved for the common single-token case** (owner of exactly one member taps an empty cell → it just moves). `#partySelf` holds the lifted member; it's cleared entering travel. **Done/Lock** now locks *all* the player's placed tokens as a group (label "Done — lock my tokens" when they own >1). Executor path unchanged (per-actor `partySetCell`, looped). Phone-side; needs a live 2-owner check.
  - **Round 16 (2026-07-03, task #18 — owned-tokens tab):** third dock tab (🐾 fa-paw, "Owned tokens"): each non-GM, non-TV player's owned actors (excludes `type:"group"` + the `displayOwnerUser`/TV account) as thumbnails **grouped by player** (header in the player's colour). Each thumbnail is `draggable`; `onTokenDragStart` sets `actor.toDragData()` (`{type:"Actor", uuid}`) so a **drop on the canvas spawns a token natively** — the DM client has the canvas, no custom drop RPC. **Double-click → `actor.sheet.render(true)`**. Use: quick out-of-combat placement of familiars/summons/wildshape forms/pets/extra PCs. **Layout (redesigned, DM 2026-07-03):** the stacked per-player sections were too tall for the common 4–6 players × 1–2 tokens — now a **player dropdown** (colored by the player) picks one player, and their tokens show in a **2-row grid that scrolls HORIZONTALLY** (`grid-auto-flow:column; rows:repeat(2,auto); overflow-x:auto`), **sorted highest-level first** (`system.details.level ?? cr`; verified Belnor/Ember/Grukk/Selene lvl3 → Barb lvl1). Compact (~170px), one player at a time; horizontal scroll handles a heavy player (the old filter/collapse removed). Per-tab flyout overflow: default `overflow-y:auto` (tokens grid scrolls), rolls tab `overflow:visible` (targets dropdown escapes). Data model + drag-data **verified live** (TV excluded, correct grouping, toDragData shape); the drag/dblclick interactions render GM-only, need a DM client. **Remaining in #18:** the color persistence + DM-lock + in-UI color picker (the rest of the "player management center").
  - **Round 15 (DM 2026-07-03, dock polish):** flyout gets a taller minimum (min-height 340px), no horizontal scrollbar (overflow visible + `.mc-dmp-scroll` overflow-x hidden), width 240; "Packed — arrange & lock in" → **"Arrange & lock in"**; Rolls tool now has **all three controls (Save/Check · ability · targets) on one line**, and the **targets picker is a real dropdown** (absolute overlay that escapes the flyout frame, `overflow:visible` on the body); the flyout **header is shorter and doubles as a drag handle** (as do the section headers — `onPointerDown` catches `.mc-dmp-fly-head`/`.mc-dmp-head`, ignoring buttons/selects) with a hover highlight + distinct tint to hint it. Phone loads clean; GM-only to view.
  - **Round 14 (2026-07-03, task #12): group portrait.** A **"Group portrait"** button in the Party view opens the existing portrait generator targeting the **GROUP actor** — `#portraitActor()` threads the group through the gen UI / live preview / copy / upload, and `buildPortraitPrompt` special-cases a group to seed a party prompt from member race+class ("an adventuring party group portrait — Bugbear Fighter, Ashborn Bender, …"), full-body default. Upload writes the group's img via `portraitUpload` (executor-brokered), which the party token then uses when packed. Phone flow verified live; the executor img-write needs a GM. **Committed v0.1.67** (b83da60) before this round.
  - **Round 13 (DM 2026-07-03):**
    - **TV zoom rework — "25ft around every token" + manual zoom as a CEILING.** `tvPartyFollow` now frames the party box grown by **`TV_TOKEN_MARGIN_FT` (25ft)** on each side. The DM's locked zoom is a ceiling: held while grouped, but as the party SPREADS the `needed` scale drops below it and the camera zooms OUT to keep everyone + their 25ft in view; regrouping raises `needed` back above the lock → returns to the set zoom. Replaces the Round-11b "hold until it doesn't fit" (a token could still drift to the screen edge). (`tvPartyScale` retained for the Focus button.)
    - **Dock: tab rides the far-right box.** Closed → tab on the panel's right edge; open → the flyout attaches to the panel and the tab rail slides to the flyout's **right** edge (`.mc-dmp-tabrail.mc-open`).
    - **Rolls tool polish:** "Roll (check)"→**"Check"**; DD1/DD2 sized to content (not equal-flex); the target list is now a **collapsible multiselect dropdown** ("N selected ▾" → inline checklist) so the flyout width never jumps — same color-coded/icon rows.
    - **Party order → its own dock tab** (▦ icon, packed-only, **auto-opens on pack, closes on disperse**). The main panel keeps only **Form up / Disperse** (arrange shows a "Packed — arrange & lock in" button that opens the tab), so the panel's width no longer changes when packing ("I hate that it keeps changing sizes horizontally"). Grid + rotate + Lock-in/Rearrange + release/combine live in the tab. Accordion removed (the tab replaces it).
    - Phone loads clean; the dock + zoom are GM/TV-only — need a DM/TV reload to view.
  - **Round 12 (DM 2026-07-03): DM roll-request dock (task #19, future-proofed).** The DM panel gained a **right-edge tab rail** (icon-only tabs sticking out; `#mc-dm-panel` content moved into a `.mc-dmp-scroll` wrapper so the rail/flyout aren't clipped). A tab (first = **D20 "Request rolls"**) opens a **same-height flyout box** to its right with an **X** (or re-click the tab) to close. **Rolls tool:** DD1 save/check · DD2 ability · a **"For…" target list** — packed-group members preselected (colored in player color + group icon), else player-owned character tokens on the canvas; div-rows toggle a class+Set (a native `<label>`+checkbox double-fires through the delegated handler). **Send → `requestRolls`** (rpc.js) fans a tappable card to each selected actor's owner phone; the phone rolls the check/save **natively (chat + on-screen dice)**, offline owners are **auto-rolled by the executor**, and the DM reads the results + does the math. Phone card + RPC **verified live** (mock → "Roll Dexterity save" card → tap opens the native dialog); the dock UI itself renders GM-only, needs a DM reload. This is the streamlined answer to the trap/AoE scenario — no dispersing, saves are document-level.
  - **Round 11b (DM 2026-07-03): TV zoom "shoots to orbital" on a 5ft move — FIXED.** Root cause: `tvPartyFollow`'s reframe decision measured "does the party fit?" against the party box **+ the full 40ft framing buffer** — on this world's large grid (260px/5ft) that buffer is ~2000px per side, so a clustered party never "fit" and every step snapped to a zoomed-out buffered frame. Worse, the LOCKED branch (zoom buttons) was `scale = target` unconditionally — it ignored the lock and reframed every move. Fix: decide reframing from the party's ACTUAL box + a 0.25-square pad (`fitsAt`); **hold the locked/current zoom while everyone still fits**, drop to the buffered `target` only when they genuinely don't. Also dropped the auto-zoom-IN-on-regroup (it hunted); the DM tightens via Focus/zoom buttons. Also this round: **TV min/default party radius 35→26ft** (~25% tighter default). Both TV-only — need a display-client reload to see.
  - **Round 11 (DM 2026-07-03 batch, BUILT — phone-side loads clean; executor/TV pieces need a GM reload):**
    - **Vision/light:** darkvision saturation −0.6→**−0.8** (`DARKVISION_SAT`, less colorful); **token glow re-added at 0.1** default (`tokenGlow` setting back — 0.1 is the practical minimum: light radiates from the token EDGE so there's a bleed floor ≈ the token's own circle); **dynamic ring gets COLOR_OVER_SUBJECT** (effects=33) so the portrait tints in the player color too. Unified into `applyPcVisuals(td, actor)` (ring color + color-over-subject + glow), applied on deploy + scout-release; group token gets glow on pack.
    - **`MobileCommand.fixPcTokens()`** (executor): applies the above to every PC token already on the active scene, so existing tokens catch up without a repack ("fix my existing tokens").
    - **Move-pad refusal** text → **"Blocked"** (short) with the readout line height reserved (`min-height`) so it never shifts the pad — plus a general note to avoid layout jumps from small text changes.
    - **Compass:** more padding — bottom/right 14→**60px** (≈ its own height up-and-left).
    - **DM marching-order widget:** empty squares are **inert** unless a token is picked up (can't select empties); member cells **outlined in the player's color**; **click A then B swaps** their cells (two sequential setCell writes, no stacking); the "Moving X — tap a square" helper line is **always rendered** (reserved height, no jump).
    - **Portrait prompt:** adds "a large cloth banner in the solid colour #hex (the owner's player color), no insignia, flowing softly, filling the backdrop" — augments the ring so players spot their token fast.
    - **Group checks** already roll via `rollSkill` default (posts to chat, Dice-So-Nice animates on-screen) — matches the native group sheet; confirmed, no change needed.
    - **Scout release-follow:** when the DM releases a member THIS player owns, `maybeFollowRelease` jumps their phone to **My-sheet → Explore with the released token selected** (send the wizard's cat to scout); combine returns them to party view. Addresses "can't change active token inside a group" — the switcher on My-sheet lists owned ON-CANVAS tokens (packed members have none, so no reaching off-canvas tokens).
    - **STILL PENDING → task #18 (own build):** in-house **player-management center** (accordion) — per-player color persisted + **DM-locked** (Foundry already persists `user.color`; the new ask is the lock), a **mobile-friendly in-UI color picker** (onboarding uses it — onboarding priority bumped), and a **grid of each player's owned tokens** with **drag-to-canvas** (needs a tap-to-place executor RPC since the phone has no canvas) + double-click-to-open-sheet (exclude TV). Sized as a standalone feature; not started.
  - **Round 10d (DM 2026-07-03, FINAL ring approach): color the NATIVE dynamic ring.** The custom controls-layer band desynced from movement animation and ignored token scale (tiny→gargantuan); the DM's instinct — "don't the ring settings already have the solution?" — was right. Now `applyRingColor` (rpc.js) writes the **assigned player's color into the token's native `ring.colors.ring`** on disperse + scout-release (`ringPlayerColors` world setting, default on; PCs only). Native ring = exact sync/scale + stock Ring-tab width/pulse/color-over-subject keep working; the −0.6 saturation keeps the color legible in the dark. Custom overlay + `tvRings` setting deleted; targeting stays core's per-user colored pips. **Also answered the DM's prototype mystery:** prototype-token edits template FUTURE placements only — placed tokens are frozen copies (edit them via the canvas token's own config). Since disperse recreates from prototypes, one pack→disperse applies prototype edits AND sheds the leftover glow lights. Leftover-light cleanup one-liner (GM): `canvas.tokens.placeables.filter(t=>t.actor?.hasPlayerOwner).forEach(t=>t.document.update({light:{bright:0,dim:0}}))`.
  - **Round 9b (DM 2026-07-03): colored ring under night vision.** Finding: vision-mode grayscale is a scene-wide saturation shader on the primary canvas group — the dynamic token ring is part of the token mesh and can't be exempted directly; the INTERFACE layer (nameplates/bars) is exempt. Fix applied: pack sets `sight.saturation: -0.6` (not core's -1) → muted color survives, ring stays legible. Dispersed PCs: the same dial exists natively per token (Token config → Vision → Saturation). The TRUE gray-world/colored-rings fix = interface-layer ring overlay on the display client — the **same mechanism as Spike-6 TV reticles**; build both together as one later chunk. Core ring-shader patching rejected (fragile, anti copy-Foundry).
  - **Round 6b (DM 2026-07-03): Lock in and Disperse never share a row.** "You can't disperse before you lock in the order" — and 4 buttons overflowed the row anyway. Now: **arrange** = rotate ◀▶ + a **gold Lock in** (disabled until everyone is placed on unique cells — the one-per-cell gate moved here, its natural home); **travel** = rotate ◀▶ + Rearrange, with **Disperse full-width on its own row**. Same structure on the phone DM row and the DM panel. Verified visually on the live client (temporary client-side GM override to render the DM row; reverted): arrange shows gold enabled Lock in + no Disperse; travel shows Rearrange + full-width Disperse + pad, no overflow.

## 16. DM onboarding wizard + session preflight (PLANNED 2026-07-08 — milestone after reactions)

DM directive (2026-07-08): plan this next; build order after reactions = this → downtime/guard-duty → inventory transfers. Two deliverables sharing one checks engine.

**16.1 Checks engine (`scripts/preflight.js`).** Pure functions, each returning `{id, label, status: ok|warn|fail, detail, fix?: () => Promise}`. Planned checks, all read-only with opt-in one-tap fixes:
1. **Executor online** — resolveExecutorId() user active (fail = nothing works).
2. **TV/display account** — `displayOwnerUser` set, that user active, NOT also a phone player.
3. **midi preset drift** — diff live midi `ConfigSettings` against the D4 preset (Settings Enforcer already computes this); fix = apply preset.
4. **PC↔user assignment** — every player-owned character has `user.character` set for exactly one non-GM, non-TV user (midi reaction/save routing — the Shield lesson, Round 28); fix = best-guess assign by ownership, confirm dialog.
5. **Token sight synced** — placed PC tokens whose `sight.range`/detectionModes mismatch `actorTokenSight(actor)`; fix = run the sync (GM client requirement respected).
6. **Party group sane** — a group exists, members match the active scene's party PCs (reuse the batch-5 stale logic); fix = open the roster checklist.
7. **Broken teleport regions** — any scene Region with an ENABLED teleportToken behavior and NO destination (Round 32: silently kills ALL movement whose path tests against it, core throw); fix = disable the behavior. Also warn on destination uuids that no longer resolve.
8. **Module stack** — pinned versions present (dnd5e 5.3.x, midi 14.0.x, socketlib); warn on known-bad (CPR/GP v13 installed+enabled).
9. **Phone hygiene** — players with Sequencer effects still on (client flag readable via socket ping), No-Canvas flag state.

**16.2 Preflight panel (per-session surface).** A "Preflight" tab in the DM panel dock: one row per check (icon+label+detail, tap = fix where offered), a "Run again" header button, red badge count on the tab icon when fails exist. Auto-runs once on executor ready.

**16.3 First-run wizard (once-per-world).** Full-screen overlay on the GM client (mirrors the player onboarding pattern, world setting `dmOnboarded`), steps: ① accounts (create/pick the TV account → sets `displayOwnerUser`; player accounts checklist) ② midi preset (show diff → Apply via enforcer) ③ table toggles (combatPovVision, ringPlayerColors, aooEnabled/aooNpcMode, partyTeleportActivates — each with one-line "what it does") ④ vision (run sight-sync; sightless-token list from check 5) ⑤ party (create/populate group via the existing quick+roster flows) ⑥ finish → runs the full preflight as its last screen. Reopenable from the panel (gear on the Preflight tab).

**Not in scope v1:** per-player device setup (the player onboarding covers it), Sqyre account provisioning, module installation.

## 17. Downtime activities (milestone #2 after preflight — seeded 2026-07-08)

DM scope so far: downtime + guard-duty roster live in the Party-mode tabs (Round 7 FUTURE note); **spell learning is a downtime activity, not an instant button** (DM 2026-07-08, redirecting the scroll question — a started in-card "Scribe" button was reverted the same day).

**17.1 Scribe from scroll (first concrete activity, mechanics proven, DM-GATED — DM 2026-07-08):** dnd5e 5.3.3 scrolls carry a `cast` activity whose `spell.uuid` resolves to the real spell. Flow per the DM: **player chooses to learn → the DM gets a prompt (reaction-widget-style chip on the DM panel: "<PC> wants to scribe <spell> (L<n>) — 2h + <50×n> gp, ✓/✕") → DM accepts or rejects.** Accept = add the spell to the book (preparation mode `prepared`, `prepared: false` — known but unprepared), CONSUME the scroll, post the cost chat card; reject = nothing changes (if the DM's ruling destroys the scroll on a failed attempt, he deletes it manually — v1 doesn't roll the 2014 Arcana check). Eligibility: wizard-classed actor + owned scroll + spell not already known (code sketch in the v0.1.91→92 diff history, reverted from shell.js). The request/approve plumbing = the same executor-relay pattern as roll requests and reaction chips.

**17.2 Shape:** a Downtime tab/section in Party mode — each PC picks an activity when the DM opens a downtime window: odd jobs using skills (earn coin — payout suggested to the DM), scribe a scroll (17.1), learn a skill/tool (if the DM allows), craft, recuperate, research. DM side: open/close the window, see everyone's pick, adjudicate. **Timing (CORRECTED, DM 2026-07-08 — supersedes the earlier long-rest anchoring): downtime is a MULTI-DAY event (days in town / a safe stretch), NOT associated with normal rest** — "not a night in the middle of a dungeon". The camp-night flow (watches, sleep, the long rest itself) is the SEPARATE guard-duty system, 17.4. Model: the DM opens a downtime window and advances DAYS; each activity carries a soft duration in days (book durations are suggestions, the DM's call is the lock); multi-day tasks keep PROGRESS across windows ("2 of 5 days scribing") and complete when the DM says the time passed. **Costs (DM 2026-07-08): never auto-deduct — SUGGEST the cost/payout to the DM (approval chip / completion card: "suggested: 150 gp, 3 days") and let them handle it.** Matches warnings-not-walls and the 17.1 scribe card.

**17.3 Split-party / active-scene policy (ANSWERED, DM 2026-07-08 — supersedes the Round 33/34 auto-activate ideas):** with ONE shared screen, **the DM alone chooses the active scene — it never changes automatically** for ungrouped travel (the packed-token auto-activate stays, setting-gated, since that's the whole party moving). When a player scouts another floor, the DM switches the active scene TO the scout — and every phone whose subject token is NOT on the active scene shows a **"paused" waiting overlay** ("The action is on <scene> — waiting for the DM"; sheet reading allowed via a small escape link, movement/actions naturally blocked since the executor is active-scene-bound). This REPLACES the cross-scene move-routing plan — no cross-scene control needed when off-scene phones pause. Keep: the DM-panel "N PCs on <scene> — [Activate]" chip as the one-tap switch. Build with the preflight batch or right after.

**17.4 Guard duty / night watches (DM design session 2026-07-08):** three watch slots as three ROWS (1st/2nd/3rd), players place their own token with the SAME select-then-place logic as the marching-order grid; DM locks in -> the long rest "starts"; the DM advances time to watch 1/2/3 and runs what he wants (encounter rolls, prepared ambush); off-duty PCs show a sleep "Zzz" marker; when an encounter starts, off-duty PCs are ASLEEP.

Mechanics mapping (researched):
- **Sleep = the Unconscious condition** (2024 PHB sleep rule): incapacitated, prone, auto-fail Str/Dex saves, advantage + close-range crits against. Waking: taking damage, a loud noise per DM, or an ally's action (shake).
- **The initiative rule the DM half-remembered EXISTS in 2024: Surprised = DISADVANTAGE on initiative** (2024 replaced the 2014 no-act surprise round). So an ambush against a sleeping camp: off-duty PCs get Surprised (init at disadvantage) + Unconscious (until woken); dnd5e 5.x models both as statuses.
- **Trance (2024 elf): "retain consciousness"** during the 4h meditation -> trancing elves are NOT unconscious and never get the Zzz/conditions by default; 4h rest also means an elf can stand 2 of 3 watches and still complete the rest. Similar no-sleep cases (undead, constructs) exist -> per-PC override, not race detection beyond a cheap Trance-feature default.

**17.5 Candidate activity catalog (researched 2026-07-12 — official + community).** Sourced from the 2014 PHB/DMG (p.187/127), Xanathar's Guide (workweek model + complications/rivals), the 2024 DMG (Bastions), and community/homebrew (5esrd, Adventurers League consolidated downtime, blogs). Tiered by fit to our model (§17.2: phone picks → DM adjudicates → suggest cost/payout, never auto-deduct; roll + soft duration in days/workweeks; progress persists across windows).

- **Tier A — clean roll → suggested payout, minimal DM (build first):**
  - **Work / Practice a Profession** — skill/tool/Performance check over a workweek → earn coin (covers lifestyle; more on a good check).
  - **Carousing** — spend by tier + Charisma check → gain an allied or hostile NPC contact.
  - **Gambling** — wager coin; Insight/Deception/Intimidation → win/lose the stake.
  - **Pit fighting** — Athletics/Acrobatics/CON → 0–200 gp (non-lethal).
  - **Crime** — Stealth + two checks → payout tiers or "caught".
  - **Research** — spend gold + time; INT check → lore fragment (DM feeds the fact).
  - **Religious service** — Religion/Persuasion over a workweek → a temple favor.
  - **Recuperate** — 3 days + CON save → shed a lingering effect / recover from disease.
  - **Relaxation** — a week at modest lifestyle → advantage vs disease & poison; shorten some conditions.
  - **Training (tool/language)** — ~10 workweeks − INT mod, 25 gp/week → new proficiency.
- **Tier B — DM-approval chip (the §17.1 scribe pattern: request → ✓/✕ → apply + suggest cost):**
  - **Scribe a spell scroll** (built path, 17.1) · **Craft a mundane item** (tools; ~50 gp/workweek of value) · **Craft a magic item** (rarity-gated gold + time + ingredient quest) · **Buy a magic item** (Persuasion → seller tables) · **Sell a magic item** (Persuasion → offers) · **Enchant arms/armor** (Arcana + artisan tools) · **Brew potions / alchemy** (herbalism/alchemist supplies) · **Make poison** (poisoner's kit) · **Learn a spell into a spellbook** (wizard).
- **Tier C — narrative / heavy-DM → offer as a free-text "Custom activity" the DM adjudicates (don't mechanize):**
  - Running a business / stronghold upkeep · bounty or mercenary work · surveillance / "cast a wide net" for info · start-a-newspaper / spread propaganda / sow rumors · gain renown with a faction · character backstory sidequest · wandering / travel between adventures · campfire stories (collaborative worldbuild).
- **Out of scope v1:** the 2024 **Bastions** system (level-5 strongholds with weekly facility Orders — Craft/Trade/Research/Recruit/Empower/Harvest/Maintain). It's a whole subsystem; if the table uses it, it stays DM-side. Our downtime is the lightweight XGtE-style workweek model, not Bastions.
- **Build note:** every activity carries a soft duration (days/workweeks, DM's call) and persists progress across windows; costs/payouts are SUGGESTED on the completion/approval card (never auto-deducted); Tier A can ship as a shared "roll an activity" surface reusing the roll-request relay, Tier B reuses the scribe approval-chip plumbing, Tier C is a single free-text row.

**17.6 Downtime spec (DM 2026-07-10) — the day-budget board.** The unit is **days** ("weeks/workweeks" groupings dropped; a "workweek" is just a *suggestion* of 5 days). The DM opens a window worth N days; each PC spends day-points across activities from the catalog (§17.5) or a free-text **Custom** intent, writes what they're going for, and **Locks in**. Hard rules from the DM:
- **DCs and prices are DM-only, NEVER shown to players.** The same activity has different DCs by intent, so the app must not surface any number the DM would set. Players see only labels + their own day budget.
- **DM view = per-player tabs/rows, grayed until the player locks in** (grayed = "still considering", solid = "locked"). The app *suggests*, the DM *dictates* — do NOT app-enforce activities-per-night or day caps beyond showing over-budget; the DM adjudicates.
- **Gamble dropped** from the catalog (kills RP).
- **Long-rest reminders** belong in the loop (tie to the §17.3 night flow / rest prompt).
- **Player progress OFF by default** — opt-in only, and when on it surfaces via the party **Journal**, NOT a new player tab (a DM who doesn't use the feature must see nothing leak player-side).
- **Unifying primitive = a Project/goal** (Phase 1b, not yet built): owners, target N ticks/successes, tick-source (day / rest / both), optional DM-only-DC roll, reward, optional paired teacher+learner with a DM-set rate; covers language-learning, pushups→+1 STR, no-DC sonnet, mixed-rate teach/learn, custom-DC crafting. DM can adjust progress manually anytime; DM roll-requests by day or by action at a set (DM-only) DC.
- **Scribe** offers a picker over spells from owned scrolls **+ party-inventory scrolls**, with a DM **consume-or-not** toggle; the DM decides whether money/items gate learning a given scroll.

**Phase 1a BUILT (v0.1.134, 2026-07-12):** the core loop only. `downtime` world setting `{open, days, windowId, picks:{[actorId]:{locked,items:[{kind,days,intent}]}}}`. The DM sets **one day budget for the whole group** (no location field — dropped DM 2026-07-12). DM panel Downtime tab (`dm-panel.js` `downtimeHTML`) — setup view (days for the group → **Open downtime**) and open view (per-PC rows, grayed until `locked`, showing each pick's days + intent, **Close** button). Player board (`shell.js` `#downtimeBoardHTML`, renders above the sheet content when a window is open) — day-budget header (`spent/N d`, red when over), activity rows with ±day steppers, a free-text intent field per row (commit-on-blur), the §17.5 catalog as add-chips, and **Lock in** (disabled while over budget) / **Edit** to unlock. Picks relay player→executor via `rpc.downtimePick` → `handleDowntimePick` writes the shared setting; both sides repaint on the `updateSetting` hook (player side skips repaint while an intent field is focused, so a co-player's relayed pick can't wipe mid-typing). **NO DCs/prices anywhere player-side.** **Phase 1b DEFERRED:** the Project/goal engine, DM roll-requests-by-day/action with DM-only DCs, the scribe spell-picker over owned+party scrolls with the consume toggle, long-rest reminders, and opt-in party-Journal progress.

**17.7 Downtime research — the "dud" diagnosis + a redesign toward a day-by-day montage (DM 2026-07-12/13).** Live test verdict: Phase 1a's day-budget allocator is **a dud** — "very strange and counterintuitive for a RP game." Diagnosis: it's built as a *point-budget planner* (allocate N day-tokens, lock in) when downtime actually plays as **a DM-narrated montage, day by day**. The budget math, the made-up catalog names, and the pre-commit-then-wait all add ceremony that leads nowhere. DM asks it to **lead somewhere**: "Day one" players get prompts, RP, roll, react; "Day two" again, but someone succeeded and adds a task, or swaps ballet for pushups and the DM rules it worth 5 nights. The app *suggests + tracks*; the DM *dictates* pacing, DCs, day-values. **DM directives:** drop the generic catalog (work/research/perform/train add nothing over free text); only structured types are the ones tied to real sheet data — **scribe** (list the PC's owned scrolls → suggest time/materials/GP) and **craft** (list the PC's tool profs, highest bonus first); **the DM sets the days/DCs, not the player** (with a default suggestion where the app knows); **Goals need a DM create+edit UI** ("how do I set the 100 pushups and edit progress?"); layout must be **compact to the DM's first-widget-screen height** (the current window is VERY tall) and list **in-scene PCs first, a divider, off-scene below**; both sides need an **exit** (shipped v0.1.138: DM "End downtime" button + player collapse chevron).

**Research (2026-07-13, 4 parallel sweeps: Reddit/EN World/GiantITP, actual-play, cross-system, blogs/homebrew).** Full source list in the session; key outputs:
- **Everything collapses into ~5 flow-shapes, not 40 buttons:** ① **free-text task** (DM sets DC+days or wings it; many need no roll — relationship scenes, sidequests, a backflip, skill-shares, tattoos, rumors, carousing); ② **structured picker** tied to sheet data (scribe from owned/known spells + party scrolls with a suggested time/GP/material cost; craft from tool profs highest-bonus-first; brew potions; buy/sell magic item); ③ **long-term Goal** = the incremental bar (train a stat / learn a language / tiered research / enchant / mentor / invent a spell / write a book); ④ **venture** = roll-driven skill-challenge with built-in complications (crime, pit-fight, gamble, bounty, faction renown — the best rival/hook generators); ⑤ **recover/reset** tied to §17.3 rests (recuperate, relaxation, the nightly long-rest beat). Empire tier (stronghold/business/army/domain) is real but multi-week & DM-side → Goals-with-milestones, out of v1 like Bastions.
- **Goal model = Draw Steel "Downtime Projects" (drop-in).** Goal = a target **points** total (goal size = the difficulty dial: habit ≈15–45, stat bump ≈100–150, epic ≈1,000+). Each tick adds the roll total, **minimum 1 — always forward** (no wasted nights). DM sets the DC to tune tick-rate; **crit = bonus tick**; a **tutor/manual = a lump of points** the DM injects as a reward (covers paired teach/learn + "found a trainer"). **Milestone events fire at % thresholds** (½ for small, ¼/½/¾ for big) → auto-prompt the DM to drop a complication. 5e baselines as fallbacks: training ≈250 days@1gp (flat background tick), crafting/scribing = gp-value/day, renown = level×10 days (escalating cost per tier — good for repeat +1 STR).
- **Six levers to bake in:** (1) **complications are the engine** — "yes, but…" twists surfaced as the DM's material; (2) **never zero progress**; (3) **day = atomic tick, Goals span many days**; (4) **opportunity cost** — scarce days × competing goals ("the caravan leaves in 6 days"); (5) **montage pacing** not simulation — rotate players, short beats, dice only when uncertain (D20 "ranked priorities → checks"; Brennan's montage rounds); (6) **both halves** — the mechanical payoff scaffolds the memorable *scene*.
- **Net:** the redesign holds — first-class a SMALL set of types (**free-text task · scribe · craft · Goal**) + a **DM complication/event layer** + the **day-loop spine** (Day 1→2→…, advancing pushes roll-prompts via the existing relay and ticks per-day/per-rest Goals; DM adjusts DCs/day-values/progress live, marks complete → reward). **Model + build-order NOT yet confirmed by the DM** (the confirm question was dismissed pending this research).

**Refined vision + naming (DM 2026-07-13).** Two objects: an **Activity** (player-authored NAME + free-text plan; reusable, persists, carries its own progress) and a **Rule** (the DM-authored mechanics — the "formula", NAMED "Rule" by the DM). Flow: DM calls downtime (sized **short** = a slice ≈1/5 day, or **long** = a day/hub) → each player picks a saved Activity or names a new one → the DM authors the Rule with **dropdowns + smart defaults** (freestyle = DM picks which fields to fill; scribe/craft prefill from the sheet) and **activates** it, **visible to the player or not** → play proceeds normally and the DM **pushes roll requests** into the fiction when a scene reaches an Activity (size guides how many attempts are reasonable; never auto). It's **fragmented/woven, not a time-jump** — a behind-the-scenes reminder both sides carry. Activities **save for reuse**; the DM can **edit progress/DC/target, edit the Rule, or remove an Activity** from a PC's list. No multi-day pre-planning — ongoing Activities picked per beat. **Build order (DM): the full data model + all three Rule types FIRST, before the day-loop UI.**

**BUILT — Phase 2a data model + Rule engine (v0.1.139, 2026-07-13):** `scripts/downtime.js` — a PURE, framework-free, unit-tested module (35/35 via Electron-node). Three Rule TYPES: **roll** (one check vs a DC, optional `autoShift` "−N DC each attempt" with a floor — backflip / Learn Elvish DC100→20), **tally** (running count to a target, +perTick per attempt/day/rest/slice, optional roll-gate — 100 nights of pushups), **cumulative** (add roll total/margin/fixed toward a points target, min-1 always-forward, optional crit-double — research/craft, the Draw Steel model). Exports the engine (`defaultRule`/`initProgress`/`applyAttempt`/`adjustProgress`/`isComplete`/`progressSummary`/`describeRule`/`needsRoll`), preset seeders (`scribeScrollSuggest` = XGE scroll table → per-day tally; `craftSuggest` = PHB 5gp/day → per-day tally), and pure state transforms over the shared shape `{window:{open,size,id}|null, activities:{[actorId]:[Activity]}}` (`normalizeState`/`upsert`/`removeActivity`/`setRule`/`applyAttemptTo`/`adjustActivity`/`setVisible`/`open`/`closeWindow`). New world setting `downtimeState` (the old `downtime` day-budget shape is retired but kept registered so the Phase-1a board doesn't error mid-rebuild). **NOT yet wired:** no relay handlers, no UI — the DM authoring surface, the player Activity list, and the day-loop/push-roll come next, driving these pure transforms.

**BUILT — Phase 2b relays + create-flow UI (v0.1.141–142, 2026-07-13):** relay layer (`rpc.js handleDowntimeOp`, one executor handler dispatched by `payload.op`, driving the pure transforms → writes `downtimeState`; players may only touch their own PC's Activities, GM does everything; `api.downtime({op,…})`). DM tab rewritten (`dm-panel.js`): window control (**Short — a slice** / **Long — a day+** / **End**), the per-PC list **in-scene tokens first then a divider then off-scene**, per-character **gear settings** (`bonusActivities` ± and the show-rules-by-default toggle), and a read view of each PC's Activities (name, plan, `describeRule` summary, progress bar). Player board rewritten (`shell.js #downtimeBoardHTML` v2, still collapsible): lists the PC's Activities and a **New activity** inline name+plan form → `rpc.downtime` upsert; hidden Activities show name+plan only, visible ones show the progress note; remove-own. Old Phase-1a board/handlers/draft-state and the `DOWNTIME_ACTIVITIES` catalog usage retired. **STILL NOT built (next slice):** the DM **Rule-authoring form** (type/roll/DC/shift/target/tick/gain/reward dropdowns + scribe/craft presets + activate + visibility toggle + adjust ±), and the **push-roll** flow (DM pushes → player's visibility-aware roll button → outcome relays → `applyAttempt`). Until then a player can name Activities and the DM sees them, but no Rule can be attached yet.

**DM-panel UX (v0.1.143, DM 2026-07-13):** (1) **Party-rest buttons** live in the DM Downtime tab as its main flow row — Short / Long rest, each dialog-suppressed rest of every player-owned PC (`restParty`), since rests are the montage's heartbeat. (2) **Flyout height cap + drag-resize:** the flyout ("second screen") is a right-side panel whose height forced `clampPos` to shove the whole floating panel up (opening a tall tab hid the primary and needed a re-drag). Now it's capped at a persisted `flyMaxH` (localStorage `mc-dm-panel-flyH`, default 360) with the body scrolling inside; a bottom grabber (`[data-fly-resize]` → `startFlyResize`) drags the cap between `FLY_MIN_H` (150, enough for a tab's main buttons like the two rests) and the viewport, live-updating then re-clamping. Inline `min-height` now honours the shrink (was a static 268 floor).

**BUILT — Phase 2c Rule-authoring form (v0.1.144, 2026-07-13):** each Activity in the DM Downtime tab now has a pen/wand button that opens an inline **Rule form** (`dm-panel.js ruleFormHTML` + `applyRuleField`/`applyRulePreset`, DM-local draft in `dtRuleDraft`/`dtRuleFor`/`dtRuleActor`/`dtRuleVisible`). Controls: **preset** chips (Freestyle / Scribe / Craft — scribe/craft seed a per-day tally via the pure suggesters; the real owned-scroll & tool-proficiency pickers are the next refinement), **Kind** (roll / tally / cumulative), a **roll picker** (ability / save / skill / custom dice, resolving `roll.label` from CONFIG so the player button reads right) shown only when the type needs a roll, type-specific fields (roll: DC + "DC each miss" + stop-at floor; tally: target + tick-source + adds + require-roll toggle; cumulative: target + gain-mode + min + crit toggle), a **reward** field, a **show/hide-to-player** toggle, a live `describeRule` preview, and **Activate** (→ `setRule` + `setVisible`). Layout-changing selects re-render; text/number inputs commit on blur so a following Activate click isn't swallowed; a roll-needing rule with no flavour auto-seeds an ability (`seedRollIfNeeded`). Activities with a rule also get inline **−/+ progress nudge** (`adjustProgress`) and an eye icon when visible. **BUILT — push-roll (v0.1.146, 2026-07-13):** the montage heartbeat. Activity gains a `pending` flag (`setPending` transform; cleared by `applyAttemptTo`). DM side: each live rule-bearing Activity shows **Push roll** (roll rules → `pushRoll` op sets pending; button reads "Waiting…" and toggles off) or **Tick +N** (no-roll rules → `applyAttempt` with a null outcome, the DM ticks it directly), alongside the −/+ nudge. Player side: when `pending && needsRoll`, the board shows a big **roll button** whose label is the visibility-aware `playerRuleView.button` ("Roll a DC 100 Intelligence check" if shown, "Roll an Intelligence check" if hidden). Tapping runs the dnd5e document roll (`rollSkill`/`rollAbilityCheck`/`rollSavingThrow`, or a custom `Roll` for a formula — all render locally on the canvasless phone), reads `total` + the natural d20 (`dice.find(d=>d.faces===20)`) for the luck toggles, and relays `applyAttempt {total,nat}` → progress advances, pending clears, and the DM gets a toast with the result note (`"Bob — Learn Elvish: Missed (rolled 5). DC now 80."`). Engine tests 59/59.

**BUILT — scribe/craft pickers + long-rest reminders (v0.1.147, 2026-07-13) — downtime feature-complete.** (1) **Scribe preset** now shows a dropdown of the PC's actual spells (low level first, from `actor.items` of type spell); picking one runs `scribeScrollSuggest(level, name)` → seeds a per-day tally to the XGE day-count with reward "Scroll of X" and a DM-only note "≈ N days · G gp materials (your call whether to charge it)". (2) **Craft preset** shows the PC's tool proficiencies **highest check-bonus first** (`actor.system.tools`, bonus from `.total` or prof×PB+abilMod, label via `CONFIG.DND5E.tools`/`Trait.keyLabel` with a key fallback); picking one sets the rule's roll to that tool. Both resolvers are try/catch-guarded → degrade to "— no spells/tools —" rather than throwing (untested against the live dnd5e data shape; labels may want a tweak after a live check). (3) **Long-rest reminder:** the DM Downtime tab's **Long rest** now also calls `advanceRestGoals` — one read-modify-write that advances every active `tickSource:"rest"` goal at once (no-roll tallies like nightly pushups tick +perTick; roll-gated ones get `pending` set so the player rolls), with a toast "…, N nightly goals advanced". **Downtime is now end-to-end: DM calls a window → players name Activities → DM authors a Rule (freestyle / scribe-from-spells / craft-from-tools, with double-on-20/none-on-1) → DM pushes rolls or ticks / long-rest auto-advances → progress tracks, shows or hides per the visibility toggle, and completes to the reward.** Remaining polish ideas (not blocking): party-inventory scroll sources for scribe, a bigger custom lump-adjust, and the montage "Day N" framing.

**Model pivot → DM catalog, players pick (v0.1.156–159, DM 2026-07-13).** Live-test feedback flipped the flow: instead of players free-creating and the DM ruling, **the DM authors a named activity + rule; it becomes a reusable catalog "suggestion"; players PICK from it** (the DM decides names). Decisions (via AskUserQuestion): group activities = **two separate templates** (Teaching/Learning a Sword; the DM grants advantage by hand, auto-link deferred); **players pick-only** (no free-create/request in-app); **nat-20/nat-1 are a per-rule DM choice** (none / auto-succeed / double-the-DC-step; none / auto-miss / no-step — auto-winning a DC 100 on a 1-in-20 is silly, doubling the learning step isn't). The `note` is now **DM-only** (balancing/gold/time reminders), never rendered player-side. **BUILT:** engine — `nat20`/`nat1` enums replacing `critBonus`/`fumbleZero` (back-compat fallback); a `templates` catalog with `newTemplate`/`upsert`/`remove`/`setTemplateRule`/`setTemplateNote`/`pickTemplate` (copies a template into a player's list as an independent instance with its own progress) and `seedTemplates` (Scribe a spell, Teaching/Learning a Sword, Nightly pushups); relay ops (authoring GM-only, `pickTemplate` player-allowed). UI — DM Downtime tab now has an **Activities catalog** ("+ New activity" → name → Set the rule + DM-only note; delete; "Add a few examples") above a **"Who's doing what"** roster where each in-scene PC shows their picked instances (progress + push-roll) and a **"Give a task"** picker to assign a template. Player board replaced free-create with a **"Pick an activity"** list of the catalog; the DM note never shows. Engine 73/73. **Deferred:** auto teacher→learner link; scribe/craft real-data pickers only work when a specific PC's sheet is in scope (templates are generic).

**DM-side "Add a task" (v0.1.150, DM 2026-07-13) [superseded by the catalog pivot above].** Live-test gap: the model was player-initiated only (players name Activities on their phones), so a DM testing solo — or one who just wants to *assign* the party tasks ("I gave the entire party tasks") — had no way to create one and every card read "waiting for the player". Each in-scene PC card now has a **+ Add a task** button → inline name/plan form → `upsertActivity` (GM bypasses the player-op gate), after which the DM goes straight to **Set the rule**. Also hides out-of-scene PCs + excludes them from party rest (see v0.1.150 commit).

**CURRENT STATE (v0.1.171, 2026-07-16) — the working downtime model, verified live in-world via the browser tools.** Flow: DM opens a window (**Short** / **Long**, app-style buttons; explanation in one line below). Each in-scene PC picks **ONE** activity from a **dropdown** on their phone (no player lock-in — `selectActivity` relays it live; switching replaces, re-picking the same reuses the instance so long-term progress survives across windows). The choice lands on the DM's **"Who's doing what"** drawer; the DM can also **"Give a task"** (same `selectActivity` op). The DM then hits **"Start activities"** (`startActivities`) → pushes the first roll to every selected roll-rule (`pending`), and only then do Push-roll / Tick / ± appear; **"Reopen choices"** backs it out. The DM authors the catalog in the **"Activities"** drawer (**+ New** in the header → name → the rule builder). **Two accordion drawers** (roster / catalog) collapse independently to tidy the tall window. Rule builder is grouped into **Progress** and **The roll** sections with 2-across number fields; nat-20/nat-1 are per-rule dropdowns (`nat20`/`nat1`: none / succeed|double / fail|zero — replaced the old `critBonus`/`fumbleZero` booleans, back-compat kept). Progress shows on **both** ends (DM full numbers; player a bar + numbers only when the rule is `visible`). DM-only `note` never renders player-side. Instances + progress persist in `downtimeState.activities[actorId]` regardless of the window (surfaced only while open — could later go to the party Journal). Palette is **uniform gold** (no blue left; green/red are semantic). Player roll button is gold. Engine 84/84. Key regression fixed live: the DM activity card used the class `mc-hidden`, which collides with the shell's search-filter `.mc-hidden { display:none !important }` — it had silently hidden EVERY DM activity card (the "I couldn't do anything as a DM" reports); renamed to `mc-dt-shown`/`mc-dt-veiled`. Dead-NPC "disappearing" was diagnosed live as **Monk's Bloodsplats** (`bloodsplat-opacity` + `remove-overlay`, triggered by our `dead` status) — fixed at the table (opacity 50%); our marker is correct at the document level, and a gore module's canvas fade is not ours to override. Item Piles auto-loot restores the corpse's own name/art/size after conversion (it had re-skinned the pile as its loot). **Deferred:** auto teacher→learner link; scribe/craft pickers only read a PC's real spells/tools when a specific PC is in scope (templates are generic); optional between-sessions progress view.

**Clarity pass (v0.1.149, DM 2026-07-13 live-test feedback).** First run was confusing: (1) the two "Start downtime" buttons were unclear and shared the green send-button style → now **stacked, self-describing `.mc-dt-openbtn`s** ("Start a short downtime / a watch, an evening, a few hours" · "Start a long downtime / a day, or several days in a hub"). (2) The party Short/Long **rest** buttons sat right under the "Downtime — short slice" header and read as *paired* with the window duration ("short activity goes with short rest, which is wrong") → moved **below the roster**, only when open, under a **"Rest the whole party"** label, buttons relabelled plain "Short"/"Long". (3) After a player named an activity the DM "couldn't do anything" — the set-rule affordance was an icon-only wand that got missed → now a **prominent labelled "Set the rule" button** (gold rail on the card until a rule exists), with Edit demoted to the control row once a rule is set; empty state reads "Waiting for {PC} to add an activity on their phone…". (4) The per-character **cog was too big/inviting** → shrunk ~half (18px) and muted.

**d20-luck toggles (v0.1.145, DM 2026-07-13):** two generic toggles on any roll-involving Rule — **"Double on 20"** (`critBonus`) and **"None on 1"** (`fumbleZero`). Semantics by type: roll → nat 20 auto-succeeds / nat 1 auto-misses; roll-gated tally → nat 20 doubles the tick / nat 1 no progress; cumulative → nat 20 doubles the gain / nat 1 zeroes it (overriding the min-forward floor). Shown in the form as a shared luck row only when `needsRoll`; `describeRule` appends "· ×2 on 20, 0 on 1". Any extra fallout (a crit costing more materials) is the DM's call, not automated. Covered by the engine tests (55/55).

**Two model additions (v0.1.140, DM 2026-07-13):** (1) **Per-character gear settings** — rare, hidden behind a gear icon. `bonusActivities` is the "doesn't sleep" case (a race trait or undocumented backstory ability → extra Activities per beat; `slotsFor(size, settings)` = base-by-size + bonus, a soft guide, DM dictates); `showMechanicsByDefault` seeds the DM's show/hide toggle per player (a crunch preference). Stored in a parallel `actorSettings:{[actorId]:…}` map on `downtimeState` with `getActorSettings`/`setActorSetting`. (2) **Visibility-aware player button** `playerRuleView(rule, progress, visible)` — the SAME Rule, two faces per the DM's per-Activity `visible` toggle: hidden → a bare "Roll a Dexterity check" (no numbers); shown → "Roll a DC 50 Dexterity check" + a note ("−1 DC each miss" / "18/150"). Uses a UI-resolved `roll.label` (so the pure module needs no dnd5e CONFIG), reflects the current shifting DC, phrases saves vs checks, does a/an correctly, and returns `button:null` for a no-roll tally the DM ticks. All covered by the engine tests (49/49).

**SIGNED OFF (DM 2026-07-08)** with amendments: **NO race/Trance detection at all** ("just not possible to follow all the 3rd-party races") — the Zzz default applies to EVERY off-duty PC and the DM toggles individuals by hand (the Trance rules note above stays as table knowledge only); and a **"Skip guard duty" option** starts the night with no watch board (straight to "night passes" → the long-rest prompt). Remaining defaults decided under the sign-off (warnings-not-walls): free placement, a PC may take 0..3 watches (0 = sleeps through; hint, never a block); Zzz = core "sleep" status as a pure visual marker during narration, DM taps any sleeper's marker off to wake them; a sleeping PC's phone shows a Zzz overlay (same pattern as 17.3's paused overlay); at ENCOUNTER START a one-tap chip offers "apply Unconscious + Surprised to the N sleepers" (never auto); when watch 3 ends — or duty was skipped — a prompt offers "night passed — grant the long rest" (runs dnd5e longRest for all); the board lives in the Party tabs for players + a DM panel section behind a "Start the night" action. **DM-INITIATED ONLY (DM 2026-07-08): the whole guard-duty flow starts from the DM's "Start the night" — players never open the watch board themselves; it appears on their phones when the DM starts it (mirrors how pack auto-opens the Party-order tab) and leaves when the night resolves.**

## 18. Travel mode (DM-idea, spec 2026-07-17)

The pitch (DM 2026-07-17): one button pulls the party to the overworld map (zoom-out transition),
grouped automatically. The DM sets the group's travel pace. Players point at the TV with their
hands and debate; the DM draws a dashed freeform route, and the panel converts line length → map
distance (scene grid settings) → travel time at the current pace — numbers DM-only, the line
itself visible to everyone. On agreement, one button walks the group token along the route while
game time and the daylight move with it ("a 10-hour trip could be 5 seconds with the sun setting").
Plus: scene shortcuts (camp / ambush / lair) and shown/hidden map pins (the known villain castle
vs. the secret goblin village the DM can move clandestinely).

### 18.1 Decisions (all DM 2026-07-17)

- **Map calibration is the DM's job.** Distance/time math trusts the overworld scene's grid
  distance + units. If the map isn't calibrated, the numbers are wrong — "not our problem".
- **Freeform imprecision is diegetic.** A wobble in the drawn line is a small detour the party
  made; a big slip is redrawn. The line is visible to players, so redraw-vs-explain is table talk.
- **No terrain math in phase 1.** Estimate = line length ÷ pace; the DM eyeballs the swamp. The
  fuzziness is arguably a feature ("you estimate 2 days, but the terrain is rough — who knows").
  Auto terrain-cost via painted regions (v14 TerrainData) is a LATER maybe (T5).
- **Players never input a destination directly.** They point at the TV physically; the DM is the
  only hand on the map. (A phone "suggest destination" ping is a possible later idea — ledger.)
- **Tick-based journey loop** (design, not yet built): split the route into 1-game-hour ticks.
  Per tick: move the group token one slice along the line, `game.time.advance(3600)`, nudge scene
  darkness toward the time-of-day target with core's animate-darkness so light SWEEPS. Cinematic
  rate ≈ 0.5 real s per game hour, clamped ~4–15 s total. Why ticks beat one-animation-plus-jump:
  the DM can STOP mid-route (ambush!) and clock + position are already consistent at the stop
  point; and each tick fires `updateWorldTime`, so calendars/watch logic see time pass normally.
  Darkness-follows-time is a TOGGLE (some DMs narrate nightfall; some maps hate darkness).
- **Travel must be pausable in human time (DM 2026-07-17).** The tick rate errs SLOW — DM-adjustable
  seconds-per-game-hour with a floor high enough that Stop can land on the intended hour (≈1 s per
  game hour as the default; drop the old 4–15 s total clamp in favor of the DM-set rate). A journey
  is a narration beat, not a loading screen.
- **The journey auto-pauses the game (DM 2026-07-17)** so no player presses a movement key mid-ride —
  the existing pause guard already refuses phone RPC and shows the paused overlay, so pausing is the
  whole mechanism. Executor-side tick writes are direct document updates, unaffected by pause.
  Arrival unpauses; **Stop stays paused** (the DM is probably setting up an encounter).
- **Pace is data, not a stat.** fast/normal/slow → miles-per-day stored as a flag on the group
  actor/token; never write the token's real movement attributes.
- **Per-route transitions already work.** The registry entries (transitions.js) are pickable per
  Scene (Ambience → Transition) AND per Teleport Token region behavior — so tower stairs 2→3 can
  zoom OUT while 4→3 zooms IN, same destination scene, no new code (answered DM 2026-07-17).

### 18.1a Follow-ups (DM 2026-07-19)

- **~~Multi-overworld by grid detection~~ — REPLACED 2026-07-24 by an explicit DM-set list.** The
  original rule treated a scene as an overworld map when its grid cell measured ≥
  `travelOverworldGridThreshold` FEET (default 100), via `gridFeetPerCell()` and a units→feet map.
  **Retired: a false positive is unacceptable.** Being "recognised" as a travel map turns Token Vision
  OFF, which silently destroys that scene's fog of war — and it is invisible until someone notices the
  fog won't reset (which is exactly how it was found; the DM's Cave A had `tokenVision:false` and reset
  was a no-op). A big-cell battle map, an imported scene with wrong grid units, or a theatre-of-the-mind
  backdrop would all have tripped it. DM 2026-07-24: *"misidentification of a map as a travel map is
  very bad, make sure it doesn't happen!"* and *"we might want a list of overworld maps the DM sets…
  keep things K.I.S.S."*
  **Now:** world setting **`travelOverworldSceneIds`** (Array of scene ids) is the sole authority;
  `isOverworldScene(scene)` is a membership test and nothing infers. The Travel tab carries a
  mark/unmark toggle (`data-travel-mark`) per scene — **marking** applies travel lighting, **unmarking
  restores `tokenVision: true`** so fog comes back with the map. The dropdown `travelOverworldSceneId`
  still names the *Switch-scene-to* target for the pull. Migration note: existing worlds recognise
  nothing until the DM marks their overworld map(s) once.
- **Auto-lighting on load (one-shot per scene).** `maybeAutoLightOverworld()` runs on `canvasReady`
  (executor GM only, gated by `travelAutoLight`, default on). First time a **listed** overworld opens:
  Token Vision off (whole map visible, no sight circle), Global Illumination off, darkness unlocked,
  and `environment.darknessLevel` synced to the clock via `darknessForHour`. A `flags.<id>.travelAutoLit`
  guard makes it strictly one-shot so a scene the DM later customises is never re-stomped. This is the
  "automate the behavior" ask — no manual Preflight fix. `checkTravelLighting`
  now prefers the active scene when it's a listed overworld, else the configured one.
- **Route line is dashed, thick, WHITE (`#ffffff`, width 8).** Started warm orange (`#ee5a36`) but it
  read as invisible on the map (DM 2026-07-19: "red line isn't working, lets try white"). Foundry
  Drawings have no native dash, so `routeDashDrawings()` emits one short polyline Drawing per dash
  (dash 0.5 cell / gap 0.45 cell, sampled off the smooth path so each dash follows the curve), capped
  at 140 dashes (dash/gap scale up past the cap). All carry the `travelRoute` flag so Clear / arrival
  delete them together. Foundry's polygon needs ≥3 vertices, so a 2-point dash gets a midpoint
  injected (`routeDrawingFrom`); if the dash batch is still rejected, `finishTravelRoute` falls back
  to a single solid polyline so a line ALWAYS appears. The journey still walks the smooth
  `travelRoutePts`; only the rendering changed.
- **Pause cue restyled to corner spinners (`pause-overlay.js`, DM 2026-07-19).** Foundry's centred
  "GAME PAUSED" bar covered the canvas and hid the travel walk. Core `#pause` is now hidden by CSS;
  `#mc-pause-corners` (four small semi-transparent spinning `fa-circle-notch` icons, one per corner)
  fades in via `body.mc-game-paused`, toggled on the `pauseGame` hook. Non-phone clients only (phones
  have their own shell overlay). Custom id → survives the clean-TV hide list, so the shared display
  still shows a paused cue. UI-BIBLE §5 exception documented (the "never a spinner" ban is for in-app
  waiting chips, not the ambient canvas pause cue).
- **Scene-jump guard — REMOVED (DM 2026-07-19).** A journey-end "snap back to the travel scene if the
  canvas drifted" guard was added for a reported "travel ends in a jump to the previous scene." But a
  legitimate **teleporter crossed mid-journey** looks identical to drift, so the guard yanked the DM
  back to the overworld (where the party no longer was → the "place the party" prompt). Transporting is
  a feature; the guard is gone. Stray lines are handled by cleanup (below), not by re-viewing scenes.
- **Orphaned-route cleanup (DM 2026-07-19).** "Passed a teleport marker off the overworld mid-travel,
  now there's a dashed line I can't remove." Route drawings are flag-tagged, so `deleteTravelRouteDrawings(exceptSceneId?)`
  wipes them across scenes; the Clear button, journey arrival, and drawing a new route all route
  through it. **On every scene switch** (`canvasReady`, active-GM only) it clears routes on the scenes
  you're NOT on — sparing the current scene so a route you're drawing/travelling survives, and a normal
  journey never fires `canvasReady` so the walk is untouched. No UI button (DM: "I don't want a Clear
  button; just run the cleanup on scene switch").

- **Right-click pans, not cancels (DM 2026-07-19).** Both arming flows (party placement + route draw)
  used right-click as their cancel — but right-click-drag is how you PAN the map to decide where to
  place/draw. Now right/middle buttons pass through to the canvas (pan), only left does the action, and
  **Esc** is the cancel. Route draw also drops its `contextmenu` capture. Re-arm is a tap on **Switch**
  (placement) or **Draw from party** (route), so a cancel is never a dead end.

### 18.2 Build slices

- **T1 — Travel tab + pull-to-overmap (BUILT 2026-07-17).** DM-panel "Travel" dock tab: overworld
  scene picker (world setting `travelOverworldSceneId`, config:false, set from the tab) + one CTA.
  `travelBegin` RPC: auto-packs via handlePartyPack when unpacked — with `force: true`, which
  SKIPS the 3×3 cluster gate (DM 2026-07-17: "if the DM decides to pull the party from a scene he
  should be able to — we try to avoid blocking the DM from choosing"; scattered members collapse
  onto the formation's edges, warnings-not-walls). Runs while PAUSED (no requireExecutor — its
  pause guard blocks players, but the DM tables sit paused out of combat and travel is DM-only;
  live-test finding 2026-07-17). **T1.5 placement rework (DM 2026-07-17, live test: "i found my
  party in a random location" — the map-center fallback):** travel is now two steps — PREPARE
  packs and the DM's client VIEWS the overworld (view, not activate: the DM goes first, alone);
  a one-shot capture-phase click on #board (world coords from `canvas.mousePosition`, snapped
  via `grid.getTopLeftPoint`) is the landing spot; right-click cancels (party stays packed on
  the old scene). DROP lands the token, saves `travelPos`, and only then activates, so the
  table follows with the transition. Works as a re-place when already on the overworld. If the
  overworld's transition is UNSET (schema initial null → core's default wipe; live-test finding
  2026-07-17), travelBegin defaults it to mcZoomOut first — an explicit DM choice is never
  overridden. Per-route transitions elsewhere (tower stairs up vs. down) stay per-scene / per
  Teleport-behavior config, as before. **Shader v2 (DM 2026-07-17: "more streaks and fade"):**
  radial streak sampling + full-length exponential cross-fade adapted from GL Transitions'
  CrossZoom (rectalogic, MIT) — 24 dithered taps marched toward the anchor with parabolic
  weights, streak strength sin-peaking mid-flight (crisp endpoints). Feel constants to tune on
  the live TV: SAMPLES 24 / STREAK 0.35 / zoom 11× / expEase dissolve.
- **T2 — Pace + route (BUILT 2026-07-18).** Pace picker on the tab — Slow/Normal/Fast → 18/24/30
  mi/day, stored as the group flag `travelPace`. Route: the DM arms "Draw from party" and drags a
  freeform line on #board (capture-phase pointer events, anchored at the party token's center so
  no token selection is needed); on release the GM client writes a polygon Drawing (flag
  `travelRoute`, solid gold — Foundry Drawings have NO dash style) that players see, and the panel
  reads out DM-only length→distance (px / grid.size × grid.distance)→time (miles×8/mpd hours,
  miles/mpd days) at the current pace. "Clear route" deletes it. A new route replaces the old.
- **Time→lighting settings (found 2026-07-18):** Foundry core does NOT tie worldTime to darkness —
  the T3 loop drives `scene.environment.darknessLevel` via `update(..., {animateDarkness: ms})`.
  For it to SHOW on a **fully-visible overworld** (DM 2026-07-18: "still lets players see all of
  it"), the scene needs: **Token Vision OFF** (no fog / no sight-range circle — the whole map is
  visible, and darkness still tints it), Global Illumination OFF (it would cancel the dimming), and
  darkness unlocked. CORRECTED 2026-07-18 — the first pass set Token Vision ON, which limited each
  player to their token's ~120ft sight on a huge map (the reported bug). `checkTravelLighting`
  (warn + one-tap Fix) now enforces tokenVision:false + globalLight off + unlocked. The night
  darkness caps ~0.7 (`darknessForHour`) so night reads as dim, not black, on the visible map.
- **T3 — The journey (BUILT 2026-07-18).** "Start journey" ticks the group token along the route
  polyline, one game-hour per tick: moveGroupTo (animated) → `game.time.advance(3600)` → if the
  "Daylight follows time" toggle is on AND the scene allows (globalLight off, unlocked), sweep
  `environment.darknessLevel` toward `darknessForHour(hour)` (sinusoid: 0 at noon, 1 at midnight)
  via `{animateDarkness}`. Real rate ≈ 1 s/game-hour clamped to a 4–40 s total. Auto-pauses on
  start (only unpauses on arrival IF the journey was the one that paused); **Stop** halts and STAYS
  paused (encounter). On arrival: save `travelPos`, delete the route Drawing, clear the readout.
  Toggle stored as the group flag `travelDarkness`. TODO T3.5: the per-X-hours random-encounter roll.
- **T3.5 — Random encounters (DM 2026-07-17, "opens up a random encounter roll per X hours").**
  Optional per-journey check: every X game hours the tick loop rolls (or prompts the DM) for an
  encounter; a hit auto-Stops — game stays paused, clock and party position already at the
  encounter's exact hour and spot on the line. Pairs naturally with the T4 shortcut strip
  ("ambush on the road" is one tap away).
- **T4 — Pins + shortcuts.** Map Notes as shown/hidden pins with per-pin visibility toggle (known
  castle vs. secret goblin village; DM can move hidden pins), and a shortcut strip of predefined
  scenes (camp / ambush / lair) = one-tap activations with their own transitions.
- **T5 (maybe) — terrain regions.** Painted terrain regions auto-multiply segment cost in the
  estimate; only if the DM actually wants to paint overmaps.

## 20.9 Dead-code sweep (2026-07-22)

DM: *"just like the themes stayed behind, i don't want stray mentions of the 'active PC' and
multiple owners code showing up… be careful when trimming."*

Removed, each verified unreferenced first:

- **DM-assign chip list** (`assignHTML` + `activePlayers` + the `[data-user]` and
  `[data-action="clear"]` handlers + 9 CSS rules). It was the only producer of `data-user`, and
  nothing called it — superseded by the Rolls tab's per-PC crosshair, which calls the same
  `api.assignTargets`. The panel's own header still advertised it as job #1.
- **`bonusActivities` / `WINDOW_SLOTS` / `slotsFor()`** — the "extra activities per beat" stepper.
  Downtime became ONE activity per player on 2026-07-14 (`selectActivity`), which superseded the
  whole slots idea, and **nothing ever read `slotsFor()`**: the DM could set +2 and no code
  consumed it. A control that silently does nothing is worse than no control. `showMechanicsByDefault`
  stays — it is read when authoring a Rule.
- **`formatValue`** (enforcer.js), unreferenced.
- **50 CSS rules** from the retired Phase-1a downtime (`mc-dt-item*`, `mc-dt-days*`, `mc-dt-lock*`,
  `mc-dt-budget`, …).

**Kept deliberately, with the reasons, so they are not re-trimmed later:**

- **`user.character` is NOT dead.** What was retired (§2) is *routing* on it. It remains a
  legitimate **preference**: player colour, panel labels, the phone's default subject, and the
  default watch subject. Preflight's warning that the display account must not have one is also
  still correct — midi's `playerForActor` branch 1 matches an assigned character *ignoring
  ownership*, so a TV with one really would swallow prompts.
- **`craftSuggest`** — unwired, but documented shipped API (§17.7) awaiting the item-value picker.
  The authoring form's comment was corrected: it claimed scribe/craft "use the pure suggesters",
  when craft never calls `craftSuggest` and scribe only calls its suggester once a spell is picked.

**Method note — a naive CSS sweep is unsafe here.** Class names are built by interpolation
(`mc-dmp-pf-${c.status}`, `mc-coin-${k}`, `mc-def-${cls}`, `mc-econ-${…}`, `mc-enc-${tier}`,
`mc-prof-${…}`, `mc-rec-${…}`, `mc-event-${…}`, `mc-move-${…}`, `mc-theme-${…}`, `mc-fly-${…}`).
A static grep flags those as orphans and deleting them would have broken preflight status colours,
currency and defence chips. Only prefixes with **no** interpolated form (verified per-prefix) may be
swept, and grouped selectors must be skipped rather than edited.

---

## 21. Sound — Settings › Sound (DM 2026-07-22, BUILT)

> DM: *"once sound works, I think we'll need the settings tab back for a sound accordion drawer."*

**BUILT 2026-07-22** across commits 935596d / 71f33c6 / 0379534 / da9dd7e / 9faffd9. What shipped:

- **The TV can play positional sound again.** The Observer change (e50c1ef) had left the display
  with zero listeners — it controls nothing (releaseAll keeps merged vision) and Observer ≠ Owner —
  so all positional audio was silent. `setupDisplayAudioListeners` (main.js) gives the display its
  listeners from the party's tokens (pets included). Loudness stays core's rule: CLOSEST listener
  wins per source (`_syncPositions` keeps the max), never an average, never the last token moved.
- **One-tap audio unlock** — a browser plays no audio until a gesture, and a TV never gets one;
  `setupDisplayAudioUnlock` shows a full-bleed "Tap to enable sound" on the display until unlocked.
- **Settings › Sound** (the tab is back, accordion drawers): the three Foundry channels (Music /
  Environment / Interface) as sliders that set the **display's** volume via a world setting the TV
  mirrors into its own client volumes; **Mute the table** (globalMute); **Who the display hears
  through** — per-token deafen chips + Ignore/Listen-through-everyone; **combat audio POV** (world
  setting `combatPovAudio`, off by default — hear from the active combatant in combat, the mirror of
  `combatPovVision`); and a **display audio status line** (the TV reports {locked, muted} over the
  socket so the DM can tell "muted" from "never tapped, can't play" from their chair).

**Still open (small, if wanted):** phone SFX opt-outs (dice / prompt / combat-start are always-on
core sounds); a second-client live confirmation that Mute actually silences the room (verified at the
property/setting level only, single-browser).

---

### 18.3 Open questions (ledger)

- ~~Darkness curve~~ **RESOLVED (DM 2026-08-02)** — see §18.4 below.
- Phone "suggest destination" ping — wanted at all, or does pointing at the TV cover it?
- ~~Calendar: plain `game.time` for now~~ **OBSOLETE — already built** (`gametime.js`, 2026-07-17→24;
  an earlier 2026-08-02 note here wrongly called it undecided). Simple Calendar Reborn is read when
  present and the module falls back to its own clock otherwise, capability-checked at every call.
  What remains UNUSED is SC's richer data, all of which SC Reborn exposes (`sunrise`, `sunset`,
  `getCurrentSeason`, `getAllMoons`):
  - **Sunrise/sunset → the §18.4 curve.** Dawn/dusk are currently hardcoded at 06:00/18:00, so
    every day is an equinox. Reading SC's real sunrise/sunset for the date would give seasonal
    nights (long winters), degrading to 06/18 without SC. Small, and it improves what §18.4 just
    shipped — the best-value piece.
  - **Moon phases.** Thematically loud for a campaign called The Crooked Moon and for §32's
    residents; needs a decision on what a phase should DO before it's worth wiring.
  - **Seasons.** Only interesting if weather/ambience should follow them.

### 18.4 Day/night: one curve everywhere, interiors are regions (DM decision 2026-08-02, BUILT)

> DM: *"I can mark a region to not take into account the natural lighting… I'd rather have a small
> curve and keep global lighting in all scenes, I'll mark interior regions myself."*

The scenario that decided it: a cave map with an **outdoor** and an **indoor** region. The party
should be able to plan — or blunder into — an arrival at 02:00 and find the outdoors dark, while
arriving at 10:00 finds it lit, all without the DM touching the lighting.

**The model.**
- **The clock drives darkness on EVERY scene**, not only maps whose global illumination happens to
  be off. The old gate (`!env.globalLight?.enabled`) skipped exactly the maps the DM lights, and is
  gone. A **locked** darkness still wins — that's a deliberate freeze.
- **Global illumination stays ON and plays the sun.** It is no longer treated as a fault. Its
  darkness threshold is what makes night land, so the only thing worth policing is a sun that never
  sets (threshold ≥ the night peak).
- **Interiors are the DM's job**, marked with Foundry's own `adjustDarknessLevel` region behaviour
  (confirmed present in 14.365). The module deliberately does not try to guess indoor/outdoor.

**The curve — FOUR phases (DM 2026-08-03: "gradual dark to light, full light, gradual light to dark
and full dark").** Lives in `preset.js`, shared by the panel and preflight so they cannot disagree:

```
full dark ──/ dawn ramp /── full light ──\ dusk ramp \── full dark
```

`NIGHT_DARKNESS_PEAK = 0.7` is "full dark" (deliberately not 1.0 — a fully-visible overworld must
stay readable at night), full light is 0, and `DAWN_DUSK_RAMP_HOURS = 1` is the gradual bit. The
ramps are **centred** on sunrise/sunset, so sunrise is the midpoint of getting light — the half
before is twilight, the half after is the sun climbing — rather than its start.

This replaced a rolling cosine, which was never flat: every hour was a slightly different shade, so
"daytime" had no plateau and noon was the only true daylight. Verified headlessly (no world needed,
`scratchpad/curve-test.mjs`): a default day is 661 min full dark · 118 min ramping · 661 min full
light = 1440/1440, each ramp monotonic, hour wrapping (−1/0/24/25) and NaN all resolve to full dark.

**Sunrise/sunset come from the calendar when there is one.** `gametime.js` `sunTimes()` reads SC's
date object (`.sunrise`/`.sunset` are timestamps, so each is fed back through `timestampToDate()`
rather than assuming a unit), range-checks the result and requires sunrise < sunset; anything odd
returns `{}` and the curve uses a plain 06:00/18:00 day. So a winter date genuinely gets a long
night. **Caveat: the SC path is written from SC Reborn's source, not yet exercised against a live
world — the validation means a wrong guess degrades to the default day rather than breaking.**
`GLOBAL_LIGHT_NIGHT_THRESHOLD = 0.35` = half the night peak, so the sun yields during the ramps.

**Preflight changed accordingly:** "Global Illumination is ON" is no longer a problem; "Global
Illumination never yields to night" is, and its fix corrects the threshold while **leaving the
light on**. Verified on the bench: threshold 1 → warn → fix → 0.35, global light still enabled,
row OK; sun up at 06/12/18, down at 04/19.

---

## 19. REST — folding Downtime and Watches into one thing (DM-idea, spec 2026-07-17)

> DM: *"move start the night and its inner widget into downtime tab… try to make a flow that makes
> sense for both DT and watch… DM starts rest not night… Go over the logic of this and try to
> smooth it out."*

### 19.1 The actual problem

Downtime and Night are **two features that mean the same thing**: *time passes while the party is
camped.* Today each has its own entry, its own state, its own window and its own ending:

| | Downtime | Night |
|---|---|---|
| entry | "Short downtime" / "Long downtime" | "Start the night" |
| lives in | Downtime tab | the PRIMARY panel |
| state | `settings.downtime.window {open,size}` | `group.flags.night {watches,watch}` |
| ends via | "Close" (explicitly does NOT pass time) | "End night" (offers a long rest) |

So the DM answers "is time passing?" twice, in two places, and only one of them actually rests
anybody. **That** is the thing to smooth — not the button labels.

### 19.2 The model: a Rest has phases

ONE object. One lifecycle, one ending, two optional phases.

```js
rest = {
  size:   "short" | "long",          // dnd5e's own rest; nothing new invented
  phases: { downtime: bool, watches: bool },
  stage:  "setup" | "downtime" | "watches" | "morning",
  watch:  1..3,                      // the running watch
  watches: { 1: [actorId…], 2: […], 3: […] },
  startedAt: worldTime,
}
```

A watch with nobody assigned **does not exist** — that is what "1–3 depending on what's filled in"
means, and it removes the need for a separate count setting. SHORT ⇒ exactly one watch.

### 19.3 The flow

**1. Set up** — one card, one question each:
   - length: `[Short] [Long]`
   - what's happening: `☑ Downtime` `☑ Watches` (either, both, or neither)
   - `[Start rest]`
   - Neither phase ticked ⇒ it's a plain dnd5e rest: apply it and close. No ceremony.

**2. Assign watches** (only if Watches) — the existing editor, before the clock starts. This is the
   DM's "watch first, then DT": *setup* order, so nobody is asked to sort watches while downtime is
   already running.

**3. The clock starts.** DM and players both see the same header: length, phase, time.

**4. Downtime phase** (if on) — exactly the flow that exists now: players pick one activity, DM hits
   Start activities, attempts resolve. DM ends the phase with `[Watches]` (or `[Morning]` if watches
   are off).

**5. Watch phase** (if on) — "First watch — *(icon) Test Wizard, (icon) Abzarax*" on the DM's panel
   AND on every phone. Per watch the DM has:
   - `[Next watch]` → the next watch that has anybody in it
   - `[Pass time]`  → advance the clock by that watch's hours
   - `[Event]` / `[Encounter]` → hand off to the DM's own tools
   After the last watch ⇒ **Morning**.

**6. Morning / End rest** — apply the real dnd5e rest (`actor.shortRest()` / `actor.longRest()`) to
   the party, then close. **This is the only place a rest is applied**, which fixes today's split
   where "Close" passes no time and "End night" quietly offers a long rest.

### 19.4 Decisions taken (mine, unless flagged)

1. **The tab becomes "Rest"**, and it owns everything. Night leaves the primary panel — the primary
   is for things you touch mid-scene; a rest is a mode you enter (DM 2026-07-17).
2. **The button says "Rest".** Not "Start the night", not "Start a short downtime". §7.1.
3. **Short ⇒ 1 watch.** Long ⇒ up to 3, existence driven by assignment.
4. **The rest applies at Morning, once.** Never at Close.
5. **Downtime is available on a short rest** — 5e limits what you can *do* in an hour, but that's
   the Rule's business (a Rule already carries its own cost/target), not the shell's.

### 19.5 Open questions — RESOLVED (DM 2026-07-17)

1. **THE CLOCK** → **one adapter, SC-optional** (his call: "two versions… so if a version conflicts
   with the mod it won't completely break"). Key fact: SC doesn't own the time, `worldTime` does —
   SC only interprets it. So `gametime.js`: advance is one call either way; only the LABEL asks SC,
   feature-detected per call and wrapped to fall back to our own clock (campaignStart + worldTime,
   default 21:00) if SC is absent/disabled/broken. BUILT — see the commit.
2. **Pass time** → **advances the real `game.time.worldTime`.** Time-based effects and other modules
   listen to it; a rest that doesn't really pass time is the bug we're removing. (Route via the
   executor — GM-only.)
3. **Encounter** → **just mark the watch; the DM runs it.** No auto-combat, no guessing which tokens
   are in it. The module stays out of how fights are run.
4. **Who advances a phase** → **DM only.** Matches "Start activities" — the DM is the clock. Players
   can't rush past a beat the DM might narrate or interrupt.
5. **Watch hours** → **split the rest evenly** across filled watches (8h ÷ N). Automatic; the classic
   "everyone takes a turn" model. (A per-watch override can come later if a table wants uneven
   watches — not v1.)

### 19.6 Build order (once §19.1–5 land)

1. `gametime.js` clock + a clock chip on the panel. DONE + VERIFIED (v0.1.209): SC-absent path
   shows "Day 1 · 21:06", advances with worldTime (rolls past midnight), sun/moon flips at 06:00/18:00.
2. The `rest` object + the setup card ([Short|Long] · ☑DT ☑Watches · Rest). Migrate the two old
   states into it behind a one-time read.
3. Watch assignment (reuse the existing editor) → clock starts.
4. Downtime phase = today's flow, now inside Rest.
5. Watch phase: First/Second/… watch on panel + phones; Next / Pass time (advance N h) / Event /
   Encounter (mark only).
6. Morning: apply the real dnd5e short/long rest to the party, ONCE. Retire "Start the night",
   "Close" and "End night".

### 19.7 Build log

- **Slice 2 — the Rest envelope. DONE + VERIFIED (v0.1.224, 2026-07-17).** Chose a *thin envelope*
  over a from-scratch rewrite: the Rest is the single entry (a setup card) and the single ending,
  and it DRIVES the two existing mechanisms rather than replacing them — the downtime window (world
  setting `downtimeState`) and the watch board (the group's `night` flag). Envelope state lives on
  the party group's `rest` flag `{ size, phases:{downtime,watches}, startedAt }`.
  - Tab **"Downtime" → "Rest"** (`fa-campground`); **"Start the night" removed from the primary panel**
    (§19.4-1). `nightHTML()` repurposed to `watchBoardHTML(group)` — an embeddable board with no
    standalone start and no separate "End Night" (the Rest owns both). `downtimeHTML(embedded)` gained
    a flag that suppresses its own setup head + party-rest row when nested.
  - **Setup card:** Length `[Short|Long]`, Happening `[☑ Downtime] [☑ Watches]`, `Start Rest`, live
    hint. **Neither phase ticked ⇒ a plain dnd5e rest applied immediately, no flag, no ceremony.**
  - **The one ending:** `applyPartyRest(group, size)` rests the **group members** (the party is
    usually camped OFF the active scene — the old `restParty` in-scene filter rested nobody; that was
    caught + fixed live). Both `Start Rest` (neither-phase) and `End Rest` route through it.
  - Verified live as GM: setup renders; both-phase start → active view (header + clock + watch board
    + embedded downtime) with the night flag at `assign` and the DT window open; End Rest heals ALL
    party members incl. an off-scene PC (6→14) and tears down both flags + the window; neither-phase
    start heals immediately with no flag.
  - **Deferred to later slices (3–6):** the §19.3 *sequencing* (watch-assign → clock → downtime →
    watch-run → morning is currently concurrent, not staged); the phones' shared running header;
    Pass time / Event / Encounter on the watch phase; the one-time migration of any already-open
    downtime window / legacy night flag into a `rest` envelope.

- **Slices 3 + 5 — the staged flow + watch-phase controls. DONE + VERIFIED (v0.1.225, 2026-07-17).**
  The Rest is now a real state machine: `rest.stage ∈ assign → downtime → watches → morning`, with
  a per-stage advance button; stages for an off phase are skipped. `advanceRest()` opens/closes each
  mechanism as its stage begins/ends (downtime window on entering *downtime*, watch sleep on
  entering *watches*), so they run **in order**, not concurrently.
  - **Assign** (watches on): the editor only, no clock/DT yet; `Begin Rest` starts the clock and
    routes to downtime (if on) else the watch run.
  - **Downtime**: the embedded window; `To Watches` / `To Morning` advances.
  - **Watches** (running): per-watch `Pass Watch · Xh` advances the REAL `game.time.worldTime` by
    that watch's share (8h ÷ filled watches — §19.5-5) then steps to the next filled watch, or to
    morning after the last; `Event` / `Encounter` drop a badge on the watch (the DM runs it,
    §19.5-3); `To Morning` skips the rest. Verified: 3 watches passed = exactly 8h, handoff sleeps
    the right PCs, encounter badge shows on the chip.
  - **Morning**: `End Rest` applies the party rest once.
  - **Two robustness fixes found live:** (1) `wakeActor` now swallows the "ActiveEffect … does not
    exist" that dnd5e's own sleep-cluster cascade races — that reject was *aborting* the stage
    transition after the clock had advanced (clock moved but stage stuck). Kept the per-status
    `toggleStatusEffect` loop (NOT a raw effect delete — a delete bypasses dnd5e's linkage and
    leaves "prone" re-derived from unconscious). (2) Teardown now sets the stage *before* unsetting
    the night flag, so a re-render never sees `stage=watches` with no flag (was throwing "reading
    'watches'").
  - **Still deferred (4, 6-migration):** the phones' shared running rest header; the one-time
    migration of a legacy open downtime window / night flag into a `rest` envelope.

- **Setup refinements (v0.1.226–227, 2026-07-17).** Rest TYPE is Short / Long / Downtime (they read
  as the rests they are) + an independent Watches toggle. **Watch count is per type** (DM
  2026-07-17): **Short = 1 watch, Long = up to 3, Downtime = none** (a safe hub — the toggle is
  disabled and reads "No watches"). The count rides the `night` flag as `count`, so the DM grid AND
  the phones show only the slots that rest has (grid columns, phone rows, and the header ordinals
  all follow it). Short → `size:short` → `shortRest()`; Long & Downtime → `size:long` →
  `longRest()`; Downtime also runs the activity phase. Also: the assign grid got column headers
  (1st/2nd/3rd) + an explainer, and the embedded downtime roster lists the **party (group members)**
  not in-scene tokens (a camped party is off-map — a PC's pick wasn't registering, "nobody has
  chosen yet"); "Start activities — nobody's chosen yet" → "Start Activities" (state → tooltip).

## 20. Item transfers (DM-idea, spec 2026-07-18)

One-way transfers of items + coins between a PC and another PC, or between a PC and the party
stash (the GROUP actor's own items — already browsed read-only in §15's shared inventory). NO
NPCs (merchants already work via Item Piles). NO two-way swap — a transfer moves in one direction.

### 20.1 Model & decisions (all DM 2026-07-18)

- **Two targets, one committing rule.** You transfer with (a) another PC, or (b) the party stash.
  A transfer commits only when the *other side* consents: the receiving player accepts/declines a
  PC give; the giving player accepts a pull; the **DM** accepts anything DM-owned. EXCEPTION
  (simplification): the **stash needs no acceptance** — put-in / take-from commits on the player's
  own accept (the DM oversees the stash but doesn't gate each move).
- **Proximity for PC↔PC.** Story matters — you can't toss a potion across the room. Reuse the Use
  flow's proximity target-picker to pick the nearby ally (reach-gated). The stash has no distance.
- **No new per-item buttons** (heavy UI). ONE "Transfer" entry (equipment tab) opens the composer;
  destination (nearby ally / party stash + put|take) is chosen inside it.
- **Composer:** toggle your items and coins; each stack has a +/- **quantity** stepper. Coins are
  amounts by denomination.
- **Live offer:** the receiver's popup fills/empties as the sender edits — pushed on a **~1s
  throttle** (no true realtime needed).
- **Offline receiver → the DM** gets the accept/decline instead (a DM-panel chip, scribe-style).

### 20.2 Build slices

- **T-core (BUILT 2026-07-18).** `moveItemsAndCoins(src, dest, itemMoves, coins)` — the first
  cross-actor Item move in the module: merges into a matching destination stack or creates a copy,
  decrements/deletes on the source, moves coins by denomination (validates the source can cover
  them). `handleTransferStash({actorId, dir:"put"|"take", itemMoves, coins})` — resolves the PC's
  group, moves instantly, owner-gated. Registered as `api.transferStash`.
- **T-stash UI.** Equipment-tab "Transfer" button → composer with a put/take toggle over the stash;
  item toggles + qty steppers + coin amounts → api.transferStash.
- **T-p2p — BUILT 2026-07-20 (Milestone B).** Same composer, destination = a **nearby PC ally** — the
  composer lists allies within ~10 ft (`#nearbyAllies`, computed client-side from scene token
  positions; NPCs excluded), each a "Give to …" button. Commit → `handleTransferOffer` (executor):
  re-checks proximity authoritatively (`MidiQOL.computeDistance ≤ 10 ft`), then:
  - **Same owner** (your own summon / second PC) → commits **instantly**, no self-accept.
  - **Online receiver** → an offer is pushed to their phone as a **`trade` entry in the pending
    queue**, so the attention bell surfaces it; the offer card (green) has Accept / Decline →
    `handleTransferRespond` commits via `moveItemsAndCoins` or drops it; the giver is toasted the
    result.
  - **Offline receiver** → a **DM reaction-widget chip** (kind `trade`) lets the DM accept/decline on
    their behalf.
  One-way only, no NPCs, no action-economy automation. (The live-fill-while-composing preview was
  dropped per DM "don't need realtime" — the offer is sent on commit, one push.)

### 20.3 Ledger

- Whole-stack merge key = same name+type+identifier, not a container. Revisit if identical-name
  items with different data should stay separate.
- Stash take is first-come-first-served (no reservation) — fine for a party (DM 2026-07-18).

- **No action-economy automation (DM 2026-07-18).** Whether a transfer is a free action, a bonus
  action, or a full action is the DM's ruling narrated at the table ("that potion is free",
  "5 arrows as a bonus action", "the armor is your whole turn") — the app never consumes an
  action or checks the economy for a transfer.

## 21. Pending-action queue + attention bell (DM-idea, spec + BUILT 2026-07-19)

The problem (surfaced by a wizard + familiar + summon hit by fireball): the phone stored **one**
save prompt, one reaction, one AoO — each a single slot that **clobbered** on a burst. Three saves →
you saw one; two AoOs → you got one. Fix: a **unified queue** + a header **bell** that navigates it.

### 21.1 Findings that shaped it

- **Reactions and AoOs are self-contained.** `#useReaction`/`aoo-attack` fire off the activity's
  **UUID** (`rpc.useActivityStart`), not the viewed subject — so, like saves, they roll on the right
  creature regardless of which token is on screen. So the "switch to the token" leg is a UI nicety
  (context/clarity), not a mechanical requirement. The real bug in all cases was the single-slot
  clobber.
- Each prompt already carries its actor: save `actorUuid`, reaction `reactorUuid`; AoO now carries
  `reactorUuid` + `reactorTokenUuid` (added to `dispatchAoO`).

### 21.2 Model (BUILT, shell.js)

- `#pending = []` replaces `#savePrompt`/`#reactionPrompt`/`#aooPrompt`. Entry:
  `{id, kind:"save"|"reaction"|"aoo", actorId, tokenId, payload, expiresAt, timer}`.
- `#enqueue(kind, payload, actorUuid)` resolves actor→tokenId, de-dupes by kind+actor, sets a
  per-entry expiry timer, plays the attention sfx **once per burst** (only when the queue was empty).
- `#cur(kind)` = the entry for the **current subject** (or a null-actor entry, so an unresolved one
  is never stranded); the `#savePromptHTML`/`#reactionPromptHTML`/`#aooPromptHTML` popups render it.
- `#resolve(kind)` drops the current entry on roll/fire/dismiss; a rolled save clears **only the
  creature that rolled** (by `message.speaker.actor`), so rolling the wizard's save keeps the pet's.
- **Combat feeds the bell too (DM 2026-07-19).** The "Roll initiative" prompt and the auto-follow-the-turn
  switch only apply to the current subject, so a secondary token (summon/familiar) that owes initiative
  OR whose turn it now is was invisible when you were parked on another token (e.g. mid-action, when
  auto-follow is skipped). `#attentionActorIds()` now unions the pending queue with, for owned tokens on
  the active scene: **(a) the active combatant when it's another of your tokens' turn**, and **(b) any
  combatant whose initiative is null**. Bell lights and hops just like a save/reaction; clears as you
  switch / roll (`updateCombat`/`updateCombatant` re-render). An NPC's turn never lights it.
- **Bell:** `#bellActive()` ⟺ `#attentionActorIds()` is non-empty (a queued prompt OR an unrolled
  initiative on a token whose actor ≠ current subject). Header
  button `.mc-bell` (by the dice tray): greyed + `disabled` when idle, gold-outlined + pulsing when
  live. `attention-next` hops to the next such token (`#subjectId` = its token) → its popup shows.
  Greys again once the only remaining business is on the token you're viewing; relights if you switch
  away (DM 2026-07-19 rule: keyed to viewed-vs-elsewhere, not a raw count).

### 21.3 Reaction timeout (BUILT)

Phone players need a beat to **notice** a prompt light up before tapping — midi's timeout assumes the
dialog is already on screen. New world setting **`reactionTimeoutPct`** (default **120** = +20%)
multiplies midi's `reactionTimeout` for the prompts the module relays to phones (reaction relay +
AoO). Single source of truth: `reactionTimeoutMs()` in settings.js. It never writes midi's own
setting (so the enforcer is unaffected) and never touches the DM's rolls. AoO moved from
`playerSaveTimeout` onto this (an AoO is a reaction). Saves keep midi's `playerSaveTimeout`.

### 21.4 Not yet / next

- **Trades fold in later:** Transfer Milestone B (§20 T-p2p) registers an incoming offer as a
  `kind:"trade"` entry so the bell surfaces it; **same-owner transfers commit instantly** (no
  self-accept — you don't accept a gift from yourself), matching the stash.
- Needs a live table test (numbered protocol handed to the DM 2026-07-19).

---

## 22. Standing rules and open decisions (consolidated 2026-07-24)

Written at the end of the 2026-07-21→24 run so a fresh session doesn't re-derive them. The *history*
of that run lives in the git log (~34 commits, all pushed, none released); this section is only the
parts that outlive their commits.

### 22.1 Who counts as "the party" — decided PER SUBSYSTEM, not globally

There is no single party predicate, and that is deliberate. Pets/summons (player-owned actors that
aren't `type:"character"`) belong to some subsystems and not others, and each exclusion was a
separately-reported bug or a separately-reasoned choice. Changing one of these does **not** license
changing the others.

| Subsystem | Includes pets? | Predicate | Why |
|---|---|---|---|
| Camera / framing | **yes, in two tiers** | `isPartyActor` (main.js) — any `hasPlayerOwner` + the packed group — split by `isFollowDriver` into DRIVERS (PCs + packed group) and TAGALONGS (pets/summons), and filtered by the per-token `noFollow` flag | The TV should frame the owl (DM 2026-07-22) but a mage hand must not drag it (DM 2026-07-23). Both hold once "framed" is tiered — see §23 |
| Form Up / travelling group | **yes** | `scenePartyActors` — excludes only HOSTILE | A NEUTRAL Sphinx of Wonder and a SECRET Mage Hand were left behind by the old FRIENDLY-only filter |
| Watches | **yes** | `watchMembers` — `character` OR `hasPlayerOwner` | DM 2026-07-22: *"I don't think pets can take watch shifts (that's a bug)"* — an owl absolutely keeps a watch |
| Rest / downtime activities | **no** | `nightMembers` — `character` only | Downtime is one activity per *player*; a familiar doesn't craft |
| Positional audio | **no** | `isAudioListener` / `audioListenerTokens` — `character` + `hasPlayerOwner`, plus the packed group | See below |
| TV auto-follow trigger | **no** | movement of an audio listener | A wandering mage hand shouldn't drag the camera |

**Why pets are deaf** (DM 2026-07-23: *"lets make pets 'deaf'… only PCs get to share sound"*): two
reasons, both worth keeping. (1) **Cost** — every listener adds raycasts to each
`_syncPositions` pass; the earlier all-player-owned-tokens listener set measurably stuttered the DM's
machine. (2) **Correctness** — per-token deafen could not be made to work for summons at all, because
an unlinked token's `token.actor` is a synthetic clone that shares the base actor's **id but not its
flags**, so the flag was written where the token would never read it (this is the bug behind "unseen
servant can't be ignored, mage hand isn't in the list"). Making pets deaf removes the need for
per-token flags on synthetics entirely. If per-token state on summons is ever needed again, it must
live on the **TokenDocument**, and lists must be keyed by token id (two summons off one base actor
otherwise collapse into one row).

**The packed group token is a listener.** While travelling there are no member tokens on the scene at
all — just the one group token — so without that branch a packed party is stone deaf. It also happens
to be the cheapest possible listener set (one).

### 22.2 The syntax gate — `node --check` DOES NOT WORK here

`tools/check-syntax.js` exists because the previous gate was **silently doing nothing**: run through
Foundry's bundled Electron, `node --check` is swallowed and exits 0 on arbitrary garbage. Two real
breakages shipped past it (a duplicate class private name; a CSS comment that closed early at `ink*/`
and ate the following `#pause { display: none !important; }` rule, which brought Foundry's pause bar
back). The tool parses JS with `vm.SourceTextModule` and checks CSS for unterminated comments, stray
`*/`, and unbalanced braces — and carries a negative control so a future regression to a no-op is
visible. **Run it on every edited JS *and* CSS file before committing:**

```
ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules \
  "/c/Program Files/Foundry Virtual Tabletop 14/Foundry Virtual Tabletop.exe" \
  tools/check-syntax.js scripts/*.js styles/*.css
```

### 22.3 Open decisions — awaiting the DM, do not build unasked

1. ~~**Camera zoom margin.**~~ **RESOLVED 2026-07-24** — the DM rejected both options and gave a
   third: hold the *clearance*, not a margin. See **§23**.
2. **real-fow replication — ✅ DONE (DM sign-off 2026-07-26: "looks great").** Both tiers shipped as
   the three-way `fogStyle` (off / soft / gpu); the full story, deep dive, and final tuning live in
   **§24**. Tier 1 became `MCSoftFogVisibilityFilter` — the visibility shader replaced via
   `CONFIG.Canvas.visibilityFilter`, inward-fading density gathers + FBM wisps (no drifting animation:
   static wisps read right and cost nothing per-frame beyond the filter pass). Default-off, display
   only; the test world runs `gpu` at radius 100, mask ×4, explored 22%.
3. **§18.3 travel questions are still open** (darkness curve per hour; per-scene vs per-journey; the
   phone "suggest destination" ping). Re-ask when the DM next asks what's outstanding.

### 22.4 Built but never tested with real devices

All of these are verified at the mechanism level on a single browser, which cannot prove them. Say so
plainly rather than reporting them as working:

- TV **combat-POV vision** across a PC turn → a summon's turn → an NPC turn.
- **Two-phone prompt delivery**: a save on a PC, a save on a summon, a reaction on another player.
- The phone **watch-board subject switcher** for a pet.
- **Sound follows the party** as heard on the TV (needs DM + TV clients at once).
- **Mute the table** actually silencing a second client (only the setting/property was checked).

### 22.5 Release state

~41 commits are unreleased. Cutting one means posting the release
tag URL *and* the manifest install URL. Before that release: the DM must mark their real overworld
map(s) with the Travel tab toggle (§18.1a) — the retired grid heuristic no longer auto-recognises them,
so travel lighting will not fire until they do.

---

## 23. TV camera — the clearance model (DM 2026-07-24, BUILT)

### 23.1 What was wrong

Three generations of the out-of-combat follow all shared one mistake: **they recomputed the ZOOM from
the party's bounding box on every step.** Whatever the margin was (40 ft buffer → 25 ft per token),
any step that widened the box lowered the fitting scale, so the camera pulled out — and on a large
scene "out" is the whole map. The DM reported it twice (2026-07-23, 2026-07-24: *"I'm still getting
Fullscreen zoom outs when I move a token"*), and correctly diagnosed it as **his own requirement**
being wrong, not the tuning.

### 23.2 The rule (DM's words, 2026-07-24)

> *"Keep the distance of the token closest to the edge from the edge during move (minimum of 5 ft) —
> if a 3-player group has a player that's 15 ft from the frame and two that are 20, keep it at 15."*

So a **frame is a pair**: the scale the DM set, and the clearance that frame left. Both are captured
together, and the follow's job is to **pan** so the closest driver keeps that clearance.

| | Old (margin) | New (clearance) |
|---|---|---|
| Zoom on a normal step | recomputed → pulls out | **untouched** |
| What holds the party in shot | re-fitting the box | panning |
| Clearance | fixed 25 ft/token, per scene | whatever *you* framed, floored at 5 ft, capped at 60 ft |
| Party genuinely splits | pulls out to fit + 25 ft each | pulls back the **minimum** that fits at 5 ft, then returns to your zoom on regroup |

Constants (`main.js`): `TV_FOLLOW_MIN_CLEARANCE_FT = 5` (floor — nobody gets nearer the edge),
`TV_FOLLOW_MAX_CLEARANCE_FT = 60` (ceiling — from a wide frame, don't chase a token 300 ft out).
State: `tvFrameScale` + `tvClearanceFt`, captured by `captureTvFrame()` **after** each reframe lands
(zoom buttons, Focus, Fit Scene, releasing manual control) and reset on `canvasReady`. An automatic
pull-back deliberately does **not** write `tvFrameScale` — that is what makes the zoom spring back.

Removed as dead or superseded: `tvPartyScale`, `setTvLockedScale`/`tvLockedScale`,
`TV_PARTY_BUFFER_FT`, `TV_MIN_RADIUS_FT`, `TV_TOKEN_MARGIN_FT`, `TV_ZOOM_IN_SLACK` (the last was
declared and never read). `partyFrame()` is now centroid-only, which is all Focus ever used.

### 23.3 Two tiers, so both pet rulings survive

DM 2026-07-22 (*frame the owl*) and DM 2026-07-23 (*a mage hand shouldn't drag the camera*) look
contradictory and aren't — they're different tiers:

- **Drivers** — PCs + the packed group token. They trigger the follow, and the frame is *guaranteed*
  to hold them (this is the tier the pull-back protects).
- **Tagalongs** — every other player-owned token. Grown into the frame nearest-first, but **only
  while they fit at the already-chosen scale**. A pet beside the party is in shot for free; a mage
  hand three rooms away is silently left behind and costs no zoom.

Focus (the P key / bullseye) still frames **everyone** followed, pets included — it's a deliberate press.

### 23.4 The follow filter

`Settings → Who the display follows`: one chip per followable token, lit = followed, struck-through =
ignored, plus a `Follow Everyone` reset that only appears when something is excluded. Deliberately
the same shape as `Who the display hears through`, so the two "who" filters read as one idea.

The flag is **`noFollow` on the TokenDocument**, never the actor — two summons off one base actor
share an actor id, so an actor flag would toggle both and reliably neither (§22.1).

**Reframe on a follow-set change, driven by the flag update (DM 2026-07-25).** Changing who's
followed from the panel (Follow Everyone / None / solo a camera) must reframe the display *now*, with
**the same repositioning a move does** (`planPartyFrame`, not a plain re-center). Two fixes: (1) the
`Follow Everyone`/`None` bulk handler now calls `focusParty()` like the per-row handlers — it changed
flags but never moved the camera. (2) The display reframes off the **`updateToken` noFollow-flag
event**, not the `frameParty` socket broadcast: that broadcast races *ahead* of the token-flag sync,
so the display framed a still-excluded set and the real reframe waited for the first token move ("the
focus only works on the first move"). `tvPartyFollow`'s body is now `reframeParty(movedDoc?)` — shared
by the move hook and a debounced follow-change reaction (no `movedDoc` → frames the settled set).

### 23.5 The maths is now testable off-table

The camera is the one subsystem that **cannot** be proved from a single browser — it needs the
display client plus a moving token — which is how three generations of it shipped on reasoning
alone and were wrong in the same way each time. So the geometry now lives in
[camera-frame.js](scripts/camera-frame.js), free of Foundry globals, with
[tools/test-camera.js](tools/test-camera.js) running it against the **real numbers of the live test
scene** (Cave A: Kobold Lair, read 2026-07-24: 7930×5850, grid **260px at 5 ft/square, so 1 ft =
52px**). Run it alongside the syntax gate:

```
ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules \
  "/c/Program Files/Foundry Virtual Tabletop 14/Foundry Virtual Tabletop.exe" tools/test-camera.js
```

20 checks, all passing. Two of them are the regression test for the reported bug: on this scene the
retired 25 ft-per-side margin resolved to **1300px per side**, collapsing a 40 ft-strung party to
scale 0.231 against a whole-map fit of 0.185 — i.e. *effectively the whole map, exactly as
reported*. The new model holds 0.415 for the same party.

**The screen budget is worth knowing** (it surfaced as a false test failure): at scale 0.6 on a
1080p TV the display shows 1800px = **34.6 ft** vertically, so only ~24.6 ft of party fits inside
the 5 ft floor. The tighter the DM zooms, the sooner the last-resort pull-back engages. That is
inherent to the zoom, not a bug — but it means "zoom right in on the group" is a genuinely tight
frame on a 260px grid.

Still unprovable here, and NOT to be reported as working: the actual pan/zoom as seen on the TV.

### 23.6 LIVE FINDING — packing the party left the soundscape stale (2026-07-24, fixed)

Found while testing "sound in and out of group". **Foundry never refreshes positional audio when a
token is created or deleted.** Verified in the installed 14.365 source, not from memory:
`refreshSounds` is raised by `Token#_onControl`, `#_onRelease`, `#_onUpdate` (position / elevation /
size), the hidden-changed path, and `AmbientSound#initializeSoundSource` — and nowhere else.
`SoundsLayer#_draw` does not refresh either (a scene change is covered only because each ambient
sound initialising raises the flag).

Packing and dispersing do exactly that: `rpc.js` swaps N member tokens for one group token and back.
So a party that packed beside a waterfall kept a mix computed from tokens **that no longer existed**,
until its first step happened to trigger the movement refresh. Same family as the 2026-07-23 "ignore
did nothing you could hear" bug — the listener list was right, the mix was never recomputed.

**The fix is ordering-sensitive, and the naive version is worse than the bug.** Pack creates the
group token, deletes the members, and only *then* writes the `packed` flag — so a refresh landing
mid-sequence finds no listeners at all (group not packed yet, members gone) and silences every
positional sound with nothing scheduled to undo it. The fix therefore watches **create, delete *and*
the `packed` flag through one shared 250ms debounce**: each step resets the timer, so exactly one
refresh runs after the last of them, with the state settled. It also costs one recompute per pack
instead of N+1, which matters — every refresh raycasts each ambient sound against every listener.

Unverified by ear; it needs the display client and the DM's speakers.

---

## 24. Fog-of-war edges — THREE styles (Tier 0 soft + Tier 1 GPU) — ✅ DONE, DM signed off 2026-07-26 ("looks great", "95% happy")

**Now a three-way `fogStyle` setting: `off` / `soft` / `gpu`** (supersedes the old `softFog` boolean,
which is kept only so a world that had it on migrates to `soft`). Picked in the panel's Fog control
(Settings → Fog), a segmented Off / Soft edges / GPU. Display-client only. See [fog-soft.js](scripts/fog-soft.js).

- **`soft` (Tier 0)** — crank Foundry's own visibility/vision blur (§24.1–24.2). Cheap, but needs High
  performance mode and its 5–9-tap kernel caps the softness.
- **`gpu` (Tier 1, DM 2026-07-25 "try gpu fog")** — **REPLACE Foundry's fog shader.** A
  `VisibilityFilter` subclass (`MCSoftFogVisibilityFilter`) swapped in via `CONFIG.Canvas.visibilityFilter`
  (Foundry's sanctioned hook: `#drawVisibility` builds `CONFIG.Canvas.visibilityFilter.create(...)` on
  every canvas draw, and `AbstractBaseFilter.create` → `this._createFragmentShader(options)`, so the
  subclass inherits all overlay/persistentVision plumbing). Its fragment is the stock 14.365 shader with
  the two single-tap reads replaced by 24-tap **golden-spiral density gathers** over BOTH channels,
  shaped by `smoothstep(0.18, 0.82)` + a 3-octave FBM **wisp** that warps the threshold so the border
  billows. Radius `uSoftRadiusPx` (default **56 screen px**, live-tunable on the filter uniforms). Runs
  on ANY performance mode. Swap needs a `canvas.draw()`; `setGpuShader` redraws only when the live
  filter's constructor mismatches (loop-guarded — the redraw's own canvasReady then matches).

### 24.0a Deep dive — why every edge-BLUR approach was a no-op (2026-07-25, installed-source verified)

DM live report: *"ZERO difference in the shape of the shadow polygons between off, soft and GPU."*
True, and the 14.365 source says it had to be:

1. **The shadow polygon is the `v` channel, and nothing ever blurs it.** In `VisibilityFilter`'s
   fragment, the live-vision cutout is `mix(fow, vec4(0.0), v)` where `v` is **one raw tap** of
   `visionTexture` = `canvas.masks.vision.renderTexture` — a `FORMAT.RED / SCALE_MODES.NEAREST /
   no-MSAA` texture. The filter's internal blurX/blurY passes blur **only `uSampler`** — the explored
   `r` channel (visibility.mjs filters, `apply()`).
2. **The vision mask's own blurFilter — the only lever that could soften `v` — is never created below
   High:** `CanvasVisionMask#createBlurFilter` starts `if (!canvas.blur.enabled) return;`. Below High
   there is literally no filter for the "soft" style to crank.
3. **v1's appended post-filter and v2's first tuning were also self-cancelling:** live A/B luminance
   profiles on the TV client showed the gather ramp being re-compressed by a too-narrow
   `smoothstep(0.30, 0.70)` band — only the middle 40% of the ramp stayed a gradient, ≈ what stock
   High-mode blur already gives. Fixed: radius 26→56, band 0.30/0.70→0.18/0.82.

**Verified ON the display client (TV login, 2026-07-25), not just compiled:** the live
`canvas.visibility.filter` is `MCSoftFogVisibilityFilter` built through Foundry's own create path,
zero console/shader errors, and a pixel-level A/B (render stage → RenderTexture → luminance profile
across a fog boundary, stock filter instance swapped in for the B frame) measured: **stock jumps 7→70
in one 6px step; gpu ramps over ~30–36px with wisp tendrils ahead of the edge** — a 3–5× wider,
irregular feather at the actual fog edge. Light-falloff gradients (torch radii) are untouched, as they
should be. **Verdict delivered:** the DM iterated live over 2026-07-26 (two-tone shadows → inward fade
→ full gradient → mask ×4, all below) and signed off — "looks great", "95% happy, which is a huge deal
for my nitpicking". GPU cost (≈50 texture reads/px, opt-in) drew no perf complaints on the real TV.
`fogStyle` runs `gpu` in the test world. Both `soft` and `gpu` also apply the shared density knobs
(unexplored-alpha 0.95, explored-colour — now a dial, below).

**The two-tone shadows (DM 2026-07-26 screenshot).** The two circled "explored but not currently
seen" regions are DIFFERENT SYSTEMS, which is why they clashed: the lighter one is **currently seen
but unlit** (inside a token's darkvision — drawn by the lighting/vision-mode pipeline, masked by
`canvas.masks.vision`), the near-black one is **remembered only** (the fog shader's explored tint,
which the earlier "darken explored" request had pushed to 0x1a1a1a). Two fixes, verified on the TV
client 2026-07-26:

- **`fogExploredLevel` world setting (0–60 grey %, default 22)** — an "Explored brightness" slider in
  the panel's Fog drawer (volume-slider pattern: live % echo, commit on release, display re-applies
  via onChange). The right value can only be matched by eye against the party's darkvision grey, so
  it's the DM's dial, not a constant. Verified: slider commits; display's `canvas.colors.fogExplored`
  follows exactly (#383838 at 22%).
- ~~`gpu` also cranks the Tier-0 blur~~ — **REVERTED same day** (see the inward-fade note below):
  that blur is symmetric, and at ×12 it washed darkness deep into lit areas. gpu leaves the vision
  mask on Foundry's mild stock blur now.

**Inward fade (DM 2026-07-26: "blur in, not out — shadows are spilling into the visible areas, look
how many details are lost").** Two causes, both fixed and pixel-verified on the TV client:

1. The ×12 vision-mask blur (above) — symmetric, so it darkened lit floor. Reverted.
2. The shader's smoothstep band was centred on the boundary (density at the geometric edge = 0.5, band
   0.18–0.82), putting HALF the gradient on the visible side. Final tuning (DM follow-up 2026-07-26
   "edges a BIT less sharp" + "a gradient from the full black to the actual edge"):
   **`smoothstep(0.04, 0.55)` at radius 100** — the top a whisker over 0.5 gives a soft wisp-modulated
   lip (~10%) that dies within a few px past the line, the rest of the visible area renders fully
   clear, and the penumbra spans **~200 px** from the edge down to full black with the FBM wisp riding
   the whole fade (billowing cloud, not a ramp). Widening is FREE — the tap count is fixed (25); a
   larger radius spreads the same samples and the wisp hides the sparser spacing. The low end is
   generous by the DM's explicit call: near-edge room detail may ghost through in near-darkness, and a
   mild past-the-polygon reveal is fine because drawn map walls (~20 px+) absorb it ("if they make out
   a few details at the very edge… it's not THAT bad in 90% of cases").

Verified (profile A/B, TV client): visible-side pixels **identical to stock** (zero spill, lighting
wash gone); dark side fades `19,16,11,19,3,14,3,3,7,11,8,12,5,2,1,0` (~90 px wispy) where stock cuts
`19,16,11,18,0,0`; explored areas near boundaries also commit to full explored strength sooner (more
remembered map shows). No shader errors.

**Lighting-line soften, the right dose (DM 2026-07-26 "95% happy… lines a bit softer, like an
edge-blur").** The crisp straight line left in the screenshot is the LIGHTING mask edge
(light/darkvision polygons via `canvas.masks.vision`), unreachable from the fog shader. gpu mode now
pins **only the mask's blurFilter at ×4** (`GPU_MASK_BLUR_MULT`; the earlier ×12 pinned both filters
and washed lit detail — this is ~1/3 the wash, fog input untouched). Verified on the TV: pinned 41.6,
visible-side profile rounds gently (~3–9% in the last ~30 px before the edge), penumbra intact. Below
High the mask has no blur filter — no lever (Foundry).

### 24.0 (historical) Tier 0 soft edges (DM 2026-07-24, BUILT, unverified on the TV)

[fog-soft.js](scripts/fog-soft.js). **This section pivoted mid-day.** The first take (the now-deleted
`fog-mist.js`) filled the black with a mist TEXTURE via Foundry's fog-overlay slot. The DM rejected it
on sight: *"the texture itself is really not the point, and it looks rather bad — everything should be
either black or nearly indistinguishable from black. I'm interested in the soft edges of the shadows."*
The whole texture approach is gone. What real-fow's look is actually about is the **feathered edge**
where vision/shadow meets the dark — and (checked against its README) even real-fow's own headline is a
dual-**colour** fog, which v14 already does natively; the DM wants neither colour nor texture, just the
soft edge, with the fog itself black.

### 24.1 What the soft edge actually is

Foundry already blurs the fog edge: `CanvasVisibility` runs its vision/fog mask through a gaussian blur
(`rendering/filters/visibility.mjs`), so seen↔unseen is a soft boundary, not a hard polygon. Its
strength is `canvas.blur.strength` (default `gridSize/25` ≈ 10px on a 260px grid). The feature
**cranks that blur ×`SOFT_FOG_MULT` (=8)** on the display so the edge reads as soft atmospheric
shadow. The fog stays **black** — `unexploredColor` is untouched at `[0,0,0]`. No texture, no new
shader; the only added cost is the wider blur kernel the filter already runs.

**Getting to ×8** (DM 2026-07-24): the first build hard-coded ×4, which the DM couldn't see — the
feather is ≈ `strength × zoom` in SCREEN pixels (verified in the blur shader: sample offset =
`khl × strength/passes`), so ×4 on a party-view zoom (~0.4) is only ~16px on a 1080p TV. A temporary
1–30 slider found **×8 reads right**; the slider was then removed ("you can get rid of the slider").
Quality ceiling to remember: the kernel is 5–9 taps, so a *much* larger multiplier would band rather
than smoothly blur — if ×8 ever needs to go higher, add blur *passes*, don't just raise the number.

**TWO borders, TWO blurs** — the DM's key correction (*"the dark-to-seen border is still very
sharp"*): the visibility filter's blur only softens the **explored/remembered** fog (the shader's `r`
channel). The **current-vision** edge — black↔lit — comes from a *separate* mask,
`canvas.masks.vision.blurFilter` (an AlphaBlur on the vision mask, also driven by `canvas.blur`), and
was left sharp. The feature now pins `_configuredStrength` on **both** filters. Cost of softening the
vision mask: the live sight edge feathers slightly **past walls** — an aesthetic trade the shared TV
makes (it never touches a player's own client).

### 24.2 The lever, and the HARD requirement (verified in installed 14.365 source)

- `canvas.visibility.filter` is registered in `canvas.blurFilters` via `addBlurFilter` **without** a
  `_configuredStrength`, so `canvas.updateBlur()` (run on every pan/zoom) sets its blur to
  `canvas.blur.strength × stage.scale`. Pinning `filter._configuredStrength = strength × MULT`
  overrides **only this filter** (lighting filters keep their own pinned strength) and survives zoom,
  because updateBlur reads it back each frame. Clearing it (`delete`) restores the stock fog blur.
- **Blur only EXISTS on HIGH performance mode.** `canvas.blur.enabled = performance.mode > MED`, and
  the visibility filter only builds its blur passes when blur is enabled *at construction*. On Medium
  or lower there is nothing to crank — setting a strength is a silent no-op. **The display must be on
  High** (Configure Settings → Performance Mode). We DETECT this and report it rather than force it:
  flipping perf mode is a heavy global change to make silently on a modest TV.
- **Ceiling:** the blur's kernel/pass count is fixed at construction from `canvas.blur`, so past some
  point a bigger `MULT` stops softening and we would need more passes (more GPU). `MULT=4` is a
  starting point; tune before reaching for that.

### 24.3 Scope, control, the invisible-failure guard

- **Display client only** (only the non-GM TV renders fog; a GM sees through everything).
- **World setting `softFog`, default off** (Settings → Display in the panel, and Foundry's module
  settings; `onChange → refreshSoftFog`). Reversible: off restores the default blur.
- **Perf-mode status back to the panel.** The display reports `{on, supported}` over the same one-way
  display→panel socket the audio status uses (`softFogState` → `setTvSoftFogState`), and Settings →
  Display shows **live / not-on-High / no-display**. This is the direct lesson of the mist near-miss
  and the deaf-pets bug: a display feature that can silently do nothing MUST tell the DM so, or it
  reads as broken.
- **Only visible where there IS fog.** A `tokenVision:false` scene (the current test scene, Cave A)
  has no fog edge to soften. Needs a vision-enabled scene.

### 24.4 State

Blur applied but ×4 was too weak to see (DM 2026-07-24) — replaced with the `softFogStrength` slider
(§24.1) so the DM dials the feather in live rather than me guessing blind. Still to confirm on the TV:
what value reads right, and whether high values band before they're soft enough (if so, the fix is
more blur passes = more GPU, not more strength). Tier 1 (a drifting-noise shader, permanent per-frame
GPU cost) stays unbuilt until the DM has judged this.

---

## 25. DM panel restructure + combat music (DM-idea, spec 2026-07-24)

Two linked pieces: a **layout restructure** of the DM panel, and a **per-PC combat-music** feature
that lives inside it. The *look* rules are in **UI-BIBLE §6.5** (fixed floor, workspace grows up, tab
strip as the seam, the two auto-opens, the no-jump token strip) and **§3** (both "who" lists become
rosters). This section is the mechanics and the build order.

### 25.1 The restructure, in one line

Today: a 232px primary window + a 240px right-side flyout + a tab rail ≈ 504px wide, growing *right*.
Target: **one vertical assembly** — a fixed **floor** (bottom, never reflows) + a **workspace** (the
tab content, grows *up*) with the **tab strip** between them. This deletes `flyUp`, the three-rect
`clampPos`, the shared `--mc-dmp-min-h`, and the duplicated chrome. It is a *reposition + additions*,
not a rewrite (DM: "we're not really changing that much").

**Floor (fixed):** presence bar · Focus · Manual · Display-tab shortcut · attention bell/reactions ·
selected-token strip (always present, neutral when nothing selected).
**Tabs:** Combat · Party · Rest · Travel · System health · **Display** (new) · Settings.
**Auto-opens (each once):** combatant-added → Combat; Manual→Focus → Display.

Tab moves from today: **Players → Party** (absorbs the roster grid + Form Up + the roster-checklist
member picker; this retires the pack-auto-open — party assembly now lives in one tab). Marching-order
folds into Party. **Camera** promoted out of the always-on bar into the **Display tab** (Fit, zoom,
the follow list, TV vision, soft fog) — Focus + Manual stay on the floor. **Sound stays a drawer in
Settings** (DM's call), now also holding the per-PC combat themes.

### 25.2 Combat music — model

Two halves:

- **Per-PC themes.** Settings → Sound drawer, a **roster** (§3) of PCs only (no pets). Each row has a
  **drop container**: drag a Foundry playlist sound onto it → its name shows; a trash icon clears it,
  another drop replaces it. Stored as `flags.mobile-command.combatTheme` = the sound's **uuid**
  (`Playlist.x.PlaylistSound.y`). Verified: dragging a playlist sound sets
  `{type:"PlaylistSound", uuid}` as JSON on the drag event (`toDragData`, client-document.mjs).
- **Battle track.** Two-part (DM 2026-07-25): the DM picks a **combat-music playlist** once — in mod
  settings *and* the onboarding wizard (`combatMusicPlaylist` world setting = a Playlist uuid, shown as
  a Playlist dropdown) — and then at **Start Combat** picks **one file** from that playlist to loop for
  the encounter (the pre-start staging lists that playlist's **sounds**; `combatBattleTrack` is now a
  **PlaylistSound** uuid, not a Playlist). The baseline for foe turns, allied-NPC turns, and
  theme-less PC turns; looped for the whole combat.

**Playback (executor/GM-driven, syncs to the TV):**

- **On Start Combat:** remember whatever is currently playing, **pause it** (takeover — DM's choice),
  then play combat music.
- **On each turn change:** the combatant's token → its actor. A **character** with a theme → play that
  theme (looped for the turn). Everyone else → the **battle track**: hostile NPCs, **friendly/allied
  NPCs, and theme-less PCs** all get the combat music (DM 2026-07-25). (Pets/summons: **deferred** — a
  pet's turn uses the battle track for now.)
- **Stop-and-play**, not pause/resume-from-position (MVP; DM accepted "stop if pause is difficult").
  Each track restarts from 0. True resume-from-`pausedTime` is a later nicety.
- **On combat end:** stop combat music, **resume** what was playing before (the remembered set); if
  nothing was playing before, end on silence (DM 2026-07-25).

**DM 2026-07-25 fixes (live testing):**

- **PC anthems LOOP** for the whole turn. A non-repeating theme in a sequential playlist ended
  mid-turn and Foundry auto-advanced to the next sound, which then bled over the battle track on the
  next NPC turn — the root cause of both "anthem switches tracks" **and** "battle music doesn't return
  on the foe turn." We force `repeat:true` on the theme before playing (prior value restored on end).
- **Crossfade, not hard-cut.** Switches previously popped/beeped and lagged ~2s (audio load). We set a
  `fade` (500ms) on combat tracks and **start the incoming track before fading out the old**, so they
  overlap — the pop is gone and the load latency hides behind the fade. `repeat`/`fade` we change are
  remembered per-uuid and restored when combat ends, so the DM's playlist config isn't rewritten.

Foundry hooks: `PlaylistSound#update({playing})` drives playback and syncs to all clients incl. the
TV; run on `game.users.activeGM` / the executor (playlist writes are GM-only). Turn hooks:
`combatStart`, `updateCombat` (turn/round), `deleteCombat` (end).

### 25.3 Build slices (panel usable at every step)

1. ✅ **Fog softness** (done — §24; not strictly part of the restructure, but the live blocker).
2. **Layout reposition** — floor fixed at bottom, workspace grows up, tab strip as the seam. Delete
   `flyUp` / three-rect clamp / shared min-height / duplicated chrome. Active tab shows its label;
   re-tap collapses.
3. **Display tab** — move Fit/zoom/TV-vision/soft-fog + the follow list into it; both "who" lists →
   rosters (§3); mute → 750ms fade (parity with deafen). Manual→Focus auto-opens it.
4. **Party tab** — absorb Players grid + Form Up + roster checklist; retire pack-auto-open.
5. **Combat tab** — pre-start staging (battle-music dropdown + Start Combat) + combatant-added
   auto-open + the takeover/restore on start/end.
6. **Per-PC themes** — the Sound-drawer roster with drag-drop containers + the turn-by-turn playback
   engine.

### 25.4 Open / deferred

- **Pets in combat music** — a pet/summon's turn playing its owner's theme needs a token→owner-PC map;
  deferred until the core loop is proven.
- **Pause/resume-from-position** — MVP stops-and-plays; revisit if the restart-from-0 grates.
- **The battle-music dropdown** in the Combat staging is the first concrete piece of the "bigger
  combat-music feature" the DM flagged; further staging ideas (multiple battle tracks, per-encounter
  overrides) are unspecced.

---

## 26. Effects tab (DM-idea 2026-07-26, SPIKE BUILT) — weather & magical ambience

**The ask:** a DM tab of one-tap ambience — weather shortcuts ("rain", "night"), lightning with a
flash and delayed thunder, heatwave, blizzard, dust storm — plus a "magical" drawer of screen looks
(rainbow, invert, blur). "Try building a few so I can see if it's worth exploring further."

### 26.1 Architecture — three kinds of effect, one catalog (`effects.js`)

| Kind | Examples | Mechanism | Why |
|---|---|---|---|
| **scene** | rain/snow/blizzard/fog/leaves particles; night | Foundry's own scene data (`scene.weather`, `environment.darknessLevel` with `animateDarkness: 5000`) | Foundry already syncs scene data to every client — no mirror, no drift. Weather IDs verified in the 14.363 source: `leaves, rain, rainStorm, fog, snow, blizzard`. |
| **client** | screen filters, sound loops | ONE world setting `fxActive` (`{fxId: true}`); every client diffs on `updateSetting` and mounts/unmounts locally | Same pattern as `tvVolume`: the TV re-applies deterministically after a reload; a late joiner catches up. No fire-and-forget state. |
| **oneShot** | lightning | `socket.executeForEveryone("fxOneShot")` | A moment, not a state. |

- **State sources in `fxIsOn`:** client effects read `fxActive`; pure-weather toggles read
  `scene.weather` (authoritative — the scene config can change it under us); Night reads the
  darkness level, so it agrees with a sunset the DM set by hand.
- **`scene.weather` is single-slot**, so turning on a weather-bearing effect clears every other
  weather-bearing id from `fxActive` — otherwise Blizzard-after-Rain plays both loops over snow.
- **Dust storm is a composite**: fog particles (the only dust-ish stock particle) + an ochre
  colour-grade filter + a low wind loop.

### 26.2 Sound is SYNTHESIZED — nothing to license

All audio is WebAudio filtered noise, generated at runtime: rain = band-limited hiss; wind = a
narrow noise band whose centre/level wander (the wandering is the gust); thunder (v3, 2026-07-26)
= a BROADBAND tearing double-crack (v2's 2.5 kHz band-passed crack was "very small and weak" —
the same energy mistake as the v1 rumble) + a BROWN-noise body with a wobbling amplitude + an
85→45 Hz sub dive, fired 0.15–0.5 s after a close flash (distance is the STORM's job — its soft
strikes wait 1.2–2.7 s). **The filtered-noise energy rule (learned when thunder v1 shipped as
"a small pop"):** white noise spreads its energy flat across ~24 kHz, so a narrow filter keeps
almost none of it — a 420 Hz lowpass keeps ~2%, and small speakers drop what's left below
~100 Hz. Low rumble must START from brown noise (energy already at the bottom); band-passed wind
gains must run ~3–5× the naive value; and anything meant for PHONE speakers needs a component
above ~200 Hz (the heartbeat carries a 165 Hz knock over its 55 Hz body for exactly this).
Thunder v2 measured offline (OfflineAudioContext RMS): peak RMS 0.344 vs v1's 0.050, 4.25 s
audible vs 1.5 s, peak sample 0.82 (no clipping — 0.85/0.4/0.5 layer levels clipped at 1.03,
hence 0.7/0.35/0.4). Zero
assets shipped, zero licensing, and output feeds `game.audio.environment.gainNode`, so the core
**Ambient volume** slider (and the TV volume mirroring built on it, §21) governs it. Audio-locked
(pre-gesture) clients queue one retry on `game.audio.pending`.

### 26.3 Screen filters (PIXI 7) on `canvas.environment`

`canvas.environment` = map + tokens + lighting but NOT the interface group — rulers/HUD stay crisp.
Filters: rainbow (animated `hue()`), invert (`negative`), drained (`desaturate`), dreamy (blur 2.5
q2 + slight saturate), dust (warm matrix, crushed blue), heat haze (DisplacementFilter over a
generated 256px blob-noise texture scrolling upward + warm tint). Perf guards for the modest
machine: `filterArea = renderer.screen` (never a full-scene FBO), one shared ticker only while an
animated filter is mounted, everything unmounts to zero cost when off.

### 26.4 Who sees/hears what

Filters + loops: canvas clients only (DM + display). Phones skip both — no canvas, and N phones
playing one loop at different latencies is an echo. **The lightning FLASH is the exception:** a DOM
overlay, so every phone at the table blinks white together — that's the feature.

### 26.5 Spike scope + open questions

- BUILT: the 10 weather + 4 magical effects above, as a DM-panel tab (Weather/Magical drawers).
- OPEN: should thunder also hit phones (surround-thunder vs echo)? More magical looks (underwater
  wobble, sepia flashback)? Per-effect volume? A "stop everything" button? Awaiting DM verdict on
  whether the direction is worth deepening.

---

## 27. Personal messages — DM ⇄ player private notes (DM-idea 2026-07-26, BUILT)

**The ask:** "DM selects a player and writes a message — 'you are charmed, and want to get the
party to leave this room' — player can respond to clarify. This can ride on foundry's chat
reskinned for phone."

### 27.1 It rides chat WHISPERS — no new storage, no RPC

ChatMessage documents sync to every client and filter client-side (`ChatMessage#visible` =
author or whisper target, verified 14.363), so both ends read the thread straight out of
`game.messages`; `createChatMessage` is the live push; persistence and permissions are free.
A note the DM types as `/w` in the native sidebar joins the same thread.

- **`pm.js`** is the one shared definition (filter + send + text/time) so the two ends can never
  disagree. "Personal" = carries our `pm` flag, OR any whisper with **no rolls and no
  midi-qol/dnd5e flags** — that lets hand-typed `/w` in while keeping the automated whisper
  machinery (midi save cards, roll results) out.
- A **thread** = personal messages between one player user and the DM seat (any GM), either way.
- Sends are text → `escapeHTML` → `<br>` newlines; renders strip to plain text (`pmText`), so a
  bubble can never smuggle markup into either UI.

### 27.2 Phone side (shell)

Envelope in the header tool row (same 30px circle as dice tray/bell). Unread → gold outline +
count badge; unread = DM-authored thread messages newer than the **`pmLastRead` USER flag** (a
flag, not a client setting, so "read" follows the player across devices). Tap → a full-screen
Messages overlay (same standing as the bio overlay; death saves outrank it): bubble thread —
DM left with dragon icon in the DM's colour (§3), mine right — plus an inline composer
(textarea + send, drafts survive re-renders via the `#onInput` stash pattern). The list is
**`column-reverse`** with newest-first source order: it opens pinned to the latest message with
zero scroll bookkeeping.

### 27.3 DM side (panel, Party tab)

An envelope beside the palette button in the player-picker row toggles the selected player's
thread inline (last 20, same bubble classes at panel scale) + composer. Switching the player
in the dropdown re-targets the open thread. Player replies land via the createChatMessage hook
(and in the DM's native sidebar, as ever).

### 27.4 Open

- No push notification when the phone is asleep/backgrounded — the badge lights on next look.
- Should a fresh DM note TOAST over the sheet (like damage), not just light the envelope? Waiting
  on table feel.
- Group notes (one message to several players) — trivially `whisper: [ids…]`, but the thread
  model is 1:1 today; unspecced.

### 26.6 Targeted effects + batch 2 (DM-picked 2026-07-26: ideas 3/5/8/10/12/16, BUILT)

**Targeting:** one-shots may carry `{ users: [ids] }` — every client receives the broadcast,
non-targets drop it silently. Player STATES store `{ users: [ids] }` in `fxActive`, so one world
entry drives every targeted phone and survives their reloads. Both flow through the same §26.1
machinery; `dmToggleFxFor` / `fxIsOnFor` are the per-player twins of the originals.

| Effect | Kind | Mechanism |
|---|---|---|
| **Storm** (rolling) | state, table | ONLY the executor schedules (independent per-client timers would desync the room): first strike 3–18s after toggle, then every ~40s–2.5min, 75% distant (`soft` = dim flash, later + 0.4× thunder). Everyone receives the same broadcast strike. |
| **Doom Bell** | one-shot, table | One press = one toll — the DM taps the rhythm. Synth = inharmonic partials (hum/prime/tierce/quint/nominal, hair of detune = "metal") over an 82Hz fundamental + a strike thud; canvas clients ring, EVERY screen dips dark together (`mc-fx-dim`). |
| **Heartbeat** | state, per-player | Red vignette squeezing at 1Hz + a lub-dub (two 55Hz sine bursts) + vibration on the beat (Android; iOS no-ops). Private to the target. |
| **Woozy** | state, per-player | The shell sways ±0.4° and blurs 0.6px on a 7s cycle. Deliberately small — readable but wrong; never fights tapping. |
| **Static** | one-shot, per-player | Shifting scan-band overlay (gradients, `steps(12)`, single 0.8s pass — no sustained strobe) + three ragged noise spikes + a vibration stutter. |
| ~~**Ghost Voice**~~ | *REMOVED same day* | `speechSynthesis` speaking DM-typed words. Shipped flagged-experimental 2026-07-26, cut 2026-07-26 — DM: "it IS very silly." Don't rebuild with speechSynthesis; if a spoken effect ever returns it needs real audio acting, which means assets, which means licensing — the opposite of this system. |

Panel: two new drawers — **Moments** (bell; future explosions live here) and **Player** (target
picker in the §3 roster shape + heartbeat/woozy toggles, static shot).

**Deferred by the DM, ideas kept (2026-07-26):**
- **"Deliver dramatically" on personal messages** (idea 7) — the §27 composer gains an option
  that darkens the target's phone and types the note letter-by-letter with a whisper sound.
  "Sounds like a whole feature" — spec when messages have table mileage.
- **Surround thunder** (idea 15) — phones as a distributed speaker array, thunder rolling
  seat-by-seat around the table; needs a one-time seating order. Parked, explicitly keep.

**"Stuck heartbeat" fix (DM 2026-07-28, BUILT):** a heartbeat left on Player 1 in an earlier
session read as unstoppable — the Player drawer shows/toggles ONLY the selected player, so
with another player selected every button read off and taps targeted the wrong user, while
the fxActive entry (persistent by design) kept beating. Fix: **● marks any player holding an
active per-player effect** in the picker, and a **"Stop all player effects"** button appears
whenever any exist — the guaranteed off switch (§8.1's spirit applied to fx state).

### 26.7 Deathbeat — the heartbeat IS the death saves (DM-idea 2026-07-28, BUILT + bench-verified)

"Use the heartbeat effect for death saves, slow down the heartbeat on each fail till it stops
at death." While YOUR character lies dying, your phone beats on its own — no DM tap, no
fxActive entry (automatic + local, so it can never be left stuck like a manual toggle):
- 0 failures → beat every **1050 ms** at full strength · 1 failure → **1500 ms**, 0.8× audio ·
  2 failures → **2100 ms**, 0.6× · **third failure or the dead status → stops MID-RHYTHM** —
  the silence is the effect. Stabilizing (3 successes) or any healing ends it too.
- The red vignette pulse slows with the beat (inline `animation-duration` follows the rate);
  each rate change lands a beat IMMEDIATELY so the slowdown is felt, not inferred.
- Runs on every client of the owning non-GM user (`game.user.character`); triggers on
  updateActor + ActiveEffect create/delete (dead status arrives as an effect) + ready
  (rejoining mid-death resumes the beat). A DM-toggled steady heartbeat YIELDS while the
  deathbeat runs and resumes after (`syncFx` guard) — never two rhythms in one chest.
- Bench (two clients, 2026-07-28): 0 HP → 1050 ms auto-start; failures 1/2 → 1500/2100 ms;
  failure 3 → element gone; heal + reset → stays silent.

---

## 28. Combat hardening — the 2026-07-26 bug wave (DM report, 7 bugs → BUILT)

Live report: anthem→silence · "forgot it's my turn"/dead End turn · MM "+" unselects + "attack
expired" · no green Hit ever, "—" totals · NPC attacks itself · Mind Sliver "rolled damage, did
no damage" · Burning Hands template wrong/dead/lingering. Bench: full solo combat rig (GM client
+ `MobileCommand.openShell()` on the same client = shell + canvas + executor in one place; a
ticker pump + DSN-off for the hidden pane). New PC built through the phone char-gen (works, incl.
all 10 advancement steps + species/background flows).

### 28.1 The umbrella cause: STACK DRIFT + a crashable attack pipeline

**midi-qol had silently updated 14.0.8 → 14.0.11** (found mid-bench; the preflight Module-stack
check now warns on ANY exact-pin mismatch). Around it, a poisonous chain: AC5E's
`dnd5e.preRollAttack` hook calls `t.shape.toClipperPoints()` on tokens with no drawn shape
(Levels-culled tokens qualify) — the throw PROPAGATES through `Hooks.call` and **kills the attack
roll**; midi also `await`s the **Dice So Nice animation before handing the roll to the workflow**
(midi-qol.js:9642), so totals lag seconds. Our old `findParkedWorkflow` accepted ANY suspended
workflow — including one stuck at `WaitForAttackRoll` with no attack — so the phone got a phantom
"Roll damage" card, "—" totals, `hit:false` forever, and downstream "expired" weirdness.

**Fixes:** the park gate now requires genuine `WaitForDamageRoll` (+ a real attackRoll for
attacks); a workflow stuck at `WaitForAttackRoll` is aborted and reported honestly ("the attack
roll didn't fire on the DM's screen — check the console"); the attack-total window is 8s (DSN
margin); hit is read after the total resolves. **Considered and rejected:** try/catch-wrapping
AC5E's hook in place — mutating another module's hook registry is the kind of invisible invasion
this project avoids; the loud failure + pin warning is the honest version.

### 28.2 Per-bug ledger

| Report | Root cause | Fix |
|---|---|---|
| NPC attacks itself | Executor-run phone flows strand the PHONE's targets in the DM's `game.user.targets` (midi's save/restore around its per-target loop); panel rows target with `releaseOthers:false`, so the invisible stray joins the NPC's attack | Snapshot + restore the DM's targets around `handleItemUseStart` (verified: zero strays after a phone fire) |
| MM "+" unselects | Steppers were 38px (below the 44px floor) — a near-miss hit the ROW = unselect | Steppers 44px; row-tap on a selected multi-dart target now ADDS an instance (it's what the tap means); deselect = "−" to zero |
| "attack expired — roll again" | Slow executor (DSN+saves) outlives the phone's 12s timeout → the first tap lands late, the second hits a consumed requestId | Damage timeout 20s; executor keeps a 5-min tombstone of resolved damage (re-tap returns the same result); honest copy for the true-expired case (cancelled/resolved/DM reload) |
| Mind Sliver "no damage" | Save-negates cantrip + target SAVED = correct zero, but nobody said so (and the save fan-out can also stall) | Damage result carries `saves`/`failedSaves`; the phone toast says "X saved — no damage" |
| Forgot it's my turn / dead End turn | Two-PC player, shell on the wrong one: "Up: <other PC>" + disabled button (auto-follow is blocked mid-action by design) | HUD: "Your turn — <name>" + active styling + **Go** (hops subject) + End turn ENABLED (executor's endTurn checks USER ownership, verified) + vibration when any owned creature's turn starts |
| Anthem → silence | Three compounding: `play()`'s same-uuid early-return pinned a DEAD track; the driver's state is per-client memory (a mid-combat reload silently killed the driver AND lost `_touched`/`_resumeAfter`); no watcher for unexpected stops | `play()` liveness check; `updatePlaylist` watcher (playback rides the PARENT's `sounds` delta — `updatePlaylistSound` never fires for play/stop, verified 14.363) re-plays the right track on any unexpected stop (verified live); re-arm on load if combat runs; `_touched` mirrored to a world setting so restore survives reloads |
| Burning Hands template | Player-placed AoE flow (Round 33) — RETIRED for AoE per DM ("remove all phone created templates") | Template spells route to `#announceCast` (§11 AoE push): panel shows "<PC> — <spell> · Place"; midi's preset does targeting/saves/damage/auto-remove. Placement flow stays for TELEPORTS only |

### 28.3 Solo-untestable (live-table checklist)

Shield/reaction prompt relay to a phone (needs the player client online; midi's attack/hit side
verified — 22 vs AC 12 hit and parked correctly), turn-start vibration on real phones, all
audible checks. Test world state notes: Test Fighter (the blank PC) is now a Human Soldier
Fighter 1 with longsword/chain mail + a torch light; Test Wizard learned Mind Sliver; the
combatant Orc Fire Conduit carries a Spear (it had NO melee activity at all, which is why it
RAW-correctly never got an opportunity attack — the AoO fired once a melee weapon existed).

### 28.4 The stack policy + the combat validation script (DM decision 2026-07-26)

**Policy: chase upstream, don't freeze.** DM: "we can't lock in on an older midi even before we
release beta, we'll need to chase versions and learn how to keep up with them." Beta users will
run current midi/dnd5e — an old pin just relocates the breakage to their tables. So the preflight
Module-stack check holds the **last-VALIDATED** versions (`TESTED` in preflight.js: dnd5e,
midi-qol, and AC5E — whose preRollAttack hook can kill attack rolls outright, §28.1), and a
mismatch means "run the validation, then bump the pin" — an update is always a decision, never a
surprise. midi-qol 14.0.11 was validated by the full §28 bench run (2026-07-26) and is the
current tested version.

**The combat validation script** — run on the Offline-test bench after ANY stack bump (solo rig:
GM client + `MobileCommand.openShell()`; ticker pump + `game.dice3d = null` if the pane is
hidden). Numbered, one at a time, stop on first failure:

1. Panel: Roll NPCs rolls ONLY NPC initiative.
2. Phone: the initiative prompt rolls the subject's initiative.
3. Phone melee attack (two-tap): real total on the card, green **Hit** when total ≥ AC, damage
   applies to the target's HP, toast shows the total.
4. Attack pipeline health: after step 3's fire, the parked workflow sits at
   `WaitForDamageRoll` with a non-null `attackRoll` (console: `MidiQOL.Workflow.workflows`).
5. Magic Missile: select a target, row-tap adds darts (n/3 counts up), fire + roll → base +
   extra-instance damage all applies.
6. Save spell (Mind Sliver): failed save → damage applies; made save → "saved — no damage" toast.
7. AoE (Burning Hands): NO phone template; a pending-cast row appears on the panel; DM Place
   drives targeting/saves/damage; instantaneous template auto-removes.
8. Targets: after any phone fire, `game.user.targets` on the DM client has no strays.
9. AoO: a PC leaving a melee-armed, unspent-reaction enemy's reach fires the DM reaction chip.
10. Music: battle track on start; anthem on themed-PC turns; battle back on foe turns; kill the
    playing track mid-combat → it self-heals; reload mid-combat → driver re-arms; end combat →
    silence/resume + repeat/fade restored.
11. Turn HUD: on your OTHER PC's turn — "Your turn — <name>", Go hops, End turn works.
12. Preflight: the stack check is green (or names exactly the version under test).

Two-client leg (live table only): reaction/save prompt relay to a real phone; turn-start
vibration on hardware.

### 28.5.1 Full-stack update sweep (checked 2026-07-29, pre-update for the DM's mod refresh)

Everything verified against live release pages. **The entire stack is already at latest except
AC5E** (and possibly a Foundry install still on 14.363):
- **AC5E 14.533.11 → 14.533.13** (Jul 27/28): opt-in flag system features only; commit compare
  shows NO churn in preRollAttack/geometry/AE application. One behavior change: an effect's
  `name=` label now REPLACES the AE name instead of appending. The old toClipperPoints crash
  (#736) was a v13-line issue closed in March; if we reproduce it on v14 (Levels-culled
  tokens), it's UNREPORTED upstream — file it. → UPDATE, then run §28.4 validation and bump
  TESTED to 14.533.13.
- **midi-qol 14.0.11 · DAE 14.0.12 · dnd5e 5.3.3 · CAT 0.0.6 · MISC 2.0.1 · socketlib 1.1.4 ·
  lib-wrapper 1.13.5.1 · MCD 14.01 · item-piles 3.3.4 · SC Reborn 2.6.1 — ALL current.**
  MCD's shipping master still has the five methods our camera suppression patches (verified in
  source); re-check those names on any 14.02+. Grepped our scripts for midi's removed
  `activity.targets` and renamed `isConcentrationSaveFail` — clean.
- **Foundry core: 14.365 is latest stable** (Jul 15). 14.365 fixes AE change PRIORITIES being
  prepared as 0 when unset — relevant to our effect stacks; update any machine still on 14.363.
  v15: no release, no prototype; not imminent.
- **dnd5e 6.0 signal (the migration milestone):** NO 5.4 milestone exists; the only open
  release milestone is 6.0.0 at 83% (270/323). The next system release is the major bump —
  when it lands, do NOT auto-update: midi/DAE historically lag major bumps by weeks, and our
  activities/enchantment/spell-list/advancement surfaces are exactly what 6.0 churns.
- **MISC #89 (our GWM boolean bug): still open, no fix shipped.** CPR 2.0 still prerelease
  with no automations (stable = 1.5.43, not a V14 line); GPS still v13-only. §28.5 verdicts
  unchanged.

### 28.5.2 Post-update validation run (2026-07-31, solo rig — PASSED, TESTED bumped)

The DM's mod refresh landed **AC5E 14.533.13.1** (the .13 reviewed above + a pt-BR-only
hotfix) and **DAE 14.0.12 → 14.0.13**; Foundry 14.365, dnd5e/midi/CAT/MISC unchanged. Full
§28.4 script run on the bench (Bandit Ambush scene — Cave A abandoned: Levels culling +
position-pinning automation make it useless for combat validation; its "Orc Fury (dead)"
is an item-piles corpse-pile, correctly unpickable). **All 12 results passed** → TESTED
now `automated-conditions-5e: 14.533.13.1`. Caveats & findings, none of them regressions:

- **Step 11 is only GM-verifiable in the solo rig**: "Your turn — <name>" + Go hop is
  gated `!game.user.isGM` (shell.js #turnHudHTML) — GM sees "Up: <name>" by design. The
  player-role rendering stays on the live-table leg. Step 6's made-save branch also not
  exercised (dice never rolled a save; failed-save branch verified).
- **After-DAMAGE stray target (pre-existing nit, worth a fix):** the §28 target hygiene
  (gmTargetIds snapshot in handleUseActivityStart) + the shell's post-fire clearPreview
  keep the DM's targets clean after the FIRE — step 8 as written passes. But when the
  damage tap resolves against a SURVIVING target, midi's own workflow-completion restore
  re-strands the phone's preview-committed target on the DM (kill → auto-released, clean).
  Fix candidate: mirror the snapshot/restore in handleItemUseDamage.
- **0-slot leveled AoE is a dead-end dialog (pre-existing):** the shell's AoE path
  announces with `slotLevel: null` always (shell.js #pickAction → #announceCast), so
  placeCast never passes configure:false and midi's usage dialog opens executor-side —
  with zero slots it's a dialog the DM can only cancel, and the phone gets no "no slots"
  feedback. Backlog: grey out leveled casts with no remaining slot on the phone (and/or
  pre-pick slot level for AoE like summons already do — that would ALSO skip the DM-side
  usage dialog on every leveled AoE, one less DM interaction per cast; DM's call).
- Solo-rig technique addendum (for the next bench): Foundry can run truly headless via
  `ELECTRON_RUN_AS_NODE` + a wrapper that `delete process.versions.electron` before
  importing main.js (isElectron sniffs that key; the desktop app's dataPath lock is
  dodged with a scratch dataPath whose Data/ is a junction). DM-side template placement
  drives via `canvas.templates.preview.children[0].document.updateSource({x,y,direction})`
  + `canvas.stage.emit("mouseup", {})`; the midi usage dialog's Cast Spell button is
  clickable from DOM. Aim cones at the token EDGE, not center — a center-origin cone
  catches the caster (the wizard fried himself twice proving it).

### 28.7 Hit/miss on the phone card (bench 2026-08-01)

**Verified: a HIT is green.** `mc-hit` → total in `#6FCF7D` on a `#2F5D39` border, label "Hit",
damage tap offered. Confirmed on weapon (Longsword) and spell (Fire Bolt) attacks, and a nat 20
correctly reads Hit even against AC 99 (auto-hit).

**FIXED — a miss said "Attack".** The red card rendered `mc-miss` but was labelled with the
generic word "Attack" (`21 ATTACK` in red) and still offered **Roll damage** — which, tapped,
rolled and toasted "0" while applying nothing (midi has no hit target to apply to). Now: label
**"Miss"**, and no damage tap (the ✕ closes it, UI-BIBLE §4.2). A null total still reads the
neutral "Attack" with no colour — a stale/unresolved read must not claim a miss it can't prove.

**INVESTIGATED, NOT SHIPPED — two deeper fixes that caused a regression.** Attempted in the
same pass and REVERTED after A/B on the bench:
- executor: return `ok:false` when an attack produced no workflow AND never rolled (see the
  MISC finding below), instead of the current `ok:true, needsDamage:false, hit:false`;
- shell: keep the result card up (instead of closing silently) when an attack resolves with no
  damage step, using a new `attackTotal` in that executor branch.
With those in, the **second** phone attack after a damage roll hung on "Rolling…" forever — the
fire never reached midi (no chat card, no workflow) and no timeout warning appeared. A/B was
conclusive: baseline survives fire→damage→fire (including a crit first), the patched build hung
4/4. Root cause NOT found; the render-only fix above ships alone. Whoever picks this up: the
suspects are the un-awaited `useActivityCancel` added in `#fireAction` and the new
phase-`attacked`-with-null-`requestId` state, and the repro is just two phone attacks in a row.

**FOUND — a phone attack can vanish with zero feedback (pre-existing, unfixed).** With MISC
installed, Test Fighter's **Great Weapon Master** automation aborts the use with an
executor-side error ("The Elwin Helpers setting must be enabled" — a MISC setting that is OFF
in this world). Result: no attack roll, no chat card, no workflow — and because the executor's
`!wf` branch reports `ok:true, needsDamage:false`, the phone **closes the action card in
silence with the action already spent**. This is the "I tapped attack and nothing happened"
class of bug. Two things to do: (1) a preflight check for MISC automations whose prerequisite
settings are off, and (2) the executor honesty fix above — once it can be done without the hang.

### 28.8 The pre-attack "phantom swing" — FIXED (bench 2026-08-02)

**The DM's complaint:** tapping a target on the phone played an attack animation on the canvas/TV
before the player had actually attacked. `attackPreview` fires a throwaway hidden attack roll to
read AC5E's adv/dis advice, and §28's suppression was *supposed* to cover the animation.

**It was broken two ways, and had never worked:**
1. It stubbed `AutomatedAnimations.PlayAnimation` — the name in AA's own deprecation warning, but
   the live API exposes **`playAnimation`** (lowercase). The stub silently never installed.
2. The public entry isn't even the animating path. Measured: per preview, **1 Sequencer play and
   0 public-API calls** — AA animates from its own hook handler.

**And the timing made a naive stub useless anyway:** AA's post-roll handler is ASYNC. Measured
`dnd5e.rollAttackV2` at 85ms, roll returns 96ms (our `finally` restores everything), animation at
**210ms** — the suppression window closed ~114ms before the animation started.

**Fix (rpc.js `handleAttackPreview`):** stub Sequencer's `play()` AND both AA API spellings, plus
empty the `dnd5e.rollAttackV2` / `dnd5e.rollAttack` listener arrays *in place* for the length of
the throwaway (ids/order preserved, refilled in `finally`) — which stops AA before it ever starts.
Nothing should react to a phantom roll; that is the point of it. Verified: **0 Sequencer plays**
across 3 consecutive previews, no chat card, listeners restored, and AC5E still annotates
correctly (mode `advantage`, reason "Target Cannot See Attacker").

### 28.9 The "Rolling…" hang — NOT reproduced on a clean bench (2026-08-02)

Chasing §28.7's hang. **It did not reproduce today, on either build** — not with the raced recipe
(tap damage, immediately start the next attack), not with the original recipe (6s wait), on the
patched build OR baseline. Several clean fire→damage→fire cycles in a row.

What that changes: §28.7's conclusion that "my changes cause the hang" is **not supported**. The
difference between yesterday and today is the ENVIRONMENT, not the diff — yesterday's runs were
against the DM's live world while it was also open in the desktop app, with MISC's Great Weapon
Master throwing on every Test Fighter attack and stale suspended workflows piling up. An exception
thrown inside a hook handler is a plausible mechanism for a swallowed RPC, and is the lead to pull
next. Reproduce it with the GWM error present before trying to fix anything.

**Shipped anyway, on its own merits:** `#rollDamage` cleared `#actionState` unconditionally after
its await. The damage step can take up to 20s, so a player who taps damage and then starts their
next action owned a NEW picker by the time it returned — and it wiped that one, whose fire reply
then hit `#actionState !== s` in `#fireAction` and was dropped, stranding the card on "Rolling…".
It now only clears the state if it is still its own (the toast/warning still fire either way).
That is a genuine latent race with the exact reported symptom; whether it is THE one the DM hit is
unproven.

**Bench lesson (important):** the headless bench must NOT junction the DM's real `Data`. Running
it while the desktop app had the world open collided on the LevelDB locks and triggered Foundry's
auto-repair on the world's (empty) `effects` database. No data was lost — `lost/` came back empty
and every other database was untouched — but the bench now uses a full COPY of the world under the
scratch dir, with only `modules`/`systems`/assets junctioned. That also stops test residue landing
in the DM's world. Setup is in `scratchpad/bench2`.

### 28.10 After-damage stray target — FIXED (bench 2026-08-02)

The attack half already snapshots/restores `game.user.targets` (§28 target hygiene); the DAMAGE
half did not, so a target that SURVIVED the hit stayed selected on the DM afterwards — a kill
auto-releases it, which is why it read as random. The DM then multi-selects from the panel and the
stale token joins the NPC's attack.

Two things made the naive fix fail, both now handled:
- **midi re-targets on an async tail** — measured landing ~550ms after the damage click, i.e.
  after `handleItemUseDamage` has already returned, so a single restore in `finally` was too
  early. Now swept again at 400/1200/2500ms.
- **A blanket restore is wrong**: it would wipe a selection the DM made while the damage rolled.
  The sweep is surgical — it drops only tokens THIS workflow targeted that the DM wasn't already
  holding, and keeps everything else.

Verified: fire → damage on a SURVIVING target leaves the DM's target set empty (was: the bandit
stranded). **Known limitation, pre-existing and not introduced here:** a token the DM targets
*during* the ~1s damage roll is cleared by midi's own restore, which our sweep cannot re-add (by
the time it runs the selection is already gone). Niche; logged rather than fixed.

### 28.11 Target picker: token faces + the name-leak guard (pre-beta, BUILT 2026-08-02)

Two backlog items, one change — the picker rows now carry the token's ARTWORK (UI-BIBLE §3: identity
rides the icon, never the text; the art is already on the shared screen so it reveals nothing the
table can't see) and no longer print a name the DM deliberately hid.

**The rule, and the version of it that was WRONG.** Full nameplate parity was implemented first —
anonymise anything whose display mode isn't ALWAYS/HOVER — and measured on the bench: it turned
*every untouched NPC* into "Unknown N", because **OWNER_HOVER is Foundry's default** for NPC tokens.
That fixes a leak almost no table has by making the picker worse for all of them. Shipped rule:
only **NONE** and **CONTROL** anonymise, the two modes that mean "nobody reads this nameplate".
Player-owned tokens are never anonymised. Labels are numbered ("Unknown 1/2") because three rows of
plain "Unknown" is an unusable picker, and render muted+italic so they read as placeholders.

Worth recording because the original §5 TODO overstated the leak: we already send the **token**
name, not the actor's, so a DM who renames the Doppelganger's token to "Villager" was always safe.
The real gap was only the deliberate no-nameplate case, which is what this closes.

Verified: default/ALWAYS/HOVER → "Bandit"; NONE/CONTROL → "Unknown 1 (anon)"; faces render 34×34
and all image URLs resolve 200. `loading="lazy"` was dropped — target lists are short and lazy
images can sit blank.

### 28.12 Remote access: the DuckDNS login hang is NOT the server (measured 2026-08-05)

DM: *"Duckdns link connects to foundry (slower) but doesn't let me log in to a user (it just gets
stuck) and I'm in the same network."* Four legs measured from the server host, LAN
(`192.168.1.143:30000`) vs remote (`twistoffate.duckdns.org:47530` → 176.231.186.13):

| leg | LAN | DuckDNS | reading |
|---|---|---|---|
| join page `GET /join` | 200, 2607 B | 200, **2607 B** | byte-identical |
| login `POST /join` (invalid user) | 401 in 74 ms | 401 in 196 ms | the login path itself works |
| websocket upgrade `/socket.io/…transport=websocket` | 101 in 22 ms | **101 in 7 ms** | no upgrade problem |
| 3.2 MB asset | 3.13 MB/s | **3.13 MB/s** | no bandwidth penalty |

So every hypothesis that blames Foundry or the forward is dead: the port forward carries HTTP,
the login POST, and the websocket upgrade equally well. `options.json` is clean for this
(`port: 30000`, `proxyPort: null`, `routePrefix: null`) and the served HTML contains **no absolute
URLs and no literal `:30000`** — the client builds everything from `window.location`, so the
30000↔47530 port mismatch is not the cause either.

What that leaves is the **client device's** path: these measurements all hairpin from the server
host itself, which routers often short-circuit, while the DM's phone/laptop needs real NAT
loopback through the Vantiva FGA232APTN. **Workaround (immediate): on the home network use
`http://192.168.1.143:30000`** — no hairpin at all. To make one URL work everywhere, the fix is
split-horizon DNS (resolve `twistoffate.duckdns.org` to the LAN IP inside the house), not a
Foundry setting.

**Still owed** (needs the DM's device, can't be done from the server): the browser console +
network tab at the moment it hangs. That distinguishes "stalled request" from "loaded but
socket never authed", which is the only fork left.

### 28.5 Ecosystem watch — the premades modules (checked 2026-07-26)

- **gambits-premades**: last release 2.1.43 (May 27); author (April, 2.1.42): "as-is release for
  V13 + 5e 5.3.x… I will not be doing any 5.3 bug fixes… focus will be on V14 + 5e 6.x." They are
  SKIPPING our exact stack (V14 + 5e 5.3) — GPS will likely never run on it.
- **chris-premades**: actively shipping 1.5.x (1.5.43 on July 25) but "not a V14 update… still a
  work in progress"; the 2.0.x pre-releases are the rewrite with NO automations ported yet (only
  generic features/summon animations, new "CAT" dependency).
- **midi-item-showcase-community (MISC)** — *the live one (added 2026-07-26, DM ask)*: 2.0.0
  (July 11) is "the first release for Foundry v14 and dnd5e v5.3" — OUR EXACT STACK, today.
  Community item automations (Posney's Discord); old deps (Times Up, Active Token Effects)
  "absorbed by DAE and Foundry". **Integration candidate**: MISC items should ride our two-tap
  executor flow as ordinary midi automations, but two known risk classes need a validation pass
  first — automations that open caster-side dialogs (they'd land on the EXECUTOR; the dialog
  watchdog catches, doesn't prevent) and reaction-style automations (must route through our
  relay). Validate a handful of MISC items through the phone flow (§28.4-style) before
  recommending it to tables. Preflight warns if a v13-era MISC 1.x is installed.
- **CAT (Coven's Automation Toolkit)** — *checked 2026-07-26*: CPR's author (chrisk123999)
  extracting CPR's internals into a shared automation API; both CPR 2.0 and MISC 2.0 build on it
  — the ecosystem's V14 era converges here. Manifest facts: **Foundry 14-only** (min/verified/max
  14 — born on V14), **dnd5e min 5.3** / verified 6.0.0 / max 6.9.9 (spans our stack AND the 6.x
  era — the bridge module), requires only midi-qol + DAE. At 0.0.6 (weekly releases since
  June 17) its API is still moving — treat any install like AC5E: pin-watch it. Integration
  note: CAT extends the SAME midi workflow objects our two-tap flow holds mid-flight, so its
  event-timing hooks and dialog utilities hit exactly the two §28.5 MISC risk classes — one
  MISC+CAT validation pass covers the whole new ecosystem, since they travel together.
- **Consequences (revised 2026-07-26, DM: "we'll be pushing versions too — don't count Gambit
  out"):** our home-built AoO/reaction machinery stays load-bearing TODAY, and MISC is the first
  possible complement on the current stack. GPS isn't dead to us — chase-upstream (§28.4) means
  we'll reach V14 + dnd5e 6.x ourselves; GPS re-enters the picture at that milestone. Plan the
  5.3→6.x migration as its own milestone (full §28.4 run + real porting), don't discover it
  under pressure.

### 28.6 MISC + CAT deep dive (2026-07-26, both installed on the test bench) — VERDICT: adopt, eyes open

Bench: MISC 2.0.1 + CAT 0.0.6 on midi 14.0.11 / DAE 14.0.12, run through the REAL phone flow
(solo rig). Content on our 2024-rules line: ~55 docs — the martial staples (GWM, Sharpshooter,
Charger, GWF), classic magic items (Flame Tongue, Sun Blade, Oathbow, Wand of Paralysis,
poisons), monk/ranger/cleric features, 3 spells. Curated staples, not a full-SRD sweep; the
legacy-5e packs roughly double it but don't match our rules generation.

**What worked through the phone (all zero-dialog, zero-error):**
- Wand of Paralysis one-tap: DC 15 CON save auto-rolled, Paralyzed+Incapacitated applied,
  action economy recorded. The save→condition class is a clean win.
- The stack COMPOSES: AC5E read the MISC-applied paralysis and pre-selected Advantage on the
  phone's next attack (2d20adv rolled). Recommendation flow + MISC conditions work together.
- Passive feats (GWM) ride along inertly and correctly (no rider on a non-Heavy weapon).

**Frictions found:**
1. **OUR gap — enchant activities never surface on the phone.** 2024 magic items lean on
   enchant delivery (Flame Tongue's flames are `enchant` activities); the shell's action list
   filters the type out, so the item is untouchable from a phone. Backlog: enchant support in
   the shell (unlocks a third of the 2024 items pack).
2. **Reaction automations UNPROVEN.** Gloves of Missile Snaring never prompted on a clean
   ranged-weapon hit in the solo rig — cannot separate owner-offline routing / item trigger
   nuance / midi damage-reaction settings without a second client. THE live-table question.
3. **Upstream bug (report to MISC):** "Great Weapon Master - Passive" sets
   `flags.midi-qol.optional.GWM.displayBonusRolls` to boolean `false`; midi 14.0.11's
   midiCustomEffect calls `.trim()` on it → console error on EVERY data-prep of a GWM carrier.
   Noisy, not fatal. Local fix: string `"false"` on the effect change.
4. Paralyzed auto-crit within 5 ft didn't double damage — a midi optional setting to chase,
   not a MISC fault.

**Verdict:** worth adopting for the table — the save/condition/passive classes are real wins at
zero integration cost, and the ecosystem (CAT) is where V14 automation is consolidating. Gate
full trust on the live-table reaction test; expect 0.0.x churn (both are in preflight's TESTED
watch now — any version bump warns until re-validated).

**§28.6 addendum (same day):** friction #1 is CLOSED — enchant support is BUILT. The shell now
lists `enchant` activities; tapping one opens an item picker (eligibility straight from dnd5e's
`canEnchant`, reasons shown on disabled rows); the executor applies via dnd5e's own
`applyEnchantment` (rename patterns work — the longsword became "Flame Tongue Longsword"), and
tapping an already-enchanted item REMOVES the enchantment (the toggle). Verified end-to-end on
the bench: apply → rename+effect, remove → clean revert. Consumption is deliberately not
charged (the common enchant items are free toggles; revisit if a charged enchanter appears).
Friction #3 correction: NO local fix exists for the GWM boolean — Foundry 14's effect-change
schema preserves typed values (write "false", read back `false`), which is exactly why MISC
ships a boolean and why midi 14.0.11's string-only `.trim()` chokes. Upstream only: midi should
tolerate typed change values (or MISC avoid them). The console noise is known and harmless.

---

## 29. Settings mini-app (spec v2, 2026-07-26 — wireframes rebuilt, awaiting DM layout approval)

The v1 wireframes lived only in a chat session and were LOST (DM couldn't find them) — spec
recorded here now, wireframes regenerable from it (`settings-wireframes.html`, sent 2026-07-26).

**Shape:** one window, DM-panel styling, vertical tab rail (like the panel's). Purpose: a home
for the 43 registered settings — roughly half are `config:false` and reachable today only via
the wizard, panel drawers, or nothing at all.

**Tab → settings mapping (every key is a real registration in settings.js):**
- **Display** — displayOwnerUser · dmOmniscientVision · combatPovVision · hideGMCursor ·
  fogStyle (off/soft/gpu chips) + fogExploredLevel slider · tokenGlow · ringPlayerColors ·
  ringHealthColors · markDeadNpcs · portraitStyle
- **Sound** — tvVolume (music/ambient/interface sliders) · tvMuted · combatMusicPlaylist ·
  per-PC anthem roster (actor flag combatTheme, drag-drop) · combatPovAudio
- **Combat** — aooEnabled · aooNpcMode (Ask/Auto/Off chips) · reactionTimeoutPct ·
  expectedSaveTimeout · autoLootNpcs · pauseGuard
- **Travel & world** — travelOverworldSceneIds (roster) · travelAutoLight · travelDaylight ·
  partyTeleportActivates · travelCustomPaces (Edit paces…) · awayThresholdSeconds · downtime
- **System** — role (per-device chips: Auto/Phone/Display/DM) · executorUser ·
  enforcerAutoPrompt · heartbeatSeconds · preflight "Run checks" · dmOnboarded "Re-run wizard"

**Open questions (blocking build):** does Sound REPLACE the DM panel's Settings tab volumes or
duplicate them? do the Effects toggles (fxActive) get Settings rows or stay panel-only? any
settings the DM wants NOT exposed (heartbeatSeconds)?

**§29 revision (DM 2026-07-26, "these settings don't need to be replicated in sound tab"):**
FOUR tabs, not five — the Sound tab is dropped. TV volumes + mute stay on the DM panel's
Settings tab ONLY (they're reflexive table controls, not configuration; one home each). The
three combat-music rows (combatMusicPlaylist · per-PC anthem roster · combatPovAudio) move into
**Combat → Music**. Wireframes v2.2 sent. v2.1 had also corrected nine mocked values to the
true registered defaults (fog Off, HP-rings off, auto-loot off, aooNpcMode "prompt",
reactionTimeoutPct 120, saveTimeout 60s, heartbeat 5s, tokenGlow 0.1ft, tvVolume 50/50/50) and
removed the bogus "downtime" toggle row (internal state, not a setting) — the wireframe now
distinguishes DEFAULTS from the world's current values (blue "yours:" notes). Two questions
still block the build: Effects toggles (fxActive) in Settings or panel-only; any settings to
keep unexposed (heartbeatSeconds?).

**§29 BUILD (2026-07-26):** the mini-app is built — `settings-app.js`, an ApplicationV2 with the
four-tab rail, every exposed setting as a live control (toggles/chips/sliders/selects reading
current values each render; registration onChange side effects fire on their own, e.g. fogStyle
→ refreshFog). Reachable from Foundry's module-settings page (registerMenu shim) AND an "All
Settings" button atop the DM panel's Settings tab. Read-only rows with pointers where the flow
lives elsewhere (anthem drag-drop, overworld marking, custom paces — panel-owned on purpose).
Unexposed per DM: heartbeatSeconds, clockStart, softFog + all state objects. registerMenu is
called from main.js init, NOT settings.js (the app imports preflight → settings.js: cycle).
**§29 BENCH VERIFICATION — PASSED (2026-08-01, headless bench per §28.5.2).** All 12 numbered
results observed, one at a time; every value restored afterwards:
1. Opens from Foundry's module-settings menu (`mobile-command.settingsApp` shim → MCSettingsApp).
2. Opens from the DM panel's Settings tab "All Settings" button — same single app.
3. Display tab: 11 rows, every control mirrors its live registered value.
4. Toggle (markDeadNpcs) writes true→false, UI reflects it, restores.
5. Chip (fogStyle Off→Soft) writes AND the registration's onChange fired `refreshFog` exactly
   once — the side-effect leg of the checklist.
6. Number (tokenGlow 0.1→0.4) writes.
7. Combat tab: 9 rows including the three §29-revision music rows (playlist · per-PC anthems
   read-only pointer · combatPovAudio).
8. Chip-label→value mapping is right where they differ: "Ask" ⇒ stored `prompt`.
9. Travel tab: 6 rows; overworld-scenes and custom-paces render as read-only pointers to the
   panel's Travel tab (panel-owned by design).
10. System tab: 5 rows; `heartbeatSeconds` correctly ABSENT (unexposed per DM) though registered.
11. "Run Checks" runs the real preflight (fresh lastRunAt, 9 results, stack ok).
12. A written value survives a full client reload and the reopened control reads it back.

Not covered (needs a real second client / player role): nothing — the app is GM-restricted.
"Re-Run Wizard" button present but not fired (it launches the 6-step DialogV2 flow; exercised
separately at build time).

---

## 30. Séance board (DM-idea 2026-07-26, for a Crooked Moon game — BUILT)

**The ask:** a spirit-board table on the TV; the DM types a phrase, the planchette spins to each
letter — "slow and a bit jerky" — holds 2s, spaces unmarked, rests when done. Marker a separate
entity. Letters must clearly surround the center like the Crooked Moon reference.

**The layering decision (why it works):** the AI table art carries NO letters — image models
butcher radial text, and baked letters have unknowable coordinates. The widget draws the A–Z
ring itself as SVG (per-glyph size/rotation jitter so it reads hand-scratched), so every
glyph's angle is exact — and the planchette's LENS, chroma-keyed to a true see-through window
(tools/process-planchette.ps1: green key + lens punch at r132, brass ring kept opaque, sheen at
45%), lands with the letter visible THROUGH the glass. Art: art/seance-table.jpg (Gemini, from
the letterless prompt) + art/planchette.png (processed; lens center 315,338 of 626×653 — the
landing point, baked into seance.js constants).

**Mechanics (seance.js):** board = fxActive.seance state (panel Séance drawer toggle; TV
re-mounts after reload via syncFx) shown on the display client + the DM's non-phone client,
z-60 (under the panel). Phrase = fxOneShot {id:"seancePhrase", text} — sanitized to A–Z+space,
≤120 chars. Motion is a polar state machine: smoothstepped travel (0.9–2.6s by distance) with
sinusoidal stutter on the eased progress (the jerk), 2s holds with idle tremble, DOUBLE LETTERS
swing away ~26° and return (two visits read as two taps — verified: three E-visits in "SEE ME"
landed on identical coordinates), spaces wander toward the middle for a beat, end drifts to a
center rest. Backdrop per DM: bland near-black radial ground; the round table is masked
(border-radius) and melts into blurred black shadow (box-shadow + vignette ::after) — no hard
image edge.

**Release note:** the module.zip build must now include `art/` (next release).
**Open:** creaking-wood sound on movement (procedural, §26.2-style) if the DM wants it; a
"clear the board" wipe animation; number ring (explicitly kept out — "no other layer").

**§30 v2 (DM notes 2026-07-27):** the heart is DEAD STILL at rest — no tremble, no rotation
wobble at start or end (tremble only while alive). A phrase from idle begins with a WAKE-UP:
one very slow first stir (2.6s, barely more than a shiver) then a circling dance (the "little
dance") before the first mark. The lens is TINTED GLASS now, not raw transparency — the keyed
remnants read as "broken green glass"; process-planchette.ps1 paints the glass body a uniform
faint sage (96,118,96 @ α52) under the kept reflections. FULL BOARD per the module: digits 1–0
on an inner bottom arc (r 0.42), printed words HELLO (top-center), YES/NO (flanking high),
GOODBYE (low-center) — a phrase word that IS a printed word lands on it as a single stop
instead of being spelled. Verified end-to-end ("HELLO 13 XE NO"): pre-still → wake → dance →
HELLO whole → 1 → 3 → X → E → NO whole → center rest, frozen (60s of identical transforms).
**Backlog (DM): spin the séance board off as a standalone module** — it has no mobile-command
dependency in principle (board + planchette + a GM input; the fxActive/socket plumbing would
need a tiny self-contained equivalent).

**§30 v3 (DM notes 2026-07-27):** the four words form an X of diagonals (YES upper-left, NO
upper-right, HELLO lower-left, GOOD/BYE lower-right at r 0.32), each rotated so its glyph-tops
face the board CENTER — people sit around the TV, so the person beyond each corner reads their
word upright. Sized to fit inside the lens on landing (YES/NO 2.6u, HELLO 2.0u, GOODBYE as two
centered 2.0u lines; lens ≈ 12.6u across). The planchette is now a wrapper div carrying a
discrete engraved "A.D." maker's mark (Cinzel, ~1.35vmin, dark cut + faint light catch) on the
plain wedge below the lens. Verified: rotations exact per corner, GOODBYE renders 2 tspans,
single-word phrase landed at (241,236) vs computed (239,234).

### 30.1 The bite — the module's danger mechanic + the scrape (DM 2026-07-27, BUILT)

**Rule (quoted from the module):** d10 per question; on a 1, everyone using the board takes
psychic damage on an escalating die — 1d4, then 1d6, 1d8, 1d10, capped at 1d12. (The DM's
message said "necrotic" once but the quoted rule says Psychic — implemented as PSYCHIC, a
one-word constant in dm-panel if the table rules otherwise.)

- **Sitters:** a §3 roster in the Séance drawer — player-owned CHARACTERS only, no pets. The
  d10 stays disabled until someone sits.
- **Flow:** Send (button or ENTER in the input) spells the phrase; the d10 button rolls the
  question die (whispered to GM, result shown in the drawer). On a 1 the button turns into the
  SKULL (semantic red — it hurts) armed at the current die; clicking rolls it, applies the
  total to every sitter (actor.applyDamage, psychic), whispers an audit line, escalates the
  step, and fires the STATIC glitch at the TV + the sitters' phones — level-scaled: 0.22 →
  0.45 → 0.65 → 0.85 → 1.0 with the die ("very weak the first time"). staticLocal now takes an
  intensity that scales overlay opacity (via --fxk — keyframes override inline opacity),
  duration, spike count, crackle gain and vibration. Toggling the board ON resets escalation.
- **The scrape:** synthesized (no assets, §26.2) — a narrow noise band whose gain follows the
  planchette's ACTUAL frame-to-frame speed, with 90ms granular gain kicks (the grain is what
  makes it scrape, not hiss). Faint by design (0.045 ceiling); silent at rest and during
  holds. Provisional per DM ("we'll see if I like it").
- **Bench-verified:** sitter roster (13 PCs, zero pets), Enter-send, natural 1 on roll 15 →
  armed 1d4 → both sitters −2 (equal, HP-checked), GM's own screen did NOT glitch (targeting),
  re-arm showed 1d6. Untestable solo: the glitch landing on a real phone (same verified §26.6
  targeted pathway) and the scrape by ear.

---

### 30.2 Live-feedback round (DM 2026-07-27, after first real séance — BUILT + bench-verified)

The séance is the BAR: "more like this — great visuals and the sound is really good too; this
is the goal for the others."

- **Three gaits (pacing).** The uniform crawl dragged on long words. Now: spelled phrases move
  FAST (travel ~420–1180 ms jittered ±15 %, hold 750–1000 ms) with an occasional SHARP DART
  (18 % of moves at ×0.45 — "a sharp move here and there keeps it interesting"); the wake-up
  dance, the four printed words (slow travel + 2.4 s hold — the spirits POINT), and short
  one-word replies (≤4 letters) keep the original spooky crawl. Bench: "SPIRITS NEVER SLEEP"
  ~35 s (was ~70 s); "YES" still runs the full ~10 s ritual.
- **The DM can always cheat (§30.1 amendment).** The skull (bite) button is ALWAYS live beside
  the question d10 — the DM fired ~30 civil d10s in a row and nobody got zapped. Unarmed label:
  "Bite anyway — 1dX psychic, no roll needed". The d10 stays as the ritual; escalation applies
  either way. GENERAL PRINCIPLE (UI-BIBLE §8.1): any effect gated behind a random roll also
  gets a direct manual trigger.
- **Sitters are scene-scoped.** The roster lists only PCs with a token in the ACTIVE scene
  (falls back to all PCs when none are placed). GENERAL RULE (UI-BIBLE §6.6): unless there's a
  real reason, only list PCs in the scene.
- **BUG found on the bench: séance chat cards were PUBLIC.** `Roll#toMessage` applies the
  client's default roll mode AFTER messageData and clobbers an explicit `whisper:` array —
  with public roll mode the d10 + bite cards went to everyone. Fixed: pass
  `{ rollMode: "gmroll" }` as the OPTIONS argument instead of a whisper array. (Trap for every
  future Roll→whisper: rollMode option, never a whisper array.)

## 31. Twists of Fate (PIVOTED 2026-07-27 — now the Crooked Moon book mechanic; DM decision)

**Pivot (DM 2026-07-27):** the original Avantris-style "reroll by accepting an affliction"
design is SPLIT. The fate-manipulation half becomes THIS section, rebuilt to match the Crooked
Moon book RAW. The affliction-table half becomes **§33 Chaotic Curses** — the 15 seed entries
were approved in the same message ("if yours are in the same theme… add them to the list"),
resolving the tone verdict; they fold into the curse table. The name collision is thereby
solved: "Twist of Fate" now means only the book token.

**The rule (book RAW, ch9):** a Twist of Fate is a token held indefinitely (lasts until
expended). Once per turn, when a creature the holder can SEE makes an ability check, attack
roll, or saving throw, the holder can expend one to **replace the d20 roll with a 1 or a 20**
(holder's choice). Not a reroll — the die is declared, and it targets anyone visible (own
save to 20, ally auto-crit, enemy save forced to 1). Balanced purely by scarcity: book sources
are the Fateweaving Discovery touchpoint (1 each, ch13–17) and The Moon tarot card (3, after
the ch12 boss). The DM may grant more at will.

**Architecture:**
- Twist count = a numeric module flag on the ACTOR (a counter, not stacked ActiveEffects — a
  twist has no mechanical rider while held). Shell shows a chip with the tarot/twisted-arrows
  mark + count; tap → detail card with the rule text and the [Twist fate] button.
- Spend flow, panel-adjudicated (v1, in AND out of combat since nothing rewinds): player taps
  Twist fate → picks **1 or 20** → optional target/context line ("the hag's save") → panel
  chip "X twists fate: 20 → <context>". DM [Apply] decrements the counter and posts a public
  fate-twist chat card (table theater — everyone should see fate snap); [Dismiss] refunds.
  The DM applies the declared die to the roll by hand v1 — no midi workflow surgery.
- DM panel (Crooked Moon tab, §35): per-PC counters with +/− grant/revoke.
- v2 (backlog): midi hook that literally sets the next roll's d20 for the chosen creature so
  automated saves/attacks resolve with the declared die.

**Slice B BUILT + bench-verified 2026-07-28.** Shell: dashed chip (crossed-arrows mark, ×N,
pulses while a spend waits) → inline spend panel under the condition strip (rule text, big
20-triumph / 1-ruin pick, "whose roll" inline input with a re-render-proof draft, Twist Fate
send, Withdraw while pending). Spend = `twistPending` flag on the actor (owner-writable);
count = `twists` flag. Panel: "Twists of fate" drawer — per-PC ± counters + pending request
chips with Apply (decrements, clears, posts the PUBLIC "Fate" chat card) / ✕ (refund).
`updateActor` hook lands phone spends on the open tab live. Bench: grant ×2 → chip → panel →
die 1 + note "the hag's save" → pending chip on panel → Apply → count 1, public Fate card,
phone back to idle. NB: shell's `#onClick` is NOT async — async twist work lives in
`#twistSend`/`#twistWithdraw` (an inline `await` broke the class parse).

## 33. Chaotic Curses (DM-approved 2026-07-27 — spec'd with §31 pivot, unbuilt)

Fleeting, RP-focused curses per the book's Appendix C: designed to last **15–30 REAL-WORLD
minutes**, alter perception/behavior/appearance, and stay light on combat math. Book examples:
button eyes on everyone you see, footsteps only you hear, 1d8 human teeth in every meal,
whisper-only voice, grayscale vision, your d20s are secretly d12s.

**Content & legal:** we NEVER ship the book's curse text. The module ships its OWN original
d100 table — seeded by the approved 15 entries (mechanical ladder 1–10: Hollowed −50% max HP ·
Unshelled −2 AC · Palsied Hand · Dimmed (darkvision gone) · Cotton Ears (hearing gone); RP 11+:
Counted, Paranoia, Wet Footprints, The Smell of Rain, Borrowed Voice, Candle Debt, Second
Shadow, Salt Hunger, The Polite Guest, Cold Seat), expanded to the full d100 in variety
batches (compulsions, perceptions, social curses, body-wrongness, debts-and-bargains) — all
our own writing. A **curse-table setting** (UUID) lets a DM who OWNS the-crooked-moon-2014
point the flow at the book's 1d156 table (`MFPMY4JfgYwbN31l`) instead; their content stays in
their module, none of it in ours.

**Mechanics:**
- A curse = self-reverting ActiveEffect with a module flag (mechanics only ever as effect
  deltas — temp-max HP, AC delta, midi disadvantage flags, sense removal; base actor data
  never written). Chip on the condition strip with the curse mark + dashed outline (per the
  old §31 decision; UI-BIBLE rule to be added at build time); player-readable short text; tap
  → detail card with remaining time.
- **Real-time expiry** (the book's defining trait): expiry timestamp in the effect flag;
  default 20 min, DM-adjustable per cast; the executor's heartbeat sweeps and auto-reverts
  expired curses (survives reloads — the timestamp is data, not a timer object). Early ends:
  DM ✕ per chip, clear-all, or (book suggestions, DM-manual) Heroic Inspiration spend / Remove
  Curse / short rest.
- DM flow (reused from the old §31 design, now on the Crooked Moon tab): [Roll on table] →
  shown entry → [Accept] / [Roll again] / [Pick instead…]. Only Accept applies. Book's
  suggested triggers listed as button-side hints: nat 1, combat end, long rest, cursed object,
  location.
- **Bargain mode (optional toggle, default OFF):** preserves the original Avantris concept as
  a curse TRIGGER — a player may request a reroll at the price of a curse roll; same panel
  flow, reroll permission = the Accept. (The DM's original idea survives as one of several
  triggers rather than the system itself.)
- Per-phone PERCEPTION deliveries (grayscale filter, footsteps audio, whisper lock) are what
  the phone medium adds over paper — v1 ships text+mechanical only; client-effect keys per
  entry are backlog (performance talk first, per the pets-audio lesson).

**Slice C BUILT + bench-verified 2026-07-28** (`cm-curses.js`). The FULL ORIGINAL d100 shipped:
1–10 the approved mechanical ladder (Hollowed −50% temp-max HP · Unshelled −2 AC ·
Palsied Hand · Dimmed darkvision-0 · Cotton Ears), 11–20 the ten approved RP seeds, 21–100
eighty new entries in the same voice, in the planned variety batches (compulsions 21–36 ·
perceptions 37–56 · social 57–72 · body-wrongness 73–88 · debts-and-bargains 89–100; none of
the book's curses reused). Panel drawer: victim row (scene-scoped) · 10/20/30-min real-time
picker · Roll Curse (or the `curseTable` UUID setting's RollTable — registered, console-set
v1) · Pick instead… dropdown (staged like a roll) · Accept/Roll again/✕ · live list with
minutes-left + per-curse ✕. Curse = self-reverting ActiveEffect (icon eye, italic curse text
in the description → the existing chip-tap detail shows it), REAL-TIME expiresAt flag; the
activeGM client sweeps every 30 s. Shell renders curses through the normal condition strip
with a dashed-muted italic chip (`mc-curse-chip`). Bench: pick-3 Unshelled → AC 16→14 live,
20-min clock listed; backdated expiry → sweep lifted it and AC returned; random roll (63 Old
Tongue) + cancel. Bargain mode (reroll-for-a-curse toggle) DEFERRED to the phone-roll slice.

## 34. Fateweaving (DM-requested write-up 2026-07-27 — spec'd, unbuilt)

The book's per-PC story-arc system (ch9): each player picks one of **13 Threads of Fate** (no
duplicates) — a personal destiny (Deliverance, Duality, Immortality, Malediction, Slaughter…)
with its own margin symbol and recurring prop (soul compass that pulses toward a goal,
doppelganger in mirrors, self-writing demonic tome, dream journal, a shadow offering games of
chance…). Each thread has **6 touchpoints** at fixed chapter windows with FIXED rewards:
1 Incitement (ch10/12) → Heroic Inspiration · 2 Connection (ch11) → friendly ally + Bless 24 h
· 3 Discovery (ch13–17) → **one Twist of Fate (§31)** · 4 Confrontation (ch18–22) → +2 to an
ability score (max 24) · 5 Climax (ch24) → a free feat · 6 Catharsis (epilogue) → narrative
resolution. Touchpoints are deliberately check-free and un-missable.

**Module v1 (a tracker, not automation):**
- Per-PC thread assignment (actor flag; set from the Crooked Moon tab).
- Tab shows a 6-step touchpoint row per PC; DM taps a step to mark it reached → the module
  applies what it can mechanically: Incitement grants Heroic Inspiration; Connection applies a
  24 h Bless-style effect (ally is DM-narrative); Discovery increments the §31 twist counter;
  Confrontation/Climax post a reminder chip (ability +2 and feat are sheet-level advancements
  the DM applies by hand — we don't write base actor data).
- Player phone: a "thread" card — thread name, the PC's goal line, symbol, and completed
  touchpoints only (future ones hidden; spoiler-safe).
- Content note: we ship only short ORIGINAL summaries of thread names/goals; the book's thread
  prose stays in the book. Thread PROPS as interactive phone widgets (compass/mirror/tome/
  journal) = backlog, one per thread, best built against the DM's actual party picks.

**Slice D BUILT + bench-verified 2026-07-28** (`fateweaving.js`: FATE_THREADS 13 original
one-liners, FATE_STEPS, applyFateReward). Panel: Fateweaving drawer — per-PC thread dropdown
(switching threads resets progress to 0) + six touchpoint dot buttons; advancing applies each
newly crossed step (1 Heroic Inspiration · 2 a 24 h Bless-style ActiveEffect, +1d4 saves/
attacks · 3 +1 twist §31 · 4/5/6 GM-whispered "Fateweaving" reminder cards — sheet-level
grants stay by-hand); tapping a reached dot retracts bookkeeping only (rewards never claw
back). Shell: gold scroll chip with the thread name → spoiler-safe detail card (goal + reached
step names; unreached steps render as unnamed "the thread runs on into the dark" marks).
Bench: assign → dots 1/3/4 → inspiration ✓, Bless 86400 s ✓, twist +1 ✓, whispered reminder ✓,
retract ✓, shell chip + card ✓. BENCH TRAP (cost 20 min): Foundry sessions are PER-BROWSER —
logging a second pane tab in as another user overwrites the cookie, and the next reload of the
first tab rejoins as THAT user; the "vanished" DM panel was just a Player 2 login.

## 35. The Crooked Moon tab (DM-requested 2026-07-27 — spec'd, unbuilt)

A campaign-tools tab on the **DM panel**, gated behind a module setting ("Campaign tools: The
Crooked Moon", default OFF) so non-Crooked-Moon tables never see it. V1 residents:
- **Séance board** launch (§30) — moves in from wherever it currently lives.
- **Twists of Fate** (§31): per-PC counters, grant/revoke, pending spend chips.
- **Chaotic Curses** (§33): roll/pick/accept flow + active-curse list with countdowns + ✕.
- **Fateweaving** (§34): thread assignment + touchpoint rows.
- Future residents (from §32's shortlist): Fated Tarot draw, Druskenvald clock.
Player side: NO new tab v1 — the shell already carries the chips (twist counter, curse chips,
thread card in the character area). UI-BIBLE needs a section for the campaign tab + the twist/
curse marks BEFORE building (bible-first, per CLAUDE.md).

**Player-side tab (DM 2026-07-27, OPTION — undecided):** the DM is considering a player-facing
Crooked Moon tab in the shell holding their CM "stuff" — destiny/thread, prop, twists, curse
details. Keep the design flexible so the chips-in-shell v1 can grow a dedicated tab later;
don't build until he decides.

**Slice A BUILT + bench-verified 2026-07-27:** `crookedMoonTools` world setting (defaults ON
when the-crooked-moon-2014 module is active, else OFF; toggle in panel Settings → Campaign
drawer); "crooked" tab on the rail between Effects and System health, gated live (open tab
closes if the gate flips); séance drawer moved from Effects (same drawer key, so open-state
carries); tab icon = ORIGINAL crooked-crescent SVG (socket eye + jagged grin) as a CSS
currentColor mask (`.mc-icon-cmoon`, styles/shell.css) — never the book's art.

**Build order (slices):** A) ✅ tab shell + setting gate + séance relocation → B) twists
(counter, chips, spend/apply flow) → C) curses (effects + real-time expiry + DM flow + the
original d100 in batches) → D) fateweaving tracker. Each slice ships/commits separately.
(§36 All aboard jumped the queue by DM request 2026-07-27 — built 2026-07-28.)

## 36. All aboard — the Ghostlight boarding ritual (DM-idea 2026-07-27 — BUILT 2026-07-28, bench-verified)

Campaign onboarding: players introduce their characters, each holds a LIFE-SIZE railway
ticket on their phone, and the DM takes each ticket as its holder boards the train.

- **The station (TV, `cmStation` fx state):** night sky + two drifting fog layers + flickering
  headlight beam + the BOOK'S train art (`Scene_4_The Ghostlight Express cropped.webp`),
  loaded AT RUNTIME from the player's installed the-crooked-moon-2014 module — never bundled
  (UI-BIBLE §6.7); `onerror` removes the img so fog+beam carry the scene without the book.
  Sits at z 55, under the séance board. Same eligible-clients gate as the séance.
- **Introductions (`cmIntro` { actorId } fx state):** one PC at a time — portrait card (actor
  img, Cinzel silver name, gold rule) blooms out of the fog on the left third. Introducing
  from the panel auto-raises the station; closing the station clears the card.
- **The ticket (`cmTicket` per-player fx, PHONE_FX injection):** fills the holder's WHOLE
  screen — aged paper, perforated edges, double ink border, the book's exact wording ("One
  Passenger" / "Valid for night of issue only") in gleaming raised-silver CSS lettering
  (animated sheen), holder name + a stable per-user serial №. NO railway-ticket art exists in
  the book module (only ch21's Festival of Fools carnival tickets — noted for later), so the
  ticket is drawn, not a bitmap; DM may generate art later and we swap. Type is sized in cqw
  against the paper container (bench: vmin sizes overflowed the paper at squat aspect ratios).
  z 99000 — above the shell, below the lightning/bell flashes so table moments still land.
  Survives reloads (fxActive state); slight hand-held sway animation.
- **Boarding = the DM takes the ticket:** per-PC ticket button (or Punch All) → a rough
  punch-hole slams through (clip-path star, synth "kachunk" clack), the paper jolts, then
  tears away down-screen. Vibration on give and punch.
- **The whistle (`cmWhistle` one-shot):** synthesized steam-whistle chord (D#4/F#4/A#4
  triangle stack, 4.6 Hz vibrato, breath-noise bed), two blasts per the book's departure cue.
  Canvas clients only — phones would echo.
- **Panel (All aboard drawer, Crooked Moon tab):** Station toggle · per-PC rows (scene-scoped
  via the shared `scenePcs()`, fallback to all PCs — boarding happens before tokens are
  placed) with introduce (name button) + ticket (44px icon button) · All Tickets / Punch All
  bulk · whistle. Tickets target the PC's USER (`pcUser()` — character-assignment first, then
  ownership), so the ticket follows the player to any device.

## 37. The Ghostlight ride — car doors + the rushing Shroud (DM ask 2026-08-04 — BUILT same day, bench-verified)

The DM loaded the ch10 train car scenes and asked for (a) a fog-of-war check, (b) a
tile-scroll/parallax "train in motion" effect, (c) car-to-car teleports per the book's
arrangement. Built as `cm-train.js` + a "The Ghostlight ride" drawer on the Crooked Moon tab
(wire button + ride toggle), plus `MobileCommand.train.{wire,ride,riding}` for macros (§8.1).

**Fog "not working" was a non-bug.** The car scenes ship correct (tokenVision on, `fog.mode`
1 = INDIVIDUAL, 82 walls on 10.1); the world had ZERO FogExploration docs — no player/TV
client had ever opened the scene, and the DM had only looked from the GM client, which never
renders player fog (dmOmniscientVision makes that even more total). On the TV client fog
draws exactly right (bench 2026-08-04). Check fog on the TV, never as GM. (`real-fow` is
also innocent: per-scene opt-in flag, not set anywhere.)

**The book's train (ch10 journals):** boarding at G1 Passenger (REAR; its rear door is an
arcane-locked exterior, boarding stairs on the car's right side), G8 Tender at the FRONT
with no front door (the locomotive is the Vagrant's). **Front of the train = map RIGHT on
every car map** (derived: right-side boarding door drawn at map bottom; Tender's only door
at map left). Both art sets (plain + Colored) are wired as independent chains 10.1⇄…⇄10.8.

**Doors = core Teleport Token regions, with a landing probe.** Each wired car end gets a
TRIGGER region (full-height vestibule column just inside the end door — walking into the
vestibule crosses; the closed door itself never needs opening) and a separate LANDING region
the paired teleport targets (`placement:"center", snap:false, choice:false`;
`destinations:[<land uuid>]`; schema on 14.365: destinations/placement/snap/choice/revealed/
dialog/transition). **The landing cell is collision-probed** (pure-data segment-vs-walls
test, so it works on non-viewed scenes): nearest grid cell to the door that no wall crosses
AND with a clear straight walk to a mid-car probe row. This matters: a snapped arrival can
straddle an interior wall (Sleeper Car's cabin partition at x1120) and **a token overlapping
a wall is completely stuck** (every move update rejected) — found the hard way on the bench.
Sleeper/Dining land in their corridor row, the rest in the mid aisle. Teleport arrivals do
NOT retrigger the region they land in (verified, no ping-pong). Existing plumbing picks the
rest up: preflight's destination check covers these; zoom transitions are selectable per
teleport.

**Live re-verified in the DM's world (2026-08-07, DM asked "can you change the doors to act as teleporters" — they already were).** All 17 ch10 scenes present. Cars 10.1–10.7 carry 2 door + 2 landing regions each, the Tender 1 + 1 (no front door, per the book), in BOTH art sets. Every teleport enabled with a resolving destination, paired in both directions: 10.1⇄10.2⇄10.3⇄10.4⇄10.5⇄10.6⇄10.7⇄10.8. **10.1 rear carries ZERO behaviours** — a bare marker for the arcane-locked exterior door, NOT the Cave A landmine (an enabled teleport with an unset destination, which silently rejects every move); worth re-checking with this exact probe whenever doors are rewired. One real gap: **10.8 Tender (Colored) has 0 mist tiles** where every other scene has 6, and it is the active scene.

**The phone asks before a crossing (DM 2026-08-07).** The vestibule trigger fires on ENTRY — by design you never open the door — which makes it very easy to cross by accident while shuffling a token. All phone movement funnels through one place, `handleMoveRequest`, so the gate lives there rather than fighting Foundry region hooks: before the update lands, the destination point is tested against enabled `trainDoor` regions (`region.testPoint`, verified true inside / false outside on a live car), and a hit returns `stage: "confirmTeleport"` with the far car's NAME instead of moving. The phone holds the step (dx/dy) and replaces the D-pad with a confirm — replaces, not overlays, because leaving the arrows live invites a stray second tap while deciding — then repeats the exact step with `confirmTeleport: true`. A bare marker region (10.1's locked rear door) has no teleport behaviour and so never prompts. The DM dragging a token on the desktop does not route through here and is unaffected.

**The ride = tile-scroll flags on mist tiles.** tile-scroll 5.0.0 (installed, enabled,
v14-verified) scrolls a tile's TEXTURE in a shader driven by `game.time.serverTime` — all
config is flags: `flags["tile-scroll"].{enableScroll,scrollSpeed,scrollDirection,repeatx,
repeaty,parallax}`; speed/10000 = uv per ms; direction 0° = content drifts map-LEFT (correct:
front is right, the Shroud streams rearward). Two window bands per car (above/below the wall
hull — car windows are all on the long sides), three layers each: slow dim far Shroud (speed
3, #4fa8a0), main thick drift (8, #8ff5d2), fast thin streaks (22, #b8ffe9), all
`mist_*_horizontal.webm` from animated-mist-and-fog-by-mattm ("shifting green smoke swims
past the glass" — the book's own window text). PIXI caches by src, so 6 tiles per scene cost
TWO video decodes; bench GM client held ~53 FPS. Idempotent create / flagged delete via the
panel toggle; only documents flagged `mobile-command.trainMist/trainDoor/trainLand` are ever
touched.

**The table follows the party (registerTrainFollow, main.js).** Debounced create+delete
token watcher (teleports are a create+delete whose order isn't contractual): when the active
scene has no unhidden PC tokens left and a non-active train scene (has trainLand regions)
holds PCs, that car activates — TV follows, transition plays. Splits hold the shot. Same
`partyTeleportActivates` gate as the packed-party rule, primary-GM only.

**Bench technique addendum (2026-08-04):** protected-module content (Crooked Moon incl.) fails
signature validation on a scratch dataPath until the real `Config/license.json` is copied in
("Invalid signature file for protected module ×90"); with it, packs open clean.

## 38. Session Zero suite (research 2026-08-04, DM ask "go deep" — IDEAS, nothing approved)

**The research question:** what does Daggerheart's session zero actually do, what should a 5e
session zero steal, and what can THIS module do that paper can't?

### 38.1 What Daggerheart ships (the anatomy)

Session zero is a first-class chapter (core book p.169, GM chapter) built from four artifacts:
1. **CATS opener** (Patrick O'Leary): five minutes on Concept, Aim, Tone, Safety before anything.
2. **Safety tools as rules, not etiquette**: X-card (John Stavropoulos), **Lines & Veils** (Ron
   Edwards; lines = never appears, veils = exists off-screen) kept as a LIVING document, and the
   TTRPG Safety Toolkit (Shaw/Bryant-Monk) linked as a maintained resource.
3. **The Campaign Frame** — a structured handout per campaign. Exact section list (from the
   published Witherwild frame): Complexity rating · The Pitch · Tone & Feel (an ADJECTIVE LIST:
   "Adventurous, Epic, Uncanny, Whimsical…") · Themes · **Touchstones** (media: Mononoke, Zelda,
   Dark Crystal) · Overview · Communities/Ancestries/Classes guidance · **Player Principles** +
   **GM Principles** · **Distinctions** (setting truths) · The Inciting Incident · Campaign
   Mechanics · **Session Zero Questions**.
4. **Question-driven collaborative worldbuilding**: the GM asks, answers become canon. Witherwild
   examples — world: "What dangerous animal comes out during the week of night…?"; character:
   "Your character has witnessed something beautiful that came from the Witherwild — what?"
   Players also PIN their backstory locations onto a shared map from picklists.
5. **Group character creation + Connections**: characters are built AT the table (~30 min);
   each class guide carries background questions and **connection prompts** ("What lie have you
   told me about yourself that I absolutely believe?"); every player owes ≥1 connection to EACH
   other PC before play starts.

### 38.2 Why that beats a typical 5e session zero

The 2024 DMG now has a session-zero chapter (campaign details, rules/house rules, character
creation, social contract, safety) — but it's an agenda to talk through, not a thing you PLAY.
The gaps: no artifact (frame), no prompts-as-rules, backstories as solo homework instead of
at-table questions, no connection obligation between PCs, worldbuilding stays GM-side, and
safety is a paragraph rather than a living tool. 5e fixes, no software needed: write a one-page
frame (pitch/adjectives/touchstones/principles/distinctions/inciting incident + 6–10 questions
— for Crooked Moon most of it is extractable from the book), run CATS, convert backstory into
at-table questions, require one connection per PC pair, keep lines/veils as a living doc.

### 38.3 The DM's direction (2026-08-04) — Personal Story Journals

The original A–F idea list is superseded. **A (safety tools) is REJECTED** — DM: *"avoid
'emotional safety' features."* The chosen shape instead:

> DM: *"a journal for each player with their personal story, partially filled in with the
> session 0 stuff… filled in either manually, or via a pushed question from the DM… from a
> pre-defined list, to all players, when the DM wants a few seconds to think… ongoing, fills in
> details between sessions. DM can access the personal journals, other players can't. Session
> zero fills in the basics, and it grows every session."*

Parked, not rejected (revisit after this ships): the connections web (C — a natural *question
category* here instead of its own system), map pins (E), frame presenter (D).

### 38.4a Creation flow v2 (DM refinement 2026-08-04): story beats INSIDE char-gen + TV board

Supersedes v1's separate "onboarding runner". DM: questions should be woven into character
creation itself ("player picks background → system asks how they ended up with it; sets stats →
how did you become so dexterous?"), the whole thing needs a TV visual, players may answer aloud
or privately, and the DM would PREFER one journal with a chapter per PC.

**TWO flows from the same start screen (DM 2026-08-04, mid-spec):**
- **Quick build** — the existing checklist workspace, UNTOUCHED: Foundry-default-5e feel, any
  order, no story beats. For replacement PCs mid-campaign, table guests, and players who just
  want a sheet.
- **Story wizard** — a NEW linear guided flow for session zero: fixed step order, the SAME
  pickers the checklist already uses (charGenPickerHTML / abilityPanel / spellPicker /
  equipPicker — reused, not rebuilt) wrapped in a wizard frame with progress pips, and a story
  beat after each mechanical step. Wizard order: Welcome → Species → Background → Class →
  Abilities → Spells (casters only) → Equipment → Name/portrait/bio → the two closers → Review
  & Finish. The DM's "Session zero" push opens phones straight into the wizard; self-serve
  start screen offers both doors ("Quick build" / "Build with your story").

**The lockstep loop (DM 2026-08-04, after seeing the slice-2 snapshot):** phone and TV must
"communicate more" — the sequence per step is PICK on the phone → the seat's card FLIPS on the
TV → the beat QUESTION is pushed → the player ANSWERS → advance to the next step. The wizard
carries a **stepper showing a 3-step window** — previous · current (highlighted) · next, e.g.
"Species — **Background** — Class" — and **pressing a step navigates to it**. On the TV, the
seat's **current card is highlighted** while its player is on that step ("writing…" state).
Wire protocol: the phone emits `szEvent` {kind: step|flip|writing, actorId, step, itemName,
img} over socketlib; the board (slice 3b) consumes them; flips also derive from actor updates
as a fallback.

A beat fires ONCE, right after its step completes, as a card before the wizard advances: the
choice echoed ("Background chosen: Soldier ✓"), ONE templated question, inline answer, [Skip] /
[Save to my story]. Hint copy: "Say it out loud, write it down, or both" — private-vs-table is
social, not a mode. Skipped beats park as unanswered prompts in My Story. Beat map (templates
in preset.js, DM-editable later):
- **Abilities** → keyed to the HIGHEST score: STR "Where did that strength come from?" · DEX
  "How did you get so quick?" · CON "What made you so hard to kill?" · INT "Where did you learn
  so much?" · WIS "What taught you to notice what others miss?" · CHA "Why do people listen to
  you?"
- **Species** → "Where among the «Elves» did you grow up — and why did you leave?"
- **Background** → "How did you end up a «Soldier»?" (the DM's example, verbatim shape)
- **Class** → "Who or what made you a «Ranger»?"
- **Equipment** (first grant only) → "One thing you carry you'd never sell — what is it, why?"
- **Finish** → a two-card closer before confirm: "What do you want most, long-term?" · "Who's
  waiting for you back home?" Then Finish proceeds as today.

**TV = the CARD TABLE (DM 2026-08-04, supersedes the plain board).** The display becomes a card
table; each player is dealt a face-down hand at THEIR seat, and every creation choice flips one
card face-up: the chosen item's artwork with its name under it in the display face (UI-BIBLE
§11.3 title font). "Choosing Elf flips the first card — elf item image, 'Elf' under it."
- **The hand: 6 cards — 5 for non-casters.** Species · Background · Class · Abilities · Spells
  (casters only) · Equipment. Species/background/class faces are the real `item.img` of the pick.
  Abilities has no item — face = its top scores rendered large (art TBD with the DM). Spells =
  the first chosen cantrip/spell's art. Equipment = the signature item (ties to the "never
  sell" beat's answer if given, else the granted pack's icon).
- **Seats are a first-class module concept: the TABLE MAP.** Six seat slots around the TV
  rectangle — 1 per short side, up to 2 per long side (1–6 players). The DM assigns seats
  **each session** from a panel drawer (tap a slot → pick a player; world setting `tableSeats`
  {seatId→userId}, persisted until changed). Each hand renders AT its seat, ROTATED to face
  that player — same trick as the séance word rotation (§30 v3), which should eventually READ
  this map instead of assuming corners. Explicitly built to be reused: DM "maybe we'll do more
  with it" — obvious future consumers: the Fated Tarot draw (§32) deals from the same table,
  séance orientation, per-seat prompts.
- **Deal + flip are the ceremony**: session-zero start deals the backs from table center (card
  backs themed; Crooked Moon ships a cards pack worth mining for frame art); each completed
  step flips that seat's card with a brief animation.
- **Card-back PICKER (DM 2026-08-04): an interface, not a hardcoded path.** A "Card back" row
  in the card-table drawer opens a thumbnail gallery + custom upload:
  - **Gallery** scans known sources: the CM card sets (`assets/card/*/`, files matching
    /back/i — items ×47, monsters ×80, NPCs ×80, familiars ×13), the module's own `art/`
    (`card-back*`), and previously uploaded customs. Tap a thumbnail → world setting
    `cardBackImage`. Render thumbnails small and lazily — some sets are 80 files.
  - **Custom upload** for bespoke looks: the DM is the GM client, so FilePicker.upload
    directly into a data-root `mc-cards/` folder (same Sqyre-safe pattern as mc-portraits).
    **Published spec in the UI: 5:7 portrait, 500×700 px or larger** (cards render 5:7);
    accept any image but warn when the aspect deviates noticeably from 5:7 rather than
    refuse — warnings, not walls. Foundry's upload whitelist covers webp/png/jpg.
  - v1 is ONE back for the whole table; per-seat/per-player backs noted as future polish. Status line per seat stays ("✍ writing:
  how did you become a soldier?") — **questions show on the TV; answers NEVER do.**
- Data path unchanged: picks render off the actors (they're real embedded items); flips + beat
  status via socket ping; the overlay is an fxActive-style mount on the display client (séance
  pattern), panel toggle in the Story drawer.

**BUILT + bench-verified 11/11 (2026-08-04, `card-table.js`).** Body-level overlay on the display
client / DM's non-phone client (séance mount pattern), driven by the `cardTableOn` world setting
so it survives a reload; seats read from `tableSeats`; each seat's hand is rotated by its
`TABLE_SEATS.rot`. Cards are CSS 3-D flippers (5:7, `.mc-ct-inner` rotateY, reduced-motion
respected). **Two truths, deliberately:** `szEvent` narrates live (flip/writing/step) AND every
card is re-derivable from the actor's own items — so a reload, or the DM building a PC at the
desktop, still shows the right table. Non-casters correctly get 5 cards, casters 6 (verified:
Brig 5, Abzarax 6). "writing" highlights the seat + its card and prints the QUESTION (never the
answer); "flip" clears the highlight and turns the card to the item's art + name.
Panel: a **Card table** drawer (Party tab) — on/off, seated count, and the card-back gallery
(221 thumbnails found by scanning the CM sets + `art/` + `mc-cards/`), plus custom upload to
`mc-cards/` with a 5:7 warning (never a refusal). Table art reads `art/card-table.webp` when
present, CSS ground otherwise.

**Trap found + fixed here (applies module-wide):** a world setting that has NEVER been written has
no Setting document, so its FIRST write fires **`createSetting`, not `updateSetting`** — listening
only for updates meant the first card-back pick silently didn't repaint. Both `card-table.js` and
`effects.js` now listen for both. Worth checking anywhere else we watch settings.

**Journal construction v2 — ONE journal, chapter per PC** (DM preference): a single
JournalEntry "Player Stories" (flag `storyJournal`), ownership `default: NONE` — the DM reads
it natively as one book. One PAGE per PC = the chapter; entries carry {question, text, realDate,
worldDate, step-tag}; creation-beat answers render as an "Origins" block (step order) above the
ongoing "The story so far" feed. Privacy: players never read the doc natively — the PHONE is
their only window, and the executor-brokered story* RPCs enforce "own actor only" on both read
and write. (Foundry syncs world docs to all clients regardless of ownership, so console-level
privacy doesn't exist in ANY construction — acceptable at this table, noted.) The v1
journal-per-PC layout stays as the documented fallback if per-page rendering fights us.

### 38.4b The table starts with PLAYERS, not PCs (DM 2026-08-04, supersedes seat details above)

> DM: *"go back even further — the DM needs to create player accounts; this is the PLAYER list
> (not PC list) that the DM uses for sitting position, then we have the session zero flow. But
> at any point the DM can add, remove or move players at the table."*

- **The table map is keyed to USERS (accounts), not actors.** Order of play: DM creates player
  accounts → seats them around the flat TV (the player list IS the seat list) → session zero
  runs on top → PCs get created and attach to seated players. `tableSeats` stays
  {seatId → userId} as spec'd — this confirms it.
- **Account creation moves into the module**: a Players drawer on the panel — list of player
  users, [New player] (name + colour → executor creates the User document; GMs can manage
  users in-session), tap a seat slot to place them, drag/move/remove ANY time — the map is a
  living, session-long thing, not a session-zero artifact.
**BUILT + bench-verified 8/8 (2026-08-04):** `TABLE_SEATS` (preset.js — six seats with per-seat
`rot` for the flat TV), `tableSeats` world setting, and a **Players & seats** drawer at the top
of the panel's Party tab (starts closed): the map drawn as the room sees it (two seats along each
long side, one at each end, TV in the middle), a roster with connected dots, ✋ pick-up → tap a
seat to place, tap a filled seat to empty, and [Add player] creating a real User (role PLAYER,
auto-assigned distinct colour from a six-colour palette). Seating is one-seat-per-player by
construction — re-seating MOVES rather than duplicating. The display/TV account is excluded from
the roster, so it can never be seated. Bench residue: a test user "Yaniv" in the bench COPY only.

**Moving players + the active PC (DM 2026-08-05).** Two follow-ups from the DM's first pass over
the drawer — *"how do i move the players after seating them?"* and *"some players (rarely) have
more than one pc — give me some sort of 'settings' that's not too obvious a 'tertiary type
button' to choose the active pc"*:

- **Moving was already the seating gesture** (✋ → tap a seat; `setSeat` drops the old seat first),
  but dropping onto an OCCUPIED seat used to evict the sitter to nowhere. It now **swaps**: the
  sitter takes the mover's old seat. Rearranging a full six-seat table is the common case, and a
  silent eviction costs a seat the DM has to spot and redo. Tapping a filled seat with nothing in
  hand still empties it. Tooltips and the hint line say which of the three is about to happen.
- **`seatActors` world setting {userId → actorId}** — which of a player's characters is at the
  table tonight. Resolution order in `card-table.js actorForUser()`: explicit pick (only if it
  still resolves to a character that user OWNS) → `user.character` → any owned character flagged
  mid-creation. A stale pick **falls through** rather than blanking the seat; the pick is a
  preference, never a requirement, and nothing in Foundry is reassigned.
- **The control is deliberately near-invisible.** On a roster row: one owned PC (the normal case)
  is plain muted text under the player's name; **only a player who owns more than one gets a
  control**, and it's tertiary per UI-BIBLE §127 — no border, icon-led, muted until hover. It
  expands an inline list of their PCs plus "Use their assigned character" (clears the override).
  A DM whose players each have one PC never sees a button at all.
- `card-table.js` watches `seatActors` alongside `tableSeats`/`cardBackImage`, on **both**
  `createSetting` and `updateSetting` (the first-write trap, §38.4a).
- **The map stands on end (DM's sketch 2026-08-05).** One seat at the top, two down each side,
  one at the bottom, TV standing in the middle — the same six seats, drawn portrait. `side`/`rot`
  in `TABLE_SEATS` are UNCHANGED and still describe the physical table (long sides seat two, ends
  seat one), so the TV board — drawn in the landscape screen's own space — is untouched. Only the
  labels moved with the drawing: Left top/bottom · Top end · Bottom end · Right top/bottom.
  Measured: TV 136×162, side seats 86×78, end seats 128×44 centred on the TV's width.
- **Reseat links: tertiary, not invisible.** First pass set them at `--mc-edge`, which on the dark
  panel is the border colour — the DM couldn't find them ("WAY too hidden… not too inviting, not
  invisible"). Now full `--mc-muted` at 10 px with a 55 %-alpha underline, gold on hover. Two of
  them: on each seated roster row, and right-aligned on the card table's seated count (that one
  jumps to Players & seats via the new `data-open-drawer` handler, which always OPENS — it's a
  destination, not a toggle).

**1080p check — the end seats collided, now fixed (DM asked 2026-08-05, measured same day).**
The end seats are rotated 90°/270°, so their hands run DOWN the screen — and **a rotated element
still occupies its unrotated box in layout**, so nothing stopped them crossing the top and bottom
hands. Measured at 1920×1080 with the worst case (six casters, six cards each):

| | before | after |
|---|---|---|
| card | 123×172 | 123×172 (unchanged) |
| end seat box | 226×**797** | 406×419 |
| collisions | **4** — each end seat overlapped its two corner neighbours by 226×99px | **none** |

Fix: `.mc-ct-mid .mc-ct-hand` wraps at three (`max-width: calc(3 * clamp(84px, 6.4vw, 190px) +
16px)`), so an end player's six cards read as 3+3. Card size is untouched — shrinking the deck
would have cost every seat legibility to solve a two-seat problem. Re-measured clean at
**1280×720** (card 84×118, ends 288×307) and **3840×2160** (card 190×266, ends 601×606), so the
`clamp()` still carries the range. Harness: [tools/cardtable-harness.html](tools/cardtable-harness.html).

**What the card FRONT is for (DM asked 2026-08-05: "why do we have a card front if the item-icon
fills the card?").** Fair question — it was barely earning its keep. `card-face-blank.png` only
appeared on cards with **no** item image at all (Abilities, "Packed" gear), so 1–2 cards in six.
Everything else was full bleed. Measuring the actual art explains why that was wrong:

| source | natural size | ratio | card is 5:7 = 0.71 |
|---|---|---|---|
| `icons/svg/mystery-man.svg` | 512×512 | 1.00 | cover crops ~29% off the sides |
| `icons/skills/…-yellow.webp` | 256×256 | 1.00 | same |
| dnd5e `icons/svg/items/class.svg` | 373×355 | 1.05 | same |
| Crooked Moon portraits (Bugbear, Bogborn) | portrait | ~0.67 | full bleed suits them |

Foundry's stock item icons are **square emblems**; compendium artwork is **portrait**. One
treatment can't serve both. So `markEmblem()` measures each image once it loads and, if it isn't
clearly taller than it is wide (`w/h > 0.85`), sits it inside the same thorn frame the text cards
wear. Real artwork keeps its full bleed. The front now earns its keep on roughly half the deck,
and a Barbarian emblem stops reading as bare clip-art beside a Bugbear portrait.

Two bugs fell out of the same pass, both visible in the DM's screenshot:
- **The name printed twice** on text cards — the thorn frame prints the value large AND the name
  strip repeated it ("STR 17" over "STR 17"). The strip is now dropped when there's no image.
- **The name strip was 10px wider than the card** — `width:100%` plus padding with no
  `box-sizing`, so `.mc-ct-face`'s `overflow:hidden` was quietly clipping both ends of every
  name on every card. Measured 315px on a 295px card.

**CSS trap worth remembering:** an absolutely-positioned **replaced** element with `width:auto`
resolves to its INTRINSIC width and drops the opposite offset — `inset: 11% 11% 25%` on a 512px
SVG rendered it at 512px, spilling across its neighbours. Bounding `object-fit: contain` needs
`width/height: 100%` with `box-sizing: border-box` padding, not insets.

**The board reads from a chair — four DM notes, 2026-08-05.**

1. **Every hand is two stacks of three**, not just the end seats. Uniform silhouette at every
   seat. The consequence is structural: the board becomes three bands of TWO card-heights, so
   **height binds, not width** — the vw-sized card overflowed the bottom row by 180px the moment
   the top/bottom hands wrapped. Card width is now height-driven,
   `--mc-ct-cardw: clamp(56px, calc((100vh - 220px) / 8.6), 190px)`, from solving
   `6·1.4w + plates/gaps/padding ≤ 100vh`. Measured zero overflow at **1280×720** (card 58×81),
   **1920×1080** (100×140, seats 336×346) and **3840×2160** (190×266, capped). The honest cost:
   a 1080p card goes 123px → 100px. Uniformity is worth more than 23px here — but it IS the
   trade, and if the DM wants the old size back, the top/bottom seats have to go back to a
   six-wide fan.
2. **The board sets its own typeface.** It used to inherit `--mc-font-title`, and several themes
   set a condensed geometric face — fine on a phone at arm's length, unreadable on a TV across a
   room ("the font is too modern… something with a slight serif so it's legible"). `--mc-ct-font`
   is now a transitional-serif system stack (Georgia → Palatino → Book Antiqua → Times), used by
   the plate, card names, text cards and the writing line. Nothing loads.
3. **Card names were being lost.** Now 13→24px (was 11→20), serif, `#f4ecda` with a shadow, on a
   backdrop that reaches the top of the text instead of fading through it.
4. **Player name first, character name last — with a flourish.** The seat shows the PLAYER the
   moment they're seated. While the PC is mid-creation its name is a placeholder ("Player
   Character (3)") and the room must never read that, so the seat keeps showing the player until
   `charGen` clears at Finish — then the character's name blooms in (`mc-ct-namein`, 1.5s, scale
   + blur + a glow in the seat's colour) and the player's name drops to the sub-line. Plays
   **once per seat:actor** — `repaint()` rewrites the board on every event, so card-table.js
   keeps a `revealed` ledger. Honours `prefers-reduced-motion`.

**"How does a player choose his main weapon?" (DM, same message).** They didn't — `readCards()`
took the first weapon in the bag, and a starting kit hands out a dagger alongside the greataxe.
The gear step now asks **"Which one do you reach for first?"** and lists the actor's weapons with
their artwork; the pick stores `mobile-command.mainWeapon` and **flips the gear card immediately**
(`szNarrate("flip")`) rather than waiting for Finish, so the table watches it happen. `readCards`
prefers the flagged weapon, falling back to first-weapon then equipment then "Packed". Offered
only when the character HAS weapons — a pack-only character just continues.

**Three CARD themes (DM 2026-08-05: "choose three themes to keep and let's develop them" →
clarified: "I meant card themes, return the app themes").** The phone's 18-swatch theme picker is
**untouched** — I narrowed it on the first reading and put it straight back. What was missing was
a look for the DECK on the shared screen, which had exactly one dress.

`CARD_THEMES` in preset.js, world setting `cardTheme`, picked from a **Deck** row above the card
back gallery in the panel's Card table drawer:

| deck | accent | corner | vignette | parchment | back |
|---|---|---|---|---|---|
| **Moonlit** (default) | gold `#c8a44d` | 8px | .75 | as painted | as painted |
| **Ash** | blood `#a34049` | **2px** | .9 | `#8f8b86` multiply — grey | `#6f5a5e` multiply |
| **Hoarfrost** | ice `#8fd3f4` | **16px** | .66 | `#cfe6f5` multiply — cold | `#7fa6c8` multiply |

**Built from ONE set of art, with blend modes** — not three tables and three decks. A modest
machine shouldn't hold nine images to show six cards, and it means a custom back the DM uploads
still reads as part of whichever deck is in play. Switching decks is a class swap on
`#mc-cardtable` plus CSS variables; nothing re-fetches. Every hard-coded gold on the board now
routes through `--mc-ct-accent` (seat highlight, active card glow, the writing line), and the
felt's colour cast rides the same overlay as the vignette.

**The decks sound different too.** `TONE` in card-audio.js shifts every filter and oscillator by
one multiplier: Ash **0.82** (thicker stock, lands dull and low), Moonlit 1, Hoarfrost **1.22**
(thin and glassy, rings higher). One number carries the character.

Verified in the harness: all three resolve distinctly (accent, radius 8/2/16px, vignette
.75/.9/.66, frame tint + multiply blend, back blend).

**Card noises — MADE, not sampled ("can you get/make them or should I?").** Neither: they're
synthesised in WebAudio at play time ([scripts/card-audio.js](scripts/card-audio.js)). A card is a
short burst of bandpass-filtered noise with a fast attack and a falling centre frequency, plus a
sine "knock" for the table — which is exactly what a synth does well. That buys three things a
sample pack doesn't: nothing to download or license, no files for a modest machine to hold, and
per-play jitter on pitch and length so a six-card deal doesn't sound like one click stamped six
times. Voices: `deal` (slide + knock), `flip` (corner lift, face slap, knock), `place`.

Measured offline-rendered `flip`: peak **0.263** (no clipping), silent by ~150ms, brightness
~3.2kHz over the first 80ms — the short bright transient a real flip is. Volume is a world
setting (`cardVolume`, 0–1, default 0.6) multiplied by Foundry's own interface slider; 0 is a
silent table. A flip only sounds when the card actually TURNS (a repeat event for the same item
is a re-render), and raising the board deals the whole table, staggered ~110ms.
**If the DM would rather have real recordings**, `SAMPLES` at the top of card-audio.js is the
whole hook — point each kind at a file and it wins over the synth.

**"Player Character (4)" must never reach a player (DM 2026-08-05).** Duplicating a blank actor
in Foundry names it `Player Character (n)` — the DM's scaffolding, not a character.
`pcDisplayName()` in preset.js (with `isPlaceholderPCName`) now guards every player-facing print:
the char-gen header (falls back to the PLAYER's own name, matching the card table), the
off-scene character list, the party view, both My Story titles, the "answering as X" line, the
biography picker and its placeholder — and the **name field itself renders EMPTY** rather than
pre-filled with scaffolding to edit. On the board there are two guards, since either can be true
alone: mid-creation (`charGen` flag) or a finished PC the DM never renamed (the name test).

### 38.6 "Coming back to the table" — the level-up sitting (DM 2026-08-06, FUTURE — recorded, not built)

> DM: *"Players can see each-others cards after they leveled up, show subclass, additional
> class/subclass, and allow DM to drag an item into each character's 'favorite item' on DM panel
> to update it. So if a 1st level barbarian has 5 cards and chose a two handed axe, he could
> later be a barbarian / sorcerer with subclasses in both with 9 cards and his new weapon is a
> fire ax (which dm dragged from players inventory to the relevant place in the dm widget)."*

Session zero is the FIRST sitting; this is every one after it. The board becomes a standing
record of the party that grows as they do, rather than a one-night artifact.

- **The hand grows with the character.** Level 1 barbarian = 5 cards. Barbarian/Sorcerer with a
  subclass in each = 9. So `HAND` stops being a fixed six and becomes DERIVED from the actor:
  one card per class, one per subclass, plus the fixed species/background/abilities/gear. The
  card table already reads the actor as its source of truth (`readCards`), so this is an
  extension of that function rather than a new mechanism — but the two-stacks-of-three layout
  and the height-driven card sizing both assume ≤6 and will need revisiting at 9+.
- **Everyone sees everyone.** During session zero a seat shows only its own hand; at this sitting
  the point is comparing. Open question: all hands face-up at once, or a "show me theirs" focus?
- **Subclass cards** need art — dnd5e subclass items carry their own `img`, so the existing
  emblem-vs-artwork rule should already handle them.
- **Favourite item, DM-dragged.** A drop target per character in the panel, taking an item from
  that character's inventory (a Foundry drag payload → uuid → resolve → store on a flag, same
  shape as `mainWeapon` in §38.4a). This *replaces* asking the player: the DM curates what the
  table sees. `mainWeapon` is the natural precedent — likely the same flag, re-labelled.

**Depends on:** nothing new; every piece has an existing precedent in §38.4a/§38.5. **Sequenced
after** the live-table leg (a real phone, cross-player denial, the whole loop on the real TV),
because a standing record is worth less than a working first night.

### 38.5 The opening — session zero's first minute (DM 2026-08-05, BUILT + verified in the DM's own world)

> DM: *"I want this to be an amazing moment, the first encounter with the system. The table starts
> off empty, candles unlit, DM sets up players' location and activates the flow, candle is lit,
> soft music starts as the candles illuminate the table, shadows stretch out and the cards are
> dealt. This should be the table the players sit down to for session zero — in fact this drawer
> and flow is called session zero."*

The panel drawer is renamed **Session zero**, and it carries one primary button: **Begin session
zero** (disabled until somebody is seated). Staged, not simultaneous — a room needs a beat to
look up:

| t | phase | what the table sees |
|---|---|---|
| 0 ms | `.mc-ct-dark` | cold wood, unlit wicks, no cards, plates at 25% |
| 600 ms | `.mc-ct-lit` | candles catch 0.5s apart; music comes up; the vignette lifts |
| 2400 ms | `.mc-ct-shadows` | the shadows reach out and start breathing |
| 4200 ms | `.mc-ct-dealt` | the cards leave the middle of the table |

Raising the BOARD is deliberately not the opening — the DM can put the table up while still
seating people. `szOpened` records that the show has run, so a reload or a re-raise lands
already-lit instead of replaying it at the room.

**Music is the DM's own**: `szMusic` holds a Foundry PLAYLIST NAME (his world has the Michael
Ghelfi ambience sets). The module ships no audio and never picks.

**🔴 THE BUG THAT ATE EVERY ANIMATION — `prefers-reduced-motion` (live, 2026-08-05).** The DM
reported "I didn't see the card distribution animation, only heard the sounds". Measured on his
own client: `matchMedia('(prefers-reduced-motion: reduce)').matches === **true**`. On Windows
that's Accessibility → Visual effects → **Animation effects**, which people routinely switch off
for PERFORMANCE, not for access — and every `@media (prefers-reduced-motion: reduce)` fallback in
this module was therefore live on his machine, silently cancelling the deal AND the candle-shadow
motion (`animationName` read `none` for both). Fix: the board carries `.mc-ct-motion` when the DM
has asked for the show, and the reduced-motion rules are scoped to `:not(.mc-ct-motion)`; new
`szMotion` setting, **default on**. A deliberately-requested centrepiece outranks a performance
toggle. **Worth auditing the rest of the module for the same assumption.**

**The deal radiates from the middle (DM: "I want the card distribution to be from inside out").**
First pass staggered on each hand's own left-to-right index, so six seats dealt in parallel and
it read as six little rows. `orderDealFromCentre()` now measures every card on the board and
ranks it by actual distance from the table's centre, so `--i` describes one wave leaving the
candles. Verified live: 22 cards, **strictly monotonic outward** — nearest 180px → `--i 0`,
farthest 518px → `--i 21` — the whole wave ~1.0s at 48ms apart.

**Shadow alignment (DM: "shadows are a bit misaligned").** The first angles came off eyeballed
centres and a guessed centroid. The candle geometry is now MEASURED by flood-filling the keyed
PNG's three opaque blobs: centres **(56.0%, 28.1%) · (25.2%, 75.8%) · (78.8%, 77.7%)**, true
cluster centroid **(50.9%, 55.7%)** — my guess had been (52.7%, 60.8%). Throw angles are
`atan2(centre − centroid)` in PIXELS (the art is 895×932, so percentages are anisotropic and
would skew the angle): **−80° · 141° · 39°**, splayed ±18 for two shadows each.

**Card names, third pass (DM: "text is still mostly unreadable").** At `.72vw` they had stopped
clipping but were too small to read at the table. Size alone can't fix a ~100px-wide card, so the
ART gives up height instead: emblem padding `5% 12% 43%`, and the type comes back to
`clamp(11px, .95vw, 22px)` at weight 600 with tighter tracking and a stronger shadow. Live:
**18.24px**, up from 13.8, with **zero** overflowing names across all 22 cards.

**Card names, fourth pass (DM 2026-08-06: "move title, shrink font").** At bottom: 6% the name landed ON the thorn frame painted border and its descenders were sliced — the frame eats roughly the outer 12% of the card. Name moved to bottom: 15% with 13% side padding (inside the parchment panel), font eased to clamp(9px, .8vw, 19px), art padding to 5% 13% 46%. Live at 1920x1080: card 100x140, name 15.36px, every name on ONE line, 22px clear of the card edge.

**The abilities card** shows dnd5e's own icon (`systems/dnd5e/icons/svg/abilities/*.svg`) and the
ability NAME — no score (DM: "no need for the number"). Ties stack, one per line, up to three:
a 16/16/16 character is three things at once. Verified live: `STR`, stacked, icon loaded, framed.

**🔴 The "phantom PC" (DM 2026-08-06: "I erased all PCs to start over, when I enter session zero
I get a phantom pc that's already been erased!?").** Investigated in his world; **two different
things**, only one of them a bug.

*Not a bug:* **Brig Brightbelly still existed** (`oxYbF6qHTgUZaeks`) and was still `user.character`
for Player 1, who is seated at s2 — so the board was correctly showing a PC that had survived the
purge. Player 1 also still owned Belnor Brightshield, Player Character (3) and Test Wizard. Also
found: **Greeny and Player 2 hold dangling `character` ids** (`vcLaLkxEBDAPeFP3`,
`9v51lZei4Mr04ma1`) pointing at actors that ARE gone — Foundry keeps the raw id on the user
document after deletion. Those resolve to null and fall through correctly, but they're worth
clearing (a DM decision — assignment is theirs, so nothing was changed).

*The real bug:* the board had **no `deleteActor` listener at all**. It listens for
create/deleteItem and updateActor, so a PC deleted while the board was up stayed in `state` —
cards and name intact — until something unrelated forced a rebuild. Three fixes:
- `deleteActor` / `createActor` hooks now rebuild from scratch (these change WHO is at a seat,
  not just what's on their cards).
- `dropDeadActors()` clears any cached seat whose actor no longer resolves.
- **`runOpening()` rebuilds before the show.** "Begin session zero" is the one moment the board
  must be certain it shows what EXISTS — the DM may have spent the gap deleting and remaking
  characters, which is precisely what session zero is for.
- `cardTableEvent` refuses an szEvent naming an actor that isn't there — it never seats a ghost.

Verified live: a forged flip event for actor `DEADBEEFDEADBEEF` produced **0** cards, the opening
re-derived the seats correctly, and `deleteActor`/`createActor` are registered (4 and 3 handlers).

**Still owed:** the DM's scribbled shadow-placement image never arrived with the message — the
current angles are physically derived (straight out from the cluster), not his sketch.

**Candles v2 — real art + the module's fire (DM 2026-08-05, supersedes the CSS-drawn version
below).** The DM generated a top-down render (three thick unlit pillars, sallow cracked wax,
charred wicks) on a magenta backdrop and asked for the module's flames on the wicks plus a
"jumpy" very transparent shadow.

**Keying pipeline** (PowerShell + System.Drawing, compiled C# for speed — a per-pixel PowerShell
loop over 1M pixels is far too slow). The backdrop is a **gradient** (178,86,133 → 148,56,103),
so a flat-colour key fails; it keys on the colour RELATIONSHIP instead:
`m = min(R−G, B−G)` — large on magenta, **negative on warm wax** (measured −22). Alpha ramps
between `m = −4` (opaque) and `m = 13` (clear).

- First pass used `m = 13..30` for the feather and left **101,390** semi-transparent pixels —
  the render's own soft shadow on the backdrop (measured m = 21–27), surviving as a dark smear.
  Dropping the ceiling to 13 cut it to **26,193** (just the outline). The DM is animating his own
  shadow; a baked one would fight it.
- **Despill**: where a pixel leans magenta (`m > −8`), clamp `R ≤ G+30` and `B ≤ G+10`. Result:
  **zero** magenta fringe on solid pixels.
- The generator's sparkle watermark sat just off the candle's lower-right edge, **on the
  backdrop** — so it keyed out with it (box-forced to alpha 0 to kill any ghost).
- Trimmed to content: **895×932** from 1024².
- **Wick centroids** from the darkest pixels inside each candle, stored as PERCENTAGES so the
  cluster scales freely: **(55.5%, 27.1%) · (23.9%, 74.8%) · (78.8%, 75.7%)**.

**Flames**: `small_fire_01/02/03_420x420.webm` from `animated-fire-by-mattm` — a different clip
per wick so the three never pulse in unison. They're authored **top-down as map tiles**, which is
the only view that works on a flat TV; a side-on flame is wrong for every seat at once.
`mix-blend-mode: screen`. **The one genuine cost in this whole feature is three webm decoders** —
everything else is free. `cardCandles` (default on) turns the lot off.

**The cluster is centred on the TABLE, not on the leftover flex space** (DM: "not centered in my
screen"). In flow inside `.mc-ct-center` — a flex child between the two end seats — the candles
sat midway between whatever those seats left behind, so an occupied left seat and an empty right
one pushed them right by half the difference. Measured on the DM's exact configuration:
**138px right** in flow, **0px** absolute against the full-screen container. Verified at 0px with
all seats filled, right end empty, and both ends empty.

**The "jumpy" shadow** snaps rather than eases: `steps(1, end)` over eight keyframes, each candle
on its own offset, opacity 0.19–0.34. A candle's shadow twitches; it doesn't drift.

Verified in the harness at 1920×1080: art renders 270×281 inside the middle band, and all three
flames land at exactly the measured wick percentages.

**Card faces, same pass (DM: "smaller fonts… give the icon image border a bit of fade out, align
the text down and the image up").** The 13→24px name ran off the card and clipped mid-word
("Zhentarim Mercena…"), and a two-line name ("Unarmed Strike") grew the box so its second line
was eaten by the face's `overflow: hidden`. Now: name **9→17px** (plate 14→26px, text cards
14→26px), and on framed cards the name is **absolutely positioned** at the bottom so it can wrap
without moving anything. The image sits higher (`padding: 7% 11% 34%`) and its edge **fades into
the parchment** via a static `mask-image` ellipse — applied once at rasterisation, never
animated, so it costs nothing per frame. Verified: zero overflowing names.

**Candles v1 — "how complex is that?" (DM 2026-08-05).** Cheap built one way, expensive built the
obvious way, and the difference is the whole answer. *(Superseded by the art above, but the
reasoning still governs every animation on the board.)*

The obvious build is `filter: blur()` for the glow and an animated `drop-shadow` for the cast
shadow. Both **re-rasterise the element every frame** — that's the version that costs a modest
machine real time, and it's what "animated flame + moving shadow" usually means. Built here so
that **only `transform` and `opacity` ever animate**: those two are composited on their own
thread, so the cost is one texture upload and then effectively nothing. The glow is a static
radial gradient (a gradient is free) whose opacity and scale move; the cast shadow is a flat dark
ellipse that rotates and stretches; `will-change` promotes each moving piece so the felt beneath
never repaints. **No canvas, no sprite sheet, no video, no images at all** — three candles are
~30 lines of CSS.

Verified programmatically (an FPS sample wasn't possible — the Browser pane throttles rAF when
it isn't compositing — so the property discipline was checked instead, which is what actually
determines the cost): all three keyframe sets (`mc-cd-flicker`, `mc-cd-glow`, `mc-cd-sway`)
animate **only transform and opacity**, zero offending properties, and **no `filter` is in use
anywhere on a candle**. 9 animated elements across 3 candles.

Details: heights, x-offsets and animation delays vary per candle (`--mc-cd-h/-x/-d`) so no two
burn in step — three identical flames read as wallpaper. Decks recolour the flame (Ash burns low
and sickly, Hoarfrost burns cold). `prefers-reduced-motion` stops them dead. World setting
`cardCandles` (default on) is the escape hatch — it's still motion on a screen people stare at
for an hour.

**Still unmeasured:** actual frame time on the DM's machine with a Foundry canvas alive
underneath. The static analysis says it should be free; a real FPS check at the table is the
honest confirmation.

**Bench technique worth keeping.** The Browser pane renders files outside the project as static
snapshots, and Foundry serves `.html` under `modules/` as plain text — but the repo is JUNCTIONED
into `FoundryVTT/Data/modules/mobile-command`, so a harness in `tools/` is reachable at
`http://localhost:30000/modules/mobile-command/tools/…`. Fetch it and `document.write` it
same-origin and it renders live, stylesheet and all, with no world touched:
`fetch(url).then(r=>r.text()).then(t=>{document.open();document.write(t);document.close()})`.
[tools/seatmap-harness.html](tools/seatmap-harness.html) is the standing one for the panel's map,
roster rows and links. Measure with `getBoundingClientRect()` rather than trusting the screenshot —
the pane's screenshot can lag a repaint, the numbers don't.

- **Future (DM "thought for later", record only): per-seat HUD.** A small strip on the TV at
  each seat, ROTATED to face that player (same rotation as their card hand): HP, conditions,
  "anything else we decide". The table map is the anchor; cheap DOM; performance-check before
  building (modest machine).

### 38.4 Personal Story Journal — spec v1 (2026-08-04, superseded by 38.4a where they differ)

**Construction (the load-bearing part).** One Foundry `JournalEntry` per PC actor — NOT flags,
not a custom store — because Foundry's ownership model IS the privacy requirement, and the DM
reads them with zero new UI (they're ordinary journals in a "Stories" folder in his sidebar):
- name `«PC name» — Story`, flag `mobile-command.storyJournal = <actorId>`, folder "Stories"
  (created on demand).
- **Ownership: `default: NONE`; each qualifying owner of the actor → OWNER.** Qualifying =
  active player owners minus GMs minus the display account (same exclusion as AoO routing,
  rpc.js displayOwnerUser pattern) — the TV must never render a story journal. GM sees all
  natively. Ownership is RECOMPUTED on every ensure (players/claims change).
- **Two pages, fixed in v1**, using the SAME page/entry format the shell journal already
  renders (cover→page→entries, composer, edit-own-entry — all of it reused):
  - **"Who I am"** — the session-zero basics. One entry per basic question; question = entry
    header, answer = body. Re-running onboarding EDITS these entries rather than appending.
  - **"My story"** — append-only feed. Each entry: optional `question`, `text`, real date,
    AND the in-world date (`clockLabel()` — a Crooked Moon campaign stamps entries "Day 12 ·
    21:40"). Manual entries and pushed-question answers both land here, newest first.
- **All writes executor-brokered** (phones can't create top-level journals): `storyEnsure(actorId)`
  · `storyAdd({actorId, text, question?})` · `storyEdit/Delete({actorId, pageId, entryId, …})`,
  mirroring the partyJournal* RPC family. Permission check per call: requester must OWN the
  actor (requesterCanAct pattern); the DM edits anything.

**PC onboarding flow (session zero = the basics).**
- Entry points: DM panel button **"Session zero — push story basics"** (in the Story drawer,
  below) pushes the runner to every connected phone; AND always self-serve on the phone
  (Journal tab → My Story → "Start your story"), because latecomers exist.
- Phone: a card-at-a-time runner in the shell (same pattern as char-gen): ~8 basics, inline
  input ([[phone-input-inline-not-popup]]), **Skip** on every card, progress saved per-actor
  flag so it's resumable. Finishing writes "Who I am" and toasts the DM panel a quiet ✓.
- v1 basics (in `preset.js`, one shared source): Where are you from? · Who raised you? · A
  childhood memory that shaped you · Why did you take up adventuring? · What do you want most,
  long-term? · Who do you care about / who waits for you? · A secret you keep · What would you
  never do?

**DM "push story question" flow (the between-thoughts tool).**
- Panel: **"Story questions" drawer** (Party tab, dtDrawer, starts CLOSED like the CM drawers).
  A curated list grouped by category — Memories · People · Goals · Beliefs · The party · The
  world (~24 defaults in `preset.js`; DM's own questions appended via an inline "New question…"
  row, stored in a world setting `storyQuestions`).
- **One tap pushes**: [→] on any row sends it to ALL connected player phones; a **[Push
  random]** button at the top for the zero-thought case — the whole point is buying the DM a
  few seconds, so the flow must cost less attention than it saves.
- Phone receives a **story card** (non-modal, PM-style): the question + inline answer +
  [Save] / [Later]. "Later" parks it in My Story as an unanswered prompt — no pressure, no
  timer. Answer → `storyAdd` with the question + both date stamps.
- Panel shows quiet per-player ✓s for the last push (non-blocking, auto-fades). Per-player
  targeted pushes: v2 (roster-row action), noted not built.

**Implementation map.** rpc.js: story* RPC family + `storyQuestionPush` (executor→phones) +
answered-ack; shell.js: My Story section inside the existing Journal tab (reuses the page
renderer), the onboarding runner, the story card, unanswered queue; dm-panel.js: the Story
drawer (list, push, ticks, session-zero button); preset.js: `STORY_BASICS` +
`STORY_QUESTIONS` decks; settings.js: `storyQuestions` (world). Slices: **1** construction +
manual entries + My Story UI · **2** DM push flow + story card · **3** onboarding runner.

**SLICE 1 BUILT + bench-verified (2026-08-04, 8/8 results).** rpc.js `storyAdd/Edit/Delete` +
`ensureStoryChapter` (auto-creates "Player Stories" ownership NONE, page per PC, entries-flag
format shared with the party journal, `storyMirrorHTML` keeps the native page readable with
Origins above The-story-so-far); shell.js My Story cover row + chapter view + composer with
edit/delete-own; step-tagged adds REPLACE the same step (char-gen redo can't stack origins);
repaint hook extended to story pages. Verified: cover row → chapter → post creates
journal/chapter on demand (ownership.default=0), entry lands with real+in-world dates (the wd
stamp came from Simple Calendar live — its read path works), edit/step-replace/delete all
clean, mirror renders. **Not yet verified: cross-player denial (needs two clients — live-table
leg.)**

**Card-table assets found (2026-08-04, TV = FLAT confirmed):** `the-crooked-moon-2014/assets/
card/` ships five themed sets WITH back faces (items ×47, monsters ×80, NPCs ×80, familiars
×13, spells) — backs are per-card numbered so some may carry text; the creation-table back
becomes a setting defaulting to `card item/Card_items_back1.webp`, DM to eyeball alternatives.
BONUS for §32: `card tarot/` is a complete 22-card major arcana with bleed — the Fated Tarot
draw is content-complete before it's even built.

Source: `the-crooked-moon-2014` module's journal packs, dumped + read in full (extraction
technique: copy pack dirs minus LOCK → classic-level via Foundry's Electron-as-Node; text dumps
+ rolltables.json/cards.json in the session scratchpad, regenerate as needed). "Gate weaving" =
the book's **Fateweaving** (ch9). The séance board (§30) is the ch12 Parlor scene (H3) — its
source confirmed, Q&A ladder + 1d10/escalating-die bite match our build.

**Campaign-wide systems (the séance-board-sized features):**
- **Fated Tarot reading (ch9+10) — top candidate.** Adela pulls one Major Arcana per PC on the
  Ghostlight Express (always upright, no duplicate cards; each PC keeps their card; each card
  unlocks a chapter-keyed Fabled Heirloom/boon later — Lovers = Adela's PLANCHETTE ch24, Moon =
  3 Twists of Fate ch12 → ties into §31, Star = free feat, Sun = +2 ability, World = one Wish).
  ALL 22 card faces ship in the module (`assets/card/card tarot/1_<n> - <Name>_Bleed.webp`, no
  back art for this deck); Foundry docs exist: deck `tcm2014-cards…hE6QSAetov5iFigA`, 1d22
  RollTable `PgDCRgyABMbAxork` (rewards), light 1d12 fortune table `M9wdb1sObnJHpTFG` (flavor
  only — good for a repeatable "fortune teller" toy). UX sketch: TV card-flip reveal, each
  player's card drawn face-down on THEIR phone first; persistent per-PC card chip.
- **Chaotic Curses (App C).** 156 fleeting RP curses (15–30 real minutes), tarot-card-indexed
  (78×upright/reversed), RollTable `MFPMY4JfgYwbN31l` (1d156). Many are PERCEPTION curses —
  one-phone effects: grayscale filter, whisper-only, footsteps-audio only you hear, button-eyes
  on portraits, roll d12 instead of d20. Rides on §31's infrastructure (self-reverting effects
  + chips + DM roll/accept flow) almost unchanged.
- **Fateweaving (ch9).** Per-PC story arc: 13 Threads of Fate, 6 touchpoints with fixed rewards
  (Inspiration → ally+Bless → a Twist of Fate → +2 ability → free feat → catharsis). The
  threads carry phone-prop-shaped devices: soul compass that points/pulses, doppelganger in
  mirrors, self-writing demonic tome, dream journal, shadow offering games of chance, entity in
  a flask. Module fit = private per-player widgets + a DM touchpoint tracker, not automation.
- **Dark Bargains (ch6).** 13 unique boon+bane pacts; offered AT DEATH ("deny death by
  accepting a Dark Bargain"). Phone fit: a devil's-deal prompt on the dying player's phone;
  chip-tracked banes (Crooked Fortune's "next 3 saves at disadvantage" debt counter; Red Haze
  forced-targeting; Watery Doom wet-state). Also ch8's Book of the Horned King (sign your name
  = pledge your soul) as a signing UI.
- **Druskenvald clock.** Eternal night, 6 named hours (Twilight/Dusk/Nightfall/Evening/
  Midnight/Witching) each with a sky colour — a TV time-of-day HUD + ambient tint; NPC copy
  uses the hour names. Feeds the Wickermoor clocktower haunt (below).
- **"Lair pulse" engine (infrastructure).** The book runs on initiative-count-20 environmental
  pulses (clock chimes, rising blood, baby wails, psychic bear, phantom feast, mill tremors)
  and escalating-die ladders (séance bite 1d4→1d12; trophy-room DC10→13). One generic
  executor-side pulse/ladder engine covers ~10 scenes across ch10–13.

**Ch10 Ghostlight Express (party's next stop if early):** silver ticket pushed to each phone
(PRC DC 13 gets it early) · haint-freeing skill challenge ×6 (3 successes before 3 failures,
DC12, +2 per reused skill — calm↔rage meter on TV, per-skill "spent" marks on phones, exactly
séance-board energy) · Soul Cans/bottle-trap ghost capture (hold-to-seal phone gesture; cans
pay off in the boss fight as objective markers he eats for 20 HP) · 6-car token↔haint matching
board (phonograph→Songstress etc.) · phantasmal food — free-text order materializes on the TV
table (steak & eggs is a puzzle key; inline input per phone-input rule) · Vagrant train-PA
(crackly intercom voice channel, reusable for any GM announcement) · Switcheroo mist-wipe
random-car transition · don't-wake-the-tiger ring-slip (steady-hand slider, 2d6 fire on fail)
· crash + first sight of the crone-faced Crooked Moon (shake + vibration burst + persistent
moon skybox that gets closer/brighter across the campaign).

**Ch11 Wickermoor (hub):** haunted clocktower — module rolls d12 secretly at long rest, fires
a real-time wrong-hour bell + haunt that even the DM can't predict · Insight whisper-lane
(passed checks push private "his smile doesn't reach his eyes" lines) · the Lottery draw
(tumbling tickets on TV, each phone holds one — Shirley Jackson energy, trivial build) ·
Gaston's degrading paintings (image series that corrupts act by act — fits the saved-image
journal) · Bloody Cup carnival-games anthology (phone minigames + TV scoreboard; also serves
ch21 Fool's Day tickets) · Oak of Many Faces solo night ambush (lone player's phone gets the
creaks first).

**Ch12 Crooked House (séance's home):** Crooked Teeth — ANY failed search finds a single human
tooth (hook the roll, show the tooth on the failing phone, count them) · cursed foyer portrait
= the party toothless (generate from their token art; cursed viewer gets a silent nat-1
jumpscare flag) · check-for-monsters — 1-of-6 hide-and-seek with directional scraping audio as
miss feedback, ceiling jumpscare on attempt 6 (Lurking Shadows table `6MD0TbD49MCv1CIK`) ·
bathroom fills with blood — trapped players' PHONE SCREENS fill red over 4 rounds + muffled
audio · haunted harpsichord forced-dance (house-wide discordant track; seated player gets a
rhythm minigame as the DC 15 Performance; Patrini assists non-proficient — séance callback) ·
6-memento tracker + rune-door slotting (chapter progress bar) · grandfather-clock chime
spawner · Wisp's delayed betrayal (story told at table → 5-min-later charm takeover flag) ·
false-Adela private guess commit · Crooked Man one-tap haunt button (three scripted
apparitions + at-will).

**Ch13 Fields of the Crow:** pay-a-secret gate — each entrant TYPES a confession privately;
module flags who paid; Crowsong events later taunt THAT player with their own secret; +1
legendary resistance per paid secret (the design question — does the table hear it? — is the
drama) · 3-hour doom clock over the whole demiplane · crow-caw audio NAVIGATION (loudest of
three directions is correct; check quality gates how much acoustic info: full/quietest-only/
noise) · windmill 9-round collapse countdown + rotating-cog hazard · bucket-brigade
firefighting (gallons per blaze, pump/carry/douse from phones) · crow-catching boss scoreboard
(catch 6 before he eats 3; whispered-secret audio sting per catch) · amber-wristband
auto-revive (Tender Secrets) · black-coin one-player whisper.

**Triage note (2026-07-27, mine):** build-first shortlist = Fated Tarot (assets + tables
already ship; recurs all campaign; feeds §31) → Chaotic Curses (near-free on §31 slice 1) →
ch10 pack (ticket, haint meter, soul cans, crash/moon — if the party is pre-Express) →
secret-confession gate (cheap, phone-native) → Druskenvald clock + clocktower. The audio-heavy
ideas (directional caws, room-wide loops) need the performance-cost talk first (modest
machine). RESOLVED 2026-07-27: campaign not started yet (no chapter urgency) — the DM chose
the suite now spec'd as §31/§33/§34/§35; tarot + clock remain the top future residents.
