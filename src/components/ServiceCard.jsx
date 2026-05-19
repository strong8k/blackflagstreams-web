import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../lib/store';
import {
  getTraktAuthUrl, getTraktStatus, disconnectTrakt, syncTraktHistory as syncTraktApi,
  getStremioAuthCode, pollStremioAuth, disconnectStremio, importStremioLibrary,
  connectTorBox, disconnectTorBox,
  connectRD, disconnectRD,
  getADAuthCode, pollADAuth, disconnectAD,
  connectRPDB, disconnectRPDB,
} from '../lib/services';
import './ServiceCard.css';

const SERVICE_META = {
  trakt: {
    name: 'Trakt', icon: '🎬', color: '#ed1c24',
    desc: 'Two-way watch history sync',
  },
  stremio: {
    name: 'Stremio', icon: '📺', color: '#6c5ce7',
    desc: 'Import library and watch history',
  },
  torbox: {
    name: 'TorBox', icon: '⚡', color: '#6366f1',
    desc: 'Instant cached torrent streaming',
  },
  realdebrid: {
    name: 'Real-Debrid', icon: '🔥', color: '#1a9cef',
    desc: 'Premium unrestricted downloading',
  },
  alldebrid: {
    name: 'All-Debrid', icon: '💎', color: '#8b5cf6',
    desc: 'Debrid with broad hoster support',
  },
  rpdb: {
    name: 'RPDB', icon: '🖼️', color: '#f59e0b',
    desc: 'Rating posters for your library',
  },
};

export default function ServiceCard({ serviceKey }) {
  const meta = SERVICE_META[serviceKey];
  const services = useStore(s => s.services);
  const svc = services[serviceKey] || {};
  const connected = svc.connected || false;

  const addToast = useStore(s => s.addToast);
  const setServiceStatus = useStore(s => s.setServiceStatus);
  const connectService = useStore(s => s.connectService);
  const disconnectService = useStore(s => s.disconnectService);
  const bulkImport = useStore(s => s.bulkImport);
  const mergeStremioLibrary = useStore(s => s.mergeStremioLibrary);

  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [authCode, setAuthCode] = useState(null);
  const [authLink, setAuthLink] = useState(null);
  const [stremioCode, setStremioCode] = useState(null);
  const [stremioLink, setStremioLink] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Trakt ──
  const handleConnectTrakt = useCallback(async () => {
    setBusy(true);
    try {
      const { authorizeUrl } = await getTraktAuthUrl();
      const w = 600, h = 700;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(authorizeUrl, 'trakt-auth', `width=${w},height=${h},left=${left},top=${top}`);
      if (!popup) { addToast('Popup blocked. Allow popups for this site.', 'error'); setBusy(false); return; }
      const check = setInterval(async () => {
        if (popup.closed) {
          clearInterval(check);
          const status = await getTraktStatus();
          if (status.connected) {
            connectService('trakt', { username: status.username, lastSync: status.lastSync, autoSync: services.trakt?.autoSync ?? true });
            addToast(`Connected to Trakt as @${status.username}`, 'success');
          } else {
            addToast('Trakt connection failed. Try again.', 'warning');
          }
          setBusy(false);
        }
      }, 500);
    } catch (e) {
      addToast(`Trakt error: ${e.message}`, 'error');
      setBusy(false);
    }
  }, [addToast, connectService, services.trakt]);

  const handleSyncTrakt = useCallback(async () => {
    setBusy(true);
    try {
      const result = await syncTraktApi();
      if (result?.items?.length > 0) {
        const { useStore } = await import('../lib/store');
        const added = await useStore.getState().mergeTraktHistory(result.items);
        addToast(`Synced ${added} new items from Trakt`, 'success');
      } else {
        addToast('Trakt sync complete — no new items', 'info');
      }
      setServiceStatus('trakt', { lastSync: Date.now() });
    } catch (e) {
      addToast(`Trakt sync failed: ${e.message}`, 'error');
    }
    setBusy(false);
  }, [addToast, setServiceStatus]);

  const handleDisconnectTrakt = useCallback(async () => {
    setBusy(true);
    try { await disconnectTrakt(); } catch {}
    disconnectService('trakt');
    addToast('Disconnected from Trakt', 'info');
    setBusy(false);
  }, [addToast, disconnectService]);

  const handleToggleTraktAutoSync = useCallback(() => {
    const next = !services.trakt?.autoSync;
    localStorage.setItem('bfs_trakt_auto_sync', next ? 'true' : 'false');
    setServiceStatus('trakt', { autoSync: next });
  }, [services.trakt, setServiceStatus]);

  const handleTestTrakt = useCallback(async () => {
    setTesting(true);
    try {
      const status = await getTraktStatus();
      if (status.connected && status.username) {
        addToast(`✅ Connected as @${status.username}`, 'success');
      } else if (status.connected) {
        addToast('✅ Connected to Trakt', 'success');
      } else {
        addToast('❌ Connection failed — token may be expired', 'error');
      }
    } catch (e) {
      addToast('❌ Connection failed — token may be expired', 'error');
    }
    setTesting(false);
  }, [addToast]);

  // ── Stremio (code-based device linking) ──
  const handleConnectStremio = useCallback(async () => {
    setConnecting(true);
    try {
      const info = await getStremioAuthCode();
      setStremioCode(info.code);
      setStremioLink(info.user_url);
      window.open(info.user_url, 'stremio-auth', 'noopener');
      pollRef.current = setInterval(async () => {
        try {
          const result = await pollStremioAuth(info.code);
          if (result.done) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            const { getStremioStatus } = await import('../lib/services');
            const status = await getStremioStatus();
            if (status.connected) {
              connectService('stremio', { email: status.email || status.username || 'Stremio User' });
            } else {
              connectService('stremio', { username: 'Stremio User' });
            }
            addToast('Connected to Stremio!', 'success');
            setConnecting(false);
            setStremioCode(null);
            setStremioLink(null);
          }
        } catch {}
      }, 3000);
    } catch (e) {
      addToast(`Stremio auth failed: ${e.message}`, 'error');
      setConnecting(false);
    }
  }, [addToast, connectService]);

  const handleImportStremio = useCallback(async () => {
    setBusy(true);
    try {
      addToast('Fetching your Stremio library…', 'info');
      const data = await importStremioLibrary();
      if (!data.success) throw new Error(data.error || 'Import failed');
      const counts = await mergeStremioLibrary(data);
      const parts = [];
      if (counts.movies > 0) parts.push(`${counts.movies} movies`);
      if (counts.series > 0) parts.push(`${counts.series} series`);
      if (counts.episodes > 0) parts.push(`${counts.episodes} episodes`);
      const summary = parts.length > 0 ? `Imported ${parts.join(', ')}` : 'No new items to import';
      addToast(`${summary} from ${data.rawCount} Stremio entries.`, parts.length > 0 ? 'success' : 'info');
      setServiceStatus('stremio', { lastImport: Date.now() });
    } catch (e) {
      addToast(`Stremio import failed: ${e.message}`, 'error');
    }
    setBusy(false);
  }, [addToast, mergeStremioLibrary, setServiceStatus]);

  const handleDebugStremio = useCallback(async () => {
    setBusy(true);
    try {
      addToast('Fetching raw Stremio data…', 'info');
      const data = await importStremioLibrary(true);
      if (data.error) {
        addToast(`Debug error: ${data.error}`, 'error');
        return;
      }
      const firstItem = data.raw?.[0];
      const preview = firstItem
        ? JSON.stringify(firstItem).slice(0, 150)
        : 'no raw items';
      addToast(
        `Raw: ${data.rawCount}. Resolved: ${data.resolvedCount}. First item: ${preview}`,
        data.resolvedCount > 0 ? 'success' : 'warning'
      );
    } catch (e) {
      addToast(`Debug failed: ${e.message}`, 'error');
    }
    setBusy(false);
  }, [addToast]);

  const handleDisconnectStremio = useCallback(async () => {
    setBusy(true);
    try { await disconnectStremio(); } catch {}
    disconnectService('stremio');
    addToast('Disconnected from Stremio', 'info');
    setBusy(false);
  }, [addToast, disconnectService]);

  // ── TorBox ──
  const handleConnectTorBox = useCallback(async () => {
    if (!apiKey.trim()) return;
    setBusy(true);
    try {
      const info = await connectTorBox(apiKey.trim());
      connectService('torbox', { email: info.email, plan: info.plan, expiresAt: info.expiresAt });
      addToast(`TorBox connected — ${info.plan || 'active'} account`, 'success');
      setApiKey('');
    } catch (e) {
      addToast(`TorBox validation failed: ${e.message}`, 'error');
    }
    setBusy(false);
  }, [apiKey, addToast, connectService]);

  const handleDisconnectTorBox = useCallback(async () => {
    setBusy(true);
    try { await disconnectTorBox(); } catch {}
    disconnectService('torbox');
    addToast('Disconnected from TorBox', 'info');
    setBusy(false);
  }, [addToast, disconnectService]);

  // ── Real-Debrid ──
  const handleConnectRD = useCallback(async () => {
    if (!apiKey.trim() || serviceKey !== 'realdebrid') return;
    setBusy(true);
    try {
      const info = await connectRD(apiKey.trim());
      connectService('realdebrid', { username: info.username, premium: info.premium, expiresAt: info.expiresAt });
      addToast(`Real-Debrid connected${info.username ? ` as ${info.username}` : ''}`, 'success');
      setApiKey('');
    } catch (e) {
      addToast(`Real-Debrid validation failed: ${e.message}`, 'error');
    }
    setBusy(false);
  }, [apiKey, serviceKey, addToast, connectService]);

  const handleDisconnectRD = useCallback(async () => {
    setBusy(true);
    try { await disconnectRD(); } catch {}
    disconnectService('realdebrid');
    addToast('Disconnected from Real-Debrid', 'info');
    setBusy(false);
  }, [addToast, disconnectService]);

  // ── All-Debrid ──
  const handleConnectAD = useCallback(async () => {
    setConnecting(true);
    try {
      const info = await getADAuthCode();
      setAuthCode(info.pin);
      setAuthLink(info.user_url);
      window.open(info.user_url, 'ad-auth', 'noopener');
      pollRef.current = setInterval(async () => {
        try {
          const result = await pollADAuth(info.pin);
          if (result.done) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            const { getADStatus } = await import('../lib/services');
            const status = await getADStatus();
            if (status.connected) {
              connectService('alldebrid', status);
            } else {
              connectService('alldebrid', { username: 'All-Debrid User' });
            }
            addToast('Connected to All-Debrid!', 'success');
            setConnecting(false);
            setAuthCode(null);
            setAuthLink(null);
          }
        } catch {}
      }, 3000);
    } catch (e) {
      addToast(`All-Debrid auth failed: ${e.message}`, 'error');
      setConnecting(false);
    }
  }, [addToast, connectService]);

  const handleDisconnectAD = useCallback(async () => {
    setBusy(true);
    try { await disconnectAD(); } catch {}
    disconnectService('alldebrid');
    addToast('Disconnected from All-Debrid', 'info');
    setBusy(false);
  }, [addToast, disconnectService]);

  // ── RPDB ──
  const handleConnectRPDB = useCallback(async () => {
    if (!apiKey.trim()) return;
    setBusy(true);
    try {
      const info = await connectRPDB(apiKey.trim());
      connectService('rpdb', { tier: info.tier });
      addToast(`RPDB connected — ${info.tier || 'active'} tier`, 'success');
      setApiKey('');
    } catch (e) {
      addToast(`RPDB validation failed: ${e.message}`, 'error');
    }
    setBusy(false);
  }, [apiKey, addToast, connectService]);

  const handleDisconnectRPDB = useCallback(async () => {
    setBusy(true);
    try { await disconnectRPDB(); } catch {}
    disconnectService('rpdb');
    addToast('Disconnected from RPDB', 'info');
    setBusy(false);
  }, [addToast, disconnectService]);

  // ── Render helpers ──
  const renderStatus = (label, value) => (
    <span key={label}>{label}: <strong>{value}</strong></span>
  );

  const infoTags = [];
  if (serviceKey === 'trakt' && connected) {
    if (svc.username) infoTags.push(renderStatus('User', `@${svc.username}`));
    if (svc.lastSync) infoTags.push(renderStatus('Synced', new Date(svc.lastSync).toLocaleDateString()));
  }
  if (serviceKey === 'stremio' && connected) {
    if (svc.email) infoTags.push(renderStatus('Account', svc.email));
    if (svc.lastImport) infoTags.push(renderStatus('Imported', new Date(svc.lastImport).toLocaleDateString()));
  }
  if (serviceKey === 'torbox' && connected) {
    if (svc.email) infoTags.push(renderStatus('Email', svc.email));
    if (svc.plan) infoTags.push(renderStatus('Plan', svc.plan));
    if (svc.expiresAt) infoTags.push(renderStatus('Expires', new Date(svc.expiresAt).toLocaleDateString()));
  }
  if ((serviceKey === 'realdebrid' || serviceKey === 'alldebrid') && connected) {
    if (svc.username) infoTags.push(renderStatus('User', svc.username));
    if (svc.premium) infoTags.push(renderStatus('Status', 'Premium'));
    if (svc.expiresAt) infoTags.push(renderStatus('Expires', new Date(svc.expiresAt).toLocaleDateString()));
  }
  if (serviceKey === 'rpdb' && connected) {
    if (svc.tier) infoTags.push(renderStatus('Tier', svc.tier));
  }

  return (
    <div className="service-card">
      {/* Header */}
      <div className="service-card-header">
        <div className="service-card-icon" style={{ background: `${meta.color}15` }}>
          {meta.icon}
        </div>
        <div className="service-card-name">{meta.name}</div>
        <div className={`service-card-dot ${connecting ? 'connecting' : connected ? 'connected' : 'disconnected'}`} />
      </div>

      {/* Description */}
      <div className="service-card-desc">{meta.desc}</div>

      {/* Info */}
      {infoTags.length > 0 && (
        <div className="service-card-info">{infoTags}</div>
      )}

      {/* AllDebrid connecting state */}
      {connecting && serviceKey === 'alldebrid' && authCode && (
        <>
          <div className="service-card-code-label">Enter this PIN at the activation page:</div>
          <div className="service-card-code">{authCode}</div>
          {authLink && (
            <a href={authLink} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ width: '100%', textAlign: 'center' }}>
              Open Activation Page →
            </a>
          )}
          <div className="spinner" style={{ alignSelf: 'center' }} />
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#fbbf24' }}>
            ⚠ You must also approve the API connection on the All-Debrid website.
          </div>
        </>
      )}

      {/* API key inputs */}
      {!connected && !connecting && (serviceKey === 'torbox' || serviceKey === 'rpdb' || serviceKey === 'realdebrid') && (
        <div className="service-card-input">
          <input
            type="password"
            placeholder={serviceKey === 'realdebrid' ? 'API token from real-debrid.com/apitoken' : `Enter ${meta.name} API key`}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              if (serviceKey === 'torbox') handleConnectTorBox();
              else if (serviceKey === 'realdebrid') handleConnectRD();
              else handleConnectRPDB();
            }}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={serviceKey === 'torbox' ? handleConnectTorBox : serviceKey === 'realdebrid' ? handleConnectRD : handleConnectRPDB}
            disabled={busy || !apiKey.trim()}
          >
            {busy ? '...' : 'Connect'}
          </button>
        </div>
      )}

      {/* Stremio connecting state */}
      {connecting && serviceKey === 'stremio' && stremioCode && (
        <>
          <div className="service-card-code-label">Visit strem.io/link and enter this code:</div>
          <div className="service-card-code">{stremioCode}</div>
          {stremioLink && (
            <a href={stremioLink} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ width: '100%', textAlign: 'center' }}>
              Open strem.io/link →
            </a>
          )}
          <div className="spinner" style={{ alignSelf: 'center' }} />
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#fbbf24' }}>
            ⚠ Waiting for you to enter the code on Stremio's website and authorize the connection.
          </div>
        </>
      )}

      {/* Stremio connect button (not connected, not connecting) */}
      {!connected && !connecting && serviceKey === 'stremio' && (
        <button className="btn btn-primary btn-sm" onClick={handleConnectStremio} disabled={busy}>Connect</button>
      )}

      {/* Actions */}
      <div className="service-card-actions">
        {!connected && !connecting && serviceKey === 'trakt' && (
          <button className="btn btn-primary btn-sm" onClick={handleConnectTrakt} disabled={busy}>Connect</button>
        )}
        {!connected && !connecting && serviceKey === 'alldebrid' && (
          <button className="btn btn-primary btn-sm" onClick={handleConnectAD} disabled={busy}>Connect</button>
        )}

        {connected && serviceKey === 'trakt' && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={handleSyncTrakt} disabled={busy}>Sync Now</button>
            <button className="btn btn-secondary btn-sm" onClick={handleTestTrakt} disabled={testing}>{testing ? '...' : 'Test Connection'}</button>
            <button className="btn btn-secondary btn-sm" onClick={handleDisconnectTrakt} disabled={busy} style={{ color: '#f87171' }}>Disconnect</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.72rem', userSelect: 'none', color: 'var(--text-muted)', width: '100%' }}>
              <input type="checkbox" checked={services.trakt?.autoSync ?? true} onChange={handleToggleTraktAutoSync} />
              Auto-sync
            </label>
          </>
        )}

        {connected && serviceKey === 'stremio' && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={handleImportStremio} disabled={busy}>Import Library</button>
            <button className="btn btn-secondary btn-sm" onClick={handleDebugStremio} disabled={busy} title="Fetch raw library data and log to console">Debug</button>
            <button className="btn btn-secondary btn-sm" onClick={handleDisconnectStremio} disabled={busy} style={{ color: '#f87171' }}>Disconnect</button>
          </>
        )}

        {connected && serviceKey === 'torbox' && (
          <button className="btn btn-secondary btn-sm" onClick={handleDisconnectTorBox} disabled={busy} style={{ color: '#f87171' }}>Disconnect</button>
        )}

        {connected && serviceKey === 'realdebrid' && (
          <button className="btn btn-secondary btn-sm" onClick={handleDisconnectRD} disabled={busy} style={{ color: '#f87171' }}>Disconnect</button>
        )}

        {connected && serviceKey === 'alldebrid' && (
          <button className="btn btn-secondary btn-sm" onClick={handleDisconnectAD} disabled={busy} style={{ color: '#f87171' }}>Disconnect</button>
        )}

        {connected && serviceKey === 'rpdb' && (
          <button className="btn btn-secondary btn-sm" onClick={handleDisconnectRPDB} disabled={busy} style={{ color: '#f87171' }}>Disconnect</button>
        )}
      </div>
    </div>
  );
}
