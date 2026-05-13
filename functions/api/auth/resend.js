// POST /api/auth/resend
// Resends verification code for a pending registration
import { json, preflight, sendEmail, verificationEmailHtml } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { email } = body;
  if (!email) return json({ error: 'Email required' }, 400);

  const emailNorm = email.toLowerCase().trim();
  const pendingRaw = await env.SYNC_KV.get(`pending:${emailNorm}`);
  if (!pendingRaw) return json({ error: 'No pending registration found. Please register again.' }, 404);

  const pending = JSON.parse(pendingRaw);
  // Generate fresh code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  pending.code = code;

  await env.SYNC_KV.put(`pending:${emailNorm}`, JSON.stringify(pending), { expirationTtl: 600 });

  try {
    await sendEmail(env, emailNorm, 'Your BlackFlagStreams Verification Code', verificationEmailHtml(code));
  } catch (e) {
    return json({ error: 'Failed to send email. Try again shortly.' }, 500);
  }

  return json({ success: true });
}
