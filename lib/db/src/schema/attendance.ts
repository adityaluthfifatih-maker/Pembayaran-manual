import { pgTable, serial, bigint, text, timestamp, unique } from "drizzle-orm/pg-core";
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
 *
 * `workerId` identifies the authenticated worker (users.id).
 * `scanDate` is the calendar date of the scan ("YYYY-MM-DD"), used together
 * with `(jobId, workerId, kind)` to enforce the unique constraint that prevents
 * a worker from scanning the same event twice on the same day.
 */
export const attendanceTable = pgTable(
  "attendance",
  {
    id: serial("id").primaryKey(),
    jobId: bigint("job_id", { mode: "number" }).notNull(),
    workerId: text("worker_id").notNull().default(""),
    workerName: text("worker_name").notNull(),
    kind: text("kind").notNull(),
    scanDate: text("scan_date").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("attendance_worker_job_kind_date_unique").on(
      t.jobId,
      t.workerId,
      t.kind,
      t.scanDate,
    ),
  ],
);

export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({
  id: true,
});
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendanceTable.$inferSelect;
