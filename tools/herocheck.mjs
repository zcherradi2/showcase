import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm-'));
const port = 9444;
const p = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--window-size=1440,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiters = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); } };
const send = (method, params) => new Promise((res) => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable', {});
await send('Runtime.enable', {});
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8130/#/' });
await sleep(3000);
const r = await send('Runtime.evaluate', { expression: `(() => { const h = document.querySelector('h1.display'); const cs = getComputedStyle(h); const b = h.getBoundingClientRect(); return JSON.stringify({ fontSize: cs.fontSize, maxWidth: cs.maxWidth, width: Math.round(b.width), height: Math.round(b.height), lines: Math.round(b.height / parseFloat(cs.lineHeight)), wrapWidth: Math.round(h.parentElement.getBoundingClientRect().width) }); })()`, returnByValue: true });
console.log(r.result.value);
ws.close(); p.kill();


