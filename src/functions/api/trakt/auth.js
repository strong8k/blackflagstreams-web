// Cloudflare Pages Function: /api/trakt/auth
// Step 1 of OAuth: redirect user to Trakt for authorization
import { json } from '../_shared.js';

const TRAKT_CLIENT_ID = null; // Set via env — leave null if not configured
const TRAKT_CLIENT_SECRET = null;
const TRAKT_REDIRECT_URI = null;

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

export async function onRequestGet(context) {
  const { env } = context;

  const clientId = env.TRAKT_CLIENT_ID;
  const redirectUri = env.TRAKT_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return json({ error: 'Trakt OAuth not configured on the server' }, 503);
  }

  // Generate a unique state token to prevent CSRF
  const state = crypto.randomUUID();

  const authorizeUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  return json({
    authorizeUrl,
    state,
  });
}