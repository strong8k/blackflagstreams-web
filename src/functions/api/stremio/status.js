// Cloudflare Pages Function: /api/stremio/status
// Check if user has a Stremio authKey stored in KV
import { json, validateSession } from '../_shared.js';

const STREMIO_API = 'https://api.strem.io/api';

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ connected: false }, 401);

  const stremioData = await env.SYNC_KV.get(`stremio:${session.userId}`);

  if (!stremioData) {
    return json({ connected: false, username: null });
  }

  const data = JSON.parse(stremioData);

  // Verify the authKey still works
  try {
    const res = await fetch(`${STREMIO_API}/datastoreGet`, {
      method: 'POST',
      body: JSON.stringify({ authKey: data.authKey, collection: 'libraryItem' }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      await env.SYNC_KV.delete(`stremio:${session.userId}`);
      return json({ connected: false, username: data.email || null });
    }
  } catch {
    // Network error — still show as connected (might be temporary)
  }

  return json({
    connected: true,
    username: data.email || null,
  });
}