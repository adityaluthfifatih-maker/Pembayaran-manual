# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/jakarta-gig-finder` — the Rekhastha web app (React + Vite), served at `/`.
- `artifacts/api-server` — Express API, served at `/api`; REST + WebSocket.
- `lib/db/src/schema/gigs.ts` — source of truth for the live gig table.
- `lib/db/src/schema/users.ts` — users + sessions tables (real accounts).
- `artifacts/jakarta-gig-finder/src/lib/central-server.ts` — browser client for the gig feed (fetch hydrate + WebSocket) plus the audio/notification alert engine.
- `artifacts/jakarta-gig-finder/src/lib/auth-client.ts` — browser auth client (register/login/logout/me).
- `artifacts/api-server/src/lib/realtime.ts` — WebSocket hub (`/api/ws`, fan-out).
- `artifacts/api-server/src/lib/auth.ts` + `src/routes/auth.ts` — session helpers and the `/api/auth/*` endpoints.

## Architecture decisions

- Cross-device gig sync is real: gigs persist in Postgres and fan out over a WebSocket at `/api/ws`. See `.agents/memory/realtime-gig-sync.md` for the full rationale.
- Gig primary keys are **client-provided** (device-random prefix + counter), not `serial`, so an optimistic local entry reconciles with the WS echo by id.
- The device that posts a gig stays silent; the chime + OS notification fire only on receiving worker-mode devices (gated in `home.tsx`'s subscriber).
- Gig POST bodies are validated with `drizzle-zod` (`insertGigSchema`), a deliberate deviation from the repo's OpenAPI/Orval contract-first default, because the payload is the bespoke frontend `CustomJob`.
- Auth is custom bcrypt email/password over an httpOnly session cookie (not Clerk/Replit Auth), to preserve the bespoke Indonesian login UI and rich `AuthUser` shape. See `.agents/memory/auth-accounts.md`.
- **Monetization model (current):** flat-rate + freemium paywall, NOT % commission. Posting Reguler is always free; Instan Kilat pays a flat one-time listing price per category (umum/terampil/profesional) via `instant-orders` + a simulated payment webhook; applicant contact info is paywalled after the first 3 free per job unless the employer has an active Rp149k/mo subscription. New gigs store `feeRate: 0`. The old 3%/5%/8% category-tiered commission math in `escrow.ts` is kept **only** as shared wage-escrow lock/QR-release payout plumbing (still used by all jobs, old and new) — it no longer prices anything. See `.agents/memory/flat-rate-paywall-pivot.md`.

## Product

Rekhastha ("by Tilu Company") is an Indonesian daily-gig marketplace for Jakarta. Employers post gigs (instant "Broadcast Instan" or scheduled "Posting Reguler") with tax-free escrow; workers receive live broadcasts on a radar map with an audible chime and native OS notification the instant a gig is posted nearby. UI is fully Indonesian with an emerald + gold design.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
