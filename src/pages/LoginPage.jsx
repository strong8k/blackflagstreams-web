import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../lib/store';
import { login } from '../lib/auth';
import LogoSvg from '../assets/bfs.svg';

export default function LoginPage() {
  const navigate = useNavigate();
  const addToast = useStore(s => s.addToast);
  const initAuth = useStore(s => s.initAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return addToast('Enter email and password.', 'warning');
    setLoading(true);
    try {
      await login(email, password);
      addToast('Welcome back, Captain!', 'success');
      await initAuth();
      localStorage.setItem('bfs_onboarded', '1');
      navigate('/');
    } catch (err) {
      addToast(err.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <motion.div
        className="login-card glass-panel"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Link to="/">
          <img src={LogoSvg} alt="BFS" style={{ width: 64, height: 64, display: 'block', margin: '0 auto 1rem', filter: 'drop-shadow(0 0 12px rgba(233,0,0,0.4))' }} />
        </Link>
        <h2 style={{ textAlign: 'center', marginBottom: '0.25rem' }}>Sign In</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Welcome back to the crew.
        </p>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required autoFocus
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)} required
          />
          <button type="submit" className="btn btn-gold" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Don't have an account?{' '}
          <Link to="/onboarding" style={{ color: 'var(--primary)' }}>Create one</Link>
        </p>
      </motion.div>
    </div>
  );
}
