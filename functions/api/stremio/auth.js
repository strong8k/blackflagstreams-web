// POST /api/stremio/auth — Authenticate with Stremio via email/password
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const email = (body.email || '').trim();
  const password = (body.password || '').trim();
  if (!email || !password) return json({ error: 'Email and password required' }, 400);

  try {
    const res = await fetch('https://api.strem.io/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, facebook: false }),
    });

    const data = await res.json();
    if (!res.ok || data.error || !data.result?.authKey) {
      return json({ error: data.error || 'Invalid Stremio credentials' }, 401);
    }

    const authKey = data.result.authKey;
    await env.SYNC_KV.put(`service:stremio:${session.userId}`, JSON.stringify({
      authKey,
      email: data.result.email || email,
      connected: true,
      created: Date.now(),
    }));

    return json({ connected: true, email: data.result.email || email });
  } catch (e) {
    return json({ error: `Stremio auth error: ${e.message}` }, 502);
  }
}
