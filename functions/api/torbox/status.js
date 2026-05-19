// GET /api/torbox/status — Return TorBox account status
// Checks both legacy KV and aiostreams user data.
import { json, preflight, validateSession } from '../_shared.js';
import { hasDebridKeys } from '../aiostreams/_userdata.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const raw = await env.SYNC_KV.get(`service:torbox:${session.userId}`);
  if (!raw) return json({ connected: false });

  const stored = JSON.parse(raw);
  return json({
    connected: true,
    email: stored.email || null,
    plan: stored.plan || null,
    expiresAt: stored.expiresAt || null,
  });
}