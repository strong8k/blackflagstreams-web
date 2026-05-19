// Shared helpers for all BFS API functions

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Session, X-Admin-Token, X-TOTP',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export const TIER_LIMITS = {
  free:    { profiles: 1,   addons: 5,   iptvProviders: 0,   iptvChannels: 0,   sync: false },
  account: { profiles: 2,   addons: 999, iptvProviders: 1,   iptvChannels: 100,  sync: true  },
  premium: { profiles: 4,   addons: 999, iptvProviders: 1,   iptvChannels: 99999, sync: true },
  pro:     { profiles: 6,   addons: 999, iptvProviders: 5,   iptvChannels: 99999, sync: true },
  ultra:   { profiles: 999, addons: 999, iptvProviders: 999, iptvChannels: 99999, sync: true },
};

export function genId(prefix = '', len = 16) {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return prefix + Array.from(bytes, b => c[b % c.length]).join('');
}

export async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(salt + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function validateSession(env, authHeader) {
  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[BFS:Session] DIAG — no/invalid auth header');
    return null;
  }
  const token = authHeader.slice(7);
  let sessionRaw;
  try {
    sessionRaw = await env.SYNC_KV.get(`session:${token}`);
    console.log('[BFS:Session] DIAG — KV lookup for session:', token.slice(0, 8) + '...',
      'found:', !!sessionRaw, 'SYNC_KV binding exists:', !!env?.SYNC_KV);
  } catch (e) {
    console.error('[BFS:Session] DIAG — KV lookup THREW:', e.message, 'SYNC_KV exists:', !!env?.SYNC_KV);
    return null;
  }
  if (!sessionRaw) return null;
  try {
    return JSON.parse(sessionRaw); // { userId, created }
  } catch (e) {
    console.error('[BFS:Session] DIAG — JSON parse failed for session token:', token.slice(0, 8) + '...');
    return null;
  }
}

export async function validateAdminSession(env, request) {
  const session = request.headers.get('X-Admin-Session');
  if (!session) return false;
  const raw = await env.SYNC_KV.get(`admin_session:${session}`);
  return !!raw;
}

export async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) {
    console.warn('[BFS:Email] RESEND_API_KEY not set — skipping email send');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'BlackFlagStreams <bfs@comms.strong8k.stream>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[BFS:Email] Resend error:', res.status, err);
    throw new Error(`Email delivery failed (${res.status})`);
  }
}

export function verificationEmailHtml(code) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#e2e8f0;padding:2rem;border-radius:12px;border:1px solid #1e1e2e">
      <h2 style="color:#c41a1a;margin:0 0 0.5rem;font-size:1.4rem">⚓ BlackFlagStreams</h2>
      <p style="color:#94a3b8;margin:0 0 1.5rem;font-size:0.9rem">Your verification code</p>
      <div style="font-size:2.5rem;font-weight:bold;letter-spacing:0.4em;color:#fff;text-align:center;padding:1.25rem;background:#111827;border-radius:8px;margin:0 0 1.5rem;border:1px solid #374151">
        ${code}
      </div>
      <p style="color:#94a3b8;font-size:0.8rem;margin:0">Valid for 10 minutes. If you didn't request this, you can ignore this email.</p>
    </div>
  `;
}
