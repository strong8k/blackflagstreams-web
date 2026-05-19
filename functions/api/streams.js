/**
 * BFS Direct Streams — Stremio-compatible addon
 *
 * Fetches embed pages server-side and extracts real .m3u8 / .mp4 URLs.
 * Falls back to externalUrl (opens in browser tab) if extraction fails.
 *
 * MAINTENANCE: If a provider stops working, its extract() returned null and
 * the user gets the externalUrl fallback instead. To fix a broken provider,
 * update its extract() function — the rest of the addon keeps running.
 *
 * Providers: VidSrc, VidSrc XYZ, 2Embed
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const MANIFEST = {
  id: 'com.blackflag.directstreams',
  name: 'BFS Direct',
  description: 'Direct HTTP streams for movies and series. No debrid or account needed.',
  version: '1.0.0',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [],
  behaviorHints: { adult: false, p2p: false },
};

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function fetchPage(url, referer = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout per hop
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': referer || 'https://www.google.com/',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ── Stream URL extraction ─────────────────────────────────────────────────────

// Scan raw HTML/JS for the first usable video URL.
// m3u8 is preferred (adaptive bitrate HLS). Falls back to mp4.
function findVideoUrl(text) {
  const m3u8 = text.match(/https?:\/\/[^\s"'\\<>)]+\.m3u8(?:\?[^\s"'\\<>)]*)?/i);
  if (m3u8) return m3u8[0];

  const mp4 = text.match(/https?:\/\/[^\s"'\\<>)]+\.mp4(?:\?[^\s"'\\<>)]*)?/i);
  if (mp4) return mp4[0];

  return null;
}

// Some providers encode sources as: file:"..." or file:'...'
function findPlayerFile(text) {
  const m = text.match(/['"]\s*file\s*['"]\s*:\s*['"]([^'"]+\.(m3u8|mp4)[^'"]*)['"]/) ||
            text.match(/file\s*:\s*['"]([^'"]+\.(m3u8|mp4)[^'"]*)['"]/) ||
            text.match(/source\s*:\s*['"]([^'"]+\.(m3u8|mp4)[^'"]*)['"]/);
  return m ? m[1] : null;
}

// Pull iframe src out of HTML, resolve protocol-relative URLs.
function findIframeSrc(html, baseOrigin = 'https://vidsrc.me') {
  const m = html.match(/<iframe[^>]+src=["']\s*([^"']+)\s*["']/i);
  if (!m) return null;
  const src = m[1].trim();
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('/')) return baseOrigin + src;
  return src;
}

// ── Provider definitions ──────────────────────────────────────────────────────

const PROVIDERS = [
  // ── VidSrc (vidsrc.me) ────────────────────────────────────────────────────
  {
    name: 'VidSrc',
    getEmbedUrl(type, id, s, e) {
      if (type === 'movie') return `https://vidsrc.me/embed/movie?imdb=${id}`;
      return `https://vidsrc.me/embed/tv?imdb=${id}&s=${s}&e=${e}`;
    },
    async extract(html, embedUrl) {
      // Pass 1: direct URL anywhere in the page
      const direct = findPlayerFile(html) || findVideoUrl(html);
      if (direct) return direct;

      // Pass 2: vidsrc.me loads via /rcp/ iframe — follow it
      const rcpMatch = html.match(/src=["']\s*((?:https?:)?\/\/[^"']*\/rcp\/[^"']+)\s*["']/i);
      if (rcpMatch) {
        const rcpUrl = rcpMatch[1].startsWith('//') ? 'https:' + rcpMatch[1] : rcpMatch[1];
        try {
          const rcpHtml = await fetchPage(rcpUrl, embedUrl);
          return findPlayerFile(rcpHtml) || findVideoUrl(rcpHtml);
        } catch { /* fall through */ }
      }

      // Pass 3: generic iframe follow
      const iframeSrc = findIframeSrc(html, 'https://vidsrc.me');
      if (iframeSrc && iframeSrc !== embedUrl) {
        try {
          const iframeHtml = await fetchPage(iframeSrc, embedUrl);
          return findPlayerFile(iframeHtml) || findVideoUrl(iframeHtml);
        } catch { /* fall through */ }
      }

      return null;
    },
  },

  // ── VidSrc XYZ (vidsrc.xyz) ──────────────────────────────────────────────
  {
    name: 'VidSrc 2',
    getEmbedUrl(type, id, s, e) {
      if (type === 'movie') return `https://vidsrc.xyz/embed/movie?imdb=${id}`;
      return `https://vidsrc.xyz/embed/tv?imdb=${id}&s=${s}&e=${e}`;
    },
    async extract(html, embedUrl) {
      // vidsrc.xyz sometimes has a JSON sources block in a <script>
      const jsonSrc = html.match(/"sources"\s*:\s*\[\s*\{\s*"file"\s*:\s*"([^"]+)"/i);
      if (jsonSrc) return jsonSrc[1];

      const direct = findPlayerFile(html) || findVideoUrl(html);
      if (direct) return direct;

      // Follow inner iframe if present
      const iframeSrc = findIframeSrc(html, 'https://vidsrc.xyz');
      if (iframeSrc && iframeSrc !== embedUrl) {
        try {
          const iframeHtml = await fetchPage(iframeSrc, embedUrl);
          return findPlayerFile(iframeHtml) || findVideoUrl(iframeHtml);
        } catch { /* fall through */ }
      }

      return null;
    },
  },

  // ── 2Embed ────────────────────────────────────────────────────────────────
  {
    name: '2Embed',
    getEmbedUrl(type, id, s, e) {
      if (type === 'movie') return `https://www.2embed.cc/embed/${id}`;
      return `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`;
    },
    async extract(html, embedUrl) {
      const direct = findPlayerFile(html) || findVideoUrl(html);
      if (direct) return direct;

      const iframeSrc = findIframeSrc(html, 'https://www.2embed.cc');
      if (iframeSrc && iframeSrc !== embedUrl) {
        try {
          const iframeHtml = await fetchPage(iframeSrc, embedUrl);
          return findPlayerFile(iframeHtml) || findVideoUrl(iframeHtml);
        } catch { /* fall through */ }
      }

      return null;
    },
  },
];

// ── Stream resolution ─────────────────────────────────────────────────────────

async function resolveProvider(provider, type, imdbId, season, episode) {
  const embedUrl = provider.getEmbedUrl(type, imdbId, season, episode);

  try {
    const html = await fetchPage(embedUrl);
    const streamUrl = await provider.extract(html, embedUrl);

    if (streamUrl) {
      return {
        name: `BFS · ${provider.name}`,
        title: 'Direct Stream',
        url: streamUrl,
        behaviorHints: { notWebReady: true },
      };
    }
  } catch { /* extraction failed — use fallback */ }

  // Fallback: externalUrl opens in a new browser tab
  return {
    name: `BFS · ${provider.name}`,
    title: 'Open in Browser',
    externalUrl: embedUrl,
  };
}

// ── Cloudflare Pages handler ──────────────────────────────────────────────────

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/^\/api\/streams/, '') || '/';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (path === '/' || path === '/manifest.json') {
    return new Response(JSON.stringify(MANIFEST), { headers });
  }

  // /stream/{type}/{id}.json
  // Movie id:  tt1234567
  // Series id: tt1234567:1:3  (imdb:season:episode)
  const match = path.match(/^\/stream\/(movie|series)\/(.+)\.json$/);
  if (!match) {
    return new Response(JSON.stringify({ streams: [] }), { headers });
  }

  const type = match[1];
  const rawId = match[2];

  let imdbId = rawId;
  let season = '1';
  let episode = '1';

  if (type === 'series') {
    const parts = rawId.split(':');
    imdbId = parts[0];
    season  = parts[1] || '1';
    episode = parts[2] || '1';
  }

  // All providers run in parallel — slow/broken ones don't block the others
  const results = await Promise.allSettled(
    PROVIDERS.map(p => resolveProvider(p, type, imdbId, season, episode))
  );

  const streams = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  return new Response(JSON.stringify({ streams }), { headers });
}
