import { MODULE_ID } from "./preset.js";
import { isPhoneClient, isDisplayClient } from "./shell.js";
import { isOnlineTable, hasSharedScreen } from "./settings.js";
import { socket } from "./rpc.js"; // the one-shot channel effects.js fires on (importing effects.js would close a cycle)
import { CM_ENTRANCES } from "./cm-entrances.js";
import { holdTv, releaseTv } from "./tv-hold.js";

// §40.6 ENTRANCES — the themed banner ("Intros" in the DM panel; DM 2026-09-19).
//
// Boss Splash's shape, dressed per NPC: the map dims, a three-stripe band wipes in at 60% of the screen with the
// NPC's name and a line under it, the book's own portrait slides in behind the band, and the whole thing drifts
// gently while everyone reads — then leaves, and only the map is left (DM: "why do the banners reappear after
// fading out?" — they don't, any more). Weather only where it is semi-transparent (mist, rain, embers).
//
// A TRANSFORMATION (the Abbot, the Reaper, Golub, the priors) opens on the form the party knows — its own name
// and line — and at `--T` changes into the monster, which then holds for the usual time. The book stages each of
// those changes in front of the party; the banners are timed for that moment.
//
// Timing (DM 2026-09-19, in order: +2 s, +1.5 s, then "a second shorter… start the sound fadeout sooner… make the
// out animation half a second longer"): the banner starts to leave at `hold` (7.1 s; 10 s for a transformation),
// takes OUT_MS to go, and the sound starts fading SOUND_LEAD_MS before it leaves so it is silent when the map is
// clear. The look lives in styles/entrances.css; the Crooked Moon's set in cm-entrances.js — both generated from
// the preview page the DM reviewed.
//
// Wiring mirrors the boss intro (§40): the DM fires a one-shot over the socket and every client that should show
// it builds the overlay itself. Nothing persists — an entrance is a moment, not a state.

const OUT_MS = 1200;        // the way out (entrances.css: stageOut / bandOut)
const SOUND_LEAD_MS = 1000; // the sound starts fading this long before the banner leaves

function cmToolsOn() {
  try { return !!game.settings.get(MODULE_ID, "crookedMoonTools"); } catch (e) { return false; }
}

/** Every entrance this world offers, in campaign order. The Crooked Moon's set rides the campaign-tools switch. */
export function entranceList() { return cmToolsOn() ? CM_ENTRANCES : []; }
/** One entrance by key — clients resolve the key from their own copy of the module, so the socket carries only it. */
export function entranceByKey(key) { return CM_ENTRANCES.find(e => e.key === key) ?? null; }

// The same audience as the boss intro (§40, §39.5): in person the ROOM's screen and the DM, never phones; online
// with a shared screen, that screen carries it; online with none, everyone's own client.
function eligible() {
  if (isOnlineTable() && !hasSharedScreen()) return true;
  return !isPhoneClient() && (isDisplayClient() || game.user?.isGM);
}

let root = null;
let timers = [];
let voices = [];
function clearTimers() { for (const t of timers) clearTimeout(t); timers = []; }
function hush(fadeMs) { for (const v of voices) v.stop(fadeMs); voices = []; }
function teardown() {
  clearTimers();
  hush(120);
  if (root) { root.querySelectorAll("video").forEach(v => { try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) { /* gone */ } }); root.remove(); root = null; }
}

/* -------------------------------------------- */
/*  Sound — a window of a library file          */
/* -------------------------------------------- */

// A clip is `{ src, from, to, fadeIn, fadeOut, at, gain }`: play `src` from `from` to `to` seconds, starting `at`
// seconds into the entrance, at `gain` (the preview's loudness match — it can exceed 1). Always on the INTERFACE
// channel, like the boss intro's roar: the one channel phones keep (§20.6) and the one MC mirrors the TV volume onto.
//
// Short sources go through Foundry's own Sound (decoded once, cached, and playable on the iPad once its audio is
// unlocked). A LONG source — the book's rain, swamp and crow beds run 2–8 minutes — would be decoded whole (Foundry
// buffers anything under ten minutes: ~130 MB of samples to play 9 s), so those are streamed through an <audio>
// element into the same channel instead, falling back to Foundry's Sound if the browser refuses to start it.
function playWindow(c) {
  const ctx = game.audio?.interface;
  if (!ctx?.gainNode || !c?.src) return null;
  const len = Math.max(0.1, (c.to ?? 0) - (c.from ?? 0));
  const peak = Math.max(0, Number(c.gain ?? 1));
  const fadeIn = Math.max(0.005, c.fadeIn ?? 0);
  const fadeOut = Math.min(len, Math.max(0.01, c.fadeOut ?? 0));
  let stopped = false;
  let handle = null; // { stop(fadeMs) } once playing

  const viaFoundry = async () => {
    try {
      const snd = await game.audio.play(c.src, { context: ctx, offset: c.from ?? 0, duration: len, volume: 0 });
      if (stopped) { snd.stop(); return; }
      snd.fade(peak, { duration: fadeIn * 1000, from: 0 });
      const out = setTimeout(() => { if (!stopped) snd.fade(0, { duration: fadeOut * 1000 }); }, (len - fadeOut) * 1000);
      handle = { stop: (ms) => { clearTimeout(out); snd.fade(0, { duration: ms }).then(() => snd.stop()).catch(() => snd.stop()); } };
    } catch (e) { console.warn(`${MODULE_ID} | entrance: could not play ${c.src}`, e); }
  };

  const viaStream = () => {
    const el = new Audio();
    el.preload = "auto";
    el.src = encodeURI(c.src);
    let node, gain, end;
    try {
      node = ctx.createMediaElementSource(el);
      gain = ctx.createGain(); gain.gain.value = 0;
      node.connect(gain); gain.connect(ctx.gainNode);
    } catch (e) { return viaFoundry(); }
    const release = () => { try { el.pause(); node.disconnect(); gain.disconnect(); el.removeAttribute("src"); el.load(); } catch (e) { /* gone */ } };
    const start = () => {
      if (stopped) return release();
      try { el.currentTime = c.from ?? 0; } catch (e) { /* not seekable yet: it starts from the top */ }
      el.play().then(() => {
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peak, t + fadeIn);
        gain.gain.setValueAtTime(peak, t + len - fadeOut);
        gain.gain.linearRampToValueAtTime(0, t + len);
        end = setTimeout(release, len * 1000 + 80);
        handle = { stop: (ms) => {
          clearTimeout(end);
          const n = ctx.currentTime;
          gain.gain.cancelScheduledValues(n);
          gain.gain.setValueAtTime(gain.gain.value, n);
          gain.gain.linearRampToValueAtTime(0, n + ms / 1000);
          setTimeout(release, ms + 80);
        } };
      }).catch(() => { release(); viaFoundry(); }); // e.g. Safari refusing an <audio> no tap started
    };
    if (el.readyState >= 1) start(); else el.addEventListener("loadedmetadata", start, { once: true });
  };

  if (c.stream) viaStream(); else viaFoundry();
  return { stop: (ms) => { stopped = true; handle?.stop(ms); } };
}

/* -------------------------------------------- */
/*  The overlay                                 */
/* -------------------------------------------- */

function bandHTML(e, side, form = null) {
  const esc = foundry.utils.escapeHTML;
  const names = e.art2
    ? `<p class="mc-en-name mc-en-n1">${esc(form?.name ?? e.name1)}</p><p class="mc-en-sub mc-en-n1">${esc(form?.sub ?? e.sub1)}</p>`
      + `<p class="mc-en-name mc-en-n2">${esc(e.name)}</p><p class="mc-en-sub mc-en-n2">${esc(e.sub)}</p>`
    : `<p class="mc-en-name">${esc(e.name)}</p><p class="mc-en-sub">${esc(e.sub)}</p>`;
  // A table lying flat gets a band per player side (bottom, right, top — never the DM's left), each reading the
  // right way up to the people on it; the wall layout shows only the bottom one (the CSS hides the others).
  return `<div class="mc-en-band mc-en-side-${side}"${side === "b" ? "" : ' aria-hidden="true"'}><div class="mc-en-plate">`
    + `<div class="mc-en-strip mc-en-s1"></div><div class="mc-en-strip mc-en-s2"></div><div class="mc-en-strip mc-en-s3"></div>`
    + names + `</div></div>`;
}

// A face the book never drew (Geneva, Rowan…): a head-and-shoulders shape in the banner's own colours (the CSS).
const SILHOUETTE = `<svg class="mc-en-silhouette" viewBox="0 0 100 130" aria-hidden="true"><path d="M50 6c-13 0-22 11-22 26 0 10 4 18 10 23-3 6-9 9-17 12C10 71 4 82 3 100v30h94v-30c-1-18-7-29-18-33-8-3-14-6-17-12 6-5 10-13 10-23C72 17 63 6 50 6z"/></svg>`;

// `form` — an alternate KNOWN form the GM resolved from the map (resolveForm): its name and line replace the
// transformation's first ones, and its picture (a token's, so an unknown size: the crop box learns it in settle) the
// first picture. Nothing else changes: same look, same sound, same change.
function build(e, table, form = null) {
  const el = document.createElement("div");
  el.id = "mc-entrance";
  el.className = `mc-en ${e.classes}${table ? " mc-en-table" : ""}`;
  el.style.setProperty("--dur", `${e.hold / 1000}s`);
  const esc = foundry.utils.escapeHTML;
  const first = form
    ? (form.art ? `<span class="mc-en-crop"><img src="${esc(form.art)}" alt=""></span>`
      : `<span class="mc-en-crop mc-en-shape" style="aspect-ratio:100/130">${SILHOUETTE}</span>`)
    : e.art;
  const art = e.art2
    ? `<div class="mc-en-art mc-en-a1">${first}</div><div class="mc-en-art mc-en-a2">${e.art2}</div>`
    : `<div class="mc-en-art${e.pair ? " mc-en-pair" : ""}">${e.art}</div>`;
  // The markup below is the module's own (cm-entrances.js) — never text a user typed — so it goes in as HTML.
  el.innerHTML = `<div class="mc-en-stage"><div class="mc-en-dim"></div><div class="mc-en-weather">${e.weather ?? ""}</div>`
    + art + bandHTML(e, "b", form) + bandHTML(e, "r", form) + bandHTML(e, "t", form) + (e.extra ?? "") + `</div>`;
  return el;
}

// The look is its own stylesheet (module.json lists it). Foundry reads that list only when a world launches, so a
// client running since before an update would show an unstyled banner: load it here too if it isn't in the page.
let styleReady = null;
function ensureStyles() {
  if (styleReady) return styleReady;
  const href = `modules/${MODULE_ID}/styles/entrances.css`;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(l => (l.getAttribute("href") ?? "").includes(href))) {
    return (styleReady = Promise.resolve());
  }
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = href;
  styleReady = new Promise(res => { link.onload = res; link.onerror = res; });
  document.head.appendChild(link);
  return styleReady;
}

/* -------------------------------------------- */
/*  The camera (display client)                 */
/* -------------------------------------------- */

// DM 2026-09-19: "focus the MC camera on the NPC and zoom so there's ~30m radius around them, 1 second after the
// intro's end revert to the last view." — then, having seen it: "zoom in should be much tighter" → 10 m. The frame
// is the combat spotlight's (main.js tokenFrame) — the radius across the smaller screen axis, clamped to the scene —
// around every token the entrance names (a joint entrance frames the group). 10 m is 30 ft on a feet grid. While
// it holds, the party follow and the spotlight wait (tv-hold.js).
const FOCUS_M = 10;
const REVERT_AFTER_MS = 1000;
const PAN_MS = 900;
let cameraBack = null;
let revertTimer = null; // NOT in `timers`: teardown clears those when the banner is gone, and the revert comes a second later

function frameTokens(docs) {
  const gs = canvas.dimensions?.size ?? 100;
  const units = String(canvas.dimensions?.units ?? canvas.grid?.units ?? "ft").toLowerCase();
  const perGrid = canvas.dimensions?.distance ?? canvas.grid?.distance ?? 5;
  const radius = /^m/.test(units) ? FOCUS_M : 30; // metres, else feet
  const [screenW, screenH] = canvas.screenDimensions ?? [window.innerWidth, window.innerHeight];
  const minZoom = CONFIG.Canvas?.minZoom ?? 0.1, maxZoom = CONFIG.Canvas?.maxZoom ?? 3;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of docs) {
    x0 = Math.min(x0, d.x); y0 = Math.min(y0, d.y);
    x1 = Math.max(x1, d.x + (d.width ?? 1) * gs); y1 = Math.max(y1, d.y + (d.height ?? 1) * gs);
  }
  const diam = (radius * 2 / perGrid) * gs + Math.max(x1 - x0, y1 - y0) - gs;
  const scale = Math.max(minZoom, Math.min(screenW / diam, screenH / diam, maxZoom));
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const halfW = screenW / scale / 2, halfH = screenH / scale / 2;
  const r = canvas.dimensions?.sceneRect ?? canvas.dimensions?.rect;
  if (r) {
    cx = r.width <= halfW * 2 ? r.x + r.width / 2 : Math.min(Math.max(cx, r.x + halfW), r.x + r.width - halfW);
    cy = r.height <= halfH * 2 ? r.y + r.height / 2 : Math.min(Math.max(cy, r.y + halfH), r.y + r.height - halfH);
  }
  return { x: cx, y: cy, scale };
}

function focusCamera(e, focus) {
  if (!isDisplayClient() || !canvas?.ready || !focus?.tokenIds?.length) return;
  if (focus.sceneId && canvas.scene?.id !== focus.sceneId) return;
  const docs = focus.tokenIds.map(id => canvas.scene.tokens.get(id)).filter(Boolean);
  if (!docs.length) return;
  const s = canvas.stage;
  cameraBack = cameraBack ?? { x: s.pivot.x, y: s.pivot.y, scale: s.scale.x || 1 }; // a restart keeps the FIRST view
  holdTv(e.hold + OUT_MS + REVERT_AFTER_MS + PAN_MS + 500);
  canvas.animatePan({ ...frameTokens(docs), duration: PAN_MS }).catch?.(() => {});
}

function revertCamera() {
  const back = cameraBack;
  cameraBack = null;
  if (!back || !canvas?.ready) { releaseTv(); return; }
  Promise.resolve(canvas.animatePan({ ...back, duration: PAN_MS })).finally(() => releaseTv());
}

// THE WORDS FIT THE SCREEN. The lettering is sized by the screen's height (cqh), which reads right on the 16:9 the
// banners were drawn for — but the table's TV is an iPad, 4:3, where a long shared name ("Constable Squire & Deputy
// Butterman") would run off the left edge. Each line is measured once as the banner appears and shrunk just enough
// to fit: right-aligned lines keep 3% of the band clear on the left, centred ones (the table layout) 3% each side.
function fitText(el) {
  for (const t of el.querySelectorAll(".mc-en-band .mc-en-name, .mc-en-band .mc-en-sub")) {
    const band = t.parentElement;
    const bw = band?.clientWidth ?? 0;
    const w = t.offsetWidth;
    if (!bw || !w) continue;
    const centred = getComputedStyle(t).left !== "auto" && getComputedStyle(t).right === "auto";
    const room = centred ? bw * 0.94 : (t.offsetLeft + w) - bw * 0.03;
    if (w > room && room > 0) t.style.fontSize = `${Math.floor(parseFloat(getComputedStyle(t).fontSize) * room / w)}px`;
  }
}

// The title faces ship in fonts/ (SIL OFL 1.1), and a browser fetches a face only when text first uses it — so a
// banner waits, hidden, for its own faces before fitText measures, or the name would be sized by the fallback face.
// A picture whose size the data doesn't know (a token's, for an alternate form) gets its crop box sized here too.
// Capped: a face or picture that never arrives never holds the banner back.
const SETTLE_MS = 400;
async function settle(el) {
  const jobs = [];
  if (document.fonts?.load) {
    const want = new Set([...el.querySelectorAll(".mc-en-name, .mc-en-sub")].map(n => {
      const cs = getComputedStyle(n);
      return `${cs.fontStyle} ${cs.fontWeight} 32px ${cs.fontFamily}`;
    }));
    for (const f of want) jobs.push(document.fonts.load(f).catch(() => null));
  }
  for (const img of el.querySelectorAll(".mc-en-crop:not([style*='aspect-ratio']) > img")) {
    jobs.push((img.decode?.() ?? Promise.resolve()).catch(() => null).then(() => {
      if (img.naturalWidth && img.naturalHeight) img.parentElement.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
    }));
  }
  await Promise.race([Promise.all(jobs), new Promise(res => setTimeout(res, SETTLE_MS))]);
}

/** Run an entrance on THIS client. `{ key, focus }` — everything else comes from this client's copy of the module. */
export async function entrancePlay({ key, focus, form } = {}) {
  if (!eligible()) return;
  const e = entranceByKey(key);
  if (!e) return;
  await ensureStyles();
  teardown(); // a second trigger restarts cleanly rather than stacking two banners
  focusCamera(e, focus);

  const el = root = build(e, !isOnlineTable(), form ?? null); // in person the screen lies flat on the table (§40.1); online it's a wall
  el.style.visibility = "hidden";
  document.body.appendChild(el);
  await settle(el);
  if (root !== el || el.classList.contains("mc-en-out")) return; // replaced or stopped while its faces loaded
  el.style.visibility = "";
  fitText(root);
  void root.offsetWidth; // commit the first frame, or the entrance animations may never start
  root.classList.add("mc-en-run");
  // The mist loops start somewhere random in their 20 s, so two entrances in a row never show the same curl.
  root.querySelectorAll("video").forEach(v => {
    v.muted = true; v.loop = true; v.playsInline = true;
    const go = () => { try { v.currentTime = Math.random() * 12; } catch (err) { /* not seekable yet */ } v.play().catch(() => {}); };
    if (v.readyState >= 1) go(); else v.addEventListener("loadedmetadata", go, { once: true });
  });

  for (const c of e.sound ?? []) timers.push(setTimeout(() => { const v = playWindow(c); if (v) voices.push(v); }, (c.at ?? 0) * 1000));
  timers.push(setTimeout(() => hush(SOUND_LEAD_MS + OUT_MS), Math.max(0, e.hold - SOUND_LEAD_MS)));
  timers.push(setTimeout(() => root?.classList.add("mc-en-out"), e.hold));
  timers.push(setTimeout(teardown, e.hold + OUT_MS + 60));
  clearTimeout(revertTimer);
  revertTimer = setTimeout(revertCamera, e.hold + OUT_MS + REVERT_AFTER_MS);
}

/** Cut it short: the banner takes its usual way out and the sound fades with it. */
export function entranceStop() {
  if (!root) return;
  clearTimers();
  hush(OUT_MS);
  root.classList.add("mc-en-out");
  timers.push(setTimeout(teardown, OUT_MS + 60));
  clearTimeout(revertTimer);
  revertTimer = setTimeout(revertCamera, OUT_MS + REVERT_AFTER_MS);
}

/* -------------------------------------------- */
/*  DM side                                     */
/* -------------------------------------------- */

/* -------------------------------------------- */
/*  The tokens (GM side)                        */
/* -------------------------------------------- */

// Who an entrance is about, on the scene the table is looking at. `match` names the entrance's own tokens (for a
// transformation: the monster); `match1` a transformation's known form. A token counts when its own name or its
// actor's contains one of the names — the module's maps carry "The Crooked Man", "Vessla Browntooth" and so on.
const SHADOW_TINT = 0x15121a;
function stageScene() { return game.scenes?.active ?? canvas?.scene ?? null; }
function tokensNamed(scene, names) {
  const want = (names ?? []).map(n => String(n).toLowerCase()).filter(Boolean);
  if (!scene || !want.length) return [];
  return scene.tokens.filter(t => {
    const hay = `${t.name ?? ""} ${t.actor?.name ?? ""}`.toLowerCase();
    return want.some(n => hay.includes(n));
  });
}
const shadowed = (t) => Boolean(t.getFlag?.(MODULE_ID, "shadow"));
// The names a transformation's KNOWN form goes by on the map: its own (match1) and any alternate the DM may have placed
// instead (alts — Golub wears Geneva if the party never exposed Theodora). A plain entrance: its own names.
const knownNames = (e) => e?.match1 ? [...e.match1, ...(e.alts ?? []).flatMap(a => a.match ?? [])] : (e?.match ?? []);

// Which face a transformation OPENS on (DM 2026-09-19, Golub: "change the name based on token present"): its own
// form when that token stands on the scene — visible, and not dead; else the first alternate whose token does, with
// the alternate's name and line and THAT TOKEN's picture (the book gives Geneva no portrait, so the DM's token is
// her picture); else its own form. The tokens found are the ones the change swaps out.
const alive = (t) => !t.hidden && !t.actor?.statuses?.has?.("dead") && !((t.actor?.system?.attributes?.hp?.value ?? 1) <= 0);
// A token picture is no portrait (top-down art, a ringed disc): the banner draws a silhouette instead of showing it.
const tokenish = (p) => !p || /mystery-man/.test(p) || /(^|\/)tokens?[ %\/]/i.test(p) || /VTTTOKEN|-medium_|_1x1/i.test(p);
function tokenPicture(t) {
  const img = t.actor?.img ?? "";
  if (!tokenish(img)) return img;
  const tex = t.texture?.src ?? "";
  return tokenish(tex) ? "" : tex;
}
function resolveForm(e, scene) {
  if (!e?.art2) return { known: [], form: null };
  const own = tokensNamed(scene, e.match1);
  if (own.some(alive)) return { known: own.filter(alive), form: null };
  for (const a of e.alts ?? []) {
    const toks = tokensNamed(scene, a.match).filter(alive);
    if (toks.length) return { known: toks, form: { name: a.name, sub: a.sub, art: tokenPicture(toks[0]) } };
  }
  return { known: own, form: null };
}

// A REVEAL (DM 2026-09-19): "a dark overlay on the token to hide the details in shadow until the intro, and drop it
// when the intro is complete" — only where the book stages a reveal. The token carries a flag and every MC canvas
// client (the TV, the DM) darkens its picture as it draws it (registerEntranceShadow). Not Foundry's own texture tint:
// on this Foundry 14 stack a tint written by a normal update changed the stored value but never the live token (checked
// 2026-09-19 — the prepared tint and the mesh stayed white until a reload), so a reveal could never have dropped live.
async function setShadow(tokens, on) {
  const updates = tokens.filter(t => shadowed(t) !== on)
    .map(t => on ? { _id: t.id, [`flags.${MODULE_ID}.shadow`]: true } : { _id: t.id, [`flags.${MODULE_ID}.-=shadow`]: null });
  if (updates.length) await tokens[0].parent.updateEmbeddedDocuments("Token", updates);
}

/** Every canvas client draws a shadowed token dark, and redraws it the moment the flag comes or goes. */
export function registerEntranceShadow() {
  Hooks.on("refreshToken", (token) => {
    try { if (token.mesh && shadowed(token.document)) token.mesh.tint = SHADOW_TINT; } catch (e) { /* drawing is best-effort */ }
  });
  Hooks.on("updateToken", (doc, changes) => {
    const f = changes?.flags?.[MODULE_ID];
    if (f && ("shadow" in f || "-=shadow" in f)) doc.object?.renderFlags?.set({ refreshMesh: true });
  });
}
async function setHidden(tokens, hidden) {
  const updates = tokens.filter(t => Boolean(t.hidden) !== hidden).map(t => ({ _id: t.id, hidden }));
  if (updates.length) await tokens[0].parent.updateEmbeddedDocuments("Token", updates);
}

/** Is this entrance's NPC sitting in shadow on the current scene? (the panel's toggle reads it) */
export function entranceShadowed(key) {
  const e = entranceByKey(key);
  return tokensNamed(stageScene(), knownNames(e)).some(shadowed);
}
/** Put this entrance's NPC in shadow — or bring it out — ahead of the intro (the manual lever beside the automatic one). */
export async function dmShadowEntrance(key, on) {
  if (!game.user?.isGM) return false;
  const e = entranceByKey(key);
  const toks = tokensNamed(stageScene(), knownNames(e));
  if (!toks.length) { ui.notifications?.info(`Mobile Command: no ${e?.name ?? key} token on this scene.`); return false; }
  await setShadow(toks, on ?? !toks.some(shadowed));
  return true;
}

/* ---- Placing the missing (DM 2026-09-19: "can you place them in the map if they are missing?") ---- */
// An entrance whose stage business needs its NPC's token — it ARRIVES, it's a REVEAL, or it's a transformation's
// monster — and finds none on the scene puts one there itself: the actor from the world, else imported from the
// Crooked Moon's bestiary; hidden, a couple of squares from the party (the book's reveals happen where the party
// stands), flagged as the intro's own. It then counts as arriving: unhidden with the banner (at the change, for a
// transformation's monster). The known form (Theodora, Phillip…) is never placed: the party has met them.
const CM_PACK = "the-crooked-moon-2014.tcm2014-bestiary";
const needsToken = (e) => Boolean(e.appears || e.reveal || e.art2);
async function actorFor(e) {
  const names = (e.match ?? []).map(n => String(n).toLowerCase()).filter(Boolean);
  const pick = (list, nameOf) => {
    for (const n of names) { // the entrance's own name order; the shortest actor name wins ("Hugo" over "Hugo's echo")
      const hits = list.filter(a => nameOf(a).toLowerCase().includes(n)).sort((a, b) => nameOf(a).length - nameOf(b).length);
      if (hits.length) return hits[0];
    }
    return null;
  };
  const here = pick(game.actors?.contents ?? [], a => a.name ?? "");
  if (here) return here;
  const pack = game.packs?.get?.(CM_PACK);
  if (!pack) return null;
  const entry = pick([...pack.index.values()], i => i.name ?? "");
  if (!entry) return null;
  try { return await game.actors.importFromCompendium(pack, entry._id); }
  catch (err) { console.warn(`${MODULE_ID} | entrance: could not import ${entry.name}`, err); return null; }
}
// A free spot near the party: ring by ring from two squares out, the cells above them first; the map's centre
// (or its opening view) when no party stands on the scene.
function spotNear(scene, w, h) {
  const g = scene.grid?.size ?? 100;
  const rect = scene.dimensions?.sceneRect ?? { x: 0, y: 0, width: scene.width ?? 4000, height: scene.height ?? 3000 };
  const party = scene.tokens.filter(t => !t.hidden && t.actor?.hasPlayerOwner && t.actor.type === "character");
  const anchor = party.length
    ? { x: party.reduce((s, t) => s + t.x + (t.width ?? 1) * g / 2, 0) / party.length, y: party.reduce((s, t) => s + t.y + (t.height ?? 1) * g / 2, 0) / party.length }
    : (scene.initial?.x != null ? { x: scene.initial.x, y: scene.initial.y } : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  const taken = scene.tokens.map(t => ({ x0: t.x, y0: t.y, x1: t.x + (t.width ?? 1) * g, y1: t.y + (t.height ?? 1) * g }));
  const free = (x, y) => x >= rect.x && y >= rect.y && x + w * g <= rect.x + rect.width && y + h * g <= rect.y + rect.height
    && !taken.some(b => x < b.x1 && x + w * g > b.x0 && y < b.y1 && y + h * g > b.y0);
  const cx = Math.round((anchor.x - w * g / 2) / g) * g, cy = Math.round((anchor.y - h * g / 2) / g) * g;
  for (let r = 2; r <= 10; r++) {
    const ring = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
    ring.sort((a, b) => (Math.abs(a[0]) + (a[1] > 0 ? 0.5 : 0)) - (Math.abs(b[0]) + (b[1] > 0 ? 0.5 : 0)));
    for (const [dx, dy] of ring) { const x = cx + dx * g, y = cy + dy * g; if (free(x, y)) return { x, y }; }
  }
  return { x: cx, y: cy - 2 * g };
}
async function placeMissing(e, key, scene) {
  if (!scene || !needsToken(e)) return [];
  const actor = await actorFor(e);
  if (!actor) { ui.notifications?.info(`Mobile Command: no ${e.name} on this scene and no actor to place — the banner plays without one.`); return []; }
  const proto = actor.prototypeToken ?? {};
  const { x, y } = spotNear(scene, proto.width ?? 1, proto.height ?? 1);
  const doc = await actor.getTokenDocument({ x, y, hidden: true, flags: { [MODULE_ID]: { placedBy: key } } });
  return scene.createEmbeddedDocuments("Token", [doc.toObject()]);
}

// The map's own beat at the change (DM 2026-09-19, "sure" to the bigger idea): a burst on the token as it swaps —
// feathers, bats, smoke, sparks, hellfire, a violet pulse — through Sequencer and JB2A's free set, when both are
// installed. Sequencer shows it on every canvas client itself (phones run without Sequencer — main.js), so the
// GM plays it once, at the token's centre, sized to the token.
function swapFx(e, token, scene) {
  const file = e.swapFx;
  if (!file || !token || !globalThis.Sequence || !globalThis.Sequencer?.Database?.entryExists?.(file)) return;
  const g = scene?.grid?.size ?? 100;
  const w = (token.width ?? 1) * g, h = (token.height ?? 1) * g;
  const size = Math.max(w, h) * (e.swapFxScale ?? 2.5);
  try { new Sequence().effect().file(file).atLocation({ x: token.x + w / 2, y: token.y + h / 2 }).size({ width: size, height: size }).play(); }
  catch (err) { console.warn(`${MODULE_ID} | entrance ${e.key}: the map's burst failed`, err); }
}

/** Play an entrance for the table. A foe's pauses the game first and leaves it paused, like the boss intro
 *  (§40.4 "the pause stays"); a friend's doesn't pause at all — nobody rolls initiative on the Vagrant.
 *  Around the banner: an NPC that ARRIVES has its token unhidden (in shadow, for a reveal); a transformation swaps
 *  the known form's token for the monster's at the change; a reveal's shadow drops as the banner completes; and the
 *  TV frames them all. Each is skipped quietly when the scene has no such token. */
export async function dmPlayEntrance(key) {
  if (!game.user?.isGM) return false;
  const e = entranceByKey(key);
  if (!e) { ui.notifications?.warn(`Mobile Command: there's no intro called "${key}".`); return false; }
  if (e.pause && !game.paused) game.togglePause(true, { broadcast: true });

  const scene = stageScene();
  const { known, form } = resolveForm(e, scene);
  let own = tokensNamed(scene, e.match);
  try {
    let placed = [];
    if (!own.length) { placed = await placeMissing(e, key, scene); own = placed; }
    const arrives = e.appears || placed.length > 0;
    if (e.reveal && arrives) await setShadow(own.filter(t => t.hidden), true); // it arrives as a shape…
    if (arrives && !e.art2) await setHidden(own, false);
  } catch (err) { console.warn(`${MODULE_ID} | entrance ${key}: token prep failed`, err); }

  const focusDocs = e.art2 ? (known.length ? known : own) : own;
  const payload = { id: "entrance", key, form, focus: focusDocs.length ? { sceneId: scene?.id, tokenIds: focusDocs.map(t => t.id) } : null };
  if (socket) socket.executeForEveryone("fxOneShot", payload);
  else entrancePlay(payload); // socketlib missing — at least the DM's own screen performs it

  // The change: the form the party knows leaves the map as the monster arrives on it — and the map bursts.
  const T = (e.change ?? 0) * 1000;
  if (e.art2 && (known.length || own.length)) setTimeout(async () => {
    try {
      if (known.length) await setHidden(known, true);
      if (own.length) await setHidden(own, false);
      swapFx(e, own[0] ?? known[0], scene);
    } catch (err) { console.warn(`${MODULE_ID} | entrance ${key}: swap failed`, err); }
  }, T);
  // …and its details come out of the shadow when the banner is done.
  if (e.reveal) setTimeout(() => setShadow(tokensNamed(stageScene(), e.match), false).catch(() => {}), e.hold + OUT_MS);
  return true;
}

/** Stop a running entrance on every screen. */
export async function dmStopEntrance() {
  if (!game.user?.isGM) return false;
  const payload = { id: "entranceStop" };
  if (socket) socket.executeForEveryone("fxOneShot", payload);
  else entranceStop();
  return true;
}
