import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, attendanceTable, gigsTable } from "@workspace/db";
import { broadcastAttendance } from "../lib/realtime";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";

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
  kind: "masuk" | "pulang";
  expiresAt: number;
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
});

/**
 * Employer mints a QR token. Identity comes from the session cookie (never the
 * body); the caller must be the employer that posted the job.
 */
router.post("/attendance/token", async (req, res): Promise<void> => {
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

  sweepExpired();
  const token = randomUUID();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  tokens.set(token, { jobId: parsed.data.jobId, kind: parsed.data.kind, expiresAt });
  res.status(201).json({ token, expiresAt });
});

const scanBody = z.object({
  token: z.string().min(1),
});

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
  tokens.delete(parsed.data.token); // single-use

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
      workerId: user.id,
      workerName: user.name,
      kind: rec.kind,
      scanDate,
    })
    .returning();

  broadcastAttendance(row);
  res.status(201).json(row);
});

export default router;
