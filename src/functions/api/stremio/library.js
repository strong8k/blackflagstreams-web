// Cloudflare Pages Function: /api/stremio/library
// Fetch and process Stremio library (server-side relay)
import { json, validateSession } from '../_shared.js';

const STREMIO_API = 'https://api.strem.io/api';

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Not authenticated' }, 401);

  const stremioData = await env.SYNC_KV.get(`stremio:${session.userId}`);
  if (!stremioData) return json({ error: 'Stremio not connected. Connect first.' }, 400);

  const { authKey } = JSON.parse(stremioData);
  if (!authKey) return json({ error: 'Stremio auth key missing. Reconnect.' }, 400);

  try {
    const res = await fetch(`${STREMIO_API}/datastoreGet`, {
      method: 'POST',
      body: JSON.stringify({ authKey, collection: 'libraryItem' }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      return json({ error: 'Failed to fetch Stremio library', status: res.status }, 502);
    }

    const data = await res.json();
    if (data.error) {
      return json({ error: data.error.message || 'Stremio library fetch failed' }, 502);
    }

    const items = data.result || [];

    // Resolve IMDB → TMDB via find/external
    const processed = await resolveItems(items, env);

    return json({
      success: true,
      rawCount: items.length,
      resolvedCount: processed.watchlist.length + processed.history.length,
      ...processed,
    });
  } catch (e) {
    return json({ error: `Stremio library fetch failed: ${e.message}` }, 502);
  }
}

async function resolveItems(items, env) {
  const watchlist = [];
  const history = [];
  const tmdbKey = env.TMDB_API_KEY;

  // Group by IMDB ID for batch resolution
  const toResolve = [];

  for (const itemData of items) {
    const item = itemData.value || itemData;
    const rawId = item.id || item._id;
    const type = item.type;
    if (!rawId || !type) continue;

    const imdbId = extractImdbId(rawId);
    if (!imdbId) continue;

    const baseItem = {
      stremioId: rawId,
      title: item.name,
      poster_path: item.poster,
      type: type === 'series' ? 'tv' : type,
    };

    const state = item.state || {};
    const isWatched = state.watched || state.lastWatched || state.timeOffset > 0;

    const historyEntry = isWatched ? {
      progress: state.timeOffset || 0,
      duration: state.duration || 0,
      percent: state.duration ? Math.min(100, (state.timeOffset / state.duration) * 100) : 100,
      timestamp: state.lastWatched ? new Date(state.lastWatched).getTime() : Date.now(),
    } : null;

    toResolve.push({ baseItem, imdbId, historyEntry, inWL: !item.removed });
  }

  // Resolve IMDB → TMDB IDs
  const BATCH = 5;
  for (let i = 0; i < toResolve.length; i += BATCH) {
    const batch = toResolve.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async ({ baseItem, imdbId, historyEntry, inWL }) => {
        try {
          const res = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`);
          if (!res.ok) return null;
          const data = await res.json();

          const mResults = data.movie_results || [];
          const tResults = data.tv_results || [];
          const allResults = [...mResults, ...tResults];

          if (allResults.length > 0) {
            const r = allResults[0];
            const isMovie = mResults.length > 0;
            return {
              resolvedItem: {
                ...baseItem,
                id: r.id,
                title: r.title || r.name || baseItem.title,
                poster_path: r.poster_path || baseItem.poster_path,
                backdrop_path: r.backdrop_path,
                vote_average: r.vote_average,
                release_date: r.release_date || r.first_air_date,
                type: isMovie ? 'movie' : 'tv',
                stremioId: baseItem.stremioId,
                tmdbId: r.id,
                imdbId,
              },
              historyEntry,
              inWL,
            };
          }
        } catch { /* item unresolvable, skip */ }
        return null;
      })
    );

    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        const { resolvedItem, historyEntry, inWL } = r.value;
        if (inWL) watchlist.push(resolvedItem);
        if (historyEntry) {
          history.push({ ...resolvedItem, ...historyEntry });
        }
      }
    });
  }

  return { watchlist, history };
}

function extractImdbId(id) {
  if (!id) return null;
  if (/^tt\d{7,8}$/.test(id)) return id;
  const m = id.match(/tt(\d{7,8})/);
  return m ? m[0] : null;
}