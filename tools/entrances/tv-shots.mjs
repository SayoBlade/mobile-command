// A headless TV client that photographs the next N intro banners: logs the TV account into the test world, waits for
// each banner to start, captures it at the given offsets and traces its layers. Prints "READY" once the TV is in.
// Usage: node tv-shots.mjs <out prefix> <banners> <ms,ms,...>
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [outPrefix, countS, offsS] = process.argv.slice(2);
const offsets = offsS.split(',').map(Number);
const port = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(edge, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/profiles/tvs${port}`,
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
console.log('READY', await evalJs('game.user?.name'));
const TRACE = `(() => { const r = document.getElementById('mc-entrance'); if (!r || !r.classList.contains('mc-en-run') || r.style.visibility) return null;
  const op = (s) => { const e = r.querySelector(s); return e ? +(+getComputedStyle(e).opacity).toFixed(2) : null; };
  return { cls: r.className.replace(/mc-en-/g, ''), a1: op('.mc-en-a1'), a2: op('.mc-en-a2'), n1: op('.mc-en-name.mc-en-n1'), n2: op('.mc-en-name.mc-en-n2'),
    art: op('.mc-en-art:not(.mc-en-a1):not(.mc-en-a2)'), name: [...r.querySelectorAll('.mc-en-name')].map(n => n.textContent).join(' / ') }; })()`;
for (let b = 0; b < Number(countS); b++) {
  let first = null;
  for (let i = 0; i < 1200 && !first; i++) { first = await evalJs(TRACE).catch(() => null); if (!first) await sleep(50); }
  if (!first) { console.log('TIMEOUT waiting for banner', b); done(1); }
  const t0 = Date.now(); const key = first.cls.split(' ').find(c => c.startsWith('t-'))?.slice(2) ?? `b${b}`;
  const trace = [];
  for (const off of offsets) {
    while (Date.now() - t0 < off) { trace.push({ t: Date.now() - t0, ...(await evalJs(TRACE).catch(() => ({}))) }); await sleep(200); }
    const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
    fs.writeFileSync(`${outPrefix}-${key}-${off}.jpg`, Buffer.from(s.result.data, 'base64'));
  }
  const fonts = await evalJs(`[...document.fonts].filter(f => f.status === 'loaded' && !/Signika|Modesto|Font Awesome|Roboto/.test(f.family)).map(f => f.family + '/' + f.style)`);
  console.log(JSON.stringify({ banner: key, fonts, trace: trace.filter((x, i) => i % 3 === 0).map(x => `${x.t}: a1 ${x.a1} a2 ${x.a2} n1 ${x.n1} n2 ${x.n2} art ${x.art}`) }));
  for (let i = 0; i < 300 && await evalJs(`!!document.getElementById('mc-entrance')`).catch(() => false); i++) await sleep(100);
}
done(0);
