// POST /api/rpdb/auth — Validate and store RPDB API key
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { apiKey } = body;
  if (!apiKey) return json({ error: 'Missing apiKey' }, 400);

  try {
    // Validate by fetching a known-good poster
    const res = await fetch(`https://api.ratingposterdb.com/${apiKey}/imdb/tt0111161.jpg`, {
      method: 'GET',
      redirect: 'manual',
    });

    // RPDB returns image on success, redirect/404 on invalid key
    const contentType = res.headers.get('Content-Type') || '';
    if (!contentType.startsWith('image/')) {
      return json({ error: 'Invalid RPDB API key' }, 401);
    }

    // Store in KV
    await env.SYNC_KV.put(`service:rpdb:${session.userId}`, JSON.stringify({
      apiKey,
      connected: true,
      created: Date.now(),
    }));

    return json({ connected: true, tier: 'active' });
  } catch (e) {
    return json({ error: `RPDB validation error: ${e.message}` }, 502);
  }
}

// GET /api/rpdb/status — Check RPDB connection status
export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const raw = await env.SYNC_KV.get(`service:rpdb:${session.userId}`);
  if (!raw) return json({ connected: false });

  const stored = JSON.parse(raw);
  return json({ connected: true, tier: stored.tier || 'active' });
}
