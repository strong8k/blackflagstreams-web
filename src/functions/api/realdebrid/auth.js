// Cloudflare Pages Function: /api/realdebrid/auth
// Validate Real-Debrid API key and store in KV
import { json, validateSession } from '../_shared.js';

const RD_API = 'https://api.real-debrid.com/rest/1.0';

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
    const res = await fetch(`${RD_API}/user`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      return json({ error: 'Invalid Real-Debrid API key' }, 401);
    }

    const userData = await res.json();

    await env.SYNC_KV.put(`realdebrid:${session.userId}`, JSON.stringify({
      apiKey,
      username: userData.username || null,
      avatar: userData.avatar || null,
      premium: userData.premium === 1,
      expiresAt: userData.premium_expire || null,
      connectedAt: Date.now(),
    }));

    return json({
      success: true,
      connected: true,
      username: userData.username || null,
      premium: userData.premium === 1,
      expiresAt: userData.premium_expire || null,
    });
  } catch (e) {
    return json({ error: `Real-Debrid auth failed: ${e.message}` }, 502);
  }
}