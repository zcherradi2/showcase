// tools/measure.mjs — "is it too loud?" as a number instead of an opinion.
//
// Screenshots a route in headless Chrome over CDP, decodes the PNG with zlib only,
// and reports luminance + saturation per region. A background mask should be DARK
// (low luminance) and not screaming with colour; this catches both.
//
//   node tools/measure.mjs "#/" [width] [height]

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [route = '#/', W = '1440', H = '900'] = process.argv.slice(2);
const BASE = 'http://127.0.0.1:8130';

// ---- minimal PNG decode (8-bit RGB/RGBA, non-interlaced) -------------------
function decodePng(buf) {
  let p = 8;
  let w = 0, h = 0, colorType = 6, bitDepth = 8;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('only 8-bit PNG supported');
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!ch) throw new Error('unsupported colour type ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.from(line);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = cur[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, ch, data: out };
}

function stats(img, x0, y0, x1, y1) {
  let sum = 0, n = 0, max = 0, satSum = 0, maxSat = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.w + x) * img.ch;
      const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      sum += lum; n++; max = Math.max(max, lum);
      satSum += sat; maxSat = Math.max(maxSat, sat);
    }
  }
  return {
    lum: +(sum / n).toFixed(1),
    maxLum: +max.toFixed(1),
    sat: +(satSum / n).toFixed(3),
    maxSat: +maxSat.toFixed(2),
  };
}

// ---- drive Chrome ---------------------------------------------------------
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9341', `--user-data-dir=${userDir}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) {
  try { targets = await (await fetch('http://127.0.0.1:9341/json/list')).json(); break; } catch { await sleep(250); }
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id;
  waiting.set(n, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id: n, method, params }));
});

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/' + route });
await sleep(2600);

const shot = await send('Page.captureScreenshot', { format: 'png' });
const img = decodePng(Buffer.from(shot.data, 'base64'));
const third = Math.floor(img.w / 3);
const result = {
  size: `${img.w}x${img.h}`,
  left: stats(img, 0, 0, third, img.h),
  centre: stats(img, third, 0, third * 2, img.h),
  right: stats(img, third * 2, 0, img.w, img.h),
};
console.log(JSON.stringify(result, null, 2));

ws.close();
chrome.kill();
process.exit(0);
