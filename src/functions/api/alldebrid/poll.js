// Cloudflare Pages Function: /api/alldebrid/poll
// Poll All-Debrid PIN authentication status
import { json, validateSession } from '../_shared.js';

const AD_API = 'https://api.alldebrid.com';

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

  if (!env.ALLDEBRID_API_KEY) {
    return json({ error: 'All-Debrid API key not configured' }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { pin } = body;
  if (!pin) return json({ error: 'PIN required' }, 400);

  try {
    const checkRes = await fetch(`${AD_API}/pin/check?apikey=${env.ALLDEBRID_API_KEY}&pin=${pin}`);
    const checkData = await checkRes.json();

    if (checkData.activated) {
      // PIN activated — get user info and store
      const userRes = await fetch(`${AD_API}/user?apikey=${env.ALLDEBRID_API_KEY}`);
      const userData = await userRes.json();

      await env.SYNC_KV.delete(`alldebrid-pending:${session.userId}`);
      await env.SYNC_KV.put(`alldebrid:${session.userId}`, JSON.stringify({
        apiKey: env.ALLDEBRID_API_KEY,
        username: userData.user?.username || null,
        premium: userData.user?.isPremium || false,
        expiresAt: userData.user?.premiumUntil || null,
        connectedAt: Date.now(),
      }));

      return json({ done: true, username: userData.user?.username || null });
    }

    return json({ done: false, waiting: true });
  } catch (e) {
    return json({ error: `All-Debrid poll failed: ${e.message}` }, 502);
  }
}