import { and, eq, asc } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { companyBranchesTable, db } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";

const router: IRouter = Router();

const branchBody = z.object({
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().min(3).max(500),
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(25).max(1000).default(150),
});

async function getCompany(req: Request, res: Response) {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return null;
  }
  if (user.role !== "perusahaan") {
    res.status(403).json({ error: "Fitur cabang hanya tersedia untuk perusahaan." });
    return null;
  }
  return user;
}

router.get("/company/branches", async (req, res): Promise<void> => {
  const company = await getCompany(req, res);
  if (!company) return;

  const branches = await db
    .select()
    .from(companyBranchesTable)
    .where(
      and(
        eq(companyBranchesTable.companyId, company.id),
        eq(companyBranchesTable.active, true),
      ),
    )
    .orderBy(asc(companyBranchesTable.name));
  res.setHeader("Cache-Control", "no-store");
  res.json(branches);
});

router.post("/company/branches", async (req, res): Promise<void> => {
  const company = await getCompany(req, res);
  if (!company) return;

  const parsed = branchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [branch] = await db
    .insert(companyBranchesTable)
    .values({ ...parsed.data, companyId: company.id })
    .onConflictDoNothing()
    .returning();

  if (!branch) {
    res.status(409).json({ error: "Nama cabang tersebut sudah digunakan." });
    return;
  }
  res.status(201).json(branch);
});

router.delete("/company/branches/:id", async (req, res): Promise<void> => {
  const company = await getCompany(req, res);
  if (!company) return;

  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "ID cabang tidak valid." });
    return;
  }

  // Keep old attendance history intact: "delete" is an archive, not a hard delete.
  const [branch] = await db
    .update(companyBranchesTable)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(companyBranchesTable.id, id),
        eq(companyBranchesTable.companyId, company.id),
        eq(companyBranchesTable.active, true),
      ),
    )
    .returning();

  if (!branch) {
    res.status(404).json({ error: "Cabang tidak ditemukan." });
    return;
  }
  res.json({ ok: true, branch });
});

export default router;