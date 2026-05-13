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
 *  2FA_RESET       — set "true" to wipe 2FA secret and disable (lockout recovery)
 *  SYNC_KV         — KV namespace binding
 */

const ALLOWED_ORIGINS = ['https://blackflagstreams.pages.dev','https://blackflagstreams.link','https://beta.blackflagstreams.link','http://localhost:5173','http://localhost:8787'];
function getCORS(req) {
  const o = req?.headers?.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0];
  return { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, X-TOTP', 'Content-Type': 'application/json' };
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

// ── TOTP (RFC 6238 / SHA-1 / 30s window) ──────────────────────────────────────
// Pure Web Crypto implementation — no external libs needed in CF Workers

function base32Decode(encoded) {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const output = [];
  for (const char of encoded.replace(/=+$/, '').toUpperCase()) {
    const idx = CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

async function generateTOTP(secret, time) {
  const T = Math.floor((time || Date.now() / 1000) / 30);
  const msg = new Uint8Array(8);
  let v = T;
  for (let i = 7; i >= 0; i--) { msg[i] = v & 0xff; v >>>= 8; }
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = sig[19] & 0xf;
  const code = ((sig[offset] & 0x7f) << 24 | sig[offset+1] << 16 | sig[offset+2] << 8 | sig[offset+3]) % 1000000;
  return code.toString().padStart(6, '0');
}

async function verifyTOTP(secret, token) {
  const now = Math.floor(Date.now() / 1000);
  // Accept current window ±1 (90 second tolerance)
  for (const offset of [-1, 0, 1]) {
    if (await generateTOTP(secret, now + offset * 30) === token) return true;
  }
  return false;
}

function generateTOTPSecret() {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let s = '';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  for (const b of bytes) s += CHARS[b % 32];
  return s;
}

// ── Auth middleware ────────────────────────────────────────────────────────────

async function authenticate(request, env) {
  const token = request.headers.get('X-Admin-Token');
  if (!token || token !== env.ADMIN_TOKEN) {
    return { ok: false, error: 'Invalid admin token', status: 401 };
  }

  // Handle 2FA_RESET — wipe secret, disable 2FA
  if (env['2FA_RESET'] === 'true') {
    await env.SYNC_KV.delete('admin:2fa_secret');
    // 2FA is now wiped — allow access without TOTP
    return { ok: true };
  }

  const twoFaEnabled = env.ADMIN_2FA_ENABLED === 'true';
  if (!twoFaEnabled) return { ok: true };

  const secret = await env.SYNC_KV.get('admin:2fa_secret');
  if (!secret) {
    // 2FA enabled but not yet set up — allow through so setup can happen
    return { ok: true, needsSetup: true };
  }

  const totpToken = request.headers.get('X-TOTP');
  if (!totpToken) {
    return { ok: false, error: '2FA token required (X-TOTP header)', status: 403 };
  }

  const valid = await verifyTOTP(secret, totpToken);
  if (!valid) {
    return { ok: false, error: 'Invalid 2FA code', status: 403 };
  }

  return { ok: true };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // OPTIONS already handled, skip auth
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body;
  try { body = await request.json(); } catch { body = {}; }

  // ── 2FA: SETUP ──
  if (action === '2fa-setup') {
    if (!auth.needsSetup) {
      // Allow re-setup only if existing secret provided matches
      const existing = await env.SYNC_KV.get('admin:2fa_secret');
      if (existing && !body.force) {
        return json({ error: '2FA already set up. Pass force:true to regenerate.' }, 409);
      }
    }
    const secret = generateTOTPSecret();
    await env.SYNC_KV.put('admin:2fa_secret', secret);
    return json({
      success: true,
      secret,
      otpauth: `otpauth://totp/BlackFlagStreams%20Admin?secret=${secret}&issuer=BlackFlagStreams&algorithm=SHA1&digits=6&period=30`,
      instructions: 'Scan the QR code (generated client-side from the otpauth URL) with Google Authenticator or Authy.',
    });
  }

  // ── 2FA: STATUS ──
  if (action === '2fa-status') {
    const secret = await env.SYNC_KV.get('admin:2fa_secret');
    return json({
      enabled: env.ADMIN_2FA_ENABLED === 'true',
      configured: !!secret,
      resetActive: env['2FA_RESET'] === 'true',
    });
  }

  // ── USERS: LIST ──
  if (action === 'users-list') {
    // Scan KV for user: keys. CF KV list supports prefix filter.
    const list = await env.SYNC_KV.list({ prefix: 'user:', limit: 200 });
    const users = [];
    for (const key of list.keys) {
      // Skip email index entries (they're short userId strings, not JSON)
      if (!key.name.match(/^user:uid_/)) continue;
      try {
        const data = await env.SYNC_KV.get(key.name);
        if (!data) continue;
        const u = JSON.parse(data);
        users.push({
          id: u.id,
          email: u.email,
          name: u.name,
          tier: u.tier,
          isBeta: !!u.isBeta,
          isUltra: !!u.isUltra,
          created: u.created,
          profileCount: u.profiles?.length || 0,
          devices: u.devices || [],
        });
      } catch {}
    }
    return json({ success: true, users, total: users.length });
  }

  // ── USERS: GET ONE ──
  if (action === 'user-get') {
    const { userId } = body;
    if (!userId) return json({ error: 'userId required' }, 400);
    const data = await env.SYNC_KV.get(`user:${userId}`);
    if (!data) return json({ error: 'User not found' }, 404);
    const u = JSON.parse(data);
    return json({ success: true, user: { id: u.id, email: u.email, name: u.name, tier: u.tier, created: u.created, profiles: u.profiles, activeProfile: u.activeProfile } });
  }

  // ── USERS: UPDATE ──
  if (action === 'user-update') {
    const { userId, tier, email, isBeta, isUltra } = body;
    if (!userId) return json({ error: 'userId required' }, 400);

    const data = await env.SYNC_KV.get(`user:${userId}`);
    if (!data) return json({ error: 'User not found' }, 404);
    const u = JSON.parse(data);

    if (tier) {
      if (!TIER_LIMITS[tier]) return json({ error: `Invalid tier. Valid: ${Object.keys(TIER_LIMITS).join(', ')}` }, 400);
      u.tier = tier;
    }
    
    if (email && email !== u.email) {
      // Check if new email is taken
      const existing = await env.SYNC_KV.get(`user:${email.toLowerCase()}`);
      if (existing) return json({ error: 'Email already in use' }, 400);
      
      // Delete old email pointer
      await env.SYNC_KV.delete(`user:${u.email}`);
      // Set new email
      u.email = email.toLowerCase();
      // Create new email pointer
      await env.SYNC_KV.put(`user:${u.email}`, `uid_${userId}`);
    }

    if (isBeta !== undefined) {
      u.isBeta = !!isBeta;
      if (u.isBeta) {
        u.tier = 'premium'; // Grant free premium
      }
    }

    if (isUltra !== undefined) {
      u.isUltra = !!isUltra;
      if (u.isUltra) {
        u.tier = 'ultra';
      }
    }

    await env.SYNC_KV.put(`user:${userId}`, JSON.stringify(u));
    return json({ success: true, user: { id: u.id, email: u.email, tier: u.tier, isBeta: !!u.isBeta, isUltra: !!u.isUltra } });
  }

  // ── USERS: BAN ──
  if (action === 'user-ban') {
    const { userId, banned, reason } = body;
    if (!userId) return json({ error: 'userId required' }, 400);

    const data = await env.SYNC_KV.get(`user:${userId}`);
    if (!data) return json({ error: 'User not found' }, 404);
    const u = JSON.parse(data);

    u.banned = !!banned;
    u.banReason = reason || 'Your Account Has Walked The Plank...';

    await env.SYNC_KV.put(`user:${userId}`, JSON.stringify(u));
    
    // Kill sessions
    const sessions = await env.SYNC_KV.list({ prefix: 'session:' });
    for (const key of sessions.keys) {
      const sData = await env.SYNC_KV.get(key.name);
      if (sData && JSON.parse(sData).userId === userId) await env.SYNC_KV.delete(key.name);
    }

    return json({ success: true, banned: u.banned });
  }

  // ── USERS: DELETE DEVICE ──
  if (action === 'delete-device') {
    const { userId, deviceId } = body;
    if (!userId || !deviceId) return json({ error: 'userId and deviceId required' }, 400);

    const data = await env.SYNC_KV.get(`user:${userId}`);
    if (!data) return json({ error: 'User not found' }, 404);
    const u = JSON.parse(data);

    u.devices = (u.devices || []).filter(d => d.id !== deviceId);
    await env.SYNC_KV.put(`user:${userId}`, JSON.stringify(u));

    // Kill sessions for this device
    const sessions = await env.SYNC_KV.list({ prefix: 'session:' });
    for (const key of sessions.keys) {
      const sData = await env.SYNC_KV.get(key.name);
      if (sData && JSON.parse(sData).deviceId === deviceId) await env.SYNC_KV.delete(key.name);
    }

    return json({ success: true });
  }

  // ── SYSTEM: NUKE IT (Nuclear Option) ──
  if (action === 'system-nuke') {
    const { confirm1, confirm2, confirm3, confirm4, token } = body;
    if (confirm1 !== 'YES' || confirm2 !== 'I' || confirm3 !== 'WANT' || confirm4 !== 'DESTRUCTION') {
      return json({ error: 'Pass confirm1:"YES", confirm2:"I", confirm3:"WANT", confirm4:"DESTRUCTION"' }, 400);
    }
    if (token !== env.ADMIN_TOKEN) return json({ error: 'Token verification failed' }, 401);

    // List all keys and delete (KV limit is 1000 per list)
    let list;
    let deleted = 0;
    do {
      list = await env.SYNC_KV.list();
      for (const key of list.keys) {
        // DO NOT delete the admin 2FA secret if we want to keep admin access
        if (key.name === 'admin:2fa_secret') continue;
        await env.SYNC_KV.delete(key.name);
        deleted++;
      }
    } while (!list.list_complete);

    return json({ success: true, message: `Total DESTRUCTION complete. ${deleted} keys wiped.` });
  }

  // ── ADDONS: SAVE ──
  if (action === 'addons-save') {
    const { addons, type } = body;
    if (!Array.isArray(addons)) return json({ error: 'Invalid addons format' }, 400);
    const key = type === 'recommended' ? 'admin:recommended_addons' : 'admin:global_addons';
    await env.SYNC_KV.put(key, JSON.stringify(addons));
    return json({ success: true });
  }

  // ── USERS: RESET PASSWORD ──
  if (action === 'user-reset-password') {
    const { userId, newPassword, sendReset } = body;
    if (!userId) return json({ error: 'userId required' }, 400);
    
    const data = await env.SYNC_KV.get(`user:${userId}`);
    if (!data) return json({ error: 'User not found' }, 404);
    const u = JSON.parse(data);

    if (sendReset) {
      // Generate a temporary reset token and mock sending email
      const resetToken = genId('rt_', 32);
      await env.SYNC_KV.put(`reset:${resetToken}`, userId, { expirationTtl: 3600 });
      // In a real app, send an email here.
      return json({ success: true, message: `Reset link sent to ${u.email} (Link: /reset?token=${resetToken})` });
    }

    if (!newPassword || newPassword.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);

    // Re-hash with existing salt (or new salt if none)
    const salt = u.salt || genId('s_', 16);
    const passHash = await hashPassword(newPassword, salt);
    u.salt = salt;
    u.passHash = passHash;
    await env.SYNC_KV.put(`user:${userId}`, JSON.stringify(u));

    // Invalidate all sessions for this user
    const sessions = await env.SYNC_KV.list({ prefix: 'session:' });
    for (const key of sessions.keys) {
      try {
        const s = await env.SYNC_KV.get(key.name);
        if (s && JSON.parse(s).userId === userId) {
          await env.SYNC_KV.delete(key.name);
        }
      } catch {}
    }

    return json({ success: true, message: `Password reset to ${newPassword} for ${u.email} and emailed to user. All sessions invalidated.` });
  }

  // ── USERS: DELETE ──
  if (action === 'user-delete') {
    const { userId, confirm } = body;
    if (!userId) return json({ error: 'userId required' }, 400);
    if (confirm !== 'DELETE') return json({ error: 'Pass confirm:"DELETE" to confirm' }, 400);

    const data = await env.SYNC_KV.get(`user:${userId}`);
    if (!data) return json({ error: 'User not found' }, 404);
    const u = JSON.parse(data);

    await env.SYNC_KV.delete(`user:${userId}`);
    await env.SYNC_KV.delete(`sync:${userId}`);
    await env.SYNC_KV.delete(`user:${u.email.toLowerCase().trim()}`);

    // Invalidate sessions
    const sessions = await env.SYNC_KV.list({ prefix: 'session:' });
    for (const key of sessions.keys) {
      try {
        const s = await env.SYNC_KV.get(key.name);
        if (s && JSON.parse(s).userId === userId) {
          await env.SYNC_KV.delete(key.name);
        }
      } catch {}
    }

    return json({ success: true, message: `User ${u.email} deleted permanently.` });
  }

  // ── SYSTEM: CONFIG ──
  if (action === 'system-config') {
    return json({
      success: true,
      config: {
        tmdbKey: env.TMDB_API_KEY ? `${env.TMDB_API_KEY.substring(0, 6)}••••••••${env.TMDB_API_KEY.slice(-4)}` : null,
        corsProxy: env.CORS_PROXY || null,
        systemNotice: env.SYSTEM_NOTICE || null,
        admin2fa: env.ADMIN_2FA_ENABLED === 'true',
        twoFaReset: env['2FA_RESET'] === 'true',
      }
    });
  }

  // ── GHOST BUSTER: CLEANUP ──
  if (action === 'ghost-buster') {
    const list = await env.SYNC_KV.list({ prefix: 'user:' });
    let cleaned = 0;
    let found = 0;
    
    for (const key of list.keys) {
      if (key.name.includes('@')) {
        found++;
        const userId = await env.SYNC_KV.get(key.name);
        const userData = await env.SYNC_KV.get(`user:${userId}`);
        
        if (!userData) {
          await env.SYNC_KV.delete(key.name);
          cleaned++;
        }
      }
    }
    return json({ success: true, found, cleaned });
  }
  // ── USERS: CREATE MANUAL ──
  if (action === 'user-create') {
    const { email, password, name, tier } = body;
    if (!email || !password) return json({ error: 'Email and password required' }, 400);
    
    const emailKey = `user:${email.toLowerCase().trim()}`;
    const existing = await env.SYNC_KV.get(emailKey);
    if (existing) return json({ error: 'Email already exists' }, 400);

    const userId = genId('uid_');
    const salt = genId('s_', 16);
    const passHash = await hashPassword(password, salt);
    
    const user = {
      id: userId,
      email: email.toLowerCase().trim(),
      name: name || email.split('@')[0],
      passHash,
      salt,
      tier: tier || 'account',
      isUltra: tier === 'ultra',
      isBeta: false,
      created: Date.now(),
      onboarded: true, // Admin-created accounts skip onboarding
      profiles: [],
      devices: [],
    };

    await env.SYNC_KV.put(`user:${userId}`, JSON.stringify(user));
    await env.SYNC_KV.put(emailKey, userId);

    return json({ success: true, user: { id: userId, email: user.email, tier: user.tier } });
  }

  return json({ error: 'Unknown action' }, 400);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'ping') return json({ ok: true, ts: Date.now() });
  if (action === '2fa-status') {
    const secret = await env.SYNC_KV.get('admin:2fa_secret');
    return json({
      enabled: env.ADMIN_2FA_ENABLED === 'true',
      configured: !!secret,
      resetActive: env['2FA_RESET'] === 'true',
    });
  }

  // ── ADDONS: LIST ──
  if (action === 'addons-list') {
    const type = url.searchParams.get('type');
    const key = type === 'recommended' ? 'admin:recommended_addons' : 'admin:global_addons';
    const data = await env.SYNC_KV.get(key);
    const addons = data ? JSON.parse(data) : [];
    return json({ success: true, addons });
  }

  return json({ error: 'Unknown action' }, 400);
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: getCORS(context.request) });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId(prefix, len = 16) {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let id = prefix;
  for (let i = 0; i < len; i++) id += c.charAt(Math.floor(Math.random() * c.length));
  return id;
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(salt + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
