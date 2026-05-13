// POST /api/auth/link/request — unauthenticated
// TV calls this to get a pairing code. No session required.
import { json, preflight } from '../../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestPost(context) {
  const { env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);

  // 6-digit numeric code (100000–999999)
  const code = String(100000 + Math.floor(Math.random() * 900000));

  await env.SYNC_KV.put(
    `link_pending:${code}`,
    JSON.stringify({ status: 'pending', created: Date.now() }),
    { expirationTtl: 600 }, // 10 minutes
  );

  return json({ code, expiresIn: 600 });
}
