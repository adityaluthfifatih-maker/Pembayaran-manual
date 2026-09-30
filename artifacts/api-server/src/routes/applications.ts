import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  applicationsTable,
  gigsTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { documentUpload } from "../lib/upload";
import {
  broadcastApplication,
  broadcastApplicationStatus,
} from "../lib/realtime";

const router: IRouter = Router();

/**
 * Per-application CV/Portfolio upload — used by the "unggah berkas baru
 * khusus untuk lowongan ini" option in the Regular apply modal. Returns the
 * stored URLs so the client can include them in the follow-up POST
 * /applications call as `submittedCvUrl`/`submittedPortfolioUrl`.
 */
router.post(
  "/applications/documents/upload",
  documentUpload.fields([
    { name: "cv", maxCount: 1 },
    { name: "portfolio", maxCount: 1 },
  ]),
  async (req, res): Promise<void> => {
    const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
    if (!user) {
      res.status(401).json({ error: "Tidak terautentikasi." });
      return;
    }

    const files = req.files as
      | Record<string, Express.Multer.File[] | undefined>
      | undefined;
    const cvFile = files?.["cv"]?.[0];
    const portfolioFile = files?.["portfolio"]?.[0];

    if (!cvFile && !portfolioFile) {
      res.status(400).json({
        error: "Unggah minimal satu berkas (CV atau Portofolio). Format PDF, maks 10MB.",
      });
      return;
    }

    res.json({
      cvUrl: cvFile ? `/api/uploads/documents/${cvFile.filename}` : undefined,
      portfolioUrl: portfolioFile ? `/api/uploads/documents/${portfolioFile.filename}` : undefined,
    });
  },
);

/**
 * Worker submits an application for a gig.
 *
 * Sensitive fields (NIK, NPWP, rekening) arrive already-masked — masking runs
 * on the worker's device in `handleApply` before the payload is sent here.
 * The server looks up the gig's employer_id so subsequent GET/PATCH endpoints
 * can enforce row-level ownership without relying on client-supplied data.
 * The row is persisted and immediately fanned out over the WebSocket hub.
 */
const applyBody = z.object({
  jobId: z.coerce.number().int().positive(),
  jobTitle: z.string().default(""),
  workerName: z.string().default(""),
  workerNikMasked: z.string().default(""),
  workerNpwpMasked: z.string().default(""),
  hasNpwp: z.boolean().default(false),
  bank: z.string().default(""),
  rekening: z.string().default(""),
  /** Optional link to the worker's CV / resume. */
  cvLink: z.string().optional(),
  /** Optional link to the worker's portfolio. */
  portfolioLink: z.string().optional(),
  /**
   * Regular-job dual-entry CV/Portfolio. When provided, these are a fresh
   * upload made specifically for this application (apply-modal "unggah
   * berkas baru" choice). When omitted, the server falls back to the
   * worker's profile master files (default_cv_url/default_portfolio_url) —
   * the apply-modal "gunakan CV/Portofolio dari profil" choice. Instant jobs
   * never send these — Instant stays direct click-to-apply.
   */
  submittedCvUrl: z.string().optional(),
  submittedPortfolioUrl: z.string().optional(),
});

router.post("/applications", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "pekerja") {
    res.status(403).json({ error: "Hanya pekerja yang dapat melamar pekerjaan." });
    return;
  }
  const parsed = applyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Persist the application and its durable notification atomically. This
  // prevents a failed notification write from leaving an application that
  // appears to the worker as a failed request and never reaches the employer.
  const result = await db.transaction(async (tx) => {
    const [gig] = await tx
      .select({
        employerId: gigsTable.employerId,
        hiringMode: gigsTable.hiringMode,
        title: gigsTable.posisi,
      })
      .from(gigsTable)
      .where(eq(gigsTable.id, parsed.data.jobId))
      .limit(1)
      .for("update");

    if (!gig) return { kind: "missing_gig" as const };
    if (!gig.employerId) return { kind: "missing_employer" as const };

    // A repeated submit from a double tap or a retried network request should
    // not create duplicate rows or duplicate realtime notifications.
    const [existing] = await tx
      .select()
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.jobId, parsed.data.jobId),
          eq(applicationsTable.workerId, user.id),
        ),
      )
      .orderBy(desc(applicationsTable.createdAt))
      .limit(1);
    if (existing && existing.status !== "ditolak") {
      return { kind: "existing" as const, row: existing, gig };
    }

    const isRegular = gig.hiringMode !== "cepat";
    let submittedCvUrl = parsed.data.submittedCvUrl;
    let submittedPortfolioUrl = parsed.data.submittedPortfolioUrl;

    if (isRegular && !submittedCvUrl && !submittedPortfolioUrl) {
      const [profileUser] = await tx
        .select({
          defaultCvUrl: usersTable.defaultCvUrl,
          defaultPortfolioUrl: usersTable.defaultPortfolioUrl,
        })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);
      submittedCvUrl = profileUser?.defaultCvUrl ?? undefined;
      submittedPortfolioUrl = profileUser?.defaultPortfolioUrl ?? undefined;
    }

    const [row] = await tx
      .insert(applicationsTable)
      .values({
        ...parsed.data,
        jobTitle: gig.title,
        submittedCvUrl: isRegular ? submittedCvUrl : undefined,
        submittedPortfolioUrl: isRegular ? submittedPortfolioUrl : undefined,
        workerId: user.id,
        employerId: gig.employerId,
        status: "baru",
      })
      .returning();
    if (!row) return { kind: "insert_failed" as const };

    await tx.insert(notificationsTable).values({
      userId: gig.employerId,
      message: `${row.workerName || "Seorang pekerja"} baru saja melamar lowongan ${row.jobTitle || "Anda"}`,
      type: "application",
      jobId: row.jobId,
      applicationId: row.id,
    });

    return { kind: "created" as const, row, gig };
  });

  if (result.kind === "missing_gig") {
    res.status(404).json({ error: "Lowongan tidak ditemukan di server." });
    return;
  }
  if (result.kind === "missing_employer") {
    res.status(409).json({ error: "Lowongan belum terhubung ke akun perusahaan." });
    return;
  }
  if (result.kind === "insert_failed") {
    res.status(500).json({ error: "Gagal menyimpan lamaran. Silakan coba lagi." });
    return;
  }

  if (result.kind === "existing") {
    res.json({ ...result.row, hiringMode: result.gig.hiringMode ?? "lama", reused: true });
    return;
  }

  // Push only after the application and durable notification commit together.
  const deliveredTo = broadcastApplication(
    { ...result.row, hiringMode: result.gig.hiringMode ?? "lama" },
    result.gig.employerId!,
  );

  req.log.info(
    {
      applicationId: result.row.id,
      jobId: result.row.jobId,
      workerId: result.row.workerId,
      employerId: result.gig.employerId,
      websocketRecipients: deliveredTo,
    },
    "New job application persisted and delivered",
  );
  res.status(201).json({ ...result.row, hiringMode: result.gig.hiringMode ?? "lama" });
});

/**
 * Employer fetches their applications.
 *
 * Requires an active session with role "perusahaan". Returns only rows where
 * `employer_id` matches the authenticated user — no other employer's
 * applications are ever returned. An optional `?jobId=` narrows the result
 * further to a single gig.
 */
router.get("/applications/mine", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "pekerja") {
    res.status(403).json({ error: "Endpoint ini hanya tersedia untuk pekerja." });
    return;
  }

  const rows = await db
    .select({
      application: applicationsTable,
      hiringMode: gigsTable.hiringMode,
    })
    .from(applicationsTable)
    .leftJoin(gigsTable, eq(applicationsTable.jobId, gigsTable.id))
    .where(eq(applicationsTable.workerId, user.id))
    .orderBy(desc(applicationsTable.createdAt));

  res.setHeader("Cache-Control", "no-store");
  res.json(
    rows.map(({ application, hiringMode }) => ({
      ...application,
      hiringMode: hiringMode ?? "lama",
    })),
  );
});

router.get("/applications", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat melihat lamaran." });
    return;
  }

  const jobId = req.query.jobId ? Number(req.query.jobId) : null;
  const conditions = jobId && !isNaN(jobId)
    ? and(
        eq(applicationsTable.employerId, user.id),
        eq(applicationsTable.jobId, jobId),
      )
    : eq(applicationsTable.employerId, user.id);

  const rows = await db
    .select({
      application: applicationsTable,
      hiringMode: gigsTable.hiringMode,
    })
    .from(applicationsTable)
    .leftJoin(gigsTable, eq(applicationsTable.jobId, gigsTable.id))
    .where(conditions)
    .orderBy(desc(applicationsTable.createdAt));
  res.setHeader("Cache-Control", "no-store");
  res.json(
    rows.map(({ application, hiringMode }) => ({
      ...application,
      hiringMode: hiringMode ?? "lama",
    })),
  );
});

/**
 * Employer updates the status of an application (ditinjau / diterima / ditolak).
 *
 * Row-level ownership is enforced: the update is only applied when `employer_id`
 * matches the session user (or is empty for gigs not yet stored in the DB, e.g.
 * demo seeds). The change is persisted and immediately broadcast so the worker's
 * device can update its notification badge without polling.
 */
const statusBody = z.object({
  status: z.enum(["baru", "ditinjau", "diterima", "ditolak", "selesai"]),
});

router.patch("/applications/:id/status", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat mengubah status lamaran." });
    return;
  }
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID lamaran tidak valid." });
    return;
  }
  const parsed = statusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Status tidak valid." });
    return;
  }

  // Ownership check: only the employer who owns the job (or unassigned demo rows)
  // may change the status. We use an inline WHERE rather than a pre-fetch so the
  // check and the update happen atomically and no row is returned on mismatch.
  const [row] = await db
    .update(applicationsTable)
    .set({ status: parsed.data.status })
    .where(
      and(
        eq(applicationsTable.id, id),
        eq(applicationsTable.employerId, user.id),
      ),
    )
    .returning();

  if (!row) {
    // Row not found OR caller doesn't own it — report 404 to avoid leaking existence.
    res.status(404).json({ error: "Lamaran tidak ditemukan." });
    return;
  }

  broadcastApplicationStatus(row.id, row.status, row.jobId, row.workerId);
  req.log.info(
    { applicationId: row.id, status: row.status },
    "Application status updated",
  );
  res.json(row);
});

export default router;
