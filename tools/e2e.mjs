// tools/e2e.mjs
// Headless end-to-end run against a real browser, with no npm dependencies:
// Chrome/Edge is started with --remote-debugging-port and driven over CDP with
// Node's built-in WebSocket. It clicks the actual UI, so a broken view fails here.
//
//   node tools/e2e.mjs            (expects the API on http://127.0.0.1:8130)
//   node tools/e2e.mjs --shots    (also writes screenshots to tests/screens)

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.PERSONA_URL || 'http://127.0.0.1:8130';
const SHOTS = process.argv.includes('--shots');
const PORT = 9333;

const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const log = [];
const fail = [];
let step = 0;

function say(line) {
  log.push(line);
  console.log(line);
}
function bad(line) {
  fail.push(line);
  console.log('  ✗ ' + line);
}
function ok(line) {
  step++;
  console.log('  ✓ ' + line);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 12000, every = 120, label = 'condition' } = {}) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err;
    }
    await sleep(every);
  }
  throw new Error(`timed out waiting for ${label}${last instanceof Error ? ': ' + last.message : ''}`);
}

class Tab {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.console = [];
    this.failedRequests = [];
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', () => reject(new Error('cdp socket failed')), { once: true });
    });
    this.ws.addEventListener('message', (ev) => this.onMessage(JSON.parse(ev.data)));
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Network.enable');
    return this;
  }

  onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      this.console.push(`${msg.params.type}: ` + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      this.console.push('exception: ' + (d.exception?.description || d.text));
    }
    if (msg.method === 'Network.responseReceived') {
      const r = msg.params.response;
      if (r.status >= 400) this.failedRequests.push(`${r.status} ${r.url}`);
    }
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 20000);
    });
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    await sleep(250);
  }

  async eval(fn, ...args) {
    const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  }

  async text(sel = 'body') {
    return this.eval((s) => (document.querySelector(s)?.innerText || '').replace(/\s+/g, ' ').trim(), sel);
  }

  async click(sel) {
    await this.eval((s) => {
      const el = document.querySelector(s);
      if (!el) throw new Error('no element for ' + s);
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    }, sel);
    await sleep(140);
  }

  async type(sel, value) {
    await this.eval((s, v) => {
      const el = document.querySelector(s);
      if (!el) throw new Error('no field for ' + s);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, sel, value);
    await sleep(90);
  }

  async shot(name) {
    if (!SHOTS) return;
    const dir = path.join(ROOT, 'tests', 'screens');
    fs.mkdirSync(dir, { recursive: true });
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(data, 'base64'));
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

function startBrowser() {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('no Chrome or Edge found to drive');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-e2e-'));
  const child = spawn(
    exe,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--window-size=1440,1000',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-features=Translate,MediaRouter',
      'about:blank',
    ],
    { stdio: 'ignore', detached: false }
  );
  return { child, profile };
}

async function connect() {
  const target = await waitFor(
    async () => {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      return list.find((t) => t.type === 'page');
    },
    { timeout: 20000, label: 'devtools endpoint' }
  );
  const tab = await new Tab(target.webSocketDebuggerUrl).open();
  await tab.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  return tab;
}

// ---------------------------------------------------------------- the run ---

async function main() {
  const health = await (await fetch(`${BASE}/api/health`)).json();
  say(`api up on ${BASE} · analyst ${health.ai?.up ? 'live' : 'local'} · ${health.personas ?? '?'} personas`);

  const { child, profile } = startBrowser();
  let tab;
  try {
    tab = await connect();

    // ---- landing
    say('\nlanding');
    await tab.goto(`${BASE}/#/`);
    // Wait for the manifesto itself: "vote" also appears in the footer, so waiting on
    // that word matched the shell before the view had painted.
    await waitFor(async () => /Shadow/.test(await tab.text()), { label: 'landing copy' });
    const landing = await tab.text();
    if (!/Ego/i.test(landing) || !/Shadow/i.test(landing)) bad('landing does not name Ego and Shadow');
    else ok('manifesto renders with Ego, Persona and Shadow');
    await tab.shot('01-landing');

    // ---- how it works
    say('\nmethod page');
    await tab.goto(`${BASE}/#/how`);
    await waitFor(async () => (await tab.text()).length > 400, { label: 'method copy' });
    const how = await tab.text();
    if (!/8|eight/.test(how)) bad('method page does not mention the 8 axes');
    else ok('method page explains the maths');
    await tab.shot('02-how');

    // ---- create a persona, including the Ego sheet
    say('\nopen a dossier (create + Ego)');
    await tab.goto(`${BASE}/#/new`);
    await waitFor(async () => (await tab.text()).includes('Ego'), { label: 'create view' });

    await tab.type('#f-name', 'Ziko Test');
    await tab.type('#f-tag', 'ships at 2am, apologises at 9');
    await tab.type('#f-doorq', 'what city are we from');
    await tab.type('#f-doora', 'Casablanca');
    await tab.click('#next');
    await waitFor(async () => (await tab.eval(() => document.querySelectorAll('button[data-stop]').length)) > 0, { label: 'ego dial step' });

    // answer the self-test by clicking the UI: warm end of every dial, three warm cards
    await tab.eval(() => {
      document.querySelectorAll('.dial').forEach((d) => {
        const stops = d.querySelectorAll('[data-stop]');
        if (stops.length) stops[stops.length - 1].click();
      });
      return true;
    });
    await sleep(150);
    await tab.eval(() => {
      document.querySelectorAll('button[data-card]').forEach((c, i) => {
        if (i < 3) c.click();
      });
      return true;
    });
    await sleep(150);
    await tab.eval(() => {
      document.querySelectorAll('.probe').forEach((p) => {
        const opt = [...p.querySelectorAll('button[data-probe]')].find((b) => !b.classList.contains('skip'));
        if (opt) opt.click();
      });
      return true;
    });
    await sleep(200);
    const dials = await tab.eval(() => document.querySelectorAll('.dial').length);

    const createText = await tab.text();
    const egoReady = await tab.eval(() => !document.querySelector('#save')?.disabled);
    if (!egoReady) bad('the Ego sheet never became submittable: ' + createText.slice(0, 120));
    await tab.click('#save');
    await waitFor(
      async () => (await tab.eval(() => Object.keys(localStorage).filter((k) => k.startsWith('persona.owner.')).length)) > 0,
      { timeout: 15000, label: 'owner token stored' }
    );
    ok(`self-test answered and saved (${dials} dials)`);

    const ids = await tab.eval(() => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('persona.owner.'));
      return keys.map((k) => k.replace('persona.owner.', ''));
    });
    if (!ids.length) throw new Error('no owner token was stored, creation failed');
    const id = ids[ids.length - 1];
    say(`  dossier id: ${id}`);
    await tab.shot('03-created');

    // ---- vote as a stranger would
    say('\nvoting as a stranger');
    await tab.goto(`${BASE}/#/v/${id}`);
    await waitFor(async () => (await tab.text()).includes('wants to know'), { label: 'vote intro' });
    ok('vote intro opens on the dossier');
    await tab.shot('04-vote-start');

    await tab.click('#begin');
    await waitFor(async () => (await tab.eval(() => document.querySelectorAll('button[data-card]').length)) > 0, { label: 'card step' });
    const cardCount = await tab.eval(() => document.querySelectorAll('button[data-card]').length);
    if (cardCount < 10) bad(`card step shows only ${cardCount} cards`);
    else ok(`${cardCount} archetype cards on screen, three to pick`);

    await tab.eval(() => {
      [...document.querySelectorAll('button[data-card]')].slice(0, 3).forEach((c) => c.click());
      return true;
    });
    await sleep(150);
    if (await tab.eval(() => document.querySelector('#next')?.disabled)) bad('three cards picked but the step will not advance');
    await tab.click('#next');

    // dials: six, at least four of them
    await waitFor(async () => (await tab.eval(() => document.querySelectorAll('button[data-stop]').length)) > 0, { label: 'dial step' });
    const dialGroups = await tab.eval(() => document.querySelectorAll('.dial').length);
    if (dialGroups < 4) bad(`dial step shows ${dialGroups} dials`);
    await tab.eval(() => {
      document.querySelectorAll('.dial').forEach((d) => {
        const stops = d.querySelectorAll('[data-stop]');
        if (stops.length) stops[0].click();
      });
      return true;
    });
    await sleep(150);
    const dialsPlaced = await tab.eval(() => [...document.querySelectorAll('.dial')].filter((d) => d.querySelector('[data-stop].on')).length);
    if (dialsPlaced < 4) bad(`only ${dialsPlaced} dials took the click`);
    await tab.click('#next');

    // probes: four, at least three
    await waitFor(async () => (await tab.eval(() => document.querySelectorAll('button[data-probe]').length)) > 0, { label: 'probe step' });
    await tab.eval(() => {
      document.querySelectorAll('.probe').forEach((p) => {
        const opt = [...p.querySelectorAll('button[data-probe]')].find((b) => !b.classList.contains('skip'));
        if (opt) opt.click();
      });
      return true;
    });
    await sleep(150);
    await tab.click('#next');

    // the receipt, the ring and the door
    await waitFor(async () => !!(await tab.eval(() => document.querySelector('#f-receipt'))), { label: 'receipt step' });
    const prompts = await tab.eval(() => document.querySelector('label[for="f-receipt"]')?.textContent?.trim() || '');
    say('  receipt prompt: ' + prompts.slice(0, 90));
    await tab.type('#f-receipt', 'He once drove ninety minutes to return a borrowed drill.');
    await tab.click('[data-ring="work"]');
    await tab.type('#f-door', 'Casablanca');
    if (await tab.eval(() => document.querySelector('#send')?.disabled)) bad('ring picked but the vote button is still disabled');
    await tab.shot('05-vote-receipt');
    await tab.click('#send');
    await waitFor(async () => /vote is in|thanks|thank you|counted/i.test(await tab.text()), { timeout: 15000, label: 'vote accepted' });
    const thanks = await tab.text();
    if (!/vote is in/i.test(thanks)) bad('vote screen said something unexpected: ' + thanks.slice(0, 140));
    const leaked = await tab.eval(() => document.querySelectorAll('svg.radar, svg.chart, .panel .bar').length);
    if (leaked) bad('the voter was shown a results chart, which breaks the premise');
    else ok('vote cast through the UI, and the voter sees no results');

    const pub = await (await fetch(`${BASE}/api/personas/${id}`)).json();
    if (pub.votes < 1) bad('the API does not see the vote the UI sent');
    else ok(`api sees ${pub.votes} vote(s) from the UI`);

    // ---- a second device votes differently: the split
    say('\nsecond voter, opposite answers');
    const vote2 = await fetch(`${BASE}/api/personas/${id}/votes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-voter-id': 'e2e-device-two-XXXX' },
      body: JSON.stringify({
        ring: 'inner',
        cards: ['hearth', 'anchor', 'spark'],
        dials: { warmth: 4, order: 0, depth: 3, candor: 3, drive: 3, play: 4, nerve: 3, force: 1 },
        probes: { p2am: 0, proom: 1, poffer: 1, pchange: 0 },
        receipt: 'She remembers what you said six months ago and brings it up like a gift.',
      }),
    });
    if (vote2.status >= 300) bad(`second vote failed: ${vote2.status} ${await vote2.text()}`);
    else ok('second vote accepted');

    for (let i = 0; i < 4; i++) {
      const r = await fetch(`${BASE}/api/personas/${id}/votes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-voter-id': `e2e-device-${i}-ZZZZZZ` },
        body: JSON.stringify({
          ring: i % 2 ? 'work' : 'online',
          cards: i % 2 ? ['wall', 'anchor', 'veil'] : ['hearth', 'mirror', 'drift'],
          dials: { warmth: i % 2 ? 0 : 4, order: 3, depth: 3, candor: 2, drive: 4, play: i % 2 ? 0 : 3, nerve: 4, force: 4 },
          probes: { p2am: i % 2 ? 0 : 1, proom: i % 2 ? 1 : 0, poffer: i % 2 ? 0 : 1, pchange: i % 2 ? 0 : 1 },
          receipt: `Voter ${i}: never once talked down to me, even when I was clearly wrong about the plan.`,
        }),
      });
      if (r.status >= 300) bad(`extra vote ${i} failed: ${r.status} ${await r.text()}`);
    }
    ok('six votes total across three rings');

    // ---- the owner's portrait
    say('\nowner portrait');
    await tab.goto(`${BASE}/#/p/${id}`);
    // wait for the reading itself, not just for any text: the report loads async
    await waitFor(async () => (await tab.eval(() => document.querySelectorAll('.reading .block').length)) >= 3, {
      timeout: 20000,
      label: 'reading blocks',
    }).catch(() => bad('the reading never rendered three blocks'));
    const report = await tab.text();
    // labels are uppercased in CSS, so compare case-insensitively
    for (const word of ['Persona', 'Ego', 'Shadow']) {
      if (!report.toLowerCase().includes(word.toLowerCase())) bad(`report is missing "${word}"`);
    }
    if (/undefined|NaN|\[object Object\]/.test(report)) bad('report renders undefined/NaN');
    const hasSvg = await tab.eval(() => document.querySelectorAll('svg').length);
    if (hasSvg < 2) bad(`report draws only ${hasSvg} svg charts`);
    else ok(`report renders with ${hasSvg} charts and no undefined values`);
    await tab.shot('06-report');

    // ---- re-run the reading through the AI button
    say('\nthe reading (fast-forward)');
    const analyze = await fetch(`${BASE}/api/personas/${id}/analyze`, {
      method: 'POST',
      headers: { 'x-owner-token': await tab.eval(() => localStorage.getItem(`persona.owner.${location.hash.split('/').pop()}`) || '') },
    });
    say(`  analyze -> ${analyze.status}`);

    const portrait = await (await fetch(`${BASE}/api/personas/${id}/portrait`, {
      headers: { 'x-owner-token': await tab.eval(() => Object.entries(localStorage).filter(([k]) => k.startsWith('persona.owner.')).map(([, v]) => v).pop()) },
    })).json();
    const p = portrait.portrait;
    if (!p) throw new Error('no portrait in the response');
    ok(
      `portrait: n=${p.n} ready=${p.ready} selfKnowledge=${p.theses?.selfKnowledge} meanGap=${p.theses?.meanAbsGap}`
    );
    if (!portrait.analysis?.shadow) bad('no shadow in the reading');
    else ok(`reading source=${portrait.analysis.source}: ${String(portrait.analysis.shadow).slice(0, 90)}…`);

    // ---- digest for the model
    const digest = await (await fetch(`${BASE}/api/personas/${id}/digest`, {
      headers: { 'x-owner-token': await tab.eval(() => Object.entries(localStorage).filter(([k]) => k.startsWith('persona.owner.')).map(([, v]) => v).pop()) },
    })).json();
    if (!digest.axes) bad('digest is missing axes');
    else ok(`digest: ${digest.axes.length} axes, ${digest.receipts?.length ?? 0} receipts, ${JSON.stringify(digest).length} bytes`);

    // ---- Decision D11: the public share page
    say('\nthe public share page');
    const ownerToken = await tab.eval(() => Object.entries(localStorage).filter(([k]) => k.startsWith('persona.owner.')).map(([, v]) => v).pop());
    const shareRaw = await (await fetch(`${BASE}/api/personas/${id}/portrait?view=share`)).json();
    const shareText = JSON.stringify(shareRaw);
    // the point of the split: the room's side is public, the subject's side is not
    for (const forbidden of ['"ego"', '"gap"', '"shadow"', '"findings"', '"theses"', '"digest"']) {
      if (shareText.includes(forbidden)) bad(`the share payload leaks ${forbidden}`);
    }
    if (!shareRaw.portrait?.persona) bad('the share payload has no persona numbers');
    else ok('share payload carries the persona and nothing of the ego, gap or shadow');
    if (!shareRaw.analysis?.persona) bad('the share payload has no reading of the room');
    else ok('share payload includes the analyst reading of the room\'s side');

    await tab.goto(`${BASE}/#/s/${id}`);
    await waitFor(async () => (await tab.text()).toLowerCase().includes('room sees'), { timeout: 20000, label: 'share view' });
    const share = (await tab.text()).toLowerCase();
    for (const word of ['français', 'español']) {
      if (!share.includes(word)) bad(`the share page is missing the ${word} explanation`);
    }
    if (!share.includes('français') || !share.includes('español')) bad('share page lacks the bilingual explainer');
    else ok('share page renders, with the French and Spanish explainer');
    // "not a diagnosis" is exactly the framing we want, so look for the claim, not the word
    const frames = /hypoth[eè]se|hypothesis/.test(share);
    const overclaims = /\bis (definitely|certainly) (a|an)\b|diagnostic certain|nous savons que vous êtes/i.test(share);
    if (!frames || overclaims) bad('the share page does not frame the reading as a hypothesis');
    else ok('the share page frames the reading as a hypothesis, not a diagnosis');
    await tab.shot('07-share');

    // an owner-only read must still be refused without the token
    const refused = await fetch(`${BASE}/api/personas/${id}/portrait`);
    const refusedBody = await refused.json();
    if (refusedBody.gap || refusedBody.analysis || refusedBody.ego) bad('an anonymous portrait leaked owner-only data');
    else ok('anonymous request gets only the locked card');

    // ---- console hygiene
    say('\nbrowser console');
    const noise = tab.console.filter((l) => !/favicon|404 \(Not Found\)\s*$/i.test(l));
    if (noise.length) bad(`${noise.length} console problem(s):\n    ` + noise.slice(0, 6).join('\n    '));
    else ok('no console errors or exceptions');

    const doomed = tab.failedRequests.filter((u) => !/favicon\.ico/.test(u));
    if (doomed.length) bad('failed requests: ' + [...new Set(doomed)].join(', '));
    else ok('no failed network requests');
  } finally {
    if (tab) tab.close();
    child.kill();
    await sleep(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {}
  }

  say(`\n${fail.length ? '✗ ' + fail.length + ' problem(s)' : '✓ all ' + step + ' checks passed'}`);
  fs.writeFileSync(path.join(ROOT, 'tests', 'e2e-last.log'), log.join('\n') + '\n');
  if (fail.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\n✗ e2e aborted:', err.message);
  process.exitCode = 1;
});
