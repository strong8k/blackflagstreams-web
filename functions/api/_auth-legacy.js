// Cloudflare Pages Function: /api/auth
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function genId(prefix, len = 16) {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let id = prefix;
  for (let i = 0; i < len; i++) id += c.charAt(Math.floor(Math.random() * c.length));
  return id;
}

// 4-char uppercase alphanumeric code — no ambiguous chars (O,0,I,1)
function genAlphaCode(len = 4) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(salt + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const TIER_LIMITS = {
  free:    { profiles: 1, devices: 1,   historyItems: 100,   addons: 5,   sync: false, iptvProviders: 0, iptvChannelLimit: 0 },
  account: { profiles: 2, devices: 2,   historyItems: 500,   addons: 999, sync: true,  iptvProviders: 1, iptvChannelLimit: 100 },
  premium: { profiles: 4, devices: 4,   historyItems: 99999, addons: 999, sync: true,  iptvProviders: 1, iptvChannelLimit: 99999 },
  pro:     { profiles: 6, devices: 6,   historyItems: 99999, addons: 999, sync: true,  iptvProviders: 5, iptvChannelLimit: 99999 },
  ultra:   { profiles: 999, devices: 999, historyItems: 99999, addons: 999, sync: true, iptvProviders: 999, iptvChannelLimit: 99999 },
};

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  let body;
  try { body = await request.json(); } catch { body = {}; }

  // ── REGISTER ──
  if (action === 'register') {
    const { email, password, name } = body;
    if (!email || !password) return json({ error: 'Email and password required' }, 400);
    if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

    const emailKey = `user:${email.toLowerCase().trim()}`;
    const existingUid = await env.SYNC_KV.get(emailKey);
    if (existingUid) {
      // 👻 Ghost Busting: Check if the actual user data exists
      const userData = await env.SYNC_KV.get(`user:${existingUid}`);
      if (userData) {
        return json({ error: 'Account already exists. Try logging in.' }, 409);
      } else {
        // Index exists but user is gone. Self-heal by deleting the orphan.
        await env.SYNC_KV.delete(emailKey);
      }
    }

    const userId = genId('uid_', 12);
    const salt = genId('s_', 16);
    const passHash = await hashPassword(password, salt);
    const token = genId('tok_', 24);
    const now = Date.now();

    // Strong Password Validation
    const hasNum = /[0-9]/.test(password);
    const hasSym = /[^A-Za-z0-9]/.test(password);
    const hasCaps = /[A-Z]/.test(password);
    if (password.length < 14 || !hasNum || !hasSym || !hasCaps) {
      return json({ error: 'Password must be at least 14 characters and include a number, symbol, and uppercase letter.' }, 400);
    }

    const user = {
      id: userId,
      email: email.toLowerCase().trim(),
      name: name || email.split('@')[0],
      salt, passHash,
      tier: 'account',
      created: now,
      profiles: [{ id: 'p1', name: name || 'Captain', avatar: '🏴‍☠️', isOwner: true }],
      activeProfile: 'p1',
      devices: [],
      onboarded: false,
    };

    await env.SYNC_KV.put(`user:${userId}`, JSON.stringify(user));
    await env.SYNC_KV.put(emailKey, userId);
    await env.SYNC_KV.put(`session:${token}`, JSON.stringify({ userId, created: now }), { expirationTtl: 90 * 24 * 3600 });
    await env.SYNC_KV.put(`sync:${userId}`, JSON.stringify({ addons: [], watchlist: [], continueWatching: [], preferences: {}, updated: now }));

    return json({
      success: true, token,
      user: { id: userId, email: user.email, name: user.name, tier: user.tier, profiles: user.profiles, activeProfile: user.activeProfile },
      tierLimits: TIER_LIMITS[user.tier],
    });
  }

  // ── LOGIN ──
  if (action === 'login') {
    const { email, password } = body;
    if (!email || !password) return json({ error: 'Email and password required' }, 400);

    const emailKey = `user:${email.toLowerCase().trim()}`;
    const userId = await env.SYNC_KV.get(emailKey);
    if (!userId) return json({ error: 'Account not found' }, 404);

    const userData = await env.SYNC_KV.get(`user:${userId}`);
    if (!userData) return json({ error: 'Account data missing' }, 500);

    const user = JSON.parse(userData);
    if (user.banned) return json({ error: 'Your Account Has Walked The Plank...' }, 403);

    const passHash = await hashPassword(password, user.salt);
    if (passHash !== user.passHash) return json({ error: 'Invalid password' }, 401);

    const token = genId('tok_', 24);
    await env.SYNC_KV.put(`session:${token}`, JSON.stringify({ userId, created: Date.now() }), { expirationTtl: 90 * 24 * 3600 });

    return json({
      success: true, token,
      user: { id: user.id, email: user.email, name: user.name, tier: user.tier, profiles: user.profiles, activeProfile: user.activeProfile },
      tierLimits: TIER_LIMITS[user.tier],
    });
  }

  // ── LOGOUT ──
  if (action === 'logout') {
    const { token } = body;
    if (token) await env.SYNC_KV.delete(`session:${token}`);
    return json({ success: true });
  }

  // ── UPDATE PROFILE ──
  if (action === 'update') {
    const { token } = body;
    const session = await validateSession(env, token);
    if (!session) return json({ error: 'Invalid session' }, 401);

    const userData = await env.SYNC_KV.get(`user:${session.userId}`);
    if (!userData) return json({ error: 'User not found' }, 404);

    const user = JSON.parse(userData);
    if (body.name) user.name = body.name;
    if (body.profiles) {
      const limits = TIER_LIMITS[user.tier];
      if (body.profiles.length > limits.profiles) {
        return json({ error: `${user.tier} tier allows max ${limits.profiles} profiles. Upgrade for more.` }, 403);
      }
      user.profiles = body.profiles;
    }
    if (body.activeProfile) user.activeProfile = body.activeProfile;

    await env.SYNC_KV.put(`user:${session.userId}`, JSON.stringify(user));
    return json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, tier: user.tier, profiles: user.profiles, activeProfile: user.activeProfile },
      tierLimits: TIER_LIMITS[user.tier],
    });
  }

  // ── QR CREATE (TV/device requests a login code) ──
  if (action === 'qr-create') {
    const code = genAlphaCode(4);
    const deviceInfo = {
      type: body.deviceType || 'TV',
      name: body.deviceName || '',
      city:    request.cf?.city    || '',
      country: request.cf?.country || '',
      ip: (request.headers.get('cf-connecting-ip') || '').split(',')[0].trim(),
    };
    await env.SYNC_KV.put(
      `qr:${code}`,
      JSON.stringify({ status: 'pending', created: Date.now(), deviceInfo }),
      { expirationTtl: 300 }
    );
    return json({ success: true, code });
  }

  // ── QR APPROVE (phone/browser user approves the code) ──
  if (action === 'qr-approve') {
    const { token, code } = body;
    if (!token || !code) return json({ error: 'Token and code required' }, 400);

    const session = await validateSession(env, token);
    if (!session) return json({ error: 'Invalid session. Log in first.' }, 401);

    const cleanCode = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const qrData = await env.SYNC_KV.get(`qr:${cleanCode}`);
    if (!qrData) return json({ error: 'Code expired or invalid' }, 404);

    const parsed = JSON.parse(qrData);
    if (parsed.status !== 'pending') return json({ error: 'Code already used' }, 409);

    const userData = await env.SYNC_KV.get(`user:${session.userId}`);
    if (!userData) return json({ error: 'User not found' }, 404);
    const user = JSON.parse(userData);
    const limits = TIER_LIMITS[user.tier];

    // Check device limits
    if (!user.devices) user.devices = [];
    if (user.devices.length >= limits.devices) {
      return json({ error: `Device limit reached (${limits.devices}). Remove a device first.` }, 403);
    }

    const deviceId = genId('dev_', 12);
    const newDevice = {
      id: deviceId,
      name: parsed.deviceInfo.name || `TV ${user.devices.length + 1}`,
      type: parsed.deviceInfo.type || 'TV',
      added: Date.now(),
      lastUsed: Date.now(),
      ip: parsed.deviceInfo.ip
    };
    user.devices.push(newDevice);
    await env.SYNC_KV.put(`user:${session.userId}`, JSON.stringify(user));

    const tvToken = genId('tok_', 24);
    await env.SYNC_KV.put(`session:${tvToken}`, JSON.stringify({ userId: session.userId, deviceId, created: Date.now(), device: 'tv' }), { expirationTtl: 90 * 24 * 3600 });
    await env.SYNC_KV.put(`qr:${cleanCode}`, JSON.stringify({ status: 'approved', tvToken }), { expirationTtl: 60 });

    return json({ success: true });
  }

  // ── RENAME DEVICE ──
  if (action === 'rename-device') {
    const { token, deviceId, name } = body;
    const session = await validateSession(env, token);
    if (!session) return json({ error: 'Invalid session' }, 401);

    const userData = await env.SYNC_KV.get(`user:${session.userId}`);
    if (!userData) return json({ error: 'User not found' }, 404);

    const user = JSON.parse(userData);
    user.devices = (user.devices || []).map(d => d.id === deviceId ? { ...d, name } : d);
    
    await env.SYNC_KV.put(`user:${session.userId}`, JSON.stringify(user));
    return json({ success: true });
  }

  // ── DELETE DEVICE ──
  if (action === 'delete-device') {
    const { token, deviceId } = body;
    const session = await validateSession(env, token);
    if (!session) return json({ error: 'Invalid session' }, 401);

    const userData = await env.SYNC_KV.get(`user:${session.userId}`);
    if (!userData) return json({ error: 'User not found' }, 404);

    const user = JSON.parse(userData);
    user.devices = (user.devices || []).filter(d => d.id !== deviceId);

    // Also kill any sessions for this device
    const sessions = await env.SYNC_KV.list({ prefix: 'session:' });
    for (const key of sessions.keys) {
      const sData = await env.SYNC_KV.get(key.name);
      if (sData && JSON.parse(sData).deviceId === deviceId) await env.SYNC_KV.delete(key.name);
    }

    await env.SYNC_KV.put(`user:${session.userId}`, JSON.stringify(user));
    return json({ success: true });
  }

  // ── DELETE ACCOUNT ──
  if (action === 'delete-account') {
    const { token } = body;
    const session = await validateSession(env, token);
    if (!session) return json({ error: 'Invalid session' }, 401);

    const userData = await env.SYNC_KV.get(`user:${session.userId}`);
    if (userData) {
      const user = JSON.parse(userData);
      // Clean up email index (always lowercase)
      await env.SYNC_KV.delete(`user:${user.email.toLowerCase().trim()}`);
    }

    // Always attempt to delete the lowercase email key as a fallback
    // (In case userData was already missing but index remained)
    const list = await env.SYNC_KV.list({ prefix: 'user:' });
    for (const key of list.keys) {
      const val = await env.SYNC_KV.get(key.name);
      if (val === session.userId) await env.SYNC_KV.delete(key.name);
    }

    await env.SYNC_KV.delete(`user:${session.userId}`);
    await env.SYNC_KV.delete(`sync:${session.userId}`);
    await env.SYNC_KV.delete(`session:${token}`);
    return json({ success: true });
  }

  // ── ONBOARDING COMPLETE ──
  if (action === 'onboarding-complete') {
    const { token } = body;
    const session = await validateSession(env, token);
    if (!session) return json({ error: 'Invalid session' }, 401);

    const userData = await env.SYNC_KV.get(`user:${session.userId}`);
    if (!userData) return json({ error: 'User not found' }, 404);

    const user = JSON.parse(userData);
    user.onboarded = true;
    await env.SYNC_KV.put(`user:${session.userId}`, JSON.stringify(user));
    return json({ success: true });
  }

  // BETA APPLICATION
  if (action === 'beta-apply') {
    const { name, email, techLevel, experience, devices, motivation } = body;
    if (!email || !name) return json({ error: 'Name and email required' }, 400);
    const id = genId('beta_', 12);
    const app = { id, name, email: email.toLowerCase().trim(), techLevel, experience, devices, motivation, submitted: Date.now(), status: 'pending' };
    await env.SYNC_KV.put('beta:' + id, JSON.stringify(app), { expirationTtl: 90 * 24 * 3600 });
    await env.SYNC_KV.put('beta_email:' + email.toLowerCase().trim(), id);
    return json({ success: true, queued: true });
  }

  return json({ error: 'Invalid action' }, 400);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // ── SESSION CHECK ──
  if (action === 'session') {
    const token = url.searchParams.get('token');
    const session = await validateSession(env, token);
    if (!session) return json({ error: 'Invalid session' }, 401);

    const userData = await env.SYNC_KV.get(`user:${session.userId}`);
    if (!userData) return json({ error: 'User not found' }, 404);

    const user = JSON.parse(userData);

    // Fetch global addons assigned to this user
    let assignedAddons = [];
    let recommendedAddons = [];
    try {
      const [gData, rData] = await Promise.all([
        env.SYNC_KV.get('admin:global_addons'),
        env.SYNC_KV.get('admin:recommended_addons')
      ]);

      if (gData) {
        const globals = JSON.parse(gData);
        assignedAddons = globals.filter(a => {
          if (a.target === 'all') return true;
          if (a.target === 'beta' && user.isBeta) return true;
          if (a.target === 'ultra' && user.isUltra) return true;
          return false;
        }).map(a => ({
          transportUrl: a.url.startsWith('http') ? `/api/addon/${a.id}/manifest.json` : a.url,
          flags: { protected: true, official: true },
          category: 'admin',
          enabled: true
        }));
      }

      if (rData) {
        const recommended = JSON.parse(rData);
        recommendedAddons = recommended.filter(a => {
          if (a.target === 'all') return true;
          if (a.target === 'beta' && user.isBeta) return true;
          if (a.target === 'ultra' && user.isUltra) return true;
          return false;
        }).map(a => ({
          name: a.name,
          description: a.description,
          transportUrl: a.url
        }));
      }
    } catch (e) {}

    return json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, tier: user.tier, profiles: user.profiles, activeProfile: user.activeProfile, isBeta: !!user.isBeta, isUltra: !!user.isUltra, devices: user.devices || [] },
      tierLimits: TIER_LIMITS[user.tier],
      assignedAddons,
      recommendedAddons,
    });
  }

  // ── QR INFO (approve page reads device info before user is logged in) ──
  if (action === 'qr-info') {
    const code = url.searchParams.get('code')?.toUpperCase();
    if (!code) return json({ error: 'code required' }, 400);
    const qrData = await env.SYNC_KV.get(`qr:${code}`);
    if (!qrData) return json({ status: 'expired' });
    const parsed = JSON.parse(qrData);
    const expiresIn = Math.max(0, 300 - Math.floor((Date.now() - parsed.created) / 1000));
    return json({ status: parsed.status, deviceInfo: parsed.deviceInfo || {}, expiresIn });
  }

  // ── QR CHECK (TV polls until approved) ──
  if (action === 'qr-check') {
    const code = url.searchParams.get('code')?.toUpperCase();
    if (!code) return json({ error: 'code required' }, 400);
    const qrData = await env.SYNC_KV.get(`qr:${code}`);
    if (!qrData) return json({ status: 'expired' });
    const parsed = JSON.parse(qrData);
    if (parsed.status === 'approved') {
      const session = await validateSession(env, parsed.tvToken);
      let user = null;
      if (session) {
        const userData = await env.SYNC_KV.get(`user:${session.userId}`);
        if (userData) {
          const u = JSON.parse(userData);
          user = { id: u.id, email: u.email, name: u.name, tier: u.tier, profiles: u.profiles, activeProfile: u.activeProfile, isBeta: !!u.isBeta, isUltra: !!u.isUltra };
        }
      }
      return json({ status: 'approved', token: parsed.tvToken, user });
    }
    return json({ status: 'pending' });
  }

  return json({ error: 'Invalid action' }, 400);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

async function validateSession(env, token) {
  if (!token) return null;
  const data = await env.SYNC_KV.get(`session:${token}`);
  if (!data) return null;
  return JSON.parse(data);
}
