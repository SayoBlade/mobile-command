// "No PCs in scene" — the TV's card for a map it cannot see (DM 2026-11-08, ledger 0ˡ, DESIGN §23.7).
//
// The TV sees through the party's eyes. On a scene with token vision and no PC token there yet (10.9
// before "They arrive"), it has nothing to see through and Foundry draws only the grid on black — twice
// on 2026-11-07 that read as a broken TV. His answer: "Same popup as tv sound one saying no PCs in scene".
//
// So it is the sound card's twin, on the same screen: the TV. Same look (styles/shell.css groups the two),
// same behaviour: centred, any tap anywhere closes it, and it removes itself the moment the cause is gone
// (a PC token the TV can see appears, or token vision is turned off). Once per scene per load: a scene it
// has been shown for never brings it back until the TV reloads, however often the party comes and goes.
//
// ⚠️ NOT ON THE DM'S SCREEN. A full-screen card there would break §22.7 (the DM's screen is never
// covered); `#mc-tv-nopc` is on the rail list in shell.css and overlay-guard.js like the sound card.
// It is not a toast either, so the notifier's five-a-burst cap is untouched: one card, at most one.

/**
 * Whether the TV has no PC to see through on this scene (pure).
 * `tokens`: [{ hidden, sight, observed, pc }] — `observed` the TV account may see through it
 * (OBSERVER or better on its actor), `pc` its actor is a player character, `sight` its vision is on.
 */
export function tvSeesNoPc({ tokenVision, tokens = [] } = {}) {
  if (!tokenVision) return false; // no token vision: the whole map shows anyway
  return !tokens.some((t) => t && t.pc && t.observed && !t.hidden && t.sight !== false);
}

/**
 * ⚠️ A SCENE CAN SAY "NOT HERE" (DM 2026-11-14, via the lead, watching the TV on the intros' scene): the card is right
 * by its rule there (no party token), but wrong for a scene whose point is not the party. `flags.mobile-command.tvNoPc`:
 *   absent / "card"  the card, as above;
 *   "fit"            never the card: the TV frames the whole map instead (a room that is itself the picture);
 *   "black"          never the card and nothing else: the screen stays as it is (a scene held dark on purpose, e.g.
 *                    a ride's black hold before its lights come up).
 * Pure.
 */
export const NO_PC_FLAG = "tvNoPc";
export function noPcPolicy(flags = {}) {
  const v = String(flags?.[NO_PC_FLAG] ?? "card");
  return v === "fit" || v === "black" ? v : "card";
}

/** What to show now (pure): "card" or null. `shown` = the scene ids it has already been shown for. */
export function noPcCard({ noPc, sceneId, shown, policy = "card" }) {
  if (!noPc || !sceneId || policy !== "card") return null;
  return shown?.has?.(sceneId) ? null : "card";
}

export const NO_PC_ID = "mc-tv-nopc";

/** Display clients only. `isDisplayClient` is passed in so this file needs nothing from the shell. */
export function setupTvVisionCard({ isDisplayClient, moduleId = "mobile-command", fitScene = () => false } = {}) {
  const shown = new Set();   // scene ids: shown once, never again this load
  let cardScene = null;      // the scene the card on screen is about
  let fitted = null;         // the scene a "fit" has framed since its canvas came up

  const facts = () => {
    const scene = canvas?.scene;
    if (!scene) return null;
    const tokens = Array.from(scene.tokens ?? []).map((t) => {
      const actor = t.actor;
      return {
        hidden: !!t.hidden,
        sight: t.sight?.enabled !== false,
        observed: !!actor?.testUserPermission?.(game.user, "OBSERVER"),
        pc: actor?.type === "character" || actor?.hasPlayerOwner === true,
      };
    });
    return { sceneId: scene.id, noPc: tvSeesNoPc({ tokenVision: !!scene.tokenVision, tokens }), policy: noPcPolicy(scene.flags?.[moduleId]) };
  };

  const remove = () => { document.getElementById(NO_PC_ID)?.remove(); cardScene = null; };

  const show = () => {
    try {
      if (!isDisplayClient?.()) return;
      const f = facts();
      const card = document.getElementById(NO_PC_ID);
      // The cause is gone, or the TV is on another scene now: the card goes.
      if (card && (!f || !f.noPc || f.sceneId !== cardScene || f.policy !== "card")) remove();
      // "fit": the map is the picture, so the TV frames it, once a canvas (his own reframes win after that)
      if (f?.policy === "fit" && fitted !== f.sceneId) { fitted = f.sceneId; setTimeout(() => { try { fitScene(); } catch (e) { /* the next canvas */ } }, 300); }
      if (!f || document.getElementById(NO_PC_ID)) return;
      if (noPcCard({ ...f, shown }) !== "card") return;
      shown.add(f.sceneId);
      cardScene = f.sceneId;
      const el = document.createElement("div");
      el.id = NO_PC_ID;
      el.innerHTML = `<div class="mc-au-card">
        <i class="fas fa-user-slash mc-au-ico"></i>
        <div class="mc-au-title">No PCs in scene</div>
        <div class="mc-au-sub">This screen sees through the party's eyes, and none of them is on this map yet.
          It lights up when they arrive. Tap anywhere to close.</div>
      </div>`;
      const onTap = () => remove();
      el.addEventListener("click", onTap);
      el.addEventListener("touchend", onTap, { passive: true });
      document.body.appendChild(el);
      console.log(`${moduleId} | TV: no PC token to see through on "${canvas.scene?.name}" — card shown`);
    } catch (e) { console.warn(`${moduleId} | no-PC card failed`, e); }
  };

  // Settle after the canvas has its tokens; a token arriving or being revealed clears it.
  const soon = () => setTimeout(show, 400);
  Hooks.on("canvasReady", () => { fitted = null; soon(); });
  Hooks.on("createToken", soon);
  Hooks.on("updateToken", soon);
  Hooks.on("deleteToken", soon);
  Hooks.on("updateScene", (s, change) => { if (s?.id === canvas?.scene?.id && ("tokenVision" in (change ?? {}) || change?.flags?.[moduleId] && NO_PC_FLAG in change.flags[moduleId])) soon(); });
  soon();
  return { show };
}
