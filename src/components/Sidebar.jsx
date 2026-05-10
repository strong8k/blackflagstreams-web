import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import LogoSvg from '../assets/bfs.svg';
import { VERSION } from '../lib/version';

const NAV_ITEMS = [
  { to: '/',          icon: '🏠', label: 'Home' },
  { to: '/movies',    icon: '🎬', label: 'Movies' },
  { to: '/series',    icon: '📺', label: 'Series' },
  { to: '/iptv',      icon: '📡', label: 'Live TV' },
  { to: '/watchlist', icon: '🏴', label: 'Watchlist' },
  { to: '/addons',    icon: '🧩', label: 'Addons' },
  { to: '/settings',  icon: '⚙', label: 'Settings' },
];

const TIER_LABELS = {
  free: 'Landlubber',
  account: 'Deckhand',
  premium: 'Buccaneer',
  pro: 'First Mate',
  ultra: 'Captain',
};

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const activeProfileId = useStore(s => s.activeProfile);
  const profiles = useStore(s => s.profiles);
  const tier = useStore(s => s.auth.tier);
  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const tierLabel = TIER_LABELS[tier] || 'Landlubber';

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-logo">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
          <div className="logo-container">
            <img src={LogoSvg} alt="BlackFlagStreams" className="logo-img" />
            {!collapsed && (
              <div className="logo-text">
                BlackFlag<span>Streams</span>
              </div>
            )}
          </div>
        </Link>
      </div>

      {activeProfile ? (
        <div className="sidebar-profile">
          <div className="sidebar-avatar" style={{ background: activeProfile.color }}>{activeProfile.avatar}</div>
          {!collapsed && <div className="sidebar-profile-info">
            <span className="profile-name">{activeProfile.name}</span>
            <span className="profile-tier">{tierLabel}</span>
          </div>}
        </div>
      ) : (
        <Link to="/onboarding" className="sidebar-onboard-btn">
          <span className="icon">⚓</span>
          {!collapsed && <span>Board the Ship</span>}
        </Link>
      )}

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <span className="icon">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-links">
          <Link to="/legal">Legal</Link>
          <Link to="/beta">Beta</Link>
        </div>
        <div className="sidebar-copyright">
          <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>{VERSION}</span>
          <br />
          © 2026 BlackFlagStreams by <a href="https://www.lowdefpirate.link" target="_blank" rel="noopener noreferrer">LowDefPirate</a>
        </div>
        <button
          className="sidebar-link"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="icon">{collapsed ? '▸' : '◂'}</span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
