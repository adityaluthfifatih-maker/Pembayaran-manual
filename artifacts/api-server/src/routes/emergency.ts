import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, emergencyIncidentsTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { ADMIN_COOKIE, isAdminSession } from "../lib/admin";
import {
  broadcastEmergency,
  broadcastEmergencyResolved,
} from "../lib/realtime";

const router: IRouter = Router();

/**
 * Worker silent SOS.
 *
 * A worker triggers "🚨 LAPOR DARURAT (SOS)" from an active job. We NEVER place
 * a phone call from the worker device — instead the incident is persisted in the
 * `emergency_active` state and instantly fanned out over the realtime hub so the
 * Admin Command Center raises its full-screen alarm and acts as the dispatcher.
 */
const reportBody = z.object({
  jobId: z.coerce.number().optional(),
  workerPhone: z.string().optional(),
  jobTitle: z.string().optional(),
  employerName: z.string().optional(),
  projectAddress: z.string().optional(),
  boronganType: z.enum(["remote", "onsite"]).optional(),
});

router.post("/emergency", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = reportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(emergencyIncidentsTable)
    .values({
      jobId: parsed.data.jobId ?? null,
      workerName: user.name,
      workerPhone: parsed.data.workerPhone ?? "",
      jobTitle: parsed.data.jobTitle ?? "",
      employerName: parsed.data.employerName ?? "",
      projectAddress: parsed.data.projectAddress ?? "",
      boronganType: parsed.data.boronganType ?? null,
    })
    .returning();

  broadcastEmergency(row);
  req.log.warn(
    { incidentId: row.id, workerName: row.workerName },
    "Worker SOS emergency reported",
  );
  res.status(201).json(row);
});

/** Admin: list every still-active SOS incident (hydrates the alarm on load). */
router.get("/emergency", async (req, res): Promise<void> => {
  if (!(await isAdminSession(req.cookies?.[ADMIN_COOKIE]))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const rows = await db
    .select()
    .from(emergencyIncidentsTable)
    .where(eq(emergencyIncidentsTable.state, "emergency_active"))
    .orderBy(desc(emergencyIncidentsTable.createdAt));
  res.json(rows);
});

/** Admin: silence + close an SOS incident after dispatching authorities. */
const resolveBody = z.object({ id: z.coerce.number() });

router.post("/emergency/resolve", async (req, res): Promise<void> => {
  if (!(await isAdminSession(req.cookies?.[ADMIN_COOKIE]))) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const parsed = resolveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "id tidak valid." });
    return;
  }

  const [row] = await db
    .update(emergencyIncidentsTable)
    .set({ state: "resolved", resolvedAt: new Date() })
    .where(eq(emergencyIncidentsTable.id, parsed.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Insiden tidak ditemukan." });
    return;
  }

  broadcastEmergencyResolved(row.id);
  req.log.info({ incidentId: row.id }, "Admin resolved SOS emergency");
  res.json({ ok: true });
});

export default router;
