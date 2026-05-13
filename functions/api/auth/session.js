// GET /api/auth/session — validate token, return user + assigned addons
import { json, preflight, validateSession, TIER_LIMITS } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Invalid or expired session' }, 401);

  const userData = await env.SYNC_KV.get(`user:${session.userId}`);
  if (!userData) return json({ error: 'User not found' }, 404);

  const user = JSON.parse(userData);
  if (user.banned) return json({ error: 'Account suspended' }, 403);

  // Load addon catalogs and filter by user tier
  let assignedAddons = [];
  let recommendedAddons = [];
  let ultraAddons = [];
  try {
    const [gRaw, rRaw, uRaw] = await Promise.all([
      env.SYNC_KV.get('admin:global_addons'),
      env.SYNC_KV.get('admin:recommended_addons'),
      env.SYNC_KV.get('admin:ultra_addons'),
    ]);

    const isUltra = user.isUltra || user.tier === 'ultra';

    if (gRaw) {
      const all = JSON.parse(gRaw);
      assignedAddons = all
        .filter(a => {
          if (a.target === 'all') return true;
          if (a.target === 'beta' && user.isBeta) return true;
          if (a.target === 'ultra' && isUltra) return true;
          return false;
        })
        .map(a => ({
          transportUrl: a.url,
          name: a.name,
          flags: { protected: true, forced: true },
          category: 'admin',
          enabled: true,
        }));
    }

    if (rRaw) {
      const all = JSON.parse(rRaw);
      recommendedAddons = all
        .filter(a => a.target === 'all' || (a.target === 'beta' && user.isBeta))
        .map(a => ({ name: a.name, description: a.description, transportUrl: a.url, icon: a.icon }));
    }

    if (uRaw) {
      ultraAddons = JSON.parse(uRaw).map(a => ({ name: a.name, description: a.description, transportUrl: a.url, icon: a.icon }));
    }
  } catch (e) {
    console.error('[BFS:Session] Addon load error:', e.message);
  }

  const tier = user.isUltra ? 'ultra' : user.tier;

  return json({
    user: { id: user.id, email: user.email, name: user.name, tier, isBeta: !!user.isBeta, isUltra: !!user.isUltra, profiles: user.profiles, activeProfile: user.activeProfile },
    tierLimits: TIER_LIMITS[tier],
    assignedAddons,
    recommendedAddons,
    ultraAddons,
  });
}
