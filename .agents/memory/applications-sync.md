---
name: Applications sync pattern
description: How job applications are persisted and fanned out to employer devices in real time.
---

## Key decisions

**workerId is `text`** — `usersTable.id` is `text("id").primaryKey()` (not serial/bigint). Any table that FK-references or stores a user ID must use `text` not `bigint`. Trying `bigint({ mode: "number" })` fails typecheck: "Type 'string' is not assignable to type 'number'".

**Why:** The custom bcrypt auth system stores user IDs as text (could be UUID or similar). There is no integer auto-increment user PK.

**Masked fields stored as-is** — `workerNikMasked`, `workerNpwpMasked`, `rekening` arrive already masked from the worker's browser. The server stores and fans out the masked values; it never sees raw PII.

## WS fan-out pattern

- `POST /api/applications` → `broadcastApplication(row)` → `{ type: "application_new", application: row }`
- `PATCH /api/applications/:id/status` → `broadcastApplicationStatus(id, status, jobId)` → `{ type: "application_status", id, status, jobId }`

Employer side subscriber in `home.tsx`:
- Uses `applicationHandlerRef.current` pattern (re-assigned each render for fresh closure, registered once via `useEffect([], [])`)
- Guards: role === "perusahaan" + `allJobs.find(j => j.id === e.jobId)` + `gig.employerId === currentUser.id`
- Dedup via `processedApplicationRef` (Set of application IDs)

## How to apply

Whenever adding a new "actor submits → server persists → other device reacts" feature, follow the same 5-layer pattern:
1. DB schema (`lib/db/src/schema/`)
2. realtime.ts `broadcastX()` export
3. Route file (`routes/X.ts`) with auth guard + broadcast call
4. central-server.ts: `XEvent` type + `XSubscriber` + WS branch + `subscribeX()` export
5. home.tsx: `handlerRef` + `processedRef` + `useEffect(() => subscribeX(...), [])`

## Optimistic-success UI must be gated by the same precondition as the real call

`job-sheet.tsx`'s apply CTA used to run its `setTimeout` → "Lamaran Terkirim!" success animation unconditionally, only gating the real `onApply`/`postApplication` network call behind `if (workerProfile && onApply)`. A worker who hadn't completed onboarding (`workerProfile === null`) saw a fake success screen while nothing was ever POSTed — so the employer never received a notification or a new application row.

**Why:** This was invisible to backend/API testing (the API layer was fully correct) because the break was purely in client-side optimistic-UI gating. Only real UI interaction, or checking access logs for the actual POST that never arrived, revealed it.

**How to apply:** any "optimistic success" UI (chime, animation, checkmark, toast) must be gated by the exact same precondition that gates the underlying network call, not a looser one. If a required precondition (e.g. a completed profile) is missing, block the action up front and route the user to fix the precondition (e.g. open onboarding) instead of faking success.
