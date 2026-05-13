// POST /api/auth/link/claim — logged-in web user approves a pending TV link code
// Body: { code }   Authorization: Bearer <token>
import { json, preflight, validateSession, genId, TIER_LIMITS } from '../../_shared.js';

const DEVICE_LIMITS = { free: 1, account: 2, premium: 4, pro: 6, ultra: 10 };

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { code } = body;
  if (!code) return json({ error: 'Missing code' }, 400);

  const pendingRaw = await env.SYNC_KV.get(`link_pending:${code}`);
  if (!pendingRaw) return json({ error: 'Code expired or invalid' }, 404);

  const pending = JSON.parse(pendingRaw);
  if (pending.status !== 'pending') return json({ error: 'Code already used' }, 400);

  const userRaw = await env.SYNC_KV.get(`user:${session.userId}`);
  if (!userRaw) return json({ error: 'Account not found' }, 404);
  const user = JSON.parse(userRaw);
  if (user.banned) return json({ error: 'Account banned' }, 403);

  // Device limit check
  const devices = user.devices || [];
  const maxDevices = DEVICE_LIMITS[user.tier] || 1;
  if (devices.length >= maxDevices) {
    return json({ error: `Device limit reached (${maxDevices}). Manage devices in Settings.` }, 403);
  }

  // Create a new session token for the TV
  const newToken = genId('tok_', 24);
  await env.SYNC_KV.put(
    `session:${newToken}`,
    JSON.stringify({ userId: user.id, created: Date.now(), linkedDevice: true }),
    { expirationTtl: 90 * 24 * 3600 },
  );

  // Register device
  const ua = request.headers.get('User-Agent') || 'Android TV';
  devices.push({
    id: genId('dev_', 10),
    name: `TV Device ${devices.length + 1}`,
    userAgent: ua.slice(0, 120),
    created: Date.now(),
    lastSeen: Date.now(),
  });
  user.devices = devices;
  await env.SYNC_KV.put(`user:${user.id}`, JSON.stringify(user));

  // Mark pending link as approved — TV will read this on next poll
  await env.SYNC_KV.put(
    `link_pending:${code}`,
    JSON.stringify({
      status: 'approved',
      token: newToken,
      user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
    }),
    { expirationTtl: 120 }, // TV has 2 min to pick it up
  );

  return json({ success: true });
}
