# Spike 2 — remaining half: `completeActivityUse` + `targetUuids` from a no-canvas client

> **RESULT (2026-06-12): FAILED at expected result 3** — `Error: You must provide an embedded Document instance as the input for a PlaceableObject`, thrown from midi's `Workflow` constructor (`getOrCreateTokenForActor`, utils.ts:121) while resolving the **attacker's** token placeable, before any card/roll. Preconditions 1–2 passed. Verdict and full stack recorded in DESIGN.md §8: **Route A dead on no-canvas clients → Spike 3 / Route B.** This document is retained as the test record.

**Prepared overnight 2026-06-12.** World: **Offline test** (`offline-test`, the Restored Keep scene — confirmed the spike world; the Giant Spider from the in-canvas pass is in it, HP already reduced by yesterday's test). Stack verified against installed source: Foundry 14.363 · dnd5e 5.3.3 · midi-qol 14.0.8.

## What this test decides

Route A (D5) lives or dies here: can a client with **no canvas** trigger a midi workflow with **code-supplied target UUIDs** and have damage land + bookkeeping run, with zero canvas exceptions?

**Source-analysis prediction (verify, don't trust):** midi's `getToken()` (midi-qol.js:20003) resolves a token UUID to `TokenDocument.object` — the *canvas placeable*, which is `null` when the canvas is disabled. `completeActivityUse` builds its target set through `getToken` (midi-qol.js:15738–15745), so the predicted failure is **targets silently dropped** (workflow fires target-less), not an exception. Result 6 below is the decision point.

## Call shape (verified against midi-qol 14.0.8 source — corrects the earlier note)

```js
MidiQOL.completeActivityUse(
  activityOrUuid,                                  // Activity instance or its UUID string
  { midiOptions: { targetUuids: [...], ... } },    // ← targetUuids goes HERE (2nd arg, usage.midiOptions)
  {},                                              // dialog
  {}                                               // message
)
```

The earlier Spike-2 note recorded `targetUuids` in a third options argument — that slot is actually `dialog`. The third/fourth args are dnd5e's `dialog`/`message`; everything midi-specific rides in `usage.midiOptions`.

## One-time setup (DM, normal canvas client — write op in test world, allowed)

- ✅ Done 2026-06-12: users now mirror the production topology — **player 1** owns *Fighter (Level 3, Eldritch Knight)*, **player 2** owns *Wizard (Level 3, Evoker)*, **TV** has ownership across PC tokens. **The test client logs in as player 1** (the snippet requires Owner on the Fighter *actor*; its `isOwner` precondition verifies this).
- If Monk's Common Display is configured to take over a user's screen in this world, don't use that user for the test (it hides the UI; we need the console and chat visible).

## Standing up the no-canvas client

1. Open a **separate browser profile or private/incognito window** (Foundry logins are per-profile cookies; a normal window would reuse/steal the DM's session).
2. Go to `http://localhost:30000/join` and log in as **player 1** (the Fighter's owner).
3. Disable the canvas **in this window only** (`core.noCanvas` is a per-client setting — do NOT toggle it in the GM window). Easiest via console (F12):
   ```js
   await game.settings.set("core", "noCanvas", true); location.reload();
   ```
   (UI route: ⚙ → Game Settings → Core → search "canv" → check **Disable Game Canvas** → Save Changes.) To restore later: same line with `false`.
4. Press **F12** → Console tab. Keep the chat log visible.

## Test snippet (paste whole block into the console)

```js
// SPIKE 2 — no-canvas half. Read-only until the activity fires; damage applies to the
// Giant Spider in the test world only.
(async () => {
  const out = (...a) => console.log("SPIKE2 |", ...a);

  // Preconditions
  out("noCanvas setting:", game.settings.get("core", "noCanvas"), "| canvas ready:", canvas?.ready ?? "n/a");
  out("user:", game.user.name, "| isGM:", game.user.isGM);
  const actor = game.actors.getName("Fighter (Level 3, Eldritch Knight)");
  if (!actor) return out("ABORT: Fighter actor not found");
  out("attacker:", actor.name, "| isOwner:", actor.isOwner);

  const item = actor.items.find(i => i.type === "weapon" && i.system.activities?.size
    && i.system.activities.some(a => a.type === "attack"));
  if (!item) return out("ABORT: no weapon with an attack activity");
  const activity = item.system.activities.find(a => a.type === "attack");
  out("activity:", item.name, "→", activity.name, "|", activity.uuid);

  // Find the Giant Spider TOKEN DOCUMENT in the active scene — documents exist without canvas
  const scene = game.scenes.active;
  const targetDoc = scene?.tokens.find(t => t.name === "Giant Spider");
  if (!targetDoc) return out("ABORT: no Giant Spider token in active scene:", scene?.name);
  const hpBefore = targetDoc.actor?.system.attributes.hp.value;
  out("target:", targetDoc.name, "|", targetDoc.uuid, "| HP before:", hpBefore);

  // THE CALL UNDER TEST
  const wf = await MidiQOL.completeActivityUse(
    activity.uuid,
    { midiOptions: { targetUuids: [targetDoc.uuid], ignoreUserTargets: true } },
    {}, {}
  );
  // (The await resolves only after the whole workflow completes or aborts — click the
  //  attack/damage buttons on the chat card while it waits; 90 s timeout returns undefined.)

  out("workflow returned:", !!wf,
      "| workflow targets:", wf ? Array.from(wf.targets ?? []).map(t => t?.name) : "n/a");
  out("HP after:", targetDoc.actor?.system.attributes.hp.value, "| was:", hpBefore);
})();
```

## Expected results — numbered; observe ONE at a time; STOP at the first failure and record what was observed instead

1. The player 1 client loads the world with **no canvas** (sidebar/chat only); the snippet's first line prints `noCanvas setting: true`.
2. Preconditions all print affirmatively: `isOwner: true`, an attack activity UUID, the Giant Spider token UUID, and a numeric `HP before`.
3. Pasting the snippet and firing the call throws **no exception** in the console — specifically nothing touching `canvas.tokens`, `.object`, or placeables. (Pass criterion "zero canvas exceptions".)
4. An attack card for the weapon appears in the chat log **on the player 1 client**.
5. The card (or hover detail) shows **Giant Spider as the workflow's target** — i.e. the code-supplied UUID survived into the workflow. *(Predicted failure point: targets silently empty because `getToken` returns `undefined` without a canvas. If the final `workflow targets:` log prints `[]`, record result 5 FAILED even if a card rendered.)*
6. Clicking the card's **Attack** button rolls the attack and midi marks **hit/miss vs the spider's AC** (hit check ran against a real target).
7. Clicking **Damage** rolls damage and the spider's HP **drops by the rolled amount automatically** — compare the snippet's `HP after` line (re-run just that read if needed: `game.scenes.active.tokens.find(t => t.name === "Giant Spider").actor.system.attributes.hp.value`).
8. On the **DM client**, the compact GM damage notification appears (e.g. "-N, X→Y"), and the player 1 console shows the snippet's final lines with `workflow returned: true` and non-empty targets — no orphaned-workflow warnings.

## Interpreting the outcome (per DESIGN.md §8)

- **All 8 pass** → Spike 2 PASSED in full; Route A is the build path. Record in DESIGN.md.
- **Fails at 5 (empty targets, no exception)** → matches the source-analysis prediction: midi 14's target plumbing requires canvas placeables. Route A as-is is dead on no-canvas clients. Options to record before moving to Spike 3 / Route B: (a) Route B (Service client executes; phones pre-resolve choices) as designed; (b) investigate a surgical libWrapper patch of midi's `getToken` to fall back to TokenDocument when `object` is null — attractive but it's patching midi internals, weigh against D6's churn-isolation principle.
- **Fails at 3 (canvas exception)** → harder failure than predicted; capture the stack trace verbatim into DESIGN.md before any conclusions.
