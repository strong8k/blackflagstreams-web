// GET /api/torrent/streams?imdbId=tt1234567&type=movie
// GET /api/torrent/streams?imdbId=tt1234567&type=series&season=1&episode=3
// Calls AIOStreams GET /api/v1/search with Basic auth.
// AIOStreams returns pre-resolved debrid URLs — no separate resolve step needed.
//
// These streams are labeled with the debrid service that has it cached,
// and appear FIRST in the UI (preferred over addon streams).

import { json, preflight } from '../_shared.js';
import { getAioAuth, AIOSTREAMS_BASE } from '../aiostreams/_userdata.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(ctx) {
  const { env, request } = ctx;
  const url = new URL(request.url);

  const bearerToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!bearerToken) return json({ streams: [] });

  const sessionData = await env.SYNC_KV.get(`session:${bearerToken}`);
  const session = sessionData ? JSON.parse(sessionData) : null;
  if (!session) return json({ streams: [] });

  const imdbId  = url.searchParams.get('imdbId');
  const type    = url.searchParams.get('type') || 'movie';
  const season  = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');

  if (!imdbId) return json({ streams: [] });

  let auth;
  try {
    auth = await getAioAuth(env, session.userId);
  } catch (e) {
    console.error('[BFS:AIO] getAioAuth error:', e.message);
    return json({ streams: [] });
  }
  if (!auth) return json({ streams: [] }); // no debrid keys — skip

  // AIOStreams series ID format: tt1234567:season:episode
  const searchId = (type === 'series' && season && episode)
    ? `${imdbId}:${season}:${episode}`
    : imdbId;

  try {
    const searchUrl = new URL(`${AIOSTREAMS_BASE}/api/v1/search`);
    searchUrl.searchParams.set('type', type === 'series' ? 'series' : 'movie');
    searchUrl.searchParams.set('id', searchId);

    // 10s timeout — don't block the stream load forever
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const aioRes = await fetch(searchUrl.toString(), {
      signal: controller.signal,
      headers: {
        'Authorization': `Basic ${auth.basic}`,
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeout);

    if (!aioRes.ok) return json({ streams: [] });

    const aioData = await aioRes.json();
    const results = aioData.data?.results || [];

    // Get user's debrid keys to label streams with the service name
    const userRaw = await env.SYNC_KV.get(`aiostreams:${session.userId}`);
    const record = userRaw ? JSON.parse(userRaw) : {};
    const debridKeys = record.debridKeys || {};
    const serviceLabels = [];
    if (debridKeys.torbox)      serviceLabels.push('TorBox');
    if (debridKeys.realdebrid)  serviceLabels.push('RealDebrid');
    if (debridKeys.alldebrid)   serviceLabels.push('AllDebrid');
    const serviceStr = serviceLabels.join('/');

    const streams = results
      .filter(s => s.url || s.infoHash)
      .map(s => {
        // Determine which service has this cached (AIOStreams returns service info per result)
        const cachedService = (s.service || s.cachedOn || s.cached_service || '').toLowerCase();
        const displayService = cachedService || serviceStr;
        const label = cachedService ? `[${cachedService.toUpperCase()}]` : `[${serviceStr}]`;
        const isTorbox = cachedService === 'torbox' || serviceStr.toLowerCase().includes('torbox');

        return {
          name:          `${label} ${s.name || s.addon || 'Debrid'}`,
          title:         `${label} ${s.title || s.filename || ''}`,
          url:           s.url,
          infoHash:      s.infoHash,
          behaviorHints: { notWebReady: false, bingeGroup: 'debrid' },
          _addonName:    `Debrid (${displayService})`,
          _addonId:      'aiostreams',
          _isDebrid:     true,
          _isTorbox:     isTorbox, // flagged for TorBox-first sorting
        };
      });

    return json({ streams });
  } catch {
    return json({ streams: [] });
  }
}
