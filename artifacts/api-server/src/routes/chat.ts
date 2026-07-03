import { Router, type Request, type Response } from "express";
import { eq, asc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, chatMessagesTable, gigsTable, applicationsTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { broadcastChatMessage } from "../lib/realtime";

const router = Router();

/**
 * Verify the caller is a participant in the conversation (jobId, workerId).
 *
 * Returns `{ user, gig }` on success; sends the HTTP error and returns null
 * so the route handler can exit immediately.
 *
 * Access rules:
 *  - Employer: `gig.employerId === user.id`
 *  - Worker:   `user.role === "pekerja"` AND `user.id === workerId`
 *
 * 404 is returned for any failure (not 403) to avoid leaking job existence.
 */
async function resolveParticipant(
  req: Request,
  res: Response,
  jobId: number,
  workerId: string,
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>; gig: { employerId: string | null } } | null> {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return null;
  }

  const [gig] = await db
    .select({ employerId: gigsTable.employerId })
    .from(gigsTable)
    .where(eq(gigsTable.id, jobId))
    .limit(1);

  if (!gig) {
    res.status(404).json({ error: "Tidak ditemukan." });
    return null;
  }

  const isEmployer = gig.employerId !== null && gig.employerId === user.id;
  const isWorker = user.role === "pekerja" && user.id === workerId;

  if (!isEmployer && !isWorker) {
    res.status(404).json({ error: "Tidak ditemukan." });
    return null;
  }

  // Workers may only open a chat thread once the employer has accepted their
  // application (status = "diterima"). Without this check any worker who knows
  // a jobId/workerId pair could read or write messages before being accepted.
  if (isWorker) {
    const [app] = await db
      .select({ status: applicationsTable.status })
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.jobId, jobId),
          eq(applicationsTable.workerId, workerId),
        ),
      )
      .limit(1);
    if (!app || app.status !== "diterima") {
      res.status(403).json({ error: "Chat hanya tersedia setelah lamaran Anda diterima oleh pemberi kerja." });
      return null;
    }
  }

  return { user, gig };
}

/**
 * Fetch the chat history for a specific (jobId, workerId) conversation thread.
 *
 * Access: employer who owns the gig, or the exact worker identified by workerId.
 * Messages are returned oldest-first for chronological rendering.
 */
router.get("/chat/:jobId/:workerId", async (req: Request, res: Response): Promise<void> => {
  const jobId = Number(req.params.jobId);
  const workerId = String(req.params.workerId ?? "");

  if (!jobId || isNaN(jobId) || !workerId) {
    res.status(400).json({ error: "Parameter tidak valid." });
    return;
  }

  const ctx = await resolveParticipant(req, res, jobId, workerId);
  if (!ctx) return;

  const rows = await db
    .select()
    .from(chatMessagesTable)
    .where(
      and(
        eq(chatMessagesTable.jobId, jobId),
        eq(chatMessagesTable.workerId, workerId),
      ),
    )
    .orderBy(asc(chatMessagesTable.sentAt));

  res.json(rows);
});

const messageBody = z.object({
  text: z.string().min(1).max(2000),
});

/**
 * Post a new message to a specific (jobId, workerId) conversation thread.
 *
 * Access: employer who owns the gig, or the exact worker identified by workerId.
 * The saved row is broadcast via WebSocket only to the employer and the worker —
 * no other connected client receives the frame.
 */
router.post("/chat/:jobId/:workerId", async (req: Request, res: Response): Promise<void> => {
  const jobId = Number(req.params.jobId);
  const workerId = String(req.params.workerId ?? "");

  if (!jobId || isNaN(jobId) || !workerId) {
    res.status(400).json({ error: "Parameter tidak valid." });
    return;
  }

  const ctx = await resolveParticipant(req, res, jobId, workerId);
  if (!ctx) return;

  const parsed = messageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pesan tidak valid." });
    return;
  }

  const [row] = await db
    .insert(chatMessagesTable)
    .values({
      jobId,
      workerId,
      senderId: ctx.user.id,
      senderRole: ctx.user.role,
      text: parsed.data.text,
    })
    .returning();

  broadcastChatMessage(row, ctx.gig.employerId ?? "", workerId);

  req.log.info(
    { chatMessageId: row.id, jobId: row.jobId, senderId: row.senderId },
    "Chat message sent",
  );
  res.status(201).json(row);
});

export default router;
