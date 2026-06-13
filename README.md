# Mobile Command — Phone Controller for FoundryVTT

Phones as full Foundry clients with a touch-first UI replacement layer. [DESIGN.md](DESIGN.md) is the source of truth — architecture decisions, the settings preset, the RPC contract, and all live-world spike findings live there.

**Pinned stack:** Foundry 14.363 · dnd5e 5.3.3 · midi-qol 14.0.8. Requires midi-qol and socketlib.

## Status: Phase 1 (plumbing — no UI yet, test with console/macros)

What exists:

- **Settings Enforcer** (`MobileCommand.enforcer`) — validates the canonical preset (D4, all values live-verified 2026-06-12) on world ready; shows a drift table with one-click apply. Never writes without a click.
- **Executor RPC** over socketlib (§5 subset): `itemUse`, `moveRequest`, `measure`, `targetsList`, `assignTargets`, `heartbeat`. The executor is the active GM client by default (two-client topology, §2.1); a dedicated user can be configured later without protocol changes.
- **`item.use` wrapper** with the Spike 3 lessons baked in: explicit `targetUuids` in `usage.midiOptions`, area-target activities refused (midi ignores explicit targets for AoE — DM template flow instead), refusal reasons captured from executor-side notifications and returned as `{ok:false, stage, reason}`.
- **Pause guard** — auto-pauses when the executor leaves the active scene, auto-resumes on return; manual pauses are never auto-resumed.
- **Phone niceties:** clients with role "phone" suppress core's 1024×768 window-size nag.

## Install for development

The repo doubles as the module directory. Link it into Foundry's data folder (run from an elevated or developer-mode PowerShell):

```powershell
New-Item -ItemType Junction -Path "$env:LOCALAPPDATA\FoundryVTT\Data\modules\mobile-command" -Target "C:\Users\User\Documents\Claude\Code\mobile-command"
```

Then restart/refresh Foundry and enable **Mobile Command** in the test world (Restored Keep / "Offline test") only.

## Phase 1 smoke tests (console, per test protocol: numbered, one at a time, stop on failure)

With the module enabled, executor = DM app, one player client (no-canvas is fine):

1. **Enforcer:** on the GM client, `MobileCommand.enforcer.diff()` returns `[]` (after the preset has been applied once via the startup prompt).
2. **Heartbeat:** on the player client, `MobileCommand.state.lastHeartbeat` is non-null and recent, with the active scene id.
3. **Item use from the player client:**
   ```js
   // as the Wizard's owner:
   var wiz = game.actors.getName("Wizard (Level 3, Evoker)");
   var act = wiz.items.getName("Magic Missile").system.activities.contents.find(a => a.type === "damage");
   var spider = game.scenes.active.tokens.find(t => t.name === "Giant Spider");
   await MobileCommand.useActivity({ activityUuid: act.uuid, targetUuids: [spider.uuid], consume: false,
     midiOptions: { fastForward: true, fastForwardDamage: true, autoRollDamage: "always" } });
   ```
   Resolves `{ok:true, ...}` with the spider in `targets`, HP drops, no dialog on the executor.
4. **Refusal surfacing:** same call with `consume: true` and zero remaining L1 slots → `{ok:false, stage:"use", reason:"…spell slots…"}` (not a silent nothing).
5. **AoE guard:** same call shape with a Thunderwave save activity → `{ok:false, stage:"validate", reason:"area-target activity…"}`.
6. **Move validation:** `await MobileCommand.moveToken({ tokenId: "<own token id>", dxGrid: 1, dyGrid: 0 })` → token steps right; against a wall → `{ok:false, stage:"collision"}`.
7. **Targets list:** `await MobileCommand.listTargets({ forTokenId: "<own token id>" })` → distance-sorted candidates, hidden tokens absent.
8. **Pause guard:** DM views another scene → PAUSED banner everywhere and phone RPCs return `{ok:false, …"paused"}`; DM returns → auto-resume.

## Conduct

Write operations in the test world only. Never delete anything. New findings go into DESIGN.md, dated.
