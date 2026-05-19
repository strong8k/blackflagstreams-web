// GET /api/admin/users?q=<search>
// POST /api/admin/users — update user (tier, email, password reset, ban, beta, ultra, billing)
import { json, preflight, validateAdminSession, hashPassword, genId } from '../_shared.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!await validateAdminSession(env, request)) return json({ error: 'Unauthorized' }, 401);

  const q = new URL(request.url).searchParams.get('q') || '';

  try {
    const listed = await env.SYNC_KV.list({ prefix: 'user:uid_', limit: 500 });
    const userDatas = await Promise.all(
      listed.keys.map(k => env.SYNC_KV.get(k.name))
    );

    let users = userDatas
      .filter(Boolean)
      .map(raw => {
        try { return JSON.parse(raw); } catch { return null; }
      })
      .filter(Boolean);

    if (q) {
      const lq = q.toLowerCase();
      users = users.filter(u =>
        u.email?.includes(lq) ||
        u.name?.toLowerCase().includes(lq) ||
        u.id?.includes(lq)
      );
    }

    return json({
      users: users.map(u => ({
        id: u.id, email: u.email, name: u.name,
        tier: u.isUltra ? 'ultra' : (u.isBeta ? 'premium' : u.tier),
        isBeta: !!u.isBeta, isUltra: !!u.isUltra, banned: !!u.banned,
        billingPrice: u.billingPrice || null,
        created: u.created,
        devices: (u.devices || []).map(d => ({ id: d.id, name: d.name, userAgent: d.userAgent, created: d.created, lastSeen: d.lastSeen })),
      })),
    });
  } catch (e) {
    return json({ users: [] });
  }
}

// POST /api/admin/users — update user
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) return json({ error: 'KV not configured' }, 503);
  if (!await validateAdminSession(env, request)) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { userId, tier, email, newPassword, isBeta, isUltra, banned, billingPrice, sendPasswordEmail, clearDevices, removeDeviceId } = body;
  if (!userId) return json({ error: 'userId required' }, 400);

  const raw = await env.SYNC_KV.get(`user:${userId}`);
  if (!raw) return json({ error: 'User not found' }, 404);

  const user = JSON.parse(raw);
  const oldEmail = user.email;

  if (tier !== undefined && tier) user.tier = tier;
  if (isBeta !== undefined) user.isBeta = isBeta;
  if (isUltra !== undefined) user.isUltra = isUltra;
  if (banned !== undefined) user.banned = banned;
  if (billingPrice !== undefined) user.billingPrice = billingPrice || null;
  if (clearDevices) user.devices = [];
  if (removeDeviceId) user.devices = (user.devices || []).filter(d => d.id !== removeDeviceId);

  // Email change: update both user:{id} and user:{email} KV keys
  if (email && email !== oldEmail) {
    const emailNorm = email.toLowerCase().trim();
    const existingUserId = await env.SYNC_KV.get(`user:${emailNorm}`);
    if (existingUserId && existingUserId !== userId) {
      return json({ error: 'Email already in use by another account' }, 409);
    }
    user.email = emailNorm;
  }

  // Password reset
  let passwordChanged = false;
  if (newPassword) {
    const salt = genId('', 16);
    user.salt = salt;
    user.passHash = await hashPassword(newPassword, salt);
    passwordChanged = true;
  }

  await env.SYNC_KV.put(`user:${userId}`, JSON.stringify(user));

  // Update email index if changed
  if (email && email !== oldEmail) {
    await env.SYNC_KV.delete(`user:${oldEmail}`);
    await env.SYNC_KV.put(`user:${user.email}`, userId);
  }

  // Send password reset email via Resend
  if (sendPasswordEmail && newPassword && env.RESEND_API_KEY) {
    try {
      const { sendEmail } = await import('../_shared.js');
      await sendEmail(env, user.email, 'BlackFlagStreams — Password Reset',
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#e2e8f0;padding:2rem;border-radius:12px;border:1px solid #1e1e2e">
          <h2 style="color:#c41a1a;margin:0 0 0.5rem;font-size:1.4rem">⚓ BlackFlagStreams</h2>
          <p style="color:#94a3b8;margin:0 0 1rem;font-size:0.9rem">Your password has been reset by an administrator.</p>
          <div style="background:#111827;border:1px solid #374151;border-radius:8px;padding:1.25rem;margin:0 0 1.5rem">
            <p style="color:#e2e8f0;margin:0 0 0.5rem"><strong>New Password:</strong></p>
            <p style="font-size:1.3rem;font-weight:bold;color:#fff;margin:0;letter-spacing:0.05em">${newPassword}</p>
          </div>
          <p style="color:#94a3b8;font-size:0.8rem;margin:0">Please change your password after logging in.</p>
        </div>`
      );
    } catch (e) {
      console.warn('[BFS:Admin] Failed to send password email:', e.message);
    }
  }

  const result = {
    success: true,
    changes: {
      ...(tier && { tier }),
      ...(email && { email: user.email }),
      ...(passwordChanged && { passwordReset: true }),
      ...(isBeta !== undefined && { isBeta }),
      ...(isUltra !== undefined && { isUltra }),
      ...(banned !== undefined && { banned }),
      ...(billingPrice !== undefined && { billingPrice: user.billingPrice }),
    }
  };

  return json(result);
}
