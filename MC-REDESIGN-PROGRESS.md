# MC redesign: progress log

Brief (DM, 2026-11-25): a deep dive on Mobile Command as the sister app to Deck Command, ending in a
redesign proposal with two modes (with the deck, without the deck). Read and recommend only.

Deliverables: `MC-REDESIGN-2026-11-26.md` and `renders-redesign-2026-11-26/`.

## 2026-11-25, milestone 1: started

- Read MC's project rules and the standing-preferences memory (minimize labels, five notifications,
  players roll their own, deck is DM-facing, current scene only, no deck scene moves, icons all or
  none, the "deck reachable" rule for deck mode).
- Reading next: MC's design and UI bible, DC's rules, design, decisions and backlog.
- Inventory of every MC ability from the code is running in parallel (phone, DM panel, TV,
  settings, automatic behaviour, and what the deck already covers).
- Nothing in either repo has been changed apart from this log.

## 2026-11-25, milestone 2: inventory in (panel, settings and actions, TV and automatic, deck coverage)

What the code says, in plain terms:

1. The DM panel holds about 291 controls: a floor plus nine tabs. Rest (64) and Crooked Moon (62) are
   the heaviest. 108 settings; 31 of the visible ones have no place in MC's own settings window.
2. The deck you run (the room-tree layout) has no "Table" drawer. So the deck covers rooms,
   creatures, fights, camera, music, time, boss intro, group up, ask a roll, travel and the player
   asks. It does NOT cover rest, marching order, who the TV follows or hears, most Crooked Moon
   tools (curses, fate, twists, tarot extras, boarding, Druskenvald hour), one-player effects,
   twist and bargain requests, area-spell placement or opportunity attacks.
3. Travel can only be driven from the deck today. The panel's Travel, Draw road, Go and Stop buttons
   were removed on 2026-10-18; a DM without the deck has no button for them and is not told.
4. MC cannot tell whether the deck is reachable. It only knows whether DC is installed. The deck
   knows (service up, deck plugged in, this screen drives it) but does not publish it.
5. Eighteen automatic systems give the DM no status at all (what music was chosen and why, the mix,
   Syrinscape offline, who owns reactions, daylight, what the TV camera is doing, an intro playing).
6. Things waiting on the DM are scattered: floor chips, a list inside the Combat tab, rows inside
   two Crooked Moon drawers, a popup, and one ask that only the deck shows.

Still running: the phone inventory. Next: the old-home to new-home table, then the renders.

## 2026-11-25, milestone 3: phone inventory in, design settled, renders drawn

1. The phone: about 68 views and 238 actions behind seven icon-only tabs. A dismissed prompt cannot
   be reopened; "waiting for the DM" is a line under the move pad; settings sit at the bottom of
   the Details tab.
2. The design, in one line per surface: the deck is hands; the panel is eyes, keyboard and mouse;
   the phone is one player's hero; the TV is the picture.
3. The panel goes from nine tabs to six (Fight, Party, Stage, Time, Story, Setup), the same in both
   modes. With the deck it rests as a strip and the deck opens it where typing or dragging is
   needed. Two new always-visible things: Waiting (one queue for every ask) and On now (what is
   playing, showing and paused, and why).
4. Ten mock sheets are in `renders-redesign-2026-11-26/`, today against proposed.

## 2026-11-25, milestone 4: proposal written and committed

1. `MC-REDESIGN-2026-11-26.md`: summary, what the code says, principles, each surface per mode, the
   old-home to new-home table (nothing removed), six phases with sizes, risks, twelve things found
   on the way, ten questions with options and a pick.
2. `renders-redesign-2026-11-26/MC-REDESIGN-2026-11-26.pdf`: the summary, the ten sheets and the
   questions, sized for a phone held sideways.
3. Three of the reported defects were re-checked in the code by hand (the mislabelled auto-pause
   setting, the "Teddy returned" key that never lights, the "Arrange & lock in" button). The rest
   are as the inventory read them and are marked "read, not pressed" where that matters.
4. Not verified: that the live world runs the deck's tree layout (assumed from the 20 Nov
   inventory). Nothing was run in Foundry; no world, setting or module code was touched.
5. Waiting on the DM: the ten questions in section 8. The first one (build order) decides what
   happens next.

## 2026-11-25: PARKED (DM: "Park this after the screenshots for a more token-free time")

1. The park order arrived after milestone 4. The renders (with both size tweaks) AND the written
   proposal were already finished and committed: 6116cfa (document), da6525a (renders and PDF).
2. So nothing is left to write. All sections of `MC-REDESIGN-2026-11-26.md` exist: summary, what the
   code says, principles, each surface per mode, the old-home to new-home table, phases, risks,
   questions, render list.
3. What is left is the DM's: the ten questions in section 8 of that document. Question 1 (build
   order) decides the next step.
4. Still unverified: that the live world runs the deck's tree layout (section 2 of the document).
5. Resume here: read his answers, then start the phase he picks (my pick was phase 1, the one
   waiting queue). No further work is to be done on this until he says so.

## 2026-11-26: BUILD STARTED (DM's answers in)

Answers: 1A, 2A, 3A, 4A (the tab is "Stage"), 5A plus the Maim offer (a hero at 0 HP) joins the queue, 6A, 7
"explore sub-tabs, not sure names are needed", 8A (last), 9 "a Rest sub-drawer inside the deck's Party drawer",
10A. Tonight's order: the phone mock, the one queue and On now, the mode pill, the six sections, travel buttons
without the deck, camera fold-away with the deck.

## 2026-11-26, night 1: the phone sub-tab mock

1. New sheet `renders-redesign-2026-11-26/11-phone-act-subtabs.png`: the Act tab with an Actions / Spells
   switch at the top, shown with names and with icons only, each with the five-tab bar named and icon-only.
2. My pick, written on the sheet: names on the bottom bar, icons only on the two-way switch.
3. Nothing on the phone was changed. The phone tabs wait for his pick.

## 2026-11-26, night 1: phase 1, the one waiting queue (built)

1. **Waiting** sits on the panel floor, right under who is here. Everything that waits on you is there, in one
   order: an opportunity attack first, then crossings, "one hero went ahead", scribe, summon, an offline trade, a
   twist, a bargain (and the curse it struck, waiting on Accept), a spell a phone asked you to place, other
   modules' asks such as the Maim offer when a hero drops to 0 HP, then a party split across scenes, then the quiet
   "a player is choosing a reaction" line.
2. The first ask shows in full with its answers; the rest sit behind a "+N" button. Empty reads "Nothing waiting".
3. **The deck's Notifications key reads the same queue.** Twists, bargains and spells to place now reach it too
   (your 5A); the Maim offer was already there and is now on the panel as well. Answer at either door and both
   clear.
4. Moved out of the tabs: the Combat tab's "place spell" list and split-party line, the Twists drawer's spend
   requests, the Curses drawer's bargain requests. The twist popup still appears (as the proposal said).
5. Each ask is counted once on the deck now (twists and bargains were counted twice).
6. Tests: new `test-waiting` (20 checks); 75 suites pass.
7. For you to judge at the seat: a twist, bargain or spell now makes the deck shout for six seconds like a
   crossing does. My pick: keep it and see; if it is too loud, those three can take the quiet form.
8. Not done: the night-ambush "mark sleepers Surprised?" question is still a popup.

## 2026-11-26, night 1: phase 2, "On now" (built)

1. One line on the panel floor, under Waiting: **music · weather · hour · TV camera**. Tap it for the sheet.
2. The sheet says why, one line each: the music and the reason (the room the party is in, the fight, a cue, your
   own pick, silence), the weather, the time, the TV camera (follows the party, follows 3 of 4, spotlight in a
   fight, manual, or held by an intro), the TV's sound (live, muted, "tap the TV", or no TV reporting),
   Syrinscape (online, local files, or offline), and who handles reactions (Mobile Command or Gambit's).
3. **When the game is paused, the sheet says by what** (a boss intro, an intro, a player's ask, travel, or you
   leaving the active scene; otherwise "by you") with a Resume button. A warning that is not on the line (paused,
   TV sound, Syrinscape offline) puts a red mark on the line.
4. Nothing it reports was changed; it only reads.
5. Tests: new `test-on-now` (27 checks); 76 suites pass.

## 2026-11-26, night 1: the mode pill (built; phase 4.1, first part)

1. A pill at the right end of the presence row: **Deck** (green, compact), **No deck** (grey, full),
   **Full panel** (you opened the full panel while the deck drives), **Shrink?** (the deck came back; tap when
   your hand is free), **Deck lost** (the deck dropped; the full panel came back by itself).
2. Tap it to switch for this session. A new per-screen setting, "Run from: Auto · Deck · Panel", sets where each
   session starts. Auto stays "No deck" until Deck Command says whether the deck is reachable; the hook for that
   is ready (`MobileCommand.deck.report`), Deck Command does not call it yet.
3. Growing is automatic (one notice), shrinking is only offered, as proposed.
4. What compact hides comes with the later steps tonight (camera fold-away); on its own the pill only switches.
5. Tests: new `test-panel-mode` (15 checks); 77 suites pass.

## 2026-11-26, night 1: phase 3, the six sections, and the clean-up (built)

1. **The rail now has six sections, not nine tabs:** Fight · Party · Stage · Time · Story · Setup.
2. A section with more than one view has a small switch at its top and reopens where you left it:
   Stage = Camera · Sound · Effects; Time = Clock · Travel · Rest; Story = Story · Moon; Setup = Health · Table.
   My call, noted for him: a switch inside the section rather than one long list of drawers. It keeps each old
   tab's layout exactly as it was (the pinned buttons at the foot of Party, Rest and Camera), so nothing he knows
   moved inside its own page.
3. Moves: Players & seats → Setup › Table. Session zero, Story questions, Character files and Intros → Story
   (for every table; the Crooked Moon's own drawers are Story › Moon, behind the same switch). The table's sound
   (mute, TV volumes, who the TV hears through) → Stage › Sound. The clock (set the time, ±10 minutes) → Time ›
   Clock; its hour is in On now. New in Setup › Table: "Run from: Auto · Deck · Panel".
4. Nothing removed: all 27 drawers of the old nine tabs are still drawn, and the deck still opens any old tab or
   drawer by its old name (a moved drawer opens where it lives now).
5. Clean-up (10A): "Arrange & lock in" no longer closes the Party tab it sits in; the "Teddy returned" key now
   lights; the auto-pause setting says what it does ("Pause when you leave the active scene"); the two
   "Daylight follows the clock" switches are told apart; the setup wizard points to where per-hero themes really
   are; Roll NPCs shows once; the floor's Display button (a duplicate) and the old chip handlers with no button
   are gone.
6. Not done from the clean-up list: the phone's My Story typing being saved into the party-journal draft (a
   phone change, left for the phone phase), the unused content-pack registry, the untracked dicer-bridge.js
   (not ours to touch), and the boss list's move to Setup (it stays in Fight › Boss intro for now).
7. Tests: new `test-sections` (22 checks); 78 suites pass.

## 2026-11-26, night 1: travel buttons without the deck (built)

1. Time › Travel shows **Travel · Draw road · Go · Stop** while the panel is full (no deck driving), and only
   then (your 6A). With the deck driving it keeps the line "Driven from the deck".
2. They are the deck's own four actions, drawn from the same rows: dim with the same reason when they cannot run
   (Draw road: "form up first"), Stop only while the party walks. A press does exactly what the deck's key does.
3. Tests: new `test-nodeck-travel` (6 checks); 79 suites pass.

## 2026-11-26, night 1: the camera folds away with the deck (built)

1. While the pill reads "Deck", Frame and Manual leave the floor and Fit and Zoom leave Stage › Camera (your 3A);
   the deck's Camera key has them. "Who the TV follows" stays.
2. Stage › Camera says so in one line, "On the deck: Frame, Manual, Fit, Zoom", with Show, which brings them back
   for the session. The keys P and M still work either way.
3. Tests: new `test-camera-fold` (4 checks); 80 suites pass.
4. That ends tonight's ordered list in Mobile Command. Next: the Rest sub-drawer in Deck Command's Party drawer
   (your 9), if it fits; the campaign deck page (8A) is left for last, as you said.

## 2026-11-26, night 1: rest keys published for the deck (built, MC side)

1. Mobile Command now publishes three rest actions the deck can press: **Start rest · Pass watch · Finish**. Each
   is the panel's own rest step, so the deck and Time › Rest run one rest.
2. The watch grid stays on the panel (your 9). A rest with watches stops at "set the watches"; the same Start key
   then begins it, so three keys cover the whole rest. The size and phases are the panel's picks (long, watches by
   default); the key's sub-line says which. Cancel stays on the panel.
3. Tests: new `test-rest-actions` (9 checks); 81 suites pass.
4. Next: the Rest drawer itself, inside the deck's Party drawer (Deck Command).

## 2026-11-26, night 1: the Rest drawer on the deck (built, Deck Command)

1. The deck's Party drawer has a new door, **Rest**, after Boss intro and before the heroes (it reads
   "under way" while a rest runs). The heroes move one key along.
2. Inside: **Start rest · Pass watch · Finish**, Mobile Command's three new rest keys, each with its sub-line and
   dim with the reason when it cannot run. Start rest also brings the panel forward at Time › Rest, where the
   watch grid stays.
3. Deck Command now has a GitHub home (someone set it up since yesterday), so this was pushed there too.
4. Tests: Deck Command's new `test-rest-drawer` (4); its module suite 1671/1671.

## 2026-11-26, night 1: where it stands

Built and pushed tonight, in order: the phone sub-tab mock (sheet 11); the one Waiting queue; On now; the mode pill;
the six sections with the clean-up; travel buttons without the deck; the camera folding away with the deck; the
rest keys and the deck's Rest drawer.

Waiting on him:
1. Sheet 11: names or icons for the phone's Act switch and its bottom bar (my pick: names on the bar, icons on the
   switch). The phone tabs are not built until he picks.
2. Whether the deck's six-second shout for a twist, bargain or spell is too loud.
3. My call to put a small view switch inside Stage, Time, Story and Setup (rather than one long list of drawers).

Not started, next in line:
1. Auto for the pill: Deck Command reporting whether the deck is reachable (`MobileCommand.deck.report`). Small on
   the deck's side; left alone tonight because another session has uncommitted work in the deck's world and
   service files.
2. The deck opening the panel for every key that needs the keyboard or the map (place a spell, message a player,
   pick a curse, draw the road, marching order), and the "On the deck" stubs for the other covered groups.
3. The no-deck music picks, overall volume, time steps and the two house keys on the panel (only travel came back
   tonight, as ordered).
4. The phone (labelled tabs, Asked, Spells into Act) after his pick on sheet 11.
5. The campaign drawer on the deck (his 8A, last).
6. Left from the clean-up list: the phone's My Story typing landing in the party-journal draft; the night-ambush
   question still a popup; the boss list's move to Setup.

## 2026-11-26, night 1: the phone's named tabs (built; his pick on sheet 11)

His answer on sheet 11: "Ok, names work, I'm convinced". (Asked to slot in before the camera fold-away; that one
was already built and pushed, so this lands after it. Nothing depends on the order.)

1. The bottom bar is named, a word under every glyph: **Act · Sheet · Play · Bag · Story**, then the campaign tab
   (Moon or Ember) at the right edge. Explore is now called Play and sits dead-centre.
2. **Spells left the bar.** It is Act's second view: a switch at the top of Act, **Actions · Spells**. Act reopens
   on the view last used. A hero who casts nothing sees no switch.
3. My call, noted: the switch carries the words as well as the glyphs (my sheet-11 pick was glyphs only). At phone
   size the two halves are wide enough that the words cost nothing, and they read at a glance; that matches his
   "names work".
4. When the party is packed and a player flips to their own sheet, the Party switch now joins at the LEFT edge
   (it used to be at the right), so Play stays centred with the campaign tab on too. The packed party bar is
   named as well: Party · Order · Play · Stash · Story · Mine.
5. Nothing else on the phone changed: every roll flow, Basic and Complex, the VE trial look.
6. Not yet seen on a real phone: the seat run is the first look.
7. Tests: new `test-phone-tabs` (10 checks); 82 suites pass. UI-BIBLE §6.9 updated.

## 2026-11-26 · SEAT 37 fixes

1. **Twist popup re-opened after Keep on the deck.** Foundry 14 sends a cleared flag as a deletion marker, which the
   panel took for a new ask. The panel now reads the hero's flag as it stands after the change. Bargains have no
   popup, so they could not re-open; their line already cleared.
2. **On now.** It now refreshes the moment the music layer changes what is playing (Silence → Auto no longer sticks).
   The line is shorter so nothing is cut: the music by name, then a weather glyph and a TV-camera glyph (a short word
   only when the camera is not simply following the party: manual, nobody, 2/4, turns, held). The hour moved to the
   sheet, in minutes.
3. **Lost first clicks (pill, Form Up).** On now showed the time with seconds, so the whole panel rebuilt itself
   every second, and a click landing across a rebuild was lost. Minutes only now; with item 2 the line no longer
   changes each tick. This is the likely reason Form Up "showed nothing": its refusal notice was already wired.
4. **Form Up says why.** A member missing from the map is named under the button in one line; the refusal notice
   now reads "Can't form up: X isn't on this map."
5. **Phone at 364 px.** On a narrow phone, PAUSED moves onto the foot of the portrait, so the name keeps its row.
6. Deleted the rig's leftover `renders-redesign-2026-11-26/live/test-flyout.png`.
7. Tests: new `test-seat37` (7), plus 3 in test-waiting and 5 in test-on-now; 83 suites pass.


## 2026-11-26 · The Moon's Due

Built to the DM's approval; the full ruling is deck-command D-0205, and the design is DESIGN §61.
1. Each twist spent banks the DM one token. Cap 3, kept on the world between sessions.
2. The TV shows a quiet crescent at the bottom-left, opposite the compass, that fills by thirds. On now shows the
   count on its line, and its sheet has − / + to set it by hand.
3. Reroll: a picked NPC roll, from the deck or from the chat log's right-click. The new card stands. A roll is
   rerolled once; never a death save, Maim roll or player roll.
4. Redirect: a player's natural 1 on a weapon attack joins the one queue. The DM clicks the new target (in reach,
   above 0 HP). The player's phone gets the attack card aimed there, and that roll can't crit and spends nothing
   again.
5. Deck: a Moon's Due key in the fight drawer (Reroll · Earlier · Redirect), with the crescent of the count.
6. My calls, noted in D-0205:
   - What the first roll already did stays the DM's to adjust.
   - No Redirect offer while the bank is empty.
   - An offer lapses after 5 minutes.
   - A hidden new target is "someone unseen" in chat.
7. Tests: MC test-moons-due (37), and 2 older tests updated; 84 suites pass. Deck test-moon-drawer (5); 1676 pass.

## 2026-11-26 · SEAT 38 fixes

1. The Moon's Due: the deck's Reroll names a midi card's roll (attack / damage / save / check). midi's item card carries
   no dnd5e roll type, so the kind is read from the roll itself, midi's workflow, then the activity that made it.
2. The deck's Notifications key: its count and lit state read the one Waiting queue (MC's row now publishes its length),
   and a twist, a bargain or a spell waiting to be placed repaints the deck the moment it lands. A bargain read "none".
3. Hero Mancer: the five Battlezoo Demigods species hidden (deck-command m208, D-0208); the module stays on.
4. Tests: MC test-moons-due 38–40, test-waiting 24–26, test-ask-row; DC test-seat38 1–3. MC 84 suites, DC 1697 pass.
