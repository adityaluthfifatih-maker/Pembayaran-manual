import { Router, type IRouter, type Request } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db, gigsTable, dailyPayoutsTable, adminLogsTable, radarScrapeAlertsTable } from "@workspace/db";
import { ADMIN_COOKIE, isAdminSession, adminSessionId } from "../lib/admin";
import { broadcastGig } from "../lib/realtime";

const router: IRouter = Router();

function requireAdmin(req: Request): Promise<boolean> {
  return isAdminSession(req.cookies?.[ADMIN_COOKIE]);
}

async function getAdminId(req: Request): Promise<string | null> {
  return adminSessionId(req.cookies?.[ADMIN_COOKIE]);
}

async function logAdminAction(
  adminId: string,
  action: string,
  targetId?: string | number | null,
  reason?: string | null,
): Promise<void> {
  await db.insert(adminLogsTable).values({
    adminId,
    action,
    targetId: targetId != null ? String(targetId) : null,
    reason: reason ?? null,
  });
}

/** The worker's net share of a total escrow deposit (base wage × 1.15). */
function workerNetOf(deposit: number): number {
  return Math.round(deposit / 1.15);
}

// ── Pusat Resolusi: remote proof-of-work disputes ────────────────────

/** List every project frozen in `disputed_active` (rejected remote proofs). */
router.get("/admin/disputes", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
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
  if (!(await requireAdmin(req))) {
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
  if (!(await requireAdmin(req))) {
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

// ── Job Management: delete, refund, force-payout ──────────────────────

const jobActionBody = z.object({
  reason: z.string().min(1, "Alasan wajib diisi."),
});

/** DELETE /admin/jobs/:id — Remove an inappropriate or fake job posting. */
router.delete("/admin/jobs/:id", async (req, res): Promise<void> => {
  const adminId = await getAdminId(req);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const jobId = Number(req.params["id"]);
  if (!Number.isFinite(jobId)) {
    res.status(400).json({ error: "ID job tidak valid." });
    return;
  }

  const parsed = jobActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Alasan wajib diisi." });
    return;
  }

  const [deleted] = await db
    .delete(gigsTable)
    .where(eq(gigsTable.id, jobId))
    .returning({ id: gigsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Job tidak ditemukan." });
    return;
  }

  await logAdminAction(adminId, "DELETE_JOB", jobId, parsed.data.reason);
  req.log.info({ jobId, adminId }, "Admin deleted job posting");
  res.json({ ok: true });
});

/** POST /admin/jobs/:id/refund — Refund locked escrow back to employer. */
router.post("/admin/jobs/:id/refund", async (req, res): Promise<void> => {
  const adminId = await getAdminId(req);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const jobId = Number(req.params["id"]);
  if (!Number.isFinite(jobId)) {
    res.status(400).json({ error: "ID job tidak valid." });
    return;
  }

  const parsed = jobActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Alasan wajib diisi." });
    return;
  }

  const [gig] = await db
    .update(gigsTable)
    .set({ escrowStatus: "refunded" })
    .where(eq(gigsTable.id, jobId))
    .returning();

  if (!gig) {
    res.status(404).json({ error: "Job tidak ditemukan." });
    return;
  }

  broadcastGig(gig);
  await logAdminAction(adminId, "REFUND_JOB", jobId, parsed.data.reason);
  req.log.info({ jobId, adminId }, "Admin issued escrow refund for job");
  res.json({ ok: true });
});

/** POST /admin/jobs/:id/force-payout — Emergency release 100% wage to worker. */
router.post("/admin/jobs/:id/force-payout", async (req, res): Promise<void> => {
  const adminId = await getAdminId(req);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const jobId = Number(req.params["id"]);
  if (!Number.isFinite(jobId)) {
    res.status(400).json({ error: "ID job tidak valid." });
    return;
  }

  const parsed = jobActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Alasan wajib diisi." });
    return;
  }

  const [gig] = await db
    .update(gigsTable)
    .set({ escrowStatus: "released" })
    .where(eq(gigsTable.id, jobId))
    .returning();

  if (!gig) {
    res.status(404).json({ error: "Job tidak ditemukan." });
    return;
  }

  broadcastGig(gig);
  await logAdminAction(adminId, "FORCE_PAYOUT_JOB", jobId, parsed.data.reason);
  req.log.info({ jobId, adminId }, "Admin force-payout to worker for job");
  res.json({ ok: true });
});

// ── Admin jobs listing ────────────────────────────────────────────────

/** GET /admin/jobs — All gigs for the job management table. */
router.get("/admin/jobs", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const gigs = await db
    .select()
    .from(gigsTable)
    .orderBy(desc(gigsTable.postedAt));

  res.json(
    gigs.map((g) => ({
      jobId: g.id,
      posisi: g.posisi,
      employerName: g.employerName ?? g.namaPerusahaan ?? "—",
      escrowAmount: g.escrowAmount ?? 0,
      escrowStatus: g.escrowStatus ?? "locked",
      hiringMode: g.hiringMode ?? null,
      postedAt: g.postedAt,
    })),
  );
});

// ── Audit log ─────────────────────────────────────────────────────────

/** GET /admin/logs — Fetch the 200 most-recent admin actions. */
router.get("/admin/logs", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const logs = await db
    .select()
    .from(adminLogsTable)
    .orderBy(desc(adminLogsTable.createdAt))
    .limit(200);

  res.json(logs);
});

/**
 * GET /admin/radar-alerts — recent flags where a company's usage of the
 * aggregate-only radar-stats endpoint looked like it was probing for
 * individual worker locations (rapid repeated calls or many distinct
 * lat/lng/radius combos in a short window). Informational — nothing is
 * ever blocked automatically.
 */
router.get("/admin/radar-alerts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const alerts = await db
    .select()
    .from(radarScrapeAlertsTable)
    .orderBy(desc(radarScrapeAlertsTable.createdAt))
    .limit(200);

  res.json(alerts);
});

export default router;
