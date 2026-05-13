// Cloudflare Pages Function: /api/rpdb/auth
// Validate RPDB API key and store in KV
import { json, validateSession } from '../_shared.js';

const RPDB_API = 'https://api.ratingposterdb.com';

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Not authenticated' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { apiKey } = body;
  if (!apiKey) return json({ error: 'API key required' }, 400);

  try {
    const res = await fetch(`${RPDB_API}/tmdb/poster?api_key=${apiKey}&tmdb_id=550`, {
      method: 'GET',
    });

    if (!res.ok) {
      return json({ error: 'Invalid RPDB API key' }, 401);
    }

    await env.SYNC_KV.put(`rpdb:${session.userId}`, JSON.stringify({
      apiKey,
      tier: 'pro',
      connectedAt: Date.now(),
    }));

    return json({
      success: true,
      connected: true,
      tier: 'pro',
    });
  } catch (e) {
    return json({ error: `RPDB auth failed: ${e.message}` }, 502);
  }
}