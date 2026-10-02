import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  adminLogsTable,
  applicationsTable,
  companySubscriptionsTable,
  escrowProjectsTable,
  gigsTable,
  instantOrdersTable,
  manualPaymentSettingsTable,
  manualPaymentsTable,
  manualPayoutsTable,
  subscriptionOrdersTable,
  subscriptionPlansTable,
  usersTable,
  walletEntriesTable,
} from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { ADMIN_COOKIE, adminSessionId } from "../lib/admin";
import {
  broadcastApplicationStatus,
  broadcastGig,
  broadcastInstantActivated,
} from "../lib/realtime";

const router: IRouter = Router();

function getAdminId(req: Request): Promise<string | null> {
  return adminSessionId(req.cookies?.[ADMIN_COOKIE]);
}

function summarizeWallet(
  entries: { amount: number }[],
  payouts: { amount: number; status: string }[],
) {
  const credited = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const reserved = payouts
    .filter((payout) => payout.status === "pending" || payout.status === "paid")
    .reduce((sum, payout) => sum + payout.amount, 0);
  return Math.max(0, credited - reserved);
}

router.get("/manual-payments/mine", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const [settings] = await db
    .select()
    .from(manualPaymentSettingsTable)
    .where(eq(manualPaymentSettingsTable.id, 1))
    .limit(1);
  const payments = await db
    .select()
    .from(manualPaymentsTable)
    .where(eq(manualPaymentsTable.payerId, user.id))
    .orderBy(desc(manualPaymentsTable.createdAt));
  res.json({
    payments,
    instructions: settings
      ? {
          bankName: settings.bankName,
          accountName: settings.accountName,
          accountNumber: settings.accountNumber,
          instructions: settings.instructions,
        }
      : null,
  });
});

const submitTransferBody = z.object({
  transferReference: z.string().trim().min(3).max(120),
  proofNote: z.string().trim().max(500).optional().default(""),
});

router.post("/manual-payments/:id/submit", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya akun perusahaan yang dapat mengirim bukti pembayaran." });
    return;
  }
  const id = Number(req.params.id);
  const parsed = submitTransferBody.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "ID pembayaran tidak valid." : parsed.error.message });
    return;
  }

  const [payment] = await db
    .update(manualPaymentsTable)
    .set({
      status: "under_review",
      transferReference: parsed.data.transferReference,
      proofNote: parsed.data.proofNote,
      submittedAt: new Date(),
      adminNote: null,
      reviewedBy: null,
      reviewedAt: null,
    })
    .where(
      and(
        eq(manualPaymentsTable.id, id),
        eq(manualPaymentsTable.payerId, user.id),
        inArray(manualPaymentsTable.status, ["awaiting_payment", "rejected"]),
      ),
    )
    .returning();

  if (!payment) {
    res.status(409).json({ error: "Tagihan tidak ditemukan atau sudah sedang ditinjau." });
    return;
  }
  req.log.info({ paymentId: payment.id, payerId: user.id }, "Manual payment evidence submitted");
  res.json(payment);
});

router.get("/wallet/mine", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "pekerja") {
    res.status(403).json({ error: "Hanya pekerja yang dapat melihat e-wallet." });
    return;
  }
  const [entries, payouts] = await Promise.all([
    db
      .select()
      .from(walletEntriesTable)
      .where(eq(walletEntriesTable.workerId, user.id))
      .orderBy(desc(walletEntriesTable.createdAt)),
    db
      .select()
      .from(manualPayoutsTable)
      .where(eq(manualPayoutsTable.workerId, user.id))
      .orderBy(desc(manualPayoutsTable.createdAt)),
  ]);
  res.json({
    balance: summarizeWallet(entries, payouts),
    entries,
    payouts: payouts.map(({ accountNumber: _accountNumber, ...payout }) => payout),
  });
});

router.post("/wallet/withdrawals", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "pekerja") {
    res.status(403).json({ error: "Hanya pekerja yang dapat meminta pencairan." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [account] = await tx
      .select({ profile: usersTable.profile })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .for("update")
      .limit(1);
    const profile = (account?.profile ?? {}) as Record<string, unknown>;
    const bankName = typeof profile.namaBank === "string" ? profile.namaBank.trim() : "";
    const accountName = typeof profile.namaRekening === "string" ? profile.namaRekening.trim() : "";
    const accountNumber =
      typeof profile.nomorRekening === "string" ? profile.nomorRekening.trim() : "";
    if (!bankName || !accountName || accountNumber.length < 6) {
      return { error: "Lengkapi nama bank, nama pemilik, dan nomor rekening pada profil sebelum meminta pencairan." };
    }

    const entries = await tx
      .select({ amount: walletEntriesTable.amount })
      .from(walletEntriesTable)
      .where(eq(walletEntriesTable.workerId, user.id));
    const payouts = await tx
      .select({ amount: manualPayoutsTable.amount, status: manualPayoutsTable.status })
      .from(manualPayoutsTable)
      .where(eq(manualPayoutsTable.workerId, user.id));
    if (payouts.some((payout) => payout.status === "pending")) {
      return { error: "Masih ada pencairan yang menunggu transfer admin." };
    }
    const amount = summarizeWallet(entries, payouts);
    if (amount <= 0) return { error: "Saldo tersedia belum mencukupi untuk dicairkan." };

    const [payout] = await tx
      .insert(manualPayoutsTable)
      .values({
        workerId: user.id,
        amount,
        bankName,
        accountName,
        accountNumber,
        status: "pending",
      })
      .returning();
    return { payout, balance: 0 };
  });

  if ("error" in result) {
    res.status(409).json({ error: result.error });
    return;
  }
  req.log.info(
    { payoutId: result.payout.id, workerId: user.id, amount: result.payout.amount },
    "Manual worker payout requested",
  );
  res.status(201).json({
    payout: { ...result.payout, accountNumber: undefined },
    balance: result.balance,
  });
});

const releaseWageBody = z.object({ workerId: z.string().trim().min(1).max(120) });

router.post("/gigs/:jobId/release-wage", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat menyetujui pencairan upah." });
    return;
  }
  const jobId = Number(req.params.jobId);
  const parsed = releaseWageBody.safeParse(req.body);
  if (!Number.isSafeInteger(jobId) || jobId < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "ID lowongan tidak valid." : parsed.error.message });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [gig] = await tx
      .select()
      .from(gigsTable)
      .where(eq(gigsTable.id, jobId))
      .for("update")
      .limit(1);
    if (!gig || gig.employerId !== user.id) return { error: "not_found" as const };
    if (gig.paymentStatus !== "confirmed" || gig.escrowStatus === "disputed") {
      return { error: "not_funded" as const };
    }
    const [application] = await tx
      .select()
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.jobId, jobId),
          eq(applicationsTable.workerId, parsed.data.workerId),
        ),
      )
      .for("update")
      .limit(1);
    if (!application || !["diterima", "selesai"].includes(application.status)) {
      return { error: "not_accepted" as const };
    }
    const [existingEntry] = await tx
      .select()
      .from(walletEntriesTable)
      .where(
        and(
          eq(walletEntriesTable.sourceType, "gig_wage"),
          eq(walletEntriesTable.sourceId, String(application.id)),
        ),
      )
      .limit(1);
    if (existingEntry) return { entry: existingEntry, application, gig, duplicate: true };

    const periods = gig.pembayaran === "per_projek" ? 1 : Math.max(1, gig.jumlahHari ?? 1);
    const amount = gig.nominal * periods;
    if (!Number.isSafeInteger(amount) || amount <= 0 || (gig.escrowAmount ?? 0) < amount) {
      return { error: "invalid_amount" as const };
    }
    const [entry] = await tx
      .insert(walletEntriesTable)
      .values({
        workerId: application.workerId,
        sourceType: "gig_wage",
        sourceId: String(application.id),
        amount,
        description: `Upah selesai: ${gig.posisi}`,
      })
      .onConflictDoNothing()
      .returning();
    const [updatedApplication] = application.status === "selesai"
      ? [application]
      : await tx
          .update(applicationsTable)
          .set({ status: "selesai" })
          .where(eq(applicationsTable.id, application.id))
          .returning();
    const remaining = await tx
      .select({ id: applicationsTable.id })
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.jobId, jobId),
          eq(applicationsTable.status, "diterima"),
        ),
      );
    const [updatedGig] = await tx
      .update(gigsTable)
      .set({ escrowStatus: remaining.length === 0 ? "released" : "locked" })
      .where(eq(gigsTable.id, jobId))
      .returning();
    return {
      entry: entry ?? existingEntry,
      application: updatedApplication,
      gig: updatedGig,
      duplicate: false,
    };
  });

  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "not_accepted" ? 409 : 422;
    res.status(status).json({ error: result.error });
    return;
  }
  if (!result.duplicate) {
    broadcastApplicationStatus(
      result.application.id,
      "selesai",
      result.gig.id,
      result.application.workerId,
    );
    broadcastGig(result.gig);
  }
  req.log.info(
    { jobId, workerId: result.application.workerId, amount: result.entry?.amount, duplicate: result.duplicate },
    "Gig wage approved and credited to worker wallet",
  );
  res.json({ ok: true, duplicate: result.duplicate, amount: result.entry?.amount ?? 0 });
});

router.get("/admin/manual-finance/settings", async (req, res): Promise<void> => {
  const adminId = await getAdminId(req);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const [settings] = await db
    .select()
    .from(manualPaymentSettingsTable)
    .where(eq(manualPaymentSettingsTable.id, 1))
    .limit(1);
  res.json({ settings: settings ?? null });
});

const settingsBody = z.object({
  bankName: z.string().trim().min(2).max(80),
  accountName: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().min(5).max(40),
  instructions: z.string().trim().max(800).default(""),
});

router.put("/admin/manual-finance/settings", async (req, res): Promise<void> => {
  const adminId = await getAdminId(req);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const parsed = settingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [settings] = await db
    .insert(manualPaymentSettingsTable)
    .values({ id: 1, ...parsed.data, updatedBy: adminId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: manualPaymentSettingsTable.id,
      set: { ...parsed.data, updatedBy: adminId, updatedAt: new Date() },
    })
    .returning();
  await db.insert(adminLogsTable).values({
    adminId,
    action: "UPDATE_MANUAL_PAYMENT_SETTINGS",
    targetId: "1",
    reason: "Rekening dan petunjuk transfer manual diperbarui",
  });
  res.json({ settings });
});

router.get("/admin/manual-finance/payments", async (req, res): Promise<void> => {
  const adminId = await getAdminId(req);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const payments = await db
    .select({
      payment: manualPaymentsTable,
      payerName: usersTable.name,
      payerEmail: usersTable.email,
    })
    .from(manualPaymentsTable)
    .leftJoin(usersTable, eq(usersTable.id, manualPaymentsTable.payerId))
    .orderBy(desc(manualPaymentsTable.createdAt));
  res.json({
    payments: payments.map(({ payment, payerName, payerEmail }) => ({
      ...payment,
      payerName: payerName ?? "Akun tidak ditemukan",
      payerEmail,
    })),
  });
});

const reviewPaymentBody = z.object({
  action: z.enum(["confirm", "reject"]),
  note: z.string().trim().max(500).optional().default(""),
});

router.post("/admin/manual-finance/payments/:id/review", async (req, res): Promise<void> => {
  const adminId = await getAdminId(req);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const id = Number(req.params.id);
  const parsed = reviewPaymentBody.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "ID pembayaran tidak valid." : parsed.error.message });
    return;
  }

  const outcome = await db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(manualPaymentsTable)
      .where(eq(manualPaymentsTable.id, id))
      .for("update")
      .limit(1);
    if (!payment) return { error: "not_found" as const };
    if (payment.status !== "under_review") return { error: "not_reviewable" as const };
    if (parsed.data.action === "reject") {
      const [updated] = await tx
        .update(manualPaymentsTable)
        .set({
          status: "rejected",
          adminNote: parsed.data.note || "Bukti transfer perlu diperiksa kembali.",
          reviewedBy: adminId,
          reviewedAt: new Date(),
        })
        .where(eq(manualPaymentsTable.id, id))
        .returning();
      return { payment: updated, broadcast: null };
    }

    let broadcast:
      | { gig: typeof gigsTable.$inferSelect; instant: boolean }
      | null = null;

    switch (payment.targetType) {
      case "gig_escrow": {
        const gigId = Number(payment.targetId);
        const [gig] = await tx
          .select()
          .from(gigsTable)
          .where(eq(gigsTable.id, gigId))
          .for("update")
          .limit(1);
        if (!gig || gig.employerId !== payment.payerId || gig.escrowAmount !== payment.amount) {
          return { error: "target_mismatch" as const };
        }
        await tx
          .update(gigsTable)
          .set({ paymentStatus: "confirmed", escrowStatus: "locked" })
          .where(eq(gigsTable.id, gigId));
        const [instantOrder] = await tx
          .select()
          .from(instantOrdersTable)
          .where(eq(instantOrdersTable.jobId, gigId))
          .limit(1);
        if (gig.hiringMode !== "cepat" || instantOrder?.status === "active") {
          const [activeGig] = await tx
            .update(gigsTable)
            .set({ broadcastActive: gig.hiringMode === "cepat" })
            .where(eq(gigsTable.id, gigId))
            .returning();
          broadcast = { gig: activeGig, instant: gig.hiringMode === "cepat" };
        }
        break;
      }
      case "instant_listing": {
        const orderId = Number(payment.targetId);
        const [order] = await tx
          .select()
          .from(instantOrdersTable)
          .where(eq(instantOrdersTable.id, orderId))
          .for("update")
          .limit(1);
        if (!order || order.companyId !== payment.payerId || order.amount !== payment.amount) {
          return { error: "target_mismatch" as const };
        }
        await tx
          .update(instantOrdersTable)
          .set({ status: "active" })
          .where(eq(instantOrdersTable.id, orderId));
        const [gig] = await tx
          .select()
          .from(gigsTable)
          .where(eq(gigsTable.id, order.jobId))
          .limit(1);
        if (gig?.paymentStatus === "confirmed") {
          const [activeGig] = await tx
            .update(gigsTable)
            .set({ broadcastActive: true })
            .where(eq(gigsTable.id, gig.id))
            .returning();
          broadcast = { gig: activeGig, instant: true };
        }
        break;
      }
      case "legacy_subscription": {
        const [previous] = await tx
          .select()
          .from(companySubscriptionsTable)
          .where(eq(companySubscriptionsTable.companyId, payment.payerId))
          .limit(1);
        const now = Date.now();
        const base = previous?.expiresAt && previous.expiresAt.getTime() > now
          ? previous.expiresAt.getTime()
          : now;
        const expiresAt = new Date(base + 30 * 24 * 60 * 60 * 1000);
        await tx
          .insert(companySubscriptionsTable)
          .values({ companyId: payment.payerId, isPremium: true, expiresAt })
          .onConflictDoUpdate({
            target: companySubscriptionsTable.companyId,
            set: { isPremium: true, expiresAt },
          });
        break;
      }
      case "business_subscription": {
        const orderId = Number(payment.targetId);
        const [order] = await tx
          .select()
          .from(subscriptionOrdersTable)
          .where(eq(subscriptionOrdersTable.id, orderId))
          .for("update")
          .limit(1);
        if (!order || order.companyId !== payment.payerId || order.amount !== payment.amount || order.status !== "pending") {
          return { error: "target_mismatch" as const };
        }
        const [plan] = await tx
          .select()
          .from(subscriptionPlansTable)
          .where(eq(subscriptionPlansTable.id, order.planId))
          .limit(1);
        const [company] = await tx
          .select({ expiredAt: usersTable.expiredAt })
          .from(usersTable)
          .where(eq(usersTable.id, order.companyId))
          .limit(1);
        if (!plan || !company) return { error: "target_mismatch" as const };
        const now = Date.now();
        const base = company.expiredAt && company.expiredAt.getTime() > now
          ? company.expiredAt.getTime()
          : now;
        const expiredAt = new Date(base + plan.durationDays * 24 * 60 * 60 * 1000);
        await tx
          .update(subscriptionOrdersTable)
          .set({ status: "success" })
          .where(eq(subscriptionOrdersTable.id, orderId));
        await tx
          .update(usersTable)
          .set({ isPremium: true, expiredAt })
          .where(eq(usersTable.id, order.companyId));
        break;
      }
      case "project_escrow": {
        const projectId = Number(payment.targetId);
        const [project] = await tx
          .select()
          .from(escrowProjectsTable)
          .where(eq(escrowProjectsTable.id, projectId))
          .for("update")
          .limit(1);
        if (!project || project.employerId !== payment.payerId || project.totalAmount !== payment.amount) {
          return { error: "target_mismatch" as const };
        }
        await tx
          .update(escrowProjectsTable)
          .set({ status: "funded", fundedAt: new Date() })
          .where(eq(escrowProjectsTable.id, projectId));
        break;
      }
      default:
        return { error: "unknown_target" as const };
    }

    const [updated] = await tx
      .update(manualPaymentsTable)
      .set({
        status: "confirmed",
        adminNote: parsed.data.note || null,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      })
      .where(eq(manualPaymentsTable.id, id))
      .returning();
    return { payment: updated, broadcast };
  });

  if ("error" in outcome) {
    const status = outcome.error === "not_found" ? 404 : outcome.error === "not_reviewable" ? 409 : 422;
    res.status(status).json({ error: outcome.error });
    return;
  }
  if (outcome.broadcast) {
    if (outcome.broadcast.instant) broadcastInstantActivated(outcome.broadcast.gig);
    else broadcastGig(outcome.broadcast.gig);
  }
  await db.insert(adminLogsTable).values({
    adminId,
    action: parsed.data.action === "confirm" ? "CONFIRM_MANUAL_PAYMENT" : "REJECT_MANUAL_PAYMENT",
    targetId: id,
    reason: parsed.data.note || null,
  });
  req.log.info({ paymentId: id, action: parsed.data.action, adminId }, "Manual payment reviewed");
  res.json(outcome.payment);
});

router.get("/admin/manual-finance/payouts", async (req, res): Promise<void> => {
  const adminId = await getAdminId(req);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const payouts = await db
    .select({
      payout: manualPayoutsTable,
      workerName: usersTable.name,
      workerEmail: usersTable.email,
    })
    .from(manualPayoutsTable)
    .leftJoin(usersTable, eq(usersTable.id, manualPayoutsTable.workerId))
    .orderBy(desc(manualPayoutsTable.createdAt));
  res.json({
    payouts: payouts.map(({ payout, workerName, workerEmail }) => ({
      ...payout,
      workerName: workerName ?? "Akun tidak ditemukan",
      workerEmail,
    })),
  });
});

const settlePayoutBody = z.object({
  action: z.enum(["paid", "reject"]),
  transferReference: z.string().trim().min(3).max(120).optional(),
  note: z.string().trim().max(500).optional().default(""),
}).refine((value) => value.action !== "paid" || !!value.transferReference, {
  message: "Nomor referensi transfer wajib diisi saat payout ditandai selesai.",
});

router.post("/admin/manual-finance/payouts/:id/resolve", async (req, res): Promise<void> => {
  const adminId = await getAdminId(req);
  if (!adminId) {
    res.status(401).json({ error: "Sesi admin tidak valid." });
    return;
  }
  const id = Number(req.params.id);
  const parsed = settlePayoutBody.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "ID payout tidak valid." : parsed.error.message });
    return;
  }
  const [payout] = await db
    .update(manualPayoutsTable)
    .set({
      status: parsed.data.action === "paid" ? "paid" : "rejected",
      transferReference: parsed.data.action === "paid" ? parsed.data.transferReference : null,
      adminNote: parsed.data.note || null,
      settledBy: adminId,
      settledAt: new Date(),
    })
    .where(and(eq(manualPayoutsTable.id, id), eq(manualPayoutsTable.status, "pending")))
    .returning();
  if (!payout) {
    res.status(409).json({ error: "Payout tidak ditemukan atau sudah diproses." });
    return;
  }
  await db.insert(adminLogsTable).values({
    adminId,
    action: parsed.data.action === "paid" ? "SETTLE_MANUAL_PAYOUT" : "REJECT_MANUAL_PAYOUT",
    targetId: id,
    reason: parsed.data.note || parsed.data.transferReference || null,
  });
  req.log.info({ payoutId: id, workerId: payout.workerId, action: parsed.data.action, adminId }, "Manual payout resolved");
  res.json(payout);
});

export default router;