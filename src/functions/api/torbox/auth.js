// Cloudflare Pages Function: /api/torbox/auth
// Validate TorBox API key and store in KV
import { json, validateSession } from '../_shared.js';

const TORBOX_API = 'https://api.torbox.app/v1/api';

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
    const res = await fetch(`${TORBOX_API}/torrents?apikey=${apiKey}&limit=1`, {
      method: 'GET',
    });

    if (!res.ok) {
      return json({ error: 'Invalid TorBox API key' }, 401);
    }

    const data = await res.json();

    await env.SYNC_KV.put(`torbox:${session.userId}`, JSON.stringify({
      apiKey,
      connectedAt: Date.now(),
    }));

    return json({
      success: true,
      connected: true,
    });
  } catch (e) {
    return json({ error: `TorBox auth failed: ${e.message}` }, 502);
  }
}