import type { EscrowStatus, JobCategory } from "./escrow";

export type { JobCategory };
export type PaymentType = "per_shift" | "per_hari" | "per_projek" | "per_bulan";
export type DurasiKontrak = "harian" | "1_bulan" | "3_bulan" | "6_bulan";
export type TipeAkun = "perusahaan" | "agensi";

export type HiringMode = "cepat" | "lama";

/** Borongan (project contract) execution mode. */
export type BoronganType = "remote" | "onsite";

/** Remote milestone proof-of-work review state. */
export type ProofStatus = "submitted" | "approved" | "rejected";

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
  paymentStatus?: "awaiting_payment" | "confirmed" | string;
  jumlahHari?: number;     // Working days for this contract
  // ── Poster identity (for blacklist filtering) ────────
  employerId?: string;     // real account id of the employer who posted
  employerName?: string;   // display name of the poster
  // ── Kategori & biaya platform ────────────────────────
  jobCategory?: JobCategory;   // "umum" | "terampil" | "profesional"
  feeRate?: number;            // stored rate at posting time (e.g. 0.03 / 0.05 / 0.08)
  // ── Borongan (project contract) workflows ────────────
  boronganType?: BoronganType;   // "remote" (milestone) | "onsite" (daily QR)
  proofUrl?: string;             // remote milestone proof-of-work URL
  proofStatus?: ProofStatus;     // remote milestone review state
  daysPaid?: number;             // on-site daily fractions already released
}

export const durasiKontrakOptions: { value: DurasiKontrak; label: string }[] = [
  { value: "harian",  label: "Harian (Gig biasa)"      },
  { value: "1_bulan", label: "1 Bulan (Jangka pendek)" },
  { value: "3_bulan", label: "3 Bulan (Paruh waktu)"   },
  { value: "6_bulan", label: "6 Bulan (Semi-tetap)"    },
];

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
