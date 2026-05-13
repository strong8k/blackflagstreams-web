// Cloudflare Pages Function: /api/torbox/disconnect
// Remove stored TorBox API key from KV
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

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Not authenticated' }, 401);

  await env.SYNC_KV.delete(`torbox:${session.userId}`);

  return json({ success: true, disconnected: true });
}