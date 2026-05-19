import React, { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { requestAdminOtp, verifyAdminOtp, getApiBaseUrl } from '../lib/auth';
import { VERSION } from '../lib/version';
import './AdminPage.css';

const LOG = (...a) => console.log('[BFS:Admin]', ...a);
const ERR = (...a) => console.error('[BFS:Admin]', ...a);

// ── Admin 2FA Login ──
function AdminLogin({ onAuth }) {
  const [step, setStep] = useState('token'); // 'token' | 'totp'
  const [adminToken, setAdminToken] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const addToast = useStore(s => s.addToast);

  const handleTokenSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await requestAdminOtp(adminToken.trim());
      // Bypass: 2FA disabled or not yet configured — session granted directly
      if (res.bypassed) {
        LOG('2FA bypassed:', res.reason, '— session granted');
        addToast(res.reason === '2FA_NOT_CONFIGURED' ? 'Access granted — configure 2FA in the 2FA tab' : 'Access Granted ⚓', 'success');
        onAuth(res.session);
        return;
      }
      // TOTP required — prompt for authenticator app code
      setStep('totp');
      addToast('Enter the code from your authenticator app', 'info');
    } catch (e) {
      ERR('Token submit failed:', e.message);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return; }
    setLoading(true);
    setError('');
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
              ? 'Enter your admin token to continue.'
              : 'Enter the 6-digit code from your authenticator app.'}
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
              {loading ? 'Verifying...' : 'Continue →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <div className="form-group">
              <label>Authenticator Code</label>
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
  const [adminSession, setAdminSession] = useState(() => localStorage.getItem('bfs_admin_session'));
  const [view, setView] = useState('dashboard');
  const addToast = useStore(s => s.addToast);

  useEffect(() => {
    if (adminSession) localStorage.setItem('bfs_admin_session', adminSession);
    else localStorage.removeItem('bfs_admin_session');
  }, [adminSession]);

  if (!adminSession) {
    return <AdminLogin onAuth={(session) => setAdminSession(session)} />;
  }

  return (
    <div className="admin-page page container">
      <header className="admin-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-page, #0a0a0f)', paddingBottom: '0.5rem' }}>
        <h1 className="section-title">⚓ Ops Console <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>{VERSION}</span></h1>
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
        {view === 'addons' && <AddonsView adminSession={adminSession} />}
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
    fetch(`${getApiBaseUrl()}/api/admin/stats`, {
      headers: { 'X-Admin-Session': adminSession },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setStats(data); setLoading(false); })
      .catch(e => { ERR('stats fetch:', e.message); setLoading(false); });
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
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    tier: 'free', banned: false, isBeta: false, isUltra: false,
    email: '', newPassword: '', billingPrice: '', sendPasswordEmail: true,
  });
  const [saving, setSaving] = useState(false);
  const addToast = useStore(s => s.addToast);

  React.useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/admin/users?q=${encodeURIComponent(search)}`, {
      headers: { 'X-Admin-Session': adminSession },
    })
      .then(r => r.ok ? r.json() : { users: [] })
      .then(data => { setUsers(data.users || []); setLoading(false); })
      .catch(e => { ERR('users fetch:', e.message); setLoading(false); });
  }, [adminSession, search]);

  const openEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      tier: user.tier || 'free',
      banned: user.banned || false,
      isBeta: user.isBeta || false,
      isUltra: user.isUltra || false,
      email: user.email || '',
      newPassword: '',
      billingPrice: user.billingPrice || '',
      sendPasswordEmail: true,
      clearDevices: false,
    });
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Session': adminSession },
        body: JSON.stringify({ userId: editingUser.id, ...editForm }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      addToast(`${editingUser.name || editingUser.email} updated`, 'success');
      setEditingUser(null);
      // Refresh the list
      setSearch(s => s + ' '); setTimeout(() => setSearch(s => s.trim()), 50);
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

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
                      <button className="btn-icon" title="Edit" onClick={() => openEdit(u)}>⚙</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' }}>
            <h3>Edit Sailor</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {editingUser.name || editingUser.email} <span style={{ color: 'var(--text-muted)' }}>— ID: {editingUser.id?.slice(0, 8)}...</span>
            </p>
            <form onSubmit={handleSaveUser}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder={editingUser.email} />
              </div>

              <div className="form-group">
                <label>Tier</label>
                <select value={editForm.tier} onChange={e => setEditForm(f => ({ ...f, tier: e.target.value }))}>
                  <option value="free">Free — Landlubber</option>
                  <option value="account">Account — Deckhand</option>
                  <option value="premium">Premium — Buccaneer</option>
                  <option value="pro">Pro — First Mate</option>
                  <option value="ultra">Ultra — Captain</option>
                </select>
              </div>

              <div className="form-group">
                <label>Billing Price (USD, applies next cycle)</label>
                <input type="text" value={editForm.billingPrice} onChange={e => setEditForm(f => ({ ...f, billingPrice: e.target.value }))} placeholder="e.g. 10.00" />
              </div>

              <div className="form-group">
                <label>New Password {editForm.sendPasswordEmail && '(emailed to user)'}</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" value={editForm.newPassword} onChange={e => setEditForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Leave blank to keep current" style={{ flex: 1 }} />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                    const pw = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(36)).join('').slice(0, 10);
                    setEditForm(f => ({ ...f, newPassword: pw }));
                  }} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                    🎲 Generate
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.sendPasswordEmail}
                    onChange={e => setEditForm(f => ({ ...f, sendPasswordEmail: e.target.checked }))} />
                  Send password reset email
                </label>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '0.75rem 0' }} />

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="adm-beta" checked={editForm.isBeta}
                  onChange={e => setEditForm(f => ({ ...f, isBeta: e.target.checked }))} />
                <label htmlFor="adm-beta" style={{ cursor: 'pointer', margin: 0 }}>BETA Tester <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(free Premium upgrade)</span></label>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="adm-ultra" checked={editForm.isUltra}
                  onChange={e => setEditForm(f => ({ ...f, isUltra: e.target.checked }))} />
                <label htmlFor="adm-ultra" style={{ cursor: 'pointer', margin: 0 }}>Ultra Captain <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(separate plan, unlimited everything)</span></label>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="adm-banned" checked={editForm.banned}
                  onChange={e => setEditForm(f => ({ ...f, banned: e.target.checked }))} />
                <label htmlFor="adm-banned" style={{ cursor: 'pointer', margin: 0 }}>Banned <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(walk the plank)</span></label>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '0.75rem 0' }} />

              <div className="form-group">
                <label>Registered Devices ({(editingUser.devices || []).length})</label>
                {(editingUser.devices || []).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>No devices registered.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                    {(editingUser.devices || []).map(d => (
                      <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', fontSize: '0.8rem' }}>
                        <div>
                          <span style={{ color: 'var(--text-primary)' }}>{d.name || 'Device'}</span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                            {d.userAgent?.slice(0, 50)} · Last seen {d.lastSeen ? new Date(d.lastSeen).toLocaleDateString() : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem' }}>
                  <input type="checkbox" id="adm-clear-devices" checked={editForm.clearDevices}
                    onChange={e => setEditForm(f => ({ ...f, clearDevices: e.target.checked }))} />
                  <label htmlFor="adm-clear-devices" style={{ cursor: 'pointer', margin: 0, color: '#f87171', fontSize: '0.85rem' }}>
                    Clear all devices on save <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(user must log in again on each device)</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingUser(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const TARGET_LABELS = { all: 'All Users', beta: 'Beta Only', ultra: 'Ultra Only' };

function AddonsView({ adminSession }) {
  const [globalAddons, setGlobalAddons] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState({ url: '', name: '', description: '', target: 'all', type: 'recommended' });
  const [adding, setAdding] = useState(false);
  const addToast = useStore(s => s.addToast);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const base = getApiBaseUrl();
      const headers = { 'X-Admin-Session': adminSession };
      const [gRes, rRes] = await Promise.all([
        fetch(`${base}/api/admin/addons?type=global`, { headers }),
        fetch(`${base}/api/admin/addons?type=recommended`, { headers }),
      ]);
      if (gRes.ok) setGlobalAddons((await gRes.json()).addons || []);
      if (rRes.ok) setRecommended((await rRes.json()).addons || []);
    } catch (e) { ERR('addons load error:', e.message); }
    setLoading(false);
  }, [adminSession]);

  React.useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.url.trim() || !addForm.name.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/admin/addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Session': adminSession },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        addToast('Addon added to fleet orders', 'success');
        setAddForm({ url: '', name: '', description: '', target: 'all', type: 'recommended' });
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.error || `Failed (${res.status})`, 'error');
      }
    } catch (e) { addToast(e.message, 'error'); }
    setAdding(false);
  };

  const handleDelete = async (type, id) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/admin/addons`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Session': adminSession },
        body: JSON.stringify({ type, id }),
      });
      if (res.ok) { addToast('Addon removed', 'success'); load(); }
      else addToast(`Delete failed (${res.status})`, 'error');
    } catch (e) { addToast(e.message, 'error'); }
  };

  return (
    <div className="admin-view">
      {/* Forced Global Addons */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3>⚓ Fleet Orders <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>— forced on all users</span></h3>
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1rem', fontSize: '0.85rem' }}>
          These are pushed to every sailor. Target controls who gets them.
        </p>
        {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading...</p> : globalAddons.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No fleet orders configured. Add one below.</p>
        ) : (
          <div className="addon-list">
            {globalAddons.map(a => (
              <div key={a.id} className="addon-item glass-panel">
                <div className="addon-info">
                  <span className="addon-name">{a.name}</span>
                  <span className="addon-url">{a.url}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
                    {TARGET_LABELS[a.target] || a.target}
                  </span>
                  <button className="btn-icon" title="Delete" onClick={() => handleDelete('global', a.id)} style={{ color: 'var(--accent)' }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommended Addons */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3>🧩 Recommended <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>— optional, shown to users</span></h3>
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1rem', fontSize: '0.85rem' }}>
          Shown on the Addons page. Ultra-targeted ones are gated by tier.
        </p>
        {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading...</p> : recommended.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No recommended addons configured.</p>
        ) : (
          <div className="addon-list">
            {recommended.map(a => (
              <div key={a.id} className="addon-item glass-panel">
                <div className="addon-info">
                  <span className="addon-name">{a.name} {a.target === 'ultra' && '💎'}</span>
                  <span className="addon-url">{a.url}</span>
                  {a.description && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.description}</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
                    {TARGET_LABELS[a.target] || a.target}
                  </span>
                  <button className="btn-icon" title="Delete" onClick={() => handleDelete('recommended', a.id)} style={{ color: 'var(--accent)' }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Addon Form */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3>Add Addon to Fleet</h3>
        <form className="admin-form" style={{ marginTop: '1rem' }} onSubmit={handleAdd}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Type</label>
              <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}>
                <option value="global">Fleet Order (Forced)</option>
                <option value="recommended">Recommended (Optional)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Target</label>
              <select value={addForm.target} onChange={e => setAddForm(f => ({ ...f, target: e.target.value }))}>
                <option value="all">All Users</option>
                <option value="beta">Beta Only</option>
                <option value="ultra">Ultra Only</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Name</label>
            <input type="text" placeholder="e.g. Torrentio" value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Manifest URL</label>
            <input type="url" placeholder="https://torrentio.strem.fun/manifest.json" value={addForm.url}
              onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Description <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(optional)</span></label>
            <input type="text" placeholder="Short description shown to users" value={addForm.description}
              onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn-gold" disabled={adding || !addForm.url.trim() || !addForm.name.trim()}>
            {adding ? 'Adding...' : 'Add to Fleet'}
          </button>
        </form>
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
