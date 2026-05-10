import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import LogoSvg from '../assets/bfs.svg';
import './LandingPage.css';

const FEATURES = [
  { icon: '🎬', title: 'Movies & Series', desc: 'Browse TMDB metadata. Stream from Stremio addons. No account needed.' },
  { icon: '📡', title: 'Live TV Built-In', desc: 'Native IPTV player. Xtream Codes & M3U. EPG guide. Like TiviMate but better.' },
  { icon: '🧩', title: 'Stremio Addon Compatible', desc: 'Install any Stremio addon. Torrentio, Comet, MediaFusion — they all just work.' },
  { icon: '☁️', title: 'Cloud Sync', desc: 'Watchlist, progress, and settings sync across all your devices.' },
  { icon: '🏴‍☠️', title: 'Your Streams, Your Way', desc: 'Multiple profiles. Parental PINs. Continue watching. No tracking.' },
  { icon: '💰', title: 'Free to Start', desc: 'Landlubber tier is completely free. Upgrade for IPTV, sync, and more profiles.' },
];

const TIERS = [
  { name: 'Landlubber', price: 'Free', features: ['1 Profile', '5 Addons', 'No IPTV', 'No Sync'] },
  { name: 'Deckhand', price: 'Free', features: ['2 Profiles', 'Unlimited Addons', '1 IPTV Provider', 'Cloud Sync'] },
  { name: 'Buccaneer', price: '$10/yr', features: ['4 Profiles', 'Unlimited Addons', '1 IPTV Provider', 'Torrent Proxy', 'Full EPG'] },
  { name: 'First Mate', price: '$20/yr', features: ['6 Profiles', 'Unlimited Addons', '5 IPTV Providers', 'Everything in Buccaneer', 'Priority Support'] },
];

export default function LandingPage({ onStart, onSignIn }) {
  return (
    <div className="landing-page">
      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-bg" />
        <div className="landing-hero-content">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="landing-logo-container">
              <img src={LogoSvg} alt="BlackFlagStreams" className="landing-logo-img" />
            </div>
            <h1 className="landing-title">
              BlackFlag<span>Streams</span>
            </h1>
            <p className="landing-subtitle">
              The streaming app that puts you in command. Stremio addons, built-in IPTV, no account required.
              Stream anything. Pay nothing.
            </p>
            <div className="landing-hero-actions">
              <button className="btn btn-primary" style={{ padding: '0.85rem 2.5rem', fontSize: '1rem' }} onClick={() => onStart && onStart('register')}>
                Set Sail — It's Free
              </button>
              <button className="btn btn-secondary" style={{ padding: '0.85rem 2rem', fontSize: '1rem' }} onClick={onSignIn}>
                Sign In
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features">
        <h2 className="section-title" style={{ textAlign: 'center', justifyContent: 'center', marginBottom: '2.5rem' }}>
          Everything You Need. Nothing You Don't.
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

      {/* CTA */}
      <section className="landing-cta">
        <h2>Ready to Sail?</h2>
        <p>No credit card. No bullshit. Just streams.</p>
        <button className="btn btn-gold" style={{ padding: '0.85rem 2.5rem', fontSize: '1rem' }} onClick={() => onStart && onStart('free')}>
          ☠️ Set Sail Now
        </button>
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
