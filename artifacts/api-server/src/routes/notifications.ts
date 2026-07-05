import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";

const router: IRouter = Router();

/**
 * Simple polling-based notifications list for the logged-in user, newest
 * first. No WebSocket involved — the dashboard bell is expected to call this
 * on an interval.
 */
router.get("/notifications", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, user.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(rows);
});

/** Unread count only — cheap poll target for the bell badge. */
router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, user.id),
        eq(notificationsTable.isRead, false),
      ),
    );

  res.json({ count: row?.count ?? 0 });
});

/** Mark a single notification as read (e.g. on dropdown-item click). */
router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID notifikasi tidak valid." });
    return;
  }

  const [row] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(
      and(eq(notificationsTable.id, id), eq(notificationsTable.userId, user.id)),
    )
    .returning();

  if (!row) {
    res.status(404).json({ error: "Notifikasi tidak ditemukan." });
    return;
  }

  res.json(row);
});

/** Mark every notification as read (e.g. "tandai semua dibaca" button). */
router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(
      and(
        eq(notificationsTable.userId, user.id),
        eq(notificationsTable.isRead, false),
      ),
    );

  res.json({ ok: true });
});

export default router;
