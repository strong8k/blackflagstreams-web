export async function onRequest(context) {
  const { params, env } = context;
  const { type, id } = params;

  const tmdbKey = env.TMDB_API_KEY;
  if (!tmdbKey) {
    return new Response(JSON.stringify({ metas: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const cleanId = id.replace('.json', '');
  let endpoint = '';

  if (cleanId === 'teatv_popular_movies') {
    endpoint = `https://api.themoviedb.org/3/movie/popular?api_key=${tmdbKey}&language=en-US&page=1`;
  } else if (cleanId === 'teatv_trending_series') {
    endpoint = `https://api.themoviedb.org/3/tv/popular?api_key=${tmdbKey}&language=en-US&page=1`;
  } else {
    return new Response(JSON.stringify({ metas: [] }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const res = await fetch(endpoint);
    if (!res.ok) {
      return new Response(JSON.stringify({ metas: [] }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    const data = await res.json();

    const metas = (data.results || []).map((item) => ({
      id: `tmdb:${type}/${item.id}`,
      type: type === 'movie' ? 'movie' : 'series',
      name: item.title || item.name,
      poster: item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : null,
      description: item.overview,
      year: item.release_date
        ? new Date(item.release_date).getFullYear()
        : item.first_air_date
        ? new Date(item.first_air_date).getFullYear()
        : null,
    }));

    return new Response(JSON.stringify({ metas }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ metas: [] }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}