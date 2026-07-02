import { pgTable, serial, bigint, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Worker silent SOS incidents.
 *
 * When a worker triggers "🚨 LAPOR DARURAT (SOS)" a row is written in the
 * `emergency_active` state and instantly fanned out over the realtime hub so the
 * Tilu Company Admin Command Center raises its full-screen alarm. No phone call
 * is ever placed from the worker device — the admin acts as the human dispatcher.
 */
export const emergencyIncidentsTable = pgTable("emergency_incidents", {
  id: serial("id").primaryKey(),
  jobId: bigint("job_id", { mode: "number" }),
  workerName: text("worker_name").notNull(),
  workerPhone: text("worker_phone").notNull().default(""),
  jobTitle: text("job_title").notNull().default(""),
  employerName: text("employer_name").notNull().default(""),
  projectAddress: text("project_address").notNull().default(""),
  // "remote" | "onsite" — used to label the dispatch string.
  boronganType: text("borongan_type"),
  // "emergency_active" | "resolved".
  state: text("state").notNull().default("emergency_active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const insertEmergencySchema = createInsertSchema(emergencyIncidentsTable).omit({
  id: true,
  state: true,
  createdAt: true,
  resolvedAt: true,
});
export type InsertEmergencyIncident = z.infer<typeof insertEmergencySchema>;
export type EmergencyIncident = typeof emergencyIncidentsTable.$inferSelect;
