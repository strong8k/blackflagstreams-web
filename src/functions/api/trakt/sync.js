// Cloudflare Pages Function: /api/trakt/sync
// Pull watch history and watchlist from Trakt, merge into user's sync data
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
  if (!traktData) {
    return json({ error: 'Trakt not connected. Connect Trakt first.' }, 400);
  }

  const data = JSON.parse(traktData);
  if (!data.accessToken) {
    return json({ error: 'Trakt token missing. Reconnect Trakt.' }, 400);
  }

  const TMDB_KEY = env.TMDB_API_KEY;
  if (!TMDB_KEY) {
    return json({ error: 'TMDB API key not configured' }, 503);
  }

  try {
    // Fetch watch history and watchlist from Trakt
    const [historyRes, watchlistRes] = await Promise.all([
      fetch('https://api.trakt.tv/users/me/history/movies?limit=1000', {
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': env.TRAKT_CLIENT_ID,
          'Authorization': `Bearer ${data.accessToken}`,
        },
      }),
      fetch('https://api.trakt.tv/users/me/watchlist/movies?limit=1000', {
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': env.TRAKT_CLIENT_ID,
          'Authorization': `Bearer ${data.accessToken}`,
        },
      }),
    ]);

    const history = historyRes.ok ? await historyRes.json() : [];
    const watchlist = watchlistRes.ok ? await watchlistRes.json() : [];

    // Resolve Trakt movie IDs → TMDB IDs
    const resolvedItems = await resolveTraktItems(history, watchlist, TMDB_KEY, env);

    // Merge into user's sync data
    const syncRaw = await env.SYNC_KV.get(`sync:${session.userId}`);
    const syncData = syncRaw ? JSON.parse(syncRaw) : { watchlist: [], continueWatching: [], history: [], addons: [], updated: Date.now() };

    const historyIds = new Set((syncData.history || []).map(i => i.id));
    const watchlistIds = new Set((syncData.watchlist || []).map(i => i.id));

    let added = 0;

    for (const item of resolvedItems.history) {
      if (!historyIds.has(item.tmdbId)) {
        syncData.history.push({
          id: item.tmdbId,
          type: 'movie',
          title: item.title,
          poster_path: item.posterPath,
          progress: 100,
          duration: item.runtime || 0,
          timestamp: Date.now(),
        });
        added++;
      }
    }

    for (const item of resolvedItems.watchlist) {
      if (!watchlistIds.has(item.tmdbId)) {
        syncData.watchlist.push({
          id: item.tmdbId,
          type: 'movie',
          title: item.title,
          poster_path: item.posterPath,
        });
        added++;
      }
    }

    syncData.updated = Date.now();

    // Update last sync timestamp on trakt data
    data.lastSync = Date.now();
    await env.SYNC_KV.put(`trakt:${session.userId}`, JSON.stringify(data));
    await env.SYNC_KV.put(`sync:${session.userId}`, JSON.stringify(syncData));

    return json({
      success: true,
      count: resolvedItems.history.length + resolvedItems.watchlist.length,
      added,
      unresolved: (history.length + watchlist.length) - resolvedItems.history.length - resolvedItems.watchlist.length,
      items: resolvedItems,
    });
  } catch (e) {
    return json({ error: `Sync failed: ${e.message}` }, 500);
  }
}

async function resolveTraktItems(history, watchlist, tmdbKey, env) {
  const historyMovies = (history || []).map(h => ({
    title: h.movie?.title || 'Unknown',
    year: h.movie?.year || null,
    imdbId: h.movie?.ids?.imdb || null,
    tmdbId: h.movie?.ids?.tmdb || null,
    runtime: h.movie?.runtime || 0,
    posterPath: h.movie?.images?.poster?.thumb || null,
    watchedAt: h.watched_at || null,
    type: 'history',
  }));

  const watchlistMovies = (watchlist || []).map(w => ({
    title: w.movie?.title || 'Unknown',
    year: w.movie?.year || null,
    imdbId: w.movie?.ids?.imdb || null,
    tmdbId: w.movie?.ids?.tmdb || null,
    posterPath: w.movie?.images?.poster?.thumb || null,
    type: 'watchlist',
  }));

  // Resolve any items missing TMDB IDs
  const toResolve = [...historyMovies, ...watchlistMovies].filter(i => !i.tmdbId && i.imdbId);
  const resolved = new Map();

  if (toResolve.length > 0) {
    // Batch resolve via TMDB find API
    const BATCH = 10;
    for (let i = 0; i < toResolve.length; i += BATCH) {
      const batch = toResolve.slice(i, i + BATCH);
      const ids = batch.map(i => i.imdbId).join(',');
      try {
        const res = await fetch(`https://api.themoviedb.org/3/find/${ids}?api_key=${tmdbKey}&external_source=imdb_id`);
        if (res.ok) {
          const data = await res.json();
          const movies = data.movie_results || [];
          movies.forEach(m => {
            const match = batch.find(b => b.imdbId.endsWith(m.id.toString()) || b.imdbId === `tt${m.id}`);
            if (match) resolved.set(match.imdbId, m.id);
          });
        }
      } catch { /* batch failed, will keep as unresolved */ }
    }
  }

  const applyIds = (items) => items.map(item => ({
    ...item,
    tmdbId: item.tmdbId || resolved.get(item.imdbId) || null,
  })).filter(item => item.tmdbId !== null);

  return {
    history: applyIds(historyMovies),
    watchlist: applyIds(watchlistMovies),
  };
}