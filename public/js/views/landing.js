// public/js/views/landing.js — the manifesto. Short, sharp, no marketing foam.

import { api } from '../api.js';
import { esc } from '../ui.js';

export async function render(main) {
  let demo = null;
  try {
    const { id } = await api.demo();
    if (id) demo = await api.get(id);
  } catch {}

  const demoLink = demo ? `#/p/${demo.id}` : '#/how';
  const demoCount = demo?.votes ?? 0;
  const receipts = (demo?.receipts ?? []).slice(0, 2);

  main.innerHTML = `
  <div class="wrap hero fade-in">
    <div class="eyebrow">Reverse psychometrics · people vote, the analyst decides</div>
    <h1 class="display">You have never seen your own face <span class="shade">from the other side of the table.</span></h1>
    <p class="lede">Every test asks you to describe yourself and then sells the description back to you. Persona inverts it: the people who know you vote, the analyst reads the pattern, and the distance between your <em style="color:var(--ego); font-style:normal">Ego</em> and your <em style="color:var(--persona); font-style:normal">Persona</em> is where your <em style="color:var(--shadow); font-style:normal">Shadow</em> shows up.</p>
    <div class="btn-row">
      <a class="btn primary" href="#/new">Open my dossier <span class="k">90s</span></a>
      <a class="btn" href="${demoLink}">See a live portrait</a>
      <a class="btn ghost" href="#/how">How the analyst reads</a>
    </div>
    <div class="meta">
      <span><i class="dot"></i> no account</span>
      <span><i class="dot"></i> one vote per device</span>
      <span><i class="dot ego"></i> your ego is hidden until you publish it</span>
      <span><i class="dot shadow"></i> ${demoCount || '26'} voices in the demo portrait</span>
    </div>

    <div class="triad">
      <div class="panel persona">
        <div class="tag">01 — Persona · the data</div>
        <h3>What the room says</h3>
        <p>Weighted, not counted. Your close circle outvotes a stranger from a link, because they have actually seen you at 2am.</p>
      </div>
      <div class="panel ego">
        <div class="tag">02 — Ego · the story</div>
        <h3>What you say</h3>
        <p>The same instrument, answered about yourself before you see one vote. This is the control group, and it is usually wrong.</p>
      </div>
      <div class="panel shadow">
        <div class="tag">03 — Shadow · the remainder</div>
        <h3>What neither account covers</h3>
        <p>Where the rings disagree about you, where you overclaim, where your own predictions fail. Inferred, then written by the analyst.</p>
      </div>
    </div>

    <hr class="hair" />

    <div class="grid-2" style="align-items:start; gap:34px">
      <div>
        <div class="eyebrow">The ritual</div>
        <h2 class="section" style="margin-top:12px">Two minutes of someone else's honesty</h2>
        <p class="section-lede">Voters never see the results. They choose three cards, place you on six dials, answer four unfair either/or questions, and leave one line they will remember.</p>
      </div>
      <div class="panel">
        ${[
          ['01', 'Pick three cards', 'A deck of fourteen archetypes. Three fit. The cards people hand you are the image you project.'],
          ['02', 'Place the dials', 'Six bipolar scales, five stops each. No “neutral” hiding place, only “even”.'],
          ['03', 'Survive four probes', 'Forced choices with no polite answer: what you do at 2am, what you say in the room.'],
          ['04', 'Leave a receipt', 'One line, one ring. The receipts are the emotional payload of the whole product.'],
        ]
          .map(
            ([n, t, d]) => `<div class="step"><span class="n">${n}</span><div><div class="t">${t}</div><div class="d">${d}</div></div></div>`,
          )
          .join('')}
      </div>
    </div>

    <hr class="hair" />

    <div class="grid-2" style="gap:34px; align-items:start">
      <div>
        <div class="eyebrow">Why backwards</div>
        <h2 class="section" style="margin-top:12px">Self-report is a story. Perception is a measurement.</h2>
        <p class="section-lede">You cannot audit your own face. Everyone else can. The catch: people are kind on a link, so the instrument never asks “rate this person out of ten”. It asks what they would <em>do</em>, and disagreement becomes the data.</p>
        <a class="btn small" href="#/how" style="margin-top:6px">Read the method and the maths</a>
      </div>
      <div class="panel soft">
        ${
          receipts.length
            ? receipts
                .map(
                  (r) => `<div class="receipt" style="margin-bottom:10px"><q>${esc(r.text)}</q><span class="who">${esc(r.ring)} ring</span></div>`,
                )
                .join('')
            : '<p class="small">No receipts yet. Be the first voice in someone’s portrait.</p>'
        }
        ${demo ? `<p class="tiny" style="margin-top:6px">From the demo portrait · ${demoCount} voices</p><a class="btn small" href="${demoLink}">Open it</a>` : ''}
      </div>
    </div>

    <hr class="hair" />

    <div class="panel cta-band">
      <div>
        <h2>Someone you know would probably answer honestly.</h2>
        <p class="small" style="margin:0">Open a dossier, take your own Ego test, send one link.</p>
      </div>
      <div class="btn-row">
        <a class="btn mint" href="#/new">Start</a>
        <a class="btn ghost" href="#/how">Method</a>
      </div>
    </div>
  </div>`;
}
