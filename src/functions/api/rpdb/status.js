// Cloudflare Pages Function: /api/rpdb/status
// Check stored RPDB API key status
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

  const data = await env.SYNC_KV.get(`rpdb:${session.userId}`);
  if (!data) return json({ connected: false });

  return json({
    connected: true,
    tier: JSON.parse(data).tier || 'pro',
  });
}