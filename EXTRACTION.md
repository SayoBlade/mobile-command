# The Crooked Moon extraction — handover (parked 2026-09-23)

**Status: PARKED.** Michael's call, 2026-09-23: mobile-command follows deck-command's lead from
here, so lifting the Crooked Moon content into a companion module goes on the back burner. The
attempt is in history, reverted, and MC loads cleanly again.

| commit | what |
|---|---|
| `9ccb727` | `scripts/packs.js` — the content-pack registry (154 lines). Still in the tree; nothing imports it yet. Harmless. |
| `825b48b` | WIP: the extraction, half-wired, **not loadable** (do not check out and run) |
| `b7978fb` | the revert — MC is back to the last good tree (`git diff 9ccb727 HEAD` is empty) |

To resume: `git revert b7978fb` (re-applies the WIP), then finish the list under "Stopping point".

## What phase one did (all in `825b48b`)

The seam, not the tearing: MC gained a registry a companion contributes through, and every place
the engine used to *import* a Crooked Moon symbol was rewired to *ask the registry*.

- **`scripts/packs.js`** — `registerContentPack(pack)`; fourteen contribution kinds, one reader
  each: `settings`, `gate`, `hooks()`, `fx { defs, phone, oneShot, sync }`, `darkness(scene)`,
  `campaign`, `chapters`, `entrances`, `cueSets`, `panelTab`, `shellTab`, `api`, plus `active()`.
  A second registration under the same id REPLACES the first — that is the whole phase-one
  mechanism: MC keeps shipping its copy, a companion registering the same id wins by loading
  after it; disable the companion and MC's copy is back.
- **`scripts/cm-panel.js`** (756 lines) — the DM panel's Crooked Moon tab lifted out of
  `dm-panel.js` by exact line ranges: all nine drawer bodies, the click/change/input/keydown
  dispatch as `onClick/onChange/onInput/onKeydown(ev, ctx) → true when handled`, the §31 v3 twist
  popup as `onRegister(ctx)`. The panel lends `ctx = { render, drawer, backPicker, panelEl }`.
- **`scripts/cm-shell.js`** (292 lines) — the phone's Crooked Moon tab lifted out of `shell.js`:
  tab body, twist panel, tarot hand (as the tab's `header`), spend/withdraw, the seven handler
  cases as `onAction(action, el, ctx)`. The four private class fields became the pack's
  per-instance `state` (`initialState()`); `chipClass(effect)` marks curse chips; `dot(ctx)` is
  the tab's attention dot.
- **`scripts/cm-chapter.js`** — the Character File's "Fate" chapter (tarot/thread/curses).
- **`scripts/cm-pack.js`** — the built-in pack: the ten Crooked Moon settings (moved out of
  `settings.js`), the ten Effects-table entries + the ticket phone effect + one-shots + remount
  (moved out of `effects.js`), the hooks (`registerTwists`, `registerDruskenvald`,
  `initCurseSweep`, `registerTrainFollow`, the plain-words teleport strings from `main.js`), the
  Druskenvald darkness curve, the entrances, `api.train`, the campaign-slot claim, the gate.
- **`scripts/walls.js`** — `wallsBlock` moved out of `cm-train.js`: `rpc.js` needed it, and an
  engine file importing a campaign file was the one reverse dependency the seam could not keep.
- Wired to the registry and syntax-clean: `dm-panel.js` (tab rail, flyout, Settings-tab gate
  switch, dispatch loops, repaint hooks), `shell.js` (campaign tab slot, headers, chip class,
  action loop, draft capture, gate hooks), `settings.js` (`registerPackSettings()` first),
  `effects.js` (defs/phone absorbed at load and on `mobile-command.packRegistered`), `daylight.js`.

## Stopping point (exactly)

The engine patch was applied file by file and halted at its third file. At `825b48b`:

1. `campaigns.js` — `activeCampaign()` still reads `crookedMoonTools` directly (should return
   `packCampaign()?.id`).
2. `character-file.js` — still imports fateweaving/cm-curses/tarot and lists `chFate`, which was
   already cut out of it (→ `packChapters()` spliced before "downtime"). **This file is broken at that commit.**
3. `entrances.js` — still imports `CM_ENTRANCES` and has its own `cmToolsOn()` (→ `packEntrances()`,
   and `entranceByKey` searching every pack, gated or not).
4. `region-sound.js` — still reads `CUE_SETS` directly (→ merge `packCueSets()`).
5. `main.js` — still imports cm-train/twists/druskenvald/actions-cm, still calls
   `registerTwists/registerDruskenvald/registerTrainFollow/plainTeleportWording`, still builds
   `MobileCommand.train`; needs `import "./cm-pack.js"`, `mountPackHooks()` at ready, and
   `Object.assign(globalThis.MobileCommand, packApi(...))`.
6. `packs.js` — **`packFxPhone()` is missing** (and its doc line); `effects.js` already imports it,
   which is why the module fails to load at that commit.

The exact patch text for 1–6 is in the session scratchpad script `patch-engine.mjs` (main.js and
packs.js entries at its end); the three files it had already applied (effects, daylight, and the
campaigns attempt) are the ones to skip on a re-run. Mind CRLF: `effects.js` had a stray CR on
one line, so the script normalises `\r\n` before matching.

## What finishing would take

- **Phase one, MC side:** about an hour. Apply 1–6, syntax gate, headless suite, then boot a
  bench COPY (bench rule #0 — the join-page title decides whether a world is active) and check:
  Crooked Moon tab on the panel rail and on a phone, séance toggle, tarot deal, train drawer,
  Druskenvald clock, curse chips, Fate chapter compiles, `MobileCommand.train` present.
- **The companion module** (`mobile-command-crooked-moon`): one to two hours. New repo; copy
  `cm-entrances`, `cm-boarding`, `cm-live`, `actions-cm`, `seance`, `tarot`, `cm-train`,
  `cm-curses`, `druskenvald`, `fateweaving`, `twists`, `cm-panel`, `cm-shell`, `cm-chapter`,
  `cm-pack`; rewrite engine imports to `/modules/mobile-command/scripts/<file>.js` (same module
  instances — the registry is shared); manifest `requires: mobile-command`; move the ~126 CM
  selectors out of `styles/shell.css` and the séance/planchette/candles art; move
  `tools/test-tarot|druskenvald|twists|entrances.mjs`. Symlink into `Data/modules` to test.
- **Phase two:** delete MC's copies once the companion has run a session.

## Contradictions with the outside analysis (measured here)

- Not ~223 CM lines in the engine: ~500 across dm-panel (268), shell (133), effects, settings,
  main, character-file, campaigns, daylight, rpc. Still about 2%, and still imports + tab bodies
  rather than logic branches — the analysis's conclusion holds, its count didn't.
- `downtime.js` (§17) and `deeds.js` (§44.4) are **not** Crooked Moon; they were in its list.
  `druskenvald.js`, `fateweaving.js`, `twists.js`, the Fate chapter and `cm-entrances` **are**, and
  were missing from it. Real CM total ≈ 6,900 lines, not 7,383.
- One reverse dependency the analysis did not see: `rpc.js` imported `wallsBlock` from
  `cm-train.js` (fixed by `walls.js`).
- `cue-sets.js` (§53) is the DM's own audio-library paths, not shippable campaign content; the
  `cueSets` contribution exists for a pack that ships its own, but nothing needed to move.
- Data stays put, as promised: every pack setting and flag keeps the `mobile-command` namespace
  (the registry registers pack settings under MC's namespace on purpose). No migration.

## The one design constraint that shapes the next attempt (deck-command, 2026-09-23)

The deck consumes a companion's **declarative registry — `actions()` + `runAction(id)`** — not
MC's individual verbs. `scripts/actions-cm.js` already publishes the Crooked Moon in that shape:
~42 actions across 12 groups through `defineActions()` (id, area, group, label, does, kind, on(),
choices(), run()). The companion's contract must preserve that list verbatim — same ids, same
groups — so the deck's key bindings survive the move. In the WIP, `cm-pack.js` keeps
`import "./actions-cm.js"` for exactly this reason; when the companion ships, `actions-cm.js`
moves with it and registers through MC's `actions.js` (`defineActions`) unchanged.
