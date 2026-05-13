// POST /api/beta-apply — submit beta access request
import { json, preflight, validateSession } from './_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { email, reason } = body;

  // Authenticated path — mark request against user account
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (session) {
    const userRaw = await env.SYNC_KV.get(`user:${session.userId}`);
    if (!userRaw) return json({ error: 'User not found' }, 404);
    const user = JSON.parse(userRaw);

    if (user.isBeta) return json({ error: 'Already a beta member.' }, 409);

    user.betaRequest = { requested: Date.now(), reason: reason || '' };
    await env.SYNC_KV.put(`user:${session.userId}`, JSON.stringify(user));

    // Index the request so admin can list them
    await env.SYNC_KV.put(`beta_request:${session.userId}`, JSON.stringify({
      userId: session.userId,
      email: user.email,
      name: user.name,
      reason: reason || '',
      requested: Date.now(),
    }));

    return json({ success: true, message: 'Beta access request submitted.' });
  }

  // Unauthenticated path — store by email
  if (!email) return json({ error: 'email required for unauthenticated requests' }, 400);

  const existing = await env.SYNC_KV.get(`beta_request_email:${email.toLowerCase()}`);
  if (existing) return json({ error: 'A request for this email already exists.' }, 409);

  await env.SYNC_KV.put(`beta_request_email:${email.toLowerCase()}`, JSON.stringify({
    email: email.toLowerCase(),
    reason: reason || '',
    requested: Date.now(),
  }), { expirationTtl: 30 * 24 * 3600 }); // 30 days

  return json({ success: true, message: 'Beta access request submitted.' });
}
