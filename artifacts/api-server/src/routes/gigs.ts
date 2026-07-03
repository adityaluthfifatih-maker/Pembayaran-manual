import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { z } from "zod/v4";
import { db, gigsTable, insertGigSchema } from "@workspace/db";
import { broadcastGig } from "../lib/realtime";

const router: IRouter = Router();

// The client sends dates as ISO strings over JSON; coerce them back to Date.
// jobCategory and feeRate are explicitly included so callers know they are
// accepted and persisted — they drive the tiered employer-borne fee displayed
// in history and payslip screens (umum=3%, terampil=5%, profesional=8%).
const createGigBody = insertGigSchema.extend({
  postedAt: z.coerce.date().optional(),
  jobDate: z.coerce.date().nullish(),
  jobCategory: z.string().nullish(),
  feeRate: z.number().nullish(),
});

router.get("/gigs", async (_req, res): Promise<void> => {
  const rows = await db.select().from(gigsTable).orderBy(desc(gigsTable.postedAt));
  res.json(rows);
});

router.post("/gigs", async (req, res): Promise<void> => {
  const parsed = createGigBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid gig body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Upsert by client-provided id so re-broadcasting a gig (e.g. escrow locked
  // after posting) replaces the row instead of failing on the primary key.
  // The conflict-update set explicitly carries jobCategory and feeRate so that
  // an escrow-lock re-broadcast never overwrites a categorised gig with nulls.
  const [gig] = await db
    .insert(gigsTable)
    .values(parsed.data)
    .onConflictDoUpdate({
      target: gigsTable.id,
      set: {
        ...parsed.data,
        jobCategory: parsed.data.jobCategory ?? undefined,
        feeRate: parsed.data.feeRate ?? undefined,
      },
    })
    .returning();

  broadcastGig(gig);
  res.status(201).json(gig);
});

export default router;
