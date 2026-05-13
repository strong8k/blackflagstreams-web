import React, { useEffect, useState, useCallback } from 'react';
import FilterDropdown from './FilterDropdown';
import { getGenres } from '../lib/tmdb';
import { useStore } from '../lib/store';
import './FilterBar.css';

const RATING_OPTIONS = [
  { id: 0, name: 'Any' },
  { id: 7, name: '7+', sub: 'Good' },
  { id: 8, name: '8+', sub: 'Great' },
  { id: 9, name: '9+', sub: 'Excellent' },
];

const DECADES = [
  { id: '2020s', name: '2020s', start: 2020, end: 2029 },
  { id: '2010s', name: '2010s', start: 2010, end: 2019 },
  { id: '2000s', name: '2000s', start: 2000, end: 2009 },
  { id: '1990s', name: '1990s', start: 1990, end: 1999 },
  { id: '1980s', name: '1980s', start: 1980, end: 1989 },
  { id: '1970s', name: '1970s', start: 1970, end: 1979 },
  { id: '1960s', name: '1960-69', start: 1960, end: 1969 },
  { id: 'pre1960', name: 'Pre-1960', start: 1900, end: 1959 },
];

const MOVIE_CERTS = [
  { id: 'G', name: 'G' },
  { id: 'PG', name: 'PG' },
  { id: 'PG-13', name: 'PG-13' },
  { id: 'R', name: 'R' },
  { id: 'NC-17', name: 'NC-17' },
];

const TV_CERTS = [
  { id: 'TV-Y', name: 'TV-Y' },
  { id: 'TV-Y7', name: 'TV-Y7' },
  { id: 'TV-G', name: 'TV-G' },
  { id: 'TV-PG', name: 'TV-PG' },
  { id: 'TV-14', name: 'TV-14' },
  { id: 'TV-MA', name: 'TV-MA' },
];

export default function FilterBar({ type, filters, onFilterChange }) {
  const [genres, setGenres] = useState([]);
  const continueWatching = useStore(s => s.continueWatching);

  useEffect(() => {
    getGenres(type).then(setGenres).catch(() => {});
  }, [type]);

  const genreIds = filters?.genreIds || [];
  const minRating = filters?.minRating || 0;
  const decade = filters?.decade || null;
  const certs = filters?.certs || [];
  const hideWatched = filters?.hideWatched || false;

  const certOptions = type === 'movie' ? MOVIE_CERTS : TV_CERTS;

  const handleGenre = useCallback((id, add) => {
    const next = add
      ? [...genreIds, id]
      : genreIds.filter(g => g !== id);
    onFilterChange({ ...filters, genreIds: next });
  }, [genreIds, filters, onFilterChange]);

  const handleRating = useCallback((id, add) => {
    if (!add || id === 0) {
      onFilterChange({ ...filters, minRating: 0 });
    } else {
      onFilterChange({ ...filters, minRating: id });
    }
  }, [filters, onFilterChange]);

  const handleDecade = useCallback((id, add) => {
    if (!add || decade === id) {
      onFilterChange({ ...filters, decade: null });
    } else {
      onFilterChange({ ...filters, decade: id });
    }
  }, [decade, filters, onFilterChange]);

  const handleCert = useCallback((id, add) => {
    const next = add
      ? [...certs, id]
      : certs.filter(c => c !== id);
    onFilterChange({ ...filters, certs: next });
  }, [certs, filters, onFilterChange]);

  const handleHideWatched = useCallback(() => {
    onFilterChange({ ...filters, hideWatched: !hideWatched });
  }, [hideWatched, filters, onFilterChange]);

  const handleClearAll = useCallback(() => {
    onFilterChange({
      genreIds: [],
      minRating: 0,
      decade: null,
      certs: [],
      hideWatched: false,
    });
  }, [onFilterChange]);

  const hasFilters = genreIds.length > 0 || minRating > 0 || decade || certs.length > 0 || hideWatched;

  const ratingSelected = minRating > 0 ? new Set([minRating]) : new Set();
  const decadeSelected = decade ? new Set([decade]) : new Set();

  // Build a genre lookup map for O(1) access instead of .find() per render
  const genreMap = useMemo(() => {
    const map = new Map();
    genres.forEach(g => map.set(g.id, g.name));
    return map;
  }, [genres]);

  return (
    <div className="filter-bar">
      <div className="filter-bar-row">
        <FilterDropdown
          label="Genre"
          options={genres}
          selected={new Set(genreIds)}
          onChange={handleGenre}
          renderName={(id) => genreMap.get(id) || id}
        />

        <FilterDropdown
          label="Year"
          options={DECADES}
          selected={decadeSelected}
          onChange={handleDecade}
          multi={false}
        />

        <FilterDropdown
          label="Rating"
          options={RATING_OPTIONS}
          selected={ratingSelected}
          onChange={handleRating}
          multi={false}
          renderName={(id) => RATING_OPTIONS.find(r => r.id === id)?.name || id}
        />

        <FilterDropdown
          label="Parental"
          options={certOptions}
          selected={new Set(certs)}
          onChange={handleCert}
        />

        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={hideWatched}
            onChange={handleHideWatched}
          />
          <span>Hide Watched</span>
        </label>

        {hasFilters && (
          <button className="filter-clear-btn" onClick={handleClearAll} type="button">
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Build TMDB discover params from filter state.
 */
export function buildFilterParams(filters, type, page = 1) {
  const params = { sort_by: 'popularity.desc', page };
  const f = filters || {};

  if (f.genreIds?.length > 0) {
    params.with_genres = f.genreIds.join(',');
  }

  if (f.minRating > 0) {
    params['vote_average.gte'] = f.minRating;
  }

  if (f.decade) {
    const d = DECADES.find(dd => dd.id === f.decade);
    if (d) {
      const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
      params[`${dateField}.gte`] = `${d.start}-01-01`;
      params[`${dateField}.lte`] = `${d.end}-12-31`;
    }
  }

  if (f.certs?.length > 0) {
    params.certification = f.certs.join('|');
    params.certification_country = 'US';
  }

  return params;
}

/**
 * Client-side filter: remove items already in continueWatching (>=90% watched).
 */
export function applyHideWatched(items, watchedList) {
  if (!watchedList || watchedList.length === 0) return items;
  const watchedIds = new Set(
    watchedList
      .filter(w => w.percent >= 90)
      .map(w => `${w.type || w.media_type}_${w.id}`)
  );
  return items.filter(item => {
    const key = `${item.media_type || 'movie'}_${item.id}`;
    return !watchedIds.has(key);
  });
}