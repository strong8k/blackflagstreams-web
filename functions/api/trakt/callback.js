// GET /api/trakt/callback — Handle OAuth redirect, exchange code for tokens
import { json } from '../_shared.js';

const TRAKT_TOKEN_URL = 'https://api.trakt.tv/oauth/token';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  console.log('[Trakt:Callback] Received callback — code:', !!code, 'state:', !!state, 'url:', url.pathname + url.search);

  if (!code || !state) {
    return new Response('<html><body><script>window.close();</script><p>Invalid callback. Close this window.</p></body></html>', {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Look up PKCE verifier
  const pkceRaw = await env.SYNC_KV.get(`trakt_pkce:${state}`);
  if (!pkceRaw) {
    return new Response('<html><body><script>window.close();</script><p>Session expired. Please try again.</p></body></html>', {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const { userId } = JSON.parse(pkceRaw);

  // Use the same origin the auth page was served from
  const clientId = env.TRAKT_CLIENT_ID;
  const clientSecret = env.TRAKT_CLIENT_SECRET;
  const redirectUri = env.TRAKT_REDIRECT_URI || `${url.protocol}//${url.host}/api/trakt/callback`;

  // Exchange code for tokens (standard auth code flow — no PKCE, Trakt doesn't support it)
  const tokenBody = {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  };

  try {
    const tokenRes = await fetch(TRAKT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokenBody),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      console.error('[Trakt] Token exchange failed:', tokenRes.status, errText);
      return new Response(`<html><body><script>window.close();</script><p>Trakt authorization failed (${tokenRes.status}): ${errText.slice(0, 300)}</p><p>Check TRAKT_CLIENT_ID/SECRET env vars and redirect URI config.</p></body></html>`, {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const tokens = await tokenRes.json();

    // Store tokens in KV
    const now = Date.now();
    await env.SYNC_KV.put(
      `trakt_token:${userId}`,
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: now + (tokens.expires_in || 7776000) * 1000,
        created_at: tokens.created_at || Math.floor(now / 1000),
      })
    );

    // Clean up PKCE entry
    await env.SYNC_KV.delete(`trakt_pkce:${state}`);

    // Return success page that closes itself (popup flow)
    return new Response(`<!DOCTYPE html>
<html><head><title>Connected</title>
<style>
  body { background: #050508; color: #fff; font-family: sans-serif;
         display: flex; align-items: center; justify-content: center;
         height: 100vh; margin: 0; text-align: center; }
  .check { font-size: 4rem; margin-bottom: 1rem; }
  h1 { font-size: 1.5rem; }
  p { color: #a0a4b8; }
</style></head>
<body>
<div>
  <div class="check">&#x2705;</div>
  <h1>Trakt Connected</h1>
  <p>You can close this window.</p>
</div>
<script>window.close();</script>
</body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (e) {
    console.error('[Trakt] Token exchange error:', e.message);
    return new Response(`<html><body><script>window.close();</script><p>Network error. Close this window and try again.</p></body></html>`, {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
