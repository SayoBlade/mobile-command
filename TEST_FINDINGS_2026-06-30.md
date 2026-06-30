# Char-gen live QA — 2026-06-30 (via Claude-in-Chrome, joined as Player 1)

Built **one** of the four blank PCs ("Player Character (3)") end-to-end through the mobile UI and tested it. World: offline-test (writes allowed).

## ✅ Works (verified live, end-to-end)
- **Char-gen create flow** — Class→Bard (10-step advancement: HP, saves, skills×3, armor, weapons, instruments×3, features, cantrips/inspiration/prepared counts); Species→Aasimar (size, resistance, traits, Light Bearer free cantrip); Background→Acolyte (ability-score improvement, languages×2, proficiencies, Magic Initiate feat). Native dnd5e Advancement dialogs surface correctly in the shell; the `<select>` trait pickers must be driven via the DOM (native popups don't take coordinate clicks).
- **Ability scores** — point-buy UI (steppers, points-left, Apply). NOTE the finding below.
- **Spell picker** — loads bard list, search + school filter, cantrip/spell counters (2/2, 4/4), "Add spells" → "Learned N spells". Free racial Light cantrip pre-counted.
- **Finish** → built Lvl 1 Bard (HP 8/8, correct mods).
- **Level-up flow** — "Lvl N" header → Classes&Level panel → Level up → class picker (Bard N→N+1 / multiclass). HP step has Take-Average (remembered between levels).
- **Subclass at L3** — Subclass step → dnd5e Compendium Browser (filtered to Bard) → College of Lore → then College-of-Lore advancement (3 bonus skills, Cutting Words). Reached Lvl 3, HP 18/18, College of Lore on sheet. Aasimar L3 Celestial Revelation batched in automatically.
- **Skills list + roll** — Details tab shows all skills with correct mods (Jack of All Trades half-prof, expertise, College/background profs). Tapping a skill → roll config dialog (Adv/Normal/Disadv, formula shown) → result toast + chat msg. Acrobatics rolled 15 (1d20+1+1). ✓
- **Spell cast** — Heroism (self, L1): slot consumed 4→3, Concentration effect applied, spell card to chat. ✓ Upcast selector (L1×4 / L2×2) shown.
- **Spell targeting** — Tasha's Hideous Laughter → target screen, "No targets in range/sight" graceful handling + Self option.
- **Prepare toggle** — right-side icon toggles prepared (Prepared count + 1st-level count update).
- **Long Rest** — dialog (New Day, Remove Temp HP, Recover Max HP) → REST → "Recovered: +4 level-1 slots, +2 level-2 slots", chat msg. ✓
- **Weapon use UI** — Greataxe from Favorites → target picker with FOE/ALLY classification + live distances (Kobold Warrior FOE 10ft, wizi ALLY 15ft, etc.). ✓ (but see attack stall below)
- **Senses (data)** — Bard has darkvision 60 (Aasimar). Senses object correct.

## 🔴 Findings
1. **Point-buy ↔ background ASI (confirm intended).** Point-buy screen STARTED with the Acolyte ASI already folded in (Wis 11, Cha 12 vs 10/10). Final sheet: Wis 12, Cha 17 — i.e. the background +1/+2 appears reflected twice relative to the number dialed on the point-buy screen (Cha read 15 there, 17 on sheet). The 4 untouched abilities (Str/Dex/Con/Int) match exactly. Either the point-buy display should start at base (10) so it matches the final, or the ASI is genuinely double-applied. Net: the score you set in point-buy ends 1-2 higher on the sheet.
2. **Fresh caster has 0 available spell slots.** Immediately after build/level-up, `spell1` = 0/4 and `spell2` = 0/2 (max correct, value 0). Can't cast leveled spells until a Long Rest (which refills to full). Candidate fix: initialize slot `value` to `max` on Finish/level-up.
3. **Weapon attack stalled.** Greataxe → target Kobold → Use → shell stuck on "Checking adv/dis…"; no attack roll ever posted to chat, no dialog open. Spell cast + skill rolls DID post, so the basic roll path works; the midi-qol ATTACK workflow (handed to the GM-side executor / rpc.js) stalled. Was also NOT the attacker's combat turn (it was wizi's turn). Recommend: reload the GM/executor client, retry on the attacker's own turn.
4. **Blank PCs have no items / item-rich PC not in switcher.** The four blank PCs (Player Character, PC(3), PC(4), PC(5)) all have **0 items** — contradicts "I gave them magical items." The magic items live on **Belnor Brightshield** (Fighter 3 / Eldritch Knight, ~22-31 magic items: Staff of Healing, Bronze Horn of Valhalla, Cloak of Arachnida, Staff of Fire, Staff of Thunder & Lightning, Water Ring of Elemental Command…) and several Cleric demo actors. Belnor is owned by Player 1 but is NOT in the phone's subject switcher (shows only Barb + the 4 blanks) and has no token on the current scene — so I could not drive its magic items through the phone.

## Not done this pass
- Built only 1 of 4 blanks (flow proven; the other 3 are identical).
- Player-2 testing.
- Actual magic-item use (blocked by #4).
