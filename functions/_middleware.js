export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();

  // DIAG — log every API request to help trace the 3 bugs
  if (path.startsWith('/api/')) {
    console.log('[Middleware] DIAG —', request.method, path,
      'SYNC_KV exists:', !!env?.SYNC_KV,
      'has Auth header:', !!request.headers.get('Authorization'));
  }

  // 🏴‍☠️ BlackFlag Honeypot / Protection
  // Block common vulnerability probes (WordPress, PHP, Env files, etc.)
  const suspiciousPaths = [
    '/wp-admin',
    '/wp-login.php',
    '/wp-content',
    '/wp-includes',
    '/xmlrpc.php',
    '/.env',
    '/.git',
    '/phpmyadmin',
    '/config.php',
    '/license.txt',
    '/readme.html'
  ];

  if (suspiciousPaths.some(p => path.includes(p))) {
    const cf = request.cf || {};
    const ip = request.headers.get('cf-connecting-ip') || 'Unknown';
    
    // Log the probe attempt to console (viewable in Wrangler logs)
    console.warn(`[SECURITY] Probe attempt from ${ip} (${cf.city || 'Unknown'}, ${cf.country || 'Unknown'}) on ${path}`);

    // Return a "threatening" but vague 403
    return new Response(
      `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>ACCESS DENIED</title>
          <style>
              body { background: #000; color: #ff3333; font-family: 'Courier New', monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
              .content { border: 2px solid #ff3333; padding: 2rem; max-width: 600px; box-shadow: 0 0 20px #ff3333; }
              h1 { font-size: 2.5rem; margin-bottom: 1rem; }
              p { font-size: 1.1rem; line-height: 1.5; color: #ff9999; }
              .ip { font-weight: bold; background: #330000; padding: 0.2rem 0.5rem; border-radius: 4px; }
              .warning { margin-top: 2rem; font-size: 0.8rem; color: #666; }
          </style>
      </head>
      <body>
          <div class="content">
              <h1>UNAUTHORIZED INTERCEPT</h1>
              <p>Your connection attempt has been logged and flagged for review.</p>
              <p>Origin IP: <span class="ip">${ip}</span></p>
              <p>Metadata recorded: City: ${cf.city || 'Unknown'}, Region: ${cf.region || 'Unknown'}, ASN: ${cf.asn || 'Unknown'}</p>
              <p style="margin-top: 1.5rem; border-top: 1px solid #330000; padding-top: 1.5rem;">
                  Searching for non-existent system paths is a violation of our terms.
                  Repeat attempts will result in a permanent ASN-level firewall block.
              </p>
              <div class="warning">System integrity maintained. Authorization hash: ${Math.random().toString(36).substring(2, 15).toUpperCase()}</div>
          </div>
      </body>
      </html>
      `,
      {
        status: 403,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }

  try {
    const response = await next();
    if (path.startsWith('/api/') && response.status >= 500) {
      await appendServerLog(env, request, 'error', `API ${response.status}: ${request.method} ${url.pathname}`, {
        status: response.status,
        statusText: response.statusText,
      });
    }
    return response;
  } catch (error) {
    await appendServerLog(env, request, 'error', `Unhandled API error: ${request.method} ${url.pathname}`, {
      message: error?.message,
      stack: error?.stack?.slice(0, 2000),
    });
    throw error;
  }
}

async function appendServerLog(env, request, level, message, data = null) {
  if (!env?.SYNC_KV) return;
  const url = new URL(request.url);
  if (url.pathname === '/api/logs') return;

  const entry = JSON.stringify({
    id: `server_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    session: 'server',
    level,
    url: request.url,
    userAgent: request.headers.get('User-Agent') || null,
    cfRay: request.headers.get('CF-Ray') || null,
    ip: request.headers.get('CF-Connecting-IP') || null,
    message,
    ...(data ? { data: JSON.stringify(data) } : {}),
  });

  // Use daily-bucketed keys to keep each KV value small (avoid O(n) read-modify-write on one giant key)
  const day = new Date().toISOString().slice(0, 10); // "2026-05-17"
  const key = `logs:server:${day}`;
  const existing = await env.SYNC_KV.get(key) || '';
  let lines = existing.split('\n').filter(l => l.trim());
  lines.push(entry);
  if (lines.length > 2000) lines = lines.slice(-2000);
  await env.SYNC_KV.put(key, lines.join('\n'), { expirationTtl: 7 * 24 * 3600 }); // auto-expire after 7 days
}
