// GET /api/auth/link/poll?code=XXXXXX — TV polls this until approved
import { json, preflight } from '../../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  const code = new URL(request.url).searchParams.get('code');
  if (!code) return json({ error: 'Missing code' }, 400);

  const raw = await env.SYNC_KV.get(`link_pending:${code}`);
  if (!raw) return json({ error: 'Code expired or invalid' }, 404);

  const data = JSON.parse(raw);

  if (data.status === 'approved') {
    // Clean up immediately after TV reads it
    await env.SYNC_KV.delete(`link_pending:${code}`);
    return json({ done: true, token: data.token, user: data.user });
  }

  return json({ done: false });
}
