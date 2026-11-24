// public/js/views/how.js — the method, stated plainly. If a product cannot
// explain its own maths, it is a horoscope.

import { api } from '../api.js';
import { esc } from '../ui.js';
import { AXES, RINGS, WEIGHTS } from '../../../shared/model.js';

export async function render(main) {
  let health = null;
  try {
    health = await api.health();
  } catch {}

  const ai = health?.ai;
  const aiLine = ai
    ? ai.up
      ? `reachable · ${ai.models ?? '?'} free endpoints · model “${esc(ai.model)}”`
      : `not running (${esc(ai.detail || 'no response')}) — every reading currently comes from the local analyst`
    : 'unknown';

  main.innerHTML = `<div class="wrap wrap-narrow fade-in">
    <div class="eyebrow">The method</div>
    <h1 class="display" style="font-size:clamp(30px,4.4vw,48px);max-width:22ch">A test that measures you by asking everyone but you.</h1>
    <p class="lede">Nothing here is a diagnosis. It is a measurement of perception, a comparison with self-report, and a set of hypotheses that are meant to be argued with.</p>

    <h2 class="section" style="font-size:24px;margin-top:34px">1 — The inversion</h2>
    <p class="muted">Self-report fails for a structural reason: the instrument and the subject are the same system, so the subject cannot audit its own output. Perception has the property self-report lacks — it is observed from outside, by people who each see a different slice of you. So we collect the perception, then compare it with the story. The distance is the finding.</p>

    <h2 class="section" style="font-size:24px;margin-top:30px">2 — The instrument</h2>
    <p class="muted">Three parts, identical for voters and for you.</p>
    <div class="panel">
      <p class="small" style="margin:0 0 10px"><b>${WEIGHTS.card === 0.5 ? 'Cards' : 'Cards'}</b> — pick 3 of 14 archetypes. Weight ${WEIGHTS.card} each. Cards are seductive, and which one someone picks says as much about the picker's image of you as the trait itself.</p>
      <p class="small" style="margin:0 0 10px"><b>Dials</b> — six bipolar scales, five stops, weight ${WEIGHTS.dial}. Continuous enough to average.</p>
      <p class="small" style="margin:0"><b>Probes</b> — four forced either/ors, weight ${WEIGHTS.probe}, each with “I honestly can't say”. Behaviour beats adjectives.</p>
    </div>

    <h2 class="section" style="font-size:24px;margin-top:30px">3 — Aggregation</h2>
    <p class="muted">Every vote becomes a position on eight axes, from −100 to +100. Votes are then averaged with a weight by ring, because proximity is data:</p>
    <div class="panel">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        ${RINGS.map((r) => `<tr><td style="padding:6px 0;color:var(--dim)">${esc(r.label)}</td><td style="text-align:right;font-family:var(--mono)">×${r.weight}</td></tr>`).join('')}
      </table>
      <p class="hint" style="margin-top:10px">A failed door question lands you in Unverified automatically. One vote per device, enforced server-side by a hash of the address, not by an account.</p>
    </div>

    <h2 class="section" style="font-size:24px;margin-top:30px">4 — The two indexes</h2>
    <div class="panel">
      <p class="small" style="margin:0 0 10px"><b>Self-knowledge</b> = 100 − 1.15 × (mean |Ego − Persona|) − 0.12 × (mean dispersion). How accurately you predict your own effect on people.</p>
      <p class="small" style="margin:0"><b>Room coherence</b> = 100 − 1.1 × (mean dispersion). How much the room agrees with itself. Low coherence is not noise; it is usually a split.</p>
    </div>

    <h2 class="section" style="font-size:24px;margin-top:30px">5 — Findings, before any prose</h2>
    <p class="muted">These are computed deterministically, and the model is only allowed to narrate them — never to invent them.</p>
    <div class="panel">
      ${[
        ['Mask', 'You rate yourself ≥15 points higher than the room on an axis. The trait is real; the display is not landing.'],
        ['Unseen', 'The room rates you ≥15 points higher than you rate yourself. Credit you are not taking.'],
        ['Split', 'Two rings differ by ≥30 points on an axis. Two people, two audiences, one of them chosen by you.'],
        ['Story', 'You sit at an extreme (|Ego| ≥ 65) while the room sits near the middle (|Persona| ≤ 35). An identity held without corroboration.'],
        ['Blur', 'High dispersion, no ego gap. Nobody agrees, including you. You may be whatever the room needs.'],
        ['Proof', 'On a forced choice, ≥55% of the room picks the opposite of your own prediction.'],
        ['Deck', 'None of the three cards you handed yourself appear in the room’s top cards.'],
      ]
        .map(
          ([t, d]) => `<div style="display:grid;grid-template-columns:74px 1fr;gap:12px;padding:7px 0;border-bottom:1px solid var(--line-soft)">
            <span class="tiny" style="color:var(--shadow)">${t}</span><span class="small" style="margin:0">${d}</span>
          </div>`,
        )
        .join('')}
    </div>

    <h2 class="section" style="font-size:24px;margin-top:30px">6 — The analyst</h2>
    <p class="muted">The analyst is an LLM behind an OpenAI-compatible endpoint. By default it points at a local <a href="https://github.com/tashfeenahmed/freellmapi" target="_blank" rel="noopener">FreeLLMAPI</a> router, which stacks dozens of free tiers behind one URL — so the reading costs nothing and stays on your machine.</p>
    <div class="panel">
      <p class="tiny" style="margin:0 0 8px">Router status</p>
      <p class="small" style="margin:0 0 12px">${aiLine}</p>
      <p class="tiny" style="margin:0 0 6px">Configure with environment variables or persona.config.json</p>
      <pre class="mono" style="font-size:11.5px;line-height:1.7;color:var(--dim);background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:10px;padding:12px;overflow:auto">PERSONA_LLM_BASE=http://localhost:3001/v1
PERSONA_LLM_KEY=freellmapi-...
PERSONA_LLM_MODEL=auto
PERSONA_LLM_DISABLED=false</pre>
      <p class="hint">What leaves the server: the numeric digest, your tagline, card titles and up to twelve receipts. Never voter identities, never addresses. If the router is down, a deterministic analyst writes the same three sections from the same numbers — the product never shows an empty state.</p>
    </div>

    <h2 class="section" style="font-size:24px;margin-top:30px">7 — Who sees what</h2>
    <p class="muted">Voters never see results. The public portrait shows a name, a mark and a count; the reading, the numbers and the receipts are behind the owner key that lives in the owner's browser. No accounts, no emails, no analytics. Votes are stored with a truncated hash of the address to enforce one vote per device, and nothing else.</p>

    <hr class="hair" />

    <h2 class="section" style="font-size:22px">The eight axes</h2>
    <div class="panel">
      ${AXES.map(
        (a) => `<div style="display:grid;grid-template-columns:96px 1fr;gap:12px;padding:8px 0;border-bottom:1px solid var(--line-soft)">
          <span style="font-family:var(--serif);font-size:16px">${esc(a.name)}</span>
          <span class="small" style="margin:0"><b style="color:var(--faint)">${esc(a.neg)}</b> ↔ <b style="color:var(--persona);font-weight:500">${esc(a.pos)}</b> — ${esc(a.prompt)}</span>
        </div>`,
      ).join('')}
    </div>

    <div class="btn-row" style="margin-top:26px">
      <a class="btn primary" href="#/new">Open my dossier</a>
      <a class="btn ghost" href="#/p/demo0001">See the demo</a>
    </div>
  </div>`;
  return () => {};
}
