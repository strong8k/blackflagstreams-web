//
//  Zustand store — BlackFlagStreams Web App (bfs1)
//

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { getWorkerProxyUrl, getApiBaseUrl, checkSession, getToken, getStoredUser } from './auth';

// ── Helpers ──

const LOG = (...a) => console.log('[BFS]', ...a);
const WARN = (...a) => console.warn('[BFS]', ...a);

function getInitialSettings() {
  return {
    effectiveCorsProxy: localStorage.getItem('bfs_user_cors_proxy') || getWorkerProxyUrl(),
    effectiveTmdbKey: localStorage.getItem('bfs_tmdb_key') || '',
    viewMode: localStorage.getItem('bfs_view_mode') || 'poster',
    autoSync: localStorage.getItem('bfs_auto_sync') !== 'false',
    traktConnected: false,
    traktUsername: null,
    traktLastSync: null,
    traktAutoSync: localStorage.getItem('bfs_trakt_auto_sync') !== 'false',
  };
}

// ── Profile presets ──

const DEFAULT_PROFILES = [
  { id: 1, name: 'Adult', avatar: '👤', color: '#3b82f6' },
  { id: 2, name: 'Kids', avatar: '🧒', color: '#10b981' },
];

// ── Store ──

const useStore = create(
  devtools(
    persist(
      (set, get) => ({
        // ── Auth ──
        auth: {
          loggedIn: false,
          user: null,
          token: null,
          qrCode: null,
          deviceCode: null,
          assignedAddons: [],
          tier: 'free',
          setAuth: (user, token) =>
            set((s) => ({
              auth: { ...s.auth, loggedIn: true, user, token, tier: user?.tier || 'free' },
            })),
          clearAuth: () =>
            set((s) => ({
              auth: { ...s.auth, loggedIn: false, user: null, token: null, tier: 'free' },
              services: Object.fromEntries(
                Object.keys(s.services).map((k) => [k, { connected: false }])
              ),
            })),
          setQrDevice: (qrCode, deviceCode) =>
            set((s) => ({
              auth: { ...s.auth, qrCode, deviceCode },
            })),
          setAssignedAddons: (addons) =>
            set((s) => ({
              auth: { ...s.auth, assignedAddons: addons },
            })),
        },

        // ── Profiles ──
        profiles: DEFAULT_PROFILES,
        activeProfile: DEFAULT_PROFILES[0],
        setActiveProfile: (profile) =>
          set((s) => {
            const p = typeof profile === 'function' ? profile(s.profiles, s.activeProfile) : profile;
            if (p) localStorage.setItem('bfs_active_profile', JSON.stringify(p));
            return { activeProfile: p };
          }),
        addProfile: (data) =>
          set((s) => {
            const id = s.profiles.length > 0 ? Math.max(...s.profiles.map((p) => p.id)) + 1 : 1;
            const newProfile = { ...data, id };
            return { profiles: [...s.profiles, newProfile] };
          }),
        updateProfile: (id, data) =>
          set((s) => ({
            profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...data } : p)),
            activeProfile: s.activeProfile?.id === id ? { ...s.activeProfile, ...data } : s.activeProfile,
          })),
        removeProfile: (id) =>
          set((s) => {
            const next = s.profiles.filter((p) => p.id !== id);
            const newActive = next.find((p) => p.id === s.activeProfile?.id) || next[0] || null;
            return { profiles: next, activeProfile: newActive };
          }),

        // ── Config ──
        config: {},
        recommendedAddons: [],
        ultraAddons: [],

        setGlobalConfig: (cfg) => {
          if (cfg.tmdbKey && !localStorage.getItem('bfs_tmdb_key')) {
            localStorage.setItem('bfs_tmdb_key', cfg.tmdbKey);
          }
          localStorage.removeItem('bfs_cors_proxy');
          const effectiveCorsProxy =
            localStorage.getItem('bfs_user_cors_proxy') || getWorkerProxyUrl();
          const effectiveTmdbKey = cfg.tmdbKey || localStorage.getItem('bfs_tmdb_key') || '';
          LOG('setGlobalConfig: effectiveCorsProxy =', effectiveCorsProxy, '| effectiveTmdbKey set:', !!effectiveTmdbKey);

          const globalForced = (cfg.globalAddons || []).map((a) => ({
            ...a,
            flags: { ...a.flags, protected: true, forced: true },
          }));

          set((s) => ({
            config: cfg,
            recommendedAddons: cfg.recommendedAddons || [],
            ultraAddons: (cfg.ultraAddons || []).filter(
              (a) => !(cfg.globalAddons || []).some((ga) => ga.url === a.url)
            ),
            auth: {
              ...s.auth,
              assignedAddons: globalForced,
            },
            settings: { ...s.settings, effectiveCorsProxy, effectiveTmdbKey },
          }));

          try {
            const allAddons = [...globalForced, ...(cfg.globalAddons || [])];
            localStorage.setItem('bfs_addon_configs', JSON.stringify(allAddons));
          } catch {}
        },

        // ── Settings ──
        settings: getInitialSettings(),

        // ── Services (canonical connected-service state) ──
        services: {
          trakt: { connected: false, username: null, lastSync: null, autoSync: localStorage.getItem('bfs_trakt_auto_sync') !== 'false' },
          stremio: { connected: false, username: null, lastImport: null },
          torbox: { connected: false, email: null, plan: null, expiresAt: null },
          realdebrid: { connected: false, username: null, premium: false, expiresAt: null },
          alldebrid: { connected: false, username: null, premium: false, expiresAt: null },
          rpdb: { connected: false, tier: null },
        },

        setServiceStatus: (key, data) =>
          set((s) => ({
            services: { ...s.services, [key]: { ...s.services[key], ...data } },
          })),

        connectService: (key, info = {}) =>
          set((s) => ({
            services: { ...s.services, [key]: { ...s.services[key], connected: true, ...info } },
          })),

        disconnectService: (key) =>
          set((s) => ({
            services: { ...s.services, [key]: { connected: false, username: null, plan: null, expiresAt: null, tier: null } },
          })),

        // Initialize all services from stored credentials (run once on app start)
        initServices: async () => {
          const state = get();
          const baseUrl = getApiBaseUrl() || '';
          const token = state.auth?.token;
          if (!token) return;
          const svcKeys = [
            { key: 'trakt', path: 'trakt' },
            { key: 'stremio', path: 'stremio' },
            { key: 'torbox', path: 'torbox' },
            { key: 'realdebrid', path: 'realdebrid' },
            { key: 'alldebrid', path: 'alldebrid' },
            { key: 'rpdb', path: 'rpdb' },
          ];
          for (const { key, path } of svcKeys) {
            try {
              const res = await fetch(`${baseUrl}/api/${path}/status`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const data = await res.json();
                if (data.connected) {
                  const update = { connected: true };
                  if (data.username) update.username = data.username;
                  if (data.email) update.email = data.email;
                  if (data.plan) update.plan = data.plan;
                  if (data.premium !== undefined) update.premium = data.premium;
                  if (data.tier) update.tier = data.tier;
                  if (data.expiresAt) update.expiresAt = data.expiresAt;
                  set((s) => ({ services: { ...s.services, [key]: { ...s.services[key], ...update } } }));
                }
              }
            } catch { /* skip */ }
          }
        },

        // ── TMDB Key (legacy setter kept for compatibility) ──
        setTmdbKey: (k) => {
          if (!k) { localStorage.removeItem('bfs_user_tmdb_key'); }
          set((s) => ({ settings: { ...s.settings } }));
        },

        setCorsProxy: (u) => {
          if (u) {
            localStorage.setItem('bfs_user_cors_proxy', u);
          } else {
            localStorage.removeItem('bfs_user_cors_proxy');
          }
          set((s) => ({
            settings: { ...s.settings, effectiveCorsProxy: u || getWorkerProxyUrl() },
          }));
        },

        setViewMode: (mode) => {
          localStorage.setItem('bfs_view_mode', mode);
          set((s) => ({ settings: { ...s.settings, viewMode: mode } }));
        },

        setTraktAutoSync: (enabled) => {
          localStorage.setItem('bfs_trakt_auto_sync', enabled ? 'true' : 'false');
          set((s) => ({ settings: { ...s.settings, traktAutoSync: enabled } }));
        },

        // ── UI State ──
        searchQuery: '',
        setSearchQuery: (q) => set({ searchQuery: q }),
        detailModal: null,
        setDetailModal: (id) => set({ detailModal: id }),
        playerOpen: false,
        playerItem: null,
        openPlayer: (item) => set({ playerOpen: true, playerItem: item }),
        closePlayer: () => set({ playerOpen: false, playerItem: null }),
        toasts: [],
        addToast: (msg, type = 'info') => {
          const id = nanoid(8);
          set((s) => ({ toasts: [...(s.toasts || []), { id, msg, type }] }));
          setTimeout(() => {
            set((s) => ({
              toasts: (s.toasts || []).filter((t) => t.id !== id),
            }));
          }, 4000);
        },
        removeToast: (id) =>
          set((s) => ({
            toasts: (s.toasts || []).filter((t) => t.id !== id),
          })),

        // ── TMDB Data ──
        tmdb: {
          popular: [],
          trending: [],
          topRated: [],
          genres: [],
          loading: false,
          error: null,
          setTrending: (data) => set((s) => ({ tmdb: { ...s.tmdb, trending: data } })),
          setPopular: (data) => set((s) => ({ tmdb: { ...s.tmdb, popular: data } })),
          setTopRated: (data) => set((s) => ({ tmdb: { ...s.tmdb, topRated: data } })),
          setGenres: (data) => set((s) => ({ tmdb: { ...s.tmdb, genres: data } })),
          setLoading: (v) => set((s) => ({ tmdb: { ...s.tmdb, loading: v } })),
          setError: (e) => set((s) => ({ tmdb: { ...s.tmdb, error: e } })),
        },

        // ── Watchlist ──
        watchlist: [],
        addToWatchlist: (item) =>
          set((s) => ({ watchlist: [...s.watchlist, item] })),
        removeFromWatchlist: (id, type) =>
          set((s) => ({
            watchlist: s.watchlist.filter((i) => !(i.id === id && (!type || i.type === type))),
          })),
        isInWatchlist: (id, type) => {
          const state = get();
          return (state.watchlist || []).some((i) => i.id === id && (!type || i.type === type));
        },
        loadWatchlist: () => {
          try {
            const raw = localStorage.getItem('bfs_watchlist');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) set((s) => ({ watchlist: parsed }));
            }
          } catch {}
        },

        // ── Continue Watching ──
        continueWatching: [],
        addContinueWatching: (item) =>
          set((s) => {
            const updated = [item, ...s.continueWatching.filter((i) => i.id !== item.id)].slice(0, 50);
            return { continueWatching: updated };
          }),
        removeContinueWatching: (id) =>
          set((s) => ({
            continueWatching: s.continueWatching.filter((i) => i.id !== id),
          })),
        getProgress: (id, type) => {
          const state = get();
          const cw = (state.continueWatching || []).find(
            (i) => i.id === id && (!type || i.type === type)
          );
          if (cw && cw.progress !== undefined) return cw;
          const hist = (state.history || []).find(
            (i) => i.id === id && (!type || i.type === type)
          );
          return hist || null;
        },

        // ── History ──
        history: [],
        addToHistory: (item) =>
          set((s) => {
            const updated = [item, ...s.history.filter((i) => i.id !== item.id)].slice(0, 200);
            return { history: updated };
          }),

        // ── Search ──
        searchResults: { movies: [], series: [], people: [] },
        searchLoading: false,
        setSearchResults: (data) =>
          set((s) => ({ searchResults: data })),
        setSearchLoading: (v) =>
          set((s) => ({ searchLoading: v })),

        // ── Addon Management ──
        addons: [],
        addonCatalog: [],
        setAddons: (addons) => set((s) => ({ addons })),
        setAddonCatalog: (catalog) => set((s) => ({ addonCatalog: catalog })),
        toggleAddon: (url) =>
          set((s) => ({
            addons: s.addons.map((a) =>
              a.url === url ? { ...a, enabled: !a.enabled } : a
            ),
          })),
        updateAddon: (url, data) =>
          set((s) => ({
            addons: s.addons.map((a) => (a.url === url ? { ...a, ...data } : a)),
          })),
        removeAddon: (url) =>
          set((s) => ({
            addons: s.addons.filter((a) => a.url !== url),
          })),
        addAddon: (url) =>
          set((s) => {
            if (s.addons.some((a) => a.url === url)) return {};
            return { addons: [...s.addons, { url, enabled: true, manifest: null }] };
          }),

        // ── Fetch addon manifest and add to list ──
        fetchManifest: async (transportUrl) => {
          try {
            const { fetchManifest } = await import('../lib/addons');
            const manifest = await fetchManifest(transportUrl);
            set((s) => {
              if (s.addons.some((a) => a.url === transportUrl)) return {};
              return {
                addons: [...s.addons, {
                  url: transportUrl,
                  enabled: true,
                  manifest,
                  transportUrl,
                }],
              };
            });
            return manifest;
          } catch (e) {
            get().addToast?.(`Failed to fetch manifest: ${e.message}`, 'error');
            return null;
          }
        },

        // ── IPTV ──
        iptvProviders: [],
        addIPTVProvider: (provider) =>
          set((s) => ({ iptvProviders: [...s.iptvProviders, provider] })),
        updateIPTVProvider: (id, data) =>
          set((s) => ({
            iptvProviders: s.iptvProviders.map((p) => (p.id === id ? { ...p, ...data } : p)),
          })),
        removeIPTVProvider: (id) =>
          set((s) => ({ iptvProviders: s.iptvProviders.filter((p) => p.id !== id) })),
        forceSyncIPTV: async () => {
          try {
            const state = get();
            const token = state?.auth?.token;
            const providers = state.iptvProviders;
            if (!token) throw new Error('Not authenticated');
            const baseUrl = getApiBaseUrl() || '';
            const res = await fetch(`${baseUrl}/api/sync`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ iptv: providers }),
            });
            if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
            return { success: true };
          } catch (e) {
            return { error: e.message };
          }
        },

        // ── Bulk Import (from Stremio / server-side import) ──
        bulkImport: async (data) => {
          if (!data) return;
          const wl = data.watchlist || [];
          const hist = data.history || [];
          const state = get();
          const existingWl = state.watchlist || [];
          const existingHist = state.history || [];
          const wlIds = new Set(existingWl.map((i) => i.id));
          const histIds = new Set(existingHist.map((i) => i.id));

          const newWl = wl.filter((item) => !wlIds.has(item.id));
          const newHist = hist.filter((item) => !histIds.has(item.id));

          if (newWl.length > 0) {
            set((s) => ({ watchlist: [...newWl, ...s.watchlist] }));
          }
          if (newHist.length > 0) {
            set((s) => ({ history: [...newHist, ...s.history] }));
          }
        },

        // ── Merge Trakt History ──
        mergeTraktHistory: (items) => {
          if (!items || items.length === 0) return 0;
          const state = get();
          const existing = state.history || [];
          const existingIds = new Set(existing.map((i) => `${i.type}_${i.id}`));
          const newItems = items.filter(
            (item) => !existingIds.has(`${item.type || 'movie'}_${item.tmdbId || item.id}`)
          );
          if (newItems.length > 0) {
            set((s) => ({
              history: [...newItems.map((item) => ({
                ...item,
                id: item.tmdbId || item.id,
                type: item.type || 'movie',
                progress: 100,
                timestamp: item.timestamp || Date.now(),
              })), ...s.history],
            }));
          }
          return newItems.length;
        },

        // ── Init helpers ──
        initAddons: async () => {
          try {
            const baseUrl = getApiBaseUrl() || '';
            const res = await fetch(`${baseUrl}/api/admin/addons?type=global`);
            if (res.ok) {
              const data = await res.json();
              set((s) => ({ addons: data.addons || s.addons }));
            }
          } catch { /* silently fail */ }
        },

        initWatchlist: () => {
          try {
            const raw = localStorage.getItem('bfs_watchlist');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) set((s) => ({ watchlist: parsed }));
            }
          } catch {}
        },

        initContinueWatching: () => {
          try {
            const raw = localStorage.getItem('bfs_continue_watching');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) set((s) => ({ continueWatching: parsed }));
            }
          } catch {}
        },

        initIPTV: () => {
          // IPTV providers are persisted via Zustand persist
        },

        // ── Auth Init (called from App on mount) ──
        initAuth: async () => {
          const data = await checkSession();
          if (data?.user) {
            const token = getToken();
            set((s) => ({
              auth: {
                ...s.auth,
                loggedIn: true,
                user: data.user,
                token,
                tier: data.user?.tier || 'free',
              },
            }));
            if (data.user) localStorage.setItem('bfs_user', JSON.stringify(data.user));
          } else {
            // Fallback: check for a stored user without server validation
            const storedUser = getStoredUser();
            const token = getToken();
            if (storedUser && token) {
              set((s) => ({
                auth: {
                  ...s.auth,
                  loggedIn: true,
                  user: storedUser,
                  token,
                  tier: storedUser?.tier || 'free',
                },
              }));
            }
          }
        },

        // ── Reset full state ──
        resetState: () =>
          set(
            {
              auth: { loggedIn: false, user: null, token: null, qrCode: null, deviceCode: null, assignedAddons: [], tier: 'free' },
              profiles: DEFAULT_PROFILES,
              activeProfile: DEFAULT_PROFILES[0],
              services: {
                trakt: { connected: false, username: null, lastSync: null, autoSync: false },
                stremio: { connected: false, username: null, lastImport: null },
                torbox: { connected: false, email: null, plan: null, expiresAt: null },
                realdebrid: { connected: false, username: null, premium: false, expiresAt: null },
                alldebrid: { connected: false, username: null, premium: false, expiresAt: null },
                rpdb: { connected: false, tier: null },
              },
              watchlist: [],
              continueWatching: [],
              history: [],
              addons: [],
              iptvProviders: [],
              toasts: [],
              searchQuery: '',
            },
            true
          ),
      }),
      {
        name: 'bfs-storage',
        partialize: (state) => ({
          auth: { loggedIn: state.auth.loggedIn, user: state.auth.user, token: state.auth.token, tier: state.auth.tier },
          profiles: state.profiles,
          activeProfile: state.activeProfile,
          settings: state.settings,
          services: state.services,
          addons: state.addons,
          iptvProviders: state.iptvProviders,
          watchlist: state.watchlist,
          continueWatching: state.continueWatching,
          history: state.history,
        }),
      }
    )
  )
);

export { useStore };
export default useStore;