import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getSeasonDetails, img } from '../lib/tmdb';
import { useStore } from '../lib/store';
import { getApiBaseUrl } from '../lib/auth';
import './SeasonPage.css';

export default function SeasonPage() {
  const { id, season } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [watchedEpisodes, setWatchedEpisodes] = useState({}); // { "1": true, "3": true }

  const getProgress = useStore(s => s.getProgress);
  const token = useStore(s => s.auth.token);
  const stremioConnected = useStore(s => s.services?.stremio?.connected);

  // Load watched state from sessionStorage for Stremio-synced episodes
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`bfs_watched_tv_${id}_s${season}`);
      if (raw) setWatchedEpisodes(JSON.parse(raw));
    } catch {}
  }, [id, season]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSeasonDetails(id, season)
      .then(res => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [id, season]);

  if (loading) {
    return (
      <div className="page season-page">
        <div className="container">
          <div className="skeleton" style={{ height: '3rem', width: '200px', marginBottom: '2rem' }} />
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="episode-card-skeleton">
              <div className="skeleton" style={{ width: '200px', height: '112px', borderRadius: 'var(--radius-sm)' }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: '1.5rem', width: '40%', marginBottom: '0.5rem' }} />
                <div className="skeleton" style={{ height: '1rem', width: '100%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <div className="page"><div className="empty-state"><h3>Failed to load season</h3><p>{error}</p></div></div>;
  }

  return (
    <div className="page season-page">
      <div className="container">
        <header className="season-header">
          <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ marginBottom: '1rem' }}>← Back to Series</button>
          <h1 className="section-title">{data.name || `Season ${season}`}</h1>
          {data.overview && <p className="season-overview">{data.overview}</p>}
        </header>

        <div className="episode-list">
          {data.episodes?.map((ep, idx) => {
            const progress = getProgress(Number(id), 'tv'); // This might need refinement for episode-specific progress
            return (
              <motion.div
                key={ep.id}
                className="episode-card"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => navigate(`/tv/${id}/season/${season}/episode/${ep.episode_number}`)}
              >
                <div className="episode-thumb-wrapper">
                  {ep.still_path ? (
                    <img src={img.backdrop(ep.still_path, 'w300')} alt={ep.name} className="episode-thumb" />
                  ) : (
                    <div className="episode-thumb-placeholder">No Preview</div>
                  )}
                  {watchedEpisodes[String(ep.episode_number)] && (
                    <div className="episode-watched-badge" style={{
                      position: 'absolute', top: '6px', right: '6px',
                      background: 'rgba(16, 185, 129, 0.9)', borderRadius: '50%',
                      width: '26px', height: '26px', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '14px', boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    }}>✓</div>
                  )}
                  <div className="episode-play-overlay">
                    <span className="play-icon">▶</span>
                  </div>
                </div>
                <div className="episode-info">
                  <div className="episode-meta">
                    <span className="episode-num">Episode {ep.episode_number}</span>
                    {ep.air_date && <span className="episode-date">{new Date(ep.air_date).toLocaleDateString()}</span>}
                    {ep.runtime && <span className="episode-runtime">{ep.runtime}m</span>}
                  </div>
                  <h3 className="episode-title">{ep.name}</h3>
                  <p className="episode-overview">{ep.overview || 'No description available.'}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
