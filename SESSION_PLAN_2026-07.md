# Session Battle Plan — "The Peddler's Music Box" (~1.5–2h, 2 testers)

Companion to [TEST_TASKS_2026-07.md](TEST_TASKS_2026-07.md) (task letters A–F referenced
throughout). Three scenes: **The Inn → Overworld → Cave A**. Party: 2× level-3 PCs,
each with a pet (4 tokens total). One PC has **darkvision** (species), the other buys
**tremorsense anklets** at the shop.

---

## 0. The story (depth in layers — use as much as time allows)

**Layer 1 (required, 30 seconds):** Old **Zev the Peddler** (זאב הרוכל), a retired
adventurer turned curio trader, begs the party: a band of orc scavengers — the
**Broken Fang** — raided his wagon on the mountain road and took his prize piece,
a **silver music box**. He offers **1,000 gp**: convince him (free — he's desperate)
to pay **500 up front**. The orcs hole up in a cave on **Mt. Gershom** (or whatever
the overworld map suggests).

**Layer 2 (recommended, +1 minute):** The box was his late wife's — she wrote the
melody inside it, and he can't remember it right without the box. **He hums the tune,
badly, while telling the story.** ← *Plant this. It's the key to the guard-worg (Scene
3, A3) and it rewards testers who actually listen. Also: when the box is opened in A5,
that melody IS the victory music — diegetic payoff.*

**Layer 3 (optional twist, only if pacing is great):** The shady fence in the corner,
**Dodik**, is who tipped the orcs off about Zev's wagon. He'll sell the party gear AND
(for 20 gp) "a rumor": *"the Broken Fang always keep their loot behind a hidden door —
tap the walls."* Plants the Investigation seed; the guilt reveal is a one-liner if a
tester gets suspicious of his cave knowledge.

**Why an orc band works for the test:** a boss + weak grunts = fast phone turns, easy
live rebalancing (add/remove a grunt), a worg "guard dog" is canon, and nobody needs a
statblock lecture.

---

## 1. Scene: The Inn ("The Tired Mule")

### Practical — tests woven in
| # | Setup | Test (task letter) |
|---|---|---|
| 1 | Two blank PCs pre-created, owner-assigned, tokens NOT yet placed | Char-gen from blank (A) |
| 2 | Session opens with the DM triggering **colour pick** for both | Colour system (A) |
| 3 | Char-gen → portrait gen → **"write a 2-line bio"** before leaving the table | Bio editor (A) |
| 4 | A **dropped coin purse** item pile near the door (a previous patron's mishap — 25 gp + a trinket) | First **Use** on a pile, zero instruction (B) |
| 5 | **Dodik's corner stall** = Item Piles *merchant* (stock table below) | Use → shop, buy/equip (B) |
| 6 | After Zev's pitch: *"someone should write the job down"* | Party journal (B) |
| 7 | After shopping: *"you head out together — form up"* | Pack + 3×3 arrange + pets in line (C) |
| 8 | Run `MobileCommand.fixPcTokens()` once PCs have tokens | rings/colours/sight |

### Dodik's stock (price it so 500 gp + starting gold forces *choices*)
Party funds ≈ 500 gp advance + ~50–100 gp each from char-gen.

| Item | Price | Why it's here |
|---|---|---|
| Potion of Healing ×6 | 40 gp | consumable use in combat (D) |
| Potion of Greater Healing ×2 | 150 gp | the "big buy" decision |
| **Anklets of the Listening Earth** (tremorsense 15 ft, attunement) | 120 gp | THE vision test item — Dodik: *"feel every footstep through your soles, even in pitch black"* |
| +1 weapon of choice ("fell off a wagon, don't ask") | 250 gp | OP-gear-for-testing budget sink |
| +1 shield | 200 gp | alternative sink |
| **Whistle of the Wolf-Friend** (1/day, calls a wolf for 1 hour) | 180 gp | pet #2 path for a non-caster (DM: on first blow, drag the wolf from the Players tab — tests DM drag-spawn) |
| Driftglobe | 200 gp | a *light* solution — if they buy it, that's valid play; the vision split still shows on whoever isn't holding it |
| Rope, caltrops, rations ×4, smoke bomb | 1–25 gp | mundane texture; **rations matter at A3** (dog bribe) |
| ~~Torches~~ | — | **don't stock torches**; "storm soaked the wagon" — keeps the cave dark test honest without banning light spells |

**Tremorsense item build:** Equipment/wondrous item → Active Effect →
key `system.attributes.senses.ranges.tremorsense` · mode **Upgrade** · value **15** ·
transfers on equip. (Verified against installed dnd5e 5.3.3; the token *applies* it at
the cave **disperse** — that's automatic in the session flow.)

### Flavor
- **Audio:** tavern loop (Tabletop Audio "Dockside Tavern" or Michael Ghelfi's free
  tavern packs — download the file, local playlist, loop, ~40% volume) + a separate
  **rain-on-roof + distant thunder** loop under it (~25%). Two stacked playlists sell
  "cozy inside, storm outside" with zero visuals.
- **Lighting:** darkness ~0.35; a big **flickering hearth light** (orange, animation
  "Torch" flicker) + candle lights on tables. The Torch module handles PC-carried
  lights later if needed.
- **Zev:** grey beard, patched coat, keeps polishing a spot on the table where the box
  used to sit during his pitch. Hums the melody off-key (Layer 2!).
- **Dodik:** too-nice boots, calls everyone "friend."

---

## 2. Scene: Overworld (travel map)

### Practical — tests woven in
| # | Setup | Test |
|---|---|---|
| 1 | **Pre-place a group token** at the inn marker (or drag the group actor onto the scene when they leave) | cross-scene pack seam — **pre-test this before the session** |
| 2 | Set the **group actor's travel pace** (land speed) on its sheet — the native sheet does NOT derive it | pace widget (C) |
| 3 | March order locked → travel pad drive toward the mountain | travel + auto-facing + TV follow (C) |
| 4 | Halfway: *"the storm gets too fierce — make camp"* → **short rest** at a campfire pin | rest-permission guard + HD (D) |
| 5 | **Optional warm-up: 2 wolves (CR ¼ each) prowl the camp.** Strongly recommended: a tiny tutorial combat BEFORE the big one teaches the combat UI when stakes are low, and gives the short rest real HP to restore. Cut it if running late. | first combat loop, low stakes |
| 6 | Back on the road: *"do you notice anything?"* → **group Perception** → worg pawprints + drag-marks (foreshadows A3 + the stolen crate) | group check (C) |
| 7 | At the cave mouth marker → DM activates Cave A | scene transition #2 |

### Flavor
- **Weather:** Scene Config → Ambience → Weather: **Rain** (core effect — free and it
  reads instantly on the TV). Wind + rain audio loop; occasional thunder.
- **Thunder flash (optional flair, TEST BEFORE SESSION):** hotbar macro — briefly drop
  scene darkness then restore, with a thunder sound:
  ```js
  const s = canvas.scene; const d = s.environment.darknessLevel;
  await s.update({ "environment.darknessLevel": Math.max(0, d - 0.3) });
  setTimeout(() => s.update({ "environment.darknessLevel": d }), 400);
  foundry.audio.AudioHelper.play({ src: "audio/thunder.ogg", volume: 0.8 }, true);
  ```
  If it misbehaves on your build, skip it — thunder audio alone is 90% of the effect.
- **Mist on the mountain:** you have **animated-mist-and-fog** installed — a light mist
  layer near the cave marker sells altitude. tile-scroll can drift a cloud tile if you
  want motion.
- The campfire rest is the natural **bio-note moment** if the pit trap hasn't happened
  yet — otherwise save the scar prompt for after the trap.

---

## 3. Scene: Cave A (the Kobold Lair, re-dressed)

Overall: darkness **1.0**, no ambient light except the A4 campfire. This is where the
**vision split** pays off — ask each tester *"what do you see?"* and let them compare
(darkvision = grey terrain; tremorsense = black map, creature blips ≤15 ft).

### Entrance — the pit trap
- **MATT tile** over the pit square, trigger **On Enter**: stop movement, chat flavor
  (*"the floor cracks—"*), play a rumble/crash sound.
- Then the **DM's D20 dock: request DEX saves** from whoever's on/adjacent — this
  deliberately uses OUR roll-request tool instead of MATT's built-in roll (which would
  need Tokenbar). Failers take **2d6** (apply to HP), climb out at half speed.
- **Pre-test the tile fires on pad-driven movement** — executor moves the token doc;
  MATT should trigger, but it's never been verified. If it doesn't fire, fall back to
  DM-manual ("as you step in—") and log it as a finding.
- After the trap: *"that gash above your eye is going to scar — add it to your bio."* (A)

### A3 — the guard-worg "Fang"
One **worg** (CR ½ — AC 13, HP 26, keen hearing/smell, passive Perception 14),
sleeping near the passage to A4, one ear up.

Resolution paths (don't hint — see what they try):
1. **Sneak past:** group **Stealth** (Explore button) vs DC 13. Success = it never
   stirs. This is the headline group-check test.
2. **Bribe:** rations + **Animal Handling DC 12** → Fang eats, tail thumps, ignores them.
3. **The melody (Layer-2 payoff):** if anyone hums Zev's tune — auto-success. Fang's
   ears drop, it whines and settles. (The orc boss keeps the box because the worg
   loves the tune. No roll needed; pure listening reward.)
4. **Violence:** one round of noise-free kill needs the drop on it (surprise + burst);
   otherwise it **howls** → A4 is alerted.
5. **Scout option:** releasing a pet/PC to peek into A3 first (scout release/combine,
   task C) is exactly what reveals the worg instead of stumbling into it.

**Consequences:** silenced/passed → the party ambushes A4 (**surprise round**).
Howl → A4 orcs are up, weapons drawn, spread behind cover, and the boss kicks the
campfire down to embers (dim light only — nastier for the no-darkvision tester). Both
branches are fun; neither is a fail state.

### A4 — the big fight (campfire centerpiece)
**Battlefield dressing:** central **campfire** (bright 20/dim 40 animated flame light +
crackle loop), log benches (half cover / difficult terrain), two bedrolls, a cook-pot
tripod, and **Zev's pried-open crate** visibly spilling trade goods (the box is NOT in
it — seed for "so where's the good stuff?" → Investigation).

**Enemy composition — party = 2× L3 + 2 pets + OP gear ⇒ budget as ~3 PCs (L3):**
XP thresholds ×3 PCs: Medium 450 · Hard 675 · Deadly 1200 (adjusted). Target the fight
at **adjusted ~700–950** — hard, memorable, not lethal-by-math.

| Option | Composition | Raw XP | Adjusted | Feel |
|---|---|---|---|---|
| **Recommended** | **Orog "Karg Bonecarver"** (CR 2) + 2× orc (CR ½) | 650 | ×1.5 ≈ 975 | spicy-hard; right with surprise or OP gear |
| Softer | Orc Eye of Gruumsh (CR 2, caster — flashy spells for the TV) + 2× CR ¼ | 550 | ≈ 825 | more visual, less HP wall |
| If they blew the stealth | drop one grunt from either option | −100 | ≈ 700–750 | compensates for losing surprise |
| Your own monsters | 1× **CR 2–3 boss** + 2× **CR ¼–½ grunts**; avoid 4+ bodies (multiplier) and any save-or-die | — | — | same skeleton, reskin freely |

**Live-balance levers (decide mid-fight, don't pre-commit):**
- Too easy → **2 orcs return from patrol** at the top of round 3 (also tests
  mid-combat combatant adds).
- Too hard → Karg spends a round dragging the music box out to gloat / bellowing
  threats (skips attacks); or a grunt flees.
- **Death-save test:** have something target a **pet** until it drops — the death-save
  screen has never seen live play. A pet at 0 is drama, not tragedy.
- **Condition test:** give one orc a **net** (restrained, DC 10 escape) or have Karg
  **shove prone** — then tell the afflicted tester: *"tap the condition and see what
  it does."* (D)
- **Campfire hazard:** first creature shoved into the fire takes 1d6 — players will
  invent this themselves the moment they see fire + shove.
- **Summon moment:** before or during — *"you've got that whistle/familiar, use it."*
  (summon flow / DM drag-spawn, task D)
- Short rest AFTER the fight if they're hurting and didn't camp-rest (HD test backup).

### A4→A5 — the secret door
- Change the A4/A5 door to **Secret** (players can't see it at all).
- Breadcrumbs: the crate is empty of valuables; drag-marks in the dirt end at the wall
  (auto-notice on entering A4 post-fight); Dodik's rumor if bought.
- *"The wall looks odd — check it"* → **DM D20 dock: request Investigation** (E).
  Success (DC 12) → DM edits the wall: Secret → regular door. It pops into view on
  every screen — great TV moment — then: *"open it"* → **Use** (E).

### A5 — treasure & payoff
- **Item pile:** the **silver music box** (the MacGuffin — make it an actual item so
  someone carries it), 350 gp in mixed coin, 2 gems (50 gp ea), one fun magic item as
  a bonus (whatever fits the PCs — a +1 dagger, a cloak, your call), and a healing
  potion (poetic if they're at 1 HP).
- Someone will open the box. When they do → **victory playlist** (the melody). If you
  want it automatic: a MATT tile on the A5 pile square, trigger On Enter → play sound
  (second tile-trigger test); manual playlist click is equally fine.
- Wrap-up prompt: *"write the ending in the party journal"* — closes the loop and
  tests the journal once more with a full session behind it.

### Cave flavor
- **Audio:** cave drips + low wind loop (~30%); campfire crackle as a **local ambient
  sound** on the A4 fire (radius ~30) so it swells as they approach — that's a nice
  headphone/TV moment; combat track when initiative rolls; the melody for A5.
- **Mist:** animated-mist-and-fog, thin layer at the entrance only (storm blowing in) —
  keep the deep cave clean so the vision split reads clearly on the TV.
- **monks-bloodsplats** is installed — it'll decorate the fight for free.

---

## 4. Run order & clock (95-minute plan, 2h ceiling)

| Clock | Beat | Key tests |
|---|---|---|
| 0:00–0:05 | Seats, phones in, colour picks | colour |
| 0:05–0:35 | Char-gen + portraits + 2-line bios | A |
| 0:35–0:50 | Zev's pitch (hum!), journal note, purse pile, shopping | B, Use |
| 0:50–0:55 | Form up, marching order (pets in line), head out | C, multi-token |
| 0:55–1:10 | Overworld: travel, camp + short rest, (optional wolves), group Perception | C, D-lite |
| 1:10–1:15 | Cave arrival, disperse at entrance, **vision split moment** | senses |
| 1:15–1:20 | Pit trap → DEX saves → scar bio note | trap, dock, A |
| 1:20–1:25 | A3: scout + the worg problem | scout, group Stealth |
| 1:25–1:45 | A4: the big fight (+ net/prone, pet down, summon, reinforcements lever) | D |
| 1:45–1:55 | Investigation → secret door → Use → treasure → music box | E |
| 1:55–2:00 | Journal epilogue, Zev payoff, debrief while it's fresh | F |

**If running >20 min late by the cave:** cut the optional wolves (already done by
then), skip the A3 bribe theatrics (let one Stealth roll decide), and trim A4 to
boss + 1 grunt.

---

## 5. DM prep checklist (before game day)

**Module/system config**
- [ ] Hard-reload ALL clients (executor owes reloads back to v0.1.69; phones to v0.1.77).
- [ ] Smoke-test **Use**: single door / door+pile / empty square.
- [ ] **Cross-scene pack pre-test** (10 min): pack on Inn → activate Overworld with a
      group token → phones follow → travel → activate Cave → disperse. The single
      riskiest seam in the plan.
- [ ] **Pit-trap MATT tile pre-test** with a pad-driven move.
- [ ] Group actor: set land travel pace.
- [ ] `MobileCommand.syncPartyTokenSight()` after any manual token placement.

**Content**
- [ ] 2 blank PCs, owner-assigned. Pets: 2 actors (wolf/cat/whatever), owner-assigned
      to their players (ownership = the multi-token test).
- [ ] Dodik's merchant pile stocked per table (build the **anklets** with the AE key
      `system.attributes.senses.ranges.tremorsense` = 15, Upgrade, on-equip).
- [ ] Coin-purse pile at the inn door; treasure pile in A5 (music box item inside).
- [ ] A4/A5 door → **Secret**. Campfire light + crackle in A4. Worg in A3 (asleep).
- [ ] Boss + grunts placed in A4; 2 patrol orcs staged off-room (reinforcements lever).
- [ ] Playlists downloaded LOCAL (don't stream): tavern, rain+thunder, wilderness,
      cave drips, combat, **the melody** (music-box track = victory). Loop flags on
      ambients, not on the melody.
- [ ] Weather: Rain on Overworld; darkness 1.0 in cave, 0.35 inn.
- [ ] Craig invited to the Discord server; one dry-run `/join`→`/leave`→download done.
- [ ] Testers briefed: being recorded; screenshot anything weird.

**Печать / print-or-pin for the table (DM side)**
- [ ] [TEST_TASKS_2026-07.md](TEST_TASKS_2026-07.md) open for live ticking.
- [ ] The three live-balance levers (patrol orcs / gloat round / pet-target).
- [ ] The melody hum at the inn. Don't forget to hum.
