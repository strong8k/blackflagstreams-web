// GET /api/trakt/auth — Generate PKCE params and return Trakt authorize URL
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const clientId = env.TRAKT_CLIENT_ID;
  const redirectUri = env.TRAKT_REDIRECT_URI || 'https://www.blackflagstreams.link/api/trakt/callback';

  if (!clientId) return json({ error: 'Trakt client ID not configured' }, 500);

  // Generate PKCE code_verifier (43-128 chars, URL-safe base64)
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = btoa(String.fromCharCode(...verifierBytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  // code_challenge = SHA256(code_verifier) base64url
  const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hashBytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  // Generate state (anti-CSRF)
  const stateBytes = new Uint8Array(16);
  crypto.getRandomValues(stateBytes);
  const state = btoa(String.fromCharCode(...stateBytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  // Store verifier in KV, keyed by state, TTL 10 minutes
  await env.SYNC_KV.put(
    `trakt_pkce:${state}`,
    JSON.stringify({ userId: session.userId, codeVerifier, created: Date.now() }),
    { expirationTtl: 600 }
  );

  const authorizeUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

  return json({ authorizeUrl, state });
}
