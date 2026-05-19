/* ═══════════════════════════════════════════════════════
   Auth & Sync — Cloudflare Workers API
   ═══════════════════════════════════════════════════════ */

// API base: empty string = same-origin (when frontend and backend are on the same CF Pages project)
// Set VITE_API_BASE_URL in CF Pages env vars only when frontend and backend are on different domains.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

// openprox Worker URL — set VITE_PROXY_URL in CF Pages env vars
const OPENPROX_BASE = import.meta.env.VITE_PROXY_URL ?? 'https://openprox.michaelrobgrove.workers.dev';

const LOG = (...args) => console.log('[BFS:Auth]', ...args);
const WARN = (...args) => console.warn('[BFS:Auth]', ...args);
const ERR = (...args) => console.error('[BFS:Auth]', ...args);

export function getApiBaseUrl() {
  return API_BASE;
}

export function getWorkerProxyUrl() {
  return `${OPENPROX_BASE}/proxy`;
}

export function getWorkerProxyBase() {
  return OPENPROX_BASE;
}

export function getToken() {
  try {
    const raw = localStorage.getItem('bfs_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.token || null;
  } catch { return null; }
}

export function isLoggedIn() {
  return !!getToken();
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('bfs_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function getUserTier() {
  const user = getStoredUser();
  return user?.tier || 'free';
}


export async function checkSession() {
  const token = getToken();
  if (!token) { LOG('checkSession: no token'); return null; }
  LOG('checkSession: validating token...');
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/session`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    LOG('checkSession: status', res.status);
    if (!res.ok) {
      WARN('checkSession: session invalid, clearing local storage');
      localStorage.removeItem('bfs_session');
      localStorage.removeItem('bfs_user');
      return null;
    }
    const data = await res.json();
    LOG('checkSession: ok, tier:', data.user?.tier);
    if (data.user) localStorage.setItem('bfs_user', JSON.stringify(data.user));
    return data;
  } catch (e) {
    ERR('checkSession: fetch error:', e.message);
    return getStoredUser() ? { user: getStoredUser() } : null;
  }
}

export async function register(email, password) {
  LOG('register:', email);
  const res = await fetch(`${getApiBaseUrl()}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Register failed (${res.status})`);
  LOG('register: ok, verification email sent');
  return data;
}

export async function verifyEmail(email, code) {
  LOG('verifyEmail:', email, 'code:', code);
  const res = await fetch(`${getApiBaseUrl()}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Verification failed (${res.status})`);
  if (data.token) {
    localStorage.setItem('bfs_session', JSON.stringify({ token: data.token }));
    localStorage.setItem('bfs_session_version', '2');
    if (data.user) localStorage.setItem('bfs_user', JSON.stringify(data.user));
  }
  LOG('verifyEmail: ok, tier:', data.user?.tier);
  return data;
}

export async function login(email, password) {
  LOG('login:', email);
  const res = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Login failed (${res.status})`);
  if (data.token) {
    localStorage.setItem('bfs_session', JSON.stringify({ token: data.token }));
    localStorage.setItem('bfs_session_version', '2');
    if (data.user) localStorage.setItem('bfs_user', JSON.stringify(data.user));
  }
  LOG('login: ok, tier:', data.user?.tier);
  return data;
}

export async function resendCode(email) {
  LOG('resendCode:', email);
  const res = await fetch(`${getApiBaseUrl()}/api/auth/resend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Resend failed');
  return data;
}

// ── Admin 2FA ──
// Returns { email } for normal OTP flow, or { session, bypassed: true } when
// ADMIN_2FA_ENABLED=false is set on the backend — caller checks .bypassed.
export async function requestAdminOtp(adminToken) {
  LOG('requestAdminOtp: requesting OTP...');
  const res = await fetch(`${getApiBaseUrl()}/api/admin/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: adminToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `OTP request failed (${res.status})`);
  if (data.bypassed) {
    LOG('requestAdminOtp: 2FA disabled via env — session returned directly');
  } else {
    LOG('requestAdminOtp: OTP sent to admin email:', data.email);
  }
  return data; // { email } | { session, bypassed: true }
}

export async function verifyAdminOtp(adminToken, otp) {
  LOG('verifyAdminOtp: verifying OTP...');
  const res = await fetch(`${getApiBaseUrl()}/api/admin/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: adminToken, otp }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `OTP verification failed (${res.status})`);
  LOG('verifyAdminOtp: admin authenticated');
  return data; // { adminSession: '...' }
}

export async function pullSyncData() {
  const token = getToken();
  if (!token) return null;
  LOG('pullSyncData: fetching...');
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/sync?action=pull`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) { WARN('pullSyncData: status', res.status); return null; }
    LOG('pullSyncData: ok');
    return res.json();
  } catch (e) { ERR('pullSyncData error:', e.message); return null; }
}

let pushTimer = null;
export function debouncedPush(data) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const token = getToken();
    if (!token) return;
    LOG('debouncedPush: syncing...');
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sync?action=push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) WARN('debouncedPush: status', res.status);
      else LOG('debouncedPush: ok');
    } catch (e) { ERR('debouncedPush error:', e.message); }
  }, 2000);
}

export async function submitBetaApplication(formData) {
  LOG('submitBetaApplication:', formData.email);
  const res = await fetch(`${getApiBaseUrl()}/api/beta-apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Submission failed (${res.status})`);
  LOG('submitBetaApplication: ok');
  return data;
}

// ── Device Linking ──
export async function generateLinkCode() {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  LOG('generateLinkCode: requesting...');
  const res = await fetch(`${getApiBaseUrl()}/api/auth/link/generate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Link generation failed');
  LOG('generateLinkCode:', data.code);
  return data; // { code, expiresIn }
}

export async function approveLinkCode(code) {
  LOG('approveLinkCode:', code);
  const res = await fetch(`${getApiBaseUrl()}/api/auth/link/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Link approval failed');
  if (data.token) {
    localStorage.setItem('bfs_session', JSON.stringify({ token: data.token }));
    localStorage.setItem('bfs_session_version', '2');
    if (data.user) localStorage.setItem('bfs_user', JSON.stringify(data.user));
  }
  LOG('approveLinkCode: ok');
  return data;
}

export function checkSessionVersion() {
  const version = localStorage.getItem('bfs_session_version');
  return version === '2';
}

export { getToken as getAuthToken };
