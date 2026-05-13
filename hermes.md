# Hermes Session Log — 2026-05-12

## Summary

Full-stack work session on the **BlackFlagStreams** project across both the web app (`bfs1/`) and Android app (`bfstv/`) repositories.

---

## Tasks Completed

### 1. Backend Merge — CF Functions (bfs1/src/functions/api/)
- Merged all Cloudflare Functions from `BlackFlagStreams/blackflagstream/functions/` into `bfs1/src/functions/api/`
- Copied: admin endpoints, teatv handlers, middleware, shared helpers, payments, auth flows

### 2. Trakt OAuth Endpoints
- `src/functions/api/trakt/auth.js` — Initiate OAuth flow
- `src/functions/api/trakt/status.js` — Check connection status
- `src/functions/api/trakt/disconnect.js` — Revoke token
- `src/functions/api/trakt/sync.js` — Pull watchlist/history from Trakt
- `src/functions/api/trakt/push.js` — Scrobble progress to Trakt

### 3. Stremio Relay Endpoints
- `src/functions/api/stremio/auth.js` — Authenticate with Stremio API
- `src/functions/api/stremio/status.js` — Check auth status
- `src/functions/api/stremio/disconnect.js` — Remove stored auth key
- `src/functions/api/stremio/library.js` — Fetch & resolve Stremio library (IMDB→TMDB batch resolution)

### 4. Debrid Endpoints
- `src/functions/api/realdebrid/auth.js` — Validate RD API key
- `src/functions/api/realdebrid/status.js` — Check RD key status
- `src/functions/api/realdebrid/disconnect.js` — Remove RD key
- `src/functions/api/alldebrid/auth.js` — Get AllDebrid PIN (device pairing)
- `src/functions/api/alldebrid/poll.js` — Poll PIN auth status
- `src/functions/api/alldebrid/status.js` — Check AD auth status
- `src/functions/api/alldebrid/disconnect.js` — Remove AD auth data
- `src/functions/api/torbox/auth.js` — Validate TorBox API key
- `src/functions/api/torbox/status.js` — Check TorBox key status
- `src/functions/api/torbox/disconnect.js` — Remove TorBox key
- `src/functions/api/rpdb/auth.js` — Validate RPDB API key
- `src/functions/api/rpdb/status.js` — Check RPDB key status
- `src/functions/api/rpdb/disconnect.js` — Remove RPDB key

### 5. Device Link Auth Flow
- `src/functions/api/auth/link/generate.js` — Generate 6-char linking code
- `src/functions/api/auth/link/poll.js` — Poll for approval (TV/mobile side)
- `src/functions/api/auth/link/approve.js` — Approve code from another device

### 6. Backend Bug Fixes
- **CORS origins** — Updated `bfs-admin.js` to include `blackflagstreams.link` and `beta.blackflagstreams.link`
- **Teatv catalog handler** — Fixed broken TMDB key placeholder, proper endpoint construction
- **Teatv stream handler** — Complete rewrite with correct embed providers (EmbedSu, 2Embed, SuperStream, VidSrc)
- **sync.js** — Accept `Authorization: Bearer` header instead of only query param token
- **forceSyncIPTV** — Fixed URL to use app origin, not CORS proxy
- **Device link** — Poll endpoint now returns proper `done: true/false` matching Flutter client expectations

### 7. BFSTV New Screens
- `lib/screens/watchlist_screen.dart` — Watchlist browsing with grid layout
- `lib/screens/continue_watching_screen.dart` — Continue watching with progress bars
- `lib/screens/profile_screen.dart` — User profile with account info, devices, sign out

### 8. BFSTV Navigation Wiring
- Updated `lib/main.dart` — Added `/watchlist`, `/continue`, `/profile` routes
- Updated `HomeScreen` side nav to navigate to new screens

### 9. BFSTV New Services
- `lib/services/debrid_service.dart` — Full client for Real-Debrid, All-Debrid, TorBox, RPDB
  - Token persistence via SharedPreferences
  - Magnet link resolution
  - PIN-based device pairing (AllDebrid)
  - User info retrieval

### 10. BFSTV Service Fixes
- **AppState** — Integrated DebridService, exposed token getters/setters, proper init order
- **SyncService** — Injects ConfigService, uses Authorization header, removed hardcoded token from push payload
- **StremioService** — CORS proxy now configurable via static setter (was hardcoded)
- **DeviceLinkScreen** — Uses AuthService bearer token for authenticated requests, uses customer-facing domain for QR

### 11. Android Production Prep
- Pushed version to `1.1.0+2`
- Removed unused deps (`sqflite`, `path_provider`)
- AndroidManifest: `leanback` required `true`, proper TV banner setup

### 12. Web App Production Prep
- Pushed version to `1.1.0`
- Vite config: terser minification enabled, sourcemaps disabled, ES2020 target, no console in production
- `index.html`: added `<noscript>` fallback

### 13. Architecture Documentation
- Created `bfs1/ARCHITECTURE.md` with:
  - System architecture diagram
  - Full endpoint tables for all API routes
  - Frontend and Android app structure
  - KV storage schema
  - Security model
  - Known issues & technical debt
  - Deployment instructions for both apps
- Added inline code documentation to all new backend functions

---

## Bugs Found & Fixed During Senior Dev Review

| Bug | Location | Fix |
|-----|----------|-----|
| Hardcoded CORS proxy URL | `stremio_service.dart` | Made configurable via static setter |
| Sync token in query string | `sync_service.dart` | Moved to Authorization header |
| `forceSyncIPTV` wrong URL | `store.js` (web) | Uses `getApiBaseUrl()` instead of CORS proxy |
| Device link poll/approve mismatch | `auth/link/` endpoints | Added `/poll` endpoint, returns `done: true/false` |
| Missing `_auth-legacy.js` | Backend | Not needed — legacy auth not in active use; documented in ARCHITECTURE.md |
| Teatv broken TMDB references | `teatv/catalog/`, `teatv/stream/` | Rewrote with proper TMDB key and endpoint construction |
| CORS origins missing new domain | `bfs-admin.js` | Added `blackflagstreams.link` and `beta.blackflagstreams.link` |
| Android Manifest leanback not required | `AndroidManifest.xml` | Set `leanback` required `true` for TV listing |

---

## Notes

- `ARCHITECTURE.md` is the single source of truth for system documentation
- All new CF Functions include inline JSDoc-style documentation
- The legacy auth endpoint (`/api/streams`) is flagged for deprecation but preserved for backward compat
- Debrid token storage on Android is via SharedPreferences (not encrypted at rest) — flagged in ARCHITECTURE.md known issues