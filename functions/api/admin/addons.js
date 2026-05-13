// GET    /api/admin/addons?type=global|recommended|ultra  — list addons
// POST   /api/admin/addons                                — add/update addon
// DELETE /api/admin/addons                                — remove addon
import { json, preflight, validateAdminSession, genId } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

const KV_KEY = {
  global: 'admin:global_addons',
  recommended: 'admin:recommended_addons',
  ultra: 'admin:ultra_addons',
};

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!await validateAdminSession(env, request)) return json({ error: 'Unauthorized' }, 401);

  const type = new URL(request.url).searchParams.get('type') || 'global';
  const key = KV_KEY[type];
  if (!key) return json({ error: 'Invalid type. Use global, recommended, or ultra.' }, 400);

  try {
    const raw = await env.SYNC_KV.get(key);
    return json({ addons: raw ? JSON.parse(raw) : [] });
  } catch (e) {
    return json({ addons: [] });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!await validateAdminSession(env, request)) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { type, name, url, description, target = 'all', id } = body;
  const key = KV_KEY[type];
  if (!key) return json({ error: 'Invalid type. Use global, recommended, or ultra.' }, 400);
  if (!name || !url) return json({ error: 'name and url required' }, 400);

  const raw = await env.SYNC_KV.get(key);
  const addons = raw ? JSON.parse(raw) : [];

  if (id) {
    // Update existing
    const idx = addons.findIndex(a => a.id === id);
    if (idx === -1) return json({ error: 'Addon not found' }, 404);
    addons[idx] = { ...addons[idx], name, url, description: description || '', target };
  } else {
    // Add new
    addons.push({ id: genId('addon_', 12), name, url, description: description || '', target, created: Date.now() });
  }

  await env.SYNC_KV.put(key, JSON.stringify(addons));
  return json({ success: true, addons });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!await validateAdminSession(env, request)) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { type, id } = body;
  const key = KV_KEY[type];
  if (!key) return json({ error: 'Invalid type. Use global, recommended, or ultra.' }, 400);
  if (!id) return json({ error: 'id required' }, 400);

  const raw = await env.SYNC_KV.get(key);
  const addons = raw ? JSON.parse(raw) : [];
  const filtered = addons.filter(a => a.id !== id);

  if (filtered.length === addons.length) return json({ error: 'Addon not found' }, 404);

  await env.SYNC_KV.put(key, JSON.stringify(filtered));
  return json({ success: true, addons: filtered });
}
