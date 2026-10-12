# Deck mode — what the DM panel stops showing

One world setting, two values. **Panel** = today, nothing changes. **Deck** = the panel drops the
controls the deck already covers.

Verified by running MC's published action list and reading DC's current code — not by assuming.
Your rulings of 2026-10-13 are applied: **camera stays, the whole Party tab stays.**

---

## A. Considered for removal — 61 controls, 3 tabs

### 1. Crooked Moon tab — all of it except one field

Checked by running the list: **38 Crooked Moon actions publish to the deck.** Your doubt was
reasonable and the answer is yes, including the ones you named.

1.1. **Tarot** — deal a card, set their next card, take a card back.
1.2. **Fate** — threads per character, touchpoints.
1.3. **Twists** — adjust, disarm, and the spend/keep requests.
1.4. **Curses** — curse who, how long, roll, accept, never mind, lift.
1.5. **Séance** — spirit board, who's at the board, ask d10, the bite.
1.6. **All aboard** — set stage, mist, fiddle, engine, whistle, train, brakes.
1.7. **Boarding** — introduce, arrive for, tickets, all tickets.
1.8. **Druskenvald** — next hour, mark this map.
1.9. **The house** — teddy returned, weasels in the walls. **Intros** — 94 entrances, plus stop.
1.10. **The ride** — start ride.

**Staying from this tab:** the séance **phrase field**. The deck can only offer 4 preset words; the
panel types anything. **Pick-a-curse** also stays — it is 100 choices, which is ten deck pages
against one dropdown.

### 2. Effects tab — all 20 effects

2.1. **Weather** — rain, downpour, snow, blizzard, fog, leaves, night, heat haze, dust storm, storm.
2.2. **Moments** — lightning, doom bell.
2.3. **Visions** — rainbow, invert, dreamy, drained.
2.4. **One player** — heartbeat, woozy, static, stop all player effects.

**Staying from this tab:** the **loudness sliders**. They are a mix, not a press. ⚠️ They would be
left on a tab whose buttons have gone — better moved in with the sound sliders.

### 3. Combat tab — 5 controls

3.1. Start combat.
3.2. Next turn.
3.3. End combat.
3.4. Roll NPC initiative.
3.5. Battle music, before the fight starts.

**Staying from this tab:** previous turn, the split-party chip, boss intro, pending cast
place/dismiss, and request a save or check. See B2, B3 and B5.

---

## B. Staying, and why it matters

### 4. Party tab — all 19 controls (your ruling)

4.1. You want party order, so group up and ungroup stay with it, and so does the rest of the tab.
4.2. ⚠️ **And there is a hard reason beyond preference.** MC's Basic tier already hides the packed
party, marching order, staging, the stash and the downtime board from every phone, and its own rule
is *"the DM is never gated — everything hidden here stays on the DM panel."* You start the campaign
in Basic. Deck mode removing those from the panel too would make them reachable by nobody.
4.3. **The rule that follows:** anything Basic hides from phones stays on the panel regardless of
deck mode. That covers party order, the stash, the downtime board and travel squares.

### 5. Camera and display — all 7 controls (your ruling)

5.1. The Display tab: follow a character, follow all/none, fit, zoom in, zoom out.
5.2. The floor chips: focus party, manual TV.

### 6. Everything with no deck route at all — 41 controls

6.1. **Rest** — the whole flow: start, watch grid, watches, pass, finish, cancel, activities, push,
     tick, progress, give task. Thirteen controls, nothing published.
6.2. **Travel** — pace, start, stop, clear, draw from party.
6.3. **Sound** — mute the table, the three mix levels, who the display hears through.
6.4. **Clock** — set the time, ±10 minutes.
6.5. **Damage and healing by amount** — needs a number typed.
6.6. **The player-request chips** — opportunity attack, scribe, summon, trade. Eight controls, all
     transient, none reachable from the deck.
6.7. **Session zero** — the card table, begin the opening.
6.8. **Story questions** — send one, push a random one.
6.9. **Private message to a player** — free text.
6.10. **Colour palette per character**, and the owned-token thumbnails (drag to place, double-click
      to open).

### 7. Kept against the obvious call — 3 controls

7.1. **Previous turn.** You retired the deck key, so the panel is its only route. The underlying verb
     still works, so it is one key away if you want it back on the deck instead.
7.2. **Create party, and add characters to a group.** The deck does *not* do these — its "New party"
     key answers "No group, make one", and "Add to party" only opens the sheet.
7.3. **Boss intro.** One press, easily published — but a once-a-campaign beat you will be at the
     screen for anyway.

### 8. Now forbidden rather than uncovered — your call, 2 controls

8.1. **Split-party chip → activate that scene.**
8.2. **Travel "switch map" with a destination list.**
Both are cross-scene, which you ruled out on 2026-10-12. Not deck gaps to close — controls to
reconsider on both surfaces.

---

## C. Two things not to break

9.1. **The published list must keep publishing.** The deck draws its Table pages *from* it. Deck mode
     hides panel buttons only; it must never remove an action.
9.2. **Deck mode and Basic/Complex are different axes.** Basic/Complex is about what players may do
     on their phones. Deck mode is about which screen *you* use. Neither should read the other, and
     4.3 is the one place they interact.

---

## D. What exists

Built and tested: the mode's policy, 29 checks passing (`node tools/test-deck-mode.mjs`). Three of
them exist only to stop 7.1 and 7.2 ever being added to the removal list.

Not built: the wiring. The panel does not read the setting yet, so throwing it changes nothing. That
is deliberate — your decisions below set the list, and wiring before them means doing it twice.

## E. Your decisions

Say which of 1.1–3.5 you want gone. Everything in section B stays unless you say otherwise.
