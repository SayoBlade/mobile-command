# VE Mobile's dark look, tried on Mobile Command — mockups and notes (Fable, 2026-11-13)

**Ask (DM):** "go over the mod 've mobile', check out the dark design, I'd like to try that look and feel for mc,
give me some mockups closer to that style." Design only: no code, no world, no settings were changed.

**Where everything is.** `renders-2026-11-13/`:
- `vemobile-01-explore-move.png` … `vemobile-08-waiting.png` — eight phone screens, TODAY on the left, PROPOSED on the right, 2× phone size (750 px per phone).
- `vemobile-ref-01…12.png` — reference captures of VE Mobile's own screens (its GitHub screenshots, cropped from the browser pane).
- `today-*.jpg` — today's live shell, Player4 (the Test Cleric) at 375×812; `today-prepare-render.png` is the built Prepare screen's render from 13 Nov.
- `src/` — the mockup sources (a token sheet `proposed.css`, the screen builder `build.py`). They are mockups, not module code.

---

## 1. What VE Mobile is, and what I looked at

**VE Mobile** by Silvestrae (github.com/Silvestrae/ve-mobile, Foundry package "VE Mobile", v1.2.1, Foundry 13–14, D&D5e and
PF2e) is a phone-and-tablet interface: its own layouts, bottom navigation, light and dark themes, a joystick or D-pad for
tokens, and per-class colour themes. It is **not installed** on the living-room PC (the modules folder has Mobile Command,
Mobile Companion and nothing else mobile), so there was no live tab to shoot. I read its stylesheets (`assets/ve-mobile.css`,
459 KB, and `assets/ve-style-authority.css`) through GitHub's API and captured its published screenshots.

**Its dark design, measured from the CSS, not guessed:**

| Axis | VE Mobile (dark) | Mobile Command today |
|---|---|---|
| Background | `#151313` warm near-black, with a **class-tinted glow**: a radial at the top-right and a linear wash from the top (12–22 % of the class/red accent into the bg) | `#16141a` with a radial from `#221c28`, per theme |
| Surfaces | panel `#211d1d`, raised `#292525` / `#302a29`, text `#fff7e8` (paper), muted `#cdbb9f` | panel `#211f24`, raised `#2a272e`, ink `#ece5d6`, muted `#a59b86` |
| Lines | `#393032`; dark theme cards `#665b54` (a visibly lighter edge) | `#3b3640` |
| Accents | red `#a60f2f` / bright `#cf2347` (216 uses: nav edge, outlines, brand), gold `#d7a642` (74 uses: kickers, active nav, rails), green `#8fbd52` (HP bar), blue `#69a9ec` (temp HP) | gold `#c8a44d` accent; burgundy CTA; blue only as the Save/D-pad fill |
| Radius | `--ve-radius: 14px`; pills 999 | 10 px × `--mc-round` |
| Elevation | 1 px border **plus an inset 1 px top highlight** (`rgba(255,255,255,.08–.12)`) plus `0 8px 22px rgba(0,0,0,.25)`; sheets `0 22px 58px rgba(0,0,0,.42–.55)`; **backdrop blur** on the nav, sheets and editors (42 uses) | flat panels, 1 px border; blur only on the pause veil |
| Type | **Work Sans** (variable, bundled, 361 KB) at weights 700–900; **uppercase kickers** at 0.62–0.72 rem with .07–.08 em tracking (44 uppercase labels); numbers in a condensed face (Roboto Condensed); a **serif display** (Georgia) for the character name and section titles on PF2e | Signika body; Modesto Condensed numbers; a themed title face |
| Navigation | a 66 px bottom bar of six tiles, **icon + tiny label**, active = gold icon in a rounded tile with a soft glow; the bar's top edge carries a hint of the accent | icon-only tabs, active = gold inset line on top |
| Vitals | a card: HIT POINTS / TEMP HP cells with **giant numbers** (57 / 57), a full-width green bar; a row of stat tiles (AC · Speed · Initiative · Hit dice) each with kicker, icon, number | HP 22 px in the header, AC in a small box, no bar |
| Rows | icon tile, bold name, grey sub-line, **outlined pills** for the roll modifiers (+14, MAP −5) and a chevron; section headers are gold kicker bars with a chevron | icon, name, sub; burgundy filled title bars |
| Motion | `transform 130–160 ms ease` on press; roll-result card in/out + pulse; D-pad flash; pause crossfade; reconnect spin | fades (your "fade, never cut" rule); the paused breathing band |

Reference captures: `vemobile-ref-03/04` (character + saves), `01/02` (actions), `05/06` (inventory), `07/08` (prepare), `09/10`
(spellcasting), `11/12` (the D&D5e header and vitals on a Galaxy S22).

---

## 2. What I took, and why

1. **Warm near-black surfaces with a class-tinted glow.** VE's screens feel like one object because the background, the cards
   and the nav share one warm hue and the class colour bleeds in from the top. MC already has per-class themes; the glow is the
   same idea made visible on every screen. *Why:* depth without lighter panels; the phone reads as "my character" at a glance.
2. **A vitals card under the header**, not numbers inside it: giant HP with a bar, temp, AC. *Why:* the one thing a player
   checks between turns should be readable across a table; today HP is 22 px beside a 17 px name.
3. **Kicker + number tiles** for the small stats (Init · Speed · Prof · Hit dice; Ability · Attack · DC · slots). *Why:* the
   eye finds a labelled number faster than a label-value row, and it is the same object everywhere.
4. **Section headers as gold kicker bars** (a short gold rail, the word, a count pill, a chevron) instead of filled burgundy
   bars. *Why:* the filled bars are the loudest thing on today's screens and they say nothing; VE's kickers organise without
   shouting, and gold already means "accent" in MC.
5. **Cards with a border, a top highlight and a soft shadow**; radius 14 on cards, 10 on buttons, pills for small controls.
   *Why:* VE's rows sit *in* the surface rather than *on* it; the highlight is the only thing that makes a dark card look lit.
6. **Icon + label tabs with an active tile.** *Why:* the icon-only bar is the one place a new player hesitates (the welcome card
   has to explain it); a 10 px label under each icon costs 8 px of height and removes the lesson.
7. **A segmented control** for a page's modes (Actions · Bonus · Reactions · Other; Disadvantage · Normal · Advantage).
   *Why:* VE uses it for Encounter / Exploration / Downtime; it is clearer than a row of equal buttons for mutually exclusive
   choices, and it keeps "right is forward" out of a place where it does not apply.
8. **Outlined pills for the small verbs** (Cast, Use, Take) and for request buttons. *Why:* VE's +14 / MAP pills are the most
   legible small controls on a dark phone; MC's Check / Save pair becomes the same shape.
9. **The hand in the middle of the pad.** VE puts the D-pad's centre to use; MC's onboarding already says "the hand in the move
   pad uses doors, loot and levers next to you", so the mockup puts it there, lit gold when something is in reach, and lists
   what is nearby underneath. (Today the pad's centre is blank and the Use list sits under the pad.)
10. **One modal card language** for waiting and prompts: the hourglass card and the roll sheet share the same gold edge, the
    same kicker, the same CTA. VE's sheets have a deeper shadow and a blurred veil; both are in the mockups.

**What I deliberately did not take.**
- **VE's red as brand.** 216 uses of red on VE's screens (nav edge, outlines, accent fills). In MC red means *destructive, damage,
  can't afford, bloodied* and nothing else; a red nav edge would make every screen look hurt. MC's gold stays the accent and the
  burgundy CTA stays the one committing button.
- **A coloured heart for HP.** VE's HP heart is always red; MC's HP *number* is the signal (green → amber → red). The mockup
  keeps the number's colour and makes the heart muted.
- **Work Sans and Georgia.** Signika is Foundry's own and costs nothing; VE ships 361 KB of font. The mockup keeps MC's rule
  (titles themed, numbers never) and borrows only VE's *hierarchy*: uppercase 11 px kickers at weight 800, condensed numerals,
  fewer sizes. (The mockups render with Segoe UI and Bahnschrift as stand-ins; on a phone it would be Signika and Modesto.)
- **Blur everywhere.** VE blurs 42 surfaces. The mockup blurs two (the tab bar, the veil); see the honest notes.

---

## 3. The proposed tokens

Surfaces are theme tokens (every theme retunes them through the generator); semantics are unchanged and no theme may touch
them. Hexes live on `body` and in the theme blocks only, as the bible says.

| Token | Today (tavern default) | Proposed | Note |
|---|---|---|---|
| `--mc-sunken` | `#17151b` | `#0f0d0e` | the well; also the page bottom |
| *(shell bg)* | radial `#221c28 → #16141a` | `#141214` + class glow: radial at 88 % −6 % of `color-mix(class 26 %)`, linear wash `color-mix(class 9 %)` to 52 % | the glow colour is the theme's existing material hue |
| `--mc-panel` | `#211f24` | `#1f1a1b` | one step darker, warmer |
| `--mc-panel-2` | `#2a272e` | `#2a2426` | raised / pressed |
| `--mc-edge` | `#3b3640` | `#3a3133` | hairlines |
| `--mc-edge-2` *(new)* | — | `#5a4e49` | card borders that must separate (VE's dark-theme border) |
| `--mc-ink` | `#ece5d6` | `#f4ecdd` | VE's paper warmth; 12.9:1 on panel |
| `--mc-muted` | `#a59b86` | `#c3b399` | 7.4:1 on panel (today's is 5.3:1) |
| `--mc-gold` | `#c8a44d` | unchanged | the accent, the rails, the active tab |
| `--mc-cta-*` | burgundy outline + wash | unchanged | the one committing button |
| `--mc-primary*` | the Save blue | unchanged | pad centre, Save, Use |
| `--mc-ok/-bad/-react/-warn` | | unchanged | meaning, never themed |
| `--mc-hi` *(new)* | — | `inset 0 1px 0 rgba(255,255,255,.07)` | the top highlight on every card and button |
| `--mc-shadow` *(new)* | — | `0 8px 22px rgba(0,0,0,.28)`; sheets `0 -18px 50px rgba(0,0,0,.55)` | |
| `--mc-round` | 1 (×10 px) | 1 (×14 px cards, ×10 px buttons) | pills and circles never scale |

**Type tokens.** Kicker: 11 px / 800 / .08 em / uppercase / `--mc-muted` (gold when it heads a section). Big number: Modesto
Condensed 30 px (vitals), 26 px (abilities), 22 px (tiles). Row name 15 px / 600; sub 12 px muted. Tab label 10 px / 700.
Character name: the theme's title face at 21 px. Nothing below 10 px, and 10 px only on tab labels and tile kickers.

---

## 4. Screen by screen (what the right-hand side changes)

1. **Home / Explore** (`vemobile-01`): header card with the class glow, the level medallion, the player-colour ring on the
   portrait, action-economy pips; the vitals card; MOVE with the feet-left readout and a round pad whose centre is the hand;
   NEARBY lists doors and loot with a Use pill; REST as two secondary buttons. Today's pad is square tiles with a blank centre.
2. **Act** (`vemobile-02`): search, a segmented Actions / Bonus / Reactions / Other, rows with the attack's own numbers in the
   sub-line (+5 · 1d6+3), slot pills for spells, a star for favourites, a CLASS section for Channel Divinity with its 1/1.
3. **Sheet** (`vemobile-03`): four stat tiles, a 3×2 ability grid with Check / Save pills inside each tile (proficient saves
   get a gold edge), then the skills list with the proficiency dot.
4. **Bag** (`vemobile-04`): coin pills, a weight bar, WEAPONS and ARMOR & GEAR as cards; an equipped item gets a green rail and a
   HELD / WORN pill instead of the shield toggle's colour alone.
5. **Spells** (`vemobile-05`): the Prepare Spells entry as a gold-railed card with the count and when swaps open; four tiles
   (Ability · Attack · DC · 1st slots as pips); spell rows with their cast line and a Cast pill.
6. **Prepare spells** (`vemobile-06`): the built screen in the new skin: kicker title, the prepared bar amber when over, cards
   per level, VE-style switches in MC green, Cancel left / Save Anyway right.
7. **A roll request** (`vemobile-07`): a bottom sheet over a blurred sheet: kicker, "Wisdom save" big with the DC pill, the
   source line (Haunting Whistle · the Locomotive), a Disadvantage / Normal / Advantage segment, one CTA.
8. **Waiting / paused** (`vemobile-08`): the same card as today in the new surfaces, with the PAUSED chip on the card and the
   "Browse My Sheet" button in Title Case.

---

## 5. What stays MC's meaning (checked against the bible)

- Gold = accent, next, marks, rails. Never a button fill. The active tab tile is gold *ink* on a dark tile with a gold edge.
- Green = done / on / healthy; red = destructive / damage / can't afford / bloodied; violet = reactions; amber = careful.
  The HP number and bar carry the state colour; the prepared bar goes amber when over the limit; switches are green when on.
- Player colour = identity, as the ring on the portrait. The class glow is a *surface*, not identity: it follows the theme.
- One CTA per view, burgundy outline + wash. Secondary = panel + edge. Tertiary = text. Pills for small verbs.
- Two-word Title Case labels; right is forward (Cancel left, Save Anyway right); Explore holds the centre of the tab bar;
  the attention dot on a tab; warnings, not walls; waiting is a word, never a spinner.
- Titles may be themed; numbers never are.

---

## 6. Effort to adopt

| Piece | Size | Notes |
|---|---|---|
| Surface tokens + the two new ones (`edge-2`, highlight/shadow) | S | tokens on `body`; the theme generator retunes 18 themes from its table |
| Class glow on the shell background | S | one background rule reading the theme's material hue |
| Section headers → kicker bars | S | one rule family; the burgundy bar tokens stay for the DM panel |
| Rows and cards: border + highlight + shadow, radius 14 | S | the existing `.mc-action` / `.mc-inv-row` / `.mc-spell` rules |
| Tab bar with labels and the active tile | S–M | 8 px taller; the Explore-centre and dot rules unchanged |
| Pills for request buttons and small verbs | S | Check / Save and the Cast / Use buttons |
| **Header + vitals card** | M | a restructure of the header markup: HP leaves the name row, gets its bar; AC and temp become cells |
| Stat tiles and the ability grid | M | the Details/Explore sheets re-laid; Check / Save pairs move into the tiles |
| The pad: round keys, the hand in the centre, Nearby under it | M | the Use list already exists; the centre key is new behaviour (tap = use the one thing in reach, else open the list) |
| Segmented controls (actions filter, roll mode) | M | new component; the roll sheet's adv/dis already exists as three buttons |
| Lifted Foundry dialogs re-skinned to match | M | the §7.6 token mirror does most of it |

Everything above goes through tokens and six component rules. The lesson of 2026-07-17 (134 pasted hexes) applies: the new
surfaces must land as token values, never as literals in rules, or the 18 themes split again.

---

## 7. Honest notes: what may not fit a table phone

- **Glare and contrast.** A living room with a TV is brighter than VE's screenshots assume. The proposed muted text is 7.4:1 on
  panel (better than today's 5.3:1), the kickers are 11 px at weight 800, and the big numbers are the only thing that matters at
  arm's length; those survive. VE's own 0.62 rem (≈ 10 px) kickers and its hairline borders do not: the mockup keeps 11 px as the
  floor and uses the lighter `edge-2` on cards.
- **Dashed chips** (conditions) are hard to see on warm black under glare; VE uses solid pills. Worth testing on glass; the
  mockup keeps the dash because in MC a dashed outline means "otherworldly", and a condition chip is mundane, so a solid chip may
  be right anyway.
- **Blur costs.** Backdrop blur on an old Android phone drops frames and heats the device. Two blurs (tab bar, veil) is the
  budget; VE's 42 are not.
- **Height.** Icon + label tabs and the vitals card together take about 70 px from the list. On a 812 px phone the Actions
  list shows five rows instead of six. A collapsing header (vitals fold into a one-line strip on scroll) would give it back; not
  mocked.
- **The class glow vs identity.** A table of four phones in four class tints is handsome, but the *player colour* ring is the
  identity mark and must stay the only thing that says "whose". The glow should never be the same hue as any player's colour;
  the theme generator can check that.
- **Giant HP is a two-edged sword.** It is the best thing in VE for glanceability, and it also makes a dying PC's red number
  visible to the whole table. That is probably right for your game.
- **No more decoration budget.** VE has none of MC's corner ornaments and bar patterns. The mockups keep them off; if you want
  the ornaments back they sit behind the header card at low alpha, not on it.
- **OLED black.** VE and MC both stop short of pure black; the proposed `#141214` keeps the warm family and avoids OLED smear on
  scroll. Pure black would save battery and raise contrast at the cost of the "one object" feel.

---

## 8. Questions, each with my pick

1. **Adopt the look as the new base, or as a 19th theme ("Ember dark"?)** — *Pick: the new base.* The surfaces, cards, tabs and
   vitals are structure, not flavour; the 18 themes keep their hues and ornaments on top of it.
2. **Vitals card: HP, temp and AC under the header (as mocked) or HP only, with AC staying in the header?** — *Pick: as mocked.*
   AC is the second number a player is asked for.
3. **The hand in the centre of the pad: tap uses the one thing in reach, hold opens the Nearby list; the list also stays under the
   pad?** — *Pick: yes, both.* The centre key is the fast path; the list is the explicit one.
4. **Tab labels on, always, or only until the player has used each tab once?** — *Pick: always.* Eight pixels for zero lessons.
5. **Section headers: the gold kicker bars replace the burgundy bars on the phone only, or on the DM panel too?** — *Pick: phone
   first.* The panel's burgundy bars carry its own structure; retheme it after the phone settles.
6. **Pills for Check / Save (the request pair) or keep them as the two flat buttons in the ability tile?** — *Pick: pills, equal
   width, Save in the blue family as today.*
7. **Blur budget: tab bar + veil only?** — *Pick: yes.* Measure on the oldest phone at the table before adding a third.
8. **Try it on glass first on which screen?** — *Pick: Act and the roll request*, the two screens a player holds in a fight.
