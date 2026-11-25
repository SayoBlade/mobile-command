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
