// POST /api/auth/login
import { json, preflight, hashPassword, TIER_LIMITS, genId } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { email, password } = body;
  if (!email || !password) return json({ error: 'Email and password required' }, 400);

  const emailNorm = email.toLowerCase().trim();
  const userId = await env.SYNC_KV.get(`user:${emailNorm}`);
  if (!userId) return json({ error: 'Account not found' }, 404);

  const userData = await env.SYNC_KV.get(`user:${userId}`);
  if (!userData) return json({ error: 'Account data missing' }, 500);

  const user = JSON.parse(userData);
  if (user.banned) return json({ error: 'Your account has walked the plank.' }, 403);

  const passHash = await hashPassword(password, user.salt);
  if (passHash !== user.passHash) return json({ error: 'Invalid password' }, 401);

  const token = genId('tok_', 24);
  await env.SYNC_KV.put(`session:${token}`, JSON.stringify({ userId, created: Date.now() }), { expirationTtl: 90 * 24 * 3600 });

  return json({
    success: true, token,
    user: { id: user.id, email: user.email, name: user.name, tier: user.tier, profiles: user.profiles, activeProfile: user.activeProfile },
    tierLimits: TIER_LIMITS[user.tier],
  });
}
