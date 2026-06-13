# Morning Report — overnight build 2026-06-13 (test 2026-06-14)

## TL;DR

Built **two things while you slept, both UNTESTED** (I have no live client, so nothing here is verified): (1) the **L&F pass** — a dark-fantasy "character sheet" theme — folding in the §12 backlog items B1/B3/B4/B7; (2) the **Move pad + Turn HUD** to round out the combat loop. The working combat loop from yesterday was left intact (the restyle layers over the same DOM). Five commits from yesterday are untouched; tonight's work is one new commit. **Please run the numbered tests below and stop at the first failure** — since I built blind, the most likely issues are runtime/behavioral, not structural.

Code sanity-checked as far as I could without node: brace/paren balance OK on all files; manual review of the new handlers clean. No `node` on this machine to run a real syntax check — flagged as a gap.

## What I built

**L&F (B5) + folded-in backlog** — all in [scripts/shell.js](scripts/shell.js), [styles/shell.css](styles/shell.css), [scripts/main.js](scripts/main.js):
- **Theme:** dark-fantasy palette, gold/crimson accents, dnd5e's **Modesto Condensed** display font on the name/section labels/big numbers/tabs. Applied as an appended CSS layer over the existing DOM, so the combat loop's behavior is unchanged.
- **B4 — AC** shown in the header.
- **B3 — Inspiration** star in the header; tap toggles `system.attributes.inspiration`.
- **B7 — HP & Temp are tap-to-edit:** tap the number → it becomes an input → type an absolute (`22`) or relative (`-10` / `+3`) value, Enter or tap-away commits, Esc cancels. The old −/+ steppers and Damage/Heal row are **removed**.
- **B1 — tab bar** enlarged, and the module now adds `viewport-fit=cover` to the viewport on phones so `env(safe-area-inset-bottom)` actually clears the iOS home-swipe area.

**Phase 3 — Move pad + Turn HUD** ([scripts/shell.js](scripts/shell.js), [scripts/rpc.js](scripts/rpc.js)):
- **Move tab** with a 3×3 D-pad → the proven `move.request` RPC (executor wall-validates). Moves the controlled actor's own token.
- **Turn HUD** — a banner that appears when a combat is active: shows whose turn it is, highlights "Your turn", and an **End turn** button → new `endTurn` RPC (turn advancement is GM-side, so it routes to the executor; only the current combatant's owner may advance).

## Do this (numbered; one at a time; stop at the first failure)

**Setup:** hard-reload **both** windows (Ctrl+Shift+R) — DM and player — to load the new JS/CSS (it's all JS+CSS, no manifest change). DM unpaused and on the active scene. Player = the Fighter's owner.

1. **Shell reskins:** the player shell looks restyled — gold/crimson dark-fantasy theme, the name and headers in a condensed display font (not the plain sans). (If the font looks unchanged, that's cosmetic — Modesto may not be scoping in; note it and continue.)
2. **Header stats:** the header shows **HP**, **Temp**, **AC** (a number), and a **★ inspiration** button.
3. **AC** matches the Fighter's sheet AC.
4. **Inspiration:** tap ★ → it fills gold (and the actor gains inspiration); tap again → clears. (Cross-check on the DM if you like.)
5. **HP edit (absolute):** tap the HP number → it becomes an input → type `25` → Enter → HP becomes 25.
6. **HP edit (relative):** tap HP → type `-5` → Enter → HP drops by 5; tap HP → `+3` → rises by 3. (No double-apply.)
7. **Temp:** tap the Temp number → set it (e.g. `5`) → it shows; set `0` to clear.
8. **Tab bar:** four tabs now — Actions · Sheet · **Move** · Journal — and the bar sits clear of the iPhone home bar (not flush against the bottom).
9. **Move pad:** Move tab shows a D-pad; tap a direction → your token steps one square on the DM canvas; tap toward a wall → it doesn't move and a small note shows underneath.
10. **Turn HUD (needs combat):** start a combat with the Fighter in it. The shell shows a turn banner. On the Fighter's turn it says **"Your turn"** and **End turn** is enabled; tap it → the turn advances (check the DM tracker). On others' turns it shows who's up and End turn is disabled.
11. **Regression:** the two-tap attack still works — Actions → Greatsword → tap target (reticle commits on DM) → Use → Roll damage.

## Known/unverified + deferred (so you're not surprised)

- **Everything above is untested.** Highest-risk-to-work-first-try, in my estimation: the **HP inline-edit focus/commit** (B7) and the **Turn HUD/endTurn** (combat API used without a live check). If HP edit misbehaves, tell me exactly how (input doesn't appear / doesn't commit / double-applies).
- **Switching directly from editing HP to editing Temp** may need two taps (the blur commits the first, the tap re-opens) — minor, noted.
- **Deferred, not built:** B2 (swipe between tabs), B8 (in-range badge — needs the activity's range passed into `listTargets`), action-economy pips on the HUD, and out-of-combat **group-token** binding for the move pad (it currently always moves your own token).
- **Move pad** moves your own token even out of combat (design wants the shared group token out of combat) — fine for testing, flagged for later.
- No `node` on this machine, so I couldn't run a real JS syntax check — only brace-balance + manual review.

## Exact next action for me

Tell me the first test number that fails (with what you saw), or "all pass." If all pass, the next build choices are: the **TV/Table client** (unlocks the real player-colored reticle + a lot of §7.3/§6.1), **B8 in-range badge**, or starting to refine the L&F from your reactions.
