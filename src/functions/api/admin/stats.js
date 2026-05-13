// GET /api/admin/stats
import { json, preflight, validateAdminSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!await validateAdminSession(env, request)) return json({ error: 'Unauthorized' }, 401);

  try {
    const listed = await env.SYNC_KV.list({ prefix: 'user:uid_', limit: 1000 });
    const activeUsers = listed.keys.length;
    return json({
      activeUsers,
      devices: '—',
      streamsToday: '—',
      uptime: 99,
      healthMessage: `Fleet operational. ${activeUsers} sailors aboard.`,
    });
  } catch (e) {
    return json({ activeUsers: '—', uptime: 0, healthMessage: 'Error fetching stats.' });
  }
}
