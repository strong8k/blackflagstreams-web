/* ═══════════════════════════════════════════════════════
   BlackFlagStreams — Zustand Store
   Auth, addons, watchlist, continue watching, IPTV, profiles
   ═══════════════════════════════════════════════════════ */
import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { DEFAULT_ADDONS, RECOMMENDED_ADDONS, fetchManifest } from './addons';
import { isLoggedIn, getStoredUser, getUserTier, getTierLimits, getToken, checkSession, pullSyncData, debouncedPush, getWorkerProxyUrl } from './auth';
import { getTraktStatus, disconnectTrakt, syncTraktHistory as syncTraktHistoryApi, enqueueTraktPush } from './trakt';
import {
  getStremioStatus, getTorBoxStatus, getRDStatus, getADStatus, getRPDBStatus,
} from './services';
import { clearStreamCache } from './tmdb';

// ── IDB helpers ──
const LOG = (...a) => console.log('[BFS:Store]', ...a);
const WARN = (...a) => console.warn('[BFS:Store]', ...a);
const ERR = (...a) => console.error('[BFS:Store]', ...a);

async function idbLoad(key, fb) {
  try { const v = await idbGet(key); return v !== undefined ? v : fb; }
  catch (e) { WARN('idbLoad failed for', key, ':', e.message); return fb; }
}
async function idbSave(key, v) {
  try { await idbSet(key, v); }
  catch (e) { ERR('idbSave failed for', key, ':', e.message); }
}

function idbKeys(profileId) {
  const p = profileId || 'default';
  return {
    watchlist: `bfs_watchlist_${p}`,
    continueWatching: `bfs_continue_${p}`,
    addons: 'bfs_addons',
    iptvProviders: `bfs_iptv_providers_${p}`,
    iptvFavorites: `bfs_iptv_favorites_${p}`,
  };
}

// ── Profile helpers ──
function loadProfiles() {
  try { return JSON.parse(localStorage.getItem('bfs_profiles')) || []; } catch { return []; }
}
function saveProfiles(profiles) {
  localStorage.setItem('bfs_profiles', JSON.stringify(profiles));
}
function loadActiveProfileId() {
  return localStorage.getItem('bfs_active_profile') || null;
}
function saveActiveProfileId(id) {
  localStorage.setItem('bfs_active_profile', id);
}

async function syncPayload(state) {
  const token = getToken();
  return {
    addons: state.addons.map(a => ({ transportUrl: a.transportUrl, enabled: a.enabled, category: a.category, flags: a.flags })),
    watchlist: state.watchlist,
    continueWatching: state.continueWatching,
  };
}

export const useStore = create((set, get) => ({
  // ── Auth ──
  auth: {
    loggedIn: isLoggedIn(),
    user: getStoredUser(),
    tier: getUserTier(),
    tierLimits: getTierLimits(getUserTier()),
    loading: false,
  },

  setAuth: (u) => set(s => ({ auth: { ...s.auth, ...u } })),

  initAuth: async () => {
    if (!isLoggedIn()) {
      set(s => ({ auth: { ...s.auth, loggedIn: false, user: null, tier: 'free', tierLimits: getTierLimits('free') } }));
      return;
    }
    set(s => ({ auth: { ...s.auth, loading: true } }));
    const result = await checkSession();
    if (result) {
      if (result.user?.profiles?.length > 0) {
        const local = loadProfiles();
        if (result.user.profiles.length >= local.length) {
          const merged = result.user.profiles.map((sp, i) => {
            const lp = local.find(l => l.id === sp.id) || (i === 0 ? local[0] : null);
            return { ...sp, isOwner: sp.isOwner || lp?.isOwner || i === 0 };
          });
          saveProfiles(merged);
          set({ profiles: merged });
        }
      }
      // assignedAddons = backend-forced addons (already tier-filtered server-side)
      const assignedAddons = (result.assignedAddons || []).map(a => ({
        ...a, flags: { ...a.flags, protected: true, forced: true },
      }));
      set(s => ({
        auth: {
          ...s.auth,
          loggedIn: true,
          user: result.user,
          tier: result.user.tier,
          tierLimits: result.tierLimits || getTierLimits(result.user.tier),
          assignedAddons,
          loading: false,
        },
        // Session may return addon catalogs for the addons page
        recommendedAddons: result.recommendedAddons || s.recommendedAddons,
        ultraAddons: result.ultraAddons || s.ultraAddons,
      }));
    } else {
      set(s => ({ auth: { ...s.auth, loggedIn: false, user: null, tier: 'free', tierLimits: getTierLimits('free'), loading: false } }));
    }
  },

  // ── Config ──
  config: {},
  // Addon catalogs from backend (separate from user's active addon list)
  recommendedAddons: [],
  ultraAddons: [],        // shown only to ultra users (upgrade-gated for others)

  setGlobalConfig: (cfg) => {
    if (cfg.tmdbKey && !localStorage.getItem('bfs_user_tmdb_key')) {
      localStorage.setItem('bfs_tmdb_key', cfg.tmdbKey);
    }
    // openprox IS our proxy — never store or use the legacy server corsProxy field.
    // Remove any old bfsprox URL that may be cached from previous deploys.
    localStorage.removeItem('bfs_cors_proxy');
    const effectiveCorsProxy =
      localStorage.getItem('bfs_user_cors_proxy') ||
      getWorkerProxyUrl();
    const effectiveTmdbKey =
      localStorage.getItem('bfs_user_tmdb_key') ||
      cfg.tmdbKey ||
      localStorage.getItem('bfs_tmdb_key') ||
      '';
    LOG('setGlobalConfig: effectiveCorsProxy =', effectiveCorsProxy, '| effectiveTmdbKey set:', !!effectiveTmdbKey);

    // globalAddons from config = forced for all users (target:'all')
    // recommendedAddons = optional suggestions for all
    // ultraAddons = suggestions only for ultra users
    const globalForced = (cfg.globalAddons || []).map(a => ({
      ...a, flags: { ...a.flags, protected: true, forced: true },
    }));

    set(s => ({
      config: cfg,
      recommendedAddons: cfg.recommendedAddons || s.recommendedAddons,
      ultraAddons: cfg.ultraAddons || s.ultraAddons,
      auth: s.auth.loggedIn ? s.auth : { ...s.auth, assignedAddons: globalForced },
      settings: { ...s.settings, effectiveCorsProxy, effectiveTmdbKey },
    }));
    // initAddons already called from App on mount; proxy never changes here
  },

  // ── Settings ──
  settings: {
    userTmdbKey: localStorage.getItem('bfs_user_tmdb_key') || '',
    userCorsProxy: localStorage.getItem('bfs_user_cors_proxy') || '',
    effectiveTmdbKey: localStorage.getItem('bfs_user_tmdb_key') || localStorage.getItem('bfs_tmdb_key') || '',
    effectiveCorsProxy: localStorage.getItem('bfs_user_cors_proxy') || getWorkerProxyUrl(),
    viewMode: localStorage.getItem('bfs_view_mode') || 'poster',
    autoSync: localStorage.getItem('bfs_auto_sync') !== 'false',
    traktConnected: false,
    traktUsername: null,
    traktLastSync: null,
    traktAutoSync: localStorage.getItem('bfs_trakt_auto_sync') !== 'false',
  },

  // ── Services (canonical connected-service state) ──
  services: {
    trakt:     { connected: false, username: null, lastSync: null, autoSync: localStorage.getItem('bfs_trakt_auto_sync') !== 'false' },
    stremio:   { connected: false, username: null, lastImport: null },
    torbox:    { connected: false, email: null, plan: null, expiresAt: null },
    realdebrid:{ connected: false, username: null, premium: false, expiresAt: null },
    alldebrid: { connected: false, username: null, premium: false, expiresAt: null },
    rpdb:      { connected: false, tier: null },
  },

  setServiceStatus: (key, data) => set(s => ({
    services: { ...s.services, [key]: { ...s.services[key], ...data } }
  })),

  connectService: (key, info) => set(s => ({
    services: { ...s.services, [key]: { connected: true, ...info } }
  })),

  disconnectService: (key) => set(s => ({
    services: { ...s.services, [key]: { connected: false } }
  })),

  initServices: async () => {
    if (!isLoggedIn()) return;
    const { getTraktStatus } = await import('./trakt');
    const svcFns = [
      ['trakt',   () => getTraktStatus()],
      ['stremio', () => getStremioStatus()],
      ['torbox',  () => getTorBoxStatus()],
      ['realdebrid', () => getRDStatus()],
      ['alldebrid',  () => getADStatus()],
      ['rpdb',    () => getRPDBStatus()],
    ];
    const results = await Promise.allSettled(
      svcFns.map(async ([key, fn]) => {
        try {
          const s = await fn();
          if (s?.connected) get().connectService(key, s);
        } catch (e) {
          ERR(`initServices ${key}:`, e.message);
        }
      })
    );
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      WARN(`initServices: ${failed.length}/${svcFns.length} services failed`);
    }
  },

  setTmdbKey: (k) => {
    if (k) { localStorage.setItem('bfs_user_tmdb_key', k); } else { localStorage.removeItem('bfs_user_tmdb_key'); }
    set(s => ({ 
      settings: { 
        ...s.settings, 
        userTmdbKey: k,
        effectiveTmdbKey: k || localStorage.getItem('bfs_tmdb_key') || '' 
      } 
    }));
  },
  setCorsProxy: (u) => {
    if (u) { localStorage.setItem('bfs_user_cors_proxy', u); } else { localStorage.removeItem('bfs_user_cors_proxy'); }
    set(s => ({
      settings: {
        ...s.settings,
        userCorsProxy: u,
        effectiveCorsProxy: u || getWorkerProxyUrl(),
      }
    }));
  },
  setViewMode: (mode) => {
    localStorage.setItem('bfs_view_mode', mode);
    set(s => ({ settings: { ...s.settings, viewMode: mode } }));
  },

  setTraktStatus: (connected, username, lastSync) => {
    const data = { connected, username: username || null, lastSync: lastSync || null };
    set(s => ({
      settings: {
        ...s.settings,
        traktConnected: data.connected,
        traktUsername: data.username,
        traktLastSync: data.lastSync,
      },
      services: { ...s.services, trakt: { ...s.services.trakt, ...data } }
    }));
  },

  toggleTraktAutoSync: () => {
    const next = !get().services.trakt.autoSync;
    localStorage.setItem('bfs_trakt_auto_sync', next ? 'true' : 'false');
    set(s => ({
      settings: { ...s.settings, traktAutoSync: next },
      services: { ...s.services, trakt: { ...s.services.trakt, autoSync: next } }
    }));
  },

  // ── Profiles ──
  profiles: loadProfiles(),
  activeProfile: loadActiveProfileId(),

  setActiveProfile: async (id) => {
    saveActiveProfileId(id);
    set({ activeProfile: id });
    const keys = idbKeys(id);
    set({
      watchlist: await idbLoad(keys.watchlist, []),
      continueWatching: await idbLoad(keys.continueWatching, []),
    });
  },

  createFirstProfile: (data) => {
    const profile = { id: data.id || nanoid(10), name: data.name, avatar: data.avatar || '🏴‍☠️', pin: data.pin || null, color: data.color || '#c41a1a', createdAt: Date.now(), isOwner: true };
    saveProfiles([profile]);
    set({ profiles: [profile] });
    return profile;
  },

  addProfile: (data) => {
    const { profiles, auth } = get();
    if (profiles.length >= auth.tierLimits.profiles) throw new Error('Upgrade to add more profiles');
    const profile = { id: nanoid(10), name: data.name, avatar: data.avatar || '👤', pin: data.pin || null, color: data.color || '#c41a1a', createdAt: Date.now() };
    const updated = [...profiles, profile];
    saveProfiles(updated);
    set({ profiles: updated });
    get().triggerSync();
    return profile;
  },

  removeProfile: async (id) => {
    const { profiles, activeProfile } = get();
    if (profiles.length <= 1) throw new Error('Cannot remove the last profile');
    const updated = profiles.filter(p => p.id !== id);
    saveProfiles(updated);
    if (activeProfile === id) await get().setActiveProfile(updated[0].id);
    set({ profiles: updated });
    get().triggerSync();
  },

  // ── Addons ──
  addons: [],
  addonsLoaded: false,

  initAddons: async () => {
    const proxy = get().settings.effectiveCorsProxy;
    LOG('initAddons: starting, proxy:', proxy || '(none)');

    // Bump this to invalidate all clients' IDB addon caches on next deploy
    const ADDON_SCHEMA_VER = 4;
    const slim = (arr) => arr.map(a => ({ transportUrl: a.transportUrl, enabled: a.enabled, category: a.category, flags: a.flags }));

    const resolveManifests = (configs) => Promise.all(configs.map(async cfg => {
      try {
        const manifest = await fetchManifest(cfg.transportUrl, proxy);
        LOG('initAddons: manifest ok:', manifest.name);
        return { ...cfg, manifest, error: null };
      } catch (e) {
        WARN('initAddons: manifest failed for', cfg.transportUrl, ':', e.message);
        return { ...cfg, manifest: null, error: e.message };
      }
    }));

    if (isLoggedIn()) {
      try {
        const data = await pullSyncData();
        if (data?.addons?.length > 0) {
          LOG('initAddons: loaded', data.addons.length, 'addons from sync');
          let configs = data.addons;
          for (const def of DEFAULT_ADDONS) {
            if (!configs.some(c => c.transportUrl === def.transportUrl)) {
              configs.push({ transportUrl: def.transportUrl, enabled: true, category: def.category, flags: def.flags });
            }
          }
          const resolved = await resolveManifests(configs);
          set({ addons: resolved, addonsLoaded: true });
          await idbSave('bfs_addons', slim(configs));
          await idbSave('bfs_addons_ver', ADDON_SCHEMA_VER);
          return;
        }
      } catch (e) { WARN('initAddons: sync pull failed:', e.message); }
    }

    // Check IDB schema version — wipe stale data on version bump
    const storedVer = await idbLoad('bfs_addons_ver', 0);
    let configs = null;
    if (storedVer >= ADDON_SCHEMA_VER) {
      configs = await idbLoad('bfs_addons', null);
      if (configs) LOG('initAddons: loaded', configs.length, 'addons from IDB (v', storedVer, ')');
    } else {
      LOG('initAddons: schema v', storedVer, '→ v', ADDON_SCHEMA_VER, ', wiping stale addon cache');
      await idbSave('bfs_addons', null);
    }

    if (!configs) {
      configs = DEFAULT_ADDONS.map(a => ({ transportUrl: a.transportUrl, enabled: true, category: a.category, flags: a.flags }));
      LOG('initAddons: starting fresh with', configs.length, 'default addons');
    }

    // Strip any stale relative-URL or non-http addon entries from old site data
    configs = configs.filter(c => c.transportUrl && (c.transportUrl.startsWith('http://') || c.transportUrl.startsWith('https://')));

    for (const def of DEFAULT_ADDONS) {
      if (!configs.some(c => c.transportUrl === def.transportUrl)) {
        configs.push({ transportUrl: def.transportUrl, enabled: true, category: def.category, flags: def.flags });
      }
    }

    // Merge server-assigned (forced) addons — always protected, always present
    const assigned = get().auth?.assignedAddons || [];
    for (const a of assigned) {
      const forcedEntry = { ...a, flags: { ...a.flags, protected: true, forced: true } };
      const idx = configs.findIndex(c => c.transportUrl === a.transportUrl);
      if (idx >= 0) configs[idx] = { ...configs[idx], ...forcedEntry };
      else configs.push(forcedEntry);
    }

    try {
      const addons = await resolveManifests(configs);
      set({ addons, addonsLoaded: true });
      await idbSave('bfs_addons', slim(configs));
      await idbSave('bfs_addons_ver', ADDON_SCHEMA_VER);
    } catch (e) {
      ERR('initAddons: critical failure:', e.message);
      set({ addons: configs.map(c => ({ ...c, manifest: null })), addonsLoaded: true });
    }
  },

  addAddon: async (url) => {
    const { addons, auth } = get();
    if (addons.some(a => a.transportUrl === url)) throw new Error('Already installed');
    const userAddons = addons.filter(a => !a.flags?.protected);
    if (userAddons.length >= auth.tierLimits.addons) throw new Error(`Addon limit reached (${auth.tierLimits.addons})`);
    const manifest = await fetchManifest(url, get().settings.effectiveCorsProxy);
    const newAddon = { transportUrl: url, manifest, enabled: true, category: 'user', flags: {}, error: null };
    let insertIdx = addons.findIndex(a => !a.flags?.protected);
    if (insertIdx === -1) insertIdx = addons.length;
    const updated = [...addons];
    updated.splice(insertIdx, 0, newAddon);
    set({ addons: updated });
    await idbSave('bfs_addons', updated.map(a => ({ transportUrl: a.transportUrl, enabled: a.enabled, category: a.category, flags: a.flags })));
    clearStreamCache();
    get().triggerSync();
    return manifest;
  },

  removeAddon: async (url) => {
    const updated = get().addons.filter(a => a.transportUrl !== url);
    set({ addons: updated });
    await idbSave('bfs_addons', updated.map(a => ({ transportUrl: a.transportUrl, enabled: a.enabled, category: a.category, flags: a.flags })));
    clearStreamCache();
    get().triggerSync();
  },

  fetchManifest: async (url) => {
    return fetchManifest(url, get().settings.effectiveCorsProxy);
  },

  toggleAddon: async (url) => {
    const updated = get().addons.map(a => a.transportUrl === url && !a.flags?.protected ? { ...a, enabled: !a.enabled } : a);
    set({ addons: updated });
    await idbSave('bfs_addons', updated.map(a => ({ transportUrl: a.transportUrl, enabled: a.enabled, category: a.category, flags: a.flags })));
    clearStreamCache();
    get().triggerSync();
  },

  getEnabledAddons: () => get().addons.filter(a => a.enabled && a.manifest),

  // ── Watchlist ──
  watchlist: [],
  initWatchlist: async () => {
    const keys = idbKeys(get().activeProfile);
    set({ watchlist: await idbLoad(keys.watchlist, []) });
  },
  addToWatchlist: async (item) => {
    const { watchlist, activeProfile } = get();
    if (watchlist.some(w => w.id === item.id && w.type === item.type)) return;
    const updated = [item, ...watchlist];
    const keys = idbKeys(activeProfile);
    set({ watchlist: updated }); await idbSave(keys.watchlist, updated); get().triggerSync();
  },
  removeFromWatchlist: async (id, type) => {
    const { activeProfile } = get();
    const updated = get().watchlist.filter(w => !(w.id === id && w.type === type));
    const keys = idbKeys(activeProfile);
    set({ watchlist: updated }); await idbSave(keys.watchlist, updated); get().triggerSync();
  },
  isInWatchlist: (id, type) => get().watchlist.some(w => w.id === id && w.type === type),

  // ── Continue Watching ──
  continueWatching: [],
  initContinueWatching: async () => {
    const keys = idbKeys(get().activeProfile);
    set({ continueWatching: await idbLoad(keys.continueWatching, []) });
  },
  updateProgress: async (item) => {
    const { activeProfile } = get();
    const cw = get().continueWatching;
    const idx = cw.findIndex(c => c.id === item.id && c.type === item.type);
    let updated;
    if (idx >= 0) {
      updated = [...cw];
      updated[idx] = { ...updated[idx], ...item, timestamp: Date.now() };
    } else {
      updated = [{ ...item, timestamp: Date.now() }, ...cw];
    }
    const keys = idbKeys(activeProfile);
    set({ continueWatching: updated }); await idbSave(keys.continueWatching, updated); get().triggerSync();
    const { services } = get();
    if (services.trakt.connected && services.trakt.autoSync) {
      enqueueTraktPush(item);
    }
  },
  getProgress: (id, type) => get().continueWatching.find(c => c.id === id && c.type === type) || null,

  mergeTraktHistory: async (traktItems) => {
    if (!traktItems || traktItems.length === 0) return 0;
    const { activeProfile } = get();
    const cw = [...get().continueWatching];
    let added = 0;
    for (const item of traktItems) {
      const idx = cw.findIndex(c => c.id === item.id && c.type === item.type);
      if (idx >= 0) {
        if (!cw[idx].timestamp || (item.timestamp && item.timestamp > cw[idx].timestamp)) {
          cw[idx] = { ...cw[idx], ...item };
        }
      } else {
        cw.unshift(item);
        added++;
      }
    }
    const keys = idbKeys(activeProfile);
    set({ continueWatching: cw });
    await idbSave(keys.continueWatching, cw);
    get().triggerSync();
    return added;
  },

  syncTraktNow: async () => {
    const { addToast, mergeTraktHistory, services } = get();
    if (!services.trakt.connected) {
      addToast('Trakt not connected', 'warning');
      return;
    }
    addToast('Syncing Trakt history...', 'info');
    try {
      const result = await syncTraktHistoryApi();
      if (result?.items?.length > 0) {
        const added = await mergeTraktHistory(result.items);
        addToast(`Synced ${added} new items from Trakt`, 'success');
      } else {
        addToast('Trakt sync complete — no new items', 'info');
      }
      const now = Date.now();
      set(s => ({
        settings: { ...s.settings, traktLastSync: now },
        services: { ...s.services, trakt: { ...s.services.trakt, lastSync: now } }
      }));
    } catch (e) {
      addToast(`Trakt sync failed: ${e.message}`, 'error');
    }
  },

  initTraktStatus: async () => {
    if (!isLoggedIn()) return;
    try {
      const status = await getTraktStatus();
      set(s => ({
        settings: {
          ...s.settings,
          traktConnected: status.connected || false,
          traktUsername: status.username || null,
          traktLastSync: status.lastSync || null,
        },
        services: {
          ...s.services,
          trakt: {
            ...s.services.trakt,
            connected: status.connected || false,
            username: status.username || null,
            lastSync: status.lastSync || null,
          }
        }
      }));
    } catch { /* silently fail */ }
  },

  disconnectTraktAccount: async () => {
    try { await disconnectTrakt(); } catch { /* proceed with local cleanup */ }
    set(s => ({
      settings: {
        ...s.settings,
        traktConnected: false,
        traktUsername: null,
        traktLastSync: null,
      },
      services: { ...s.services, trakt: { connected: false } }
    }));
  },

  // ── Sync ──
  triggerSync: async () => {
    if (!isLoggedIn() || get().settings.autoSync === false) return;
    debouncedPush(await syncPayload(get()));
  },

  // ── IPTV ──
  iptvProviders: [],
  iptvFavorites: [],
  initIPTV: async () => {
    const keys = idbKeys(get().activeProfile);
    set({
      iptvProviders: await idbLoad(keys.iptvProviders, []),
      iptvFavorites: await idbLoad(keys.iptvFavorites, []),
    });
  },
  addIPTVProvider: async (provider) => {
    const updated = [...get().iptvProviders, provider];
    set({ iptvProviders: updated });
    await idbSave(idbKeys(get().activeProfile).iptvProviders, updated);
    get().triggerSync();
  },
  removeIPTVProvider: async (id) => {
    const updated = get().iptvProviders.filter(p => p.id !== id);
    set({ iptvProviders: updated });
    await idbSave(idbKeys(get().activeProfile).iptvProviders, updated);
    get().triggerSync();
  },

  // ── Toasts ──
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = nanoid(6);
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 4000);
  },

  // ── Bulk Import ──
  bulkImport: async (data) => {
    const { watchlist, history } = data;
    const { activeProfile } = get();
    const keys = idbKeys(activeProfile);
    
    // Import Watchlist
    const currentWl = get().watchlist;
    const newWl = [...watchlist];
    currentWl.forEach(item => {
      if (!newWl.some(n => n.id === item.id && n.type === item.type)) newWl.push(item);
    });
    set({ watchlist: newWl });
    await idbSave(keys.watchlist, newWl);

    // Import History (Continue Watching)
    const currentCw = get().continueWatching;
    const newCw = [...history];
    currentCw.forEach(item => {
      if (!newCw.some(n => n.id === item.id && n.type === item.type)) newCw.push(item);
    });
    set({ continueWatching: newCw });
    await idbSave(keys.continueWatching, newCw);

    get().triggerSync();
  },
}));
