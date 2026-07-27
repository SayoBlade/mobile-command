import { MODULE_ID } from "./preset.js";
import { isPhoneClient, isDisplayClient } from "./shell.js";

// §36 All aboard — the Ghostlight Express boarding ritual (DM 2026-07-27). Campaign onboarding
// for the Crooked Moon: the DM puts the STATION on the table display (fog + the book's train
// art, loaded at runtime from the player's own installed the-crooked-moon-2014 module — we
// bundle nothing of theirs), INTRODUCES each character on the big screen (portrait card), and
// each player holds a life-size railway TICKET that fills their whole phone. When a player
// boards the train the DM takes their ticket — it gets PUNCHED and torn away on their screen.
//
// Wiring mirrors the séance: station + intro ride fxActive ("cmStation" bool, "cmIntro"
// { actorId }) so the TV re-applies after reloads; the ticket is a per-player state fx
// ("cmTicket" { users }) whose start/stop pair lives here and is injected into effects.js's
// PHONE_FX. The whistle is a one-shot ("cmWhistle"), synthesized — nothing licensed (§26).

const TRAIN_ART = "modules/the-crooked-moon-2014/assets/art/art book/Scene_4_The Ghostlight Express cropped.webp";

function eligible() {
  return !isPhoneClient() && (isDisplayClient() || game.user?.isGM);
}

/* -------------------------------------------- */
/*  The station (table display)                  */
/* -------------------------------------------- */

let stationRoot = null;
let introShown = null; // actorId currently on the card (to animate only on change)

export function cmStationSync(on, introActorId) {
  if (!eligible()) on = false;
  if (on && !stationRoot) {
    stationRoot = document.createElement("div");
    stationRoot.id = "mc-cmstation";
    stationRoot.innerHTML = `
      <div class="mc-cmst-fog mc-cmst-fog-a"></div>
      <img class="mc-cmst-train" src="${TRAIN_ART}" alt="" onerror="this.remove()">
      <div class="mc-cmst-beam"></div>
      <div class="mc-cmst-fog mc-cmst-fog-b"></div>
      <div class="mc-cmst-intro"></div>
      <div class="mc-cmst-vignette"></div>`;
    document.body.appendChild(stationRoot);
    introShown = null;
  } else if (!on && stationRoot) {
    stationRoot.remove(); stationRoot = null; introShown = null;
  }
  if (!stationRoot) return;
  // The introduction card: one PC at a time, swapped by the DM as each player takes the stage.
  const box = stationRoot.querySelector(".mc-cmst-intro");
  const actor = introActorId ? game.actors.get(introActorId) : null;
  if (!actor) { box.innerHTML = ""; introShown = null; return; }
  if (introShown === actor.id) return; // same card — don't restart the entrance animation
  introShown = actor.id;
  const esc = foundry.utils.escapeHTML;
  box.innerHTML = `
    <div class="mc-cmst-card">
      <img src="${esc(actor.img)}" alt="" onerror="this.style.display='none'">
      <div class="mc-cmst-name">${esc(actor.name)}</div>
      <div class="mc-cmst-rule"></div>
    </div>`;
}

/* -------------------------------------------- */
/*  The ticket (player phones, full screen)      */
/* -------------------------------------------- */

// start/stop injected into effects.js PHONE_FX under "cmTicket". The player is HOLDING the
// ticket — it covers everything until the DM takes it (boarding), which punches a hole
// through it and tears it away.
export const cmTicketFx = {
  start() {
    const d = document.createElement("div");
    d.className = "mc-cmticket";
    const holder = game.user.character?.name ?? game.user.name ?? "";
    const esc = foundry.utils.escapeHTML;
    d.innerHTML = `
      <div class="mc-cmt-paper">
        <div class="mc-cmt-border">
          <div class="mc-cmt-head">The Ghostlight Express</div>
          <div class="mc-cmt-orn">✦ ─────── ✦ ─────── ✦</div>
          <div class="mc-cmt-one">ONE<br>PASSENGER</div>
          <div class="mc-cmt-valid">Valid for night of issue only</div>
          <div class="mc-cmt-orn">✦ ─────── ✦ ─────── ✦</div>
          <div class="mc-cmt-holder">${esc(holder)}</div>
          <div class="mc-cmt-no">№ ${String((game.user.id ?? "0").split("").reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7)).padStart(4, "0")}</div>
        </div>
        <div class="mc-cmt-punch"></div>
      </div>`;
    document.body.appendChild(d);
    try { navigator.vibrate?.([25, 40, 25]); } catch (e) { /* not supported */ }
    return { el: d };
  },
  stop(h) {
    // Boarding: the conductor's punch — a hole slams through, then the ticket tears away.
    const el = h?.el;
    if (!el) return;
    el.classList.add("mc-cmt-punched");
    try { navigator.vibrate?.([60, 50, 90]); } catch (e) { /* not supported */ }
    punchSound();
    setTimeout(() => { try { el.remove(); } catch (e) { /* gone */ } }, 1700);
  }
};

/* -------------------------------------------- */
/*  Sound — synthesized, nothing licensed        */
/* -------------------------------------------- */

function audioOut() {
  const a = game.audio;
  if (!a || a.locked || !a.environment?.gainNode) return null;
  return { ctx: a.environment, dest: a.environment.gainNode };
}

// The conductor's punch: a bright mechanical CLACK — two tight noise taps, the second lower.
function punchSound() {
  const out = audioOut();
  if (!out) return;
  const { ctx, dest } = out;
  const len = Math.floor(0.1 * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  for (const [at, freq, lvl] of [[0, 2600, 0.5], [0.09, 1100, 0.35]]) {
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 2.2;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(dest);
    const t0 = ctx.currentTime + at;
    g.gain.setValueAtTime(lvl, t0);
    g.gain.exponentialRampToValueAtTime(0.002, t0 + 0.07);
    src.start(t0); src.stop(t0 + 0.12);
  }
}

// The Ghostlight's whistle (one-shot "cmWhistle", canvas clients only — phones would echo).
// A steam whistle is a CHORD, not a note: three detuned partials in a minor stack with a slow
// vibrato and a breath-noise bed, swelling in and sighing out. Two blasts, per the book's
// departure ("two short blasts… like the shrill note of a violin").
export function playTrainWhistle() {
  if (isPhoneClient()) return;
  const out = audioOut();
  if (!out) return;
  const { ctx, dest } = out;
  const blast = (at, holdS) => {
    for (const [f, lvl] of [[311, 0.16], [370, 0.20], [466, 0.13]]) { // D#4 / F#4 / A#4 — minor, mournful
      const o = ctx.createOscillator(); o.type = "triangle";
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.006);
      const vib = ctx.createOscillator(); vib.type = "sine"; vib.frequency.value = 4.6;
      const vibG = ctx.createGain(); vibG.gain.value = f * 0.006;
      vib.connect(vibG).connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(g).connect(dest);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(lvl, at + 0.09);
      g.gain.setTargetAtTime(0, at + holdS, 0.22);
      o.start(at); o.stop(at + holdS + 1.2);
      vib.start(at); vib.stop(at + holdS + 1.2);
    }
    // steam breath under the tone
    const src = ctx.createBufferSource();
    const len = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const dd = buf.getChannelData(0);
    for (let i = 0; i < len; i++) dd[i] = Math.random() * 2 - 1;
    src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(dest);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.05, at + 0.12);
    g.gain.setTargetAtTime(0, at + holdS, 0.25);
    src.start(at); src.stop(at + holdS + 1.2);
  };
  const t0 = ctx.currentTime + 0.03;
  blast(t0, 0.55);
  blast(t0 + 0.95, 1.1);
}
