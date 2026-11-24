// public/js/views/ego.js — (re)take the self-test for an existing dossier.

import { api } from '../api.js';
import { applyClick, cardsHTML, counts, dialsHTML, newState, paintCards, paintDials, paintProbes, payload, probesHTML, ready } from '../instrument.js';
import { esc, go, toast } from '../ui.js';

export async function render(main, params) {
  const id = params.id;
  const state = newState();

  let existing = null;
  try {
    existing = await api.getEgo(id);
  } catch (err) {
    main.innerHTML = `<div class="wrap wrap-narrow"><div class="panel"><div class="eyebrow">Not yours</div>
      <h2 class="section" style="margin-top:12px">This dossier is not unlocked in this browser</h2>
      <p class="small">${esc(err.message)}</p>
      <a class="btn" href="#/p/${id}">Back to the portrait</a></div></div>`;
    return () => {};
  }

  if (existing) {
    state.cards = existing.cards ?? [];
    state.dials = existing.dials ?? {};
    state.probes = existing.probes ?? {};
  }

  main.innerHTML = `<div class="wrap wrap-narrow fade-in">
    <div class="eyebrow">Your Ego · the control group</div>
    <h1 class="section" style="font-size:34px;margin:12px 0 6px">Answer it about yourself</h1>
    <p class="muted" style="font-size:14.5px">Same instrument as your voters. Saved answers are pre-filled. Changing these changes the gap, not the votes.</p>

    <div class="panel" style="margin:20px 0 16px">
      <div class="step-head"><h3 class="sub">The cards</h3><span class="tiny" id="c-count"></span></div>
      <p class="small" style="margin:4px 0 14px">Three you would hand yourself.</p>
      <div id="cards">${cardsHTML(state)}</div>
    </div>
    <div class="panel" style="margin-bottom:16px">
      <div class="step-head"><h3 class="sub">The dials</h3><span class="tiny" id="d-count"></span></div>
      <div id="dials">${dialsHTML(state)}</div>
    </div>
    <div class="panel" style="margin-bottom:16px">
      <div class="step-head"><h3 class="sub">The probes</h3><span class="tiny" id="p-count"></span></div>
      <div id="probes">${probesHTML(state)}</div>
    </div>
    <div id="err"></div>
    <div class="btn-row">
      <button class="btn primary" id="save">Save my Ego</button>
      <a class="btn ghost" href="#/p/${id}">Back without saving</a>
    </div>
  </div>`;

  const refresh = () => {
    const c = counts(state);
    main.querySelector('#c-count').textContent = `${c.cards} / 3`;
    main.querySelector('#d-count').textContent = `${c.dials} / 6`;
    main.querySelector('#p-count').textContent = `${c.probes} / 4`;
    main.querySelector('#save').disabled = !ready(state).all;
  };

  const wire = (selector, rebuild) => {
    main.querySelector(selector).addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-card], button[data-stop], button[data-probe]');
      if (!btn) return;
      if (!applyClick(state, btn.dataset)) return;
      main.querySelector(selector).innerHTML = rebuild();
      refresh();
    });
  };
  wire('#cards', () => cardsHTML(state));
  wire('#dials', () => dialsHTML(state));
  wire('#probes', () => probesHTML(state));
  refresh();

  main.querySelector('#save').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Saving…';
    try {
      await api.postEgo(id, payload(state));
      toast('Ego saved — the analyst can read the gap now');
      go(`#/p/${id}`);
    } catch (err) {
      main.querySelector('#err').innerHTML = `<div class="notice err">${esc(err.message)}</div>`;
      refresh();
    }
  });

  return () => {};
}
