// Cloudflare Pages Function: /api/debug/stremio
// Debug relay — forward a Stremio catalog or stream request and return the raw response.
// Useful for viewing exactly what data an addon sends back.
// POST body: { "url": "https://addon.example.com/catalog/movie/top.json", "method": "GET"|"POST", "headers": {}, "body": {} }
import { json, validateSession } from '../_shared.js';

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Not authenticated' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { url, method = 'GET', headers = {}, body: reqBody } = body;
  if (!url) return json({ error: 'URL required' }, 400);

  // Basic safety: only allow HTTPS URLs to Stremio-compatible addons
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return json({ error: 'Only HTTPS URLs allowed' }, 400);
  } catch { return json({ error: 'Invalid URL' }, 400); }

  try {
    const fetchOpts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (reqBody && (method === 'POST' || method === 'PUT')) {
      fetchOpts.body = JSON.stringify(reqBody);
    }

    const res = await fetch(url, fetchOpts);
    const text = await res.text();

    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    return json({
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: parsed,
    });
  } catch (e) {
    return json({ error: `Relay failed: ${e.message}` }, 502);
  }
}