import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { db, chatMessagesTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { broadcastChatMessage } from "../lib/realtime";

const router: IRouter = Router();

/**
 * Fetch all chat messages for a gig.
 *
 * Requires an active session (any role). Messages are returned oldest-first so
 * the chat modal can render them in chronological order. Access is intentionally
 * open to both the worker and the employer for that job — row-level ownership
 * is not enforced here because the jobId is the natural compartment.
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
 * Requires an active session (worker or employer). The sender's identity is
 * taken from the session — the client does not supply `senderId` or `senderRole`.
 * The saved row is broadcast over the WebSocket hub so the other party sees it
 * instantly without polling.
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
