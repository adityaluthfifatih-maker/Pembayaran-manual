import { Router, type IRouter } from "express";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  gigsTable,
  insertGigSchema,
  manualPaymentSettingsTable,
  manualPaymentsTable,
} from "@workspace/db";
import { broadcastGig } from "../lib/realtime";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";

const router: IRouter = Router();

const createGigBody = insertGigSchema.extend({
  postedAt: z.coerce.date().optional(),
  jobDate: z.coerce.date().nullish(),
  jobCategory: z.string().nullish(),
  feeRate: z.number().nullish(),
});

function wageAmount(gig: {
  pembayaran: string;
  nominal: number;
  jumlahHari: number | null;
  kuota: number;
}): number {
  const periods = gig.pembayaran === "per_projek" ? 1 : Math.max(1, gig.jumlahHari ?? 1);
  return gig.nominal * periods * Math.max(1, gig.kuota);
}

router.get("/gigs", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  const rows = await db
    .select()
    .from(gigsTable)
    .where(
      user?.role === "perusahaan"
        ? or(eq(gigsTable.paymentStatus, "confirmed"), eq(gigsTable.employerId, user.id))
        : eq(gigsTable.paymentStatus, "confirmed"),
    )
    .orderBy(desc(gigsTable.postedAt));
  res.json(rows);
});

router.post("/gigs", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  const parsed = createGigBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid gig body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!user || user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya akun perusahaan yang dapat membuat lowongan." });
    return;
  }

  const [existing] = await db
    .select()
    .from(gigsTable)
    .where(eq(gigsTable.id, parsed.data.id))
    .limit(1);
  if (existing) {
    if (existing.employerId !== user.id) {
      res.status(403).json({ error: "Lowongan ini bukan milik akun Anda." });
      return;
    }
    const [updated] = await db
      .update(gigsTable)
      .set({
        ...parsed.data,
        employerId: existing.employerId,
        paymentStatus: existing.paymentStatus,
        escrowStatus: existing.escrowStatus,
        escrowAmount: existing.escrowAmount,
        broadcastActive: existing.broadcastActive,
        jobCategory: parsed.data.jobCategory ?? existing.jobCategory,
        feeRate: existing.feeRate,
      })
      .where(eq(gigsTable.id, existing.id))
      .returning();
    if (updated.paymentStatus === "confirmed") broadcastGig(updated);
    res.json(updated);
    return;
  }

  const amount = wageAmount({
    pembayaran: parsed.data.pembayaran,
    nominal: parsed.data.nominal,
    jumlahHari: parsed.data.jumlahHari ?? null,
    kuota: parsed.data.kuota,
  });
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    res.status(400).json({ error: "Nilai upah tidak valid." });
    return;
  }
  const [settings] = await db
    .select({ accountNumber: manualPaymentSettingsTable.accountNumber })
    .from(manualPaymentSettingsTable)
    .where(eq(manualPaymentSettingsTable.id, 1))
    .limit(1);
  if (!settings?.accountNumber) {
    res.status(409).json({ error: "Instruksi transfer belum diatur oleh admin. Lowongan belum dibuat." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [gig] = await tx
      .insert(gigsTable)
      .values({
        ...parsed.data,
        employerId: user.id,
        employerName: user.namaPerusahaan || user.name,
        escrowAmount: amount,
        escrowStatus: "pending",
        feeRate: 0,
        paymentStatus: "awaiting_payment",
        broadcastActive: false,
      })
      .onConflictDoNothing()
      .returning();
    if (!gig) return { error: "id_conflict" as const };
    const [payment] = await tx
      .insert(manualPaymentsTable)
      .values({
        payerId: user.id,
        targetType: "gig_escrow",
        targetId: String(gig.id),
        amount,
      })
      .returning();
    return { gig, payment };
  });

  if ("error" in result) {
    res.status(409).json({ error: "ID lowongan sudah digunakan. Coba buat ulang lowongan." });
    return;
  }
  req.log.info(
    { gigId: result.gig.id, employerId: user.id, amount },
    "Gig created and held for manual payment review",
  );
  res.status(201).json({ ...result.gig, manualPaymentId: result.payment.id });
});

export default router;
