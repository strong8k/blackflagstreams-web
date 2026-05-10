import React, { useState } from 'react';
import { useStore } from '../lib/store';
import { requestAdminOtp, verifyAdminOtp } from '../lib/auth';
import './AdminPage.css';

const LOG = (...a) => console.log('[BFS:Admin]', ...a);
const ERR = (...a) => console.error('[BFS:Admin]', ...a);

// ── Admin 2FA Login ──
function AdminLogin({ onAuth }) {
  const [step, setStep] = useState('token'); // 'token' | 'otp'
  const [adminToken, setAdminToken] = useState('');
  const [otp, setOtp] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const addToast = useStore(s => s.addToast);

  const handleTokenSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken.trim()) return;
    setLoading(true);
    setError('');
    LOG('Step 1: requesting OTP for admin token...');
    try {
      const res = await requestAdminOtp(adminToken.trim());
      setMaskedEmail(res.email || 'your admin email');
      setStep('otp');
      addToast('OTP sent to admin email', 'info');
      LOG('OTP requested, email hint:', res.email);
    } catch (e) {
      ERR('OTP request failed:', e.message);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setError('Enter the 6-digit code from your email'); return; }
    setLoading(true);
    setError('');
    LOG('Step 2: verifying OTP...');
    try {
      const res = await verifyAdminOtp(adminToken.trim(), otp);
      LOG('Admin authenticated. Session:', res.adminSession?.slice(0, 8) + '...');
      addToast('Access Granted ⚓', 'success');
      onAuth(res.adminSession);
    } catch (e) {
      ERR('OTP verification failed:', e.message);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page page">
      <div className="admin-login-card glass-panel">
        <div className="login-header">
          <span className="login-icon">🏴‍☠️</span>
          <h2>Ops Console</h2>
          <p>
            {step === 'token'
              ? 'Enter your admin token to request a one-time code.'
              : `Enter the 6-digit code sent to ${maskedEmail}`}
          </p>
        </div>

        {step === 'token' ? (
          <form onSubmit={handleTokenSubmit}>
            <div className="form-group">
              <label>Admin Token</label>
              <input
                type="password"
                value={adminToken}
                onChange={e => setAdminToken(e.target.value)}
                placeholder="••••••••••••"
                autoFocus
                autoComplete="off"
              />
            </div>
            {error && <p className="admin-error">{error}</p>}
            <button type="submit" className="btn btn-gold" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
              {loading ? 'Sending Code...' : 'Request One-Time Code →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <div className="form-group">
              <label>One-Time Code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoFocus
                autoComplete="one-time-code"
                style={{ letterSpacing: '0.3em', fontSize: '1.4rem', textAlign: 'center' }}
              />
            </div>
            {error && <p className="admin-error">{error}</p>}
            <button type="submit" className="btn btn-gold" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
              {loading ? 'Verifying...' : 'Enter Command Center ⚓'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => { setStep('token'); setOtp(''); setError(''); }}>
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Admin Shell ──
export default function AdminPage() {
  const [adminSession, setAdminSession] = useState(null);
  const [view, setView] = useState('dashboard');
  const addToast = useStore(s => s.addToast);

  if (!adminSession) {
    return <AdminLogin onAuth={(session) => setAdminSession(session)} />;
  }

  return (
    <div className="admin-page page container">
      <header className="admin-header">
        <h1 className="section-title">⚓ Ops Console</h1>
        <nav className="admin-nav">
          {['dashboard', 'users', 'addons', 'config', 'danger'].map(v => (
            <button
              key={v}
              className={`admin-nav-btn ${view === v ? 'active' : ''}`}
              onClick={() => setView(v)}
            >
              {v.toUpperCase()}
            </button>
          ))}
          <button className="admin-nav-btn logout" onClick={() => { setAdminSession(null); addToast('Logged out', 'info'); }}>
            LOGOUT
          </button>
        </nav>
      </header>

      <main className="admin-content">
        {view === 'dashboard' && <DashboardView adminSession={adminSession} />}
        {view === 'users' && <UsersView adminSession={adminSession} />}
        {view === 'addons' && <AddonsView />}
        {view === 'config' && <ConfigView adminSession={adminSession} />}
        {view === 'danger' && <DangerView adminSession={adminSession} />}
      </main>
    </div>
  );
}

function DashboardView({ adminSession }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    import('../lib/auth').then(({ getApiBaseUrl }) => {
      fetch(`${getApiBaseUrl()}/api/admin/stats`, {
        headers: { 'X-Admin-Session': adminSession },
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => { setStats(data); setLoading(false); })
        .catch(e => { ERR('stats fetch:', e.message); setLoading(false); });
    });
  }, [adminSession]);

  return (
    <div className="admin-view">
      <div className="stats-grid">
        <div className="stat-card glass-panel">
          <div className="stat-label">Active Users</div>
          <div className="stat-value">{loading ? '...' : (stats?.activeUsers ?? '—')}</div>
          <div className="stat-trend">{stats?.userTrend || ''}</div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-label">Registered Devices</div>
          <div className="stat-value">{loading ? '...' : (stats?.devices ?? '—')}</div>
          <div className="stat-trend">{stats?.deviceTrend || ''}</div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-label">Streams Today</div>
          <div className="stat-value">{loading ? '...' : (stats?.streamsToday ?? '—')}</div>
          <div className="stat-trend">{stats?.streamTrend || ''}</div>
        </div>
      </div>

      <div className="glass-panel" style={{ marginTop: '2rem', padding: '2rem' }}>
        <h3>System Health</h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          {stats?.healthMessage || 'Fetching fleet status...'}
        </p>
        <div className="health-bar" style={{ height: '4px', background: 'var(--border)', marginTop: '1.5rem', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${stats?.uptime ?? 0}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
      </div>
    </div>
  );
}

function UsersView({ adminSession }) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    import('../lib/auth').then(({ getApiBaseUrl }) => {
      fetch(`${getApiBaseUrl()}/api/admin/users?q=${encodeURIComponent(search)}`, {
        headers: { 'X-Admin-Session': adminSession },
      })
        .then(r => r.ok ? r.json() : { users: [] })
        .then(data => { setUsers(data.users || []); setLoading(false); })
        .catch(e => { ERR('users fetch:', e.message); setLoading(false); });
    });
  }, [adminSession, search]);

  return (
    <div className="admin-view">
      <div className="admin-controls glass-panel">
        <input
          type="text"
          placeholder="Search sailors by name, email, or ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="admin-search"
        />
      </div>

      <div className="admin-table-container glass-panel">
        {loading ? (
          <p style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading crew manifest...</p>
        ) : users.length === 0 ? (
          <p style={{ padding: '2rem', color: 'var(--text-muted)' }}>No sailors found.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Sailor</th>
                <th>Rank</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="user-info">
                      <span className="user-name">{u.name || u.email}</span>
                      <span className="user-email">{u.email}</span>
                    </div>
                  </td>
                  <td><span className="rank-badge">{u.tier}</span></td>
                  <td>{u.created ? new Date(u.created).toLocaleDateString() : '—'}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn-icon" title="Edit">⚙</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AddonsView() {
  return (
    <div className="admin-view">
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <h3>Global Fleet Addons</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          These addons are forced on every ship in the fleet.
        </p>
        <div className="addon-list">
          <div className="addon-item glass-panel">
            <div className="addon-info">
              <span className="addon-name">Cinemeta</span>
              <span className="addon-url">https://v3-cinemeta.strem.io/manifest.json</span>
            </div>
            <span className="badge-locked">LOCKED</span>
          </div>
          <div className="addon-item glass-panel">
            <div className="addon-info">
              <span className="addon-name">OpenSubtitles</span>
              <span className="addon-url">https://opensubtitles-v3.strem.io/manifest.json</span>
            </div>
            <span className="badge-locked">LOCKED</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigView({ adminSession }) {
  const [config, setConfig] = useState({ tmdbKey: '', corsProxy: '', systemNotice: '' });
  const [saving, setSaving] = useState(false);
  const addToast = useStore(s => s.addToast);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { getApiBaseUrl } = await import('../lib/auth');
      const res = await fetch(`${getApiBaseUrl()}/api/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Session': adminSession },
        body: JSON.stringify(config),
      });
      if (res.ok) addToast('Fleet orders saved', 'success');
      else addToast(`Save failed (${res.status})`, 'error');
    } catch (e) {
      ERR('config save:', e.message);
      addToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-view">
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <h3>System Configuration</h3>
        <form className="admin-form" style={{ marginTop: '2rem' }} onSubmit={handleSave}>
          <div className="form-group">
            <label>TMDB API Key</label>
            <input type="text" placeholder="v3 api key..." value={config.tmdbKey}
              onChange={e => setConfig(c => ({ ...c, tmdbKey: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>CORS Proxy URL</label>
            <input type="text" placeholder="https://proxy.worker.dev" value={config.corsProxy}
              onChange={e => setConfig(c => ({ ...c, corsProxy: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>System Notice</label>
            <textarea placeholder="Message for all users..." rows={3} value={config.systemNotice}
              onChange={e => setConfig(c => ({ ...c, systemNotice: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn-gold" disabled={saving}>
            {saving ? 'Saving...' : 'Save Fleet Orders'}
          </button>
        </form>
      </div>
    </div>
  );
}

function DangerView({ adminSession }) {
  const addToast = useStore(s => s.addToast);
  const [confirming, setConfirming] = useState(null);

  const handleDanger = async (action) => {
    if (confirming !== action) { setConfirming(action); return; }
    setConfirming(null);
    try {
      const { getApiBaseUrl } = await import('../lib/auth');
      const res = await fetch(`${getApiBaseUrl()}/api/admin/danger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Session': adminSession },
        body: JSON.stringify({ action }),
      });
      if (res.ok) addToast(`Action "${action}" executed`, 'success');
      else addToast(`Failed (${res.status})`, 'error');
    } catch (e) { addToast(e.message, 'error'); }
  };

  return (
    <div className="admin-view">
      <div className="glass-panel danger-zone" style={{ padding: '2rem', border: '1px solid var(--accent)' }}>
        <h3 style={{ color: 'var(--accent)' }}>☠ Treacherous Waters</h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: '2rem' }}>
          These actions will scuttle the fleet. Click once to arm, again to fire.
        </p>

        <div className="danger-action">
          <div className="danger-info">
            <h4>Scuttle Fleet (Nuke DB)</h4>
            <p>Wipes all users, history, and addons. Irreversible.</p>
          </div>
          <button
            className="btn btn-sm"
            style={{ background: confirming === 'nuke' ? '#7f1d1d' : 'var(--accent)', color: '#fff', border: 'none' }}
            onClick={() => handleDanger('nuke')}
          >
            {confirming === 'nuke' ? '⚠ CONFIRM NUKE' : 'FIRE ALL CANNONS'}
          </button>
        </div>

        <div className="danger-action" style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
          <div className="danger-info">
            <h4>Ghost Buster</h4>
            <p>Purge orphaned email indices and cleanup database fragments.</p>
          </div>
          <button className="btn btn-gold btn-sm" onClick={() => handleDanger('ghost-bust')}>
            {confirming === 'ghost-bust' ? '⚠ CONFIRM' : 'SCAN & PURGE'}
          </button>
        </div>
      </div>

    </div>
  );
}
