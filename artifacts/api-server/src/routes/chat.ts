import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, chatMessagesTable, gigsTable, applicationsTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { broadcastChatMessage } from "../lib/realtime";

const router: IRouter = Router();

/**
 * Verify that a user is a participant in the given gig's conversation.
 *
 * Returns the gig row if access is granted, null otherwise.
 * - Employers are authorized if `gig.employerId` matches the user's id.
 * - Workers are authorized if they have at least one application row for that
 *   gig (any status — an applicant may legitimately chat before being hired).
 *
 * We return null (→ 404) instead of 403 to avoid leaking whether a job exists.
 */
async function assertChatParticipant(
  jobId: number,
  userId: string,
  userRole: string,
): Promise<boolean> {
  const [gig] = await db
    .select({ employerId: gigsTable.employerId })
    .from(gigsTable)
    .where(eq(gigsTable.id, jobId))
    .limit(1);

  if (!gig) return false; // job doesn't exist

  // Employer check
  if (gig.employerId === userId) return true;

  // Worker check — must have applied to this gig
  if (userRole === "pekerja") {
    const [app] = await db
      .select({ id: applicationsTable.id })
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.jobId, jobId),
          eq(applicationsTable.workerId, userId),
        ),
      )
      .limit(1);
    return !!app;
  }

  return false;
}

/**
 * Fetch all chat messages for a gig.
 *
 * Caller must be the gig's employer OR a worker who has applied to the gig.
 * Messages are returned oldest-first for chronological rendering.
 */
router.get("/chat/:jobId", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const jobId = Number(req.params.jobId);
  if (!jobId || isNaN(jobId)) {
    res.status(400).json({ error: "Job ID tidak valid." });
    return;
  }
  const authorized = await assertChatParticipant(jobId, user.id, user.role);
  if (!authorized) {
    res.status(404).json({ error: "Tidak ditemukan." });
    return;
  }
  const rows = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.jobId, jobId))
    .orderBy(asc(chatMessagesTable.sentAt));
  res.json(rows);
});

const messageBody = z.object({
  text: z.string().min(1).max(2000),
});

/**
 * Post a new chat message for a gig.
 *
 * Caller must be the gig's employer OR a worker who has applied to the gig.
 * The sender's identity is taken from the session cookie — the client does not
 * supply `senderId` or `senderRole`. The saved row is broadcast over the
 * WebSocket hub so the other party sees it instantly without polling.
 */
router.post("/chat/:jobId", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const jobId = Number(req.params.jobId);
  if (!jobId || isNaN(jobId)) {
    res.status(400).json({ error: "Job ID tidak valid." });
    return;
  }
  const authorized = await assertChatParticipant(jobId, user.id, user.role);
  if (!authorized) {
    res.status(404).json({ error: "Tidak ditemukan." });
    return;
  }
  const parsed = messageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pesan tidak valid." });
    return;
  }
  const [row] = await db
    .insert(chatMessagesTable)
    .values({
      jobId,
      senderId: user.id,
      senderRole: user.role,
      text: parsed.data.text,
    })
    .returning();
  broadcastChatMessage(row);
  req.log.info(
    { chatMessageId: row.id, jobId: row.jobId, senderId: row.senderId },
    "Chat message sent",
  );
  res.status(201).json(row);
});

export default router;
