// Loads the page in headless Edge (real time) and checks every clip decodes: duration, and that it plays.
import { spawn, spawnSync } from 'node:child_process';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2];
const port = 9800 + Math.floor(Math.random() * 150);
const proc = spawn(edge, ['--headless=new', '--disable-gpu', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}\\profiles\\aud${port}`, 'about:blank']);
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
await send('Page.navigate', { url });
await sleep(2500);
const expr = `(async () => {
  const srcs = [...new Set(Object.values(CLIPS).flat().map(c => c.src))];
  const rows = await Promise.all(srcs.map(src => new Promise(res => {
    const a = new Audio(src); a.muted = true;
    const done = (ok, why) => res(src + ' ' + (ok ? 'ok ' + a.duration.toFixed(2) + 's' : 'FAIL ' + why));
    a.addEventListener('loadedmetadata', () => a.play().then(() => setTimeout(() => done(a.currentTime > 0, 'did not advance'), 400)).catch(e => done(false, e.message)));
    a.addEventListener('error', () => done(false, 'error ' + (a.error && a.error.code)));
    setTimeout(() => done(false, 'timeout'), 6000);
  })));
  return rows.join('\\n');
})()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
console.log(r.result && r.result.result ? r.result.result.value : JSON.stringify(r));
ws.close();
spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${port}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`]);
process.exit(0);
