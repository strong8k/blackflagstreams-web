//
//  Zustand store — BlackFlagStreams Web App (bfs1)
//

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { getWorkerProxyUrl, getApiBaseUrl, checkSession, getToken, getStoredUser } from './auth';
import { log, setLogUser } from './logger';

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
  { id: '1', name: 'Adult', avatar: '🏴‍☠️', color: '#3b82f6' },
  { id: '2', name: 'Kids', avatar: '🧒', color: '#10b981' },
];

// ── Profile sync helper — call forceSync after profile mutations ──
function syncProfilesAfterChange(get) {
  // Debounce: wait 500ms then push
  clearTimeout(get()._profileSyncTimer);
  const timer = setTimeout(() => {
    get().forceSync().catch(() => {});
  }, 500);
  set((s) => ({ _profileSyncTimer: timer }));
}

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
          clearAuth: () => {
            log('info', 'auth logout');
            set((s) => ({
              auth: { ...s.auth, loggedIn: false, user: null, token: null, tier: 'free' },
              services: Object.fromEntries(
                Object.keys(s.services).map((k) => [k, { connected: false }])
              ),
            }));
          },
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
        _profileSyncTimer: null,
        setActiveProfile: (profile) =>
          set((s) => {
            const p = typeof profile === 'function' ? profile(s.profiles, s.activeProfile) : profile;
            if (p) localStorage.setItem('bfs_active_profile', JSON.stringify(p));
            // Sync profiles to server
            syncProfilesAfterChange(get);
            return { activeProfile: p };
          }),
        addProfile: (data) =>
          set((s) => {
            const id = s.profiles.length > 0 ? String(Math.max(...s.profiles.map((p) => Number(p.id) || 0)) + 1) : '1';
            const newProfile = { ...data, id };
            syncProfilesAfterChange(get);
            return { profiles: [...s.profiles, newProfile] };
          }),
        updateProfile: (id, data) =>
          set((s) => {
            syncProfilesAfterChange(get);
            return {
              profiles: s.profiles.map((p) => (String(p.id) === String(id) ? { ...p, ...data } : p)),
              activeProfile: String(s.activeProfile?.id) === String(id) ? { ...s.activeProfile, ...data } : s.activeProfile,
            };
          }),
        removeProfile: (id) =>
          set((s) => {
            const next = s.profiles.filter((p) => String(p.id) !== String(id));
            const newActive = next.find((p) => String(p.id) === String(s.activeProfile?.id)) || next[0] || null;
            syncProfilesAfterChange(get);
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

        // ── Debrid Settings (AIOStreams quality preferences) ──
        debridSettings: {
          hasDebrid: false,
          enabledResolutions: ['2160p', '1080p', '720p', '480p'],
          languages: {
            included: ['English', 'Dual Audio', 'Dubbed', 'Multi', 'Unknown'],
            preferred: ['English', 'Dubbed', 'Dual Audio'],
            required: ['English'],
          },
          sizeGlobal: {
            movies: [1300000000, 100000000000],
            series: [200000000, 15000000000],
          },
        },
        setDebridSettings: (settings) =>
          set((s) => ({ debridSettings: { ...s.debridSettings, ...settings } })),
        setDebridResolution: (resolution, enabled) =>
          set((s) => ({
            debridSettings: {
              ...s.debridSettings,
              enabledResolutions: enabled
                ? [...new Set([...s.debridSettings.enabledResolutions, resolution])]
                : s.debridSettings.enabledResolutions.filter(r => r !== resolution),
            },
          })),
        setHasDebrid: (has) =>
          set((s) => ({ debridSettings: { ...s.debridSettings, hasDebrid: has } })),
        initDebridSettings: async () => {
          try {
            const { getDebridSettings } = await import('./services');
            const data = await getDebridSettings();
            if (data.settings) {
              set((s) => ({
                debridSettings: {
                  ...s.debridSettings,
                  hasDebrid: data.hasDebrid,
                  enabledResolutions: data.settings.enabledResolutions,
                  languages: data.settings.languages,
                  sizeGlobal: data.settings.sizeGlobal,
                },
              }));
            }
          } catch {}
        },

        setServiceStatus: (key, data) =>
          set((s) => ({
            services: { ...s.services, [key]: { ...s.services[key], ...data } },
          })),

        connectService: (key, info = {}) => {
          log('info', `service connect: ${key}`, { username: info.username || info.email || null });
          set((s) => ({
            services: { ...s.services, [key]: { ...s.services[key], connected: true, ...info } },
          }));
        },

        disconnectService: (key) => {
          log('info', `service disconnect: ${key}`);
          set((s) => ({
            services: { ...s.services, [key]: { connected: false, username: null, plan: null, expiresAt: null, tier: null } },
          }));
        },

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
          await Promise.allSettled(svcKeys.map(async ({ key, path }) => {
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
                  if (data.apiKey) update.apiKey = data.apiKey;
                  set((s) => ({ services: { ...s.services, [key]: { ...s.services[key], ...update } } }));
                  log('info', `service ready: ${key}`, { username: data.username || data.email || null });
                } else {
                  log('debug', `service not connected: ${key}`);
                }
              }
            } catch (e) { log('warn', `service status error: ${key}`, e.message); }
          }));
        },

        // ── TMDB Key ──
        setTmdbKey: (k) => {
          if (k) {
            localStorage.setItem('bfs_tmdb_key', k);
          } else {
            localStorage.removeItem('bfs_tmdb_key');
            localStorage.removeItem('bfs_user_tmdb_key');
          }
          set((s) => ({ settings: { ...s.settings, effectiveTmdbKey: k || '' } }));
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
        playerLoading: false,
        playerError: null,
        playerPoster: null,
        openPlayer: (item) => set({ playerOpen: true, playerItem: item, playerLoading: true, playerError: null }),
        closePlayer: () => set({ playerOpen: false, playerItem: null, playerLoading: false, playerError: null, playerPoster: null }),
        setPlayerLoading: (loading) => set({ playerLoading: loading }),
        setPlayerError: (error) => set({ playerError: error }),
        setPlayerPoster: (poster) => set({ playerPoster: poster }),
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
        addToWatchlist: (item) => {
          log('info', 'watchlist add', { id: item.id, type: item.type, title: item.title });
          set((s) => ({ watchlist: [...s.watchlist, item] }));
        },
        removeFromWatchlist: (id, type) => {
          log('info', 'watchlist remove', { id, type });
          set((s) => ({
            watchlist: s.watchlist.filter((i) => !(i.id === id && (!type || i.type === type))),
          }));
        },
        isInWatchlist: (id, type) => {
          const state = get();
          return (state.watchlist || []).some((i) => i.id === id && (!type || i.type === type));
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

        updateProgress: ({ id, type, title, poster_path, progress, duration, percent, season, episode }) => {
          get().addContinueWatching({ id, type, title, poster_path, progress, duration, percent, season, episode, timestamp: Date.now() });
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
        toggleAddon: (url) => {
          set((s) => ({
            addons: s.addons.map((a) =>
              a.url === url ? { ...a, enabled: !a.enabled } : a
            ),
          }));
        },
        updateAddon: (url, data) => {
          set((s) => ({
            addons: s.addons.map((a) => (a.url === url ? { ...a, ...data } : a)),
          }));
        },
        removeAddon: (url) => {
          log('info', 'addon removed', { url });
          set((s) => ({
            addons: s.addons.filter((a) => a.url !== url && a.transportUrl !== url),
          }));
          get().forceSync().catch(() => {});
        },
        addAddon: async (transportUrl) => {
          try {
            const { fetchManifest } = await import('../lib/addons');
            const proxy = get().settings?.effectiveCorsProxy || null;
            const manifest = await fetchManifest(transportUrl, proxy);
            set((s) => {
              if (s.addons.some((a) => a.url === transportUrl || a.transportUrl === transportUrl)) return s;
              return {
                addons: [...s.addons, { url: transportUrl, transportUrl, enabled: true, manifest }],
              };
            });
            log('info', 'addon added', { name: manifest?.name, url: transportUrl });
            get().forceSync().catch(() => {});
            return manifest;
          } catch (e) {
            log('error', 'addon add failed', { url: transportUrl, error: e.message });
            get().addToast?.(`Failed to fetch manifest: ${e.message}`, 'error');
            throw e;
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
        forceSync: async () => {
          try {
            const state = get();
            const token = state?.auth?.token;
            if (!token) throw new Error('Not authenticated');
            const baseUrl = getApiBaseUrl() || '';
            log('info', 'sync push start', { addons: state.addons.length, profiles: state.profiles?.length });
            const res = await fetch(`${baseUrl}/api/sync?action=push`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                addons: state.addons.map(a => ({ url: a.transportUrl || a.url, enabled: a.enabled })),
                iptvProviders: state.iptvProviders,
                watchlist: state.watchlist,
                continueWatching: state.continueWatching,
                history: state.history,
                preferences: state.settings,
                profiles: state.profiles,
                activeProfileId: state.activeProfile?.id != null ? String(state.activeProfile.id) : null,
              }),
            });
            if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
            log('info', 'sync push ok');
            return { success: true };
          } catch (e) {
            log('error', 'sync push error', e.message);
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

        // ── Merge Stremio Library ──
        mergeStremioLibrary: (data) => {
          if (!data) return { movies: 0, series: 0, episodes: 0 };
          const wl = data.watchlist || [];
          const hist = data.history || [];
          const state = get();
          const existingWl = state.watchlist || [];
          const existingHist = state.history || [];
          const wlIds = new Set(existingWl.map((i) => i.id));
          const histIds = new Set(existingHist.map((i) => i.id));

          const newWl = wl.filter((item) => !wlIds.has(item.id));
          const newHist = hist.filter((item) => !histIds.has(item.id));

          // Count by type
          let movies = 0, series = 0, episodes = 0;

          for (const item of newWl) {
            if (item.type === 'series') series++;
            else movies++;
          }

          for (const item of newHist) {
            if (item.type === 'series') {
              if (item.season && item.episode) episodes++;
              else series++;
            } else {
              movies++;
            }
          }

          // Merge watchlist
          if (newWl.length > 0) {
            set((s) => ({ watchlist: [...newWl, ...s.watchlist] }));
          }

          // Merge history
          if (newHist.length > 0) {
            set((s) => ({
              history: [...newHist.map((item) => ({
                ...item,
                id: item.tmdbId || item.id,
                progress: item.watched ? 100 : 0,
                timestamp: item.timestamp || Date.now(),
              })), ...s.history],
            }));
          }

          // Store watched episode state in sessionStorage for SeasonPage checkmarks
          for (const item of [...newWl, ...newHist]) {
            if (item.type === 'series' && item.season && item.episode && item.watched) {
              try {
                const key = `bfs_watched_tv_${item.id}_s${item.season}`;
                const raw = sessionStorage.getItem(key);
                const existing = raw ? JSON.parse(raw) : {};
                existing[String(item.episode)] = true;
                sessionStorage.setItem(key, JSON.stringify(existing));
              } catch {}
            }
          }

          return { movies, series, episodes };
        },

        // ── Init helpers ──
        pullSync: async () => {
          try {
            const state = get();
            const token = state?.auth?.token;
            if (!token) return;
            const baseUrl = getApiBaseUrl() || '';
            log('info', 'sync pull start');
            const res = await fetch(`${baseUrl}/api/sync?action=pull`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
              const { data } = await res.json();
              if (data) {
                log('info', 'sync pull ok', { addons: data.addons?.length, watchlist: data.watchlist?.length, profiles: data.profiles?.length });
                // Keep existing manifests for addons that match, fetch missing ones
                const currentAddons = get().addons;
                const newAddons = await Promise.all((data.addons || []).map(async (cloudAddon) => {
                  const addonUrl = cloudAddon.url || cloudAddon.transportUrl;
                  if (!addonUrl) return null;
                  const existing = currentAddons.find(a => a.url === addonUrl || a.transportUrl === addonUrl);
                  if (existing && existing.manifest) {
                    return { ...existing, enabled: cloudAddon.enabled };
                  }
                  try {
                    const { fetchManifest } = await import('../lib/addons');
                    const proxy = get().settings?.effectiveCorsProxy || null;
                    const manifest = await fetchManifest(addonUrl, proxy);
                    return { url: addonUrl, transportUrl: addonUrl, enabled: cloudAddon.enabled, manifest };
                  } catch (e) {
                    log('warn', `manifest fetch failed: ${addonUrl}`, e.message);
                    return { url: addonUrl, transportUrl: addonUrl, enabled: cloudAddon.enabled, manifest: null };
                  }
                })).then(arr => arr.filter(Boolean));

                // Merge profiles: prefer server profiles if they exist and are non-empty
                const serverProfiles = data.profiles || [];
                const serverActiveProfileId = data.activeProfileId;
                let profiles = state.profiles;
                let activeProfile = state.activeProfile;

                if (serverProfiles.length > 0) {
                  profiles = serverProfiles.map(p => ({ ...p, id: String(p.id) }));
                  if (serverActiveProfileId) {
                    activeProfile = profiles.find(p => String(p.id) === String(serverActiveProfileId)) || profiles[0] || null;
                  } else if (!profiles.find(p => String(p.id) === String(activeProfile?.id))) {
                    activeProfile = profiles[0] || null;
                  }
                }

                set((s) => ({
                  addons: newAddons.length > 0
                    ? newAddons.map(a => {
                        const prev = s.addons.find(sa => sa.url === a.url || sa.transportUrl === a.url);
                        return { ...a, manifest: a.manifest || prev?.manifest || null };
                      })
                    : s.addons,
                  iptvProviders: data.iptvProviders?.length > 0 ? data.iptvProviders : s.iptvProviders,
                  watchlist: data.watchlist?.length > 0 ? data.watchlist : s.watchlist,
                  continueWatching: data.continueWatching?.length > 0 ? data.continueWatching : s.continueWatching,
                  history: data.history?.length > 0 ? data.history : s.history,
                  settings: data.preferences ? { ...s.settings, ...data.preferences } : s.settings,
                  profiles,
                  activeProfile,
                }));
              }
            } else {
              log('warn', `sync pull failed: ${res.status}`);
            }
          } catch (e) { log('error', 'sync pull error', e.message); }
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
                assignedAddons: data.assignedAddons || s.auth.assignedAddons || [],
              },
              recommendedAddons: data.recommendedAddons?.length ? data.recommendedAddons : s.recommendedAddons,
              ultraAddons: data.ultraAddons?.length ? data.ultraAddons : s.ultraAddons,
            }));
            if (data.user) localStorage.setItem('bfs_user', JSON.stringify(data.user));
            setLogUser(data.user.id, token);
            log('info', 'auth ok', { userId: data.user.id, tier: data.user.tier });
          } else {
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
              setLogUser(storedUser.id, token);
              log('info', 'auth restored from cache', { userId: storedUser.id });
            } else {
              log('info', 'auth none — guest session');
            }
          }
          if (get().auth.loggedIn) {
            get().pullSync();
            get().initServices();
          }
        },

        // ── Debrid Services ──
        getAvailableDebridServices: () => {
          const state = get();
          const services = [];
          
          if (state.services.torbox?.connected) {
            services.push({ 
              name: 'torbox', 
              displayName: 'TorBox',
              apiKey: state.services.torbox.apiKey 
            });
          }
          
          if (state.services.realdebrid?.connected) {
            services.push({ 
              name: 'realdebrid', 
              displayName: 'Real-Debrid',
              apiKey: state.services.realdebrid.apiKey 
            });
          }
          
          if (state.services.alldebrid?.connected) {
            services.push({ 
              name: 'alldebrid', 
              displayName: 'AllDebrid',
              apiKey: state.services.alldebrid.apiKey 
            });
          }
          
          return services;
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
