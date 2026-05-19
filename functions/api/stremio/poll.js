// POST /api/stremio/poll — Register Stremio auth key (obtained from browser-side polling)
// The frontend polls link.stremio.com/api/v2/read directly (avoids Worker WAF block).
// When the authKey appears (user completed pairing), the frontend sends it here for storage.

import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { authKey } = body;
  if (!authKey) return json({ error: 'Missing authKey' }, 400);

  // Store authKey in KV (persistent)
  await env.SYNC_KV.put(`service:stremio:${session.userId}`, JSON.stringify({
    authKey,
    connected: true,
    created: Date.now(),
  }));

  // Clean up pending state
  await env.SYNC_KV.delete(`service:stremio_pending:${session.userId}`);

  return json({ done: true });
}
