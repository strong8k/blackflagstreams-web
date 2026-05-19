import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import { useStore } from '../lib/store';
import { img, getNextEpisode, getTVDetails, getSeasonDetails } from '../lib/tmdb';
import { VERSION } from '../lib/version';
import './PlayerPage.css';

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export default function PlayerPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const hideTimer = useRef(null);
  const progressRef = useRef(null);

  const [error, setError] = useState(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [audioTracks, setAudioTracks] = useState([]);
  const [selectedSub, setSelectedSub] = useState(-1);
  const [selectedAudio, setSelectedAudio] = useState(-1);
  const [qualityLevels, setQualityLevels] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showNextOverlay, setShowNextOverlay] = useState(false);
  const [nextEpInfo, setNextEpInfo] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showEpisodePanel, setShowEpisodePanel] = useState(false);
  const [tvSeasons, setTvSeasons] = useState([]);
  const [seasonDetailMap, setSeasonDetailMap] = useState({});
  const [episodePanelLoading, setEpisodePanelLoading] = useState(false);

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
  const addToast = useStore(s => s.addToast);
  const savedProgress = id ? getProgress(Number(id), type) : null;

  useEffect(() => {
    if (!url) { setError('No stream URL provided'); return; }
    const video = videoRef.current;
    if (!video) return;
    let hls = null;
    if (Hls.isSupported() && (url.includes('m3u8') || url.endsWith('.m3u8'))) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setQualityLevels(data.levels || []);
        video.play().catch(() => {});
        if (resume && savedProgress?.progress) video.currentTime = savedProgress.progress;
      });
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
        setSubtitleTracks(data.subtitleTracks || []);
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
        setAudioTracks(data.audioTracks || []);
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) { setError(`Playback error: ${data.type}`); hls.destroy(); }
      });
      hlsRef.current = hls;
    } else {
      video.src = url;
      video.play().catch(() => {});
      if (resume && savedProgress?.progress) video.currentTime = savedProgress.progress;
    }
    if (type === 'tv' && id && season && episode) {
      getNextEpisode(id, season, episode).then(r => setNextEpInfo(r)).catch(() => {});
    }
    return () => { if (hls) hls.destroy(); };
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
    };
    const onVolumeChange = () => { setVolume(video.volume); setMuted(video.muted); };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('volumechange', onVolumeChange);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, []);

  useEffect(() => {
    if (!id || !type) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || !video.duration) return;
      updateProgress({
        id: Number(id), type, title, poster_path: poster || null,
        progress: video.currentTime, duration: video.duration,
        percent: (video.currentTime / video.duration) * 100,
        season: season ? Number(season) : null, episode: episode ? Number(episode) : null,
      });
      if (type === 'tv' && nextEpInfo && (video.duration - video.currentTime) < 20) setShowNextOverlay(true);
      else setShowNextOverlay(false);
    }, 2000);
    return () => clearInterval(interval);
  }, [id, type, title, poster, nextEpInfo]);

  useEffect(() => {
    const onKey = (e) => {
      const v = videoRef.current;
      if (!v || e.target.tagName === 'INPUT') return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); v.currentTime = Math.min(v.currentTime + 10, v.duration); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); v.currentTime = Math.max(v.currentTime - 10, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); v.volume = Math.min(v.volume + 0.1, 1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); v.volume = Math.max(v.volume - 0.1, 0); }
      else if (e.key === 'm') v.muted = !v.muted;
      else if (e.key === 'f') doToggleFullscreen();
      else if (e.key === 'Escape' && !document.fullscreenElement) navigate(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const showControlsFn = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setControlsVisible(false);
    }, 3000);
  }, []);

  const handlePlayPause = () => { const v = videoRef.current; if (v) v.paused ? v.play() : v.pause(); };
  const handleSeek = (e) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
  };
  const handleVolume = (e) => { const v = videoRef.current; if (v) { v.volume = Number(e.target.value); v.muted = false; } };
  const toggleMute = () => { const v = videoRef.current; if (v) v.muted = !v.muted; };
  const doToggleFullscreen = () => {
    const el = containerRef.current;
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  };
  const selectSubtitle = (idx) => { setSelectedSub(idx); setShowSubMenu(false); if (hlsRef.current) hlsRef.current.subtitleTrack = idx; };
  const selectAudio = (idx) => { setSelectedAudio(idx); setShowAudioMenu(false); if (hlsRef.current) hlsRef.current.audioTrack = idx; };
  const selectQuality = (idx) => { setSelectedQuality(idx); setShowQualityMenu(false); if (hlsRef.current) hlsRef.current.currentLevel = idx; };
  const handleBack = () => { if (hlsRef.current) hlsRef.current.destroy(); navigate(-1); };
  const handleNextEpisode = () => { if (nextEpInfo) navigate(`/tv/${id}/season/${nextEpInfo.season}/episode/${nextEpInfo.episode}`); };
  const handleEpisodes = async () => {
    if (type !== 'tv' || !id) return;
    if (tvSeasons.length > 0) { setShowEpisodePanel(true); return; }
    setEpisodePanelLoading(true);
    setShowEpisodePanel(true);
    try {
      const detail = await getTVDetails(Number(id));
      const seasons = detail.seasons?.filter(s => s.season_number > 0) || [];
      setTvSeasons(seasons);
      // Pre-fetch current season details
      const currentSeasonNum = Number(season) || seasons[0]?.season_number || 1;
      const sData = await getSeasonDetails(Number(id), currentSeasonNum);
      setSeasonDetailMap(prev => ({ ...prev, [currentSeasonNum]: sData.episodes || [] }));
    } catch { setTvSeasons([]); }
    setEpisodePanelLoading(false);
  };

  const handleSeasonExpand = async (sNum) => {
    if (seasonDetailMap[sNum]) return;
    try {
      const sData = await getSeasonDetails(Number(id), sNum);
      setSeasonDetailMap(prev => ({ ...prev, [sNum]: sData.episodes || [] }));
    } catch {}
  };

  const handleEpisodeSelect = (sNum, epNum, epName) => {
    const epTitle = epName ? `${seriesName || title} - S${sNum}E${epNum} - ${epName}` : title;
    setShowEpisodePanel(false);
    navigate(`/player?url=${encodeURIComponent(url || '')}&title=${encodeURIComponent(epTitle)}&poster=${encodeURIComponent(poster || '')}&type=tv&id=${id}&season=${sNum}&episode=${epNum}`);
  };
  const handleSkipBack = () => { const v = videoRef.current; if (v) { v.currentTime = Math.max(v.currentTime - 10, 0); showControlsFn(); } };
  const handleSkipForward = () => { const v = videoRef.current; if (v && duration) { v.currentTime = Math.min(v.currentTime + 10, duration); showControlsFn(); } };
  const handlePiP = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled) await videoRef.current?.requestPictureInPicture();
    } catch {}
  };
  const handleSpeedChange = (speed) => { const v = videoRef.current; if (v) { v.playbackRate = speed; setPlaybackSpeed(speed); } setShowSpeedMenu(false); };
  const handleExternalPlayer = () => { const src = videoRef.current?.currentSrc || videoRef.current?.src || url; if (src) window.open(src, '_blank', 'noopener'); };
  const handleCast = () => { addToast('Use browser menu (Γï«) ΓåÆ Cast or right-click the video', 'info'); };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  if (error) {
    return (
      <div className="player-error">
        <div className="empty-state">
          <div style={{ fontSize: '3rem' }}>&#9888;&#65039;</div>
          <h3>Playback Error</h3><p>{error}</p>
          <button className="btn btn-primary" onClick={handleBack} style={{ marginTop: '1rem' }}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`player-container${controlsVisible ? '' : ' controls-hidden'}`}
      ref={containerRef}
      onMouseMove={showControlsFn}
      onTouchStart={showControlsFn}
      onDoubleClick={doToggleFullscreen}
      onClick={() => { setShowSubMenu(false); setShowAudioMenu(false); setShowQualityMenu(false); setShowSpeedMenu(false); }}
    >
      <video ref={videoRef} className="player-video" autoPlay playsInline poster={poster ? img.poster(poster) : undefined} />

      <div className="player-top">
        <button className="player-back-btn" onClick={handleBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="player-header-title">
          <span className="player-title">{title}</span>
          {type === 'tv' && season && episode && (
            <span className="player-subtitle-ep">Season {season} &middot; Episode {episode}</span>
          )}
        </div>
      </div>

      <div className="player-bottom">
        <div className="player-progress" ref={progressRef} onClick={handleSeek}>
          <div className="player-progress-track">
            <div className="player-progress-buffered" style={{ width: `${bufferedPct}%` }} />
            <div className="player-progress-played" style={{ width: `${progressPct}%` }}>
              <div className="player-progress-thumb" />
            </div>
          </div>
        </div>

        <div className="player-controls-row">
          <div className="player-controls-left">
            <button className="player-btn" onClick={handlePlayPause} title={playing ? 'Pause' : 'Play'}>
              {playing ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              )}
            </button>

            <button className="player-btn" onClick={handleSkipBack} title="Skip back 10s">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
              <span className="player-btn-badge">10</span>
            </button>

            <button className="player-btn" onClick={handleSkipForward} title="Skip forward 10s">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              <span className="player-btn-badge">10</span>
            </button>

            <div className="player-volume-group">
              <button className="player-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
                {(muted || volume === 0) ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                ) : volume < 0.5 ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                )}
              </button>
              <input className="player-volume-slider" type="range" min="0" max="1" step="0.05"
                value={muted ? 0 : volume} onChange={handleVolume} onClick={e => e.stopPropagation()} />
            </div>

            <span className="player-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>

          <div className="player-controls-right">
            {/* Playback Speed */}
            <div className="player-menu-wrap" onClick={e => e.stopPropagation()}>
              <button className={`player-btn${showSpeedMenu ? ' active' : ''}${playbackSpeed !== 1 ? ' on' : ''}`}
                onClick={() => { setShowSpeedMenu(s => !s); setShowSubMenu(false); setShowQualityMenu(false); }} title="Playback Speed">
                <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{playbackSpeed}x</span>
              </button>
              {showSpeedMenu && (
                <div className="player-popup-menu">
                  <div className="player-menu-title">Speed</div>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                    <button key={s} className={`player-menu-item${playbackSpeed === s ? ' selected' : ''}`} onClick={() => handleSpeedChange(s)}>{s}x</button>
                  ))}
                </div>
              )}
            </div>

            {/* Audio Tracks */}
            <div className="player-menu-wrap" onClick={e => e.stopPropagation()}>
              <button className={`player-btn${showAudioMenu ? ' active' : ''}${selectedAudio !== -1 ? ' on' : ''}`}
                onClick={() => { setShowAudioMenu(s => !s); setShowSubMenu(false); setShowQualityMenu(false); setShowSpeedMenu(false); }} title="Audio Track">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10v4"/><path d="M6 6v12"/><path d="M10 3v18"/><path d="M14 8v8"/><path d="M18 5v14"/><path d="M22 10v4"/>
                </svg>
              </button>
              {showAudioMenu && (
                <div className="player-popup-menu">
                  <div className="player-menu-title">Audio</div>
                  {audioTracks.length === 0 && <div className="player-menu-item" style={{ cursor: 'default', color: 'var(--text-muted)' }}>Default</div>}
                  {audioTracks.map((t, i) => (
                    <button key={i} className={`player-menu-item${selectedAudio === i ? ' selected' : ''}`} onClick={() => selectAudio(i)}>
                      {t.name || t.lang || `Track ${i + 1}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subtitles */}
            <div className="player-menu-wrap" onClick={e => e.stopPropagation()}>
              <button className={`player-btn${showSubMenu ? ' active' : ''}${selectedSub !== -1 ? ' on' : ''}`}
                onClick={() => { setShowSubMenu(s => !s); setShowQualityMenu(false); setShowSpeedMenu(false); }} title="Subtitles">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="13" rx="2"/><path d="M7 12h10M7 16h6"/>
                </svg>
              </button>
              {showSubMenu && (
                <div className="player-popup-menu">
                  <div className="player-menu-title">Subtitles</div>
                  <button className={`player-menu-item${selectedSub === -1 ? ' selected' : ''}`} onClick={() => selectSubtitle(-1)}>Off</button>
                  {subtitleTracks.length === 0 && <div className="player-menu-item" style={{ cursor: 'default', color: 'var(--text-muted)' }}>None found</div>}
                  {subtitleTracks.map((t, i) => (
                    <button key={i} className={`player-menu-item${selectedSub === i ? ' selected' : ''}`} onClick={() => selectSubtitle(i)}>
                      {t.name || t.lang || `Track ${i + 1}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quality */}
            {qualityLevels.length > 1 && (
              <div className="player-menu-wrap" onClick={e => e.stopPropagation()}>
                <button className={`player-btn${showQualityMenu ? ' active' : ''}`}
                  onClick={() => { setShowQualityMenu(s => !s); setShowSubMenu(false); setShowSpeedMenu(false); }} title="Quality">
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
                  </svg>
                </button>
                {showQualityMenu && (
                  <div className="player-popup-menu">
                    <div className="player-menu-title">Quality</div>
                    <button className={`player-menu-item${selectedQuality === -1 ? ' selected' : ''}`} onClick={() => selectQuality(-1)}>Auto</button>
                    {qualityLevels.map((l, i) => (
                      <button key={i} className={`player-menu-item${selectedQuality === i ? ' selected' : ''}`} onClick={() => selectQuality(i)}>
                        {l.height}p{l.bitrate > 4000000 ? ' HD' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Episodes (TV only) */}
            {type === 'tv' && (
              <button className="player-btn" onClick={handleEpisodes} title="Episodes">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </button>
            )}

            {/* Cast */}
            <button className="player-btn" onClick={handleCast} title="Cast">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 16.1A5 5 0 0 1 4.5 17c1.3 0 2.5.6 3.5 1.6"/><path d="M2 12.1A9 9 0 0 1 4.5 13c2.4 0 4.7.8 6.5 2.4"/><path d="M2 8.1A13 13 0 0 1 7 10c2.8.1 5.6 1 8 2.6"/><circle cx="5" cy="19" r="2"/>
              </svg>
            </button>

            {/* PiP */}
            <button className="player-btn" onClick={handlePiP} title="Picture in Picture">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><rect x="12" y="8" width="8" height="6" rx="1"/>
              </svg>
            </button>

            {/* External Player */}
            <button className="player-btn" onClick={handleExternalPlayer} title="Open in external player">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </button>

            {/* Fullscreen */}
            <button className="player-btn" onClick={doToggleFullscreen} title={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
              {fullscreen ? (
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
              ) : (
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {showNextOverlay && nextEpInfo && (
        <div className="player-next-overlay">
          <div className="next-info">
            <span>Next: S{nextEpInfo.season} E{nextEpInfo.episode}</span>
            <button className="btn btn-gold btn-sm" onClick={handleNextEpisode}>Play Next</button>
          </div>
        </div>
      )}

      <div className="player-version">{VERSION}</div>

      {/* Episode Selector Panel (TV only) */}
      {showEpisodePanel && (
        <>
          <div className="episode-panel-overlay" onClick={() => setShowEpisodePanel(false)} />
          <div className="episode-panel" onClick={e => e.stopPropagation()}>
            <div className="episode-panel-header">
              <h3>Episodes</h3>
              <button className="player-btn" onClick={() => setShowEpisodePanel(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="episode-panel-body">
              {episodePanelLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" /></div>
              ) : tvSeasons.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No episodes found</p>
              ) : (
                tvSeasons.map(s => {
                  const eps = seasonDetailMap[s.season_number];
                  const isCurrentSeason = s.season_number === Number(season);
                  return (
                  <details key={s.season_number} className="episode-season" open={isCurrentSeason}
                    onToggle={e => { if (e.target.open) handleSeasonExpand(s.season_number); }}>
                    <summary className="episode-season-title">
                      Season {s.season_number}
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>({s.episode_count} episodes)</span>
                    </summary>
                    <div className="episode-list">
                      {eps ? eps.map(ep => (
                        <button
                          key={ep.episode_number}
                          className={`episode-item${isCurrentSeason && ep.episode_number === Number(episode) ? ' current' : ''}`}
                          onClick={() => handleEpisodeSelect(s.season_number, ep.episode_number, ep.name)}
                        >
                          <div className="episode-thumb">
                            {ep.still_path ? (
                              <img src={img.backdrop(ep.still_path, 'w300')} alt={ep.name} loading="lazy" />
                            ) : (
                              <div className="episode-thumb-placeholder">{ep.episode_number}</div>
                            )}
                          </div>
                          <div className="episode-info">
                            <span className="episode-title">
                              <span className="episode-num">E{String(ep.episode_number).padStart(2, '0')}</span>
                              {ep.name || `Episode ${ep.episode_number}`}
                            </span>
                            {ep.overview && <span className="episode-overview">{ep.overview.slice(0, 100)}{ep.overview.length > 100 ? '...' : ''}</span>}
                            {ep.runtime > 0 && <span className="episode-meta">{ep.runtime}m</span>}
                          </div>
                        </button>
                      )) : (
                        <div className="episode-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>
                          <div className="spinner" style={{ margin: '0.5rem auto' }} />
                        </div>
                      )}
                    </div>
                  </details>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
