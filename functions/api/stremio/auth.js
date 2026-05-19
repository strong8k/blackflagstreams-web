// POST /api/stremio/auth — Register a Stremio pairing code (generated client-side)
// The frontend generates the code by calling link.stremio.com/api/v2/create directly
// (browsers aren't blocked by WAF), then sends the code + authKey here for storage.
// The poll endpoint checks when the user completes pairing.

import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) {
    console.log('[Stremio:Auth] DIAG — session validation failed');
    return json({ error: 'Unauthorized' }, 401);
  }

  console.log('[Stremio:Auth] DIAG — session valid, userId:', session.userId);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { code } = body;
  if (!code) return json({ error: 'Missing code' }, 400);

  // Store pending state in KV with 5 min TTL
  console.log('[Stremio:Auth] DIAG — storing code in KV, SYNC_KV exists:', !!env?.SYNC_KV);
  await env.SYNC_KV.put(`service:stremio_pending:${session.userId}`, JSON.stringify({
    code,
    created: Date.now(),
  }), { expirationTtl: 300 });

  return json({ success: true });
}
