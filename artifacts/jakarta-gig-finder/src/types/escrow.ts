export type EscrowStatus = "pending" | "locked" | "disputed" | "released" | "refunded";

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
export const PLATFORM_RATE = 0.10;         // 10% komisi platform (default/legacy)
export const PLATFORM_FEE_CEPAT = 0.15;   // 15% biaya sistem — Mode Butuh Cepat (instant broadcast)
export const PLATFORM_FEE_LAMA = 0.07;    // 7%  biaya sistem — Mode Bisa Lama (scheduled contract)
export const PPH_WITH_NPWP = 0.025;        // Catatan: pajak menjadi tanggung jawab mandiri pihak
export const PPH_WITHOUT_NPWP = 0.03;      // Catatan: pajak menjadi tanggung jawab mandiri pihak
export const ADMIN_DISPUTE_FEE = 0.05;     // 5% biaya admin sengketa
export const CANCELLATION_FEE_1HR = 20_000; // Rp 20.000 potongan jika pemberi kerja batal <1 jam

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
  const perDay = pembayaran === "per_jam" ? nominal * 8 : nominal;
  return perDay * jumlahHari * kuota;
}

export function calcSplit(grossAmount: number, hasNpwp: boolean) {
  const platformCut = Math.round(grossAmount * PLATFORM_RATE);
  const remainAfterPlatform = grossAmount - platformCut;
  const pphRate = hasNpwp ? PPH_WITH_NPWP : PPH_WITHOUT_NPWP;
  const pphCut = Math.round(remainAfterPlatform * pphRate);
  const workerNet = remainAfterPlatform - pphCut;
  return { platformCut, pphCut, workerNet, pphRate };
}
