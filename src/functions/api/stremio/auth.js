// Cloudflare Pages Function: /api/stremio/auth
// Authenticate with Stremio's public API and store authKey in KV
import { json } from '../_shared.js';

const STREMIO_API = 'https://api.strem.io/api';

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

  const { email, password } = body;
  if (!email || !password) return json({ error: 'Email and password required' }, 400);

  try {
    const res = await fetch(`${STREMIO_API}/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    if (data.error) {
      return json({ error: data.error.message || 'Stremio login failed' }, 401);
    }

    const authKey = data.result.authKey;

    // Store in KV so the TV app and other server-side code can access it
    await env.SYNC_KV.put(`stremio:${session.userId}`, JSON.stringify({
      authKey,
      email: data.result.user?.email || email,
      connectedAt: Date.now(),
    }));

    return json({
      success: true,
      connected: true,
      email: data.result.user?.email || email,
    });
  } catch (e) {
    return json({ error: `Stremio auth failed: ${e.message}` }, 502);
  }
}