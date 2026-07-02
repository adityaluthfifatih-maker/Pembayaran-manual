---
name: Payment type & wage model
description: Rekhastha's 4 payment categories, the flat-wage math, and the withdrawal payload convention.
---

# Payment categories

`PaymentType` = `per_shift | per_hari | per_projek | per_bulan` (4 Indonesian daily-gig categories). There is no hourly (`per_jam`) type — it was removed.

**Why:** the product spec defines exactly these 4 categories. Do not re-introduce `per_jam`.

**Key spelling gotcha:** the "proyek" category keeps the legacy key `per_projek` (with a `j`), even though its user-facing label is "Per Proyek (Borongan)". Renaming the key to `per_proyek` would break many `=== "per_projek"` comparisons for no user benefit. Keep the key as-is; only labels are Indonesian-correct.

# Display maps (single source of truth)

All wage-type text comes from three maps in `types/custom-job.ts`: `paymentLabels` (selector), `paymentInputLabels` (wage-field label), `paymentUnits` (short suffix like "Shift"). Never hand-write per-type ternaries in components — import the map.

# Flat wage math

`calcTotal` is flat: gross = `nominal` (no ×8 hourly multiplier). `escrow.ts calcEscrowAmount` special-cases only `per_projek` (nominal × kuota); everything else is `nominal × hari × kuota`.

# Fee model is a single flat 15% employer-borne mark-up

There is exactly ONE platform-fee rate: `PLATFORM_FEE_CEPAT = 0.15` in `escrow.ts`, applied through `calcEmployerFee` / `calcEmployerDeposit` / `calcSplit`. Deposit = wage × 1.15; the worker always receives 100% of the base wage and the 15% is borne by the employer, so amount charged == amount paid out.

**Why:** the old tiered/duration-based commission model (`calcCommission`, `effectiveCommissionRate`, `PLATFORM_RATE=0.10`, `PLATFORM_FEE_LAMA=0.07`) let the deposit be computed at one rate while release paid out at another — a real charge/payout mismatch (e.g. chat-modal negotiation locked escrow at 7%, release split at 15%). Those functions/constants were removed.

**How to apply:** never re-introduce a per-duration or per-agency commission rate for escrow/fee math. `durasiKontrakOptions[].rate` and `commissionRate()` still exist but are only cosmetic contract-duration metadata; do NOT wire them back into deposit/release/display of the fee. The analytics `CONTRACT_SCENARIOS` bar chart is a hardcoded what-if simulation, not live fee math.

# Rupiah input + WS payload

Wage inputs mask to Indonesian thousands separators for display but store/submit a **clean integer** `nominal`. The realtime broadcast payload carries the clean integer + typed `pembayaran`; formatting happens on the receiving device. Do NOT send a pre-formatted currency string over the WS — it would corrupt the ledger math.

# Withdrawal callback

`onWithdraw(method: string, account: string)` is threaded EscrowWalletPanel → WorkerProfilePage → home. The "Dompet Rekhastha (Pencairan Upah)" form owns the method dropdown (GoPay/DANA/OVO/ShopeePay/Transfer Bank) + account input; net balance is shown as a disabled 100%-net summary.
