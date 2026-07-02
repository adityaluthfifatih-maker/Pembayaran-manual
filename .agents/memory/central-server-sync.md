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
