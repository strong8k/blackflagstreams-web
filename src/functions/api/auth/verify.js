// POST /api/auth/verify
// Verifies email code and creates the account
import { json, preflight, genId, TIER_LIMITS } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { email, code } = body;
  if (!email || !code) return json({ error: 'Email and code required' }, 400);

  const emailNorm = email.toLowerCase().trim();
  const pendingRaw = await env.SYNC_KV.get(`pending:${emailNorm}`);
  if (!pendingRaw) return json({ error: 'Code expired or not found. Please register again.' }, 400);

  const pending = JSON.parse(pendingRaw);
  if (String(pending.code) !== String(code).trim()) {
    return json({ error: 'Invalid verification code.' }, 400);
  }

  const userId = genId('uid_', 12);
  const token = genId('tok_', 24);
  const now = Date.now();

  const user = {
    id: userId,
    email: emailNorm,
    name: pending.name,
    salt: pending.salt,
    passHash: pending.passHash,
    tier: 'account',
    created: now,
    emailVerified: true,
    profiles: [{ id: 'p1', name: pending.name || 'Captain', avatar: '🏴‍☠️', isOwner: true }],
    activeProfile: 'p1',
    devices: [],
    onboarded: false,
  };

  await env.SYNC_KV.put(`user:${userId}`, JSON.stringify(user));
  await env.SYNC_KV.put(`user:${emailNorm}`, userId);
  await env.SYNC_KV.put(`session:${token}`, JSON.stringify({ userId, created: now }), { expirationTtl: 90 * 24 * 3600 });
  await env.SYNC_KV.put(`sync:${userId}`, JSON.stringify({ addons: [], watchlist: [], continueWatching: [], updated: now }));
  await env.SYNC_KV.delete(`pending:${emailNorm}`);

  return json({
    success: true, token,
    user: { id: userId, email: emailNorm, name: user.name, tier: user.tier, profiles: user.profiles, activeProfile: user.activeProfile },
    tierLimits: TIER_LIMITS[user.tier],
  });
}
