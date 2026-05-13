/* ═══════════════════════════════════════════════════════
   PayPal Checkout Order Creation
   POST /api/payments/checkout  { tier }

   Creates a PayPal order and returns the approval URL.
   The client redirects the user to that URL to pay.
   After payment, PayPal redirects to /api/payments/success.
   ═══════════════════════════════════════════════════════ */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const TIER_PRICES = {
  premium: { amount: '10.00', currency: 'USD', description: 'BlackFlagStreams Buccaneer — 1 Year' },
  pro:     { amount: '20.00', currency: 'USD', description: 'BlackFlagStreams First Mate — 1 Year' },
};

async function getPayPalToken(env) {
  const PAYPAL_BASE = env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('Failed to get PayPal token');
  const data = await res.json();
  return { token: data.access_token, base: PAYPAL_BASE };
}

async function validateSession(env, token) {
  if (!token) return null;
  const raw = await env.SYNC_KV.get(`session:${token}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!env.PAYPAL_CLIENT_ID) return json({ error: 'PayPal not configured' }, 503);

  const body = await request.json().catch(() => ({}));
  const { tier = 'pro' } = body;

  // Auth
  const authHeader = request.headers.get('Authorization') || '';
  const sessionToken = authHeader.replace('Bearer ', '').trim() || body.token;
  const session = await validateSession(env, sessionToken);
  if (!session) return json({ error: 'Not authenticated' }, 401);

  const price = TIER_PRICES[tier];
  if (!price) return json({ error: 'Invalid tier' }, 400);

  const origin = new URL(request.url).origin;

  try {
    const { token: ppToken, base } = await getPayPalToken(env);

    const orderRes = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ppToken}`,
        'PayPal-Request-Id': `bfs-${session.userId}-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: price.currency, value: price.amount },
          description: price.description,
          custom_id: `${session.userId}|${tier}`, // passed back in webhook
        }],
        application_context: {
          brand_name: 'BlackFlagStreams',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: `${origin}/upgrade/success`,
          cancel_url: `${origin}/upgrade/cancel`,
        },
      }),
    });

    if (!orderRes.ok) {
      const err = await orderRes.text();
      return json({ error: 'PayPal order failed', detail: err }, 502);
    }

    const order = await orderRes.json();
    const approvalUrl = order.links?.find(l => l.rel === 'approve')?.href;
    if (!approvalUrl) return json({ error: 'No approval URL from PayPal' }, 502);

    return json({ checkoutUrl: approvalUrl, orderId: order.id });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
