// POST /api/alldebrid/disconnect — Remove All-Debrid tokens from KV and aiostreams
import { json, preflight, validateSession } from '../_shared.js';
import { removeUserDebridKey } from '../aiostreams/_userdata.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  await env.SYNC_KV.delete(`service:alldebrid:${session.userId}`);
  await env.SYNC_KV.delete(`service:ad_pending:${session.userId}`);
  await removeUserDebridKey(env, session.userId, 'alldebrid');

  return json({ success: true });
}