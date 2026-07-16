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

### 2.1 The palette

| Token | Hex | Use |
|---|---|---|
| **Gold** | `#c8a44d` | The brand. Primary actions, active state, section labels, progress. |
| Gold bright | `#e6c46a` | Hover/emphasis on gold. |
| Gold deep | `#b98a1e` | The dark end of a gold gradient. |
| Ink | `#ece5d6` | **All names and primary text.** |
| Ink dim | `#d8d2c4` | Secondary text, form labels. |
| Muted | `var(--mc-muted)` | Hints, placeholders, disabled, inactive chevrons. |
| Panel | `#14161c` / `#1a1c24` | Surfaces (deep → raised). |
| Panel-2 | `var(--mc-panel-2)` | Secondary button fill. |
| Edge | `#3a3f4c` / `#4a4334` | Borders (neutral / gold-tinted). |

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

---

## 4. Buttons — the hierarchy

Exactly four levels. Pick by **consequence**, not by how much you want it noticed.

| Level | Look | Use | Example |
|---|---|---|---|
| **Primary** | Gold gradient fill (`linear-gradient(#c8a44d,#b98a1e)`), dark ink text, bold | The **one** action that advances the flow. **Max one per view.** | Start activities · Form up |
| **Secondary** | Transparent/panel fill, `1px` edge, ink text | Real but non-committal actions | Edit · Give a task · Rest Short/Long |
| **Tertiary** | No border, muted text, icon-led | Options that shouldn't compete | Cancel · Reopen choices · drawer chevrons |
| **Destructive** | Transparent; **red only on hover/active** | Delete/remove | ✕ on a card |

**Close/dismiss** is always **`✕`**, tertiary, top-right. Never an hourglass, never a word, never
primary — a close button that looks important gets pressed by accident (DM 2026-07-13: "End" with an
hourglass read as "end the day and pass time").

**Call-to-action:** when the DM's next step is unambiguous, say it in words on a **secondary+**
button (`✨ Set the rule`), not an icon. Icon-only buttons get missed — that exact mistake made the
DM think the panel was dead (v0.1.149).

**Disabled** states explain themselves: `Start activities — nobody's chosen yet`, not a dead button.

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
  Collapse what the DM has finished with (the catalog auto-collapses on Start).
- **Grouped forms**: sections with a gold uppercase micro-label (`PROGRESS`, `THE ROLL`); pair short
  number fields 2-across. A flat column of rows is a wall — group it.
- **Section label**: 10px, uppercase, `letter-spacing .07em`, gold, weight 800.
- The DM panel's second window is **height-capped and drag-resizable**, and grows **up** when the
  panel sits low. It must never shove the primary panel.

---

## 7. Copy

- **Sentence case.** Not Title Case, not SHOUTING.
- Say the **consequence**, not the mechanism: "Rest the whole party", not "Execute rest".
- **Explanations live outside buttons** — a button is a verb; put the "a watch, an evening, a few
  hours" underneath as a hint, not inside the label.
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

## 10. Checklist before you ship UI

1. Any colour outside §2? Justify it or drop it.
2. Exactly one primary button in this view?
3. Names in ink; identity on the icon/rail?
4. Any DM-only number leaking to a player?
5. Touch targets ≥44px on the phone?
6. New class names namespaced and component-scoped?
7. Does the empty/disabled state say what to do next?
