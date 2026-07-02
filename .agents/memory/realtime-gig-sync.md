---
name: Realtime gig sync (Postgres + WebSocket)
description: How the cross-device live gig feed works and the non-obvious constraints behind it.
---

# Realtime gig sync

The Jakarta Gig Finder gig feed is a real backend: gigs persist in Postgres
(`gigs` table in `lib/db`) and fan out over a WebSocket so an Employer device and
a Worker device sync live. The browser client is `central-server.ts` (kept its
old synchronous export surface so the UI did not need a rewrite).

## Decisions & why

- **Client-provided numeric primary key** (not `serial`). The poster creates the
  gig optimistically and the WS echo must reconcile to the *same* row, else the
  poster's own map shows a duplicate pin. Ids are a per-session 29-bit random
  device prefix `<< 20` + a monotonic counter (`nextJobId` in `home.tsx`), kept
  under 2^53. **Why:** two physical devices both minting ids must not collide;
  time-based seeds collide 1/1000 in the same ms, the random-prefix scheme is
  ~1/5e8.

- **Employer stays silent; only worker devices alert.** The chime + native
  notification are NOT fired by the poster path (`triggerGlobalEscrowBroadcast`
  just POSTs). They fire on the *receiving* device inside the `home.tsx`
  subscriber, gated by `modeRef.current === "pekerja"`. **Why:** the requirement
  is that the device that posts does not notify itself. Do not move the chime
  back into the broadcast/trigger function.

- **WS reconnect must re-hydrate.** `central-server.ts` calls `GET /api/gigs`
  again on every reconnect `onopen` (after the first). **Why:** gigs broadcast
  while a client is disconnected are otherwise lost forever until a full reload.

- **Validation via drizzle-zod, NOT OpenAPI/Orval codegen.** The gig payload is
  the bespoke frontend `CustomJob` (Date objects, role logic); threading it
  through the OpenAPI spec + generated hooks would be invasive for no gain. The
  server validates POST bodies with `insertGigSchema` (extended with
  `z.coerce.date()` for `postedAt`/`jobDate`). This is a deliberate deviation
  from the repo's contract-first default.

## How to apply

- WS endpoint is `/api/ws`. The Replit proxy does NOT rewrite paths, so the
  api-server upgrade handler matches the full `/api/ws` (see `lib/realtime.ts`).
- POST `/api/gigs` upserts by id (`onConflictDoUpdate`) so re-broadcasting a gig
  on escrow-lock replaces the row instead of failing on the PK.
- `resetServer()` clears the LOCAL cache only (logout) — it must never delete
  server rows, or one user's logout wipes every device's feed.
