# Morning Report — overnight run, 2026-06-12 (~01:00–02:00)

## TL;DR

Setup: git ✅, CLAUDE.md ✅, Foundry MCP ❌ (blocker — the server doesn't exist on this machine; details below). Task 1 ✅ with a surprise: **the range check is still active in the live world — the `none` you set yesterday did not persist.** Task 2: could not stand up a no-canvas client unattended, so it is **fully prepared** in [SPIKE2_NO_CANVAS_TEST.md](SPIKE2_NO_CANVAS_TEST.md) — including a source-level prediction of the outcome and a correction to the recorded API call shape. DESIGN.md updated with everything, dated.

## Completed

1. **Git repo initialized** (`master`, no commits — you didn't ask for a commit, so everything is still untracked; say the word and I'll make the initial commit).
2. **CLAUDE.md** written: DESIGN.md as source of truth, pinned stack, your test protocol (numbered expected results, one at a time, stop on first failure), conduct rules.
3. **Task 1 — midi settings diff (done via direct world-DB read, see "How" below):**
   - All 17 keys in the D4 table **match the live world exactly** — no drift.
   - The range-check key is **`ConfigSettings.optionalRules.checkRange`** (midi UI: **Mechanics** tab), values `none`/`longfail`/`longdisadv`, midi 14.0.8 default `"longFail"`. Back-filled into the D4 table.
   - ⚠️ **The live world still holds `"longFail"`** — your `none` did not save. Likely cause: midi's config panel only persists on **Save Changes** (I ruled out midi's startup migrations rewriting it — they never overwrite `"none"`). It also wasn't saved into the other test world ("Test" — checked what was readable; and that world isn't the spike world anyway).
   - Mechanism trap worth knowing: `checkRange` lives under `optionalRules` but is enforced via `checkMechanic()`, which **ignores `optionalRulesEnabled: false`** — Mechanics-tab rules apply even with optional rules "off". That's why yesterday's attack was blocked despite the preset. The Settings Enforcer must police `optionalRules.*` keys individually.
   - Bonus: the target-confirmation preset candidate's exact name is `midi-qol.TargetConfirmation` — and it's **client-scoped**, so the phone module must set it per client, not world-wide.
4. **Task 2 — Spike 2 no-canvas half, fully prepared:** [SPIKE2_NO_CANVAS_TEST.md](SPIKE2_NO_CANVAS_TEST.md) has the snippet, setup steps, and 8 numbered expected results. Two findings from verifying against installed source:
   - **Call-shape correction:** `targetUuids` belongs in the **second** argument — `completeActivityUse(activityUuid, { midiOptions: { targetUuids: [...] } }, {}, {})`. The third-arg shape recorded after the in-canvas pass is actually the `dialog` slot.
   - **Prediction:** midi resolves target UUIDs via `TokenDocument.object` — a canvas placeable that is `null` on a no-canvas client — so the likely failure is **silent target loss** at expected-result 5, not an exception. If it fails exactly there, the doc lists the two recorded options (Route B, or a libWrapper `getToken` fallback patch).
5. **DESIGN.md updated** (D4 table row, range-check finding, Spike 2 prep + corrections, no-canvas setting name) — all dated 2026-06-12.

## Blocked

1. **Foundry MCP registration — there is nothing to register.** `claude_desktop_config.json` (%APPDATA%\Claude) contains **no `mcpServers` at all**. I searched thoroughly: no server binary or Desktop-extension anywhere on disk, no node/npm runtime, nothing listening on the bridge port 31415, and Claude Desktop's logs back to May 18 never show a foundry MCP connection. What I *did* find: an old session's tool preferences referencing `local:foundry:*` tools (list-actors, get-scene, …) — so a "foundry" connector **did** exist in Claude Desktop at some point and is now gone (possibly lost in an app update; your Desktop updated recently). The Foundry-side bridge module (`foundry-mcp-bridge` 0.8.2, adambdooley/foundry-vtt-mcp) is installed and fine — it's the companion **MCP server process** that's missing.
2. **Running the no-canvas test live.** Browser automation required an interactive "pick which Chrome" prompt I couldn't answer unattended, and the preview harness refuses to attach to an externally-run server (Foundry on 30000). Logged rather than guessed; the test is prepared instead.
3. **Fixing `checkRange` myself.** The world DB is LevelDB, exclusively locked by the running Foundry server — no safe write path from outside a client, and per conduct I won't guess at one.

## Your exact next actions (priority order)

1. **Re-apply the range fix (2 min):** midi settings → Mechanics tab → range checking → **none** → **Save Changes** (the button matters). Verify: re-run yesterday's out-of-reach attack — it should roll instead of being blocked.
2. **Run the no-canvas test (10 min):** open [SPIKE2_NO_CANVAS_TEST.md](SPIKE2_NO_CANVAS_TEST.md), do the one-time setup (grant **TV** owner of the Fighter), then follow it exactly — stop at the first failed numbered result and note what you saw. This decides Route A vs Route B.
3. **Restore the Foundry MCP server:** in Claude Desktop check Settings → Extensions/Connectors for the old "foundry" entry. If it's gone, reinstall the server component from adambdooley/foundry-vtt-mcp (the Foundry-side bridge 0.8.2 is already installed — versions should match). Once it exists, tell me where it landed and I'll register it at user scope and verify with the actor list. Note: the `claude` CLI isn't on PATH; the bundled one is at `%APPDATA%\Claude\claude-code\2.1.170\claude.exe` — worth adding an alias.

## How the live settings were read without MCP or a client

The running world is `offline-test` ("Offline test" — it contains the Restored Keep scene and the half-damaged Giant Spider, i.e. the spike world). Foundry's world settings are LevelDB on disk; the most recent `midi-qol.ConfigSettings` record sits uncompressed in the write-ahead log (`Data\worlds\offline-test\data\settings\000022.log`), readable with shared-read access while the server runs. Read-only throughout — nothing was written to any world.
