// GET /api/stremio/library — server-side Stremio library fetch + IMDB→TMDB resolution
// ?debug=true — also returns raw index and first 5 full items for troubleshooting
import { json, preflight, validateSession } from '../_shared.js';

const STREMIO_API = 'https://api.strem.io/api';
const TMDB_API    = 'https://api.themoviedb.org/3';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const raw = await env.SYNC_KV.get(`service:stremio:${session.userId}`);
  if (!raw) return json({ error: 'Stremio not connected. Connect in Settings first.' }, 400);

  const stored = JSON.parse(raw);
  if (!stored.authKey) return json({ error: 'Stremio auth key missing. Reconnect in Settings.' }, 400);

  const isDebug = new URL(request.url).searchParams.get('debug') === 'true';
  const tmdbKey = env.TMDB_API_KEY;

  try {
    // Step 1: Get library index — returns [[id, mtime], ...]
    const indexRes = await fetch(`${STREMIO_API}/datastoreMeta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: stored.authKey, collection: 'libraryItem' }),
    });
    if (!indexRes.ok) throw new Error(`Stremio datastoreMeta returned ${indexRes.status}`);
    const indexData = await indexRes.json();
    if (indexData.error) throw new Error(indexData.error?.message || 'Stremio datastoreMeta error');
    const index = indexData.result || [];
    if (!Array.isArray(index)) {
      return json({ error: 'Unexpected Stremio response format', raw: isDebug ? index : undefined }, 502);
    }

    // Step 2: Extract only IMDB IDs (tt followed by 4-8 digits)
    const imdbIds = index
      .map(entry => (Array.isArray(entry) ? entry[0] : entry._id || entry.id))
      .filter(id => id && /tt\d{4,8}/.test(String(id)))
      .map(id => String(id).match(/tt\d{4,8}/)[0]);

    if (isDebug && !tmdbKey) {
      return json({
        success: false,
        rawCount: index.length,
        imdbCount: imdbIds.length,
        sampleIndex: index.slice(0, 5),
        error: 'TMDB_API_KEY not configured',
      });
    }

    if (imdbIds.length === 0) {
      return json({
        success: true,
        rawCount: index.length,
        resolvedCount: 0,
        watchlist: [],
        history: [],
        ...(isDebug ? { sampleIndex: index.slice(0, 5) } : {}),
      });
    }

    // Step 3: Fetch full item data for IMDB-resolvable items
    const fullItems = await stremioGet(stored.authKey, 'libraryItem', imdbIds);
    if (!Array.isArray(fullItems)) {
      return json({ error: 'Unexpected Stremio full-item response format' }, 502);
    }

    if (!tmdbKey) {
      return json({
        success: false,
        error: 'TMDB_API_KEY not configured — cannot resolve IMDB→TMDB IDs',
        rawCount: index.length,
        imdbCount: imdbIds.length,
        ...(isDebug ? { sampleItems: fullItems.slice(0, 3) } : {}),
      }, 500);
    }

    const { watchlist, history } = await resolveItems(fullItems, tmdbKey);

    await env.SYNC_KV.put(`service:stremio:${session.userId}`, JSON.stringify({
      ...stored,
      lastImport: Date.now(),
    }));

    return json({
      success: true,
      rawCount: index.length,
      imdbCount: imdbIds.length,
      resolvedCount: watchlist.length + history.length,
      watchlist,
      history,
      ...(isDebug ? { sampleIndex: index.slice(0, 5), sampleItems: fullItems.slice(0, 3) } : {}),
    });
  } catch (e) {
    return json({ error: `Library fetch failed: ${e.message}` }, 502);
  }
}

async function stremioGet(authKey, collection, ids) {
  const res = await fetch(`${STREMIO_API}/datastoreGet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authKey, collection, ids }),
  });
  if (!res.ok) throw new Error(`Stremio API returned ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error?.message || 'Stremio datastoreGet error');
  return data.result || [];
}

async function resolveItems(items, tmdbKey) {
  const watchlist = [];
  const history   = [];
  const toResolve = [];

  for (const itemData of items) {
    const item  = itemData.value || itemData;
    const rawId = item._id || item.id;
    const type  = item.type;
    if (!rawId || !type) continue;

    const imdbId = String(rawId).match(/tt\d{4,8}/)?.[0];
    if (!imdbId) continue;

    const state = item.state || {};
    const historyEntry = (state.watched || state.lastWatched || state.timeOffset > 0)
      ? {
          progress:  state.timeOffset || 0,
          duration:  state.duration   || 0,
          percent:   state.duration ? Math.min(100, (state.timeOffset / state.duration) * 100) : 100,
          timestamp: state.lastWatched ? new Date(state.lastWatched).getTime() : Date.now(),
        }
      : null;

    toResolve.push({
      baseItem: {
        stremioId:   rawId,
        title:       item.name,
        poster_path: item.poster || null,
        type:        type === 'series' ? 'tv' : type,
      },
      imdbId,
      historyEntry,
      inWL: !item.removed,
    });
  }

  // Resolve IMDB → TMDB in batches of 5
  const BATCH = 5;
  for (let i = 0; i < toResolve.length; i += BATCH) {
    const batch   = toResolve.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async ({ baseItem, imdbId, historyEntry, inWL }) => {
        try {
          const res = await fetch(
            `${TMDB_API}/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`
          );
          if (!res.ok) return null;
          const data = await res.json();
          const mResults  = data.movie_results || [];
          const tResults  = data.tv_results    || [];
          const allResults = [...mResults, ...tResults];
          if (allResults.length === 0) return null;
          const r       = allResults[0];
          const isMovie = mResults.length > 0;
          return {
            resolvedItem: {
              ...baseItem,
              id:           r.id,
              title:        r.title || r.name || baseItem.title,
              poster_path:  r.poster_path   || baseItem.poster_path,
              backdrop_path: r.backdrop_path || null,
              vote_average: r.vote_average   || null,
              release_date: r.release_date   || r.first_air_date || null,
              type:         isMovie ? 'movie' : 'tv',
              tmdbId:       r.id,
              imdbId,
            },
            historyEntry,
            inWL,
          };
        } catch { return null; }
      })
    );

    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        const { resolvedItem, historyEntry, inWL } = r.value;
        if (inWL) watchlist.push(resolvedItem);
        if (historyEntry) history.push({ ...resolvedItem, ...historyEntry });
      }
    });
  }

  return { watchlist, history };
}
