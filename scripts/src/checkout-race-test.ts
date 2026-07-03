/**
 * Concurrent Checkout Race Test — Rekhastha
 *
 * Suite A – Same worker, single slot (original)
 *   Two near-simultaneous POST /api/borongan/onsite/checkout from the SAME
 *   worker session for a jumlahHari=1 gig.  Only one checkout can win.
 *
 * Suite B – Two different workers, kuota=1 gig (jumlahHari=1)
 *   Worker A and Worker B race to check out of the same single-slot gig.
 *   Exactly one must win (201) and the other must be rejected (409);
 *   daysPaid must be 1, never 2.
 *
 * Suite C – Two different workers, kuota=2 gig (jumlahHari=2)
 *   Worker A and Worker B race to check out of a two-slot gig.
 *   Both must win (201) but each receives a DISTINCT dayIndex (1 and 2);
 *   daysPaid must be 2.
 *
 * Pre-condition: POST /borongan/onsite/checkout requires a same-day "masuk"
 * (check-in) attendance record for the worker. Each suite seeds the necessary
 * attendance row(s) before firing checkout requests.
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

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_COOKIE = "rekhastha_session";
const API_BASE       = "http://localhost:80/api";

// ── Database pool ─────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Returns today's date as "YYYY-MM-DD" in the Asia/Jakarta timezone. */
function jakartaDateString(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

function randomGigId(): number {
  return Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000;
}

async function insertUser(
  client: pg.PoolClient,
  userId: string,
  label: string,
): Promise<void> {
  await client.query(
    `INSERT INTO users (id, email, password_hash, name, role, profile)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      `race-test-${userId}@example.com`,
      "$2b$10$placeholder_hash_not_real",
      `Race Test ${label}`,
      "worker",
      "{}",
    ],
  );
}

async function insertSession(
  client: pg.PoolClient,
  token: string,
  userId: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await client.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt],
  );
}

async function insertGig(
  client: pg.PoolClient,
  gigId: number,
  jumlahHari: number,
  escrowAmount: number,
  employerId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO gigs
       (id, posisi, deskripsi, pembayaran, nominal, lat, lng,
        escrow_status, escrow_amount, jumlah_hari, days_paid,
        borongan_type, employer_id, employer_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      gigId,
      "Race Test Position",
      "Integration test — safe to delete",
      "per_hari",
      500_000,
      -6.2,
      106.8,
      "locked",
      escrowAmount,
      jumlahHari,
      0,
      "onsite",
      employerId,
      "Race Test Employer",
    ],
  );
}

/**
 * Seed a "masuk" (check-in) attendance row for the given worker on today's
 * Jakarta date. This satisfies the attendance pre-condition enforced by
 * POST /borongan/onsite/checkout before any escrow fraction can be released.
 */
async function insertAttendanceMasuk(
  client: pg.PoolClient,
  gigId: number,
  workerId: string,
  workerName: string,
): Promise<void> {
  const today = jakartaDateString();
  await client.query(
    `INSERT INTO attendance (job_id, worker_id, worker_name, kind, scan_date)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ON CONSTRAINT attendance_worker_job_kind_date_unique DO NOTHING`,
    [gigId, workerId, workerName, "masuk", today],
  );
}

async function getDaysPaid(client: pg.PoolClient, gigId: number): Promise<number> {
  const res = await client.query<{ days_paid: number }>(
    "SELECT days_paid FROM gigs WHERE id = $1",
    [gigId],
  );
  return res.rows[0]?.days_paid ?? -1;
}

async function getPayoutDayIndices(
  client: pg.PoolClient,
  gigId: number,
): Promise<number[]> {
  const res = await client.query<{ day_index: number }>(
    "SELECT day_index FROM daily_payouts WHERE job_id = $1 ORDER BY day_index",
    [gigId],
  );
  return res.rows.map((r) => r.day_index);
}

async function cleanupGig(client: pg.PoolClient, gigId: number): Promise<void> {
  await client.query("DELETE FROM daily_payouts WHERE job_id = $1", [gigId]);
  await client.query("DELETE FROM attendance WHERE job_id = $1", [gigId]);
  await client.query("DELETE FROM gigs WHERE id = $1", [gigId]);
}

async function postCheckout(
  jobId: number,
  sessionToken: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}/borongan/onsite/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE}=${sessionToken}`,
    },
    body: JSON.stringify({ jobId }),
  });
  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite A — Same worker, single slot (original test)
// ══════════════════════════════════════════════════════════════════════════════

const SUITE_A_USER_ID   = `race-a-user-${randomUUID().slice(0, 8)}`;
const SUITE_A_SESSION   = randomUUID();
const SUITE_A_GIG_ID    = randomGigId();
const SUITE_A_ESCROW    = 575_000;   // 500_000 × 1.15
const SUITE_A_HARI      = 1;

async function setupSuiteA(client: pg.PoolClient): Promise<void> {
  await insertUser(client, SUITE_A_USER_ID, "Worker A (same-session)");
  await insertSession(client, SUITE_A_SESSION, SUITE_A_USER_ID);
  await insertGig(client, SUITE_A_GIG_ID, SUITE_A_HARI, SUITE_A_ESCROW, SUITE_A_USER_ID);
  // Attendance pre-condition: worker must have scanned in today before checkout.
  await insertAttendanceMasuk(client, SUITE_A_GIG_ID, SUITE_A_USER_ID, "Race Test Worker A (same-session)");
}

async function cleanupSuiteA(client: pg.PoolClient): Promise<void> {
  await cleanupGig(client, SUITE_A_GIG_ID);
  await client.query("DELETE FROM sessions WHERE token = $1", [SUITE_A_SESSION]);
  await client.query("DELETE FROM users WHERE id = $1", [SUITE_A_USER_ID]);
}

async function runSuiteA(client: pg.PoolClient): Promise<void> {
  console.log("\n══ Suite A — same worker, kuota=1, jumlahHari=1 ═══════════════");
  console.log(`   jobId=${SUITE_A_GIG_ID}  jumlahHari=${SUITE_A_HARI}`);
  console.log("   Firing two simultaneous POST /api/borongan/onsite/checkout …\n");

  const [a, b] = await Promise.all([
    postCheckout(SUITE_A_GIG_ID, SUITE_A_SESSION),
    postCheckout(SUITE_A_GIG_ID, SUITE_A_SESSION),
  ]);

  console.log(`   Request A → HTTP ${a.status}`);
  console.log(`   Request B → HTTP ${b.status}`);

  const statuses = [a.status, b.status].sort();
  assert(
    "[A] exactly one 201 and one 409",
    statuses[0] === 201 && statuses[1] === 409,
    `got [${a.status}, ${b.status}] — expected one 201 and one 409`,
  );

  const daysPaid = await getDaysPaid(client, SUITE_A_GIG_ID);
  console.log(`   daysPaid in DB: ${daysPaid}`);
  assert(
    "[A] daysPaid == 1 (no double-pay)",
    daysPaid === 1,
    `daysPaid is ${daysPaid}; expected exactly 1`,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite B — Two different workers, kuota=1 gig (jumlahHari=1)
//   Both race for the single remaining slot. Only one should succeed.
// ══════════════════════════════════════════════════════════════════════════════

const SUITE_B_WORKER_A_ID  = `race-b-wa-${randomUUID().slice(0, 8)}`;
const SUITE_B_WORKER_B_ID  = `race-b-wb-${randomUUID().slice(0, 8)}`;
const SUITE_B_SESSION_A    = randomUUID();
const SUITE_B_SESSION_B    = randomUUID();
const SUITE_B_GIG_ID       = randomGigId();
const SUITE_B_ESCROW       = 575_000;   // 500_000 × 1.15
const SUITE_B_HARI         = 1;

async function setupSuiteB(client: pg.PoolClient): Promise<void> {
  await insertUser(client, SUITE_B_WORKER_A_ID, "Worker A (two-worker kuota=1)");
  await insertUser(client, SUITE_B_WORKER_B_ID, "Worker B (two-worker kuota=1)");
  await insertSession(client, SUITE_B_SESSION_A, SUITE_B_WORKER_A_ID);
  await insertSession(client, SUITE_B_SESSION_B, SUITE_B_WORKER_B_ID);
  await insertGig(client, SUITE_B_GIG_ID, SUITE_B_HARI, SUITE_B_ESCROW, SUITE_B_WORKER_A_ID);
  // Both workers have scanned in today — attendance pre-condition satisfied for both.
  await insertAttendanceMasuk(client, SUITE_B_GIG_ID, SUITE_B_WORKER_A_ID, "Race Test Worker A (kuota=1)");
  await insertAttendanceMasuk(client, SUITE_B_GIG_ID, SUITE_B_WORKER_B_ID, "Race Test Worker B (kuota=1)");
}

async function cleanupSuiteB(client: pg.PoolClient): Promise<void> {
  await cleanupGig(client, SUITE_B_GIG_ID);
  await client.query(
    "DELETE FROM sessions WHERE token = ANY($1)",
    [[SUITE_B_SESSION_A, SUITE_B_SESSION_B]],
  );
  await client.query(
    "DELETE FROM users WHERE id = ANY($1)",
    [[SUITE_B_WORKER_A_ID, SUITE_B_WORKER_B_ID]],
  );
}

async function runSuiteB(client: pg.PoolClient): Promise<void> {
  console.log("\n══ Suite B — two different workers, kuota=1, jumlahHari=1 ══════");
  console.log(`   jobId=${SUITE_B_GIG_ID}  jumlahHari=${SUITE_B_HARI}`);
  console.log("   Worker A and Worker B fire simultaneous checkouts …\n");

  const [a, b] = await Promise.all([
    postCheckout(SUITE_B_GIG_ID, SUITE_B_SESSION_A),
    postCheckout(SUITE_B_GIG_ID, SUITE_B_SESSION_B),
  ]);

  console.log(`   Worker A → HTTP ${a.status}`);
  console.log(`   Worker B → HTTP ${b.status}`);

  const statuses = [a.status, b.status].sort();
  assert(
    "[B] exactly one 201 (winner) and one 409 (blocked) across two workers",
    statuses[0] === 201 && statuses[1] === 409,
    `got [${a.status}, ${b.status}] — FOR UPDATE lock must serialise two different sessions`,
  );

  const daysPaid = await getDaysPaid(client, SUITE_B_GIG_ID);
  console.log(`   daysPaid in DB: ${daysPaid}`);
  assert(
    "[B] daysPaid == 1 — second worker did not create a phantom day",
    daysPaid === 1,
    `daysPaid is ${daysPaid}; expected exactly 1`,
  );

  const indices = await getPayoutDayIndices(client, SUITE_B_GIG_ID);
  console.log(`   payout dayIndex rows: [${indices.join(", ")}]`);
  assert(
    "[B] exactly one daily_payouts row for the gig",
    indices.length === 1,
    `found ${indices.length} rows — expected exactly 1`,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite C — Two different workers, kuota=2 gig (jumlahHari=2)
//   Both workers race for the two available day-slots. Both should win with
//   DISTINCT dayIndex values (1 and 2) — no collision, no skipped slot.
// ══════════════════════════════════════════════════════════════════════════════

const SUITE_C_WORKER_A_ID  = `race-c-wa-${randomUUID().slice(0, 8)}`;
const SUITE_C_WORKER_B_ID  = `race-c-wb-${randomUUID().slice(0, 8)}`;
const SUITE_C_SESSION_A    = randomUUID();
const SUITE_C_SESSION_B    = randomUUID();
const SUITE_C_GIG_ID       = randomGigId();
// Two-day contract: Rp 500,000/day × 2 days = Rp 1,000,000 net; escrow = × 1.15
const SUITE_C_ESCROW       = 1_150_000;
const SUITE_C_HARI         = 2;

async function setupSuiteC(client: pg.PoolClient): Promise<void> {
  await insertUser(client, SUITE_C_WORKER_A_ID, "Worker A (two-worker kuota=2)");
  await insertUser(client, SUITE_C_WORKER_B_ID, "Worker B (two-worker kuota=2)");
  await insertSession(client, SUITE_C_SESSION_A, SUITE_C_WORKER_A_ID);
  await insertSession(client, SUITE_C_SESSION_B, SUITE_C_WORKER_B_ID);
  await insertGig(client, SUITE_C_GIG_ID, SUITE_C_HARI, SUITE_C_ESCROW, SUITE_C_WORKER_A_ID);
  // Both workers must have scanned in today to pass the attendance pre-condition.
  await insertAttendanceMasuk(client, SUITE_C_GIG_ID, SUITE_C_WORKER_A_ID, "Race Test Worker A (kuota=2)");
  await insertAttendanceMasuk(client, SUITE_C_GIG_ID, SUITE_C_WORKER_B_ID, "Race Test Worker B (kuota=2)");
}

async function cleanupSuiteC(client: pg.PoolClient): Promise<void> {
  await cleanupGig(client, SUITE_C_GIG_ID);
  await client.query(
    "DELETE FROM sessions WHERE token = ANY($1)",
    [[SUITE_C_SESSION_A, SUITE_C_SESSION_B]],
  );
  await client.query(
    "DELETE FROM users WHERE id = ANY($1)",
    [[SUITE_C_WORKER_A_ID, SUITE_C_WORKER_B_ID]],
  );
}

async function runSuiteC(client: pg.PoolClient): Promise<void> {
  console.log("\n══ Suite C — two different workers, kuota=2, jumlahHari=2 ══════");
  console.log(`   jobId=${SUITE_C_GIG_ID}  jumlahHari=${SUITE_C_HARI}`);
  console.log("   Worker A and Worker B fire simultaneous checkouts …\n");

  const [a, b] = await Promise.all([
    postCheckout(SUITE_C_GIG_ID, SUITE_C_SESSION_A),
    postCheckout(SUITE_C_GIG_ID, SUITE_C_SESSION_B),
  ]);

  console.log(`   Worker A → HTTP ${a.status}`);
  console.log(`   Worker B → HTTP ${b.status}`);

  assert(
    "[C] both workers receive 201 — two distinct slots are available",
    a.status === 201 && b.status === 201,
    `got [${a.status}, ${b.status}] — both should succeed for a jumlahHari=2 gig`,
  );

  const daysPaid = await getDaysPaid(client, SUITE_C_GIG_ID);
  console.log(`   daysPaid in DB: ${daysPaid}`);
  assert(
    "[C] daysPaid == 2 — each worker consumed exactly one distinct slot",
    daysPaid === 2,
    `daysPaid is ${daysPaid}; expected 2 (one slot per worker)`,
  );

  const indices = await getPayoutDayIndices(client, SUITE_C_GIG_ID);
  console.log(`   payout dayIndex rows: [${indices.join(", ")}]`);
  assert(
    "[C] two daily_payouts rows exist for the gig",
    indices.length === 2,
    `found ${indices.length} payout rows — expected 2`,
  );
  assert(
    "[C] dayIndex values are 1 and 2 — no collision, no gap",
    indices[0] === 1 && indices[1] === 2,
    `got dayIndex values [${indices.join(", ")}] — expected [1, 2]`,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("═".repeat(64));
console.log("  Rekhastha Concurrent Checkout Race Test");
console.log("═".repeat(64));

const client = await pool.connect();
try {
  // Suite A — original same-worker race
  await setupSuiteA(client);
  console.log("\n  [A] Test data inserted (user + session + gig + attendance).");
  await runSuiteA(client);
  await cleanupSuiteA(client);

  // Suite B — two different workers, kuota=1 (only one can win)
  await setupSuiteB(client);
  console.log("\n  [B] Test data inserted (2 workers + attendance for both).");
  await runSuiteB(client);
  await cleanupSuiteB(client);

  // Suite C — two different workers, kuota=2 (both should win with distinct slots)
  await setupSuiteC(client);
  console.log("\n  [C] Test data inserted (2 workers, 2-day contract + attendance for both).");
  await runSuiteC(client);
  await cleanupSuiteC(client);

  console.log("\n  All test data cleaned up.");
} catch (err) {
  console.error("\n  Unexpected error — attempting cleanup …", err);
  try {
    await cleanupSuiteA(client).catch(() => undefined);
    await cleanupSuiteB(client).catch(() => undefined);
    await cleanupSuiteC(client).catch(() => undefined);
  } catch { /* best-effort */ }
  throw err;
} finally {
  client.release();
  await pool.end();
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(64));
if (failed === 0) {
  console.log(`  All ${passed} assertion(s) passed.`);
  console.log("  FOR UPDATE lock correctly serialises concurrent checkouts.");
  console.log("  Two-worker races produce correct distinct-slot or blocked results.");
} else {
  console.error(`  ${failed} of ${passed + failed} assertion(s) FAILED:`);
  for (const msg of failures) console.error(msg);
}
console.log("═".repeat(64));

if (failed > 0) process.exit(1);
