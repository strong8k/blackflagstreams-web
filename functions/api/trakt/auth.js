// GET /api/trakt/auth — Generate anti-CSRF state and return Trakt authorize URL
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const clientId = env.TRAKT_CLIENT_ID;
  // Use request origin so it works on preview domains too
  const origin = new URL(request.url).origin;
  const redirectUri = env.TRAKT_REDIRECT_URI || `${origin}/api/trakt/callback`;

  console.log('[Trakt:Auth] DIAG — origin:', origin,
    'TRAKT_REDIRECT_URI env:', env.TRAKT_REDIRECT_URI || '(unset)',
    'resolved redirectUri:', redirectUri,
    'TRAKT_CLIENT_ID set:', !!clientId);

  if (!clientId) return json({ error: 'Trakt client ID not configured' }, 500);

  // Generate state (anti-CSRF), store in KV for 10 minutes
  const stateBytes = new Uint8Array(16);
  crypto.getRandomValues(stateBytes);
  const state = btoa(String.fromCharCode(...stateBytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  await env.SYNC_KV.put(
    `trakt_pkce:${state}`,
    JSON.stringify({ userId: session.userId, created: Date.now() }),
    { expirationTtl: 600 }
  );

  const authorizeUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

  return json({ authorizeUrl, state });
}
