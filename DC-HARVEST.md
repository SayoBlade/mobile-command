# Harvest survey — what mobile-command has that deck-command lacks

**Read-only survey, 2026-09-23.** Nothing in either repo was changed; no commit. Written for the
deck-command session (and Michael) to act on, not for MC to build from. MC stays the publisher;
DC stays the consumer (DC DESIGN §7.11).

**Michael's ask:** *"I think mc had a mechanism for creating a group from PCs and grouping and
ungrouping them, this is a feature we'll need in DC… We should definitely harvest things from MC,
it has a LOT to offer for both the cm helper and core dc, go over it and see what's missing in dc."*

**The two rules this survey is sorted by** (both settled 2026-09-23, DC DECK.md / HELPER.md §0):

- **v1 DC is "an assistant DM that works off info from the helper mod"**, and authored beats
  derived. Nothing below proposes a runtime heuristic; where MC derives something clever, the
  deck-shaped version reads a document or a pack instead.
- **The players choose where to go and don't have the script.** Anything keyed to the module's
  running order is a weak guess; anything keyed to where the party actually is (tokens, the group
  actor, the active scene) is evidence. The party mechanism in Part 1 is entirely the second kind,
  which is part of why it fits the deck.

**Sources read:** MC DESIGN.md (section map + §15, §6, §20, §23, §27, §49, §52, §53), UI-BIBLE,
`scripts/*` (dm-panel.js party code, rpc.js party handlers, actions.js + the two action files,
main.js namespace, the subsystem headers), `deck-command/MC-ACTIONS.md` (the 2026-09-18 inventory of
135 panel controls, which this survey builds on rather than repeats), DC DECK.md, HELPER.md,
MODES.md, SAFETY-NET.md, DESIGN ledger 150–160, `../AGNOSTICISM-AUDIT-2026-09-23.md`, and DC's
`foundry-module/scripts/*` (tree, page, dispatch, world, snapshot, table, combat, scene,
linked-sounds, action-runtime, druskclock).

**Sizes** use SAFETY-NET.md's scale: **S** = an afternoon, **M** = a few days, **L** = a design
conversation first. Key shapes are **press**, **hold**, **arm+OK** (DC's confirm-on-key), **pick**
(a page of choices), **steps** (− / +), **mouse** (needs a position, a shape or words).

---

## Part 1 — The party grouping mechanism

### 1.1 What it is, and where

MC calls it **Party Mode** (DESIGN §15, built July 2026, verified live by the DM many times). It is
two layers that the panel presents as one:

| layer | verbs | lives in | how it runs |
|---|---|---|---|
| **Membership** — which PCs are "the party" | Create party · Add N PCs · Rebuild · Choose members (checklist) | `dm-panel.js` `partyMainHTML` / `onPartyClick` (`data-party="populate" \| "rebuild" \| "roster"`) | direct document writes on the GM client; two of the four open a dialog |
| **Pack / unpack** — collapse the party into one token and lay it out again | Form Up · Arrange (3×3) · Rotate · Lock in / Rearrange · Release / Combine a scout · Disperse | `rpc.js` `handlePartyPack / SetCell / SetForward / Stage / Release / Combine / Deploy` + `partyDeployPreview` | executor RPC (`toExecutor`), GM-only, needs the DM's client **viewing the active scene** |

Every pack/unpack verb is **already on the public namespace**: `MobileCommand.partyPack`,
`partySetCell`, `partySetForward`, `partyStage`, `partyDeploy`, `partyRelease`, `partyCombine`
(plus `fixPcTokens`). DC's MODES.md §6 already sketched a "Party keys" sub-page against exactly
these names; nothing in DC calls them yet (grep: DC touches only `MobileCommand.actions` and
`.clock`). The membership verbs are **not** on the namespace — they are panel-private and two are
dialogs.

It rides the **native dnd5e group actor** (`type: "group"`, `system.members: [{actor}]`). MC adds
no document type of its own; it adds flags.

### 1.2 What it actually does — every document it creates or mutates

**Membership layer (panel, GM client):**

| verb | reads | writes | notes |
|---|---|---|---|
| **Create party (N PCs)** | `scenePartyActors()` (below) | `Actor.create({ name: "The Party", type: "group" })`, then `group.system.addMember(actor)` per PC | idempotent per dnd5e; one tap, no dialog |
| **Add N PCs to \<group\>** | an existing group with **no** members | same `addMember` loop | offered only when an empty group exists |
| **Rebuild** (arrows icon) | scene PCs | `group.update({ "system.members": [...] })` — **replaces the whole list** | confirm dialog; **silently drops** members with no token on this scene (the panel says so in a comment) |
| **Choose members** (checklist) | scene PCs pre-checked; existing off-scene members listed **un**checked | same wholesale replace; creates "The Party" if there is no group | DialogV2 — needs a pointer |

**How membership is chosen** — `scenePartyActors()` (dm-panel.js): the unique actors of every token
on the **active scene** where the actor `hasPlayerOwner`, is not `type:"group"`, the token is not
HOSTILE, and the actor carries no `item-piles` flag. So it deliberately includes pets, summons,
familiars, a druid's beast and a neutral/secret summon (DM 2026-07-23), and excludes a dominated
enemy. No disposition-friendly filter, no "type character" filter. **Which group** is the party:
`game.actors.find(a => a.type === "group" && …)` — **the first group actor in the world** that
matches (twelve call sites use this idiom). Two group actors in a world make the choice arbitrary.

**Pack / unpack layer (executor):**

| verb | precondition | writes, in order | side effects on his world |
|---|---|---|---|
| **Form Up** (`partyPack`) | GM requester; DM viewing the active scene; group has members; **every member has a token on this scene** (else refuses naming the missing); members fit in a 3×3 (else refuses "party isn't clustered") unless `force` | 1. `group.update({ prototypeToken: { sight, light?, ring, disposition: FRIENDLY } })` — **permanent** change to the group actor's prototype; 2. create or update the **group token** at the cluster's centre cell (`hidden:false`, sight = party's best range, darkvision mode if any member has it, glow light if the `tokenGlow` setting > 0, dynamic ring on, FRIENDLY); 3. **`deleteEmbeddedDocuments("Token", every member token)`**; 4. `flags.mobile-command.packed = true`, `formation = { cells, forward: 0, locked: [], released: [], snapshot: {actorId: {x,y}}, stage: "arrange" }` | The member tokens are **gone from the scene**. HP, effects, items survive because the members are linked actors (§15.1 finding 3). Combatants of deleted tokens leave the combat tracker (core behaviour). Every member's **phone auto-jumps** to the Party-order tab (§15 round 9). The TV's follow now frames the group token. |
| **Set cell / lock** (`partySetCell`) | GM, or the owner of that PC | `formation.cells[actorId] = {r,c}`, `formation.locked` ± | flag only |
| **Rotate** (`partySetForward`) | GM | ring-rotates the 8 outer cells by 45° steps; `formation.forward` 0..7 | flag only; WYSIWYG — deploy places cells verbatim |
| **Auto-facing** (hook, executor) | packed group token moves | rotates the formation to the movement direction | flag write on every group-token step |
| **Lock in / Rearrange** (`partyStage`) | GM | `formation.stage = "travel" \| "arrange"` | flag only; players get/lose the travel pad |
| **Release \<name\>** (`partyRelease`) | GM; packed; member; not already out | creates **one token** for the scout on the first free, in-bounds, wall-reachable square around the party (orthogonals first); **boxed in → dropped on the party's own square**; token built from `actor.getTokenDocument` + `actorTokenSight` + `applyPcVisuals`; `formation.released += actorId` | a new token appears; vision is re-derived from dnd5e senses; the player-colour ring and glow are applied |
| **Combine \<name\>** (`partyCombine`) | GM; packed; scout out; scout's token within 1 square (Chebyshev) | deletes the scout's token; `formation.released −= actorId` | if the token is already gone it just reabsorbs |
| **Disperse** (`partyDeploy`) | GM; packed; group token present; `partyDeployPreview` clean — or `force` | 1. preview: for each non-released member, landing cell = group cell + formation cell; marks **off the map** / **stacked on X** / **behind a wall** / **occupied by another token**; 2. **off-map is the one hard stop**; any other problem refuses with `reason:"nofit"` unless `force`; 3. `createEmbeddedDocuments("Token", member tokens)` from `actor.getTokenDocument({x,y})` + `actorTokenSight` + `applyPcVisuals`; 4. deletes the group token; 5. `packed = false`, `formation.released = []` | the members are **new tokens**, not the old ones restored |
| **Travel › Switch map** (`travelPrepare`) | GM; an overworld scene chosen | if nothing is packed it calls `handlePartyPack` with **`force: true`** — a scattered party is collapsed anyway (cells clamp to the 3×3 edges) — then `travelDrop` moves the group token to a clicked spot on the other scene and activates it | the one path that packs without the cluster gate |

### 1.3 What ungrouping restores — and what it does not

- **Restored:** the actor-level state (HP, temp HP, conditions, effects, items, spell slots) — it
  never left the actors. Vision is **rebuilt** from each member's dnd5e senses (`actorTokenSight`),
  which is deliberately *better* than the prototype (the 2026-07-04 "walked blind" fix). The
  player-colour ring, glow and darkvision saturation are applied fresh (`applyPcVisuals`).
- **Not restored:** the **original tokens**. Disperse recreates each member from the actor's
  prototype at a formation cell. Anything that lived on the old token document and not on the actor
  is **lost**: a per-token name, image, scale or size override, elevation, a token-local light or
  detection tweak, token-specific disposition, `noFollow` / `muteListener` flags if they were set on
  the token, and the exact pre-pack position. `formation.snapshot` (the pre-pack positions) is
  written on pack but **never read anywhere** in the repo — "for a future return to exact spots".
- **Not guarded:** `prototypeToken.actorLink`. §15.1 finding 3 says delete-and-recreate is lossless
  *for linked actors* and names the guard for unlinked members as a to-do; the guard was never
  written. A member whose token is unlinked (an unlinked summon, a pet dragged from a compendium
  without linking) would lose its **token-local HP and effects** on pack. `scenePartyActors()`
  admits exactly those (pets, summons), so this is reachable.
- **Combat:** nothing checks `game.combat`. Packing during a running encounter deletes the
  members' tokens, and Foundry drops their combatants; the panel only *nudges* ("Disperse" is
  highlighted when the group is in the tracker), it never refuses.

### 1.4 Is it sound? Verdict and rough edges

It is sound for what it was built for — a DM at a screen, tapping Form Up when the party is
visibly clustered, arranging on phones, and Dispersing with a red-cell preview in front of them.
The parts that matter (cluster gate, wall-aware preview, warnings-not-walls with an explicit force,
sense rebuild, flag-based state every client can read) are the right shape. The rough edges are
all of the kind a screen hides and a physical key exposes:

1. **Destructive by design** — Form Up deletes N tokens; Disperse deletes one and creates N. Both are
   one document round-trip and nothing confirms.
2. **The "first group in the world" lookup.** With two group actors (an old test party, a rival
   group he made for an NPC faction) the deck would pack the wrong one, or a stale one.
3. **The prototype-token write is permanent** and outlives the pack: the group actor's prototype now
   carries sight/ring/disposition MC chose. Harmless in play, surprising if he later uses that group
   for something else.
4. **No linked-actor guard, no combat guard** (1.3).
5. **The snapshot lie.** A DM who expects "put them back where they were" gets "put them in
   formation around the group token" — the same thing only if nobody moved the group token.
6. **`force` on two paths** — "Disperse anyway" stacks tokens or lands them behind walls (chosen,
   §11); Travel's silent force-pack of a scattered party is the more surprising one.
7. **Executor-bound**: refuses unless the DM's own client is viewing the active scene. On a deck the
   refusal is a string in `{ok:false, reason}`; the key must show it or the press looks dead.
8. **Scout boxed-in fallback** drops the scout on the party's square — a stacked token with no
   warning beyond the panel's badge.

### 1.5 What a deck-shaped version should and shouldn't do

**Should (all reachable today, no MC change):**

- **Two keys, state from the document.** `Form Up` when a candidate group exists and is not
  packed; `Disperse` when `group.getFlag("mobile-command","packed")` is true. The flag is world
  truth every client sees, so the face can never disagree with the panel. Show the member count and
  the group name in the display column.
- **Disperse arms; OK commits.** Call `partyDeploy({groupId})` without force first. On
  `reason:"nofit"` the key turns into DC's hatched can't-face with the first `blocked[].why` on the
  sub-line ("Sara behind a wall"), and a second press with OK sends `force:true` — DC's existing
  arm+OK pattern (MODES §0.5) maps 1:1 onto MC's "Disperse anyway". Off-map stays a refusal.
- **Form Up refuses honestly.** MC's reasons are already sentences ("not on this scene: Nils",
  "party isn't clustered — bring them within a 3×3 first"); put them on the error face for 3 s
  (DECK.md §8). Never pass `force` from a key.
- **Release / Combine as a pick** over the members (portrait keys; a scout is marked "out"); the
  distance rule ("within 1 to combine") comes back as a reason string.
- **Lock in / Rearrange** as one toggle reading `formation.stage`. **Rotate** as − / +.
- **A combat guard DC's side**: when `game.combat?.started` and any member is a combatant, draw
  Form Up hatched with "in combat". MC won't refuse; the deck should not offer.
- **Read which group** the same way MC does (first packed, else first with members) so the two
  surfaces agree — and put the group's *name* on the key so a wrong group is visible before the
  press.

**Shouldn't:**

- **No membership from a key.** Create / Add / Rebuild / Choose members are setup, two are dialogs,
  and Rebuild silently drops members. Leave them on the panel and the mouse. If he wants a key
  here at all, the only safe one is "Create party from this scene" when **no group exists** — one
  tap, nothing replaced — and even that is once per campaign.
- **No travel-prepare from a key** (it force-packs).
- **No marching-order editing.** The 3×3 is a shared pointer surface the *players* fill; the DM's
  mirror needs pick-up-then-drop across nine cells. It is technically nine keys, but it is the
  players' job by design (§15.2 #5) and the deck is DM-only (D9).
- **Never auto-pack** on a scene change, a rest, or a travel step. Pack is a DM decision about a
  moment; DC's "may not choose" rule applies.

**Before shipping the keys, two things worth fixing in MC** (MC's call, noted here as findings,
not proposals for DC): the missing `actorLink` guard, and a `game.combat` refusal in `partyPack`.
Both are one `if` each in `rpc.js`.

---

## Part 2 — The harvest survey

### 2.0 What DC already has (so it is not listed as missing)

Combat mode with NPC/PC turn pages, target picker (own candidate list, range marks, RANDOM,
multi), adv/dis cycle, recharge, legendary pips, undo; the tree (place → subject → kit) with
authored steps, routines, rosters, count-20, the yellow next-step mark; creature sound boards (six
per actor) and scene FX boards (ten per page, sounds + macros); the action runtime (intro, room
sound, door, light, tokens, loop, cue, fx); the **Table area** that draws whatever MC publishes
through `MobileCommand.actions` — today that is the Effects area (20), the Crooked Moon area
(34) and its five Requests; a Druskenvald hour label (copied table); pause; jump/pan; the
handoff/ignition pattern; the error face; the alert-strip slot (nothing raises it yet).

**What MC publishes today vs. what it still owes** (MC DESIGN §52.5): Effects, Crooked Moon,
Requests(part) are published. **TV · Clock & HP · Combat · Sound · Party · Rest · Travel · the rest
of Requests** are areas declared in `AREAS` with **zero definitions** — the deck's Table drawer
draws them as empty. Several core-DC rows below are therefore "wire the key once MC publishes",
and the party rows are the exception: their verbs are already on the namespace.

### 2.1 Core DC — ranked by value to a DM running a session

| # | What MC has | Why it matters at the table | Reach today | Cost | Keys |
|---|---|---|---|---|---|
| 1 | **The DM's decision chips** — opportunity attack take / let go, scribe approve / decline, summon control grant / keep, trade accept / decline for an offline receiver, **pending area cast: Place / dismiss**, **split-party: activate that scene**. MC raises them via `Hooks "mobile-command.dmReaction"` and panel chips; the phone side is §49's queue + bell | This is the only thing in MC that *interrupts* the DM, and it is exactly what DC's alert strip (MODES §0.3) was reserved for and never filled. A deck that cannot answer "take the AoO?" makes him reach for the panel mid-narration | chips arrive on a hook DC can listen to now; the **fire** halves (`fireAoO`, `approveScribe`, `placeCast`, `dismissCast`) are panel-private — MC's §52.5 lists them as the Requests still to publish; summon-grant and split-activate are core writes DC can do itself | **M** (a hook listener → alert page; MC publishes the four runners) | press on the alert page; **Place cast = press → mouse** (an ignition, DECK.md §6a); split-party = press |
| 2 | **Party pack / unpack / scouts** (Part 1) | His stated priority; the group token is *evidence* of where the party is | **all on the namespace now** | **S–M** | press · arm+OK · pick |
| 3 | **Roll requests** — a save or check (by ability/skill) pushed to chosen PCs' phones (`requestRolls`); **group checks** via the group actor's own `rollSkill` (core dnd5e) | "Everyone Perception" is the most common DM sentence in the game. DC drew `Ask Roll` on the PC turn page and left it inert (MC-ACTIONS finding 2) | `MobileCommand.requestRolls({rollType, ability, actorIds})` is on the namespace; group `rollSkill` is core | **S** | pick (save/check → ability → PCs, or the group); one press for "the party, Perception" |
| 4 | **Combat music** — a battle track looped on foe turns, per-PC themes on their turns, crossfade, resume what was playing on combat end (§25.2, combat-music.js) | The deck's staging page sketched track keys (MODES §1.2) and `s.mc.tracks` is never filled; today the deck's Start Combat starts silence, MC's starts the music | the setting `combatBattleTrack` is readable; `startCombatWithMusic` is private → needs the Combat area published | **S** once published | pick at staging (track), press Start; per-PC themes stay **mouse** (drag a sound onto a PC — setup) |
| 5 | **Rest & watches state machine** (§19): Start (short/long, activities?, watches?) → Begin → To Watches → watch 1/2/3 → Pass watch (advances world time, re-sleeps) → Finish (applies the dnd5e rest to the group) / Cancel; the night-ambush "mark sleepers Surprised?" offer | A long rest is a ten-minute table beat with five presses in it, all in order — the most key-shaped flow MC has. State lives on the group actor's `rest` / `night` flags, so every key's face reads a document | **not published** (§52.5: "the rest draft moves first") | **M** (MC side) + **S** (DC keys) | press / press / press; Start = pick (short/long); Finish and Cancel = arm+OK |
| 6 | **The clock**: ±10 min, **Next named hour**, apply the daylight curve now (`applyDaylightNow`), the Night toggle with `daylightHold`, gametime with a Simple-Calendar fallback | DC already shows the hour; it cannot move it. Time is a document (`worldTime`) so every face is honest | `game.time.advance` is core; `applyDaylightNow` is on the namespace; Night is the published Effects toggle | **S** | steps (±10) · press (next hour, apply daylight) |
| 7 | **TV camera and follow**: focus party, manual (DM's own pan drives the TV), fit whole scene, zoom ±, **per-token follow / solo / none** (token flag `noFollow`), the clearance model that keeps the camera still (§23), **boss intro** | ⚠️ **DC's camera drawer calls three names MC does not export** — `focusTokens`, `displayScene`, `displayGmView` (`world.js:403-406`). MC exports `focusParty`, `tvFitScene`, `tvZoom`, `toggleTvManual`, `tvManualActive`, `playBossIntro`. Every camera verb on the deck throws "unavailable" today. This is the clearest "exists in both, MC's is better and the deck isn't even reaching it" row | all on the namespace | **S** (rename four calls; add follow-pick and boss intro) | press (focus, fit, manual toggle) · steps (zoom) · pick (follow one / solo / everyone; boss) |
| 8 | **Sound controls**: mute the table (`tvMuted` setting), hears-through per token / solo / everyone (`muteListener` flag), stop all player effects, `playSound` positional one-shots | DC has boards and a duck spec (unbuilt); it has no mute and no "whose ears" | mute is a setting write (MC's namespace) → Sound area to publish; flags are core writes | **S** | press (mute, stop all) · pick (ears) |
| 9 | **Split party awareness** (`splitPartyHTML`): which PCs are on which other scene, one tap to activate that scene (others' phones pause) | DECK.md §6 "the split party" is sketched and unbuilt; MC's detection is scoped to the current party (group members + assigned characters), which is the evidence-based scope DC wants | core reads + `scene.activate()` | **S** | press per stranded group (alert strip) |
| 10 | **Attack-time advantage verdict** — MC's phone reads AC5E's adv/dis decision *without rolling* (`_preRollAttack` direct evaluate, MC 2026-09-15) | DC's adv/dis is a manual cycle; showing the system's own verdict on the attack key before the press is "predict the situation, never the choice" done right | the technique is in MC `rpc.js` (`attackPreview`), executor-side, callable | **M** (DC ADVANTAGE.md already covers the ground) | display only (a mark on the attack key) |
| 11 | **Quick HP on the selection** (− Damage / Heal +, temp HP first, floor 0) | Useful, but it needs a number: MC types it | core `actor.update` | **S** | steps page (−1/−5/−10, +1/+5/+10) — honest verdict: a **mouse** job most of the time; a preset page is a partial |
| 12 | **Travel**: pace (slow/normal/fast/custom), start/stop the journey along a drawn route (pauses, advances time and darkness), switch map (prepare → map click → drop) | Journey start/stop and pace are keys; the route and the landing spot are the map | route/drop are mouse; pace is a group flag; journey run is private → Travel area to publish | **M** (MC) | pick (pace) · press (start/stop) · switch map = press → **mouse** (ignition) |
| 13 | **Template placement by pad** — `placementStart / Nudge / Rotate / Confirm / Cancel` (phone-placed templates and teleports, §Round 47) | DECK.md says placing a template is the mouse's. MC proves a D-pad can do it. Listed for honesty: it works, and it is slower than the mouse for anything but a straight cone from the caster. Worth one key ("place at the target") only if he asks | on the namespace | **M** | press → nudge keys → OK — or leave as mouse |
| 14 | **Session preflight / system health** as a status, plus Meta (`enforcer.apply`, `fixPcTokens`, `syncPartyTokenSight`, `devReport`, `feedback`) | MODES §3 already lists them; once per session, press-shaped | on the namespace | **S** | press (Meta page) |
| 15 | **Presence** — `MobileCommand.state` (connected / backgrounded / gone) for the Watch page | display only | on the namespace | **S** | none (column) |
| 16 | **Downtime activities**: push/withdraw a roll, tick, adjust progress, give a task from the catalog (`downtime` op API) | Real but between-sessions; per-PC × catalog pick pages; lowest value mid-narration | on the namespace (`downtime({op})`) | **M** | pick × pick — low priority |
| 17 | **Session zero**: card table on the TV, begin the opening, push a story question (random or chosen) | Once per campaign; three keys, all press | `szEvent` on the namespace; `cardTableOn` is an MC setting write | **S** | press |
| 18 | **Personal message** — a canned line whispered to one player | Free text is the mouse's; a pick over a few canned lines ("you feel watched", "you are charmed") is a key. Only if he authors the lines (pack content, not derivation) | `pmSend` is private but it is a core chat whisper | **S** | pick (player) → pick (line) |

**Rows deliberately not in the table because they are outputs, not controls** — the deck already
triggers them or they run themselves: soft fog edges, the heartbeat ring, the deathbeat vignette,
zoom scene transitions (a scene setting — the deck's scene switches already get them), the
entrance banners (DC calls `playEntrance`), region cues that play themselves (§53), the weapon
mastery reminder, the AoO engine, summon ownership, scribe flow (their DM halves are row 1).

### 2.2 CM helper pack — Crooked Moon content or behaviour

The deck already draws the whole Crooked Moon area MC publishes (curses, bargains, threads,
touchpoints, twists, the Druskenvald clock, tarot deal/back/cheat, set the stage, mist, fiddle,
engine, whistle, train, brakes, introduce, tickets, arrive, the ride, spirit board, sitters, d10,
the bite, the four printed séance words; 34 actions + 5 requests). So "missing" here is not keys.
It is **where the content lives** and **what the helper pack cannot yet say**:

| item | MC today | what belongs in the companion | note |
|---|---|---|---|
| The 89 **intro/entrance records** (names, subtitles, chapter, portrait paths into the book module, sounds) | `cm-entrances.js`, reached by DC via `playEntrance(key)` / `entrances()` | pack content; the banner engine stays in MC | DC's intro keys already bind by key — they survive the move untouched |
| **Druskenvald hours** (six named blocks, darkness, sky) | `preset.js` + `druskenvald.js`; **copied** into DC `druskclock.js` | pack vocabulary; the "named time band" mechanism is core | DC's copy is the one CM literal in its runtime (agnosticism audit §3a); it goes when a pack can supply hour bands. HELPER has no node for it — ledger 156 |
| **Tarot** — the 22 cards, the book's art path, the reward table UUID | `tarot.js` (engine generic, data inline) | pack: cards + rewards; engine core | the audit's "cheapest high-value seam" |
| **Chaotic curses** — MC's own 100-entry list, the 10/20/30-minute band, the `curseTable` override | `cm-curses.js` | mechanism = a generic timed affliction (core); the list and the band = pack | the curse *table* the DM points at is already his content |
| **Fateweaving** threads (13) and the six touchpoints with fixed rewards | `fateweaving.js` | pack data; the tracker is core | `applyFateReward` branches on step number — engine work in MC, not DC's |
| **Twists of Fate** | `twists.js` | **core** — nothing CM-specific in it (audit §2b) | a generic "next d20 is forced" mechanism any campaign can use |
| **The Ghostlight**: station, arrival sequence, tickets, the ride's mist tiles, the door wiring, scene chain `10.1…10.8` | `cm-boarding.js`, `cm-train.js` | pack (scene chain, art, cues); the follow/teleport engine is core | `cm-train.js` reads a fixed `GRID = 140` — an MC bug the audit flagged |
| **Séance board** + the escalation ladder, sitters, the bite | `seance.js`, `cm-live.js` | pack (board art, ladder numbers); the planchette-spells-a-phrase engine is generic | DC ledger 158's twelve canned answers need a `do` kind that carries an argument — **HELPER §5 has none** |
| **Region cue sets / door sets** for the Crooked House (§53) | `cue-sets.js` — the DM's own audio-library paths | not shippable as-is (his files); the *rules* (`cue-rules.js`) are core | a pack's cue sets need the `cueSets` contribution MC's `packs.js` already defines |
| **Boss intro configs** for CM bosses | the `bosses` setting | pack content (which boss, which track); the intro engine is core | |
| **DC's own CM-tuned heuristics** — `notesFor` (`<strong>` sections), `splitRoomName` ("H5: Music Room"), `bioImage`/`artFor` | in DC's runtime | authored pack fields instead (HELPER §0.2 lists them as "on the table") | this is the DC side of the same sorting |

**The one structural finding for the helper:** DC consumes MC's `cm.*` actions *generically*
through the Table drawer, but a **pack cannot reference an MC action as a kit verb** — HELPER §5's
`do` kinds are sound / activity / routine / journal / camera / combat / tile / scene / macro. So
"Kackle's kit: Roll Curse" or "the parlor: Spirit Board" today means a world macro per key.
Ledger 158 already names this. It is the field the companion needs most, and it is a contract
decision (ledger 156's shape), not a heuristic.

### 2.3 Doesn't translate — phone- or screen-shaped, or needs typing, drawing, dragging

Being honest about this bucket matters more than the others: MC is a *phone* controller with a
whole screen per player, and its best features are best *because* of that.

| MC feature | why it stays off the deck |
|---|---|
| **The entire player shell** — sheet, spells with upcast chips, inventory, attack preview, the target picker with portraits, journals, saved images with pinch-zoom, character creation wizard, downtime authoring, the Messages composer, the Character File, story journals, the pending-action bell | Player-facing; the deck is DM-only (D9). Not a gap, a boundary |
| **The marching-order 3×3** (players' shared grid; the DM's pick-up/drop mirror with red cells) | A pointer surface by design; the players fill it |
| **Route drawing**, **travel drop** (map click), **template placement by cursor**, **owned-token drag** to the map, **assign targets** (the DM targets on the map, the PC's phone follows) | Position and shape — the mouse's, and DC's ignition pattern already hands off to it |
| **Free text**: séance phrases beyond the four printed words, personal messages, a PC's arrival script, story question authoring, the set-time dialog (day/hour/minute), damage/heal amounts | Words — the mouse's. Presets are the partial (rows 11, 18) |
| **Setup and configuration**: the settings mini-app, combat-music per-PC themes (drag), boss-intro setup, fog style, seats and player colours, the card back, custom transports, the rest-activities catalog and rule authoring, wiring the train doors, membership roster/rebuild dialogs, the DM wizard | Once, with a mouse; the 2026-09-18 inventory excluded them for the same reason |
| **Live readouts that need a screen**: the roster with distances, reaction chip text, the 3×3 red cells, the Character File, the dev report, the feedback window | DC's display column carries one line; DECK.md's *"the deck is hands, the panel is eyes"* is the answer, and the `open` action (MODES §0.6) is how the deck points at them |
| **Outputs on the TV** (séance board, card table, banners, boss intro motion, fog edges, camera follow, transitions) | The deck already triggers what it can; the value is in the screen, and DC's motion measurement (DECK.md §9) says the deck cannot mirror them |

### 2.4 Exists in both — where MC's version is better (counts as missing)

| feature | DC | MC | verdict |
|---|---|---|---|
| **Camera** | `camera` verbs map / room / follow / duplicate / zoomIn / zoomOut; calls `mc.focusTokens`, `mc.displayScene`, `mc.displayGmView` — **none exist on MC**; room and zooms "not built yet" | `focusParty`, `tvFitScene`, `tvZoom`, `toggleTvManual`, per-token `noFollow`, the clearance model | MC better, and DC is not reaching it. Row 7. **S** |
| **Next turn** | `MobileCommand.endTurn({})` — silently does nothing while paused (MC-ACTIONS finding 4) | `endTurn` refuses with a reason when paused (pause guard, §2.1) | same call; the deck should show the refusal. **S** |
| **Start combat** | `combat.startCombat()` | `startCombatWithMusic` (stores the track, starts music on `combatStart`) | MC better. Row 4 |
| **Sounds** | authored boards (6 per creature, 10 per scene page), macros as keys, fade-on-stop | region cues that play themselves with rules and counts, door sets, positional `playSound`; `cues.fire / mute / reset` exposed | different jobs; both should stay. DC's fire-now keys for §53 cues were planned (ledger 150) — check they read `MobileCommand.cues` (DC's runtime today calls only `.actions` and `.clock`) |
| **Time of day** | `druskclock.js` copy, label only | the canon table + the loop that drives scene darkness + SC fallback | MC better; DC's copy should become pack data (2.2) |
| **Advantage** | a manual NORM → ADV → DIS cycle | reads AC5E's verdict without rolling | MC better as *information*; DC's cycle stays as the *ruling*. Row 10 |
| **Intros** | `action-runtime.intro` → `playEntrance` with a Show-Players fallback | the banner engine | already the right split; nothing missing |
| **Target picking** | own candidate list, range marks, RANDOM, multi | portrait list with ally/foe/neutral and range hints (phone) | equivalent for the deck's purpose; no action |
| **Pause** | on the scene root | removed from MC's panel | DC better here |

### 2.5 Summary

- **Core DC, ranked:** decision chips → party pack/unpack → roll requests + group checks → combat
  music → rest & watches → clock → camera (and fix the four wrong names) → sound/ears → split party →
  advantage verdict → quick HP → travel → pad placement → preflight/meta → presence → downtime →
  session zero → canned messages. Eighteen rows; the top three are the ones a DM would feel in the
  first session.
- **What DC can wire with no MC change:** party (all verbs), roll requests, group checks, camera,
  clock (±, next hour, apply daylight), split-party activate, summon grant, hears-through flags,
  session zero, presence, preflight/meta, placement pad, downtime ops.
- **What waits on MC publishing an area** (MC's own §52.5 list, its schedule): the four private
  chip runners (AoO fire, scribe approve, place/dismiss cast), combat music start, rest, travel
  journey, TV mute.
- **CM helper:** no missing keys; the content sits in MC's files and DC's copy of the hour table,
  and the companion needs one contract field — a `do` that names an MC action — before a pack can
  put a Crooked Moon verb in a kit.
- **Doesn't translate:** the player shell, every pointer surface, every free-text field, setup, and
  the TV outputs. Roughly half of MC by line count, and rightly so.

**The honest total:** of MC's 135 in-play DM controls, about **60 are key-shaped and general**,
about **35 are key-shaped and Crooked Moon** (already on the deck), and about **40 need a pointer,
words, or a screen** and should not be forced onto fifteen keys.
