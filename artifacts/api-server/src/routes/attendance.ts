import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  attendanceTable,
  applicationsTable,
  companyBranchesTable,
  gigsTable,
} from "@workspace/db";
import { broadcastAttendance } from "../lib/realtime";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { requirePremium } from "../lib/premium";

const router: IRouter = Router();

/**
 * Short-lived attendance QR tokens.
 *
 * The employer device requests a token for a (jobId, kind) pair; the token is
 * encoded into a real QR code and displayed. When a worker scans it, the token
 * is redeemed exactly once and consumed. Tokens live only in memory and expire
 * quickly so a stale screenshot of the QR cannot be reused (anti-joki).
 */
const TOKEN_TTL_MS = 3 * 60 * 1000;

interface TokenRecord {
  jobId: number;
  branchId: number | null;
  kind: "masuk" | "pulang";
  expiresAt: number;
  processing?: boolean;
}

const tokens = new Map<string, TokenRecord>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [token, rec] of tokens) {
    if (rec.expiresAt <= now) tokens.delete(token);
  }
}

/** Returns today's date as "YYYY-MM-DD" in the Asia/Jakarta timezone. */
function jakartaDateString(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

const tokenBody = z.object({
  jobId: z.coerce.number(),
  kind: z.enum(["masuk", "pulang"]),
  branchId: z.coerce.number().int().positive().optional(),
});

/**
 * Employer mints a QR token. Identity comes from the session cookie (never the
 * body); the caller must be the employer that posted the job.
 *
 * Gated behind requirePremium: GPS attendance QR generation is a
 * "Rekhastha Bisnis" employee-management tool, free/unlimited only for
 * active premium subscribers (job posting itself stays free for everyone).
 */
router.post("/attendance/token", requirePremium, async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = tokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [gig] = await db
    .select()
    .from(gigsTable)
    .where(eq(gigsTable.id, parsed.data.jobId));
  if (!gig) {
    res.status(404).json({ error: "Lowongan tidak ditemukan." });
    return;
  }
  if (gig.employerId !== user.id) {
    res.status(403).json({ error: "Hanya pemberi kerja pemilik lowongan yang dapat membuat QR." });
    return;
  }

  let branchId: number | null = null;
  if (parsed.data.branchId !== undefined) {
    const [branch] = await db
      .select({ id: companyBranchesTable.id })
      .from(companyBranchesTable)
      .where(
        and(
          eq(companyBranchesTable.id, parsed.data.branchId),
          eq(companyBranchesTable.companyId, user.id),
          eq(companyBranchesTable.active, true),
        ),
      )
      .limit(1);
    if (!branch) {
      res.status(404).json({ error: "Cabang aktif tidak ditemukan." });
      return;
    }
    branchId = branch.id;
  }

  sweepExpired();
  const token = randomUUID();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  tokens.set(token, {
    jobId: parsed.data.jobId,
    branchId,
    kind: parsed.data.kind,
    expiresAt,
  });
  res.status(201).json({ token, expiresAt });
});

const scanBody = z.object({
  token: z.string().min(1),
  latitude: z.coerce.number().finite().min(-90).max(90).optional(),
  longitude: z.coerce.number().finite().min(-180).max(180).optional(),
  accuracy: z.coerce.number().finite().positive().max(1000).optional(),
});

function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const radius = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Worker redeems a scanned QR token. The recorded worker name is taken from the
 * authenticated session — never trusted from the body — so a scan cannot be
 * attributed to someone else.
 *
 * A worker may not scan the same event kind (masuk/pulang) more than once for
 * the same job on the same calendar day. Duplicates return HTTP 409.
 */
router.post("/attendance/scan", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "pekerja") {
    res.status(403).json({ error: "Hanya pekerja yang dapat melakukan presensi." });
    return;
  }
  const parsed = scanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  sweepExpired();
  const rec = tokens.get(parsed.data.token);
  if (!rec) {
    res.status(410).json({ error: "QR tidak valid atau sudah kadaluarsa." });
    return;
  }
  if (rec.processing) {
    res.status(409).json({ error: "QR sedang diproses. Coba lagi sebentar." });
    return;
  }
  rec.processing = true;

  // A worker can only record attendance after this employer has accepted their
  // latest application for the job.
  const [application] = await db
    .select({ status: applicationsTable.status })
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.jobId, rec.jobId),
        eq(applicationsTable.workerId, user.id),
      ),
    )
    .orderBy(desc(applicationsTable.createdAt))
    .limit(1);
  if (!application || application.status !== "diterima") {
    rec.processing = false;
    res.status(403).json({ error: "Presensi hanya tersedia untuk pekerja yang lamarannya diterima." });
    return;
  }

  if (rec.branchId !== null) {
    const [branch] = await db
      .select()
      .from(companyBranchesTable)
      .where(
        and(
          eq(companyBranchesTable.id, rec.branchId),
          eq(companyBranchesTable.active, true),
        ),
      )
      .limit(1);
    if (!branch) {
      tokens.delete(parsed.data.token);
      res.status(410).json({ error: "Cabang QR sudah tidak aktif." });
      return;
    }
    const { latitude, longitude, accuracy } = parsed.data;
    if (latitude === undefined || longitude === undefined || accuracy === undefined) {
      rec.processing = false;
      res.status(400).json({ error: "Lokasi GPS wajib diizinkan untuk presensi cabang." });
      return;
    }
    if (accuracy > 100) {
      rec.processing = false;
      res.status(422).json({ error: "Akurasi GPS terlalu rendah. Coba lagi di area terbuka." });
      return;
    }
    const distance = distanceMeters(
      latitude,
      longitude,
      branch.latitude,
      branch.longitude,
    );
    if (distance > branch.radiusMeters) {
      rec.processing = false;
      res.status(403).json({
        error: `Anda berada di luar radius presensi cabang (${Math.round(distance)} m dari lokasi).`,
      });
      return;
    }
  }

  const scanDate = jakartaDateString();

  // Duplicate-scan guard: one masuk and one pulang per worker per job per day.
  const [existing] = await db
    .select({ id: attendanceTable.id })
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.jobId, rec.jobId),
        eq(attendanceTable.workerId, user.id),
        eq(attendanceTable.kind, rec.kind),
        eq(attendanceTable.scanDate, scanDate),
      ),
    );
  if (existing) {
    tokens.delete(parsed.data.token);
    res.status(409).json({
      error:
        rec.kind === "masuk"
          ? "Anda sudah melakukan presensi masuk hari ini untuk pekerjaan ini."
          : "Anda sudah melakukan presensi pulang hari ini untuk pekerjaan ini.",
    });
    return;
  }

  const [row] = await db
    .insert(attendanceTable)
    .values({
      jobId: rec.jobId,
      branchId: rec.branchId,
      workerId: user.id,
      workerName: user.name,
      kind: rec.kind,
      scanDate,
    })
    .onConflictDoNothing()
    .returning();

  // The token is consumed only once the attendance row is safely committed.
  tokens.delete(parsed.data.token);
  if (!row) {
    res.status(409).json({
      error:
        rec.kind === "masuk"
          ? "Anda sudah melakukan presensi masuk hari ini untuk pekerjaan ini."
          : "Anda sudah melakukan presensi pulang hari ini untuk pekerjaan ini.",
    });
    return;
  }
  broadcastAttendance(row);
  res.status(201).json(row);
});

const statusQuery = z.object({
  jobId: z.coerce.number(),
});

/**
 * Worker checks their own attendance status for today.
 * Returns { scannedIn: boolean } — true when a "masuk" record already exists
 * for the requesting worker + job + today's Jakarta date.
 */
router.get("/attendance/status", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = statusQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scanDate = jakartaDateString();
  const [existing] = await db
    .select({ id: attendanceTable.id })
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.jobId, parsed.data.jobId),
        eq(attendanceTable.workerId, user.id),
        eq(attendanceTable.kind, "masuk"),
        eq(attendanceTable.scanDate, scanDate),
      ),
    );

  res.setHeader("Cache-Control", "no-store");
  res.json({ scannedIn: !!existing });
});

export default router;
