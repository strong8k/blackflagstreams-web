// Cloudflare Pages Function: /api/alldebrid/auth
// Get All-Debrid PIN for device pairing (PIN flow)
import { json, validateSession } from '../_shared.js';

const AD_API = 'https://api.alldebrid.com';

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

  if (!env.ALLDEBRID_API_KEY) {
    return json({ error: 'All-Debrid API key not configured' }, 503);
  }

  try {
    // Step 1: Get device PIN
    const pinRes = await fetch(`${AD_API}/pin/get?apikey=${env.ALLDEBRID_API_KEY}`);
    const pinData = await pinRes.json();

    if (!pinRes.ok || !pinData.pin) {
      return json({ error: 'Failed to get All-Debrid PIN' }, 502);
    }

    const { pin, check_url, expire_in, user_url } = pinData;

    // Store pending PIN in KV with expiration
    await env.SYNC_KV.put(`alldebrid-pending:${session.userId}`, JSON.stringify({
      pin,
      checkUrl: check_url,
      userUrl: user_url,
      createdAt: Date.now(),
      expiresAt: Date.now() + (expire_in * 1000),
    }), { expirationTtl: expire_in });

    return json({
      success: true,
      pin,
      user_url: user_url || check_url,
      expiresIn: expire_in,
    });
  } catch (e) {
    return json({ error: `All-Debrid auth failed: ${e.message}` }, 502);
  }
}