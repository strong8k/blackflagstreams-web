import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../lib/store';
import { RECOMMENDED_ADDONS, fetchManifest } from '../lib/addons';
import './AddonsPage.css';

export default function AddonsPage() {
  const addons = useStore(s => s.addons);
  const addAddon = useStore(s => s.addAddon);
  const removeAddon = useStore(s => s.removeAddon);
  const addToast = useStore(s => s.addToast);

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // all, installed, recommended

  const handleInstall = async (targetUrl) => {
    if (!targetUrl) return;
    setLoading(true);
    try {
      const manifest = await addAddon(targetUrl);
      addToast(`Installed ${manifest.name}`, 'success');
      setUrl('');
    } catch (err) {
      addToast(`Failed to install: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const isInstalled = (tUrl) => addons.some(a => a.transportUrl === tUrl);

  const displayedRecommended = RECOMMENDED_ADDONS.filter(a => {
    if (filter === 'installed' && !isInstalled(a.transportUrl)) return false;
    return true;
  });

  return (
    <div className="addons-page page">
      <div className="container">
        <header className="addons-header">
          <h2 className="section-title">
            <span className="icon">🧩</span> Addon Manager
          </h2>
          <p className="section-subtitle">Extend your library with Stremio-compatible community addons.</p>
        </header>

        <section className="addon-install-box glass-panel">
          <h3>Install from URL</h3>
          <div className="install-input-wrap">
            <input 
              type="text" 
              placeholder="https://addon-provider.com/manifest.json"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button 
              className="btn btn-primary" 
              disabled={loading || !url}
              onClick={() => handleInstall(url)}
            >
              {loading ? <div className="spinner" /> : 'Install Addon'}
            </button>
          </div>
        </section>

        <nav className="addons-nav">
          <button className={`nav-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All Addons</button>
          <button className={`nav-btn ${filter === 'installed' ? 'active' : ''}`} onClick={() => setFilter('installed')}>Installed</button>
        </nav>

        <div className="addons-grid">
          <AnimatePresence>
            {/* Installed User Addons (Not in Recommended) */}
            {addons.filter(a => !RECOMMENDED_ADDONS.some(r => r.transportUrl === a.transportUrl) && !a.flags?.official && !a.flags?.protected).map(addon => (
              <AddonCard 
                key={addon.transportUrl} 
                addon={addon} 
                installed={true} 
                onUninstall={() => {
                  removeAddon(addon.transportUrl);
                  addToast(`Uninstalled ${addon.name}`, 'info');
                }}
              />
            ))}

            {/* Recommended Addons */}
            {displayedRecommended.map(addon => (
              <AddonCard 
                key={addon.transportUrl} 
                addon={addon} 
                installed={isInstalled(addon.transportUrl)}
                isProtected={addon.flags?.protected}
                onInstall={() => handleInstall(addon.transportUrl)}
                onUninstall={() => {
                  if (addon.flags?.protected) return;
                  removeAddon(addon.transportUrl);
                  addToast(`Uninstalled ${addon.name}`, 'info');
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function AddonCard({ addon, installed, isProtected, onInstall, onUninstall }) {
  return (
    <motion.div 
      className={`addon-card glass ${installed ? 'installed' : ''} ${isProtected ? 'protected' : ''}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      layout
    >
      <div className="addon-icon">{addon.icon || (addon.manifest?.icon) || '🧩'}</div>
      <div className="addon-info">
        <h4>{addon.name || addon.manifest?.name}</h4>
        <p>{addon.description || addon.manifest?.description || 'No description available.'}</p>
      </div>
      <div className="addon-actions">
        {installed ? (
          !isProtected && <button className="btn btn-secondary btn-sm" onClick={onUninstall}>Uninstall</button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={onInstall}>Install</button>
        )}
      </div>
      {installed && <div className="installed-badge">{isProtected ? '🛡️ Protected' : '✓ Installed'}</div>}
    </motion.div>
  );
}
