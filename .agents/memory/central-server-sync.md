---
name: Central Virtual Server Sync
description: How the single-window employer→worker real-time gig broadcast layer works in jakarta-gig-finder.
---

# Central Virtual Server Sync

Simulates a live backend inside one browser window so an employer action instantly updates the worker radar. Lives in `src/lib/central-server.ts`; consumed by `src/pages/home.tsx`.

- **Store shape:** `window.centralServer = { activeGigs, subscribers }`, mirrored onto `window` as the inspectable source of truth. A `Gig` is just a `CustomJob`.
- **broadcastToServer(gig) upserts by `id`** (removes any existing same-id entry, then prepends). Re-broadcasting a job (e.g. post-then-lock) must NOT create duplicate entries — duplicates cause colliding React marker keys (`gig-${id}`) and ghost radar pins.
- **Subscriber signature is `(gig: Gig | null, activeGigs)`.** `gig` is the newly broadcast gig, or `null` for a bulk/reset update. Toast must only fire when `gig` is non-null, otherwise `resetServer()` would flash a notification.
- **resetServer() (on logout) notifies subscribers with `null`** so live subscribers clear their gig list. home.tsx does NOT unmount on logout (it swaps to AuthPage), so the subscription persists — do not clear the `subscribers` array on reset or the live sync dies after re-login.

**Why the geofence matters:** broadcasts must land within a strict 5km Jakarta radius via `randomGeofenceCoords(5)`. The general `randomJakartaCoords()` spread (~±7.7km) violates it. Both broadcast paths must geofence: the "Butuh Cepat" post path AND `handleLockEscrow` (scheduled jobs are first posted with the wide spread, so they MUST be re-geofenced at lock time before broadcasting).

**Map de-dup:** broadcast gigs live in BOTH `customJobs` and `centralGigs`. The radar renders `mapPurpleJobs` (customJobs minus centralGigs ids) as purple pins and `centralGigs` as green pulsing markers, so a broadcast job shows exactly one (green) marker.

**Alert engine (chime + native OS notification) is centralized:** `triggerGlobalEscrowBroadcast(gig)` = `broadcastToServer` + `playAlertChime` + `fireNativeNotification`. It is the single dispatch used by BOTH broadcast paths and is mirrored onto `window`. The toast component must NOT play its own sound — centralizing here is what prevents a double chime when the worker viewport mounts the toast for a live broadcast.

**AudioContext autoplay policy — use ONE shared, pre-unlocked context.** Creating a fresh `AudioContext` per chime gets silently blocked when the chime is fired from a React effect (e.g. the role-switch replay), not from inside the gesture call stack — especially mobile Safari. Fix: keep a module-level `sharedAudioCtx`, resumed by `unlockAudio()` bound to the first `pointerdown/keydown/touchstart` (once, in an init effect). Never `.close()` the shared context between chimes. **Why:** the spec requires the replay sound to fire on switch-to-worker, which happens in `useEffect([mode])` — reliable only if the context was already unlocked by an earlier gesture.

**Role-gated notifications (the toast is worker-only):** `centralGigs`/radar pins update for every viewport, but the toast fires only when the active role is worker (`pekerja`). The subscriber is registered once in `useEffect([])`, so it must read the role via a `modeRef` (synced in a `useEffect([mode])`) — a direct `mode` read would be a stale closure. Broadcasts that arrive while in employer view are queued in `pendingBroadcastRef` and replayed by the `[mode]` effect the instant the viewport enters `pekerja`. **Why the effect, not a click handler:** role in this app is set by login (`handleAuthComplete` → `setMode(user.role)`), not an in-app toggle, so the replay MUST live in the `[mode]` effect to be reachable — a handler on a nonexistent toggle button is dead code. `handleLogout` must also null `pendingBroadcastRef` or a stale gig replays on the next login.
