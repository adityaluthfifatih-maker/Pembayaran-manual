/**
 * Concurrent Checkout Race Test — Rekhastha
 *
 * Verifies that two near-simultaneous POST /api/borongan/onsite/checkout
 * requests for the same jobId cannot both succeed. The server uses a
 * FOR UPDATE row lock inside a transaction so only one checkout wins.
 *
 * Assertions:
 *   1. Exactly one response is 201 (success) and one is 409 (conflict).
 *   2. daysPaid increments by exactly 1 in the DB, never 2.
 *
 * Run: pnpm --filter @workspace/scripts run test:checkout-race
 */

import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

// ── Infra ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(description: string): void {
  passed++;
  console.log(`  ✓ ${description}`);
}

function fail(description: string, detail?: string): void {
  failed++;
  const msg = detail ? `  ✗ ${description}\n      ${detail}` : `  ✗ ${description}`;
  failures.push(msg);
  console.error(msg);
}

function assert(description: string, condition: boolean, detail?: string): void {
  if (condition) ok(description);
  else fail(description, detail);
}

// ── Database helpers ──────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });

const TEST_USER_ID   = `race-test-user-${randomUUID().slice(0, 8)}`;
const TEST_SESSION   = randomUUID();
const TEST_GIG_ID    = Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000;
const SESSION_COOKIE = "rekhastha_session";

// Single-day borongan: employer deposit = Rp 500,000 × 1.15 = Rp 575,000.
// With jumlahHari=1 and daysPaid=0 there is exactly ONE checkout slot remaining.
// Two concurrent requests racing for that slot is the critical scenario: the
// FOR UPDATE lock must ensure only one wins (201) and the other is rejected (409).
const ESCROW_AMOUNT = 575_000;
const JUMLAH_HARI   = 1;

async function setupTestData(client: pg.PoolClient): Promise<void> {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await client.query(
    `INSERT INTO users (id, email, password_hash, name, role, profile)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      TEST_USER_ID,
      `race-test-${TEST_USER_ID}@example.com`,
      "$2b$10$placeholder_hash_not_real",
      "Race Test Worker",
      "worker",
      "{}",
    ],
  );

  await client.query(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [TEST_SESSION, TEST_USER_ID, expiresAt],
  );

  await client.query(
    `INSERT INTO gigs
       (id, posisi, deskripsi, pembayaran, nominal, lat, lng,
        escrow_status, escrow_amount, jumlah_hari, days_paid,
        borongan_type, employer_id, employer_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      TEST_GIG_ID,
      "Race Test Position",
      "Integration test — safe to delete",
      "per_hari",
      500_000,
      -6.2,
      106.8,
      "locked",
      ESCROW_AMOUNT,
      JUMLAH_HARI,
      0,                // daysPaid starts at 0
      "onsite",
      TEST_USER_ID,
      "Race Test Employer",
    ],
  );
}

async function cleanupTestData(client: pg.PoolClient): Promise<void> {
  await client.query("DELETE FROM daily_payouts WHERE job_id = $1", [TEST_GIG_ID]);
  await client.query("DELETE FROM gigs WHERE id = $1", [TEST_GIG_ID]);
  await client.query("DELETE FROM sessions WHERE token = $1", [TEST_SESSION]);
  await client.query("DELETE FROM users WHERE id = $1", [TEST_USER_ID]);
}

async function getDaysPaid(client: pg.PoolClient): Promise<number> {
  const res = await client.query<{ days_paid: number }>(
    "SELECT days_paid FROM gigs WHERE id = $1",
    [TEST_GIG_ID],
  );
  return res.rows[0]?.days_paid ?? -1;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:80/api";

async function postCheckout(jobId: number): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}/borongan/onsite/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE}=${TEST_SESSION}`,
    },
    body: JSON.stringify({ jobId }),
  });
  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

// ── The race test ─────────────────────────────────────────────────────────────

async function runRaceTest(): Promise<void> {
  console.log("\n── Concurrent checkout race ─────────────────────────────────");
  console.log(`   jobId=${TEST_GIG_ID}  jumlahHari=${JUMLAH_HARI}  escrowAmount=${ESCROW_AMOUNT}`);
  console.log("   Firing two simultaneous POST /api/borongan/onsite/checkout …\n");

  // Fire both requests in the same event-loop tick so they hit the server
  // concurrently, exposing any gap in the FOR UPDATE locking strategy.
  const [a, b] = await Promise.all([
    postCheckout(TEST_GIG_ID),
    postCheckout(TEST_GIG_ID),
  ]);

  console.log(`   Request A → HTTP ${a.status}`);
  console.log(`   Request B → HTTP ${b.status}`);

  const statuses = [a.status, b.status].sort();

  assert(
    "exactly one 201 and one 409",
    statuses[0] === 201 && statuses[1] === 409,
    `got statuses [${a.status}, ${b.status}] — expected one 201 and one 409`,
  );
}

async function runDaysPaidCheck(client: pg.PoolClient): Promise<void> {
  console.log("\n── daysPaid integrity check ──────────────────────────────────");
  const daysPaid = await getDaysPaid(client);
  console.log(`   daysPaid in DB after race: ${daysPaid}`);

  assert(
    "daysPaid == 1 (not 2 — no double-pay)",
    daysPaid === 1,
    `daysPaid is ${daysPaid}; expected exactly 1`,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("═".repeat(64));
console.log("  Rekhastha Concurrent Checkout Race Test");
console.log("═".repeat(64));

const client = await pool.connect();
try {
  await setupTestData(client);
  console.log("  Test data inserted (user + session + gig).");

  await runRaceTest();
  await runDaysPaidCheck(client);
} finally {
  try {
    await cleanupTestData(client);
    console.log("\n  Test data cleaned up.");
  } catch (e) {
    console.warn("  Warning: cleanup failed —", e);
  }
  client.release();
  await pool.end();
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(64));
if (failed === 0) {
  console.log(`  All ${passed} assertion(s) passed.`);
  console.log("  FOR UPDATE lock correctly serialises concurrent checkouts.");
} else {
  console.error(`  ${failed} of ${passed + failed} assertion(s) FAILED:`);
  for (const msg of failures) console.error(msg);
}
console.log("═".repeat(64));

if (failed > 0) process.exit(1);
