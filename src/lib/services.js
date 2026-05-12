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

// ═══ Stremio (Syncio-style device pairing) ═══

export async function getStremioAuthCode() {
  LOG('Requesting Stremio pairing code...');
  const data = await api('/api/stremio/auth', { method: 'POST' });
  LOG('Got Stremio pairing code:', data.code);
  return data; // { code, link }
}

export async function pollStremioAuth(code) {
  const data = await api('/api/stremio/poll', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  return data; // { done, authKey? }
}

export async function getStremioStatus() {
  try {
    const data = await api('/api/stremio/status');
    return data; // { connected, username }
  } catch {
    return { connected: false };
  }
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

// ═══ Real-Debrid (OAuth2 device flow) ═══

export async function getRDAuthCode() {
  LOG('Requesting Real-Debrid device code...');
  const data = await api('/api/realdebrid/auth', { method: 'POST' });
  LOG('Got RD device code');
  return data; // { device_code, user_code, verification_url, interval }
}

export async function pollRDAuth(deviceCode) {
  const data = await api('/api/realdebrid/poll', {
    method: 'POST',
    body: JSON.stringify({ device_code: deviceCode }),
  });
  return data; // { done }
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
