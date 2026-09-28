import { and, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  db,
  escrowProjectsTable,
  gigsTable,
  instantOrdersTable,
  midtransPaymentsTable,
  subscriptionOrdersTable,
  usersTable,
} from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import {
  createIrisPayout,
  createSnapTransaction,
  isMidtransProduction,
  logMidtransMode,
  parseMidtransDate,
  verifyMidtransSignature,
} from "../lib/midtrans";

const router: IRouter = Router();

const customerDetailsSchema = z
  .record(z.string(), z.unknown())
  .default({});

const createPaymentBody = z.object({
  orderId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._:-]+$/, "orderId mengandung karakter yang tidak valid."),
  grossAmount: z.coerce.number().int().positive(),
  customerDetails: customerDetailsSchema,
  jobType: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, "jobType mengandung karakter yang tidak valid."),
  jobId: z.string().trim().min(1).max(100).optional(),
});

const notificationSchema = z.object({
  order_id: z.string().min(1),
  status_code: z.string().min(1),
  gross_amount: z.string().min(1),
  signature_key: z.string().min(1),
  transaction_status: z.string().min(1),
  transaction_id: z.string().optional(),
  payment_type: z.string().optional(),
  fraud_status: z.string().optional(),
  transaction_time: z.string().optional(),
  settlement_time: z.string().optional(),
});

const payoutBody = z.object({
  workerId: z.string().trim().min(1),
  amount: z.coerce.number().int().positive(),
  jobId: z.string().trim().min(1).optional(),
  referenceNo: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._:-]+$/)
    .optional(),
  execute: z.boolean().default(false),
  notes: z.string().trim().max(255).default("Rekhastha worker payout"),
  beneficiary: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      account: z.string().trim().min(1).max(50).optional(),
      bank: z.string().trim().min(1).max(30).optional(),
      email: z.string().email().optional(),
    })
    .optional(),
});

type PaymentStatus =
  | "settlement"
  | "pending"
  | "expire"
  | "deny"
  | "cancel";

function numericId(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(?:^|[-_:])(\d+)$/) ?? value.match(/^\d+$/);
  if (!match) return null;
  const id = Number(match[1] ?? match[0]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function paymentStatusForDomain(status: PaymentStatus): string {
  if (status === "settlement") return "success";
  if (status === "pending") return "pending";
  return "failed";
}

function isSettled(status: PaymentStatus): boolean {
  return status === "settlement";
}

async function updateRelatedDomainStatus(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  payment: {
    jobType: string;
    jobId: string | null;
    orderId: string;
  },
  status: PaymentStatus,
  transactionId: string | undefined,
): Promise<void> {
  const domainStatus = paymentStatusForDomain(status);
  const relatedId = numericId(payment.jobId ?? payment.orderId);

  if (payment.jobType === "instant" || payment.jobType === "instan_kilat") {
    if (relatedId === null) return;
    await tx
      .update(instantOrdersTable)
      .set({
        status: domainStatus === "success" ? "active" : domainStatus,
        orderIdGateway: transactionId,
      })
      .where(
        and(
          eq(instantOrdersTable.id, relatedId),
          inArray(instantOrdersTable.status, ["pending", "failed"]),
        ),
      );
    return;
  }

  if (payment.jobType === "subscription") {
    if (relatedId === null) return;
    await tx
      .update(subscriptionOrdersTable)
      .set({
        status: domainStatus === "success" ? "success" : domainStatus,
        orderIdGateway: transactionId,
      })
      .where(
        and(
          eq(subscriptionOrdersTable.id, relatedId),
          inArray(subscriptionOrdersTable.status, ["pending", "failed"]),
        ),
      );
    return;
  }

  if (payment.jobType === "gig" || payment.jobType === "borongan") {
    if (relatedId === null) return;
    await tx
      .update(gigsTable)
      .set({
        escrowStatus:
          domainStatus === "success"
            ? "funded"
            : domainStatus === "pending"
              ? "payment_pending"
              : "payment_failed",
      })
      .where(
        and(
          eq(gigsTable.id, relatedId),
          inArray(gigsTable.escrowStatus, [
            "locked",
            "payment_pending",
            "payment_failed",
          ]),
        ),
      );
    return;
  }

  // Escrow projects currently use Xendit for funding. Do not mutate those
  // rows from a Midtrans callback; unknown job types remain ledger-only.
  if (payment.jobType === "escrow_project") {
    return;
  }
}

logMidtransMode();

/**
 * Creates a Midtrans Snap transaction and records the merchant order before
 * returning both token and hosted redirect URL to the caller.
 */
router.post("/payments/midtrans/create", async (req, res): Promise<void> => {
  const parsed = createPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  const [existing] = await db
    .select()
    .from(midtransPaymentsTable)
    .where(eq(midtransPaymentsTable.orderId, input.orderId))
    .limit(1);

  if (existing) {
    if (
      existing.grossAmount !== input.grossAmount ||
      existing.jobType !== input.jobType
    ) {
      res.status(409).json({
        error: "orderId sudah digunakan untuk transaksi lain.",
      });
      return;
    }
    if (existing.snapToken || existing.redirectUrl) {
      res.json({
        orderId: existing.orderId,
        token: existing.snapToken,
        redirect_url: existing.redirectUrl,
        status: existing.status,
        reused: true,
      });
      return;
    }
  }

  try {
    const transaction = await createSnapTransaction({
      transaction_details: {
        order_id: input.orderId,
        gross_amount: input.grossAmount,
      },
      customer_details: input.customerDetails,
    });

    if (!transaction.token || !transaction.redirect_url) {
      req.log.error(
        { orderId: input.orderId, transaction },
        "Midtrans returned an incomplete Snap transaction response",
      );
      res.status(502).json({
        error: "Midtrans tidak mengembalikan token atau redirect URL.",
      });
      return;
    }

    const values = {
      orderId: input.orderId,
      jobId: input.jobId ?? null,
      jobType: input.jobType,
      grossAmount: input.grossAmount,
      status: "pending",
      customerDetails: input.customerDetails,
      snapToken: transaction.token,
      redirectUrl: transaction.redirect_url,
    } as const;

    const [created] = await db
      .insert(midtransPaymentsTable)
      .values(values)
      .onConflictDoNothing({ target: midtransPaymentsTable.orderId })
      .returning();

    const payment =
      created ??
      (
        await db
          .select()
          .from(midtransPaymentsTable)
          .where(eq(midtransPaymentsTable.orderId, input.orderId))
          .limit(1)
      )[0];

    req.log.info(
      {
        orderId: input.orderId,
        grossAmount: input.grossAmount,
        jobType: input.jobType,
        sandbox: !isMidtransProduction(),
      },
      "Midtrans Snap transaction created",
    );
    res.status(created ? 201 : 200).json({
      orderId: input.orderId,
      token: payment?.snapToken ?? transaction.token,
      redirect_url: payment?.redirectUrl ?? transaction.redirect_url,
      status: payment?.status ?? "pending",
      reused: !created,
    });
  } catch (error) {
    req.log.error({ err: error, orderId: input.orderId }, "Midtrans Snap create failed");
    res.status(502).json({
      error: "Gagal membuat transaksi Midtrans.",
      detail: error instanceof Error ? error.message : "Unknown Midtrans error",
    });
  }
});

/**
 * Midtrans HTTP notification endpoint. The signature is checked before any
 * database mutation, and every accepted notification is safe to retry.
 */
router.post("/payments/midtrans-callback", async (req, res): Promise<void> => {
  const parsed = notificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Payload callback Midtrans tidak valid." });
    return;
  }

  const notification = parsed.data;
  const recognizedStatuses: PaymentStatus[] = [
    "settlement",
    "pending",
    "expire",
    "deny",
    "cancel",
  ];
  if (!recognizedStatuses.includes(notification.transaction_status as PaymentStatus)) {
    req.log.info(
      {
        orderId: notification.order_id,
        transactionStatus: notification.transaction_status,
      },
      "Midtrans notification ignored: unsupported transaction status",
    );
    res.json({ ok: true, ignored: true });
    return;
  }

  let signatureValid = false;
  try {
    signatureValid = verifyMidtransSignature({
      orderId: notification.order_id,
      statusCode: notification.status_code,
      grossAmount: notification.gross_amount,
      signatureKey: notification.signature_key,
    });
  } catch (error) {
    req.log.error({ err: error }, "Midtrans signature verification unavailable");
    res.status(500).json({ error: "Konfigurasi Midtrans belum lengkap." });
    return;
  }

  if (!signatureValid) {
    req.log.warn({ orderId: notification.order_id }, "Invalid Midtrans signature");
    res.status(401).json({ error: "Signature callback Midtrans tidak valid." });
    return;
  }

  const grossAmount = Number(notification.gross_amount);
  if (!Number.isSafeInteger(grossAmount)) {
    res.status(400).json({ error: "gross_amount callback tidak valid." });
    return;
  }

  const paymentStatus = notification.transaction_status as PaymentStatus;
  const [payment] = await db
    .select()
    .from(midtransPaymentsTable)
    .where(eq(midtransPaymentsTable.orderId, notification.order_id))
    .limit(1);

  if (!payment) {
    req.log.warn(
      { orderId: notification.order_id },
      "Midtrans callback received for unknown order",
    );
    res.json({ ok: true, ignored: true });
    return;
  }
  if (payment.grossAmount !== grossAmount) {
    req.log.warn(
      {
        orderId: notification.order_id,
        expectedAmount: payment.grossAmount,
        receivedAmount: grossAmount,
      },
      "Midtrans callback amount mismatch",
    );
    res.status(400).json({ error: "Nominal callback Midtrans tidak sesuai." });
    return;
  }

  const rawNotification = req.body as Record<string, unknown>;
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(midtransPaymentsTable)
      .set({
        status: paymentStatus,
        transactionId: notification.transaction_id,
        transactionStatus: notification.transaction_status,
        paymentType: notification.payment_type,
        fraudStatus: notification.fraud_status,
        transactionTime: parseMidtransDate(notification.transaction_time),
        settlementTime: parseMidtransDate(notification.settlement_time),
        rawNotification,
        updatedAt: new Date(),
      })
      .where(eq(midtransPaymentsTable.id, payment.id))
      .returning();

    await updateRelatedDomainStatus(
      tx,
      payment,
      paymentStatus,
      notification.transaction_id,
    );
    return row;
  });

  req.log.info(
    {
      orderId: notification.order_id,
      transactionId: notification.transaction_id,
      transactionStatus: paymentStatus,
      settled: isSettled(paymentStatus),
    },
    "Midtrans callback processed",
  );
  res.json({ ok: true, payment: updated });
});

/**
 * Iris payout structure for a completed shift. `execute` defaults to false
 * so local testing can validate the beneficiary payload without moving funds.
 * Set execute=true only for an intentional Sandbox Iris request.
 */
router.post("/payments/midtrans/payout", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  const parsed = payoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  const [worker] = await db
    .select({ id: usersTable.id, name: usersTable.name, profile: usersTable.profile })
    .from(usersTable)
    .where(eq(usersTable.id, input.workerId))
    .limit(1);

  if (!worker) {
    res.status(404).json({ error: "Worker tidak ditemukan." });
    return;
  }

  const profile = (worker.profile ?? {}) as {
    namaBank?: string;
    nomorRekening?: string;
    namaRekening?: string;
    email?: string;
  };
  const beneficiary = {
    name: input.beneficiary?.name ?? profile.namaRekening ?? worker.name,
    account: input.beneficiary?.account ?? profile.nomorRekening,
    bank: input.beneficiary?.bank ?? profile.namaBank,
    email: input.beneficiary?.email ?? profile.email,
  };

  if (!beneficiary.account || !beneficiary.bank) {
    res.status(409).json({
      error: "Data rekening worker belum lengkap untuk payout.",
    });
    return;
  }

  const referenceNo =
    input.referenceNo ??
    `rekhastha-payout-${input.jobId ?? input.workerId}-${Date.now()}`;
  const payoutPayload = {
    payouts: [
      {
        reference_no: referenceNo,
        beneficiary_name: beneficiary.name,
        beneficiary_account: beneficiary.account,
        beneficiary_bank: beneficiary.bank,
        amount: input.amount,
        notes: input.notes,
      },
    ],
  };

  if (!input.execute) {
    req.log.info(
      { workerId: input.workerId, referenceNo, amount: input.amount },
      "Midtrans Iris payout prepared in dry-run mode",
    );
    res.json({
      ok: true,
      dryRun: true,
      referenceNo,
      sandbox: !isMidtransProduction(),
      payload: payoutPayload,
    });
    return;
  }

  if (isMidtransProduction()) {
    res.status(403).json({
      error: "Payout Midtrans production dinonaktifkan untuk checklist Sandbox.",
    });
    return;
  }

  try {
    const result = await createIrisPayout(payoutPayload);
    req.log.info(
      { workerId: input.workerId, referenceNo, amount: input.amount },
      "Midtrans Iris payout submitted",
    );
    res.status(201).json({
      ok: true,
      dryRun: false,
      referenceNo,
      result,
    });
  } catch (error) {
    req.log.error(
      { err: error, workerId: input.workerId, referenceNo },
      "Midtrans Iris payout failed",
    );
    res.status(502).json({
      error: "Gagal mengirim payout ke Midtrans Iris.",
      detail: error instanceof Error ? error.message : "Unknown Iris error",
    });
  }
});

export default router;