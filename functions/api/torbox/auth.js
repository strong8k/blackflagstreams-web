// POST /api/torbox/auth — Validate and store TorBox API key
import { json, preflight, validateSession } from '../_shared.js';

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
    const res = await fetch('https://api.torbox.app/v1/api/users/me', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    const data = await res.json();
    if (!res.ok || !data?.success || !data?.data) {
      return json({ error: data?.detail || data?.error || 'Invalid TorBox API key' }, 401);
    }

    const user = data.data;
    const planLabel = user.plan_name || (user.plan != null ? `Plan ${user.plan}` : null);
    const info = {
      apiKey,
      connected: true,
      email: user.email || null,
      plan: planLabel,
      expiresAt: user.premium_expires_at || user.subscription_expires_at || null,
    };

    await env.SYNC_KV.put(`service:torbox:${session.userId}`, JSON.stringify(info));
    return json({ connected: true, email: info.email, plan: info.plan, expiresAt: info.expiresAt });
  } catch (e) {
    return json({ error: `TorBox validation error: ${e.message}` }, 502);
  }
}
