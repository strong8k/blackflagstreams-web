// Cloudflare Pages Function: /api/auth/link/generate
// Step 1: Generate a device linking code
import { json, genId, validateSession } from '../_shared.js';

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

  // Verify the caller is authenticated
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Not authenticated' }, 401);

  const code = genId('', 6).toUpperCase(); // 6-char alphanumeric code
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  await env.SYNC_KV.put(`link:${code}`, JSON.stringify({
    userId: session.userId,
    created: Date.now(),
    expiresAt,
    approved: false,
  }), { expirationTtl: 660 });

  return json({
    success: true,
    code,
    expiresIn: 660,
  });
}