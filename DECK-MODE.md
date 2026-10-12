# DECK-MODE.md — MC with a deck, and MC without one

**Written overnight 2026-10-12/13 for his review. Nothing here is built.** His ask: *"create
deck/no deck modes, deck mode doesn't duplicate any of the dc abilities, so only things I need
stay… For now I want a list of things that will be removed and the architecture created, I'll go
over the (numbered) list tomorrow and decide what I want gone and what should stay."*

The numbered rulings are §3. Read that; §1 and §2 are why the list looks the way it does.

---

## 1. The three things worth knowing before the list

### 1.1 This is the exact reverse of the September ask, and the September work makes it easy

On 2026-09-18 he said *"make sure all MC actions are duplicated in the deck, I don't need to switch
interfaces between screens."* The answer was `actions.js` — every in-play DM action published once
as plain data with a runner, so any surface can draw it. DC's Table page consumes that list and
needs no deck code when MC adds an action.

So the question "which MC controls does the deck duplicate?" already has a machine-readable answer:
**the registry is the duplication.** Anything with a registry action is on the deck by
construction. That is the removal list, and it does not need maintaining by hand.

### 1.2 ⚠️ Deck mode must hide the panel's UI and keep the registry publishing

DC's Table page is drawn *from* `MobileCommand.actions`. If deck mode removed the actions rather
than the buttons, the deck's Table page would go empty and deck mode would delete the very thing it
assumes. **Deck mode is a rendering decision in `dm-panel.js` only.** No action definition, API
surface, socket or setting changes behaviour.

### 1.3 ⚠️ MC must not detect DC — so the mode is a setting he sets, not auto-detection

The seam (DC DESIGN §7.11) is that MC never learns DC exists. Auto-enabling deck mode by checking
whether `deck-command` is active would break that in one line, and it is the kind of line that
quietly becomes load-bearing. The mode is a plain world setting with no knowledge of what is on the
other end of it.

### 1.4 The registry is only two-thirds populated, which changes what is actually covered

`AREAS` declares ten areas. Only three have any actions defined:

| Area | Registry actions | On the deck today |
|---|---|---|
| Effects | ~21 | yes, via Table |
| Crooked Moon | 34 | yes, via Table |
| Requests | ~4 | yes, via Table |
| TV, Clock & HP, Combat, Party, Rest, Travel, Sound | **0** | only where DC has its own verb |

So the deck's Table page currently lists seven empty areas. Coverage of those seven comes, where it
comes at all, from DC's own native verbs — `camera`, `sound`, `party`, `fight`, the combat pages —
not from MC. That is why the list below separates "covered by the registry" from "covered by DC
natively": the first is safe to hide, the second needs checking key by key.

---

## 2. What deck mode is

One world setting, `dmSurface`:

- **`panel` (no-deck, default)** — today's behaviour exactly. Nothing changes for a table without a
  deck, which is also every table that is not his.
- **`deck`** — the panel renders only controls not reachable from the deck, plus an explicit keep
  list.

**World-scoped, not client-scoped.** `dmScreenOverlays` is client-scoped and that has already cost
him once: it defaults off and never appears until ticked *in that browser*, which was the
2026-10-02 blocker. A DM who sets deck mode at home should not find the full panel back at the
office PC.

**The decision lives in data, not in `if`s.** Every panel control gets one field in a single
manifest:

```js
// deck-mode.js — the whole of the mode's policy, in one readable list
export const DECK_MODE = {
  "fx.*":            "hide",   // registry-covered: the deck's Table draws all of these
  "cm.*":            "hide",
  "cam.focus":       "hide",   // DC camera verb `party`
  "cam.manual":      "hide",   // DC camera verb `manual`
  "rest.*":          "keep",   // no deck route at all
  "party.grid":      "keep",   // his own ruling: placement is a screen job
  // …one line per control, and his rulings tomorrow are edits to this file
};
```

Three reasons for the manifest over scattered conditionals: his review tomorrow is editing one
list; a control added later and not listed is **visible by default**, so forgetting an entry fails
safe; and the list is diffable, so "what does deck mode hide?" is answerable by reading one file
rather than grepping a 5,367-line renderer.

**Hidden means absent, not disabled.** A greyed-out panel full of things he cannot press is worse
than a short panel. The drawer or tab disappears when everything inside it is hidden.

---

## 3. The numbered list — his rulings

**How to read a row:** what it is · where the deck covers it · my recommendation. "Registry" means
the deck already has it via the Table page. "DC native" means DC has its own verb and I have checked
it exists today. "No route" means the deck cannot do it at all right now.

### Safe to hide — the registry already publishes these (52 controls, 11 rulings)

1. **The 16 weather, moment and vision effects** — rain, downpour, snow, blizzard, fog, leaves,
   night, heat haze, dust storm, storm (10 weather toggles); lightning, doom bell (2 one-press
   moments); rainbow, invert, dreamy, drained (4 screen visions). Registry. → **hide**
2. **The three per-player screen effects** — heartbeat, woozy, static. Registry (as picks). →
   **hide**
3. **Stop all player effects.** Registry. → **hide**
4. **Crooked Moon · Intros** — introduce a PC, arrive for them. Registry. → **hide**
5. **Crooked Moon · Chaotic curses** — roll, target, minutes, pick-by-hand, accept, cancel, lift.
   Registry. → **hide**
   One note rather than an objection: "pick a curse by hand" is a pick over all **100** curses, so
   on the deck it is ten pages of ten. Workable, slower than a dropdown. It also hides itself
   automatically if you ever configure a custom curse table, in which case the panel's control
   disappears on both surfaces anyway.
6. **Crooked Moon · Fateweaving** — thread per PC, touchpoint steps. Registry. → **hide**
7. **Crooked Moon · Twists** — adjust, disarm, spend, keep. Registry (spend/keep via Requests). →
   **hide**
8. **Crooked Moon · Druskenvald clock** — next hour, mark this map. Registry. → **hide**
9. **Crooked Moon · Fated tarot** — deal, again, cheat, take back. Registry. → **hide**
10. **Crooked Moon · All aboard / the ride** — set the stage, mist, fiddle, engine sound, whistle,
    bring in the train, brakes, tickets, punch all, start the ride. Registry. → **hide**
11. **Crooked Moon · Séance** — spirit board, seats, question d10, the bite. Registry. → **hide**
    ⚠️ **Except the phrase field.** Checked: the registry's `Answer` action offers a pick over the
    fixed `SEANCE_WORDS` list, while the panel's control is **free text with send-on-Enter**. The
    deck can offer the preset words and nothing else, so hiding the panel's field would lose your
    ability to have the board say an arbitrary word — which is most of the point of a spirit board.
    → **keep the phrase field**

### Safe to hide — DC has its own verb (16 controls, 5 rulings)

12. **The whole Display tab** — follow a named PC, follow none/everyone, fit, zoom in, zoom out.
    DC native (`camera`: follow, fit, zoom). This is the cleanest removal on the list: six controls,
    complete coverage, nothing fiddly. → **hide**
13. **Focus party** (floor, bullseye) and **Manual TV** (floor, arrows). DC native (`camera`: party,
    manual). → **hide**
14. **Combat turn controls** — start combat, next turn, end combat, roll NPC initiative.
    DC native, and the dead-key defects from the September audit are fixed. ⚠️ **Previous turn you
    retired yourself on 2026-10-04** as an edge case, so the panel is its only route — see 31. →
    **hide**
15. **Battle music before the fight starts.** DC native (`battleTrack`). → **hide**
16. **Party group up / ungroup.** DC native (`party`: pack / deploy, including the "anyway" second
    press when MC warns). → **hide**
    ⚠️ **But NOT "create party (N PCs)" or "add N PCs to <group>".** I checked rather than assumed,
    and DC does not do either: its "New party" key returns *"No group · make one"*, and its "Add to
    party" key only opens the group sheet for you to do it with the mouse. Hiding MC's copy would
    leave you no way to create or populate a group at all. → **keep D4**

### Keep — no deck route exists (41 controls, 13 rulings)

17. **The whole Rest flow** — start, watch grid, begin, watch steps, pass watch, finish, cancel,
    activities, push, tick, progress, give task. Thirteen controls, registry area empty, DC has
    nothing. A multi-step flow with per-member assignment; mostly not key-shaped. → **keep**
18. **Night-ambush "mark the sleepers surprised?"** — a dialog that fires on combat start, with no
    deck route. → **keep**
19. **Travel pace** — slow / normal / fast / custom transport. → **keep**
20. **Travel start / stop / clear / draw from party.** Registry area empty. Arguably key-shaped if
    you ever want it; nothing today. → **keep**
21. **Sound mix** — the Music / Environment / Interface sliders. Fine control, not key-shaped. →
    **keep**
22. **Mute / unmute the table.** One press, no deck route today. Worth a registry action later if
    you want it. → **keep**
23. **Who the display hears through** — per-user ear routing, ignore/listen to everyone. Config. →
    **keep**
24. **Clock: set the time.** A three-field dialog, and only MC knows the re-anchor maths. → **keep**
25. **Clock: ±10 minutes.** Two steppers. Key-shaped if you want them; no route today. → **keep**
26. **Damage / heal by amount.** Needs a number. Presets would make it key-shaped (VTT Deck does
    exactly that) but nothing exists. → **keep**
27. **The reaction, scribe, summon and trade chips** — eight controls, all transient, all with no
    deck route. DC has an alert slot that nothing fills and that is currently unpressable. → **keep**
28. **Marching grid, rotate left/right, lock in / rearrange, release / combine.** Your own ruling
    (DC DESIGN §14.3): placement is a screen job, the deck hands off. → **keep**
29. **Roster and rebuild** — choose members, rebuild a stale group. Checklist UI. → **keep**
30. **Pending cast: place / summon / dismiss.** The template follows the cursor. → **keep**

### Keep — my recommendation, against the obvious call

31. **Previous turn.** You retired the deck *key* on 2026-10-04, but the verb is still wired in DC —
    so this is one drawn key away from returning, not a feature to rebuild. Still recommend keeping
    the panel's copy: you removed it from the deck deliberately, and hiding the only other route
    would turn a layout decision into a capability loss. → **keep**
32. **Boss intro play.** One press, and it would be easy to add to the registry — but it is a
    once-a-campaign beat you will be sitting at the screen for anyway. → **keep**
33. **Card table and "begin session zero".** PLAN's own line is that session zero is MC's night and
    the deck is optional. Not a deck candidate. → **keep**
34. **Story questions — send one, push a random one.** The per-question send needs the text in front
    of you. The random push is key-shaped; the pair reads better together on one surface. → **keep**
35. **Private message to a player.** Free text. → **keep**
36. **Effect loudness sliders.** The effects themselves go (ruling 1); their volumes are a mix, not
    a press, and belong with the sound sliders. → **keep**
37. **Owned-token thumbnails — drag to place, double-click to open.** Mouse by nature. → **keep**
38. **Colour palette per PC.** Setup, done once. → **keep**
39. **MC's status surface** — whether MC is live, who is connected, which client is the executor.
    Not in the September audit because it is not a play action, but deck mode makes it *more*
    important: when the deck is your only surface, the panel is where you find out why the deck has
    gone quiet. → **keep, and consider promoting it**

### Now forbidden rather than merely uncovered

40. **Split-party chip → "activate the split-party scene".** Cross-scene by nature, and your
    2026-10-12 ruling bans it. Not a deck gap to close — a control to reconsider on both surfaces.
    → **your call**
41. **Travel "switch map" with a destination select.** Same: picking another scene from a list is
    the scene-connections model you rejected. The sanctioned shape is the crossing that takes the
    tokens. → **your call**

---

## 4. What deck mode costs you on the day you switch it on

Hiding everything in §3's first two blocks removes **about 68 controls across 16 rulings**, and
leaves the panel with the rest flow, travel, the sound mix, the clock, damage/heal, the chips, party
creation and placement, and the session-zero machinery. That is a real panel, not a stub — roughly
half of what is there now, and the half that is least key-shaped.

Three honest consequences, all small:

- **Previous turn** disappears unless 31 is kept — though the verb is still wired, so one drawn key
  brings it back to the deck if you would rather have it there.
- **Effect loudness** is separated from the effects it governs: the sliders stay on a panel whose
  effect buttons have gone. Either keep both, or move the sliders into the sound drawer.
- **The Crooked Moon tab empties almost completely** — 34 of its 36 controls are registry actions.
  Worth knowing before you flip the switch, because that tab is most of your campaign's machinery
  and seeing it vanish will feel larger than it is.

---

## 5. If you want more removed than this

The fastest way to shrink the panel further is not more hiding — it is **populating the seven empty
registry areas**, because a registry action is a deck key for free and a panel button that can then
be hidden. In rough order of effort:

1. **Sound** — mute the table, and the three mix levels as step actions. Small.
2. **Clock & HP** — ±10 minutes, and damage/heal as ±N presets rather than a number field.
3. **Travel** — pace, start, stop.
4. **TV** — would duplicate DC's own camera verbs, so probably pointless.
5. **Rest** — the biggest and the least key-shaped; I would leave it.

Each one is MC-internal, publishes to any surface, and keeps the seam intact.
