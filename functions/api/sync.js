// Cloudflare Pages Function: /api/sync
// GET  /api/sync?action=pull  (Authorization: Bearer <token>) → Pull sync data
// POST /api/sync?action=push  (Authorization: Bearer <token>) → Push sync data

import { json, preflight, validateSession } from './_shared.js';

const TIER_LIMITS = {
  free:    { maxSize: 5000 },
  account: { maxSize: 50000 },
  pro:     { maxSize: 200000 },
  premium: { maxSize: 200000 },
  ultra:   { maxSize: 500000 },
};

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const action = new URL(request.url).searchParams.get('action');
  if (action !== 'pull') return json({ error: 'Invalid action' }, 400);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Not authenticated' }, 401);

  const syncData = await env.SYNC_KV.get(`sync:${session.userId}`);
  if (!syncData) return json({ success: true, data: { addons: [], watchlist: [], continueWatching: [], history: [], iptvProviders: [], preferences: {}, profiles: [], activeProfileId: null } });

  const parsed = JSON.parse(syncData);
  if (parsed.addons) {
    parsed.addons = parsed.addons
      .map(a => ({ ...a, url: a.url || a.transportUrl }))
      .filter(a => a.url);
  }
  // Ensure profiles is always an array
  if (!parsed.profiles) parsed.profiles = [];
  if (!parsed.activeProfileId) parsed.activeProfileId = null;
  return json({ success: true, data: parsed });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const action = new URL(request.url).searchParams.get('action');
  if (action !== 'push') return json({ error: 'Invalid action' }, 400);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Not authenticated' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const userData = await env.SYNC_KV.get(`user:${session.userId}`);
  const user = userData ? JSON.parse(userData) : { tier: 'account' };
  const limits = TIER_LIMITS[user.tier] || TIER_LIMITS.account;

  const syncData = {
    addons: body.addons || [],
    watchlist: body.watchlist || [],
    continueWatching: body.continueWatching || [],
    history: body.history || [],
    iptvProviders: body.iptvProviders || [],
    preferences: body.preferences || {},
    profiles: body.profiles || [],
    activeProfileId: body.activeProfileId || null,
    updated: Date.now(),
  };

  const size = new TextEncoder().encode(JSON.stringify(syncData)).length;
  if (size > limits.maxSize) {
    return json({ error: `Data too large. ${user.tier} tier max: ${Math.round(limits.maxSize / 1024)}KB` }, 413);
  }

  await env.SYNC_KV.put(`sync:${session.userId}`, JSON.stringify(syncData));
  return json({ success: true, updated: syncData.updated, size });
}
