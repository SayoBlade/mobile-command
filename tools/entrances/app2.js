(() => {
  const body = document.body;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };

  // Reduced motion. Windows reports it whenever "Animation effects" is off, usually for speed rather than
  // comfort, and honouring it blindly hid the whole show on the DM's machine (Mobile Command learned the
  // same thing on 2026-08-05). A banner the viewer starts on purpose plays in full; one click opts out.
  const rm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const note = document.getElementById('motion-note');
  const fullBtn = document.getElementById('full-motion');
  const applyMotion = () => {
    const full = store.get('cm-entrance-motion') !== 'reduced';
    body.classList.toggle('full-motion', full);
    note.hidden = !(rm && rm.matches);
    note.querySelector('span').textContent = full
      ? 'Your device asks for reduced motion (Windows animation effects are off). The banners still play in full, because you start them yourself.'
      : 'Reduced motion is on: the banners fade in and out instead of sliding.';
    fullBtn.textContent = full ? 'Use reduced motion' : 'Show full motion';
  };
  fullBtn.addEventListener('click', () => {
    store.set('cm-entrance-motion', body.classList.contains('full-motion') ? 'reduced' : 'full');
    applyMotion();
  });
  if (rm && rm.addEventListener) rm.addEventListener('change', applyMotion);
  applyMotion();

  // A flat table TV gets one band per player side: clone the bottom band for the right and top.
  document.querySelectorAll('.screen').forEach(sc => {
    const b = sc.querySelector('.band.side-b');
    for (const side of ['side-r', 'side-t']) {
      const c = b.cloneNode(true);
      c.classList.replace('side-b', side);
      c.setAttribute('aria-hidden', 'true');
      b.after(c);
    }
  });

  // Layout mode.
  const radios = document.querySelectorAll('input[name="mode"]');
  const setMode = m => { body.classList.toggle('table', m === 'table'); store.set('cm-entrance-mode', m); };
  const saved = store.get('cm-entrance-mode') === 'table' ? 'table' : 'wall';
  radios.forEach(r => {
    r.checked = r.value === saved;
    r.addEventListener('change', () => { if (r.checked) setMode(r.value); });
  });
  setMode(saved);

  // Sound: recorded clips from the DM's library, played with plain audio elements.
  const Snd = (() => {
    let on = true, volume = 0.8;
    const pool = new Map();
    const el = src => {
      if (!pool.has(src)) { const a = new Audio(src); a.preload = 'auto'; pool.set(src, a); }
      return pool.get(src);
    };
    Object.values(CLIPS).flat().forEach(c => el(c.src)); // start fetching before the first Play
    function fadeOut(a, sec) {
      const start = a.volume, t0 = performance.now();
      const step = now => {
        const k = Math.min(1, (now - t0) / (sec * 1000));
        a.volume = Math.max(0, start * (1 - k)); // ignored on iPad, where the clip simply stops at the end
        if (k < 1 && !a.paused) requestAnimationFrame(step); else a.pause();
      };
      requestAnimationFrame(step);
    }
    function play(key) {
      const live = [];
      const timers = (CLIPS[key] || []).map(c => setTimeout(() => {
        if (!on) return;
        const a = el(c.src).cloneNode();
        a.volume = Math.min(1, volume * (c.vol ?? 1));
        a.play().catch(() => { /* the browser refused; stay silent */ });
        live.push(a);
      }, (c.at || 0) * 1000));
      return { stop(fade = 0.5) { timers.forEach(clearTimeout); live.forEach(a => fadeOut(a, fade)); } };
    }
    return { play, setOn(v) { on = v; }, setVolume(v) { volume = v; }, get on() { return on; } };
  })();

  const sndBtn = document.getElementById('sound');
  const vol = document.getElementById('volume');
  const setSound = v => {
    Snd.setOn(v);
    sndBtn.setAttribute('aria-pressed', String(v));
    sndBtn.querySelector('span').textContent = v ? 'Sound on' : 'Sound off';
    store.set('cm-entrance-sound', v ? 'on' : 'off');
  };
  sndBtn.addEventListener('click', () => setSound(!Snd.on));
  setSound(store.get('cm-entrance-sound') !== 'off');
  if (store.get('cm-entrance-volume') !== null) {
    const v = Number(store.get('cm-entrance-volume'));
    if (v >= 0 && v <= 100) vol.value = String(v);
  }
  Snd.setVolume(vol.value / 100);
  vol.addEventListener('input', () => { Snd.setVolume(vol.value / 100); store.set('cm-entrance-volume', vol.value); });

  // Play / stop. The same button stops a running entrance. One entrance at a time.
  const running = new Map();
  const setBtn = (btn, playing) => {
    btn.classList.toggle('is-stop', playing);
    btn.querySelector('span').textContent = playing ? 'Stop' : 'Play';
  };
  const videos = sc => sc.querySelectorAll('video');
  function finish(sc) {
    const r = running.get(sc);
    if (!r) return;
    r.timers.forEach(clearTimeout);
    running.delete(sc);
    videos(sc).forEach(v => v.pause());
    // Like the real overlay, a banner that has left stays gone: only the map remains until the next Play.
    sc.classList.add('done');
    sc.classList.remove('run', 'out');
    setBtn(r.btn, false);
    r.resolve();
  }
  const OUT_MS = 1200;        // the out animation (stageOut / bandOut in the CSS)
  const SOUND_LEAD_MS = 1000; // the sound starts fading this long before the banner leaves...
  function stop(sc) {
    const r = running.get(sc);
    if (!r || sc.classList.contains('out')) return;
    r.timers.forEach(clearTimeout);
    r.snd.stop(0.8);
    sc.classList.add('out');
    r.timers = [setTimeout(() => finish(sc), OUT_MS + 20)];
  }
  const stopAll = () => running.forEach((r, sc) => stop(sc));
  function play(card) {
    const sc = card.querySelector('.screen');
    const btn = card.querySelector('.play');
    if (running.has(sc)) { stop(sc); return Promise.resolve(); }
    stopAll();
    return new Promise(resolve => {
      sc.classList.remove('run', 'out', 'done');
      void sc.offsetWidth;
      sc.classList.add('run');
      videos(sc).forEach(v => {
        try { v.currentTime = Math.random() * 12; } catch (e) { /* not loaded yet: it starts from the top */ }
        v.play().catch(() => { /* the browser refused; the banner plays without its mist */ });
      });
      setBtn(btn, true);
      const dur = Number(card.dataset.dur) || 7100;
      const r = { btn, resolve, timers: [], snd: Snd.play(card.dataset.cue) };
      // ...and is silent by the time the out animation ends.
      r.timers.push(setTimeout(() => r.snd.stop((SOUND_LEAD_MS + OUT_MS) / 1000), dur - SOUND_LEAD_MS));
      r.timers.push(setTimeout(() => {
        sc.classList.add('out');
        r.timers.push(setTimeout(() => finish(sc), OUT_MS + 20));
      }, dur));
      running.set(sc, r);
    });
  }

  // Full screen: one banner at a time, letterboxed on black. If the viewer refuses real full screen,
  // the same view still fills the page.
  const cards = [...document.querySelectorAll('.card')];
  let current = 0;
  const inTheatre = () => body.classList.contains('theatre');
  function show(i) {
    current = (i + cards.length) % cards.length;
    cards.forEach((c, k) => c.classList.toggle('on', k === current));
  }
  async function enterTheatre(i, autoplay) {
    stopAll();
    show(i);
    body.classList.add('theatre');
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    } catch (e) { /* real full screen refused: the view still fills the page */ }
    if (autoplay) play(cards[current]);
  }
  function exitTheatre() {
    if (!inTheatre()) return;
    body.classList.remove('theatre');
    cards.forEach(c => c.classList.remove('on'));
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    cards[current].scrollIntoView({ block: 'center' });
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) exitTheatre(); });
  document.addEventListener('keydown', e => {
    if (!inTheatre()) return;
    if (e.key === 'Escape') exitTheatre();
    else if (e.key === 'ArrowRight') { stopAll(); show(current + 1); }
    else if (e.key === 'ArrowLeft') { stopAll(); show(current - 1); }
    else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); play(cards[current]); }
  });
  cards.forEach((card, i) => card.querySelector('.fs').addEventListener('click', () => enterTheatre(i, true)));
  document.getElementById('full').addEventListener('click', () => enterTheatre(current, false));
  document.getElementById('t-prev').addEventListener('click', () => { stopAll(); show(current - 1); });
  document.getElementById('t-next').addEventListener('click', () => { stopAll(); show(current + 1); });
  document.getElementById('t-exit').addEventListener('click', exitTheatre);

  // Play all in order. Pressing any single Play takes over from the run-through.
  const allBtn = document.getElementById('play-all');
  const tAll = document.getElementById('t-all');
  const labels = [allBtn.textContent, tAll.textContent];
  let playingAll = false;
  const setAll = on => { allBtn.textContent = on ? 'Stop' : labels[0]; tAll.textContent = on ? 'Stop' : labels[1]; };
  cards.forEach((card, i) => {
    card.querySelector('.play').addEventListener('click', () => {
      if (playingAll) { playingAll = false; setAll(false); }
      current = i;
      play(card);
    });
  });
  async function playAll() {
    if (playingAll) {
      playingAll = false;
      stopAll();
      return;
    }
    stopAll();
    playingAll = true;
    setAll(true);
    for (let i = inTheatre() ? current : 0; i < cards.length; i++) {
      if (!playingAll) break;
      if (inTheatre()) show(i); else cards[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
      current = i;
      await new Promise(res => setTimeout(res, 500));
      if (!playingAll) break;
      await play(cards[i]);
      await new Promise(res => setTimeout(res, 400));
    }
    playingAll = false;
    setAll(false);
  }
  allBtn.addEventListener('click', playAll);
  tAll.addEventListener('click', playAll);

  // Everyone else: one screen, dressed per pick (name, line, portrait, chapter map, friend / neither / foe).
  const gen = document.querySelector('.card.gen');
  if (gen) {
    const sc = gen.querySelector('.screen');
    gen.querySelectorAll('.gen-pick').forEach((b) => b.addEventListener('click', () => {
      stopAll();
      const d = b.dataset;
      gen.classList.remove('g-friend', 'g-neutral', 'g-foe');
      gen.classList.add(`g-${d.stance}`);
      gen.dataset.cue = d.stance === 'foe' ? 'gfoe' : 'gfriend';
      sc.querySelector('.map').src = d.map;
      sc.querySelectorAll('.art img').forEach((i) => { i.src = d.img; });
      sc.querySelectorAll('.name').forEach((n) => { n.textContent = d.name; });
      sc.querySelectorAll('.sub').forEach((n) => { n.textContent = d.sub; });
      gen.querySelectorAll('.gen-pick').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      setTimeout(() => play(gen), 60);
    }));
  }
})();
