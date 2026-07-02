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

`calcTotal` and `calcCommission` are flat: gross = `nominal` (no ×8 hourly multiplier). `escrow.ts calcEscrowAmount` special-cases only `per_projek` (nominal × kuota); everything else is `nominal × hari × kuota`.

# Rupiah input + WS payload

Wage inputs mask to Indonesian thousands separators for display but store/submit a **clean integer** `nominal`. The realtime broadcast payload carries the clean integer + typed `pembayaran`; formatting happens on the receiving device. Do NOT send a pre-formatted currency string over the WS — it would corrupt the ledger math.

# Withdrawal callback

`onWithdraw(method: string, account: string)` is threaded EscrowWalletPanel → WorkerProfilePage → home. The "Dompet Rekhastha (Pencairan Upah)" form owns the method dropdown (GoPay/DANA/OVO/ShopeePay/Transfer Bank) + account input; net balance is shown as a disabled 100%-net summary.
