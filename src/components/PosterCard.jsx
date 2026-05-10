import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { img } from '../lib/tmdb';
import { useStore } from '../lib/store';
import './PosterCard.css';

export default function PosterCard({ item, type }) {
  const navigate = useNavigate();
  const mediaType = item.media_type || type || 'movie';
  const title = item.title || item.name || 'Untitled';
  const poster = img.poster(item.poster_path, 'w342');
  const year = (item.release_date || item.first_air_date || '').substring(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
  const isInWatchlist = useStore(s => s.isInWatchlist(item.id, mediaType));
  const addToWatchlist = useStore(s => s.addToWatchlist);
  const removeFromWatchlist = useStore(s => s.removeFromWatchlist);
  const addToast = useStore(s => s.addToast);

  const progress = useStore(s => s.getProgress(item.id, mediaType));
  const resumePercent = progress?.percent || 0;

  const handleClick = () => {
    if (mediaType === 'tv' && progress?.season && progress?.episode) {
      navigate(`/tv/${item.id}/season/${progress.season}/episode/${progress.episode}`);
    } else {
      navigate(`/detail/${mediaType}/${item.id}`);
    }
  };

  const handleWatchlist = (e) => {
    e.stopPropagation();
    if (isInWatchlist) {
      removeFromWatchlist(item.id, mediaType);
      addToast('Removed from watchlist', 'info');
    } else {
      addToWatchlist({ id: item.id, type: mediaType, title, poster_path: item.poster_path, backdrop_path: item.backdrop_path, vote_average: item.vote_average, release_date: item.release_date || item.first_air_date });
      addToast('Added to watchlist', 'success');
    }
  };

  return (
    <motion.div
      className="poster-card"
      onClick={handleClick}
      whileHover={{ scale: 1.04, y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      {poster ? (
        <img src={poster} alt={title} loading="lazy" />
      ) : (
        <div className="poster-placeholder">{title}</div>
      )}

      {/* Watchlist button */}
      <button
        className={`poster-wl-btn${isInWatchlist ? ' active' : ''}`}
        onClick={handleWatchlist}
        aria-label={isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
      >
        {isInWatchlist ? '✓' : '+'}
      </button>

      {/* Rating badge */}
      {rating && (
        <span className="poster-rating">★ {rating}</span>
      )}

      {/* Progress bar for continue watching */}
      {resumePercent > 2 && resumePercent < 97 && (
        <div className="poster-progress">
          <div className="poster-progress-fill" style={{ width: `${resumePercent}%` }} />
        </div>
      )}

      {/* Info overlay on hover */}
      <div className="poster-info">
        <h3>{title}</h3>
        <span className="poster-meta">
          {year}{mediaType === 'tv' ? ' • Series' : ' • Movie'}
        </span>
      </div>
    </motion.div>
  );
}
