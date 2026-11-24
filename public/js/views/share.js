// public/js/views/share.js — Decision D11: the page you send people who have not
// voted yet. It shows the room's side of the dossier — their numbers, their words
// and the analyst's reading of those two things — and never the Ego, the gap, the
// Shadow or anything else only the subject may see. The server enforces that split
// in PublicView.cs; this file only renders what it sends.

import { AXES } from '../../../shared/model.js';
import { api } from '../api.js';
import { radarSVG, ringSplitHTML } from '../charts.js';
import { esc, fmtDate, portraitHTML, shareUrl } from '../ui.js';

const EXPLAIN = {
  fr: {
    summary: 'Lire cette page en français',
    items: [
      ['La Persona', "Ce que la salle répond quand on lui demande comment vous êtes. Ce n'est pas une vérité : c'est une moyenne d'impressions, pondérée par la proximité de chacun."],
      ["L'anneau", "La même question posée à des cercles différents. Vos proches, votre famille, vos collègues et vos inconnus ne décrivent pas la même personne."],
      ['Les preuves', "Chaque vote laisse une phrase, écrite par quelqu'un qui vous connaît. Le chiffre donne la direction, la phrase donne la raison."],
      ["L'analyse", "Un modèle lit ces nombres et raconte ce qu'ils décrivent. Il ne devine rien de votre histoire personnelle : il ne voit que ce que la salle a répondu."],
    ],
    note: "Ce que vous voyez ici est la version publique. La personne concernée voit en plus son Ego (ce qu'elle a répondu sur elle-même), l'écart entre les deux, et l'ombre que cet écart suggère.",
  },
  es: {
    summary: 'Leer esta página en español',
    items: [
      ['La Persona', 'Lo que responde la sala cuando se le pregunta cómo eres. No es una verdad: es un promedio de impresiones, ponderado por la cercanía de cada persona.'],
      ['El anillo', 'La misma pregunta hecha a círculos distintos. Tu gente cercana, tu familia, tus colegas y los desconocidos no describen a la misma persona.'],
      ['Las pruebas', 'Cada voto deja una frase, escrita por alguien que te conoce. El número da la dirección, la frase da la razón.'],
      ['El análisis', 'Un modelo lee esos números y cuenta lo que describen. No adivina nada de tu historia personal: solo ve lo que respondió la sala.'],
    ],
    note: 'Lo que ves aquí es la versión pública. La persona en cuestión ve además su Ego (lo que respondió sobre sí misma), la distancia entre ambos y la sombra que esa distancia sugiere.',
  },
};

export async function render(main, params) {
  const id = params.id;
  let data;
  try {
    data = await api.share(id);
  } catch {
    main.innerHTML = `<div class="wrap wrap-narrow"><div class="panel center">
      <div class="eyebrow">Still developing</div>
      <h2 class="section" style="margin-top:12px">This portrait needs more voices</h2>
      <p class="muted">A room's side of a person only exists after three votes. Right now it does not exist yet.</p>
      <div class="btn-row" style="margin-top:20px;justify-content:center"><a class="btn primary" href="#/v/${esc(id)}">Be one of the three</a></div>
    </div></div>`;
    return;
  }

  const p = data.portrait || {};
  const analysis = data.analysis || {};
  const axes = p.axes || [];
  const rings = p.rings || {};
  const spread = p.spread || {};
  const cards = data.cards || [];
  const probes = data.probes || [];
  const receipts = data.receipts || [];
  const url = shareUrl(id);

  const ringList = Object.entries(rings).filter(([, v]) => v > 0);
  const spreadList = Object.entries(spread);
  const maxCard = cards.length ? Math.max(...cards.map((c) => c.count)) : 1;

  main.innerHTML = `<div class="wrap fade-in">
    <div class="panel" style="display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center">
      <div style="width:92px">${portraitHTML(data.avatar, p.n || 0, { max: 40, label: `${p.n || 0}` })}</div>
      <div>
        <div class="eyebrow">How the room sees</div>
        <h1 class="display" style="font-size:clamp(30px,5vw,46px);margin:4px 0 6px">${esc(data.name)}</h1>
        ${data.tagline ? `<p class="muted" style="margin:0 0 8px">${esc(data.tagline)}</p>` : ''}
        <p class="tiny">${p.n || 0} voices from ${ringList.length || 1} ring(s) · the room's side only</p>
      </div>
    </div>

    <div class="panel">
      <div class="step-head" style="margin-bottom:4px">
        <div class="label">Their side of you</div>
        <span class="tiny">${p.n || 0} votes · weighted by closeness</span>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:center" class="share-charts">
        <div style="display:grid;place-items:center">${radarSVG(axes, { persona: p.persona })}</div>
        <div>
          ${axes
            .map(
              (a) => `<div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;gap:10px;font-size:13px">
                <span>${esc(a.name)}</span>
                <span class="tiny" style="font-family:var(--mono)">${esc(lean(a, p.persona?.[a.id]))}</span>
              </div>
              <div style="height:5px;border-radius:99px;background:rgba(244,241,234,.09);margin-top:5px;overflow:hidden">
                <div style="height:100%;width:${Math.abs(p.persona?.[a.id] ?? 0) / 2 + 50}%;background:var(--persona)"></div>
              </div>
            </div>`,
            )
            .join('')}
        </div>
      </div>
    </div>

    ${ringList.length > 1 ? `<div class="panel">
      <div class="label">The rings</div>
      <p class="small muted" style="margin:6px 0 14px">The same questions, asked to different circles. The differences are the interesting part.</p>
      ${ringSplitHTML(AXES, { ringMeans: p.ringMeans || {} }, axes[0]?.id)}
    </div>` : ''}

    ${spreadList.length ? `<div class="panel">
      <div class="label">Where the room disagrees</div>
      <p class="small muted" style="margin:6px 0 12px">A wide bar means people who know you well do not describe the same person. That is not noise.</p>
      ${spreadList
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(
          ([axis, v]) => `<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;font-size:13px">
            <span style="min-width:96px">${esc(axisLabel(axes, axis))}</span>
            <div style="flex:1;height:5px;border-radius:99px;background:rgba(244,241,234,.09);overflow:hidden">
              <div style="height:100%;width:${Math.min(100, Math.round(v))}%;background:var(--shadow)"></div>
            </div>
            <span class="tiny" style="font-family:var(--mono)">${Math.round(v)}</span>
          </div>`,
        )
        .join('')}
    </div>` : ''}

    ${cards.length ? `<div class="panel">
      <div class="label">The archetypes they picked</div>
      <p class="small muted" style="margin:6px 0 14px">Not ratings. Three cards from a deck of fourteen, chosen by each person.</p>
      ${cards
        .map(
          (c) => `<div style="display:flex;align-items:center;gap:12px;margin-bottom:9px;font-size:13px">
          <span style="min-width:130px">${esc(c.title)}</span>
          <div style="flex:1;height:5px;border-radius:99px;background:rgba(244,241,234,.09);overflow:hidden">
            <div style="height:100%;width:${Math.round((c.count / maxCard) * 100)}%;background:var(--persona)"></div>
          </div>
          <span class="tiny" style="font-family:var(--mono)">${c.count}</span>
        </div>`,
        )
        .join('')}
    </div>` : ''}

    ${probes.length ? `<div class="panel">
      <div class="label">The forced choices</div>
      <p class="small muted" style="margin:6px 0 14px">Two options, no fence to sit on. The split tells you more than the majority.</p>
      ${probes
        .map(
          (pr) => `<div style="margin-bottom:16px">
          <div class="small" style="margin-bottom:6px">${esc(pr.setup)}</div>
          <div style="display:flex;height:26px;border-radius:8px;overflow:hidden;font-size:11px">
            <div style="width:${pr.shares[0]}%;background:var(--persona);display:grid;place-items:center;color:#08120f">${pr.shares[0]}%</div>
            <div style="width:${100 - pr.shares[0]}%;background:rgba(244,241,234,.1);display:grid;place-items:center">${100 - pr.shares[0]}%</div>
          </div>
          <div class="tiny" style="display:flex;justify-content:space-between;gap:12px;margin-top:5px">
            <span>${esc(pr.options[0])}</span><span>${esc(pr.options[1])}</span>
          </div>
        </div>`,
        )
        .join('')}
    </div>` : ''}

    ${receipts.length ? `<div class="panel">
      <div class="label">Their words, not mine</div>
      <p class="small muted" style="margin:6px 0 14px">${receipts.length} of them left a sentence. These are the raw ones, untouched.</p>
      <div style="display:grid;gap:10px">
        ${receipts
          .map(
            (r) => `<div style="border-left:2px solid rgba(98,214,180,.4);padding:2px 0 2px 12px">
            <div style="font-family:var(--serif);font-size:16px;line-height:1.4">${esc(r.text)}</div>
            <div class="tiny" style="margin-top:4px">${esc(r.ring)}${r.at ? ` · ${esc(fmtDate(r.at))}` : ''}</div>
          </div>`,
          )
          .join('')}
      </div>
    </div>` : ''}

    ${analysis.persona ? `<div class="panel">
      <div class="step-head" style="margin-bottom:4px">
        <div class="label">What the analyst makes of it</div>
        <span class="tiny">${analysis.source === 'llm' ? `model · ${esc(analysis.model || 'free tier')}` : 'local reasoning'}</span>
      </div>
      <div class="block" style="margin-top:10px">
        <div class="verdict">${esc(analysis.verdict || '')}</div>
        <p>${esc(analysis.persona || '')}</p>
      </div>
      ${(analysis.tags || []).length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${analysis.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
      <p class="tiny" style="margin-top:14px">This is what the room reports, read by an analyst: the Shadow you see on your own page is a hypothesis drawn from the gap between this and what you say about yourself — a hypothesis, never a diagnosis.</p>
    </div>` : ''}

    ${explainHTML()}

    <div class="panel center">
      <h2 class="section" style="font-size:22px;margin:0 0 6px">Add your voice</h2>
      <p class="muted small" style="max-width:46ch;margin:0 auto 16px">Five minutes, no account. ${esc(data.name)} will never see which answers were yours.</p>
      <div class="btn-row" style="justify-content:center">
        <a class="btn primary" href="#/v/${esc(id)}">Answer the questions</a>
        <button class="btn ghost" id="copy">Copy this link</button>
      </div>
      <p class="tiny" style="margin-top:12px;font-family:var(--mono)">${esc(url)}</p>
    </div>
  </div>`;

  const copyBtn = main.querySelector('#copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = 'Copied';
      } catch {
        copyBtn.textContent = url;
      }
    });
  }
  return () => {};
}

function axisLabel(axes, id) {
  return axes.find((a) => a.id === id)?.name || id;
}

// A number is not a reading. Say which end of the axis the room put them on.
function lean(axis, value) {
  if (value === null || value === undefined) return '—';
  const strong = Math.abs(value) >= 45;
  const pole = value >= 0 ? axis.pos : axis.neg;
  return `${strong ? 'clearly' : 'slightly'} ${String(pole).toLowerCase()}`;
}

function explainHTML() {
  return `<div class="panel">
    <details>
      <summary class="label" style="cursor:pointer">${esc(EXPLAIN.fr.summary)} · ${esc(EXPLAIN.es.summary)}</summary>
      <div style="margin-top:16px;display:grid;gap:18px">
        ${Object.entries(EXPLAIN)
          .map(
            ([lang, block]) => `<div>
            <div class="eyebrow">${lang === 'fr' ? 'Français' : 'Español'}</div>
            ${block.items
              .map(
                ([term, text]) => `<p class="small" style="margin:8px 0 0"><span style="color:var(--ink)">${esc(term)}</span> — ${esc(text)}</p>`,
              )
              .join('')}
            <p class="tiny" style="margin-top:10px">${esc(block.note)}</p>
          </div>`,
          )
          .join('')}
      </div>
    </details>
  </div>`;
}
