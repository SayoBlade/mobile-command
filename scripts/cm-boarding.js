import { MODULE_ID } from "./preset.js";
import { isPhoneClient, isDisplayClient } from "./shell.js";
import { mountFaded, unmountFaded } from "./repaint.js"; // §6.8 fade, never cut

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
let trainShown = null; // JSON of the last train state applied (so the arrival plays once, on change)

// The stage is fog FIRST and train second (DM 2026-08-19: "all abord is very weak, I want some kind
// of swirling fog and the ability to 'bring in' the train"). The old station had the train pinned to
// the corner from the moment it opened, so there was nothing to arrive — the book's whole beat is
// that it "emerges from the gloom" while everyone is listening to the fog.
//
// Layers, back to front: three SWIRL sheets · the aimed train, itself carrying a mist sheet over
// the art · two more swirl sheets in front of it · the two drift bands · the introduction card ·
// vignette. All of it is transform-only — big blurred blobs rotating at rates that share no common
// factor, so the pattern where they overlap never visibly repeats — which means the GPU rasterises
// each blurred sheet once and then only re-composites it. No per-frame JS, no canvas: this has to
// run on the DM's machine next to everything else ([[flag-performance-cost]]).
export function cmStationSync(on, introActorId, train = null) {
  if (!eligible()) on = false;
  if (on && !stationRoot) {
    stationRoot = document.createElement("div");
    stationRoot.id = "mc-cmstation";
    stationRoot.innerHTML = `
      <div class="mc-cmst-swirl mc-cmst-sw1"></div>
      <div class="mc-cmst-swirl mc-cmst-sw2"></div>
      <div class="mc-cmst-swirl mc-cmst-sw4"></div>
      <div class="mc-cmst-aim">
        <div class="mc-cmst-trainwrap">
          <div class="mc-cmst-beam"></div>
          <img class="mc-cmst-train" src="${TRAIN_ART}" alt="" onerror="this.remove()">
          <div class="mc-cmst-overmist"></div>
        </div>
      </div>
      <div class="mc-cmst-swirl mc-cmst-sw3"></div>
      <div class="mc-cmst-swirl mc-cmst-sw5"></div>
      <div class="mc-cmst-fog mc-cmst-fog-a"></div>
      <div class="mc-cmst-fog mc-cmst-fog-b"></div>
      <div class="mc-cmst-intro"></div>
      <div class="mc-cmst-vignette"></div>`;
    mountFaded(stationRoot);
    introShown = null; trainShown = null;
  } else if (!on && stationRoot) {
    // Fade out, then remove — the DM's rule is that these never cut, in either direction.
    unmountFaded(stationRoot);
    stationRoot = null; introShown = null; trainShown = null;
  }
  if (!stationRoot) return;
  applyTrain(train);
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

// Bring the train in — or take it away again — and aim it.
//
// AIMING (DM 2026-08-19: "centered and aiming the right way… aimed at relevant players location").
// The shared screen lies FLAT on the table with people around it (§39 in-person mode), and §38.4b
// already stores who sits where along with a `rot` per seat — the angle at which that seat's own UI
// reads right-way-up for them. Rotating the whole train layer by that same angle is therefore the
// entire trick: the Ghostlight pulls up the right way round for the person whose turn it is, and
// upside-down for the person opposite, which is exactly true of a real train at a real platform.
// No seat (online table, nobody seated) → 0°, i.e. the DM's own orientation.
function applyTrain(train) {
  const key = JSON.stringify(train ?? null);
  if (trainShown === key) return; // same state — don't restart the arrival
  trainShown = key;
  const aim = stationRoot.querySelector(".mc-cmst-aim");
  const wrap = stationRoot.querySelector(".mc-cmst-trainwrap");
  if (!aim || !wrap) return;
  aim.style.setProperty("--mc-aim", `${Number(train?.rot) || 0}deg`);
  // Restart the arrival animation on every fresh "bring it in": remove the class, force a reflow,
  // add it back. Without the reflow the browser coalesces remove+add into no change at all.
  wrap.classList.remove("mc-in");
  if (train?.in) { void wrap.offsetWidth; wrap.classList.add("mc-in"); }
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
  const file = cueFile("sndTrainWhistle");
  if (file) { playFileCue(file, 0.9); return; }
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

/* -------------------------------------------- */
/*  The arrival cues (approach · stop)           */
/* -------------------------------------------- */

// Everything here is SYNTHESIZED so it ships with the module and nothing licensed is bundled (§26).
// But a synth steam engine is a stand-in for a real recording, so every cue first looks for a file
// the DM has pointed a setting at (`sndTrainApproach` / `sndTrainWhistle` / `sndTrainStop`, all
// file-picker settings) and plays that instead. Drop a recording in and it wins; drop nothing in and
// the table still hears a train. (DM 2026-08-19: "if possible put it in the mod, if not, just for me".)
export function cueFile(key) {
  try { return String(game.settings.get(MODULE_ID, key) || "").trim(); } catch (e) { return ""; }
}
function playFileCue(src, volume = 0.8, loop = false) {
  return playFile(src, { loop, volume });
}
function playFile(src, { loop = false, volume = 0.8 } = {}) {
  try { return foundry.audio.AudioHelper.play({ src, volume, loop, channel: "environment" }, false); }
  catch (e) { console.warn(`${MODULE_ID} | couldn't play ${src}`, e); return null; }
}

// The approach: a bed that FADES IN, so the DM can start it under the narration and let it grow
// while they talk ("in the distance you hear a mechanical sound"). It loops until stopped, because
// nobody can time a one-shot to a sentence they are still improvising.
//   Three parts, which is what makes an engine rather than a hum: a very low rolling rumble, a CHUFF
//   on a slow pulse (band-passed noise — the exhaust beat), and the far ring of steel wheels on
//   rail. The chuff rate creeps up across the fade: approaching, not idling.
let approach = null;

export function trainApproachPlaying() { return !!approach; }

export function playTrainApproach({ fadeS = 6 } = {}) {
  if (isPhoneClient()) return;      // phones would echo the table
  if (approach) return;             // already running
  const file = cueFile("sndTrainApproach");
  if (file) {
    const snd = playFile(file, { loop: true, volume: 0.02 });
    approach = { file: snd };
    Promise.resolve(snd).then((s) => {
      try { s?.fade?.(0.85, { duration: fadeS * 1000 }); } catch (e) { /* older sound api — it just starts quiet */ }
    });
    return;
  }
  const out = audioOut();
  if (!out) return;
  const { ctx, dest } = out;
  const t0 = ctx.currentTime + 0.02;
  const master = ctx.createGain(); master.gain.value = 0.0001;
  master.connect(dest);
  master.gain.exponentialRampToValueAtTime(0.9, t0 + fadeS);

  // One noise buffer, reused by every voice — one allocation instead of three.
  const len = Math.floor(2 * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const voice = (freq, q, gain, type = "bandpass") => {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    return { src, g, f };
  };
  const rumble = voice(58, 0.7, 0.5, "lowpass");   // the mass of the thing
  const rail = voice(3100, 1.4, 0.035);            // steel on steel, far off
  const chuff = voice(420, 1.1, 0);                // the exhaust beat, gated by the LFO below

  const lfo = ctx.createOscillator(); lfo.type = "sawtooth"; lfo.frequency.value = 1.5;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.16;
  lfo.connect(lfoG).connect(chuff.g.gain);
  lfo.frequency.linearRampToValueAtTime(2.6, t0 + fadeS);
  lfo.start(t0);

  approach = { ctx, master, nodes: [rumble.src, rail.src, chuff.src], lfo };
}

export function stopTrainApproach({ fadeS = 1.4 } = {}) {
  const a = approach;
  approach = null;
  if (!a) return;
  if (a.file) {
    Promise.resolve(a.file).then((s) => {
      try {
        s?.fade?.(0, { duration: fadeS * 1000 });
        setTimeout(() => { try { s?.stop?.(); } catch (e) { /* already gone */ } }, fadeS * 1000 + 60);
      } catch (e) { try { s?.stop?.(); } catch (e2) { /* already gone */ } }
    });
    return;
  }
  try {
    const t = a.ctx.currentTime;
    a.master.gain.cancelScheduledValues(t);
    a.master.gain.setValueAtTime(Math.max(0.0001, a.master.gain.value), t);
    a.master.gain.exponentialRampToValueAtTime(0.0001, t + fadeS);
    setTimeout(() => {
      for (const n of a.nodes) { try { n.stop(); } catch (e) { /* already stopped */ } }
      try { a.lfo.stop(); } catch (e) { /* already stopped */ }
    }, fadeS * 1000 + 80);
  } catch (e) { console.warn(`${MODULE_ID} | approach stop`, e); }
}

// The grinding stop: brakes. A steel SQUEAL sliding down in pitch while the rumble under it slows
// and dies, then the long hiss of released steam, then one iron clank as the couplings take up the
// slack. The book's own words are "rumbles, squeals, and creaks as it slows to a halt" — that is
// the order these are scheduled in.
export function playTrainStop() {
  if (isPhoneClient()) return;
  const file = cueFile("sndTrainStop");
  if (file) { stopTrainApproach({ fadeS: 2.6 }); playFile(file, { volume: 0.9 }); return; }
  const out = audioOut();
  if (!out) return;
  const { ctx, dest } = out;
  const t0 = ctx.currentTime + 0.02;
  // Whatever was approaching has arrived — duck it out under the brakes, rather than leaving an
  // engine running behind a train that has visibly stopped.
  stopTrainApproach({ fadeS: 2.8 });

  const len = Math.floor(3 * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  // 1. The squeal — two detuned resonant peaks sliding down together.
  for (const [f0, f1, q, lvl] of [[2350, 640, 16, 0.16], [3120, 880, 22, 0.10]]) {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f0; bp.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(dest);
    bp.frequency.setValueAtTime(f0, t0);
    bp.frequency.exponentialRampToValueAtTime(f1, t0 + 2.6);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(lvl, t0 + 0.35);
    g.gain.setValueAtTime(lvl, t0 + 1.7);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 2.9);
    src.start(t0); src.stop(t0 + 3.1);
  }
  // 2. The rumble slowing under it.
  {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 150;
    const g = ctx.createGain(); g.gain.value = 0.45;
    src.connect(lp).connect(g).connect(dest);
    lp.frequency.exponentialRampToValueAtTime(40, t0 + 2.8);
    g.gain.setValueAtTime(0.45, t0 + 1.2);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 3.0);
    src.start(t0); src.stop(t0 + 3.2);
  }
  // 3. Steam released — a long sigh once the wheels have stopped.
  {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(hp).connect(g).connect(dest);
    g.gain.setValueAtTime(0, t0 + 2.5);
    g.gain.linearRampToValueAtTime(0.12, t0 + 2.9);
    g.gain.setTargetAtTime(0, t0 + 3.4, 0.9);
    src.start(t0 + 2.5); src.stop(t0 + 6.2);
  }
  // 4. The couplings taking up the slack — one iron clank, and it has stopped.
  {
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 180; bp.Q.value = 3.5;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(dest);
    const at = t0 + 3.05;
    g.gain.setValueAtTime(0.5, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
    src.start(at); src.stop(at + 0.6);
  }
}

/* -------------------------------------------- */
/*  The fiddle (§36.1.8, DM 2026-08-19)          */
/* -------------------------------------------- */

// The book's FIRST beat — before the engine, before anything: "The haunting tune of a lone fiddle
// pierces through the fog." And it never really leaves the scene: the Vagrant steps out fiddle in
// hand, so unlike the engine bed the grinding stop does NOT duck it — the train dies, the fiddler
// plays on. A bed like the approach: toggled, loops until stopped, fades in from nothing (it
// pierces the fog; it doesn't walk into the room). File override `sndTrainFiddle` wins when set.
//
// The synth is a bowed string reduced to what survives fog and a TV speaker: a sawtooth (a bow IS
// a sawtooth — stick, slip) through a lowpass + one body-formant peak; vibrato that arrives a beat
// AFTER each note lands (players do this — a synth that vibratos from t0 reads as an organ); a
// whisper of highpassed noise riding the same envelope (the bow's breath); and a slow minor air in
// D — a call and a darker answer, rubato'd differently on every pass so a long scene never hears
// the loop. Notes slide into each other within a phrase (a finger, not a keyboard).
let fiddle = null;

export function trainFiddlePlaying() { return !!fiddle; }

export function playTrainFiddle({ fadeS = 3.5 } = {}) {
  if (isPhoneClient()) return;      // phones would echo the table
  if (fiddle) return;               // already playing
  const file = cueFile("sndTrainFiddle");
  if (file) {
    const snd = playFile(file, { loop: true, volume: 0.02 });
    fiddle = { file: snd };
    Promise.resolve(snd).then((s) => {
      try { s?.fade?.(0.8, { duration: fadeS * 1000 }); } catch (e) { /* older sound api — it just starts quiet */ }
    });
    return;
  }
  const out = audioOut();
  if (!out) return;
  const { ctx, dest } = out;
  const master = ctx.createGain(); master.gain.value = 0.0001;
  master.connect(dest);
  master.gain.exponentialRampToValueAtTime(0.8, ctx.currentTime + fadeS);

  // The instrument's fixed half — built once, shared by every note.
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2800; lp.Q.value = 0.7;
  const body = ctx.createBiquadFilter(); body.type = "peaking"; body.frequency.value = 980; body.Q.value = 1.6; body.gain.value = 7;
  lp.connect(body).connect(master);
  // The bow's breath: one looped noise source; its gain follows each note far underneath it.
  const nlen = Math.floor(1.5 * ctx.sampleRate);
  const nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  const nsrc = ctx.createBufferSource(); nsrc.buffer = nbuf; nsrc.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3600;
  const ngain = ctx.createGain(); ngain.gain.value = 0;
  nsrc.connect(hp).connect(ngain).connect(master);
  nsrc.start();

  const state = { ctx, master, ngain, nsrc, notes: [], timer: null };
  fiddle = state;

  // D minor, drooping — G4..F5, the fiddle's speaking range. [frequency, base duration].
  const A = [[587.33, 1.5], [440, 0.7], [587.33, 0.7], [659.25, 0.9], [698.46, 1.3], [659.25, 0.7], [587.33, 0.7], [554.37, 1.5], [587.33, 2.4]];
  const B = [[698.46, 1.2], [659.25, 0.7], [587.33, 0.9], [440, 1.3], [466.16, 1.2], [440, 0.7], [392, 0.9], [440, 2.6]];

  const note = (f, t0, durS, prevF) => {
    const o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(prevF || f * 0.985, t0);
    o.frequency.exponentialRampToValueAtTime(f, t0 + 0.07);
    const vib = ctx.createOscillator(); vib.type = "sine"; vib.frequency.value = 5.7;
    const vibG = ctx.createGain(); vibG.gain.value = 0;
    vib.connect(vibG).connect(o.frequency);
    vibG.gain.setValueAtTime(0, t0);
    vibG.gain.linearRampToValueAtTime(f * 0.008, t0 + Math.min(0.45, durS * 0.5));
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g).connect(lp);
    // Levels measured offline (2026-08-19): at 0.16/0.55 the sustained RMS sat at 0.05 — under the
    // engine bed it is supposed to pierce. 0.2/0.8 lands ~0.09 RMS, peak ~0.28, still clip-free.
    const lvl = 0.2 * (0.92 + Math.random() * 0.16);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(lvl, t0 + 0.11);                          // the bow catching
    g.gain.setValueAtTime(lvl, Math.max(t0 + 0.12, t0 + durS - 0.22));
    g.gain.setTargetAtTime(0, Math.max(t0 + 0.14, t0 + durS - 0.18), 0.09);  // lifted, not cut
    ngain.gain.setValueAtTime(0.012, t0 + 0.04);
    ngain.gain.setTargetAtTime(0.0001, Math.max(t0 + 0.15, t0 + durS - 0.15), 0.1);
    o.start(t0); o.stop(t0 + durS + 0.6);
    vib.start(t0); vib.stop(t0 + durS + 0.6);
    state.notes.push(o, vib);
    return f;
  };

  const pass = () => {
    if (fiddle !== state) return;   // stopped while the timer was pending
    let t = ctx.currentTime + 0.05;
    let prev = 0;
    for (const phrase of [A, B]) {
      for (const [f, d] of phrase) {
        const dur = d * (0.9 + Math.random() * 0.25);   // rubato — no two passes agree
        prev = note(f, t, dur, prev);
        t += dur + 0.05;
      }
      t += 1.4 + Math.random() * 1.6;                   // the fiddler breathes
      prev = 0;                                         // a rest breaks the slide
    }
    state.notes = state.notes.slice(-8);                // keep refs only to what may still sound
    state.timer = setTimeout(pass, Math.max(200, (t - ctx.currentTime - 0.6) * 1000));
  };
  pass();
}

export function stopTrainFiddle({ fadeS = 2.2 } = {}) {
  const f = fiddle;
  fiddle = null;
  if (!f) return;
  if (f.file) {
    Promise.resolve(f.file).then((s) => {
      try {
        s?.fade?.(0, { duration: fadeS * 1000 });
        setTimeout(() => { try { s?.stop?.(); } catch (e) { /* already gone */ } }, fadeS * 1000 + 60);
      } catch (e) { try { s?.stop?.(); } catch (e2) { /* already gone */ } }
    });
    return;
  }
  try {
    if (f.timer) clearTimeout(f.timer);
    const t = f.ctx.currentTime;
    f.master.gain.cancelScheduledValues(t);
    f.master.gain.setValueAtTime(Math.max(0.0001, f.master.gain.value), t);
    f.master.gain.exponentialRampToValueAtTime(0.0001, t + fadeS);
    setTimeout(() => {
      for (const n of f.notes) { try { n.stop(); } catch (e) { /* already stopped */ } }
      try { f.nsrc.stop(); } catch (e) { /* already stopped */ }
    }, fadeS * 1000 + 80);
  } catch (e) { console.warn(`${MODULE_ID} | fiddle stop`, e); }
}
