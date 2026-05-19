// POST /api/trakt/sync — Pull watched history from Trakt, resolve to TMDB IDs
import { json, preflight, validateSession } from '../_shared.js';

const TRAKT_API = 'https://api.trakt.tv';

async function getTraktToken(env, userId) {
  const raw = await env.SYNC_KV.get(`trakt_token:${userId}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

async function traktFetch(env, accessToken, path) {
  const res = await fetch(`${TRAKT_API}${path}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': env.TRAKT_CLIENT_ID,
    },
  });
  if (!res.ok) {
    console.error(`[Trakt] ${path} → ${res.status}`);
    return null;
  }
  return res.json();
}

/**
 * Convert Trakt item to BFS continueWatching format.
 * Trakt items may have `movie.ids` or `show.ids` + episode info.
 */
function traktToBFS(item, type) {
  if (type === 'movie') {
    return {
      id: item.movie?.ids?.tmdb || null,
      imdbId: item.movie?.ids?.imdb || null,
      type: 'movie',
      title: item.movie?.title || 'Unknown',
      progress: Math.floor((item.plays || 1) * 3600), // rough
      duration: 7200,
      percent: 100,
      timestamp: new Date(item.last_watched_at || item.watched_at).getTime(),
    };
  }

  // TV show
  return {
    id: item.show?.ids?.tmdb || null,
    imdbId: item.show?.ids?.imdb || null,
    type: 'tv',
    title: item.show?.title || 'Unknown',
    season: item.seasons?.[0]?.number || null,
    episode: item.seasons?.[0]?.episodes?.[0]?.number || null,
    progress: 0,
    duration: 0,
    percent: 100,
    timestamp: new Date(item.last_watched_at || item.watched_at).getTime(),
  };
}

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const tokens = await getTraktToken(env, session.userId);
  if (!tokens) return json({ error: 'Trakt not connected' }, 400);

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

  // Pull watched movies and shows
  const [movies, shows] = await Promise.all([
    traktFetch(env, tokens.access_token, '/sync/watched/movies'),
    traktFetch(env, tokens.access_token, '/sync/watched/shows'),
  ]);

  if (!movies && !shows) {
    return json({ error: 'Failed to fetch Trakt data' }, 502);
  }

  const items = [];
  (movies || []).forEach(m => items.push(traktToBFS(m, 'movie')));
  (shows || []).forEach(s => items.push(traktToBFS(s, 'tv')));

  // Filter out items without TMDB IDs
  const validItems = items.filter(item => item.id);

  // Update lastSync on tokens
  tokens.lastSync = Date.now();
  await env.SYNC_KV.put(`trakt_token:${session.userId}`, JSON.stringify(tokens));

  return json({
    success: true,
    count: validItems.length,
    total: items.length,
    unresolved: items.length - validItems.length,
    items: validItems,
  });
}
