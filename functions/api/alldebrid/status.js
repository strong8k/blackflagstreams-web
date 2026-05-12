// GET /api/alldebrid/status — Check All-Debrid connection and account info
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const raw = await env.SYNC_KV.get(`service:alldebrid:${session.userId}`);
  if (!raw) return json({ connected: false });

  const stored = JSON.parse(raw);
  if (!stored.apikey) return json({ connected: false });

  try {
    const res = await fetch(`https://api.alldebrid.com/v4/user?agent=BlackFlagStreams`, {
      headers: { 'Authorization': `Bearer ${stored.apikey}` },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        await env.SYNC_KV.delete(`service:alldebrid:${session.userId}`);
        return json({ connected: false });
      }
      return json({ connected: true, username: 'All-Debrid User' });
    }

    const data = await res.json();
    const user = data.data?.user || data.data || {};

    return json({
      connected: true,
      username: user.username || user.email || null,
      premium: user.isPremium || user.premium || false,
      expiresAt: user.premiumUntil ? new Date(user.premiumUntil * 1000).toISOString() : null,
    });
  } catch {
    return json({ connected: true, username: 'All-Debrid User' });
  }
}
