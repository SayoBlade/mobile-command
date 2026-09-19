// A headless TV client for the live stage test: logs the TV account into the test world and records its camera
// (and whether a banner is up) every 250 ms, as JSON lines. Usage: node tv-client.mjs <seconds>
import { spawn, spawnSync } from 'node:child_process';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const secs = Number(process.argv[2] || 60);
const port = 9400 + Math.floor(Math.random() * 400);
const prof = `${process.cwd()}/profiles/tv${port}`;
const proc = spawn(edge, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1600,900', 'about:blank']);
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
console.log(JSON.stringify({ step: 'join', r: await evalJs(`(() => { const u = document.querySelector('input[name="username"]'); if (!u) return 'no form'; u.value = 'TV'; u.dispatchEvent(new Event('input', { bubbles: true })); u.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('form#join-game-form').requestSubmit(); return 'submitted'; })()`) }));
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  const ok = await evalJs(`!!(globalThis.game?.ready && globalThis.canvas?.ready)`).catch(() => false);
  if (ok) break;
}
console.log(JSON.stringify({ step: 'ready', who: await evalJs('game.user?.name'), scene: await evalJs('canvas.scene?.name') }));
const t0 = Date.now();
while (Date.now() - t0 < secs * 1000) {
  const v = await evalJs(`(() => { const s = canvas.stage; const h = canvas.tokens.placeables.filter(t => t.document.name === 'Wayward Haint').map(t => (t.visible ? '' : 'x') + (t.mesh?.tint ?? 0).toString(16)); return { x: Math.round(s.pivot.x), y: Math.round(s.pivot.y), scale: +s.scale.x.toFixed(3), banner: document.getElementById('mc-entrance')?.className ?? null, haints: h.join(' ') }; })()`).catch(() => null);
  console.log(JSON.stringify({ t: Date.now(), ...v }));
  await sleep(250);
}
ws.close(); spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${port}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`]); process.exit(0);
