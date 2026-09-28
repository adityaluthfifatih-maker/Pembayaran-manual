import {
  jsonb,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Midtrans transaction ledger.
 *
 * The order id is the merchant-generated id sent to Snap and is the stable
 * reconciliation key used by Midtrans HTTP notifications. Keeping the raw
 * transaction status alongside our domain status lets us audit every callback
 * without making the existing Xendit escrow tables provider-dependent.
 */
export const midtransPaymentsTable = pgTable("midtrans_payments", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  jobId: text("job_id"),
  jobType: text("job_type").notNull(),
  grossAmount: integer("gross_amount").notNull(),
  status: text("status").notNull().default("pending"),
  transactionId: text("transaction_id"),
  transactionStatus: text("transaction_status"),
  paymentType: text("payment_type"),
  fraudStatus: text("fraud_status"),
  transactionTime: timestamp("transaction_time", { withTimezone: true }),
  settlementTime: timestamp("settlement_time", { withTimezone: true }),
  customerDetails: jsonb("customer_details").$type<Record<string, unknown>>(),
  rawNotification: jsonb("raw_notification").$type<Record<string, unknown>>(),
  snapToken: text("snap_token"),
  redirectUrl: text("redirect_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMidtransPaymentSchema = createInsertSchema(
  midtransPaymentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertMidtransPayment = z.infer<typeof insertMidtransPaymentSchema>;
export type MidtransPayment = typeof midtransPaymentsTable.$inferSelect;