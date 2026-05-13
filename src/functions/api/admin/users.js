// GET /api/admin/users?q=<search>
import { json, preflight, validateAdminSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!await validateAdminSession(env, request)) return json({ error: 'Unauthorized' }, 401);

  const q = new URL(request.url).searchParams.get('q') || '';

  try {
    const listed = await env.SYNC_KV.list({ prefix: 'user:uid_', limit: 500 });
    const userDatas = await Promise.all(
      listed.keys.map(k => env.SYNC_KV.get(k.name))
    );

    let users = userDatas
      .filter(Boolean)
      .map(raw => {
        try { return JSON.parse(raw); } catch { return null; }
      })
      .filter(Boolean);

    if (q) {
      const lq = q.toLowerCase();
      users = users.filter(u =>
        u.email?.includes(lq) ||
        u.name?.toLowerCase().includes(lq) ||
        u.id?.includes(lq)
      );
    }

    return json({
      users: users.map(u => ({
        id: u.id, email: u.email, name: u.name,
        tier: u.isUltra ? 'ultra' : u.tier,
        isBeta: !!u.isBeta, isUltra: !!u.isUltra, banned: !!u.banned,
        created: u.created,
      })),
    });
  } catch (e) {
    return json({ users: [] });
  }
}

// POST /api/admin/users — update user (tier, ban, etc.)
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!await validateAdminSession(env, request)) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { userId, tier, isBeta, isUltra, banned } = body;
  if (!userId) return json({ error: 'userId required' }, 400);

  const raw = await env.SYNC_KV.get(`user:${userId}`);
  if (!raw) return json({ error: 'User not found' }, 404);

  const user = JSON.parse(raw);
  if (tier) user.tier = tier;
  if (isBeta !== undefined) user.isBeta = isBeta;
  if (isUltra !== undefined) user.isUltra = isUltra;
  if (banned !== undefined) user.banned = banned;

  await env.SYNC_KV.put(`user:${userId}`, JSON.stringify(user));
  return json({ success: true });
}
