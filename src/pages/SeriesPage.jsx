import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getTrending, getPopularTV, getTopRatedTV,
  discoverTV, img,
} from '../lib/tmdb';
import { useStore } from '../lib/store';
import ContentRow from '../components/ContentRow';
import FilterBar, { buildFilterParams, applyHideWatched } from '../components/FilterBar';

const CURATED_ROWS = [
  { key: 'trending', title: 'Trending Series', icon: '🔥', fetch: () => getTrending('tv', 'week').then(r => r.results) },
  { key: 'popular', title: 'Popular Series', icon: '📺', fetch: () => getPopularTV().then(r => r.results) },
  { key: 'topRated', title: 'Top Rated', icon: '⭐', fetch: () => getTopRatedTV().then(r => r.results) },
  { key: 'kids', title: 'Kids & Family', icon: '🎠', fetch: () => discoverTV({ with_genres: '10762,10751', sort_by: 'popularity.desc' }).then(r => r.results) },
  { key: 'anime', title: 'Anime', icon: '🏮', fetch: () => discoverTV({ with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc' }).then(r => r.results) },
  { key: 'drama', title: 'Drama', icon: '🎭', fetch: () => discoverTV({ with_genres: '18', sort_by: 'popularity.desc' }).then(r => r.results) },
  { key: 'comedy', title: 'Comedy', icon: '😂', fetch: () => discoverTV({ with_genres: '35', sort_by: 'popularity.desc' }).then(r => r.results) },
  { key: 'scifi', title: 'Sci-Fi & Fantasy', icon: '🚀', fetch: () => discoverTV({ with_genres: '10765,10759', sort_by: 'popularity.desc' }).then(r => r.results) },
  { key: 'crime', title: 'Crime & Mystery', icon: '🔍', fetch: () => discoverTV({ with_genres: '80,9648', sort_by: 'popularity.desc' }).then(r => r.results) },
  { key: 'reality', title: 'Reality & Docs', icon: '🎥', fetch: () => discoverTV({ with_genres: '10764,99', sort_by: 'popularity.desc' }).then(r => r.results) },
];

const EMPTY_FILTERS = {
  genreIds: [], minRating: 0, decade: null, certs: [], hideWatched: false,
};

export default function SeriesPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filteredSeries, setFilteredSeries] = useState([]);
  const [filterPage, setFilterPage] = useState(1);
  const [filterTotalPages, setFilterTotalPages] = useState(1);
  const [filterLoading, setFilterLoading] = useState(false);
  const [rowData, setRowData] = useState({});
  const [rowLoading, setRowLoading] = useState({});
  const settings = useStore(s => s.settings);
  const continueWatching = useStore(s => s.continueWatching);

  const isFiltered = filters.genreIds.length > 0 || filters.minRating > 0 || !!filters.decade || filters.certs.length > 0 || filters.hideWatched;

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

  const loadFiltered = useCallback(async (page, currentFilters) => {
    setFilterLoading(true);
    try {
      const params = buildFilterParams(currentFilters, 'tv', page);
      const data = await discoverTV(params);
      let results = data.results || [];
      if (currentFilters.hideWatched) {
        results = applyHideWatched(results, continueWatching);
      }
      if (page === 1) {
        setFilteredSeries(results);
      } else {
        setFilteredSeries(prev => [...prev, ...results]);
      }
      setFilterTotalPages(data.total_pages || 1);
      setFilterPage(page);
    } catch { /* silent */ }
    setFilterLoading(false);
  }, [continueWatching]);

  useEffect(() => {
    if (!isFiltered) { setFilteredSeries([]); return; }
    loadFiltered(1, filters);
  }, [filters, isFiltered, loadFiltered]);

  const loadMore = () => {
    if (filterLoading || filterPage >= filterTotalPages) return;
    loadFiltered(filterPage + 1, filters);
  };

  const hasAnyFiltersActive = filters.genreIds.length > 0 || filters.minRating > 0 || !!filters.decade || filters.certs.length > 0;

  return (
    <div className="page" style={{ paddingTop: '1rem' }}>
      <div style={{ padding: '0 2rem', marginBottom: '1.5rem' }}>
        <FilterBar type="tv" filters={filters} onFilterChange={setFilters} />
      </div>

      {isFiltered ? (
        <div style={{ padding: '0 2rem' }}>
          <h2 className="section-title">
            {hasAnyFiltersActive ? 'Series' : 'Watched Series'}
            {filters.hideWatched && !hasAnyFiltersActive ? ' (Unwatched)' : ''}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
            {filteredSeries.map(s => (
              <PosterInline key={s.id} item={s} type="tv" />
            ))}
          </div>
          {filterLoading && <div className="empty-state"><div className="spinner" /><p>Loading...</p></div>}
          {!filterLoading && filterPage < filterTotalPages && (
            <div style={{ textAlign: 'center', margin: '2rem 0' }}>
              <button className="btn btn-secondary" onClick={loadMore}>Load More</button>
            </div>
          )}
          {!filterLoading && filteredSeries.length === 0 && (
            <div className="empty-state"><h3>No results</h3><p>Try different filters.</p></div>
          )}
        </div>
      ) : (
        <>
          {CURATED_ROWS.map(row => (
            <ContentRow
              key={row.key}
              title={row.title}
              icon={row.icon}
              items={rowData[row.key] || null}
              type="tv"
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
  const title = item.name || item.title;
  return (
    <div onClick={() => navigate(`/detail/${type}/${item.id}`)} style={{ cursor: 'pointer', transition: 'transform 0.15s' }}>
      {item.poster_path ? (
        <img src={img.poster(item.poster_path)} alt={title} style={{ width: '100%', borderRadius: 'var(--radius-md)', aspectRatio: '2/3', objectFit: 'cover' }} loading="lazy" />
      ) : (
        <div style={{ aspectRatio: '2/3', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '0.5rem', textAlign: 'center' }}>{title}</div>
      )}
      <div style={{ fontSize: '0.72rem', marginTop: '0.35rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
    </div>
  );
}
