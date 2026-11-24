// public/js/views/report.js — the portrait. Persona (their data) against Ego
// (your story), then the Shadow the analyst infers from the distance.

import { AXES, RING } from '../../../shared/model.js';
import { api, tokens } from '../api.js';
import { gapBarsHTML, radarSVG, ringSplitHTML, sparkline } from '../charts.js';
import { copy, esc, fmtDate, portraitHTML, shareUrl, signed, statHTML, toast } from '../ui.js';

const KIND_LABEL = {
  mask: 'Mask',
  unseen: 'Unseen',
  split: 'Split',
  blur: 'Blur',
  story: 'Story',
  proof: 'Proof',
  deck: 'Deck',
};

// Decision D9: the three-way reading is also explained in native French and native
// Spanish, written by hand (not machine translated), for the people who get sent a
// link. Kept as one constant so any language can be swapped in the same place.
const EXPLAIN = {
  fr: {
    summary: 'Lire en français',
    items: [
      ['Persona', 'Ce que les gens disent de vous quand vous n’êtes pas là. Ce n’est pas la vérité sur vous : c’est l’effet que vous produisez, calculé à partir des votes et pondéré selon la proximité de chaque votant.'],
      ['Ego', 'Ce que vous dites de vous-même, répondu aux mêmes questions. La différence entre les deux courbes, c’est l’écart entre votre récit et votre reflet.'],
      ['Ombre', 'Ce que l’écart laisse deviner : la part que vous ne voyez pas, ou que vous préférez ne pas montrer. C’est une hypothèse, jamais un diagnostic. Elle se lit comme une question, pas comme un verdict.'],
    ],
    caveat: 'Un vote n’est pas une mesure. Trois avis suffisent à dessiner une tendance, pas une identité.',
  },
  es: {
    summary: 'Leer en español',
    items: [
      ['Persona', 'Lo que la gente dice de ti cuando no estás delante. No es la verdad sobre ti: es el efecto que produces, calculado a partir de los votos y ponderado según la cercanía de cada persona.'],
      ['Ego', 'Lo que tú dices de ti mismo, respondiendo a las mismas preguntas. La distancia entre las dos curvas es la distancia entre tu relato y tu reflejo.'],
      ['Sombra', 'Lo que esa distancia deja entrever: la parte que no ves, o que prefieres no enseñar. Es una hipótesis, nunca un diagnóstico. Se lee como una pregunta, no como una sentencia.'],
    ],
    caveat: 'Un voto no es una medida. Tres opiniones dibujan una tendencia, no una identidad.',
  },
};

function readingInFrenchAndSpanish() {
  return Object.entries(EXPLAIN)
    .map(
      ([lang, block]) => `
    <details class="block raw" lang="${lang}">
      <summary>${esc(block.summary)}</summary>
      <dl style="margin:10px 0 0">
        ${block.items.map(([term, text]) => `<dt style="font-family:var(--serif);margin-top:10px">${esc(term)}</dt><dd class="small" style="margin:2px 0 0">${esc(text)}</dd>`).join('')}
      </dl>
      <p class="tiny" style="margin-top:12px;opacity:.75">${esc(block.caveat)}</p>
    </details>`,
    )
    .join('');
}

export async function render(main, params) {
  const id = params.id;
  let data;
  try {
    data = await api.portrait(id);
  } catch (err) {
    main.innerHTML = `<div class="wrap wrap-narrow"><div class="panel">
      <div class="eyebrow">Not readable</div>
      <h2 class="section" style="margin-top:12px">${esc(err.message)}</h2>
      <div class="btn-row" style="margin-top:12px"><a class="btn" href="#/v/${id}">Vote on this person</a><a class="btn ghost" href="#/">Home</a></div>
    </div></div>`;
    return () => {};
  }

  if (data.locked) return lockedView(main, data, id);

  const p = data.portrait;
  const analysis = data.analysis;
  const meta = data.analysisMeta ?? {};
  const axes = AXES;

  const contested = axes
    .map((a) => ({ id: a.id, spread: p.ringSpread?.[a.id] ?? 0, sd: p.dispersion[a.id] ?? 0 }))
    .sort((a, b) => Math.max(b.spread, b.sd) - Math.max(a.spread, a.sd))[0];

  const tags = (analysis?.tags ?? []).map((t) => `<span class="ring-pill">${esc(t)}</span>`).join('');

  main.innerHTML = `<div class="wrap fade-in">

    <div class="eyebrow">Dossier · ${p.n} ${p.n === 1 ? 'voice' : 'voices'} · ${Object.keys(p.rings).length} rings ${data.doorEnabled ? '· door question on' : ''}</div>

    <div class="report-head" style="margin:16px 0 8px">
      <div>${portraitHTML(data.avatar, p.n, { max: 25, label: `${p.n} in` })}</div>
      <div>
        <div class="label">${esc(data.name)} · opened ${esc(fmtDate(data.createdAt))}</div>
        <h1 class="verdict">${esc(analysis?.verdict ?? 'Unread')}</h1>
        <p class="tagline">${esc(data.tagline || 'No line given.')}</p>
        <div class="rings" style="margin-top:12px">${tags}</div>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn small" id="copy-link">Copy voting link</button>
          <button class="btn small ghost" id="rerun">${meta.source === 'llm' ? 'Re-read with the analyst' : 'Ask the analyst'}</button>
          <button class="btn small ghost" id="export">Export JSON</button>
        </div>
        <div id="ai-note" class="tiny" style="margin-top:10px"></div>
      </div>
    </div>

    <hr class="hair" />

    <div class="grid-4" style="margin-bottom:26px">
      ${statHTML(p.theses.selfKnowledge ?? '—', 'Self-knowledge', p.theses.selfKnowledge !== null ? '/100' : '')}
      ${statHTML(p.theses.coherence ?? '—', 'Room coherence', p.theses.coherence !== null ? '/100' : '')}
      ${statHTML(p.theses.meanAbsGap ?? '—', 'Mean ego gap', p.theses.meanAbsGap !== null ? 'pts' : '')}
      ${statHTML(p.n, 'Voices', '')}
    </div>

    ${
      !data.portrait.ready
        ? `<div class="notice" style="margin-bottom:22px">
            <b>The analyst is holding the reading.</b> It needs three voices and your Ego.
            ${!p.ego || !Object.keys(p.ego).length ? ' <a href="#/e/' + id + '">Take your Ego test now</a>.' : ' Share the link to collect more.'}
          </div>`
        : ''
    }

    <div class="grid-2" style="gap:28px; align-items:start">
      <div class="panel">
        <div class="step-head" style="margin-bottom:6px">
          <div class="label">Persona vs Ego</div>
          <div style="display:flex;gap:12px">
            <span class="tiny" style="color:var(--persona)">● theirs</span>
            <span class="tiny" style="color:var(--ego)">┄ yours</span>
          </div>
        </div>
        <div style="display:grid;place-items:center">${radarSVG(axes, { ego: p.ego, persona: p.persona })}</div>
        <p class="tiny" style="margin-top:6px;text-align:center">centre = the middle of each scale · edge = 100</p>
      </div>

      <div class="reading">
        ${
          analysis
            ? `
          <div class="block persona"><span class="label">Persona — what the room reports</span><p>${esc(analysis.persona)}</p></div>
          <div class="block ego"><span class="label">Ego — where your story diverges</span><p>${esc(analysis.ego || 'Your Ego is not saved yet.')}</p></div>
          <div class="block shadow"><span class="label">Shadow — the hypothesis</span><p>${esc(analysis.shadow)}</p></div>
          ${analysis.experiment ? `<div class="experiment"><span class="label" style="display:block;margin-bottom:6px">Seven-day experiment</span>${esc(analysis.experiment)}</div>` : ''}
          ${analysis.question ? `<div class="block"><div class="question">${esc(analysis.question)}</div></div>` : ''}
          ${readingInFrenchAndSpanish()}
        `
            : '<p class="small">No reading yet.</p>'
        }
      </div>
    </div>

    <hr class="hair" />

    <h2 class="section" style="font-size:24px;margin-bottom:4px">The gap, axis by axis</h2>
    <p class="small" style="margin-bottom:14px">Amber when you rate yourself higher than the room does. Mint when the room sees more than you claim.</p>
    <div class="panel">
      ${gapBarsHTML(axes, p)}
      <details class="raw">
        <summary>Raw numbers</summary>
        <table>
          <thead><tr><th>Axis</th><th>Ego</th><th>Persona</th><th>Gap</th><th>Spread</th><th>Voices</th></tr></thead>
          <tbody>
            ${axes
              .map(
                (a) => `<tr><td>${a.name}</td><td>${p.ego?.[a.id] ?? '—'}</td><td>${p.persona[a.id] ?? '—'}</td><td>${signed(p.gap[a.id])}</td><td>±${p.dispersion[a.id] ?? '—'}</td><td>${p.coverage[a.id] ?? 0}</td></tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </details>
    </div>

    <hr class="hair" />

    <h2 class="section" style="font-size:24px;margin-bottom:4px">Findings</h2>
    <p class="small" style="margin-bottom:14px">Deterministic. These are computed from the numbers before any model writes a sentence.</p>
    <div class="findings">
      ${
        p.findings.length
          ? p.findings
              .map(
                (f) => `<div class="finding ${esc(f.kind)}">
            <div class="kind">${esc(KIND_LABEL[f.kind] ?? f.kind)}${f.axis ? ` · ${esc(AXES.find((a) => a.id === f.axis)?.name ?? '')}` : ''}</div>
            <div class="t">${esc(f.title)}</div>
            <div class="x">${esc(f.text)}</div>
            ${f.kind === 'split' && contested ? ringSplitHTML(axes, p, f.axis) : ''}
          </div>`,
              )
              .join('')
          : '<div class="panel soft"><p class="small" style="margin:0">No findings above threshold yet. Either the portrait is still thin, or you are unusually well integrated. More voices will tell.</p></div>'
      }
    </div>

    ${
      contested && p.timeline.length > 2
        ? `<hr class="hair" />
      <h2 class="section" style="font-size:24px;margin-bottom:4px">How the room moved</h2>
      <p class="small" style="margin-bottom:12px">${esc(AXES.find((a) => a.id === contested.id)?.name)} over ${p.timeline.length} checkpoints. Each point is everything said up to that vote.</p>
      <div class="panel">${sparkline(p.timeline.map((t) => t.axes?.[contested.id] ?? null), { width: 640, height: 90 })}</div>`
        : ''
    }

    <hr class="hair" />

    <div class="grid-2" style="gap:26px;align-items:start">
      <div>
        <h2 class="section" style="font-size:24px;margin-bottom:4px">The cards they handed you</h2>
        <div class="panel" style="margin-top:12px">
          ${
            p.topCards.length
              ? p.topCards
                  .map(
                    (c) => `<div style="display:grid;grid-template-columns:1fr 90px 34px;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line-soft)">
              <span style="font-family:var(--serif);font-size:16px">${esc(c.title)}</span>
              <span class="track" style="position:relative;height:6px;background:rgba(255,255,255,.06);border-radius:4px"><i style="position:absolute;left:0;top:0;bottom:0;width:${c.pct}%;background:rgba(121,226,200,.6);border-radius:4px"></i></span>
              <span class="tiny" style="text-align:right">${c.pct}%</span>
            </div>`,
                  )
                  .join('')
              : '<p class="small" style="margin:0">No cards yet.</p>'
          }
          ${p.egoCards?.length ? `<p class="tiny" style="margin-top:12px">You handed yourself: ${p.egoCards.map((c) => esc(c.title)).join(', ')}</p>` : ''}
        </div>
      </div>
      <div>
        <h2 class="section" style="font-size:24px;margin-bottom:4px">Unfair questions</h2>
        <div class="panel" style="margin-top:12px">
          ${Object.entries(p.probes)
            .map(([pid, s]) => {
              const total = s.counts[0] + s.counts[1] || 1;
              const a = Math.round((s.counts[0] / total) * 100);
              return `<div style="padding:8px 0;border-bottom:1px solid var(--line-soft)">
                <div style="display:flex;justify-content:space-between;font-size:12px" class="tiny"><span>${esc(pid)}</span><span>${s.agree === false ? '<span style="color:var(--shadow)">you disagree</span>' : s.agree ? '<span style="color:var(--persona)">you agree</span>' : 'you skipped'}</span></div>
                <div style="display:flex;height:6px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,.06);margin:6px 0 4px">
                  <i style="width:${a}%;background:rgba(121,226,200,.55)"></i><i style="flex:1;background:rgba(255,179,64,.4)"></i>
                </div>
                <div class="tiny" style="text-transform:none;letter-spacing:0">${a}% chose the first option${s.mine !== null ? `, you chose the ${s.mine === 0 ? 'first' : 'second'}` : ''}</div>
              </div>`;
            })
            .join('')}
        </div>
      </div>
    </div>

    <hr class="hair" />

    <h2 class="section" style="font-size:24px;margin-bottom:4px">Receipts</h2>
    <p class="small" style="margin-bottom:14px">${p.receipts.length} lines left by the room, newest first.</p>
    <div class="receipts">
      ${
        p.receipts.length
          ? p.receipts
              .map(
                (r) => `<div class="receipt"><q>${esc(r.text)}</q><span class="who">${esc(RING[r.ring]?.label ?? r.ring)}${r.at ? ` · ${esc(fmtDate(r.at))}` : ''}</span></div>`,
              )
              .join('')
          : '<p class="small">No one left a line yet. The receipts are the part people actually reread.</p>'
      }
    </div>

    <hr class="hair" />

    <div class="panel" style="display:flex;gap:16px;justify-content:space-between;flex-wrap:wrap;align-items:center">
      <div>
        <div style="font-family:var(--serif);font-size:20px">More rings, sharper shadow</div>
        <p class="small" style="margin:4px 0 0">Every new ring exposes a different version of you. The analyst needs at least two to find the split.</p>
      </div>
      <div class="btn-row">
        <button class="btn small" id="copy-link-2">Copy voting link</button>
        <a class="btn small ghost" href="#/s/${id}">Public share page</a>
        <a class="btn small ghost" href="#/e/${id}">${p.ego && Object.keys(p.ego).length ? 'Redo my Ego' : 'Take my Ego test'}</a>
      </div>
    </div>
  </div>`;

  const note = main.querySelector('#ai-note');
  const describeMeta = (m) =>
    m.source === 'llm'
      ? `Read by ${m.model || 'the analyst'}${m.generatedAt ? ` · ${new Date(m.generatedAt).toLocaleString()}` : ''}`
      : `Local analyst (deterministic). ${m.reason ? 'AI router: ' + esc(m.reason.slice(0, 90)) : 'Connect a free LLM router in the Method page to upgrade the prose.'}`;
  note.innerHTML = describeMeta(meta);

  const link = shareUrl(id);
  ['#copy-link', '#copy-link-2'].forEach((sel) =>
    main.querySelector(sel)?.addEventListener('click', () => copy(link, 'Voting link copied')),
  );

  main.querySelector('#rerun').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> reading…';
    try {
      const res = await api.analyze(id);
      const a = res.analysis;
      const blocks = main.querySelectorAll('.reading .block p, .reading .question');
      if (blocks.length >= 3 && a) {
        blocks[0].textContent = a.persona ?? blocks[0].textContent;
        blocks[1].textContent = a.ego || blocks[1].textContent;
        blocks[2].textContent = a.shadow ?? blocks[2].textContent;
        if (a.question && blocks[3]) blocks[3].textContent = a.question;
        const v = main.querySelector('.verdict');
        if (a.verdict) v.textContent = a.verdict;
        const tagsBox = main.querySelector('.rings');
        if (Array.isArray(a.tags) && a.tags.length) {
          tagsBox.innerHTML = a.tags.map((t) => `<span class="ring-pill">${esc(t)}</span>`).join('');
        }
      }
      note.innerHTML = describeMeta(res.analysisMeta ?? {});
      toast(res.analysisMeta?.source === 'llm' ? 'The analyst has re-read the room' : 'Read again locally (no router)');
    } catch (err) {
      toast(err.message);
    }
    btn.disabled = false;
    btn.textContent = 'Re-read with the analyst';
  });

  main.querySelector('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ name: data.name, tagline: data.tagline, portrait: p, analysis }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `persona-${id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // First visit after enough votes: let the analyst write over the local draft.
  if (p.ready && meta.source !== 'llm' && !meta.generatedAt) {
    note.innerHTML = '<span class="spinner"></span> the analyst is reading the room…';
    api
      .analyze(id)
      .then((res) => {
        if (res.analysisMeta?.source === 'llm') location.reload();
        else note.innerHTML = describeMeta(res.analysisMeta ?? {});
      })
      .catch(() => {
        note.innerHTML = describeMeta(meta);
      });
  }

  return () => {};
}

function lockedView(main, data, id) {
  main.innerHTML = `<div class="wrap wrap-narrow fade-in">
    <div class="eyebrow">Someone else's dossier</div>
    <div style="display:grid;grid-template-columns:130px 1fr;gap:20px;align-items:center;margin:18px 0 22px">
      <div>${portraitHTML(data.avatar, data.votes, { max: 25, label: '' })}</div>
      <div>
        <h1 class="section" style="font-size:30px;margin:0 0 4px">${esc(data.name)}</h1>
        <p class="small" style="margin:0">${esc(data.tagline || '')}</p>
        <p class="tiny" style="margin-top:8px">${data.votes} voices · ${Object.keys(data.rings ?? {}).length} rings</p>
      </div>
    </div>
    <div class="panel">
      <p class="small" style="margin:0 0 14px">The reading belongs to the person being looked at. You can be a voice in it, or open your own.</p>
      <div class="btn-row">
        <a class="btn primary" href="#/v/${id}">Vote on ${esc(data.name)}</a>
        <a class="btn ghost" href="#/new">Open my dossier</a>
      </div>
    </div>
    <details class="raw" style="margin-top:18px">
      <summary>This is mine — I have my owner key</summary>
      <div class="panel" style="margin-top:10px">
        <div class="field">
          <label for="f-token">Owner key</label>
          <input id="f-token" type="text" placeholder="paste your key" />
          <div class="hint">Stored in this browser only.</div>
        </div>
        <button class="btn small" id="claim">Unlock</button>
      </div>
    </details>
  </div>`;

  main.querySelector('#claim').addEventListener('click', () => {
    const value = main.querySelector('#f-token').value.trim();
    if (!value) return toast('Paste the key first');
    tokens.set(id, value);
    location.reload();
  });
  return () => {};
}
