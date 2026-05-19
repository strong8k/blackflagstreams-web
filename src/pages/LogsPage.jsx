import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../lib/store';

const LEVELS = ['all', 'error', 'warn', 'info', 'debug'];
const LEVEL_COLOR = { error: '#f87171', warn: '#fbbf24', info: '#60a5fa', debug: '#94a3b8' };

export default function LogsPage() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sessionFilter, setSessionFilter] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef(null);
  const token = useStore(s => s.auth?.token);
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const load = async () => {
    try {
      const res = await fetch('/api/logs', { headers: authHeaders });
      if (res.ok) {
        const text = await res.text();
        const parsed = text.trim().split('\n').filter(Boolean).map(l => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
        setLines(parsed);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, autoScroll]);

  const handleClear = async () => {
    if (!confirm('Clear all logs?')) return;
    await fetch('/api/logs?clear=true', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    setLines([]);
  };

  const handleDownload = async () => {
    const res = await fetch('/api/logs', { headers: authHeaders });
    if (!res.ok) return;
    const blob = new Blob([await res.text()], { type: 'text/plain' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `bfs-logs-${new Date().toISOString().slice(0, 10)}.txt`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const sessions = ['all', ...new Set(lines.map(l => l.session).filter(Boolean))];

  const visible = lines.filter(l => {
    if (filter !== 'all' && l.level !== filter) return false;
    if (sessionFilter !== 'all' && l.session !== sessionFilter) return false;
    return true;
  });

  const counts = { error: 0, warn: 0, info: 0, debug: 0 };
  lines.forEach(l => { if (counts[l.level] !== undefined) counts[l.level]++; });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem' }}>
      <div className="spinner" />
      <p style={{ color: 'var(--text-muted)' }}>Loading logs...</p>
    </div>
  );

  return (
    <div className="page" style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Debug Logs</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
          <button className="btn btn-secondary btn-sm" onClick={handleDownload}>⬇ Download</button>
          <button className="btn btn-secondary btn-sm" onClick={handleClear} style={{ color: '#f87171' }}>🗑 Clear</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {Object.entries(counts).map(([lvl, n]) => (
          <div key={lvl} style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
            <span style={{ color: LEVEL_COLOR[lvl], fontWeight: 700, textTransform: 'uppercase', marginRight: '0.4rem' }}>{lvl}</span>
            <span style={{ color: 'var(--text-primary)' }}>{n}</span>
          </div>
        ))}
        <div style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          total: {lines.length}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {LEVELS.map(l => (
            <button key={l} onClick={() => setFilter(l)}
              style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.03em', background: filter === l ? (LEVEL_COLOR[l] || 'var(--primary)') : 'var(--surface)', color: filter === l ? '#fff' : 'var(--text-muted)' }}>
              {l}
            </button>
          ))}
        </div>
        <select value={sessionFilter} onChange={e => setSessionFilter(e.target.value)}
          style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
          {sessions.map(s => <option key={s} value={s}>{s === 'all' ? 'All sessions' : s}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 'auto' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>
      </div>

      {/* Log entries */}
      <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', maxHeight: '72vh', overflowY: 'auto' }}>
        {visible.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No logs{filter !== 'all' ? ` at level "${filter}"` : ''}</div>
        ) : (
          visible.map((entry, i) => (
            <div key={`${entry.session}-${entry.id}-${i}`} style={{ display: 'grid', gridTemplateColumns: '2.5rem 6rem 4.5rem 3.5rem 1fr', gap: '0 0.5rem', padding: '0.3rem 0.75rem', alignItems: 'baseline', borderBottom: '1px solid rgba(255,255,255,0.03)', background: entry.level === 'error' ? 'rgba(248,113,113,0.05)' : entry.level === 'warn' ? 'rgba(251,191,36,0.04)' : 'transparent' }}>
              <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>{entry.id}</span>
              <span style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: '0.7rem' }}>{entry.timestamp?.slice(11, 23)}</span>
              <span style={{ color: '#6366f1', opacity: 0.8 }}>{entry.session}</span>
              <span style={{ color: LEVEL_COLOR[entry.level] || 'var(--text-muted)', fontWeight: 700 }}>{entry.level?.toUpperCase()}</span>
              <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                {entry.message}
                {entry.data != null && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}
                  </span>
                )}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
