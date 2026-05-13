// Cloudflare Pages Function: /api/sync
// Account-based sync using session tokens
// KV binding: SYNC_KV
//
// GET  /api/sync?action=pull&token=xxx       → Pull sync data
// POST /api/sync?action=push     { token, ...data }  → Push sync data

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

const TIER_LIMITS = {
  free: { maxSize: 5000 },
  account: { maxSize: 50000 },
  pro: { maxSize: 200000 },
};

async function getSession(env, token) {
  if (!token) return null;
  const data = await env.SYNC_KV.get(`session:${token}`);
  return data ? JSON.parse(data) : null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const token = url.searchParams.get('token');

  if (action === 'pull') {
    const session = await getSession(env, token);
    if (!session) return json({ error: 'Not authenticated' }, 401);

    const syncData = await env.SYNC_KV.get(`sync:${session.userId}`);
    if (!syncData) return json({ success: true, data: { addons: [], watchlist: [], continueWatching: [], iptvProviders: [], preferences: {} } });

    return json({ success: true, data: JSON.parse(syncData) });
  }

  return json({ error: 'Invalid action' }, 400);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'push') {
    const body = await request.json();
    const session = await getSession(env, body.token);
    if (!session) return json({ error: 'Not authenticated' }, 401);

    // Get user tier
    const userData = await env.SYNC_KV.get(`user:${session.userId}`);
    const user = userData ? JSON.parse(userData) : { tier: 'account' };
    const limits = TIER_LIMITS[user.tier] || TIER_LIMITS.account;

    const syncData = {
      addons: body.addons || [],
      watchlist: body.watchlist || [],
      continueWatching: body.continueWatching || [],
      iptvProviders: body.iptvProviders || [],
      preferences: body.preferences || {},
      updated: Date.now(),
    };

    // Size check
    const size = new TextEncoder().encode(JSON.stringify(syncData)).length;
    if (size > limits.maxSize) {
      return json({ error: `Data too large. ${user.tier} tier max: ${Math.round(limits.maxSize / 1024)}KB` }, 413);
    }

    await env.SYNC_KV.put(`sync:${session.userId}`, JSON.stringify(syncData));
    return json({ success: true, updated: syncData.updated, size });
  }

  return json({ error: 'Invalid action' }, 400);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
