# BlackFlagStreams — Architecture & Technical Reference

> Last updated: 2026-05-12

## Overview

BlackFlagStreams is a streaming aggregation platform consisting of:
- **Web App** (`bfs1/`) — React/Vite frontend + Cloudflare Pages Functions backend
- **Android App** (`bfstv/`) — Flutter/Kotlin TV application
- **Shared Backend** — Cloudflare Workers + KV storage

## Architecture Diagram

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Web App       │────▶│  Cloudflare Pages     │────▶│  KV (SYNC_KV)   │
│   (bfs1/)       │     │  Functions (API)      │     │  User data      │
│   React/Vite    │     │  - Auth               │     │  Sync state     │
│   Zustand store │     │  - Admin              │     │  Config         │
│                 │     │  - Sync               │     │  Addon configs  │
└────────┬────────┘     │  - Trakt relay        │     │  AIOStreams     │
         │              │  - Stremio relay       │     │  profiles/keys  │
         │              │  - AIOStreams proxy    │     └────────┬────────┘
         │              │  - TeaTV catalog/stream│              │
         │              └───────────┬────────────┘              │
         │                          │                          │
         │    ┌─────────────────────┘                          │
         │    │                                                │
         ▼    ▼                                                ▼
   ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌────────────────────┐
   │ TMDB API │  │ Trakt API │  │ Stremio   │  │   AIOStreams       │
   │          │  │           │  │ API       │  │   (Self-hosted)    │
   │ (movies) │  │ (sync)    │  │ (addons)  │  ├────────────────────┤
   │          │  │           │  │           │  │ Torrent discovery  │
   └──────────┘  └───────────┘  └───────────┘  │ Debrid cache check │
                                                │ Link resolution    │
                                                │ - Real-Debrid      │
                                                │ - All-Debrid       │
                                                │ - TorBox           │
                                                └────────────────────┘
```

## Backend Structure (`bfs1/src/functions/api/`)

### Auth Endpoints
| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/register` | POST | Register with email/password (14+ chars, symbol, number, uppercase) |
| `/api/auth/login` | POST | Login, returns session token + user data + tier limits |
| `/api/auth/refresh` | GET | Refresh session (legacy — kept for backwards compat) |
| `/api/auth/verify` | POST | Verify email with 6-digit code |
| `/api/auth/resend` | POST | Resend verification email via Resend |
| `/api/auth/session` | GET | Validate Bearer token, return user + assigned addons |
| `/api/auth/request-otp` | POST | Request OTP for admin 2FA |
| `/api/auth/verify-otp` | POST | Verify admin 2FA TOTP |
| `/api/auth/link/generate` | POST | Generate 6-char device linking code (authenticated) |
| `/api/auth/link/poll` | GET | Poll for link approval (used by TV/mobile app) |
| `/api/auth/link/approve` | POST | Approve link code from another device |

### Admin Endpoints
| Route | Method | Description |
|-------|--------|-------------|
| `/api/bfs-admin` | POST | Multi-action admin API (2FA setup, user CRUD, addons, nuke) |
| `/api/admin/addons` | GET | Fetch global/recommended addons from KV |
| `/api/admin/config` | GET | System config (tmdb key mask, CORS proxy, notice) |
| `/api/admin/users` | GET | List all users (paginated) |
| `/api/admin/stats` | GET | System statistics |
| `/api/admin/danger` | POST | Dangerous operations (requires double confirmation) |
| `/api/admin/request-otp` | POST | Request TOTP for admin login |
| `/api/admin/verify-otp` | POST | Verify admin TOTP |

### Sync Endpoints
| Route | Method | Description |
|-------|--------|-------------|
| `/api/sync` | GET `?action=pull&token=` | Pull user sync data (addons, watchlist, iptv) |
| `/api/sync` | POST `?action=push` | Push sync data (token in Authorization header) |

### Service Integration Endpoints
| Route | Method | Description |
|-------|--------|-------------|
| `/api/trakt/auth` | GET | Initiate Trakt OAuth flow |
| `/api/trakt/status` | GET | Check Trakt connection status |
| `/api/trakt/disconnect` | POST | Revoke Trakt token |
| `/api/trakt/sync` | POST | Pull watchlist/history from Trakt |
| `/api/trakt/push` | POST | Scrobble watch progress to Trakt |
| `/api/stremio/auth` | POST | Generate Stremio device pairing code |
| `/api/stremio/poll` | POST | Poll Stremio pairing for completion |
| `/api/stremio/status` | GET | Check Stremio connection status |
| `/api/stremio/disconnect` | POST | Remove Stremio auth key |
| `/api/stremio/library` | GET | Fetch & resolve Stremio library (IMDB→TMDB) |
| `/api/realdebrid/auth` | POST | Validate and store Real-Debrid API key |
| `/api/realdebrid/status` | GET | Check RD API key status |
| `/api/realdebrid/disconnect` | POST | Remove stored RD API key |
| `/api/alldebrid/auth` | POST | Get AllDebrid PIN for device pairing |
| `/api/alldebrid/poll` | POST | Poll AllDebrid PIN auth status |
| `/api/alldebrid/status` | GET | Check AllDebrid auth status |
| `/api/alldebrid/disconnect` | POST | Remove AllDebrid auth data |
| `/api/torbox/auth` | POST | Validate TorBox API key |
| `/api/torbox/status` | GET | Check TorBox key status |
| `/api/torbox/disconnect` | POST | Remove TorBox key |
| `/api/rpdb/auth` | POST | Validate RPDB API key |
| `/api/rpdb/status` | GET | Check RPDB key status |
| `/api/rpdb/disconnect` | POST | Remove RPDB key |

### Data / Stream Endpoints
| Route | Method | Description |
|-------|--------|-------------|
| `/api/teatv/manifest.json` | GET | Stremio-compatible manifest |
| `/api/teatv/catalog/[type]/[id].json` | GET | Catalog items (TMDB-backed) |
| `/api/teatv/stream/[type]/[id].json` | GET | Resolve streams from embed providers |
| `/api/debrid/streams` | GET | AIOStreams-proxied stream resolution |
| `/api/debrid/resolve` | POST | Batch infoHash → URL via AIOStreams |
| `/api/torrent/streams` | GET | AIOStreams torrent discovery + cache check |
| `/api/torrent/resolve` | POST | Single infoHash → URL via AIOStreams |
| `/api/aiostreams/settings` | GET/POST | User debrid preferences (res/lang/size) |

### AIOStreams Internal
| Route | Method | Description |
|-------|--------|-------------|
| `/api/aiostreams/_userdata` | — | Shared helpers (buildUserData, encodeUserData, key mgmt) |

### Legacy / Internal
| Route | Method | Description |
|-------|--------|-------------|
| `/api/streams` | GET | Internal stream resolution |
| `/api/beta-apply` | POST | Beta access request |
| `/api/torrent/token` | POST | Generate torrent proxy token (premium feature) |

## Frontend Structure (`bfs1/src/`)

```
src/
├── pages/
│   ├── HomePage.jsx           — Trending, Popular, Top Rated rows
│   ├── SearchPage.jsx         — Search across movies/series
│   ├── DetailPage.jsx         — Movie/TV detail with season/episode picker
│   ├── PlayerPage.jsx         — Video playback page
│   ├── MoviesPage.jsx         — Movie browse with sort options
│   ├── SeriesPage.jsx         — Series browse
│   ├── AddonsPage.jsx         — Stremio addon manager
│   ├── LiveTVPage.jsx         — Live TV channels
│   ├── WatchlistPage.jsx      — User watchlist
│   ├── HistoryPage.jsx        — Watch history
│   └── SettingsPage.jsx       — Account, services, app settings
├── components/
│   ├── MediaCard.jsx          — Poster card with hover effects
│   ├── MediaRow.jsx           — Horizontal scroll row of cards
│   ├── HeroBanner.jsx         — Featured content hero
│   ├── ServiceCard.jsx        — Service connection status card
│   ├── StreamTile.jsx         — Stream option tile
│   └── FocusTile.jsx          — Keyboard-focusable tile
├── lib/
│   ├── store.js               — Zustand global store (persisted)
│   ├── auth.js                — Auth helpers, token mgmt
│   ├── tmdb.js                — TMDB API client
│   ├── trakt.js               — Trakt sync helpers
│   ├── addons.js              — Stremio addon manager
│   └── services.js            — Debrid service clients
├── hooks/
│   ├── useServiceCard.js      — Service card state management
│   └── useDebrid.js           — Debrid file resolution
└── pages_player/
    └── Player.jsx             — Video.js player wrapper
```

## Android App Structure (`bfstv/`)

```
lib/
├── main.dart                       — App entry, routes, splash
├── theme.dart                      — Color constants, ThemeData
├── models/
│   ├── media_item.dart             — MediaItem, Season, Episode
│   ├── stream_item.dart            — StreamItem, AddonConfig, IptvProvider
│   └── user.dart                   — BfsUser
├── services/
│   ├── app_state.dart              — Main ChangeNotifier (auth, tmdb, sync, debrid)
│   ├── auth_service.dart           — Login, logout, token restore
│   ├── tmdb_service.dart           — TMDB API client
│   ├── stremio_service.dart        — Stremio addon/stream fetching
│   ├── sync_service.dart           — Server sync (pull/push)
│   ├── config_service.dart         — Config fetch + local cache
│   └── debrid_service.dart         — RD, AD, TorBox, RPDB clients
├── screens/
│   ├── home_screen.dart            — Main home with side nav
│   ├── login_screen.dart           — Email/password login
│   ├── browse_screen.dart          — TMDB browse by type
│   ├── search_screen.dart          — TMDB search
│   ├── detail_screen.dart          — Detail + seasons + streams
│   ├── player_screen.dart          — ExoPlayer video playback
│   ├── settings_screen.dart        — Account, services, about
│   ├── addons_screen.dart          — Stremio addon manager
│   ├── device_link_screen.dart     — Device linking (generate + poll)
│   ├── live_tv_screen.dart         — Live TV channels
│   ├── watchlist_screen.dart       — Watchlist browse
│   ├── continue_watching_screen.dart — Continue watching list
│   └── profile_screen.dart         — User profile view
└── widgets/
    ├── media_card.dart             — Poster card grid item
    ├── stream_tile.dart            — Stream option list tile
    └── focus_tile.dart             — D-pad focusable container
```

## KV Storage Schema

| Key Pattern | Description |
|-------------|-------------|
| `user:{uid}` | User data (email, name, tier, passHash, salt, profiles, devices) |
| `user:{email}` | Email → UID index |
| `session:{token}` | Session token → {userId, created} |
| `sync:{userId}` | Sync data blob (addons, watchlist, continueWatching, preferences) |
| `admin:global_addons` | Forced global addon configs |
| `admin:recommended_addons` | Recommended addon list |
| `admin:2fa_secret` | Admin TOTP secret |
| `link:{code}` | Device link code → {userId, approved} |
| `user:{userId}` | User record (duplicate — legacy) |
| `admin:aiostreams_default_profile` | Default AIOStreams UserData profile (admin-controlled) |
| `aiostreams:{userId}` | Per-user AIOStreams overrides (debrid keys + quality settings) |

## Security Model

1. **API Auth**: Bearer token in Authorization header → validated against `session:{token}` in KV
2. **Admin Auth**: Separate `X-Admin-Token` header + optional TOTP (`X-TOTP`)
3. **CORS**: Managed per-endpoint; sync/admin use allowed origin lists, data endpoints use `*`
4. **Rate Limiting**: Not implemented at CF level; relies on Cloudflare plan limits
5. **Legacy Auth**: `/api/streams` endpoint still uses pre-auth token in URL params (flagged for deprecation)

## Known Issues & Technical Debt

1. **Legacy auth endpoint** (`/api/streams`) serves unsecured streams — needs auth gate
2. **No refresh token rotation** — sessions valid for 90 days, then re-login required
3. **Addon configs stored as raw JSON** — no validation or versioning
4. **Debrid tokens stored in app local storage** — not encrypted at rest
5. **Trakt endpoints need OAuth2 flow** — partial implementation only
6. **TeaTV stream quality is variable** — embed providers can be unreliable
7. **No pagination on sync pull** — large libraries may hit KV size limits
8. **`forceSyncIPTV` URL bug** — was hitting CORS proxy instead of app origin (fixed)
9. **Poll endpoint mismatch** — Flutter client called `/poll` but server used `/approve` (fixed)
10. **Hardcoded CORS proxy** in Android stremio_service (made configurable)
11. **AIOSTreams integration** — All custom YTS/EZTV + debrid API code replaced with AIOStreams proxy. Old `_debrid.js` deleted. Backend now routes all debrid resolution through `x-aiostreams-user-data` header. Frontend Debrid Management section controls resolutions/languages/size limits.
12. **Stremio auth updated** — Stremio now uses code-based device linking (like AllDebrid PIN flow) instead of email/password auth. User visits strem.io/link, enters a code, and BFS polls for completion.

## Deployment

### Web App (Vite + Cloudflare Pages)
```bash
cd bfs1
npm install
npm run build  # outputs to dist/
# Deploy via Wrangler or Cloudflare Pages CI
```

Requires env vars:
- `TMDB_API_KEY`
- `SYNC_KV` (KV namespace binding)
- `ADMIN_TOKEN`
- `ADMIN_2FA_ENABLED` (optional)
- `RESEND_API_KEY` (optional, for email verification)

### Android App (Flutter)
```bash
cd bfstv
flutter pub get
flutter build apk --release
# or: flutter build appbundle
```

Requires `local.properties` with:
- (No secrets needed — all API calls go through app's own backend proxy)