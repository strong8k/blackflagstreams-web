import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import Toasts from './components/Toasts';
import { useStore } from './lib/store';
import { getApiBaseUrl } from './lib/auth';
import { log, clearLogs, initLogger } from './lib/logger';
initLogger(); // intercept console.*, errors, clicks, navigation — must run before anything else

// ── Lazy-loaded pages ──
const HomePage      = lazy(() => import('./pages/HomePage'));
const MoviesPage    = lazy(() => import('./pages/MoviesPage'));
const SeriesPage    = lazy(() => import('./pages/SeriesPage'));
const SearchPage    = lazy(() => import('./pages/SearchPage'));
const DetailPage    = lazy(() => import('./pages/DetailPage'));
const PlayerPage    = lazy(() => import('./pages/PlayerPage'));
const SeasonPage    = lazy(() => import('./pages/SeasonPage'));
const EpisodePage   = lazy(() => import('./pages/EpisodePage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const AddonsPage    = lazy(() => import('./pages/AddonsPage'));
const SettingsPage  = lazy(() => import('./pages/SettingsPage'));
const IPTVPage      = lazy(() => import('./pages/IPTVPage'));
const IPTVSetupPage  = lazy(() => import('./pages/IPTVSetupPage'));
const UpgradePage   = lazy(() => import('./pages/UpgradePage'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const LandingPage   = lazy(() => import('./pages/LandingPage'));
const LoginPage     = lazy(() => import('./pages/LoginPage'));
const AdminPage     = lazy(() => import('./pages/AdminPage'));
const BetaTesterPage = lazy(() => import('./pages/BetaTesterPage'));
const LegalPage     = lazy(() => import('./pages/LegalPage'));
const LogsPage      = lazy(() => import('./pages/LogsPage'));
const NotFoundPage  = lazy(() => import('./pages/NotFoundPage'));
const TorBoxPage    = lazy(() => import('./pages/TorBoxPage'));
const ProfilePickerPage = lazy(() => import('./pages/ProfilePickerPage'));
const DeviceLinkPage = lazy(() => import('./pages/DeviceLinkPage'));

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
};

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function PageWrapper({ children }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {children}
    </motion.div>
  );
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPlayer = location.pathname === '/player';
  const isAdmin   = location.pathname === '/xbf-ops-9a2c';
  const isLanding = location.pathname === '/' && !localStorage.getItem('bfs_onboarded') && !localStorage.getItem('bfs_session');

  const [configReady, setConfigReady] = useState(
    !!(localStorage.getItem('bfs_tmdb_key') || localStorage.getItem('bfs_user_tmdb_key'))
  );
  const setGlobalConfig = useStore(s => s.setGlobalConfig);
  const initAuth = useStore(s => s.initAuth);
  const authUser = useStore(s => s.auth?.user);

  useEffect(() => {
    log('info', 'App initialized');

    const baseUrl = getApiBaseUrl();
    const cachedKey = localStorage.getItem('bfs_user_tmdb_key') || localStorage.getItem('bfs_tmdb_key');
    if (cachedKey) setConfigReady(true);

    fetch(`${baseUrl}/api/config`)
      .then(r => r.ok ? r.json() : null)
      .then(cfg => {
        if (cfg) {
          setGlobalConfig(cfg);
          if (cfg.tmdbKey && !localStorage.getItem('bfs_user_tmdb_key')) {
            localStorage.setItem('bfs_tmdb_key', cfg.tmdbKey);
          }
        }
        setConfigReady(true);
      })
      .catch(() => setConfigReady(true));

    initAuth();
  }, [setGlobalConfig, initAuth]);

  // Link code for QR auth — TV device pairing
  const linkCode = new URLSearchParams(location.search).get('link');
  if (linkCode) {
    return (
      <Suspense fallback={<div className="app-boot-screen"><span className="logo">☠️</span><div className="spinner" /></div>}>
        <DeviceLinkPage code={linkCode} />
      </Suspense>
    );
  }

  if (!configReady) {
    return (
      <div className="app-boot-screen">
        <span className="logo">☠️</span>
        <div className="spinner" />
        <p style={{ color: 'var(--text-muted)' }}>Preparing to sail...</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {!isPlayer && !isAdmin && !isLanding && <Sidebar />}
      <main className={`main-content${isPlayer ? ' player-active' : ''}`}>
        <Suspense fallback={<div className="app-boot-screen"><div className="spinner" /></div>}>
          <AnimatePresence mode="wait" initial={false}>
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<PageWrapper>{isLanding ? <LandingPage onStart={(mode) => { if (mode === "register") navigate("/onboarding"); else navigate("/login"); }} onSignIn={() => navigate("/login")} /> : <HomePage />}</PageWrapper>} />
              <Route path="/movies" element={<PageWrapper><MoviesPage /></PageWrapper>} />
              <Route path="/series" element={<PageWrapper><SeriesPage /></PageWrapper>} />
              <Route path="/search" element={<PageWrapper><SearchPage /></PageWrapper>} />
              <Route path="/detail/:type/:id" element={<PageWrapper><DetailPage /></PageWrapper>} />
              <Route path="/tv/:id/season/:season" element={<PageWrapper><SeasonPage /></PageWrapper>} />
              <Route path="/tv/:id/season/:season/episode/:ep" element={<PageWrapper><EpisodePage /></PageWrapper>} />
              <Route path="/player" element={<PlayerPage />} />
              <Route path="/watchlist" element={<PageWrapper><WatchlistPage /></PageWrapper>} />
              <Route path="/addons" element={<PageWrapper><AddonsPage /></PageWrapper>} />
              <Route path="/settings" element={<PageWrapper><SettingsPage /></PageWrapper>} />
              <Route path="/iptv" element={<PageWrapper><IPTVPage /></PageWrapper>} />
              <Route path="/iptv/setup" element={<PageWrapper><IPTVSetupPage /></PageWrapper>} />
              <Route path="/upgrade" element={<PageWrapper><UpgradePage /></PageWrapper>} />
              <Route path="/onboarding" element={<PageWrapper><OnboardingPage /></PageWrapper>} />
              <Route path="/login" element={<PageWrapper><LoginPage /></PageWrapper>} />
              <Route path="/profiles" element={<PageWrapper><ProfilePickerPage /></PageWrapper>} />
              <Route path="/xbf-ops-9a2c" element={<PageWrapper><AdminPage /></PageWrapper>} />
              <Route path="/admin" element={<PageWrapper><AdminPage /></PageWrapper>} />
             <Route path="/beta" element={<PageWrapper><BetaTesterPage /></PageWrapper>} />
              <Route path="/legal" element={<PageWrapper><LegalPage /></PageWrapper>} />
              <Route path="/logs" element={<PageWrapper><LogsPage /></PageWrapper>} />
              <Route path="/torbox" element={<PageWrapper><TorBoxPage /></PageWrapper>} />
              <Route path="*" element={<PageWrapper><NotFoundPage /></PageWrapper>} />
            </Routes>
          </AnimatePresence>
        </Suspense>
      </main>
      <Toasts />
    </div>
  );
}

export default function App() {
  const initWatchlist = useStore(s => s.initWatchlist);
  const initContinueWatching = useStore(s => s.initContinueWatching);
  const initIPTV = useStore(s => s.initIPTV);

  useEffect(() => {
    initWatchlist();
    initContinueWatching();
    initIPTV();
  }, []);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppShell />
    </BrowserRouter>
  );
}
