import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import { useStore } from '../lib/store';
import { img, getNextEpisode } from '../lib/tmdb';
import './PlayerPage.css';

export default function PlayerPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [hls, setHls] = useState(null);
  const [error, setError] = useState(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showNextOverlay, setShowNextOverlay] = useState(false);
  const [nextEpInfo, setNextEpInfo] = useState(null);
  const hideTimer = useRef(null);

  const url = params.get('url');
  const title = params.get('title') || 'Now Playing';
  const poster = params.get('poster');
  const type = params.get('type');
  const id = params.get('id');
  const season = params.get('season');
  const episode = params.get('episode');
  const resume = params.get('resume') === '1';

  const updateProgress = useStore(s => s.updateProgress);
  const getProgress = useStore(s => s.getProgress);
  const savedProgress = id ? getProgress(Number(id), type) : null;

  useEffect(() => {
    if (!url) {
      setError('No stream URL provided');
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let hlsInstance = null;

    if (Hls.isSupported() && (url.endsWith('.m3u8') || url.includes('m3u8'))) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        if (resume && savedProgress?.progress) {
          video.currentTime = savedProgress.progress;
        }
      });
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError(`Playback error: ${data.type}`);
          hlsInstance.destroy();
        }
      });
      setHls(hlsInstance);
    } else {
      video.src = url;
      video.play().catch(() => {});
      if (resume && savedProgress?.progress) {
        video.currentTime = savedProgress.progress;
      }
    }

    // Fetch next episode info if applicable
    if (type === 'tv' && id && season && episode) {
      getNextEpisode(id, season, episode).then(res => setNextEpInfo(res));
    }

    return () => {
      if (hlsInstance) hlsInstance.destroy();
    };
  }, [url]);

  // Progress tracking & Next Episode overlay
  useEffect(() => {
    if (!id || !type || !title) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || !video.duration) return;
      
      const currentTime = video.currentTime;
      const duration = video.duration;
      const percent = (currentTime / duration) * 100;
      
      // Track progress
      updateProgress({
        id: Number(id),
        type,
        title,
        poster_path: poster || null,
        progress: currentTime,
        duration: duration,
        percent,
        season: season ? Number(season) : null,
        episode: episode ? Number(episode) : null,
      });

      // Show "Next Episode" overlay in the last 20 seconds
      if (type === 'tv' && nextEpInfo && (duration - currentTime) < 20) {
        setShowNextOverlay(true);
      } else {
        setShowNextOverlay(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [id, type, title, poster, nextEpInfo]);

  // Auto-hide controls
  const showControls = () => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000);
  };

  const handleBack = () => {
    if (hls) hls.destroy();
    navigate(-1);
  };

  const handleNextEpisode = () => {
    if (nextEpInfo) {
      navigate(`/tv/${id}/season/${nextEpInfo.season}/episode/${nextEpInfo.episode}`);
    }
  };

  if (error) {
    return (
      <div className="player-error">
        <div className="empty-state">
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <h3>Playback Error</h3>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={handleBack} style={{ marginTop: '1rem' }}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="player-container"
      ref={containerRef}
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      {/* Top Controls */}
      <div className={`player-controls-top${controlsVisible ? ' visible' : ''}`}>
        <button className="btn btn-secondary btn-sm" onClick={handleBack}>← Back</button>
        <div className="player-title-box">
          <span className="player-title">{title}</span>
          {type === 'tv' && season && episode && (
            <span className="player-subtitle">S{season} E{episode}</span>
          )}
        </div>
      </div>

      {/* Video */}
      <video
        ref={videoRef}
        className="player-video"
        controls
        autoPlay
        playsInline
        poster={poster ? img.poster(poster) : undefined}
      />

      {/* Next Episode Overlay */}
      {showNextOverlay && nextEpInfo && (
        <div className="player-next-overlay">
          <div className="next-info">
            <span>Next Episode: Season {nextEpInfo.season} Ep {nextEpInfo.episode}</span>
            <button className="btn btn-gold btn-sm" onClick={handleNextEpisode}>Play Next ❯</button>
          </div>
        </div>
      )}

      {/* Initial Play Overlay */}
      <div className={`player-center${controlsVisible ? '' : ' hidden'}`}>
        <div className="player-title-large">{title}</div>
      </div>
    </div>
  );
}
