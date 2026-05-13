// POST /api/admin/verify-otp
// Verifies TOTP code from authenticator app, issues admin session
import { json, preflight, genId } from '../_shared.js';

function base32Decode(encoded) {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const output = [];
  for (const char of encoded.replace(/=+$/, '').toUpperCase()) {
    const idx = CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
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
  for (const offset of [-1, 0, 1]) {
    if (await generateTOTP(secret, now + offset * 30) === token) return true;
  }
  return false;
}

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!env.ADMIN_TOKEN) return json({ error: 'Admin not configured' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { token, otp } = body;
  if (!token || token !== env.ADMIN_TOKEN) return json({ error: 'Invalid admin token' }, 401);
  if (!otp) return json({ error: 'OTP code required' }, 400);

  const secret = await env.SYNC_KV.get('admin:2fa_secret');
  if (!secret) return json({ error: '2FA not configured. Use /request-otp to get access.' }, 400);

  const valid = await verifyTOTP(secret, String(otp).trim());
  if (!valid) return json({ error: 'Invalid or expired code. Check your authenticator app.' }, 401);

  const adminSession = genId('admin_', 32);
  await env.SYNC_KV.put(`admin_session:${adminSession}`, JSON.stringify({ created: Date.now() }), { expirationTtl: 8 * 3600 });

  return json({ adminSession });
}
