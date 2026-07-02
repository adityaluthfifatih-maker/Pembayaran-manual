import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Operator-academy quiz completions, one row per submitted attempt. The quiz
 * question bank itself lives as a server-side seed (so correct answers never
 * reach the browser); this table only records who took the assessment and how
 * they scored. Keyed by the admin id from the admin session (a single operator
 * today, but per-admin so multiple operators can be tracked independently).
 */
export const academyCompletionsTable = pgTable("academy_completions", {
  id: serial("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  correct: integer("correct").notNull(),
  total: integer("total").notNull(),
  score: integer("score").notNull(),
  passed: boolean("passed").notNull(),
  answers: jsonb("answers").notNull().default([]),
  completedAt: timestamp("completed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAcademyCompletionSchema = createInsertSchema(
  academyCompletionsTable,
).omit({ id: true, completedAt: true });
export type InsertAcademyCompletion = z.infer<
  typeof insertAcademyCompletionSchema
>;
export type AcademyCompletion = typeof academyCompletionsTable.$inferSelect;
