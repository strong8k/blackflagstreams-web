/* ═══════════════════════════════════════════════════════
   Stremio API Client (Private API)
   Login, library fetching, watch history import
   ═══════════════════════════════════════════════════════ */

const STREMIO_API = 'https://api.strem.io/api';

/**
 * Login to Stremio to get an authKey
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
 * Convert Stremio library items to BFS watchlist/history format
 * Stremio items use IMDB IDs (mostly) or internal IDs.
 */
export async function processStremioLibrary(items) {
  const watchlist = [];
  const history = [];

  console.log(`[StremioSync] Processing ${items?.length} items...`);

  if (!items || !Array.isArray(items)) return { watchlist, history };

  for (const itemData of items) {
    // Stremio items in datastore are sometimes wrapped in { _id, key, value }
    const item = itemData.value || itemData;
    const id = item.id || item._id;
    const type = item.type;

    if (!id || !type) continue;

    const baseItem = {
      id: id, 
      type: type === 'series' ? 'tv' : type,
      title: item.name,
      poster_path: item.poster,
      stremioId: id
    };

    // If it's in library, add to watchlist
    if (!item.removed) {
      watchlist.push(baseItem);
    }

    // If it's watched, add to history
    const state = item.state || {};
    if (state.watched || state.lastWatched || state.timeOffset > 0) {
      history.push({
        ...baseItem,
        progress: state.timeOffset || 0,
        duration: state.duration || 0,
        percent: state.duration ? Math.min(100, (state.timeOffset / state.duration) * 100) : 100,
        timestamp: state.lastWatched ? new Date(state.lastWatched).getTime() : Date.now()
      });
    }
  }

  console.log(`[StremioSync] Results: Watchlist=${watchlist.length}, History=${history.length}`);
  return { watchlist, history };
}
