import { randomUUID } from "node:crypto";
import type { CookieOptions } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, sessionsTable, usersTable, type User } from "@workspace/db";

export const SESSION_COOKIE = "rekhastha_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

/**
 * Flatten a DB user row into the frontend `AuthUser` shape: core identity
 * columns plus the spread `profile` JSON blob (KTP/NPWP/NIB/etc.).
 */
export function toAuthUser(user: User): Record<string, unknown> {
  const profile = (user.profile ?? {}) as Record<string, unknown>;
  return {
    ...profile,
    id: user.id,
    name: user.name,
    email: user.email,
    whatsapp: user.whatsapp ?? undefined,
    role: user.role,
    linkedWithGoogle: user.linkedWithGoogle,
    ktpPhotoUrl: user.ktpPhotoUrl ?? undefined,
    selfieWithKtpUrl: user.selfieWithKtpUrl ?? undefined,
    verificationStatus: user.verificationStatus,
    defaultCvUrl: user.defaultCvUrl ?? undefined,
    defaultPortfolioUrl: user.defaultPortfolioUrl ?? undefined,
  };
}

export async function createSession(userId: string): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({ token, userId, expiresAt });
  return token;
}

export async function getSessionUser(
  token: string | undefined,
): Promise<User | null> {
  if (!token) return null;

  const [row] = await db
    .select({ user: usersTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(
      and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, new Date())),
    );

  return row?.user ?? null;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
}
