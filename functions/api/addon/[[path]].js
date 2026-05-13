export async function onRequest(context) {
  const { request, env, params } = context;
  const pathParts = params.path || []; // e.g. ["123", "manifest.json"]
  
  if (pathParts.length < 2) {
    return new Response('Invalid addon path', { status: 400 });
  }

  const addonId = pathParts[0];
  const targetPath = pathParts.slice(1).join('/');

  if (!env.SYNC_KV) return new Response('KV not configured', { status: 503 });

  // Look up addons from both Global and Recommended lists
  const [globalData, recommendedData] = await Promise.all([
    env.SYNC_KV.get('admin:global_addons'),
    env.SYNC_KV.get('admin:recommended_addons')
  ]);
  
  let allAddons = [];
  if (globalData) allAddons = allAddons.concat(JSON.parse(globalData));
  if (recommendedData) allAddons = allAddons.concat(JSON.parse(recommendedData));
  
  const addon = allAddons.find(a => a.id === addonId);
  
  if (!addon) return new Response('Addon not found: ' + addonId, { status: 404 });

  // Construct target URL
  const base = addon.url.replace(/\/manifest\.json$/, '');
  const targetUrl = `${base}/${targetPath}`;

  // Forward the request
  const newRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
    redirect: 'follow'
  });

  try {
    const response = await fetch(newRequest);
    // Add generous CORS headers so the browser allows the fetch
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (err) {
    return new Response('Proxy error: ' + err.message, { status: 502 });
  }
}
