/* ═══════════════════════════════════════════════════════
   TMDB API Client — with IDB response caching
   ═══════════════════════════════════════════════════════ */

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE  = 'https://image.tmdb.org/t/p';

// Cache TTLs
const CACHE_TTL = {
  details: 24 * 3600 * 1000,   // 24h — movie/show details
  lists: 3600 * 1000,           // 1h — popular/trending lists
  search: 600 * 1000,           // 10min — search results
  images: 7 * 24 * 3600 * 1000, // 1 week — image URLs (just metadata, not binary)
  streams: 5 * 60 * 1000,        // 5min — stream results (short: debrid cache changes frequently)
};

// ── IDB cache helpers ──
let _idb = null;
async function getIDB() {
  if (_idb) return _idb;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('bfs_cache', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('tmdb');
      req.result.createObjectStore('streams');
    };
    req.onsuccess = () => { _idb = req.result; resolve(_idb); };
    req.onerror = () => reject(req.error);
  });
}

async function cacheGet(storeName, key) {
  try {
    const db = await getIDB();
    return new Promise(resolve => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => {
        const entry = req.result;
        if (!entry) return resolve(null);
        if (Date.now() - entry.ts > entry.ttl) {
          const delTx = db.transaction(storeName, 'readwrite');
          delTx.objectStore(storeName).delete(key);
          return resolve(null);
        }
        resolve(entry.data);
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function cacheSet(storeName, key, data, ttl) {
  try {
    const db = await getIDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put({ data, ts: Date.now(), ttl }, key);
  } catch { /* silent */ }
}

export async function clearAllCaches() {
  try {
    const db = await getIDB();
    const tx = db.transaction(['tmdb', 'streams'], 'readwrite');
    tx.objectStore('tmdb').clear();
    tx.objectStore('streams').clear();
    return true;
  } catch { return false; }
}

export async function clearStreamCache() {
  try {
    const db = await getIDB();
    const tx = db.transaction('streams', 'readwrite');
    tx.objectStore('streams').clear();
    return true;
  } catch { return false; }
}

export async function clearImageCache() {
  try {
    const db = await getIDB();
    const tx = db.transaction('tmdb', 'readwrite');
    tx.objectStore('tmdb').clear();
    return true;
  } catch { return false; }
}

// ── Key helpers ──
function getKey() {
  return localStorage.getItem('bfs_user_tmdb_key') || localStorage.getItem('bfs_tmdb_key') || '';
}

async function tmdb(path, params = {}, ttl = CACHE_TTL.lists) {
  const key = getKey();
  if (!key) throw new Error('No TMDB API key configured');
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', key);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) url.searchParams.set(k, v); });

  const cacheKey = url.toString();
  const cached = await cacheGet('tmdb', cacheKey);
  if (cached) return cached;

  const res = await fetch(url.toString());
  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid API key');
    throw new Error(`TMDB error: ${res.status}`);
  }
  const data = await res.json();
  cacheSet('tmdb', cacheKey, data, ttl);
  return data;
}

// ── Image helpers ──
export const img = {
  poster:   (path, size = 'w342') => path ? `${IMG_BASE}/${size}${path}` : '',
  backdrop: (path, size = 'w1280') => path ? `${IMG_BASE}/${size}${path}` : '',
  profile:  (path, size = 'w185') => path ? `${IMG_BASE}/${size}${path}` : '',
  logo:     (path, size = 'w300') => path ? `${IMG_BASE}/${size}${path}` : '',
};

// ── Movies ──
export async function getTrending(mediaType = 'all', timeWindow = 'week') {
  return tmdb(`/trending/${mediaType}/${timeWindow}`);
}

export async function getPopularMovies(page = 1) {
  return tmdb('/movie/popular', { page });
}

export async function getTopRatedMovies(page = 1) {
  return tmdb('/movie/top_rated', { page });
}

export async function getNowPlayingMovies(page = 1) {
  return tmdb('/movie/now_playing', { page });
}

export async function getMovieDetails(id) {
  return tmdb(`/movie/${id}`, {
    append_to_response: 'videos,credits,external_ids,recommendations,similar',
  }, CACHE_TTL.details);
}

// ── TV ──
export async function getPopularTV(page = 1) {
  return tmdb('/tv/popular', { page });
}

export async function getTopRatedTV(page = 1) {
  return tmdb('/tv/top_rated', { page });
}

export async function getTVDetails(id) {
  return tmdb(`/tv/${id}`, {
    append_to_response: 'videos,credits,external_ids,recommendations,similar',
  }, CACHE_TTL.details);
}

export async function getSeasonDetails(tvId, seasonNumber) {
  return tmdb(`/tv/${tvId}/season/${seasonNumber}`, {}, CACHE_TTL.details);
}

export async function getExternalIds(type, id) {
  return tmdb(`/${type}/${id}/external_ids`, {}, CACHE_TTL.details);
}

// ── Find by external ID (IMDB → TMDB) ──
export async function findByExternalId(imdbId) {
  return tmdb(`/find/${imdbId}`, { external_source: 'imdb_id' }, CACHE_TTL.details);
}

// ── Discover ──
export async function discoverMovies(params = {}) {
  return tmdb('/discover/movie', params);
}

export async function discoverTV(params = {}) {
  return tmdb('/discover/tv', params);
}

// ── Search ──
export async function searchMulti(query, page = 1) {
  return tmdb('/search/multi', { query, page }, CACHE_TTL.search);
}

// ── Genres ──
let genreCache = null;
export async function getGenres(type) {
  if (!genreCache) {
    const [movie, tv] = await Promise.all([
      tmdb('/genre/movie/list', {}, 24 * 3600 * 1000),
      tmdb('/genre/tv/list', {}, 24 * 3600 * 1000),
    ]);
    genreCache = { movie: movie.genres || [], tv: tv.genres || [] };
  }
  return genreCache[type] || [];
}

// ── Images (for logos) ──
let imagesCache = {};
export async function getTmdbImages(type, tmdbId) {
  const cacheKey = `${type}:${tmdbId}`;
  if (imagesCache[cacheKey]) return imagesCache[cacheKey];
  try {
    const data = await tmdb(`/${type}/${tmdbId}/images`, {
      include_image_language: 'en,null',
    }, 7 * 24 * 3600 * 1000);
    // Pick the first English logo with text, fallback to any logo
    const logos = data.logos || [];
    const logo = logos.find(l => l.iso_639_1 === 'en') || logos[0];
    const result = { logoPath: logo?.file_path ? logo.file_path : null };
    imagesCache[cacheKey] = result;
    return result;
  } catch { return { logoPath: null }; }
}

// ── Stream caching ──
export async function getCachedStreams(type, id) {
  return cacheGet('streams', `${type}:${id}`);
}

export async function setCachedStreams(type, id, streams) {
  return cacheSet('streams', `${type}:${id}`, streams, CACHE_TTL.streams);
}

// ── Helpers ──
export async function getNextEpisode(tvId, currentSeason, currentEpisode) {
  try {
    const season = await getSeasonDetails(tvId, currentSeason);
    const nextEp = season.episodes?.find(e => e.episode_number === Number(currentEpisode) + 1);
    if (nextEp) return { season: currentSeason, episode: nextEp.episode_number };

    const series = await getTVDetails(tvId);
    const nextSeasonNum = Number(currentSeason) + 1;
    const nextSeason = series.seasons?.find(s => s.season_number === nextSeasonNum);
    if (nextSeason) {
      const nextSeasonDetails = await getSeasonDetails(tvId, nextSeasonNum);
      const firstEp = nextSeasonDetails.episodes?.[0];
      if (firstEp) return { season: nextSeasonNum, episode: firstEp.episode_number };
    }
  } catch { return null; }
  return null;
}