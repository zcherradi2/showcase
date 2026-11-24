// public/js/ui.js — small helpers. No framework, no build step.

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, ms = 2600) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), ms);
}

export async function copy(text, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(label);
    } catch {
      toast('Copy failed — select the text manually');
    }
    ta.remove();
  }
}

export const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export const pct = (n) => `${Math.round(n)}%`;
export const signed = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${Math.round(n)}`);

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export const shareUrl = (id) => `${location.origin}/#/v/${id}`;
export const reportUrl = (id) => `${location.origin}/#/p/${id}`;

export function loading(main, label = 'Reading the room…') {
  main.innerHTML = `<div class="wrap"><div class="panel" style="display:flex; gap:14px; align-items:center; justify-content:center; padding:44px">
    <span class="spinner"></span><span class="muted">${esc(label)}</span></div></div>`;
}

export function errorPanel(main, message, back = '#/') {
  main.innerHTML = `<div class="wrap wrap-narrow"><div class="panel">
    <div class="eyebrow">Something failed</div>
    <h2 class="section" style="margin-top:12px">${esc(message)}</h2>
    <p class="small">Nothing was saved. <a href="${back}">Go back</a>.</p>
  </div></div>`;
}

// The resolving portrait: blur and grain drain out as the votes come in.
export function portraitHTML(avatar, votes, { max = 25, label = '' } = {}) {
  const resolve = Math.max(0, Math.min(1, votes / max));
  return `<div class="portrait fade-in" style="--resolve:${resolve.toFixed(2)}">
    <div class="noise"></div>
    <div class="scan"></div>
    <span class="glyph">${esc(avatar || '◐')}</span>
    ${label ? `<span class="cap">${esc(label)}</span>` : ''}
  </div>`;
}

export function statHTML(value, key, suffix = '') {
  return `<div class="stat"><div class="v">${esc(String(value))}${suffix ? `<small>${esc(suffix)}</small>` : ''}</div><div class="k">${esc(key)}</div></div>`;
}
