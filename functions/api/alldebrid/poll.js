// POST /api/alldebrid/poll — Poll for All-Debrid PIN authorization
import { json, preflight, validateSession } from '../_shared.js';
import { setUserDebridKey } from '../aiostreams/_userdata.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  // Retrieve pending state from KV — contains pin + check_url
  const pendingRaw = await env.SYNC_KV.get(`service:ad_pending:${session.userId}`);
  if (!pendingRaw) return json({ error: 'No pending AD authorization. Please restart the flow.' }, 400);

  const { pin, check_url } = JSON.parse(pendingRaw);
  if (!pin || !check_url) return json({ error: 'Invalid pending state' }, 400);

  try {
    // check_url is the full URL AllDebrid gave us (includes check token + pin + agent)
    const res = await fetch(check_url);
    const data = await res.json();

    if (!res.ok || data.status !== 'success') {
      return json({ error: data?.error?.message || 'AD poll failed', done: false, waiting: true });
    }

    if (!data.data?.activated) return json({ done: false, waiting: true });

    const apikey = data.data.apikey;
    if (!apikey) return json({ done: false, waiting: true });

    await env.SYNC_KV.put(`service:alldebrid:${session.userId}`, JSON.stringify({
      apikey,
      connected: true,
      created: Date.now(),
    }));
    await env.SYNC_KV.delete(`service:ad_pending:${session.userId}`);
    // Sync AIOStreams config with new key (best-effort — key is already saved in KV)
    try {
      await setUserDebridKey(env, session.userId, 'alldebrid', apikey);
    } catch (e) {
      console.error('[BFS:AIO] alldebrid syncUser error:', e.message);
    }

    return json({ done: true });
  } catch (e) {
    return json({ error: `AD poll error: ${e.message}` }, 502);
  }
}