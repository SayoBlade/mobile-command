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
