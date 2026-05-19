import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getTrending, getPopularMovies, getTopRatedMovies, getNowPlayingMovies,
  discoverMovies, img,
} from '../lib/tmdb';
import { useStore } from '../lib/store';
import ContentRow from '../components/ContentRow';
import FilterBar, { buildFilterParams, applyHideWatched } from '../components/FilterBar';

const CURATED_ROWS = [
  { key: 'trending', title: 'Trending Now', icon: '🔥', fetch: () => getTrending('movie', 'week').then(r => r.results) },
  { key: 'nowPlaying', title: 'Now Playing', icon: '🍿', fetch: () => getNowPlayingMovies().then(r => r.results) },
  { key: 'popular', title: 'Popular Movies', icon: '🎬', fetch: () => getPopularMovies().then(r => r.results) },
  { key: 'topRated', title: 'Top Rated', icon: '⭐', fetch: () => getTopRatedMovies().then(r => r.results) },
  { key: 'kids', title: 'Kids & Family', icon: '🎠', fetch: () => discoverMovies({ with_genres: '16,10751', 'certification.lte': 'PG', 'certification_country': 'US', sort_by: 'popularity.desc' }).then(r => r.results) },
  { key: 'anime', title: 'Anime', icon: '🏮', fetch: () => discoverMovies({ with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc' }).then(r => r.results) },
  { key: 'action', title: 'Action', icon: '💥', fetch: () => discoverMovies({ with_genres: '28', sort_by: 'popularity.desc' }).then(r => r.results) },
  { key: 'comedy', title: 'Comedy', icon: '😂', fetch: () => discoverMovies({ with_genres: '35', sort_by: 'popularity.desc' }).then(r => r.results) },
  { key: 'scifi', title: 'Sci-Fi & Fantasy', icon: '🚀', fetch: () => discoverMovies({ with_genres: '878,14', sort_by: 'popularity.desc' }).then(r => r.results) },
  { key: 'horror', title: 'Horror', icon: '👻', fetch: () => discoverMovies({ with_genres: '27', sort_by: 'popularity.desc' }).then(r => r.results) },
];

const EMPTY_FILTERS = {
  genreIds: [], minRating: 0, decade: null, certs: [], hideWatched: false,
};

export default function MoviesPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filteredMovies, setFilteredMovies] = useState([]);
  const [filterPage, setFilterPage] = useState(1);
  const [filterTotalPages, setFilterTotalPages] = useState(1);
  const [filterLoading, setFilterLoading] = useState(false);
  const [rowData, setRowData] = useState({});
  const [rowLoading, setRowLoading] = useState({});
  const settings = useStore(s => s.settings);
  const continueWatching = useStore(s => s.continueWatching);

  const isFiltered = filters.genreIds.length > 0 || filters.minRating > 0 || !!filters.decade || filters.certs.length > 0 || filters.hideWatched;

  // Load curated rows
  useEffect(() => {
    if (isFiltered || !settings.effectiveTmdbKey) return;
    CURATED_ROWS.forEach(row => {
      if (rowData[row.key] || rowLoading[row.key]) return;
      setRowLoading(l => ({ ...l, [row.key]: true }));
      row.fetch().then(items => {
        setRowData(d => ({ ...d, [row.key]: items || [] }));
        setRowLoading(l => ({ ...l, [row.key]: false }));
      }).catch(() => {
        setRowData(d => ({ ...d, [row.key]: [] }));
        setRowLoading(l => ({ ...l, [row.key]: false }));
      });
    });
  }, [isFiltered, settings.effectiveTmdbKey]);

  // Filter query
  const loadFiltered = useCallback(async (page, currentFilters) => {
    setFilterLoading(true);
    try {
      const params = buildFilterParams(currentFilters, 'movie', page);
      const data = await discoverMovies(params);
      let results = data.results || [];
      // Apply hide-watched client-side
      if (currentFilters.hideWatched) {
        results = applyHideWatched(results, continueWatching);
      }
      if (page === 1) {
        setFilteredMovies(results);
      } else {
        setFilteredMovies(prev => [...prev, ...results]);
      }
      setFilterTotalPages(data.total_pages || 1);
      setFilterPage(page);
    } catch { /* silent */ }
    setFilterLoading(false);
  }, [continueWatching]);

  useEffect(() => {
    if (!isFiltered) { setFilteredMovies([]); return; }
    loadFiltered(1, filters);
  }, [filters, isFiltered, loadFiltered]);

  const loadMore = () => {
    if (filterLoading || filterPage >= filterTotalPages) return;
    loadFiltered(filterPage + 1, filters);
  };

  const hasAnyFiltersActive = filters.genreIds.length > 0 || filters.minRating > 0 || !!filters.decade || filters.certs.length > 0;

  if (!settings.effectiveTmdbKey) {
    return (
      <div className="page" style={{ paddingTop: '4rem', textAlign: 'center' }}>
        <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎬</p>
        <h2 style={{ marginBottom: '0.5rem' }}>TMDB Key Required</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Ask your admin to set a global TMDB key, or add one in Settings.
        </p>
        <a href="/settings" className="btn btn-primary">Go to Settings</a>
      </div>
    );
  }

  return (
    <div className="page" style={{ paddingTop: '1rem' }}>
      {/* Filter bar */}
      <div style={{ padding: '0 2rem', marginBottom: '1.5rem' }}>
        <FilterBar type="movie" filters={filters} onFilterChange={setFilters} />
      </div>

      {/* Filtered results */}
      {isFiltered ? (
        <div style={{ padding: '0 2rem' }}>
          <h2 className="section-title">
            {hasAnyFiltersActive ? 'Movies' : 'Watched Movies'}
            {filters.hideWatched && !hasAnyFiltersActive ? ' (Unwatched)' : ''}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
            {filteredMovies.map(m => (
              <PosterInline key={m.id} item={m} type="movie" />
            ))}
          </div>
          {filterLoading && <div className="empty-state"><div className="spinner" /><p>Loading...</p></div>}
          {!filterLoading && filterPage < filterTotalPages && (
            <div style={{ textAlign: 'center', margin: '2rem 0' }}>
              <button className="btn btn-secondary" onClick={loadMore}>Load More</button>
            </div>
          )}
          {!filterLoading && filteredMovies.length === 0 && (
            <div className="empty-state"><h3>No results</h3><p>Try different filters.</p></div>
          )}
        </div>
      ) : (
        /* Curated rows */
        <>
          {CURATED_ROWS.map(row => (
            <ContentRow
              key={row.key}
              title={row.title}
              icon={row.icon}
              items={rowData[row.key] || null}
              type="movie"
              loading={!rowData[row.key]}
            />
          ))}
        </>
      )}
    </div>
  );
}

function PosterInline({ item, type }) {
  const navigate = useNavigate();
  return (
    <div onClick={() => navigate(`/detail/${type}/${item.id}`)} style={{ cursor: 'pointer', transition: 'transform 0.15s' }}>
      {item.poster_path ? (
        <img src={img.poster(item.poster_path)} alt={item.title} style={{ width: '100%', borderRadius: 'var(--radius-md)', aspectRatio: '2/3', objectFit: 'cover' }} loading="lazy" />
      ) : (
        <div style={{ aspectRatio: '2/3', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '0.5rem', textAlign: 'center' }}>{item.title}</div>
      )}
      <div style={{ fontSize: '0.72rem', marginTop: '0.35rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || item.name}</div>
    </div>
  );
}
