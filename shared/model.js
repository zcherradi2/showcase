// shared/model.js
// The instrument. One source of truth, imported by the browser and by the server.
//
// The premise: a personality test asks you to describe yourself. Persona asks the
// room to describe you, then asks you the same questions. The distance between the
// two answers is the product.

export const VERSION = '1.0.0';

// Every axis is bipolar and scored on a -100..+100 scale:
//   -100 = fully at the `neg` pole, +100 = fully at the `pos` pole, 0 = the middle.
export const AXES = [
  {
    id: 'warmth',
    name: 'Warmth',
    neg: 'Glacier',
    pos: 'Hearth',
    prompt: 'Their default temperature with another human being.',
    negLine: 'reads as cool, self-contained, slow to give anything away',
    posLine: 'reads as open, enveloping, the person others drift toward',
  },
  {
    id: 'force',
    name: 'Force',
    neg: 'Feather',
    pos: 'Hammer',
    prompt: 'How they move an opinion, a plan or a person.',
    negLine: 'persuades by yielding, by listening, by making it feel like your idea',
    posLine: 'persuades by weight, by saying it once and meaning it',
  },
  {
    id: 'order',
    name: 'Order',
    neg: 'Drift',
    pos: 'Grid',
    prompt: 'How they hold their life together.',
    negLine: 'works from the mess, improvises the schedule, arrives on instinct',
    posLine: 'builds systems, keeps the promise, knows where the thing is',
  },
  {
    id: 'depth',
    name: 'Depth',
    neg: 'Surface',
    pos: 'Abyss',
    prompt: 'How far beneath the small talk they live.',
    negLine: 'quick, light, allergic to the heavy conversation',
    posLine: 'goes three layers down when everyone else stays on the surface',
  },
  {
    id: 'candor',
    name: 'Candor',
    neg: 'Veil',
    pos: 'Blade',
    prompt: 'What actually comes out of their mouth.',
    negLine: 'edits, softens, keeps a version of the truth in reserve',
    posLine: 'names the thing in the room, including when it costs them',
  },
  {
    id: 'drive',
    name: 'Drive',
    neg: 'Anchor',
    pos: 'Engine',
    prompt: 'What they do with inertia.',
    negLine: 'moves slowly, protects their energy, lets the current do the work',
    posLine: 'moves first and keeps moving after the point of exhaustion',
  },
  {
    id: 'play',
    name: 'Play',
    neg: 'Stone',
    pos: 'Spark',
    prompt: 'How they treat a room.',
    negLine: 'takes things seriously, which some people find safe and others find heavy',
    posLine: 'lowers the temperature of any room, jokes as a form of intelligence',
  },
  {
    id: 'nerve',
    name: 'Nerve',
    neg: 'Harbor',
    pos: 'Cliff',
    prompt: 'Where they stand when standing costs them something.',
    negLine: 'secures the ground first, and is right more often than they look',
    posLine: 'jumps before the calculation is finished, then makes the fall work',
  },
];

export const AXIS_IDS = AXES.map((a) => a.id);
export const AXIS = Object.fromEntries(AXES.map((a) => [a.id, a]));

// Six fast dials. Each one is a 5-stop scale, stored as 0..4 so a deck of
// answers stays small enough to live in a URL.
export const DIALS = [
  { axis: 'warmth', low: 'Glacier', high: 'Hearth', prompt: 'You walk into a room of strangers. They read you as…' },
  { axis: 'order', low: 'Drift', high: 'Grid', prompt: 'Their life, from the outside, looks…' },
  { axis: 'candor', low: 'Veil', high: 'Blade', prompt: 'When the truth is uncomfortable, they…' },
  { axis: 'drive', low: 'Anchor', high: 'Engine', prompt: 'Between two choices, they wait. This is…' },
  { axis: 'play', low: 'Stone', high: 'Spark', prompt: 'In a group, the jokes come from them…' },
  { axis: 'nerve', low: 'Harbor', high: 'Cliff', prompt: 'Risk, to them, is…' },
];

export const DIAL_STOPS = [-100, -50, 0, 50, 100];
export const dialToScore = (stop) => DIAL_STOPS[stop] ?? 0;
export const scoreToStop = (score) => {
  let best = 2;
  let bestDist = Infinity;
  DIAL_STOPS.forEach((s, i) => {
    const d = Math.abs(s - score);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
};

// Four situations. No neutral option is offered, because a forced choice is the
// only thing that produces a signal; "I genuinely can't say" is a fair third door.
export const PROBES = [
  {
    id: 'p2am',
    setup: "A friend's life falls apart at 2am and they call.",
    options: [
      {
        label: 'Pick up on the first ring and stay on the line until sunrise.',
        deltas: { warmth: 45, depth: 30, force: -20 },
      },
      {
        label: 'Send the plan: three steps, the numbers, the name of a good lawyer.',
        deltas: { force: 40, order: 25, warmth: -25, depth: 10 },
      },
    ],
  },
  {
    id: 'proom',
    setup: 'Someone in the room says something that is politely, quietly wrong.',
    options: [
      { label: 'Say it out loud, there, in front of everyone.', deltas: { candor: 45, nerve: 25, warmth: -15 } },
      { label: 'Say nothing, then outwork the room until the point is moot.', deltas: { candor: -30, drive: 35, nerve: 10 } },
    ],
  },
  {
    id: 'pchange',
    setup: 'The plan collapses forty minutes before it matters.',
    options: [
      { label: 'Improvise, and enjoy it more than the original plan.', deltas: { play: 40, order: -40, nerve: 25 } },
      { label: 'Rebuild it in ten minutes, smaller, and land it.', deltas: { order: 40, drive: 20, play: -15 } },
    ],
  },
  {
    id: 'poffer',
    setup: 'They are offered the thing they actually want, with no safety net under it.',
    options: [
      { label: 'Take it today and tell everyone after.', deltas: { nerve: 45, drive: 30, order: -15 } },
      { label: 'Negotiate a net first, then take it.', deltas: { order: 30, nerve: -20, depth: 20 } },
    ],
  },
];

export const PROBE_IDS = PROBES.map((p) => p.id);

// The deck. Voters pick the three cards that fit. Cards are deliberately a
// little seductive — people choose the card they like, which is itself data.
export const CARDS = [
  { id: 'wall', title: 'The Wall', line: 'Unbothered. Unmoved. Reading the room from behind glass.', deltas: { warmth: -35, force: 20 } },
  { id: 'hearth', title: 'The Hearth', line: 'Keeps everyone in the room warm, then forgets to feed themselves.', deltas: { warmth: 35, play: 10 } },
  { id: 'blade', title: 'The Blade', line: 'Tells you the thing nobody else in your life will say.', deltas: { candor: 40, nerve: 15 } },
  { id: 'veil', title: 'The Veil', line: 'You have known them for years and still do not quite know.', deltas: { candor: -35, depth: 25 } },
  { id: 'grid', title: 'The Grid', line: 'Everything has a place, and the place has a reason.', deltas: { order: 40, drive: 10 } },
  { id: 'drift', title: 'The Drift', line: 'Comfortable in the mess. Suspicious of anyone too organised.', deltas: { order: -35, play: 20 } },
  { id: 'engine', title: 'The Engine', line: 'Keeps moving even when nobody is watching and the goal has moved.', deltas: { drive: 40, play: -10 } },
  { id: 'anchor', title: 'The Anchor', line: 'Does not move for the current, the trend or the panic.', deltas: { drive: -30, warmth: 10, order: 15 } },
  { id: 'spark', title: 'The Spark', line: 'Makes the room lighter by two degrees in ten seconds.', deltas: { play: 40, warmth: 15 } },
  { id: 'stone', title: 'The Stone', line: 'Takes nothing lightly, including your jokes.', deltas: { play: -35, force: 15 } },
  { id: 'cliff', title: 'The Cliff', line: 'Jumps first. Builds the story afterwards.', deltas: { nerve: 40, order: -15 } },
  { id: 'harbor', title: 'The Harbor', line: 'Where people dock when they are not okay.', deltas: { nerve: -30, warmth: 20, depth: 10 } },
  { id: 'abyss', title: 'The Abyss', line: 'Too deep for small talk, and uninterested in faking it.', deltas: { depth: 40, play: -15 } },
  { id: 'mirror', title: 'The Mirror', line: 'Reads the room before entering it, then hands it back to itself.', deltas: { depth: 30, warmth: 15, candor: 10 } },
];

export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));
export const CARD_IDS = CARDS.map((c) => c.id);

// Who is speaking. Weight is how much an opinion counts toward the Persona:
// the people who actually live with you outrank a stranger from a link.
export const RINGS = [
  { id: 'inner', label: 'Close circle', blurb: 'They have seen you at your worst.', weight: 1.2 },
  { id: 'family', label: 'Family', blurb: 'They met you before you built anything.', weight: 1.15 },
  { id: 'work', label: 'Work', blurb: 'They know the professional mask.', weight: 1.0 },
  { id: 'online', label: 'Online', blurb: 'They know the edited version.', weight: 0.75 },
  { id: 'outer', label: 'Unverified', blurb: 'Answered the prompt, failed the door question.', weight: 0.4 },
];

export const RING = Object.fromEntries(RINGS.map((r) => [r.id, r]));
export const RING_IDS = RINGS.map((r) => r.id);

export const WEIGHTS = { dial: 1, probe: 1, card: 0.5 };

export const LIMITS = {
  receipt: 160,
  maxVotesPerPersona: 5000,
  nameMax: 60,
  taglineMax: 140,
  peers: 8,
  peerLabelMax: 24,
};

export const RECEIPT_PROMPTS = [
  'One thing you will still remember about them in ten years.',
  'The sentence you would use to describe them to a stranger.',
  'What they do that nobody thanks them for.',
  'The moment that made you decide what you think of them.',
];

export function receiptPrompt(id) {
  let h = 0;
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) % 9973;
  return RECEIPT_PROMPTS[h % RECEIPT_PROMPTS.length];
}

const clean = (s, max) =>
  String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

// Validates and normalises a submission (from a voter or from the owner's self-test).
export function validateSubmission(raw, { requireCards = true } = {}) {
  const errors = [];
  const src = raw && typeof raw === 'object' ? raw : {};

  const cards = Array.isArray(src.cards) ? [...new Set(src.cards.filter((c) => CARD_IDS.includes(c)))] : [];
  if (requireCards && cards.length !== 3) errors.push('pick exactly three cards');
  if (!requireCards && cards.length > 3) errors.push('at most three cards');

  const dials = {};
  const rawDials = src.dials && typeof src.dials === 'object' ? src.dials : {};
  for (const dial of DIALS) {
    const v = rawDials[dial.axis];
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 4) {
      errors.push(`dial ${dial.axis} must be 0..4`);
      continue;
    }
    dials[dial.axis] = n;
  }
  if (Object.keys(dials).length < 4) errors.push('answer at least four dials');

  const probes = {};
  const rawProbes = src.probes && typeof src.probes === 'object' ? src.probes : {};
  for (const probe of PROBES) {
    const v = rawProbes[probe.id];
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 1) {
      errors.push(`probe ${probe.id} must be 0 or 1`);
      continue;
    }
    probes[probe.id] = n;
  }
  if (Object.keys(probes).length < 3) errors.push('answer at least three probes');

  const ring = RING_IDS.includes(src.ring) && src.ring !== 'outer' ? src.ring : null;

  return {
    ok: errors.length === 0,
    errors,
    clean: {
      cards,
      dials,
      probes,
      ring,
      receipt: clean(src.receipt, LIMITS.receipt),
    },
  };
}

export function validatePersonaInput(raw) {
  const errors = [];
  const src = raw && typeof raw === 'object' ? raw : {};
  const name = clean(src.name, LIMITS.nameMax);
  const tagline = clean(src.tagline, LIMITS.taglineMax);
  const avatar = clean(src.avatar, 8) || '◐';
  if (name.length < 2) errors.push('name must be at least two characters');

  const peers = [];
  if (Array.isArray(src.peers)) {
    for (const p of src.peers.slice(0, LIMITS.peers)) {
      const label = clean(p, LIMITS.peerLabelMax);
      if (label) peers.push(label);
    }
  }

  const doorQuestion = clean(src.doorQuestion, 120);
  const doorAnswer = clean(src.doorAnswer, 60);

  return {
    ok: errors.length === 0,
    errors,
    clean: {
      name,
      tagline,
      avatar,
      peers,
      doorQuestion: doorQuestion.length > 6 && doorAnswer.length > 0 ? doorQuestion : '',
      doorAnswer: doorQuestion.length > 6 && doorAnswer.length > 0 ? doorAnswer : '',
    },
  };
}

// A stable, human-checkable normalisation so "Sidi Yahya" matches "sidi yahya".
export function normalizeAnswer(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}
