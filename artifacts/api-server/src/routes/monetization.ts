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
} from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { broadcastInstantActivated } from "../lib/realtime";
import {
  FREE_APPLICANT_LIMIT,
  getInstantPrice,
  SUBSCRIPTION_PRICE_MONTHLY,
} from "../lib/pricing";

const router: IRouter = Router();

async function getActiveSubscription(companyId: string) {
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
  const amount = getInstantPrice(parsed.data.category);
  const [order] = await db
    .insert(instantOrdersTable)
    .values({
      jobId: parsed.data.jobId,
      companyId: user.id,
      amount,
    })
    .returning();
  res.status(201).json(order);
});

/**
 * Payment gateway webhook (Midtrans/Xendit). Confirms the flat-rate payment
 * for an Instan Kilat order, flips it "active", and asynchronously fans out
 * the geofenced broadcast to nearby workers (non-blocking via setImmediate).
 */
const webhookBody = z.object({
  orderId: z.coerce.number(),
  orderIdGateway: z.string().optional(),
  status: z.enum(["success", "failed"]),
});

router.post("/webhook/payment", async (req, res): Promise<void> => {
  const parsed = webhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const newStatus = parsed.data.status === "success" ? "active" : "failed";
  const [order] = await db
    .update(instantOrdersTable)
    .set({
      status: newStatus,
      orderIdGateway: parsed.data.orderIdGateway ?? sql`${instantOrdersTable.orderIdGateway}`,
    })
    .where(eq(instantOrdersTable.id, parsed.data.orderId))
    .returning();

  if (!order) {
    res.status(404).json({ error: "Order tidak ditemukan." });
    return;
  }

  if (newStatus === "active") {
    const [gig] = await db
      .update(gigsTable)
      .set({ broadcastActive: true })
      .where(eq(gigsTable.id, order.jobId))
      .returning();

    // Non-blocking geofenced broadcast simulation — worker devices already
    // filter/alert on incoming gigs by radius via the realtime radar pipeline.
    setImmediate(() => {
      req.log.info(
        { jobId: order.jobId, amount: order.amount },
        "[SIMULASI] Broadcast geofencing 5KM dikirim ke pelamar terdekat",
      );
      if (gig) broadcastInstantActivated(gig);
    });
  }

  req.log.info({ orderId: order.id, status: order.status }, "Payment webhook processed");
  res.json(order);
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

/**
 * Activates/refreshes the employer's monthly Premium subscription. In a real
 * deployment this is triggered by the same Midtrans/Xendit webhook flow as
 * /webhook/payment — kept as its own endpoint here since it applies to the
 * company account, not a single job.
 */
router.post("/subscriptions/subscribe", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat berlangganan." });
    return;
  }
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const [sub] = await db
    .insert(companySubscriptionsTable)
    .values({ companyId: user.id, isPremium: true, expiresAt })
    .onConflictDoUpdate({
      target: companySubscriptionsTable.companyId,
      set: { isPremium: true, expiresAt },
    })
    .returning();

  req.log.info({ companyId: user.id, price: SUBSCRIPTION_PRICE_MONTHLY }, "Company subscribed to Premium");
  res.json(sub);
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
