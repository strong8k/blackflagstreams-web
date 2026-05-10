import React, { useState } from 'react';
import { useStore } from '../lib/store';
import { getApiBaseUrl } from '../lib/auth';

const TORBOX_REFERRAL = 'https://torbox.app/subscription?referral=ca6e2688-382c-46f0-a0f9-009481bbdafc';
const TORBOX_API = 'https://api.torbox.app/v1/api/users/me';

const LOG = (...a) => console.log('[BFS:TorBox]', ...a);
const WARN = (...a) => console.warn('[BFS:TorBox]', ...a);
const ERR = (...a) => console.error('[BFS:TorBox]', ...a);

async function testTorBoxKey(apiKey, corsProxy) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
  };

  // 1. Try direct fetch first (TorBox may support CORS)
  LOG('Attempting direct fetch to', TORBOX_API);
  try {
    const res = await fetch(TORBOX_API, { headers });
    LOG('Direct fetch status:', res.status);
    if (res.ok) {
      const data = await res.json();
      LOG('Direct fetch success. Plan:', data.data?.plan_name);
      return data;
    }
    const body = await res.text();
    WARN('Direct fetch HTTP error:', res.status, body.slice(0, 200));
    if (res.status === 401) throw new Error('Invalid API key (401)');
    if (res.status === 403) throw new Error('Access denied (403)');
    throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    if (e.message.startsWith('Invalid') || e.message.startsWith('Access') || e.message.startsWith('HTTP')) {
      throw e; // Real API errors — don't try proxy
    }
    WARN('Direct fetch failed (likely CORS):', e.message, '— trying proxy...');
  }

  // 2. Try via configured CORS proxy — always use ?url= format to match bfsprox standard
  if (corsProxy) {
    const baseProxy = corsProxy.endsWith('/') ? corsProxy.slice(0, -1) : corsProxy;
    const sep = baseProxy.includes('?') ? '&' : '?';
    const proxyUrl = `${baseProxy}${sep}url=${encodeURIComponent(TORBOX_API)}`;
    LOG('Attempting proxy fetch via:', proxyUrl);
    try {
      const res = await fetch(proxyUrl, { headers });
      LOG('Proxy fetch status:', res.status);
      if (res.ok) {
        const data = await res.json();
        LOG('Proxy fetch success. Plan:', data.data?.plan_name);
        return data;
      }
      const body = await res.text();
      WARN('Proxy fetch HTTP error:', res.status, body.slice(0, 200));
      if (res.status === 401) throw new Error('Invalid API key (401)');
      throw new Error(`Proxy HTTP ${res.status}`);
    } catch (e) {
      if (e.message.startsWith('Invalid') || e.message.startsWith('Proxy HTTP')) throw e;
      WARN('Proxy fetch failed:', e.message, '— trying backend relay...');
    }
  } else {
    WARN('No CORS proxy configured — skipping proxy attempt');
  }

  // 3. Try via BFS backend relay (server-to-server, no CORS issue)
  const apiBase = getApiBaseUrl();
  const relayUrl = `${apiBase}/api/proxy/torbox`;
  LOG('Attempting backend relay via:', relayUrl);
  try {
    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    LOG('Relay fetch status:', res.status);
    if (res.ok) {
      const data = await res.json();
      LOG('Relay fetch success. Plan:', data.data?.plan_name);
      return data;
    }
    const body = await res.text().catch(() => '');
    ERR('Relay fetch HTTP error:', res.status, body.slice(0, 200));
    if (res.status === 404) {
      throw new Error(
        'TorBox connection failed — CORS proxy is blocking the request AND backend relay (/api/proxy/torbox) is not yet implemented. ' +
        'Fix: add bfsv2.pages.dev to the proxy CORS allowlist on bfsprox, OR implement the relay endpoint.'
      );
    }
    throw new Error(`Backend relay failed (${res.status})`);
  } catch (e) {
    if (e.message.startsWith('TorBox connection') || e.message.startsWith('Backend relay')) throw e;
    // Likely a CORS preflight failure on the relay itself — backend needs to allow this origin
    ERR('Relay fetch network error (backend CORS?):', e.message);
    ERR('Fix needed: add', window.location.origin, 'to allowed origins on', apiBase);
    throw new Error(
      `All fetch methods failed. The CORS proxy at bfsprox is blocking ${window.location.origin}. ` +
      'Add this origin to the proxy allowlist, or implement /api/proxy/torbox on the backend.'
    );
  }
}

export default function TorBoxPromo() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('bfs_torbox_key') || '');
  const [saved, setSaved] = useState(!!localStorage.getItem('bfs_torbox_key'));
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);
  const addToast = useStore(s => s.addToast);
  const settings = useStore(s => s.settings);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setTesting(true);
    setStatus(null);
    LOG('handleSave: testing key...');
    try {
      const proxy = settings.userCorsProxy || settings.effectiveCorsProxy || '';
      LOG('Using CORS proxy:', proxy || '(none)');
      const data = await testTorBoxKey(apiKey.trim(), proxy);
      localStorage.setItem('bfs_torbox_key', apiKey.trim());
      setSaved(true);
      const plan = data.data?.plan_name || 'Active';
      setStatus({ ok: true, plan });
      addToast(`TorBox connected! Plan: ${plan}`, 'success');
    } catch (e) {
      ERR('handleSave error:', e.message);
      setStatus({ ok: false, error: e.message });
      addToast(`TorBox error: ${e.message}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = () => {
    localStorage.removeItem('bfs_torbox_key');
    setApiKey('');
    setSaved(false);
    setStatus(null);
    addToast('TorBox disconnected', 'info');
    LOG('handleRemove: key cleared');
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(59, 130, 246, 0.05))',
      border: '1px solid rgba(99, 102, 241, 0.15)',
      borderRadius: 'var(--radius-lg)',
      padding: '1.25rem 1.5rem',
      margin: '1rem 0 2rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>⚡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>TorBox — Instant Streaming</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {saved
                ? `Connected • ${status?.plan || 'Active'}`
                : 'Debrid service. Instant cached torrents. No buffering.'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {!saved ? (
            <>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="Paste TorBox API key"
                style={{ width: 220, padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
              />
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={testing || !apiKey.trim()}>
                {testing ? '...' : 'Connect'}
              </button>
              <a
                href={TORBOX_REFERRAL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ textDecoration: 'none' }}
              >
                Get Key
              </a>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={handleRemove} style={{ color: 'var(--text-muted)' }}>
              Disconnect
            </button>
          )}
        </div>
      </div>

      {status && !status.ok && (
        <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(220,38,38,0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(220,38,38,0.2)' }}>
          <p style={{ color: '#f87171', fontSize: '0.75rem', margin: 0 }}>
            ⚠ {status.error}
          </p>
          {!settings.effectiveCorsProxy && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.35rem', marginBottom: 0 }}>
              Tip: Configure a CORS proxy in Settings if direct fetch is blocked.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
