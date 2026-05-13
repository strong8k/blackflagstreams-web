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
  let id = prefix;
  for (let i = 0; i < len; i++) id += c[Math.floor(Math.random() * c.length)];
  return id;
}

export async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(salt + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function validateSession(env, authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const sessionRaw = await env.SYNC_KV.get(`session:${token}`);
  if (!sessionRaw) return null;
  return JSON.parse(sessionRaw); // { userId, created }
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
