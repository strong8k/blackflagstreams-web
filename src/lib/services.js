/* ═══════════════════════════════════════════════════════
   Unified Service Client Library
   All service API calls proxied through BFS backend
   (which stores OAuth tokens / API keys in KV).
   ═══════════════════════════════════════════════════════ */

import { getToken } from './auth';

const LOG = (...args) => console.log('[BFS:Services]', ...args);
const ERR = (...args) => console.error('[BFS:Services]', ...args);

// Use same-origin relative paths directly — never use getApiBaseUrl() here.
// getApiBaseUrl() reads a bfs_api_base localStorage override that may be stale
// (pointing at an old proxy URL), which silently routes all service auth through
// openprox instead of the CF backend.
function api(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `API error (${r.status})`);
    return data;
  });
}

// ═══ Re-export Trakt (already working) ═══
export {
  getTraktAuthUrl,
  getTraktStatus,
  disconnectTrakt,
  syncTraktHistory,
  pushToTrakt,
  enqueueTraktPush,
} from './trakt';

// ═══ Stremio (code-based device linking) ═══

export async function getStremioAuthCode() {
  LOG('Requesting Stremio pairing code from browser (bypasses Worker WAF)...');
  // CF Workers can't fetch link.stremio.com due to WAF, so call it from the browser directly
  const res = await fetch('https://link.stremio.com/api/v2/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Stremio API error (${res.status}): ${errText.slice(0, 100)}`);
  }
  const data = await res.json();
  const code = data?.result?.code;
  const qr = data?.result?.qrcode;
  const userLink = data?.result?.link;
  if (!code) throw new Error('Stremio did not return a pairing code');

  // Register the code with our backend so poll.js can check for completion
  LOG('Got Stremio code, registering with backend:', code);
  await api('/api/stremio/auth', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  LOG('Stremio code registered');
  return { code, qr, user_url: userLink || 'https://www.strem.io/link' };
}

export async function pollStremioAuth(code) {
  // Poll Stremio's API from the browser (Worker can't reach link.stremio.com due to WAF)
  const res = await fetch(`https://link.stremio.com/api/v2/read?type=Read&code=${encodeURIComponent(code)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Stremio poll error (${res.status}): ${errText.slice(0, 100)}`);
  }

  const data = await res.json();
  if (!data.result) return { done: false, waiting: true };

  const authKey = data.result.authKey;
  if (!authKey) return { done: false, waiting: true };

  // User completed pairing — store authKey in our backend
  LOG('Stremio code paired, storing authKey...');
  await api('/api/stremio/poll', {
    method: 'POST',
    body: JSON.stringify({ authKey }),
  });
  LOG('Stremio authKey stored');
  return { done: true };
}

export async function getStremioStatus() {
  try {
    const data = await api('/api/stremio/status');
    return data; // { connected, username }
  } catch {
    return { connected: false };
  }
}

export async function importStremioLibrary(debug = false) {
  return api(`/api/stremio/library${debug ? '?debug=true' : ''}`);
}

export async function disconnectStremio() {
  LOG('Disconnecting Stremio...');
  const data = await api('/api/stremio/disconnect', { method: 'POST' });
  LOG('Stremio disconnected');
  return data;
}

// ═══ TorBox (API key validation, server-side) ═══

export async function connectTorBox(apiKey) {
  LOG('Connecting TorBox...');
  const data = await api('/api/torbox/auth', {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
  LOG('TorBox connected:', data.email);
  return data; // { connected, email, plan, expiresAt }
}

export async function getTorBoxStatus() {
  try {
    const data = await api('/api/torbox/status');
    return data; // { connected, email, plan, expiresAt }
  } catch {
    return { connected: false };
  }
}

export async function disconnectTorBox() {
  LOG('Disconnecting TorBox...');
  const data = await api('/api/torbox/disconnect', { method: 'POST' });
  LOG('TorBox disconnected');
  return data;
}

// ═══ Real-Debrid (API key) ═══

export async function connectRD(apiKey) {
  LOG('Connecting Real-Debrid...');
  const data = await api('/api/realdebrid/auth', {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
  LOG('Real-Debrid connected:', data.username);
  return data; // { connected, username, premium, expiresAt }
}

export async function getRDStatus() {
  try {
    const data = await api('/api/realdebrid/status');
    return data; // { connected, username, premium, expiresAt }
  } catch {
    return { connected: false };
  }
}

export async function disconnectRD() {
  LOG('Disconnecting Real-Debrid...');
  const data = await api('/api/realdebrid/disconnect', { method: 'POST' });
  LOG('Real-Debrid disconnected');
  return data;
}

// ═══ All-Debrid (PIN flow) ═══

export async function getADAuthCode() {
  LOG('Requesting All-Debrid PIN...');
  const data = await api('/api/alldebrid/auth', { method: 'POST' });
  LOG('Got AD PIN');
  return data; // { pin, user_url }
}

export async function pollADAuth(pin) {
  const data = await api('/api/alldebrid/poll', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
  return data; // { done }
}

export async function getADStatus() {
  try {
    const data = await api('/api/alldebrid/status');
    return data; // { connected, username, premium, expiresAt }
  } catch {
    return { connected: false };
  }
}

export async function disconnectAD() {
  LOG('Disconnecting All-Debrid...');
  const data = await api('/api/alldebrid/disconnect', { method: 'POST' });
  LOG('All-Debrid disconnected');
  return data;
}

// ═══ AIOStreams Debrid Settings ═══

export async function getDebridSettings() {
  try {
    const data = await api('/api/aiostreams/settings');
    return data; // { hasDebrid, settings: { enabledResolutions, languages, sizeGlobal } }
  } catch {
    return { hasDebrid: false, settings: null };
  }
}

export async function updateDebridSettings(updates) {
  const data = await api('/api/aiostreams/settings', {
    method: 'POST',
    body: JSON.stringify(updates),
  });
  return data; // { success }
}

// ═══ AIOStreams Sync ═══

export async function syncAIOStreams() {
  const data = await api('/api/aiostreams/sync', {
    method: 'POST',
  });
  return data; // { success }
}

// ═══ RPDB (API key validation) ═══

export async function connectRPDB(apiKey) {
  LOG('Connecting RPDB...');
  const data = await api('/api/rpdb/auth', {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
  LOG('RPDB connected, tier:', data.tier);
  return data; // { connected, tier }
}

export async function getRPDBStatus() {
  try {
    const data = await api('/api/rpdb/status');
    return data; // { connected, tier }
  } catch {
    return { connected: false };
  }
}

export async function disconnectRPDB() {
  LOG('Disconnecting RPDB...');
  const data = await api('/api/rpdb/disconnect', { method: 'POST' });
  LOG('RPDB disconnected');
  return data;
}
