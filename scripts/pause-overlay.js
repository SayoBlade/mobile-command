import { MODULE_ID } from "./preset.js";

// Quieter pause cue (DM 2026-07-19): Foundry's centred "GAME PAUSED" overlay covers the canvas and
// hid a travel journey outright. Replace it with four small spinning icons in the screen corners —
// no text, no dark band, the map stays fully visible. CSS hides core #pause and shows
// #mc-pause-corners only while paused; this module just builds the DOM once and keeps a body class
// (mc-game-paused) in sync with game.paused via the pauseGame hook. Non-phone clients only (phones
// have their own full-screen shell + never render #pause).
export function initPauseOverlay() {
  try {
    if (document.getElementById("mc-pause-corners")) return;
    const wrap = document.createElement("div");
    wrap.id = "mc-pause-corners";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML = ["tl", "tr", "bl", "br"]
      .map(c => `<i class="fas fa-circle-notch mc-pause-spin mc-pc-${c}"></i>`).join("");
    document.body.appendChild(wrap);
    const sync = () => document.body.classList.toggle("mc-game-paused", !!game.paused);
    Hooks.on("pauseGame", sync);
    sync(); // reflect the current state at load (a world can start paused)
  } catch (e) { console.warn(`${MODULE_ID} | pause overlay init failed`, e); }
}
