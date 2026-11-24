// public/js/views/vote.js — the ritual. Five screens, no back button needed
// (there is one anyway), and the voter never sees a result.

import { api, voted } from '../api.js';
import { applyClick, cardsHTML, counts, dialsHTML, newState, paintCards, paintDials, paintProbes, payload, probesHTML, ready } from '../instrument.js';
import { RINGS, receiptPrompt } from '../../../shared/model.js';
import { esc, go, portraitHTML } from '../ui.js';

export async function render(main, params) {
  const id = params.id;
  let persona;
  try {
    persona = await api.get(id);
  } catch (err) {
    main.innerHTML = `<div class="wrap wrap-narrow"><div class="panel">
      <div class="eyebrow">Dead link</div>
      <h2 class="section" style="margin-top:12px">This dossier does not exist</h2>
      <p class="small">${esc(err.message)}</p>
      <div class="btn-row" style="margin-top:12px"><a class="btn" href="#/new">Open your own</a></div>
    </div></div>`;
    return () => {};
  }

  const state = newState();
  const extra = { receipt: '', ring: '', doorAnswer: '', doorAttempts: 0 };
  let step = voted.get(id) ? 5 : 0;
  let lastCount = 0;

  const header = (kicker) =>
    `<div class="eyebrow">${esc(kicker)}</div>
     <div style="display:flex;gap:14px;align-items:center;margin:14px 0 6px">
       <div style="width:60px;flex:0 0 60px">${portraitHTML(persona.avatar, persona.votes, { max: 25, label: '' })}</div>
       <div>
         <h1 class="section" style="font-size:31px;margin:0">${esc(persona.name)}</h1>
         <p class="small" style="margin:2px 0 0">${esc(persona.tagline || 'Wants to know how they actually land.')}</p>
       </div>
     </div>`;

  const progress = (s) =>
    `<div class="progress">${[1, 2, 3, 4].map((i) => `<i class="${i < s ? 'done' : i === s ? 'on' : ''}"></i>`).join('')}</div>`;

  function draw() {
    if (step === 0) return intro();
    if (step === 1) return cards();
    if (step === 2) return dials();
    if (step === 3) return probes();
    if (step === 4) return final();
    return done();
  }

  function intro() {
    main.innerHTML = `<div class="wrap wrap-narrow fade-in">
      ${header('A persona dossier · anonymous')}
      <div class="panel" style="margin-top:18px">
        <h2 style="font-family:var(--serif);font-size:23px;margin:0 0 8px">${esc(persona.name)} wants to know how they land.</h2>
        <p class="small" style="margin:0 0 14px">Not a rating. Four rounds, ninety seconds, no correct answers. ${esc(persona.name)} sees the pattern of the room — never which answers are yours, and never your words next to your name.</p>
        <div class="grid-3" style="gap:10px;margin:16px 0 4px">
          ${[
            ['Three cards', 'from a deck of fourteen'],
            ['Six dials', 'bipolar, no hiding'],
            ['Four probes', 'unfair either/ors'],
          ]
            .map(
              ([t, d]) => `<div class="panel" style="padding:13px"><div style="font-family:var(--serif);font-size:15px">${t}</div><div class="tiny" style="margin-top:4px;text-transform:none;letter-spacing:0">${d}</div></div>`,
            )
            .join('')}
        </div>
        ${persona.doorQuestion ? `<div class="notice" style="margin-top:14px">This dossier has a door question. Answer it and your vote counts at full weight; skip it and it counts as Unverified (0.4×).</div>` : ''}
      </div>
      <div class="btn-row" style="margin-top:20px">
        <button class="btn primary" id="begin">Begin</button>
        <a class="btn ghost" href="#/new">Open my own instead</a>
      </div>
      <p class="tiny" style="margin-top:16px">${persona.votes} ${persona.votes === 1 ? 'voice' : 'voices'} so far</p>
    </div>`;
    main.querySelector('#begin').addEventListener('click', () => {
      step = 1;
      draw();
      window.scrollTo({ top: 0 });
    });
  }

  function cards() {
    main.innerHTML = `<div class="wrap wrap-narrow fade-in">
      ${progress(1)}
      <h1 class="section" style="font-size:29px;margin:0 0 4px">Which three are ${esc(persona.name)}?</h1>
      <p class="muted" style="font-size:14px;margin-bottom:18px">Not who they would like to be. Who they are in your experience.</p>
      <div id="body">${cardsHTML(state)}</div>
      <div class="btn-row" style="margin-top:20px; justify-content:space-between">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn primary" id="next" disabled>Place the dials</button>
      </div>
    </div>`;

    const refresh = () => {
      const r = ready(state);
      const next = main.querySelector('#next');
      next.disabled = counts(state).cards !== 3;
      next.textContent = counts(state).cards === 3 ? 'Place the dials' : `Pick ${3 - counts(state).cards} more`;
      return r;
    };

    main.querySelector('#body').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-card]');
      if (!btn) return;
      applyClick(state, btn.dataset);
      paintCards(main.querySelector('#body'), state);
      refresh();
    });
    main.querySelector('#back').addEventListener('click', () => { step = 0; draw(); });
    main.querySelector('#next').addEventListener('click', () => { step = 2; draw(); window.scrollTo({ top: 0 }); });
    refresh();
  }

  function dials() {
    main.innerHTML = `<div class="wrap wrap-narrow fade-in">
      ${progress(2)}
      <h1 class="section" style="font-size:29px;margin:0 0 4px">Where does ${esc(persona.name)} actually sit?</h1>
      <p class="muted" style="font-size:14px;margin-bottom:18px">Tap the same stop twice to clear it. At least four of six.</p>
      <div id="body">${dialsHTML(state)}</div>
      <div class="btn-row" style="margin-top:20px; justify-content:space-between">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn primary" id="next" disabled>The probes</button>
      </div>
    </div>`;

    const refresh = () => {
      const n = Object.keys(state.dials).length;
      const next = main.querySelector('#next');
      next.disabled = n < 4;
      next.textContent = n < 4 ? `${4 - n} more to place` : 'The probes';
    };

    main.querySelector('#body').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-stop]');
      if (!btn) return;
      applyClick(state, btn.dataset);
      paintDials(main.querySelector('#body'), state);
      refresh();
    });
    main.querySelector('#back').addEventListener('click', () => { step = 1; draw(); });
    main.querySelector('#next').addEventListener('click', () => { step = 3; draw(); window.scrollTo({ top: 0 }); });
    refresh();
  }

  function probes() {
    main.innerHTML = `<div class="wrap wrap-narrow fade-in">
      ${progress(3)}
      <h1 class="section" style="font-size:29px;margin:0 0 4px">What would ${esc(persona.name)} do?</h1>
      <p class="muted" style="font-size:14px;margin-bottom:18px">Answer with the behaviour you have seen, not the one that flatters. At least three of four.</p>
      <div id="body">${probesHTML(state)}</div>
      <div class="btn-row" style="margin-top:20px; justify-content:space-between">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn primary" id="next" disabled>Almost done</button>
      </div>
    </div>`;

    const refresh = () => {
      const n = counts(state).probes;
      const next = main.querySelector('#next');
      next.disabled = n < 3;
      next.textContent = n < 3 ? `${3 - n} more answer${3 - n === 1 ? '' : 's'}` : 'Almost done';
    };

    main.querySelector('#body').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-probe]');
      if (!btn) return;
      applyClick(state, btn.dataset);
      paintProbes(main.querySelector('#body'), state);
      refresh();
    });
    main.querySelector('#back').addEventListener('click', () => { step = 2; draw(); });
    main.querySelector('#next').addEventListener('click', () => { step = 4; draw(); window.scrollTo({ top: 0 }); });
    refresh();
  }

  function final() {
    main.innerHTML = `<div class="wrap wrap-narrow fade-in">
      ${progress(4)}
      <h1 class="section" style="font-size:29px;margin:0 0 4px">One line, and who you are to them</h1>
      <p class="muted" style="font-size:14px;margin-bottom:18px">The receipts are what ${esc(persona.name)} will actually reread.</p>

      <div class="panel" style="margin-bottom:14px">
        <div class="field" style="margin-bottom:0">
          <label for="f-receipt">${esc(receiptPrompt(persona.id))}</label>
          <textarea id="f-receipt" maxlength="160" placeholder="Optional, and worth more than all four probes.">${esc(extra.receipt)}</textarea>
          <div class="hint" id="rcount">0 / 160</div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:14px">
        <div class="label">How do you know ${esc(persona.name)}?</div>
        <div class="chips" id="rings" style="margin-top:10px">
          ${RINGS.filter((r) => r.id !== 'outer')
            .map(
              (r) => `<button type="button" class="chip ${extra.ring === r.id ? 'on' : ''}" data-ring="${r.id}" title="${esc(r.blurb)}">${esc(r.label)}</button>`,
            )
            .join('')}
        </div>
        <p class="hint">This decides how much your voice weighs: the closer you are, the more it counts.</p>
      </div>

      ${
        persona.doorQuestion
          ? `<div class="panel" style="margin-bottom:14px">
        <div class="field" style="margin-bottom:0">
          <label for="f-door">Door question</label>
          <input id="f-door" type="text" maxlength="60" placeholder="${esc(persona.doorQuestion)}" value="${esc(extra.doorAnswer)}" />
          <div class="hint">Not proof of identity, only of proximity. Wrong or empty: your vote counts as Unverified.</div>
        </div>
      </div>`
          : ''
      }

      <div id="err"></div>
      <div class="btn-row" style="margin-top:6px; justify-content:space-between">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn primary" id="send" disabled>Cast my vote</button>
      </div>
      <p class="hint" style="margin-top:12px">One vote per device. No account, no email, no tracking pixel.</p>
    </div>`;

    const receipt = main.querySelector('#f-receipt');
    const rc = main.querySelector('#rcount');
    const send = main.querySelector('#send');

    const refresh = () => {
      const ok = !!extra.ring;
      send.disabled = !ok;
      send.textContent = ok ? 'Cast my vote' : 'Pick your ring to continue';
    };

    receipt.addEventListener('input', () => {
      extra.receipt = receipt.value;
      rc.textContent = `${receipt.value.length} / 160`;
    });
    rc.textContent = `${extra.receipt.length} / 160`;

    main.querySelector('#rings').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ring]');
      if (!btn) return;
      extra.ring = btn.dataset.ring;
      main.querySelectorAll('#rings .chip').forEach((c) => c.classList.toggle('on', c === btn));
      refresh();
    });
    const door = main.querySelector('#f-door');
    if (door) door.addEventListener('input', () => { extra.doorAnswer = door.value; });

    main.querySelector('#back').addEventListener('click', () => { step = 3; draw(); });
    send.addEventListener('click', async () => {
      send.disabled = true;
      send.textContent = 'Casting…';
      const errBox = main.querySelector('#err');
      errBox.innerHTML = '';
      try {
        const res = await api.vote(id, payload(state, { ring: extra.ring, receipt: extra.receipt.trim(), doorAnswer: extra.doorAnswer.trim() }));
        voted.set(id);
        lastCount = res.count ?? persona.votes + 1;
        step = 5;
        draw();
        window.scrollTo({ top: 0 });
      } catch (err) {
        if (err.status === 409) {
          voted.set(id);
          step = 5;
          draw();
          return;
        }
        errBox.innerHTML = `<div class="notice err">${esc(err.message)}</div>`;
        refresh();
      }
    });
    refresh();
  }

  function done() {
    const count = lastCount || persona.votes + 1;
    main.innerHTML = `<div class="wrap wrap-narrow fade-in center" style="padding-top:20px">
      <div style="max-width:230px;margin:0 auto 22px">${portraitHTML(persona.avatar, count, { max: 25, label: `${count} voices` })}</div>
      <h1 class="section" style="font-size:32px;margin:0 0 8px">Your vote is in the noise</h1>
      <p class="muted" style="font-size:14.5px;max-width:44ch;margin:0 auto 22px">${esc(persona.name)} will never know which answers were yours, only that the picture got one voice sharper. ${count > 3 ? 'The analyst can already read it.' : 'Three voices and the analyst can read it.'}</p>
      <div class="btn-row" style="justify-content:center">
        ${persona.votes >= 3 || count >= 3 ? `<a class="btn" href="#/p/${id}">See the public portrait</a>` : ''}
        <a class="btn primary" href="#/new">Open my own dossier</a>
      </div>
    </div>`;
  }

  draw();
  return () => {};
}
