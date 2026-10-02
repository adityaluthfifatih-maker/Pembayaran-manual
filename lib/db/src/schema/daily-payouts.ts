import { pgTable, serial, bigint, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * On-site borongan daily fractional payout log.
 *
 * Every verified daily QR check-out on an on-site borongan releases one day's
 * fraction of the total contract value (TotalContractValue / DurationDays) from
 * escrow to the worker, minus the 15% corporate fee. Each release is logged here
 * for corporate auditing and surfaced in the admin "Monitoring Proyek Fisik" tab.
 */
export const dailyPayoutsTable = pgTable("daily_payouts", {
  id: serial("id").primaryKey(),
  jobId: bigint("job_id", { mode: "number" }).notNull(),
  workerId: text("worker_id"),
  /** Historical rows remain marked as settled; new check-outs credit the wallet. */
  status: text("status").notNull().default("settled"),
  workerName: text("worker_name").notNull(),
  // 1-based day index within the contract ("Hari ke-N").
  dayIndex: integer("day_index").notNull(),
  // Gross daily fraction of the contract value before the corporate fee.
  grossFraction: integer("gross_fraction").notNull(),
  platformFee: integer("platform_fee").notNull(),
  netToWorker: integer("net_to_worker").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDailyPayoutSchema = createInsertSchema(dailyPayoutsTable).omit({
  id: true,
  at: true,
});
export type InsertDailyPayout = z.infer<typeof insertDailyPayoutSchema>;
export type DailyPayout = typeof dailyPayoutsTable.$inferSelect;
