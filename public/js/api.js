// public/js/api.js — thin wrapper over the JSON API.

const TOKEN_KEY = (id) => `persona.owner.${id}`;
const VOTED_KEY = (id) => `persona.voted.${id}`;
const DEVICE_KEY = 'persona.device';

// Decision D4: a voter is a device, not an address. Two people behind the same
// router get two votes; one person reloading does not get a second one.
export const device = (() => {
  let cached = '';
  const make = () => {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  return {
    id() {
      if (cached) return cached;
      try {
        cached = localStorage.getItem(DEVICE_KEY) || '';
        if (!cached) {
          cached = make();
          localStorage.setItem(DEVICE_KEY, cached);
        }
      } catch {
        cached = make();
      }
      return cached;
    },
  };
})();

export const tokens = {
  get: (id) => {
    try {
      return localStorage.getItem(TOKEN_KEY(id)) || '';
    } catch {
      return '';
    }
  },
  set: (id, token) => {
    try {
      localStorage.setItem(TOKEN_KEY(id), token);
    } catch {}
  },
};

export const voted = {
  get: (id) => {
    try {
      return localStorage.getItem(VOTED_KEY(id)) === '1';
    } catch {
      return false;
    }
  },
  set: (id) => {
    try {
      localStorage.setItem(VOTED_KEY(id), '1');
    } catch {}
  },
};

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      'x-voter-id': device.id(),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new ApiError(data?.error || `request failed (${res.status})`, res.status, data);
  return data;
}

export const api = {
  health: () => request('/api/health'),
  demo: () => request('/api/demo'),
  create: (payload) => request('/api/personas', { method: 'POST', body: payload }),
  get: (id) => request(`/api/personas/${id}`),
  postEgo: (id, payload) =>
    request(`/api/personas/${id}/ego`, { method: 'POST', body: payload, headers: { 'x-owner-token': tokens.get(id) } }),
  getEgo: (id) => request(`/api/personas/${id}/ego`, { headers: { 'x-owner-token': tokens.get(id) } }),
  vote: (id, payload) => request(`/api/personas/${id}/votes`, { method: 'POST', body: payload }),
  portrait: (id) => request(`/api/personas/${id}/portrait`, { headers: { 'x-owner-token': tokens.get(id) } }),
  // Decision D11: the public share view. No owner token; the server decides what a
  // stranger may see (see PublicView.cs).
  share: (id) => request(`/api/personas/${id}/portrait?view=share`),
  analyze: (id) => request(`/api/personas/${id}/analyze`, { method: 'POST', headers: { 'x-owner-token': tokens.get(id) } }),
  digest: (id) => request(`/api/personas/${id}/digest`, { headers: { 'x-owner-token': tokens.get(id) } }),
};

export { ApiError };
