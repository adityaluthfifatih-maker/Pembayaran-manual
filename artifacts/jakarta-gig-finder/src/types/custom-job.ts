export type PaymentType = "per_jam" | "per_shift" | "per_projek";
export type DurasiKontrak = "harian" | "1_bulan" | "3_bulan" | "6_bulan";

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
  durasiKontrak?: DurasiKontrak;
  nibPerusahaan?: string;
  namaPerusahaan?: string;
  flaggedSuspect?: boolean;
}

export const durasiKontrakOptions: { value: DurasiKontrak; label: string; rate: number }[] = [
  { value: "harian",  label: "Harian (Gig biasa)",    rate: 0.15 },
  { value: "1_bulan", label: "1 Bulan (Jangka pendek)", rate: 0.10 },
  { value: "3_bulan", label: "3 Bulan (Paruh waktu)",   rate: 0.075 },
  { value: "6_bulan", label: "6 Bulan (Semi-tetap)",    rate: 0.05 },
];

export function commissionRate(durasi?: DurasiKontrak): number {
  const opt = durasiKontrakOptions.find((o) => o.value === durasi);
  return opt ? opt.rate : 0.15;
}

export function calcCommission(nominal: number, pembayaran: PaymentType, durasi?: DurasiKontrak): number {
  const rate = commissionRate(durasi);
  if (pembayaran === "per_jam") return nominal * 8 * rate;
  return nominal * rate;
}

export function calcTotal(nominal: number, pembayaran: PaymentType): number {
  if (pembayaran === "per_jam") return nominal * 8;
  return nominal;
}

export const paymentLabels: Record<PaymentType, string> = {
  per_jam:    "Per Jam",
  per_shift:  "Per Shift",
  per_projek: "Per Projek / Target",
};

export const FRAUD_KEYWORDS = [
  "biaya seragam", "biaya admin", "uang jaminan", "deposit",
  "registrasi berbayar", "biaya pendaftaran", "uang muka",
  "investasi awal", "modal awal",
];

export function detectFraud(text: string): string | null {
  const lower = text.toLowerCase();
  for (const kw of FRAUD_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}
