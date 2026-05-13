# Dev Log — BlackFlagStreams v0.2.2 BETA

## Session: 2026-05-11 — Multi-Phase Overhaul

### Overview
Full-stack work across frontend (React 19 + Zustand + Vite 8), backend (Cloudflare Pages Functions), and infrastructure (openprox Cloudflare Worker). Started from existing v0.2.0 BETA with Trakt OAuth partially implemented and filtering in progress. Ended with v0.2.2 BETA deployed to production at `blackflagstream.pages.dev`.

---

## Phase A: Trakt 2-Way Sync Completion

### What Was Done
- Completed Zustand store actions: `setTraktStatus`, `mergeTraktHistory`, `syncTraktNow`, `initTraktStatus`, `disconnectTraktAccount`
- Extended `updateProgress()` to enqueue Trakt pushes when connected + auto-sync on
- Added Trakt Sync UI section to SettingsPage (between Stremio Import and Debrid)
- Connect button opens OAuth popup, on close polls for connection status
- Sync Now pulls history from Trakt via backend, merges into continueWatching
- Auto-sync toggle persisted to localStorage

### Files Changed
- `src/lib/store.js` — Trakt state + actions
- `src/pages/SettingsPage.jsx` — Trakt Sync section UI
- `src/App.jsx` — `initTraktStatus()` call on mount

### Outcome
Trakt connect/disconnect/sync/auto-sync all functional. Watch progress pushes to Trakt when auto-sync is on (30s debounced batching).

---

## Phase B: Sidebar Redesign + Bug Fixes

### What Was Done
- **Sidebar hover trap fix**: Converted from pure CSS `:hover` to React state-based expand/collapse with 120ms enter delay. Overlay click dismisses the sidebar. Nav links auto-collapse on click.
- **Icon sizing**: Bumped SVG icons from 28px to 34px, thinner stroke (1.6)
- **TMDB key error**: Removed TMDB API Key and CORS Proxy override inputs from Settings Advanced section (they come from global config)
- **Trakt init guard**: Added `isLoggedIn()` check to `initTraktStatus` to prevent "Not authenticated" spam on boot

### Files Changed
- `src/components/Sidebar.jsx` — state-based expand, bigger icons, click-to-dismiss
- `src/index.css` — Replaced 11 `.sidebar-wrapper:hover` rules with `.sidebar-wrapper.expanded` class
- `src/pages/SettingsPage.jsx` — Removed TMDB/proxy input fields
- `src/lib/store.js` — Guarded initTraktStatus

### Outcome
Sidebar no longer traps users. Icons more visible. Settings page cleaner without unnecessary override fields.

---

## Phase C: Advanced Multi-Select Filtering

### What Was Done
- Created reusable `FilterDropdown` component (multi-select checkboxes, chip display, click-outside-close)
- Created `FilterBar` component with Genre (multi), Year (decades), Rating (7+/8+/9+), Parental Rating (multi), Hide Watched toggle, Clear All
- Integrated into MoviesPage and SeriesPage replacing old single-select chips
- Filter state drives TMDB discover params: `with_genres`, `vote_average.gte`, `primary_release_date.gte/.lte`, `certification` + `certification_country=US`
- `applyHideWatched()` client-side filter against `continueWatching` where `percent >= 90`

### Files Created
- `src/components/FilterDropdown.jsx`
- `src/components/FilterBar.jsx`
- `src/components/FilterBar.css`

### Files Changed
- `src/pages/MoviesPage.jsx` — FilterBar integration
- `src/pages/SeriesPage.jsx` — FilterBar integration

### Outcome
Full multi-select filtering on Movies and Series pages. Year uses decade presets (TMDB only supports date ranges, not year equality). Rating uses TMDB `vote_average` (Rotten Tomatoes unavailable on free tier).

---

## Phase D: Trakt Backend (Cloudflare Functions)

### What Was Done
- Created 6 backend functions under `functions/api/trakt/`:
  - `auth.js` — PKCE code_verifier + code_challenge, stores verifier in KV (TTL 10min), returns Trakt authorize URL
  - `callback.js` — Exchanges OAuth code for tokens, stores in KV at `trakt_token:{userId}`, returns success HTML (closes popup)
  - `status.js` — Checks stored tokens, auto-refreshes if expired, fetches username
  - `disconnect.js` — Deletes `trakt_token:{userId}` from KV
  - `sync.js` — Pulls watched movies + shows from Trakt, returns BFS-formatted items
  - `push.js` — Accepts BFS progress items, POSTs to Trakt `/sync/history`

### Env Vars Required
- `TRAKT_CLIENT_ID`
- `TRAKT_CLIENT_SECRET`
- `TRAKT_REDIRECT_URI` = `https://blackflagstream.pages.dev/api/trakt/callback`

### Outcome
Server-side OAuth token storage in KV. Frontend never sees raw Trakt tokens. Full 2-way sync operational.

---

## Phase E: Stremio Syncio-Style OAuth

### What Was Done
- Implemented Stremio device pairing flow (like Syncio) using `link.stremio.com/api/v2`
- Backend: `functions/api/stremio/` — auth.js (create pairing code), poll.js (read authKey), status.js (verify), disconnect.js (cleanup)
- Frontend: Replaced manual authKey copy-paste with "Connect Stremio" button
- Popup/polling pattern: opens Stremio auth page, polls CF Function every 3s, auto-completes when authorized

### Files Created
- `functions/api/stremio/auth.js`
- `functions/api/stremio/poll.js`
- `functions/api/stremio/status.js`
- `functions/api/stremio/disconnect.js`

### Outcome
Stremio connection no longer requires users to manually find authKey in DevTools. Syncio-style pairing flow with 5-minute code expiry.

---

## Phase F: First-Class Service Integrations (Settings Dashboard)

### What Was Done — Architecture
Created a unified service connection framework replacing scattered sections (Stremio Import, Trakt Sync, Debrid Services) with a reusable `ServiceCard` grid. Each service follows the Trakt integration pattern: backend CF Function relay → KV token storage → frontend client library → Zustand store → ServiceCard UI.

### Services Integrated
| Service | Auth Method | Status |
|---------|-------------|--------|
| Trakt | OAuth2 PKCE popup | Existing, now in ServiceCard |
| Stremio | link.stremio.com device pairing | New Syncio-style |
| TorBox | API key (validated server-side) | Promoted from client-only to server-backed |
| Real-Debrid | OAuth2 device code flow | New (needs RD_CLIENT_ID env var) |
| All-Debrid | PIN flow | New |
| RPDB | API key | New |

### Files Created
- `src/lib/services.js` — Unified client library (~195 lines, wraps all 6 services)
- `src/components/ServiceCard.jsx` — Reusable component (~460 lines, handles all auth flows)
- `src/components/ServiceCard.css` — Card styling with dark theme
- Backend: 19 new CF Functions across `functions/api/{stremio,torbox,realdebrid,alldebrid,rpdb}/`

### Files Changed
- `src/lib/store.js` — Added `services` state slice + `initServices()`, `connectService()`, `disconnectService()`, `setServiceStatus()` actions. All old Trakt actions now sync to both `settings.trakt*` and `services.trakt` for backward compatibility.
- `src/pages/SettingsPage.jsx` — Replaced 3 sections with `<div className="services-grid"><ServiceCard serviceKey="trakt" />...`
- `src/pages/SettingsPage.css` — Added `.services-grid` (responsive 2-column grid)
- `src/App.jsx` — `initServices()` replaces `initTraktStatus()` (later moved to SettingsPage only)

### Outcome
Unified settings dashboard showing 6 service cards in a responsive grid. Each card self-contained with connect/disconnect/status logic. KV key convention: `service:{serviceName}:{userId}`.

### Known Issue
Real-Debrid requires `RD_CLIENT_ID` and `RD_CLIENT_SECRET` env vars set in Cloudflare Pages. These haven't been configured yet.

---

## Phase G: Loading States + Stream Filter UI

### What Was Done
- **BFS Logo loading**: Replaced static skeleton on DetailPage and EpisodePage with pulsing BFS logo animation
- **Stream filters**: Added 360p to filter list, widened buttons, added "⚡ Searching for streams..." with red flash animation
- **Form styles**: Fixed washed-out inputs/selects across the site — brighter backgrounds, red focus glow, custom dropdown chevron, checkbox accent color

### Files Changed
- `src/pages/DetailPage.jsx` — Logo import, loading state, filter/search improvements
- `src/pages/DetailPage.css` — `@keyframes logoPulse`, `.stream-searching` flash animation, wider filter buttons
- `src/pages/EpisodePage.jsx` — Same loading + filter improvements
- `src/index.css` — Form input/select/checkbox overhaul (background, focus, hover states)

### Outcome
Loading states feel polished with brand logo pulsing. Stream filters are more visible with better spacing. All form elements have proper contrast and visual feedback.

---

## Phase H: Player Page Overhaul

### What Was Done
Complete player controls redesign with new buttons and pirate-themed accents.

### New Controls Added
| Control | Action |
|---------|--------|
| ⏪10 | Skip back 10 seconds |
| 10⏩ | Skip forward 10 seconds |
| 1x button | Playback speed menu (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x) |
| 📺 | Episodes slide-out panel (TV only) |
| 📡 | Cast (browser menu guidance) |
| 🖼️ | Picture-in-Picture |
| ↗️ | External player (opens URL in new tab) |
| 🎬 | Fullscreen (gold thumb accent) |
| EQ bars | Audio track selector |

### Episode Panel
- Slide-out from right side with animation
- Fetches real TMDB data: episode thumbnails (still images), titles, runtime, overview (truncated)
- Current season auto-expands, other seasons load on expand
- Current episode highlighted with red accent
- Click navigates to player with new episode

### Pirate-Themed Styling
- Progress bar: red → gold gradient with gold glowing thumb
- Skip button badges: red accent background with "10" text
- All controls slightly larger (22-24px icons)
- Responsive: controls shrink on mobile

### Files Changed
- `src/pages/PlayerPage.jsx` — +8KB of new controls, episode panel, audio tracks, PiP, speed menu
- `src/pages/PlayerPage.css` — +3KB of episode panel, thumbnail, overview, badge, responsive styles

### Outcome
Full-featured player matching Stremio capabilities plus extras (speed control, episode browser, external player). Pirate theme with gold/red accents throughout.

---

## Phase I: Stream Cache Fix

### Problem
Removing an addon and adding a new one would still show cached streams from the old addon. The Refresh button served cached results without re-fetching. New addons' streams never appeared until cache expired.

### Root Cause
`loadStreams()` checked IndexedDB cache first and returned immediately if cached streams existed — even when addons had changed.

### Fix
1. **Force refresh**: Refresh button now calls `loadStreams(true)` which bypasses cache and re-fetches from all addons
2. **Auto-clear**: `addAddon()` and `removeAddon()` in store now call `clearStreamCache()` to invalidate all stream caches when the addon list changes
3. **Proxy pass-through**: `fetchStreams()` was calling `safeFetch(url)` WITHOUT passing the `proxyUrl` parameter. When direct connections to addon servers failed, there was no proxy fallback. Fixed by passing `proxyUrl` through the entire chain: `DetailPage → fetchAllStreams(proxyUrl) → fetchStreams(proxyUrl) → safeFetch(url, timeout, proxyUrl)`
4. **Direct-first fetching**: `safeFetch()` now tries direct connection first (most Stremio addons have CORS headers), only falls back to proxy if direct fails

### Files Changed
- `src/pages/DetailPage.jsx` — `loadStreams(force)` parameter, `fetchAllStreams` proxyUrl
- `src/pages/EpisodePage.jsx` — Same changes
- `src/lib/store.js` — `clearStreamCache()` calls in `addAddon()` and `removeAddon()`
- `src/lib/addons.js` — Direct-first `safeFetch()`, proxyUrl pass-through in `fetchStreams()` and `fetchAllStreams()`

### Outcome
Addon changes immediately reflected in stream results. Refresh always fetches fresh data. Proxy fallback works correctly for addons without CORS headers.

---

## Phase J: Admin Console Enhancements

### What Was Done
Expanded admin user editing from tier/ban only to full user management.

### New Edit Modal Fields
- **Email** — inline edit with duplicate check
- **Tier** — dropdown (Free, Account, Premium, Pro, Ultra)
- **Billing Price** — custom USD amount for next billing cycle
- **Password Reset** — generate random password (Crypto API), optionally email via Resend
- **BETA Tester** — checkbox (grants free Premium upgrade)
- **Ultra Captain** — checkbox (separate unlimited plan)
- **Ban** — checkbox (walk the plank)

### Backend API Changes
`POST /api/admin/users` now supports: `email`, `newPassword`, `sendPasswordEmail`, `billingPrice`, `isBeta`, `isUltra`, `banned`, `tier`. Email changes update both `user:{id}` and `user:{email}` KV keys. Password resets hash and store, then send formatted HTML email via Resend.

### Files Changed
- `functions/api/admin/users.js` — Expanded POST handler (72 → 136 lines)
- `src/pages/AdminPage.jsx` — Full edit modal (18KB → 24KB)

### Outcome
Admin can fully manage users without touching KV directly. Password reset emails sent automatically. BETA flag grants free Premium tier.

---

## Phase K: Services Auth Fix

### Problem
`initServices()` was called on every app boot (in AppShell's useEffect), firing 6 parallel API calls to service status endpoints on EVERY page load. This caused "Requesting Trakt auth URL..." / "Requesting Stremio pairing code..." spam in console on movie/series pages, wasting bandwidth and potentially hitting rate limits.

### Fix
Moved `initServices()` from `App.jsx` (AppShell) to `SettingsPage.jsx`. Service statuses are now only checked when the user actually visits the Settings page, not on every navigation.

### Files Changed
- `src/App.jsx` — Removed `initServices` import and call
- `src/pages/SettingsPage.jsx` — Added `useEffect(() => { initServices(); }, [])`

### Outcome
No more service API calls on movie/series pages. Services only checked when Settings is visited.

---

## Phase L: Infrastructure

### openprox Worker
- Redeployed `openprox` Cloudflare Worker at `openprox.michaelrobgrove.workers.dev`
- Verified: ALLOWED_HOSTS = "*", worker version `007a0120`

### Version Bump
- `src/lib/version.js`: `v0.2.0 BETA` → `v0.2.2 BETA`

### Deployments
All deployments to production via `npx wrangler pages deploy dist --project-name=blackflagstream --branch=main`. Production branch is `main` (not `master`).

---

## Phase M: Bug Fixes — Stream 400 Errors & Service Connectivity (May 11, 4:30 PM)

### What Was Done
Investigated and fixed 5 bugs reported by user: "streams getting 400 error and connected apps in settings not working."

### Bug 1: Math.random() in Stream Dedup (addons.js:202, EpisodePage.jsx:106)
**Problem**: When streams lacked url/infoHash/ytId/externalUrl fields (e.g., BFS Direct extraction fallback), `Math.random()` generated a new key every render, causing duplicate entries on re-fetch and unpredictable dedup.
**Fix**: Replaced `Math.random()` with deterministic key `${_addonId}:${title || name}` — same stream from same addon always deduplicates correctly.
**Files**: `src/lib/addons.js:203`, `src/pages/EpisodePage.jsx:106`

### Bug 2: buildPlayableUrl() Ignored externalUrl Streams (addons.js:239)
**Problem**: `buildPlayableUrl()` returned `null` for streams with only `externalUrl` (no `url` field). These streams silently did nothing on click — no navigation, no player, no error.
**Fix**: Added `if (stream.externalUrl) return stream.externalUrl` fallback before the final `return stream.url`, so external-url streams navigate correctly.
**Files**: `src/lib/addons.js:265`

### Bug 3: Stale Stream Cache After Addon Toggle (store.js:426-431)
**Problem**: `toggleAddon()` didn't call `clearStreamCache()`, so enabling/disabling addons left stale cached streams in IndexedDB. "Refresh" showed old addon's streams until 2h cache expired.
**Fix**: Added `clearStreamCache()` call in `toggleAddon()` alongside existing calls in `addAddon()` and `removeAddon()`.
**Files**: `src/lib/store.js:430`

### Bug 4: Proxy URL Double-Encoding (addons.js:82-84)
**Problem**: `safeFetch` constructed proxy URLs by string concatenation (`${proxyUrl}?url=...`), but if proxyUrl already contained `?` or `url=`, this produced malformed URLs like `proxy?existing=1&url=...` or `proxy?url=...&url=...`.
**Fix**: Replaced manual string concatenation with `new URL(proxyUrl); parsedProxy.searchParams.set('url', resolvedUrl)` — the URL API handles existing params, encoding, and deduplication correctly.
**Files**: `src/lib/addons.js:83-85`

### Bug 5: Service Status Silent Failures (store.js:194-217)
**Problem**: `initServices()` chained `.then()` calls without `.catch()`. When any service status API call failed (e.g., expired token, network error), the unhandled rejection silently failed and no services showed as connected — even if they were. All 6 cards showed "disconnected."
**Fix**: Restructured using `Promise.allSettled` with `try/catch` per service, plus added error logging (`ERR(...)`) and a summary warning if any services failed to initialize.
**Files**: `src/lib/store.js:194-219`

### Bug 6: EpisodePage Missing Cache Write After Stream Fetch
**Problem**: Episode fetched streams but never wrote them to IDB cache. Subsequent visits re-fetched from network.
**Fix**: Added `setCachedStreams('tv_episode', ...)` call after stream fetch completes.
**Files**: `src/pages/EpisodePage.jsx:117-118`

### Files Changed
- `src/lib/addons.js` — Dedup key fix, buildPlayableUrl externalUrl fix, proxy URL fix
- `src/pages/EpisodePage.jsx` — Dedup key fix, cache write after fetch
- `src/lib/store.js` — Cache clearing on toggle, initServices error handling

### Outcome
- Streams with externalUrl-only entries now navigate correctly
- Dedup is deterministic — no more phantom duplicates
- Cache clears properly on toggle/enable/disable/add/remove
- Proxy URLs are correctly constructed regardless of existing query params
- Service status checks log errors and don't silently swallow failures
- Episode streams are cached for 2h like movie streams

---

## Files Summary

### Created (30 files)
| Layer | Files |
|-------|-------|
| Components | `FilterDropdown.jsx`, `FilterBar.jsx`, `FilterBar.css`, `ServiceCard.jsx`, `ServiceCard.css` |
| Libraries | `services.js`, `trakt.js` |
| Backend Trakt | `auth.js`, `callback.js`, `status.js`, `disconnect.js`, `sync.js`, `push.js` |
| Backend Stremio | `auth.js`, `poll.js`, `status.js`, `disconnect.js` |
| Backend TorBox | `auth.js`, `status.js`, `disconnect.js` |
| Backend Real-Debrid | `auth.js`, `poll.js`, `status.js`, `disconnect.js` |
| Backend All-Debrid | `auth.js`, `poll.js`, `status.js`, `disconnect.js` |
| Backend RPDB | `auth.js`, `status.js`, `disconnect.js` |
| Config | `CLAUDE.md`, `.claude/memory/` |

### Modified (15 files)
| File | Changes |
|------|---------|
| `src/lib/store.js` | Services slice, cache clearing, Trakt actions |
| `src/pages/SettingsPage.jsx` | Services grid, Trakt section, initServices |
| `src/pages/DetailPage.jsx` | Logo loading, filters, cache fix, proxyUrl |
| `src/pages/EpisodePage.jsx` | Logo loading, filters, cache fix, proxyUrl |
| `src/pages/PlayerPage.jsx` | Full control overhaul, episode panel, audio tracks |
| `src/pages/PlayerPage.css` | Episode panel, thumbnails, badges, responsive |
| `src/pages/MoviesPage.jsx` | FilterBar integration |
| `src/pages/SeriesPage.jsx` | FilterBar integration |
| `src/pages/AdminPage.jsx` | Full user edit modal |
| `src/components/Sidebar.jsx` | State-based expand, bigger icons |
| `src/index.css` | Sidebar expand class, form input overhaul |
| `src/App.jsx` | initServices (added then moved) |
| `src/lib/addons.js` | Direct-first safeFetch, proxyUrl pass-through |
| `src/lib/version.js` | v0.2.0 → v0.2.2 BETA |
| `functions/api/admin/users.js` | Expanded POST handler |

---

## Environment Variables Required

Set in Cloudflare Pages → Settings → Environment Variables:

| Variable | Purpose | Status |
|----------|---------|--------|
| `TMDB_API_KEY` | TMDB v3 API key for metadata | Set |
| `TRAKT_CLIENT_ID` | Trakt OAuth app client ID | Set |
| `TRAKT_CLIENT_SECRET` | Trakt OAuth app client secret | Set |
| `TRAKT_REDIRECT_URI` | Trakt OAuth callback URL | Set |
| `RD_CLIENT_ID` | Real-Debrid OAuth client ID | **Not set** |
| `RD_CLIENT_SECRET` | Real-Debrid OAuth client secret | **Not set** |
| `CORS_PROXY` | Legacy — now using openprox Worker | Optional |
| `SYSTEM_NOTICE` | Global notice banner text | Optional |

---

## Known Issues / Pending

1. **Service auth not confirmed working**: User reported "failed to authenticate" on all services. Moved initServices to Settings-only to reduce noise. May need production debugging with actual console errors.
2. **Real-Debrid env vars**: Not yet configured, RD service card will show "not configured" error.
3. **Subtitles**: HLS-embedded subtitles work. External subtitle fetching from OpenSubtitles addon not yet integrated into player — addon-provided subtitles are separate from HLS tracks.
4. **mediaflow-proxy**: Evaluated but not implemented. It's Python/Docker, can't run on Cloudflare Workers directly. Would need a VPS or Docker host.
5. **Stream data flashiness**: User requested more prominent quality/size display for choosing links. Not yet implemented.
6. **Auto stream selection**: User requested auto-play when only 1 stream available. Not yet implemented.
