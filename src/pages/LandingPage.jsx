import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { getNowPlayingMovies, getTrending, img } from '../lib/tmdb';
import LogoSvg from '../assets/bfs.svg';
import './LandingPage.css';

const FEATURES = [
  { icon: '🎬', title: 'Movies & Series', desc: 'Browse TMDB metadata. Stream from Stremio addons.' },
  { icon: '📡', title: 'Live TV Built-In', desc: 'Native IPTV player. Xtream Codes & M3U. EPG guide.' },
  { icon: '🧩', title: 'Stremio Addon Compatible', desc: 'Any Stremio addon. Torrentio, Comet, MediaFusion — they all just work.' },
  { icon: '☁️', title: 'Cloud Sync', desc: 'Watchlist, progress, and settings sync across all your devices.' },
  { icon: '🏴‍☠️', title: 'Your Streams, Your Way', desc: 'Multiple profiles. Parental PINs. Continue watching. No tracking.' },
  { icon: '⚡', title: 'TorBox Integration', desc: 'Instant cached torrents. Debrid streaming at full speed.' },
];

const TIERS = [
  { name: 'Landlubber', price: 'Free', features: ['1 Profile', '5 Addons', 'No IPTV', 'No Sync'] },
  { name: 'Deckhand', price: 'Free', features: ['2 Profiles', 'Unlimited Addons', '1 IPTV Provider', 'Cloud Sync'] },
  { name: 'Buccaneer', price: '$10/yr', features: ['4 Profiles', 'Unlimited Addons', '1 IPTV Provider', 'Torrent Proxy', 'Full EPG'] },
  { name: 'First Mate', price: '$20/yr', features: ['6 Profiles', 'Unlimited Addons', '5 IPTV Providers', 'Everything in Buccaneer', 'Priority Support'] },
];

const HERO_INTERVAL = 4000;

function HeroSlide({ item }) {
  const backdrop = item.backdrop_path ? img.backdrop(item.backdrop_path, 'w1280') : null;
  const title = item.title || item.name;
  const year = (item.release_date || item.first_air_date || '').substring(0, 4);
  const overview = item.overview ? (item.overview.length > 180 ? item.overview.substring(0, 180) + '...' : item.overview) : '';

  return (
    <motion.div
      className="hero-slide"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {backdrop && (
        <div className="hero-slide-bg" style={{ backgroundImage: `url(${backdrop})` }}>
          <div className="hero-slide-gradient" />
        </div>
      )}
      <div className="hero-slide-movie-info">
        <h3 className="hero-slide-movie-title">{title}</h3>
        <div className="hero-slide-movie-meta">{year}{item.vote_average ? ` • ★ ${item.vote_average.toFixed(1)}` : ''}</div>
        {overview && <p className="hero-slide-movie-desc">{overview}</p>}
      </div>
    </motion.div>
  );
}

export default function LandingPage({ onStart, onSignIn }) {
  const [heroItems, setHeroItems] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nowPlaying, trending] = await Promise.all([
          getNowPlayingMovies(),
          getTrending('movie', 'week'),
        ]);
        if (cancelled) return;
        const merged = [...(nowPlaying.results || []), ...(trending.results || [])];
        const seen = new Set();
        const unique = merged.filter(m => {
          if (seen.has(m.id) || !m.backdrop_path) return false;
          seen.add(m.id);
          return true;
        }).slice(0, 15);
        setHeroItems(unique);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const next = useCallback(() => {
    setActiveIdx(i => (i + 1) % heroItems.length);
  }, [heroItems.length]);

  useEffect(() => {
    if (heroItems.length < 2) return;
    const timer = setInterval(next, HERO_INTERVAL);
    return () => clearInterval(timer);
  }, [heroItems.length, next]);

  return (
    <div className="landing-page">
      {/* Hero Carousel */}
      <section className="landing-hero">
        {heroItems.length > 0 ? (
          <>
            <div className="hero-slides-wrapper">
              <AnimatePresence initial={false}>
                <HeroSlide key={heroItems[activeIdx]?.id} item={heroItems[activeIdx]} />
              </AnimatePresence>
            </div>

            {/* Dots */}
            <div className="hero-dots">
              {heroItems.map((_, i) => (
                <button
                  key={i}
                  className={`hero-dot${i === activeIdx ? ' active' : ''}`}
                  onClick={() => setActiveIdx(i)}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>

            {/* Branding Overlay */}
            <div className="hero-branding">
              <img src={LogoSvg} alt="BlackFlagStreams" className="hero-brand-logo" />
              <h1 className="hero-brand-title">BlackFlag<span>Streams</span></h1>
              <p className="hero-brand-tagline">Stream Anything.</p>
              <div className="hero-brand-actions">
                <button className="btn btn-primary" style={{ padding: '0.8rem 2.5rem', fontSize: '1rem' }} onClick={() => onStart && onStart('register')}>
                  Set Sail
                </button>
                <button className="btn btn-secondary" style={{ padding: '0.8rem 2rem', fontSize: '1rem' }} onClick={onSignIn}>
                  Sign In
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="landing-hero-fallback">
            <div className="landing-hero-bg" />
            <div className="landing-hero-content">
              <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <div className="landing-logo-container">
                  <img src={LogoSvg} alt="BlackFlagStreams" className="landing-logo-img" />
                </div>
                <h1 className="landing-title">BlackFlag<span>Streams</span></h1>
                <p className="landing-subtitle">Stream Anything.</p>
                <div className="landing-hero-actions">
                  <button className="btn btn-primary" style={{ padding: '0.85rem 2.5rem', fontSize: '1rem' }} onClick={() => onStart && onStart('register')}>Set Sail</button>
                  <button className="btn btn-secondary" style={{ padding: '0.85rem 2rem', fontSize: '1rem' }} onClick={onSignIn}>Sign In</button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </section>

      {/* Features */}
      <section className="landing-features">
        <h2 className="section-title" style={{ textAlign: 'center', justifyContent: 'center', marginBottom: '2.5rem' }}>
          Everything You Need.
        </h2>
        <div className="landing-features-grid">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              className="landing-feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              viewport={{ once: true }}
            >
              <div className="landing-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Tiers */}
      <section className="landing-tiers">
        <h2 className="section-title" style={{ textAlign: 'center', justifyContent: 'center', marginBottom: '2.5rem' }}>
          Choose Your Crew
        </h2>
        <div className="landing-tiers-grid">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              className={`landing-tier-card${i === 2 ? ' featured' : ''}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
            >
              {i === 2 && <div className="landing-tier-badge">Best Value</div>}
              <h3>{tier.name}</h3>
              <div className="landing-tier-price">{tier.price}</div>
              <ul>
                {tier.features.map(f => <li key={f}>✓ {f}</li>)}
              </ul>
              <button className={`btn ${i === 2 ? 'btn-gold' : 'btn-secondary'}`} style={{ width: '100%', marginTop: 'auto' }}
                onClick={() => onStart && onStart(i === 0 ? 'guest' : 'register')}>
                {i === 0 ? 'Browse Free' : 'Get Started'}
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-links" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center', gap: '2rem', fontSize: '0.9rem' }}>
          <Link to="/legal" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Legal Notice</Link>
          <Link to="/beta" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Beta Program</Link>
          <a href="https://stremio-addons.net" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Addon Directory</a>
        </div>
        <p style={{ opacity: 0.6 }}>© 2026 BlackFlagStreams by <a href="https://www.lowdefpirate.link" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>LowDefPirate</a></p>
      </footer>
    </div>
  );
}
