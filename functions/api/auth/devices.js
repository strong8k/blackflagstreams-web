// GET  /api/auth/devices — list current user's registered devices
// DELETE /api/auth/devices — remove a device by id { deviceId }
import { json, preflight, validateSession } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const raw = await env.SYNC_KV.get(`user:${session.userId}`);
  if (!raw) return json({ error: 'User not found' }, 404);

  const user = JSON.parse(raw);
  const devices = (user.devices || []).map(d => ({
    id: d.id,
    name: d.name,
    userAgent: d.userAgent,
    created: d.created,
    lastSeen: d.lastSeen,
  }));

  return json({ devices });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { deviceId } = body;
  if (!deviceId) return json({ error: 'deviceId required' }, 400);

  const raw = await env.SYNC_KV.get(`user:${session.userId}`);
  if (!raw) return json({ error: 'User not found' }, 404);

  const user = JSON.parse(raw);
  const before = (user.devices || []).length;
  user.devices = (user.devices || []).filter(d => d.id !== deviceId);

  if (user.devices.length === before) return json({ error: 'Device not found' }, 404);

  await env.SYNC_KV.put(`user:${user.id}`, JSON.stringify(user));
  return json({ success: true, devices: user.devices });
}
