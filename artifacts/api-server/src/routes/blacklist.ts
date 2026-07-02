import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, blacklistTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";

const router: IRouter = Router();

function employerDisplayName(user: { name: string; profile: unknown }): string {
  const profile = (user.profile ?? {}) as Record<string, unknown>;
  const nama = profile["namaPerusahaan"];
  return typeof nama === "string" && nama ? nama : user.name;
}

/**
 * Blacklist a worker (employer action, fired from the rating modal). The
 * employer identity is derived from the session — never the body — so a caller
 * cannot forge blocks on behalf of another employer. Upserts so re-blocking is
 * idempotent.
 */
const createBody = z.object({
  workerName: z.string().min(1),
  jobId: z.coerce.number().nullish(),
});

router.post("/blacklist", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat memblokir pekerja." });
    return;
  }
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { workerName, jobId } = parsed.data;
  const employerName = employerDisplayName(user);

  const [row] = await db
    .insert(blacklistTable)
    .values({ employerId: user.id, employerName, workerName, jobId: jobId ?? null })
    .onConflictDoUpdate({
      target: [blacklistTable.employerId, blacklistTable.workerName],
      set: { employerName, jobId: jobId ?? null },
    })
    .returning();

  res.status(201).json(row);
});

/**
 * List blacklist rows scoped to the authenticated caller:
 *   • a worker sees which employer ids blocked THEM (by their own session name),
 *   • an employer sees who THEY blocked.
 * Callers can never enumerate other users' blacklist data.
 */
router.get("/blacklist", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  if (user.role === "perusahaan") {
    const rows = await db
      .select()
      .from(blacklistTable)
      .where(eq(blacklistTable.employerId, user.id));
    res.json(rows);
    return;
  }

  const rows = await db
    .select()
    .from(blacklistTable)
    .where(eq(blacklistTable.workerName, user.name));
  res.json(rows);
});

/** Remove a blacklist entry (employer un-blocks a worker). */
const deleteBody = z.object({
  workerName: z.string().min(1),
});

router.post("/blacklist/remove", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat mengubah daftar blokir." });
    return;
  }
  const parsed = deleteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db
    .delete(blacklistTable)
    .where(
      and(
        eq(blacklistTable.employerId, user.id),
        eq(blacklistTable.workerName, parsed.data.workerName),
      ),
    );
  res.status(204).end();
});

export default router;
