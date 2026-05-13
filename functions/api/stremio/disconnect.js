// POST /api/stremio/disconnect — Remove Stremio tokens from KV
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  await env.SYNC_KV.delete(`service:stremio:${session.userId}`);
  await env.SYNC_KV.delete(`service:stremio_pending:${session.userId}`);

  return json({ success: true });
}
