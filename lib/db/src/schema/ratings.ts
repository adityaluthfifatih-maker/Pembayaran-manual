import { pgTable, serial, bigint, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Post-shift ratings. Either party rates the other after a job: an employer
 * ("company") rates the worker, or a worker rates the employer. `raterType`
 * records which side left the rating, `targetName` is the rated party's display
 * name, `score` is 1–5 stars, and `note` is the optional free-text comment.
 *
 * The admin control plane aggregates negative ratings (score <= 2) per target
 * to surface problematic accounts, so these rows must be real (not mocked).
 */
export const ratingsTable = pgTable("ratings", {
  id: serial("id").primaryKey(),
  raterId: text("rater_id"),
  raterType: text("rater_type").notNull(),
  targetName: text("target_name").notNull(),
  score: integer("score").notNull(),
  note: text("note").notNull().default(""),
  jobId: bigint("job_id", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertRatingSchema = createInsertSchema(ratingsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRating = z.infer<typeof insertRatingSchema>;
export type Rating = typeof ratingsTable.$inferSelect;
