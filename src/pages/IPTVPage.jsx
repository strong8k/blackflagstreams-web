import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Hls from 'hls.js';
import { useStore } from '../lib/store';
import { xtreamGetLiveCategories, xtreamGetLiveStreams, xtreamStreamURL, xtreamGetEPG, decryptCreds } from '../lib/iptv';
import './IPTVPage.css';

export default function IPTVPage() {
  const navigate = useNavigate();
  const providers = useStore(s => s.iptvProviders);
  const tier = useStore(s => s.auth.tier);

  const [categories, setCategories] = useState([]);
  const [channels, setChannels] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [epgData, setEpgData] = useState([]);
  const [streamUrl, setStreamUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // Load provider and categories
  useEffect(() => {
    if (providers.length === 0) {
      setLoading(false);
      setError('no-provider');
      return;
    }
    loadProvider(providers[0]);
  }, [providers]);

  const loadProvider = async (provider) => {
    setLoading(true); setError(null);
    try {
      if (provider.type === 'm3u') {
        const allChannels = provider.channels || [];
        const groups = [...new Set(allChannels.map(ch => ch.group || 'Uncategorized'))];
        const cats = groups.map(g => ({ category_id: g, category_name: g }));
        setCategories(cats);
        if (cats.length > 0) {
          setActiveCategory(cats[0]);
          setChannels(allChannels.filter(ch => (ch.group || 'Uncategorized') === cats[0].category_id));
        }
      } else {
        const creds = provider._enc ? await decryptCreds(provider._enc) : null;
        const p = creds ? { ...provider, ...creds } : provider;
        const cats = await xtreamGetLiveCategories(p);
        setCategories(cats || []);
        if (cats?.length > 0) {
          setActiveCategory(cats[0]);
          const chs = await xtreamGetLiveStreams(p, cats[0].category_id);
          setChannels(chs || []);
        }
      }
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const selectCategory = async (cat) => {
    setActiveCategory(cat);
    setChannels([]);
    const provider = providers[0];
    if (provider.type === 'm3u') {
      const allChannels = provider.channels || [];
      setChannels(allChannels.filter(ch => (ch.group || 'Uncategorized') === cat.category_id));
      return;
    }
    const creds = provider._enc ? await decryptCreds(provider._enc) : null;
    const p = creds ? { ...provider, ...creds } : provider;
    try {
      const chs = await xtreamGetLiveStreams(p, cat.category_id);
      setChannels(chs || []);
    } catch { setChannels([]); }
  };

  const playUrl = (url) => {
    if (!videoRef.current) return;
    if (hlsRef.current) hlsRef.current.destroy();
    if (Hls.isSupported() && (url.includes('.m3u8') || !url.includes('.'))) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => videoRef.current.play().catch(() => {}));
      hlsRef.current = hls;
    } else {
      videoRef.current.src = url;
      videoRef.current.play().catch(() => {});
    }
    setStreamUrl(url);
  };

  const selectChannel = async (ch) => {
    setActiveChannel(ch);
    const provider = providers[0];

    if (provider.type === 'm3u') {
      setEpgData([]);
      playUrl(ch.url);
      return;
    }

    const creds = provider._enc ? await decryptCreds(provider._enc) : null;
    const p = creds ? { ...provider, ...creds } : provider;

    try {
      const epg = await xtreamGetEPG(p, ch.stream_id);
      setEpgData(epg?.epg_listings || []);
    } catch { setEpgData([]); }

    playUrl(xtreamStreamURL(p, ch.stream_id));
  };

  if (!['account', 'premium', 'pro', 'ultra'].includes(tier)) {
    return (
      <div className="page iptv-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📡</div>
          <h3>IPTV requires a free account</h3>
          <p style={{ marginBottom: '1.5rem' }}>Create a Deckhand account to watch live TV. It's free.</p>
          <button className="btn btn-primary" onClick={() => navigate('/onboarding')}>Sign Up Free</button>
        </div>
      </div>
    );
  }

  if (error === 'no-provider') {
    return (
      <div className="page iptv-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📡</div>
          <h3>No IPTV Provider</h3>
          <p style={{ marginBottom: '1.5rem' }}>Add an IPTV provider to start watching live TV.</p>
          <button className="btn btn-primary" onClick={() => navigate('/iptv/setup')}>Add Provider</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page iptv-page">
      <div className="iptv-layout">
        {/* Categories sidebar */}
        <div className="iptv-categories">
          <div className="iptv-cat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Categories</span>
            <Link to="/iptv/setup" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textDecoration: 'none' }}>Manage</Link>
          </div>
          <div className="iptv-cat-list">
            {categories.map(cat => (
              <button
                key={cat.category_id}
                className={`iptv-cat-item${activeCategory?.category_id === cat.category_id ? ' active' : ''}`}
                onClick={() => selectCategory(cat)}
              >
                {cat.category_name}
              </button>
            ))}
          </div>
        </div>

        {/* Channel list */}
        <div className="iptv-channels">
          <div className="iptv-ch-header">
            {activeCategory?.category_name || 'Channels'}
          </div>
          <div className="iptv-ch-list">
            {loading ? (
              <div className="empty-state"><div className="spinner" /></div>
            ) : channels.length === 0 ? (
              <p className="empty-state">No channels in this category.</p>
            ) : (
              channels.map((ch, i) => {
                const key = ch.stream_id ?? ch.url ?? i;
                const logo = ch.stream_icon || ch.logo;
                const isActive = activeChannel
                  ? (ch.stream_id != null ? activeChannel.stream_id === ch.stream_id : activeChannel.url === ch.url)
                  : false;
                return (
                  <button
                    key={key}
                    className={`iptv-ch-item${isActive ? ' active' : ''}`}
                    onClick={() => selectChannel(ch)}
                  >
                    {logo && <img src={logo} alt="" className="iptv-ch-logo" loading="lazy" />}
                    <div className="iptv-ch-info">
                      <div className="iptv-ch-name">{ch.name}</div>
                      {ch.epg_channel_id && (
                        <div className="iptv-ch-epg">{ch.epg_channel_id}</div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Player + EPG */}
        <div className="iptv-player-panel">
          {/* Video player */}
          <div className="iptv-player">
            {activeChannel ? (
              <video ref={videoRef} className="iptv-video" controls autoPlay playsInline />
            ) : (
              <div className="iptv-player-placeholder">
                <div style={{ fontSize: '3rem' }}>📡</div>
                <p>Select a channel to start watching</p>
              </div>
            )}
          </div>

          {/* EPG info */}
          {activeChannel && (
            <div className="iptv-epg">
              <div className="iptv-epg-header">
                <div className="iptv-epg-channel-name">
                  {(activeChannel.stream_icon || activeChannel.logo) && (
                    <img src={activeChannel.stream_icon || activeChannel.logo} alt="" className="iptv-epg-logo" />
                  )}
                  <div>
                    <strong>{activeChannel.name}</strong>
                    {activeChannel.epg_channel_id && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{activeChannel.epg_channel_id}</div>
                    )}
                  </div>
                </div>
              </div>
              <div className="iptv-epg-list">
                {epgData.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', padding: '1rem', fontSize: '0.8rem' }}>No program guide available</p>
                ) : (
                  epgData.map((epg, i) => (
                    <div key={i} className="iptv-epg-item">
                      <div className="iptv-epg-time">
                        {new Date(epg.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' - '}
                        {new Date(epg.stop).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="iptv-epg-title">{epg.title}</div>
                      {epg.description && (
                        <div className="iptv-epg-desc">{epg.description}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
