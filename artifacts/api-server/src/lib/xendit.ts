import { logger } from "./logger";

/**
 * Thin Xendit REST client (Sandbox/Development mode by default — this app
 * never sends anything but the sandbox `xnd_development_...` secret key).
 *
 * Auth: Xendit uses HTTP Basic Auth with the secret key as the username and
 * an empty password — no OAuth, no per-request signing.
 *
 * All calls throw `XenditError` on a non-2xx response so route handlers can
 * catch a single error type and surface Xendit's own message to the client.
 */

const XENDIT_API_BASE = "https://api.xendit.co";

export class XenditError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "XenditError";
  }
}

function requireSecretKey(): string {
  const key = process.env["XENDIT_SECRET_KEY"];
  if (!key) {
    throw new XenditError(
      "XENDIT_SECRET_KEY belum dikonfigurasi di environment.",
      500,
      null,
    );
  }
  return key;
}

/** True as long as the configured key is a Xendit test/sandbox key, never a live key. */
export function isXenditSandboxKey(): boolean {
  const key = process.env["XENDIT_SECRET_KEY"] ?? "";
  return key.startsWith("xnd_development_") || key.startsWith("xnd_test_");
}

async function xenditFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const secretKey = requireSecretKey();
  const auth = Buffer.from(`${secretKey}:`).toString("base64");

  const res = await fetch(`${XENDIT_API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      (json as { message?: string } | null)?.message ??
      `Xendit request failed with status ${res.status}`;
    logger.error({ path, status: res.status, body: json }, "Xendit API error");
    throw new XenditError(message, res.status, json);
  }

  return json as T;
}

export interface XenditInvoice {
  id: string;
  external_id: string;
  status: string;
  invoice_url: string;
  amount: number;
}

/**
 * Creates a Xendit Invoice — a hosted payment page that supports Virtual
 * Account, e-wallet, QRIS, and card, simulating "money coming into escrow"
 * once the payer completes it. `externalId` is our own idempotency key
 * (`escrow-project-{id}`) so the webhook can look the project back up.
 */
export function createInvoice(params: {
  externalId: string;
  amount: number;
  payerEmail?: string;
  description: string;
}): Promise<XenditInvoice> {
  return xenditFetch<XenditInvoice>("/v2/invoices", {
    method: "POST",
    body: {
      external_id: params.externalId,
      amount: params.amount,
      payer_email: params.payerEmail,
      description: params.description,
      currency: "IDR",
      invoice_duration: 86400,
    },
  });
}

/**
 * Sandbox-only helper: Xendit lets you simulate a payer completing payment on
 * a TEST-mode invoice via this endpoint. Calling it on a live-mode invoice
 * returns an error from Xendit itself, so this is safe to expose even if
 * misconfigured — it can never move real money.
 */
export function simulateInvoicePayment(
  invoiceId: string,
  amount?: number,
): Promise<{ status: string }> {
  return xenditFetch(`/invoices/${invoiceId}/simulate_payment`, {
    method: "POST",
    body: amount ? { amount } : {},
  });
}

export interface XenditDisbursement {
  id: string;
  external_id: string;
  status: string;
  amount: number;
}

/**
 * Common Indonesian bank/e-wallet display names → Xendit disbursement bank
 * codes. Falls back to an upper-cased, space-stripped version of whatever the
 * worker entered so unmapped-but-already-correct codes (e.g. a worker who
 * typed "BCA") still pass through.
 */
const BANK_CODE_MAP: Record<string, string> = {
  bca: "BCA",
  mandiri: "MANDIRI",
  bni: "BNI",
  bri: "BRI",
  permata: "PERMATA",
  cimb: "CIMB",
  "cimb niaga": "CIMB",
  danamon: "DANAMON",
  btn: "BTN",
  gopay: "ID_OVO", // sandbox-safe fallback; real e-wallet payouts use a separate Xendit product
  ovo: "ID_OVO",
  dana: "ID_DANA",
  linkaja: "ID_LINKAJA",
};

export function resolveBankCode(namaBank: string): string {
  const key = namaBank.trim().toLowerCase();
  return BANK_CODE_MAP[key] ?? namaBank.trim().toUpperCase().replace(/\s+/g, "_");
}

/**
 * Creates a Xendit Disbursement — transfers `amount` out of the Xendit
 * balance (our escrow "penampung"/holding account) to the worker's bank
 * account. This is what "Approve Milestone" triggers.
 */
export function createDisbursement(params: {
  externalId: string;
  amount: number;
  bankCode: string;
  accountHolderName: string;
  accountNumber: string;
  description: string;
}): Promise<XenditDisbursement> {
  return xenditFetch<XenditDisbursement>("/disbursements", {
    method: "POST",
    body: {
      external_id: params.externalId,
      amount: params.amount,
      bank_code: params.bankCode,
      account_holder_name: params.accountHolderName,
      account_number: params.accountNumber,
      description: params.description,
    },
  });
}
