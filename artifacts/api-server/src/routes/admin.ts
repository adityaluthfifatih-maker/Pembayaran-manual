import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  gigsTable,
  usersTable,
  attendanceTable,
  ratingsTable,
  academyCompletionsTable,
  academyQuestionsTable,
  adminLogsTable,
} from "@workspace/db";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  adminSessionId,
  createAdminSession,
  deleteAdminSession,
  isAdminSession,
  lockoutRemaining,
  pruneAdminState,
  recordFailedAttempt,
  resetAttempts,
  verifyAdminCredentials,
} from "../lib/admin";
import {
  getAllQuestionsForAdmin,
  getPassingScore,
  scoreQuiz,
  setPassingScore,
  toClientQuestions,
} from "../lib/academy";
import { broadcastGig } from "../lib/realtime";

const router: IRouter = Router();

/**
 * The escrow deposit stored on a gig is the TOTAL the employer funds
 * (base wage × 1.15). The worker's net is 100% of the base wage, and the
 * platform's 15% fee is the remainder. Deriving the split from the stored
 * total keeps a single source of truth.
 */
function splitDeposit(deposit: number): { workerNet: number; platformCut: number } {
  const workerNet = Math.round(deposit / 1.15);
  return { workerNet, platformCut: deposit - workerNet };
}

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.ip ?? "unknown";
}

function requireAdmin(req: Request): Promise<boolean> {
  return isAdminSession(req.cookies?.[ADMIN_COOKIE]);
}

// ── Auth ─────────────────────────────────────────────────────────
const loginBody = z.object({
  adminId: z.string().min(1),
  token: z.string().min(1),
});

router.post("/admin/login", async (req, res): Promise<void> => {
  const ip = clientIp(req);
  await pruneAdminState();
  const remaining = await lockoutRemaining(ip);
  if (remaining > 0) {
    res.status(429).json({
      error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(remaining / 1000)} detik.`,
    });
    return;
  }

  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Identitas Admin dan Kode Token wajib diisi." });
    return;
  }

  if (!verifyAdminCredentials(parsed.data.adminId.trim(), parsed.data.token)) {
    await recordFailedAttempt(ip);
    req.log.warn({ ip }, "Failed admin login attempt");
    res.status(401).json({ error: "Identitas Admin atau Kode Token salah." });
    return;
  }

  await resetAttempts(ip);
  const session = await createAdminSession(parsed.data.adminId.trim());
  res.cookie(ADMIN_COOKIE, session, adminCookieOptions());
  res.json({ ok: true });
});

router.post("/admin/logout", async (req, res): Promise<void> => {
  await deleteAdminSession(req.cookies?.[ADMIN_COOKIE]);
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
  res.status(204).end();
});

router.get("/admin/me", async (req, res): Promise<void> => {
  const adminId = await adminSessionId(req.cookies?.[ADMIN_COOKIE]);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const passed = await db
    .select({ id: academyCompletionsTable.id })
    .from(academyCompletionsTable)
    .where(
      and(
        eq(academyCompletionsTable.adminId, adminId),
        eq(academyCompletionsTable.passed, true),
      ),
    )
    .limit(1);

  res.json({ ok: true, trainingPassed: passed.length > 0, requireAcademy });
});

// ── Escrow ledger ────────────────────────────────────────────────
router.get("/admin/ledger", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const gigs = await db.select().from(gigsTable).orderBy(desc(gigsTable.postedAt));
  const gigIds = gigs.map((g) => g.id);

  const attendance = gigIds.length
    ? await db
        .select()
        .from(attendanceTable)
        .where(inArray(attendanceTable.jobId, gigIds))
    : [];

  const workerByJob = new Map<number, { name: string; working: boolean; done: boolean }>();
  for (const a of attendance) {
    const cur = workerByJob.get(a.jobId) ?? { name: a.workerName, working: false, done: false };
    cur.name = a.workerName;
    if (a.kind === "masuk") cur.working = true;
    if (a.kind === "pulang") cur.done = true;
    workerByJob.set(a.jobId, cur);
  }

  const rows = gigs.map((g) => {
    const deposit = g.escrowAmount ?? 0;
    const { workerNet, platformCut } = splitDeposit(deposit);
    const att = workerByJob.get(g.id);

    let status: "deposited" | "working" | "released";
    if (g.escrowStatus === "released") status = "released";
    else if (att?.working) status = "working";
    else status = "deposited";

    return {
      jobId: g.id,
      posisi: g.posisi,
      employerName: g.employerName ?? g.namaPerusahaan ?? "—",
      workerName: att?.name ?? "—",
      totalUpah: workerNet,
      komisiPlatform: platformCut,
      totalSetoran: deposit,
      escrowStatus: g.escrowStatus ?? "locked",
      status,
      postedAt: g.postedAt,
    };
  });

  res.json(rows);
});

const forceReleaseBody = z.object({
  jobId: z.coerce.number(),
});

/**
 * When REQUIRE_ACADEMY=true the force-release endpoint is hard-gated behind a
 * passed operator assessment. Set the env var in production; leave it unset (or
 * set to anything other than "true") in dev so new operators aren't locked out
 * before they've had a chance to take the quiz.
 */
const requireAcademy = process.env["REQUIRE_ACADEMY"] === "true";

router.post("/admin/force-release", async (req, res): Promise<void> => {
  const adminId = await adminSessionId(req.cookies?.[ADMIN_COOKIE]);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  if (requireAcademy) {
    const passed = await db
      .select({ id: academyCompletionsTable.id })
      .from(academyCompletionsTable)
      .where(
        and(
          eq(academyCompletionsTable.adminId, adminId),
          eq(academyCompletionsTable.passed, true),
        ),
      )
      .limit(1);

    if (passed.length === 0) {
      req.log.warn({ adminId }, "Force-release blocked — operator has not passed academy");
      res.status(403).json({
        error: "Aksi ini membutuhkan kelulusan Akademi Operator. Selesaikan asesmen di tab Akademi terlebih dahulu.",
      });
      return;
    }
  }

  const parsed = forceReleaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "jobId tidak valid." });
    return;
  }

  const [gig] = await db
    .update(gigsTable)
    .set({ escrowStatus: "released" })
    .where(eq(gigsTable.id, parsed.data.jobId))
    .returning();

  if (!gig) {
    res.status(404).json({ error: "Gig tidak ditemukan." });
    return;
  }

  broadcastGig(gig);
  req.log.info({ jobId: gig.id }, "Admin force-released escrow");
  res.json({ ok: true });
});

// ── User management ──────────────────────────────────────────────
router.get("/admin/users", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  const negativeRatings = await db
    .select()
    .from(ratingsTable)
    .where(lte(ratingsTable.score, 2));

  const negByName = new Map<string, number>();
  for (const r of negativeRatings) {
    negByName.set(r.targetName, (negByName.get(r.targetName) ?? 0) + 1);
  }

  const rows = users.map((u) => {
    const profile = (u.profile ?? {}) as Record<string, unknown>;
    const companyName = typeof profile["namaPerusahaan"] === "string"
      ? (profile["namaPerusahaan"] as string)
      : undefined;
    const displayName = companyName || u.name;
    const negativeCount =
      (negByName.get(u.name) ?? 0) + (companyName ? negByName.get(companyName) ?? 0 : 0);

    return {
      id: u.id,
      name: u.name,
      displayName,
      email: u.email,
      role: u.role,
      suspended: u.suspended,
      negativeRatings: negativeCount,
      createdAt: u.createdAt,
    };
  });

  res.json(rows);
});

const suspendBody = z.object({
  userId: z.string().min(1),
  suspended: z.boolean(),
});

router.post("/admin/users/suspend", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const parsed = suspendBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Permintaan tidak valid." });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ suspended: parsed.data.suspended })
    .where(eq(usersTable.id, parsed.data.userId))
    .returning();

  if (!user) {
    res.status(404).json({ error: "Pengguna tidak ditemukan." });
    return;
  }

  req.log.info(
    { userId: user.id, suspended: user.suspended },
    "Admin toggled user suspension",
  );
  res.json({ id: user.id, suspended: user.suspended });
});

// ── KYC verification queue ────────────────────────────────────────

/**
 * List workers who have submitted at least one KYC document, most recently
 * submitted first (using createdAt as a stable proxy — there's no separate
 * submittedAt column). Used to populate the admin moderation queue.
 */
router.get("/admin/kyc", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "pekerja"))
    .orderBy(desc(usersTable.createdAt));

  const rows = users
    .filter((u) => u.ktpPhotoUrl || u.selfieWithKtpUrl)
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      ktpPhotoUrl: u.ktpPhotoUrl,
      selfieWithKtpUrl: u.selfieWithKtpUrl,
      verificationStatus: u.verificationStatus,
    }));

  res.json(rows);
});

const kycVerifyBody = z.object({
  userId: z.string().min(1),
  status: z.enum(["verified", "rejected", "pending"]),
});

/** Approve/reject a worker's KYC submission. Every decision is audit-logged. */
router.post("/admin/kyc/verify", async (req, res): Promise<void> => {
  const adminId = await adminSessionId(req.cookies?.[ADMIN_COOKIE]);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const parsed = kycVerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Permintaan tidak valid." });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ verificationStatus: parsed.data.status })
    .where(eq(usersTable.id, parsed.data.userId))
    .returning();

  if (!user) {
    res.status(404).json({ error: "Pengguna tidak ditemukan." });
    return;
  }

  await db.insert(adminLogsTable).values({
    adminId,
    action: `KYC_${parsed.data.status.toUpperCase()}`,
    targetId: user.id,
    reason: null,
  });

  req.log.info(
    { adminId, userId: user.id, status: parsed.data.status },
    "Admin reviewed KYC submission",
  );
  res.json({ id: user.id, verificationStatus: user.verificationStatus });
});

// ── Academy (operator onboarding quiz) ───────────────────────────
router.get("/admin/academy", async (req, res): Promise<void> => {
  const adminId = await adminSessionId(req.cookies?.[ADMIN_COOKIE]);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const [questions, passingScore, completions] = await Promise.all([
    toClientQuestions(),
    getPassingScore(),
    db
      .select()
      .from(academyCompletionsTable)
      .where(eq(academyCompletionsTable.adminId, adminId))
      .orderBy(desc(academyCompletionsTable.completedAt)),
  ]);

  res.json({
    passingScore,
    questions,
    completions: completions.map((c) => ({
      id: c.id,
      adminId: c.adminId,
      correct: c.correct,
      total: c.total,
      score: c.score,
      passed: c.passed,
      completedAt: c.completedAt,
    })),
  });
});

const academySubmitBody = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedIndex: z.number().int().min(0),
      }),
    )
    .min(1),
});

router.post("/admin/academy/submit", async (req, res): Promise<void> => {
  const adminId = await adminSessionId(req.cookies?.[ADMIN_COOKIE]);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }

  const parsed = academySubmitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Jawaban kuis tidak valid." });
    return;
  }

  const result = await scoreQuiz(parsed.data.answers);

  const [saved] = await db
    .insert(academyCompletionsTable)
    .values({
      adminId,
      correct: result.correct,
      total: result.total,
      score: result.score,
      passed: result.passed,
      answers: result.answers,
    })
    .returning();

  req.log.info(
    { adminId, score: result.score, passed: result.passed },
    "Admin completed academy assessment",
  );

  const passingScore = await getPassingScore();

  res.json({
    id: saved.id,
    completedAt: saved.completedAt,
    passingScore,
    correct: result.correct,
    total: result.total,
    score: result.score,
    passed: result.passed,
    answers: result.answers,
  });
});

// ── Academy question editor (admin CRUD) ──────────────────────────

router.get("/admin/academy/questions", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const rows = await getAllQuestionsForAdmin();
  res.json(
    rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      category: r.category,
      prompt: r.prompt,
      options: r.options as string[],
      correctIndex: r.correctIndex,
      explanation: r.explanation,
      sortOrder: r.sortOrder,
    })),
  );
});

const questionBody = z.object({
  category: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(8),
  correctIndex: z.number().int().min(0),
  explanation: z.string().default(""),
  sortOrder: z.number().int().default(0),
});

router.post("/admin/academy/questions", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const parsed = questionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data soal tidak valid.", detail: parsed.error.issues });
    return;
  }
  if (parsed.data.correctIndex >= parsed.data.options.length) {
    res.status(400).json({ error: "correctIndex melebihi jumlah opsi." });
    return;
  }

  const slug = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const [row] = await db
    .insert(academyQuestionsTable)
    .values({
      slug,
      category: parsed.data.category,
      prompt: parsed.data.prompt,
      options: parsed.data.options,
      correctIndex: parsed.data.correctIndex,
      explanation: parsed.data.explanation,
      sortOrder: parsed.data.sortOrder,
    })
    .returning();

  req.log.info({ id: row.id }, "Admin created academy question");
  res.status(201).json({
    id: row.id,
    slug: row.slug,
    category: row.category,
    prompt: row.prompt,
    options: row.options as string[],
    correctIndex: row.correctIndex,
    explanation: row.explanation,
    sortOrder: row.sortOrder,
  });
});

const questionUpdateBody = questionBody.extend({
  slug: z.string().optional(),
});

router.put("/admin/academy/questions/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }
  const parsed = questionUpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data soal tidak valid.", detail: parsed.error.issues });
    return;
  }
  if (parsed.data.correctIndex >= parsed.data.options.length) {
    res.status(400).json({ error: "correctIndex melebihi jumlah opsi." });
    return;
  }

  const [row] = await db
    .update(academyQuestionsTable)
    .set({
      category: parsed.data.category,
      prompt: parsed.data.prompt,
      options: parsed.data.options,
      correctIndex: parsed.data.correctIndex,
      explanation: parsed.data.explanation,
      sortOrder: parsed.data.sortOrder,
    })
    .where(eq(academyQuestionsTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Soal tidak ditemukan." });
    return;
  }

  req.log.info({ id: row.id }, "Admin updated academy question");
  res.json({
    id: row.id,
    slug: row.slug,
    category: row.category,
    prompt: row.prompt,
    options: row.options as string[],
    correctIndex: row.correctIndex,
    explanation: row.explanation,
    sortOrder: row.sortOrder,
  });
});

router.delete("/admin/academy/questions/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }

  const [deleted] = await db
    .delete(academyQuestionsTable)
    .where(eq(academyQuestionsTable.id, id))
    .returning({ id: academyQuestionsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Soal tidak ditemukan." });
    return;
  }

  req.log.info({ id }, "Admin deleted academy question");
  res.json({ ok: true });
});

// ── Academy settings (passing score) ─────────────────────────────

router.get("/admin/academy/settings", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const passingScore = await getPassingScore();
  res.json({ passingScore });
});

const settingsBody = z.object({
  passingScore: z.number().int().min(1).max(100),
});

router.put("/admin/academy/settings", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const parsed = settingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Nilai tidak valid. Nilai lulus harus antara 1–100." });
    return;
  }
  await setPassingScore(parsed.data.passingScore);
  req.log.info({ passingScore: parsed.data.passingScore }, "Admin updated passing score");
  res.json({ passingScore: parsed.data.passingScore });
});

// ── Live platform stats ───────────────────────────────────────────
router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const [allUsers, allGigs] = await Promise.all([
    db.select().from(usersTable),
    db.select().from(gigsTable),
  ]);
  const now = Date.now();
  const day = 86_400_000;
  const totalUsers = allUsers.length;
  const newUsersToday = allUsers.filter(
    (u) => u.createdAt && new Date(u.createdAt).getTime() > now - day,
  ).length;
  const workers = allUsers.filter((u) => u.role === "pekerja").length;
  const employers = allUsers.filter((u) => u.role === "perusahaan").length;
  const activeGigs = allGigs.filter((g) => g.escrowStatus === "locked").length;
  const releasedGigs = allGigs.filter((g) => g.escrowStatus === "released").length;
  const disputedGigs = allGigs.filter((g) => g.escrowStatus === "disputed").length;
  const totalGigs = allGigs.length;
  const escrowHeld = allGigs
    .filter((g) => g.escrowStatus === "locked")
    .reduce((s, g) => s + (g.escrowAmount ?? 0), 0);
  const escrowReleased = allGigs
    .filter((g) => g.escrowStatus === "released")
    .reduce((s, g) => s + (g.escrowAmount ?? 0), 0);
  const escrowDisputed = allGigs
    .filter((g) => g.escrowStatus === "disputed")
    .reduce((s, g) => s + (g.escrowAmount ?? 0), 0);
  res.json({
    totalUsers, newUsersToday, workers, employers,
    activeGigs, releasedGigs, disputedGigs, totalGigs,
    escrowHeld, escrowReleased, escrowDisputed,
  });
});

export default router;
