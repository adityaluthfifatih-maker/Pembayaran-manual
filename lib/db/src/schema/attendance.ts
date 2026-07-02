import { pgTable, serial, bigint, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Cross-device QR attendance (Presensi) log.
 *
 * A row is written when a worker successfully scans an employer's short-lived
 * QR token. `kind` is the presence event: "masuk" (check-in) starts the shift,
 * "pulang" (check-out) ends it and triggers escrow release on the employer
 * device. Each scan is fanned out over the realtime hub so both the employer
 * and the worker devices react instantly.
 */
export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  jobId: bigint("job_id", { mode: "number" }).notNull(),
  workerName: text("worker_name").notNull(),
  kind: text("kind").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({
  id: true,
});
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendanceTable.$inferSelect;
