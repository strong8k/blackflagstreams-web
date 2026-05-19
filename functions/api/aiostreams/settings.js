// GET /api/aiostreams/settings — Get user's debrid streaming preferences
// POST /api/aiostreams/settings — Update user's debrid streaming preferences
// Preferences are disabled until user has at least one debrid key saved.

import { json, preflight, validateSession } from '../_shared.js';
import { getUserSettings, updateUserSettings, hasDebridKeys } from './_userdata.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const hasKeys = await hasDebridKeys(env, session.userId);
  const settings = await getUserSettings(env, session.userId);

  return json({
    hasDebrid: hasKeys,
    settings: {
      // Default resolutions enabled (hidden: 240p, 144p)
      enabledResolutions: settings.enabledResolutions || ['2160p', '1080p', '720p', '480p'],
      // Language preferences
      languages: settings.languages || {
        included: ['English', 'Dual Audio', 'Dubbed', 'Multi', 'Unknown'],
        preferred: ['English', 'Dubbed', 'Dual Audio'],
        required: ['English'],
      },
      // Size limits (global: [min, max])
      sizeGlobal: settings.sizeGlobal || {
        movies: [1300000000, 100000000000],
        series: [200000000, 15000000000],
      },
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // Only store the fields that were actually provided
  const updates = {};
  if (body.enabledResolutions !== undefined) updates.enabledResolutions = body.enabledResolutions;
  if (body.languages !== undefined) updates.languages = body.languages;
  if (body.sizeGlobal !== undefined) updates.sizeGlobal = body.sizeGlobal;

  if (Object.keys(updates).length > 0) {
    await updateUserSettings(env, session.userId, updates);
  }

  return json({ success: true });
}