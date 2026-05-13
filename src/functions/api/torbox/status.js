// Cloudflare Pages Function: /api/torbox/status
// Check stored TorBox API key status
import { json, validateSession } from '../_shared.js';

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ connected: false }, 401);

  const data = await env.SYNC_KV.get(`torbox:${session.userId}`);
  if (!data) return json({ connected: false });

  const parsed = JSON.parse(data);
  return json({
    connected: true,
    email: parsed.email || null,
    plan: parsed.plan || null,
    expiresAt: parsed.expiresAt || null,
  });
}