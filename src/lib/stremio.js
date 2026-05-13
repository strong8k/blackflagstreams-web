/* ═══════════════════════════════════════════════════════
   Stremio API Client (Private API)
   Login, library fetching, watch history import
   ═══════════════════════════════════════════════════════ */

const STREMIO_API = 'https://api.strem.io/api';

/**
 * Login to Stremio to get an authKey.
 * Credentials go directly to Stremio's API — BFS never sees or stores them.
 */
export async function stremioLogin(email, password) {
  const res = await fetch(`${STREMIO_API}/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Stremio login failed');
  return data.result; // { authKey, user: { ... } }
}

/**
 * Get library items from Stremio
 */
export async function stremioGetLibrary(authKey) {
  const res = await fetch(`${STREMIO_API}/datastoreGet`, {
    method: 'POST',
    body: JSON.stringify({ authKey, collection: 'libraryItem' }),
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Failed to fetch Stremio library');
  return data.result || [];
}

/**
 * Extract a clean IMDB ID from a Stremio item ID.
 * Stremio uses various formats: "tt1234567", "imdb:tt1234567", "imdb_id:tt1234567"
 */
function extractImdbId(id) {
  if (!id) return null;
  // Already just an IMDB ID
  if (/^tt\d{7,8}$/.test(id)) return id;
  // "imdb:tt1234567" or "imdb_id:tt1234567"
  const m = id.match(/tt(\d{7,8})/);
  return m ? m[0] : null;
}

/**
 * Convert Stremio library items to BFS watchlist/history format.
 * Maps IMDB IDs → TMDB IDs via the TMDB find API so items work in our UI.
 */
export async function processStremioLibrary(items) {
  const watchlist = [];
  const history = [];

  console.log(`[StremioSync] Processing ${items?.length || 0} items...`);

  if (!items || !Array.isArray(items)) return { watchlist, history };

  // Lazy import to avoid circular dependency
  const { findByExternalId, img } = await import('./tmdb');

  // Group by IMDB ID for batch resolution
  const toResolve = [];
  const resolved = new Map();

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

  // Resolve IMDB → TMDB IDs (batch of 5 concurrent to be gentle on API)
  const BATCH = 5;
  for (let i = 0; i < toResolve.length; i += BATCH) {
    const batch = toResolve.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async ({ baseItem, imdbId, historyEntry, inWL }) => {
        try {
          const data = await findByExternalId(imdbId);
          const mResults = data.movie_results || [];
          const tResults = data.tv_results || [];
          const allResults = [...mResults, ...tResults];
          if (allResults.length > 0) {
            const r = allResults[0];
            const isMovie = mResults.length > 0;
            const resolvedItem = {
              ...baseItem,
              id: r.id,
              title: r.title || r.name || baseItem.title,
              poster_path: r.poster_path || baseItem.poster_path,
              backdrop_path: r.backdrop_path,
              vote_average: r.vote_average,
              release_date: r.release_date || r.first_air_date,
              type: isMovie ? 'movie' : 'tv',
              stremioId: baseItem.stremioId,
            };
            return { resolvedItem, historyEntry, inWL };
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

  console.log(`[StremioSync] Resolved ${watchlist.length} watchlist items, ${history.length} history items.`);
  return { watchlist, history };
}
