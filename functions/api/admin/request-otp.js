// POST /api/admin/request-otp
// Validates admin token, then either:
//   - ADMIN_2FA_ENABLED=false → returns session directly (bypassed)
//   - Otherwise → returns TOTP challenge (use authenticator app)
//   - 2FA_RESET=true → wipes secret, returns session directly for re-setup
import { json, preflight, genId } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!env.ADMIN_TOKEN) return json({ error: 'Admin not configured' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  if (!body.token || body.token !== env.ADMIN_TOKEN) {
    return json({ error: 'Invalid admin token' }, 401);
  }

  // Emergency reset — wipes 2FA secret, grants immediate access for re-setup
  if (env['2FA_RESET'] === 'true') {
    await env.SYNC_KV.delete('admin:2fa_secret');
    const session = genId('admin_', 32);
    await env.SYNC_KV.put(`admin_session:${session}`, JSON.stringify({ created: Date.now(), resetMode: true }), { expirationTtl: 3600 });
    return json({ session, bypassed: true, reason: '2FA_RESET' });
  }

  // 2FA disabled via env var — grant session directly
  if (env.ADMIN_2FA_ENABLED === 'false') {
    const session = genId('admin_', 32);
    await env.SYNC_KV.put(`admin_session:${session}`, JSON.stringify({ created: Date.now() }), { expirationTtl: 8 * 3600 });
    return json({ session, bypassed: true, reason: 'ADMIN_2FA_DISABLED' });
  }

  // 2FA required — check if secret is configured
  const secret = await env.SYNC_KV.get('admin:2fa_secret');
  if (!secret) {
    // No secret yet — grant session so admin can set up 2FA
    const session = genId('admin_', 32);
    await env.SYNC_KV.put(`admin_session:${session}`, JSON.stringify({ created: Date.now(), setup: true }), { expirationTtl: 3600 });
    return json({ session, bypassed: true, reason: '2FA_NOT_CONFIGURED' });
  }

  // Secret exists — tell frontend to prompt for TOTP code
  return json({ totp: true });
}
