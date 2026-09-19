// Real-time frames of several cards in ONE headless Edge session (see cdp.mjs for why CDP).
// Usage: node cdp-multi.mjs <page url> <out prefix> "<card>:<ms>,<ms>..." ...
// Each card is scrolled to, played, captured at the listed times after its Play, then left to finish.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [url, outPrefix, ...specs] = process.argv.slice(2);
const port = 9400 + Math.floor(Math.random() * 400);
const prof = `${process.cwd()}/profiles/cdpm${port}`;
const proc = spawn(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1300,900', 'about:blank']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 60 && !targets.length; i++) {
  try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(t => t.type === 'page'); } catch (e) { /* not up yet */ }
  if (!targets.length) await sleep(250);
}
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(3500);
if (process.env.PRE_JS) await send('Runtime.evaluate', { expression: process.env.PRE_JS });
for (const spec of specs) {
  const [cardS, timesS, sel] = spec.split(':'); // sel: a selector inside the card to click instead of its Play
  const card = Number(cardS), times = timesS.split(',').map(Number);
  // the screen's box, so each capture is just that card's TV
  const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const c = document.querySelectorAll('.card')[${card}]; c.scrollIntoView({ block: 'start' }); window.scrollBy(0, -20); const b = c.querySelector('.screen').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, key: c.dataset.cue }; })()` });
  const box = r.result.result.value;
  await sleep(400);
  await send('Runtime.evaluate', { userGesture: true, expression: `document.querySelectorAll('.card')[${card}].querySelector(${JSON.stringify(sel || '.play')}).click()` });
  const t0 = Date.now();
  for (const t of times) {
    await sleep(Math.max(0, t - (Date.now() - t0)));
    const s = await send('Page.captureScreenshot', { format: 'png' }); // no clip: clipped captures came back blank here
    fs.writeFileSync(`${outPrefix}-${box.key}-${t}.png`, Buffer.from(s.result.data, 'base64'));
    fs.writeFileSync(`${outPrefix}-${box.key}-${t}.json`, JSON.stringify(box));
  }
  console.log('card', card, box.key, 'captured', times.join(','), 'ms');
  await sleep(Math.max(0, 11500 - (Date.now() - t0)));
}
ws.close(); spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${port}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`]); process.exit(0);
