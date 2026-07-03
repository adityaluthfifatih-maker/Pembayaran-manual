---
name: Escrow Engine Architecture
description: Rekhastha escrow/e-wallet system — rates, status lifecycle, split calc, and action ownership across components.
---

## Rates (src/types/escrow.ts)
- Platform fee: CATEGORY-TIERED, employer-borne mark-up, worker always receives 100%:
  - `PLATFORM_FEE_RATES.umum = 0.03` (Umum/Manual: pindahan, bersih, packing)
  - `PLATFORM_FEE_RATES.terampil = 0.05` (Terampil/Teknis: listrik, sopir, katering) — DEFAULT
  - `PLATFORM_FEE_RATES.profesional = 0.08` (Profesional: IT, akuntansi, medis)
  - `DEFAULT_FEE_RATE = 0.05` (terampil) — used when job has no category set
  - `getFeeRate(cat?)` helper — always call this, never index PLATFORM_FEE_RATES directly in components
- `JobCategory` type = "umum" | "terampil" | "profesional" (exported from escrow.ts + custom-job.ts)
- `jobCategory` and `feeRate` stored on CustomJob and persisted in DB columns `job_category` / `fee_rate`
- Tax-free: no PPh/PPN deductions anywhere.
- Admin fee if company wins dispute: 5% of gross (`ADMIN_DISPUTE_FEE`)
- Legacy constants `PLATFORM_RATE=0.10`, `PLATFORM_FEE_LAMA=0.07`, `PLATFORM_FEE_CEPAT` are GONE — replaced by tiered system.

## EscrowStatus lifecycle
`pending` → `locked` (on job post) → `released` (Selesai & Bayar) | `disputed` → `released` (worker wins) | `refunded` (company wins)

## calcSplit(totalDeposit, feeRate?) returns
`{ platformCut, workerNet }` where `workerNet = round(totalDeposit / (1 + feeRate))` and `platformCut = totalDeposit − workerNet`. Input is the TOTAL employer deposit. Helpers: `calcEmployerFee(baseWage, feeRate?)=round(baseWage×feeRate)`, `calcEmployerDeposit(baseWage, feeRate?)=baseWage+fee`. All three accept optional `feeRate` defaulting to `DEFAULT_FEE_RATE`.

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

## Dual-recruitment: BOTH hiring modes bill the category-tiered rate
The employer panel is split into "⚡ Broadcast Instan" (cepat) and "📅 Posting Reguler" (lama). Both tabs share the same `jobCategory` picker → `getFeeRate(jobCategory)` → `feeRate` on the job. The rate varies per job, not per mode.
**Why:** tiered pricing replaced the old flat 15% to incentivise professional gig posting.
**How to apply:** always derive `feeRate` via `getFeeRate(job.feeRate ? undefined : "terampil")` or read `job.feeRate ?? DEFAULT_FEE_RATE`. Never hardcode `0.15`/`1.15`. Pass `feeRate` to all escrow helpers (`calcEmployerFee`, `calcEmployerDeposit`, `calcSplit`). The category picker UI lives in `hiring-mode-panel.tsx` (after the posisi input).

## Escrow fee model: tiered, single source of truth
`escrowAmount` on a gig = base wage × (1 + feeRate). Every write path derives it via `calcEmployerDeposit(nominal, feeRate)` — `hiring-mode-panel.tsx` handleConfirmEscrow + handleCepatSubmit/handleLamaSubmit, and `home.tsx handleNominalUpdate` for chat negotiation. Release-time `calcSplit(escrowAmount, feeRate)` recovers worker 100%.
**How to apply:** never hardcode multipliers; use `calcEmployerFee`/`calcEmployerDeposit`/`calcSplit` with the job's `feeRate`. `effectiveCommissionRate`/`calcCommission` in custom-job.ts are legacy — don't reintroduce.

## Admin control plane + suspension enforcement
Gated admin portal at `/admin` (client `pages/admin.tsx`, `lib/admin-client.ts`) over a SEPARATE httpOnly admin session cookie (server `lib/admin.ts`: in-mem sessions, 8h TTL, per-IP throttle 5/5min, credentials read from env `ADMIN_ID`/`ADMIN_TOKEN`). NOTE: `lib/admin.ts` ships insecure hardcoded fallback credentials when those env vars are unset — set both env vars for any real deployment. Endpoints in `routes/admin.ts` (ledger/force-release/users/suspend/academy). Ratings persist via `routes/ratings.ts` (stars→score, comment→note).
**Suspension gotcha:** the `suspended` flag must be checked on ALL THREE auth entry points — `/auth/login`, `/auth/google`, AND `/auth/me` (403 + clears session). Adding a new auth path? Add the suspension guard too, or you create a bypass.
