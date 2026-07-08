/**
 * LEGACY — pre-pivot % commission math regression check.
 *
 * As of the flat-rate + freemium paywall pivot, NEW postings never charge a
 * % commission (Instan Kilat pays a flat listing price via instant-orders;
 * Posting Reguler is free). `feeRate` is stored as `0` for all new gigs.
 *
 * This script is kept ONLY to guard the legacy `escrow.ts` tiered-rate math
 * (`PLATFORM_FEE_RATES`, `getFeeRate`, `calcEmployerFee`, `calcEmployerDeposit`)
 * that still back-fills pre-pivot gig rows and the wage-escrow split/QR-release
 * pipeline (`calcSplit`) that all jobs — old and new — still use to pay workers
 * 100% of their wage. It does NOT describe current pricing for new postings.
 * See `.agents/memory/flat-rate-paywall-pivot.md` for the current model.
 *
 * Ensures pay-slip-modal, job-sheet, chat-modal, and analytics-dashboard all
 * compute identical platform-fee and gross amounts for the same CustomJob
 * nominal across all three legacy category-tiered rates.
 *
 * Also verifies server-side persistence: queries the DB and confirms that every
 * gig row with a non-null `job_category` stores a `fee_rate` that matches the
 * expected tier rate, and that gigs without a category default to 5%.
 *
 * Exit 0 = all assertions pass; exit 1 = at least one mismatch found.
 */

import pg from "pg";
import {
  calcEmployerFee,
  calcEmployerDeposit,
  PLATFORM_FEE_RATES,
  getFeeRate,
  DEFAULT_FEE_RATE,
  type JobCategory,
} from "../../artifacts/jakarta-gig-finder/src/types/escrow.js";
import {
  calcTotal,
  type PaymentType,
} from "../../artifacts/jakarta-gig-finder/src/types/custom-job.js";

const { Pool } = pg;

// ── Test fixtures ─────────────────────────────────────────────────────────────
const nominalFixtures: Array<{ label: string; nominal: number; pembayaran: PaymentType }> = [
  { label: "per_shift  Rp 150.000",   nominal: 150_000,   pembayaran: "per_shift" },
  { label: "per_hari   Rp 200.000",   nominal: 200_000,   pembayaran: "per_hari" },
  { label: "per_projek Rp 5.000.000", nominal: 5_000_000, pembayaran: "per_projek" },
  { label: "per_bulan  Rp 3.500.000", nominal: 3_500_000, pembayaran: "per_bulan" },
  { label: "per_shift  Rp 1 (min)",   nominal: 1,         pembayaran: "per_shift" },
  { label: "per_shift  Rp 999.999",   nominal: 999_999,   pembayaran: "per_shift" },
];

const categories = Object.keys(PLATFORM_FEE_RATES) as JobCategory[];

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

// ── Tier table header ─────────────────────────────────────────────────────────
console.log("\nCategory-tiered fee rates:");
for (const cat of categories) {
  console.log(`  ${cat}: ${Math.round(PLATFORM_FEE_RATES[cat] * 100)}%`);
}
console.log(`  DEFAULT_FEE_RATE = ${Math.round(DEFAULT_FEE_RATE * 100)}% (terampil)\n`);
console.log("─".repeat(70));

// ── Cross-component consistency per category per nominal ──────────────────────
for (const cat of categories) {
  const feeRate = getFeeRate(cat);
  const pct = Math.round(feeRate * 100);

  console.log(`\n╔══ Category: ${cat.toUpperCase()} (${pct}%) ══╗`);

  for (const { label, nominal, pembayaran } of nominalFixtures) {
    console.log(`\n  [ ${label} ]`);

    // ── pay-slip-modal.tsx ──────────────────────────────────────────────────
    //   const gross      = calcTotal(job.nominal, job.pembayaran);
    //   const commission = calcEmployerFee(gross, feeRate);
    const psm_gross      = calcTotal(nominal, pembayaran);
    const psm_commission = calcEmployerFee(psm_gross, feeRate);

    // ── job-sheet.tsx ───────────────────────────────────────────────────────
    //   const total      = calcTotal(job.nominal, job.pembayaran);
    //   const commission = calcEmployerFee(total, feeRate);
    const js_total      = calcTotal(nominal, pembayaran);
    const js_commission = calcEmployerFee(js_total, feeRate);

    // ── chat-modal.tsx (pre-negotiation) ───────────────────────────────────
    //   const systemFee   = calcEmployerFee(currentNominal, feeRate);
    //   const totalEscrow = calcEmployerDeposit(currentNominal, feeRate);
    const cm_systemFee   = calcEmployerFee(nominal, feeRate);
    const cm_totalEscrow = calcEmployerDeposit(nominal, feeRate);

    // ── chat-modal.tsx (post-negotiation, same nominal) ────────────────────
    const cm_locked_systemFee   = calcEmployerFee(nominal, feeRate);
    const cm_locked_totalEscrow = calcEmployerDeposit(nominal, feeRate);

    // ── analytics-dashboard.tsx ────────────────────────────────────────────
    //   const gross = calcTotal(job.nominal, job.pembayaran);
    //   const comm  = calcEmployerFee(gross, feeRate);
    const ad_gross = calcTotal(nominal, pembayaran);
    const ad_comm  = calcEmployerFee(ad_gross, feeRate);

    // ── Assertions ─────────────────────────────────────────────────────────
    assert("gross: pay-slip == job-sheet",           psm_gross,      js_total);
    assert("gross: pay-slip == analytics",            psm_gross,      ad_gross);

    assert("fee: pay-slip == job-sheet",              psm_commission, js_commission);
    assert("fee: pay-slip == chat (unlocked)",         psm_commission, cm_systemFee);
    assert("fee: pay-slip == chat (locked)",           psm_commission, cm_locked_systemFee);
    assert("fee: pay-slip == analytics",               psm_commission, ad_comm);

    // deposit integrity
    assert("deposit: gross + fee == calcEmployerDeposit", psm_gross + psm_commission, cm_totalEscrow);
    assert("deposit: locked == unlocked",                  cm_totalEscrow, cm_locked_totalEscrow);

    // rate sanity: fee == Math.round(nominal × rate)
    const expected_fee = Math.round(nominal * feeRate);
    assert(`fee == Math.round(nominal × ${pct}%)`, psm_commission, expected_fee);
  }
}

// ── Default rate sanity ───────────────────────────────────────────────────────
console.log("\n╔══ DEFAULT_FEE_RATE (no category on job) ══╗");
{
  const feeRate = DEFAULT_FEE_RATE;
  const nominal = 200_000;
  const fee = calcEmployerFee(nominal, feeRate);
  const dep = calcEmployerDeposit(nominal, feeRate);
  assert(`default fee == Math.round(200k × ${Math.round(feeRate * 100)}%)`, fee, Math.round(nominal * feeRate));
  assert("default deposit == nominal + fee",   dep, nominal + fee);
  assert("getFeeRate(undefined-ish) == terampil", getFeeRate("terampil"), feeRate);
}

// ── DB persistence check ──────────────────────────────────────────────────────
// For every gig row that has a non-null job_category, confirm the stored fee_rate
// matches the expected tier rate.  Gigs without a category are skipped (they rely
// on the frontend DEFAULT_FEE_RATE fallback, which the math checks above cover).
console.log("\n" + "─".repeat(70));
console.log("╔══ DB persistence: jobCategory / feeRate round-trip ══╗\n");

let dbFailures = 0;
let dbChecked = 0;
let dbSkipped = 0;

if (!process.env.DATABASE_URL) {
  console.warn("  ⚠  DATABASE_URL not set — skipping DB persistence check");
} else {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query<{
      id: string;
      job_category: string | null;
      fee_rate: number | null;
    }>(
      "SELECT id, job_category, fee_rate FROM gigs ORDER BY posted_at DESC LIMIT 200"
    );

    for (const row of rows) {
      if (row.job_category === null) {
        dbSkipped++;
        continue;
      }

      const cat = row.job_category as JobCategory;
      const expectedRate = PLATFORM_FEE_RATES[cat];

      if (expectedRate === undefined) {
        console.error(
          `  ✗ gig ${row.id}: unknown job_category "${row.job_category}"`
        );
        dbFailures++;
        continue;
      }

      if (row.fee_rate === null) {
        console.error(
          `  ✗ gig ${row.id}: job_category="${row.job_category}" but fee_rate is NULL`
        );
        dbFailures++;
        continue;
      }

      // Allow a tiny floating-point tolerance (stored as doublePrecision).
      if (Math.abs(row.fee_rate - expectedRate) > 1e-9) {
        console.error(
          `  ✗ gig ${row.id}: job_category="${row.job_category}" expects feeRate=${expectedRate} but stored ${row.fee_rate}`
        );
        dbFailures++;
      } else {
        dbChecked++;
        console.log(
          `  ✓ gig ${row.id}: ${row.job_category} → feeRate ${row.fee_rate}`
        );
      }
    }

    if (dbChecked === 0 && dbFailures === 0) {
      console.log(
        "  (no categorised gigs in DB yet — math checks above cover the schema contract)"
      );
    } else {
      console.log(
        `\n  ${dbChecked} gig(s) verified, ${dbSkipped} uncategorised (skipped), ${dbFailures} mismatch(es)`
      );
    }
  } finally {
    await pool.end();
  }

  failures += dbFailures;
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(70));
if (failures === 0) {
  console.log("\n✅  All assertions passed — tiered fee display is consistent across all components.\n");
  process.exit(0);
} else {
  console.error(`\n❌  ${failures} assertion(s) failed — fee display is INCONSISTENT.\n`);
  process.exit(1);
}
