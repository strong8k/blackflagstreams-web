// POST /api/stremio/poll — Poll for Stremio device pairing completion
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { code } = body;
  if (!code) return json({ error: 'Missing code' }, 400);

  try {
    const res = await fetch(`https://link.stremio.com/api/v2/read?type=Read&code=${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.strem.io',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const data = await res.json();
    if (!data.result) return json({ done: false, waiting: true });

    const authKey = data.result.authKey;
    if (!authKey) return json({ done: false, waiting: true });

    // Store authKey in KV (persistent)
    await env.SYNC_KV.put(`service:stremio:${session.userId}`, JSON.stringify({
      authKey,
      connected: true,
      created: Date.now(),
    }));

    // Clean up pending state
    await env.SYNC_KV.delete(`service:stremio_pending:${session.userId}`);

    return json({ done: true });
  } catch (e) {
    return json({ error: `Stremio poll error: ${e.message}` }, 502);
  }
}
