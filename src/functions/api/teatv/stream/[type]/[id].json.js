import { json } from '../../../../api/_shared.js';

// Cloudflare Pages Function: /api/teatv/stream/[type]/[id].json
// Resolves streams for a given TMDB ID via multiple embed providers

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Note: we receive TMDB IDs (e.g. 550) from the catalog, but some embeds expect IMDB IDs.
// We use the TMDB ID directly where supported, and provide fallbacks.

async function fetchPage(url, referer = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: referer || 'https://www.google.com/',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

function findVideoUrl(text) {
  const m3u8 = text.match(/https?:\/\/[^\s"'\)>\)]+\.m3u8(?:\?[^\s"'\)>\)]*)?/i);
  if (m3u8) return m3u8[0];
  const mp4 = text.match(/https?:\/\/[^\s"'\)>\)]+\.mp4(?:\?[^\s"'\)>\)]*)?/i);
  if (mp4) return mp4[0];
  return null;
}

function findIframeSrc(html, baseOrigin) {
  const m = html.match(/<iframe[^>]+src=["']\s*([^"']+)["']/i);
  if (!m) return null;
  const src = m[1].trim();
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('/')) return baseOrigin + src;
  return src;
}

export async function onRequest(context) {
  const { params, env } = context;
  const { type, id } = params;

  // id format: "movie/550" or "series/tt12345:1:1" from Stremio-style routing
  // We also support direct TMDB numeric IDs: "550" or "tt1234567"
  const cleanId = id.replace('.json', '');
  const isSeries = type === 'series' || cleanId.includes(':');

  // Build streams from multiple embed sources
  const streams = [];

  // --- Embed.su ---
  try {
    const suUrl = isSeries
      ? `https://embed.su/embedtv/${cleanId}`
      : `https://embed.su/embed/movie/${cleanId}`;
    const html = await fetchPage(suUrl, 'https://embed.su/');
    const url = findVideoUrl(html);
    if (url) {
      streams.push({
        name: 'TeaTV | EmbedSu 🚀',
        title: isSeries ? 'TV Embed' : 'Movie Embed',
        url,
        behaviorHints: {
          notInteractive: true,
          proxyHeaders: { Referer: 'https://embed.su/' },
        },
      });
    }
  } catch { /* fall through */ }

  // --- 2Embed ---
  try {
    const embedUrl = isSeries
      ? `https://www.2embed.cc/embedtv/${cleanId}`
      : `https://www.2embed.cc/embed/${cleanId}`;
    const html = await fetchPage(embedUrl, 'https://www.2embed.cc/');
    const url = findVideoUrl(html);
    if (url) {
      streams.push({
        name: 'TeaTV | 2Embed 📡',
        title: isSeries ? 'TV Backup' : 'Movie Backup',
        url,
        behaviorHints: {
          notInteractive: true,
          proxyHeaders: { Referer: 'https://www.2embed.cc/' },
        },
      });
    }
  } catch { /* fall through */ }

  // --- SuperStream ---
  try {
    const ssUrl = isSeries
      ? `https://superstream.show/embed/tv/${cleanId}`
      : `https://superstream.show/embed/movie/${cleanId}`;
    const html = await fetchPage(ssUrl, 'https://superstream.show/');
    const url = findVideoUrl(html);
    if (url) {
      streams.push({
        name: 'TeaTV | SuperStream ⚡',
        title: '1080p Direct',
        url,
        behaviorHints: {
          notInteractive: true,
          proxyHeaders: { Referer: 'https://superstream.show/' },
        },
      });
    }
  } catch { /* fall through */ }

  // --- VidSrc.to ---
  try {
    const vsUrl = isSeries
      ? `https://vidsrc.to/embed/tv/${cleanId}`
      : `https://vidsrc.to/embed/movie/${cleanId}`;
    const html = await fetchPage(vsUrl, 'https://vidsrc.to/');
    const url = findVideoUrl(html);
    if (url) {
      streams.push({
        name: 'TeaTV | VidSrc.to 💎',
        title: 'Multi-Host',
        url,
        behaviorHints: {
          notInteractive: true,
          proxyHeaders: { Referer: 'https://vidsrc.to/' },
        },
      });
    }
  } catch { /* fall through */ }

  return json({ streams });
}