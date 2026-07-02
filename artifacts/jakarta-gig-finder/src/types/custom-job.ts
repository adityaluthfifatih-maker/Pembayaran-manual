import type { EscrowStatus } from "./escrow";

export type PaymentType = "per_shift" | "per_hari" | "per_projek" | "per_bulan";
export type DurasiKontrak = "harian" | "1_bulan" | "3_bulan" | "6_bulan";
export type TipeAkun = "perusahaan" | "agensi";

export type HiringMode = "cepat" | "lama";

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
  tipeAkun?: TipeAkun;
  isAgency?: boolean;
  // ── Hiring mode ──────────────────────────────────────
  hiringMode?: HiringMode;     // "cepat" = instant broadcast, "lama" = scheduled
  broadcastActive?: boolean;   // true when instant broadcast is live
  // ── Scheduling / placement (Posting Reguler) ─────────
  jobDate?: Date;              // start date — auto "today" for instant, chosen for scheduled
  jamKerja?: string;          // shift hours, e.g. "08:00 - 17:00 WIB"
  alamat?: string;            // specific placement address (scheduled jobs)
  // ── Escrow fields ────────────────────────────────────
  escrowStatus?: EscrowStatus;
  escrowAmount?: number;   // Total gross locked in escrow (per ALL workers)
  jumlahHari?: number;     // Working days for this contract
}

export const durasiKontrakOptions: { value: DurasiKontrak; label: string; rate: number }[] = [
  { value: "harian",  label: "Harian (Gig biasa)",      rate: 0.15 },
  { value: "1_bulan", label: "1 Bulan (Jangka pendek)", rate: 0.10 },
  { value: "3_bulan", label: "3 Bulan (Paruh waktu)",   rate: 0.075 },
  { value: "6_bulan", label: "6 Bulan (Semi-tetap)",    rate: 0.05 },
];

export function effectiveCommissionRate(
  durasi?: DurasiKontrak,
  isAgency?: boolean,
  kuota?: number
): number {
  // Volume discount for agencies with > 15 workers
  if (isAgency && (kuota ?? 0) > 15) return 0.07;
  const opt = durasiKontrakOptions.find((o) => o.value === durasi);
  return opt ? opt.rate : 0.15;
}

/** Alias kept for compatibility */
export function commissionRate(durasi?: DurasiKontrak): number {
  const opt = durasiKontrakOptions.find((o) => o.value === durasi);
  return opt ? opt.rate : 0.15;
}

export function calcCommission(
  nominal: number,
  _pembayaran: PaymentType,
  durasi?: DurasiKontrak,
  isAgency?: boolean,
  kuota?: number
): number {
  const rate = effectiveCommissionRate(durasi, isAgency, kuota);
  return nominal * rate;
}

/** Gross wage per worker. Every payment type is a flat nominal (no hourly ×8). */
export function calcTotal(nominal: number, _pembayaran?: PaymentType): number {
  return nominal;
}

/** Selector labels for the 4 Indonesian payment categories. */
export const paymentLabels: Record<PaymentType, string> = {
  per_shift:  "Per Shift",
  per_hari:   "Per Hari (Harian Lepas)",
  per_projek: "Per Proyek (Borongan)",
  per_bulan:  "Per Bulan (Kontrak Lepas)",
};

/** Full wage-input field labels shown above the nominal field. */
export const paymentInputLabels: Record<PaymentType, string> = {
  per_shift:  "Upah Per Shift",
  per_hari:   "Upah Per Hari",
  per_projek: "Total Nilai Proyek / Borongan",
  per_bulan:  "Gaji Per Bulan",
};

/** Short unit suffix for compact wage displays (e.g. "Rp 150.000 / Shift"). */
export const paymentUnits: Record<PaymentType, string> = {
  per_shift:  "Shift",
  per_hari:   "Hari",
  per_projek: "Proyek",
  per_bulan:  "Bulan",
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
