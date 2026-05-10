/* ═══════════════════════════════════════════════════════
   IPTV Library — Xtream Codes + M3U + VOD Search
   ═══════════════════════════════════════════════════════ */

// ── Encryption helpers ──
async function getEncryptionKey() {
  const stored = localStorage.getItem('bfs_enc_key');
  if (stored) {
    const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem('bfs_enc_key', btoa(String.fromCharCode(...new Uint8Array(exported))));
  return key;
}

export async function encryptCreds(obj) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...new Uint8Array(encrypted))) };
}

export async function decryptCreds(enc) {
  try {
    const key = await getEncryptionKey();
    const iv = Uint8Array.from(atob(enc.iv), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(enc.data), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch { return null; }
}

// ── Xtream Codes API ──

export async function xtreamLogin(server, username, password) {
  const base = server.replace(/\/+$/, '');
  const url = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Invalid credentials');
  const data = await res.json();
  if (!data.user_info?.auth || data.user_info.auth === 0) throw new Error('Authentication failed');
  return { ...data, _server: base, _username: username, _password: password };
}

export async function xtreamGetLiveCategories(provider) {
  const url = `${provider._server}/player_api.php?username=${encodeURIComponent(provider._username)}&password=${encodeURIComponent(provider._password)}&action=get_live_categories`;
  const res = await fetch(url);
  return res.json();
}

export async function xtreamGetLiveStreams(provider, categoryId) {
  const url = `${provider._server}/player_api.php?username=${encodeURIComponent(provider._username)}&password=${encodeURIComponent(provider._password)}&action=get_live_streams&category_id=${categoryId}`;
  const res = await fetch(url);
  return res.json();
}

export async function xtreamGetVODCategories(provider) {
  const url = `${provider._server}/player_api.php?username=${encodeURIComponent(provider._username)}&password=${encodeURIComponent(provider._password)}&action=get_vod_categories`;
  const res = await fetch(url);
  return res.json();
}

export async function xtreamGetVODStreams(provider, categoryId) {
  const url = `${provider._server}/player_api.php?username=${encodeURIComponent(provider._username)}&password=${encodeURIComponent(provider._password)}&action=get_vod_streams&category_id=${categoryId}`;
  const res = await fetch(url);
  return res.json();
}

export async function xtreamGetSeriesCategories(provider) {
  const url = `${provider._server}/player_api.php?username=${encodeURIComponent(provider._username)}&password=${encodeURIComponent(provider._password)}&action=get_series_categories`;
  const res = await fetch(url);
  return res.json();
}

export async function xtreamGetSeries(provider, categoryId) {
  const url = `${provider._server}/player_api.php?username=${encodeURIComponent(provider._username)}&password=${encodeURIComponent(provider._password)}&action=get_series&category_id=${categoryId}`;
  const res = await fetch(url);
  return res.json();
}

export async function xtreamGetSeriesInfo(provider, seriesId) {
  const url = `${provider._server}/player_api.php?username=${encodeURIComponent(provider._username)}&password=${encodeURIComponent(provider._password)}&action=get_series_info&series_id=${seriesId}`;
  const res = await fetch(url);
  return res.json();
}

export async function xtreamGetEPG(provider, streamId, limit = 4) {
  const url = `${provider._server}/player_api.php?username=${encodeURIComponent(provider._username)}&password=${encodeURIComponent(provider._password)}&action=get_short_epg&stream_id=${streamId}&limit=${limit}`;
  try {
    const res = await fetch(url);
    return res.json();
  } catch { return { epg_listings: [] }; }
}

export function xtreamStreamURL(provider, streamId, extension = 'ts') {
  return `${provider._server}/live/${encodeURIComponent(provider._username)}/${encodeURIComponent(provider._password)}/${streamId}.${extension}`;
}

export function xtreamVODURL(provider, vodId, extension = 'mp4') {
  return `${provider._server}/movie/${encodeURIComponent(provider._username)}/${encodeURIComponent(provider._password)}/${vodId}.${extension}`;
}

export function xtreamSeriesEpisodeURL(provider, episodeId, extension = 'mp4') {
  return `${provider._server}/series/${encodeURIComponent(provider._username)}/${encodeURIComponent(provider._password)}/${episodeId}.${extension}`;
}

// ── M3U Parser ──

export function parseM3U(content) {
  const lines = content.split(/\r?\n/);
  const channels = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF:')) {
      const info = trimmed.substring(8);
      const attrs = {};
      // Parse key="value" pairs
      const attrRegex = /([\w-]+)="([^"]*)"/g;
      let match;
      while ((match = attrRegex.exec(info)) !== null) {
        attrs[match[1]] = match[2];
      }
      // Get channel name (after last comma)
      const commaIdx = info.lastIndexOf(',');
      const name = commaIdx >= 0 ? info.substring(commaIdx + 1).trim() : info.trim();

      current = {
        name,
        logo: attrs['tvg-logo'] || '',
        group: attrs['group-title'] || 'Uncategorized',
        id: attrs['tvg-id'] || attrs['tvg-name'] || name,
        url: '',
      };
    } else if (trimmed && !trimmed.startsWith('#') && current) {
      current.url = trimmed;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

// ── VOD Search across all IPTV providers ──

export async function searchIPTVVOD(providers, title, year, type, corsProxy) {
  for (const provider of providers) {
    if (!provider._server) continue;
    try {
      const creds = provider._enc ? await decryptCreds(provider._enc) : null;
      const p = creds ? { ...provider, ...creds } : provider;
      if (!p._server || !p._username) continue;

      // Search VOD by title
      const vodCats = await xtreamGetVODCategories(p);
      const allVOD = [];

      for (const cat of (vodCats || []).slice(0, 10)) {
        const streams = await xtreamGetVODStreams(p, cat.category_id);
        if (streams) allVOD.push(...streams);
      }

      // Match by title (fuzzy)
      const searchTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = allVOD.find(v => {
        const vTitle = (v.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const vYear = v.year || v.added ? (v.year || (v.added || '').substring(0, 4)) : '';
        const titleMatch = vTitle.includes(searchTitle) || searchTitle.includes(vTitle);
        const yearMatch = !year || !vYear || vYear === year;
        return titleMatch && yearMatch;
      });

      if (match) {
        const streamUrl = xtreamVODURL(p, match.stream_id);
        return {
          stream: {
            url: streamUrl,
            title: `${match.name} (${match.year || 'VOD'})`,
            name: match.name,
            _addonName: `📡 ${provider.name || 'IPTV'}`,
            _addonId: 'iptv-vod',
            _source: 'iptv',
          },
        };
      }

      // Search Series
      const seriesCats = await xtreamGetSeriesCategories(p);
      const allSeries = [];
      for (const cat of (seriesCats || []).slice(0, 10)) {
        const list = await xtreamGetSeries(p, cat.category_id);
        if (list) allSeries.push(...list);
      }

      const seriesMatch = allSeries.find(s => {
        const sTitle = (s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return sTitle.includes(searchTitle) || searchTitle.includes(sTitle);
      });

      if (seriesMatch) {
        return {
          stream: {
            url: null, // needs episode selection
            title: `${seriesMatch.name} (IPTV Series)`,
            name: seriesMatch.name,
            _addonName: `📡 ${provider.name || 'IPTV'}`,
            _addonId: 'iptv-series',
            _source: 'iptv',
            _seriesId: seriesMatch.series_id,
            _providerId: provider.id,
          },
        };
      }
    } catch { /* try next provider */ }
  }
  return null;
}
