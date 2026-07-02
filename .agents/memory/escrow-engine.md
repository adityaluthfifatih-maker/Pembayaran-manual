---
name: Escrow Engine Architecture
description: Rekhastha escrow/e-wallet system — rates, status lifecycle, split calc, and action ownership across components.
---

## Rates (src/types/escrow.ts)
- Platform commission: 10% of gross
- PPh 21 with NPWP: 2.5% of (gross − platform cut)
- PPh 21 without NPWP: 3.0% of (gross − platform cut)
- Admin fee if company wins dispute: 5% of gross

## EscrowStatus lifecycle
`pending` → `locked` (on job post) → `released` (Selesai & Bayar) | `disputed` → `released` (worker wins) | `refunded` (company wins)

## calcSplit(gross, hasNpwp) returns
`{ platformCut, pphCut, workerNet, pphRate }`

## calcEscrowAmount(nominal, pembayaran, jumlahHari, kuota)
- per_projek: nominal × kuota
- per_jam/per_shift: nominal × jumlahHari × kuota (per_jam multiplies by 8 implicitly via daily rate)

## Action ownership
- **Company marks complete** → NotificationPanel `onMarkComplete(notifId, hasNpwp)` → `handleSplitPayment` in home.tsx
- **Company disputes via notif panel** → NotificationPanel `onDispute(notifId)` → `handleNotifDispute` in home.tsx
- **Company disputes via profile page** → CompanyProfilePage `onDispute(jobId)` → `handleJobDispute` in home.tsx
- **Worker disputes while clocked in** → active job banner "⚠️ Sengketa" → `handleWorkerDispute` in home.tsx
- **Admin resolves** → CompanyProfilePage "🔑 Admin Master Escrow Key" panel → `onAdminResolve(jobId, winner)` → `handleAdminResolve` in home.tsx
- **Worker withdraws** → WorkerProfilePage E-Wallet tab → `onWithdraw` → `handleWithdraw` in home.tsx

## ApplicationStatus addition
Added "selesai" to `ApplicationStatus` (notification.ts). statusConfig in notification-panel.tsx maps it to "Dibayar ✓" with emerald colors.

**Why:** After `handleSplitPayment` fires, the notification is marked "selesai" so the "Selesai & Bayar" button no longer shows and the status badge reflects payment completion.

## isWithdrawLocked derivation
`customJobs.some(j => j.escrowStatus === "disputed")` — passed as prop to WorkerProfilePage. If any job is disputed, worker cannot withdraw.

## Job modal escrow confirmation step
Job posting modal now has a 2-step flow: fill form → escrow confirmation overlay (shows cost breakdown, jumlahHari picker) → "Simulasi Transfer ke Escrow Rekhastha" → job posted with `escrowStatus: "locked"`.

## Timer engines (grace / dispute window) — snapshot, don't read live UI state
Discipline timers in home.tsx: 15-min Clock-In grace (`CLOCKIN_GRACE_MS`, penalty `LATE_CLOCKIN_PENALTY`) and 24h post-Clock-Out dispute window (`DISPUTE_WINDOW_MS`). A single 1s `nowTick` interval (only alive while a deadline is set) drives two expiry `useEffect`s.

**Rule:** an expiry handler must operate on a captured **job snapshot** (`disputeJob`), NOT on `activeJob`. **Why:** the completed-card "Tutup" button sets `activeJob=null`; if auto-release depended on `activeJob` it would silently no-op after the user closes the card. Also guard auto-release against the job's live `escrowStatus` being already `disputed`/`released`.

**How to apply:** any handler that clears a deadline because a dispute was filed (`handleWorkerDispute`, `handleNotifDispute`, `handleJobDispute`) must key off `disputeJob.id` (not `activeJob.id`) and include `disputeJob` in its dep array, and clear both the deadline and the snapshot on dispute/cancel/logout/apply.

The **grace timer** follows the same rule: use a `graceJob` snapshot (set when the job is accepted, alongside `graceDeadline`) for the penalty AND the Butuh-Cepat standby re-route. Standby re-route (Ahmad/Rian/Siti) is **Mode Butuh Cepat only** — guard `graceJob.hiringMode === "cepat"` inside the handler; scheduled (lama) jobs only get the penalty. Clear `graceJob` wherever `graceDeadline` is cleared (clock-in, clock-out, cancel, logout, expiry).

## Tax-free escrow (no PPh/PPN)
The app is TAX-FREE per the Rekhastha spec: `calcSplit(gross)` returns only `{ platformCut, workerNet }` (workerNet = gross − platformCut), no PPh. `pph21Rate` and the `PPH_*` constants were removed. NPWP stays as a collected/verification field only. The only intentional tax mention left is `terms-modal.tsx` Pasal "Kepatuhan Pajak Independen" (tax is each party's own responsibility). **Why:** user explicitly chose tax-free. Don't reintroduce PPh deductions in any UI.

## Dual-recruitment: BOTH hiring modes bill 15% (Broadcast Instan + Posting Reguler)
The employer panel is split into two tabs — "⚡ Broadcast Instan" (cepat, instant broadcast) and "📅 Posting Reguler" (lama, scheduled marketplace). Per spec BOTH now use the 15% platform mark-up (`PLATFORM_FEE_CEPAT`). `PLATFORM_FEE_LAMA=0.07` still exists in escrow.ts but must NOT be used for billing anymore — it is effectively dead for the panel/negotiation flow.
**Why:** user unified billing to a single 15% mark-up across both engines.
**How to apply:** the 15% multiplier is duplicated across paths that write `escrowAmount` — `hiring-mode-panel.tsx` (handleConfirmEscrow + inline invoice preview) and `home.tsx handleNominalUpdate` (chat negotiation). If the rate changes, update ALL of them via the `PLATFORM_FEE_CEPAT` constant (no hardcoded `1.07`/`1.15`). Watch for stale copy: event-note strings and calc badges also state the percentage literally.

## KNOWN pre-existing escrow fee inconsistency (still not fully unified)
`PLATFORM_RATE=0.10` (used by `calcSplit` at release) still differs from the 15% mark-up locked at posting, and `effectiveCommissionRate` (custom-job.ts, job-posting-modal) is a third system. `escrowAmount` is also stored inconsistently: hiring-mode-panel/negotiation store base×(1+fee) (total), but job-posting-modal & the ping path store base-only. So release payout (flat 10%) still does not match the locked mode fee. **Why noted:** architect flagged it; full unification is a large refactor across all job-creation paths + invoices + payout, deferred as out-of-scope. Fix requires one source of truth for what `escrowAmount` represents before touching `calcSplit`.
