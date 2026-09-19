// A headless TV for the stage test of v16: for each of the next N banners it polls, every 150 ms until `pollUntil`
// ms, what the TV's canvas shows — the named tokens' visibility and Sequencer's running effects — then photographs
// the banner at the given offsets. Usage: node tv-probe2.mjs <out prefix> <banners> <pollUntil> <ms,ms> <name,name>
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [outPrefix, countS, pollS, offsS, namesS] = process.argv.slice(2);
const offsets = offsS.split(',').map(Number);
const names = namesS.split(',');
const port = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(edge, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/profiles/tvp${port}`,
  '--window-size=1600,900', 'about:blank']);
const done = (code) => { try { ws?.close(); } catch (e) {} spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${port}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`]); process.exit(code); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 60 && !targets.length; i++) {
  try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(t => t.type === 'page'); } catch (e) { /* not up */ }
  if (!targets.length) await sleep(250);
}
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:30000/join' });
await sleep(4000);
await evalJs(`(() => { const u = document.querySelector('input[name="username"]'); if (!u) return 'no form'; u.value = 'TV'; u.dispatchEvent(new Event('input', { bubbles: true })); u.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('form#join-game-form').requestSubmit(); return 'submitted'; })()`);
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  if (await evalJs(`!!(globalThis.game?.ready && globalThis.canvas?.ready && globalThis.MobileCommand)`).catch(() => false)) break;
}
console.log('READY', await evalJs('game.user?.name'), 'sequencer', await evalJs('!!globalThis.Sequencer'));
const BANNER = `(() => { const r = document.getElementById('mc-entrance'); return r && r.classList.contains('mc-en-run') && !r.style.visibility ? r.className.replace(/mc-en-/g, '') : null; })()`;
const STAGE = `(() => { const want = ${JSON.stringify(names)}; const toks = canvas.tokens.placeables.filter(t => want.some(n => (t.document.name || '').toLowerCase().includes(n.toLowerCase()))).map(t => (t.document.name + ':' + (t.document.hidden ? 'hidden' : 'shown') + (t.visible ? '' : '/invisible')));
  let fx = []; try { fx = Sequencer.EffectManager.getEffects().map(e => (e.data?.file ?? e.file ?? '?')); } catch (e) { fx = ['(no manager)']; }
  const first = document.querySelector('#mc-entrance .mc-en-name.mc-en-n1, #mc-entrance .mc-en-name')?.textContent ?? '';
  return { toks, fx, first }; })()`;
for (let b = 0; b < Number(countS); b++) {
  let cls = null;
  for (let i = 0; i < 1600 && !cls; i++) { cls = await evalJs(BANNER).catch(() => null); if (!cls) await sleep(50); }
  if (!cls) { console.log('TIMEOUT waiting for banner', b); done(1); }
  const t0 = Date.now(); const key = cls.split(' ').find(c => c.startsWith('tf-') || c.startsWith('t-'))?.slice(cls.includes('tf-') ? 3 : 2) ?? `b${b}`;
  const seen = [];
  while (Date.now() - t0 < Number(pollS)) { const s = await evalJs(STAGE).catch(() => null); seen.push({ t: Date.now() - t0, ...(s ?? {}) }); await sleep(150); }
  for (const off of offsets) {
    while (Date.now() - t0 < off) await sleep(50);
    const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
    fs.writeFileSync(`${outPrefix}-${key}-${off}.jpg`, Buffer.from(s.result.data, 'base64'));
  }
  // compress the poll: each distinct state once, with when it was first seen
  const states = []; let last = '';
  for (const s of seen) { const sig = JSON.stringify([s.toks, s.fx, s.first]); if (sig !== last) { states.push(`${s.t}ms ${sig}`); last = sig; } }
  console.log(JSON.stringify({ banner: key, states }));
  for (let i = 0; i < 300 && await evalJs(`!!document.getElementById('mc-entrance')`).catch(() => false); i++) await sleep(100);
}
done(0);
