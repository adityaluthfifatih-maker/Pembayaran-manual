import { randomUUID } from "node:crypto";
import type { CookieOptions } from "express";

/**
 * Admin ("Tilu Company") control-plane auth. Deliberately separate from the
 * user session system: a distinct httpOnly cookie, an in-memory session store
 * (there is a single operator, no need to persist), and per-IP brute-force
 * throttling. Credentials come from env secrets and fall back to the documented
 * test values so the portal works out of the box in dev.
 */
export const ADMIN_COOKIE = "rekhastha_admin";
const ADMIN_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

const DEFAULT_ADMIN_ID = "tilu_admin";
const DEFAULT_ADMIN_TOKEN = "rekhastha2026";

export function adminCredentials(): { id: string; token: string } {
  return {
    id: process.env["ADMIN_ID"]?.trim() || DEFAULT_ADMIN_ID,
    token: process.env["ADMIN_TOKEN"]?.trim() || DEFAULT_ADMIN_TOKEN,
  };
}

export function verifyAdminCredentials(id: string, token: string): boolean {
  const expected = adminCredentials();
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

// ── In-memory admin session store ────────────────────────────────
const adminSessions = new Map<string, number>(); // token -> expiresAt (ms)

export function createAdminSession(): string {
  const token = randomUUID();
  adminSessions.set(token, Date.now() + ADMIN_TTL_MS);
  return token;
}

export function isAdminSession(token: string | undefined): boolean {
  if (!token) return false;
  const expiresAt = adminSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

export function deleteAdminSession(token: string | undefined): void {
  if (token) adminSessions.delete(token);
}

// ── Per-IP brute-force throttle ──────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 1000 * 60 * 5; // 5 minutes
const attempts = new Map<string, { count: number; lockedUntil: number }>();

/** Returns the remaining lockout in ms, or 0 if the caller may attempt. */
export function lockoutRemaining(ip: string): number {
  const rec = attempts.get(ip);
  if (!rec) return 0;
  if (rec.lockedUntil > Date.now()) return rec.lockedUntil - Date.now();
  return 0;
}

export function recordFailedAttempt(ip: string): void {
  const rec = attempts.get(ip) ?? { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    rec.count = 0;
  }
  attempts.set(ip, rec);
}

export function resetAttempts(ip: string): void {
  attempts.delete(ip);
}
