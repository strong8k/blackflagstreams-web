// Cloudflare Pages Function: /api/realdebrid/status
// Check stored Real-Debrid API key status
import { json, validateSession } from '../_shared.js';

const RD_API = 'https://api.real-debrid.com/rest/1.0';

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

  const rdData = await env.SYNC_KV.get(`realdebrid:${session.userId}`);
  if (!rdData) return json({ connected: false });

  const data = JSON.parse(rdData);

  // Verify the key still works
  try {
    const res = await fetch(`${RD_API}/user`, {
      headers: { 'Authorization': `Bearer ${data.apiKey}` },
    });
    if (!res.ok) {
      await env.SYNC_KV.delete(`realdebrid:${session.userId}`);
      return json({ connected: false });
    }
    const userData = await res.json();
    return json({
      connected: true,
      username: userData.username || data.username || null,
      premium: userData.premium === 1,
      expiresAt: userData.premium_expire || data.expiresAt || null,
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