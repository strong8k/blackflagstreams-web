// POST /api/torbox/auth — Validate and store TorBox API key
// Stores key in both legacy KV and aiostreams user data.
import { json, preflight, validateSession } from '../_shared.js';
import { setUserDebridKey } from '../aiostreams/_userdata.js';

const TORBOX_API = 'https://api.torbox.app/v1/api';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const apiKey = (body.apiKey || '').trim();
  if (!apiKey) return json({ error: 'Missing apiKey' }, 400);

  try {
    // Validate key by fetching user info
    const res = await fetch(`${TORBOX_API}/users/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return json({ error: 'Invalid TorBox API key' }, 401);

    const data = await res.json();
    const userData = data?.data || data || {};

    // Store in legacy KV (for backward compat during migration)
    await env.SYNC_KV.put(`service:torbox:${session.userId}`, JSON.stringify({
      apiKey,
      connected: true,
      email: userData.email || null,
      plan: userData.plan || userData.subscription?.plan || null,
      expiresAt: userData.expires_at || null,
      created: Date.now(),
    }));

    // Sync AIOStreams config with new key (best-effort — key is already saved in KV)
    try {
      await setUserDebridKey(env, session.userId, 'torbox', apiKey);
    } catch (e) {
      console.error('[BFS:AIO] torbox syncUser error:', e.message);
    }

    return json({
      connected: true,
      email: userData.email || null,
      plan: userData.plan || userData.subscription?.plan || null,
      expiresAt: userData.expires_at || null,
    });
  } catch (e) {
    return json({ error: `TorBox validation error: ${e.message}` }, 502);
  }
}