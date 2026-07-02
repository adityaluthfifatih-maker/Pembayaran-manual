/**
 * Integration tests for the DB-backed admin auth helpers in admin.ts.
 *
 * These tests run against the real Postgres database (no mocks) to confirm
 * that admin sessions and brute-force lockouts survive a simulated server
 * restart.  A "restart" is simulated by simply calling the helper functions a
 * second time: because all state lives in Postgres, the second call has no
 * access to any in-memory data from the first call — exactly what happens
 * when the API process exits and restarts.
 *
 * Route-level tests use supertest to confirm the /admin/login endpoint
 * returns HTTP 429 once an IP exceeds the failed-attempt threshold.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, adminSessionsTable, adminLoginAttemptsTable, pool } from "@workspace/db";
import {
  adminCredentials,
  createAdminSession,
  deleteAdminSession,
  isAdminSession,
  lockoutRemaining,
  recordFailedAttempt,
  resetAttempts,
} from "./admin.js";
import app from "../app.js";

afterAll(async () => {
  await pool.end();
});

// ── Session persistence ──────────────────────────────────────────────────────

describe("admin session persistence (simulated restart)", () => {
  const createdTokens: string[] = [];
  const TEST_ADMIN_ID = adminCredentials()?.id ?? "tilu_admin";

  afterEach(async () => {
    for (const token of createdTokens) {
      await db
        .delete(adminSessionsTable)
        .where(eq(adminSessionsTable.token, token));
    }
    createdTokens.length = 0;
  });

  it("a valid session is still authorized when the store is re-queried (restart)", async () => {
    const token = await createAdminSession(TEST_ADMIN_ID);
    createdTokens.push(token);

    // Simulate restart: isAdminSession re-reads from Postgres with no
    // in-memory cache — the session must still be present and non-expired.
    const authorized = await isAdminSession(token);
    expect(authorized).toBe(true);
  });

  it("logout revokes the session — subsequent queries are rejected", async () => {
    const token = await createAdminSession(TEST_ADMIN_ID);
    // deleteAdminSession handles its own cleanup; don't push to createdTokens.

    await deleteAdminSession(token);

    const authorized = await isAdminSession(token);
    expect(authorized).toBe(false);
  });

  it("undefined token is rejected without throwing", async () => {
    const authorized = await isAdminSession(undefined);
    expect(authorized).toBe(false);
  });

  it("an unknown / forged token is rejected", async () => {
    const authorized = await isAdminSession("not-a-real-token-00000000");
    expect(authorized).toBe(false);
  });
});

// ── Brute-force lockout persistence ─────────────────────────────────────────

/**
 * Each test gets its own unique IP so runs are fully isolated even if the
 * suite is parallelized.  afterEach deletes the row so the DB stays clean.
 */
describe("brute-force lockout persistence (simulated restart)", () => {
  const runPrefix = `test-${Date.now()}`;
  let testIp = "";

  beforeEach(() => {
    testIp = `${runPrefix}-${Math.random().toString(36).slice(2)}`;
  });

  afterEach(async () => {
    await db
      .delete(adminLoginAttemptsTable)
      .where(eq(adminLoginAttemptsTable.ip, testIp));
  });

  it("no lockout before any failed attempts", async () => {
    const remaining = await lockoutRemaining(testIp);
    expect(remaining).toBe(0);
  });

  it("fewer than 5 failed attempts do not trigger a lockout", async () => {
    for (let i = 0; i < 4; i++) {
      await recordFailedAttempt(testIp);
    }
    const remaining = await lockoutRemaining(testIp);
    expect(remaining).toBe(0);
  });

  it("exactly 5 failed attempts trigger a lockout (429 territory)", async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(testIp);
    }
    const remaining = await lockoutRemaining(testIp);
    expect(remaining).toBeGreaterThan(0);
  });

  it("lockout persists after a simulated restart — re-querying the DB still returns > 0", async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(testIp);
    }

    // First read confirms the lockout is in the DB.
    const first = await lockoutRemaining(testIp);
    expect(first).toBeGreaterThan(0);

    // Second independent read (no shared in-memory state) must also return
    // the lockout — this is the restart scenario.
    const second = await lockoutRemaining(testIp);
    expect(second).toBeGreaterThan(0);
  });

  it("resetAttempts clears the lockout row so the IP can log in again", async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(testIp);
    }
    expect(await lockoutRemaining(testIp)).toBeGreaterThan(0);

    await resetAttempts(testIp);

    expect(await lockoutRemaining(testIp)).toBe(0);
  });
});

// ── Route-level 429 lockout ──────────────────────────────────────────────────

/**
 * End-to-end check: the /api/admin/login HTTP route must return 429 once an
 * IP exceeds the failed-attempt threshold.  Each test uses a unique
 * X-Forwarded-For header so the IP isolation matches the helper tests above.
 */
describe("POST /api/admin/login — HTTP 429 after 5 failed attempts", () => {
  const runPrefix = `http-test-${Date.now()}`;
  let testIp = "";

  beforeEach(() => {
    testIp = `${runPrefix}-${Math.random().toString(36).slice(2)}`;
  });

  afterEach(async () => {
    await db
      .delete(adminLoginAttemptsTable)
      .where(eq(adminLoginAttemptsTable.ip, testIp));
  });

  it("returns 401 for bad credentials before the lockout threshold", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .set("X-Forwarded-For", testIp)
      .send({ adminId: "wrong", token: "wrong" });

    expect(res.status).toBe(401);
  });

  it("returns 429 on the 5th+ failed login attempt from the same IP", async () => {
    const bad = { adminId: "wrong", token: "wrong" };

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/admin/login")
        .set("X-Forwarded-For", testIp)
        .send(bad);
    }

    const res = await request(app)
      .post("/api/admin/login")
      .set("X-Forwarded-For", testIp)
      .send(bad);

    expect(res.status).toBe(429);
  });

  it("429 lockout persists on subsequent requests (no in-memory reset path)", async () => {
    const bad = { adminId: "wrong", token: "wrong" };

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/admin/login")
        .set("X-Forwarded-For", testIp)
        .send(bad);
    }

    const first = await request(app)
      .post("/api/admin/login")
      .set("X-Forwarded-For", testIp)
      .send(bad);
    const second = await request(app)
      .post("/api/admin/login")
      .set("X-Forwarded-For", testIp)
      .send(bad);

    expect(first.status).toBe(429);
    expect(second.status).toBe(429);
  });
});
