# AIOStreams Debrid Refactor Plan

**Goal**: Replace custom debrid integration with a dedicated self-hosted AIOStreams instance. BFS owns the UX/branding while AIOStreams handles discovery/resolution.

**Status**: Complete — All tasks implemented and deployed

---

## 1. Completed Implementation

### 1.1 Stream Resolution & Navigation
- [x] **PlayerPage Rewrite**: Implemented overlay with poster background, pulsing logo, and status messages.
- [x] **Navigation Logic**: `DetailPage.jsx` and `EpisodePage.jsx` now navigate to Player with `resolve` parameters for `needs-debrid` streams.
- [x] **Resolve Flow**: `PlayerPage` handles debrid resolution (with retry) and CORS proxy fallback.

### 1.2 Backend & Provisioning
- [x] **AIOStreams Provisioning**: `_userdata.js` creates per-user accounts.
- [x] **Config Sync**: Automatic sync on debrid key changes.
- [x] **Legacy Migration**: Automatic migration of TorBox keys from legacy KV.
- [x] **Resolution Mapping**: Correct mapping of resolution preferences to AIOStreams config.

### 1.3 UX & Robustness
- [x] **Stream Limiting**: Max 20 per source, 6 per resolution tier.
- [x] **Sorting**: TorBox-first sorting implemented.
- [x] **Watched State**: Per‑episode watched state integration.

---

## 2. Remaining Tasks

### 2.1 Stremio Integration (High Priority)
- [x] **UI**: Add "Import Library" button to SettingsPage (Stremio service card).
- [x] **Store**: Implement `mergeStremioLibrary` action in `store.js`.
- [x] **Session**: Populate `sessionStorage` on import for SeasonPage checkmarks.

### 2.2 Debrid Management (High Priority)
- [x] **Sync Button**: Add "Sync Debrid Config" button to manual trigger `POST /api/aiostreams/sync`.
- [x] **Diagnostics**: Implement `/api/aiostreams/diagnostics` for admin/user account state checking.

### 2.3 OAuth & UX (Medium Priority)
- [x] **Trakt OAuth**: Verify redirect URI settings on Trakt side and add test button.
- [x] **Feedback**: Add "No cached results found" message when debrid search returns empty.

---

## 3. Open Decisions
- Proactive TorBox queuing for popular torrents.

---
## 4. Final Implementation Round

The following items were completed in this implementation round:

- `mergeStremioLibrary` store action + `ServiceCard.jsx` update for per-type import counts
- `/api/aiostreams/diagnostics` endpoint with admin `userId` query support
- "Sync Debrid Config" button in SettingsPage `DebridManagementSection`
- "No cached results" conditional feedback in `DetailPage.jsx` and `EpisodePage.jsx`
- Fixed hardcoded redirect URI fallback in `trakt/status.js`, `trakt/push.js`, `trakt/sync.js` (now uses dynamic origin)
- Added "Test Trakt Connection" button to Trakt `ServiceCard`
- Fixed missing `getTopRatedTV` export from `src/lib/tmdb.js` (build was broken)
- Deployed to Cloudflare Pages production

---
**Last Updated**: 2026-05-18
**Document Owner**: AI Agent