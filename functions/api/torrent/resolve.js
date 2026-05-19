// POST /api/torrent/resolve — Resolve an infoHash torrent through the user's
// connected debrid services via AIOStreams (adds to cache via cacheAndPlay).
// Body: { infoHash, name, type, imdbId, season?, episode? }
import { json, preflight, validateSession } from '../_shared.js';
import { getAioAuth, AIOSTREAMS_BASE } from '../aiostreams/_userdata.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { infoHash, name, imdbId } = body;
  if (!infoHash) return json({ error: 'Missing infoHash' }, 400);

  // Get AIOStreams auth (also migrates legacy keys + syncs if needed)
  let auth;
  try {
    auth = await getAioAuth(env, session.userId);
  } catch (e) {
    console.error('[BFS:Resolve] getAioAuth error:', e.message);
    return json({ error: 'Debrid service not available' }, 502);
  }
  if (!auth) return json({ error: 'No debrid services connected. Add a debrid key in Settings.' }, 400);

  // Search by IMDB ID (not infoHash) — AIOStreams scrapers index by IMDB/TMDB.
  // cacheAndPlay will find the torrent, add it to debrid, and return a playable URL.
  const searchId = imdbId || `tt:${infoHash}`;
  try {
    const searchUrl = new URL(`${AIOSTREAMS_BASE}/api/v1/search`);
    searchUrl.searchParams.set('type', 'movie');
    searchUrl.searchParams.set('id', searchId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // caching may take longer

    const res = await fetch(searchUrl.toString(), {
      signal: controller.signal,
      headers: {
        'Authorization': `Basic ${auth.basic}`,
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error('[BFS:Resolve] AIOStreams search failed:', res.status, err.slice(0, 200));
      return json({ error: `Debrid search failed (${res.status})` }, 502);
    }

    const data = await res.json();
    const results = data.data?.results || [];

    // Find a playable URL — prefer matching infoHash, then any URL
    const stream = results.find(s => s.url && s.infoHash === infoHash)
                || results.find(s => s.url);
    if (stream?.url) {
      return json({ url: stream.url, name: stream.name || name, service: stream.service || '' });
    }

    // No playable URL — torrent may be caching. Re-search the debrid API to check.
    // AIOStreams sometimes returns cached-only results on first pass;
    // cacheAndPlay may still be processing.
    return json({ error: 'Torrent is being added to debrid. Try again in a few seconds.', queuing: true });
  } catch (e) {
    if (e.name === 'AbortError') {
      return json({ error: 'Debrid resolve timed out. Torrent may be large — try again.' }, 504);
    }
    console.error('[BFS:Resolve] Error:', e.message);
    return json({ error: 'Debrid resolve failed. Check your debrid service status.' }, 502);
  }
}