import React from 'react';
import TorBoxPromo from '../components/TorBoxPromo';

export default function TorBoxPage() {
  return (
    <div className="page" style={{ paddingTop: '1.5rem' }}>
      <div className="container" style={{ maxWidth: 700 }}>
        <h2 className="section-title">⚡ TorBox Integration</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          TorBox is a debrid service that gives you instant access to cached torrents.
          Connect your account below and get blazing-fast streams with zero buffering.
        </p>
        <TorBoxPromo />
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Why TorBox?</h3>
          <ul style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: '1.25rem' }}>
            <li>Instant playback of cached torrents — no waiting for downloads</li>
            <li>Works with Torrentio, Comet, MediaFusion and all Stremio addons</li>
            <li>Much faster than WebTorrent for large files</li>
            <li>Usenet support built in</li>
          </ul>
          <a
            href="https://torbox.app/subscription?referral=ca6e2688-382c-46f0-a0f9-009481bbdafc"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-gold"
            style={{ marginTop: '1rem', textDecoration: 'none', display: 'inline-flex' }}
          >
            Sign Up for TorBox →
          </a>
        </div>
      </div>
    </div>
  );
}
