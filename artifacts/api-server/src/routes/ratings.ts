import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db, ratingsTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";

const router: IRouter = Router();

/**
 * Persist a post-shift rating. The frontend rating modal speaks in
 * `stars`/`comment`; the store normalizes to the `score`/`note` columns. The
 * rater identity is taken from the session (never the body) so counts in the
 * admin control plane are trustworthy.
 */
const createBody = z.object({
  targetName: z.string().min(1),
  stars: z.coerce.number().int().min(1).max(5),
  comment: z.string().optional(),
  raterType: z.enum(["company", "worker"]),
  jobId: z.coerce.number().nullish(),
});

router.post("/ratings", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { targetName, stars, comment, raterType, jobId } = parsed.data;
  const [row] = await db
    .insert(ratingsTable)
    .values({
      raterId: user.id,
      raterType,
      targetName,
      score: stars,
      note: comment?.trim() || "",
      jobId: jobId ?? null,
    })
    .returning();

  res.status(201).json(row);
});

export default router;
