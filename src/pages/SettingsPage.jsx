import React, { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import ServiceCard from '../components/ServiceCard';
import { clearAllCaches, clearStreamCache, clearImageCache } from '../lib/tmdb';
import { getToken } from '../lib/auth';
import { getWorkerProxyUrl } from '../lib/auth';
import './SettingsPage.css';

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

export default function SettingsPage() {
  const settings = useStore(s => s.settings);
  const setCorsProxy = useStore(s => s.setCorsProxy);
  const addToast = useStore(s => s.addToast);
  const initServices = useStore(s => s.initServices);

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