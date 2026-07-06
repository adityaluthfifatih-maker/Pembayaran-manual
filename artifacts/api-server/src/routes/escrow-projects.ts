import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  escrowProjectsTable,
  escrowMilestonesTable,
  usersTable,
} from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import {
  createInvoice,
  simulateInvoicePayment,
  createDisbursement,
  resolveBankCode,
  isXenditSandboxKey,
  XenditError,
} from "../lib/xendit";

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

// ── Step 1: Employer locks the project → Xendit Invoice generated ────

/**
 * Employer "mengunci" the project: a Xendit Invoice (hosted VA/e-wallet/QRIS
 * checkout page, sandbox mode) is generated for the full `totalAmount`. The
 * project moves to `pending_payment` — money has NOT reached escrow yet,
 * that only happens once the webhook confirms payment (see below).
 */
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

  const externalId = `escrow-project-${project.id}-${Date.now()}`;

  let invoice;
  try {
    invoice = await createInvoice({
      externalId,
      amount: project.totalAmount,
      payerEmail: user.email,
      description: `Escrow Rekhastha — ${project.title}`,
    });
  } catch (err) {
    if (err instanceof XenditError) {
      res.status(502).json({ error: `Xendit: ${err.message}` });
      return;
    }
    throw err;
  }

  const [updated] = await db
    .update(escrowProjectsTable)
    .set({
      status: "pending_payment",
      xenditInvoiceId: invoice.id,
      xenditExternalId: externalId,
      xenditInvoiceUrl: invoice.invoice_url,
    })
    .where(eq(escrowProjectsTable.id, id))
    .returning();

  req.log.info(
    { projectId: id, xenditInvoiceId: invoice.id },
    "Escrow project locked — Xendit invoice generated",
  );
  res.json(updated);
});

/**
 * Sandbox convenience endpoint: triggers Xendit's own `simulate_payment` API
 * on the TEST-mode invoice, which causes Xendit to actually mark the invoice
 * PAID and fire the real webhook below — so this exercises the exact same
 * code path a genuine payment would. Xendit rejects this call outright on a
 * live-mode invoice, so it can never simulate a real transfer.
 */
router.post("/escrow-projects/:id/simulate-paid", async (req, res): Promise<void> => {
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
  if (!isXenditSandboxKey()) {
    res.status(403).json({ error: "Simulasi pembayaran hanya tersedia dalam mode Sandbox Xendit." });
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
  if (project.status !== "pending_payment" || !project.xenditInvoiceId) {
    res.status(409).json({ error: "Proyek belum memiliki invoice yang menunggu pembayaran." });
    return;
  }

  try {
    await simulateInvoicePayment(project.xenditInvoiceId, project.totalAmount);
  } catch (err) {
    if (err instanceof XenditError) {
      res.status(502).json({ error: `Xendit: ${err.message}` });
      return;
    }
    throw err;
  }

  req.log.info({ projectId: id }, "Xendit sandbox simulate_payment triggered");
  res.json({ ok: true, message: "Simulasi pembayaran dikirim ke Xendit — menunggu webhook konfirmasi." });
});

// ── Step 2: Xendit webhook → project funded ───────────────────────────

const invoiceWebhookBody = z.object({
  id: z.string(),
  external_id: z.string(),
  status: z.string(),
});

/**
 * Xendit calls this back when an invoice's status changes. We verify the
 * `x-callback-token` header against our own `XENDIT_CALLBACK_TOKEN` secret
 * (configured to match the token shown in the Xendit dashboard) before
 * trusting the payload — this is the only place that flips a project to
 * `funded`, i.e. the only place that says "money is now in escrow".
 */
router.post("/webhooks/xendit/invoice", async (req, res): Promise<void> => {
  const token = req.header("x-callback-token");
  const expected = process.env["XENDIT_CALLBACK_TOKEN"];
  if (!expected || token !== expected) {
    res.status(401).json({ error: "Invalid callback token." });
    return;
  }

  const parsed = invoiceWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed webhook payload." });
    return;
  }

  if (parsed.data.status !== "PAID" && parsed.data.status !== "SETTLED") {
    res.json({ ok: true, ignored: true });
    return;
  }

  const [project] = await db
    .select()
    .from(escrowProjectsTable)
    .where(eq(escrowProjectsTable.xenditExternalId, parsed.data.external_id));
  if (!project) {
    req.log.warn({ externalId: parsed.data.external_id }, "Xendit webhook: no matching project");
    res.json({ ok: true, ignored: true });
    return;
  }
  if (project.status !== "pending_payment") {
    res.json({ ok: true, ignored: true });
    return;
  }

  await db
    .update(escrowProjectsTable)
    .set({ status: "funded", fundedAt: new Date() })
    .where(eq(escrowProjectsTable.id, project.id));

  req.log.info({ projectId: project.id }, "Escrow project FUNDED via Xendit webhook");
  res.json({ ok: true });
});

// ── Step 3: Approve milestone → Xendit Disbursement to worker ────────

/**
 * Employer approves a milestone: the project must already be `funded`, and
 * this milestone must still be `pending`. A Xendit Disbursement moves
 * `milestone.amount` out of the escrow holding balance directly to the
 * worker's registered bank account/e-wallet. Idempotent by construction —
 * once a milestone is `disbursed` it can never be approved again.
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

    const [worker] = await db
      .select({ profile: usersTable.profile, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, project.workerId));
    const profile = (worker?.profile ?? {}) as {
      namaBank?: string;
      nomorRekening?: string;
      namaRekening?: string;
    };
    if (!worker || !profile.namaBank || !profile.nomorRekening) {
      res.status(409).json({
        error: "Worker belum melengkapi data rekening bank/e-wallet — disbursement tidak dapat dijalankan.",
      });
      return;
    }

    const externalId = `escrow-milestone-${milestone.id}-${Date.now()}`;
    let disbursement;
    try {
      disbursement = await createDisbursement({
        externalId,
        amount: milestone.amount,
        bankCode: resolveBankCode(profile.namaBank),
        accountHolderName: profile.namaRekening || worker.name,
        accountNumber: profile.nomorRekening,
        description: `Milestone: ${milestone.title} — ${project.title}`,
      });
    } catch (err) {
      if (err instanceof XenditError) {
        await db
          .update(escrowMilestonesTable)
          .set({ status: "failed" })
          .where(eq(escrowMilestonesTable.id, milestone.id));
        res.status(502).json({ error: `Xendit: ${err.message}` });
        return;
      }
      throw err;
    }

    const [updatedMilestone] = await db
      .update(escrowMilestonesTable)
      .set({
        status: "disbursed",
        xenditDisbursementId: disbursement.id,
        disbursedAt: new Date(),
      })
      .where(eq(escrowMilestonesTable.id, milestone.id))
      .returning();

    const remaining = await db
      .select()
      .from(escrowMilestonesTable)
      .where(
        and(
          eq(escrowMilestonesTable.projectId, projectId),
          eq(escrowMilestonesTable.status, "pending"),
        ),
      );
    if (remaining.length === 0) {
      await db
        .update(escrowProjectsTable)
        .set({ status: "completed" })
        .where(eq(escrowProjectsTable.id, projectId));
    }

    req.log.info(
      { projectId, milestoneId, xenditDisbursementId: disbursement.id, amount: milestone.amount },
      "Milestone approved — disbursement sent to worker",
    );
    res.json({ milestone: updatedMilestone, projectCompleted: remaining.length === 0 });
  },
);

export default router;
