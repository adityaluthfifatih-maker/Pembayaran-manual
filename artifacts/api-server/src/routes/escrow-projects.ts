import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  escrowProjectsTable,
  escrowMilestonesTable,
  manualPaymentSettingsTable,
  manualPaymentsTable,
  walletEntriesTable,
} from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";

const router: IRouter = Router();

// ── Create project + milestones ──────────────────────────────────────

const createProjectBody = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  totalAmount: z.number().int().positive(),
  workerId: z.string().optional(),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1),
        percentage: z.number().positive(),
      }),
    )
    .min(1),
});

/** Employer creates a Proyek with its Milestone breakdown (percentages must sum to 100). */
router.post("/escrow-projects", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat membuat proyek." });
    return;
  }
  const parsed = createProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const totalPct = parsed.data.milestones.reduce((sum, m) => sum + m.percentage, 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    res.status(400).json({
      error: `Total persentase milestone harus 100% (saat ini ${totalPct}%).`,
    });
    return;
  }

  const project = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(escrowProjectsTable)
      .values({
        employerId: user.id,
        workerId: parsed.data.workerId,
        title: parsed.data.title,
        description: parsed.data.description,
        totalAmount: parsed.data.totalAmount,
        status: "draft",
      })
      .returning();
    if (!row) throw new Error("Gagal membuat proyek.");

    const milestoneRows = await tx
      .insert(escrowMilestonesTable)
      .values(
        parsed.data.milestones.map((m, index) => ({
          projectId: row.id,
          title: m.title,
          percentage: m.percentage,
          amount: Math.round((parsed.data.totalAmount * m.percentage) / 100),
          sortOrder: index,
        })),
      )
      .returning();

    return { ...row, milestones: milestoneRows };
  });

  req.log.info({ projectId: project.id }, "Escrow project created");
  res.status(201).json(project);
});

// ── List / detail ─────────────────────────────────────────────────────

/** Lists projects visible to the caller (as employer or assigned worker). */
router.get("/escrow-projects", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  const condition =
    user.role === "perusahaan"
      ? eq(escrowProjectsTable.employerId, user.id)
      : eq(escrowProjectsTable.workerId, user.id);

  const rows = await db.select().from(escrowProjectsTable).where(condition);
  res.json(rows);
});

async function loadProjectWithMilestones(id: number) {
  const [project] = await db
    .select()
    .from(escrowProjectsTable)
    .where(eq(escrowProjectsTable.id, id));
  if (!project) return null;
  const milestones = await db
    .select()
    .from(escrowMilestonesTable)
    .where(eq(escrowMilestonesTable.projectId, id))
    .orderBy(escrowMilestonesTable.sortOrder);
  return { ...project, milestones };
}

router.get("/escrow-projects/:id", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ error: "ID proyek tidak valid." });
    return;
  }
  const project = await loadProjectWithMilestones(id);
  if (!project || (project.employerId !== user.id && project.workerId !== user.id)) {
    res.status(404).json({ error: "Proyek tidak ditemukan." });
    return;
  }
  res.json(project);
});

// ── Manual project funding ──────────────────────────────────────────
router.post("/escrow-projects/:id/lock", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ error: "ID proyek tidak valid." });
    return;
  }

  const [project] = await db
    .select()
    .from(escrowProjectsTable)
    .where(eq(escrowProjectsTable.id, id));
  if (!project || project.employerId !== user.id) {
    res.status(404).json({ error: "Proyek tidak ditemukan." });
    return;
  }
  if (project.status !== "draft") {
    res.status(409).json({ error: `Proyek berstatus '${project.status}', tidak dapat dikunci ulang.` });
    return;
  }
  const [settings] = await db
    .select({ accountNumber: manualPaymentSettingsTable.accountNumber })
    .from(manualPaymentSettingsTable)
    .where(eq(manualPaymentSettingsTable.id, 1))
    .limit(1);
  if (!settings?.accountNumber) {
    res.status(409).json({ error: "Instruksi transfer belum diatur oleh admin." });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(escrowProjectsTable)
      .set({ status: "pending_payment" })
      .where(eq(escrowProjectsTable.id, id))
      .returning();
    const [payment] = await tx
      .insert(manualPaymentsTable)
      .values({
        payerId: user.id,
        targetType: "project_escrow",
        targetId: String(id),
        amount: project.totalAmount,
      })
      .returning();
    return { project: updated, payment };
  });
  req.log.info({ projectId: id, paymentId: result.payment.id }, "Project funding awaiting manual payment");
  res.json({ ...result.project, manualPaymentId: result.payment.id });
});

router.post("/escrow-projects/:id/simulate-paid", async (_req, res): Promise<void> => {
  res.status(410).json({ error: "Simulasi pembayaran dinonaktifkan. Pembayaran harus ditinjau admin." });
});

router.post("/webhooks/xendit/invoice", async (_req, res): Promise<void> => {
  res.status(410).json({ error: "Konfirmasi otomatis dinonaktifkan. Gunakan antrean verifikasi manual." });
});

// ── Step 3: Approve milestone → Xendit Disbursement to worker ────────

/**
 * Employer approves a milestone. The amount becomes an auditable wallet
 * credit; the worker must request a payout and an admin must record the bank
 * transfer before it is marked paid.
 */
router.post(
  "/escrow-projects/:id/milestones/:milestoneId/approve",
  async (req, res): Promise<void> => {
    const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
    if (!user) {
      res.status(401).json({ error: "Tidak terautentikasi." });
      return;
    }
    const projectId = Number(req.params.id);
    const milestoneId = Number(req.params.milestoneId);
    if (!projectId || !milestoneId || Number.isNaN(projectId) || Number.isNaN(milestoneId)) {
      res.status(400).json({ error: "ID tidak valid." });
      return;
    }

    const [project] = await db
      .select()
      .from(escrowProjectsTable)
      .where(eq(escrowProjectsTable.id, projectId));
    if (!project || project.employerId !== user.id) {
      res.status(404).json({ error: "Proyek tidak ditemukan." });
      return;
    }
    if (project.status !== "funded" && project.status !== "completed") {
      res.status(409).json({
        error: "Proyek belum 'Funded' — dana belum masuk escrow, milestone tidak dapat disetujui.",
      });
      return;
    }
    if (!project.workerId) {
      res.status(409).json({ error: "Proyek belum memiliki worker yang ditugaskan." });
      return;
    }

    const [milestone] = await db
      .select()
      .from(escrowMilestonesTable)
      .where(
        and(
          eq(escrowMilestonesTable.id, milestoneId),
          eq(escrowMilestonesTable.projectId, projectId),
        ),
      );
    if (!milestone) {
      res.status(404).json({ error: "Milestone tidak ditemukan." });
      return;
    }
    if (milestone.status !== "pending") {
      res.status(409).json({ error: `Milestone sudah berstatus '${milestone.status}'.` });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [lockedMilestone] = await tx
        .select()
        .from(escrowMilestonesTable)
        .where(
          and(
            eq(escrowMilestonesTable.id, milestoneId),
            eq(escrowMilestonesTable.projectId, projectId),
          ),
        )
        .for("update")
        .limit(1);
      if (!lockedMilestone || lockedMilestone.status !== "pending") {
        return { error: "Milestone sudah diproses." as const };
      }
      const [updatedMilestone] = await tx
        .update(escrowMilestonesTable)
        .set({ status: "approved" })
        .where(eq(escrowMilestonesTable.id, milestoneId))
        .returning();
      await tx
        .insert(walletEntriesTable)
        .values({
          workerId: project.workerId!,
          sourceType: "project_milestone",
          sourceId: String(milestoneId),
          amount: milestone.amount,
          description: `Milestone: ${milestone.title} — ${project.title}`,
        })
        .onConflictDoNothing();

      const remaining = await tx
        .select({ id: escrowMilestonesTable.id })
        .from(escrowMilestonesTable)
        .where(
          and(
            eq(escrowMilestonesTable.projectId, projectId),
            eq(escrowMilestonesTable.status, "pending"),
          ),
        );
      const projectCompleted = remaining.length === 0;
      if (projectCompleted) {
        await tx
          .update(escrowProjectsTable)
          .set({ status: "completed" })
          .where(eq(escrowProjectsTable.id, projectId));
      }
      return { milestone: updatedMilestone, projectCompleted };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    req.log.info(
      { projectId, milestoneId, workerId: project.workerId, amount: milestone.amount },
      "Milestone approved and credited to worker wallet",
    );
    res.json({ ...result, payoutStatus: "available_for_manual_withdrawal" });
  },
);

export default router;
