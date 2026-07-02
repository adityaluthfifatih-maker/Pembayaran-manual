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
 * Operator-academy quiz completions, one row per submitted attempt.
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

/**
 * DB-backed question bank. Correct answers and explanations are server-side
 * only — client endpoints strip them before responding. The `slug` column is
 * used as the `questionId` in quiz submissions so existing completions remain
 * interpretable. New questions auto-generate a slug.
 */
export const academyQuestionsTable = pgTable("academy_questions", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  prompt: text("prompt").notNull(),
  options: jsonb("options").notNull().$type<string[]>(),
  correctIndex: integer("correct_index").notNull(),
  explanation: text("explanation").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertAcademyQuestionSchema = createInsertSchema(
  academyQuestionsTable,
).omit({ id: true });
export type InsertAcademyQuestion = z.infer<typeof insertAcademyQuestionSchema>;
export type AcademyDbQuestion = typeof academyQuestionsTable.$inferSelect;

/**
 * Singleton settings row (always id=1). Holds the minimum passing score
 * so operators can adjust it without a redeploy.
 */
export const academySettingsTable = pgTable("academy_settings", {
  id: integer("id").primaryKey().default(1),
  passingScore: integer("passing_score").notNull().default(80),
});

export type AcademySettings = typeof academySettingsTable.$inferSelect;
