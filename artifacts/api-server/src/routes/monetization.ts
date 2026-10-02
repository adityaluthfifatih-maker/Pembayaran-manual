import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  applicationsTable,
  usersTable,
  gigsTable,
  companySubscriptionsTable,
  instantOrdersTable,
  manualPaymentSettingsTable,
  manualPaymentsTable,
} from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { broadcastInstantActivated } from "../lib/realtime";
import {
  FREE_APPLICANT_LIMIT,
  getInstantPrice,
  SUBSCRIPTION_PRICE_MONTHLY,
} from "../lib/pricing";

const router: IRouter = Router();

export async function getActiveSubscription(companyId: string) {
  const [sub] = await db
    .select()
    .from(companySubscriptionsTable)
    .where(eq(companySubscriptionsTable.companyId, companyId))
    .limit(1);
  if (!sub || !sub.isPremium) return null;
  if (sub.expiresAt && sub.expiresAt.getTime() < Date.now()) return null;
  return sub;
}

/**
 * Applicant-contact paywall: the first FREE_APPLICANT_LIMIT applicants
 * (ordered by ROW_NUMBER() over created_at ASC) show full contact info.
 * Applicant #4+ is masked at the backend unless the employer has an active
 * subscription — never rely on the frontend to hide this data.
 */
router.get("/jobs/:jobId/applicants", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat melihat pelamar." });
    return;
  }
  const jobId = Number(req.params.jobId);
  if (!jobId || isNaN(jobId)) {
    res.status(400).json({ error: "ID lowongan tidak valid." });
    return;
  }

  const [gig] = await db
    .select({ employerId: gigsTable.employerId })
    .from(gigsTable)
    .where(eq(gigsTable.id, jobId))
    .limit(1);
  if (!gig || gig.employerId !== user.id) {
    res.status(404).json({ error: "Lowongan tidak ditemukan." });
    return;
  }

  const rows = await db.execute<{
    id: number;
    worker_id: string;
    worker_name: string;
    status: string;
    created_at: string;
    row_num: number;
    email: string | null;
    whatsapp: string | null;
    bank: string | null;
    rekening: string | null;
  }>(sql`
    SELECT
      a.id, a.worker_id, a.worker_name, a.status, a.created_at,
      ROW_NUMBER() OVER (ORDER BY a.created_at ASC) AS row_num,
      u.email, u.whatsapp, a.bank, a.rekening
    FROM applications a
    LEFT JOIN users u ON u.id = a.worker_id
    WHERE a.job_id = ${jobId} AND a.employer_id = ${user.id}
    ORDER BY a.created_at ASC
  `);

  const subscription = await getActiveSubscription(user.id);
  const isPremium = !!subscription;

  const applicants = rows.rows.map((r) => {
    const locked = !isPremium && r.row_num > FREE_APPLICANT_LIMIT;
    return {
      id: r.id,
      rowNum: r.row_num,
      status: r.status,
      createdAt: r.created_at,
      locked,
      name: locked ? `Pelamar Ke-${r.row_num}` : r.worker_name,
      email: locked ? "****@***" : r.email ?? "—",
      whatsapp: locked ? "08***********" : r.whatsapp ?? "—",
      bank: locked ? "****" : r.bank || "—",
      rekening: locked ? "****" : r.rekening || "—",
    };
  });

  res.json({
    applicants,
    isPremium,
    freeLimit: FREE_APPLICANT_LIMIT,
    paywallMessage:
      "Upgrade ke Paket Bulanan (Rp 149.000) atau bayar Paket Satuan untuk membuka semua kontak.",
  });
});

/**
 * Employer picks a category for an Instan Kilat posting and gets back the
 * flat price + a pending order id to hand to the payment step.
 */
const createOrderBody = z.object({
  jobId: z.coerce.number(),
  category: z.enum(["umum", "terampil", "profesional"]).default("umum"),
});

router.post("/instant-orders", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat memesan Instan Kilat." });
    return;
  }
  const parsed = createOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [gig] = await db
    .select()
    .from(gigsTable)
    .where(eq(gigsTable.id, parsed.data.jobId))
    .limit(1);
  if (!gig || gig.employerId !== user.id || gig.hiringMode !== "cepat") {
    res.status(404).json({ error: "Lowongan Instan Kilat tidak ditemukan." });
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
  const amount = getInstantPrice(parsed.data.category);
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(instantOrdersTable)
      .values({
        jobId: parsed.data.jobId,
        companyId: user.id,
        amount,
      })
      .returning();
    if (!order) throw new Error("Gagal membuat tagihan Instan Kilat.");
    const [payment] = await tx
      .insert(manualPaymentsTable)
      .values({
        payerId: user.id,
        targetType: "instant_listing",
        targetId: String(order.id),
        amount,
      })
      .returning();
    return { order, payment };
  });
  res.status(201).json({ ...result.order, manualPaymentId: result.payment.id });
});

router.post("/webhook/payment", async (_req, res): Promise<void> => {
  res.status(410).json({ error: "Konfirmasi otomatis dinonaktifkan. Pembayaran harus ditinjau admin." });
});

/**
 * Instant-match "siapa cepat dia dapat" claim. Uses a row-level lock
 * (FOR UPDATE) inside a transaction so two workers racing to accept the same
 * Instan Kilat order at the same millisecond can never both win.
 */
const acceptBody = z.object({ orderId: z.coerce.number() });

router.post("/jobs/instant/accept", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "pekerja") {
    res.status(403).json({ error: "Hanya pekerja yang dapat mengambil Instan Kilat." });
    return;
  }
  const parsed = acceptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const locked = await tx.execute<{ id: number; status: string; matched_applicant_id: string | null }>(
      sql`SELECT id, status, matched_applicant_id FROM instant_orders WHERE id = ${parsed.data.orderId} FOR UPDATE`,
    );
    const row = locked.rows[0];
    if (!row) return { error: "not_found" as const };
    if (row.status !== "active" || row.matched_applicant_id) {
      return { error: "already_taken" as const };
    }
    const [updated] = await tx
      .update(instantOrdersTable)
      .set({ status: "completed", matchedApplicantId: user.id })
      .where(and(eq(instantOrdersTable.id, parsed.data.orderId), eq(instantOrdersTable.status, "active")))
      .returning();
    if (!updated) return { error: "already_taken" as const };
    return { order: updated };
  });

  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 409;
    const message =
      result.error === "not_found"
        ? "Order tidak ditemukan."
        : "Lowongan ini sudah diambil pekerja lain.";
    res.status(status).json({ error: message });
    return;
  }

  req.log.info(
    { orderId: result.order.id, workerId: user.id },
    "Instant Kilat job matched (row-locked accept)",
  );
  res.json(result.order);
});

router.post("/subscriptions/subscribe", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat berlangganan." });
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
  const targetId = `${user.id}:${Date.now()}`;
  const [payment] = await db
    .insert(manualPaymentsTable)
    .values({
      payerId: user.id,
      targetType: "legacy_subscription",
      targetId,
      amount: SUBSCRIPTION_PRICE_MONTHLY,
    })
    .returning();
  req.log.info({ companyId: user.id, paymentId: payment.id }, "Monthly subscription awaiting manual payment");
  res.status(201).json({ payment });
});

router.get("/subscriptions/me", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang memiliki langganan." });
    return;
  }
  const sub = await getActiveSubscription(user.id);
  res.json({ isPremium: !!sub, expiresAt: sub?.expiresAt ?? null, price: SUBSCRIPTION_PRICE_MONTHLY });
});

export default router;
