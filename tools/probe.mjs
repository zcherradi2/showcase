// tools/probe.mjs — open a URL in headless Chrome and print the console, used to
// debug a view quickly: node tools/probe.mjs "#/new"
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.PERSONA_URL || 'http://127.0.0.1:8130';
const PORT = 9344;
const route = process.argv[2] || '';
const exe = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
const child = spawn(exe, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1440,1000', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 60; i++) {
  await sleep(300);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
    if (target) break;
  } catch {}
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') console.log('console.' + msg.params.type, msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
  if (msg.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === 'Network.loadingFailed') console.log('LOAD FAILED', msg.params.errorText);
  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) console.log('HTTP', msg.params.response.status, msg.params.response.url);
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

await send('Runtime.enable');
await send('Network.enable');
await send('Page.enable');
await send('Page.navigate', { url: BASE + '/' + route });
await sleep(2500);
const out = await send('Runtime.evaluate', {
  expression: `JSON.stringify({ dials: document.querySelectorAll('[data-stop]').length, cards: document.querySelectorAll('[data-card]').length, body: document.body.innerText.slice(0,300) })`,
  returnByValue: true,
});
console.log(out.result.value);
child.kill();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
