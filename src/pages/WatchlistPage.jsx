import React from 'react';
import { useStore } from '../lib/store';
import PosterCard from '../components/PosterCard';

export default function WatchlistPage() {
  const watchlist = useStore(s => s.watchlist);
  return (
    <div className="page" style={{ paddingTop: '1.5rem' }}>
      <h2 className="section-title" style={{ padding: '0 2rem' }}>🏴 Watchlist</h2>
      {watchlist.length === 0 ? (
        <p className="empty-state">Your watchlist is empty. Start adding titles!</p>
      ) : (
        <div style={{ padding: '0 2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
          {watchlist.map(item => (
            <PosterCard key={`${item.id}-${item.type}`} item={item} type={item.type} />
          ))}
        </div>
      )}
    </div>
  );
}
