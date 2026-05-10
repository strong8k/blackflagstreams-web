import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getTVDetails, getSeasonDetails, getExternalIds, img } from '../lib/tmdb';
import { fetchAllStreams, classifyStream, getStreamTitle, buildPlayableUrl } from '../lib/addons';
import { searchIPTVVOD } from '../lib/iptv';
import { useStore } from '../lib/store';
import './DetailPage.css'; // Reuse detail page styles

const QUALITY_BADGES = {
  '4K':    { label: '4K',    color: '#d4a843', bg: 'rgba(212,168,67,0.15)' },
  '2160p': { label: '4K',    color: '#d4a843', bg: 'rgba(212,168,67,0.15)' },
  '1080p': { label: '1080p', color: '#4a9eff', bg: 'rgba(74,158,255,0.15)' },
  '720p':  { label: '720p',  color: '#2dd48a', bg: 'rgba(45,212,138,0.15)' },
  '480p':  { label: '480p',  color: '#8a8a9a', bg: 'rgba(138,138,154,0.12)' },
  'HDR':   { label: 'HDR',   color: '#e87c2e', bg: 'rgba(232,124,46,0.15)' },
  'CAM':   { label: 'CAM',   color: '#e84438', bg: 'rgba(232,68,56,0.12)' },
};

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

export default function EpisodePage() {
  const { id, season, ep } = useParams();
  const navigate = useNavigate();

  const [series, setSeries] = useState(null);
  const [episode, setEpisode] = useState(null);
  const [imdbId, setImdbId] = useState(null);
  const [streams, setStreams] = useState([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');

  const addons = useStore(s => s.addons);
  const activeProfile = useStore(s => s.activeProfile);
  const settings = useStore(s => s.settings);
  const tier = useStore(s => s.auth.tier);
  const addToast = useStore(s => s.addToast);
  const isPaid = ['premium', 'pro', 'ultra'].includes(tier);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setStreams([]);
    (async () => {
      try {
        const [sData, extIds] = await Promise.all([
          getTVDetails(id),
          getExternalIds('tv', id)
        ]);
        const seasonData = await getSeasonDetails(id, season);
        const epData = seasonData.episodes?.find(e => e.episode_number === Number(ep));

        if (cancelled) return;
        setSeries(sData);
        setEpisode(epData);
        if (extIds?.imdb_id) setImdbId(extIds.imdb_id);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          addToast('Failed to load episode info', 'error');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id, season, ep]);

  useEffect(() => {
    if (!loading && (imdbId || id) && addons.length > 0) loadStreams();
  }, [loading, imdbId, addons]);

  const loadStreams = async () => {
    if (!activeProfile) return;
    setStreamsLoading(true); setStreams([]);
    const enabledAddons = addons.filter(a => a.enabled && a.manifest);
    const stremioId = imdbId ? `${imdbId}:${season}:${ep}` : `tmdb:${id}:${season}:${ep}`;

    const results = await fetchAllStreams(enabledAddons, 'series', stremioId, id, (newStreams) => {
      setStreams(prev => {
        const combined = [...prev, ...newStreams];
        const seen = new Set();
        return combined.filter(s => {
          const key = s.url || s.infoHash || s.ytId || s.externalUrl || Math.random();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
    });

    setStreams(results);
    setStreamsLoading(false);
  };

  const handleStreamPlay = (stream) => {
    if (!activeProfile) { navigate('/onboarding'); return; }
    const cls = classifyStream(stream);
    const streamTitle = `${series?.name} - S${season}E${ep} - ${episode?.name}`;
    const baseParams = {
      title: streamTitle,
      id: String(id),
      type: 'tv',
      season,
      episode: ep,
      poster: episode?.still_path || series?.poster_path
    };

    if (cls === 'external') { window.open(stream.externalUrl, '_blank'); return; }
    if (cls === 'youtube') { window.open(`https://www.youtube.com/watch?v=${stream.ytId}`, '_blank'); return; }

    if (cls === 'needs-debrid') {
      const p = new URLSearchParams({ ...baseParams, infoHash: stream.infoHash });
      if (stream.fileIdx !== undefined) p.set('fileIdx', stream.fileIdx);
      navigate(`/player?${p.toString()}`);
      return;
    }
    const url = buildPlayableUrl(stream, settings.corsProxy);
    if (url) {
      const p = new URLSearchParams({ ...baseParams, url });
      navigate(`/player?${p.toString()}`);
    }
  };

  const filteredStreams = useMemo(() => {
    let list = streams;
    if (!isPaid) list = list.filter(s => classifyStream(s) !== 'needs-debrid');
    if (activeFilter === 'All') return list;
    return list.filter(s => parseQuality(s).includes(activeFilter));
  }, [streams, activeFilter, isPaid]);

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!episode) return <div className="page"><div className="empty-state"><h3>Episode not found</h3></div></div>;

  return (
    <div className="page detail-page">
      <div className="detail-backdrop" style={episode.still_path ? { backgroundImage: `url(${img.backdrop(episode.still_path)})` } : {}}>
        <div className="detail-backdrop-gradient" />
      </div>

      <div className="detail-content container">
        <div className="detail-layout">
          <div className="detail-poster-col">
            <img src={img.backdrop(episode.still_path || series?.backdrop_path, 'w500')} alt={episode.name} className="detail-poster" style={{ aspectRatio: '16/9' }} />
          </div>
          <div className="detail-info-col">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: '1rem' }}>← Back to Season</button>
            <h1 className="detail-title">{episode.name}</h1>
            <div className="detail-meta-row">
              <span className="detail-rating">S{season} E{ep}</span>
              {episode.air_date && <span>{new Date(episode.air_date).getFullYear()}</span>}
              {episode.runtime && <span>{episode.runtime}m</span>}
              {episode.vote_average > 0 && <span className="detail-rating">★ {episode.vote_average.toFixed(1)}</span>}
            </div>
            <p className="detail-overview">{episode.overview || 'No description available for this episode.'}</p>
          </div>
        </div>

        <section className="detail-streams-section container">
        <div className="streams-header">
          <h2 className="section-title">📡 Episode Streams</h2>
          <div className="streams-filters">
            <button className={`filter-btn ${activeFilter === 'All' ? 'active' : ''}`} onClick={() => setActiveFilter('All')}>All</button>
            <button className={`filter-btn ${activeFilter === '4K' ? 'active' : ''}`} onClick={() => setActiveFilter('4K')}>4K</button>
            <button className={`filter-btn ${activeFilter === '1080p' ? 'active' : ''}`} onClick={() => setActiveFilter('1080p')}>1080p</button>
            <button className="btn btn-secondary btn-sm" onClick={loadStreams} disabled={streamsLoading}>
              {streamsLoading ? 'Searching...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {!activeProfile ? (
          <div className="onboarding-gate-message glass-panel">
            <div className="gate-icon">🏴‍☠️</div>
            <h3>Streams are Locked</h3>
            <p>You must board the ship to discover and play streams. Choose your path:</p>
            <div className="gate-actions">
              <button className="btn btn-gold" onClick={() => navigate('/onboarding?tier=free')}>
                ⚓ Browse Free (No Account)
              </button>
              <button className="btn btn-primary" onClick={() => navigate('/onboarding')}>
                ⚔️ Upgrade for Premium Features
              </button>
            </div>
            <p className="gate-footer">Enjoy unlimited streaming, IPTV, and cloud sync by joining the crew.</p>
          </div>
        ) : (
          <div className="streams-list">
            {streamsLoading && streams.length === 0 && (
              <div className="streams-loading">
                <div className="spinner" />
                <p>Scouring the high seas for streams...</p>
              </div>
            )}
            
            {!streamsLoading && streams.length === 0 && (
              <div className="no-streams">
                <p>No streams found. Try adding more addons or check your connection.</p>
              </div>
            )}

            {filteredStreams.map((stream, idx) => {
              const cls = classifyStream(stream);
              const sTitle = getStreamTitle(stream);
              const quality = parseQuality(stream);
              return (
                <div key={idx} className="stream-card" onClick={() => handleStreamPlay(stream)}>
                  <div className="stream-card-left">
                    <span className={`stream-badge stream-badge-${cls}`}>
                      {cls === 'playable' || cls === 'needs-proxy' ? '▶' : cls === 'needs-debrid' ? '🧲' : '🔗'}
                    </span>
                    <div>
                      <div className="stream-title">{sTitle}</div>
                      <div className="stream-filename" style={{ opacity: 0.6, fontSize: '0.75rem' }}>{stream._addonName}</div>
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
        )}
      </section>
    </div>
    </div>
  );
}
