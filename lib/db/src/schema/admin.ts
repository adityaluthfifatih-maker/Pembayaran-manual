import {
  pgTable,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Admin ("Tilu Company") control-plane persistence. The admin auth is a
 * separate system from user accounts (see `api-server/src/lib/admin.ts`).
 * These tables move the previously in-memory session store and per-IP
 * brute-force throttle into Postgres so both survive an API server restart.
 */

/** Opaque admin session tokens referenced by the `rekhastha_admin` cookie. */
export const adminSessionsTable = pgTable("admin_sessions", {
  token: text("token").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Per-IP login attempt counters + lockout window for brute-force throttling. */
export const adminLoginAttemptsTable = pgTable("admin_login_attempts", {
  ip: text("ip").primaryKey(),
  count: integer("count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AdminSession = typeof adminSessionsTable.$inferSelect;
export type AdminLoginAttempt = typeof adminLoginAttemptsTable.$inferSelect;
