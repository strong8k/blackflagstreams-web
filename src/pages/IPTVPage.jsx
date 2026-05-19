import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import { nanoid } from 'nanoid';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { getWorkerProxyUrl } from '../lib/auth';
import {
  xtreamGetLiveCategories, xtreamGetLiveStreams, xtreamStreamURL,
  xtreamGetEPG, decryptCreds, xtreamLogin, encryptCreds, parseM3U,
} from '../lib/iptv';
import './IPTVPage.css';

const PX_PER_MIN = 8;
const GUIDE_HOURS = 2;
const GUIDE_MINS = GUIDE_HOURS * 60;
const GUIDE_WIDTH = GUIDE_MINS * PX_PER_MIN; // 960px

// Xtream encodes EPG title/description in base64
function decodeEPG(str) {
  if (!str) return '';
  try { return atob(str); } catch { return str; }
}

async function resolveProvider(provider) {
  if (provider._enc) {
    try {
      const creds = await decryptCreds(provider._enc);
      return { ...provider, ...creds };
    } catch { return provider; }
  }
  return provider;
}

function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function epgMs(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val > 1e10 ? val : val * 1000;
  return new Date(val).getTime();
}

// Treat as HLS unless URL clearly has a non-HLS extension
const NON_HLS_EXTS = ['.mp4', '.mkv', '.avi', '.wmv', '.mov', '.flv', '.webm'];
function isHlsUrl(url) {
  const path = url.split('?')[0].toLowerCase();
  return !NON_HLS_EXTS.some(ext => path.endsWith(ext));
}

function buildHls(url, videoEl, proxy) {
  const hlsCfg = { enableWorker: true, lowLatencyMode: true };
  if (proxy) {
    const DefaultLoader = Hls.DefaultConfig.loader;
    hlsCfg.loader = class ProxyLoader extends DefaultLoader {
      load(ctx, cfg, cbs) {
        if (!ctx.url.startsWith(proxy)) ctx.url = `${proxy}?url=${encodeURIComponent(ctx.url)}`;
        super.load(ctx, cfg, cbs);
      }
    };
  }
  const hls = new Hls(hlsCfg);
  const proxied = proxy ? `${proxy}?url=${encodeURIComponent(url)}` : url;
  hls.loadSource(proxied);
  hls.attachMedia(videoEl);
  hls.on(Hls.Events.MANIFEST_PARSED, () => videoEl.play().catch(() => {}));
  return hls;
}

function playUrl(url, videoEl, hlsRef, proxy) {
  if (!videoEl) return;
  if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
  if (Hls.isSupported() && isHlsUrl(url)) {
    hlsRef.current = buildHls(url, videoEl, proxy);
  } else {
    const proxied = proxy ? `${proxy}?url=${encodeURIComponent(url)}` : url;
    videoEl.src = proxied;
    videoEl.play().catch(() => {});
  }
}

export default function IPTVPage() {
  const navigate = useNavigate();
  const providers = useStore(s => s.iptvProviders);
  const addIPTVProvider = useStore(s => s.addIPTVProvider);
  const updateIPTVProvider = useStore(s => s.updateIPTVProvider);
  const removeIPTVProvider = useStore(s => s.removeIPTVProvider);
  const addToast = useStore(s => s.addToast);
  const tier = useStore(s => s.auth.tier);

  // Provider / category / channel
  const [activeProvider, setActiveProvider] = useState(null);
  const [resolvedProv, setResolvedProv] = useState(null);
  const [allCats, setAllCats] = useState([]);
  const [visCats, setVisCats] = useState([]);
  const [catSearch, setCatSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [loadingCats, setLoadingCats] = useState(false);
  const [loadingChs, setLoadingChs] = useState(false);
  const [chError, setChError] = useState(null);

  // EPG
  const [epgMap, setEpgMap] = useState({});
  const [hoveredProg, setHoveredProg] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Player
  const previewRef = useRef(null);
  const fsRef = useRef(null);
  const previewHlsRef = useRef(null);
  const fsHlsRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStream, setHasStream] = useState(false);

  // Stats
  const [statsVisible, setStatsVisible] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const statsTimer = useRef(null);

  // Version ref — prevents stale category-load results from overwriting newer ones
  const loadVersionRef = useRef(0);

  // Add provider modal
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState('xtream');
  const [addServer, setAddServer] = useState('');
  const [addUser, setAddUser] = useState('');
  const [addPass, setAddPass] = useState('');
  const [addM3u, setAddM3u] = useState('');
  const [addEpgUrl, setAddEpgUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);

  // Manage provider modal
  const [manageProv, setManageProv] = useState(null);
  const [manageAllCats, setManageAllCats] = useState([]);
  const [manageCatSearch, setManageCatSearch] = useState('');
  const [showCatModal, setShowCatModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editServer, setEditServer] = useState('');
  const [editUser, setEditUser] = useState('');
  const [editPass, setEditPass] = useState('');
  const [editM3u, setEditM3u] = useState('');
  const [editEpgUrl, setEditEpgUrl] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);

  // Cleanup on unmount
  useEffect(() => () => {
    previewHlsRef.current?.destroy();
    fsHlsRef.current?.destroy();
    if (statsTimer.current) clearTimeout(statsTimer.current);
  }, []);

  // Tick nowMs every minute
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Init active provider
  useEffect(() => {
    if (providers.length > 0 && !activeProvider) {
      setActiveProvider(providers[0]);
    }
  }, [providers]);

  // Only reload when the active provider *ID* changes — NOT on property updates
  // (avoids triggering a full reload every time enabledCategories is toggled)
  useEffect(() => {
    if (!activeProvider) return;
    loadProviderCats(activeProvider);
  }, [activeProvider?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProviderCats = async (prov) => {
    setLoadingCats(true);
    setChannels([]);
    setAllCats([]);
    setVisCats([]);
    setActiveCategory(null);
    setEpgMap({});
    setChError(null);
    try {
      const rp = await resolveProvider(prov);
      setResolvedProv(rp);
      const proxy = getWorkerProxyUrl();
      let cats = [];
      if (prov.type === 'm3u') {
        const groups = [...new Set((prov.channels || []).map(c => c.group || 'Uncategorized'))];
        cats = groups.map(g => ({ category_id: g, category_name: g }));
      } else {
        cats = await xtreamGetLiveCategories(rp, proxy) || [];
      }
      setAllCats(cats);
      const enabled = prov.enabledCategories;
      const visible = enabled ? cats.filter(c => enabled.includes(c.category_id)) : cats;
      setVisCats(visible);
      if (visible.length > 0) {
        setActiveCategory(visible[0]);
        await loadCategoryChannels(rp, visible[0], prov);
      }
    } catch (e) {
      addToast(`Failed to load categories: ${e.message}`, 'error');
    }
    setLoadingCats(false);
  };

  const loadCategoryChannels = async (rp, cat, prov) => {
    const version = ++loadVersionRef.current;
    setLoadingChs(true);
    setChannels([]);
    setEpgMap({});
    setChError(null);
    try {
      const proxy = getWorkerProxyUrl();
      const provType = (prov || activeProvider)?.type;
      let chs = [];
      if (provType === 'm3u') {
        const allCh = (prov || activeProvider)?.channels || [];
        chs = allCh.filter(c => (c.group || 'Uncategorized') === cat.category_id);
      } else {
        chs = await xtreamGetLiveStreams(rp, cat.category_id, proxy) || [];
      }
      if (version !== loadVersionRef.current) return; // superseded by newer request
      setChannels(chs);
      if (provType !== 'm3u' && chs.length > 0) {
        fetchEPGBatch(rp, chs.slice(0, 60));
      }
    } catch (e) {
      if (version !== loadVersionRef.current) return;
      setChError(e.message || 'Failed to load channels');
    }
    if (version === loadVersionRef.current) setLoadingChs(false);
  };

  const fetchEPGBatch = async (rp, chs) => {
    const proxy = getWorkerProxyUrl();
    const results = await Promise.allSettled(
      chs.map(ch => xtreamGetEPG(rp, ch.stream_id, 8, proxy))
    );
    const map = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') map[chs[i].stream_id] = r.value?.epg_listings || [];
    });
    setEpgMap(prev => ({ ...prev, ...map }));
  };

  const selectCategory = async (cat) => {
    if (cat.category_id === activeCategory?.category_id) return;
    setActiveCategory(cat);
    setActiveChannel(null);
    if (resolvedProv) await loadCategoryChannels(resolvedProv, cat);
  };

  const selectChannel = useCallback(async (ch) => {
    setActiveChannel(ch);
    setHasStream(true);
    if (!resolvedProv) return;
    const url = resolvedProv.type === 'm3u'
      ? ch.url
      : xtreamStreamURL(resolvedProv, ch.stream_id, 'm3u8');
    playUrl(url, previewRef.current, previewHlsRef, getWorkerProxyUrl());
    if (resolvedProv.type !== 'm3u' && ch.stream_id && !epgMap[ch.stream_id]) {
      try {
        const epg = await xtreamGetEPG(resolvedProv, ch.stream_id, 8, getWorkerProxyUrl());
        setEpgMap(prev => ({ ...prev, [ch.stream_id]: epg?.epg_listings || [] }));
      } catch { /* silent */ }
    }
  }, [resolvedProv, epgMap]);

  const openFullscreen = useCallback(() => {
    if (!activeChannel || !resolvedProv) return;
    setIsFullscreen(true);
    const url = resolvedProv.type === 'm3u'
      ? activeChannel.url
      : xtreamStreamURL(resolvedProv, activeChannel.stream_id, 'm3u8');
    setTimeout(() => playUrl(url, fsRef.current, fsHlsRef, getWorkerProxyUrl()), 80);
  }, [activeChannel, resolvedProv]);

  const closeFullscreen = useCallback(() => {
    fsHlsRef.current?.destroy();
    fsHlsRef.current = null;
    if (fsRef.current) fsRef.current.src = '';
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && isFullscreen) closeFullscreen(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isFullscreen, closeFullscreen]);

  const handleShowStats = useCallback(() => {
    if (statsTimer.current) clearTimeout(statsTimer.current);
    const hls = isFullscreen ? fsHlsRef.current : previewHlsRef.current;
    const video = (isFullscreen ? fsRef : previewRef).current;
    let data = { width: '—', height: '—', bitrate: '—', fps: '—' };
    if (hls && hls.currentLevel >= 0) {
      const lvl = hls.levels?.[hls.currentLevel];
      if (lvl) {
        data = {
          width: lvl.width || '—',
          height: lvl.height || '—',
          bitrate: lvl.bitrate ? `${Math.round(lvl.bitrate / 1000)} kbps` : '—',
          fps: lvl.attrs?.['FRAME-RATE'] || '—',
        };
      }
    } else if (video?.videoWidth) {
      data = { width: video.videoWidth, height: video.videoHeight, bitrate: '—', fps: '—' };
    }
    setStatsData(data);
    setStatsVisible(true);
    statsTimer.current = setTimeout(() => setStatsVisible(false), 20000);
  }, [isFullscreen]);

  // ── Add Provider ──
  const handleAddProvider = async (e) => {
    e.preventDefault();
    setAddLoading(true); setAddError(null);
    try {
      const proxy = getWorkerProxyUrl();
      if (addMode === 'xtream') {
        if (!addServer || !addUser || !addPass) throw new Error('All fields required');
        await xtreamLogin(addServer, addUser, addPass, proxy);
        const enc = await encryptCreds({ username: addUser, password: addPass, _server: addServer });
        addIPTVProvider({
          id: nanoid(8), name: addName || `IPTV ${providers.length + 1}`,
          type: 'xtream', _enc: enc, _server: addServer,
          _username: addUser, _password: addPass, createdAt: Date.now(),
        });
        addToast(`${addName || `IPTV ${providers.length + 1}`} added!`, 'success');
      } else {
        if (!addM3u) throw new Error('M3U URL required');
        const res = await fetch(`${proxy}?url=${encodeURIComponent(addM3u)}`);
        const text = await res.text();
        const chs = parseM3U(text);
        const name = addName || 'M3U Playlist';
        addIPTVProvider({
          id: nanoid(8), name, type: 'm3u', m3uUrl: addM3u,
          epgUrl: addEpgUrl || undefined, channels: chs, createdAt: Date.now(),
        });
        addToast(`${name} added (${chs.length} channels)!`, 'success');
      }
      setShowAdd(false);
      setAddServer(''); setAddUser(''); setAddPass(''); setAddM3u(''); setAddName(''); setAddEpgUrl('');
    } catch (e) { setAddError(e.message || 'Failed'); }
    setAddLoading(false);
  };

  // ── Manage Provider ──
  const openManage = async (prov) => {
    const rp = await resolveProvider(prov);
    setEditName(prov.name || '');
    setEditServer(rp._server || '');
    setEditUser(rp._username || '');
    setEditPass(rp._password || '');
    setEditM3u(prov.m3uUrl || '');
    setEditEpgUrl(prov.epgUrl || '');
    setEditError(null);
    setManageCatSearch('');
    if (prov.type !== 'm3u') {
      try {
        const cats = await xtreamGetLiveCategories(rp, getWorkerProxyUrl()) || [];
        setManageAllCats(cats);
      } catch { setManageAllCats([]); }
    } else {
      const groups = [...new Set((prov.channels || []).map(c => c.group || 'Uncategorized'))];
      setManageAllCats(groups.map(g => ({ category_id: g, category_name: g })));
    }
    setManageProv(prov);
  };

  const handleSaveManage = async (e) => {
    e.preventDefault();
    if (!manageProv) return;
    setEditLoading(true); setEditError(null);
    try {
      const proxy = getWorkerProxyUrl();
      const updates = { name: editName || manageProv.name };
      let reloadNeeded = false;
      if (manageProv.type === 'xtream' && editServer && editUser && editPass) {
        await xtreamLogin(editServer, editUser, editPass, proxy);
        const enc = await encryptCreds({ username: editUser, password: editPass, _server: editServer });
        Object.assign(updates, { _enc: enc, _server: editServer, _username: editUser, _password: editPass });
        reloadNeeded = true;
      } else if (manageProv.type === 'm3u') {
        if (editM3u && editM3u !== manageProv.m3uUrl) { updates.m3uUrl = editM3u; reloadNeeded = true; }
        if (editEpgUrl !== (manageProv.epgUrl || '')) updates.epgUrl = editEpgUrl || undefined;
      }
      updateIPTVProvider(manageProv.id, updates);
      addToast('Provider updated', 'success');
      setManageProv(null);
      // If this is the active provider and creds changed, reload
      if (reloadNeeded && activeProvider?.id === manageProv.id) {
        const merged = { ...manageProv, ...updates };
        loadProviderCats(merged);
      }
    } catch (e) { setEditError(e.message || 'Save failed'); }
    setEditLoading(false);
  };

  // Category enable/disable — intentionally do NOT call setActiveProvider,
  // because that would trigger the useEffect and cause a full category reload
  const toggleCatEnabled = (catId) => {
    if (!manageProv) return;
    const cur = manageProv.enabledCategories;
    let next;
    if (!cur) {
      next = manageAllCats.map(c => c.category_id).filter(id => id !== catId);
    } else if (cur.includes(catId)) {
      next = cur.filter(id => id !== catId);
    } else {
      next = [...cur, catId];
    }
    const updated = { ...manageProv, enabledCategories: next };
    updateIPTVProvider(manageProv.id, { enabledCategories: next });
    setManageProv(updated);
    if (activeProvider?.id === manageProv.id) {
      setVisCats(next.length === 0 ? [] : allCats.filter(c => next.includes(c.category_id)));
    }
  };

  const enableAllCats = () => {
    if (!manageProv) return;
    updateIPTVProvider(manageProv.id, { enabledCategories: undefined });
    const updated = { ...manageProv, enabledCategories: undefined };
    setManageProv(updated);
    if (activeProvider?.id === manageProv.id) setVisCats(allCats);
  };

  const disableAllCats = () => {
    if (!manageProv) return;
    updateIPTVProvider(manageProv.id, { enabledCategories: [] });
    const updated = { ...manageProv, enabledCategories: [] };
    setManageProv(updated);
    if (activeProvider?.id === manageProv.id) setVisCats([]);
  };

  const filteredCats = useMemo(() => {
    const q = catSearch.toLowerCase();
    return q ? visCats.filter(c => c.category_name.toLowerCase().includes(q)) : visCats;
  }, [visCats, catSearch]);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let i = 0; i <= GUIDE_MINS; i += 30) {
      slots.push({ offsetMin: i, label: fmtTime(nowMs + i * 60000) });
    }
    return slots;
  }, [nowMs]);

  // ── Tier check ──
  if (!['account', 'premium', 'pro', 'ultra'].includes(tier)) {
    return (
      <div className="page iptv-page iptv-empty">
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📡</div>
          <h3>IPTV requires a free account</h3>
          <p style={{ marginBottom: '1.5rem' }}>Create a Deckhand account to watch live TV.</p>
          <button className="btn btn-primary" onClick={() => navigate('/onboarding')}>Sign Up Free</button>
        </div>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="page iptv-page iptv-empty">
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📡</div>
          <h3>No IPTV Provider</h3>
          <p style={{ marginBottom: '1.5rem' }}>Add an IPTV provider to start watching live TV.</p>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Add Provider</button>
        </div>
        {showAdd && (
          <AddProviderModal
            addMode={addMode} setAddMode={setAddMode}
            addServer={addServer} setAddServer={setAddServer}
            addUser={addUser} setAddUser={setAddUser}
            addPass={addPass} setAddPass={setAddPass}
            addM3u={addM3u} setAddM3u={setAddM3u}
            addEpgUrl={addEpgUrl} setAddEpgUrl={setAddEpgUrl}
            addName={addName} setAddName={setAddName}
            addLoading={addLoading} addError={addError}
            handleAddProvider={handleAddProvider}
            onClose={() => setShowAdd(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="iptv-page">
      {/* ── Top Bar ── */}
      <div className="iptv-topbar">
        <div className="iptv-providers-row">
          {providers.map(p => (
            <div key={p.id} className={`iptv-provider-chip${activeProvider?.id === p.id ? ' active' : ''}`}>
              <button className="iptv-provider-name" onClick={() => setActiveProvider(p)}>{p.name}</button>
              <button className="iptv-provider-manage" onClick={() => openManage(p)}>MANAGE</button>
            </div>
          ))}
          <button className="iptv-add-prov-btn" onClick={() => setShowAdd(true)}>+ ADD PROVIDER</button>
        </div>

        <div className="iptv-topbar-main">
          <div className="iptv-hover-info">
            {hoveredProg ? (
              <>
                <div className="iptv-hover-ch">{hoveredProg.ch}</div>
                <div className="iptv-hover-title">{hoveredProg.title}</div>
                {hoveredProg.description && (
                  <div className="iptv-hover-desc">{hoveredProg.description}</div>
                )}
              </>
            ) : activeChannel ? (
              <>
                <div className="iptv-hover-ch">{activeChannel.name}</div>
                {(() => {
                  const listings = epgMap[activeChannel.stream_id] || [];
                  const now = Date.now();
                  const cur = listings.find(l => epgMs(l.start) <= now && epgMs(l.stop) > now) || listings[0];
                  return cur ? (
                    <>
                      <div className="iptv-hover-title">{decodeEPG(cur.title)}</div>
                      {cur.description && <div className="iptv-hover-desc">{decodeEPG(cur.description)}</div>}
                    </>
                  ) : null;
                })()}
              </>
            ) : (
              <div className="iptv-hover-placeholder">Select a channel to begin</div>
            )}
          </div>

          <div className="iptv-preview-box">
            {hasStream ? (
              <video ref={previewRef} className="iptv-preview-video" autoPlay playsInline muted onDoubleClick={openFullscreen} />
            ) : (
              <div className="iptv-preview-placeholder"><span>📡</span></div>
            )}
            <div className="iptv-preview-controls">
              {hasStream && (
                <>
                  <button className="iptv-ctrl-btn" title="Stats" onClick={handleShowStats}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="2" y="14" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="14" rx="1"/><rect x="18" y="2" width="4" height="20" rx="1"/>
                    </svg>
                  </button>
                  <button className="iptv-ctrl-btn" title="Fullscreen" onClick={openFullscreen}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                  </button>
                </>
              )}
            </div>
            {statsVisible && statsData && !isFullscreen && (
              <div className="iptv-stats-overlay">
                <div>{statsData.width && statsData.height !== '—' ? `${statsData.width}×${statsData.height}` : '—'}</div>
                <div>FPS: {statsData.fps}</div>
                <div>{statsData.bitrate}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="iptv-body">
        <div className="iptv-cats-panel">
          <div className="iptv-cats-header">Categories</div>
          <div className="iptv-cats-search-wrap">
            <input className="iptv-cats-search" placeholder="Search..." value={catSearch} onChange={e => setCatSearch(e.target.value)} />
          </div>
          <div className="iptv-cats-toggles">
            <button className="iptv-mini-btn" onClick={() => {
              if (!activeProvider) return;
              updateIPTVProvider(activeProvider.id, { enabledCategories: undefined });
              setVisCats(allCats);
            }}>All On</button>
            <button className="iptv-mini-btn" onClick={() => {
              if (!activeProvider) return;
              updateIPTVProvider(activeProvider.id, { enabledCategories: [] });
              setVisCats([]);
            }}>All Off</button>
          </div>
          <div className="iptv-cats-list">
            {loadingCats ? (
              <div className="iptv-spinner-wrap"><div className="spinner" /></div>
            ) : filteredCats.length === 0 ? (
              <div className="iptv-cats-empty">No categories</div>
            ) : (
              filteredCats.map(cat => (
                <button
                  key={cat.category_id}
                  className={`iptv-cat-item${activeCategory?.category_id === cat.category_id ? ' active' : ''}`}
                  onClick={() => selectCategory(cat)}
                >
                  {cat.category_name}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="iptv-guide-outer">
          {loadingChs ? (
            <div className="iptv-spinner-wrap"><div className="spinner" /></div>
          ) : chError ? (
            <div className="iptv-guide-empty">
              <div style={{ marginBottom: '0.5rem', color: 'var(--accent)' }}>Failed to load channels</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>{chError}</div>
              <button className="btn btn-secondary" onClick={() => { if (resolvedProv && activeCategory) loadCategoryChannels(resolvedProv, activeCategory); }}>Retry</button>
            </div>
          ) : channels.length === 0 ? (
            <div className="iptv-guide-empty">
              {activeCategory ? 'No channels in this category.' : 'Select a category.'}
            </div>
          ) : (
            <div className="iptv-guide" tabIndex={0}>
              <div className="iptv-guide-time-row">
                <div className="iptv-guide-ch-stub" />
                <div className="iptv-guide-time-track" style={{ width: GUIDE_WIDTH }}>
                  {timeSlots.map(s => (
                    <div key={s.offsetMin} className="iptv-time-label" style={{ left: s.offsetMin * PX_PER_MIN }}>
                      {s.label}
                    </div>
                  ))}
                  <div className="iptv-now-header-line" />
                </div>
              </div>

              {channels.map((ch, i) => {
                const key = ch.stream_id ?? ch.url ?? i;
                const logo = ch.stream_icon || ch.logo;
                const isActive = activeChannel
                  ? (ch.stream_id != null ? ch.stream_id === activeChannel.stream_id : ch.url === activeChannel.url)
                  : false;
                const programs = epgMap[ch.stream_id] || [];

                return (
                  <div key={key} className={`iptv-guide-row${isActive ? ' active' : ''}`}>
                    <div
                      className="iptv-guide-ch-label"
                      onClick={() => selectChannel(ch)}
                      onDoubleClick={() => { selectChannel(ch); setTimeout(openFullscreen, 200); }}
                      title="Click to play • Double-click for fullscreen"
                    >
                      {logo && <img src={logo} alt="" className="iptv-ch-thumb" loading="lazy" />}
                      <span className="iptv-ch-label-name">{ch.name}</span>
                    </div>

                    <div className="iptv-guide-programs" style={{ width: GUIDE_WIDTH }}>
                      <div className="iptv-now-line" />
                      {programs.length === 0 ? (
                        <button
                          className="iptv-prog iptv-prog-empty"
                          style={{ left: 0, width: GUIDE_WIDTH - 2 }}
                          onClick={() => selectChannel(ch)}
                        >
                          {ch.name}
                        </button>
                      ) : programs.map((prog, pi) => {
                        const startMs = epgMs(prog.start_timestamp || prog.start);
                        const stopMs = epgMs(prog.stop_timestamp || prog.stop);
                        const left = Math.max(0, (startMs - nowMs) / 60000 * PX_PER_MIN);
                        const right = Math.min(GUIDE_WIDTH, (stopMs - nowMs) / 60000 * PX_PER_MIN);
                        const width = right - left;
                        if (width <= 2 || left >= GUIDE_WIDTH) return null;
                        const isNow = startMs <= nowMs && stopMs > nowMs;
                        const title = decodeEPG(prog.title);
                        const desc = decodeEPG(prog.description || prog.desc);
                        return (
                          <button
                            key={pi}
                            className={`iptv-prog${isNow ? ' iptv-prog-now' : ''}`}
                            style={{ left, width: width - 2 }}
                            onClick={() => selectChannel(ch)}
                            onMouseEnter={() => setHoveredProg({ title, description: desc, ch: ch.name })}
                            onMouseLeave={() => setHoveredProg(null)}
                          >
                            <span className="iptv-prog-title">{title}</span>
                            {width > 80 && <span className="iptv-prog-time">{fmtTime(startMs)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Fullscreen Overlay ── */}
      {isFullscreen && (
        <div className="iptv-fs-overlay">
          <video ref={fsRef} className="iptv-fs-video" autoPlay playsInline controls />
          <button className="iptv-fs-close" onClick={closeFullscreen} title="Close (Esc)">✕</button>
          <button className="iptv-fs-stats" onClick={handleShowStats} title="Stats">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="2" y="14" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="14" rx="1"/><rect x="18" y="2" width="4" height="20" rx="1"/>
            </svg>
          </button>
          {statsVisible && statsData && (
            <div className="iptv-stats-overlay iptv-stats-fs">
              <div>{statsData.width && statsData.height !== '—' ? `${statsData.width}×${statsData.height}` : '—'}</div>
              <div>FPS: {statsData.fps}</div>
              <div>{statsData.bitrate}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Add Provider Modal ── */}
      {showAdd && (
        <AddProviderModal
          addMode={addMode} setAddMode={setAddMode}
          addServer={addServer} setAddServer={setAddServer}
          addUser={addUser} setAddUser={setAddUser}
          addPass={addPass} setAddPass={setAddPass}
          addM3u={addM3u} setAddM3u={setAddM3u}
          addEpgUrl={addEpgUrl} setAddEpgUrl={setAddEpgUrl}
          addName={addName} setAddName={setAddName}
          addLoading={addLoading} addError={addError}
          handleAddProvider={handleAddProvider}
          onClose={() => { setShowAdd(false); setAddError(null); }}
        />
      )}

      {/* ── Manage Provider Modal ── */}
      {manageProv && !showCatModal && (
        <div className="iptv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setManageProv(null); }}>
          <div className="iptv-modal">
            <div className="iptv-modal-header">
              <h3>Manage: {manageProv.name}</h3>
              <button className="iptv-modal-close" onClick={() => setManageProv(null)}>✕</button>
            </div>
            <form onSubmit={handleSaveManage} className="iptv-modal-body">
              <label className="iptv-label">Provider Name</label>
              <input className="iptv-input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Provider name" />

              {manageProv.type === 'xtream' ? (
                <>
                  <label className="iptv-label">Server URL</label>
                  <input className="iptv-input" value={editServer} onChange={e => setEditServer(e.target.value)} placeholder="http://..." />
                  <label className="iptv-label">Username</label>
                  <input className="iptv-input" value={editUser} onChange={e => setEditUser(e.target.value)} placeholder="Username" />
                  <label className="iptv-label">Password</label>
                  <input className="iptv-input" type="password" value={editPass} onChange={e => setEditPass(e.target.value)} placeholder="Password" />
                </>
              ) : (
                <>
                  <label className="iptv-label">M3U URL</label>
                  <input className="iptv-input" value={editM3u} onChange={e => setEditM3u(e.target.value)} placeholder="https://..." />
                  <label className="iptv-label">EPG URL (optional)</label>
                  <input className="iptv-input" value={editEpgUrl} onChange={e => setEditEpgUrl(e.target.value)} placeholder="https://epg-provider.com/epg.xml" />
                </>
              )}

              {editError && <div className="iptv-error">{editError}</div>}

              <div className="iptv-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCatModal(true)}>
                  Edit Categories
                </button>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    removeIPTVProvider(manageProv.id);
                    if (activeProvider?.id === manageProv.id) {
                      const next = providers.find(p => p.id !== manageProv.id);
                      setActiveProvider(next || null);
                    }
                    setManageProv(null);
                    addToast('Provider removed', 'info');
                  }}
                >
                  Remove
                </button>
                <button type="submit" className="btn btn-primary" disabled={editLoading}>
                  {editLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Category Manager Modal ── */}
      {manageProv && showCatModal && (
        <div className="iptv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCatModal(false); }}>
          <div className="iptv-modal iptv-modal-wide">
            <div className="iptv-modal-header">
              <h3>Categories — {manageProv.name}</h3>
              <button className="iptv-modal-close" onClick={() => setShowCatModal(false)}>✕</button>
            </div>
            <div className="iptv-modal-body">
              <div className="iptv-catmgr-toolbar">
                <input
                  className="iptv-input"
                  placeholder="Search categories..."
                  value={manageCatSearch}
                  onChange={e => setManageCatSearch(e.target.value)}
                />
                <button className="iptv-mini-btn" onClick={enableAllCats}>Enable All</button>
                <button className="iptv-mini-btn" onClick={disableAllCats}>Disable All</button>
              </div>
              <div className="iptv-catmgr-list">
                {manageAllCats
                  .filter(c => !manageCatSearch || c.category_name.toLowerCase().includes(manageCatSearch.toLowerCase()))
                  .map(cat => {
                    const enabled = !manageProv.enabledCategories || manageProv.enabledCategories.includes(cat.category_id);
                    return (
                      <label key={cat.category_id} className="iptv-catmgr-item">
                        <input type="checkbox" checked={enabled} onChange={() => toggleCatEnabled(cat.category_id)} />
                        <span>{cat.category_name}</span>
                      </label>
                    );
                  })}
              </div>
              <div className="iptv-modal-actions">
                <button className="btn btn-primary" onClick={() => setShowCatModal(false)}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Provider Modal ──
function AddProviderModal({ addMode, setAddMode, addServer, setAddServer, addUser, setAddUser, addPass, setAddPass, addM3u, setAddM3u, addEpgUrl, setAddEpgUrl, addName, setAddName, addLoading, addError, handleAddProvider, onClose }) {
  return (
    <div className="iptv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="iptv-modal">
        <div className="iptv-modal-header">
          <h3>Add IPTV Provider</h3>
          <button className="iptv-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="iptv-modal-body">
          <div className="iptv-mode-tabs">
            <button className={`iptv-mode-tab${addMode === 'xtream' ? ' active' : ''}`} onClick={() => setAddMode('xtream')}>Xtream Codes</button>
            <button className={`iptv-mode-tab${addMode === 'm3u' ? ' active' : ''}`} onClick={() => setAddMode('m3u')}>M3U Playlist</button>
          </div>
          <form onSubmit={handleAddProvider}>
            <label className="iptv-label">Provider Name (optional)</label>
            <input className="iptv-input" value={addName} onChange={e => setAddName(e.target.value)} placeholder="My IPTV" />
            {addMode === 'xtream' ? (
              <>
                <label className="iptv-label">Server URL</label>
                <input className="iptv-input" value={addServer} onChange={e => setAddServer(e.target.value)} placeholder="http://server.com:8080" required />
                <label className="iptv-label">Username</label>
                <input className="iptv-input" value={addUser} onChange={e => setAddUser(e.target.value)} placeholder="username" required />
                <label className="iptv-label">Password</label>
                <input className="iptv-input" type="password" value={addPass} onChange={e => setAddPass(e.target.value)} placeholder="password" required />
              </>
            ) : (
              <>
                <label className="iptv-label">M3U URL</label>
                <input className="iptv-input" value={addM3u} onChange={e => setAddM3u(e.target.value)} placeholder="https://..." required />
                <label className="iptv-label">EPG URL (optional)</label>
                <input className="iptv-input" value={addEpgUrl} onChange={e => setAddEpgUrl(e.target.value)} placeholder="https://epg-provider.com/epg.xml" />
              </>
            )}
            {addError && <div className="iptv-error">{addError}</div>}
            <div className="iptv-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={addLoading}>
                {addLoading ? 'Connecting…' : 'Add Provider'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
