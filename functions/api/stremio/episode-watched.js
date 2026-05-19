// GET /api/stremio/episode-watched?imdbId=tt28650488&season=1&episode=3
// Returns whether a specific episode has been watched, based on Stremio library data.
import { json, preflight, validateSession } from '../_shared.js';

const STREMIO_API = 'https://api.strem.io/api';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const imdbId = url.searchParams.get('imdbId');
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');

  if (!imdbId || !season || !episode) {
    return json({ watched: false });
  }

  const raw = await env.SYNC_KV.get(`service:stremio:${session.userId}`);
  if (!raw) return json({ watched: false });

  const stored = JSON.parse(raw);
  if (!stored.authKey) return json({ watched: false });

  try {
    // Query Stremio's datastore for this specific episode's library item
    const episodeId = `${imdbId}:${season}:${episode}`;
    const res = await fetch(`${STREMIO_API}/datastoreGet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authKey: stored.authKey,
        collection: 'libraryItem',
        ids: [episodeId],
      }),
    });

    if (!res.ok) return json({ watched: false });
    const data = await res.json();
    if (data.error) return json({ watched: false });

    const items = data.result || [];
    if (items.length === 0) return json({ watched: false });

    const item = items[0].value || items[0];
    const state = item.state || {};

    const watched = state.watched === true || (state.timeOffset && state.duration && (state.timeOffset / state.duration) > 0.85);

    return json({
      watched,
      progress: state.timeOffset || 0,
      duration: state.duration || 0,
      percent: state.duration ? Math.min(100, (state.timeOffset / state.duration) * 100) : 0,
    });
  } catch {
    return json({ watched: false });
  }
}