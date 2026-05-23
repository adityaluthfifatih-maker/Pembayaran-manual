export type PaymentType = "per_jam" | "per_shift" | "per_projek";

export interface CustomJob {
  id: number;
  type: "custom_job";
  posisi: string;
  deskripsi: string;
  pembayaran: PaymentType;
  nominal: number;
  dresscode: string;
  kuota: number;
  lat: number;
  lng: number;
  postedAt: Date;
}

export function calcCommission(nominal: number, pembayaran: PaymentType): number {
  if (pembayaran === "per_jam") {
    return nominal * 8 * 0.15;
  }
  return nominal * 0.15;
}

export function calcTotal(nominal: number, pembayaran: PaymentType): number {
  if (pembayaran === "per_jam") {
    return nominal * 8;
  }
  return nominal;
}

export const paymentLabels: Record<PaymentType, string> = {
  per_jam: "Per Jam",
  per_shift: "Per Shift",
  per_projek: "Per Projek / Target",
};
