// public/js/views/create.js — open a dossier: identity, then your own Ego test,
// then the one link you get to send.

import { api, tokens } from '../api.js';
import { applyClick, cardsHTML, counts, dialsHTML, newState, paintCards, paintDials, paintProbes, payload, probesHTML, ready } from '../instrument.js';
import { copy, esc, go, reportUrl, shareUrl, toast } from '../ui.js';

const AVATARS = ['◐', '▲', '✳', '◆', '✧', '☾', '♞', '☉', '❖', '✦', '◈', '⌘'];

export async function render(main) {
  const state = newState();
  let identity = { name: '', tagline: '', avatar: '◐', peers: '', doorQuestion: '', doorAnswer: '' };
  let created = null;

  const progress = (step) =>
    `<div class="progress">${[0, 1, 2].map((i) => `<i class="${i < step ? 'done' : i === step ? 'on' : ''}"></i>`).join('')}</div>`;

  function stepIdentity() {
    main.innerHTML = `<div class="wrap wrap-narrow fade-in">
      ${progress(0)}
      <div class="eyebrow">Step 1 of 3 — the subject</div>
      <h1 class="section" style="font-size:36px;margin:12px 0 6px">Who is being looked at?</h1>
      <p class="muted" style="font-size:14.5px;margin-bottom:24px">You are the subject of this dossier. Nothing here is public until you send the link.</p>

      <div class="panel">
        <div class="field">
          <label for="f-name">Name as people actually call you</label>
          <input id="f-name" type="text" maxlength="60" placeholder="Ziko" value="${esc(identity.name)}" autocomplete="off" />
        </div>
        <div class="field">
          <label for="f-tag">One line the room would recognise</label>
          <input id="f-tag" type="text" maxlength="140" placeholder="Builds things at night. Will tell you the truth and then fix the problem." value="${esc(identity.tagline)}" />
          <div class="hint">Shown to voters. Keep it a fact, not a claim.</div>
        </div>
        <div class="field">
          <label>Mark</label>
          <div class="avatar-row" id="avatars">
            ${AVATARS.map((a) => `<button type="button" class="avatar-pick ${a === identity.avatar ? 'on' : ''}" data-avatar="${a}">${a}</button>`).join('')}
          </div>
          <div class="hint">The portrait resolves from noise into this mark as votes land.</div>
        </div>
        <div class="field">
          <label for="f-peers">Who is allowed an opinion (optional)</label>
          <input id="f-peers" type="text" maxlength="200" placeholder="close friends, family, work, online" value="${esc(identity.peers)}" />
        </div>
      </div>

      <details class="raw" style="margin-top:18px">
        <summary>Add a door question (the inner ring filter)</summary>
        <div class="panel" style="margin-top:10px">
          <p class="small">Ask something only people who really know you could answer. A wrong answer still counts, but at 0.4 weight, as “Unverified”.</p>
          <div class="field">
            <label for="f-doorq">Question</label>
            <input id="f-doorq" type="text" maxlength="120" placeholder="What did we eat the night the power went out?" value="${esc(identity.doorQuestion)}" />
          </div>
          <div class="field">
            <label for="f-doora">Expected answer</label>
            <input id="f-doora" type="text" maxlength="60" placeholder="sardines on the balcony" value="${esc(identity.doorAnswer)}" />
            <div class="hint">Not stored in the clear: only a hash of the normalised answer.</div>
          </div>
        </div>
      </details>

      <div class="btn-row" style="margin-top:24px">
        <button class="btn primary" id="next">Continue to your Ego test</button>
        <a class="btn ghost" href="#/">Cancel</a>
      </div>
      <div id="err" style="margin-top:14px"></div>
    </div>`;

    const bind = (id) => {
      const el = main.querySelector(id);
      el.addEventListener('input', () => {
        if (el.id === 'f-name') identity.name = el.value;
        if (el.id === 'f-tag') identity.tagline = el.value;
        if (el.id === 'f-peers') identity.peers = el.value;
        if (el.id === 'f-doorq') identity.doorQuestion = el.value;
        if (el.id === 'f-doora') identity.doorAnswer = el.value;
      });
    };
    ['#f-name', '#f-tag', '#f-peers', '#f-doorq', '#f-doora'].forEach(bind);

    main.querySelector('#avatars').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-avatar]');
      if (!btn) return;
      identity.avatar = btn.dataset.avatar;
      main.querySelectorAll('.avatar-pick').forEach((b) => b.classList.toggle('on', b === btn));
    });

    main.querySelector('#next').addEventListener('click', async (e) => {
      const errBox = main.querySelector('#err');
      if (identity.name.trim().length < 2) {
        errBox.innerHTML = '<div class="notice err">Give the subject a name of at least two characters.</div>';
        return;
      }
      e.target.disabled = true;
      e.target.textContent = 'Opening…';
      try {
        created = await api.create({
          name: identity.name.trim(),
          tagline: identity.tagline.trim(),
          avatar: identity.avatar,
          peers: identity.peers
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
            .slice(0, 8),
          doorQuestion: identity.doorQuestion.trim(),
          doorAnswer: identity.doorAnswer.trim(),
        });
        tokens.set(created.id, created.token);
        stepEgo();
      } catch (err) {
        errBox.innerHTML = `<div class="notice err">${esc(err.message)}</div>`;
        e.target.disabled = false;
        e.target.textContent = 'Continue to your Ego test';
      }
    });

    main.querySelector('#f-name').focus();
  }

  function stepEgo() {
    main.innerHTML = `<div class="wrap wrap-narrow fade-in">
      ${progress(1)}
      <div class="eyebrow">Step 2 of 3 — your Ego</div>
      <h1 class="section" style="font-size:36px;margin:12px 0 6px">Now answer it about yourself</h1>
      <p class="muted" style="font-size:14.5px;margin-bottom:6px">The exact instrument your voters get. Answer as you believe you are, not as you hope to be seen. You will not see their votes until this is saved, and they will never see your answers.</p>
      <div class="notice" style="margin:16px 0 22px">This is the control group. The gap between this and the room's read is the product.</div>

      <div class="panel" style="margin-bottom:16px">
        <div class="step-head"><h3 class="sub">The cards</h3><span class="tiny" id="c-count">0 / 3</span></div>
        <p class="small" style="margin:4px 0 14px">Pick the three you would hand yourself.</p>
        <div id="cards">${cardsHTML(state)}</div>
      </div>

      <div class="panel" style="margin-bottom:16px">
        <div class="step-head"><h3 class="sub">The dials</h3><span class="tiny" id="d-count">0 / 6</span></div>
        <p class="small" style="margin:4px 0 6px">At least four. Tap the same stop again to clear it.</p>
        <div id="dials">${dialsHTML(state)}</div>
      </div>

      <div class="panel" style="margin-bottom:16px">
        <div class="step-head"><h3 class="sub">The probes</h3><span class="tiny" id="p-count">0 / 4</span></div>
        <p class="small" style="margin:4px 0 6px">At least three. Be honest about the ugly ones.</p>
        <div id="probes">${probesHTML(state)}</div>
      </div>

      <div id="err"></div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn primary" id="save">Save my Ego and open the dossier</button>
        <button class="btn ghost" id="skip">Skip for now</button>
      </div>
      <p class="hint">Skipping is allowed: you will see the room's read but not the gap, until you come back to it.</p>
    </div>`;

    const refresh = () => {
      const c = counts(state);
      const r = ready(state);
      main.querySelector('#c-count').textContent = `${c.cards} / 3`;
      main.querySelector('#d-count').textContent = `${c.dials} / 6`;
      main.querySelector('#p-count').textContent = `${c.probes} / 4`;
      main.querySelector('#save').disabled = !r.all;
      main.querySelector('#save').textContent = r.all
        ? 'Save my Ego and open the dossier'
        : r.cards
          ? 'Finish the instrument'
          : 'Pick three cards first';
    };

    const wire = (selector, kind) => {
      main.querySelector(selector).addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-card], button[data-stop], button[data-probe]');
        if (!btn) return;
        const changed = applyClick(state, btn.dataset);
        if (!changed) return;
        if (kind === 'cards') paintCards(main.querySelector('#cards'), state);
        if (kind === 'dials') paintDials(main.querySelector('#dials'), state);
        if (kind === 'probes') paintProbes(main.querySelector('#probes'), state);
        refresh();
      });
    };
    wire('#cards', 'cards');
    wire('#dials', 'dials');
    wire('#probes', 'probes');
    refresh();

    main.querySelector('#save').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Saving…';
      try {
        await api.postEgo(created.id, payload(state));
        stepInvite();
      } catch (err) {
        main.querySelector('#err').innerHTML = `<div class="notice err">${esc(err.message)}</div>`;
        refresh();
      }
    });

    main.querySelector('#skip').addEventListener('click', () => stepInvite());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function stepInvite() {
    const link = shareUrl(created.id);
    main.innerHTML = `<div class="wrap wrap-narrow fade-in">
      ${progress(2)}
      <div class="eyebrow">Step 3 of 3 — the room</div>
      <h1 class="section" style="font-size:36px;margin:12px 0 6px">The dossier is open</h1>
      <p class="muted" style="font-size:14.5px;margin-bottom:22px">Send this link to people from at least three rings. The portrait needs three voices before the analyst will read it, and it gets sharper with every one.</p>

      <div class="panel">
        <div class="label">Your voting link</div>
        <div class="copyrow" style="margin:9px 0 14px">
          <input type="text" readonly value="${esc(link)}" id="share" />
          <button class="btn small" id="copy">Copy</button>
        </div>
        <div class="btn-row">
          <a class="btn primary" href="#/p/${created.id}">Open my portrait</a>
          <button class="btn ghost" id="copy-msg">Copy an invite message</button>
        </div>
        <p class="hint" style="margin-top:14px">This browser holds your owner key, in local storage. Clear it and you lose the readings, not the votes.</p>
      </div>

      <div class="panel soft" style="margin-top:16px">
        <div class="label">Keep for later</div>
        <p class="small" style="margin:8px 0 0">Owner key · <span class="mono" style="font-size:11.5px;word-break:break-all">${esc(created.token)}</span></p>
      </div>
    </div>`;

    main.querySelector('#copy').addEventListener('click', () => copy(link, 'Link copied'));
    main.querySelector('#copy-msg').addEventListener('click', () =>
      copy(
        `${identity.name || 'I'} opened a Persona dossier. It is anonymous, it takes 90 seconds, and I will not see which answers are yours: ${link}`,
        'Invite copied',
      ),
    );
    toast('Dossier open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  stepIdentity();
  return () => {};
}
