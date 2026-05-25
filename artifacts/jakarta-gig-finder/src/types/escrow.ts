export type EscrowStatus = "pending" | "locked" | "disputed" | "released" | "refunded";

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
export const PLATFORM_RATE = 0.10;         // 10% komisi platform
export const PPH_WITH_NPWP = 0.025;        // 2.5% PPh 21 dengan NPWP
export const PPH_WITHOUT_NPWP = 0.03;      // 3.0% PPh 21 tanpa NPWP
export const ADMIN_DISPUTE_FEE = 0.05;     // 5% biaya admin jika perusahaan menang

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
