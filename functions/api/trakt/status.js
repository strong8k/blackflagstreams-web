// GET /api/trakt/status — Check Trakt connection status
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const tokenRaw = await env.SYNC_KV.get(`trakt_token:${session.userId}`);
  if (!tokenRaw) return json({ connected: false });

  const tokens = JSON.parse(tokenRaw);

  // Check if token is expired and try refresh
  if (Date.now() > tokens.expires_at) {
    try {
      const clientId = env.TRAKT_CLIENT_ID;
      const clientSecret = env.TRAKT_CLIENT_SECRET;
      const redirectUri = env.TRAKT_REDIRECT_URI || 'https://www.blackflagstreams.link/api/trakt/callback';

      const refreshRes = await fetch('https://api.trakt.tv/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: tokens.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'refresh_token',
        }),
      });

      if (!refreshRes.ok) {
        // Refresh failed — tokens are dead
        await env.SYNC_KV.delete(`trakt_token:${session.userId}`);
        return json({ connected: false });
      }

      const newTokens = await refreshRes.json();
      tokens.access_token = newTokens.access_token;
      tokens.refresh_token = newTokens.refresh_token || tokens.refresh_token;
      tokens.expires_at = Date.now() + (newTokens.expires_in || 7776000) * 1000;

      await env.SYNC_KV.put(`trakt_token:${session.userId}`, JSON.stringify(tokens));
    } catch {
      return json({ connected: true, username: null, lastSync: tokens.lastSync || null, error: 'refresh_failed' });
    }
  }

  // Fetch Trakt user settings to get username
  let username = null;
  try {
    const settingsRes = await fetch('https://api.trakt.tv/users/settings', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': env.TRAKT_CLIENT_ID,
      },
    });
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      username = settings.user?.username || null;
    }
  } catch { /* silent */ }

  return json({
    connected: true,
    username,
    lastSync: tokens.lastSync || null,
  });
}
