import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { searchMulti, findByExternalId, getMovieDetails, getTVDetails } from '../lib/tmdb';
import PosterCard from '../components/PosterCard';
import { debounce } from 'lodash-es';

/* ── Input type detection ── */
const IMDB_RE = /^tt\d{5,}$/i;
const MAGNET_RE = /^magnet:/i;
const HTTP_RE = /^https?:\/\//i;
const DIRECT_MEDIA_RE = /\.(mp4|mkv|webm|avi|mov|m3u8|mpd|ts)(\?.*)?$/i;

function classifyInput(q) {
  const v = q.trim();
  if (!v) return { type: 'empty' };

  // Magnet link
  if (MAGNET_RE.test(v)) return { type: 'magnet', url: v };

  // Direct HTTP(S) URL
  if (HTTP_RE.test(v)) {
    // Direct media file
    if (DIRECT_MEDIA_RE.test(v.split('?')[0])) {
      return { type: 'direct_media', url: v };
    }
    // TMDB link
    const tmdbMatch = v.match(/tmdb\.org\/(movie|tv)\/(\d+)/i) || v.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
    if (tmdbMatch) return { type: 'tmdb_id', mediaType: tmdbMatch[1], id: tmdbMatch[2] };
    // IMDB link
    const imdbMatch = v.match(/imdb\.com\/title\/(tt\d+)/i);
    if (imdbMatch) return { type: 'imdb_id', id: imdbMatch[1] };
    // Generic URL — try to play directly
    return { type: 'generic_url', url: v };
  }

  // IMDB ID
  if (IMDB_RE.test(v)) return { type: 'imdb_id', id: v.toLowerCase() };

  // Pure numeric — treat as TMDB ID (ambiguous: could be movie or TV)
  if (/^\d+$/.test(v)) return { type: 'tmdb_id_raw', id: v };

  // Default: text search
  return { type: 'text', query: v };
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [resolving, setResolving] = useState(false);  // ID/URL resolution in progress
  const [resolveMsg, setResolveMsg] = useState('');
  const timeoutRef = useRef(null);

  /* ── Resolve non-text inputs ── */
  const resolveInput = useCallback(async (q) => {
    const info = classifyInput(q);
    if (info.type === 'empty' || info.type === 'text') return false;

    setResolving(true);
    setResults([]);

    // IMDB ID → TMDB ID → detail page
    if (info.type === 'imdb_id') {
      setResolveMsg(`Looking up ${info.id}...`);
      try {
        const resolved = await findByExternalId(info.id);
        if (resolved) {
          const mediaType = resolved.media_type || (resolved.title ? 'movie' : 'tv');
          navigate(`/detail/${mediaType}/${resolved.id}`);
          return true;
        }
      } catch { /* fall through to text search */ }
      setResolving(false);
      return false;
    }

    // TMDB ID from link (known media type)
    if (info.type === 'tmdb_id') {
      setResolveMsg(`Opening ${info.mediaType} ${info.id}...`);
      navigate(`/detail/${info.mediaType}/${info.id}`);
      return true;
    }

    // TMDB ID raw (ambiguous — try movie first then TV)
    if (info.type === 'tmdb_id_raw') {
      setResolveMsg(`Resolving ID ${info.id}...`);
      try {
        let detail = await getMovieDetails(info.id);
        if (detail && detail.id) {
          navigate(`/detail/movie/${detail.id}`);
          return true;
        }
      } catch { /* not a movie */ }
      try {
        let detail = await getTVDetails(info.id);
        if (detail && detail.id) {
          navigate(`/detail/tv/${detail.id}`);
          return true;
        }
      } catch { /* not TV either */ }
      setResolving(false);
      return false;
    }

    // Magnet / Direct media / Generic URL → try match or play directly
    if (info.type === 'magnet' || info.type === 'direct_media' || info.type === 'generic_url') {
      setResolveMsg(info.type === 'magnet' ? 'Resolving magnet link...' : 'Resolving media link...');

      // Start 15-second timeout that skips matching
      const timeoutId = setTimeout(() => {
        setResolveMsg('No match found — playing directly...');
        const encoded = encodeURIComponent(info.url);
        navigate(`/player?url=${encoded}`);
        setResolving(false);
      }, 15000);
      timeoutRef.current = timeoutId;

      // Try to extract a title from the URL for matching
      let searchTerm = '';
      try {
        const url = new URL(info.type === 'magnet' ? 'magnet:?' + info.url.substring(8) : info.url);
        const dn = url.searchParams.get('dn') || url.searchParams.get('title') || '';
        if (dn) searchTerm = dn.replace(/[._-]/g, ' ').replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, '').trim();
        if (!searchTerm) {
          const pathParts = url.pathname.split('/').filter(Boolean);
          const last = pathParts[pathParts.length - 1] || '';
          searchTerm = last.replace(/\.[^.]+$/, '').replace(/[._-]/g, ' ').trim();
        }
      } catch {
        // Can't parse — just use the raw string minus protocol
        searchTerm = info.url.replace(/^(https?:\/\/|magnet:\?xt=urn:btih:)/i, '').substring(0, 80);
      }

      if (searchTerm) {
        setResolveMsg(`Searching for "${searchTerm}"...`);
        try {
          const data = await searchMulti(searchTerm);
          const filtered = (data.results || []).filter(
            item => item.media_type === 'movie' || item.media_type === 'tv'
          );
          if (filtered.length > 0) {
            clearTimeout(timeoutId);
            setResults(filtered);
            setHasSearched(true);
            setResolving(false);
            setResolveMsg('');
            return true; // show results, let user pick
          }
        } catch { /* fall through */ }
      }

      // If we get here and timeout hasn't fired, wait for timeout
      // Don't clear the timeout — let it fire and navigate to player
      return true; // we're handling it (timeout will navigate)
    }

    setResolving(false);
    return false;
  }, [navigate]);

  const performSearch = useCallback(
    debounce(async (q) => {
      // Clear any pending timeout
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

      setResolving(false);
      setResolveMsg('');

      const isNonText = await resolveInput(q);
      if (isNonText) return;

      if (!q.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await searchMulti(q);
        setResults((data.results || []).filter(
          item => item.media_type === 'movie' || item.media_type === 'tv'
        ));
        setHasSearched(true);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 150),
    [resolveInput]
  );

  useEffect(() => {
    performSearch(query);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query, performSearch]);

  const placeholder = 'Search by title, actor, TMDB/IMDB ID, link, or magnet...';

  return (
    <div className="page search-page">
      <div className="container" style={{ paddingTop: '2rem' }}>
        <div className="search-container">
          <div className="search-input-wrapper">
            <span className="search-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ opacity: 0.5 }}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="search-input"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <button className="search-clear" onClick={() => { setQuery(''); setResults([]); setResolving(false); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="search-results" style={{ marginTop: '2rem' }}>
          {/* Resolving state */}
          {resolving && (
            <div className="empty-state">
              <div className="spinner" />
              <p style={{ marginTop: '1rem' }}>{resolveMsg}</p>
            </div>
          )}

          {loading && !resolving && results.length === 0 && (
            <div className="empty-state">
              <div className="spinner" />
              <p>Searching the high seas...</p>
            </div>
          )}

          {!loading && !resolving && hasSearched && results.length === 0 && query && (
            <div className="empty-state">
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#x1F6F6;</div>
              <h3>No booty found</h3>
              <p>Try searching for something else, matey.</p>
            </div>
          )}

          {!query && !hasSearched && !resolving && (
            <div className="empty-state">
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#x1F3F4;&#x200D;&#x2620;&#xFE0F;</div>
              <h3>What are we hunting?</h3>
              <p>Search by title, actor, IMDB/TMDB ID, or paste a media link.</p>
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
          box-shadow: 0 0 0 4px rgba(233, 0, 0, 0.12);
        }
        .search-icon {
          margin-right: 1rem;
          display: flex;
          align-items: center;
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
        .search-input::placeholder {
          color: rgba(255,255,255,0.25);
        }
        .search-clear {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.5rem;
          display: flex;
          align-items: center;
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
