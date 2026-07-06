---
name: Xendit escrow projects (Proyek + Milestone)
description: Second escrow system (project/milestone based) built on top of Xendit sandbox, separate from the existing borongan/cepat escrow engine.
---

Rekhastha has two parallel escrow systems — do not conflate them:

1. **Existing internal escrow** (`escrow-engine.md`, `borongan.ts`) — platform-fee based, cepat/lama gigs, no external payment gateway, money never actually moves.
2. **Xendit project escrow** (`escrow-projects.ts`, `lib/xendit.ts`, `escrow-projects` schema) — real Xendit sandbox Invoice + Disbursement APIs for "Proyek + Milestone" employer-worker contracts. Status flow: `draft → pending_payment → funded → completed`, milestones `pending → approved/disbursed/failed`.

**Why separate:** the project/milestone feature needed real money-movement simulation (Xendit Invoice for funding, Xendit Disbursement for milestone payout to worker bank/e-wallet), which the existing fee-based escrow engine was never designed for. Reusing it would have conflated fee math with payment-gateway state.

**How to apply:** when extending payment/escrow features, check which system the request belongs to. Xendit routes require `XENDIT_SECRET_KEY` (Basic auth) and `XENDIT_CALLBACK_TOKEN` (webhook verification) as secrets — both are now configured. Sandbox-only endpoints (`simulate-paid`) are gated by `isXenditSandboxKey()`. Worker payout destination comes from `usersTable.profile.{namaBank,nomorRekening,namaRekening}` — disbursement 409s if missing.
