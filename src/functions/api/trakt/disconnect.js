// Cloudflare Pages Function: /api/trakt/disconnect
// Revoke and remove stored Trakt OAuth tokens
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

  const traktData = await env.SYNC_KV.get(`trakt:${session.userId}`);

  if (traktData) {
    const data = JSON.parse(traktData);

    // Attempt to revoke the token on Trakt's side
    if (data.accessToken) {
      try {
        await fetch('https://api.trakt.tv/oauth/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.accessToken}`,
          },
          body: JSON.stringify({
            token: data.accessToken,
            client_id: env.TRAKT_CLIENT_ID,
            client_secret: env.TRAKT_CLIENT_SECRET,
          }),
        });
      } catch {
        // Revocation failed — still delete locally
      }
    }

    await env.SYNC_KV.delete(`trakt:${session.userId}`);
  }

  return json({ success: true, disconnected: true });
}