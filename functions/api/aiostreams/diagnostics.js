// GET /api/aiostreams/diagnostics — Diagnostic report for the user's AIOStreams setup.
// Admin users can pass ?userId=X to check another user's state.
import { json, preflight, validateSession, validateAdminSession } from '../_shared.js';
import { getRecord, hasDebridKeys } from './_userdata.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let userId = session.userId;

  // Admin override: allow checking another user's state via ?userId=X
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get('userId');
  if (targetUserId) {
    const isAdmin = await validateAdminSession(env, request);
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    userId = targetUserId;
  }

  try {
    const record = await getRecord(env, userId);
    const hasDebrid = await hasDebridKeys(env, userId);
    const debridKeys = record.debridKeys || {};
    const aioAccount = record.aio || null;
    const settings = record.settings || {};

    // Determine debrid service statuses
    const services = {
      torbox: debridKeys.torbox ? { configured: true, status: 'key_stored' } : { configured: false, status: 'not_configured' },
      realdebrid: debridKeys.realdebrid ? { configured: true, status: 'key_stored' } : { configured: false, status: 'not_configured' },
      alldebrid: debridKeys.alldebrid ? { configured: true, status: 'key_stored' } : { configured: false, status: 'not_configured' },
    };

    // Errors / warnings
    const errors = [];
    const warnings = [];

    if (hasDebrid && !aioAccount) {
      errors.push('User has debrid keys but no AIOStreams account provisioned');
    }
    if (!hasDebrid && aioAccount) {
      warnings.push('AIOStreams account exists but no debrid keys are configured — streams will fail');
    }
    if (hasDebrid && aioAccount) {
      const provisionedServices = Object.keys(debridKeys).length;
      if (provisionedServices === 0) {
        warnings.push('AIOStreams provisioned but no debrid services have keys');
      }
    }

    return json({
      userId,
      aiostreams: {
        provisioned: !!aioAccount,
        uuid: aioAccount?.uuid || null,
        lastConfigSync: record.lastSync || null,
      },
      hasDebridKeys: hasDebrid,
      debridServices: services,
      config: {
        enabledResolutions: settings.enabledResolutions || ['2160p', '1080p', '720p', '480p'],
        languages: settings.languages || null,
        sizeGlobal: settings.sizeGlobal || null,
      },
      syncState: aioAccount?.uuid ? 'active' : hasDebrid ? 'pending_provision' : 'inactive',
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}