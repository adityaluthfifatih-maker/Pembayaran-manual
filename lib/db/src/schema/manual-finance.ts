import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Server-owned manual finance records for the UMKM pilot.
 * The application records transfer evidence and admin decisions; it does not
 * move money or represent a regulated custodian account.
 */
export const manualPaymentSettingsTable = pgTable("manual_payment_settings", {
  id: integer("id").primaryKey().default(1),
  bankName: text("bank_name").notNull().default(""),
  accountName: text("account_name").notNull().default(""),
  accountNumber: text("account_number").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A single payment obligation per product/order. Amounts and ownership are
 * computed by the server; clients may only submit transfer reference details.
 */
export const manualPaymentsTable = pgTable(
  "manual_payments",
  {
    id: serial("id").primaryKey(),
    payerId: text("payer_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("awaiting_payment"),
    transferReference: text("transfer_reference"),
    proofNote: text("proof_note"),
    adminNote: text("admin_note"),
    reviewedBy: text("reviewed_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("manual_payments_target_unique").on(table.targetType, table.targetId),
  ],
);

/** Immutable credits that form the authoritative available worker balance. */
export const walletEntriesTable = pgTable(
  "wallet_entries",
  {
    id: serial("id").primaryKey(),
    workerId: text("worker_id").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    amount: integer("amount").notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("wallet_entries_source_unique").on(table.sourceType, table.sourceId),
  ],
);

/** Admin-recorded bank transfers requested by workers. */
export const manualPayoutsTable = pgTable("manual_payouts", {
  id: serial("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  amount: integer("amount").notNull(),
  bankName: text("bank_name").notNull(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(),
  status: text("status").notNull().default("pending"),
  transferReference: text("transfer_reference"),
  adminNote: text("admin_note"),
  settledBy: text("settled_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export type ManualPaymentSetting = typeof manualPaymentSettingsTable.$inferSelect;
export type ManualPayment = typeof manualPaymentsTable.$inferSelect;
export type WalletEntry = typeof walletEntriesTable.$inferSelect;
export type ManualPayout = typeof manualPayoutsTable.$inferSelect;