// public/js/instrument.js — the three-part instrument, shared by voters and by the
// owner filling in their Ego. Same questions both ways; that is the whole design.

import { CARDS, DIALS, PROBES } from '../../shared/model.js';
import { esc } from './ui.js';

// Presentation-only stop words, so a 5-stop dial reads like a sentence.
export const STOP_LABELS = {
  warmth: ['Ice', 'Cool', 'Even', 'Warm', 'Hearth'],
  order: ['Drift', 'Loose', 'Even', 'Tidy', 'Grid'],
  candor: ['Veil', 'Soft', 'Even', 'Direct', 'Blade'],
  drive: ['Anchor', 'Slow', 'Even', 'Moving', 'Engine'],
  play: ['Stone', 'Dry', 'Even', 'Light', 'Spark'],
  nerve: ['Harbor', 'Careful', 'Even', 'Bold', 'Cliff'],
};

export function newState() {
  return { cards: [], dials: {}, probes: {} };
}

export function cardsHTML(state) {
  return `<div class="deck">${CARDS.map((card) => {
    const on = state.cards.includes(card.id);
    const order = state.cards.indexOf(card.id);
    const locked = state.cards.length >= 3 && !on;
    return `<button type="button" class="card-pick ${on ? 'on' : ''}" data-card="${card.id}" ${locked ? 'disabled' : ''} aria-pressed="${on}">
      <span class="n">${on ? `0${order + 1}` : ''}</span>
      <span class="t">${esc(card.title)}</span>
      <span class="l">${esc(card.line)}</span>
    </button>`;
  }).join('')}</div>`;
}

export function dialsHTML(state) {
  return DIALS.map((dial) => {
    const labels = STOP_LABELS[dial.axis];
    const current = state.dials[dial.axis];
    return `<div class="dial">
      <div class="q">${esc(dial.prompt)}</div>
      <div class="stops" role="group" aria-label="${esc(dial.axis)}">
        ${labels
          .map(
            (label, i) =>
              `<button type="button" data-stop="${dial.axis}:${i}" class="${current === i ? 'on' : ''}" aria-pressed="${current === i}">${esc(label)}</button>`,
          )
          .join('')}
      </div>
      <div class="poles"><span>${esc(dial.low)}</span><span>${esc(dial.high)}</span></div>
    </div>`;
  }).join('');
}

export function probesHTML(state) {
  return PROBES.map((probe) => {
    const chosen = state.probes[probe.id];
    return `<div class="probe">
      <div class="setup">${esc(probe.setup)}</div>
      <div class="opts">
        ${probe.options
          .map(
            (opt, i) =>
              `<button type="button" class="opt ${chosen === i ? 'on' : ''}" data-probe="${probe.id}:${i}" aria-pressed="${chosen === i}">${esc(opt.label)}</button>`,
          )
          .join('')}
        <button type="button" class="opt skip ${chosen === null || chosen === undefined ? 'on' : ''}" data-probe="${probe.id}:skip">I honestly can't say</button>
      </div>
    </div>`;
  }).join('');
}

// In-place repaint. The first version rebuilt the whole deck on every click, which
// flickered, reset the scroll and made a fast second click land on a detached node.
export function paintCards(root, state) {
  root.querySelectorAll('button[data-card]').forEach((btn) => {
    const id = btn.dataset.card;
    const on = state.cards.includes(id);
    const order = state.cards.indexOf(id);
    btn.classList.toggle('on', on);
    btn.disabled = state.cards.length >= 3 && !on;
    btn.setAttribute('aria-pressed', String(on));
    const n = btn.querySelector('.n');
    if (n) n.textContent = on ? `0${order + 1}` : '';
  });
}

export function paintDials(root, state) {
  root.querySelectorAll('.dial').forEach((dial) => {
    const first = dial.querySelector('button[data-stop]');
    if (!first) return;
    const axis = first.dataset.stop.split(':')[0];
    const current = state.dials[axis];
    dial.querySelectorAll('button[data-stop]').forEach((btn) => {
      const on = current !== undefined && Number(btn.dataset.stop.split(':')[1]) === current;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  });
}

export function paintProbes(root, state) {
  root.querySelectorAll('.probe').forEach((probe) => {
    const buttons = [...probe.querySelectorAll('button[data-probe]')];
    if (!buttons.length) return;
    const id = buttons[0].dataset.probe.split(':')[0];
    const chosen = state.probes[id];
    buttons.forEach((btn) => {
      const value = btn.dataset.probe.split(':')[1];
      const on = value === 'skip' ? chosen === undefined || chosen === null : chosen === Number(value);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  });
}

// Mutates state from a click on a data-* element. Returns what changed.
export function applyClick(state, dataset) {
  if (dataset.card) {
    const i = state.cards.indexOf(dataset.card);
    if (i >= 0) state.cards.splice(i, 1);
    else if (state.cards.length < 3) state.cards.push(dataset.card);
    return 'cards';
  }
  if (dataset.stop) {
    const [axis, stop] = dataset.stop.split(':');
    if (state.dials[axis] === Number(stop)) delete state.dials[axis];
    else state.dials[axis] = Number(stop);
    return 'dials';
  }
  if (dataset.probe) {
    const [id, value] = dataset.probe.split(':');
    if (value === 'skip') {
      if (state.probes[id] === undefined || state.probes[id] === null) delete state.probes[id];
      else state.probes[id] = null;
    } else if (state.probes[id] === Number(value)) delete state.probes[id];
    else state.probes[id] = Number(value);
    return 'probes';
  }
  return null;
}

export const counts = (state) => ({
  cards: state.cards.length,
  dials: Object.keys(state.dials).length,
  probes: Object.values(state.probes).filter((v) => v === 0 || v === 1).length,
});

export const ready = (state) => {
  const c = counts(state);
  return { cards: c.cards === 3, dials: c.dials >= 4, probes: c.probes >= 3, all: c.cards === 3 && c.dials >= 4 && c.probes >= 3 };
};

export function payload(state, extra = {}) {
  const probes = {};
  for (const [k, v] of Object.entries(state.probes)) if (v === 0 || v === 1) probes[k] = v;
  return { cards: state.cards, dials: state.dials, probes, ...extra };
}
