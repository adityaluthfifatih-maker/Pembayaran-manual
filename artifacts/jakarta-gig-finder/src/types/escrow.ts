export type EscrowStatus =
  | "pending"
  | "locked"
  | "disputed"
  | "disputed_active"
  | "released"
  | "refunded";

export interface EscrowEvent {
  id: number;
  jobId: number;
  jobTitle: string;
  fromStatus?: EscrowStatus;
  toStatus: EscrowStatus;
  actor: "system" | "company" | "worker" | "admin";
  actorName?: string;
  amount?: number;
  timestamp: Date;
  note?: string;
}

export interface WalletTransaction {
  id: number;
  type: "credit" | "debit";
  amount: number;
  label: string;
  jobTitle: string;
  timestamp: Date;
  note?: string;
}

// ── Platform rates (Rekhastha) ─────────────────────────────────────
// Category-tiered platform fee. The fee is an EMPLOYER-only mark-up on top of
// the base wage — workers always receive 100% of the advertised nominal.
export type JobCategory = "umum" | "terampil" | "profesional";

export const PLATFORM_FEE_RATES: Record<JobCategory, number> = {
  umum:        0.03,   // 3%  — Umum / Tenaga Manual (pindah, bersih, packing)
  terampil:    0.05,   // 5%  — Terampil / Teknis (listrik, plumbing, sopir, katering)
  profesional: 0.08,   // 8%  — Profesional / Spesialis (akuntansi, legal, IT, medis)
};

/** Middle tier used as default for jobs that pre-date the tiered system. */
export const DEFAULT_FEE_RATE = PLATFORM_FEE_RATES.terampil;

/** Resolve the numeric fee rate for a given category (or the default if absent). */
export function getFeeRate(category?: JobCategory | null): number {
  return category ? (PLATFORM_FEE_RATES[category] ?? DEFAULT_FEE_RATE) : DEFAULT_FEE_RATE;
}

export const ADMIN_DISPUTE_FEE = 0.05;     // 5% biaya admin sengketa (unchanged)
export const CANCELLATION_FEE_1HR = 20_000; // Rp 20.000 potongan jika pemberi kerja batal <1 jam

// ── Kedisiplinan & jendela sengketa ───────────────────
export const LATE_CLOCKIN_PENALTY = 15_000;         // Rp 15.000 denda gagal Clock-In tepat waktu
export const CLOCKIN_GRACE_MS = 15 * 60 * 1000;      // 15 menit masa tenggang Clock-In sejak shift dimulai
export const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 jam jendela validasi/sengketa pasca Clock-Out
export const MAX_BYPASS_STRIKES = 3;                  // 3 pelanggaran = blacklist permanen

export const DURATION_DAYS: Record<string, number> = {
  harian: 1,
  "1_bulan": 22,
  "3_bulan": 66,
  "6_bulan": 132,
};

export function calcEscrowAmount(
  nominal: number,
  pembayaran: string,
  jumlahHari: number,
  kuota: number
): number {
  if (pembayaran === "per_projek") return nominal * kuota;
  const perDay = nominal;
  return perDay * jumlahHari * kuota;
}

/**
 * Split an employer's total escrow deposit into the worker's net wage and the
 * platform's fee. The fee is an EMPLOYER-only mark-up already baked into the
 * deposit (deposit = wage + feeRate·wage = wage × (1 + feeRate)), so the worker
 * always receives 100% of the base wage.
 *
 * Pass the stored `feeRate` from the gig row so payouts always agree with the
 * rate that was charged at posting time — not a recomputed constant.
 */
export function calcSplit(totalDeposit: number, feeRate = DEFAULT_FEE_RATE) {
  const workerNet = Math.round(totalDeposit / (1 + feeRate));
  const platformCut = totalDeposit - workerNet;
  return { platformCut, workerNet };
}

/** The employer-borne platform fee added on top of the base wage. */
export function calcEmployerFee(baseWage: number, feeRate = DEFAULT_FEE_RATE): number {
  return Math.round(baseWage * feeRate);
}

/** Total the employer funds into escrow: base wage + employer-borne fee. */
export function calcEmployerDeposit(baseWage: number, feeRate = DEFAULT_FEE_RATE): number {
  return baseWage + calcEmployerFee(baseWage, feeRate);
}

/**
 * On-site borongan daily fractional wage.
 *
 * Splits the TOTAL escrow deposit evenly across the contract duration so each
 * verified daily QR check-out releases exactly one day's share: the worker's net
 * (`netToWorker`) plus the corporate fee (`platformFee`). `grossFraction` is
 * the day's gross before the fee.
 */
export function calcDailyFraction(totalDeposit: number, jumlahHari: number, feeRate = DEFAULT_FEE_RATE) {
  const days = Math.max(1, jumlahHari);
  const { workerNet, platformCut } = calcSplit(totalDeposit, feeRate);
  const netToWorker = Math.round(workerNet / days);
  const platformFee = Math.round(platformCut / days);
  const grossFraction = netToWorker + platformFee;
  return { grossFraction, platformFee, netToWorker };
}
