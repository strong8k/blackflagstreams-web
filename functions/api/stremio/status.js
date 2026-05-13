// GET /api/stremio/status — Check Stremio connection status
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const raw = await env.SYNC_KV.get(`service:stremio:${session.userId}`);
  if (!raw) return json({ connected: false });

  const stored = JSON.parse(raw);
  if (!stored.authKey) return json({ connected: false });

  try {
    // Verify authKey still works by fetching user info from Stremio API
    const res = await fetch('https://api.strem.io/api/datastoreGet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authKey: stored.authKey,
        collection: 'libraryItem',
        params: { skip: 0, limit: 1 },
      }),
    });

    if (!res.ok) {
      // Only wipe the token on explicit auth failures (401/403).
      // Any other error (API change, 5xx, rate limit) should NOT disconnect
      // the user — the authKey may still be perfectly valid.
      if (res.status === 401 || res.status === 403) {
        await env.SYNC_KV.delete(`service:stremio:${session.userId}`);
        return json({ connected: false });
      }
      return json({ connected: true, username: stored.email?.split('@')[0] || 'Stremio User', email: stored.email || null, lastImport: stored.lastImport || null, _authKey: stored.authKey });
    }

    let email = null;
    try {
      const data = await res.json();
      email = data?.result?.email || data?.user?.email || null;
    } catch { /* ignore parse errors */ }

    return json({
      connected: true,
      username: email ? email.split('@')[0] : (stored.email?.split('@')[0] || 'Stremio User'),
      email: email || stored.email || null,
      lastImport: stored.lastImport || null,
      _authKey: stored.authKey,
    });
  } catch {
    return json({
      connected: true,
      username: stored.email?.split('@')[0] || 'Stremio User',
      email: stored.email || null,
      lastImport: stored.lastImport || null,
      _authKey: stored.authKey,
    });
  }
}
