export async function onRequest(context) {
  const { params, env } = context;
  const { type, id } = params; // id is e.g. teatv_popular_movies.json

  const tmdbKey = env.TMDB_API_KEY;
  if (!tmdbKey) {
    return new Response(JSON.stringify({ metas: [] }), { status: 500 });
  }

  const cleanId = id.replace('.json', '');
  let endpoint = '';

  if (cleanId === 'teatv_popular_movies') {
    endpoint = `https://api.themoviedb.org/3/movie/popular?api_key=${tmdbKey}`;
  } else if (cleanId === 'teatv_trending_series') {
    endpoint = `https://api.themoviedb.org/3/tv/popular?api_key=${tmdbKey}`;
  } else {
    return new Response(JSON.stringify({ metas: [] }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const res = await fetch(endpoint);
    const data = await res.json();
    
    // Map TMDB to Stremio Meta format
    const metas = (data.results || []).map(item => ({
      id: item.id.toString(), // We'll need a way to resolve this to IMDB in the stream handler if needed, but Stremio handles IMDB mapping via Cinemeta usually.
      // Wait, Stremio catalogs usually use IMDB IDs (tt...) for standard types.
      // For now, let's just return what we have.
      name: item.title || item.name,
      type: type,
      poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
      description: item.overview,
    }));

    return new Response(JSON.stringify({ metas }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ metas: [] }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
