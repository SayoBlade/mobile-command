# Spike 3 — Route B: Service client executes item use on the player's behalf

> **RESULTS (2026-06-12, live, two-client topology):**
> - **Test 0 ✅** — plain ability check rolls fine on a no-canvas client (dialog + chat result, no exceptions). Failure boundary confirmed: only midi workflows are canvas-bound.
> - **Test A ✅ (after one finding)** — relay via `midiOptions.asUser` works end-to-end: no-canvas player triggered, GM client executed, explicit `targetUuids` survived, fully fast-forwarded, damage auto-applied to the Giant Spider. **Finding: silent-abort trap.** First run produced no card, no damage, yet `relay resolved: true` — midi's `_completeActivityUse` returns `true` even when the workflow aborts before card creation (here: dnd5e refusing the cast at consumption with only a toast on the *executor* — confirmed: the Wizard had **0/4 level-1 slots**; with `consume: false` the same call landed damage, 13→10). Fix in test: `consume: false` in the usage config. **Consequence for §5:** the `item.use` RPC must not trust the relay's return value; it needs its own completion signal (hook-based) and must surface refusal reasons back to the phone (`{ok:false, stage, reason}` — already in the contract, now proven necessary).
> - **DM verdict on fast-forward (Q5):** "my only complaint is that the player didn't get to roll damage" — two-tap cadence confirmed as the requirement, not a nice-to-have.
> - **Test B ✅ (2026-06-12, after three vehicle/config corrections)** — Sacred Flame (Cleric → Fighter) from the executor: save request whispered to **player 1**, workflow **held pending** until player 1 rolled a DEX save **from their sheet on the no-canvas client** (roll dialog rendered fine there), failed 4 vs DC 13, damage applied 26→22 at the instant the die landed. Corrections discovered en route, all recorded in DESIGN.md: (1) `playerRollSaves: "letme"` is dead in midi 14 → silent auto-roll on the player's client; correct value is **`"chat"`**; (2) midi's chat-mode save request is **text-only — no button**; the player rolls from their sheet and midi intercepts the matching save roll (ideal for the phone UI: our save prompt just calls `actor.rollSavingThrow`); (3) dnd5e's chat-card "SAVING THROW" button requires **controlled tokens** → permanently dead on no-canvas clients; (4) earlier vehicles were invalid: this world's spider Bite has no save rider, and midi ignores explicit targets for area activities.
> - **Test C ✅ (accidental live deployment)** — the watchdog hook, unintentionally armed on player 1's window, caught `CharacterActorSheet`, `Players`, and `MidiRollChoiceDialog` renders and whispered each to the GM cross-client. Detection + reporting mechanism proven; formal injection on the executor unnecessary. **Cleanup: disarm it on player 1** (`Hooks.off("renderApplicationV2", globalThis.SPIKE3_WATCHDOG)`).
> - **SPIKE 3: PASSED** on all three §8 criteria. Route B + two-client topology validated end-to-end.

**Prepared 2026-06-12.** World: **Offline test** (Restored Keep). Stack: Foundry 14.363 · dnd5e 5.3.3 · midi-qol 14.0.8 — all snippets verified against installed source.

## What this spike decides

Route B is now the only path (Spike 2 killed Route A: midi Workflows cannot be constructed on no-canvas clients). Pass criteria per DESIGN.md §8: **(a)** a fully-resolved item use executes on the Service client when triggered from a player's no-canvas client, with damage landing and zero dialog stalls; **(b)** save prompts fan out to the *target owner's* client — including a no-canvas one; **(c)** a deliberately-injected dialog on the headless Service is caught by a watchdog prototype and reported.

**Key discovery from source (makes Route B cheap):** midi already ships the transport. `MidiQOL.completeActivityUse(activity, { midiOptions: { asUser: <userId>, ... } })` relays the entire call over midi's own socketlib channel to that user's client, where the Workflow is constructed locally (midi-qol.js:15823, handler `_completeActivityUse` at 22285). The triggering client never constructs a Workflow — Spike 2's crash path is bypassed. If this relay works, our §5 `item.use` RPC may reduce to a thin wrapper.

**Per-workflow roll overrides (verified):** `midiOptions.autoRollAttack: true`, `autoRollDamage: "always"`, `fastForward/fastForwardAttack/fastForwardDamage: true` override the world's manual-roll preset for that one workflow only (midi-qol.js:16890–16907, merged at 7597). The table preset stays untouched; only Service-executed workflows are fast-forwarded.

## Setup — REVISED for the proposed two-client topology (DESIGN.md §2.1): your app + ONE browser window

Under the §2.1 proposal the executor is the **DM Screen client itself** (your Foundry app, GM, canvas on) — no Service user exists. The snippets below resolve the executor via `game.users.activeGM`, so they work unchanged in either topology.

| Phase | Foundry app (= executor) | Browser window (swaps identity) |
|---|---|---|
| Tests 0 + A | Gamemaster, canvas on, **on the active scene** | **player 2** — no-canvas |
| Test B | Gamemaster (run Test B snippet here) | log out → log in as **player 1** — no-canvas |
| Test C | Gamemaster (watchdog + injected dialog here) | — |

For the player window run once: `await game.settings.set("core","noCanvas",true); location.reload();` — the flag is per browser profile, so it survives the player 2 → player 1 swap.

*Optional variant — dedicated Service user:* if testing the original three-client topology instead, create user "Service" with role **Gamemaster** (the role is load-bearing: executing other players' activities, hidden-token math, and midi's GM-side damage application are all GM-gated; Trusted Player cannot stand in), log it into a separate window with canvas ON, and run the Test B/C snippets there instead of the app. The Test A snippet picks it up automatically if it's the only *other* active GM — or hardcode `game.users.getName("Service")`.

---

## Test 0 — pre-test: plain system roll on a no-canvas client (2 min)

Confirms Spike 2's failure boundary: only *midi workflows* are canvas-bound; plain rolls must work, or the whole phone sheet concept is in trouble.

On **player 2** (no-canvas) console:

```js
await game.actors.getName("Wizard (Level 3, Evoker)").rollAbilityCheck({ ability: "int" });
```

1. The roll-configuration dialog renders on the no-canvas client (this is the dialog phones will see; click Normal).
2. The check result appears in chat; **no exception** in the console.

## Test A — Route B relay: player 2 triggers, Service executes

Magic Missile chosen deliberately: no attack roll, no save, no AoE template (template placement would stall the headless client — templates are DM-placed per MVP design anyway). Consumes one level-1 slot — fine in the test world.

On **player 2** (no-canvas) console:

```js
(async () => {
  const out = (...a) => console.log("SPIKE3A |", ...a);
  const svc = game.users.activeGM;                         // two-client topology: the DM Screen client is the executor
  out("executor:", svc?.name, "| active:", svc?.active);   // must be true — relay needs the target user online
  if (!svc?.active) return out("ABORT: no active GM client to execute on");
  const wiz = game.actors.getName("Wizard (Level 3, Evoker)");
  const item = wiz?.items.getName("Magic Missile");
  if (!item) return out("ABORT: Wizard/Magic Missile not found");
  const activity = item.system.activities.find(a => a.type === "damage") ?? item.system.activities.contents[0];
  const target = game.scenes.active.tokens.find(t => t.name === "Giant Spider");
  if (!target) return out("ABORT: no Giant Spider in active scene");
  const hpBefore = target.actor.system.attributes.hp.value;
  out("activity:", activity.name, activity.uuid, "| target HP before:", hpBefore);

  const res = await MidiQOL.completeActivityUse(
    activity.uuid,
    { midiOptions: {
        asUser: svc.id,                      // ← THE RELAY: execute on the executor (DM Screen / Service) client
        targetUuids: [target.uuid],
        ignoreUserTargets: true,
        fastForward: true, fastForwardAttack: true, fastForwardDamage: true,
        autoRollAttack: true, autoRollDamage: "always"
    } },
    { configure: false },                    // skip the slot-level dialog (defaults: level 1)
    {}
  );
  out("relay resolved:", res);
  await new Promise(r => setTimeout(r, 1500));   // let the HP update sync back
  out("target HP after:", target.actor.system.attributes.hp.value, "| was:", hpBefore);
})();
```

3. The snippet's preconditions print (`active: true`, activity UUID, numeric HP) and **no exception** appears on player 2's console — in particular no `PlaceableObject` error (proves the Workflow was not constructed locally).
4. The spell's chat card appears, **created by the executor user** (check the card's author — it should be the GM/Service user, not player 2).
5. **No dialog opens on the executor client** while the workflow runs (watch it during the cast) — proves the fast-forward overrides leave nothing waiting for a click.
6. Damage is rolled automatically and the spider's HP **drops** — `HP after` < `HP before` on player 2's console, and the DM app shows the compact damage notification.
7. `relay resolved: true` prints (midi's handler returns `true` on completion) — the await did not hang for 90 s.

## Test B — save prompt fan-out to the target owner (the heart of D1)

The Giant Spider's Bite forces a CON save against poison on hit. Service executes the spider's attack against the Fighter; the save prompt must land on **player 1's no-canvas client** (`playerRollSaves: "letme"`).

On the **executor** console (the Foundry app in the two-client topology):

```js
(async () => {
  const out = (...a) => console.log("SPIKE3B |", ...a);
  const spider = game.scenes.active.tokens.find(t => t.name === "Giant Spider");
  const bite = spider?.actor.items.getName("Bite");
  if (!bite) return out("ABORT: spider/Bite not found");
  const activity = bite.system.activities.find(a => a.type === "attack") ?? bite.system.activities.contents[0];
  const fighter = game.scenes.active.tokens.find(t => t.actor?.name.startsWith("Fighter"));
  if (!fighter) return out("ABORT: Fighter token not found");
  out("Bite →", fighter.name, "| Fighter HP before:", fighter.actor.system.attributes.hp.value);

  const wf = await MidiQOL.completeActivityUse(
    activity.uuid,
    { midiOptions: {
        targetUuids: [fighter.uuid],
        ignoreUserTargets: true,
        advantage: true,                      // raise hit odds; the save only triggers on a hit
        fastForward: true, fastForwardAttack: true, fastForwardDamage: true,
        autoRollAttack: true, autoRollDamage: "always"
    } },
    { configure: false },
    {}
  );
  out("workflow done:", !!wf, "| hit:", wf ? Array.from(wf.hitTargets ?? []).map(t => t.name) : "n/a");
  out("Fighter HP after:", fighter.actor.system.attributes.hp.value);
})();
```

8. The attack and damage auto-roll on the executor with no dialog appearing; if the attack **misses**, that's not a failure — re-run the snippet until it hits (advantage is set), then judge 9–11.
9. On a hit: **a CON save prompt renders on player 1's no-canvas window** — this single observation carries D1 (prompts route to owners' full clients even for Service-created workflows) AND prompt usability on canvas-less clients.
10. Player 1 clicks the save; midi evaluates it (whisper card per `autoCheckSaves: "whisper"`) and applies full/half poison damage accordingly — Fighter HP drops on the executor console's final line (the await resolves only after the save round-trip).
11. No orphaned-workflow warnings on the executor; the compact GM damage notification appeared.

## Test C — watchdog prototype: detect and report an unexpected dialog on the executor

Under the two-client topology the watchdog is a *notifier* (the DM can see the dialog) rather than a headless guard — but the detection mechanism is identical, and it must still prove out. On the **executor** console (the Foundry app):

```js
// Watchdog prototype: report ANY ApplicationV2 render on the Service client
globalThis.SPIKE3_WATCHDOG = Hooks.on("renderApplicationV2", (app) => {
  const title = app.title ?? app.options?.window?.title ?? "untitled";
  const msg = `WATCHDOG | application rendered on Service: ${app.constructor.name} — "${title}"`;
  console.warn(msg);
  ChatMessage.create({ content: msg, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
});
console.log("watchdog armed:", globalThis.SPIKE3_WATCHDOG);

// Deliberate injection (simulates a module throwing an unexpected dialog mid-workflow):
foundry.applications.api.DialogV2.prompt({ window: { title: "Injected test dialog" }, content: "<p>watchdog bait</p>" });
```

12. The injected dialog renders AND the console immediately prints the `WATCHDOG |` warning naming `DialogV2 — "Injected test dialog"`.
13. The same message arrives as a **whispered chat message visible to the GM** (in the dedicated-Service variant it must arrive on the DM app, not just the Service window — that's the "surface it to the DM" half of §6).
14. Cleanup: click the dialog away, then `Hooks.off("renderApplicationV2", globalThis.SPIKE3_WATCHDOG)` — no further watchdog output on the next sheet/dialog you open.

---

## Protocol

Observe results **in numbered order, one at a time. Stop at the first failure**, record the number and exactly what was observed (verbatim console output / screenshot), and bring it back. A Test B miss (result 8) is the only sanctioned re-run.

## Interpreting

- **0–7 pass** → Route B transport is proven *and free* (midi's own relay). The §5 `item.use` RPC becomes a wrapper that adds validation + our pre-roll choices.
- **8–11 pass** → D1 confirmed under Route B; the per-pair prompt routing the whole phone UX depends on works for Service-created workflows.
- **12–14 pass** → §6 watchdog is implementable with a one-hook prototype; productize with a safe-defaults list later.
- **3 fails with a permission error** → socketlib may gate player→GM relay; fallback: our own socketlib endpoint on Service that calls `completeActivityUse` locally (the §5 design as originally drawn). That's more code, not a dead end.
- **9 fails (no prompt on player 1)** → check `playerRollSaves` is still `"letme"` and player 1 owns the Fighter *actor*; if both hold and it still fails, this is a real Route B wound — record verbatim and stop.
