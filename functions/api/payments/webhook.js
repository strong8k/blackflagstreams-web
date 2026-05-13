/* ═══════════════════════════════════════════════════════
   PayPal Webhook Handler
   POST /api/payments/webhook

   Required CF env vars:
     PAYPAL_CLIENT_ID      — From developer.paypal.com
     PAYPAL_CLIENT_SECRET  — From developer.paypal.com
     PAYPAL_WEBHOOK_ID     — Set after registering webhook in PayPal dashboard
     PAYPAL_MODE           — "sandbox" or "live"
     SYNC_KV               — Cloudflare KV binding (already used by auth.js)

   Register this URL in PayPal developer dashboard:
     https://blackflagstream.pages.dev/api/payments/webhook

   Subscribe to these events:
     PAYMENT.CAPTURE.COMPLETED
     PAYMENT.SALE.COMPLETED
     BILLING.SUBSCRIPTION.ACTIVATED
     BILLING.SUBSCRIPTION.CANCELLED
     BILLING.SUBSCRIPTION.EXPIRED
     BILLING.SUBSCRIPTION.SUSPENDED
   ═══════════════════════════════════════════════════════ */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Verify PayPal webhook signature using PayPal's verification API
async function verifyPayPalWebhook(env, request, body) {
  const PAYPAL_BASE = env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  // Get access token
  const tokenRes = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`),
    },
    body: 'grant_type=client_credentials',
  });
  if (!tokenRes.ok) return false;
  const { access_token } = await tokenRes.json();

  // Verify webhook signature
  const verifyRes = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({
      auth_algo:         request.headers.get('PAYPAL-AUTH-ALGO'),
      cert_url:          request.headers.get('PAYPAL-CERT-URL'),
      transmission_id:   request.headers.get('PAYPAL-TRANSMISSION-ID'),
      transmission_sig:  request.headers.get('PAYPAL-TRANSMISSION-SIG'),
      transmission_time: request.headers.get('PAYPAL-TRANSMISSION-TIME'),
      webhook_id:        env.PAYPAL_WEBHOOK_ID,
      webhook_event:     JSON.parse(body),
    }),
  });
  if (!verifyRes.ok) return false;
  const { verification_status } = await verifyRes.json();
  return verification_status === 'SUCCESS';
}

async function upgradeUser(env, userId, tier = 'pro') {
  const raw = await env.SYNC_KV.get(`user:${userId}`);
  if (!raw) return false;
  const user = JSON.parse(raw);
  user.tier = tier;
  user.upgradedAt = Date.now();
  await env.SYNC_KV.put(`user:${userId}`, JSON.stringify(user));
  return true;
}

async function downgradeUser(env, userId) {
  const raw = await env.SYNC_KV.get(`user:${userId}`);
  if (!raw) return false;
  const user = JSON.parse(raw);
  user.tier = 'account';
  user.downgradedAt = Date.now();
  await env.SYNC_KV.put(`user:${userId}`, JSON.stringify(user));
  return true;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_WEBHOOK_ID) {
    return json({ error: 'PayPal env vars not configured' }, 503);
  }

  const body = await request.text();

  // Verify signature (skip in dev if PAYPAL_MODE not set)
  if (env.PAYPAL_MODE) {
    const valid = await verifyPayPalWebhook(env, request, body);
    if (!valid) return json({ error: 'Invalid webhook signature' }, 401);
  }

  const event = JSON.parse(body);
  const eventType = event.event_type;
  const resource = event.resource || {};

  // Extract our userId and purchasedTier from custom_id (set when creating the PayPal order)
  const rawCustomId = resource.custom_id || resource.custom || '';
  const [userId, purchasedTier] = rawCustomId.includes('|')
    ? rawCustomId.split('|')
    : [rawCustomId, 'pro'];

  if (!userId || userId === '') return json({ ok: true, note: 'No userId in payload — ignoring' });

  console.log(`PayPal webhook: ${eventType} for user ${userId}`);

  switch (eventType) {
    case 'PAYMENT.CAPTURE.COMPLETED':
    case 'PAYMENT.SALE.COMPLETED':
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
      await upgradeUser(env, userId, purchasedTier || 'pro');
      break;

    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.EXPIRED':
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
      await downgradeUser(env, userId);
      break;

    default:
      // Unhandled event — return 200 so PayPal doesn't retry
      break;
  }

  return json({ ok: true });
}
