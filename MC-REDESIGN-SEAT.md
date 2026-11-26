# MC redesign: seat checks (morning run, 2026-11-26)

One section per phase. Reload the DM's screen first (the DM screen runs the actions; a stale one shows old
behaviour). Test world or a clean scene; the test party. Each step is one thing to look at.

## Phase 1: the one waiting queue

1. Reload the DM screen. Under the presence dots the floor reads "Nothing waiting".
2. A phone in Basic uses a travel square. The floor shows "<Name> · cross to <place>" with Cancel · Move <Name> ·
   Move Group; the deck's Notifications key shows the same. Press Cancel on the panel: both clear, the game
   unpauses.
3. Crooked Moon tools on. A phone asks to twist fate. The popup appears as before AND the floor shows
   "<Name> · twist: natural 20" with Keep · Spend; the deck's Notifications key lights with it. Press Keep on the
   deck: the floor line and the popup both go.
4. A phone offers a bargain. The floor shows "<Name> · bargain for a reroll" with Decline · Strike. Press Strike:
   the line becomes "<Name> · curse: <curse>" with Never mind · Roll again · Accept. Press Accept: the curse lands,
   the line goes.
5. A phone casts an area spell (or a summon). The floor shows "<Name> · place <spell>" with Dismiss · Place; the
   deck shows it too. Press Place on the panel: the template is on your cursor at the caster.
6. Raise two asks at once (two phones). The first shows; a "+1" button sits under it. Tap it: both show. Answer the
   second one: the first stays.
7. A hero drops to 0 HP (the Maim offer). The floor shows the Maim line as well as the deck. Answer it on the panel:
   the deck clears.
8. An NPC gets an opportunity attack. Its line (fist / cross) sits first, above any other ask; it never reaches the
   deck.
9. Open the Combat tab: no "place spell" list, no split-party line there any more. Move one hero's token to another
   scene: the floor shows "<Name> on <scene>" with the activate button.
10. Judge: does the deck's six-second shout for a twist, bargain or spell feel right, or too loud?

## Phase 2: On now

1. Under Waiting, one line: the music name, the weather (or "clear"), the time, and the TV camera ("follows party").
2. Tap the line. A sheet opens: Music (with why), Weather, Time, TV camera, TV sound, Syrinscape (if installed),
   Reactions. Tap the line again: it closes.
3. Walk the party into a scored room of the Crooked House. Music reads the room's track · "the party is in <room>".
4. Pick Silence on the deck's Music key. Music reads "silence · you chose silence". Back to Auto.
5. Play a boss intro. The line gets a red mark; the sheet shows "Game · paused · by <boss>'s boss intro" with
   Resume. Press Resume: the game resumes and the Game line goes.
6. Pause with the spacebar. The sheet reads "paused · by you".
7. Turn on Manual (M). TV camera reads "manual". Turn it off. Turn following off for everyone in Display: TV camera
   reads "follows nobody" in red.
8. Reload the TV and do not tap it. TV sound reads "tap the TV" in red, and the line gets the red mark.

## The mode pill

1. Reload the DM screen. At the right end of the presence row the pill reads "No deck" (grey).
2. Tap it: it reads "Deck" (green). Tap again: "No deck".
3. Configure Settings › Mobile Command › "Run from": set Deck. The pill reads "Deck" at once. Set it back to Auto.
4. Players' phones and the TV show no pill and nothing new.

## Phase 3: the six sections

1. The rail shows six icons: dice (Fight), people (Party), masks (Stage), hourglass (Time), quill (Story),
   gear (Setup). Hover each: the tooltip names it.
2. Fight: ask rolls, the encounter, boss intro, as the old Combat tab. Pick Initiative in Ask rolls: "Roll all
   NPCs" shows there, and the encounter's own "Roll NPCs" is gone until you pick Save or Check again.
3. Party: the hero tokens, Form Up at the foot; while packed, the marching order. "Arrange & lock in" (while
   arranging) opens Party and leaves it open.
4. Stage: a switch reads Camera · Sound · Effects. Camera = who the TV follows + Fit and Zoom at the foot. Sound =
   mute, the three TV volumes, who the TV hears through. Effects = as before.
5. Time: Clock · Travel · Rest. Clock: ±10 minutes and set the time (with Simple Calendar: "Open the calendar").
6. Story: Intros, Session zero, Story questions, Character files. With the Crooked Moon tools on, a second view
   "Moon" holds curses, fate, twists, Druskenvald, tarot, all aboard, the ride, séance.
7. Setup: Health · Table. Table: All Settings, Run from, Players & seats, Combat music, Fog, Campaign.
8. Open Stage, switch to Effects, close it, open Time, then Stage again: it reopens on Effects.
9. Press the séance key on the deck: Story › Moon opens at the Séance drawer.
10. The floor has no clock and no sliders button any more.
11. In the Crooked House, press "Teddy returned" on the deck: the key lights. Press again: it goes dark.

## Travel buttons without the deck

1. Pill on "No deck". Open Time › Travel: a row Travel · Draw road · Go · Stop sits at the top (Stop only while
   walking; Draw road dim until the party is formed up, its reason on hover).
2. Choose the travel map, press Travel: the party packs and you place it on the map, as the deck's Travel key does.
3. Press Draw road and drag the road on the map; press Go: the party walks and the clock runs. Press Stop: it halts,
   the game stays paused.
4. Tap the pill to "Deck": the row is gone and the line reads "Driven from the deck: Travel, Draw road, Go, Stop."

## The camera folds away with the deck

1. Pill on "Deck": the floor has no Frame / Manual buttons. Press P and M on the keyboard: they still work.
2. Open Stage › Camera: who the TV follows is there; at the foot one line "On the deck: Frame, Manual, Fit, Zoom"
   with Show. Press Show: Fit and Zoom appear there and Frame / Manual on the floor.
3. Tap the pill to "No deck": everything is back without Show. Tap it to "Deck" again: folded again.

## Rest on the deck

1. Reload the DM screen and the deck's Foundry module. Open the deck's Party drawer: after Boss intro there is a
   "Rest" key ("start, watch, finish"); the heroes follow it.
2. Open it: Start rest · Pass watch · Finish. Start rest reads "long · watches" (the panel's picks); the other two
   are dim with their reason.
3. Press Start rest: the panel comes forward at Time › Rest with the watch grid. Start rest now reads "set the
   watches, then press to begin". Set a watch on the panel; press Start rest again: the watches begin.
4. Pass watch is live: press it; the clock moves on by the watch and the next watch starts (or the morning).
5. Press Finish: the rest is applied to the party (as the panel's Finish does) and the Rest key reads
   "start, watch, finish" again.

## The phone's named tabs

1. Reload a player's phone. The bottom bar reads Act · Sheet · Play · Bag · Story (and Moon at the right with the
   Crooked Moon tools on), each with its glyph above the word. Play is in the middle.
2. Open Act on the Cleric: a switch at the top, Actions · Spells. Tap Spells: the spellbook (slots, prepare,
   learn) as the old Spells tab. Go to Bag, come back to Act: it opens on Spells.
3. Open Act on the Barbarian or the Rogue (no spells): no switch, just the actions.
4. Cast a spell from Spells and from Actions: both still work as before (the card, targets, Roll damage).
5. Form the party up (Complex). A player taps "Mine" on the party bar: their own bar shows Party at the left edge,
   Play still in the middle. Tap Party: back to the party bar (Party · Order · Play · Stash · Story · Mine).
6. Check the words are readable at arm's length and nothing is cut off on the smallest phone at the table.

## SEAT 37 fixes (2026-11-26)

1. Reload the DM screen and a player's phone. Grant the Barbarian a twist; on the phone, Moon › 20 › Twist Fate.
   The popup opens on the DM screen. Press **Keep** on the deck: the Waiting line, the deck's Notifications and the
   **popup** all go away, and the popup does not come back. Repeat with Spend from the popup itself.
2. On the phone, ask the Barbarian's bargain; on the deck, Waiting shows it. Press Keep (decline): the line goes and
   nothing re-opens.
3. On now reads music by name, then two glyphs: weather and the TV camera. Hover each: its name. No fact is cut to a
   few letters at the panel's width. Turn Manual on: the camera glyph says "manual"; Follow None: "nobody", red.
4. Deck Music → Silence: On now reads "silence". Back to **Auto**: within a second or two On now names the music
   that came back (no stale "Silence").
5. With Simple Calendar's clock running, click the deck pill once and Stage › Party › Form Up once: each answers on
   the **first** click.
6. With a group member missing from the map: under Form Up, one line "Not on this map: <names>". Press Form Up: a
   notice "Can't form up: <names> aren't on this map."
7. Phone at 364 px, game paused: the hero's whole name shows; PAUSED sits as a band across the foot of the portrait.
   On a wider phone (or the DM's browser) PAUSED is beside the name as before.


## The Moon's Due (2026-11-26)

Reload the DM screen, the TV, a player's phone and the deck's Foundry module. The Crooked Moon tools must be on.
1. TV: an empty crescent at the bottom-left. On now: a crescent with 0 on the line; in its sheet,
   "Moon's Due · 0 of 3" with − / +.
2. Grant the Barbarian two twists. On the phone, ask a twist and **Spend** it (popup, Waiting line or deck): the
   crescent fills a third, and On now reads 1. Spend the second from another door: 2. Press + twice in On now: it
   stops at 3. Reload the DM screen: still 3.
3. Make an NPC attack (any monster's attack from its sheet). On the deck, open the room's fight drawer: after Start
   fight, "Moon's Due · 3 of 3" wears a full crescent. Open it: Reroll reads "<NPC> · attack N"; Redirect is dim,
   "on a hero's natural 1".
4. Press Reroll: a new card posts ("… · rerolled, the Moon's Due"), and the count drops to 2. In chat, right-click the
   OLD card: no "Reroll: the Moon's Due" entry. Right-click the NEW one: none either.
5. Roll a death save for an NPC and a hero's attack: neither offers the right-click reroll. Right-click an NPC damage
   roll: it offers the reroll; the new damage card keeps its Apply buttons.
6. Redirect, with the game unpaused. On the Barbarian's phone, attack with a weapon until a natural 1 (or twist to 1
   first). The panel's Waiting line and the deck's Notifications show "Barbarian rolled a 1 · Moon's Due"; the
   Moon's Due key is rimmed.
7. Press Redirect. Click a creature out of reach: "Not that one: out of reach …". Click one at 0 HP: "… at 0 HP".
   Click a creature in reach: one token goes, and the chat says the blow turns toward it.
8. The Barbarian's phone shows "The Moon's Due · Attack with <weapon>", aimed at the new target. Attack: the roll
   cannot crit (a natural 20 shows as a plain 20), and no ammunition or use is spent a second time.
9. Press Redirect again on a new natural 1 and click nothing for a minute: "no target picked; the offer is back in
   Waiting". Press **Let it be**: the line goes.
10. Turn the Crooked Moon tools off: the crescent leaves the TV, and the deck drawer has no Moon's Due key.

## SEAT 38 fixes (2026-11-26)

Reload the DM screen and the deck's Foundry module (Hero Mancer's change applies on the GM reload).
1. The Moon's Due step 3 again: make a goblin's attack (its sheet, with midi's card). The deck's Reroll reads
   "<goblin> · attack N", and a damage roll reads "· damage N". Then run The Moon's Due steps 4–10 above.
2. Bargain mode on. On the phone, Moon › Request Reroll. The deck's Notifications key lights at once and reads
   "1 waiting", beside Decline / Strike. Ask a twist too: "2 waiting". Answer both: "none".
3. Hero Mancer (a player's Create Character): none of the five Demigods species (Warrior, Trickster, Genius, Seer,
   Savior) is offered. Battlezoo Ancestries: Demigods is still on in Manage Modules. A second GM reload changes nothing.

## SEAT 39 fix (2026-11-27)

Reload the DM screen (a full reload: the right-click menu is built once, as the chat log first draws).
1. Roll a fresh NPC damage roll. Right-click its chat card: "Reroll: the Moon's Due" is in the menu (with a token
   banked). Pick it: one token is spent and the roll is rerolled. Then run The Moon's Due steps 6–10 above.
