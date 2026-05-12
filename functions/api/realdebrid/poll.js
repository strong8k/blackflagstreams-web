// POST /api/realdebrid/poll — Poll for Real-Debrid device code authorization
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const clientId = env.RD_CLIENT_ID;
  const clientSecret = env.RD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return json({ error: 'Real-Debrid not configured' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { device_code } = body;
  if (!device_code) return json({ error: 'Missing device_code' }, 400);

  try {
    const res = await fetch(
      `https://api.real-debrid.com/oauth/v2/device/credentials?client_id=${encodeURIComponent(clientId)}&code=${encodeURIComponent(device_code)}`,
      { method: 'GET' }
    );

    const data = await res.json();
    // 400 = still waiting, 200 = authorized
    if (!res.ok) {
      if (res.status === 400 || res.status === 403) {
        return json({ done: false, waiting: true });
      }
      return json({ error: data.error || 'RD poll failed' }, 502);
    }

    // Exchange device credentials for an OAuth access_token
    const tokenRes = await fetch('https://api.real-debrid.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: data.client_id,
        client_secret: data.client_secret,
        code: device_code,
        grant_type: 'http://oauth.net/grant_type/device/1.0',
      }).toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return json({ error: tokenData.error || 'Failed to get RD access token' }, 502);
    }

    await env.SYNC_KV.put(`service:realdebrid:${session.userId}`, JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      client_id: data.client_id,
      client_secret: data.client_secret,
      connected: true,
      created: Date.now(),
    }));
    await env.SYNC_KV.delete(`service:rd_pending:${session.userId}`);

    return json({ done: true });
  } catch (e) {
    return json({ error: `RD poll error: ${e.message}` }, 502);
  }
}
