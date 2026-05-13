// POST /api/realdebrid/auth — Validate and store Real-Debrid API key
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
    const res = await fetch('https://api.real-debrid.com/rest/1.0/user', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const data = await res.json();
    if (!res.ok || !data?.id) {
      return json({ error: data?.error || 'Invalid Real-Debrid API key' }, 401);
    }

    await env.SYNC_KV.put(`service:realdebrid:${session.userId}`, JSON.stringify({
      access_token: apiKey,
      connected: true,
      username: data.username || null,
      premium: data.premium > 0,
      expiresAt: data.expiration || null,
      created: Date.now(),
    }));

    return json({
      connected: true,
      username: data.username || null,
      premium: data.premium > 0,
      expiresAt: data.expiration || null,
    });
  } catch (e) {
    return json({ error: `RD validation error: ${e.message}` }, 502);
  }
}
