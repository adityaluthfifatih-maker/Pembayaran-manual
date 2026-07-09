import { randomUUID } from "node:crypto";
import type { CookieOptions } from "express";
import { and, eq, lte } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, adminUsersTable, adminSessionsTable, adminLoginAttemptsTable } from "@workspace/db";

/**
 * Admin ("Tilu Company") control-plane auth. Deliberately separate from the
 * user session system: a distinct httpOnly cookie, a Postgres-backed session
 * store, and per-IP brute-force throttling.
 *
 * Credentials are now stored in `admin_users` (bcrypt hashes) so the operator
 * can change their own password via the portal without editing env secrets.
 * The ADMIN_TOKEN env secret is kept as a one-time recovery key only.
 *
 * On first startup (empty admin_users) the table is seeded automatically from
 * ADMIN_ID / ADMIN_TOKEN env secrets (or the dev fallbacks in non-production).
 */
export const ADMIN_COOKIE = "rekhastha_admin";
const ADMIN_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

const DEFAULT_ADMIN_ID = "tilu_admin";
const DEFAULT_ADMIN_TOKEN = "rekhastha2026";

const IS_PROD = process.env["NODE_ENV"] === "production";

/**
 * Returns the active env-based admin credentials (used for bootstrap seed
 * and password recovery). Dev fallback is disabled in production.
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

/**
 * Seeds the admin_users table from env secrets / dev fallbacks if it is
 * empty. Call once at server startup. Idempotent — no-ops if a row already
 * exists.
 */
export async function bootstrapAdminUser(): Promise<void> {
  const existing = await db.select({ adminId: adminUsersTable.adminId }).from(adminUsersTable).limit(1);
  if (existing.length > 0) return;

  const creds = adminCredentials();
  if (!creds) {
    throw new Error(
      "Production startup blocked: admin_users table is empty and ADMIN_ID/ADMIN_TOKEN secrets are not set. " +
      "Configure both secrets so the initial admin account can be seeded.",
    );
  }

  const passwordHash = await bcrypt.hash(creds.token, 10);
  await db.insert(adminUsersTable).values({
    adminId: creds.id,
    passwordHash,
    displayName: "Tilu Admin",
    mustChangePassword: false,
  });
}

/**
 * DB-backed credential check. Replaces the old synchronous env comparison.
 */
export async function verifyAdminPassword(adminId: string, password: string): Promise<boolean> {
  const [row] = await db
    .select({ passwordHash: adminUsersTable.passwordHash })
    .from(adminUsersTable)
    .where(eq(adminUsersTable.adminId, adminId))
    .limit(1);

  if (!row) return false;
  return bcrypt.compare(password, row.passwordHash);
}

/**
 * Change password for a logged-in admin. Requires the old password for
 * verification before updating.
 */
export async function changeAdminPassword(
  adminId: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { error: string }> {
  const valid = await verifyAdminPassword(adminId, oldPassword);
  if (!valid) return { error: "Kata sandi lama tidak sesuai." };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db
    .update(adminUsersTable)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(adminUsersTable.adminId, adminId));

  return { ok: true };
}

/**
 * Emergency password reset using the ADMIN_TOKEN env secret as a recovery
 * key. This lets the operator regain access if they forget their DB password,
 * without requiring a re-deployment.
 */
export async function resetAdminPassword(
  adminId: string,
  newPassword: string,
  recoveryToken: string,
): Promise<{ ok: true } | { error: string }> {
  const creds = adminCredentials();
  if (!creds || recoveryToken !== creds.token) {
    return { error: "Token pemulihan tidak valid." };
  }

  const [row] = await db
    .select({ adminId: adminUsersTable.adminId })
    .from(adminUsersTable)
    .where(eq(adminUsersTable.adminId, adminId))
    .limit(1);

  if (!row) return { error: "Admin ID tidak ditemukan." };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db
    .update(adminUsersTable)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(adminUsersTable.adminId, adminId));

  return { ok: true };
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
        eq(adminLoginAttemptsTable.count, 0),
      ),
    );
}
