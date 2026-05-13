export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();

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

  // Continue to the next middleware or asset
  return next();
}
