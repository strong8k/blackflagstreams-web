// Cloudflare Pages Function: /api/trakt/push
// Push watch progress from BFS to Trakt (scrobble)
import { json, validateSession } from '../_shared.js';

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Not authenticated' }, 401);

  const traktData = await env.SYNC_KV.get(`trakt:${session.userId}`);
  if (!traktData) return json({ error: 'Trakt not connected' }, 400);

  const data = JSON.parse(traktData);
  if (!data.accessToken) return json({ error: 'Trakt token missing' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { items } = body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return json({ error: 'No items to push' }, 400);
  }

  const results = { added: { movies: 0, episodes: 0 }, existing: 0, failed: 0 };

  for (const item of items) {
    try {
      if (item.type === 'movie') {
        const res = await fetch('https://api.trakt.tv/scrobble/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': env.TRAKT_CLIENT_ID,
            'Authorization': `Bearer ${data.accessToken}`,
          },
          body: JSON.stringify({
            movie: {
              ids: { tmdb: item.tmdbId },
              title: item.title,
              year: item.year,
            },
            progress: item.progress || 100,
          }),
        });

        if (res.ok || res.status === 409) {
          results.added.movies++;
        } else if (res.status === 404) {
          results.failed++;
        } else {
          results.existing++;
        }
      } else if (item.type === 'episode') {
        const res = await fetch('https://api.trakt.tv/scrobble/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': env.TRAKT_CLIENT_ID,
            'Authorization': `Bearer ${data.accessToken}`,
          },
          body: JSON.stringify({
            episode: {
              ids: { tmdb: item.tmdbId },
              season: item.season,
              number: item.episode,
            },
            show: {
              ids: { tmdb: item.showTmdbId },
              title: item.showTitle,
              year: item.showYear,
            },
            progress: item.progress || 100,
          }),
        });

        if (res.ok || res.status === 409) {
          results.added.episodes++;
        } else if (res.status === 404) {
          results.failed++;
        } else {
          results.existing++;
        }
      }
    } catch (e) {
      results.failed++;
    }
  }

  return json({ success: true, results });
}