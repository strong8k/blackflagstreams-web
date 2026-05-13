import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../lib/store';
import { register, verifyEmail, resendCode } from '../lib/auth';
import { DEFAULT_ADDONS, RECOMMENDED_ADDONS } from '../lib/addons';
import './OnboardingPage.css';

const TIERS = [
  { id: 'free', name: 'Landlubber', price: 'Free', features: ['1 Profile', '5 Custom Addons', 'No IPTV', 'No Sync'], icon: '🛶' },
  { id: 'account', name: 'Deckhand', price: 'Free', features: ['2 Profiles', 'Unlimited Addons', '1 IPTV Provider', 'Cloud Sync'], icon: '⚓' },
  { id: 'buccaneer', name: 'Buccaneer', price: '$10/yr', features: ['4 Profiles', 'Unlimited Addons', 'Torrent Proxy', 'Full EPG'], icon: '⚔️' },
  { id: 'firstmate', name: 'First Mate', price: '$20/yr', features: ['6 Profiles', 'Unlimited Addons', '5 IPTV Providers', 'Priority Support'], icon: '🔱' },
];

const AVATARS = ['🏴‍☠️', '👤', '⚓', '⚔️', '🐙', '🧭', '🪙', '💀'];
const COLORS = ['#e90000', '#f0c040', '#2dd48a', '#4a9eff', '#8a4aff', '#ff4ab3', '#ffffff'];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const addToast = useStore(s => s.addToast);
  const addProfile = useStore(s => s.addProfile);
  const setActiveProfile = useStore(s => s.setActiveProfile);
  const addAddon = useStore(s => s.addAddon);
  const fetchManifest = useStore(s => s.fetchManifest);
  const addIPTVProvider = useStore(s => s.addIPTVProvider);
  const serverRecommended = useStore(s => s.recommendedAddons);

  // Steps: 1: Plan, 2: Account, 3: Verify, 4: Payment, 5: Profile, 6: Addons, 7: IPTV
  const [step, setStep] = useState(1);
  const [selectedTier, setSelectedTier] = useState(null);

  // Account State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');

  // Profile State
  const [profileName, setProfileName] = useState('');
  const [avatar, setAvatar] = useState('🏴‍☠️');
  const [color, setColor] = useState('#c41a1a');

  // Addons State
  const [selectedAddons, setSelectedAddons] = useState([]); // URLs of recommended ones
  const [customAddonUrl, setCustomAddonUrl] = useState('');
  const [customAddons, setCustomAddons] = useState([]); // List of custom manifests

  // IPTV State
  const [iptvUrl, setIptvUrl] = useState('');
  const [iptvUser, setIptvUser] = useState('');
  const [iptvPass, setIptvPass] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tier = searchParams.get('tier');
    if (tier === 'free') {
      setSelectedTier(TIERS[0]);
      setStep(6); // Jump to Addons for quick guest start
    }
  }, [searchParams]);

  const handlePlanSelect = (tier) => {
    setSelectedTier(tier);
    if (tier.id === 'free') {
      setStep(6); // Skip to Addons
    } else {
      setStep(2); // Account creation
    }
  };

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return addToast('Please fill all fields', 'warning');
    setLoading(true);
    try {
      await register(email, password);
      setStep(3);
      addToast('Verification code sent to your email', 'info');
    } catch (err) {
      addToast(err.message || 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    if (verifyCode.length !== 6) return addToast('Enter 6-digit code', 'warning');
    setLoading(true);
    try {
      await verifyEmail(email, verifyCode);
      if (selectedTier.id === 'buccaneer' || selectedTier.id === 'firstmate') {
        setStep(4);
      } else {
        setStep(5);
      }
    } catch (err) {
      addToast(err.message || 'Verification failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      await resendCode(email);
      addToast('Code resent!', 'info');
    } catch (err) {
      addToast(err.message || 'Resend failed', 'error');
    }
  };

  const handlePaymentSubmit = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep(5);
      addToast('Payment successful! Welcome to the crew.', 'success');
    }, 1500);
  };

  const handleProfileSubmit = () => {
    if (!profileName.trim()) return addToast('Enter a name for your profile', 'warning');
    setStep(6);
  };

  const toggleAddon = (url) => {
    setSelectedAddons(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]);
  };

  const handleAddCustom = async () => {
    if (!customAddonUrl) return;
    const limit = selectedTier?.id === 'free' ? 5 : 999;
    if (customAddons.length >= limit) return addToast(`Guest limit reached (${limit} addons)`, 'warning');

    setLoading(true);
    try {
      const manifest = await fetchManifest(customAddonUrl);
      if (manifest) {
        setCustomAddons([...customAddons, manifest]);
        setCustomAddonUrl('');
        addToast(`Added ${manifest.name}`, 'success');
      }
    } catch (e) {
      addToast('Invalid addon URL', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFinishAddons = () => {
    if (selectedTier.id === 'free') {
      handleComplete();
    } else {
      setStep(7);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      // 1. Create Profile
      let finalName = profileName;
      let finalAvatar = avatar;
      let finalColor = color;

      if (selectedTier?.id === 'free') {
        finalName = 'Guest';
        finalAvatar = '🦜';
        finalColor = '#e90000';
      }

      // Note: profile creation now happens at account registration time
      // We just set the active profile name here for display purposes
      const profileId = selectedTier?.id === 'free' ? 'guest' : email;
      await setActiveProfile({ id: profileId, name: finalName, avatar: finalAvatar, color: finalColor });

      // 2. Install Addons
      // Recommended ones
      for (const url of selectedAddons) {
        try { await addAddon(url); } catch {}
      }
      // Custom ones
      for (const manifest of customAddons) {
        try { await addAddon(manifest.transportUrl); } catch {}
      }

      // 3. IPTV (if provided)
      if (iptvUrl) {
        await addIPTVProvider({
          id: 'primary',
          name: 'My IPTV',
          url: iptvUrl,
          username: iptvUser,
          password: iptvPass
        });
      }

      localStorage.setItem('bfs_onboarded', '1');
      addToast('Welcome aboard!', 'success');
      navigate('/');
    } catch (err) {
      addToast('Error finishing setup', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-container">
        <AnimatePresence mode="wait">

          {/* STEP 1: PLAN SELECTION */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="onboarding-step plan-step">
              <h1>Choose Your Path</h1>
              <p>How do you wish to sail the digital seas?</p>
              <div className="plans-row">
                {TIERS.map(tier => (
                  <div key={tier.id} className="plan-card glass-panel" onClick={() => handlePlanSelect(tier)}>
                    <div className="plan-icon">{tier.icon}</div>
                    <h3>{tier.name}</h3>
                    <div className="plan-price">{tier.price}</div>
                    <ul>
                      {tier.features.map(f => <li key={f}>{f}</li>)}
                    </ul>
                    <button className="btn btn-gold btn-sm">Select</button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* STEP 2: ACCOUNT CREATION */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="onboarding-step">
              <div className="onboarding-icon">⚓</div>
              <h2>Create Your Account</h2>
              <p>Secure your deck with an email and password.</p>
              <form onSubmit={handleAccountSubmit} className="onboarding-form">
                <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} required />
                <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="submit" className="btn btn-gold" disabled={loading}>{loading ? 'Sending Code...' : 'Create Account'}</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>Back</button>
              </form>
            </motion.div>
          )}

          {/* STEP 3: VERIFICATION */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="onboarding-step">
              <div className="onboarding-icon">✉️</div>
              <h2>Verify Your Email</h2>
              <p>Enter the 6-digit code sent to <b>{email}</b>.</p>
              <form onSubmit={handleVerifySubmit} className="onboarding-form">
                <input type="text" maxLength={6} placeholder="000000" className="verify-input" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} required />
                <button type="submit" className="btn btn-gold" disabled={loading}>Verify & Continue</button>
                <p className="resend-text">Didn't get a code? <button type="button" className="btn-link" onClick={handleResendCode}>Resend</button></p>
              </form>
            </motion.div>
          )}

          {/* STEP 4: PAYMENT (MOCK) */}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="onboarding-step">
              <div className="onboarding-icon">🪙</div>
              <h2>Complete Your Tribute</h2>
              <p>You've chosen the <b>{selectedTier.name}</b> tier.</p>
              <div className="mock-payment glass-panel">
                <p>Payment integration would go here (Stripe/PayPal).</p>
                <div className="price-tag">{selectedTier.price} / year</div>
              </div>
              <button className="btn btn-gold" onClick={handlePaymentSubmit} disabled={loading}>Pay & Board 🏴‍☠️</button>
            </motion.div>
          )}

          {/* STEP 5: PROFILE CREATION */}
          {step === 5 && (
            <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="onboarding-step">
              <div className="onboarding-icon">👤</div>
              <h2>Identify Yourself</h2>
              <p>Every pirate needs a name and colors.</p>
              <div className="onboarding-form">
                <div className="avatar-preview" style={{ background: color }}>{avatar}</div>
                <input type="text" placeholder="Pirate Name" value={profileName} onChange={e => setProfileName(e.target.value)} autoFocus />
                <div className="onboarding-options">
                  <div className="avatar-grid">
                    {AVATARS.map(a => <button key={a} className={`avatar-btn${avatar === a ? ' active' : ''}`} onClick={() => setAvatar(a)}>{a}</button>)}
                  </div>
                  <div className="color-grid">
                    {COLORS.map(c => <button key={c} className={`color-btn${color === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}
                  </div>
                </div>
                <button className="btn btn-gold" onClick={handleProfileSubmit}>Next Step ❯</button>
              </div>
            </motion.div>
          )}

          {/* STEP 6: ADDONS */}
          {step === 6 && (
            <motion.div key="step6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="onboarding-step addons-step">
              <div className="onboarding-icon">🧩</div>
              <h2>Stock Your Armory</h2>
              <p>Default addons are protected. Add more to find more streams.</p>

              <div className="addons-section">
                <h4>Recommended Addons</h4>
                <div className="addon-onboarding-grid">
                  {serverRecommended.map(addon => (
                    <div key={addon.transportUrl} className={`addon-onboarding-card${selectedAddons.includes(addon.transportUrl) ? ' active' : ''}`} onClick={() => toggleAddon(addon.transportUrl)}>
                      <div className="addon-check">{selectedAddons.includes(addon.transportUrl) ? '✓' : ''}</div>
                      <h3>{addon.name}</h3>
                      <p>{addon.description}</p>
                    </div>
                  ))}
                </div>

                <h4>Add Your Own Stremio Addons</h4>
                <div className="custom-addon-input">
                  <input type="text" placeholder="https://stremio-addon.com/manifest.json" value={customAddonUrl} onChange={e => setCustomAddonUrl(e.target.value)} />
                  <button className="btn btn-primary btn-sm" onClick={handleAddCustom} disabled={loading}>Add</button>
                </div>
                {customAddons.length > 0 && (
                  <div className="custom-addons-list">
                    {customAddons.map((a, i) => <div key={i} className="custom-addon-tag">{a.name} <button onClick={() => setCustomAddons(customAddons.filter((_, idx) => idx !== i))}>✕</button></div>)}
                  </div>
                )}
                <p className="limit-text">
                  {selectedTier?.id === 'free' ? `Guest limit: ${customAddons.length} / 5` : 'Unlimited custom addons'}
                </p>
                <a href="https://stremio-addons.net/" target="_blank" rel="noreferrer" className="btn btn-link">🔍 Discover More Addons</a>
              </div>

              <div className="onboarding-actions">
                <button className="btn btn-secondary" onClick={() => setStep(selectedTier?.id === 'free' ? 1 : 5)}>Back</button>
                <button className="btn btn-gold" onClick={handleFinishAddons}>Continue ❯</button>
              </div>
            </motion.div>
          )}

          {/* STEP 7: IPTV SETUP */}
          {step === 7 && (
            <motion.div key="step7" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="onboarding-step">
              <div className="onboarding-icon">📡</div>
              <h2>Live TV Setup</h2>
              <p>Add your IPTV provider (Xtream Codes). You can skip this and add it later.</p>
              <div className="onboarding-form">
                <input type="text" placeholder="Provider URL (e.g. http://iptv.com:80)" value={iptvUrl} onChange={e => setIptvUrl(e.target.value)} />
                <input type="text" placeholder="Username" value={iptvUser} onChange={e => setIptvUser(e.target.value)} />
                <input type="password" placeholder="Password" value={iptvPass} onChange={e => setIptvPass(e.target.value)} />
                <button className="btn btn-gold" onClick={handleComplete} disabled={loading}>{loading ? 'Setting Sail...' : 'Finish & Board 🏴‍☠️'}</button>
                <button className="btn btn-link" onClick={handleComplete}>Skip for now</button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}