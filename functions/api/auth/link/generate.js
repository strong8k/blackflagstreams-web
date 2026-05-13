// POST /api/auth/link/generate
// Generates a short-lived device linking code
import { json, preflight, genId, validateSession } from '../../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Authentication required' }, 401);

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
  const linkData = { userId: session.userId, created: Date.now() };

  await env.SYNC_KV.put(`link:${code}`, JSON.stringify(linkData), { expirationTtl: 300 }); // 5 min TTL

  return json({ success: true, code, expiresIn: 300 });
}
