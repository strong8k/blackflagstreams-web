import { useState, useEffect } from 'react';
import { getToken, getApiBaseUrl, isLoggedIn } from '../lib/auth';
import './DeviceLinkPage.css';

export default function DeviceLinkPage({ code }) {
  const [status, setStatus] = useState('idle'); // idle | claiming | done | error | needs_login
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) setStatus('needs_login');
  }, []);

  async function claim() {
    setStatus('claiming');
    setMessage('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/link/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Failed to approve link.');
        return;
      }
      setStatus('done');
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  }

  async function loginAndClaim(e) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error || 'Login failed.'); setLoginLoading(false); return; }
      localStorage.setItem('bfs_session', JSON.stringify({ token: data.token }));
      localStorage.setItem('bfs_user', JSON.stringify(data.user));
      setLoginLoading(false);
      setStatus('idle');
      // Auto-claim after login
      setTimeout(claim, 100);
    } catch {
      setLoginError('Network error.');
      setLoginLoading(false);
    }
  }

  return (
    <div className="device-link-page">
      <div className="device-link-card">
        <div className="device-link-logo">☠️</div>
        <h1>BlackFlag Streams</h1>
        <p className="device-link-sub">TV Device Link</p>

        {status === 'needs_login' && (
          <>
            <p className="device-link-info">
              Sign in to link your TV device (code <strong>{code}</strong>).
            </p>
            <form onSubmit={loginAndClaim} className="device-link-form">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              {loginError && <p className="device-link-error">{loginError}</p>}
              <button type="submit" className="device-link-btn" disabled={loginLoading}>
                {loginLoading ? 'Signing in…' : 'Sign In & Link TV'}
              </button>
            </form>
          </>
        )}

        {status === 'idle' && (
          <>
            <p className="device-link-info">
              Your TV is requesting access with code <strong className="device-link-code">{code}</strong>.
              <br />Approve to link it to your account.
            </p>
            <button className="device-link-btn" onClick={claim}>
              ✓ Approve TV Link
            </button>
            <a href="/" className="device-link-cancel">Cancel</a>
          </>
        )}

        {status === 'claiming' && (
          <p className="device-link-info">Linking your TV…</p>
        )}

        {status === 'done' && (
          <div className="device-link-success">
            <div className="device-link-check">✓</div>
            <p>TV linked successfully!</p>
            <p className="device-link-sub">Your TV should log in automatically within a few seconds.</p>
            <a href="/" className="device-link-btn" style={{ marginTop: '1.5rem', display: 'inline-block' }}>
              Back to App
            </a>
          </div>
        )}

        {status === 'error' && (
          <div className="device-link-error-box">
            <p>{message}</p>
            <button className="device-link-btn" onClick={() => setStatus(isLoggedIn() ? 'idle' : 'needs_login')}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
