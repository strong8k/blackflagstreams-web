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

  let targetUrl = resolvedUrl;
  if (proxyUrl && !resolvedUrl.includes(proxyUrl)) {
    // Always use ?url= query format — matches bfsprox and standard CORS proxies
    const sep = proxyUrl.includes('?') ? '&' : '?';
    targetUrl = `${proxyUrl}${sep}url=${encodeURIComponent(resolvedUrl)}`;
    ADDON_LOG('safeFetch: via proxy →', targetUrl);
  }

  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    clearTimeout(timer);
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

export async function fetchStreams(transportUrl, type, id) {
  const base = getBaseUrl(transportUrl);
  const url = `${base}/stream/${type}/${id}.json`;
  try {
    const data = await safeFetch(url);
    return (data.streams || []).map(stream => ({
      ...stream,
      _addonUrl: transportUrl,
      _addonName: null,
    }));
  } catch { return []; }
}

export async function fetchAllStreams(addons, type, id, tmdbId, onProgress) {
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
          subPromises.push(fetchStreams(addon.manifest.transportUrl, type, id));
        }
        if (tmdbId && prefixes.some(p => p === 'tmdb_' || p === 'tmdb:')) {
          let tmdbStreamId = `tmdb_${tmdbId}`;
          if (id && id.includes(':')) {
            const parts = id.split(':');
            if (parts.length >= 3) tmdbStreamId = `tmdb_${tmdbId}:${parts[1]}:${parts[2]}`;
          }
          subPromises.push(fetchStreams(addon.manifest.transportUrl, type, tmdbStreamId));
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

  const results = await Promise.allSettled(streamPromises);
  const seen = new Set();
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(stream => {
      const key = stream.url || stream.infoHash || stream.ytId || stream.externalUrl || Math.random();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
  if (!stream.url) return null;
  const cls = classifyStream(stream);
  if (proxyUrl && (cls === 'needs-proxy' || stream.behaviorHints?.proxyHeaders)) {
    const encoded = encodeURIComponent(stream.url);
    const hasQuery = proxyUrl.includes('?');
    let finalUrl;
    if (hasQuery || proxyUrl.endsWith('/cors')) {
      const sep = proxyUrl.includes('?') ? '&' : '?';
      const param = proxyUrl.includes('url=') ? '' : 'url=';
      finalUrl = `${proxyUrl}${sep}${param}${encoded}`;
    } else {
      const base = proxyUrl.endsWith('/') ? proxyUrl : `${proxyUrl}/`;
      finalUrl = `${base}${stream.url}`;
    }
    // Inject Stremio UA for TorBox
    const isTorBox = (stream.url && stream.url.includes('torbox.app')) ||
                    (stream._addonUrl && stream._addonUrl.includes('torbox'));
    const headers = { ...stream.behaviorHints?.proxyHeaders };
    if (isTorBox) headers['User-Agent'] = 'Stremio/1.6.11';
    if (Object.keys(headers).length > 0) {
      const headerStr = encodeURIComponent(JSON.stringify(headers));
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + `headers=${headerStr}`;
    }
    return finalUrl;
  }
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
