/* ═══════════════════════════════════════════════════════
   Trakt.tv Client Library
   All Trakt API calls are proxied through our backend
   (which holds the OAuth tokens in KV).
   ═══════════════════════════════════════════════════════ */

import { getToken } from './auth';

const LOG = (...args) => console.log('[BFS:Trakt]', ...args);
const ERR = (...args) => console.error('[BFS:Trakt]', ...args);

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

export async function getTraktAuthUrl() {
  LOG('Requesting Trakt auth URL...');
  const data = await api('/api/trakt/auth');
  LOG('Got authorize URL');
  return data; // { authorizeUrl, state }
}

export async function getTraktStatus() {
  LOG('Checking Trakt status...');
  try {
    const data = await api('/api/trakt/status');
    LOG('Status:', data.connected ? `Connected as @${data.username}` : 'Not connected');
    return data; // { connected, username, lastSync }
  } catch (e) {
    ERR('Status check failed:', e.message);
    return { connected: false };
  }
}

export async function disconnectTrakt() {
  LOG('Disconnecting Trakt...');
  const data = await api('/api/trakt/disconnect', { method: 'POST' });
  LOG('Disconnected');
  return data;
}

export async function syncTraktHistory() {
  LOG('Syncing Trakt history...');
  const data = await api('/api/trakt/sync', { method: 'POST' });
  LOG(`Synced: ${data.count} items (${data.unresolved} unresolved)`);
  return data; // { success, count, items[], unresolved }
}

export async function pushToTrakt(items) {
  if (!items || items.length === 0) return;
  LOG(`Pushing ${items.length} items to Trakt...`);
  try {
    const data = await api('/api/trakt/push', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
    LOG(`Pushed: ${data.added?.movies || 0} movies, ${data.added?.episodes || 0} episodes`);
    return data;
  } catch (e) {
    ERR('Push failed:', e.message);
    return null;
  }
}

// ── Debounced push queue ──
let pushQueue = [];
let pushTimer = null;
const PUSH_DEBOUNCE = 30000; // 30 seconds

export function enqueueTraktPush(item) {
  // Avoid duplicates in the same batch
  const key = `${item.type}_${item.id}`;
  const exists = pushQueue.find(i => `${i.type}_${i.id}` === key);
  if (exists) {
    // Update with newer progress
    Object.assign(exists, item);
  } else {
    pushQueue.push(item);
  }

  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const batch = [...pushQueue];
    pushQueue = [];
    await pushToTrakt(batch);
  }, PUSH_DEBOUNCE);
}
