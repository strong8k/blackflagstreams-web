// Cloudflare Pages Function: /api/trakt/status
// Check if a user has an active Trakt OAuth token stored in KV
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

  const traktData = await env.SYNC_KV.get(`trakt:${session.userId}`);

  if (!traktData) {
    return json({ connected: false, username: null, lastSync: null });
  }

  const data = JSON.parse(traktData);

  // Check if token is expired and attempt refresh
  if (data.expiresAt && Date.now() > data.expiresAt) {
    const refreshed = await refreshTraktToken(env, data.refreshToken);
    if (refreshed) {
      return json({
        connected: true,
        username: refreshed.username || data.username || null,
        lastSync: data.lastSync || null,
      });
    } else {
      // Refresh failed — disconnect
      await env.SYNC_KV.delete(`trakt:${session.userId}`);
      return json({ connected: false, username: null, lastSync: null });
    }
  }

  return json({
    connected: true,
    username: data.username || null,
    lastSync: data.lastSync || null,
  });
}

async function refreshTraktToken(env, refreshToken) {
  if (!refreshToken) return null;
  try {
    const res = await fetch('https://api.trakt.tv/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: env.TRAKT_CLIENT_ID,
        client_secret: env.TRAKT_CLIENT_SECRET,
        redirect_uri: env.TRAKT_REDIRECT_URI,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();

    return { accessToken: data.access_token, refreshToken: data.refresh_token, username: data.username };
  } catch {
    return null;
  }
}