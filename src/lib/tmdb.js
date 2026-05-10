/* ═══════════════════════════════════════════════════════
   TMDB API Client
   ═══════════════════════════════════════════════════════ */

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE  = 'https://image.tmdb.org/t/p';

function getKey() {
  return localStorage.getItem('bfs_user_tmdb_key') || localStorage.getItem('bfs_tmdb_key') || '';
}

async function tmdb(path, params = {}) {
  const key = getKey();
  if (!key) throw new Error('No TMDB API key configured');
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', key);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) url.searchParams.set(k, v); });
  const res = await fetch(url.toString());
  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid API key');
    throw new Error(`TMDB error: ${res.status}`);
  }
  return res.json();
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
  });
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
  });
}

export async function getSeasonDetails(tvId, seasonNumber) {
  return tmdb(`/tv/${tvId}/season/${seasonNumber}`);
}

export async function getExternalIds(type, id) {
  return tmdb(`/${type}/${id}/external_ids`);
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
  return tmdb('/search/multi', { query, page });
}

// ── Genres ──
let genreCache = null;
export async function getGenres(type) {
  if (!genreCache) {
    const [movie, tv] = await Promise.all([
      tmdb('/genre/movie/list'),
      tmdb('/genre/tv/list'),
    ]);
    genreCache = { movie: movie.genres || [], tv: tv.genres || [] };
  }
  return genreCache[type] || [];
}

// ── Helpers ──
export async function getNextEpisode(tvId, currentSeason, currentEpisode) {
  try {
    const season = await getSeasonDetails(tvId, currentSeason);
    const nextEp = season.episodes?.find(e => e.episode_number === Number(currentEpisode) + 1);
    if (nextEp) return { season: currentSeason, episode: nextEp.episode_number };
    
    // Check next season
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
