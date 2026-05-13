// POST /api/alldebrid/auth — Initiate All-Debrid PIN flow
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  try {
    const res = await fetch('https://api.alldebrid.com/v4/pin/get?agent=BlackFlagStreams');

    const data = await res.json();
    if (!res.ok || data.status !== 'success' || !data.data?.pin) {
      return json({ error: data.error?.message || 'Failed to get AD PIN' }, 502);
    }

    // Store pin in KV with 10 min TTL
    await env.SYNC_KV.put(`service:ad_pending:${session.userId}`, JSON.stringify({
      pin: data.data.pin,
      check_url: data.data.check_url,
      created: Date.now(),
    }), { expirationTtl: 600 });

    return json({
      pin: data.data.pin,
      user_url: data.data.user_url || 'https://alldebrid.com/pin',
    });
  } catch (e) {
    return json({ error: `AD auth error: ${e.message}` }, 502);
  }
}
