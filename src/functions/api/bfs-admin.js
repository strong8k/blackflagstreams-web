/**
 * BlackFlagStreams — Admin API
 * Route: /api/bfs-admin
 *
 * Security:
 *  - All requests require a valid ADMIN_TOKEN header (set in CF env vars)
 *  - 2FA via TOTP (RFC 6238 / Google Authenticator compatible)
 *  - 2FA_RESET=true in env will wipe 2FA and allow re-setup
 *
 * ENV VARS required:
 *  ADMIN_TOKEN     — long random secret (use `openssl rand -hex 32`)
 *  ADMIN_2FA_ENABLED — "true" to enforce TOTP on login
 *  2FA_RESET       — set "true" to wipe 2FA secret and allow re-setup
 *  SYNC_KV         — KV namespace binding
 */

// FIXED: Updated ALLOWED_ORIGINS for new customer-facing domain
const ALLOWED_ORIGINS = [
  'https://blackflagstreams.link',
  'https://beta.blackflagstreams.link',
  'https://blackflagstream.pages.dev',
  'http://localhost:5173',
  'http://localhost:8787',
];

function getCORS(req) {
  const o = req?.headers?.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, X-TOTP',
    'Content-Type': 'application/json',
  };
}

function json(data, status = 200, req = null) {
  return new Response(JSON.stringify(data), { status, headers: getCORS(req) });
}

const TIER_LIMITS = {
  free:    { profiles: 1, devices: 1,   historyItems: 100,   addons: 5,   sync: false, iptvProviders: 0, iptvChannelLimit: 0 },
  account: { profiles: 2, devices: 2,   historyItems: 500,   addons: 999, sync: true,  iptvProviders: 1, iptvChannelLimit: 100 },
  premium: { profiles: 4, devices: 4,   historyItems: 99999, addons: 999, sync: true,  iptvProviders: 1, iptvChannelLimit: 99999 },
  pro:     { profiles: 6, devices: 6,   historyItems: 99999, addons: 999, sync: true,  iptvProviders: 5, iptvChannelLimit: 99999 },
  ultra:   { profiles: 999, devices: 999, historyItems: 99999, addons: 999, sync: true, iptvProviders: 999, iptvChannelLimit: 99999 },
};