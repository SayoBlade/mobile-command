# Mobile Command redesign proposal (2026-11-26)

Asked by the DM, 2026-11-25: a deep dive on MC as the sister app to Deck Command, with two clear
modes, WITH the deck (the priority) and WITHOUT. All abilities stay; grouping and UX are open.

This is a proposal. Nothing in either module was changed. Renders are in
`renders-redesign-2026-11-26/` (ten sheets, listed in section 9).

---

## 1. Summary

1. **One job per surface.** The deck is hands. The DM panel is eyes, keyboard and mouse. The phone is
   one player's own hero. The TV is the shared picture. (Your line, 8 Sep: "the deck is hands, MC's
   panel is eyes.")
2. **The panel goes from nine tabs to six, in both modes:** Fight · Party · Stage · Time · Story ·
   Setup. Same six, same order, with or without the deck.
3. **With the deck the panel stops being a place you operate.** It rests as a strip: who is here,
   what is waiting, what is on. The deck opens it at the right spot when a key needs typing,
   dragging or a long list.
4. **Without the deck the same six sections are all full**, and the buttons that exist only on the
   deck today come back: travel, music picks, volume, time steps.
5. **Everything waiting on you becomes one queue**, on the panel floor and on the deck's
   Notifications key. Today an ask can sit in seven different places, some inside a closed tab.
6. **"On now" is new:** one line, and one sheet behind it, that says what music is playing and why,
   what the TV is doing, and whether the game is paused by an intro. Eighteen automatic systems
   report nothing today.
7. **The mode follows whether the deck is reachable** (your rule of 13 Oct), not whether DC is
   installed. Growing back to the full panel is automatic; shrinking is offered, never done under
   your hand.
8. **Players and the TV never see the mode.** The phone gets labelled tabs and its own end of the
   queue ("Asked"); the TV gets nothing new and reports its state back to you.
9. **Why this is not October's dropped deck mode:** that one only hid buttons, and hid nothing once
   you kept Camera, Party and Combat. This one regroups first, so it pays off with no deck at all.
10. **Six phases, cheapest first.** The queue and "On now" need no regrouping and help the most with
    the deck. Ten questions for you are in section 8.

---

## 2. What the code says today

Counted from MC's code, not from the docs.

1. **The DM panel:** a floor plus nine tabs, about 291 controls. Rest has 64, Crooked Moon 62,
   Party 43, Effects 34.
2. **The phone:** about 68 views and 238 actions behind seven icon-only tabs.
3. **Settings:** 108. MC's own settings window shows 29. Thirty-one visible ones live only in
   Foundry's list: every sound and music rule, every phone switch, who handles reactions.
4. **The deck you run** (the room-tree layout) covers rooms, creatures, the whole fight, camera,
   music, pause, time steps, boss intro, group up, ask a roll, travel, and the player asks.
5. **The deck does not cover:** rest, marching order, who the TV follows or hears, most Crooked Moon
   tools, one-player effects, twist and bargain requests, placing an area spell, opportunity
   attacks. MC publishes most of these as actions, but the tree layout has no page that lists them.
   (The older "Table" page did. It was not carried over.)
6. **Travel is deck-only today.** Travel, Draw road, Go and Stop were removed from the panel on
   18 Oct. Without the deck there is no button, and nothing says so.
7. **MC cannot tell whether the deck is reachable.** The deck knows; it does not publish it.

One thing I did not verify: that your live world has the tree layout switched on. The 20 Nov
inventory matched it key for key, so I have assumed it.

---

## 3. Design principles

1. **One job per surface.** If two surfaces can do a thing, one of them owns it and the other
   points to it.
2. **Group by the moment, not by the feature.** Fight, Party, Stage (what the table sees and hears),
   Time (everything that moves the clock), Story, Setup.
3. **Same map in both modes.** The six sections never change place. A section the deck covers dims;
   it does not vanish or move. (The deck's own rule: state is a mark, never a position.)
4. **One queue for everything that waits.** Violet means "a player is waiting", on the panel, the
   deck and the phone.
5. **The deck points, the panel shows.** A key that needs words, a position or a long list brings
   the panel forward already open at that spot. (Built today for the séance; proposed for all.)
6. **Automatic things say what they are doing.** If the app chose it, "On now" names it and the
   reason, with the one control that overrides it.
7. **Nothing disappears silently.** A group the deck covers leaves a one-line stub ("On the deck:
   …") with Show. A feature that needs the other module says so.
8. **Growing is automatic, shrinking is offered.** The panel never removes a control while you are
   using it.
9. **Players and the TV never see the mode.**
10. **No new abilities.** Every new button calls something that already exists.

### Your standing preferences

Honoured:

1. **Minimise labels.** One or two words on every button; the status line is four facts, no
   sentences.
2. **Max five notifications.** A mode change is one toast. Asks are not toasts; they are the queue.
3. **Players roll their own.** Nothing here rolls for a player. The phone's "Asked" list makes the
   player's own roll easier to find.
4. **Deck is DM-facing.** So is the panel. Nothing mode-related reaches a phone or the TV.
5. **Current scene only / no deck scene moves.** No new control looks at or moves to another scene.
   Two existing controls already do and are flagged in section 7.
6. **Icons all or none.** The tab rail is all glyphs. Phone tabs are all glyph plus word.
7. **Each module works without the other and says so.** This is the reason for the without-deck
   fixes and the stubs.
8. **Loudness sliders stay on the panel** (18 Sep). **The whole Party tab stays** (13 Oct): Party
   does not fold with the deck.

Challenged (each is a question in section 8):

1. **"Camera stays on the panel" (13 Oct).** Since then the deck gained a permanent Camera key
   (13 Nov). I would fold Frame, Manual, Fit and Zoom while the deck is reachable and keep "who the
   TV follows" on the panel. Question 3.
2. **"A campaign tab does not exist on the rail for other tables"** (MC's UI bible). Story is a
   section for every table (intros, story questions, session zero, character files). The Crooked
   Moon drawers inside it stay gated by the same switch. Question 4 covers naming; say so if you
   want Story itself gated.
3. **"No travel controls" (18 Oct).** I read that as about players' phones. Bringing the four DM
   buttons back to the panel only while no deck is reachable follows your "say so when it cannot"
   rule. Question 6.

---

## 4. Each surface, per mode

### 4.1 The DM panel, with the deck (your priority)

Renders: `02`, `03`, `05`, `06`, `07`.

1. **The floor, always visible, top to bottom:**
   1.1. Who is here (the presence dots, unchanged) and the **deck pill**.
   1.2. **Waiting:** the first ask in full, the rest as a count. Fixed height, so the floor never
        jumps.
   1.3. **On now:** music · weather · hour · TV. Tap it for the full sheet.
   1.4. Damage / Heal for the selected token (needs a typed number).
2. **Gone from the floor while the deck is reachable:** Frame and Manual (the deck's Camera key),
   and the clock nudges (the deck's Time steps). Both return without the deck.
3. **The six tabs.** Fight is dimmed with a small deck mark, because the deck covers nearly all of
   it. It still opens: Previous turn, Send targets to a player and the battle track pick live there.
4. **Inside a section**, every group the deck covers is one stub line with Show. Everything else is
   as in the full panel.
5. **The deck opens the panel.** Press a key that needs the keyboard or the map and the panel comes
   forward at that drawer, field focused. Today: Séance. Proposed: place a spell, message a player,
   pick a curse, draw the road, marching order.
6. **What you will actually use the panel for with the deck:**
   6.1. Answer what the deck cannot: place a spell on the map, an opportunity attack.
   6.2. Type or drag: a séance phrase, a private message, a damage number, the marching grid, the
        watch grid, a rule for a downtime activity.
   6.3. Run a rest (no deck keys for it yet).
   6.4. Tune: who the TV follows and hears, mute, the mix, loudness.
   6.5. Campaign tools that have no key in the room you are in.
   6.6. Check "On now" when something sounds or looks wrong.
   6.7. Setup and health, before the session.

### 4.2 The DM panel, without the deck

Renders: `04`, `05`, `10`.

1. The same floor, plus **Frame** and **Manual**.
2. The same six tabs, all full. Nothing dimmed.
3. **Buttons that return or appear, each calling an existing action:**
   3.1. Time › Travel: Travel · Draw · Go · Stop.
   3.2. Time › Clock: +10 min · +1 hour · +1 night, and Set.
   3.3. Stage › Sound: Auto · Battle · Next · Silence, the moods, Louder · Quieter.
   3.4. Story › The house: Teddy returned · Weasels in the walls.
   3.5. Waiting: "one hero went ahead: Stay / Follow", and asks raised by other modules (Maim).
4. The pill reads **No deck**.

### 4.3 The six sections

Render: `05`. Full contents are in the table in section 5.

1. **Fight:** ask rolls, send targets, battle track, roll NPCs, start, turns, end, boss intro.
2. **Party:** form up, marching order, scouts, a player's tokens, message a player.
3. **Stage:** camera (who the TV follows, fit, zoom), sound (music, mute, TV volumes, hears-through,
   loudness), effects (weather, moments, visions, one player).
4. **Time:** the clock, travel, rest.
5. **Story:** intros, story questions, session zero, character files, and the campaign drawers.
6. **Setup:** health, this table, players and seats, screen, sound rules, fights, travel and time,
   campaign, all settings.

### 4.4 How a mode is chosen and switched

Render: `06`.

1. **One setting, Setup › This table › Run from: Auto · Deck · Panel.** Auto is the default.
2. **Auto** means compact while the deck is reachable: service running, deck plugged in, and this
   screen is the one driving it.
3. **The deck drops:** the full panel is back at once, on the same tabs. One toast.
4. **The deck returns:** nothing moves. The pill asks "Shrink?". You tap it when your hand is free.
5. **You want both:** tap the green pill for the full panel. It stays until you tap again or reload.
6. **What it needs:** one small addition in Deck Command (publish the status and signal a change).
   Until then the pill is a manual switch.

### 4.5 The phone, both modes

Render: `08`. The phone does not know the mode.

1. **Labelled tabs:** Act · Sheet · Play · Bag · Story, and the campaign tab at the edge. Play
   (today's Explore) keeps the centre, as your rule says.
2. **Spells fold into Act** as two views, Ready and Spellbook. A non-caster sees no switch.
3. **The bell becomes "Asked".** Everything the DM asked of you (a save, a roll, a choice, a story
   question) and everything you asked the DM (a crossing, a scribe, a twist, a bargain, a spell to
   place), each with its state. A dismissed or timed-out prompt can be reopened there.
4. **The newest ask also sits above the pad on Play**, in violet.
5. **Phone settings open from the portrait** instead of the bottom of Details.
6. **Unchanged:** every roll flow, Basic and Complex, the three ways to play, the look (the VE
   Mobile trial is its own track).

### 4.6 The TV, both modes

Render: `09`. Nothing new appears on it.

1. Unchanged: the party's view, the camera, the fight order, dice, intros, weather, the cards it
   raises itself ("Tap to enable sound", "No PCs in scene").
2. New on your side: the TV's state shows in "On now" (camera following, manual, or held by an
   intro; which card is up; sound live, muted or never tapped).
3. With the deck you drive the picture from the Camera key. Without it, from Frame and Manual on the
   floor and Stage › Camera.

### 4.7 The deck

Unchanged by this proposal. Three additions would make the with-deck mode stronger. They are Deck
Command work and are listed as phase 6:

1. Twists, bargains and "place a spell" on the Notifications key.
2. Publish whether the deck is reachable.
3. Later: keys for rest (Start · Pass Watch · Finish) and a campaign drawer.

---

## 5. Ability inventory: old home → new home

Nothing is removed. Marks in the last column:

- **D** = the deck has a key for it today, so it folds into a stub while the deck is reachable.
- **N** = a new panel button for something that exists today only as an action or on the deck.
- no mark = the same control, moved or left where it is.

### 5.1 Panel floor

| Ability | Today | New home |
|---|---|---|
| Who is here (presence dots) | Floor | Floor |
| Clock chip, set the time | Floor (hidden with Simple Calendar) | Time › Clock; the hour shows in On now |
| ±10 minutes | Floor | Time › Clock · D |
| Frame the party (P) | Floor | Floor without the deck · D |
| Manual TV (M) | Floor | Floor without the deck · D |
| Display shortcut button | Floor | Dropped as a duplicate of the Stage tab |
| Damage / amount / Heal | Floor | Floor |
| Drag, remembered position, resize | Panel chrome | Unchanged |

### 5.2 Combat tab → Fight

| Ability | Today | New home |
|---|---|---|
| Ask a save, check or initiative; who; send | Combat | Fight › Ask rolls · D |
| Distances, who has rolled | Combat | Fight › Ask rolls |
| Send targets to a player's phone | Combat (crosshair) | Fight › Ask rolls |
| Roll NPC initiative | Combat, twice | Fight, once · D |
| Battle track pick | Combat, before start | Fight, before start |
| Start combat | Combat | Fight · D |
| Next turn, End combat | Combat | Fight · D |
| Previous turn | Combat | Fight |
| Boss intro: Play | Combat › Boss intro | Fight · D |
| Boss list: add, sound, remove | Combat › Boss intro | Setup › Fights |
| Place or dismiss an area spell or summon | Combat (list) | Waiting |
| Split party notice, go to that scene | Combat (chip) | Waiting (see section 7) |

### 5.3 Party tab → Party, Story, Setup

| Ability | Today | New home |
|---|---|---|
| Form Up, Disperse | Party (foot) | Party |
| Create party, add heroes, choose members, rebuild | Party (foot) | Party |
| Marching grid, rotate, Lock In, Rearrange | Party | Party |
| Release or Combine a scout | Party | Party |
| A player's tokens: drag to map, open sheet; Group sheet | Party | Party |
| Private message to a player | Party | Party › Message |
| Ask a player to pick their colour | Party | Setup › Players & seats |
| Seats, change seat, which hero, add a player | Party › Players & seats | Setup › Players & seats |
| Card table on the TV, begin session zero, card deck, card back | Party › Session zero | Story › Session zero |
| Story questions: push, random, add, delete | Party › Story questions | Story › Story questions |
| Character files: compile, open the index | Party › Character files | Story › Character files |

### 5.4 Display, Effects, Settings › Sound → Stage

| Ability | Today | New home |
|---|---|---|
| Who the TV follows: one, solo, everyone, none | Display | Stage › Camera |
| Fit, Zoom out, Zoom in | Display | Stage › Camera · D |
| Weather ×10, Lightning | Effects › Weather | Stage › Effects |
| Doom Bell | Effects › Moments | Stage › Effects |
| Rainbow, Invert, Dreamy, Drained | Effects › Magical | Stage › Effects (named Visions, as the deck names it) |
| One player: Heartbeat, Woozy, Static, Stop all | Effects › Player | Stage › Effects |
| Loudness sliders ×8 | Effects › Loudness | Stage › Sound |
| Mute the table | Settings › Sound | Stage › Sound |
| TV volumes: music, environment, interface | Settings › Sound | Stage › Sound (marked "resets on launch") |
| Who the TV hears through | Settings › Hears through | Stage › Sound |
| TV sound status line | Settings › Sound | On now |
| Music: Auto, Battle, Next, Silence, moods | Deck only | Stage › Sound · N · D |
| Louder, Quieter (overall) | Deck only | Stage › Sound · N · D |

### 5.5 Rest, Travel, clock → Time

| Ability | Today | New home |
|---|---|---|
| Short or Long, Activities, Watches, Start Rest | Rest | Time › Rest |
| Watch grid, Begin Rest, Pass Watch, jump to a watch | Rest | Time › Rest |
| Downtime: who is doing what, Set Rule, Push, Tick, ±, Give Task, Start Activities | Rest | Time › Rest |
| Activity catalogue and the rule form | Rest › Activities | Time › Rest (you edit rules mid-rest) |
| Finish, Cancel rest | Rest | Time › Rest |
| Night ambush: mark sleepers Surprised? | A dialog | Waiting |
| Pace: Slow, Normal, Fast, a custom transport | Travel | Time › Travel |
| Route readout: book time, distance | Travel | Time › Travel |
| Travel, Draw road, Go, Stop | Deck only | Time › Travel · N · D (Travel, Go) |
| Click the map to place the party; drag to draw the road | The map | Unchanged |
| Custom transport editor | Travel | Setup › Travel & time |
| Mark this scene as a travel map; choose the travel map | Travel | Setup › Travel & time |
| +10 min, +1 hour, +1 night | Deck only | Time › Clock · N · D |

### 5.6 Crooked Moon tab → Story

Still gated by the same campaign switch.

| Ability | Today | New home |
|---|---|---|
| Intros: Play, shadow toggle, Stop Intro | Crooked Moon › Intros | Story › Intros · D where a creature key plays it |
| Curses: who, how long, roll, pick, accept, never mind, lift, Bargains on/off | Crooked Moon › Curses | Story › Curses |
| A bargain request: strike or decline | Inside the Curses drawer | Waiting |
| Fateweaving: threads, touchpoints | Crooked Moon › Fateweaving | Story › Fateweaving |
| Twists: counts, disarm | Crooked Moon › Twists | Story › Twists |
| A twist request: spend or keep | A popup, and inside the Twists drawer | Waiting (the popup stays unless you say otherwise) |
| Druskenvald: Next Hour, mark this map | Crooked Moon › Druskenvald | Story › Druskenvald |
| Tarot: Deal | Crooked Moon › Tarot | Story › Tarot · D in the room that has the key |
| Tarot: their next card, take a card back | Crooked Moon › Tarot | Story › Tarot |
| Tarot back picture | Crooked Moon › Tarot | Setup › Campaign |
| All aboard: stage, mist, fiddle, engine, whistle, train, brakes | Crooked Moon › All aboard | Story › All aboard |
| Boarding: introduce, arrival story, arrive for, tickets, all tickets | Crooked Moon › All aboard | Story › All aboard |
| Start the ride | Crooked Moon › Ghostlight | Story › Ghostlight · D |
| Wire the doors | Crooked Moon › Ghostlight | Setup › Campaign |
| Séance: board, sitters, d10, bite | Crooked Moon › Séance | Story › Séance · D (board, set words) |
| Séance: a typed phrase | Crooked Moon › Séance | Story › Séance |
| Teddy returned, Weasels in the walls | Action only, no panel button | Story › The house · N |

### 5.7 System health, Settings → Setup

| Ability | Today | New home |
|---|---|---|
| The 11 health checks and their fixes | System health | Setup › Health |
| Run again, Setup Wizard, Send feedback | System health | Setup › Health |
| All Settings | Settings | Setup |
| Per-hero combat themes | Settings › Combat music | Setup › Sound |
| Fog style, explored brightness | Settings › Fog, and the settings window | Setup › Screen (once); live status in On now |
| Crooked Moon tools on/off | Settings › Campaign | Setup › Campaign |
| In person / Online; Basic / Complex | Settings window › Display | Setup › This table |
| Run from: Auto, Deck, Panel | Does not exist | Setup › This table · N |
| The 29 settings in MC's window | Settings window, 4 pages | All Settings |
| The 31 settings only in Foundry's list | Foundry's settings | All Settings, new pages: Sound & music, Phones, Session zero |
| The setup wizard's 7 steps | Wizard | Unchanged |
| Keys: P, M, backquote, Ctrl+Shift+Alt+X | Keyboard | Unchanged |

### 5.8 Everything that waits → Waiting

| Ask | Today | New home |
|---|---|---|
| A crossing: Cancel, Move one, Move Group | Floor chip; deck | Waiting; deck |
| One hero went ahead: Stay, Follow | Deck only | Waiting · N; deck |
| Scribe a spell; a summon; an offline trade | Floor chip; deck | Waiting; deck |
| Opportunity attack: take it, let go | Floor chip | Waiting, first in line; stays off the deck |
| A player is choosing a reaction (notice) | Floor chip | Waiting, as a quiet line |
| Place an area spell or summon | Combat tab list | Waiting; deck key brings the panel forward (phase 6) |
| A twist; a bargain | Popup and drawers | Waiting; deck (phase 6) |
| Asks from other modules (Maim) | Deck only | Waiting · N; deck |
| Split party; night ambush | Combat tab; dialog | Waiting |

### 5.9 The phone

| Ability | Today | New home |
|---|---|---|
| Actions list, roll sheet, advantage, targets, damage | Actions tab | Act › Ready |
| Spell list, slots, prepare, learn | Spells tab | Act › Spellbook |
| Skills, tools, character, feats | Details tab | Sheet |
| Move pad, Use, favourites, abilities, rests | Explore tab | Play |
| Items, coins, equip, light, transfer | Equipment tab | Bag |
| Party journal, My Story | Journal tab | Story |
| Tarot card, thread, twist, curses, bargain | Crooked Moon tab | Moon tab (unchanged, at the edge) |
| Save, reaction, opportunity attack, trade, roll request, choice, story question | Cards that vanish when dismissed | The same cards, kept in Asked |
| "Waiting for the DM" on a crossing, scribe, placed spell | A line under the pad, a toast | Asked, and above the pad |
| Messages, dice tray, inspiration | Header | Header |
| Jump to another of your tokens that needs you | The bell | Inside Asked |
| Theme, full screen, feedback, tips, leave, log out | Bottom of Details | From the portrait |
| HP and temp edit, conditions, death saves, turn strip, rest strip | Header and strips | Unchanged |
| Party order, downtime board, transfers (Complex only) | As today | Unchanged |
| Character creation, level up, portrait | As today | Unchanged |

### 5.10 The TV and everything automatic

All of it stays as it is. What changes is that each gets a line in **On now**.

| System | Today's status for the DM | In On now |
|---|---|---|
| TV camera: follow, spotlight, manual, held by an intro | Only the Manual button's highlight | TV camera |
| TV cards: sound prompt, "No PCs in scene", fight order | None | TV shows |
| TV sound: live, muted, never tapped | A line inside Settings › Sound | Sound |
| Music by room and scene, combat music, a boss's second phase | None | Music, with the reason |
| The mix: launch reset, layers, overall level | None | Sound |
| Syrinscape offline, playing local files | Two passing toasts | Sound |
| Weather on, rolling storm | Lit buttons in Effects | Weather |
| Daylight from the clock, a hold or lock | None | Light |
| Druskenvald hour | Inside its drawer | Light |
| Game paused, and by what (intro, boss, travel, a crossing, you left the scene) | Passing toasts | Game, with Resume |
| An intro or boss intro playing | None | TV shows |
| The ride: running, jolts | The Start button's state | Story line, when running |
| Who handles reactions (MC or Gambit's) | None | Reactions |
| Opportunity-attack watcher on, and its mode | None | Reactions |
| Dice bridge | Silent unless it fails | Shown only when wrong |
| The DM's machine kept quiet while the TV is connected | None (your own sliders just read 0) | Sound |
| Phones: Basic or Complex, how many are here | Presence dots | Phones |
| The deck: reachable, and which screen drives | Deck Command's toasts | Deck |

Unchanged and not shown anywhere new: region sounds, the sound zone, fog edges, corpse rules,
mastery reminders, the quiet phone load, the five-per-burst rule, curse expiry, the one-time world
repairs.

---

## 6. Migration path

Sizes are rough: **S** is about one working session, **M** two to three, **L** a week of sessions.
Each phase leaves the panel usable and can stop there.

1. **Phase 1: one queue. M.**
   1.1. Every ask in section 5.8 shows in Waiting on the floor, in one order.
   1.2. Twists, bargains and pending spells also join the row the deck already reads.
   1.3. Needs no regrouping. Highest value with the deck.
2. **Phase 2: On now. M.**
   2.1. The status line on the floor and the sheet behind it.
   2.2. Start with the lines that have bitten you: paused by an intro, music and why, Syrinscape
        offline, TV sound, TV camera.
3. **Phase 3: six sections. L.**
   3.1. Regroup the nine tabs into six. The controls themselves do not change.
   3.2. Setup gathers the eight places setup lives today.
   3.3. Add the missing no-deck buttons (travel, music, volume, time steps, the house). Each is S.
   3.4. Clear the dead and duplicate items found on the way (section 7), if you agree.
4. **Phase 4: with-deck mode. M.**
   4.1. The pill as a manual switch, the stubs, and the deck opening the panel for every key that
        needs the keyboard or the map.
   4.2. Then Auto, once Deck Command publishes whether the deck is reachable (S on that side).
5. **Phase 5: the phone. M.**
   5.1. Labelled tabs and settings from the portrait: S.
   5.2. Asked, with prompts that can be reopened: M.
   5.3. Spells into Act: S, after your answer to question 7.
6. **Phase 6: on the deck (Deck Command's lane). M.**
   6.1. Twists, bargains and "place a spell" on the Notifications key.
   6.2. Rest keys and a campaign drawer, if you want them (questions 8 and 9).

---

## 7. Risks, and things found on the way

### Risks

1. **It repeats October.** If you keep everything visible with the deck, the mode again changes
   little. What is different: the regroup, the queue and On now are worth having in both modes, so
   nothing depends on the mode hiding things.
2. **The deck flickers and the panel flaps.** Avoided by the one-way rule: it grows by itself and
   shrinks only when you tap.
3. **Muscle memory.** Nine tab positions become six. One session of reaching for the wrong tab.
4. **A big rearrangement of a big file.** The panel is 5,400 lines with about 30 things repainting
   it. The 72 test suites cover behaviour, not layout. Phase 3 should go one section at a time.
5. **The deck's ask takeover gets louder.** A player's ask blacks out the deck for six seconds. With
   twists and bargains added, that happens more often. They may need the quiet form from the start.
6. **Three switches multiply.** In person / online, Basic / Complex and Run from make eight
   combinations to keep working.
7. **Only the screen that drives the deck knows it is reachable.** A second GM window would show
   "No deck". Acceptable; worth knowing.
8. **The phone's tab change lands on players mid-campaign**, and overlaps the VE Mobile look trial.
   Do them together or not at all.
9. **My assumption about the tree layout** (section 2). If your live deck still has the older Table
   page, more is covered than I have said and more would fold.

### Found on the way (not fixed; recommend only)

1. **Deck-only today, with no notice:** travel's four buttons, music picks, overall volume, time
   steps, "went ahead", Maim's ask.
2. **Two controls that reach another scene**, against "current scene only": the split-party chip
   that activates the other scene, and the Travel tab's list of every scene. I kept both (all
   abilities intact) and moved the first into Waiting. Your earlier note calls the first the one
   sanctioned case ("go to the hero in that scene").
3. **A button that does the wrong thing:** "Arrange & lock in" is wired as the Party tab's own
   open/close toggle. It sits inside that tab, so pressing it closes the tab. (Read in code, not
   pressed.)
4. **Wrong label:** the settings window calls the auto-pause "players can't act while paused". It
   pauses when you leave the active scene.
5. **A deck key that never lights:** "Teddy returned" always reports off.
6. **Stale pointers:** the Display tab's tooltip promises fog (it is in Settings); the wizard sends
   you to a "Sound" drawer for per-hero themes (they are under Combat music); two toggles are both
   labelled "Daylight follows the clock".
7. **Duplicates:** Roll NPCs twice in Combat; fog in two places; the twist request as both a popup
   and a chip.
8. **Dead code:** the stand-alone downtime head, the old "start the night" flow, six panel handlers
   and six phone handlers with no button, an unused content-pack registry, and the untracked
   `dicer-bridge.js` that nothing loads.
9. **Probable phone bug:** typing in My Story is saved into the party-journal draft.
10. **Players never see** their character file or their deeds. Not a bug; a gap worth a thought.
11. **The TV's volume sliders are overwritten at every launch** while the panel presents them as
    yours to set.
12. **Seven handlers trust any connected client** (mark a travel square, open a door, wild shape,
    and others). Low risk at a home table; noted.

---

## 8. Questions for you

Each has options and my pick. Reply with the number and the letter.

1. **What order to build in?**
   A. Queue, then On now, then the six sections, then the mode. Cheapest and most useful with the
      deck first.
   B. The six sections first, then the rest.
   C. Only the with-deck parts (queue, On now, mode); leave the nine tabs.
   **My pick: A.**

2. **How is the mode switched?**
   A. A manual pill now; Auto later, when the deck publishes whether it is reachable.
   B. Wait and ship Auto only.
   C. Manual only, for good.
   **My pick: A.** Costs nothing to try, and Auto is the same pill reading a signal.

3. **Camera with the deck.** (This changes your 13 Oct ruling.)
   A. Fold Frame, Manual, Fit and Zoom while the deck is reachable; keep "who the TV follows" on
      the panel.
   B. Keep all camera controls on the panel in both modes, as ruled.
   **My pick: A.** The Camera key has been on every deck page since 13 Nov.

4. **Name of the third section** (camera, sound, effects).
   A. Stage.
   B. Table.
   C. Screen & Sound.
   **My pick: A.** "Table" already means two other things in the app.

5. **Which asks join the deck's Notifications key?**
   A. Twists, bargains and "place a spell" (the key brings the panel forward; you click the map).
   B. Twists and bargains only.
   C. None; they stay on the panel.
   **My pick: A.** Opportunity attacks stay off the deck either way, as you ruled.

6. **Travel buttons on the panel without the deck.**
   A. Back, but only while no deck is reachable.
   B. Back always.
   C. Travel stays deck-only.
   **My pick: A.** C leaves a DM without the deck unable to travel.

7. **Phone tabs.**
   A. Fold Spells into Act (five tabs plus the campaign tab), all labelled.
   B. Keep seven tabs and only add labels.
   **My pick: A.** B is the cheap fallback and still fixes the worst part.

8. **Campaign tools on the deck** (curses, fate, twist counts, Druskenvald hour, boarding).
   A. One campaign drawer on the deck, later, in Deck Command's lane.
   B. Keys only where a room has them, as today.
   C. Panel only.
   **My pick: A, but last.** Your own aim (18 Sep) was every MC action on the deck.

9. **Rest on the deck.**
   A. Three keys later (Start · Pass Watch · Finish); the watch grid stays on the panel.
   B. Rest stays on the panel.
   **My pick: A, after phase 4.** Rest is the largest thing with no key.

10. **The dead and duplicate items in section 7.**
    A. Clear them as part of phase 3.
    B. Leave them; treat as a separate job.
    **My pick: A.** They are cheapest to remove while the panel is being regrouped.

---

## 9. Renders

All in `renders-redesign-2026-11-26/`. They are mock renders drawn with MC's own colours and the
deck's key families, with the test party; not screenshots.

1. `01-who-owns-what.png`: the four surfaces in both modes.
2. `02-fight-today-vs-with-deck.png`: the same fight, today and with the deck.
3. `03-with-deck-panel-states.png`: resting, something waits, opened by the deck, On now.
4. `04-without-deck-today-vs-proposed.png`: today's Travel tab against the proposed Time section.
5. `05-six-sections-both-modes.png`: what each section holds and what the deck takes over.
6. `06-mode-switch.png`: reachable, dropped, returned, both.
7. `07-waiting-one-queue.png`: seven places today, one queue on panel, deck and phone.
8. `08-phone-today-vs-proposed.png`: the phone's tabs and Asked.
9. `09-tv.png`: the TV, and its lines in On now.
10. `10-setup.png`: setup's eight places today, one section proposed.

Sources are in `renders-redesign-2026-11-26/src/` (`sheets*.mjs` write the pages, `render.mjs`
turns them into pictures).
