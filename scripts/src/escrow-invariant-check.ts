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
  PLATFORM_FEE_CEPAT,
  calcEmployerFee,
  calcEmployerDeposit,
  calcSplit,
  calcEscrowAmount,
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

// ── Sentinel: confirm the rate constant itself is exactly 0.15 ───────────────
// If PLATFORM_FEE_CEPAT is changed in escrow.ts this fires immediately, before
// any other check runs.

function checkRateConstant() {
  console.log("\n── Rate constant guard ───────────────────────────────────");
  if (PLATFORM_FEE_CEPAT !== 0.15) {
    failed++;
    const msg = `  ✗ PLATFORM_FEE_CEPAT must be 0.15 — got ${PLATFORM_FEE_CEPAT}`;
    failures.push(msg);
    console.error(msg);
  } else {
    passed++;
    console.log(`  ✓ PLATFORM_FEE_CEPAT == 0.15`);
  }
}

// ── Core invariants for a single base wage (cepat path) ──────────────────────
// Replicates the cepat lock path:  escrowAmount = calcEmployerDeposit(nominal)
// and the release path:            { workerNet, platformCut } = calcSplit(escrowAmount)

function checkCepatWage(baseWage: number): void {
  console.log(`\n[cepat] base wage = Rp ${fmt(baseWage)}`);

  const deposit  = calcEmployerDeposit(baseWage);           // lock step
  const { workerNet, platformCut } = calcSplit(deposit);    // release step

  assert("employer deposit == baseWage + calcEmployerFee(baseWage)", deposit, baseWage + calcEmployerFee(baseWage));
  assert("worker net  == base wage",                                  workerNet, baseWage);
  assert("platform cut == calcEmployerFee(baseWage)",                 platformCut, calcEmployerFee(baseWage));
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
): void {
  console.log(`\n[${label}] Rp ${fmt(originalWage)} → negotiated Rp ${fmt(negotiatedWage)}`);

  // ── chat-modal.tsx: employer sees fee/total using the locked (accepted) wage
  const chatFee   = calcEmployerFee(negotiatedWage);
  const chatTotal = calcEmployerDeposit(negotiatedWage);
  console.log(`  chat-modal fee=${fmt(chatFee)}  escrow=${fmt(chatTotal)}`);

  // ── home.tsx L931: onNominalUpdate fires, locking the new escrowAmount
  const baseAmount  = calcEscrowAmount(negotiatedWage, pembayaran, jumlahHari, kuota);
  const lockedEscrow = calcEmployerDeposit(baseAmount);    // what gets stored in job.escrowAmount

  // ── home.tsx L470/L612/L995: release splits the locked deposit
  const { workerNet, platformCut } = calcSplit(lockedEscrow);

  // Escrow stored should match what chat-modal showed (for single-worker harian base case)
  if (pembayaran === "per_hari" && jumlahHari === 1 && kuota === 1) {
    assert("chat-modal escrow == home.tsx locked escrow", chatTotal, lockedEscrow);
  }

  assert("worker net  == negotiated base amount",         workerNet, baseAmount);
  assert("platform cut == calcEmployerFee(baseAmount)",   platformCut, calcEmployerFee(baseAmount));
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
// Simulates the old bug: deposit computed at 7% but release split at 15%.
// This test must PASS (i.e. the fix is in place) — it fails if we ever
// accidentally reintroduce a mismatched rate anywhere in the pipeline.

function checkStalerateRegression(baseWage: number): void {
  const STALE_RATE = 0.07;
  const depositAtStaleRate  = baseWage + Math.round(baseWage * STALE_RATE);  // old bug: 7%
  const { workerNet }        = calcSplit(depositAtStaleRate);                 // release uses real 15%

  // With mismatched rates, workerNet ≠ baseWage — confirm we detect this
  const mismatch = workerNet !== baseWage;
  if (!mismatch) {
    failed++;
    const msg = `  ✗ stale-rate sentinel did not fire for wage Rp ${fmt(baseWage)} — the bug would be invisible`;
    failures.push(msg);
    console.error(msg);
  } else {
    passed++;
    console.log(`  ✓ stale-rate sentinel: 7% deposit / 15% split mismatch detected (workerNet=${fmt(workerNet)} ≠ baseWage=${fmt(baseWage)})`);
  }
}

// ── Run all checks ───────────────────────────────────────────────────────────

console.log("═".repeat(64));
console.log("  Rekhastha Escrow Invariant Check (production functions)");
console.log("═".repeat(64));

checkRateConstant();

console.log("\n── Cepat (instant gig, no negotiation) ──────────────────────");
for (const wage of [150_000, 200_000, 350_000, 1_000_000, 5_000_000]) {
  checkCepatWage(wage);
}

console.log("\n── Lama (negotiated / chat-modal flow) ──────────────────────");
checkLamaFlow("no change",                      200_000, 200_000);
checkLamaFlow("worker negotiates down",         350_000, 300_000);
checkLamaFlow("employer negotiates down",       500_000, 420_000);
checkLamaFlow("worker negotiates up",           150_000, 175_000);
checkLamaFlow("multi-round final",              250_000, 230_000);
checkLamaFlow("near minimum",                   10_000,  10_000);
checkLamaFlow("per_shift multi-worker",         200_000, 180_000, "per_shift", 1, 5);
checkLamaFlow("per_projek borongan",            800_000, 750_000, "per_projek", 1, 3);

console.log("\n── Stale-rate regression sentinels ──────────────────────────");
console.log("  (these confirm a deposit/release rate mismatch is VISIBLE)");
for (const wage of [150_000, 200_000, 350_000]) {
  checkStalerateRegression(wage);
}

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
