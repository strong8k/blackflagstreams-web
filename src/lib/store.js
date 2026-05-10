/* ═══════════════════════════════════════════════════════
   BlackFlagStreams — Zustand Store
   Auth, addons, watchlist, continue watching, IPTV, profiles
   ═══════════════════════════════════════════════════════ */
import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { DEFAULT_ADDONS, RECOMMENDED_ADDONS, fetchManifest } from './addons';
import { isLoggedIn, getStoredUser, getUserTier, getTierLimits, getToken, checkSession, pullSyncData, debouncedPush } from './auth';

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
      set(s => ({
        auth: {
          ...s.auth,
          loggedIn: true,
          user: result.user,
          tier: result.user.tier,
          tierLimits: result.tierLimits || getTierLimits(result.user.tier),
          assignedAddons: result.assignedAddons || [],
          loading: false,
        },
      }));
    } else {
      set(s => ({ auth: { ...s.auth, loggedIn: false, user: null, tier: 'free', tierLimits: getTierLimits('free'), loading: false } }));
    }
  },

  // ── Config ──
  config: {},
  setGlobalConfig: (cfg) => {
    if (cfg.tmdbKey && !localStorage.getItem('bfs_user_tmdb_key')) {
      localStorage.setItem('bfs_tmdb_key', cfg.tmdbKey);
    }
    if (cfg.corsProxy && !localStorage.getItem('bfs_user_cors_proxy')) {
      localStorage.setItem('bfs_cors_proxy', cfg.corsProxy);
    }
    set(s => ({
      config: cfg,
      auth: s.auth.loggedIn ? s.auth : { ...s.auth, assignedAddons: cfg.globalAddons || [] },
    }));
    get().initAddons();
  },

  // ── Settings ──
  settings: {
    userTmdbKey: localStorage.getItem('bfs_user_tmdb_key') || '',
    userCorsProxy: localStorage.getItem('bfs_user_cors_proxy') || '',
    effectiveTmdbKey: localStorage.getItem('bfs_user_tmdb_key') || localStorage.getItem('bfs_tmdb_key') || '',
    effectiveCorsProxy: localStorage.getItem('bfs_user_cors_proxy') || localStorage.getItem('bfs_cors_proxy') || '',
    viewMode: localStorage.getItem('bfs_view_mode') || 'poster',
    autoSync: localStorage.getItem('bfs_auto_sync') !== 'false',
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
        effectiveCorsProxy: u || localStorage.getItem('bfs_cors_proxy') || '' 
      } 
    }));
  },
  setViewMode: (mode) => {
    localStorage.setItem('bfs_view_mode', mode);
    set(s => ({ settings: { ...s.settings, viewMode: mode } }));
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
          const resolved = await Promise.all(configs.map(async cfg => {
            try {
              const manifest = await fetchManifest(cfg.transportUrl, proxy);
              LOG('initAddons: manifest ok:', manifest.name);
              return { ...cfg, manifest, error: null };
            } catch (e) {
              WARN('initAddons: manifest failed for', cfg.transportUrl, ':', e.message);
              return { ...cfg, manifest: null, error: e.message };
            }
          }));
          set({ addons: resolved, addonsLoaded: true });
          await idbSave('bfs_addons', configs.map(a => ({ transportUrl: a.transportUrl, enabled: a.enabled, category: a.category, flags: a.flags })));
          return;
        }
      } catch (e) { WARN('initAddons: sync pull failed:', e.message); }
    }

    let configs = await idbLoad('bfs_addons', null);
    if (!configs) {
      LOG('initAddons: no cached addons, using defaults');
      configs = DEFAULT_ADDONS.map(a => ({ transportUrl: a.transportUrl, enabled: true, category: a.category, flags: a.flags }));
    } else {
      LOG('initAddons: loaded', configs.length, 'addons from IDB');
    }
    for (const def of DEFAULT_ADDONS) {
      if (!configs.some(c => c.transportUrl === def.transportUrl)) {
        configs.push({ transportUrl: def.transportUrl, enabled: true, category: def.category, flags: def.flags });
      }
    }

    const assigned = get().auth?.assignedAddons || [];
    for (const a of assigned) {
      if (!configs.some(c => c.transportUrl === a.transportUrl)) configs.push(a);
    }

    try {
      const addons = await Promise.all(configs.map(async cfg => {
        try {
          const manifest = await fetchManifest(cfg.transportUrl, proxy);
          LOG('initAddons: manifest ok:', manifest.name);
          return { ...cfg, manifest, error: null };
        } catch (e) {
          WARN('initAddons: manifest failed for', cfg.transportUrl, ':', e.message);
          return { ...cfg, manifest: null, error: e.message };
        }
      }));
      set({ addons, addonsLoaded: true });
      await idbSave('bfs_addons', configs.map(a => ({ transportUrl: a.transportUrl, enabled: a.enabled, category: a.category, flags: a.flags })));
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
    get().triggerSync();
    return manifest;
  },

  removeAddon: async (url) => {
    const updated = get().addons.filter(a => a.transportUrl !== url);
    set({ addons: updated });
    await idbSave('bfs_addons', updated.map(a => ({ transportUrl: a.transportUrl, enabled: a.enabled, category: a.category, flags: a.flags })));
    get().triggerSync();
  },

  fetchManifest: async (url) => {
    return fetchManifest(url, get().settings.effectiveCorsProxy);
  },

  toggleAddon: async (url) => {
    const updated = get().addons.map(a => a.transportUrl === url && !a.flags?.protected ? { ...a, enabled: !a.enabled } : a);
    set({ addons: updated });
    await idbSave('bfs_addons', updated.map(a => ({ transportUrl: a.transportUrl, enabled: a.enabled, category: a.category, flags: a.flags })));
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
  },
  getProgress: (id, type) => get().continueWatching.find(c => c.id === id && c.type === type) || null,

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
