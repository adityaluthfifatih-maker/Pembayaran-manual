import {
  pgTable,
  text,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Real user accounts. The bespoke frontend `AuthUser` shape has a large set of
 * optional employer/worker sub-fields (KTP, NPWP, NIB, employer category, etc.)
 * that are never queried on their own, so they are stored as a single `profile`
 * JSON blob alongside the core identity columns.
 */
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  whatsapp: text("whatsapp"),
  linkedWithGoogle: boolean("linked_with_google").notNull().default(false),
  profile: jsonb("profile").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Opaque session tokens stored server-side and referenced by an httpOnly cookie.
 */
export const sessionsTable = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
