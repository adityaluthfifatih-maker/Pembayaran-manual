import {
  pgTable,
  text,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
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
  suspended: boolean("suspended").notNull().default(false),
  profile: jsonb("profile").notNull().default({}),
  /** Path to the KTP document photo uploaded during KYC onboarding. */
  ktpPhotoUrl: text("ktp_photo_url"),
  /** Path to the selfie+KTP photo uploaded during KYC onboarding. */
  selfieWithKtpUrl: text("selfie_with_ktp_url"),
  /**
   * KYC verification status managed by admin operators.
   * Values: "pending" | "verified" | "rejected"
   */
  verificationStatus: text("verification_status").notNull().default("pending"),
  /** Master CV/resume file the worker keeps on their profile — reused as the default for Regular applications unless overridden per-application. */
  defaultCvUrl: text("default_cv_url"),
  /** Master portfolio file the worker keeps on their profile. */
  defaultPortfolioUrl: text("default_portfolio_url"),
  /**
   * Worker's last-known coordinates, sent from the device via
   * POST /api/workers/location whenever the radar toggle is on. Used by the
   * employer-facing "Radar Pekerja Terdekat" earthdistance search — never
   * exposed raw to companies (see fuzzCoordinate in companies/radar route).
   */
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  /** Worker opted in to receive nearby job/radar visibility ("siap kerja"). */
  isReadyToWork: boolean("is_ready_to_work").notNull().default(false),
  /** Freeform worker skill tags (e.g. "Barista", "Kurir", "Admin"). */
  skills: text("skills").array().notNull().default([]),
  locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true }),
  /**
   * "Rekhastha Bisnis" premium flag for employer accounts (role "perusahaan").
   * Unlocks unlimited free access to employee-management tools (GPS
   * attendance QR + daily wage calculator) — never gates job posting, which
   * stays free for every account. Kept on the account row itself (not a
   * separate `companies` table) because companies ARE users with
   * role="perusahaan" in this schema. See checkPremiumStatus in
   * artifacts/api-server/src/lib/premium.ts for the read+auto-expire logic.
   *
   * NOTE: this is a distinct premium flag from `company_subscriptions`
   * (monetization.ts), which powers the older Rp149k/mo applicant-contact
   * paywall. The two are intentionally kept separate to avoid touching the
   * existing applicant paywall behavior; a future pass could unify them.
   */
  isPremium: boolean("is_premium").notNull().default(false),
  /** Premium expiry. NULL = never subscribed. Auto-flips isPremium false once passed. */
  expiredAt: timestamp("expired_at", { withTimezone: true }),
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
