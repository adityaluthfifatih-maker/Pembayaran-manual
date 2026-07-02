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

// ── Platform rates (Rekhastha) ─────────────────────────
// The platform fee is a single flat 15% employer-borne mark-up. All escrow /
// fee math funnels through PLATFORM_FEE_CEPAT + calcEmployerFee /
// calcEmployerDeposit / calcSplit so the amount charged always equals the
// amount paid out (worker net == base wage).
export const PLATFORM_FEE_CEPAT = 0.15;   // 15% biaya sistem — beban perusahaan
export const ADMIN_DISPUTE_FEE = 0.05;     // 5% biaya admin sengketa
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
 * platform's fee. The 15% platform fee is an EMPLOYER-only mark-up already baked
 * into the deposit (deposit = wage + 0.15·wage = wage × 1.15), so the worker
 * always receives 100% of the base wage and the platform keeps the 15%.
 *
 * `totalDeposit` is the single source of truth (base wage × 1.15) that every
 * posting / negotiation / release path now agrees on.
 */
export function calcSplit(totalDeposit: number) {
  const workerNet = Math.round(totalDeposit / (1 + PLATFORM_FEE_CEPAT));
  const platformCut = totalDeposit - workerNet;
  return { platformCut, workerNet };
}

/** The 15% platform fee added on top of the base wage, borne by the employer. */
export function calcEmployerFee(baseWage: number): number {
  return Math.round(baseWage * PLATFORM_FEE_CEPAT);
}

/** Total the employer funds into escrow: base wage + 15% employer-borne fee. */
export function calcEmployerDeposit(baseWage: number): number {
  return baseWage + calcEmployerFee(baseWage);
}

/**
 * On-site borongan daily fractional wage.
 *
 * Splits the TOTAL escrow deposit evenly across the contract duration so each
 * verified daily QR check-out releases exactly one day's share: the worker's net
 * (`netToWorker`) plus the 15% corporate fee (`platformFee`). `grossFraction` is
 * the day's gross before the fee (TotalContractValue / DurationDays basis).
 */
export function calcDailyFraction(totalDeposit: number, jumlahHari: number) {
  const days = Math.max(1, jumlahHari);
  const { workerNet, platformCut } = calcSplit(totalDeposit);
  const netToWorker = Math.round(workerNet / days);
  const platformFee = Math.round(platformCut / days);
  const grossFraction = netToWorker + platformFee;
  return { grossFraction, platformFee, netToWorker };
}
