// Probe computed styles of a card mid-play: node probe.mjs <url> <card> <ms> "<js expression returning JSON>"
import { spawn, spawnSync } from 'node:child_process';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [url, cardS, msS, expr] = process.argv.slice(2);
const port = 9800 + Math.floor(Math.random() * 150);
const proc = spawn(edge, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/profiles/probe${port}`, '--window-size=1300,900', 'about:blank']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let t = [];
for (let i = 0; i < 60 && !t.length; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(x => x.type === 'page'); } catch (e) {} if (!t.length) await sleep(250); }
const ws = new WebSocket(t[0].webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Page.navigate', { url }); await sleep(3500);
await send('Runtime.evaluate', { userGesture: true, expression: `(() => { const c = document.querySelectorAll('.card')[${cardS}]; c.scrollIntoView(); c.querySelector('.play').click(); })()` });
await sleep(Number(msS));
const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const card = document.querySelectorAll('.card')[${cardS}]; return (${expr})(card); })()` });
console.log(JSON.stringify(r.result.result.value ?? r.result, null, 1));
ws.close(); spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${port}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`]); process.exit(0);
