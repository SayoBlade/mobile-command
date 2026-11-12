// A PHONE WHOSE HERO IS NOT ON THE TABLE'S MAP (§17.3, DM 2026-07-08: one shared screen, the DM picks the scene).
// Its token stands on another scene, so the phone waits behind a card instead of poking a board it can't act on.
//
// ⚠️ A STAGE IS NOT A SPLIT (seat LIVE TRY 2026-11-12, B0): during the introductions the table looks at the landing
// room while every hero's token waits hidden in the first car, and every phone read "Waiting for the party: you're on
// 10.1 Passenger Car (Colored), the action is on The Crooked Moon", which is wrong on both counts: nobody is
// separated, and nothing is wrong. A scene flagged `flags.mobile-command.stage` (a room the story is told in, where no
// hero stands) gets a calm card instead.
// Pure: no `game`, so it is tested in tools/test-split-state.mjs.
import { placeName } from "./crossing-name.js";

/**
 * @param {{ active: {id,name,flags,tokens:{actorId}[]}|null, scenes: {id,name,tokens}[], actorId: string|null,
 *           isCharacter?: boolean, packed?: boolean, charGen?: boolean }} s
 * @returns {null | { key: string, stage: boolean, hereName: string, activeName: string }}
 */
export function splitState({ active, scenes = [], actorId, isCharacter = true, packed = false, charGen = false } = {}) {
  if (charGen || !active || !actorId || !isCharacter) return null;
  const on = (sc) => [...(sc?.tokens ?? [])].some((t) => t?.actorId === actorId);
  if (on(active)) return null;                      // on the action scene
  const here = scenes.find((sc) => sc?.id !== active.id && on(sc));
  if (!here) return null;                           // no token anywhere (char-gen, limbo): not a split
  if (packed) return null;                          // the hero rides inside the party token
  return { key: `${active.id}:${here.id}`, stage: active.flags?.["mobile-command"]?.stage === true,
    hereName: placeName(here.name), activeName: placeName(active.name) };
}

/** What the card says. A stage is calm: no hourglass, no "you're on", nothing to fix. */
export function splitCard(st) {
  if (!st) return null;
  if (st.stage) return { calm: true, icon: "fa-masks-theater", title: "The story is about to begin",
    sub: "Watch the big screen. The DM will bring you in." };
  return { calm: false, icon: "fa-hourglass-half", title: "Waiting for the party",
    sub: [`You're on `, st.hereName, ` — the action is on `, st.activeName, `. The DM will bring the scene to you.`] };
}
