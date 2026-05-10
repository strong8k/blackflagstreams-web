import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import './PromoBanner.css';

export default function PromoBanner() {
  const navigate = useNavigate();

  return (
    <motion.div 
      className="promo-banner glass-panel"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="promo-content">
        <span className="promo-badge">Limited Access</span>
        <h2>You are currently browsing as a Guest</h2>
        <p>Board the ship to unlock full streaming, IPTV, and cloud sync across all your devices.</p>
        <button className="btn btn-gold" onClick={() => navigate('/onboarding')}>
          ☠️ Board the Ship
        </button>
      </div>
      <div className="promo-illustration">🏴‍☠️</div>
    </motion.div>
  );
}
