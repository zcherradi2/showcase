// tools/shot.mjs — screenshot a route, so a visual change can be checked without
// driving the user's real browser.  node tools/shot.mjs "#/" out.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.PERSONA_BASE || 'http://127.0.0.1:8130';
const route = process.argv[2] || '#/';
const out = process.argv[3] || 'shot.png';
const port = 9411 + Math.floor(Math.random() * 60);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-shot-'));

const child = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(200);
  }
  throw new Error('chrome did not start');
}

const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/${route}` });
await sleep(2600);

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));

// report what the ambient layer actually rendered as
const probe = await send('Runtime.evaluate', {
  expression: `(() => {
    const a = document.querySelector('.ambient');
    const m = [...document.querySelectorAll('.ambient .mask, .ambient .glow')].map((n) => {
      const r = n.getBoundingClientRect();
      return { cls: n.getAttribute('class'), w: Math.round(r.width), h: Math.round(r.height), blur: getComputedStyle(n).filter };
    });
    return JSON.stringify({ ambient: !!a, display: a && getComputedStyle(a).display, count: m.length, nodes: m });
  })()`,
  returnByValue: true,
});

console.log(probe.result.value);
console.log('wrote ' + out);
ws.close();
child.kill();
process.exit(0);
