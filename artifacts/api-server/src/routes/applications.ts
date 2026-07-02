import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { db, applicationsTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import {
  broadcastApplication,
  broadcastApplicationStatus,
} from "../lib/realtime";

const router: IRouter = Router();

/**
 * Worker submits an application for a gig.
 *
 * Sensitive fields (NIK, NPWP, rekening) arrive already-masked — masking runs
 * on the worker's device in `handleApply` before the payload is sent here.
 * The row is persisted and immediately fanned out over the WebSocket hub so
 * the employer's device receives it without polling.
 */
const applyBody = z.object({
  jobId: z.coerce.number(),
  jobTitle: z.string().default(""),
  workerName: z.string().default(""),
  workerNikMasked: z.string().default(""),
  workerNpwpMasked: z.string().default(""),
  hasNpwp: z.boolean().default(false),
  bank: z.string().default(""),
  rekening: z.string().default(""),
});

router.post("/applications", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = applyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(applicationsTable)
    .values({ ...parsed.data, workerId: user.id })
    .returning();
  broadcastApplication(row);
  req.log.info(
    { applicationId: row.id, jobId: row.jobId, workerId: row.workerId },
    "New job application submitted",
  );
  res.status(201).json(row);
});

/**
 * Employer fetches all applications for one of their posted gigs.
 * Requires an authenticated session (employer or worker — the jobId is the
 * natural access-scoping key since only the employer knows their own job IDs).
 */
router.get("/applications", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const jobId = Number(req.query.jobId);
  if (!jobId || isNaN(jobId)) {
    res.status(400).json({ error: "Parameter jobId tidak valid." });
    return;
  }
  const rows = await db
    .select()
    .from(applicationsTable)
    .where(eq(applicationsTable.jobId, jobId))
    .orderBy(desc(applicationsTable.createdAt));
  res.json(rows);
});

/**
 * Employer updates the status of an application (ditinjau / diterima / ditolak).
 * The change is persisted and immediately broadcast so the worker's device can
 * update its own notification without polling.
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
  const [row] = await db
    .update(applicationsTable)
    .set({ status: parsed.data.status })
    .where(eq(applicationsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Lamaran tidak ditemukan." });
    return;
  }
  broadcastApplicationStatus(row.id, row.status, row.jobId);
  req.log.info(
    { applicationId: row.id, status: row.status },
    "Application status updated",
  );
  res.json(row);
});

export default router;
