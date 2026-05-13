// POST /api/auth/login
import { json, preflight, hashPassword, TIER_LIMITS, genId } from '../_shared.js';

const DEVICE_LIMITS = { free: 1, account: 2, premium: 4, pro: 6, ultra: 10 };

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

  // Device tracking
  const devices = user.devices || [];
  const ua = (request.headers.get('User-Agent') || 'Unknown').slice(0, 120);
  const existing = devices.find(d => d.userAgent === ua);
  if (existing) {
    existing.lastSeen = Date.now();
  } else {
    const maxDevices = DEVICE_LIMITS[user.tier] || 1;
    if (devices.length >= maxDevices) {
      return json({ error: `Device limit reached (${maxDevices}). Upgrade to add more devices. Manage linked devices in Settings.` }, 403);
    }
    devices.push({ id: genId('dev_', 10), name: `Device ${devices.length + 1}`, userAgent: ua, created: Date.now(), lastSeen: Date.now() });
  }
  user.devices = devices;
  await env.SYNC_KV.put(`user:${user.id}`, JSON.stringify(user));

  const token = genId('tok_', 24);
  await env.SYNC_KV.put(`session:${token}`, JSON.stringify({ userId, created: Date.now() }), { expirationTtl: 90 * 24 * 3600 });

  return json({
    success: true, token,
    user: { id: user.id, email: user.email, name: user.name, tier: user.tier, profiles: user.profiles, activeProfile: user.activeProfile, devices: user.devices },
    tierLimits: TIER_LIMITS[user.tier],
  });
}
