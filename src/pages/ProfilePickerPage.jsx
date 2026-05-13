import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../lib/store';

export default function ProfilePickerPage() {
  const navigate = useNavigate();
  const profiles = useStore(s => s.profiles);
  const activeProfile = useStore(s => s.activeProfile);
  const setActiveProfile = useStore(s => s.setActiveProfile);
  const addProfile = useStore(s => s.addProfile);
  const auth = useStore(s => s.auth);

  const activeProfileId = activeProfile?.id;

  const tierLimits = {
    free: 1,
    account: 2,
    premium: 4,
    pro: 6,
    ultra: 10,
  };
  const profileLimit = auth?.tierLimits?.profiles || tierLimits[auth?.tier || 'free'] || 1;

  const handleSelect = async (id) => {
    await setActiveProfile(id);
    navigate('/');
  };

  const handleAddProfile = () => {
    try {
      const name = prompt('Enter pirate name:');
      if (name) {
        const AVATARS = ['🏴‍☠️', '👤', '⚓', '⚔️', '🐙', '🧭', '🪙', '💀'];
        const COLORS = ['#e90000', '#f0c040', '#2dd48a', '#4a9eff', '#8a4aff', '#ff4ab3', '#ffffff'];
        const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        addProfile({ name, avatar, color });
      }
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="page profile-picker-page">
      <div className="profile-container">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: '3rem', textAlign: 'center' }}
        >
          Who's boarding?
        </motion.h1>

        <div className="profile-grid">
          {profiles.map((profile, idx) => (
            <motion.div
              key={profile.id}
              className={`profile-card${activeProfileId === profile.id ? ' active' : ''}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              onClick={() => handleSelect(profile.id)}
            >
              <div className="profile-avatar" style={{ background: profile.color || '#c41a1a' }}>
                {profile.avatar || '🏴‍☠️'}
              </div>
              <div className="profile-name">{profile.name}</div>
              {activeProfileId === profile.id && <div className="profile-badge">Active</div>}
            </motion.div>
          ))}

          {profiles.length < profileLimit && (
            <motion.div
              className="profile-card add-profile"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: profiles.length * 0.1 }}
              onClick={handleAddProfile}
            >
              <div className="profile-avatar">+</div>
              <div className="profile-name">Add Profile</div>
            </motion.div>
          )}
        </div>

        <div style={{ marginTop: '4rem', textAlign: 'center' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/settings')}>Manage Profiles</button>
        </div>
      </div>

      <style jsx="true">{`
        .profile-picker-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #050508;
        }
        .profile-container {
          max-width: 800px;
          width: 100%;
          padding: 2rem;
        }
        .profile-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 2rem;
          justify-content: center;
        }
        .profile-card {
          width: 140px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .profile-card:hover .profile-avatar {
          transform: scale(1.1);
          box-shadow: 0 0 20px rgba(196, 26, 26, 0.4);
          border-color: white;
        }
        .profile-avatar {
          width: 120px; height: 120px;
          margin: 0 auto 1rem;
          background: #1a1a24;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          font-size: 3.5rem;
          border: 3px solid transparent;
          transition: all 0.3s ease;
        }
        .profile-card.active .profile-avatar { border-color: var(--primary); }
        .profile-name { font-size: 1.1rem; font-weight: 500; color: var(--text-muted); transition: color 0.3s; }
        .profile-card:hover .profile-name { color: white; }
        .profile-badge { font-size: 0.7rem; color: var(--primary); text-transform: uppercase; margin-top: 0.5rem; font-weight: 700; }

        .add-profile .profile-avatar { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.3); font-size: 2.5rem; }
        .add-profile:hover .profile-avatar { color: white; border-color: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}