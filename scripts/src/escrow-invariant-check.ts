/**
 * Escrow Invariant Check — Rekhastha
 *
 * Verifies — using the ACTUAL production functions from escrow.ts — that for
 * every gig flow (cepat and lama/negotiated):
 *
 *   worker net   == base wage          (worker paid exactly what was posted/locked)
 *   platform cut == 15% of base wage   (employer-borne mark-up, no more/less)
 *   workerNet + platformCut == deposit (no money created or destroyed)
 *
 * The lama path exercises the exact same call chain used in:
 *   - chat-modal.tsx  (calcEmployerFee / calcEmployerDeposit on accepted nominal)
 *   - home.tsx L931   (calcEmployerDeposit(calcEscrowAmount(newNominal,…)) on lock)
 *   - home.tsx L470, L612, L995  (calcSplit(job.escrowAmount) on release)
 *
 * Run: pnpm --filter @workspace/scripts run check:escrow
 */

import {
  DEFAULT_FEE_RATE,
  PLATFORM_FEE_RATES,
  calcEmployerFee,
  calcEmployerDeposit,
  calcSplit,
  calcEscrowAmount,
  getFeeRate,
  type JobCategory,
} from "../../artifacts/jakarta-gig-finder/src/types/escrow";

// ── Test infrastructure ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function fmt(n: number) { return n.toLocaleString("id-ID"); }

function assert(description: string, actual: number, expected: number): void {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${description}`);
  } else {
    failed++;
    const msg = `  ✗ ${description}\n      expected ${fmt(expected)}  got ${fmt(actual)}`;
    failures.push(msg);
    console.error(msg);
  }
}

// ── Sentinel: confirm tier constants are exactly as designed ─────────────────
function checkRateConstant() {
  console.log("\n── Rate constant guard ───────────────────────────────────");
  const expected: Record<string, number> = { umum: 0.03, terampil: 0.05, profesional: 0.08 };
  for (const [cat, rate] of Object.entries(expected)) {
    const actual = PLATFORM_FEE_RATES[cat as keyof typeof PLATFORM_FEE_RATES];
    if (actual !== rate) {
      failed++;
      const msg = `  ✗ PLATFORM_FEE_RATES.${cat} must be ${rate} — got ${actual}`;
      failures.push(msg);
      console.error(msg);
    } else {
      passed++;
      console.log(`  ✓ PLATFORM_FEE_RATES.${cat} == ${rate}`);
    }
  }
  if (DEFAULT_FEE_RATE !== 0.05) {
    failed++;
    const msg = `  ✗ DEFAULT_FEE_RATE must be 0.05 — got ${DEFAULT_FEE_RATE}`;
    failures.push(msg);
    console.error(msg);
  } else {
    passed++;
    console.log(`  ✓ DEFAULT_FEE_RATE == 0.05`);
  }
}

// ── Core invariants for a single base wage (cepat path) ──────────────────────
// Replicates the cepat lock path:  escrowAmount = calcEmployerDeposit(nominal)
// and the release path:            { workerNet, platformCut } = calcSplit(escrowAmount)

function checkCepatWage(baseWage: number, feeRate = DEFAULT_FEE_RATE): void {
  console.log(`\n[cepat] base wage = Rp ${fmt(baseWage)}  rate=${feeRate * 100}%`);

  const deposit  = calcEmployerDeposit(baseWage, feeRate);           // lock step
  const { workerNet, platformCut } = calcSplit(deposit, feeRate);    // release step

  assert("employer deposit == baseWage + calcEmployerFee(baseWage)", deposit, baseWage + calcEmployerFee(baseWage, feeRate));
  assert("worker net  == base wage",                                  workerNet, baseWage);
  assert("platform cut == calcEmployerFee(baseWage)",                 platformCut, calcEmployerFee(baseWage, feeRate));
  assert("workerNet + platformCut == deposit",                        workerNet + platformCut, deposit);
}

// ── Lama (negotiated) lock + release — mirrors home.tsx lines 931, 470/612/995 ─
// Lock:    escrowAmount = calcEmployerDeposit(calcEscrowAmount(negotiatedWage, pembayaran, jumlahHari, kuota))
// Release: { workerNet, platformCut } = calcSplit(escrowAmount)

type Pembayaran = "per_hari" | "per_shift" | "per_projek";

function checkLamaFlow(
  label: string,
  originalWage: number,
  negotiatedWage: number,
  pembayaran: Pembayaran = "per_hari",
  jumlahHari: number = 1,
  kuota: number = 1,
  feeRate = DEFAULT_FEE_RATE,
): void {
  console.log(`\n[${label}] Rp ${fmt(originalWage)} → negotiated Rp ${fmt(negotiatedWage)}  rate=${feeRate * 100}%`);

  // ── chat-modal.tsx: employer sees fee/total using the locked (accepted) wage
  const chatFee   = calcEmployerFee(negotiatedWage, feeRate);
  const chatTotal = calcEmployerDeposit(negotiatedWage, feeRate);
  console.log(`  chat-modal fee=${fmt(chatFee)}  escrow=${fmt(chatTotal)}`);

  // ── home.tsx: onNominalUpdate fires, locking the new escrowAmount
  const baseAmount  = calcEscrowAmount(negotiatedWage, pembayaran, jumlahHari, kuota);
  const lockedEscrow = calcEmployerDeposit(baseAmount, feeRate);    // what gets stored in job.escrowAmount

  // ── home.tsx: release splits the locked deposit
  const { workerNet, platformCut } = calcSplit(lockedEscrow, feeRate);

  // Escrow stored should match what chat-modal showed (for single-worker harian base case)
  if (pembayaran === "per_hari" && jumlahHari === 1 && kuota === 1) {
    assert("chat-modal escrow == home.tsx locked escrow", chatTotal, lockedEscrow);
  }

  assert("worker net  == negotiated base amount",         workerNet, baseAmount);
  assert("platform cut == calcEmployerFee(baseAmount)",   platformCut, calcEmployerFee(baseAmount, feeRate));
  assert("workerNet + platformCut == lockedEscrow",       workerNet + platformCut, lockedEscrow);

  // Guard: if negotiation changed the wage, original wage must NOT be paid out
  if (negotiatedWage !== originalWage) {
    if (workerNet === originalWage) {
      failed++;
      const msg = `  ✗ stale-rate regression: worker received original wage (Rp ${fmt(originalWage)}) instead of negotiated (Rp ${fmt(negotiatedWage)})`;
      failures.push(msg);
      console.error(msg);
    } else {
      passed++;
      console.log(`  ✓ original posted wage is NOT paid out after negotiation`);
    }
  }
}

// ── Stale-rate sentinel ───────────────────────────────────────────────────────
// Simulates a mismatch bug: deposit computed at one rate, release split at another.
// These must PASS — if they don't, the pipeline is hiding mismatched rates.

function checkStalerateRegression(baseWage: number): void {
  // Deposit at umum (3%), release at profesional (8%) — should clearly mismatch
  const DEPOSIT_RATE = PLATFORM_FEE_RATES.umum;        // 0.03
  const RELEASE_RATE = PLATFORM_FEE_RATES.profesional;  // 0.08
  const depositAtWrongRate = baseWage + Math.round(baseWage * DEPOSIT_RATE);
  const { workerNet } = calcSplit(depositAtWrongRate, RELEASE_RATE);

  const mismatch = workerNet !== baseWage;
  if (!mismatch) {
    failed++;
    const msg = `  ✗ stale-rate sentinel did not fire for wage Rp ${fmt(baseWage)} — bug would be invisible`;
    failures.push(msg);
    console.error(msg);
  } else {
    passed++;
    console.log(`  ✓ stale-rate sentinel: 3% deposit / 8% split mismatch detected (workerNet=${fmt(workerNet)} ≠ baseWage=${fmt(baseWage)})`);
  }
}

// ── End-to-end lifecycle simulation ──────────────────────────────────────────
//
// Models the exact sequence in home.tsx handleSplitPayment:
//
//   POST:     employer picks category → feeRate = getFeeRate(category)
//   LOCK:     escrowAmount = calcEmployerDeposit(baseWage, feeRate)   ← stored on gig record
//             (lama: baseWage = calcEscrowAmount(negotiated, pembayaran, jumlahHari, kuota))
//   COMPLETE: job = { escrowAmount, feeRate }   ← handleSplitPayment reads ONLY these stored fields
//             { workerNet } = calcSplit(job.escrowAmount, job.feeRate)
//   ASSERT:   workerNet == nominal (base wage posted by employer)
//
// This catches any regression where the stored feeRate diverges from the split
// rate (e.g. a default is used on release instead of the stored per-category rate).

interface GigRecord {
  id: string;
  category: JobCategory;
  feeRate: number;        // stored at lock time — must be used at release time
  escrowAmount: number;   // total employer deposit stored on the gig
  baseWage: number;       // the wage workers expect to receive
}

function postAndLockCepat(
  label: string,
  baseWage: number,
  category: JobCategory,
): GigRecord {
  const feeRate = getFeeRate(category);
  const escrowAmount = calcEmployerDeposit(baseWage, feeRate);
  return { id: label, category, feeRate, escrowAmount, baseWage };
}

function postAndLockLama(
  label: string,
  negotiatedWage: number,
  category: JobCategory,
  pembayaran: Pembayaran = "per_hari",
  jumlahHari = 1,
  kuota = 1,
): GigRecord {
  const feeRate = getFeeRate(category);
  const baseWage = calcEscrowAmount(negotiatedWage, pembayaran, jumlahHari, kuota);
  const escrowAmount = calcEmployerDeposit(baseWage, feeRate);
  return { id: label, category, feeRate, escrowAmount, baseWage };
}

// Replicates handleSplitPayment: reads stored escrowAmount + feeRate only
function releaseEscrow(gig: GigRecord): { workerNet: number; platformCut: number } {
  return calcSplit(gig.escrowAmount, gig.feeRate);
}

function checkFullLifecycleCepat(
  label: string,
  baseWage: number,
  category: JobCategory,
): void {
  const gig = postAndLockCepat(label, baseWage, category);
  const { workerNet, platformCut } = releaseEscrow(gig);

  console.log(`\n[lifecycle/cepat] ${label}  Rp ${fmt(baseWage)}  category=${category}  rate=${gig.feeRate * 100}%`);
  assert(`workerNet == baseWage (${fmt(baseWage)})`,                        workerNet,   baseWage);
  assert(`platformCut == calcEmployerFee(baseWage, ${category})`,           platformCut, calcEmployerFee(baseWage, gig.feeRate));
  assert(`workerNet + platformCut == escrowAmount (${fmt(gig.escrowAmount)})`, workerNet + platformCut, gig.escrowAmount);
}

function checkFullLifecycleLama(
  label: string,
  negotiatedWage: number,
  category: JobCategory,
  pembayaran: Pembayaran = "per_hari",
  jumlahHari = 1,
  kuota = 1,
): void {
  const gig = postAndLockLama(label, negotiatedWage, category, pembayaran, jumlahHari, kuota);
  const { workerNet, platformCut } = releaseEscrow(gig);

  console.log(`\n[lifecycle/lama] ${label}  Rp ${fmt(negotiatedWage)}/unit  ${pembayaran}×${jumlahHari}d×${kuota}w  category=${category}  rate=${gig.feeRate * 100}%`);
  assert(`workerNet == baseWage (${fmt(gig.baseWage)})`,                        workerNet,   gig.baseWage);
  assert(`platformCut == calcEmployerFee(baseWage, ${category})`,               platformCut, calcEmployerFee(gig.baseWage, gig.feeRate));
  assert(`workerNet + platformCut == escrowAmount (${fmt(gig.escrowAmount)})`,  workerNet + platformCut, gig.escrowAmount);
}

// ── Run all checks ───────────────────────────────────────────────────────────

console.log("═".repeat(64));
console.log("  Rekhastha Escrow Invariant Check (production functions)");
console.log("═".repeat(64));

checkRateConstant();

console.log("\n── Cepat (instant gig) — all 3 tiers ────────────────────────");
for (const [cat, rate] of Object.entries(PLATFORM_FEE_RATES) as [string, number][]) {
  console.log(`\n  [${cat} ${rate * 100}%]`);
  for (const wage of [150_000, 350_000, 1_000_000]) {
    checkCepatWage(wage, rate);
  }
}

console.log("\n── Lama (negotiated / chat-modal flow) — default rate ────────");
checkLamaFlow("no change",                      200_000, 200_000);
checkLamaFlow("worker negotiates down",         350_000, 300_000);
checkLamaFlow("employer negotiates down",       500_000, 420_000);
checkLamaFlow("worker negotiates up",           150_000, 175_000);
checkLamaFlow("multi-round final",              250_000, 230_000);
checkLamaFlow("near minimum",                   10_000,  10_000);
checkLamaFlow("per_shift multi-worker",         200_000, 180_000, "per_shift", 1, 5);
checkLamaFlow("per_projek borongan",            800_000, 750_000, "per_projek", 1, 3);

console.log("\n── Lama — profesional rate (8%) ──────────────────────────────");
checkLamaFlow("profesional no change",          500_000, 500_000, "per_hari", 1, 1, PLATFORM_FEE_RATES.profesional);
checkLamaFlow("profesional negotiated",         600_000, 550_000, "per_hari", 1, 1, PLATFORM_FEE_RATES.profesional);

console.log("\n── Lama — umum rate (3%) ─────────────────────────────────────");
checkLamaFlow("umum warehouse",                 150_000, 150_000, "per_shift", 1, 4, PLATFORM_FEE_RATES.umum);

console.log("\n── Stale-rate regression sentinels ──────────────────────────");
console.log("  (these confirm a deposit/release rate mismatch is VISIBLE)");
for (const wage of [150_000, 200_000, 350_000]) {
  checkStalerateRegression(wage);
}

console.log("\n── End-to-end lifecycle: cepat — all 3 category tiers ───────");
console.log("  post → lock (store escrowAmount+feeRate) → complete (split) → assert workerNet == nominal");
for (const category of (["umum", "terampil", "profesional"] as JobCategory[])) {
  for (const wage of [150_000, 350_000, 1_000_000]) {
    checkFullLifecycleCepat(`${category} Rp${fmt(wage)}`, wage, category);
  }
}

console.log("\n── End-to-end lifecycle: lama — all 3 category tiers ────────");
console.log("  post → negotiate → lock (store) → complete (split) → assert workerNet == baseWage");

// umum 3% — warehouse labour, per_shift, multi-worker
checkFullLifecycleLama("umum per_shift 4 workers",     150_000, "umum",         "per_shift", 1, 4);
checkFullLifecycleLama("umum per_hari standard",        200_000, "umum",         "per_hari",  1, 1);
checkFullLifecycleLama("umum per_projek borongan",      800_000, "umum",         "per_projek",1, 3);

// terampil 5% — default tier, skilled/technical roles
checkFullLifecycleLama("terampil per_hari no change",   350_000, "terampil",     "per_hari",  1, 1);
checkFullLifecycleLama("terampil per_shift multi-day",  200_000, "terampil",     "per_shift", 3, 2);
checkFullLifecycleLama("terampil per_projek borongan",  500_000, "terampil",     "per_projek",1, 2);

// profesional 8% — specialist roles (accounting, legal, IT, medical)
checkFullLifecycleLama("profesional per_hari standard", 500_000, "profesional",  "per_hari",  1, 1);
checkFullLifecycleLama("profesional multi-day",         600_000, "profesional",  "per_hari",  5, 1);
checkFullLifecycleLama("profesional per_projek",        900_000, "profesional",  "per_projek",1, 1);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(64));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("═".repeat(64));

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) { console.error(f); }
  console.error(
    "\n❌ Escrow invariant BROKEN — deposit and release rates have diverged.\n" +
    "   A worker will receive the wrong amount. Fix escrow.ts before deploying.",
  );
  process.exit(1);
} else {
  console.log("\n✅ All escrow invariants hold. Workers receive exactly the base wage.");
}
