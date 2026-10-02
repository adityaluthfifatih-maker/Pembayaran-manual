import {
  pgTable,
  bigint,
  text,
  integer,
  boolean,
  doublePrecision,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Live cross-device gig feed.
 *
 * A gig is inserted by the Employer device and instantly pushed to every
 * connected Worker device over WebSocket. The primary key is client-provided
 * (a collision-resistant numeric id generated on the posting device) so an
 * optimistic local entry and the broadcast echo reconcile by id without
 * creating duplicate radar pins.
 */
export const gigsTable = pgTable("gigs", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  posisi: text("posisi").notNull(),
  deskripsi: text("deskripsi").notNull().default(""),
  pembayaran: text("pembayaran").notNull(),
  nominal: integer("nominal").notNull(),
  dresscode: text("dresscode").notNull().default(""),
  kuota: integer("kuota").notNull().default(1),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  durasiKontrak: text("durasi_kontrak"),
  namaPerusahaan: text("nama_perusahaan"),
  nibPerusahaan: text("nib_perusahaan"),
  flaggedSuspect: boolean("flagged_suspect").notNull().default(false),
  tipeAkun: text("tipe_akun"),
  isAgency: boolean("is_agency").notNull().default(false),
  hiringMode: text("hiring_mode"),
  broadcastActive: boolean("broadcast_active").notNull().default(false),
  jobDate: timestamp("job_date", { withTimezone: true }),
  jamKerja: text("jam_kerja"),
  alamat: text("alamat"),
  escrowStatus: text("escrow_status"),
  escrowAmount: integer("escrow_amount"),
  /** awaiting_payment -> confirmed; existing pre-pilot gigs default to confirmed. */
  paymentStatus: text("payment_status").notNull().default("confirmed"),
  jumlahHari: integer("jumlah_hari"),
  employerId: text("employer_id"),
  employerName: text("employer_name"),
  // ── Kategori & biaya platform ───────────────────────────────────
  // jobCategory drives the tiered employer-borne fee (umum=3%, terampil=5%, profesional=8%).
  // feeRate stores the exact decimal rate locked in at posting time so pay-slips and
  // analytics always reflect the charged rate — never a recomputed constant.
  jobCategory: text("job_category"),
  feeRate: doublePrecision("fee_rate"),
  // ── Borongan workflows ──────────────────────────────────────────
  // "remote" = milestone proof-of-work; "onsite" = daily QR fractional payout.
  boronganType: text("borongan_type"),
  // Remote milestone: the submitted proof-of-work URL (Drive/Figma/GitHub …).
  proofUrl: text("proof_url"),
  // Remote milestone state: "submitted" | "approved" | "rejected".
  proofStatus: text("proof_status"),
  // On-site: how many daily wage fractions have already been released.
  daysPaid: integer("days_paid").notNull().default(0),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGigSchema = createInsertSchema(gigsTable);
export type InsertGig = z.infer<typeof insertGigSchema>;
export type Gig = typeof gigsTable.$inferSelect;
