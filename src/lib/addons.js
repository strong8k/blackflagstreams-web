/* ═══════════════════════════════════════════════════════
   Stremio Addon Protocol Client
   Manifest fetching, catalog/stream/subtitle queries
   ═══════════════════════════════════════════════════════ */

export const DEFAULT_ADDONS = [
  { transportUrl: 'https://v3-cinemeta.strem.io/manifest.json', category: 'official', flags: { protected: true, official: true } },
  { transportUrl: 'https://opensubtitles-v3.strem.io/manifest.json', category: 'official', flags: { protected: true, official: true } },
];

export const RECOMMENDED_ADDONS = [
  { 
    name: 'Torrentio', 
    transportUrl: 'https://torrentio.strem.fun/manifest.json',
    description: 'High-speed torrent streams for almost any movie or show.',
    icon: '⚡',
    category: 'popular'
  },
  { 
    name: 'Comet', 
    transportUrl: 'https://comet.strem.fun/manifest.json',
    description: 'P2P and Debrid stream search engine.',
    icon: '☄️',
    category: 'popular'
  },
  { 
    name: 'MediaFusion', 
    transportUrl: 'https://mediafusion.strem.fun/manifest.json',
    description: 'Specialized in Indian and regional content, as well as global hits.',
    icon: '🍿',
    category: 'popular'
  },
  { 
    name: 'CyberFlix', 
    transportUrl: 'https://cyberflix.strem.fun/manifest.json',
    description: 'Extensive catalogs of movies and series.',
    icon: '🌐',
    category: 'catalogs'
  },
  { 
    name: 'Streaming Catalogs', 
    transportUrl: 'https://streaming-catalogs.strem.io/manifest.json',
    description: 'Catalogs from Netflix, Disney+, Prime, and more.',
    icon: '📺',
    category: 'catalogs'
  }
];

// ── Helpers ──

export function getBaseUrl(transportUrl) {
  return transportUrl.replace(/\/manifest\.json\/?$/, '');
}

const ADDON_LOG = (...a) => console.log('[BFS:Addons]', ...a);
const ADDON_WARN = (...a) => console.warn('[BFS:Addons]', ...a);

async function safeFetch(url, timeoutMs = 15000, proxyUrl = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Resolve relative URLs against the BFS backend base
  let resolvedUrl = url;
  if (url.startsWith('/')) {
    const { getApiBaseUrl } = await import('./auth');
    resolvedUrl = `${getApiBaseUrl()}${url}`;
    ADDON_WARN('safeFetch: relative URL resolved to', resolvedUrl);
  }

  // Try direct first — most Stremio addons send CORS headers
  try {
    const res = await fetch(resolvedUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    // If direct fails, try via proxy
    if (proxyUrl && !resolvedUrl.includes(proxyUrl)) {
      const parsedProxy = new URL(proxyUrl);
      parsedProxy.searchParams.set('url', resolvedUrl);
      const targetUrl = parsedProxy.toString();
      ADDON_LOG('safeFetch: direct failed, via proxy →', targetUrl);
      const pController = new AbortController();
      const pTimer = setTimeout(() => pController.abort(), timeoutMs);
      try {
        const pRes = await fetch(targetUrl, {
          signal: pController.signal,
          headers: { 'Accept': 'application/json' },
        });
        clearTimeout(pTimer);
        if (!pRes.ok) throw new Error(`Proxy HTTP ${pRes.status}`);
        return pRes.json();
      } catch (pErr) {
        clearTimeout(pTimer);
        if (pErr.name === 'AbortError') throw new Error('Request timed out');
        throw pErr;
      }
    }
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
}

// ── Manifest ──

export async function fetchManifest(transportUrl, proxyUrl = null) {
  const manifest = await safeFetch(transportUrl, 15000, proxyUrl);
  if (!manifest.id || !manifest.name) throw new Error('Invalid manifest');
  return { ...manifest, transportUrl };
}

export function addonSupportsResource(manifest, resource, type, id) {
  if (!manifest.resources) return false;
  const resources = manifest.resources.map(r =>
    typeof r === 'string' ? { name: r, types: manifest.types || [] } : r
  );
  const match = resources.find(r => r.name === resource);
  if (!match) return false;
  const types = match.types || manifest.types || [];
  if (types.length > 0 && !types.includes(type)) return false;
  const prefixes = match.idPrefixes || manifest.idPrefixes || [];
  if (prefixes.length > 0 && id) {
    if (!prefixes.some(p => id.startsWith(p))) return false;
  }
  return true;
}

// ── Catalog ──

export async function fetchCatalog(transportUrl, type, catalogId, extra = {}) {
  const base = getBaseUrl(transportUrl);
  const extraParts = [];
  if (extra.search) extraParts.push(`search=${encodeURIComponent(extra.search)}`);
  if (extra.genre) extraParts.push(`genre=${encodeURIComponent(extra.genre)}`);
  if (extra.skip) extraParts.push(`skip=${extra.skip}`);
  const extraPath = extraParts.length > 0 ? `/${extraParts.join('&')}` : '';
  const url = `${base}/catalog/${type}/${catalogId}${extraPath}.json`;
  const data = await safeFetch(url);
  return data.metas || [];
}

// ── Streams ──

export async function fetchStreams(transportUrl, type, id, proxyUrl = null) {
  let finalUrl = transportUrl;
  const base = getBaseUrl(finalUrl);
  const url = `${base}/stream/${type}/${id}.json`;
  try {
    const data = await safeFetch(url, 15000, proxyUrl);
    return (data.streams || []).map(stream => ({
      ...stream,
      _addonUrl: finalUrl,
      _addonName: null,
    }));
  } catch { return []; }
}


async function fetchDebridCacheStreams(imdbId, type, stremioId, token, services, baseUrl) {
  const hasDebrid = services?.torbox?.connected || services?.realdebrid?.connected || services?.alldebrid?.connected;
  if (!token || !hasDebrid) return [];
  try {
    const params = new URLSearchParams({ imdbId, type });
    if (type === 'series' && stremioId?.includes(':')) {
      const parts = stremioId.split(':');
      if (parts[1]) params.set('season', parts[1]);
      if (parts[2]) params.set('episode', parts[2]);
    }
    const res = await fetch(`${baseUrl}/api/torrent/streams?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.streams || [];
  } catch { return []; }
}


export async function fetchAllStreams(addons, type, id, tmdbId, onProgress, proxyUrl = null, opts = {}) {
  const { token, services, baseUrl = '' } = opts;
  const streamPromises = addons
    .filter(addon => {
      if (!addon.manifest) return false;
      return addonSupportsResource(addon.manifest, 'stream', type, id) ||
             (tmdbId && addonSupportsResource(addon.manifest, 'stream', type, `tmdb_${tmdbId}`));
    })
    .map(async (addon) => {
      try {
        const prefixes = addon.manifest.idPrefixes || [];
        const subPromises = [];

        if (id && (prefixes.length === 0 || prefixes.some(p => id.startsWith(p)))) {
          subPromises.push(fetchStreams(addon.manifest.transportUrl, type, id, proxyUrl));
        }
        if (tmdbId && prefixes.some(p => p === 'tmdb_' || p === 'tmdb:')) {
          let tmdbStreamId = `tmdb_${tmdbId}`;
          if (id && id.includes(':')) {
            const parts = id.split(':');
            if (parts.length >= 3) tmdbStreamId = `tmdb_${tmdbId}:${parts[1]}:${parts[2]}`;
          }
          subPromises.push(fetchStreams(addon.manifest.transportUrl, type, tmdbStreamId, proxyUrl));
        }

        const subResults = await Promise.all(subPromises);
        const streams = subResults.flat().map(s => ({
          ...s,
          _addonName: addon.manifest.name,
          _addonId: addon.manifest.id,
        }));

        if (onProgress && streams.length > 0) onProgress(streams);
        return streams;
      } catch { return []; }
    });

  // Debrid as its own stream source: checks cache on TorBox/AllDebrid/RD for this content.
  const imdbId = id?.startsWith('tt') ? id.split(':')[0] : null;
  if (imdbId) {
    streamPromises.push(
      fetchDebridCacheStreams(imdbId, type, id, token, services, baseUrl)
        .then(streams => {
          if (onProgress && streams.length > 0) onProgress(streams);
          return streams;
        })
        .catch(() => [])
    );
  }

  const results = await Promise.allSettled(streamPromises);
  const allStreams = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  const hasDebrid = services?.torbox?.connected || services?.realdebrid?.connected || services?.alldebrid?.connected;

  // infoHash-only streams from non-AIO addons → expose as external magnets when no debrid
  if (!hasDebrid) {
    for (const stream of allStreams) {
      if (stream.infoHash && !stream.url && !stream.externalUrl) {
        stream.externalUrl = `magnet:?xt=urn:btih:${stream.infoHash}${stream.name ? `&dn=${encodeURIComponent(stream.name)}` : ''}`;
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = allStreams.filter(stream => {
    const key = stream.url || stream.infoHash || stream.ytId || stream.externalUrl || `${stream._addonId || ''}:${stream.title || stream.name || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Group by source: each addon + debrid as separate sources
  const groups = {};
  for (const s of unique) {
    const source = s._isDebrid ? '__debrid__' : (s._addonName || '__unknown__');
    if (!groups[source]) groups[source] = [];
    groups[source].push(s);
  }

  // Limit each source: max 6 per resolution tier (4K, 1080p, 720p), max 20 total per source
  const RES_TIERS = [
    { pattern: /[24][Kk]|2160|1440/iu, name: '4K' },
    { pattern: /1080|FHD/iu, name: '1080p' },
    { pattern: /720|HD/iu, name: '720p' },
  ];
  const OTHER = 'other';

  function resolutionTier(stream) {
    const text = (stream.name || stream.title || stream._addonName || '') + ' ' + (stream.quality || '');
    for (const tier of RES_TIERS) {
      if (tier.pattern.test(text)) return tier.name;
    }
    return OTHER;
  }

  const limited = [];
  for (const [source, streams] of Object.entries(groups)) {
    // Per source: group by resolution tier, take max 6 per tier
    const tierCounts = {};
    const perSource = [];
    // Sort within source: better resolutions first
    streams.sort((a, b) => {
      const aTier = RES_TIERS.findIndex(t => t.pattern.test((a.name || a.title || '') + ' ' + (a.quality || '')));
      const bTier = RES_TIERS.findIndex(t => t.pattern.test((b.name || b.title || '') + ' ' + (b.quality || '')));
      // -1 = not found (other), put at end
      const aRank = aTier === -1 ? 99 : aTier;
      const bRank = bTier === -1 ? 99 : bTier;
      return aRank - bRank;
    });
    for (const s of streams) {
      const tier = resolutionTier(s);
      if (!tierCounts[tier]) tierCounts[tier] = 0;
      if (tierCounts[tier] < 6) {
        perSource.push(s);
        tierCounts[tier]++;
      }
      if (perSource.length >= 20) break;
    }
    limited.push(...perSource);
  }

  // Sort: TorBox debrid first, then other debrids, then addons alphabetically
  function streamPriority(s) {
    if (s._isTorbox) return 0;           // TorBox cached streams first
    if (s._isDebrid) return 1;           // other debrid streams second
    const n = (s._addonName || '').toLowerCase();
    if (n.includes('torbox')) return 0;
    if (n.includes('alldebrid')) return 1;
    if (n.includes('realdebrid') || n.includes('rd') || n.includes('debrid')) return 2;
    return 3;                            // addon streams last
  }

  limited.sort((a, b) => {
    const aP = streamPriority(a);
    const bP = streamPriority(b);
    if (aP !== bP) return aP - bP;
    // Same priority: debrid before addons
    if (a._isDebrid && !b._isDebrid) return -1;
    if (!a._isDebrid && b._isDebrid) return 1;
    return (a._addonName || '').localeCompare(b._addonName || '');
  });

  return limited;
}

// ── Stream classification ──

export function classifyStream(stream) {
  if (stream.url) {
    const isHttp = stream.url.startsWith('http://') || stream.url.startsWith('https://');
    if (!isHttp) return 'unsupported';
    if (stream.behaviorHints?.notWebReady) return 'needs-proxy';
    return 'playable';
  }
  if (stream.ytId) return 'youtube';
  if (stream.infoHash) return 'needs-debrid';
  if (stream.externalUrl) return 'external';
  return 'unknown';
}

export function getStreamTitle(stream) {
  if (stream.title) return stream.title;
  if (stream.name) return stream.name;
  if (stream.description) return stream.description;
  const cls = classifyStream(stream);
  if (cls === 'needs-debrid') return `Torrent (${stream.infoHash?.substring(0, 8)}...)`;
  if (cls === 'youtube') return `YouTube: ${stream.ytId}`;
  if (cls === 'external') return 'External Link';
  if (stream.url) {
    try { return new URL(stream.url).hostname; } catch { return 'Stream'; }
  }
  return 'Unknown Stream';
}

export function buildPlayableUrl(stream, proxyUrl) {
  if (!stream.url && !stream.externalUrl) return null;
  const cls = classifyStream(stream);

  if (proxyUrl && stream.url && (cls === 'needs-proxy' || stream.behaviorHints?.proxyHeaders)) {
    try {
      // Always use ?url= query-param format — matches openprox's GET /proxy?url= route
      const parsedProxy = new URL(proxyUrl);
      parsedProxy.searchParams.set('url', stream.url);
      return parsedProxy.toString();
    } catch {
      return stream.url;
    }
  }

  if (stream.externalUrl) return stream.externalUrl;
  return stream.url;
}

// ── Subtitles ──

export async function fetchSubtitles(transportUrl, type, id) {
  const base = getBaseUrl(transportUrl);
  const url = `${base}/subtitles/${type}/${id}.json`;
  try { const data = await safeFetch(url); return data.subtitles || []; } catch { return []; }
}

export async function fetchAllSubtitles(addons, type, id, tmdbId) {
  const subtitlePromises = addons
    .filter(addon => {
      if (!addon.manifest) return false;
      return addonSupportsResource(addon.manifest, 'subtitles', type, id) ||
             (tmdbId && addonSupportsResource(addon.manifest, 'subtitles', type, `tmdb_${tmdbId}`));
    })
    .map(async (addon) => {
      try {
        const prefixes = addon.manifest.idPrefixes || [];
        const results = [];
        if (id && (prefixes.length === 0 || prefixes.some(p => id.startsWith(p)))) {
          results.push(...(await fetchSubtitles(addon.manifest.transportUrl, type, id)));
        }
        if (tmdbId && prefixes.some(p => p === 'tmdb_' || p === 'tmdb:')) {
          let tId = `tmdb_${tmdbId}`;
          if (id && id.includes(':')) {
            const parts = id.split(':');
            if (parts.length >= 3) tId = `tmdb_${tmdbId}:${parts[1]}:${parts[2]}`;
          }
          results.push(...(await fetchSubtitles(addon.manifest.transportUrl, type, tId)));
        }
        return results.map(s => ({ ...s, _addonName: addon.manifest.name }));
      } catch { return []; }
    });

  const results = await Promise.allSettled(subtitlePromises);
  const seen = new Set();
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(sub => {
      if (!sub.url) return false;
      if (seen.has(sub.url)) return false;
      seen.add(sub.url);
      return true;
    });
}


