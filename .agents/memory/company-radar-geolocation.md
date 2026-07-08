---
name: Company radar geolocation feature
description: Nearby-worker radar is aggregate-count-only (no map/pins) for privacy + anti-bypass reasons; earthdistance query + print-quality fix — decisions to stay consistent with.
---

# Company radar geolocation feature

**Current shape (superseded the old pin-map version):** `GET /api/companies/radar-stats`
returns only `{ count, radiusKm, isPremium }` — a `COUNT(*)` over Postgres
`cube`+`earthdistance` (enabled idempotently at server startup, not via a migration) of
ready-to-work users within a company-chosen 3km/5km radius. No worker lat/lng, name, or
WhatsApp number is ever included in the response.

**Why the map/pins were removed:** the earlier version returned fuzzed worker
coordinates + unlocked contact info to premium companies on a Leaflet map. This let
employers locate and contact workers directly, bypassing the platform's paid
Instan/Premium flows and creating a worker-privacy/security risk. The fix was to drop
per-worker data entirely and expose only an aggregate count, with CTAs steering
employers to Mode Instan or the Premium subscription instead of self-serve contact.

**How to apply:** any future "find nearby workers" feature for employers must stay
aggregate-only (counts/bucket stats) — do not reintroduce per-worker coordinates or
contact info in a company-facing response. Reuse `ensureEarthdistanceExtensions` from
`artifacts/api-server/src/lib/geo.ts` for the distance math. The worker-facing map
(`worker-map.tsx`, showing the worker's own surroundings/gigs) is unaffected — this
restriction applies only to company/employer-facing worker-location data.

**Anti-triangulation monitoring:** `artifacts/api-server/src/lib/radar-abuse.ts` flags
(logs + `radar_scrape_alerts` row, visible via `GET /admin/radar-alerts`) a company
whose radar-stats calls look like location-probing — many calls or many distinct
lat/lng/radius combos in a 60s window. It never blocks the request; the aggregate
response already limits what a scraper can learn, this is purely for admin visibility.

**Deploy gotcha:** `api-server`'s dev workflow does a one-shot `build && start`, not a
watcher — after editing server routes/schema you must restart the `API Server`
workflow (and `pnpm --filter @workspace/db run push` after a schema change) or the
running server keeps serving the old bundle and new routes 404.

## Print-quality gotcha (applies beyond radar)

Do not implement "download/print as PDF" via `window.open("", "_blank")` +
`document.write(el.innerHTML)` + `w.print()`. Two problems: (1) popups are frequently
blocked silently by the browser with no visible error, and (2) writing raw innerHTML into
a blank document drops all Tailwind/CSS classes, producing an unstyled, broken-looking
printout.

**Fix used:** print the existing DOM in place. Add a `@media print { body * { visibility:
hidden } #target, #target * { visibility: visible } #target { position: absolute; ... } }`
stylesheet scoped to the printable element's id, and call `window.print()` directly — no
new window. Applied to the worker payslip modal; reuse this pattern for any future
print/PDF export instead of the popup approach.
