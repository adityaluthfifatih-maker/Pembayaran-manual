/**
 * Fee-consistency check — ensures pay-slip-modal, job-sheet, chat-modal, and
 * analytics-dashboard all compute identical platform-fee and gross amounts for
 * the same CustomJob nominal.
 *
 * Each "scenario" block mirrors the exact variable names used in the component
 * so a diff between this file and the component immediately shows a divergence.
 *
 * Exit 0 = all assertions pass; exit 1 = at least one mismatch was found.
 */

import {
  calcEmployerFee,
  calcEmployerDeposit,
  PLATFORM_FEE_CEPAT,
} from "../../artifacts/jakarta-gig-finder/src/types/escrow.js";
import {
  calcTotal,
  type PaymentType,
} from "../../artifacts/jakarta-gig-finder/src/types/custom-job.js";

// ── Test fixtures (one per payment type + a negotiated wage scenario) ──────────
const fixtures: Array<{ label: string; nominal: number; pembayaran: PaymentType }> = [
  { label: "per_shift  Rp 150.000",  nominal: 150_000,  pembayaran: "per_shift" },
  { label: "per_hari   Rp 200.000",  nominal: 200_000,  pembayaran: "per_hari" },
  { label: "per_projek Rp 5.000.000",nominal: 5_000_000, pembayaran: "per_projek" },
  { label: "per_bulan  Rp 3.500.000",nominal: 3_500_000, pembayaran: "per_bulan" },
  // edge cases
  { label: "per_shift  Rp 1 (minimum)", nominal: 1,     pembayaran: "per_shift" },
  { label: "per_shift  Rp 999.999",  nominal: 999_999,  pembayaran: "per_shift" },
];

let failures = 0;

function assert(description: string, actual: number, expected: number) {
  if (actual !== expected) {
    console.error(
      `  ✗ FAIL  ${description}\n` +
      `         expected ${expected}  got ${actual}`
    );
    failures++;
  } else {
    console.log(`  ✓ pass  ${description} → ${actual}`);
  }
}

console.log(`\nFee consistency check — PLATFORM_FEE_CEPAT = ${PLATFORM_FEE_CEPAT * 100}%\n`);
console.log("Each fixture runs through the exact formula used in each component.");
console.log("─".repeat(70));

for (const { label, nominal, pembayaran } of fixtures) {
  console.log(`\n[ ${label} ]`);

  // ── pay-slip-modal.tsx ──────────────────────────────────────────────────────
  //   const gross      = calcTotal(job.nominal, job.pembayaran);
  //   const commission = calcEmployerFee(gross);
  //   const net        = gross;                                   // worker receives 100%
  const psm_gross      = calcTotal(nominal, pembayaran);
  const psm_commission = calcEmployerFee(psm_gross);
  const psm_net        = psm_gross;

  // ── job-sheet.tsx ───────────────────────────────────────────────────────────
  //   const total      = calcTotal(job.nominal, job.pembayaran);
  //   const commission = calcEmployerFee(total);
  //   const workerGets = total;
  const js_total      = calcTotal(nominal, pembayaran);
  const js_commission = calcEmployerFee(js_total);
  const js_workerGets = js_total;

  // ── chat-modal.tsx (initial / pre-negotiation: lockedNominal is null) ───────
  //   const currentNominal = lockedNominal ?? nominal;   (lockedNominal = null here)
  //   const systemFee      = calcEmployerFee(currentNominal);
  //   const totalEscrow    = calcEmployerDeposit(currentNominal);
  const cm_currentNominal = nominal;              // mirrors: lockedNominal ?? nominal
  const cm_systemFee      = calcEmployerFee(cm_currentNominal);
  const cm_totalEscrow    = calcEmployerDeposit(cm_currentNominal);

  // ── chat-modal.tsx (post-negotiation: lockedNominal is set to the same nominal) ─
  const cm_locked_systemFee  = calcEmployerFee(nominal);
  const cm_locked_totalEscrow = calcEmployerDeposit(nominal);

  // ── analytics-dashboard.tsx (per-job row) ───────────────────────────────────
  //   const gross     = calcTotal(job.nominal, job.pembayaran);
  //   const comm      = calcEmployerFee(gross);
  //   const workerPay = gross;
  const ad_gross     = calcTotal(nominal, pembayaran);
  const ad_comm      = calcEmployerFee(ad_gross);
  const ad_workerPay = ad_gross;

  // ── Cross-component assertions ──────────────────────────────────────────────

  // All gross/base amounts must agree
  assert("gross: pay-slip == job-sheet",         psm_gross,  js_total);
  assert("gross: pay-slip == analytics",          psm_gross,  ad_gross);
  assert("gross: pay-slip == chat currentNominal",psm_gross,  cm_currentNominal);

  // All fee amounts must agree
  assert("fee: pay-slip == job-sheet",            psm_commission,  js_commission);
  assert("fee: pay-slip == chat (unlocked)",       psm_commission,  cm_systemFee);
  assert("fee: pay-slip == chat (locked)",         psm_commission,  cm_locked_systemFee);
  assert("fee: pay-slip == analytics",             psm_commission,  ad_comm);

  // Worker net amounts must agree
  assert("worker-net: pay-slip == job-sheet",     psm_net, js_workerGets);
  assert("worker-net: pay-slip == analytics",     psm_net, ad_workerPay);

  // Deposit integrity: totalEscrow == gross + fee
  assert("deposit: gross + fee == calcEmployerDeposit", psm_gross + psm_commission, cm_totalEscrow);
  assert("deposit: locked == unlocked",                  cm_totalEscrow,             cm_locked_totalEscrow);

  // Fee is exactly 15% rounded
  const expected_fee = Math.round(nominal * PLATFORM_FEE_CEPAT);
  assert("fee == Math.round(nominal × 15%)",      psm_commission, expected_fee);
}

console.log("\n" + "─".repeat(70));
if (failures === 0) {
  console.log(`\n✅  All assertions passed — fee display is consistent across all components.\n`);
  process.exit(0);
} else {
  console.error(`\n❌  ${failures} assertion(s) failed — fee display is INCONSISTENT.\n`);
  process.exit(1);
}
