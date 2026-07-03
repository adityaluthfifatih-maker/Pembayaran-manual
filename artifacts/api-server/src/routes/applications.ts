import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, applicationsTable, gigsTable } from "@workspace/db";
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
 * The server looks up the gig's employer_id so subsequent GET/PATCH endpoints
 * can enforce row-level ownership without relying on client-supplied data.
 * The row is persisted and immediately fanned out over the WebSocket hub.
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
  if (user.role !== "pekerja") {
    res.status(403).json({ error: "Hanya pekerja yang dapat melamar pekerjaan." });
    return;
  }
  const parsed = applyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Resolve the employer_id from the gig row so we can scope GET/PATCH later.
  const [gig] = await db
    .select({ employerId: gigsTable.employerId })
    .from(gigsTable)
    .where(eq(gigsTable.id, parsed.data.jobId))
    .limit(1);
  const employerId = gig?.employerId ?? "";

  const [row] = await db
    .insert(applicationsTable)
    .values({ ...parsed.data, workerId: user.id, employerId })
    .returning();
  broadcastApplication(row, employerId);
  req.log.info(
    { applicationId: row.id, jobId: row.jobId, workerId: row.workerId },
    "New job application submitted",
  );
  res.status(201).json(row);
});

/**
 * Employer fetches their applications.
 *
 * Requires an active session with role "perusahaan". Returns only rows where
 * `employer_id` matches the authenticated user — no other employer's
 * applications are ever returned. An optional `?jobId=` narrows the result
 * further to a single gig.
 */
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
    .select()
    .from(applicationsTable)
    .where(conditions)
    .orderBy(desc(applicationsTable.createdAt));
  res.json(rows);
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

  broadcastApplicationStatus(row.id, row.status, row.jobId);
  req.log.info(
    { applicationId: row.id, status: row.status },
    "Application status updated",
  );
  res.json(row);
});

export default router;
