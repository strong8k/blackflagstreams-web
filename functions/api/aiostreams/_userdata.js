// AIOStreams user management — create-user-once model with Basic auth.
// Each BFS user gets a stored AIOStreams account (uuid + password) provisioned
// on first debrid key connection. Config is synced on every key change.

const AIOSTREAMS_BASE = 'https://aio.managedservers.click';

// Services BFS manages debrid keys for (all use credentials.apiKey)
const DEBRID_SERVICE_IDS = ['torbox', 'realdebrid', 'alldebrid'];

// ── KV helpers ────────────────────────────────────────────────────────────────

export async function getRecord(env, userId) {
  const raw = await env.SYNC_KV.get(`aiostreams:${userId}`);
  return raw ? JSON.parse(raw) : {};
}

export async function putRecord(env, userId, record) {
  await env.SYNC_KV.put(`aiostreams:${userId}`, JSON.stringify(record));
}

// ── Config builder ────────────────────────────────────────────────────────────

/**
 * Build the flat AIOStreams UserData object for a user.
 * Clones the default profile from KV, injects debrid keys, merges settings.
 */
export async function buildConfig(env, userId) {
  const defaultRaw = await env.SYNC_KV.get('admin:aiostreams_default_profile');
  if (!defaultRaw) throw new Error('AIOStreams default profile not configured');
  // Parse+stringify = deep clone with no extra dep
  const config = JSON.parse(defaultRaw);

  const record = await getRecord(env, userId);
  const debridKeys = record.debridKeys || {};

  // Inject debrid credentials — enable services that have a key, disable the rest
  if (Array.isArray(config.services)) {
    for (const service of config.services) {
      if (DEBRID_SERVICE_IDS.includes(service.id)) {
        if (debridKeys[service.id]) {
          service.enabled = true;
          service.credentials = { apiKey: debridKeys[service.id] };
        } else {
          service.enabled = false;
          service.credentials = {};
        }
      }
    }
  }

  // Merge per-user settings overrides
  const settings = record.settings || {};
  // Translate enabledResolutions (what UI stores) → excludedResolutions (what AIOStreams expects)
  if (settings.enabledResolutions && Array.isArray(settings.enabledResolutions)) {
    const ALL_RESOLUTIONS = ['2160p', '1440p', '1080p', '720p', '576p', '480p', '360p', '240p', '144p', 'Unknown'];
    config.excludedResolutions = ALL_RESOLUTIONS.filter(r => !settings.enabledResolutions.includes(r));
  }
  if (settings.languages) {
    if (settings.languages.included)   config.includedLanguages   = settings.languages.included;
    if (settings.languages.preferred)  config.preferredLanguages  = settings.languages.preferred;
    if (settings.languages.required)   config.requiredLanguages   = settings.languages.required;
  }
  if (settings.sizeGlobal) {
    config.size = config.size || {};
    config.size.global = settings.sizeGlobal;
  }

  // Inject API keys from environment
  if (env.TMDB_API_KEY)  config.tmdbApiKey        = env.TMDB_API_KEY;
  if (env.RPDB_API_KEY)  config.openposterdbApiKey = env.RPDB_API_KEY;

  return config;
}

// ── AIOStreams account lifecycle ──────────────────────────────────────────────

/**
 * Create a new AIOStreams user account and store credentials in KV.
 * Only call when user has ≥1 debrid key (AIOStreams rejects zero-service configs).
 */
export async function provisionUser(env, userId) {
  const config   = await buildConfig(env, userId);
  const password = crypto.randomUUID().replace(/-/g, ''); // 32 hex chars, ≥6

  const res = await fetch(`${AIOSTREAMS_BASE}/api/v1/user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, password }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`AIOStreams provision failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const { uuid, encryptedPassword } = data.data;

  const record = await getRecord(env, userId);
  record.aio = { uuid, password, encryptedPassword };
  await putRecord(env, userId, record);

  return { uuid, password, encryptedPassword };
}

/**
 * Sync user's AIOStreams config: PUT if account exists, provision if not.
 * No-op if user has no debrid keys (deprovisioning is handled by removeUserDebridKey).
 */
export async function syncUser(env, userId) {
  const record     = await getRecord(env, userId);
  const debridKeys = record.debridKeys || {};

  if (Object.keys(debridKeys).length === 0) {
    if (record.aio?.uuid) await deprovisionUser(env, userId);
    return;
  }

  const config = await buildConfig(env, userId);

  if (record.aio?.uuid) {
    const res = await fetch(`${AIOSTREAMS_BASE}/api/v1/user`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: record.aio.uuid, password: record.aio.password, config }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`AIOStreams sync failed (${res.status}): ${err.slice(0, 200)}`);
    }
  } else {
    await provisionUser(env, userId);
  }
}

/**
 * Delete the user's AIOStreams account and clear the aio record from KV.
 * Best-effort — KV is always cleaned up even if the DELETE call fails.
 */
export async function deprovisionUser(env, userId) {
  const record = await getRecord(env, userId);
  if (!record.aio?.uuid) return;

  try {
    await fetch(`${AIOSTREAMS_BASE}/api/v1/user`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: record.aio.uuid, password: record.aio.password }),
    });
  } catch { /* best-effort */ }

  delete record.aio;
  await putRecord(env, userId, record);
}

/**
 * Return Basic auth credentials for the user's AIOStreams account.
 * Lazily provisions if the user has debrid keys but no account yet
 * (migration path for users who connected before this refactor).
 * Returns null if the user has no debrid keys.
 */
export async function getAioAuth(env, userId) {
  const record = await getRecord(env, userId);

  // Run legacy key migration BEFORE checking debridKeys — ensures TorBox/AllDebrid
  // keys stored in old service:* KV keys are picked up (they'd otherwise be invisible).
  await hasDebridKeys(env, userId);

  // Re-read after migration
  const updated = await getRecord(env, userId);

  // If migration added new keys and user already has an AIOStreams account,
  // sync the updated config (with newly-migrated keys) to AIOStreams.
  const oldKeyCount = Object.keys(record.debridKeys || {}).length;
  const newKeyCount = Object.keys(updated.debridKeys || {}).length;
  if (newKeyCount > oldKeyCount && updated.aio?.uuid) {
    try {
      await syncUser(env, userId);
      console.log(`[BFS:AIO] Auto-synced after legacy migration for ${userId}: ${oldKeyCount} → ${newKeyCount} keys`);
    } catch (e) {
      console.error(`[BFS:AIO] Auto-sync after migration failed for ${userId}:`, e.message);
    }
  }

  // Re-read again in case syncUser modified the record
  const final = await getRecord(env, userId);

  if (final.aio?.uuid) {
    const { uuid, password, encryptedPassword } = final.aio;
    return { uuid, password, encryptedPassword, basic: btoa(`${uuid}:${password}`) };
  }

  const debridKeys = final.debridKeys || {};
  if (Object.keys(debridKeys).length > 0) {
    const aio = await provisionUser(env, userId);
    return { ...aio, basic: btoa(`${aio.uuid}:${aio.password}`) };
  }

  return null;
}

// ── Debrid key management ─────────────────────────────────────────────────────

/**
 * Store a debrid API key and sync the AIOStreams config.
 */
export async function setUserDebridKey(env, userId, serviceId, apiKey) {
  const record = await getRecord(env, userId);
  if (!record.debridKeys) record.debridKeys = {};
  record.debridKeys[serviceId] = apiKey;
  await putRecord(env, userId, record);
  await syncUser(env, userId);
}

/**
 * Remove a debrid API key, then sync or deprovision as appropriate.
 */
export async function removeUserDebridKey(env, userId, serviceId) {
  const record = await getRecord(env, userId);
  if (record.debridKeys) delete record.debridKeys[serviceId];
  await putRecord(env, userId, record);

  const remaining = Object.keys(record.debridKeys || {}).length;
  if (remaining > 0) {
    await syncUser(env, userId);
  } else if (record.aio?.uuid) {
    await deprovisionUser(env, userId);
  }
}

/**
 * Check if user has any debrid keys stored.
 * Also migrates legacy per-service KV keys into the aiostreams record.
 */
export async function hasDebridKeys(env, userId) {
  const record = await getRecord(env, userId);
  if (record.debridKeys && Object.keys(record.debridKeys).length > 0) return true;

  // Migrate legacy service:* KV keys on first access
  const [tb, rd, ad] = await Promise.all([
    env.SYNC_KV.get(`service:torbox:${userId}`),
    env.SYNC_KV.get(`service:realdebrid:${userId}`),
    env.SYNC_KV.get(`service:alldebrid:${userId}`),
  ]);

  const migrated = {};
  if (tb) { const p = JSON.parse(tb); if (p.apiKey)        migrated.torbox      = p.apiKey; }
  if (rd) { const p = JSON.parse(rd); if (p.access_token)  migrated.realdebrid  = p.access_token; }
  if (ad) { const p = JSON.parse(ad); if (p.apikey)        migrated.alldebrid   = p.apikey; }

  if (Object.keys(migrated).length > 0) {
    record.debridKeys = { ...record.debridKeys, ...migrated };
    await putRecord(env, userId, record);
    return true;
  }

  return false;
}

/**
 * Get user's streaming preference settings.
 */
export async function getUserSettings(env, userId) {
  const record = await getRecord(env, userId);
  return record.settings || {};
}

/**
 * Update user's streaming preferences and sync the AIOStreams config.
 */
export async function updateUserSettings(env, userId, settings) {
  const record = await getRecord(env, userId);
  record.settings = { ...(record.settings || {}), ...settings };
  await putRecord(env, userId, record);
  // Only sync if user is already provisioned (avoids spurious provision on settings-only users)
  if (record.aio?.uuid || Object.keys(record.debridKeys || {}).length > 0) {
    await syncUser(env, userId);
  }
}

export { AIOSTREAMS_BASE };
