// public/js/charts.js — hand-drawn SVG. No chart library, no canvas resizing bugs.

const R = 40; // radar radius inside a 100x100 box
const pos = (value) => 0.5 + (Math.max(-100, Math.min(100, value)) / 200); // 0..1
const angle = (i, n) => (-90 + (360 / n) * i) * (Math.PI / 180);
const point = (i, n, value) => {
  const r = R * pos(value);
  return [50 + r * Math.cos(angle(i, n)), 50 + r * Math.sin(angle(i, n))];
};

function poly(vals) {
  return vals.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

export function radarSVG(axes, { ego, persona }, { size = 340 } = {}) {
  const n = axes.length;
  const rings = [-50, 0, 50];
  const axisLabelPos = (i) => {
    const [x, y] = [50 + (R + 11) * Math.cos(angle(i, n)), 50 + (R + 11) * Math.sin(angle(i, n))];
    return [x, y];
  };

  const personaPts = axes.map((a, i) => point(i, n, persona[a.id] ?? 0));
  const egoPts = axes.map((a, i) => point(i, n, ego?.[a.id] ?? 0));

  const spokes = axes
    .map((a, i) => {
      const [x, y] = point(i, n, 100);
      return `<line x1="50" y1="50" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="rgba(244,241,234,.10)" stroke-width=".4"/>`;
    })
    .join('');

  const grid = rings
    .map((v) => {
      const pts = axes.map((_, i) => point(i, n, v));
      return `<polygon points="${poly(pts)}" fill="none" stroke="rgba(244,241,234,${v === 0 ? 0.16 : 0.07})" stroke-width=".45"/>`;
    })
    .join('');

  const labels = axes
    .map((a, i) => {
      const [x, y] = axisLabelPos(i);
      const anchor = x > 62 ? 'start' : x < 38 ? 'end' : 'middle';
      return `<text x="${x.toFixed(2)}" y="${(y + 1).toFixed(2)}" fill="rgba(244,241,234,.44)" font-size="3.3" font-family="ui-monospace,Consolas,monospace" letter-spacing=".12" text-anchor="${anchor}" dominant-baseline="middle">${a.name.toUpperCase()}</text>`;
    })
    .join('');

  const dots = personaPts
    .map(([x, y]) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.1" fill="#79e2c8"/>`)
    .join('');

  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Persona against Ego across ${n} axes" style="max-width:100%; height:auto; overflow:visible">
    <defs>
      <radialGradient id="pg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(121,226,200,.28)"/>
        <stop offset="100%" stop-color="rgba(121,226,200,.06)"/>
      </radialGradient>
    </defs>
    ${grid}${spokes}
    ${ego ? `<polygon points="${poly(egoPts)}" fill="none" stroke="#ffb340" stroke-width=".8" stroke-dasharray="2 1.4" opacity=".85"/>` : ''}
    <polygon points="${poly(personaPts)}" fill="url(#pg)" stroke="#79e2c8" stroke-width=".9"/>
    ${dots}${labels}
  </svg>`;
}

export function gapBarsHTML(axes, portrait) {
  return `<div class="bars">${axes
    .map((a) => {
      const p = portrait.persona[a.id];
      const e = portrait.ego?.[a.id] ?? null;
      const g = portrait.gap?.[a.id] ?? null;
      if (p === null || p === undefined) return '';
      const px = pos(p) * 100;
      const ex = e === null ? null : pos(e) * 100;
      const fillLeft = ex === null ? px : Math.min(px, ex);
      const fillW = ex === null ? 0 : Math.abs(ex - px);
      const colour = g === null ? 'rgba(244,241,234,.18)' : g > 0 ? 'rgba(255,179,64,.55)' : 'rgba(121,226,200,.55)';
      return `<div class="barrow">
        <span class="nm">${a.name}</span>
        <span class="track">
          <i class="zero"></i>
          ${ex === null ? '' : `<i class="fill" style="left:${fillLeft}%;width:${fillW}%;background:${colour}"></i>`}
          ${ex === null ? '' : `<i class="dot ego" style="left:${ex}%"></i>`}
          <i class="dot p" style="left:${px}%"></i>
        </span>
        <span class="g ${g === null ? 'nil' : g > 0 ? 'pos' : 'neg'}">${g === null ? '—' : `${g > 0 ? '+' : ''}${Math.round(g)}`}</span>
      </div>`;
    })
    .join('')}</div>`;
}

export function ringSplitHTML(axes, portrait, axisId) {
  const axis = axes.find((a) => a.id === axisId);
  if (!axis) return '';
  const rings = Object.entries(portrait.ringMeans ?? {})
    .map(([ring, vals]) => ({ ring, value: vals?.[axisId] }))
    .filter((r) => r.value !== null && r.value !== undefined);
  if (rings.length < 2) return '';

  const labels = { inner: 'Close', family: 'Family', work: 'Work', online: 'Online', outer: 'Unverified' };
  const marks = rings
    .map((r) => {
      const x = pos(r.value) * 100;
      return `<span style="position:absolute; left:${x}%; top:50%; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:3px">
        <i style="width:8px;height:8px;border-radius:50%;background:#79e2c8;display:block"></i>
        <em style="font-style:normal;font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);white-space:nowrap">${labels[r.ring] ?? r.ring}</em>
      </span>`;
    })
    .join('');

  return `<div style="position:relative; height:52px; margin:8px 0 0">
    <div style="position:absolute; left:0; right:0; top:22px; height:1px; background:var(--line)"></div>
    <div style="position:absolute; left:50%; top:16px; width:1px; height:13px; background:var(--line)"></div>
    ${marks}
  </div>`;
}

export function sparkline(values, { width = 300, height = 54 } = {}) {
  const clean = values.filter((v) => v !== null && v !== undefined);
  if (clean.length < 2) return '';
  const xs = clean.map((_, i) => (i / (clean.length - 1)) * width);
  const ys = clean.map((v) => height - pos(v) * height);
  const line = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" style="max-width:100%;height:auto;overflow:visible">
    <polygon points="${area}" fill="rgba(121,226,200,.08)"/>
    <polyline points="${line}" fill="none" stroke="#79e2c8" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="rgba(244,241,234,.12)" stroke-width=".6" stroke-dasharray="3 3"/>
    <circle cx="${xs[xs.length - 1]}" cy="${ys[ys.length - 1]}" r="2.4" fill="#79e2c8"/>
  </svg>`;
}
