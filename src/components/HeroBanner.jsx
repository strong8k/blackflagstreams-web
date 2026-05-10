import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { img } from '../lib/tmdb';
import { useStore } from '../lib/store';
import './HeroBanner.css';

export default function HeroBanner({ item }) {
  const navigate = useNavigate();
  const [imgLoaded, setImgLoaded] = useState(false);
  const addToWatchlist = useStore(s => s.addToWatchlist);
  const removeFromWatchlist = useStore(s => s.removeFromWatchlist);
  const isInWatchlist = useStore(s => s.isInWatchlist);
  const addToast = useStore(s => s.addToast);

  if (!item) {
    return <div className="hero-banner hero-skeleton"><div className="skeleton" style={{ width: '100%', height: '100%' }} /></div>;
  }

  const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
  const title = item.title || item.name || 'Untitled';
  const overview = item.overview ? (item.overview.length > 220 ? item.overview.substring(0, 220) + '...' : item.overview) : '';
  const backdrop = img.backdrop(item.backdrop_path, 'w1280');
  const year = (item.release_date || item.first_air_date || '').substring(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
  const inWL = isInWatchlist(item.id, mediaType);
  const goToDetail = () => navigate(`/detail/${mediaType}/${item.id}`);

  const toggleWL = async (e) => {
    e.stopPropagation();
    if (inWL) {
      await removeFromWatchlist(item.id, mediaType);
      addToast('Removed from watchlist', 'info');
    } else {
      await addToWatchlist({ id: item.id, type: mediaType, title, poster_path: item.poster_path, backdrop_path: item.backdrop_path, vote_average: item.vote_average, release_date: item.release_date || item.first_air_date });
      addToast('Added to watchlist', 'success');
    }
  };

  return (
    <div className="hero-banner" onClick={goToDetail}>
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          className={`hero-bg-img${imgLoaded ? ' loaded' : ''}`}
          onLoad={() => setImgLoaded(true)}
        />
      )}
      <div className="hero-gradient" />

      <motion.div
        className="hero-content"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="hero-meta">
          <span className="hero-badge">{mediaType === 'tv' ? 'SERIES' : 'MOVIE'}</span>
          {year && <span>{year}</span>}
          {rating && <span className="hero-rating">★ {rating}</span>}
        </div>

        <h1 className="hero-title">{title}</h1>

        {overview && <p className="hero-overview">{overview}</p>}

        <div className="hero-actions" onClick={e => e.stopPropagation()}>
          <button className="btn btn-primary" onClick={goToDetail}>
            ▶ Watch Now
          </button>
          <button className="btn btn-secondary" onClick={goToDetail}>
            ℹ More Info
          </button>
          <button className={`btn btn-secondary${inWL ? ' hero-wl-active' : ''}`} onClick={toggleWL}>
            {inWL ? '✓' : '+'} Watchlist
          </button>
        </div>
      </motion.div>
    </div>
  );
}
