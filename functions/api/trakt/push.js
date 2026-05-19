// POST /api/trakt/push — Push BFS watch progress to Trakt sync history
import { json, preflight, validateSession } from '../_shared.js';

const TRAKT_API = 'https://api.trakt.tv';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const tokenRaw = await env.SYNC_KV.get(`trakt_token:${session.userId}`);
  if (!tokenRaw) return json({ error: 'Trakt not connected' }, 400);

  let tokens = JSON.parse(tokenRaw);

  // Check/refresh token
  if (Date.now() > tokens.expires_at) {
    try {
      const refreshRes = await fetch('https://api.trakt.tv/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: tokens.refresh_token,
          client_id: env.TRAKT_CLIENT_ID,
          client_secret: env.TRAKT_CLIENT_SECRET,
          redirect_uri: env.TRAKT_REDIRECT_URI || `${new URL(request.url).origin}/api/trakt/callback`,
          grant_type: 'refresh_token',
        }),
      });
      if (!refreshRes.ok) {
        await env.SYNC_KV.delete(`trakt_token:${session.userId}`);
        return json({ error: 'Trakt session expired. Please reconnect.' }, 401);
      }
      const nt = await refreshRes.json();
      tokens.access_token = nt.access_token;
      tokens.refresh_token = nt.refresh_token || tokens.refresh_token;
      tokens.expires_at = Date.now() + (nt.expires_in || 7776000) * 1000;
      await env.SYNC_KV.put(`trakt_token:${session.userId}`, JSON.stringify(tokens));
    } catch (e) {
      return json({ error: 'Token refresh failed' }, 502);
    }
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { items } = body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return json({ error: 'No items to sync' }, 400);
  }

  // Convert BFS format to Trakt scrobble format
  const traktItems = items.map(item => {
    const obj = {
      watched_at: new Date(item.timestamp || Date.now()).toISOString(),
    };
    if (item.type === 'movie') {
      obj.movie = { title: item.title, year: item.year };
      if (item.tmdbId) obj.movie.ids = { tmdb: item.tmdbId };
      if (item.imdbId) obj.movie.ids = { ...obj.movie.ids, imdb: item.imdbId };
    } else {
      obj.episode = {
        season: item.season || 1,
        number: item.episode || 1,
      };
      obj.show = { title: item.title };
      if (item.tmdbId) obj.show.ids = { tmdb: item.tmdbId };
      if (item.imdbId) obj.show.ids = { ...obj.show.ids, imdb: item.imdbId };
    }
    return obj;
  });

  try {
    const res = await fetch(`${TRAKT_API}/sync/history`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': env.TRAKT_CLIENT_ID,
      },
      body: JSON.stringify({ movies: traktItems.filter(i => i.movie), episodes: traktItems.filter(i => i.episode) }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Trakt] Push failed:', res.status, errText);
      return json({ error: `Trakt push failed (${res.status})` }, 502);
    }

    const result = await res.json();
    return json({
      success: true,
      added: { movies: result.added?.movies || 0, episodes: result.added?.episodes || 0 },
    });
  } catch (e) {
    console.error('[Trakt] Push error:', e.message);
    return json({ error: 'Trakt push failed' }, 502);
  }
}
