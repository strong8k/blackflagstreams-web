/* ═══════════════════════════════════════════════════════
   Auth & Sync — Cloudflare Workers API
   ═══════════════════════════════════════════════════════ */

const API_BASE = 'https://blackflagstream.pages.dev';

const LOG = (...args) => console.log('[BFS:Auth]', ...args);
const WARN = (...args) => console.warn('[BFS:Auth]', ...args);
const ERR = (...args) => console.error('[BFS:Auth]', ...args);

export function getApiBaseUrl() {
  const override = localStorage.getItem('bfs_api_base');
  if (override) { LOG('Using override API base:', override); return override; }
  // Auto-detect based on hostname — frontend can be on pages.dev or blackflagstreams.link,
  // but the Worker backend is always on blackflagstream.pages.dev
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  LOG('Detected hostname:', host, '→ API base:', API_BASE);
  return API_BASE;
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

export function getTierLimits(tier) {
  const limits = {
    free:     { profiles: 1, addons: 5,  iptvProviders: 0, iptvChannels: 0, sync: false },
    account:  { profiles: 2, addons: Infinity, iptvProviders: 1, iptvChannels: 100, sync: true },
    premium:  { profiles: 4, addons: Infinity, iptvProviders: 1, iptvChannels: Infinity, sync: true },
    pro:      { profiles: 6, addons: Infinity, iptvProviders: 5, iptvChannels: Infinity, sync: true },
    ultra:    { profiles: 10, addons: Infinity, iptvProviders: Infinity, iptvChannels: Infinity, sync: true },
  };
  return limits[tier] || limits.free;
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
export async function requestAdminOtp(adminToken) {
  LOG('requestAdminOtp: requesting OTP...');
  const res = await fetch(`${getApiBaseUrl()}/api/admin/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: adminToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `OTP request failed (${res.status})`);
  LOG('requestAdminOtp: OTP sent to admin email');
  return data; // { email: 'a***@...' }
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
    const res = await fetch(`${getApiBaseUrl()}/api/sync`, {
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
      const res = await fetch(`${getApiBaseUrl()}/api/sync`, {
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

export function checkSessionVersion() {
  const version = localStorage.getItem('bfs_session_version');
  return version === '2';
}

export { getToken as getAuthToken };
