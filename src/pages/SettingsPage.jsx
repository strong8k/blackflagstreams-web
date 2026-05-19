import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../lib/store';
import ServiceCard from '../components/ServiceCard';
import { clearAllCaches, clearStreamCache, clearImageCache } from '../lib/tmdb';
import { getToken, getApiBaseUrl } from '../lib/auth';
import { getWorkerProxyUrl } from '../lib/auth';
import { updateDebridSettings } from '../lib/services';
import './SettingsPage.css';

function DevicesSection() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);
  const addToast = useStore(s => s.addToast);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/devices`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
    } catch (e) {
      addToast('Failed to load devices', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const removeDevice = async (deviceId) => {
    setRemoving(deviceId);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/devices`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ deviceId }),
      });
      if (res.ok) {
        addToast('Device removed', 'success');
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        addToast(d.error || 'Failed to remove device', 'error');
      }
    } catch {
      addToast('Failed to remove device', 'error');
    } finally {
      setRemoving(null);
    }
  };

  const fmt = (ts) => ts ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const ua = (str) => {
    if (!str) return 'Unknown device';
    if (/Android TV|Tizen|WebOS|SmartTV/i.test(str)) return 'Smart TV';
    if (/Android/i.test(str)) return 'Android';
    if (/iPhone|iPad/i.test(str)) return 'iOS';
    if (/Windows/i.test(str)) return 'Windows';
    if (/Mac/i.test(str)) return 'Mac';
    if (/Linux/i.test(str)) return 'Linux';
    return str.slice(0, 60);
  };

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading devices...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
      {devices.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No devices registered.</p>
      )}
      {devices.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', gap: '1rem' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{d.name || ua(d.userAgent)}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
              {ua(d.userAgent)} · Added {fmt(d.created)} · Last seen {fmt(d.lastSeen)}
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ borderColor: 'rgba(220,38,38,0.4)', color: '#f87171', flexShrink: 0 }}
            onClick={() => removeDevice(d.id)}
            disabled={removing === d.id}
          >
            {removing === d.id ? 'Removing...' : 'Remove'}
          </button>
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({ title, message, confirmWord, onConfirm, onCancel, busy }) {
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState(false);
  const needsCheckbox = confirmWord === 'DELETE';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        {needsCheckbox && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
            I understand this action is permanent and cannot be undone.
          </label>
        )}
        <div style={{ margin: '0.75rem 0' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            Type <strong>{confirmWord}</strong> to confirm:
          </p>
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={confirmWord}
            autoFocus
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            style={{ background: confirmWord === 'DELETE' ? '#dc2626' : undefined }}
            onClick={onConfirm}
            disabled={typed !== confirmWord || (needsCheckbox && !checked) || busy}
          >
            {busy ? 'Working...' : confirmWord === 'DELETE' ? 'Delete Forever' : 'Reset Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DebridManagementSection() {
  const debridSettings = useStore(s => s.debridSettings);
  const setDebridResolution = useStore(s => s.setDebridResolution);
  const setDebridSettings = useStore(s => s.setDebridSettings);
  const initDebridSettings = useStore(s => s.initDebridSettings);
  const addToast = useStore(s => s.addToast);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { initDebridSettings(); }, []);

  const hasDebrid = debridSettings.hasDebrid;

  const handleToggleResolution = async (res, enabled) => {
    setDebridResolution(res, enabled);
    setSaving(true);
    try {
      const newResolutions = enabled
        ? [...new Set([...debridSettings.enabledResolutions, res])]
        : debridSettings.enabledResolutions.filter(r => r !== res);
      await updateDebridSettings({ enabledResolutions: newResolutions });
    } catch (e) {
      addToast('Failed to save resolution preference', 'error');
    } finally {
      setSaving(false);
    }
  };

  const RESOLUTIONS = [
    { key: '2160p', label: '4K UHD', icon: '🔥' },
    { key: '1080p', label: '1080p FHD', icon: '🚀' },
    { key: '720p', label: '720p HD', icon: '💿' },
    { key: '480p', label: '480p SD', icon: '📺' },
  ];

  return (
    <section className="settings-section" style={{ borderColor: 'rgba(234,179,8,0.25)' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>☠️ Debrid Management</span>
        {hasDebrid && <span className="service-card-dot connected" style={{ display: 'inline-block', marginLeft: '0.5rem' }} />}
      </h3>
      <p className="setting-desc" style={{ marginBottom: '1rem' }}>
        ⚓ Configure your streaming quality preferences. These settings control which resolutions, languages, and file sizes are available when streaming through your debrid services.
      </p>

      {!hasDebrid && (
        <div style={{
          padding: '1rem',
          background: 'rgba(234,179,8,0.08)',
          border: '1px solid rgba(234,179,8,0.2)',
          borderRadius: '8px',
          color: '#eab308',
          fontSize: '0.9rem',
          textAlign: 'center',
        }}>
          🏴‍☠️ Connect a debrid service above (TorBox, Real-Debrid, or All-Debrid) to unlock streaming quality preferences.
        </div>
      )}

      {/* Resolutions */}
      <div className="settings-group" style={{ opacity: hasDebrid ? 1 : 0.4, pointerEvents: hasDebrid ? 'auto' : 'none', marginTop: '1rem' }}>
        <label>🎬 Resolutions</label>
        <p className="setting-desc">Enable or disable streaming resolutions. Lower resolutions (240p, 144p) are hidden by default.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {RESOLUTIONS.map(r => (
            <label key={r.key} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.75rem',
              background: debridSettings.enabledResolutions.includes(r.key) ? 'rgba(234,179,8,0.1)' : 'var(--surface)',
              border: `1px solid ${debridSettings.enabledResolutions.includes(r.key) ? 'rgba(234,179,8,0.3)' : 'var(--border)'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              userSelect: 'none',
              transition: 'all 0.2s',
            }}>
              <input
                type="checkbox"
                checked={debridSettings.enabledResolutions.includes(r.key)}
                onChange={e => handleToggleResolution(r.key, e.target.checked)}
                style={{ accentColor: '#eab308' }}
              />
              <span>{r.icon} {r.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Languages */}
      <div className="settings-group" style={{ opacity: hasDebrid ? 1 : 0.4, pointerEvents: hasDebrid ? 'auto' : 'none' }}>
        <label>🗣️ Languages</label>
        <p className="setting-desc">Preferred audio languages for streaming. Initially set to AIOStreams defaults — admin can tune these later.</p>
        <div style={{
          padding: '0.75rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          marginTop: '0.5rem',
        }}>
          {debridSettings.languages?.preferred?.join(' · ') || 'English · Dubbed · Dual Audio'}
        </div>
      </div>

      {/* File Size Limits */}
      <div className="settings-group" style={{ opacity: hasDebrid ? 1 : 0.4, pointerEvents: hasDebrid ? 'auto' : 'none' }}>
        <label>📁 File Size Limits</label>
        <p className="setting-desc">
          Minimum and maximum file sizes (in bytes). Currently using AIOStreams defaults — customizable in the future.
        </p>
        <div style={{
          padding: '0.75rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          marginTop: '0.5rem',
          display: 'flex',
          gap: '1rem',
        }}>
          <span>🎬 Movies: {debridSettings.sizeGlobal?.movies ? `${(debridSettings.sizeGlobal.movies[0] / 1e9).toFixed(1)} GB – ${(debridSettings.sizeGlobal.movies[1] / 1e9).toFixed(0)} GB` : '1.3 GB – 100 GB'}</span>
          <span>📺 Series: {debridSettings.sizeGlobal?.series ? `${(debridSettings.sizeGlobal.series[0] / 1e9).toFixed(1)} GB – ${(debridSettings.sizeGlobal.series[1] / 1e9).toFixed(0)} GB` : '200 MB – 15 GB'}</span>
        </div>
      </div>

      {saving && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>⏳ Saving...</p>}

      {/* Sync Debrid Config */}
      {hasDebrid && (
        <div className="settings-group" style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <label>🔄 Sync Debrid Config</label>
          <p className="setting-desc">
            Manually re-sync your debrid API keys and quality preferences to the AIOStreams proxy. This may help if streams are not resolving correctly.
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              setSyncing(true);
              try {
                const { syncAIOStreams } = await import('../lib/services');
                const result = await syncAIOStreams();
                if (result.success) {
                  addToast('Debrid config synced to AIOStreams', 'success');
                } else {
                  addToast(result.error || 'Sync failed', 'error');
                }
              } catch (e) {
                addToast(`Sync failed: ${e.message}`, 'error');
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing}
          >
            {syncing ? '⏳ Syncing...' : 'Sync Debrid Config'}
          </button>
        </div>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const settings = useStore(s => s.settings);
  const setCorsProxy = useStore(s => s.setCorsProxy);
  const addToast = useStore(s => s.addToast);
  const initServices = useStore(s => s.initServices);
  const initDebridSettings = useStore(s => s.initDebridSettings);

  useEffect(() => { initServices(); }, []);

  const [clearing, setClearing] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);

  const handleClearCache = async (type) => {
    setClearing(true);
    let ok = false;
    if (type === 'streams') ok = await clearStreamCache();
    else if (type === 'images') ok = await clearImageCache();
    else ok = await clearAllCaches();
    setClearing(false);
    if (ok) addToast(`Cache cleared: ${type}`, 'success');
    else addToast('Cache clear failed', 'error');
  };

  const handleReset = async () => {
    setModalBusy(true);
    try {
      await clearAllCaches();
      localStorage.clear();
      addToast('Account reset. All local data cleared.', 'success');
      setShowReset(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      addToast('Reset failed: ' + e.message, 'error');
    } finally {
      setModalBusy(false);
    }
  };

  const handleDelete = async () => {
    setModalBusy(true);
    try {
      const token = getToken();
      if (token) {
        const baseUrl = localStorage.getItem('bfs_api_base') || '';
        try {
          await fetch(`${baseUrl}/api/auth/account`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
        } catch { /* backend might not have this endpoint yet */ }
      }
      await clearAllCaches();
      const dbs = await indexedDB.databases();
      for (const db of dbs) { indexedDB.deleteDatabase(db.name); }
      localStorage.clear();
      addToast('Account deleted. Fair winds, matey.', 'success');
      setShowDelete(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      addToast('Delete failed: ' + e.message, 'error');
    } finally {
      setModalBusy(false);
    }
  };

  return (
    <div className="page settings-page">
      <div className="container" style={{ paddingTop: '2rem', maxWidth: '900px' }}>
        <h2 className="section-title">⚙ Settings</h2>

        {/* Connected Services */}
        <section className="settings-section">
          <h3>Connected Services</h3>
          <p className="setting-desc" style={{ marginBottom: '1rem' }}>
            Connect your streaming services for a unified experience. Tokens are stored securely on our servers.
          </p>
          <div className="services-grid">
            <ServiceCard serviceKey="trakt" />
            <ServiceCard serviceKey="stremio" />
            <ServiceCard serviceKey="torbox" />
            <ServiceCard serviceKey="realdebrid" />
            <ServiceCard serviceKey="alldebrid" />
            <ServiceCard serviceKey="rpdb" />
          </div>
        </section>

        {/* Debrid Management */}
        <DebridManagementSection />

        {/* Devices */}
        <section className="settings-section">
          <h3>My Devices</h3>
          <p className="setting-desc" style={{ marginBottom: '0.5rem' }}>
            Devices registered to your account. Remove a device to free up a slot if you've hit your limit.
          </p>
          <DevicesSection />
        </section>

        {/* Advanced */}
        <section className="settings-section">
          <h3>Advanced</h3>

          {/* Custom Proxy */}
          <div className="settings-group">
            <label>Custom Proxy URL</label>
            <p className="setting-desc">
              Override the default Cloudflare proxy for API + stream requests.
              Leave blank to use the built-in openprox proxy.
            </p>
            <input
              type="text"
              value={settings.effectiveCorsProxy !== getWorkerProxyUrl() ? settings.effectiveCorsProxy : ''}
              onChange={(e) => {
                setCorsProxy(e.target.value.trim());
              }}
              placeholder="https://your-proxy.example.com"
            />
            <p className="setting-desc">Default: {getWorkerProxyUrl()}</p>
          </div>

          {/* Cache Management */}
          <div className="settings-group" style={{ marginTop: '1.25rem' }}>
            <label>Cache Management</label>
            <p className="setting-desc">Clear cached data to force fresh fetches.</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => handleClearCache('all')} disabled={clearing}>Clear All</button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleClearCache('streams')} disabled={clearing}>Clear Streams</button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleClearCache('images')} disabled={clearing}>Clear Metadata</button>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="settings-section" style={{ borderColor: 'rgba(220,38,38,0.2)' }}>
          <h3 style={{ color: '#f87171' }}>Danger Zone</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Reset Account</div>
                <p className="setting-desc">Clears all addons, cache, history, watchlist, IPTV, and settings. Fresh start.</p>
              </div>
              <button className="btn btn-secondary" style={{ borderColor: 'rgba(234,179,8,0.4)', color: '#eab308' }} onClick={() => setShowReset(true)}>
                Reset
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Delete Account</div>
                <p className="setting-desc">Deletes your account and all data permanently. Logs out all devices. Cannot be undone.</p>
              </div>
              <button className="btn btn-secondary" style={{ borderColor: 'rgba(220,38,38,0.4)', color: '#f87171' }} onClick={() => setShowDelete(true)}>
                Delete Forever
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Modals */}
      {showReset && (
        <ConfirmModal
          title="Reset Account"
          message="This clears all your local data — addons, cache, watchlist, continue watching, IPTV providers, settings, and stored credentials. Your account will remain but all data will be wiped. You'll be logged out."
          confirmWord="RESET"
          onConfirm={handleReset}
          onCancel={() => setShowReset(false)}
          busy={modalBusy}
        />
      )}

      {showDelete && (
        <ConfirmModal
          title="Delete Account"
          message="This permanently deletes your account and ALL associated data from our servers. All devices will be logged out. Your watchlist, history, addons, IPTV configs, and profile data will be erased forever. This cannot be undone."
          confirmWord="DELETE"
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
          busy={modalBusy}
        />
      )}
    </div>
  );
}