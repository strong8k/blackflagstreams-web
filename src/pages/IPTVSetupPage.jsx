import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { useStore } from '../lib/store';
import { getWorkerProxyUrl } from '../lib/auth';
import { xtreamLogin, encryptCreds, parseM3U } from '../lib/iptv';

const FOUR_HOURS = 4 * 60 * 60 * 1000;

function getForceSyncCooldown() {
  const last = parseInt(localStorage.getItem('bfs_iptv_force_sync') || '0', 10);
  const remaining = FOUR_HOURS - (Date.now() - last);
  return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
}

export default function IPTVSetupPage() {
  const navigate = useNavigate();
  const providers = useStore(s => s.iptvProviders);
  const addProvider = useStore(s => s.addIPTVProvider);
  const updateProvider = useStore(s => s.updateIPTVProvider);
  const removeProvider = useStore(s => s.removeIPTVProvider);
  const forceSyncIPTV = useStore(s => s.forceSyncIPTV);
  const addToast = useStore(s => s.addToast);

  const [mode, setMode] = useState('xtream');
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [syncCooldown, setSyncCooldown] = useState(getForceSyncCooldown);
  const [syncing, setSyncing] = useState(false);

  const handleAddXtream = async (e) => {
    e.preventDefault();
    if (!server || !username || !password) { setError('All fields required'); return; }
    setLoading(true); setError(null);
    try {
      const data = await xtreamLogin(server, username, password, getWorkerProxyUrl());
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
      const proxyUrl = getWorkerProxyUrl();
      const res = await fetch(`${proxyUrl}?url=${encodeURIComponent(m3uUrl)}`);
      const text = await res.text();
      const channels = parseM3U(text);
      const provider = {
        id: nanoid(8),
        name: name || 'M3U Playlist',
        type: 'm3u',
        m3uUrl,
        epgUrl: epgUrl || undefined,
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

  const startEdit = (p) => {
    setEditId(p.id);
    setEditName(p.name);
    setEditUrl(p.m3uUrl || p._server || '');
    setEpgUrl(p.epgUrl || '');
  };

  const cancelEdit = () => { setEditId(null); setEpgUrl(''); };

  const saveEdit = async (p) => {
    setEditSaving(true);
    if (p.type === 'm3u' && editUrl !== p.m3uUrl) {
      try {
        const proxyUrl = getWorkerProxyUrl();
        const res = await fetch(`${proxyUrl}?url=${encodeURIComponent(editUrl)}`);
        const text = await res.text();
        const channels = parseM3U(text);
        await updateProvider(p.id, { name: editName, m3uUrl: editUrl, epgUrl: epgUrl || undefined, channels });
        addToast(`Updated — ${channels.length} channels loaded`, 'success');
      } catch {
        addToast('Failed to fetch updated playlist', 'error');
        setEditSaving(false);
        return;
      }
    } else if (p.type === 'm3u') {
      await updateProvider(p.id, { name: editName, epgUrl: epgUrl || undefined });
      addToast('Provider updated', 'success');
    } else {
      await updateProvider(p.id, { name: editName });
      addToast('Provider updated', 'success');
    }
    setEditId(null);
    setEditSaving(false);
    setEpgUrl('');
  };

  const handleForceSync = async () => {
    const cooldown = getForceSyncCooldown();
    if (cooldown > 0) { setSyncCooldown(cooldown); return; }
    setSyncing(true);
    const result = await forceSyncIPTV();
    setSyncing(false);
    if (result?.error) {
      addToast(result.error, 'error');
    } else {
      setSyncCooldown(getForceSyncCooldown());
      addToast('Synced to TV successfully', 'success');
    }
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>Connected Providers</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleForceSync}
                disabled={syncing || syncCooldown > 0}
                title={syncCooldown > 0 ? `Available again in ${syncCooldown} min` : 'Push providers to TV app now'}
              >
                {syncing ? '⏳ Syncing…' : syncCooldown > 0 ? `⏱ ${syncCooldown}m` : '📺 Sync to TV'}
              </button>
            </div>
            {providers.map(p => (
              <div key={p.id} style={{
                background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)', marginBottom: '0.5rem', overflow: 'hidden',
              }}>
                {editId === p.id ? (
                  <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Display name"
                      style={{ fontSize: '0.85rem' }}
                    />
                    {p.type === 'm3u' && (
                      <input
                        type="text"
                        value={editUrl}
                        onChange={e => setEditUrl(e.target.value)}
                        placeholder="M3U URL"
                        style={{ fontSize: '0.85rem' }}
                      />
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => saveEdit(p)} disabled={editSaving}>
                        {editSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {p.type === 'xtream' ? `Xtream Codes • ${p._server || ''}` : `M3U • ${p.channels?.length || 0} channels`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(p)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleRemove(p.id)} style={{ color: 'var(--accent)' }}>Remove</button>
                    </div>
                  </div>
                )}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.8rem' }}>M3U URL</label>
                <input type="text" value={m3uUrl} onChange={e => setM3uUrl(e.target.value)} placeholder="http://example.com/playlist.m3u" />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.8rem' }}>EPG URL (optional)</label>
                <input type="text" value={epgUrl} onChange={e => setEpgUrl(e.target.value)} placeholder="https://example.com/epg.xml.gz" />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  A fallback EPG will be used automatically if your playlist has none.
                </p>
              </div>
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
