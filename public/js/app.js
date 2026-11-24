// public/js/app.js — hash router, footer status, nothing else.

import { api } from './api.js';
import { $, errorPanel, loading } from './ui.js';

const routes = [
  { pattern: /^\/?$/, view: 'landing', nav: '' },
  { pattern: /^\/new\/?$/, view: 'create', nav: 'new' },
  { pattern: /^\/v\/([a-zA-Z0-9]+)\/?$/, view: 'vote', nav: '' },
  { pattern: /^\/p\/([a-zA-Z0-9]+)\/?$/, view: 'report', nav: '' },
  // Decision D11: the public share link. Same data, room's side only.
  { pattern: /^\/s\/([a-zA-Z0-9]+)\/?$/, view: 'share', nav: '' },
  { pattern: /^\/e\/([a-zA-Z0-9]+)\/?$/, view: 'ego', nav: '' },
  { pattern: /^\/how\/?$/, view: 'how', nav: 'how' },
];

const views = {
  landing: () => import('./views/landing.js'),
  create: () => import('./views/create.js'),
  vote: () => import('./views/vote.js'),
  report: () => import('./views/report.js'),
  share: () => import('./views/share.js'),
  ego: () => import('./views/ego.js'),
  how: () => import('./views/how.js'),
};

const main = $('#app');
let cleanup = null;
let token = 0;

async function route() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const path = raw.split('?')[0];
  const mine = ++token;

  for (const r of routes) {
    const m = path.match(r.pattern);
    if (!m) continue;
    document.querySelectorAll('nav.topnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.nav));
    loading(main, r.view === 'report' ? 'Reading the room…' : 'Loading…');    try {
      const mod = await views[r.view]();
      if (mine !== token) return;
      if (typeof cleanup === 'function') cleanup();
      cleanup = await mod.render(main, { id: m[1] });
    } catch (err) {
      if (mine !== token) return;
      console.error(err);
      errorPanel(main, err.message || 'Could not load this view');
    }
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'auto' : 'auto' });
    return;
  }

  errorPanel(main, 'No such page', '#/');
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
if (document.readyState !== 'loading') route();

// Footer: is the analyst listening?
(async () => {
  const el = document.getElementById('ai-status');
  if (!el) return;
  try {
    const h = await api.health();
    if (h.ai?.up) {
      el.textContent = `analyst live · ${h.ai.model}`;
      el.classList.add('live');
    } else {
      el.textContent = 'analyst: local reasoning';
      el.classList.add('local');
      el.title = h.ai?.detail || 'LLM router not reachable';
    }
  } catch {
    el.textContent = 'analyst: offline';
  }
})();
