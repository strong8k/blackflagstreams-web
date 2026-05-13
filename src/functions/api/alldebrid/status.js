// Cloudflare Pages Function: /api/alldebrid/status
// Check stored All-Debrid authentication status
import { json, validateSession } from '../_shared.js';

const AD_API = 'https://api.alldebrid.com';

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

  const adData = await env.SYNC_KV.get(`alldebrid:${session.userId}`);
  if (!adData) return json({ connected: false });

  const data = JSON.parse(adData);

  // Verify the key still works
  try {
    const res = await fetch(`${AD_API}/user?apikey=${data.apiKey}`);
    if (!res.ok) {
      await env.SYNC_KV.delete(`alldebrid:${session.userId}`);
      return json({ connected: false });
    }
    const userData = await res.json();
    return json({
      connected: true,
      username: userData.user?.username || data.username || null,
      premium: userData.user?.isPremium || false,
      expiresAt: userData.user?.premiumUntil || data.expiresAt || null,
    });
  } catch {
    return json({
      connected: true,
      username: data.username || null,
      premium: data.premium || false,
      expiresAt: data.expiresAt || null,
    });
  }
}