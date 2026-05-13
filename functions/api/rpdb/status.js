// GET /api/rpdb/status — Check RPDB connection status
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const raw = await env.SYNC_KV.get(`service:rpdb:${session.userId}`);
  if (!raw) return json({ connected: false });

  const stored = JSON.parse(raw);
  return json({
    connected: true,
    tier: stored.tier || 'active',
  });
}
