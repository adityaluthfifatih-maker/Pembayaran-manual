import {
  pgTable,
  serial,
  bigint,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Job applications submitted by workers.
 *
 * When a worker taps "Lamar" the row is persisted here and instantly fanned out
 * over the realtime hub so the employer's device receives the application without
 * polling. The worker's sensitive identity fields (NIK, NPWP, rekening) are
 * stored already-masked — masking happens on the worker's device before the
 * payload leaves the browser.
 */
export const applicationsTable = pgTable("applications", {
  id: serial("id").primaryKey(),
  jobId: bigint("job_id", { mode: "number" }).notNull(),
  jobTitle: text("job_title").notNull().default(""),
  workerId: text("worker_id").notNull(),
  workerName: text("worker_name").notNull().default(""),
  workerNikMasked: text("worker_nik_masked").notNull().default(""),
  workerNpwpMasked: text("worker_npwp_masked").notNull().default(""),
  hasNpwp: boolean("has_npwp").notNull().default(false),
  bank: text("bank").notNull().default(""),
  rekening: text("rekening").notNull().default(""),
  /** "baru" | "ditinjau" | "diterima" | "ditolak" | "selesai" */
  status: text("status").notNull().default("baru"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertApplicationSchema = createInsertSchema(
  applicationsTable,
).omit({ id: true, status: true, createdAt: true });

export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;
