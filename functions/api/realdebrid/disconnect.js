// POST /api/realdebrid/disconnect — Remove Real-Debrid tokens from KV and aiostreams
import { json, preflight, validateSession } from '../_shared.js';
import { removeUserDebridKey } from '../aiostreams/_userdata.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  await env.SYNC_KV.delete(`service:realdebrid:${session.userId}`);
  await env.SYNC_KV.delete(`service:rd_pending:${session.userId}`);
  await removeUserDebridKey(env, session.userId, 'realdebrid');

  return json({ success: true });
}