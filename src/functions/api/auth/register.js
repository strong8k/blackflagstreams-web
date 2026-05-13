// POST /api/auth/register
// Creates a pending account and sends email verification code via Resend
import { json, preflight, genId, hashPassword, sendEmail, verificationEmailHtml } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { email, password, name } = body;
  if (!email || !password) return json({ error: 'Email and password required' }, 400);

  const emailNorm = email.toLowerCase().trim();

  // Check existing account
  const existingUid = await env.SYNC_KV.get(`user:${emailNorm}`);
  if (existingUid) {
    const userData = await env.SYNC_KV.get(`user:${existingUid}`);
    if (userData) return json({ error: 'Account already exists. Try logging in.' }, 409);
    await env.SYNC_KV.delete(`user:${emailNorm}`); // clean orphan index
  }

  // Password strength
  if (
    password.length < 14 ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password) ||
    !/[A-Z]/.test(password)
  ) {
    return json({ error: 'Password must be at least 14 characters and include a number, symbol, and uppercase letter.' }, 400);
  }

  const salt = genId('s_', 16);
  const passHash = await hashPassword(password, salt);
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  await env.SYNC_KV.put(`pending:${emailNorm}`, JSON.stringify({
    email: emailNorm,
    name: name || emailNorm.split('@')[0],
    salt, passHash, code,
    created: Date.now(),
  }), { expirationTtl: 600 }); // 10 min

  try {
    await sendEmail(env, emailNorm, 'Your BlackFlagStreams Verification Code', verificationEmailHtml(code));
  } catch (e) {
    console.error('[BFS:Register] Email failed:', e.message);
    // Don't fail — code is still in KV, dev/test without Resend still works
  }

  return json({ success: true });
}
