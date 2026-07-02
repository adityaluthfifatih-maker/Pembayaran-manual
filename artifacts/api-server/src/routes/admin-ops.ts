import { Router, type IRouter, type Request } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db, gigsTable, dailyPayoutsTable } from "@workspace/db";
import { ADMIN_COOKIE, isAdminSession } from "../lib/admin";
import { broadcastGig } from "../lib/realtime";

const router: IRouter = Router();

function requireAdmin(req: Request): boolean {
  return isAdminSession(req.cookies?.[ADMIN_COOKIE]);
}

/** The worker's net share of a total escrow deposit (base wage × 1.15). */
function workerNetOf(deposit: number): number {
  return Math.round(deposit / 1.15);
}

// ── Pusat Resolusi: remote proof-of-work disputes ────────────────────

/** List every project frozen in `disputed_active` (rejected remote proofs). */
router.get("/admin/disputes", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const rows = await db
    .select()
    .from(gigsTable)
    .where(eq(gigsTable.escrowStatus, "disputed_active"))
    .orderBy(desc(gigsTable.postedAt));

  res.json(
    rows.map((g) => ({
      jobId: g.id,
      posisi: g.posisi,
      employerId: g.employerId ?? null,
      employerName: g.employerName ?? g.namaPerusahaan ?? "—",
      proofUrl: g.proofUrl ?? null,
      escrowAmount: g.escrowAmount ?? 0,
      workerNet: workerNetOf(g.escrowAmount ?? 0),
      postedAt: g.postedAt,
    })),
  );
});

const refundBody = z.object({ jobId: z.coerce.number() });

/** Admin rules a dispute in the EMPLOYER's favour → refund the escrow. */
router.post("/admin/refund", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const parsed = refundBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "jobId tidak valid." });
    return;
  }

  const [gig] = await db
    .update(gigsTable)
    .set({ escrowStatus: "refunded" })
    .where(eq(gigsTable.id, parsed.data.jobId))
    .returning();

  if (!gig) {
    res.status(404).json({ error: "Proyek tidak ditemukan." });
    return;
  }

  broadcastGig(gig);
  req.log.info({ jobId: gig.id }, "Admin refunded escrow to employer");
  res.json({ ok: true });
});

// ── Monitoring Proyek Fisik: on-site tracker + daily payout log ──────

router.get("/admin/onsite", async (req, res): Promise<void> => {
  if (!requireAdmin(req)) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const gigs = await db
    .select()
    .from(gigsTable)
    .where(eq(gigsTable.boronganType, "onsite"))
    .orderBy(desc(gigsTable.postedAt));

  const ids = gigs.map((g) => g.id);
  const payouts = ids.length
    ? await db
        .select()
        .from(dailyPayoutsTable)
        .where(inArray(dailyPayoutsTable.jobId, ids))
        .orderBy(desc(dailyPayoutsTable.at))
    : [];

  res.json({
    gigs: gigs.map((g) => ({
      jobId: g.id,
      posisi: g.posisi,
      employerName: g.employerName ?? g.namaPerusahaan ?? "—",
      jumlahHari: g.jumlahHari ?? 1,
      daysPaid: g.daysPaid ?? 0,
      escrowAmount: g.escrowAmount ?? 0,
      escrowStatus: g.escrowStatus ?? "locked",
      alamat: g.alamat ?? null,
    })),
    payouts,
  });
});

export default router;
