# Mobile Command — Phone Controller for FoundryVTT

Play D&D 5e at a real table: the DM runs Foundry, a TV lying flat (or on the wall) shows the
shared map, and **every player runs their whole character from their phone** — attacks, spells,
saves and reactions, movement, rests, inventory, journals — without ever touching the laptop.
Phones are full Foundry clients running a touch-first UI replacement layer (no canvas on the
phone; everything spatial executes on the DM's client and midi-qol routes prompts to the right
device).

Beyond the combat loop it ships a DM panel (combat, party, rest, travel, effects, system health),
character creation on the phone, a session-zero card table dealt onto the TV, day/night driven by
the game clock, party marching order + travel mode, downtime, personal messages, and a set of
campaign tools for *The Crooked Moon* (séance board, tarot, twists, curses) that stay hidden
unless that module is installed.

## Install

Install via manifest URL in Foundry's **Add-on Modules → Install Module**:

```
https://github.com/SayoBlade/mobile-command/releases/latest/download/module.json
```

**Requires:** midi-qol, DAE, socketlib, libWrapper. **Recommended:** Automated Conditions 5e,
Item Piles, Simple Calendar Reborn, Monk's Common Display (for the shared screen).

**Stack:** built against Foundry 14 · dnd5e 5.3.x · midi-qol 14.x. The module tracks current
releases ("chase upstream"): the System-health tab warns when an installed version hasn't been
validated with this app yet — usually fine, and there's a one-tap "Message for dev" report if
anything misbehaves.

## Quick start (DM)

1. Enable the module; the first-run **setup wizard** walks the shared-table config (display/TV
   account, midi settings preset, vision sync, party group).
2. Players join from their phones with their own Foundry users — the touch shell opens
   automatically for player-role clients.
3. The **System health** tab on the DM panel checks the table before each session and offers
   one-tap fixes.

## Development

The repo doubles as the module directory. Link it into Foundry's data folder (elevated or
developer-mode PowerShell):

```powershell
New-Item -ItemType Junction -Path "$env:LOCALAPPDATA\FoundryVTT\Data\modules\mobile-command" -Target "C:\Users\User\Documents\Claude\Code\mobile-command"
```

- **[DESIGN.md](DESIGN.md)** is the source of truth — architecture, per-feature specs, live-world
  findings, and the open ledger (§22). **[UI-BIBLE.md](UI-BIBLE.md)** governs how everything looks
  and what each visual choice means.
- Syntax gate before every commit (JS **and** CSS): `tools/check-syntax.js` under Foundry's
  Electron-as-node (see CLAUDE.md). Headless test suites live in `tools/test-*.mjs`.
- Write operations in the test world only. Never delete anything. New findings go into DESIGN.md,
  dated.
