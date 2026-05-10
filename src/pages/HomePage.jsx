import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  getTrending, getPopularMovies, getTopRatedMovies,
  getPopularTV, getTopRatedTV, getNowPlayingMovies,
  discoverTV,
} from '../lib/tmdb';
import HeroBanner from '../components/HeroBanner';
import ContentRow from '../components/ContentRow';
import TorBoxPromo from '../components/TorBoxPromo';
import PromoBanner from '../components/PromoBanner';
import { useStore } from '../lib/store';

export default function HomePage() {
  const navigate = useNavigate();
  const [trending, setTrending] = useState(null);
  const [popularMovies, setPopularMovies] = useState(null);
  const [topMovies, setTopMovies] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [popularTV, setPopularTV] = useState(null);
  const [topTV, setTopTV] = useState(null);
  const [kidsShows, setKidsShows] = useState(null);
  const [animeShows, setAnimeShows] = useState(null);
  const [error, setError] = useState(null);

  const activeProfile = useStore(s => s.activeProfile);
  const settings = useStore(s => s.settings);
  const continueWatching = useStore(s => s.continueWatching);

  useEffect(() => {
    if (!settings.effectiveTmdbKey) { setError('no-key'); return; }
    let cancelled = false;
    setError(null);

    getTrending('all', 'week')
      .then(r => { if (!cancelled) setTrending(r.results || []); })
      .catch(err => {
        if (!cancelled) {
          if (err.message.includes('key') || err.message.includes('401')) setError('invalid-key');
          else setError('no-key');
          setTrending([]);
        }
      });

    Promise.allSettled([
      getPopularMovies(),
      getTopRatedMovies(),
      getNowPlayingMovies(),
      getPopularTV(),
      getTopRatedTV(),
      discoverTV({ with_genres: '10762', sort_by: 'popularity.desc' }), // Kids
      discoverTV({ with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc' }), // Anime
    ]).then(([pm, tm, np, ptv, ttv, kids, ani]) => {
      if (cancelled) return;
      setPopularMovies(pm.status === 'fulfilled' ? pm.value.results || [] : []);
      setTopMovies(tm.status === 'fulfilled' ? tm.value.results || [] : []);
      setNowPlaying(np.status === 'fulfilled' ? np.value.results || [] : []);
      setPopularTV(ptv.status === 'fulfilled' ? ptv.value.results || [] : []);
      setTopTV(ttv.status === 'fulfilled' ? ttv.value.results || [] : []);
      setKidsShows(kids.status === 'fulfilled' ? kids.value.results || [] : []);
      setAnimeShows(ani.status === 'fulfilled' ? ani.value.results || [] : []);
    });

    return () => { cancelled = true; };
  }, [settings.effectiveTmdbKey]);

  if (error) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{error === 'no-key' ? '📡' : '⚠️'}</div>
          <h3>{error === 'no-key' ? 'No API Key' : 'Invalid API Key'}</h3>
          <p style={{ marginBottom: '1.5rem' }}>
            {error === 'no-key' ? 'A TMDB API key is required to browse content.' : 'The TMDB API key is invalid.'}
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/settings')}>
            Configure API Key
          </button>
        </div>
      </div>
    );
  }

  const heroItem = trending?.find(t => t.backdrop_path) ?? trending?.[0] ?? null;

  return (
    <motion.div
      className="page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <HeroBanner item={heroItem} />

      <div style={{ paddingTop: '1.5rem' }}>
        <div className="container">
          {!activeProfile && <PromoBanner />}
          <TorBoxPromo />
        </div>
        <ContentRow title="Trending This Week" items={trending} icon="🔥" loading={trending === null} />
        {continueWatching?.length > 0 && (
          <ContentRow title="Continue Watching" items={continueWatching} icon="▶" />
        )}
        <ContentRow title="Top Kids Shows" items={kidsShows} icon="🎠" loading={kidsShows === null} type="tv" />
        <ContentRow title="Top Anime" items={animeShows} icon="🏮" loading={animeShows === null} type="tv" />
        <ContentRow title="Popular Movies" items={popularMovies} icon="🎬" loading={popularMovies === null} type="movie" />
        <ContentRow title="Now Playing" items={nowPlaying} icon="🍿" loading={nowPlaying === null} type="movie" />
        <ContentRow title="Top Rated Movies" items={topMovies} icon="⭐" loading={topMovies === null} type="movie" />
        <ContentRow title="Popular Series" items={popularTV} icon="📺" loading={popularTV === null} type="tv" />
        <ContentRow title="Top Rated Series" items={topTV} icon="🏆" loading={topTV === null} type="tv" />
      </div>
    </motion.div>
  );
}
