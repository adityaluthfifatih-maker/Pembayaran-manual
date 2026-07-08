import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  usersTable,
  subscriptionPlansTable,
  subscriptionOrdersTable,
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

  const [order] = await db
    .insert(subscriptionOrdersTable)
    .values({ companyId: user.id, planId: plan.id, amount: plan.promoPrice })
    .returning();

  res.status(201).json({ order, plan });
});

/**
 * Payment gateway webhook (Midtrans/Xendit-style). On success:
 *   1. flips the order to "success",
 *   2. accumulates the plan's `durationDays` onto the company's `expiredAt`
 *      — from the OLD expiry if it's still in the future, or from now if it
 *      has already lapsed (or never subscribed before) — and
 *   3. sets `isPremium = true`.
 * On failure the order is flipped "failed" and no company row changes.
 */
const webhookBody = z.object({
  orderId: z.coerce.number(),
  orderIdGateway: z.string().optional(),
  status: z.enum(["success", "failed"]),
});

router.post("/webhook/subscription-payment", async (req, res): Promise<void> => {
  const parsed = webhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .update(subscriptionOrdersTable)
      .set({
        status: parsed.data.status,
        orderIdGateway:
          parsed.data.orderIdGateway ?? sql`${subscriptionOrdersTable.orderIdGateway}`,
      })
      .where(eq(subscriptionOrdersTable.id, parsed.data.orderId))
      .returning();
    if (!order) return { error: "not_found" as const };

    if (parsed.data.status !== "success") return { order };

    const [plan] = await tx
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.id, order.planId))
      .limit(1);
    if (!plan) return { error: "plan_not_found" as const };

    const [company] = await tx
      .select({ expiredAt: usersTable.expiredAt })
      .from(usersTable)
      .where(eq(usersTable.id, order.companyId))
      .limit(1);
    if (!company) return { error: "company_not_found" as const };

    const now = Date.now();
    // Accumulate from the OLD expiry if the subscription is still active,
    // never from "today" — an extension should stack on top of remaining
    // time, not discard it.
    const baseMs =
      company.expiredAt && company.expiredAt.getTime() > now
        ? company.expiredAt.getTime()
        : now;
    const newExpiredAt = new Date(baseMs + plan.durationDays * 24 * 60 * 60 * 1000);

    await tx
      .update(usersTable)
      .set({ isPremium: true, expiredAt: newExpiredAt })
      .where(eq(usersTable.id, order.companyId));

    return { order, plan, newExpiredAt };
  });

  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 409;
    res.status(status).json({ error: result.error });
    return;
  }

  req.log.info(
    {
      orderId: result.order.id,
      companyId: result.order.companyId,
      status: result.order.status,
      newExpiredAt: "newExpiredAt" in result ? result.newExpiredAt : undefined,
    },
    "Subscription payment webhook processed",
  );
  res.json(result);
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
