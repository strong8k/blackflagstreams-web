import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchMulti } from '../lib/tmdb';
import PosterCard from '../components/PosterCard';
import { debounce } from 'lodash-es';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const performSearch = useCallback(
    debounce(async (q) => {
      if (!q.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await searchMulti(q);
        // Filter for only movies and tv shows
        setResults((data.results || []).filter(item => item.media_type === 'movie' || item.media_type === 'tv'));
        setHasSearched(true);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 500),
    []
  );

  useEffect(() => {
    performSearch(query);
  }, [query, performSearch]);

  return (
    <div className="page search-page">
      <div className="container" style={{ paddingTop: '2rem' }}>
        <div className="search-container">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search movies, series, anime..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <button className="search-clear" onClick={() => setQuery('')}>✕</button>
            )}
          </div>
        </div>

        <div className="search-results" style={{ marginTop: '2rem' }}>
          {loading && results.length === 0 && (
            <div className="empty-state">
              <div className="spinner" />
              <p>Searching the high seas...</p>
            </div>
          )}

          {!loading && hasSearched && results.length === 0 && query && (
            <div className="empty-state">
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛶</div>
              <h3>No booty found</h3>
              <p>Try searching for something else, matey.</p>
            </div>
          )}

          {!query && !hasSearched && (
            <div className="empty-state">
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏴‍☠️</div>
              <h3>What are we hunting?</h3>
              <p>Type a title to begin your search.</p>
            </div>
          )}

          <div className="content-grid">
            <AnimatePresence>
              {results.map((item, idx) => (
                <motion.div
                  key={`${item.id}-${item.media_type}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(idx * 0.05, 0.5) }}
                >
                  <PosterCard item={item} type={item.media_type} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <style jsx="true">{`
        .search-container {
          max-width: 800px;
          margin: 0 auto;
        }
        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: var(--radius-lg);
          padding: 0 1.5rem;
          transition: all 0.2s ease;
        }
        .search-input-wrapper:focus-within {
          background: rgba(255, 255, 255, 0.08);
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(196, 26, 26, 0.15);
        }
        .search-icon {
          font-size: 1.25rem;
          margin-right: 1rem;
          opacity: 0.5;
        }
        .search-input {
          flex: 1;
          background: none;
          border: none;
          color: white;
          padding: 1.25rem 0;
          font-size: 1.2rem;
          outline: none;
        }
        .search-clear {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 1rem;
          padding: 0.5rem;
        }
        .search-clear:hover {
          color: white;
        }
        .content-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 1.5rem;
        }
        @media (max-width: 768px) {
          .content-grid {
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
            gap: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
