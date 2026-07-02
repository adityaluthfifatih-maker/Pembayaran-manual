import { randomUUID } from "node:crypto";
import type { CookieOptions } from "express";
import { and, eq, lte } from "drizzle-orm";
import { db, adminSessionsTable, adminLoginAttemptsTable } from "@workspace/db";

/**
 * Admin ("Tilu Company") control-plane auth. Deliberately separate from the
 * user session system: a distinct httpOnly cookie, a Postgres-backed session
 * store, and per-IP brute-force throttling. Both the session store and the
 * throttle counters live in the database so they survive an API server restart
 * (a restart used to log every admin out and reset the brute-force throttle).
 * Credentials come from env secrets (ADMIN_ID / ADMIN_TOKEN). In development
 * the documented demo values are used as a fallback so the portal works out of
 * the box; in production the demo fallback is disabled and the server refuses
 * to start unless real secrets are configured.
 */
export const ADMIN_COOKIE = "rekhastha_admin";
const ADMIN_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

const DEFAULT_ADMIN_ID = "tilu_admin";
const DEFAULT_ADMIN_TOKEN = "rekhastha2026";

const IS_PROD = process.env["NODE_ENV"] === "production";

/**
 * Returns the active admin credentials, or null when running in production
 * without real secrets configured (demo fallback is disabled in production).
 */
export function adminCredentials(): { id: string; token: string } | null {
  const id = process.env["ADMIN_ID"]?.trim();
  const token = process.env["ADMIN_TOKEN"]?.trim();

  if (id && token) {
    return { id, token };
  }

  if (IS_PROD) {
    return null;
  }

  return { id: DEFAULT_ADMIN_ID, token: DEFAULT_ADMIN_TOKEN };
}

export function verifyAdminCredentials(id: string, token: string): boolean {
  const expected = adminCredentials();
  if (!expected) return false;
  return id === expected.id && token === expected.token;
}

export function adminCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: ADMIN_TTL_MS,
  };
}

// ── Postgres-backed admin session store ──────────────────────────
export async function createAdminSession(adminId: string): Promise<string> {
  const token = randomUUID();
  await db.insert(adminSessionsTable).values({
    token,
    adminId,
    expiresAt: new Date(Date.now() + ADMIN_TTL_MS),
  });
  return token;
}

export async function isAdminSession(token: string | undefined): Promise<boolean> {
  return (await adminSessionId(token)) !== null;
}

/** Returns the admin id bound to a live session, or null if invalid/expired. */
export async function adminSessionId(
  token: string | undefined,
): Promise<string | null> {
  if (!token) return null;
  const [session] = await db
    .select()
    .from(adminSessionsTable)
    .where(eq(adminSessionsTable.token, token))
    .limit(1);
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.token, token));
    return null;
  }
  return session.adminId;
}

export async function deleteAdminSession(token: string | undefined): Promise<void> {
  if (token) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.token, token));
  }
}

// ── Postgres-backed per-IP brute-force throttle ──────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 1000 * 60 * 5; // 5 minutes

/** Returns the remaining lockout in ms, or 0 if the caller may attempt. */
export async function lockoutRemaining(ip: string): Promise<number> {
  const [rec] = await db
    .select()
    .from(adminLoginAttemptsTable)
    .where(eq(adminLoginAttemptsTable.ip, ip))
    .limit(1);
  if (!rec || !rec.lockedUntil) return 0;
  const remaining = rec.lockedUntil.getTime() - Date.now();
  return remaining > 0 ? remaining : 0;
}

export async function recordFailedAttempt(ip: string): Promise<void> {
  const [rec] = await db
    .select()
    .from(adminLoginAttemptsTable)
    .where(eq(adminLoginAttemptsTable.ip, ip))
    .limit(1);

  const count = (rec?.count ?? 0) + 1;
  const now = new Date();

  if (count >= MAX_ATTEMPTS) {
    const values = {
      ip,
      count: 0,
      lockedUntil: new Date(Date.now() + LOCKOUT_MS),
      updatedAt: now,
    };
    await db
      .insert(adminLoginAttemptsTable)
      .values(values)
      .onConflictDoUpdate({
        target: adminLoginAttemptsTable.ip,
        set: { count: values.count, lockedUntil: values.lockedUntil, updatedAt: now },
      });
    return;
  }

  await db
    .insert(adminLoginAttemptsTable)
    .values({ ip, count, lockedUntil: null, updatedAt: now })
    .onConflictDoUpdate({
      target: adminLoginAttemptsTable.ip,
      set: { count, lockedUntil: null, updatedAt: now },
    });
}

export async function resetAttempts(ip: string): Promise<void> {
  await db.delete(adminLoginAttemptsTable).where(eq(adminLoginAttemptsTable.ip, ip));
}

/**
 * Best-effort cleanup of expired sessions and stale, expired lockout rows.
 * Called opportunistically from the login path; not on the hot read path.
 */
export async function pruneAdminState(): Promise<void> {
  const now = new Date();
  await db.delete(adminSessionsTable).where(lte(adminSessionsTable.expiresAt, now));
  await db
    .delete(adminLoginAttemptsTable)
    .where(
      and(
        lte(adminLoginAttemptsTable.lockedUntil, now),
        // only prune rows that are no longer locked
        eq(adminLoginAttemptsTable.count, 0),
      ),
    );
}
