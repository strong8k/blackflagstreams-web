import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../lib/store';

import './AddonsPage.css';

const TIER_ORDER = ['free', 'account', 'premium', 'pro', 'ultra'];
function tierAtLeast(userTier, required) {
  return TIER_ORDER.indexOf(userTier) >= TIER_ORDER.indexOf(required);
}

export default function AddonsPage() {
  const addons        = useStore(s => s.addons);
  const addAddon      = useStore(s => s.addAddon);
  const removeAddon   = useStore(s => s.removeAddon);
  const addToast      = useStore(s => s.addToast);
  const tier          = useStore(s => s.auth.tier);
  const serverRecommended = useStore(s => s.recommendedAddons);
  const serverUltra   = useStore(s => s.ultraAddons);

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState('all');

  const recommendedCatalog = serverRecommended;
  const ultraCatalog = serverUltra;
  const isUltra = tierAtLeast(tier, 'ultra');

  const isInstalled = (tUrl) => addons.some(a => a.transportUrl === tUrl);

  const handleInstall = async (targetUrl) => {
    if (!targetUrl) return;
    setLoading(true);
    try {
      const manifest = await addAddon(targetUrl);
      addToast(`Installed: ${manifest.name}`, 'success');
      setUrl('');
    } catch (err) {
      addToast(`Install failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = (addon) => {
    removeAddon(addon.transportUrl);
    addToast(`Removed: ${addon.manifest?.name || addon.name}`, 'info');
  };

  // Categorise the active addon list
  const forcedAddons = addons.filter(a => a.flags?.forced || a.flags?.official);
  const recommendedInstalled = addons.filter(a =>
    !a.flags?.forced && !a.flags?.official &&
    recommendedCatalog.some(r => r.transportUrl === a.transportUrl)
  );
  const userAddons = addons.filter(a =>
    !a.flags?.forced && !a.flags?.official &&
    !recommendedCatalog.some(r => r.transportUrl === a.transportUrl) &&
    !ultraCatalog.some(u => u.transportUrl === a.transportUrl)
  );

  const showForced      = section === 'all' || section === 'fleet';
  const showRecommended = section === 'all' || section === 'recommended';
  const showUltra       = (section === 'all' || section === 'ultra') && (isUltra || ultraCatalog.length > 0);
  const showUser        = section === 'all' || section === 'installed';

  return (
    <div className="addons-page page">
      <div className="container">
        <header className="addons-header">
          <h2 className="section-title"><span className="icon">🧩</span> Addon Manager</h2>
          <p className="section-subtitle">
            Fleet orders are mandatory. Recommended are optional. Ultra is exclusive.
          </p>
        </header>

        {/* Install from URL */}
        <section className="addon-install-box glass-panel">
          <h3>Install from URL</h3>
          <div className="install-input-wrap">
            <input
              type="text"
              placeholder="https://addon-provider.com/manifest.json"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInstall(url)}
            />
            <button
              className="btn btn-primary"
              disabled={loading || !url.trim()}
              onClick={() => handleInstall(url)}
            >
              {loading ? <div className="spinner" /> : 'Install'}
            </button>
          </div>
        </section>

        {/* Section nav */}
        <nav className="addons-nav">
          {[
            { key: 'all',         label: 'All' },
            { key: 'fleet',       label: `⚓ Fleet (${forcedAddons.length})` },
            { key: 'recommended', label: `🧩 Recommended (${recommendedCatalog.length})` },
            { key: 'ultra',       label: '💎 Ultra' },
            { key: 'installed',   label: `✓ Yours (${userAddons.length + recommendedInstalled.length})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`nav-btn ${section === key ? 'active' : ''}`}
              onClick={() => setSection(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <AnimatePresence mode="wait">
          {/* ── Fleet Standard (forced, locked) ── */}
          {showForced && forcedAddons.length > 0 && (
            <SectionBlock key="fleet" title="⚓ Fleet Standard" subtitle="Issued by command. Cannot be removed.">
              {forcedAddons.map(addon => (
                <AddonCard
                  key={addon.transportUrl}
                  addon={addon}
                  installed
                  locked
                  badge="Fleet Order"
                />
              ))}
            </SectionBlock>
          )}

          {/* ── Recommended (optional, all users) ── */}
          {showRecommended && (
            <SectionBlock key="recommended" title="🧩 Recommended" subtitle="Community favourites. Install or skip.">
              {recommendedCatalog.map(addon => (
                <AddonCard
                  key={addon.transportUrl}
                  addon={addon}
                  installed={isInstalled(addon.transportUrl)}
                  onInstall={() => handleInstall(addon.transportUrl)}
                  onUninstall={() => handleUninstall(
                    addons.find(a => a.transportUrl === addon.transportUrl) || addon
                  )}
                  badge={isInstalled(addon.transportUrl) ? 'Installed' : null}
                />
              ))}
              {recommendedCatalog.length === 0 && (
                <p style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>No recommended addons configured.</p>
              )}
            </SectionBlock>
          )}

          {/* ── Ultra Exclusive ── */}
          {showUltra && (
            <SectionBlock
              key="ultra"
              title="💎 Ultra Exclusive"
              subtitle={isUltra ? 'Available to your fleet.' : 'Upgrade to Ultra to unlock these addons.'}
            >
              {ultraCatalog.length === 0 && (
                <p style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>No ultra addons configured yet.</p>
              )}
              {ultraCatalog.map(addon => (
                <AddonCard
                  key={addon.transportUrl}
                  addon={addon}
                  installed={isInstalled(addon.transportUrl)}
                  locked={!isUltra}
                  upgradeRequired={!isUltra}
                  onInstall={isUltra ? () => handleInstall(addon.transportUrl) : null}
                  onUninstall={isUltra ? () => handleUninstall(
                    addons.find(a => a.transportUrl === addon.transportUrl) || addon
                  ) : null}
                  badge="Ultra"
                />
              ))}
            </SectionBlock>
          )}

          {/* ── User-installed ── */}
          {showUser && (userAddons.length > 0 || recommendedInstalled.length > 0) && (
            <SectionBlock key="user" title="Your Addons" subtitle="Manually installed or community picks you added.">
              {[...recommendedInstalled, ...userAddons].map(addon => (
                <AddonCard
                  key={addon.transportUrl}
                  addon={addon}
                  installed
                  onUninstall={() => handleUninstall(addon)}
                />
              ))}
            </SectionBlock>
          )}

          {showUser && userAddons.length === 0 && recommendedInstalled.length === 0 && (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ color: 'var(--text-muted)', marginTop: '1rem', padding: '0.5rem' }}
            >
              No custom addons installed yet.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SectionBlock({ title, subtitle, children }) {
  return (
    <motion.section
      className="addon-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="addon-section-header">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="addons-grid">{children}</div>
    </motion.section>
  );
}

function AddonCard({ addon, installed, locked, upgradeRequired, badge, onInstall, onUninstall }) {
  const name = addon.name || addon.manifest?.name || 'Unknown';
  const desc = addon.description || addon.manifest?.description || '';
  const icon = addon.icon || addon.manifest?.icon || '🧩';

  return (
    <motion.div
      className={`addon-card glass ${installed ? 'installed' : ''} ${locked ? 'locked' : ''} ${upgradeRequired ? 'upgrade-required' : ''}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      layout
    >
      <div className="addon-icon">{icon}</div>
      <div className="addon-info">
        <h4>{name}</h4>
        {desc && <p>{desc}</p>}
      </div>
      <div className="addon-actions">
        {upgradeRequired ? (
          <a href="/upgrade" className="btn btn-gold btn-sm" style={{ textDecoration: 'none' }}>Upgrade</a>
        ) : locked ? (
          <span className="badge-locked">LOCKED</span>
        ) : installed ? (
          onUninstall && <button className="btn btn-secondary btn-sm" onClick={onUninstall}>Remove</button>
        ) : (
          onInstall && <button className="btn btn-primary btn-sm" onClick={onInstall}>Install</button>
        )}
      </div>
      {badge && (
        <div className={`installed-badge ${badge === 'Fleet Order' ? 'badge-fleet' : badge === 'Ultra' ? 'badge-ultra' : ''}`}>
          {badge === 'Fleet Order' ? '⚓' : badge === 'Ultra' ? '💎' : '✓'} {badge}
        </div>
      )}
    </motion.div>
  );
}
