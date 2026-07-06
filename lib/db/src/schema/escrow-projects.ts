import {
  pgTable,
  serial,
  integer,
  text,
  doublePrecision,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Proyek + Milestone escrow — a dedicated contract type funded via a Xendit
 * Invoice/Virtual Account (sandbox) and released per-milestone via Xendit
 * Disbursement. This is separate from the gigs/borongan escrow flow, which
 * is a simulated internal ledger; this table tracks the real Xendit
 * object ids so the funding/disbursement lifecycle can be reconciled.
 *
 * Lifecycle: draft -> pending_payment (invoice generated) -> funded
 * (invoice paid, confirmed via Xendit webhook) -> completed (all milestones
 * disbursed). A project can also end in `expired` (invoice expired unpaid).
 */
export const escrowProjectsTable = pgTable("escrow_projects", {
  id: serial("id").primaryKey(),
  employerId: text("employer_id").notNull(),
  /** Set once a worker is assigned/hired for the project; required before disbursement. */
  workerId: text("worker_id"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** Total contract value in IDR (whole rupiah, no decimals). */
  totalAmount: integer("total_amount").notNull(),
  status: text("status").notNull().default("draft"),
  /** Xendit invoice object id (`id` field in the Xendit Invoice API response). */
  xenditInvoiceId: text("xendit_invoice_id"),
  /** Our own idempotency key sent as `external_id` to Xendit; used to reconcile webhooks. */
  xenditExternalId: text("xendit_external_id"),
  /** Hosted Xendit checkout page / simulated VA payment URL. */
  xenditInvoiceUrl: text("xendit_invoice_url"),
  fundedAt: timestamp("funded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A single milestone within a Proyek. `percentage` values across a project's
 * milestones must sum to 100; `amount` is the IDR snapshot computed at
 * creation time (`round(totalAmount * percentage / 100)`) so disbursement
 * math never depends on a live recomputation.
 */
export const escrowMilestonesTable = pgTable("escrow_milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => escrowProjectsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  percentage: doublePrecision("percentage").notNull(),
  amount: integer("amount").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  /** pending -> approved -> disbursed | failed */
  status: text("status").notNull().default("pending"),
  /** Xendit disbursement object id, set once the payout is created. */
  xenditDisbursementId: text("xendit_disbursement_id"),
  disbursedAt: timestamp("disbursed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEscrowProjectSchema = createInsertSchema(
  escrowProjectsTable,
).omit({ id: true, createdAt: true });
export type InsertEscrowProject = z.infer<typeof insertEscrowProjectSchema>;
export type EscrowProject = typeof escrowProjectsTable.$inferSelect;

export const insertEscrowMilestoneSchema = createInsertSchema(
  escrowMilestonesTable,
).omit({ id: true, createdAt: true });
export type InsertEscrowMilestone = z.infer<typeof insertEscrowMilestoneSchema>;
export type EscrowMilestone = typeof escrowMilestonesTable.$inferSelect;
