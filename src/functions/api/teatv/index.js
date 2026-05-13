export async function onRequest(context) {
  // If someone hits /teatv, we give them the manifest
  const manifest = {
    id: 'link.blackflagstreams.teatv',
    version: '1.0.0',
    name: 'TeaTV Streams',
    description: 'Direct HTTP streams from Vidsrc, EmbedSu, and more. No debrid required. High performance, no-waiting.',
    logo: 'https://blackflagstreams.link/assets/teatv-logo.png',
    resources: ['stream', 'catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [
      { id: 'teatv_popular_movies', type: 'movie', name: 'TeaTV Popular' },
      { id: 'teatv_trending_series', type: 'series', name: 'TeaTV Trending' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
