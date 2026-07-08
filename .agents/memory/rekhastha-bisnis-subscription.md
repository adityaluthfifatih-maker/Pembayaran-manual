---
name: Rekhastha Bisnis subscription (tiered premium)
description: Tiered 1/3/6/12-month premium plans gating GPS attendance + wage calculator tools, and how it relates to the older flat-rate applicant paywall.
---

## What it is
A second, separate premium system living on `users.isPremium` / `users.expiredAt`
(companies = users with role "perusahaan" in this schema — no dedicated
`companies` table). `subscription_plans` holds the 4 launch-promo tiers
(original vs promo price, exact `durationDays` per tier: 30/90/180/365 — NOT
`durationMonths * 30`, so 6mo credits 180 days and 12mo credits 365 exactly).
`subscription_orders` records pending/success/failed purchases; the webhook
(`POST /api/webhook/subscription-payment`) accumulates `durationDays` onto
`expiredAt` starting from the OLD expiry if still in the future, never from
"today" — an extension stacks, it doesn't discard remaining time.

`checkPremiumStatus`/`requirePremium` (`artifacts/api-server/src/lib/premium.ts`)
gate GPS attendance QR generation (`POST /api/attendance/token`) and a new
`POST /api/employer/payroll/calculate` wage-calculator endpoint with HTTP 402.
Job posting is never gated — it stays free for every account regardless of
premium status.

## Two parallel premium systems — do not conflate
- **This one** (`users.isPremium`/`expiredAt` + `subscription_plans`/`subscription_orders`):
  tiered pricing, gates employee-management tools (GPS attendance, wage calc).
- **The older one** (`company_subscriptions` table, flat Rp149k/mo, in
  `monetization.ts`/`pricing.ts`): gates the applicant-contact paywall (first
  3 applicants free, rest masked) — see flat-rate-paywall-pivot.md.
- **Why kept separate:** unifying them risked changing the existing applicant
  paywall's behavior/pricing, which was out of scope for this request. A
  future consolidation should pick one canonical premium flag+pricing model
  and migrate both gates onto it.
