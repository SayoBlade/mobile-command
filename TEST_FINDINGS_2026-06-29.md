# Test session findings — 2026-06-29 (autonomous, DM away)

## ⚠️ Up front: I could NOT do live action/skill testing this session
No path to drive Foundry unattended right now:
- **No Foundry MCP server connected** (only the `foundry-mcp-bridge` Foundry-side module is installed; the companion server process isn't running — your console showed `ws://localhost:31415 … ERR_CONNECTION_REFUSED`, and it loaded on a player tab → "user access restricted").
- **Browser automation isn't serviceable unattended** (computer-use treats browsers as read-only; Chrome-MCP needs an interactive selection prompt).
- With you away, I also can't hand you console one-liners to run.

So everything below is **offline data forensics + a test plan to run once a live path exists** (MCP bridge on a GM tab, or you back at the keyboard).

## 🔴 CONFIRMED bad-copy damage: the "Party" group is broken
Active world: **`offline-test`** (this IS the designated test world — writes OK here).

The group actor **`O0w2EtLxeXBQd5g5`** (almost certainly your "Party") lists **5 member actors that no longer exist** in the world:
- `efOQoxATl3AzWPUc`, `w75Dx1WGvfvdpd5I`, `xjjSjbqSdboHtmY6`, `55cD5tQAcl2uCwu2`, `RiG2klPaMSgrwCa0` — all **MISSING** (verified: no actor doc for any of them).

This throws `group.mjs:153 "Actor … in group … does not exist within the World"` on **every load** (5×). The real PCs (Gunner, Testonius, Sald'r, Belnor Brightshield) exist with *different* IDs — they were re-imported/copied, and the group's member list still points at the **old** IDs. So the Party group is effectively pointing at ghosts.

**Suggested fix (run on the GM when back; offline-test = test world):** rebuild the group's members from the real PCs. Something like:
```js
const party = game.actors.get("O0w2EtLxeXBQd5g5"); // verify this is "Party" first
console.log("current members:", party?.system?.members);
// Re-point to the live player-owned characters:
const pcs = game.actors.filter(a => a.hasPlayerOwner && a.type === "character");
await party.update({ "system.members": pcs.map(a => ({ actor: a.id })) }); // confirm member shape in your dnd5e version first
```
(Check the exact `system.members` schema for dnd5e 5.3.3 before writing — the entry shape may differ.)

## 🟡 Could NOT assess offline: per-PC item-type corruption
The known "bad copy" signature is **invalid item types → DAE failures → phantom silent bugs** (see retired-Sqyre note). A raw type histogram over the actor DB showed the expected dnd5e item types with **no obviously-garbage item type** standing out — but the histogram is polluted by activity/advancement/effect `type` fields, so this is **not conclusive**. Properly checking each PC needs a live client.

### ▶ Run this on any client to get a full corruption report (paste me the output)
Self-contained; read-only; no writes. Scans every player-owned character.
```js
(() => {
  const VALID = new Set(["weapon","equipment","consumable","tool","loot","container","spell","feat","background","class","subclass","race","facility"]);
  for (const a of game.actors.filter(x => x.hasPlayerOwner && x.type === "character")) {
    const bad = [], noActivities = [], brokenAE = [];
    for (const it of a.items) {
      if (!VALID.has(it.type)) bad.push(`${it.name} [${it.type}]`);
      // activities collection should exist on activity-bearing items
      try { if (it.system?.activities && it.system.activities.size === 0 && ["weapon","spell","feat","consumable"].includes(it.type)) noActivities.push(it.name); } catch(e) { bad.push(`${it.name} (system threw)`); }
    }
    for (const e of a.effects) { try { void e.changes; } catch(g) { brokenAE.push(e.name); } }
    const senses = a.system?.attributes?.senses?.ranges ?? {};
    console.log(`%c${a.name}`, "font-weight:bold", {
      items: a.items.size,
      invalidTypes: bad.length ? bad : "none",
      activityBearersWithNoActivities: noActivities.length ? noActivities : "none",
      brokenEffects: brokenAE.length ? brokenAE : "none",
      senses,
      tokenName: a.prototypeToken?.name,
    });
  }
  console.log("scan complete — paste the above");
})();
```
If `invalidTypes` lists anything, that's the bad-copy damage (those items will silently fail DAE/activities). `none` across the board = the PCs are structurally clean and any problems are behavioural (test plan below).

## 🟢 Other console noise seen (NOT our module, NOT bad-copy)
- `visual-active-effects` (14.0.3): `Cannot read properties of null (reading 'items')` — VAE rendering for a null actor; a v14 module bug.
- `Carousel Combat Tracker` (combat-tracker-dock): `ActiveEffectDuration#duration` deprecation in `CombatantPortrait.js` — module behind on v14.
- Various `Deprecated since Version 13/14` warnings from core/midi/dnd5e — cosmetic.

---

## ▶▶ FUNCTIONAL QA HARNESS — paste once on any client, send me the output
Exercises every player-owned PC with the **real dnd5e 5.3.3 API** (rolls are non-destructive — they don't change the actor; rest is only *probed*, not fired). Catches damaged abilities/items/spells. It does **not** test the mobile-command shell UI (taps, target picker, char-gen flow) — that genuinely needs a live UI driver (MCP server) or you.
```js
(async () => {
  const VALID = new Set(["weapon","equipment","consumable","tool","loot","container","spell","feat","background","class","subclass","race","facility"]);
  const D = { configure: false }, M = { create: false };
  for (const a of game.actors.filter(x => x.hasPlayerOwner && x.type === "character")) {
    const fails = [];
    // Skills
    for (const sk of Object.keys(a.system.skills ?? {})) {
      try { const r = await a.rollSkill({ skill: sk }, D, M); if (!r) fails.push(`skill ${sk}: null`); }
      catch (e) { fails.push(`skill ${sk}: ${e.message}`); }
    }
    // Saves + ability checks
    for (const ab of Object.keys(a.system.abilities ?? {})) {
      try { await a.rollSavingThrow({ ability: ab }, D, M); } catch (e) { fails.push(`save ${ab}: ${e.message}`); }
      try { await a.rollAbilityCheck({ ability: ab }, D, M); } catch (e) { fails.push(`check ${ab}: ${e.message}`); }
    }
    // Items: type + activities resolve
    for (const it of a.items) {
      if (!VALID.has(it.type)) fails.push(`item bad type: ${it.name} [${it.type}]`);
      try { for (const act of (it.system?.activities ?? [])) void act?.type; }
      catch (e) { fails.push(`item ${it.name} activities: ${e.message}`); }
    }
    // Spells: slot data present for a caster
    const slots = a.system.spells ?? {};
    const hasSlots = Object.values(slots).some(s => (s?.max ?? 0) > 0);
    // Effects readable
    for (const ef of a.effects) { try { void ef.changes.length; } catch (e) { fails.push(`effect ${ef.name}: ${e.message}`); } }
    // Rest capability (probe only — not fired)
    const canRest = typeof a.longRest === "function" && typeof a.shortRest === "function";
    console.log(`%c${a.name}`, "font-weight:bold;color:#7cf", {
      items: a.items.size, caster: hasSlots, canRest,
      tokenName: a.prototypeToken?.name,
      result: fails.length ? `❌ ${fails.length} issue(s)` : "✅ all rolls/items/effects OK",
      fails: fails.length ? fails : undefined,
    });
  }
  console.log("=== QA harness complete — paste the above ===");
})();
```

## 📋 Test plan — run when a live path exists (numbered, per CLAUDE.md protocol)
Stop on first failure; record what was observed. Test on **offline-test**. Try Player-1 PCs (Party) AND create a fresh Player-2 PC.

### A. Untested-so-far (priority)
1. **Healing activity** from the phone (e.g. Cure Wounds / Second Wind) → target ally → HP rises on phone + sheet.
2. **Save-based spell** with a template/AoE that needs DM placement (e.g. a save spell) → "DM is placing" handoff cue + save prompts to targets.
3. **Utility activity** with no target (e.g. Action Surge) → fires, no target picker, RE/ACT pip updates.
4. **Tool check** from the shell → result toast + recent-rolls pill.
5. **Concentration** spell → cast, take damage → concentration save prompt surfaces on phone.
6. **Reaction (attack-triggered)** e.g. Shield → when attacked, the reaction prompt reaches the phone (this is the path that DOES work; OAs do not — midi has no movement OA, see chat).
7. **Multiclass / level-up** flow on a PC.
8. **Multiple targets** on one attack/spell → all selected, all resolve.

### B. Recheck previously-problematic
9. **Attack total on phone vs chat** (the old "−"/−100 + double-roll) — needs the **executor/GM reloaded** first; confirm the phone shows the real total, single die.
10. **Ammo/consumable weapon** (revolver) "Use anyway" → fires without stranding the executor dialog.
11. **Upcasting a spell** at a higher slot → correct slot consumed, correct dice (executor reload sensitive).
12. **Wild Shape / summons** → behaves like a normal item; details show.
13. **Conditions/effects** (e.g. Rage) → transferred effects apply; remove cleanly.
14. **Rest** (short/long) → works for owned PC; clean permission toast if not owned.
15. **Out-of-resources** (empty revolver) → amber warning + "Use anyway", not a hard block.
16. **Movement counter** + travel-mode picker in combat.
17. **Favorites** (activity / item / skill / tool) add + remove.

### C. New Player-2 character
18. Create a fresh PC via char-gen → name it → confirm the **token name follows** (the rename fix), sight syncs on combat start, and a basic attack + skill check work end-to-end.
