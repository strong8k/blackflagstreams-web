// Cloudflare Pages Function: /api/config
// Serves system-wide configuration from environment variables
// Set these in Cloudflare Pages → Settings → Environment Variables:
//   TMDB_API_KEY  - your TMDB v3 API key
//   CORS_PROXY    - your CORS proxy worker URL

export async function onRequestGet(context) {
  const { env } = context;

  let globalAddons = [];
  let recommendedAddons = [];
  try {
    const [gData, rData] = await Promise.all([
      env.SYNC_KV.get('admin:global_addons'),
      env.SYNC_KV.get('admin:recommended_addons')
    ]);

    if (gData) {
      const all = JSON.parse(gData);
      globalAddons = all.filter(a => a.target === 'all' && a.url).map(a => ({
        transportUrl: a.url,
        name: a.name,
        flags: { protected: true, official: true },
        category: 'admin',
        enabled: true
      }));
    }

    if (rData) {
      const all = JSON.parse(rData);
      recommendedAddons = all.filter(a => a.target === 'all').map(a => ({
        name: a.name,
        description: a.description,
        transportUrl: a.url
      }));
    }
  } catch (e) {}

  return new Response(JSON.stringify({
    tmdbKey: env.TMDB_API_KEY || '',
    corsProxy: env.CORS_PROXY || '',
    notice: env.SYSTEM_NOTICE || '',
    globalAddons,
    recommendedAddons,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300', // cache 5 min
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    }
  });
}
