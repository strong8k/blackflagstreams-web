import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getMovieDetails, getTVDetails, getExternalIds, img, getCachedStreams, setCachedStreams } from '../lib/tmdb';
import { fetchAllStreams, classifyStream, getStreamTitle, buildPlayableUrl } from '../lib/addons';
import { searchIPTVVOD } from '../lib/iptv';
import { useStore } from '../lib/store';
import ContentRow from '../components/ContentRow';
import LogoSvg from '../assets/bfs.svg';
import './DetailPage.css';

// ── Quality parsing ──
const QUALITY_ORDER = ['4K', '2160p', '1080p', '720p', '480p', 'CAM'];
const QUALITY_BADGES = {
  '4K':    { label: '4K',    color: '#d4a843', bg: 'rgba(212,168,67,0.15)' },
  '2160p': { label: '4K',    color: '#d4a843', bg: 'rgba(212,168,67,0.15)' },
  '1080p': { label: '1080p', color: '#4a9eff', bg: 'rgba(74,158,255,0.15)' },
  '720p':  { label: '720p',  color: '#2dd48a', bg: 'rgba(45,212,138,0.15)' },
  '480p':  { label: '480p',  color: '#8a8a9a', bg: 'rgba(138,138,154,0.12)' },
  'HDR':   { label: 'HDR',   color: '#e87c2e', bg: 'rgba(232,124,46,0.15)' },
  'CAM':   { label: 'CAM',   color: '#e84438', bg: 'rgba(232,68,56,0.12)' },
};

const STREAM_FILTERS = ['All', '4K', '1080p', '720p', '480p', '360p', 'HDR'];

function parseQuality(stream) {
  const text = `${stream.title || ''} ${stream.name || ''}`;
  const tags = [];
  if (/\b(4K|2160p|UHD)\b/i.test(text)) tags.push('4K');
  else if (/\b1080p?\b/i.test(text)) tags.push('1080p');
  else if (/\b720p?\b/i.test(text)) tags.push('720p');
  else if (/\b480p?\b/i.test(text)) tags.push('480p');
  if (/\bHDR\b/i.test(text)) tags.push('HDR');
  if (/\bCAM\b/i.test(text)) tags.push('CAM');
  return tags;
}

function qualityRank(stream) {
  const q = parseQuality(stream);
  for (let i = 0; i < QUALITY_ORDER.length; i++) {
    if (q.includes(QUALITY_ORDER[i])) return i;
  }
  return 99;
}

function parseFileSize(stream) {
  const text = (stream.title || '') + ' ' + (stream.name || '') + ' ' + (stream.description || '');
  const m = text.match(/(\d+(?:\.\d+)?)\s*(GB|GiB|MB|MiB)/i);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  return /^g/i.test(m[2]) ? v * 1024 : v;
}

function isTorBox(stream) {
  const url = (stream.url || '').toLowerCase();
  const name = (stream._addonName || '').toLowerCase();
  const addonUrl = (stream._addonUrl || '').toLowerCase();
  return url.includes('torbox') || name.includes('torbox') || addonUrl.includes('torbox');
}

function streamSortKey(stream, enabledAddons) {
  const ai = enabledAddons.findIndex(ad => ad.manifest?.id === stream._addonId);
  const idx = ai === -1 ? 999 : ai;
  const tb = isTorBox(stream) ? -1 : 0; // TorBox first
  const q = qualityRank(stream);
  return `${tb}:${idx}:${q}`;
}

export default function DetailPage() {
  const { type, id } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [imdbId, setImdbId] = useState(null);
  const [streams, setStreams] = useState([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [iptvStream, setIptvStream] = useState(null);

  const addons = useStore(s => s.addons);
  const activeProfile = useStore(s => s.activeProfile);
  const settings = useStore(s => s.settings);
  const iptvProviders = useStore(s => s.iptvProviders);
  const addToWatchlist = useStore(s => s.addToWatchlist);
  const removeFromWatchlist = useStore(s => s.removeFromWatchlist);
  const isInWatchlist = useStore(s => s.isInWatchlist);
  const getProgress = useStore(s => s.getProgress);
  const addToast = useStore(s => s.addToast);

  const watchlist = useStore(s => s.watchlist);
  const inWatchlist = useMemo(() => isInWatchlist(Number(id), type), [id, type, watchlist]);
  const savedProgress = getProgress(Number(id), type);
  const tier = useStore(s => s.auth.tier);
  const isPaid = ['premium', 'pro', 'ultra'].includes(tier);

  // Load details
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setDetail(null); setImdbId(null); setStreams([]); setIptvStream(null); setActiveFilter('All');
    (async () => {
      try {
        const data = type === 'movie' ? await getMovieDetails(id) : await getTVDetails(id);
        if (cancelled) return;
        setDetail(data);
        const extIds = data.external_ids || await getExternalIds(type, id);
        if (extIds?.imdb_id) setImdbId(extIds.imdb_id);
        setLoading(false);
        
        // Search IPTV VOD in parallel
        const title = data.title || data.name;
        const year = (data.release_date || data.first_air_date || '').substring(0, 4);
        searchIPTVVOD(iptvProviders, title, year, type, settings.effectiveCorsProxy)
          .then(result => { if (!cancelled && result) setIptvStream(result.stream); })
          .catch(() => {});
      } catch (e) { if (!cancelled) { setError(e.message); setLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, [type, id]);

  // Auto-load streams for movies — wait until at least one addon has its manifest loaded
  useEffect(() => {
    if (type === 'movie' && (imdbId || id) && addons.some(a => a.enabled && a.manifest) && !loading) loadStreams();
  }, [imdbId, addons, loading]);

  const loadStreams = async (force = false) => {
    if (!imdbId && !id) { addToast('No ID found', 'warning'); return; }
    setStreamsLoading(true); setStreams([]);

    // Check cache first (skip if force refresh)
    if (!force) {
      const cached = await getCachedStreams(type, imdbId || id);
      if (cached && cached.length > 0) {
        setStreams(cached);
        setStreamsLoading(false);
        return;
      }
    }

    const enabledAddons = addons.filter(a => a.enabled && a.manifest);

    const results = await fetchAllStreams(enabledAddons, type === 'tv' ? 'series' : 'movie', imdbId || id, id,
      (newStreams) => {
        setStreams(prev => {
          const combined = [...prev, ...newStreams];
          const seen = new Set();
          return combined.filter(s => {
            const key = s.url || s.infoHash || s.ytId || s.externalUrl || null;
            if (!key) return true; // no dedup key, always include
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        });
      },
      settings.effectiveCorsProxy
    );

    const sorted = [...results].sort((a, b) => {
      const aTB = isTorBox(a) ? -1 : 0;
      const bTB = isTorBox(b) ? -1 : 0;
      if (aTB !== bTB) return aTB - bTB;
      const ai = enabledAddons.findIndex(ad => ad.manifest?.id === a._addonId);
      const bi = enabledAddons.findIndex(ad => ad.manifest?.id === b._addonId);
      if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      const qDiff = qualityRank(a) - qualityRank(b);
      if (qDiff !== 0) return qDiff;
      return parseFileSize(b) - parseFileSize(a);
    });

    setStreams(sorted);
    setStreamsLoading(false);
    // Cache for 2 hours
    setCachedStreams(type, imdbId || id, sorted);
    if (results.length === 0) addToast('No streams found. Try installing addons.', 'warning');
  };

  const handleStreamPlay = (stream, resume = false) => {
    const cls = classifyStream(stream);
    const streamTitle = detail?.title || detail?.name || 'Stream';
    const baseParams = { title: streamTitle, id: String(id), type };
    if (detail?.poster_path) baseParams.poster = detail.poster_path;
    if (resume && savedProgress) baseParams.resume = '1';

    if (cls === 'external') { window.open(stream.externalUrl, '_blank'); return; }
    if (cls === 'youtube') { window.open(`https://www.youtube.com/watch?v=${stream.ytId}`, '_blank'); return; }

    if (cls === 'needs-debrid') {
      const p = new URLSearchParams({ ...baseParams, infoHash: stream.infoHash });
      if (stream.fileIdx !== undefined) p.set('fileIdx', stream.fileIdx);
      navigate(`/player?${p.toString()}`);
      return;
    }
    const url = buildPlayableUrl(stream, settings.effectiveCorsProxy);
    if (url) {
      const p = new URLSearchParams({ ...baseParams, url });
      navigate(`/player?${p.toString()}`);
    }
  };

  const handleWatchlist = () => {
    if (inWatchlist) {
      removeFromWatchlist(Number(id), type);
      addToast('Removed from watchlist', 'info');
    } else {
      addToWatchlist({ id: Number(id), type, title: detail.title || detail.name, poster_path: detail.poster_path, backdrop_path: detail.backdrop_path, vote_average: detail.vote_average, release_date: detail.release_date || detail.first_air_date });
      addToast('Added to watchlist', 'success');
    }
  };

  const filteredStreams = useMemo(() => {
    let list = streams;
    if (!isPaid) list = list.filter(s => classifyStream(s) !== 'needs-debrid');
    if (activeFilter === 'All') return list;
    return list.filter(s => parseQuality(s).includes(activeFilter));
  }, [streams, activeFilter, isPaid]);

  const streamsByAddon = useMemo(() => {
    const groups = {};
    // IPTV always first
    if (iptvStream) {
      groups[iptvStream._addonName] = [iptvStream];
    }
    filteredStreams.forEach(s => {
      const name = s._addonName || 'Unknown';
      if (!groups[name]) groups[name] = [];
      groups[name].push(s);
    });
    return groups;
  }, [filteredStreams, iptvStream]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="page detail-page">
        <div className="detail-backdrop-skeleton" />
        <div className="detail-content container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <img src={LogoSvg} alt="Loading..." className="loading-logo-pulse" style={{ width: '120px', height: 'auto', filter: 'drop-shadow(0 0 24px var(--primary-glow))' }} />
            <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return <div className="page"><div className="empty-state"><h3>Failed to Load</h3><p>{error || 'Unknown error'}</p></div></div>;
  }

  const title = detail.title || detail.name;
  const year = (detail.release_date || detail.first_air_date || '').substring(0, 4);
  const runtime = detail.runtime ? `${detail.runtime}m` : detail.episode_run_time?.[0] ? `${detail.episode_run_time[0]}m/ep` : '';
  const genres = detail.genres?.map(g => g.name).join(' • ') || '';
  const trailer = detail.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
  const resumePercent = savedProgress?.percent || 0;

  return (
    <div className="page detail-page">
      {/* Backdrop */}
      <div className="detail-backdrop" style={detail.backdrop_path ? { backgroundImage: `url(${img.backdrop(detail.backdrop_path)})` } : {}}>
        <div className="detail-backdrop-gradient" />
      </div>

      <div className="detail-content container">
        <div className="detail-layout">
          {/* Poster */}
          <div className="detail-poster-col">
            {detail.poster_path ? (
              <img src={img.poster(detail.poster_path, 'w500')} alt={title} className="detail-poster" />
            ) : (
              <div className="detail-poster-placeholder">{title}</div>
            )}
            {resumePercent > 2 && resumePercent < 97 && (
              <div className="detail-progress-bar">
                <div className="detail-progress-fill" style={{ width: `${resumePercent}%` }} />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="detail-info-col">
            <h1 className="detail-title">{title}</h1>
            <div className="detail-meta-row">
              {year && <span>{year}</span>}
              {runtime && <span>{runtime}</span>}
              {detail.vote_average > 0 && <span className="detail-rating">★ {detail.vote_average.toFixed(1)}</span>}
              {genres && <span className="detail-genres">{genres}</span>}
            </div>

            {detail.tagline && <p className="detail-tagline">"{detail.tagline}"</p>}
            {detail.overview && <p className="detail-overview">{detail.overview}</p>}

            {/* Actions */}
            <div className="detail-actions">
              {type === 'movie' && savedProgress && resumePercent > 2 && resumePercent < 97 && streams.length > 0 && (
                <button className="btn btn-primary" onClick={() => handleStreamPlay(streams[0], true)}>
                  ▶ Resume
                </button>
              )}
              {type === 'movie' && (
                <button className="btn btn-secondary" onClick={() => loadStreams(true)}>
                  {streams.length > 0 ? '↻ Refresh' : '▶ Find Streams'}
                </button>
              )}
              <button className={`btn btn-secondary${inWatchlist ? ' in-wl' : ''}`} onClick={handleWatchlist}>
                {inWatchlist ? '✓ Watchlist' : '+ Watchlist'}
              </button>
              {trailer && (
                <button className="btn btn-ghost" onClick={() => window.open(`https://www.youtube.com/watch?v=${trailer.key}`, '_blank')}>
                  🎬 Trailer
                </button>
              )}
            </div>

            {/* Cast */}
            {detail.credits?.cast?.length > 0 && (
              <div className="detail-cast">
                <h3>Cast</h3>
                <p>{detail.credits.cast.slice(0, 8).map(c => c.name).join(', ')}</p>
              </div>
            )}

            {imdbId && <p className="detail-imdb">IMDB: {imdbId}</p>}
          </div>
        </div>

        {/* Seasons for TV */}
        {type === 'tv' && detail.seasons && (
          <div className="detail-seasons">
            <h2 className="section-title">Seasons</h2>
            <div className="season-tabs">
              {detail.seasons.filter(s => s.season_number > 0).map(s => (
                <button key={s.season_number} className="btn btn-secondary btn-sm" onClick={() => navigate(`/tv/${id}/season/${s.season_number}`)}>
                  S{s.season_number}
                  {s.episode_count && <span style={{ marginLeft: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>({s.episode_count})</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Streams */}
        {(streamsLoading || streams.length > 0 || iptvStream) && (
          <div className="detail-streams">
            <div className="detail-streams-header">
              <h2 className="section-title">
                {streamsLoading && streams.length === 0 ? (
                  <span className="stream-searching">⚡ Searching for streams...</span>
                ) : '🎯 Streams'}
              </h2>
              {streams.length > 0 && (
                <div className="stream-filters">
                  {STREAM_FILTERS.map(f => (
                    <button key={f} className={`stream-filter-btn${activeFilter === f ? ' active' : ''}`} onClick={() => setActiveFilter(f)}>
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {streamsLoading && streams.length === 0 ? (
              <div className="streams-skeleton">
                {[1, 2, 3, 4].map(n => (
                  <div key={n} className="skeleton" style={{ height: 48, borderRadius: 'var(--radius-sm)', opacity: 1 - n * 0.15 }} />
                ))}
              </div>
            ) : (
              <div className="stream-groups">
                {Object.entries(streamsByAddon).map(([addonName, addonStreams]) => (
                  <div key={addonName} className="stream-group">
                    <div className="stream-group-header">{addonName}</div>
                    <div className="stream-list">
                      {addonStreams.map((stream, i) => {
                        const cls = classifyStream(stream);
                        const sTitle = getStreamTitle(stream);
                        const quality = parseQuality(stream);
                        const key = stream.url || stream.infoHash || stream.ytId || stream.externalUrl || `s-${i}`;
                        return (
                          <div key={key} className="stream-card" onClick={() => handleStreamPlay(stream)}>
                            <div className="stream-card-left">
                              <span className={`stream-badge stream-badge-${cls}`}>
                                {cls === 'playable' || cls === 'needs-proxy' ? '▶' : cls === 'needs-debrid' ? '🧲' : '🔗'}
                              </span>
                              <div>
                                <div className="stream-title">{sTitle}</div>
                                {stream.behaviorHints?.filename && (
                                  <div className="stream-filename">{stream.behaviorHints.filename.slice(0, 60)}</div>
                                )}
                              </div>
                            </div>
                            <div className="stream-quality">
                              {quality.map(q => QUALITY_BADGES[q] && (
                                <span key={q} className="stream-quality-badge" style={{ color: QUALITY_BADGES[q].color, background: QUALITY_BADGES[q].bg }}>
                                  {QUALITY_BADGES[q].label}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {detail.recommendations?.results?.length > 0 && (
          <div style={{ marginTop: '2rem' }}>
            <ContentRow title="You Might Also Like" items={detail.recommendations.results} type={type} />
          </div>
        )}
      </div>
    </div>
  );
}
