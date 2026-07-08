---
name: Flat-rate + freemium paywall pivot
description: Replaced the 3%/5%/8% category-tiered commission with flat Instan Kilat listing fees + applicant-contact paywall; what stayed, what's legacy-only now.
---

## What changed
- Posting Reguler (`hiringMode: "lama"`) is now always free — no listing fee, no wage commission.
- Instan Kilat (`hiringMode: "cepat"`) pays a flat one-time listing price per category (umum/terampil/profesional), charged via `instant-orders` + a simulated Midtrans/Xendit-style payment webhook — NOT a % of the wage.
- Applicant-contact info (email/whatsapp) is paywalled: first `FREE_APPLICANT_LIMIT` (3) applicants per job are free, the rest are masked unless the employer has an active Rp149k/mo subscription (`company_subscriptions` table).
- New gigs store `feeRate: 0` — the old wage-commission math (`calcEmployerFee`/`calcEmployerDeposit`/`calcSplit` in escrow.ts) is still called on every gig (old and new), but at `feeRate=0` it's a pure 100% pass-through to the worker.

## What did NOT change (deliberately)
- `escrow.ts`'s tiered rate constants/functions (`PLATFORM_FEE_RATES`, `getFeeRate`, `calcSplit`, etc.) were kept, not deleted — they still back-fill legacy pre-pivot gig rows and remain the single source of truth for the wage-escrow lock/QR-release payout pipeline.
- **Why:** removing them would have required rewriting the entire escrow/QR-release payout plumbing, which was out of scope and risked breaking payouts for existing/in-flight jobs. Setting `feeRate: 0` for new jobs was the minimal-risk way to retire commission pricing.
- The `check:escrow` / `fee-consistency` workflows (in `scripts/src/escrow-invariant-check.ts` / `check-fee-consistency.ts`) still exercise this legacy math and intentionally still pass — they're regression guards for the shared payout math, not a description of current pricing.
- The Xendit milestone/project escrow feature (separate from this) is unrelated and untouched.

## New pieces
- Schema: `lib/db/src/schema/monetization.ts` — `companySubscriptionsTable`, `instantOrdersTable`.
- Backend: `artifacts/api-server/src/lib/pricing.ts` (flat prices per category), `artifacts/api-server/src/routes/monetization.ts` (instant-order create/webhook, applicant list with `ROW_NUMBER` masking, subscription CRUD), row-locked (`FOR UPDATE`) instant-match claiming for accept flow.
- Frontend: `artifacts/jakarta-gig-finder/src/types/monetization.ts` (mirrors backend price constants) + `src/lib/monetization-client.ts` (createInstantOrder/confirmInstantPayment/fetchSubscription/subscribePremium).
- The real posting UI is `hiring-mode-panel.tsx` — `job-posting-modal.tsx` is dead code (imported in `home.tsx` but never rendered); don't waste time editing it for pricing/paywall changes.
