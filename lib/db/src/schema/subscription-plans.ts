import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * "Rekhastha Bisnis" master price list (launch promo). `durationDays` is the
 * exact number of days credited on payment success — stored explicitly
 * rather than derived from `durationMonths * 30` so a 6-month plan credits
 * 180 days and a 12-month plan credits 365 days, matching the product spec
 * exactly instead of a generic 30-day-per-month approximation.
 */
export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  /** Marketing label, e.g. "1 Bulan", "1 Tahun". */
  label: text("label").notNull(),
  durationMonths: integer("duration_months").notNull(),
  durationDays: integer("duration_days").notNull(),
  /** Rupiah, struck-through "normal" price shown next to the promo price. */
  originalPrice: integer("original_price").notNull(),
  /** Rupiah, the actual launch-promo price charged. */
  promoPrice: integer("promo_price").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(
  subscriptionPlansTable,
).omit({ id: true, createdAt: true });
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;

/**
 * A "Rekhastha Bisnis" purchase order. Created "pending" when the employer
 * picks a plan, flipped to "success"/"failed" by the payment gateway
 * webhook. On "success" the webhook accumulates `durationDays` onto the
 * company's `users.expiredAt` (see accumulatePremium in lib/premium.ts).
 */
export const subscriptionOrdersTable = pgTable("subscription_orders", {
  id: serial("id").primaryKey(),
  companyId: text("company_id").notNull(),
  planId: integer("plan_id")
    .notNull()
    .references(() => subscriptionPlansTable.id),
  /** Rupiah amount actually charged — snapshotted from promoPrice at order-creation time. */
  amount: integer("amount").notNull(),
  orderIdGateway: text("order_id_gateway"),
  /** "pending" | "success" | "failed" */
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSubscriptionOrderSchema = createInsertSchema(
  subscriptionOrdersTable,
).omit({ id: true, createdAt: true, status: true, orderIdGateway: true });
export type InsertSubscriptionOrder = z.infer<typeof insertSubscriptionOrderSchema>;
export type SubscriptionOrder = typeof subscriptionOrdersTable.$inferSelect;
