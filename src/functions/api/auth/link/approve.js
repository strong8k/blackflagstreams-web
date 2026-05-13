// Cloudflare Pages Function: /api/auth/link/approve
// Step 2 (alternative): Approve a link code from a second authenticated device
import { json, validateSession } from '../_shared.js';

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  // The approving user must also be authenticated
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Not authenticated' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { code } = body;
  if (!code) return json({ error: 'Link code required' }, 400);

  const linkRaw = await env.SYNC_KV.get(`link:${code}`);
  if (!linkRaw) return json({ error: 'Invalid link code' }, 404);

  const link = JSON.parse(linkRaw);

  if (link.approved) return json({ error: 'Link code already used' }, 400);
  if (Date.now() > link.expiresAt) {
    await env.SYNC_KV.delete(`link:${code}`);
    return json({ error: 'Link code expired' }, 410);
  }

  // Mark as approved
  link.approved = true;
  link.approvedBy = session.userId;
  link.approvedAt = Date.now();
  await env.SYNC_KV.put(`link:${code}`, JSON.stringify(link), { expirationTtl: 60 });

  return json({
    success: true,
    message: 'Link code approved. The other device will receive a session token.',
  });
}