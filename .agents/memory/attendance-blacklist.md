---
name: QR Presensi attendance & Blacklist
description: Trust model and race-safety rules for the QR attendance (Presensi) and blacklist features.
---

# QR Presensi (attendance) & Blacklist

## Identity is server-derived, never body-trusted
All `/api/attendance/*` and `/api/blacklist*` routes derive the actor from the
session cookie (`getSessionUser` + `SESSION_COOKIE`), NOT from request-body
fields.

**Why:** an earlier draft trusted `employerId`/`workerName` from the body, which
allowed any client to mint tokens for jobs they don't own, attribute scans to
other people, and enumerate/forge blacklist rows (IDOR). Code review flagged it
as severe.

**How to apply:**
- Attendance token mint: caller must be the employer whose `gigs.employerId`
  matches the session user id (job ownership check). Return 403 otherwise.
- Attendance scan: the recorded `workerName` is `session.user.name`, ignore any
  body-supplied name.
- Blacklist create/remove: employer identity + display name come from the
  session (role must be `perusahaan`); only `workerName`/`jobId` (the target)
  come from the body.
- Blacklist GET is self-scoped: a `perusahaan` sees rows they created; a worker
  sees rows where `workerName === session.user.name`. Never let a caller pass an
  arbitrary id to read someone else's data.

## Attendance tokens are single-use + short-TTL, in-memory
Tokens live in an in-memory `Map` with a 3-min TTL and are deleted on redemption
(anti-joki: a screenshot of the QR can't be replayed). This is deliberately not
persisted — restarting the API server drops outstanding tokens, which is fine.

## Escrow release must be idempotent against duplicate WS frames
Escrow release fires on the employer device from the `subscribeAttendance`
"pulang" handler. Each persisted attendance row has a unique id; the handler
dedupes on that id via a `useRef<Set<number>>` before calling the payout.

**Why:** the payout guard relied on closure-captured React state
(`notif.status !== "selesai"`), which a rapid duplicate frame can slip past
before state settles, double-crediting the wallet.

**How to apply:** any new WS-driven financial action must dedupe on the durable
event id, not only on React-state guards.
