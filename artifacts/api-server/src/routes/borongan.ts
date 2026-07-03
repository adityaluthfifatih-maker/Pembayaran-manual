import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, gigsTable, dailyPayoutsTable, attendanceTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { broadcastGig, broadcastDailyPayout } from "../lib/realtime";

const router: IRouter = Router();

/**
 * The escrow deposit stored on a gig is the TOTAL the employer funds
 * (base wage × 1.15): the worker's net is `deposit / 1.15` and the platform's
 * 15% fee is the remainder. `dailyFractionFor` splits that across the contract
 * duration for on-site daily payouts, settling the rounding remainder on the
 * FINAL day so the sum of all daily fractions equals the escrow totals exactly
 * (no drift). `dayIndex` is 1-based.
 */
function dailyFractionFor(
  deposit: number,
  days: number,
  dayIndex: number,
): { grossFraction: number; platformFee: number; netToWorker: number } {
  const d = Math.max(1, days);
  const workerNetTotal = Math.round(deposit / 1.15);
  const platformCutTotal = deposit - workerNetTotal;
  const perDayNet = Math.floor(workerNetTotal / d);
  const perDayFee = Math.floor(platformCutTotal / d);
  const isFinal = dayIndex >= d;
  // The final check-out absorbs the remainder left by flooring earlier days.
  const netToWorker = isFinal ? workerNetTotal - perDayNet * (d - 1) : perDayNet;
  const platformFee = isFinal ? platformCutTotal - perDayFee * (d - 1) : perDayFee;
  return { grossFraction: netToWorker + platformFee, platformFee, netToWorker };
}

// ── Borongan Jarak Jauh (Remote milestone proof-of-work) ─────────────

const submitBody = z.object({
  jobId: z.coerce.number(),
  proofUrl: z.string().url().refine(
    (u) => u.startsWith("https://") || u.startsWith("http://"),
    { message: "URL bukti kerja harus menggunakan protokol http atau https." },
  ),
});

/** Worker submits a proof-of-work URL to claim milestone payment. */
router.post("/borongan/remote/submit-proof", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = submitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(gigsTable)
    .where(eq(gigsTable.id, parsed.data.jobId));
  if (!existing) {
    res.status(404).json({ error: "Proyek tidak ditemukan." });
    return;
  }
  // A finalized milestone (already paid out) must not be re-opened by a new proof.
  if (existing.proofStatus === "approved" || existing.escrowStatus === "released") {
    res.status(409).json({ error: "Proyek sudah selesai dan tidak dapat diajukan ulang." });
    return;
  }

  const [gig] = await db
    .update(gigsTable)
    .set({
      proofUrl: parsed.data.proofUrl,
      proofStatus: "submitted",
      boronganType: "remote",
    })
    .where(eq(gigsTable.id, parsed.data.jobId))
    .returning();

  broadcastGig(gig);
  req.log.info({ jobId: gig.id }, "Remote borongan proof submitted");
  res.json(gig);
});

const decisionBody = z.object({ jobId: z.coerce.number() });

async function loadOwnedGig(
  jobId: number,
  employerId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [gig] = await db.select().from(gigsTable).where(eq(gigsTable.id, jobId));
  if (!gig) return { ok: false, status: 404, error: "Proyek tidak ditemukan." };
  // Ownership must be positively verifiable: a gig with no recorded employer
  // cannot be approved/rejected by anyone (prevents IDOR escrow manipulation).
  if (!gig.employerId || gig.employerId !== employerId) {
    return { ok: false, status: 403, error: "Hanya pemberi kerja pemilik proyek yang dapat memutuskan." };
  }
  return { ok: true };
}

/**
 * Employer APPROVES the proof: funds are instantly disbursed from escrow to the
 * worker (escrow → released), minus the 15% corporate fee already baked into the
 * deposit.
 */
router.post("/borongan/remote/approve", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = decisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "jobId tidak valid." });
    return;
  }
  const owned = await loadOwnedGig(parsed.data.jobId, user.id);
  if (!owned.ok) {
    res.status(owned.status).json({ error: owned.error });
    return;
  }

  const [gig] = await db
    .update(gigsTable)
    .set({ proofStatus: "approved", escrowStatus: "released" })
    .where(eq(gigsTable.id, parsed.data.jobId))
    .returning();

  broadcastGig(gig);
  req.log.info({ jobId: gig.id }, "Remote borongan proof approved → escrow released");
  res.json(gig);
});

/**
 * Employer REJECTS the proof: the project freezes into `disputed_active` and is
 * routed to the Admin "Pusat Resolusi" for a manual ruling.
 */
router.post("/borongan/remote/reject", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = decisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "jobId tidak valid." });
    return;
  }
  const owned = await loadOwnedGig(parsed.data.jobId, user.id);
  if (!owned.ok) {
    res.status(owned.status).json({ error: owned.error });
    return;
  }

  const [gig] = await db
    .update(gigsTable)
    .set({ proofStatus: "rejected", escrowStatus: "disputed_active" })
    .where(eq(gigsTable.id, parsed.data.jobId))
    .returning();

  broadcastGig(gig);
  req.log.warn({ jobId: gig.id }, "Remote borongan proof rejected → disputed_active");
  res.json(gig);
});

// ── Borongan Di Tempat (On-site daily QR fractional payout) ──────────

/** Returns today's date as "YYYY-MM-DD" in the Asia/Jakarta timezone. */
function jakartaDateString(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

const checkoutBody = z.object({ jobId: z.coerce.number() });

/**
 * Worker performs a verified daily QR check-out on an on-site borongan. One
 * day's fraction of the contract (TotalContractValue / DurationDays) is released
 * from escrow to the worker, minus the 15% corporate fee, and logged for audit.
 *
 * Pre-condition: the worker must have a "masuk" (check-in) attendance record
 * for this job today. Without it the checkout is blocked with 403.
 */
router.post("/borongan/onsite/checkout", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = checkoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "jobId tidak valid." });
    return;
  }

  // Attendance pre-condition: a "masuk" scan must exist for this worker today
  // before any escrow fraction can be released. This prevents a worker from
  // calling checkout without ever having QR-scanned in on site.
  const today = jakartaDateString();
  const [checkIn] = await db
    .select({ id: attendanceTable.id })
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.jobId, parsed.data.jobId),
        eq(attendanceTable.workerId, user.id),
        eq(attendanceTable.kind, "masuk"),
        eq(attendanceTable.scanDate, today),
      ),
    )
    .limit(1);

  if (!checkIn) {
    res.status(403).json({
      error:
        "Kamu belum scan presensi masuk hari ini. Minta employer tampilkan QR masuk terlebih dahulu.",
    });
    return;
  }

  // Read-modify-write under a row lock inside a single transaction so two
  // concurrent check-outs can never pay the same day twice or overshoot the
  // contract duration.
  const outcome = await db.transaction(async (tx) => {
    const [gig] = await tx
      .select()
      .from(gigsTable)
      .where(eq(gigsTable.id, parsed.data.jobId))
      .for("update");
    if (!gig) return { status: 404 as const, error: "Proyek tidak ditemukan." };

    const totalDays = gig.jumlahHari ?? 1;
    const already = gig.daysPaid ?? 0;
    // Hard cap: reject the (jumlahHari+1)th checkout before it reaches calcDailyFraction.
    // Mathematical proof in scripts/src/escrow-invariant-check.ts (checkOverdrawGuard):
    //   k = jumlahHari+1  →  (days+1) × floor(workerNet/days) > workerNet
    // — the cumulative payout exceeds the contracted worker allocation, drawing
    // from the platform fee or creating money. The transaction lock (FOR UPDATE)
    // ensures two concurrent checkouts never both read `already < totalDays`.
    if (already >= totalDays) {
      return { status: 409 as const, error: "Semua pembayaran harian sudah dicairkan." };
    }

    const dayIndex = already + 1;
    const deposit = gig.escrowAmount ?? 0;
    const { grossFraction, platformFee, netToWorker } = dailyFractionFor(
      deposit,
      totalDays,
      dayIndex,
    );

    // Flat-floor residual: the amount left in escrow after all days release at
    // the constant per-day rate (Math.floor).  On the final day this represents
    // the rounding gap that MUST be refunded to the employer — not orphaned.
    // Formula: deposit − (Math.floor(workerNetTotal/d) + Math.floor(platformCutTotal/d)) × d
    const workerNetTotal = Math.round(deposit / 1.15);
    const platformCutTotal = deposit - workerNetTotal;
    const perDayNet = Math.floor(workerNetTotal / totalDays);
    const perDayFee = Math.floor(platformCutTotal / totalDays);
    const residualForEmployer = deposit - (perDayNet + perDayFee) * totalDays;

    const [payout] = await tx
      .insert(dailyPayoutsTable)
      .values({
        jobId: gig.id,
        workerName: user.name,
        dayIndex,
        grossFraction,
        platformFee,
        netToWorker,
      })
      .returning();

    const fullyPaid = dayIndex >= totalDays;
    const [updated] = await tx
      .update(gigsTable)
      .set({
        daysPaid: dayIndex,
        boronganType: "onsite",
        escrowStatus: fullyPaid ? "released" : gig.escrowStatus ?? "locked",
      })
      .where(eq(gigsTable.id, gig.id))
      .returning();

    return { status: 201 as const, gig: updated, payout, dayIndex, netToWorker, residualForEmployer };
  });

  if (outcome.status !== 201) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }

  broadcastGig(outcome.gig);
  broadcastDailyPayout(outcome.payout);
  req.log.info(
    {
      jobId: outcome.gig.id,
      dayIndex: outcome.dayIndex,
      netToWorker: outcome.netToWorker,
      residualForEmployer: outcome.residualForEmployer,
    },
    "On-site borongan daily fraction released",
  );
  res.status(201).json({
    gig: outcome.gig,
    payout: outcome.payout,
    residualForEmployer: outcome.residualForEmployer,
  });
});

export default router;
