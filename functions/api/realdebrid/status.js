// GET /api/realdebrid/status — Check Real-Debrid connection and account info
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const raw = await env.SYNC_KV.get(`service:realdebrid:${session.userId}`);
  if (!raw) return json({ connected: false });

  const stored = JSON.parse(raw);
  if (!stored.access_token) {
    // Legacy entries stored client_id:secret instead of access_token — wipe and reconnect
    if (!stored.client_id) return json({ connected: false });
    await env.SYNC_KV.delete(`service:realdebrid:${session.userId}`);
    return json({ connected: false });
  }

  try {
    const res = await fetch('https://api.real-debrid.com/rest/1.0/user', {
      headers: { 'Authorization': `Bearer ${stored.access_token}` },
    });

    if (!res.ok) {
      // Only wipe on explicit auth rejection
      if (res.status === 401 || res.status === 403) {
        await env.SYNC_KV.delete(`service:realdebrid:${session.userId}`);
        return json({ connected: false });
      }
      return json({ connected: true, username: 'Real-Debrid User' });
    }

    const user = await res.json();
    return json({
      connected: true,
      username: user.username || null,
      premium: user.premium > 0 || !!user.premium,
      expiresAt: user.expiration ? new Date(user.expiration).toISOString() : null,
    });
  } catch {
    return json({ connected: true, username: 'Real-Debrid User' });
  }
}
