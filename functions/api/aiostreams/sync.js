// POST /api/aiostreams/sync — Force re-sync user's AIOStreams config.
// Also available as GET for admin diagnostics.
import { json, preflight, validateSession } from '../_shared.js';
import { syncUser } from './_userdata.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  try {
    await syncUser(env, session.userId);
    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}