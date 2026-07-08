---
name: Company radar geolocation feature
description: Nearby-worker radar map (earthdistance query, coordinate fuzzing, print-quality fix) — decisions to stay consistent with.
---

# Company radar geolocation feature

`GET /api/companies/radar` uses Postgres `cube`+`earthdistance` extensions (enabled
idempotently at server startup, not via a migration) to find ready-to-work users within
5km of the company's last known location.

**Coordinate fuzzing:** worker coordinates returned to a company are fuzzed by
300–500m before being sent to the client. This is a deliberate privacy tradeoff — exact
worker location is never exposed to employers, only an approximate pin + distance.

**Free-tier paywall:** contact info (phone/full name) on radar pins is masked unless the
company has an active subscription (checked via `getActiveSubscription`, exported from
`monetization.ts`). This mirrors the existing applicant-contact paywall pattern rather
than inventing a new gating mechanism.

**Why:** keeps the radar feature consistent with the already-shipped flat-rate +
paywall monetization model (see `flat-rate-paywall-pivot.md`) instead of introducing a
second, divergent premium-gating scheme.

**How to apply:** any new radar/location endpoint should reuse `ensureEarthdistanceExtensions`
+ `fuzzCoordinate` from `artifacts/api-server/src/lib/geo.ts` rather than re-implementing
distance math, and should gate contact-info visibility through `getActiveSubscription`.

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
