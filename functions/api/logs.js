// POST /api/logs  — write log entries (no auth — browser always can write)
// GET  /api/logs  — read logs (requires session token)
// POST /api/logs?clear=true — clear logs (requires session token)

const MAX_LINES = 10000;

function cors(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': typeof body === 'string' && body[0] === '{' ? 'application/json' : 'text/plain',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
      ...extra,
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return cors(null, 204);

  const url = new URL(request.url);
  const isClear = url.searchParams.get('clear') === 'true';

  // ── POST — write logs ─────────────────────────────────────────────────────
  if (request.method === 'POST' && !isClear) {
    const body = await request.text();
    if (!body.trim()) return cors('OK');
    if (body.length > 65_536) return cors('Payload too large', 413);

    console.log('[Logs] DIAG — POST received, body lines:', body.split('\n').filter(l => l.trim()).length,
      'SYNC_KV exists:', !!env?.SYNC_KV);

    // Optionally tag each line with userId from Bearer token
    let userId = null;
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '').trim();
    if (token) {
      const sessionRaw = await env.SYNC_KV.get(`session:${token}`);
      if (sessionRaw) {
        try { userId = JSON.parse(sessionRaw).userId; } catch {}
      }
    }

    const incoming = body.split('\n').filter(l => l.trim());
    const tagged = userId
      ? incoming.map(line => {
          try {
            const obj = JSON.parse(line);
            return JSON.stringify({ ...obj, userId });
          } catch { return line; }
        })
      : incoming;

    let existing;
    try {
      existing = (await env.SYNC_KV.get('logs') || '').split('\n').filter(l => l.trim());
      console.log('[Logs] DIAG — KV read OK, prev lines:', existing.length);
    } catch (e) {
      console.error('[Logs] DIAG — KV read THREW:', e.message);
      existing = [];
    }
    const combined = [...existing, ...tagged];
    const trimmed = combined.length > MAX_LINES ? combined.slice(-MAX_LINES) : combined;
    try {
      await env.SYNC_KV.put('logs', trimmed.join('\n'));
      console.log('[Logs] DIAG — KV write OK, total lines:', trimmed.length);
    } catch (e) {
      console.error('[Logs] DIAG — KV write THREW:', e.message);
    }
    return cors('OK');
  }

  // ── Auth gate for read / clear ────────────────────────────────────────────
  const session = await resolveSession(env, request);
  if (!session) return cors('Unauthorized', 401);

  // ── POST?clear=true — clear logs ──────────────────────────────────────────
  if (request.method === 'POST' && isClear) {
    await env.SYNC_KV.delete('logs');
    return cors('Cleared');
  }

  // ── GET — read logs ───────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const raw = (await env.SYNC_KV.get('logs') || '').split('\n').filter(l => l.trim());

    // Non-admin users only see their own entries
    const userData = await env.SYNC_KV.get(`user:${session.userId}`);
    const user = userData ? JSON.parse(userData) : null;
    const isAdmin = !!user?.isAdmin;

    const lines = isAdmin
      ? raw
      : raw.filter(line => {
          try { return JSON.parse(line).userId === session.userId; } catch { return true; }
        });

    return cors(lines.join('\n'), 200, { 'X-Log-Count': String(lines.length) });
  }

  return cors('Not Found', 404);
}

async function resolveSession(env, request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  const raw = await env.SYNC_KV.get(`session:${token}`);
  return raw ? JSON.parse(raw) : null;
}
