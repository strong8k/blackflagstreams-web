import React from 'react';
import { motion } from 'framer-motion';
import './LegalPage.css';

export default function LegalPage() {
  return (
    <div className="legal-container page">
      <motion.div
        className="legal-content glass-panel"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="section-title">Legal Notice</h1>
        <p className="last-updated">Last updated: May 2026</p>

        <section>
          <h2>What We Are</h2>
          <p>
            BlackFlagStreams is a media browser and player built around the Stremio addon protocol.
            We don't host, store, or distribute any media files. Everything you watch comes from
            third-party addons and external services that you choose to install — we just provide
            the interface.
          </p>
        </section>

        <section className="highlight-box">
          <h2>Torrent Proxy</h2>
          <p>
            Running a torrent proxy costs real money in bandwidth. Because of that, magnet link
            streaming through our proxy is available to <strong>Buccaneer tier and above</strong> only.
          </p>
          <p>
            Free users (Landlubbers and Deckhands) can still use direct HTTP links and IPTV sources
            without any restrictions. If you want torrent streams without upgrading, you can connect
            your own Debrid service through any compatible addon.
          </p>
        </section>

        <section>
          <h2>Your Responsibility</h2>
          <p>
            You're responsible for the addons you install and what you stream through them. We don't
            verify whether content from third-party addons is licensed or not. Use your head — support
            creators where you can.
          </p>
        </section>

        <section>
          <h2>Your Data</h2>
          <p>
            We don't sell your data. Registered accounts store encrypted metadata (watchlist, history,
            addons) in cloud storage for sync across your devices. Guests store everything locally in
            their browser — nothing leaves their device.
          </p>
        </section>

        <section>
          <h2>DMCA & Copyright</h2>
          <p>
            We don't host infringing content. If a third-party addon is serving something it shouldn't,
            take it up with that addon's developer — we have no control over what they index or serve.
            For anything involving our platform directly, reach us at{' '}
            <strong>legal@blackflagstreams.link</strong>.
          </p>
        </section>

        <div className="legal-footer">
          <p>© 2026 BlackFlagStreams</p>
        </div>
      </motion.div>
    </div>
  );
}
