# Probe: does a phone's save reach midi? (S1, 2026-11-09)

**Confirmed live 2026-11-09** (deck-command SEAT-2026-11-09.md, "Probe: phone save"): midi used the phone's 14.
Revised after that run (actor-name lookup, `canvas.tokens.setTargets`, no template dialog) so it runs unattended.

For the seat lane. It confirms live what `tools/test-phone-save-counts.mjs` shows headless. Paste each snippet into its
tab's console (F12) **before** the save is cast. Both only log; they change nothing and are gone on the next reload.

**What the fix (ac79d01) does:** midi-qol 14.6.8 wraps actor rolls on every client, the phone included. When it posts
the save it re-derives the speaker from the actor, and on a client with no canvas that names **no token**. midi's
pending request is keyed by the **target token's id** and matches `message.speaker.token` only. MC's phone now puts the
token back in `preCreateChatMessage`.

## Setup (about 2 minutes, no fight)

1. Reload the GM client first, then Player1's tab (MC role **phone**).
2. Activate and view **10.9 Ghostlight Wreckage**. Make sure a **Test Barbarian** token is on it (drag the actor in if
   not) and a **Test Cleric** token too (the PC with no player online). No combat or Locomotive turn is needed.
3. The cast (step 4 of the GM snippet does it, no dialog, no template): the Locomotive's **Spirit Exhaust** at both.
   Paste the phone snippet FIRST: the GM snippet casts at once.

## Player1's tab (the phone)

```js
(async () => {
  const mc = await import("/modules/mobile-command/scripts/rpc.js");
  console.log("PROBE phone build: restoreRollSpeaker", typeof mc.restoreRollSpeaker, "· rollMessageFor", typeof mc.rollMessageFor, "· canvas.ready", !!canvas?.ready);
  Hooks.on("mobile-command.savePrompt", (p) => console.log("PROBE prompt in", { tokenUuid: p?.tokenUuid, actorUuid: p?.actorUuid, abilities: p?.abilities, dc: p?.dc, source: p?.source ?? "relay" }));
  Hooks.on("preCreateChatMessage", (doc) => { if (doc.rolls?.length) console.log("PROBE preCreate (after MC)", JSON.stringify(doc.speaker)); });
  Hooks.on("createChatMessage", (m) => {
    if (m.author?.id !== game.user.id || !m.rolls?.length) return;
    console.log("PROBE posted", { id: m.id, type: m.type, speaker: { ...m.speaker }, flagKeys: Object.keys(m.flags ?? {}), system: m.system?.toObject?.() ?? m.system, roll0: m.rolls[0]?.options, total: m.rolls[0]?.total });
  });
})();
```

## GM tab

```js
(() => {
  window.__mcProbe = {};
  Hooks.on("midi-qol.preTargetSave", (target, wf) => { __mcProbe.wf = wf; console.log("PROBE midi asks", { tokenId: target?.id ?? target?.document?.id, name: target?.name, tokenUuid: target?.document?.uuid ?? target?.uuid }); });
  Hooks.on("renderChatMessageHTML", (m) => {
    if (!m.rolls?.length || m.type !== "save") return;
    const pending = Object.keys(__mcProbe.wf?.saveRequests ?? {});
    console.log("PROBE save seen on GM", { author: m.author?.name, speakerToken: m.speaker?.token, speakerActor: m.speaker?.actor, pendingRequestIds: pending, matches: pending.includes(m.speaker?.token), total: m.rolls[0]?.total });
  });
  // 4. the cast, unattended (comment out to cast by hand). Found by ACTOR name: a dragged-in token carries the
  // prototype's name ("Barbarian", "Cleric"). Targets via canvas.tokens.setTargets (core 14.370 has no
  // game.user.updateTokenTargets). No template and no dialog, as the deck casts it (world.js useOn + steerPicked):
  // completeActivityUse with create.measuredTemplate false, then step midi past AwaitTemplate if it waits there.
  const byActor = (re) => canvas.tokens.placeables.filter((t) => re.test(t.actor?.name ?? ""));
  const loco = byActor(/locomotive/i)[0]?.actor;
  const act = loco?.items.find((i) => /spirit exhaust/i.test(i.name))?.system.activities.contents[0];
  const toks = byActor(/^test (barbarian|cleric)$/i);
  console.log("PROBE cast", loco?.name, act?.uuid, toks.map((t) => `${t.actor.name}=${t.id}`));
  canvas.tokens.setTargets(toks.map((t) => t.id));
  const run = MidiQOL.completeActivityUse(act.uuid, { create: { measuredTemplate: false },
    midiOptions: { targetUuids: toks.map((t) => t.document.uuid), workflowOptions: { autoRollDamage: "always", fastForwardDamage: true } } },
    { configure: false }, {});
  (async () => { // the deck's steerPicked, template part only
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const wf = [...(MidiQOL.Workflow?.workflows?.values?.() ?? [])].reverse().find((w) => w?.activity?.uuid === act.uuid);
      if (wf?.currentAction?.name === "WorkflowState_AwaitTemplate" && wf.needTemplate) {
        wf.expectedTemplateCount = 0; wf.performState(wf.WorkflowState_AwaitTemplate);
        console.log("PROBE stepped past the template"); return;
      }
      if (wf && /WaitForSaves|Completed/.test(wf.currentAction?.name ?? "")) return;
    }
  })();
  run.then(() => console.log("PROBE workflow done"), (e) => console.warn("PROBE workflow failed", e));
})();
```

## Expected (numbered; stop at the first that fails)

1. Phone: `PROBE phone build: restoreRollSpeaker function · rollMessageFor function · canvas.ready false`.
2. GM: two `PROBE midi asks` lines, Barbarian and Cleric, each with a token id.
3. Phone: `PROBE prompt in`, its `tokenUuid` ending in the **Barbarian's token id from 2**.
4. Tap **Roll Constitution DC 13** within 30 s. Phone: `PROBE preCreate (after MC)` shows `"token":"<that id>"`, and
   `PROBE posted` shows the same `speaker.token`.
5. GM: `PROBE save seen on GM` with `speakerToken` = that id, `pendingRequestIds` containing it, **`matches: true`**.
6. midi rolls **only the Cleric** GM-side, **within seconds** (a PC with no player online is not waited for; seen
   2026-11-09: ~5 s); no Barbarian roll on the GM side even past 30 s; midi's card lists the phone's total.

If 4 shows `"token":null` the restore did not run (copy the whole line). If 5 says `matches: false` with the right
token, copy `pendingRequestIds`: midi keyed the request differently.

## What changes in the world

- Chat: the cast's cards, two saves, the damage roll (delete them, or restage `chat: true`).
- HP: Spirit Exhaust's damage on the Barbarian and the Cleric (put back to full).
- Tokens: only what step 2 dragged in. User targets on the GM.
