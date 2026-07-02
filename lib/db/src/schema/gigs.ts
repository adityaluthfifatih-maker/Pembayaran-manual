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
  jumlahHari: integer("jumlah_hari"),
  employerId: text("employer_id"),
  employerName: text("employer_name"),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGigSchema = createInsertSchema(gigsTable);
export type InsertGig = z.infer<typeof insertGigSchema>;
export type Gig = typeof gigsTable.$inferSelect;
