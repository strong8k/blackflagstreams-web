# AIOStreams Debrid Refactor — Codebase Assessment

Assessment Date: 2026-05-18
Based on analysis of 12 source files across `src/` and `functions/`.

---

## Overview

This document assesses the current state of each remaining task from [`plan/aiostreams-debrid-refactor.md`](plan/aiostreams-debrid-refactor.md). Each task is evaluated against the actual codebase to determine what is already done, what needs work, and how to proceed.

---

## 2.1 Stremio Integration (High Priority)

### Task: UI — "Import Library" button on Stremio service card

**Assessment:** ✅ ALREADY IMPLEMENTED

The "Import Library" button already exists in [`src/components/ServiceCard.jsx`](src/components/ServiceCard.jsx:450-456). When Stremio is connected, the card renders:

```jsx
<button className="btn btn-secondary btn-sm" onClick={handleImportStremio} disabled={busy}>
  Import Library
</button>
```

The flow:
1. [`handleImportStremio`](src/components/ServiceCard.jsx:162-175) calls `importStremioLibrary()` from [`src/lib/services.js`](src/lib/services.js:110-112)
2. Which calls `GET /api/stremio/library` on the backend
3. Returns `{ watchlist, history, rawCount }`
4. Passes data to [`store.bulkImport(data)`](src/lib/store.js:476-495)

The `ServiceCard` is rendered on [`SettingsPage.jsx`](src/pages/SettingsPage.jsx:356) via `<ServiceCard serviceKey="stremio" />`.

**No work needed** for this task — the button and its wired flow are complete.

---

### Task: Store — Implement `mergeStremioLibrary` action

**Assessment:** ❌ NOT YET IMPLEMENTED — Uses generic `bulkImport` instead

**Current state:** The import flow calls [`store.bulkImport()`](src/lib/store.js:476-495), which only deduplicates and merges watchlist/history arrays by item ID. It does **not**:
- Track import count / return how many new items were added
- Populate sessionStorage for TV episode checkmarks
- Report per-type breakdown (movies vs TV)

**Existing pattern to follow:** [`mergeTraktHistory`](src/lib/store.js:498-518) — this function:
- Deduplicates by `type_id` composite key
- Normalizes item structure (adds `progress`, `timestamp`, `tmdbId`)
- Returns the count of newly-merged items
- Is called from `ServiceCard.jsx` via `useStore.getState().mergeTraktHistory(result.items)`

**Proposed new action — `mergeStremioLibrary`:**

```javascript
// In src/lib/store.js, alongside mergeTraktHistory (around line 520)
mergeStremioLibrary: ({ watchlist, history }) => {
  if (!watchlist && !history) return { watchlistAdded: 0, historyAdded: 0 };

  const state = get();
  // Deduplicate watchlist
  const existingWlIds = new Set((state.watchlist || []).map(i => `${i.type}_${i.tmdbId || i.id}`));
  const newWatchlist = (watchlist || []).filter(
    item => !existingWlIds.has(`${item.type || 'movie'}_${item.tmdbId || item.id}`)
  );
  // Deduplicate history
  const existingHistIds = new Set((state.history || []).map(i => `${i.type}_${i.tmdbId || i.id}`));
  const newHistory = (history || []).filter(
    item => !existingHistIds.has(`${item.type || 'movie'}_${item.tmdbId || item.id}`)
  );
  // Merge into store
  if (newWatchlist.length > 0) {
    set(s => ({ watchlist: [...newWatchlist, ...s.watchlist] }));
  }
  if (newHistory.length > 0) {
    set(s => ({
      history: [...newHistory.map(item => ({
        ...item,
        progress: item.progress || 100,
        timestamp: item.timestamp || Date.now(),
      })), ...s.history],
    }));
  }
  return { watchlistAdded: newWatchlist.length, historyAdded: newHistory.length };
},
```

**Dependency chain:**
- `ServiceCard.jsx` line 168: change `await bulkImport(data)` → `const result = await getState().mergeStremioLibrary(data)`
- Toast message on line 169: update to use returned counts
- Import route in `ServiceCard.jsx`: add `import { useStore } from '../lib/store'` (already imported at top)

---

### Task: Session — Populate sessionStorage on import for SeasonPage checkmarks

**Assessment:** ❌ NOT YET IMPLEMENTED

**Current state:**
- [`EpisodePage.jsx`](src/pages/EpisodePage.jsx:86-112) fetches per-episode watched state from `GET /api/stremio/episode-watched` and populates `sessionStorage` key `bfs_watched_tv_{seriesId}_s{season}` for that single episode.
- [`SeasonPage.jsx`](src/pages/SeasonPage.jsx:22-27) reads `bfs_watched_tv_{seriesId}_s{season}` from `sessionStorage` to show checkmarks.
- But when the user runs a bulk library import, **no sessionStorage is populated** for TV episodes.

**Challenge:** The Stremio library endpoint (`/api/stremio/library`) returns items at the **series/movie level** only — it does not return per-episode watched data. Stremio's `libraryItem` collection tracks shows as "in library" / "watched", not individual episodes.

**Options:**

- **Option A (Recommended):** Don't try to populate sessionStorage during bulk import. The per-episode fetch in `EpisodePage.jsx` already works correctly — it fetches watched state when the user navigates to an episode page. SessionStorage is then populated for that episode, and the SeasonPage checkmark appears after the user visits the episode page. This is the correct data flow.

- **Option B:** Extend the library endpoint to also fetch per-episode data from Stremio. This would require additional Stremio API calls per series, which is expensive and slow.

- **Option C:** Add a separate endpoint `GET /api/stremio/library/episodes?seriesImdbId=...` that fetches per-episode watched data, called by a new "Sync watched episodes" button.

**Recommendation:** Choose Option A. The per-episode flow already works. Task is more about **verifying completeness** than new code.

---

## 2.2 Debrid Management (High Priority)

### Task: Sync Button — "Sync Debrid Config" to trigger `POST /api/aiostreams/sync`

**Assessment:** ❌ NOT IN UI — Backend endpoint exists, front-end button missing

**Backend:** [`functions/api/aiostreams/sync.js`](functions/api/aiostreams/sync.js) already handles `POST` requests, validates the session, and calls `syncUser()`.

**What's needed:**

1. **Add client function** to [`src/lib/services.js`](src/lib/services.js) (around line 228, after `updateDebridSettings`):

```javascript
export async function syncAIOStreams() {
  const data = await api('/api/aiostreams/sync', { method: 'POST' });
  return data; // { success }
}
```

2. **Add UI button** to [`SettingsPage.jsx`](src/pages/SettingsPage.jsx). Best placement: inside the existing [`DebridManagementSection`](src/pages/SettingsPage.jsx:143-274), near the resolution/language settings.

```jsx
// Inside DebridManagementSection, add after the file size limits display (line 269)
<div style={{ marginTop: '1.25rem' }}>
  <button className="btn btn-secondary btn-sm" onClick={handleSyncAIOStreams} disabled={syncing}>
    {syncing ? 'Syncing...' : '🔄 Sync Debrid Config'}
  </button>
  <p className="setting-desc" style={{ marginTop: '0.4rem' }}>
    Force re-sync your debrid configuration with AIOStreams. Useful if streams aren't appearing correctly.
  </p>
</div>
```

3. **Add handler** to `DebridManagementSection`:

```javascript
const [syncing, setSyncing] = useState(false);

const handleSyncAIOStreams = async () => {
  setSyncing(true);
  try {
    const { syncAIOStreams } = await import('../lib/services');
    await syncAIOStreams();
    addToast('Debrid config synced successfully', 'success');
  } catch (e) {
    addToast(`Sync failed: ${e.message}`, 'error');
  } finally {
    setSyncing(false);
  }
};
```

---

### Task: Diagnostics — Implement `/api/aiostreams/diagnostics` endpoint

**Assessment:** ❌ DOES NOT EXIST — Needs to be created from scratch

**Create** `functions/api/aiostreams/diagnostics.js`:

```javascript
// GET /api/aiostreams/diagnostics — Check user's AIOStreams account state
import { json, preflight, validateSession } from '../_shared.js';
import { getRecord } from './_userdata.js';

export function onRequestOptions() { return preflight(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await validateSession(env, request.headers.get('Authorization'));
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const record = await getRecord(env, session.userId);

  return json({
    success: true,
    userId: session.userId,
    provisioned: !!record.aio?.uuid,
    aioUuid: record.aio?.uuid || null,
    aioCreated: record.aio?.created || null,
    debridServices: Object.keys(record.debridKeys || {}),
    debridServiceCount: Object.keys(record.debridKeys || {}).length,
    // Include settings summary (no actual keys)
    hasSettings: !!record.settings && Object.keys(record.settings).length > 0,
    settingsSummary: record.settings ? {
      hasSettings
      ? {
          hasResolutionPrefs: !!record.settings.enabledResolutions?.length,
          hasLanguagePrefs: !!record.settings.languages,
          hasSizePrefs: !!record.settings.sizeGlobal,
        }
      : null,
  });
}
```

**Note:** The `getRecord` and `putRecord` functions in `_userdata.js` are currently **local helpers** (not exported). They need to be exported for use by `diagnostics.js`. The internal helper pattern:

```javascript
// In _userdata.js — these are currently NOT exported
async function getRecord(env, userId) { ... }
async function putRecord(env, userId, record) { ... }
```

**Required change:** Add `export` to `getRecord` and `putRecord` in [`_userdata.js`](functions/api/aiostreams/_userdata.js):

```javascript
export async function getRecord(env, userId) { ... }
export async function putRecord(env, userId, record) { ... }
```

---

## 2.3 OAuth & UX (Medium Priority)

### Task: Trakt OAuth — Verify redirect URI settings and add test button

**Assessment:** Research task, not a code change

**What's needed:**
1. Verify that Trakt app redirect URI in the developer console matches what [`getTraktAuthUrl`](src/lib/services.js:34) returns
2. Possibly add a "Test Connection" button to the Trakt card that pings `GET /api/trakt/status` and reports back

**Note:** The [`handleSyncTrakt`](src/components/ServiceCard.jsx:96-111) button already exists in the connected Trakt state. A "Test" button could be added alongside "Sync Now" for the connected state, or on the "Connect" flow itself.

---

### Task: Feedback — "No cached results found" message when debrid search returns empty

**Assessment:** ❌ NOT IMPLEMENTED — Generic message used

**Current behavior:**
- [`DetailPage.jsx`](src/pages/DetailPage.jsx:189): `addToast('No streams found. Try installing addons.', 'warning')`
- [`EpisodePage.jsx`](src/pages/EpisodePage.jsx:306): `<p>No streams found. Try adding more addons or check your connection.</p>`

**What's needed:** Detect when debrid services are connected but returned no cached results, and show a more specific message.

**How to implement:**

In [`DetailPage.jsx`](src/pages/DetailPage.jsx), after `loadStreams` completes (around line 183-189), check if debrid services are connected but returned no debrid-specific streams:

```javascript
// After setStreams(sorted) — around line 183
if (results.length === 0) {
  const hasDebrid = services?.torbox?.connected || services?.realdebrid?.connected || services?.alldebrid?.connected;
  if (hasDebrid) {
    addToast('No cached results found on your debrid service. Content may not be cached yet.', 'warning');
  } else {
    addToast('No streams found. Try installing addons.', 'warning');
  }
}
```

Similarly, in [`EpisodePage.jsx`](src/pages/EpisodePage.jsx) around line 303-307 (the empty state rendering), update the condition to check `services`:

```jsx
{!streamsLoading && streams.length === 0 && (
  <div className="no-streams">
    {services?.torbox?.connected || services?.realdebrid?.connected || services?.alldebrid?.connected
      ? <p>No cached results found on your debrid service. Content may not be cached yet.</p>
      : <p>No streams found. Try adding more addons or check your connection.</p>
    }
  </div>
)}
```

**Dependency:** The `services` object is already available via `useStore` in both components (`DetailPage.jsx` line 100, `EpisodePage.jsx` line 55).

---

## Summary Table

| # | Task | Status | Files to Modify |
|---|------|--------|-----------------|
| 2.1 | "Import Library" button UI | ✅ Already done | None |
| 2.1 | `mergeStremioLibrary` store action | ❌ Needs creation | [`src/lib/store.js`](src/lib/store.js), [`src/components/ServiceCard.jsx`](src/components/ServiceCard.jsx) |
| 2.1 | sessionStorage on import | ❌ Not needed (Option A) | None — per-episode fetch handles this |
| 2.2 | Sync Debrid Config button | ❌ Missing UI + client fn | [`src/lib/services.js`](src/lib/services.js), [`src/pages/SettingsPage.jsx`](src/pages/SettingsPage.jsx) |
| 2.2 | Diagnostics endpoint | ❌ Needs creation | Create `functions/api/aiostreams/diagnostics.js`, export `getRecord`/`putRecord` in [`_userdata.js`](functions/api/aiostreams/_userdata.js) |
| 2.3 | Trakt OAuth verification | 🔍 Research task | None (verification only) |
| 2.3 | "No cached results" feedback | ❌ Needs implementation | [`src/pages/DetailPage.jsx`](src/pages/DetailPage.jsx), [`src/pages/EpisodePage.jsx`](src/pages/EpisodePage.jsx) |

---

## New Implementation Plan

### Step 1: Add `mergeStremioLibrary` to store
**File:** `src/lib/store.js` (around line 520)
**Action:** Add new action alongside `mergeTraktHistory`. Follow the same dedup-by-type+id pattern but accept `{ watchlist, history }` object.

### Step 2: Update ServiceCard to use new action
**File:** `src/components/ServiceCard.jsx`
**Action:** Replace `await bulkImport(data)` with `await useStore.getState().mergeStremioLibrary(data)` and update the toast message to show per-type counts.

### Step 3: Export helpers from `_userdata.js`
**File:** `functions/api/aiostreams/_userdata.js`
**Action:** Add `export` to `getRecord` and `putRecord` functions.

### Step 4: Create diagnostics endpoint
**File:** Create `functions/api/aiostreams/diagnostics.js`
**Action:** Implement `GET` endpoint that returns provision status, debrid services, and settings summary.

### Step 5: Add sync client function
**File:** `src/lib/services.js` (around line 228)
**Action:** Add `export async function syncAIOStreams()` that calls `POST /api/aiostreams/sync`.

### Step 6: Add Sync button to SettingsPage
**File:** `src/pages/SettingsPage.jsx`
**Action:** Add button + handler to `DebridManagementSection`. Import `syncAIOStreams` dynamically.

### Step 7: Update "no streams" feedback
**Files:** `src/pages/DetailPage.jsx`, `src/pages/EpisodePage.jsx`
**Action:** Check `services` for connected debrid services and show specific "no cached results" message when debrid is connected but returned empty.

### Step 8: Verify and document Trakt OAuth
**Action:** Check Trakt API app settings for correct redirect URI. Document findings.
