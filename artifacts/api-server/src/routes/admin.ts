import { Router, type IRouter, type Request } from "express";
import { desc, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  gigsTable,
  usersTable,
  attendanceTable,
  ratingsTable,
} from "@workspace/db";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createAdminSession,
  deleteAdminSession,
  isAdminSession,
  lockoutRemaining,
  pruneAdminState,
  recordFailedAttempt,
  resetAttempts,
  verifyAdminCredentials,
} from "../lib/admin";
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
  const session = await createAdminSession();
  res.cookie(ADMIN_COOKIE, session, adminCookieOptions());
  res.json({ ok: true });
});

router.post("/admin/logout", async (req, res): Promise<void> => {
  await deleteAdminSession(req.cookies?.[ADMIN_COOKIE]);
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
  res.status(204).end();
});

router.get("/admin/me", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  res.json({ ok: true });
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

  // Latest attendance kind + worker name per job.
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

router.post("/admin/force-release", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
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

  // Keep every connected device's ledger/radar in sync.
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

  // Aggregate negative-rating counts by the rated party's display name.
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

// ── Academy (scaffold stub) ──────────────────────────────────────
router.get("/admin/academy", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  res.json({ completedQuizzes: [], questions: [] });
});

export default router;
