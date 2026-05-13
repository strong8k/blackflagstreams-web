// POST /api/admin/danger — destructive admin actions
// Body: { action: 'nuke-users' | 'nuke-sessions' | 'nuke-addons' | 'ghost-bust' | 'nuke-all' }
import { json, preflight, validateAdminSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!await validateAdminSession(env, request)) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { action } = body;
  if (!action) return json({ error: 'action required' }, 400);

  async function deleteByPrefix(prefix, limit = 1000) {
    const listed = await env.SYNC_KV.list({ prefix, limit });
    await Promise.all(listed.keys.map(k => env.SYNC_KV.delete(k.name)));
    return listed.keys.length;
  }

  let deleted = 0;

  try {
    switch (action) {
      case 'nuke-users':
        deleted += await deleteByPrefix('user:uid_');
        deleted += await deleteByPrefix('user:email:');
        deleted += await deleteByPrefix('pending:');
        break;

      case 'nuke-sessions':
        deleted += await deleteByPrefix('session:');
        deleted += await deleteByPrefix('admin_session:');
        break;

      case 'nuke-addons':
        await Promise.all([
          env.SYNC_KV.delete('admin:global_addons'),
          env.SYNC_KV.delete('admin:recommended_addons'),
          env.SYNC_KV.delete('admin:ultra_addons'),
        ]);
        deleted = 3;
        break;

      case 'ghost-bust':
        // Delete sessions with no matching user (orphaned sessions)
        const sessions = await env.SYNC_KV.list({ prefix: 'session:', limit: 500 });
        for (const k of sessions.keys) {
          const sessionRaw = await env.SYNC_KV.get(k.name);
          if (!sessionRaw) continue;
          const { userId } = JSON.parse(sessionRaw);
          if (userId) {
            const userRaw = await env.SYNC_KV.get(`user:${userId}`);
            if (!userRaw) { await env.SYNC_KV.delete(k.name); deleted++; }
          } else {
            await env.SYNC_KV.delete(k.name); deleted++;
          }
        }
        break;

      case 'nuke-all':
        deleted += await deleteByPrefix('user:uid_');
        deleted += await deleteByPrefix('user:email:');
        deleted += await deleteByPrefix('pending:');
        deleted += await deleteByPrefix('session:');
        deleted += await deleteByPrefix('sync:');
        break;

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }

    return json({ success: true, action, deleted });
  } catch (e) {
    return json({ error: `Action failed: ${e.message}` }, 500);
  }
}
