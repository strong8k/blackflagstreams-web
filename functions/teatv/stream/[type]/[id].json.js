export async function onRequest(context) {
  const { params } = context;
  const { type, id } = params; // id is e.g. tt1234567.json or tt1234567:1:1.json

  // Remove .json from id if present
  const cleanId = id.replace('.json', '');
  const [imdbId, season, episode] = cleanId.split(':');

  const streams = [];

  // ── Existing Hardcoded Embeds ──
  const sources = [
    { name: 'TeaTV | SuperStream',  url: type === 'movie' ? `https://superstream.show/embed/movie/${imdbId}` : `https://superstream.show/embed/tv/${imdbId}/${season}/${episode}`, title: '🚀 1080p | Ultra Fast' },
    { name: 'TeaTV | VidSrc PRO',   url: type === 'movie' ? `https://vidsrc.pro/embed/movie/${imdbId}` : `https://vidsrc.pro/embed/tv/${imdbId}/${season}/${episode}`, title: '💎 1080p | Premium' },
    { name: 'TeaTV | VidSrc.to',    url: type === 'movie' ? `https://vidsrc.to/embed/movie/${imdbId}` : `https://vidsrc.to/embed/tv/${imdbId}/${season}/${episode}`, title: '🎬 1080p | Multi-Host' },
    { name: 'TeaTV | EmbedSu',      url: type === 'movie' ? `https://embed.su/embed/movie/${imdbId}` : `https://embed.su/embed/tv/${imdbId}/${season}/${episode}`, title: '⚡ 1080p | Instant' },
    { name: 'TeaTV | 2Embed',       url: type === 'movie' ? `https://www.2embed.cc/embed/${imdbId}` : `https://www.2embed.cc/embedtv/${imdbId}&s=${season}&e=${episode}`, title: '📡 720p/1080p | Backup' },
  ];

  sources.forEach(s => {
    // Extract domain for stealth referer
    let ref = "https://blackflagstreams.link/";
    try { ref = new URL(s.url).origin + "/"; } catch(e) {}

    streams.push({
      name: s.name,
      title: (type === 'movie' ? '🎥 ' : `📺 S${season} E${episode} | `) + s.title,
      url: s.url,
      behaviorHints: { 
        notInteractivity: true,
        proxyHeaders: { "Referer": ref }
      }
    });
  });

  // ── StreamDB Integration (Dynamic) ──
  const streamDBAddons = ['movish', 'showbox', 'videasy'];
  const streamId = type === 'movie' ? imdbId : `${imdbId}:${season}:${episode}`;
  
  const results = await Promise.allSettled(
    streamDBAddons.map(addon => 
      fetch(`https://${addon}-addon.streamdb.dev/stream/${type}/${streamId}.json`)
        .then(res => res.json())
        .then(data => (data.streams || []).map(s => ({ ...s, _source: addon })))
    )
  );

  results.forEach(res => {
    if (res.status === 'fulfilled') {
      res.value.forEach(s => {
        // Stealth referer: use the provider's own origin
        let ref = s._source === 'videasy' ? "https://player.videasy.net/" : "https://blackflagstreams.link/";
        try { if (s.url) ref = new URL(s.url).origin + "/"; } catch(e) {}

        streams.push({
          name: `TeaTV | ${s._source.toUpperCase()}`,
          title: `🔥 ${s.name} | ${s.description || 'High Speed'}`,
          url: s.url,
          behaviorHints: {
            ...s.behaviorHints,
            proxyHeaders: {
              ...(s.behaviorHints?.proxyHeaders || {}),
              "Referer": ref
            }
          }
        });
      });
    }
  });

  return new Response(JSON.stringify({ streams }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
