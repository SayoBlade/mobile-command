# Mobile Command — UI Bible

The house style. **DESIGN.md remains the source of truth for architecture; this file is the source
of truth for how things LOOK and what each visual choice MEANS.** If code and this file disagree,
this file wins — fix the code. If a new need genuinely isn't covered here, add the rule here first,
then build to it.

Written 2026-07-16 from what the app already converged on (DM: *"we should have a design bible… and
try to live by it"*). Everything below is a rule, not a suggestion.

---

## 1. The one-app principle

Phones and the DM panel are **one product**. A player should never feel they've crossed into a
different app, and a lifted Foundry/module window should be skinned to match (§7.6). A new colour or
component must **earn** its existence by carrying meaning — not by being new.

> The test: if you can't say in one sentence what a colour/treatment *means*, don't add it.

---

## 2. Colour

### 2.1 The palette — tokens, never hexes

**Write `var(--mc-*)`. Never paste a hex into a rule.** A literal is a colour that cannot be
themed, and it will sit there staying grey while everything around it re-tints.

| Token | Use |
|---|---|
| `--mc-gold` | The **accent**. Active state, marks, edges, progress. Never a button fill (§4.2). |
| `--mc-ink` | **All names and primary text.** |
| `--mc-muted` | Hints, placeholders, disabled, inactive chevrons. |
| `--mc-panel` | The standard surface: cards, rows, controls at rest. |
| `--mc-panel-2` | Raised/pressed surface, secondary button fill. |
| `--mc-sunken` | Recessed strips and wells — a step *below* panel. |
| `--mc-edge` | Borders. |
| `--mc-primary*` | The "Save" blue family (D-pad, Use, rests). |
| `--mc-cta-*` | The one committing button (§4.2). |
| `--mc-bar-*` | Section title bars (§11.2). |
| `--mc-font-title` | Display face for titles (§11.3). |

Every one is themed. Hexes belong in **exactly two places**: the token definitions on `body`, and
the theme blocks that override them.

> **This cost us a full re-audit (2026-07-17).** A whole *parallel slate palette* — `#20222b`
> surfaces, `#313542` edges, `#2a2d38`, `#3a3f4c`, `#e8e8ec` ink — had been pasted at **134 sites**
> alongside the tokens. Tokenized things re-tinted per theme; the literals stayed blue-grey forever,
> so INIT/HIT DICE/SPEED/PROF sat cold and grey inside a warm Flame screen. The DM's words: *"I
> don't like the fact that some items change colors and some are always gray."* Nobody chose that —
> it accreted one paste at a time. **A hex in a rule is a bug.**

### 2.2 Semantic accents — these and no others

| Colour | Hex | Means | Never means |
|---|---|---|---|
| **Green** | `#3a6b4a` / `#8fd6a8` | Done, complete, "on" | "go", primary action |
| **Red** | `#7a3a35` / `#ffb4a8` | Destructive, over-budget, **can't afford** | "stop", generic warning |
| **Violet** | `#4a3f66` / `#8a6fd8` | **Reactions only** (§9) | decoration |
| **Player colour** | per-user | **Identity** — whose thing this is | status, priority |

**Blue is not in the palette.** It crept into downtime and was removed wholesale (v0.1.163–171). If
you reach for blue, you want gold.

### 2.3 The rule that keeps costing us

> **A colour is either BRAND (gold), STATE (green/red), IDENTITY (player colour), or SURFACE.
> Never invent a fifth meaning.**

**Surfaces are themed; semantics are not.** A card, a border, a control at rest all follow the
theme. HP-green, damage-red, reaction-violet and the action-economy accents stay put in every
theme — they carry *meaning*, and a player must read them the same way on every phone at the
table. If it means something, it doesn't move; if it's just a surface, it must.

---

## 3. Names and identity

**Character names are always Ink (`#ece5d6`).** Never tint a name with the player colour — many
player colours are unreadable on our dark surfaces (a real one in the test world is `#0001bf`).

Identity is carried by **the token icon and the container**, never the text:

```html
<i class="fas fa-circle-user" style="color:{playerColour}"></i>   <!-- identity -->
<span class="mc-…-name">Abzarax</span>                            <!-- ink, always -->
```

- **Icon** (`fa-circle-user`) → the player colour.
- **Card rail** (`border-left: 3px solid {playerColour}`) → the player colour.
- **Name** → ink.

This matches Request-rolls, which was right first; downtime was brought in line (v0.1.174).

**The convention is `(token icon) Name` and it holds everywhere a creature is named** — rosters,
the DM's selected-token title, downtime, request-rolls.

| Who | Icon | Icon colour | Name |
|---|---|---|---|
| **PC** | `fa-circle-user` | that player's colour | ink |
| **NPC / monster** | `fa-dragon` | the **DM's** colour | ink |

An NPC has no player, so it carries the DM's colour and a **different icon** — the icon says *what
kind of thing this is*, the colour says *whose it is* (DM 2026-07-16).

**The phone wears its player's colour as a 1px outline** around the whole shell — the one place a
player colour is allowed to bound the app, so a glance tells you whose phone you're holding.

---

## 4. Buttons — the hierarchy

Exactly four levels. Pick by **consequence**, not by how much you want it noticed.

| Level | Look | Use | Example |
|---|---|---|---|
| **Primary (CTA)** | The CTA token — `linear-gradient(var(--mc-cta-top), var(--mc-cta-bot))`, `var(--mc-cta-edge)` border, `var(--mc-cta-ink)` text, bold | The **one** action that advances the flow. **Max one per view.** | Start activities · Form up |
| **Secondary** | Panel fill, `1px` edge, ink text | Real but non-committal actions | Edit · Give a task · Rest Short/Long |
| **Tertiary** | No border, muted text, icon-led | Options that shouldn't compete | Cancel · Reopen choices · drawer chevrons |
| **Destructive** | Transparent; **red only on hover/active** | Delete/remove | ✕ on a card |

**Request buttons** (`Check` · `Save` · `Roll a…`) are a **secondary** pair: they're offered
constantly and must never shout. Same size, same fill, side by side, equal width. A request button
says what you'll roll — and, only when the DM has un-hidden the rule, its DC (§7).

**Close/dismiss** is always **`✕`**, tertiary, top-right. Never an hourglass, never a word, never
primary — a close button that looks important gets pressed by accident (DM 2026-07-13: "End" with an
hourglass read as "end the day and pass time").

**Call-to-action:** when the next step is unambiguous, say it in words on a **secondary+** button
(`✨ Set the rule`), not an icon. Icon-only buttons get missed — that exact mistake made the DM think
the panel was dead (v0.1.149).

**Disabled** states explain themselves: `Start activities — nobody's chosen yet`, not a dead button.

### 4.1 Button geometry — the rule that stops "arranged badly"

Buttons **in the same group are identical**: same height, same corner radius, same gap. Differing
sizes/gaps inside one group is a bug, not a style (DM 2026-07-16, profile tab).

| Surface | Height | Radius | Gap |
|---|---|---|---|
| Phone (touch) | **44px** min (40px only inside a dense form row) | 9–10px | **8px** |
| DM panel (mouse) | 26–34px | 7–8px | 6px |

- **A row of peers stretches equally** (`flex: 1 1 0`), never `auto` widths that make one wider
  because its label is longer.
- **Icon-only buttons are square** (44×44 phone / 26×26 DM). Never a rectangle with a lone glyph.
  - *Swatch-row exception:* in a row that **divides the full width** (the theme picker), each tile
    fills its track and may be a rounded rect. The tile is a **plate**, not a glyph — the round dot
    on it is what you read, and forcing squares leaves a ragged tail of dead space instead of an
    even row (DM 2026-07-17: "fill the row nicely … spread evenly dynamically").
- **Hug vs stretch:** a **chip that labels something** (Lvl 2, a count badge) hugs its text with
  **symmetric padding** — lopsided padding reads as a layout bug (DM 2026-07-16: the Lvl chip had
  11px right vs 6px left). A **control** in a row stretches with its peers.

### 4.2 Gold is an accent, never a button fill

**If it can be pressed, it is not filled with gold.** Gold is the loudest thing we own; on a control
it reads as a shout. Two rules follow.

**1. A CTA wears the CTA token — not gold.** The primary fill is the burgundy of the section title
bars, taken as a token so it can be tuned in one place and re-tinted per theme:

```css
background: linear-gradient(var(--mc-cta-top), var(--mc-cta-bot));
border: 1px solid var(--mc-cta-edge);
color: var(--mc-cta-ink);
```

Never re-hardcode a gradient at a call site. The gold gradient was pasted literally at ~15 sites, so
"make the buttons calmer" meant editing 15 rules and the DM rejected it **twice** (2026-07-16: *"too
harsh"*; 2026-07-17: *"still way too dominant"*, after a first attempt). A design you cannot restyle
in one edit is a design you will not restyle.

**2. An active toggle is an outline, not a block** — gold edge + gold glyph on a dark fill:

```css
/* ON */ background: var(--mc-panel-2); border-color: var(--mc-gold); color: var(--mc-gold);
```

Toggle-on states (inspiration, dice tray, favourites-edit, add-condition, follow, night-step) each
used a solid gold fill, so every toggle impersonated the view's primary.

**Small non-button indicators** (spell-slot pips, proficiency dots, an encumbrance bar, a progress
bar) keep their gold: they're marks, not controls, and read as data.

> Ration test: count the pressable gold-filled objects on screen. More than zero? All are wrong.

**The palette is defined on both roots** (`#mobile-command-shell, #mc-dm-panel`). It used to be
scoped to the shell alone, which is *why* the DM panel hardcoded literals — it could not see a single
token. If you add a token, add it there, and never paste a hex into a rule.

---

## 5. Marking state

| State | Mark | Notes |
|---|---|---|
| Needs your attention | **Gold left rail** | e.g. an activity with no rule yet |
| Complete | **Green rail** + `✓` + `.mc-done` (opacity ~.7) | Reads as finished, stays legible |
| Visible to the player | **`fa-eye`** icon | The *absence* of the eye means hidden — don't add a "hidden" icon |
| Waiting on someone | Amber text + the word (`Waiting…`) | Never a spinner |
| Progress | Gold bar + `count/target` | Bar always; numbers only if the player may see the rule |

**Never encode state in the name text.** `(dead)` on a token is a Foundry-side exception, not a
licence.

---

## 6. Layout

- **Touch targets ≥ 44px** on the phone. The DM panel may go to 26–34px (mouse).
- **Text inputs go inline in the shell**, never in a lifted popup — popups fight the mobile keyboard.
- **Drawers**: title **left**, chevron **right** and muted. Multi-open; each toggles independently.
  Collapse what the user has finished with (the catalog auto-collapses on Start).
- **Grouped forms**: sections with a gold uppercase micro-label (`PROGRESS`, `THE ROLL`); pair short
  number fields 2-across. A flat column of rows is a wall — group it.
- **Section label**: 10px, uppercase, `letter-spacing .07em`, gold, weight 800.
- The DM panel's second window is **height-capped and drag-resizable**, and grows **up** when the
  panel sits low. It must never shove the primary panel, and **the primary panel's height is the
  second window's minimum** — a floating tab smaller than its parent reads as broken.

### 6.1 A header must never look like an item

A drawer/section header and a list item **must differ in height by ≥8px**. They were 48px vs a 46px
action row and read as a broken item (DM 2026-07-16).

| Element | Height |
|---|---|
| Action/list item (phone) | 46–48px |
| **Drawer header** | **~36px** |
| Section label bar | ~28px |

### 6.2 Search — one pattern, everywhere

Search is always **`[🔍] [Search…]` on ONE row**. Never a magnifier in the header with the field on
the next line (DM 2026-07-16: "they currently have a line break between them").

- Closed → a lone 🔍 toggle in the header.
- Open → the header toggle **hides**; the row shows `[🔍][input]`, and that icon closes it. Only one
  magnifier is ever visible.
- The row clears the title bar above it (**≥10px**), and **gets its own row** — it never shares with
  other controls (Equipment).
- The field's idle border is **neutral**; gold only on `:focus`.

### 6.3 Don't jump

Adding/removing an element must not shove everything else. If a layout change is unavoidable,
**animate it** (the drawer transition is the reference). A silent jump reads as a bug
(DM 2026-07-16).

---

## 7. Copy

- **Sentence case.** Not Title Case, not SHOUTING.
- Say the **consequence**, not the mechanism: "Rest the whole party", not "Execute rest".
- **Explanations live outside buttons** — a button is a verb; put the "a watch, an evening, a few
  hours" underneath as a hint, not inside the label.

### 7.1 No explanations in titles — ever

**A title names the thing. It never teaches.** (DM 2026-07-16.)

| ❌ Was | ✅ Is |
|---|---|
| `Abilities — tap Check or Save` | `Abilities` |
| `Actions — tap to use` | `Actions` |
| `Conditions — tap to toggle, hold for details` | `Conditions` |

If an interaction genuinely isn't discoverable, **fix the affordance** — don't caption it. The
buttons already say "Check"/"Save"; a title repeating that is noise that ages badly and eats the
width a real control could use.
- **Never leak DM-only numbers** into player copy. The same rule renders two ways:
  - hidden → `Roll an Athletics check`
  - shown → `Roll a DC 50 Athletics check`
- **Money reads naturally**: `40 gp and 5 sp` — never `40.5`.
- Empty states point at the next step: *"Hasn't chosen yet…"*, not *"—"*.

---

## 8. Warnings, not walls

The DM is the authority; the app **suggests and tracks**. Surface a problem, never block:

- ✅ "Abzarax is missing 40 gp and 5 sp" · ❌ refusing the activity
- ✅ suggesting time/cost · ❌ auto-deducting money
- ✅ a soft over-budget marker · ❌ a hard cap

Anything the DM might overrule must stay **overrulable**.

---

## 9. Class-name hygiene

**Namespace every class `mc-…` and scope component classes to their component.** Generic utility
names are landmines:

> `.mc-hidden { display:none !important }` is the shell's search filter. The downtime card used
> `mc-hidden` to mean "rule hidden from the player" — the default — so **every activity card on the
> DM panel was `display:none`** and the DM thought the feature was broken (v0.1.166).

Rule: if a class carries **meaning**, prefix it with the component (`mc-dt-veiled`), never a bare
adjective (`mc-hidden`).

---

## 10. Popups — one thing, one shape

Two shapes only, and a given interaction picks **one** and keeps it:

| Shape | Use | Notes |
|---|---|---|
| **Toast** (transient strip) | An *event* you may ignore — damage taken, a reaction offer | Auto-dismisses; never carries the only copy of information |
| **Card** (full popup) | *Details you asked for* — hold-for-info, an image, a summary | Closable ✕ top-right; big enough to actually read |

**The same gesture must give the same shape every time.** A hold that shows a toast in one state and
a full card in another is a bug (DM 2026-07-16: holding a condition gave a toaster while the palette
was open, but the full card once it was closed). Pick the **card** for hold-for-details — the user
asked for it, so give them the readable thing — and **never render both** (dedupe).

Detail cards are **reading surfaces**: err large. A cramped card is worse than no card.

---

## 11. Decoration & theming

Decoration is allowed **at the frame, never in the content**. It must be `pointer-events: none` and
must not change any hit target.

- **The frame** = one corner ornament **mirrored** into four corners (`scaleX`/`scaleY`/`scale(-1,-1)`)
  plus a hairline rule. Draw **one** shape; let the transforms do the rest.
- Ornaments are **SVG masks** filled by a CSS variable, never baked-colour images — that's what lets
  a theme recolour them.
- **Skeleton + motif, composited.** The ornament is TWO mask layers added together
  (`mask-composite: add`): a `--mc-frame-skel` and a per-theme `--mc-frame-orn` motif.
- **FIVE skeleton families, not one.** One shared skeleton made all 18 corners *the same drawing
  with a different pin in the middle* (DM 2026-07-17: "too many corner arts are just a curved line
  with a curved line in it — I don't want them all the same"). Each family follows the real style's
  grammar, researched rather than invented:

  | Family | Grammar | Themes |
  |---|---|---|
  | **deco** | Nested stepped Ls + a quarter sunburst fan over concentric arcs. Straight, stepped, strictly symmetric — Chrysler-building chevrons. | slate, artificer, fighter, rogue, wizard |
  | **nouveau** | The **asymmetric whiplash** S-curve with a tendril and a bud. *Asymmetry is exactly what separates Art Nouveau from baroque scrollwork* — never mirror it. | druid, bard, ranger, sorcerer |
  | **japanese** | **Seigaiha** (concentric quarter-arc waves) + an off-diagonal **asanoha** hemp-leaf star. Deliberately off-balance. | monk, tide, frost |
  | **heraldic** | Mitred arms, trefoil cusp, pointed finials. Architectural and tight. | paladin, cleric, barbarian, warlock |
  | **scroll** | The ogee bracket with volutes (the original). | tavern, flame |

- **THE MOTIF SLOT.** The motif lives at **(30,30) r≈7** on the 64-grid, and a skeleton must stay
  OUT of a circle at (30,30) r=9. Design the two halves *together*: the first cut had seigaiha arcs
  and an asanoha star drawn straight through the monk's lotus, because they were drawn apart.
- **Straight lines are allowed — monotony isn't.** "Avoid straight lines" meant *don't hold one
  heading forever*. Deco is straight lines and it's right (DM 2026-07-17: "when I said avoid
  straight lines I didn't mean ANY lines"). Match the line to the style.
- **Draw with lines, not blobs.** Outlines and strokes at ornament scale; a filled silhouette reads
  as a sticker (DM 2026-07-17: "more elaborate, using outlines and lines").
- **Every theme ships its own corner motif and frame colour.** 18 themes: 5 generic (tavern, slate,
  frost, flame, tide) + **one per dnd5e class** (artificer, barbarian, bard, cleric, druid, fighter,
  monk, paladin, ranger, rogue, sorcerer, warlock, wizard) — a player themes the app to *their
  character* (DM 2026-07-17). The flavour themes that duplicated a class were folded into it rather
  than deleted: clockwork→artificer (gear), verdant→druid (leaf), arcane→warlock (keeps the
  twinkle), ember→sorcerer (keeps the glow).
- **Taper with stepped segments + round caps** — SVG strokes can't taper natively. Thin at the free
  ends, heaviest into the elbow.
- **The swatch IS the icon.** Each theme's tile is a line-art icon of what it *is* — sword for
  fighter, shield+cross for paladin, wand for wizard, lotus for monk — drawn big and heavy in the
  theme's own colour (DM 2026-07-17). There is **no coloured disc**: a badge inside a 30px dot was
  ~20px of hairline art and unreadable. Dropping the disc buys the icon the whole tile.
  It's a `mask-image`, so the inline `background-color` paints it — never the `background`
  shorthand, which erases the mask.

> **An icon inside a swatch is two things fighting for one 44px tile.** Make the icon the swatch.
- **Double outline reads better than one line.** Two concentric strokes with the detail *between*
  them (the artificer's gear: two rings, dashed teeth between, a hub) look drawn rather than
  clip-arted. The DM asked for this by name.
- **The ornament is GILDING — real gold (`--mc-gilt`) in every theme**, the one thing all 18 share:
  gilt on leather, whatever colour the leather is dyed (DM 2026-07-17).
  *(This supersedes the 2026-07-16 rule "frame is burgundy, never gold". That was written against a
  chunky 26px ornament, where a gold block read as harsh. The same colour as fine tapered line-art
  at 78px reads as gilt. The rule was right about the weight, wrong about the hue — when a rule
  gets overturned, record what actually changed.)*
- Decoration still sits *behind* the content, never competing with it.
- Corners are `--mc-frame-c-size` (78px) inset by `--mc-frame-c-pad`. Tune the vars, not the four
  mirrors. At 26px the art read as a rounding error (DM 2026-07-17: "around three times larger").

### 11.1 A theme is a palette, not a pile of rules

**A theme may set tokens on `body.mc-theme-*` and one shell background. Nothing else.** If a theme
needs its own rule, it wants a **new token** instead.

The palette lives on **`body`** so it inherits into all three roots — the shell, the DM panel, and
lifted dialogs (which are body-children and inherit nothing from the shell). It was once declared
three times over; each theme had to be written three times, and they drifted — the dialog copies
silently never got the CTA tokens, and the DM panel, unable to see any token, hardcoded hexes.

Theme tokens: `--mc-gold` (accent) · `--mc-panel/-2` · `--mc-edge` · `--mc-sunken` · `--mc-primary*`
· `--mc-cta-*` · `--mc-bar-*` · `--mc-font-title` · `--mc-frame-orn` · `--mc-round`.

**A theme may mix two hues.** The *material* hue (surfaces, edges, background, title bars) and the
*button* hue (`--mc-primary*`, `--mc-cta-*`) are separate — the DM's brief: *"druid can have green
titles and brown buttons"*. Mixing is what stops 18 themes reading as 18 tints of one idea. The
generator takes both (`ramp(material_hue, sat, dot, button_hue, button_sat, round)`).

**A theme may set its own roundness.** `--mc-round` multiplies **every** px radius in the app
(`calc(10px * var(--mc-round, 1))`), so a theme can be machined-square (barbarian `0.25`) or
pillowy (monk `1.9`) with one number. **Circles (`50%`) and pills (`999px`) never scale** — those
are *shape*, not styling; a dot that stops being round is a bug.

> Themes are **generated from one table** (`tools/gen_themes.py`), not hand-written. The 13 class
> palettes derive every shade from their hues by formula, so they stay consistent and retune in one
> place. Edit the table and re-run; never hand-edit a generated block.

### 11.3 Fonts — extravagant titles, boring numbers

A theme may swap **`--mc-font-title`**, and may be as characterful as it likes there: titles are
short, large, and nothing depends on reading one exactly. The face is a big part of what makes a
theme feel like itself — the DM singled out the artificer's Bruno Ace: *"I really like the gray
theme's font, it makes the theme more unique."* Reuse across themes is fine; 14 usable core faces
cover 18 themes.

**Numbers are never themed.** Stat values, ability mods, attack/roll totals and tab labels stay on
Modesto Condensed in every theme. *A stat you misread is a bug, not a style* — the whole app exists
to be glanced at mid-combat (DM 2026-07-17: "anything except titles … is easy to read"). Body copy
stays on the UI face too; only the display group moves.

**Use Foundry CORE fonts only** — the 18 in `CONFIG.fontDefinitions` (Amiri, Bruno Ace, Modesto
Condensed, Signika, Roboto/Condensed/Slab, Titillium, Allrounder Monument, Gilda, Average, Granville,
OptimusPrinceps, …). They're on every client with nothing to load and no licence to chase. Fonts you
see in `document.fonts` come from other modules and the system — **not** available on a player's
phone. Check the config, don't trust the loaded list.

### 11.2 Bar patterns

Section title bars may carry a repeating motif via `--mc-bar-pat` (flame licks, snowflakes, gears,
leaves). Three rules, each learned the hard way:

1. **Faint.** It sits under white title text. ~0.2 alpha.
2. **Scale to the bar, repeat across it** (`background-size: auto 100%`, `repeat-x`). Free tiling
   wrapped an 18px motif into a cropped second row on a 26px bar — it read as a string of beads.
3. **Reuse the corner silhouette.** A motif drawn small enough to tile loses its inner detail and
   becomes hatching. The shape that reads at 78px, cropped tight, reads at 26px too.

> Rule of thumb: if you notice the frame before the buttons, the frame is too loud.

---

## 12. Checklist before you ship UI

1. Any colour outside §2? Justify it or drop it.
2. Exactly one primary button in this view?
3. Names in ink; identity on the icon/rail?
4. Any DM-only number leaking to a player?
5. Touch targets ≥44px on the phone?
6. New class names namespaced and component-scoped?
7. Does the empty/disabled state say what to do next?
