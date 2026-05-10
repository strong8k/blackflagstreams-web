import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPopularTV, img } from '../lib/tmdb';
import { useStore } from '../lib/store';

export default function SeriesPage() {
  const [series, setSeries] = useState(null);
  const settings = useStore(s => s.settings);
  useEffect(() => {
    if (!settings.tmdbKey) return;
    getPopularTV().then(r => setSeries(r.results || [])).catch(() => setSeries([]));
  }, [settings.tmdbKey]);

  return (
    <div className="page" style={{ paddingTop: '1.5rem' }}>
      <h2 className="section-title" style={{ padding: '0 2rem' }}>📺 Series</h2>
      <div style={{ padding: '0 2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
        {series ? series.map(s => (
          <PosterInline key={s.id} item={s} type="tv" />
        )) : <p className="empty-state">Loading...</p>}
      </div>
    </div>
  );
}

function PosterInline({ item, type }) {
  const navigate = useNavigate();
  const title = item.name || item.title;
  return (
    <div onClick={() => navigate(`/detail/${type}/${item.id}`)} style={{ cursor: 'pointer' }}>
      {item.poster_path ? (
        <img src={img.poster(item.poster_path)} alt={title} style={{ width: '100%', borderRadius: 'var(--radius-md)', aspectRatio: '2/3', objectFit: 'cover' }} loading="lazy" />
      ) : (
        <div style={{ aspectRatio: '2/3', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '0.5rem', textAlign: 'center' }}>{title}</div>
      )}
    </div>
  );
}
