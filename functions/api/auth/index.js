// GET/POST /api/auth?action=... — TV app action-based routing
// TV calls these endpoints (ApiClient.kt uses action= params, not sub-paths)
import { json, preflight, validateSession, genId, TIER_LIMITS } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

// POST /api/auth?action=qr-create — TV requests a pairing code (no auth needed)
export async function onRequestPost(context) {
  const { request, env } = context;
  const action = new URL(request.url).searchParams.get('action');

  if (action === 'qr-create') {
    if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
    const code = String(100000 + Math.floor(Math.random() * 900000));
    await env.SYNC_KV.put(
      `link_pending:${code}`,
      JSON.stringify({ status: 'pending', created: Date.now() }),
      { expirationTtl: 600 },
    );
    return json({ code, expiresIn: 600 });
  }

  return json({ error: 'Unknown action' }, 400);
}

// GET /api/auth?action=qr-check&code=XXX — TV polls until approved
// GET /api/auth?action=session — TV fetches user session after login
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // ── QR poll ──────────────────────────────────────────────────────────────────
  if (action === 'qr-check') {
    if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
    const code = url.searchParams.get('code');
    if (!code) return json({ error: 'Missing code' }, 400);

    const raw = await env.SYNC_KV.get(`link_pending:${code}`);
    if (!raw) return json({ status: 'expired' });

    const data = JSON.parse(raw);
    if (data.status === 'approved') {
      await env.SYNC_KV.delete(`link_pending:${code}`);
      return json({ status: 'approved', token: data.token, onboardingRequired: false });
    }

    return json({ status: 'pending' });
  }

  // ── Session ───────────────────────────────────────────────────────────────────
  if (action === 'session') {
    if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

    const session = await validateSession(env, request.headers.get('Authorization'));
    if (!session) return json({ error: 'Invalid or expired session' }, 401);

    const userData = await env.SYNC_KV.get(`user:${session.userId}`);
    if (!userData) return json({ error: 'User not found' }, 404);

    const user = JSON.parse(userData);
    if (user.banned) return json({ error: 'Account suspended' }, 403);

    let assignedAddons = [];
    try {
      const gRaw = await env.SYNC_KV.get('admin:global_addons');
      if (gRaw) {
        const isUltra = user.isUltra || user.tier === 'ultra';
        assignedAddons = JSON.parse(gRaw)
          .filter(a => a.target === 'all' || (a.target === 'beta' && user.isBeta) || (a.target === 'ultra' && isUltra))
          .map(a => ({ transportUrl: a.url, name: a.name, flags: { protected: true, forced: true }, category: 'admin', enabled: true }));
      }
    } catch {}

    const tier = user.isUltra ? 'ultra' : user.tier;
    return json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, tier, isBeta: !!user.isBeta, isUltra: !!user.isUltra, profiles: user.profiles || [], activeProfile: user.activeProfile || null },
      tierLimits: TIER_LIMITS[tier],
      assignedAddons,
    });
  }

  return json({ error: 'Unknown action' }, 400);
}
