# Probe: Hero Mancer 2's level-up on the phone (2026-11-09)

For the seat lane. HM2 3.3.3's level-up is one ordinary Foundry window (`api.openLevelUp(actor)`) that never touches the
game canvas, so it should render on the phone. MC lifts it above the shell, as it does dnd5e's advancement window. The
phone offers it only while the GM's **Send Level Up** is waiting for that character. Creation stays off the phone.

**Setup:** reload the GM client, then Player1's tab with MC role **phone**. Test Barbarian at level 1 (the level-1 macro).

## Steps (numbered; stop at the first failure)

1. **Nothing sent:** on the phone, tap **Lvl** in the header. Expected: the Classes & level panel, **no Level up button**,
   no dot on Lvl.
2. **Send it:** on the GM, the Barbarian's sheet → HM2's **Send Level Up** → confirm. Expected on the phone, within a
   few seconds: a notice "Test Barbarian: the DM sent a level-up. Tap Lvl." and a **gold dot** on the Lvl button.
3. **Open it:** tap **Lvl** → **Level up**. Expected: HM2's level-up window opens **on top of the shell**. It is usable
   by touch: the class tile, the HP choice and Next / Confirm can all be reached (scroll inside it if it is taller than
   the screen). Note anything cut off or unreachable, with a screenshot.
4. **Finish it:** pick the class, take the HP, Confirm. Expected: the Barbarian is **level 2** on the phone header. The
   dot and the Level up button are gone. No desktop actor sheet is left over the shell. Any HM2 follow-up window (for
   example its spell book hand-off) appears on top of the shell, not hidden under it.

## What changes in the world

- The Barbarian: level 1 → 2 (HM2's grants, HP), and HM2's `levelUpReady` flag set then cleared. Put back with the
  level-1 macro.
- Chat: HM2's level-up broadcast card(s).
