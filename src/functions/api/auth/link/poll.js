// Cloudflare Pages Function: /api/auth/link/poll
// Step 2: TV/mobile app polls this endpoint waiting for user to approve on another device
import { json } from '../_shared.js';

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return json({ error: 'Link code required' }, 400);

  const linkRaw = await env.SYNC_KV.get(`link:${code}`);
  if (!linkRaw) return json({ error: 'Invalid link code', done: false }, 404);

  const link = JSON.parse(linkRaw);

  if (Date.now() > link.expiresAt) {
    await env.SYNC_KV.delete(`link:${code}`);
    return json({ error: 'Link code expired', done: false, expired: true }, 410);
  }

  if (!link.approved) {
    return json({ done: false, waiting: true });
  }

  // Approved — create a session token for the linking device
  const token = genId('tok_', 24);
  await env.SYNC_KV.put(`session:${token}`, JSON.stringify({
    userId: link.userId,
    created: Date.now(),
    linked: true,
  }), { expirationTtl: 90 * 24 * 3600 });

  // Get user data
  const userRaw = await env.SYNC_KV.get(`user:${link.userId}`);
  const user = userRaw ? JSON.parse(userRaw) : null;

  // Clean up the link code (single use)
  await env.SYNC_KV.delete(`link:${code}`);

  return json({
    done: true,
    token,
    user: user ? {
      id: user.id,
      email: user.email,
      name: user.name,
      tier: user.tier,
      profiles: user.profiles,
      activeProfile: user.activeProfile,
    } : null,
  });
}