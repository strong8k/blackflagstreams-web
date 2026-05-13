// GET /api/admin/config  — read system config from env + KV
// POST /api/admin/config — update KV-backed config values
import { json, preflight, validateAdminSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!await validateAdminSession(env, request)) return json({ error: 'Unauthorized' }, 401);

  try {
    const [noticeRaw, gRaw, rRaw, uRaw] = await Promise.all([
      env.SYNC_KV.get('admin:notice'),
      env.SYNC_KV.get('admin:global_addons'),
      env.SYNC_KV.get('admin:recommended_addons'),
      env.SYNC_KV.get('admin:ultra_addons'),
    ]);

    return json({
      tmdbKey: env.TMDB_API_KEY || '',
      corsProxy: env.CORS_PROXY || '',
      notice: noticeRaw || env.SYSTEM_NOTICE || '',
      globalAddonCount: gRaw ? JSON.parse(gRaw).length : 0,
      recommendedAddonCount: rRaw ? JSON.parse(rRaw).length : 0,
      ultraAddonCount: uRaw ? JSON.parse(uRaw).length : 0,
    });
  } catch (e) {
    return json({ error: 'Failed to read config' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!await validateAdminSession(env, request)) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const updates = [];

  if (typeof body.notice === 'string') {
    if (body.notice.trim()) {
      await env.SYNC_KV.put('admin:notice', body.notice.trim());
    } else {
      await env.SYNC_KV.delete('admin:notice');
    }
    updates.push('notice');
  }

  return json({ success: true, updated: updates });
}
