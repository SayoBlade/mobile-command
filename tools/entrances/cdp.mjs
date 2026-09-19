// Real-time screenshots of a running entrance: headless Edge driven over the DevTools protocol
// (the plain --screenshot flag uses virtual time, which freezes CSS animations at t=0).
// Usage: node cdp.mjs <page url> <out prefix> <card index> <ms after Play>...
// A negative time is captured before the click. ACTION=fs clicks the card's full-screen button,
// ACTION=full the header's Full screen button (no autoplay); otherwise the card's Play.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [url, outPrefix, cardArg, ...times] = process.argv.slice(2);
const card = Number(cardArg || 0);
const port = 9400 + Math.floor(Math.random() * 400);
const prof = `${process.cwd()}\\profiles\\cdp${port}`;
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
let id = 0;
const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(3000); // load, fonts, images
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${outPrefix}-${name}.png`, Buffer.from(r.result.data, 'base64'));
};
await send('Runtime.evaluate', { expression: `(() => { const c = document.querySelectorAll('.card')[${card}]; c.scrollIntoView({ block: 'start' }); window.scrollBy(0, -20); return true; })()` });
if (process.env.PRE_JS) await send('Runtime.evaluate', { expression: process.env.PRE_JS }); // e.g. switch the layout
await sleep(300);
for (const t of times.map(Number).filter(t => t < 0)) { await shot(`pre${-t}`); console.log('captured before the click'); }
const target = { fs: `c.querySelector('.fs')`, full: `document.getElementById('full')` }[process.env.ACTION] || `c.querySelector('.play')`;
await send('Runtime.evaluate', { userGesture: true, expression: `(() => { const c = document.querySelectorAll('.card')[${card}]; ${target}.click(); return true; })()` });
const t0 = Date.now();
for (const t of times.map(Number).filter(t => t >= 0)) {
  await sleep(Math.max(0, t - (Date.now() - t0)));
  await shot(t);
  console.log('captured', t, 'ms (actual', Date.now() - t0, ')');
}
ws.close();
spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${port}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`]);
process.exit(0);
