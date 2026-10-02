import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  usersTable,
  subscriptionPlansTable,
  subscriptionOrdersTable,
  manualPaymentSettingsTable,
  manualPaymentsTable,
} from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { checkPremiumStatus, requirePremium } from "../lib/premium";

const router: IRouter = Router();

/**
 * Public price list for "Rekhastha Bisnis" — shown on the upgrade screen with
 * both the struck-through original price and the launch promo price.
 */
router.get("/subscription-plans", async (_req, res): Promise<void> => {
  const plans = await db
    .select()
    .from(subscriptionPlansTable)
    .orderBy(subscriptionPlansTable.durationMonths);
  res.json(plans);
});

/**
 * Employer picks a plan and gets back a pending order (amount = promo_price
 * at order-creation time) to hand to the payment step.
 */
const createOrderBody = z.object({
  planId: z.coerce.number(),
});

router.post("/subscriptions/orders", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat berlangganan Rekhastha Bisnis." });
    return;
  }
  const parsed = createOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.id, parsed.data.planId))
    .limit(1);
  if (!plan) {
    res.status(404).json({ error: "Paket tidak ditemukan." });
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
    const [order] = await tx
      .insert(subscriptionOrdersTable)
      .values({ companyId: user.id, planId: plan.id, amount: plan.promoPrice })
      .returning();
    if (!order) throw new Error("Gagal membuat pesanan langganan.");
    const [payment] = await tx
      .insert(manualPaymentsTable)
      .values({
        payerId: user.id,
        targetType: "business_subscription",
        targetId: String(order.id),
        amount: order.amount,
      })
      .returning();
    return { order, payment };
  });

  res.status(201).json({ ...result, plan });
});

router.post("/webhook/subscription-payment", async (_req, res): Promise<void> => {
  res.status(410).json({ error: "Konfirmasi otomatis dinonaktifkan. Pembayaran harus ditinjau admin." });
});

/**
 * Employer checks their own Rekhastha Bisnis status. Uses checkPremiumStatus
 * so a lapsed subscription is auto-flipped false on read, not just on the
 * next gated tool call.
 */
router.get("/subscriptions/status", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user || user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang memiliki langganan." });
    return;
  }

  const isPremium = await checkPremiumStatus(user.id);
  const [company] = await db
    .select({ expiredAt: usersTable.expiredAt })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);

  res.json({ isPremium, expiredAt: company?.expiredAt ?? null });
});

/**
 * Daily wage calculator ("Kalkulator Gaji Harian") as an employer-facing
 * management tool — gated behind requirePremium so it's free/unlimited only
 * for active Rekhastha Bisnis subscribers. Mirrors the flat wage math used
 * elsewhere (per-shift/per-hari nominal × jumlah hari); job posting itself
 * remains free regardless of premium status.
 */
const payrollBody = z.object({
  nominal: z.coerce.number().positive(),
  jumlahHari: z.coerce.number().int().positive().default(1),
});

router.post("/employer/payroll/calculate", requirePremium, async (req, res): Promise<void> => {
  const parsed = payrollBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const gross = parsed.data.nominal * parsed.data.jumlahHari;
  res.json({ gross, net: gross, jumlahHari: parsed.data.jumlahHari });
});

export default router;
