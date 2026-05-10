import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { useStore } from '../lib/store';
import { xtreamLogin, encryptCreds, parseM3U } from '../lib/iptv';

export default function IPTVSetupPage() {
  const navigate = useNavigate();
  const providers = useStore(s => s.iptvProviders);
  const addProvider = useStore(s => s.addIPTVProvider);
  const removeProvider = useStore(s => s.removeIPTVProvider);
  const addToast = useStore(s => s.addToast);

  const [mode, setMode] = useState('xtream'); // 'xtream' | 'm3u'
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAddXtream = async (e) => {
    e.preventDefault();
    if (!server || !username || !password) { setError('All fields required'); return; }
    setLoading(true); setError(null);
    try {
      const data = await xtreamLogin(server, username, password);
      const enc = await encryptCreds({ username, password, _server: server });
      const provider = {
        id: nanoid(8),
        name: name || `IPTV ${providers.length + 1}`,
        type: 'xtream',
        _enc: enc,
        _server: server,
        _username: username,
        _password: password,
        serverInfo: data.server_info,
        userInfo: data.user_info,
        createdAt: Date.now(),
      };
      addProvider(provider);
      addToast(`${provider.name} added successfully!`, 'success');
      navigate('/iptv');
    } catch (e) {
      setError(e.message || 'Connection failed');
    }
    setLoading(false);
  };

  const handleAddM3U = async (e) => {
    e.preventDefault();
    if (!m3uUrl) { setError('M3U URL required'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(m3uUrl);
      const text = await res.text();
      const channels = parseM3U(text);
      const provider = {
        id: nanoid(8),
        name: name || 'M3U Playlist',
        type: 'm3u',
        m3uUrl,
        channels,
        createdAt: Date.now(),
      };
      addProvider(provider);
      addToast(`${provider.name} added with ${channels.length} channels!`, 'success');
      navigate('/iptv');
    } catch (e) {
      setError(e.message || 'Failed to load playlist');
    }
    setLoading(false);
  };

  const handleRemove = (id) => {
    removeProvider(id);
    addToast('Provider removed', 'info');
  };

  return (
    <div className="page" style={{ paddingTop: '1.5rem' }}>
      <div className="container" style={{ maxWidth: 640 }}>
        <h2 className="section-title">📡 IPTV Providers</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.85rem' }}>
          Add your Xtream Codes provider or M3U playlist to watch live TV.
        </p>

        {/* Existing providers */}
        {providers.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Connected Providers</h3>
            {providers.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)', marginBottom: '0.5rem',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {p.type === 'xtream' ? 'Xtream Codes' : `M3U • ${p.channels?.length || 0} channels`}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => handleRemove(p.id)} style={{ color: 'var(--accent)' }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add form */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button className={`btn ${mode === 'xtream' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setMode('xtream')}>
            Xtream Codes
          </button>
          <button className={`btn ${mode === 'm3u' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setMode('m3u')}>
            M3U Playlist
          </button>
        </div>

        <form onSubmit={mode === 'xtream' ? handleAddXtream : handleAddM3U} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.8rem' }}>Display Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="My Provider" />
          </div>

          {mode === 'xtream' ? (
            <>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.8rem' }}>Server URL</label>
                <input type="text" value={server} onChange={e => setServer(e.target.value)} placeholder="http://example.com:8080" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.8rem' }}>Username</label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="username" />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.8rem' }}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="password" />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.8rem' }}>M3U URL</label>
              <input type="text" value={m3uUrl} onChange={e => setM3uUrl(e.target.value)} placeholder="http://example.com/playlist.m3u" />
            </div>
          )}

          {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{error}</p>}

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Add Provider'}
          </button>
        </form>
      </div>
    </div>
  );
}
