export async function onRequestPost(ctx) {
  const { env, request } = ctx;

  // Validate session from Bearer token
  const authHeader = request.headers.get('Authorization') || '';
  const bearerToken = authHeader.replace('Bearer ', '').trim();
  const sessionData = bearerToken ? await env.SYNC_KV.get(`session:${bearerToken}`) : null;
  const session = sessionData ? JSON.parse(sessionData) : null;

  if (!session) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Fetch full user record to verify tier
  const userData = await env.SYNC_KV.get(`user:${session.userId}`);
  const user = userData ? JSON.parse(userData) : null;
  if (!user) {
    return json({ error: 'Account not found' }, 404);
  }

  // Enforce Buccaneer tier (premium, pro, ultra)
  const isPaid = ['premium', 'pro', 'ultra'].includes(user.tier);
  if (!isPaid) {
    return json({ error: 'The Torrent Proxy is a premium feature reserved for Buccaneer tier and above.' }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const { infoHash, fileIdx } = body;

  if (!infoHash || !/^[a-fA-F0-9]{40}$/i.test(infoHash)) {
    return json({ error: 'Invalid infoHash' }, 400);
  }

  const SECRET   = env.TORRENT_PROXY_SECRET;
  const PROXY_URL = env.TORRENT_PROXY_URL;

  if (!SECRET || !PROXY_URL) {
    return json({ error: 'Torrent proxy not configured' }, 503);
  }

  const payload = {
    hash: infoHash.toLowerCase(),
    file: Number.isInteger(fileIdx) ? fileIdx : 0,
    uid: session.userId,
    exp: Math.floor(Date.now() / 1000) + 21600, // 6 hours
  };

  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sig = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  const token = `${payloadB64}.${sig}`;

  const streamUrl = `${PROXY_URL}/stream?hash=${payload.hash}&file=${payload.file}&token=${encodeURIComponent(token)}`;

  return json({ streamUrl });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
