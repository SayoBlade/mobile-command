# Morning Report — overnight build (test on waking)

## TL;DR

Acted on your screenshot feedback overnight. Everything below is **built but UNTESTED** (no live client on my side — I can't run Foundry). The working combat loop and the parts you already liked were left intact. Please run the numbered tests and **stop at the first failure**. Two commits tonight: the first big L&F + Move/Turn build, then a round-2 pass addressing your notes.

## Your notes → what I did

- **"movement buttons bigger, closer together"** → D-pad enlarged, gap tightened. ✅ built
- **"fit them in the sheet page, rename it Exploration"** → the **"Sheet" tab is now "Explore"** and the move pad sits at the top of it; the separate "Move" tab is gone. ✅ built
- **"HP/temp inputs bigger + iOS keypad has no +/− keys, still want add/subtract"** → tapping HP or Temp now opens a roomy editor row with on-screen **− / + / Set**: type an amount, tap **−** to subtract or **+** to add (delta), or **Set** for an absolute value. No keyboard +/− or return needed. Inputs enlarged. ✅ built — **this is the highest-risk piece, please test carefully (test 4–6)**
- **"actions/bonus actions that aren't items — Action Surge, Second Wind, lamp"** → the Actions list now includes **features** (Action Surge, Second Wind, etc.), not just weapons/spells. **Inventory use (lamp, equip toggles, potions) is NOT done** — that's a Sheet/inventory surface, logged for a later stage.
- **"an icon for each key, from the item itself"** → each action row now shows the item/feature **icon**. ✅ built (applies to Actions; ability/skill buttons have no per-item icon)
- **"drag between tabs"** → **not done** (you said not a must; doing it blind risks breaking tap handling). Logged (B2).
- **"long presses don't work"** → correct, that's the v2 detail-card/context-menu (§7.2). Logged, not built.

## Do this (hard-reload BOTH windows first: Ctrl+Shift+R; DM unpaused & on the active scene)

1. **Explore tab:** the old "Sheet" tab now reads **"Explore"** (tabs: Actions · Explore · Journal); opening it shows the **move pad on top**, then skills/abilities below.
2. **Move pad:** buttons are bigger and closer; tapping a direction steps your token on the DM canvas; toward a wall it doesn't move (a small note shows).
3. **Header:** HP, Temp, AC, and the ★ inspiration button are present; AC matches the sheet.
4. **HP −/+ (the iOS fix):** tap the **HP** number → an editor row appears with an input and **− / + / Set**. Type `5`, tap **−** → HP drops 5; type `3`, tap **+** → HP rises 3.
5. **HP Set:** tap HP → type `20` → tap **Set** → HP becomes 20 (clamped to max). Tap the ✕ to cancel without changing.
6. **Temp:** tap **Temp** → same editor → set/add/subtract temp HP.
7. **Inspiration:** tap ★ → toggles on/off (gold when on).
8. **Actions list:** open Actions — it now shows **icons** per row and includes **features** (e.g. Action Surge, Second Wind) alongside weapons/spells. Tapping a no-target feature (Action Surge) should fire without asking for a target; Second Wind should give you a "Roll damage" (healing) step.
9. **Regression — two-tap attack:** Actions → Greatsword → pick a live target (reticle commits on DM) → Use → Roll damage still works.
10. **Turn HUD (needs a combat):** start combat; the banner shows whose turn; on your turn **End turn** is enabled and advances the turn.

## Honest risk notes

- **All untested.** Most likely to need a fix: the **HP editor** (focus/commit/clamp) and **features in Actions** (some utility activities may behave oddly through Route B — if one hangs or errors, tell me which feature).
- No `node` on this machine, so I couldn't run a real JS syntax check — only brace/paren balance (clean) + manual review.
- The move pad still moves **your own token** even out of combat (design wants the shared group token out of combat) — flagged, not changed.

## Next action for me

Tell me the first failing test number (with what you saw) or "all pass." Then the open choices remain: **inventory use** (lamp/equip/potions in the Explore sheet), the **TV/Table client** (real player-colored reticle), **B8 in-range badge**, **swipe tabs**, or a deeper **L&F polish** pass.
