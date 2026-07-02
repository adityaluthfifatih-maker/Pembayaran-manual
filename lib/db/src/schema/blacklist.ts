import {
  pgTable,
  serial,
  bigint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Employer → worker blacklist.
 *
 * When an employer blocks a worker (from the post-shift rating modal) a row is
 * written keyed by the employer's real account id and the worker's display
 * name. A blacklisted worker's feed hides every gig posted by that employer:
 * the worker device fetches the employer ids that blocked it and filters the
 * live gig list (pins + cards) locally.
 */
export const blacklistTable = pgTable(
  "blacklist",
  {
    id: serial("id").primaryKey(),
    employerId: text("employer_id").notNull(),
    employerName: text("employer_name").notNull().default(""),
    workerName: text("worker_name").notNull(),
    jobId: bigint("job_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    employerWorkerUniq: uniqueIndex("blacklist_employer_worker_uniq").on(
      t.employerId,
      t.workerName,
    ),
  }),
);

export const insertBlacklistSchema = createInsertSchema(blacklistTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBlacklist = z.infer<typeof insertBlacklistSchema>;
export type Blacklist = typeof blacklistTable.$inferSelect;
