import React, { useState, useRef, useCallback, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import LogoSvg from '../assets/bfs.svg';
import { VERSION } from '../lib/version';

/* ── Inline SVG Icons (white stroke, 34px) ── */
const icon = (d, vb = '0 0 24 24', strokeW = 1.8) => (
  <svg width="34" height="34" viewBox={vb} fill="none" stroke="currentColor"
    strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const Icons = {
  search:    icon(['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z','M21 21l-4.35-4.35'], '0 0 24 24', 1.6),
  home:      icon(['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z','M9 22V12h6v10'], '0 0 24 24', 1.6),
  moviesClipper: icon(['M4 4v16','M8 4v16','M12 4v16','M16 4v16','M20 4v16','M2 4h20','M2 20h20'], '0 0 24 24', 1.6),
  series:    icon(['M4 6h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z','M16 2v4','M8 2v4','M4 10h16'], '0 0 24 24', 1.6),
  liveTv:    icon(['M12 2a10 10 0 1 0 10 10','M12 2v10l6.5 3.8'], '0 0 24 24', 1.6),
  watchlist: icon('M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z', '0 0 24 24', 1.6),
  addons:    icon(['M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z'], '0 0 24 24', 1.6),
  settings:  icon(['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'], '0 0 24 24', 1.6),
};

const NAV_ITEMS = [
  { to: '/search',   icon: Icons.search,   label: 'Search' },
  { to: '/',          icon: Icons.home,      label: 'Home' },
  { to: '/movies',    icon: Icons.moviesClipper, label: 'Movies' },
  { to: '/series',    icon: Icons.series,    label: 'Series' },
  { to: '/iptv',      icon: Icons.liveTv,    label: 'Live TV' },
  { to: '/watchlist', icon: Icons.watchlist, label: 'Watchlist' },
  { to: '/addons',    icon: Icons.addons,    label: 'Addons' },
  { to: '/settings',  icon: Icons.settings,  label: 'Settings' },
];

const TIER_LABELS = {
  free: 'Landlubber',
  account: 'Deckhand',
  premium: 'Buccaneer',
  pro: 'First Mate',
  ultra: 'Captain',
};

export default function Sidebar() {
  const activeProfileId = useStore(s => s.activeProfile);
  const profiles = useStore(s => s.profiles);
  const tier = useStore(s => s.auth.tier);
  const authLoggedIn = useStore(s => s.auth.loggedIn);
  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const tierLabel = TIER_LABELS[tier] || 'Landlubber';

  const [expanded, setExpanded] = useState(false);
  const expandTimer = useRef(null);
  const sidebarRef = useRef(null);

  const handleMouseEnter = useCallback(() => {
    clearTimeout(expandTimer.current);
    expandTimer.current = setTimeout(() => setExpanded(true), 120);
  }, []);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(expandTimer.current);
    setExpanded(false);
  }, []);

  const handleOverlayClick = useCallback(() => {
    clearTimeout(expandTimer.current);
    setExpanded(false);
  }, []);

  const handleNavClick = useCallback(() => {
    setExpanded(false);
  }, []);

  useEffect(() => {
    return () => clearTimeout(expandTimer.current);
  }, []);

  return (
    <div className={`sidebar-wrapper${expanded ? ' expanded' : ''}`}>
      <aside className="sidebar" ref={sidebarRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        {/* Logo */}
        <div className="sidebar-logo">
          <Link to="/" className="sidebar-logo-link">
            <img src={LogoSvg} alt="BlackFlagStreams" className="logo-img" />
            <div className="logo-text-sidebar">
              BlackFlag<span>Streams</span>
            </div>
          </Link>
        </div>

        {/* Profile or Auth */}
        {activeProfile ? (
          <Link to="/settings" className="sidebar-profile">
            <div className="sidebar-avatar" style={{ background: activeProfile.color }}>
              {activeProfile.avatar}
            </div>
            <div className="sidebar-profile-info">
              <span className="profile-name">{activeProfile.name}</span>
              <span className="profile-tier">{tierLabel}</span>
            </div>
          </Link>
        ) : (
          <div className="sidebar-auth-btns">
            {!activeProfile && (
              <Link to="/onboarding" className="sidebar-onboard-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span className="sidebar-label">Board the Ship</span>
              </Link>
            )}
            {!authLoggedIn && (
              <Link to="/login" className="sidebar-login-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span className="sidebar-label">Sign In</span>
              </Link>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              onClick={handleNavClick}
            >
              {item.icon}
              <span className="sidebar-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-version-badge">{VERSION}</div>
          <div className="sidebar-footer-content">
            <div className="sidebar-footer-links">
              <Link to="/legal">Legal</Link>
              <Link to="/beta">Beta</Link>
            </div>
            <div className="sidebar-copyright">
              &copy; 2026 BlackFlagStreams
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay darkens the rest of the page when sidebar expands — click to dismiss */}
      <div className="sidebar-overlay" onClick={handleOverlayClick} />
    </div>
  );
}
